/**
 * FitLife AI Service
 * ===========================================
 * Unified AI service routing ALL 5 AI operations through
 * individual Supabase Edge Functions → Gemini API.
 *
 * Architecture:
 *   Frontend (supabase.functions.invoke) → Edge Function → Gemini 2.5 Flash
 *
 * Edge Functions (Deno, server-side):
 *   ai-coach         — AI fitness/nutrition chat
 *   ai-analyze-image — Food image analysis (Gemini Vision)
 *   ai-analyze-text  — Text-based meal analysis
 *   ai-recipe        — AI recipe generation from ingredients
 *   ai-nutrition     — Personalized nutrition plan generation
 *
 * Fallback:
 *   nutrition only → local BMR calculation (final safety net)
 *
 * SECURITY: No API keys in frontend — all AI calls go through
 * Supabase Edge Functions with GEMINI_API_KEY in Supabase Secrets.
 *
 * All AI calls go through the centralized AI Request Manager
 * to prevent 429 rate-limit errors via queue, throttle, dedup, cache, and retry.
 */
import { supabase, isConfigured } from './supabase.js';
import { ok, fail } from '../utils/response.js';
import { makeAIRequest, makeOneShotAIRequest, clearOneShotLock, clearAICache, makeDebouncedAIRequest } from './ai-request-manager.js';
import {
  MealSchema, NutritionPlanSchema, RecipeSchema,
  sanitizeMealPayload, sanitizeNutritionPayload, sanitizeRecipePayload,
  validate,
} from '../utils/schemas.js';
import { logger, logSupabaseError } from '../utils/logger.js';

const aiLog = logger.scoped('AI');

// ─── Edge Function Caller ──────────────────────────────────────────────────

/**
 * Invoke a Supabase Edge Function by name.
 * Uses supabase-js client which auto-attaches auth headers.
 * @param {string} fnName — Edge Function name (e.g. 'ai-coach')
 * @param {object} payload — JSON body to send
 * @returns {object} Parsed response data
 */
async function invokeEdgeFunction(fnName, payload) {
  console.log(`[AI] Invoking Edge Function: ${fnName}`);

  const { data, error } = await supabase.functions.invoke(fnName, {
    body: payload,
  });

  if (error) {
    // supabase-js wraps non-2xx responses in error.context
    aiLog.error(`Edge Function '${fnName}' error:`, error.message, {
      status: error.context?.status,
      hint: error.hint,
      details: error.details,
    });
    const status = error.context?.status || 500;
    const err = new Error(error.message || `Edge function ${fnName} failed`);
    err.status = status;

    // Try to extract structured error from the response body
    if (error.context?.body) {
      try {
        // error.context might have json() method or be a ReadableStream
        const bodyText = typeof error.context.body === 'string'
          ? error.context.body
          : await new Response(error.context.body).text().catch(() => '');
        if (bodyText) {
          const parsed = JSON.parse(bodyText);
          err.message = parsed.message || err.message;
          err.code = parsed.code;
        }
      } catch (_) { /* ignore parse errors */ }
    }
    throw err;
  }

  // data is the parsed JSON body from the Edge Function
  if (!data || !data.success) {
    throw new Error(data?.message || `AI service returned unexpected response`);
  }

  return data;
}

// ─── Input Sanitization & Validation ───────────────────────────────────────

function sanitizeStringList(value, maxItems) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map(i => String(i || '').trim().slice(0, 80)).filter(Boolean);
}

function validateNutritionInput(data) {
  const errors = [];
  if (!data || typeof data !== 'object') { errors.push('Invalid input'); return errors; }
  const { age, weight, height, goal, activity_level, meals_per_day } = data;
  if (age !== undefined && (typeof age !== 'number' || age < 10 || age > 120)) errors.push('Age must be 10-120');
  if (weight !== undefined && (typeof weight !== 'number' || weight < 20 || weight > 300)) errors.push('Weight must be 20-300 kg');
  if (height !== undefined && (typeof height !== 'number' || height < 80 || height > 250)) errors.push('Height must be 80-250 cm');
  const validGoals = ['build-muscle', 'lose-weight', 'improve-health', 'maintain'];
  if (goal && !validGoals.includes(goal)) errors.push('Invalid goal');
  const validActivity = ['sedentary', 'lightly-active', 'moderately-active', 'very-active'];
  if (activity_level && !validActivity.includes(activity_level)) errors.push('Invalid activity level');
  if (meals_per_day !== undefined && (typeof meals_per_day !== 'number' || meals_per_day < 1 || meals_per_day > 6)) errors.push('Meals must be 1-6');
  return errors;
}

