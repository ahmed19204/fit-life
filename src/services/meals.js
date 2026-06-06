/**
 * FitLife Meals Service (Production Hardened)
 * ----------------------------------------------------------------------------
 * Handles meal logging, retrieval, deletion, analysis history,
 * timezone-aware daily tracking, and day-change detection.
 *
 * Phase 1 hardening:
 *   - Zod-validated payloads before every insert/update
 *   - Auto-sanitization of AI hallucinations (string → number, drop unknown fields)
 *   - Rich supabase error logs (message + details + hint + code)
 *   - Defensive null-handling everywhere
 */
import { supabase, isConfigured } from './supabase.js';
import { ok, fail } from '../utils/response.js';
import { emit, EVENTS } from './events.js';
import {
  MealSchema,
  AnalysisHistorySchema,
  sanitizeMealPayload,
  sanitizeAnalysisPayload,
  validate,
} from '../utils/schemas.js';
import { logger, logSupabaseError } from '../utils/logger.js';

const log = logger.scoped('Meals');

function normalizeMeal(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    time: row.time,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    image: row.image || row.image_url,
    aiSuggested: row.aiSuggested === true || row.ai_suggested === true,
    food_emoji: row.food_emoji || null,
    created_at: row.created_at,
  };
}

async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ---------- Timezone-Aware Date Helpers ----------

function getLocalDayStart(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  return local.toISOString();
}

function getLocalDayEnd(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  return local.toISOString();
}

function getLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

let lastKnownDay = getLocalDateKey();

export function checkDayChange() {
  const currentDay = getLocalDateKey();
  if (currentDay !== lastKnownDay) {
    lastKnownDay = currentDay;
    emit(EVENTS.DAY_CHANGED, { newDay: currentDay });
    return true;
  }
  return false;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkDayChange();
  });
}

// ---------- CRUD Operations ----------

export async function getRecentMeals(limit = 10, filters = {}) {
  if (!isConfigured) return fail('DB_UNAVAILABLE', 'Database not available.', null, { meals: [] });
  const user = await getUser();
  if (!user) return fail('NOT_AUTHENTICATED', 'Must be logged in.', null, { meals: [] });

  try {
    let query = supabase.from('meals').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(limit);
    if (filters.from) query = query.gte('created_at', filters.from);
    if (filters.to) query = query.lte('created_at', filters.to);

    const { data, error } = await query;
    if (error) {
      logSupabaseError('Meals', 'getRecentMeals', error, { limit, filters });
      return fail('QUERY_ERROR', 'Failed to load meals.', error, { meals: [] });
    }
    const meals = (data || []).map(normalizeMeal).filter(Boolean);
    return ok(meals.length ? 'Meals loaded.' : 'No meals found.', { meals, isEmpty: meals.length === 0 });
  } catch (e) {
    logSupabaseError('Meals', 'getRecentMeals.catch', e);
    return fail('QUERY_ERROR', 'Failed to load meals.', e, { meals: [] });
  }
}

/**
 * Save a meal. Bulletproof against AI hallucinations:
 *   1. Coerce raw payload (string → number, drop unknown fields)
 *   2. Validate against MealSchema
 *   3. Log rich error context if Supabase rejects
 */
