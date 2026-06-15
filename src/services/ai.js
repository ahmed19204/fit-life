/**
 * FitLife AI Service
 * -----------------------------------------------------------------------------
 * - All AI calls flow through Supabase Edge Functions
 * - All AI JSON is sanitized + validated before use
 * - FINAL nutrition calories/macros are deterministic via nutrition-engine.js
 * - Profile updates are split between `profiles` and `user_profiles`
 * - Rich Supabase diagnostics are logged for production debugging
 */
import { supabase, isConfigured } from './supabase.js';
import { ok, fail } from '../utils/response.js';
import { makeAIRequest, makeOneShotAIRequest, clearOneShotLock, clearAICache } from './ai-request-manager.js';
import {
  MealSchema,
  NutritionPlanSchema,
  RecipeSchema,
  sanitizeMealPayload,
  sanitizeNutritionPayload,
  sanitizeRecipePayload,
  validate,
} from '../utils/schemas.js';
import { logger, logSupabaseError } from '../utils/logger.js';
import {
  buildNutritionPlan,
  calculateMacroTargets,
  sanitizeMetricProfileInput,
  validateNutritionInputs,
} from '../utils/nutrition-engine.js';

const aiLog = logger.scoped('AI');
const PROFILE_CACHE_TTL = 60_000;
const ONBOARDING_CACHE_TTL = 30_000;
const PROFILE_RETRY_DELAY_MS = 600;
const PROFILE_UPDATE_RETRIES = 1;

let profileCache = { data: null, timestamp: 0, userId: null };
let onboardingCache = { result: null, timestamp: 0, userId: null };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeStringList(value, maxItems = 12) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[;,]/)
      : [];

  return list
    .map((item) => String(item || '').trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, maxItems);
}

function sanitizeText(value, max = 120) {
  const clean = String(value || '').trim();
  return clean ? clean.slice(0, max) : null;
}

function sanitizeNullableNumber(value, { min = null, max = null, integer = false } = {}) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = integer ? Math.round(parsed) : Number(parsed.toFixed(1));
  if (min !== null && normalized < min) return null;
  if (max !== null && normalized > max) return null;
  return normalized;
}

function sanitizeDietType(value) {
  const clean = String(value || 'balanced').trim().toLowerCase().replace(/[\s_]+/g, '-');
  return clean || 'balanced';
}

function sanitizeProfileUpdateInput(updates = {}, current = {}) {
  const merged = { ...current, ...updates };

  const sanitized = {
    full_name: sanitizeText(updates.full_name ?? current.full_name, 60),
    avatar_url: sanitizeText(updates.avatar_url ?? current.avatar_url, 500),
    age: sanitizeNullableNumber(merged.age, { min: 10, max: 120, integer: true }),
    weight: sanitizeNullableNumber(merged.weight, { min: 20, max: 300 }),
    height: sanitizeNullableNumber(merged.height, { min: 80, max: 250 }),
    gender: sanitizeText(merged.gender, 20)?.toLowerCase() || null,
    goal: sanitizeText(merged.goal, 40)?.toLowerCase() || null,
    activity_level: sanitizeText(merged.activity_level, 40)?.toLowerCase() || null,
    diet_type: sanitizeDietType(
      merged.diet_type
      || merged.dietary_preferences
      || merged.dietary_preference
      || merged.dietPreference
      || merged.dietStyle
      || 'balanced'
    ),
    restrictions: sanitizeStringList(merged.restrictions, 12),
    health_conditions: sanitizeStringList(merged.health_conditions || merged.conditions, 12),
    meals_per_day: sanitizeNullableNumber(merged.meals_per_day, { min: 2, max: 6, integer: true }) || 3,
    onboarding_completed: merged.onboarding_completed ?? current.onboarding_completed ?? true,
  };

  return sanitized;
}

function hasEnoughDataForNutrition(profile = {}) {
  return Boolean(profile.age && profile.weight && profile.height && profile.goal && profile.activity_level);
}

function normalizeDeterministicNutrition(profile = {}, aiMealPlan = []) {
  if (!hasEnoughDataForNutrition(profile)) {
    return {
      calories: profile.calories ?? null,
      protein: profile.protein ?? null,
      carbs: profile.carbs ?? null,
      fat: profile.fat ?? null,
      meal_plan: Array.isArray(profile.meal_plan) ? profile.meal_plan : [],
      bmr: null,
      tdee: null,
      meta: null,
    };
  }

  const engineInput = sanitizeMetricProfileInput(profile);
  const aiMeals = Array.isArray(aiMealPlan) && aiMealPlan.length > 0
    ? aiMealPlan
    : Array.isArray(profile.meal_plan)
      ? profile.meal_plan
      : [];

  const plan = buildNutritionPlan(engineInput, aiMeals);
  return plan;
}