export function sanitizeUserData(onboardingData) {
  return {
    age: onboardingData.age ? parseInt(onboardingData.age, 10) : null,
    weight: onboardingData.weight ? parseFloat(onboardingData.weight) : null,
    height: onboardingData.height ? parseFloat(onboardingData.height) : null,
    goal: onboardingData.goal || null,
    activity_level: onboardingData.activity_level || null,
    diet_type: onboardingData.dietStyle || onboardingData.diet_type || 'none',
    restrictions: sanitizeStringList(onboardingData.restrictions, 12),
    health_conditions: sanitizeStringList(onboardingData.conditions || onboardingData.health_conditions, 12),
    meals_per_day: onboardingData.meals_per_day ? parseInt(onboardingData.meals_per_day, 10) : 3,
    gender: onboardingData.gender || null,
  };
}

// ─── Local Fallback Calculations ───────────────────────────────────────────

function calculateBMR(weight, height, age, gender) {
  return gender === 'female'
    ? 447.593 + 9.247 * weight + 3.098 * height - 4.33 * age
    : 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age;
}

function getActivityMultiplier(level) {
  return { 'sedentary': 1.2, 'lightly-active': 1.375, 'moderately-active': 1.55, 'very-active': 1.725 }[level] || 1.2;
}

function getGoalAdjustment(goal) {
  return { 'build-muscle': 1.15, 'lose-weight': 0.80, 'improve-health': 1.05, 'maintain': 1.0 }[goal] || 1.0;
}

function calculateMacros(calories, goal) {
  const ratios = {
    'build-muscle': [0.30, 0.45, 0.25],
    'lose-weight': [0.35, 0.35, 0.30],
    'improve-health': [0.25, 0.50, 0.25],
    'maintain': [0.25, 0.45, 0.30],
  }[goal] || [0.25, 0.45, 0.30];
  return { protein: Math.round((calories * ratios[0]) / 4), carbs: Math.round((calories * ratios[1]) / 4), fat: Math.round((calories * ratios[2]) / 9) };
}