export async function saveMeal(meal) {
  if (!isConfigured) return fail('DB_UNAVAILABLE', 'Database not available.');
  const user = await getUser();
  if (!user) return fail('NOT_AUTHENTICATED', 'Must be logged in.');

  // 1. Sanitize & coerce
  const sanitized = sanitizeMealPayload(meal || {});
  // 2. Validate
  const v = validate(MealSchema, sanitized);
  if (!v.success || !v.data?.name) {
    log.warn('Meal validation failed', { errors: v.errors, raw: meal });
    return fail('VALIDATION_ERROR', 'Meal data is invalid.', null, { validationErrors: v.errors });
  }

  const payload = {
    user_id: user.id,
    name: v.data.name,
    type: v.data.type,
    time: v.data.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    calories: v.data.calories,
    protein: v.data.protein,
    carbs: v.data.carbs,
    fat: v.data.fat,
    image: v.data.image || null,
    ai_suggested: v.data.ai_suggested === true,
    food_emoji: v.data.food_emoji || null,
  };

  const { data, error } = await supabase.from('meals').insert(payload).select().single();
  if (error) {
    const diag = logSupabaseError('Meals', 'saveMeal.insert', error, { payload });
    return fail('INSERT_ERROR', 'Failed to save meal.', error, { diagnostic: diag });
  }

  const normalizedMeal = normalizeMeal(data);
  emit(EVENTS.MEAL_SAVED, { meal: normalizedMeal });
  return ok('Meal saved.', { meal: normalizedMeal });
}

export async function deleteMeal(mealId) {
  if (!isConfigured) return fail('DB_UNAVAILABLE', 'Database not available.');
  const user = await getUser();
  if (!user) return fail('NOT_AUTHENTICATED', 'Must be logged in.');

  const { error } = await supabase.from('meals').delete().eq('id', mealId).eq('user_id', user.id);
  if (error) {
    logSupabaseError('Meals', 'deleteMeal', error, { mealId });
    return fail('DELETE_ERROR', 'Failed to delete meal.', error);
  }
  emit(EVENTS.MEAL_DELETED, { mealId });
  return ok('Meal deleted.');
}

export async function saveAnalysisHistory(entry) {
  if (!isConfigured) return fail('DB_UNAVAILABLE', 'Database not available.');
  const user = await getUser();
  if (!user) return fail('NOT_AUTHENTICATED', 'Must be logged in.');

  const sanitized = sanitizeAnalysisPayload(entry || {});
  const v = validate(AnalysisHistorySchema, sanitized);
  if (!v.success) {
    log.warn('Analysis history validation failed', { errors: v.errors });
    return fail('VALIDATION_ERROR', 'Invalid analysis payload.', null, { validationErrors: v.errors });
  }

  const { data, error } = await supabase.from('analysis_history').insert({
    user_id: user.id,
    meal_id: v.data.meal_id || null,
    input_type: v.data.input_type,
    prompt: v.data.prompt || null,
    result: v.data.result || {},
  }).select().single();

  if (error) {
    logSupabaseError('Meals', 'saveAnalysisHistory.insert', error, { payload: v.data });
    return fail('INSERT_ERROR', 'Failed to save analysis.', error);
  }
  return ok('Analysis saved.', { analysis: data });
}

export async function getAnalysisHistory(limit = 20) {
  if (!isConfigured) return fail('DB_UNAVAILABLE', 'Database not available.', null, { history: [] });
  const user = await getUser();
  if (!user) return fail('NOT_AUTHENTICATED', 'Must be logged in.', null, { history: [] });

  try {
    const { data, error } = await supabase.from('analysis_history').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(limit);
    if (error) {
      logSupabaseError('Meals', 'getAnalysisHistory', error);
      return fail('QUERY_ERROR', 'Failed to load history.', error, { history: [] });
    }
    return ok('History loaded.', { history: data || [], isEmpty: !data?.length });
  } catch (e) {
    logSupabaseError('Meals', 'getAnalysisHistory.catch', e);
    return fail('QUERY_ERROR', 'Failed to load history.', e, { history: [] });
  }
}

// ---------- Today's Meals (timezone-aware) ----------

export async function getTodaysMeals() {
  return getRecentMeals(30, { from: getLocalDayStart() });
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

// ---------- Weekly & Monthly Analytics ----------

export async function getMealsForDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
  const dayEnd = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
  return getRecentMeals(30, { from: dayStart, to: dayEnd });
}