async function withProfileRetry(operationName, run, retries = PROFILE_UPDATE_RETRIES) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = await run(attempt);
    if (!result?.error) return result;

    lastError = result.error;
    logSupabaseError('AI', `${operationName}.attempt_${attempt + 1}`, result.error);

    if (attempt < retries) {
      await sleep(PROFILE_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  return { data: null, error: lastError };
}

async function invokeEdgeFunction(fnName, payload) {
  aiLog.debug(`Invoking edge function ${fnName}`);

  const { data, error } = await supabase.functions.invoke(fnName, { body: payload });

  if (error) {
    aiLog.error(`Edge Function '${fnName}' error`, {
      message: error.message,
      status: error.context?.status,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    const status = error.context?.status || 500;
    const err = new Error(error.message || `Edge function ${fnName} failed`);
    err.status = status;
    err.code = error.code;

    if (error.context?.body) {
      try {
        const bodyText = typeof error.context.body === 'string'
          ? error.context.body
          : await new Response(error.context.body).text().catch(() => '');
        if (bodyText) {
          const parsed = JSON.parse(bodyText);
          err.message = parsed.message || err.message;
          err.code = parsed.code || err.code;
        }
      } catch {
        // ignore body parse issues
      }
    }
    throw err;
  }

  if (!data || !data.success) {
    throw new Error(data?.message || 'AI service returned unexpected response');
  }

  return data;
}

function validateNutritionInput(data) {
  const validation = validateNutritionInputs(data);
  return validation.errors;
}

export function sanitizeUserData(onboardingData = {}) {
  return sanitizeMetricProfileInput({
    ...onboardingData,
    restrictions: sanitizeStringList(onboardingData.restrictions, 12),
    health_conditions: sanitizeStringList(onboardingData.conditions || onboardingData.health_conditions, 12),
    diet_type: onboardingData.dietStyle || onboardingData.diet_type || 'balanced',
  });
}

function buildDeterministicNutritionResult(input, aiPlan = null) {
  const sanitizedAI = sanitizeNutritionPayload(aiPlan || {});
  const aiMeals = Array.isArray(sanitizedAI.meal_plan) ? sanitizedAI.meal_plan : [];
  const deterministicPlan = buildNutritionPlan(input, aiMeals);
  const validated = validate(NutritionPlanSchema, deterministicPlan);

  if (!validated.success) {
    aiLog.warn('Deterministic nutrition plan failed schema validation; using engine output as-is', validated.errors);
    return deterministicPlan;
  }

  return validated.data;
}

function buildNutritionTargetsPayload(input) {
  try {
    const targets = calculateMacroTargets(input);
    return {
      target_calories: targets.calories,
      target_protein: targets.protein,
      target_carbs: targets.carbs,
      target_fat: targets.fat,
    };
  } catch {
    return {};
  }
}

export async function callAICoach(contents) {
  try {
    const result = await invokeEdgeFunction('ai-coach', { contents });
    return result.text || "I couldn't generate a response. Please try again.";
  } catch (err) {
    console.error('[AI Coach] Edge function error:', err.message, 'status:', err.status);
    throw err;
  }
}

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
      { cacheTTL: 5 * 60 * 1000, skipCache: true },
    );

    const sanitized = sanitizeMealPayload(result || {});
    const validated = validate(MealSchema, sanitized);
    if (!validated.success) {
      aiLog.warn('Image analysis output failed validation, returning sanitized fallback', { errors: validated.errors });
      return ok('Image analysis complete (partial).', sanitized);
    }
    return ok('Image analysis complete.', { ...result, ...validated.data });
  } catch (e) {
    aiLog.error('Image analysis failed', e.message, e.status);
    return fail('AI_ERROR', e.message || 'Image analysis failed. Please try again.');
  }
}

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
      { cacheTTL: 5 * 60 * 1000 },
    );

    const sanitized = sanitizeMealPayload(result || {});
    const validated = validate(MealSchema, sanitized);
    if (!validated.success) {
      aiLog.warn('Text analysis output failed validation, returning sanitized fallback', { errors: validated.errors });
      return ok('Text analysis complete (partial).', sanitized);
    }
    return ok('Text analysis complete.', { ...result, ...validated.data });
  } catch (e) {
    aiLog.error('Text analysis failed', e.message, e.status);
    return fail('AI_ERROR', e.message || 'Meal analysis failed. Please try again.');
  }
}

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
      { cacheTTL: 10 * 60 * 1000 },
    );

    const sanitized = sanitizeRecipePayload(result || {});
    const validated = validate(RecipeSchema, sanitized);
    if (!validated.success) {
      aiLog.warn('Recipe output failed validation', { errors: validated.errors });
      return ok('Recipe generated (sanitized).', sanitized);
    }
    return ok('Recipe generated.', validated.data);
  } catch (e) {
    aiLog.error('Recipe generation failed', e.message, e.status);
    return fail('AI_ERROR', e.message || 'Recipe generation failed. Please try again.');
  }
}