function generateFallbackPlan(input) {
  const bmr = calculateBMR(input.weight, input.height, input.age, input.gender);
  const tdee = bmr * getActivityMultiplier(input.activity_level);
  const targetCalories = Math.round(tdee * getGoalAdjustment(input.goal));
  const macros = calculateMacros(targetCalories, input.goal);
  const mealNames = ['Breakfast', 'Morning Snack', 'Lunch', 'Afternoon Snack', 'Dinner', 'Evening Snack'].slice(0, input.meals_per_day);
  const sampleFoods = {
    'Breakfast': ['Oatmeal with berries', 'Greek yogurt with honey', 'Egg white omelette'],
    'Morning Snack': ['Apple with almond butter', 'Protein shake', 'Mixed nuts'],
    'Lunch': ['Grilled chicken salad', 'Quinoa bowl', 'Turkey avocado wrap'],
    'Afternoon Snack': ['Greek yogurt', 'Rice cakes with avocado', 'Protein bar'],
    'Dinner': ['Salmon with vegetables', 'Lean beef stir-fry', 'Chicken with sweet potato'],
    'Evening Snack': ['Casein protein shake', 'Cottage cheese with berries', 'Hard-boiled eggs'],
  };
  return {
    calories: targetCalories, protein: macros.protein, carbs: macros.carbs, fat: macros.fat,
    meal_plan: mealNames.map(name => ({
      name, calories: Math.round(targetCalories / input.meals_per_day),
      protein: Math.round(macros.protein / input.meals_per_day),
      carbs: Math.round(macros.carbs / input.meals_per_day),
      fat: Math.round(macros.fat / input.meals_per_day),
      foods: sampleFoods[name] || ['Balanced meal'],
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API — 5 AI Systems
// ═══════════════════════════════════════════════════════════════════════════

// ── 1. AI Coach Chat ───────────────────────────────────────────────────────

/**
 * AI Coach chat. Routes through Supabase Edge Function 'ai-coach'.
 * @param {Array} contents - Gemini-format conversation history [{role, parts}]
 * @returns {string} AI response text
 */
export async function callAICoach(contents) {
  try {
    const result = await invokeEdgeFunction('ai-coach', { contents });
    return result.text || "I couldn't generate a response. Please try again.";
  } catch (err) {
    console.error('[AI Coach] Edge function error:', err.message, 'status:', err.status);
    throw err; // Let caller handle — no silent swallowing
  }
}

// ── 2. Meal Image Analysis ─────────────────────────────────────────────────

/**
 * Analyze food from an image (base64).
 * Routes through Supabase Edge Function 'ai-analyze-image'.
 */
export async function analyzeImageMeal(base64Image) {
  if (!base64Image) return fail('MISSING_DATA', 'No image provided');

  try {
    const result = await makeAIRequest(
      'food-image-analysis',
      base64Image.slice(0, 100),
      async () => {
        const edgeResult = await invokeEdgeFunction('ai-analyze-image', { image: base64Image });
        return edgeResult.data;
      },
      { cacheTTL: 5 * 60 * 1000, skipCache: true }
    );
    // Phase 1: sanitize + validate AI output (image analysis returns meal-like data)
    const sanitized = sanitizeMealPayload(result || {});
    const v = validate(MealSchema, sanitized);
    if (!v.success) {
      aiLog.warn('Image analysis output failed validation, returning sanitized fallback', { errors: v.errors });
      return ok('Image analysis complete (partial).', sanitized);
    }
    return ok('Image analysis complete.', { ...result, ...v.data });
  } catch (e) {
    aiLog.error('Image analysis failed:', e.message, 'status:', e.status);
    return fail('AI_ERROR', e.message || 'Image analysis failed. Please try again.');
  }
}

// ── 3. Meal Text Analysis ──────────────────────────────────────────────────

/**
 * Analyze food from a text description.
 * Routes through Supabase Edge Function 'ai-analyze-text'.
 */
export async function analyzeTextMeal(description) {
  if (!description || typeof description !== 'string' || description.trim().length < 3) {
    return fail('MISSING_DATA', 'Please describe your meal in more detail.');
  }

  try {
    const result = await makeAIRequest(
      'food-text-analysis',
      description.trim(),
      async () => {
        const edgeResult = await invokeEdgeFunction('ai-analyze-text', { description: description.trim() });
        return edgeResult.data;
      },
      { cacheTTL: 5 * 60 * 1000 }
    );
    const sanitized = sanitizeMealPayload(result || {});
    const v = validate(MealSchema, sanitized);
    if (!v.success) {
      aiLog.warn('Text analysis output failed validation, returning sanitized fallback', { errors: v.errors });
      return ok('Text analysis complete (partial).', sanitized);
    }
    return ok('Text analysis complete.', { ...result, ...v.data });
  } catch (e) {
    aiLog.error('Text analysis failed:', e.message, 'status:', e.status);
    return fail('AI_ERROR', e.message || 'Meal analysis failed. Please try again.');
  }
}

// ── 4. Recipe Generation ───────────────────────────────────────────────────

/**
 * Generate a recipe from ingredients using AI.
 * Routes through Supabase Edge Function 'ai-recipe'.
 */
export async function generateRecipeFromIngredients(ingredients, profile = {}) {
  if (!ingredients || ingredients.trim().length < 3) {
    return fail('MISSING_DATA', 'Please provide some ingredients.');
  }

  try {
    const result = await makeAIRequest(
      'recipe-generate',
      ingredients.trim(),
      async () => {
        const edgeResult = await invokeEdgeFunction('ai-recipe', {
          ingredients: ingredients.trim(),
          profile,
        });
        return edgeResult.data;
      },
      { cacheTTL: 10 * 60 * 1000 }
    );
    const sanitized = sanitizeRecipePayload(result || {});
    const v = validate(RecipeSchema, sanitized);
    if (!v.success) {
      aiLog.warn('Recipe output failed validation', { errors: v.errors });
      return ok('Recipe generated (sanitized).', sanitized);
    }
    return ok('Recipe generated.', v.data);
  } catch (e) {
    aiLog.error('Recipe generation failed:', e.message, 'status:', e.status);
    return fail('AI_ERROR', e.message || 'Recipe generation failed. Please try again.');
  }
}

// ── 5. Nutrition Plan Generation ───────────────────────────────────────────

/**
 * Generate a nutrition plan.
 * Edge Function primary → Local BMR fallback.
 */
export async function generateNutritionPlan(onboardingData) {
  const sanitized = sanitizeUserData(onboardingData);
  const errors = validateNutritionInput(sanitized);
  if (errors.length > 0) return fail('VALIDATION_ERROR', 'Invalid data: ' + errors.join(', '), { validationErrors: errors });
  if (!sanitized.age || !sanitized.weight || !sanitized.height || !sanitized.goal || !sanitized.activity_level)
    return fail('MISSING_DATA', 'Missing required fields: age, weight, height, goal, activity_level');

  try {
    const plan = await makeAIRequest(
      'nutrition-plan',
      sanitized,
      async () => {
        try {
          const edgeResult = await invokeEdgeFunction('ai-nutrition', { input: sanitized });
          return edgeResult.data;
        } catch (edgeErr) {
          console.warn('[AI] Nutrition edge function failed, using local fallback:', edgeErr.message);
          return generateFallbackPlan(sanitized);
        }
      },
      { cacheTTL: 30 * 60 * 1000 }
    );

    const cleanedPlan = sanitizeNutritionPayload(plan || {});
    const v = validate(NutritionPlanSchema, cleanedPlan);
    if (!v.success) {
      aiLog.warn('Nutrition plan output failed validation, falling back to local calc', { errors: v.errors });
      return ok('Nutrition plan generated (local fallback).', generateFallbackPlan(sanitized));
    }
    return ok('Nutrition plan generated.', v.data);
  } catch (e) {
    aiLog.error('Request manager failed, using emergency fallback:', e.message);
    const fallbackPlan = generateFallbackPlan(sanitized);
    return ok('Nutrition plan generated (local calculation).', fallbackPlan);
  }
}

/**
 * Generate a nutrition plan that runs ONCE per onboarding session.
 */
export async function generateOnboardingPlan(onboardingData) {
  const sanitized = sanitizeUserData(onboardingData);
  const errors = validateNutritionInput(sanitized);
  if (errors.length > 0) return fail('VALIDATION_ERROR', 'Invalid data: ' + errors.join(', '), { validationErrors: errors });
  if (!sanitized.age || !sanitized.weight || !sanitized.height || !sanitized.goal || !sanitized.activity_level)
    return fail('MISSING_DATA', 'Missing required fields: age, weight, height, goal, activity_level');

  try {
    const plan = await makeOneShotAIRequest(
      'onboarding-plan',
      async () => {
        try {
          const edgeResult = await invokeEdgeFunction('ai-nutrition', { input: sanitized });
          return edgeResult.data;
        } catch {
          return generateFallbackPlan(sanitized);
        }
      }
    );

    const cleanedPlan = sanitizeNutritionPayload(plan || {});
    const v = validate(NutritionPlanSchema, cleanedPlan);
    if (!v.success) {
      aiLog.warn('Onboarding plan validation failed, using local fallback', { errors: v.errors });
      return ok('Nutrition plan generated (local fallback).', generateFallbackPlan(sanitized));
    }
    return ok('Nutrition plan generated.', v.data);
  } catch (e) {
    aiLog.error('Onboarding plan generation failed:', e.message);
    const fallbackPlan = generateFallbackPlan(sanitized);
    return ok('Nutrition plan generated (local calculation).', fallbackPlan);
  }
}

/**
 * Clear the onboarding plan lock (for regeneration)
 */
export function resetOnboardingLock() {
  clearOneShotLock('onboarding-plan');
}

// ─── Profile Operations (no AI calls, just DB) ────────────────────────────

export async function saveNutritionProfile(nutritionData) {
  if (!isConfigured) return fail('SUPABASE_NOT_CONFIGURED', 'Supabase not available');
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return fail('NOT_AUTHENTICATED', 'Must be logged in', userErr);

  const payload = {
    user_id: user.id, age: nutritionData.age, weight: nutritionData.weight, height: nutritionData.height,
    goal: nutritionData.goal, activity_level: nutritionData.activity_level, diet_type: nutritionData.diet_type,
    restrictions: nutritionData.restrictions || [], health_conditions: nutritionData.health_conditions || [],
    meals_per_day: nutritionData.meals_per_day || 3,
    calories: parseInt(nutritionData.calories, 10) || null,
    protein: parseInt(nutritionData.protein, 10) || null,
    carbs: parseInt(nutritionData.carbs, 10) || null,
    fat: parseInt(nutritionData.fat, 10) || null,
    meal_plan: Array.isArray(nutritionData.meal_plan) ? nutritionData.meal_plan.slice(0, 6) : [],
    onboarding_completed: true,
  };

  const { data, error } = await supabase.from('user_profiles').upsert(payload, { onConflict: 'user_id' }).select().single();
  if (error) {
    logSupabaseError('AI', 'saveNutritionProfile.upsert', error, { payload });
    return fail('DATABASE_ERROR', 'Failed to save profile', error);
  }
  
  clearAICache();
  
  return ok('Profile saved.', data);
}

// In-memory profile cache
let profileCache = { data: null, timestamp: 0, userId: null };
const PROFILE_CACHE_TTL = 60000;

export async function getNutritionProfile() {
  if (!isConfigured) return fail('SUPABASE_NOT_CONFIGURED', 'Supabase not available');
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return fail('NOT_AUTHENTICATED', 'Must be logged in', userErr);

  const now = Date.now();
  if (profileCache.userId === user.id && profileCache.data && (now - profileCache.timestamp) < PROFILE_CACHE_TTL) {
    return profileCache.data;
  }

  const { data, error } = await supabase.from('user_profiles').select('*').eq('user_id', user.id).single();
  if (error) {
    if (error.code === 'PGRST116') {
      const result = ok('No profile found.', { profile: null });
      profileCache = { data: result, timestamp: now, userId: user.id };
      return result;
    }
    return fail('DATABASE_ERROR', 'Failed to fetch profile', error);
  }
  
  const result = ok('Profile fetched.', { profile: data });
  profileCache = { data: result, timestamp: now, userId: user.id };
  return result;
}

// Onboarding check cache
let onboardingCache = { result: null, timestamp: 0, userId: null };
const ONBOARDING_CACHE_TTL = 30000;

export async function checkOnboardingCompleted() {
  if (!isConfigured) return ok('Not completed.', { completed: false });
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return ok('Not completed.', { completed: false });
  
  const now = Date.now();
  if (onboardingCache.userId === user.id && onboardingCache.result && (now - onboardingCache.timestamp) < ONBOARDING_CACHE_TTL) {
    return onboardingCache.result;
  }

  const result = await getNutritionProfile();
  let onboardingResult;
  if (result.success && result.data.profile) {
    onboardingResult = ok('Status retrieved.', { completed: result.data.profile.onboarding_completed === true });
  } else {
    onboardingResult = ok('Not completed.', { completed: false });
  }
  
  onboardingCache = { result: onboardingResult, timestamp: now, userId: user.id };
  return onboardingResult;
}

export function invalidateProfileCache() {
  profileCache = { data: null, timestamp: 0, userId: null };
  onboardingCache = { result: null, timestamp: 0, userId: null };
}

// ─── Profile Update with Recalculation ─────────────────────────────────────

export async function updateProfileField(updates) {
  if (!isConfigured) return fail('SUPABASE_NOT_CONFIGURED', 'Supabase not available');
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return fail('NOT_AUTHENTICATED', 'Must be logged in', userErr);

  const currentRes = await getNutritionProfile();
  const current = currentRes.data?.profile || {};

  const merged = { ...current, ...updates };

  const needsRecalc = ['weight', 'height', 'age', 'goal', 'activity_level', 'gender'].some(
    k => updates[k] !== undefined && updates[k] !== current[k]
  );

  if (needsRecalc && merged.weight && merged.height && merged.age) {
    const bmr = calculateBMR(merged.weight, merged.height, merged.age, merged.gender);
    const tdee = bmr * getActivityMultiplier(merged.activity_level);
    const targetCalories = Math.round(tdee * getGoalAdjustment(merged.goal));
    const macros = calculateMacros(targetCalories, merged.goal);
    merged.calories = targetCalories;
    merged.protein = macros.protein;
    merged.carbs = macros.carbs;
    merged.fat = macros.fat;
  }

  const payload = {
    user_id: user.id,
    age: merged.age || null,
    weight: merged.weight || null,
    height: merged.height || null,
    goal: merged.goal || null,
    activity_level: merged.activity_level || null,
    diet_type: merged.diet_type || 'balanced',
    restrictions: merged.restrictions || [],
    health_conditions: merged.health_conditions || [],
    meals_per_day: merged.meals_per_day || 3,
    calories: merged.calories || null,
    protein: merged.protein || null,
    carbs: merged.carbs || null,
    fat: merged.fat || null,
    meal_plan: merged.meal_plan || [],
    onboarding_completed: merged.onboarding_completed ?? true,
    gender: merged.gender || null,
    avatar_url: merged.avatar_url || null,
    full_name: updates.full_name || merged.full_name || null,
  };

  const { data, error } = await supabase.from('user_profiles').upsert(payload, { onConflict: 'user_id' }).select().single();
  if (error) return fail('DATABASE_ERROR', 'Failed to update profile', error);

  clearAICache();
  invalidateProfileCache();

  return ok('Profile updated.', { profile: data, recalculated: needsRecalc });
}
