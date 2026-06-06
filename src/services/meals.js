/**
 * FitLife Meals Service
 * Handles meal logging, retrieval, deletion, and analysis history.
 * Preserved from original FitLife backend.
 */
import { supabase, isConfigured } from './supabase.js';

function ok(msg, data) { return { success: true, message: msg, data: data || {} }; }
function fail(msg, data) { return { success: false, message: msg, data: data || {} }; }

function sanitizeNumber(v, fb) { const p = Number(v); return Number.isFinite(p) && p >= 0 ? Math.round(p) : fb; }
function sanitizeText(v, max) { return String(v || '').trim().slice(0, max); }

function sanitizeMeal(meal) {
  const name = sanitizeText(meal?.name, 120);
  if (!name) return null;
  return {
    name,
    type: sanitizeText(meal.type, 40) || 'Meal',
    time: sanitizeText(meal.time, 30) || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    calories: sanitizeNumber(meal.calories, 0),
    protein: sanitizeNumber(meal.protein, 0),
    carbs: sanitizeNumber(meal.carbs, 0),
    fat: sanitizeNumber(meal.fat, 0),
    image: sanitizeText(meal.image || meal.image_url, 500) || null,
    aiSuggested: meal.aiSuggested === true,
  };
}

function normalizeMeal(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, type: row.type, time: row.time,
    calories: row.calories, protein: row.protein, carbs: row.carbs, fat: row.fat,
    image: row.image || row.image_url,
    aiSuggested: row.aiSuggested === true || row.ai_suggested === true,
    created_at: row.created_at,
  };
}

async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getRecentMeals(limit = 10, filters = {}) {
  if (!isConfigured) return fail('Database not available.', { meals: [] });
  const user = await getUser();
  if (!user) return fail('Must be logged in.', { meals: [] });

  try {
    let query = supabase.from('meals').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(limit);
    if (filters.from) query = query.gte('created_at', filters.from);
    if (filters.to) query = query.lte('created_at', filters.to);

    const { data, error } = await query;
    if (error) return fail('Failed to load meals.', { meals: [], error });
    const meals = (data || []).map(normalizeMeal).filter(Boolean);
    return ok(meals.length ? 'Meals loaded.' : 'No meals found.', { meals, isEmpty: meals.length === 0 });
  } catch (e) {
    return fail('Failed to load meals.', { meals: [], error: e });
  }
}

export async function saveMeal(meal) {
  if (!isConfigured) return fail('Database not available.');
  const user = await getUser();
  if (!user) return fail('Must be logged in.');

  const safe = sanitizeMeal(meal);
  if (!safe) return fail('Meal name is required.');

  const { data, error } = await supabase.from('meals').insert({
    user_id: user.id, name: safe.name, type: safe.type, time: safe.time,
    calories: safe.calories, protein: safe.protein, carbs: safe.carbs, fat: safe.fat,
    image: safe.image, ai_suggested: safe.aiSuggested,
  }).select().single();

  if (error) return fail('Failed to save meal.', { error });
  return ok('Meal saved.', { meal: normalizeMeal(data) });
}

export async function deleteMeal(mealId) {
  if (!isConfigured) return fail('Database not available.');
  const user = await getUser();
  if (!user) return fail('Must be logged in.');

  const { error } = await supabase.from('meals').delete().eq('id', mealId).eq('user_id', user.id);
  if (error) return fail('Failed to delete meal.', { error });
  return ok('Meal deleted.');
}

export async function saveAnalysisHistory(entry) {
  if (!isConfigured) return fail('Database not available.');
  const user = await getUser();
  if (!user) return fail('Must be logged in.');

  const inputType = ['image', 'description', 'manual'].includes(entry?.input_type) ? entry.input_type : 'manual';
  const { data, error } = await supabase.from('analysis_history').insert({
    user_id: user.id,
    meal_id: entry?.meal_id || null,
    input_type: inputType,
    prompt: sanitizeText(entry?.prompt, 500) || null,
    result: entry?.result && typeof entry.result === 'object' ? entry.result : {},
  }).select().single();

  if (error) return fail('Failed to save analysis.', { error });
  return ok('Analysis saved.', { analysis: data });
}

export async function getAnalysisHistory(limit = 20) {
  if (!isConfigured) return fail('Database not available.', { history: [] });
  const user = await getUser();
  if (!user) return fail('Must be logged in.', { history: [] });

  try {
    const { data, error } = await supabase.from('analysis_history').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(limit);
    if (error) return fail('Failed to load history.', { history: [], error });
    return ok('History loaded.', { history: data || [], isEmpty: !data?.length });
  } catch (e) {
    return fail('Failed to load history.', { history: [], error: e });
  }
}

export async function getTodaysMeals() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return getRecentMeals(20, { from: today.toISOString() });
}

export async function getDailyNutritionSummary() {
  const result = await getTodaysMeals();
  if (!result.success) return result;
  const meals = result.data.meals || [];
  const totals = meals.reduce((acc, m) => ({
    calories: acc.calories + (m.calories || 0),
    protein: acc.protein + (m.protein || 0),
    carbs: acc.carbs + (m.carbs || 0),
    fat: acc.fat + (m.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  return ok('Summary computed.', { ...totals, mealCount: meals.length, meals });
}