export async function generateNutritionPlan(onboardingData) {
  const sanitized = sanitizeUserData(onboardingData);
  const errors = validateNutritionInput(sanitized);
  if (errors.length > 0) {
    return fail('VALIDATION_ERROR', `Invalid data: ${errors.join(', ')}`, { validationErrors: errors });
  }

  try {
    const plan = await makeAIRequest(
      'nutrition-plan',
      sanitized,
      async () => {
        try {
          const edgeResult = await invokeEdgeFunction('ai-nutrition', {
            input: sanitized,
            targets: buildNutritionTargetsPayload(sanitized),
          });
          return edgeResult.data;
        } catch (edgeErr) {
          aiLog.warn('Nutrition edge function failed, using deterministic engine only', edgeErr.message);
          return null;
        }
      },
      { cacheTTL: 30 * 60 * 1000 },
    );

    const deterministicPlan = buildDeterministicNutritionResult(sanitized, plan);
    return ok('Nutrition plan generated.', deterministicPlan);
  } catch (e) {
    aiLog.error('Nutrition plan request manager failed, using deterministic engine only', e.message);
    return ok('Nutrition plan generated.', buildDeterministicNutritionResult(sanitized, null));
  }
}

export async function generateOnboardingPlan(onboardingData) {
  const sanitized = sanitizeUserData(onboardingData);
  const errors = validateNutritionInput(sanitized);
  if (errors.length > 0) {
    return fail('VALIDATION_ERROR', `Invalid data: ${errors.join(', ')}`, { validationErrors: errors });
  }

  try {
    const plan = await makeOneShotAIRequest('onboarding-plan', async () => {
      try {
        const edgeResult = await invokeEdgeFunction('ai-nutrition', {
          input: sanitized,
          targets: buildNutritionTargetsPayload(sanitized),
        });
        return edgeResult.data;
      } catch (edgeErr) {
        aiLog.warn('Onboarding nutrition edge failed, using deterministic engine only', edgeErr.message);
        return null;
      }
    });

    return ok('Nutrition plan generated.', buildDeterministicNutritionResult(sanitized, plan));
  } catch (e) {
    aiLog.error('Onboarding plan generation failed, using deterministic engine only', e.message);
    return ok('Nutrition plan generated.', buildDeterministicNutritionResult(sanitized, null));
  }
}

export function resetOnboardingLock() {
  clearOneShotLock('onboarding-plan');
}

async function getAuthenticatedUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
}

async function upsertBasicProfile(user, payload) {
  if (!payload.full_name && !payload.avatar_url && !user?.email) {
    return { data: null, error: null };
  }

  const basicPayload = {
    id: user.id,
    email: user.email || null,
    full_name: payload.full_name || null,
    avatar_url: payload.avatar_url || null,
  };

  return withProfileRetry('profiles.upsert', async () => {
    const result = await supabase
      .from('profiles')
      .upsert(basicPayload, { onConflict: 'id' })
      .select('*')
      .single();

    if (result.error) {
      console.error('[FitLife:AI] profiles upsert failed', {
        message: result.error.message,
        details: result.error.details,
        hint: result.error.hint,
        code: result.error.code,
      });
    }
    return result;
  });
}

