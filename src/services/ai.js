/**
 * FitLife AI Service
 * ===========================================
 * Unified AI service routing ALL 5 AI operations through the
 * Supabase Edge Function (fitlife-ai) with professional fallback.
 *
 * Architecture:
 *   Frontend → Supabase Edge Function (fitlife-ai) → Provider Router
 *   Primary:  Google Gemini (gemini-2.5-flash)
 *   Fallback: OpenRouter (deepseek for text, llama-vision for images)
 *
 * Fallback chain per operation:
 *   1. Edge Function (Gemini → OpenRouter internally)
 *   2. Vercel proxy (/api/ai-*) as secondary fallback
 *   3. Local BMR calculation (nutrition only, final safety net)
 *
 * SECURITY: No API keys in frontend — all AI calls go through
 * authenticated Edge Function or server-side Vercel proxies.
 *
 * All AI calls go through the centralized AI Request Manager
 * to prevent 429 rate-limit errors via queue, throttle, dedup, cache, and retry.
 */
import { supabase, isConfigured } from './supabase.js';
import { ok, fail } from '../utils/response.js';
import { makeAIRequest, makeOneShotAIRequest, clearOneShotLock, clearAICache, makeDebouncedAIRequest } from './ai-request-manager.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ─── Unified Edge Function Caller ──────────────────────────────────────────

/**
 * Call the unified multi-provider AI endpoint.
 * Routes through /api/ai-unified (Vercel) which handles Gemini → OpenRouter fallback.
 * Falls back to Supabase Edge Function if Vercel endpoint is unavailable.
 * @param {string} action - One of: coach, analyze-image, analyze-text, recipe, nutrition
 * @param {object} payload - Action-specific payload (merged with { action })
 * @returns {object} Parsed response data
 */
