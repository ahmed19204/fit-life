/**
 * FitLife — Bulletproof Validation Schemas (Phase 1)
 * ----------------------------------------------------------------------------
 * Uses Zod when available. Includes a tiny fallback validator so the app
 * still works if `zod` is not yet installed (graceful degradation).
 *
 * USAGE
 *   import { MealSchema, validate, sanitizeMealPayload } from '../utils/schemas.js';
 *   const safe = validate(MealSchema, rawAIData);
 *
 * EXPORTS
 *   z                    — Zod (or fallback proxy with same chainable API)
 *   MealSchema           — strict meal payload
 *   AnalysisHistorySchema
 *   NutritionPlanSchema
 *   RecipeSchema
 *   validate(schema, value)            — returns { success, data, errors }
 *   sanitizeMealPayload(raw)           — clean & coerce AI meal output
 *   sanitizeNutritionPayload(raw)
 *   sanitizeRecipePayload(raw)
 *   sanitizeAnalysisPayload(raw)
 * ----------------------------------------------------------------------------
 */

// ─── Zod loader ─────────────────────────────────────────────────────────────
// `zod` is a hard dependency (see package.json); imported synchronously to
// keep the bundle target compatible with es2020 (no top-level await needed).
import { z as _z } from 'zod';
export const z = _z;

// ─── Coercion helpers (used by sanitize* below) ────────────────────────────
const toFiniteNumber = (v, fb = 0) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : fb;
};
const toRoundedNumber = (v, fb = 0) => Math.max(0, Math.round(toFiniteNumber(v, fb)));
const toCleanString = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const toStringArray = (v, maxItems = 12, maxLen = 80) => {
  const arr = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(/[,;]/) : []);
  return arr.slice(0, maxItems).map((i) => toCleanString(i, maxLen)).filter(Boolean);
};

export const sanitizeNumber = toFiniteNumber;
export const sanitizeText = toCleanString;
export const sanitizeStringArray = toStringArray;

// ─── Strict Schemas ────────────────────────────────────────────────────────

// Meals row that we insert into the meals table.
export const MealSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.string().max(40).default('Meal'),
  time: z.string().max(30).default(() => {
    try { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
  }),
  calories: z.number().min(0).max(20000).default(0),
  protein: z.number().min(0).max(2000).default(0),
  carbs: z.number().min(0).max(2000).default(0),
  fat: z.number().min(0).max(2000).default(0),
  image: z.string().max(500).optional().nullable(),
  ai_suggested: z.boolean().default(false),
  food_emoji: z.string().max(10).optional().nullable(),
});

export const AnalysisHistorySchema = z.object({
  input_type: z.enum(['image', 'description', 'manual']).default('manual'),
  prompt: z.string().max(2000).optional().nullable(),
  meal_id: z.any().optional().nullable(),
  result: z.any().default({}),
});

// Sub-meal item inside a nutrition plan
export const MealItemSchema = z.object({
  name: z.string().min(1).max(120),
  calories: z.number().min(0).max(10000).default(0),
  protein: z.number().min(0).max(1000).default(0),
  carbs: z.number().min(0).max(1000).default(0),
  fat: z.number().min(0).max(1000).default(0),
  foods: z.array(z.string().max(120)).default([]),
});

export const NutritionPlanSchema = z.object({
  calories: z.number().min(800).max(8000),
  protein: z.number().min(20).max(500),
  carbs: z.number().min(20).max(800),
  fat: z.number().min(10).max(300),
  meal_plan: z.array(MealItemSchema).default([]),
});

export const RecipeSchema = z.object({
  name: z.string().min(1).max(160),
  prepTime: z.string().max(40).default('—'),
  cookTime: z.string().max(40).default('—'),
  servings: z.number().min(1).max(50).default(2),
  calories: z.number().min(0).max(20000).default(0),
  protein: z.number().min(0).max(1000).default(0),
  carbs: z.number().min(0).max(1000).default(0),
  fat: z.number().min(0).max(1000).default(0),
  ingredients: z.array(z.string().max(200)).default([]),
  instructions: z.array(z.string().max(800)).default([]),
  tips: z.string().max(800).optional().nullable(),
});