function buildUserProfilePayload(userId, source = {}, current = {}) {
  const sanitized = sanitizeProfileUpdateInput(source, current);
  const basePayload = {
    user_id: userId,
    age: sanitized.age,
    weight: sanitized.weight,
    height: sanitized.height,
    goal: sanitized.goal,
    activity_level: sanitized.activity_level,
    diet_type: sanitized.diet_type,
    restrictions: sanitized.restrictions,
    health_conditions: sanitized.health_conditions,
    meals_per_day: sanitized.meals_per_day,
    onboarding_completed: sanitized.onboarding_completed,
    gender: sanitized.gender,
  };

  if (hasEnoughDataForNutrition(basePayload)) {
    const deterministicPlan = buildNutritionPlan(basePayload, Array.isArray(source.meal_plan) ? source.meal_plan : current.meal_plan || []);
    return {
      ...basePayload,
      calories: deterministicPlan.calories,
      protein: deterministicPlan.protein,
      carbs: deterministicPlan.carbs,
      fat: deterministicPlan.fat,
      meal_plan: deterministicPlan.meal_plan,
    };
  }

  return {
    ...basePayload,
    calories: sanitizeNullableNumber(source.calories ?? current.calories, { min: 0, max: 8000, integer: true }),
    protein: sanitizeNullableNumber(source.protein ?? current.protein, { min: 0, max: 500, integer: true }),
    carbs: sanitizeNullableNumber(source.carbs ?? current.carbs, { min: 0, max: 800, integer: true }),
    fat: sanitizeNullableNumber(source.fat ?? current.fat, { min: 0, max: 300, integer: true }),
    meal_plan: Array.isArray(source.meal_plan) ? source.meal_plan.slice(0, 6) : Array.isArray(current.meal_plan) ? current.meal_plan.slice(0, 6) : [],
  };
}

async function upsertUserProfile(payload) {
  return withProfileRetry('user_profiles.upsert', async () => {
    const result = await supabase
      .from('user_profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select('*')
      .single();

    if (result.error) {
      console.error('[FitLife:AI] user_profiles upsert failed', {
        message: result.error.message,
        details: result.error.details,
        hint: result.error.hint,
        code: result.error.code,
      });
    }
    return result;
  });
}

export async function saveNutritionProfile(nutritionData) {
  if (!isConfigured) return fail('SUPABASE_NOT_CONFIGURED', 'Supabase not available');

  const { user, error: userErr } = await getAuthenticatedUser();
  if (userErr || !user) return fail('NOT_AUTHENTICATED', 'Must be logged in', userErr);

  const payload = buildUserProfilePayload(user.id, { ...nutritionData, onboarding_completed: true });
  const basicRes = await upsertBasicProfile(user, {
    full_name: nutritionData.full_name || null,
    avatar_url: nutritionData.avatar_url || null,
  });
  if (basicRes.error) {
    logSupabaseError('AI', 'saveNutritionProfile.basicProfile', basicRes.error, { userId: user.id });
  }

  const { data, error } = await upsertUserProfile(payload);
  if (error) {
    logSupabaseError('AI', 'saveNutritionProfile.userProfile', error, { payload });
    return fail('DATABASE_ERROR', 'Failed to save profile', error);
  }

  clearAICache();
  invalidateProfileCache();

  const merged = {
    ...data,
    full_name: basicRes.data?.full_name || nutritionData.full_name || null,
    avatar_url: basicRes.data?.avatar_url || nutritionData.avatar_url || null,
  };

  return ok('Profile saved.', merged);
}

export async function getNutritionProfile() {
  if (!isConfigured) return fail('SUPABASE_NOT_CONFIGURED', 'Supabase not available');

  const { user, error: userErr } = await getAuthenticatedUser();
  if (userErr || !user) return fail('NOT_AUTHENTICATED', 'Must be logged in', userErr);

  const now = Date.now();
  if (profileCache.userId === user.id && profileCache.data && (now - profileCache.timestamp) < PROFILE_CACHE_TTL) {
    return profileCache.data;
  }

  const [userProfileRes, basicProfileRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
  ]);

  if (userProfileRes.error && userProfileRes.error.code !== 'PGRST116') {
    logSupabaseError('AI', 'getNutritionProfile.user_profiles', userProfileRes.error, { userId: user.id });
    return fail('DATABASE_ERROR', 'Failed to fetch profile', userProfileRes.error);
  }

  if (basicProfileRes.error && basicProfileRes.error.code !== 'PGRST116') {
    logSupabaseError('AI', 'getNutritionProfile.profiles', basicProfileRes.error, { userId: user.id });
  }

  const nutritionProfile = userProfileRes.data || null;
  const basicProfile = basicProfileRes.data || null;

  if (!nutritionProfile && !basicProfile) {
    const result = ok('No profile found.', { profile: null });
    profileCache = { data: result, timestamp: now, userId: user.id };
    return result;
  }

  const merged = {
    ...(nutritionProfile || {}),
    full_name: basicProfile?.full_name || nutritionProfile?.full_name || null,
    avatar_url: basicProfile?.avatar_url || nutritionProfile?.avatar_url || null,
    email: basicProfile?.email || user.email || null,
  };

  const deterministic = normalizeDeterministicNutrition(merged, merged.meal_plan);
  const mergedProfile = {
    ...merged,
    calories: deterministic.calories ?? merged.calories ?? null,
    protein: deterministic.protein ?? merged.protein ?? null,
    carbs: deterministic.carbs ?? merged.carbs ?? null,
    fat: deterministic.fat ?? merged.fat ?? null,
    meal_plan: deterministic.meal_plan ?? merged.meal_plan ?? [],
    bmr: deterministic.bmr,
    tdee: deterministic.tdee,
    nutrition_source: deterministic.meta ? 'deterministic-engine' : 'stored',
  };

  const result = ok('Profile fetched.', { profile: mergedProfile });
  profileCache = { data: result, timestamp: now, userId: user.id };
  return result;
}