async function callUnifiedAI(action, payload) {
  // Primary: Vercel unified endpoint (Gemini → OpenRouter fallback built in)
  let res;
  try {
    res = await fetch('/api/ai-unified', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch (fetchErr) {
    // Network error on primary — try Supabase Edge Function
    console.warn('[AI] Unified endpoint unreachable, trying Edge Function:', fetchErr.message);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    res = await fetch(`${SUPABASE_URL}/functions/v1/fitlife-ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, ...payload }),
    });
  }

  if (!res.ok) {
    const err = new Error(`Edge function returned ${res.status}`);
    err.status = res.status;
    // Try to get error details from response
    try {
      const errBody = await res.json();
      err.message = errBody.message || err.message;
      err.code = errBody.code;
    } catch (_) { /* ignore parse errors */ }
    throw err;
  }

  const result = await res.json();
  if (!result.success) {
    throw new Error(result.message || 'AI service error');
  }

  return result;
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

// ─── Prompt Builder (for Vercel fallback) ──────────────────────────────────

function buildPrompt(input) {
  const diet = input.restrictions.length > 0 ? `Dietary restrictions: ${input.restrictions.join(', ')}.` : 'No dietary restrictions.';
  const health = input.health_conditions.length > 0 && !input.health_conditions.includes('none')
    ? `Health considerations: ${input.health_conditions.join(', ')}.` : 'No specific health conditions.';
  return `You are a professional nutritionist creating a personalized meal plan.

User Profile:
- Age: ${input.age}, Weight: ${input.weight}kg, Height: ${input.height}cm
- Goal: ${input.goal.replace('-', ' ')}, Activity: ${input.activity_level.replace(/-/g, ' ')}
- Diet: ${input.diet_type}, ${diet} ${health}
- Meals/day: ${input.meals_per_day}

Return ONLY a JSON object:
{"calories":number,"protein":number,"carbs":number,"fat":number,"meal_plan":[{"name":"string","calories":number,"protein":number,"carbs":number,"fat":number,"foods":["string"]}]}

Requirements: Mifflin-St Jeor + activity multiplier + goal adjustment. ${input.meals_per_day} meals. 2-4 foods per meal. ONLY JSON, no markdown.`;
}

// ─── Vercel Proxy Fallbacks ────────────────────────────────────────────────

async function callServerProxy(input) {
  const prompt = buildPrompt(input);
  const res = await fetch('/api/ai-nutrition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const err = new Error(`Server proxy returned ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const result = await res.json();
  if (!result.success) throw new Error(result.message || 'Proxy error');
  return result.data;
}

async function callVercelChat(contents) {
  const res = await fetch('/api/ai-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents }),
  });
  if (!res.ok) {
    const err = new Error(`Chat proxy returned ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Chat error');
  return data.text || "I couldn't generate a response.";
}

async function callVercelFoodAnalyze(payload) {
  const res = await fetch('/api/ai-food-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = new Error(`Food analyze proxy returned ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Analysis failed');
  return data.data;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API — 5 AI Systems
// ═══════════════════════════════════════════════════════════════════════════

// ── 1. AI Coach Chat ───────────────────────────────────────────────────────

/**
 * AI Coach chat. Routes through Edge Function (primary) → Vercel proxy (fallback).
 * @param {Array} contents - Gemini-format conversation history [{role, parts}]
 * @returns {string} AI response text
 */
export async function callAICoach(contents) {
  try {
    // Primary: Unified Edge Function
    const result = await callUnifiedAI('coach', { contents });
    return result.text || "I couldn't generate a response. Please try again.";
  } catch (edgeErr) {
    console.warn('[AI] Coach edge function failed, trying Vercel fallback:', edgeErr.message);
    // Secondary: Vercel proxy /api/ai-chat
    try {
      return await callVercelChat(contents);
    } catch (vercelErr) {
      console.warn('[AI] Coach Vercel fallback also failed:', vercelErr.message);
      throw vercelErr;
    }
  }
}

// ── 2. Meal Image Analysis ─────────────────────────────────────────────────

/**
 * Analyze food from an image (base64).
 * Primary: Edge Function (Gemini Vision → OpenRouter Vision)
 * Fallback: Vercel /api/ai-food-analyze
 */
export async function analyzeImageMeal(base64Image) {
  if (!base64Image) return fail('MISSING_DATA', 'No image provided');

  try {
    const result = await makeAIRequest(
      'food-image-analysis',
      base64Image.slice(0, 100), // Prefix for cache key
      async () => {
        // Primary: Edge Function
        try {
          const edgeResult = await callUnifiedAI('analyze-image', { image: base64Image });
          return edgeResult.data;
        } catch (edgeErr) {
          console.warn('[AI] Image analysis edge function failed, trying Vercel:', edgeErr.message);
          // Fallback: Vercel proxy
          return await callVercelFoodAnalyze({ image: base64Image, mode: 'image' });
        }
      },
      { cacheTTL: 5 * 60 * 1000, skipCache: true } // Don't cache images (each is unique)
    );
    return ok('Image analysis complete.', result);
  } catch (e) {
    console.error('[AI] Image analysis failed:', e.message);
    return fail('AI_ERROR', e.message?.includes('429') ? 'AI service busy. Try again shortly.' : 'Image analysis failed. Please try again.');
  }
}

// ── 3. Meal Text Analysis ──────────────────────────────────────────────────

/**
 * Analyze food from a text description.
 * Primary: Edge Function (Gemini → OpenRouter)
 * Fallback: Vercel /api/ai-food-analyze
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
        // Primary: Edge Function
        try {
          const edgeResult = await callUnifiedAI('analyze-text', { description: description.trim() });
          return edgeResult.data;
        } catch (edgeErr) {
          console.warn('[AI] Text analysis edge function failed, trying Vercel:', edgeErr.message);
          // Fallback: Vercel proxy
          return await callVercelFoodAnalyze({ description: description.trim(), mode: 'text' });
        }
      },
      { cacheTTL: 5 * 60 * 1000 } // 5 minute cache for same descriptions
    );
    return ok('Text analysis complete.', result);
  } catch (e) {
    console.error('[AI] Text analysis failed:', e.message);
    return fail('AI_ERROR', e.message?.includes('429') ? 'AI service busy. Try again shortly.' : 'Meal analysis failed. Please try again.');
  }
}

// ── 4. Recipe Generation ───────────────────────────────────────────────────

/**
 * Generate a recipe from ingredients using AI.
 * Primary: Edge Function (Gemini → OpenRouter)
 * Fallback: Vercel /api/ai-nutrition (custom prompt)
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
        // Primary: Edge Function
        try {
          const edgeResult = await callUnifiedAI('recipe', { 
            ingredients: ingredients.trim(), 
            profile 
          });
          return edgeResult.data;
        } catch (edgeErr) {
          console.warn('[AI] Recipe edge function failed, trying Vercel:', edgeErr.message);
          // Fallback: Vercel /api/ai-nutrition with recipe prompt
          const diet = profile.diet_type || 'balanced';
          const goal = profile.goal || 'improve-health';
          const restrictions = (profile.restrictions || []).join(', ') || 'none';
          
          const prompt = `You are a professional chef and nutritionist. Create a recipe using these ingredients: ${ingredients.trim()}.
User profile: Diet: ${diet}, Goal: ${goal}, Restrictions: ${restrictions}.

Return ONLY valid JSON:
{"name":"Recipe name","prepTime":"X min","cookTime":"X min","servings":number,"calories":number,"protein":number,"carbs":number,"fat":number,"ingredients":["amount ingredient"],"instructions":["step 1","step 2"],"tips":"Optional cooking tip"}

Keep it practical and healthy. ONLY JSON, no markdown.`;

          const res = await fetch('/api/ai-nutrition', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
          });
          if (!res.ok) throw new Error(`Server returned ${res.status}`);
          const data = await res.json();
          if (!data.success) throw new Error(data.message || 'Generation failed');
          return data.data;
        }
      },
      { cacheTTL: 10 * 60 * 1000 }
    );
    return ok('Recipe generated.', result);
  } catch (e) {
    console.error('[AI] Recipe generation failed:', e.message);
    return fail('AI_ERROR', 'Recipe generation failed. Please try again.');
  }
}

// ── 5. Nutrition Plan Generation ───────────────────────────────────────────

/**
 * Generate a nutrition plan.
 * Triple fallback: Edge Function → Vercel Proxy → Local BMR
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
        // Triple fallback: Edge Function → Server Proxy → Local BMR
        try {
          const edgeResult = await callUnifiedAI('nutrition', { input: sanitized });
          return edgeResult.data;
        } catch (edgeErr) {
          console.warn('[AI] Nutrition edge function failed, trying server proxy:', edgeErr.message);
          try {
            return await callServerProxy(sanitized);
          } catch (proxyErr) {
            console.warn('[AI] Server proxy failed, using local fallback:', proxyErr.message);
            return generateFallbackPlan(sanitized);
          }
        }
      },
      { cacheTTL: 30 * 60 * 1000 } // 30-minute cache
    );

    return ok('Nutrition plan generated.', plan);
  } catch (e) {
    console.error('[AI] Request manager failed, using emergency fallback:', e.message);
    const fallbackPlan = generateFallbackPlan(sanitized);
    return ok('Nutrition plan generated (local calculation).', fallbackPlan);
  }
}

/**
 * Generate a nutrition plan that runs ONCE per onboarding session.
 * Uses makeOneShotAIRequest to prevent duplicate AI calls.
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
          const edgeResult = await callUnifiedAI('nutrition', { input: sanitized });
          return edgeResult.data;
        } catch {
          try {
            return await callServerProxy(sanitized);
          } catch {
            return generateFallbackPlan(sanitized);
          }
        }
      }
    );

    return ok('Nutrition plan generated.', plan);
  } catch (e) {
    console.error('[AI] Onboarding plan generation failed:', e.message);
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
  if (error) return fail('DATABASE_ERROR', 'Failed to save profile', error);
  
  clearAICache();
  
  return ok('Profile saved.', data);
}

// In-memory profile cache to avoid repeated DB calls on each navigation
let profileCache = { data: null, timestamp: 0, userId: null };
const PROFILE_CACHE_TTL = 60000; // 1 minute

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

// Onboarding check cache (avoid repeated checks during navigation)
let onboardingCache = { result: null, timestamp: 0, userId: null };
const ONBOARDING_CACHE_TTL = 30000; // 30 seconds

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

/**
 * Invalidate all profile and onboarding caches (e.g. after saving profile)
 */
export function invalidateProfileCache() {
  profileCache = { data: null, timestamp: 0, userId: null };
  onboardingCache = { result: null, timestamp: 0, userId: null };
}

// ─── Profile Update with Recalculation ─────────────────────────────────────

/**
 * Update specific profile fields and recalculate nutrition targets if needed.
 */
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