// ─── Validation Wrapper ────────────────────────────────────────────────────
/**
 * @returns {{ success: boolean, data?: any, errors?: string[] }}
 */
export function validate(schema, value) {
  try {
    const r = schema.safeParse(value);
    if (r.success) return { success: true, data: r.data };
    const errors = (r.error?.issues || r.error?.errors || []).map((e) => `${(e.path || []).join('.')}: ${e.message}`);
    return { success: false, errors };
  } catch (e) {
    return { success: false, errors: [e?.message || 'Validation failed'] };
  }
}

// ─── Sanitizers (used BEFORE validation to auto-fix AI hallucinations) ────
/**
 * Coerce/normalize an AI meal payload so it satisfies MealSchema as often as
 * possible. Strings → numbers, hallucinated fields removed, arrays normalized.
 */
export function sanitizeMealPayload(raw = {}) {
  return {
    name: toCleanString(raw.name || raw.mealName || raw.title, 120),
    type: toCleanString(raw.type || raw.mealType || raw.category || 'Meal', 40),
    time: toCleanString(raw.time || raw.servedAt || '', 30),
    calories: toRoundedNumber(raw.calories ?? raw.kcal ?? raw.energy, 0),
    protein: toRoundedNumber(raw.protein ?? raw.proteins, 0),
    carbs: toRoundedNumber(raw.carbs ?? raw.carb ?? raw.carbohydrates, 0),
    fat: toRoundedNumber(raw.fat ?? raw.fats, 0),
    image: raw.image || raw.image_url || raw.imageUrl ? toCleanString(raw.image || raw.image_url || raw.imageUrl, 500) : null,
    ai_suggested: raw.aiSuggested === true || raw.ai_suggested === true,
    food_emoji: raw.food_emoji || raw.emoji ? toCleanString(raw.food_emoji || raw.emoji, 10) : null,
  };
}

export function sanitizeNutritionPayload(raw = {}) {
  const planRaw = Array.isArray(raw.meal_plan) ? raw.meal_plan : (Array.isArray(raw.meals) ? raw.meals : []);
  return {
    calories: toRoundedNumber(raw.calories ?? raw.dailyCalories ?? raw.kcal),
    protein: toRoundedNumber(raw.protein ?? raw.proteins),
    carbs: toRoundedNumber(raw.carbs ?? raw.carbohydrates),
    fat: toRoundedNumber(raw.fat ?? raw.fats),
    meal_plan: planRaw.slice(0, 6).map((m) => ({
      name: toCleanString(m?.name || m?.mealName || 'Meal', 120),
      calories: toRoundedNumber(m?.calories ?? m?.kcal),
      protein: toRoundedNumber(m?.protein),
      carbs: toRoundedNumber(m?.carbs ?? m?.carbohydrates),
      fat: toRoundedNumber(m?.fat ?? m?.fats),
      foods: toStringArray(m?.foods || m?.items || m?.ingredients, 8, 120),
    })),
  };
}

export function sanitizeRecipePayload(raw = {}) {
  return {
    name: toCleanString(raw.name || raw.title || 'Recipe', 160),
    prepTime: toCleanString(raw.prepTime || raw.prep_time || '—', 40),
    cookTime: toCleanString(raw.cookTime || raw.cook_time || '—', 40),
    servings: toRoundedNumber(raw.servings ?? 2, 2) || 2,
    calories: toRoundedNumber(raw.calories ?? raw.kcal),
    protein: toRoundedNumber(raw.protein),
    carbs: toRoundedNumber(raw.carbs ?? raw.carbohydrates),
    fat: toRoundedNumber(raw.fat ?? raw.fats),
    ingredients: toStringArray(raw.ingredients, 30, 200),
    instructions: toStringArray(raw.instructions || raw.steps, 30, 800),
    tips: raw.tips ? toCleanString(raw.tips, 800) : null,
  };
}

export function sanitizeAnalysisPayload(raw = {}) {
  const result = raw.result && typeof raw.result === 'object' ? raw.result : {};
  return {
    input_type: ['image', 'description', 'manual'].includes(raw.input_type) ? raw.input_type : 'manual',
    prompt: raw.prompt ? toCleanString(raw.prompt, 2000) : null,
    meal_id: raw.meal_id ?? null,
    result,
  };
}