export async function checkOnboardingCompleted() {
  if (!isConfigured) return ok('Not completed.', { completed: false });

  const { user } = await getAuthenticatedUser();
  if (!user) return ok('Not completed.', { completed: false });

  const now = Date.now();
  if (onboardingCache.userId === user.id && onboardingCache.result && (now - onboardingCache.timestamp) < ONBOARDING_CACHE_TTL) {
    return onboardingCache.result;
  }

  const result = await getNutritionProfile();
  const onboardingResult = result.success && result.data.profile
    ? ok('Status retrieved.', { completed: result.data.profile.onboarding_completed === true })
    : ok('Not completed.', { completed: false });

  onboardingCache = { result: onboardingResult, timestamp: now, userId: user.id };
  return onboardingResult;
}

export function invalidateProfileCache() {
  profileCache = { data: null, timestamp: 0, userId: null };
  onboardingCache = { result: null, timestamp: 0, userId: null };
}

export async function updateProfileField(updates = {}) {
  if (!isConfigured) return fail('SUPABASE_NOT_CONFIGURED', 'Supabase not available');

  const { user, error: userErr } = await getAuthenticatedUser();
  if (userErr || !user) return fail('NOT_AUTHENTICATED', 'Must be logged in', userErr);

  const currentRes = await getNutritionProfile();
  const current = currentRes.data?.profile || {};
  const sanitized = sanitizeProfileUpdateInput(updates, current);

  const basicProfileChanged = ['full_name', 'avatar_url'].some((key) => updates[key] !== undefined && sanitized[key] !== current[key]);
  const nutritionRelatedKeys = ['weight', 'height', 'age', 'goal', 'activity_level', 'gender', 'diet_type', 'restrictions', 'health_conditions', 'meals_per_day'];
  const nutritionChanged = nutritionRelatedKeys.some((key) => updates[key] !== undefined);

  const needsRecalc = ['weight', 'height', 'age', 'goal', 'activity_level', 'gender'].some((key) => updates[key] !== undefined);

  let basicProfileData = null;
  if (basicProfileChanged) {
    const basicRes = await upsertBasicProfile(user, sanitized);
    if (basicRes.error) {
      logSupabaseError('AI', 'updateProfileField.basicProfile', basicRes.error, { userId: user.id, updates: sanitized });
      return fail('DATABASE_ERROR', 'Failed to update profile name', basicRes.error);
    }
    basicProfileData = basicRes.data;
  }

  let nutritionProfileData = current;
  if (nutritionChanged || needsRecalc || !current?.user_id) {
    const payload = buildUserProfilePayload(user.id, { ...current, ...updates, ...sanitized }, current);
    const profileRes = await upsertUserProfile(payload);
    if (profileRes.error) {
      logSupabaseError('AI', 'updateProfileField.userProfile', profileRes.error, { userId: user.id, payload });
      return fail('DATABASE_ERROR', 'Failed to update profile', profileRes.error);
    }
    nutritionProfileData = profileRes.data;
  }

  clearAICache();
  invalidateProfileCache();

  const mergedProfile = {
    ...nutritionProfileData,
    full_name: basicProfileData?.full_name || sanitized.full_name || current.full_name || null,
    avatar_url: basicProfileData?.avatar_url || sanitized.avatar_url || current.avatar_url || null,
    email: user.email || current.email || null,
  };

  const deterministic = normalizeDeterministicNutrition(mergedProfile, mergedProfile.meal_plan);
  const finalProfile = {
    ...mergedProfile,
    calories: deterministic.calories ?? mergedProfile.calories,
    protein: deterministic.protein ?? mergedProfile.protein,
    carbs: deterministic.carbs ?? mergedProfile.carbs,
    fat: deterministic.fat ?? mergedProfile.fat,
    meal_plan: deterministic.meal_plan ?? mergedProfile.meal_plan,
    bmr: deterministic.bmr,
    tdee: deterministic.tdee,
    nutrition_source: deterministic.meta ? 'deterministic-engine' : 'stored',
  };

  return ok('Profile updated.', { profile: finalProfile, recalculated: needsRecalc });
}