export async function getWeeklyAnalytics() {
  if (!isConfigured) return fail('DB_UNAVAILABLE', 'Database not available.', null, { days: [] });
  const user = await getUser();
  if (!user) return fail('NOT_AUTHENTICATED', 'Must be logged in.', null, { days: [] });

  const today = new Date();
  const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6, 0, 0, 0, 0);

  try {
    const { data, error } = await supabase.from('meals').select('*')
      .eq('user_id', user.id)
      .gte('created_at', weekAgo.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      logSupabaseError('Meals', 'getWeeklyAnalytics', error);
      return fail('QUERY_ERROR', 'Failed to load weekly data.', error, { days: [] });
    }

    const meals = (data || []).map(normalizeMeal).filter(Boolean);
    const dayMap = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - i));
      const key = getLocalDateKey(d);
      dayMap[key] = {
        date: key,
        dayLabel: d.toLocaleDateString('en-US', { weekday: 'short' }),
        calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0,
      };
    }
    meals.forEach(m => {
      const mDate = new Date(m.created_at);
      const key = getLocalDateKey(mDate);
      if (dayMap[key]) {
        dayMap[key].calories += m.calories || 0;
        dayMap[key].protein += m.protein || 0;
        dayMap[key].carbs += m.carbs || 0;
        dayMap[key].fat += m.fat || 0;
        dayMap[key].mealCount++;
      }
    });
    const days = Object.values(dayMap);
    const activeDays = days.filter(d => d.mealCount > 0).length;
    const avgCal = activeDays > 0 ? Math.round(days.reduce((s, d) => s + d.calories, 0) / activeDays) : 0;
    const avgProtein = activeDays > 0 ? Math.round(days.reduce((s, d) => s + d.protein, 0) / activeDays) : 0;
    return ok('Weekly analytics loaded.', { days, activeDays, avgCalories: avgCal, avgProtein, totalMeals: meals.length });
  } catch (e) {
    logSupabaseError('Meals', 'getWeeklyAnalytics.catch', e);
    return fail('QUERY_ERROR', 'Failed to load weekly data.', e, { days: [] });
  }
}

export async function getMonthlyAnalytics() {
  if (!isConfigured) return fail('DB_UNAVAILABLE', 'Database not available.', null, { weeks: [] });
  const user = await getUser();
  if (!user) return fail('NOT_AUTHENTICATED', 'Must be logged in.', null, { weeks: [] });

  const today = new Date();
  const monthAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29, 0, 0, 0, 0);

  try {
    const { data, error } = await supabase.from('meals').select('*')
      .eq('user_id', user.id)
      .gte('created_at', monthAgo.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      logSupabaseError('Meals', 'getMonthlyAnalytics', error);
      return fail('QUERY_ERROR', 'Failed to load monthly data.', error, { weeks: [] });
    }

    const meals = (data || []).map(normalizeMeal).filter(Boolean);
    const weeks = [];
    for (let w = 0; w < 4; w++) {
      const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29 + w * 7);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
      const label = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      weeks.push({ label, calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0, activeDays: new Set() });
    }
    meals.forEach(m => {
      const mDate = new Date(m.created_at);
      const daysSinceStart = Math.floor((mDate - monthAgo) / (24 * 60 * 60 * 1000));
      const weekIdx = Math.min(3, Math.floor(daysSinceStart / 7));
      if (weeks[weekIdx]) {
        weeks[weekIdx].calories += m.calories || 0;
        weeks[weekIdx].protein += m.protein || 0;
        weeks[weekIdx].carbs += m.carbs || 0;
        weeks[weekIdx].fat += m.fat || 0;
        weeks[weekIdx].mealCount++;
        weeks[weekIdx].activeDays.add(getLocalDateKey(mDate));
      }
    });
    const weeksClean = weeks.map(w => ({ ...w, activeDays: w.activeDays.size }));
    return ok('Monthly analytics loaded.', { weeks: weeksClean, totalMeals: meals.length });
  } catch (e) {
    logSupabaseError('Meals', 'getMonthlyAnalytics.catch', e);
    return fail('QUERY_ERROR', 'Failed to load monthly data.', e, { weeks: [] });
  }
}
