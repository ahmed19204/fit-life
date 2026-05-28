/**
 * FitLife Meals Service
 * Handles meal logging, retrieval, deletion, analysis history,
 * timezone-aware daily tracking, and day-change detection.
 */
import { supabase, isConfigured } from './supabase.js';
import { ok, fail } from '../utils/response.js';
import { emit, EVENTS } from './events.js';

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
    food_emoji: sanitizeText(meal.food_emoji, 10) || null,
  };
}

function normalizeMeal(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, type: row.type, time: row.time,
    calories: row.calories, protein: row.protein, carbs: row.carbs, fat: row.fat,
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

/**
 * Get the start of today in user's local timezone as an ISO string.
 * Uses local Date manipulation to ensure timezone correctness.
 */
function getLocalDayStart(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  return local.toISOString();
}

function getLocalDayEnd(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  return local.toISOString();
}

/**
 * Get date string in YYYY-MM-DD format for the user's local timezone.
 */
function getLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Track the current day for day-change detection
let lastKnownDay = getLocalDateKey();

/**
 * Check if the day has changed since last check.
 * Called on visibility change and navigation.
 */
export function checkDayChange() {
  const currentDay = getLocalDateKey();
  if (currentDay !== lastKnownDay) {
    lastKnownDay = currentDay;
    emit(EVENTS.DAY_CHANGED, { newDay: currentDay });
    return true;
  }
  return false;
}

// Setup automatic day-change detection
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkDayChange();
    }
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
    if (error) return fail('QUERY_ERROR', 'Failed to load meals.', error, { meals: [] });
    const meals = (data || []).map(normalizeMeal).filter(Boolean);
    return ok(meals.length ? 'Meals loaded.' : 'No meals found.', { meals, isEmpty: meals.length === 0 });
  } catch (e) {
    return fail('QUERY_ERROR', 'Failed to load meals.', e, { meals: [] });
  }
}

export async function saveMeal(meal) {
  if (!isConfigured) return fail('DB_UNAVAILABLE', 'Database not available.');
  const user = await getUser();
  if (!user) return fail('NOT_AUTHENTICATED', 'Must be logged in.');

  const safe = sanitizeMeal(meal);
  if (!safe) return fail('VALIDATION_ERROR', 'Meal name is required.');

  const { data, error } = await supabase.from('meals').insert({
    user_id: user.id, name: safe.name, type: safe.type, time: safe.time,
    calories: safe.calories, protein: safe.protein, carbs: safe.carbs, fat: safe.fat,
    image: safe.image, ai_suggested: safe.aiSuggested,
    food_emoji: safe.food_emoji,
  }).select().single();

  if (error) return fail('INSERT_ERROR', 'Failed to save meal.', error);
  
  const normalizedMeal = normalizeMeal(data);
  // Emit event so dashboard/history auto-update
  emit(EVENTS.MEAL_SAVED, { meal: normalizedMeal });
  
  return ok('Meal saved.', { meal: normalizedMeal });
}

export async function deleteMeal(mealId) {
  if (!isConfigured) return fail('DB_UNAVAILABLE', 'Database not available.');
  const user = await getUser();
  if (!user) return fail('NOT_AUTHENTICATED', 'Must be logged in.');

  const { error } = await supabase.from('meals').delete().eq('id', mealId).eq('user_id', user.id);
  if (error) return fail('DELETE_ERROR', 'Failed to delete meal.', error);
  
  emit(EVENTS.MEAL_DELETED, { mealId });
  return ok('Meal deleted.');
}

export async function saveAnalysisHistory(entry) {
  if (!isConfigured) return fail('DB_UNAVAILABLE', 'Database not available.');
  const user = await getUser();
  if (!user) return fail('NOT_AUTHENTICATED', 'Must be logged in.');

  const inputType = ['image', 'description', 'manual'].includes(entry?.input_type) ? entry.input_type : 'manual';
  const { data, error } = await supabase.from('analysis_history').insert({
    user_id: user.id,
    meal_id: entry?.meal_id || null,
    input_type: inputType,
    prompt: sanitizeText(entry?.prompt, 500) || null,
    result: entry?.result && typeof entry.result === 'object' ? entry.result : {},
  }).select().single();

  if (error) return fail('INSERT_ERROR', 'Failed to save analysis.', error);
  return ok('Analysis saved.', { analysis: data });
}

export async function getAnalysisHistory(limit = 20) {
  if (!isConfigured) return fail('DB_UNAVAILABLE', 'Database not available.', null, { history: [] });
  const user = await getUser();
  if (!user) return fail('NOT_AUTHENTICATED', 'Must be logged in.', null, { history: [] });

  try {
    const { data, error } = await supabase.from('analysis_history').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(limit);
    if (error) return fail('QUERY_ERROR', 'Failed to load history.', error, { history: [] });
    return ok('History loaded.', { history: data || [], isEmpty: !data?.length });
  } catch (e) {
    return fail('QUERY_ERROR', 'Failed to load history.', e, { history: [] });
  }
}

// ---------- Today's Meals (timezone-aware) ----------

export async function getTodaysMeals() {
  const todayStart = getLocalDayStart();
  return getRecentMeals(30, { from: todayStart });
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

/**
 * Get meals for a specific date (YYYY-MM-DD)
 */
export async function getMealsForDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
  const dayEnd = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
  return getRecentMeals(30, { from: dayStart, to: dayEnd });
}

/**
 * Get weekly nutrition summary (last 7 days).
 * Returns array of { date, calories, protein, carbs, fat, mealCount }.
 */
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
    
    if (error) return fail('QUERY_ERROR', 'Failed to load weekly data.', error, { days: [] });
    
    const meals = (data || []).map(normalizeMeal).filter(Boolean);
    
    // Group by day
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
    
    return ok('Weekly analytics loaded.', {
      days,
      activeDays,
      avgCalories: avgCal,
      avgProtein,
      totalMeals: meals.length,
    });
  } catch (e) {
    return fail('QUERY_ERROR', 'Failed to load weekly data.', e, { days: [] });
  }
}

/**
 * Get monthly summary (last 30 days aggregated by week).
 */
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
    
    if (error) return fail('QUERY_ERROR', 'Failed to load monthly data.', error, { weeks: [] });
    
    const meals = (data || []).map(normalizeMeal).filter(Boolean);
    
    // Group by week
    const weeks = [];
    for (let w = 0; w < 4; w++) {
      const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29 + w * 7);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
      const label = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      weeks.push({
        label,
        calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0, activeDays: new Set(),
      });
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
    
    // Convert Set to count
    const weeksClean = weeks.map(w => ({ ...w, activeDays: w.activeDays.size }));
    
    return ok('Monthly analytics loaded.', {
      weeks: weeksClean,
      totalMeals: meals.length,
    });
  } catch (e) {
    return fail('QUERY_ERROR', 'Failed to load monthly data.', e, { weeks: [] });
  }
}
