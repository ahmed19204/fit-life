/**
 * FitLife AI Service
 * Handles AI nutrition plan generation via Supabase Edge Function,
 * server-side proxy (/api/ai-nutrition), or local BMR fallback.
 * SECURITY: Google AI API key is NOT exposed in frontend.
 * Preserved from original FitLife backend - source of truth for AI logic.
 */
import { supabase, isConfigured } from './supabase.js';
import { ok, fail } from '../utils/response.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function sanitizeStringList(value, maxItems) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map(i => String(i || '').trim().slice(0, 80)).filter(Boolean);
}

function validateNutritionInput(data) {
  const errors = [];
  if (!data || typeof data !== 'object') { errors.push('Invalid input'); return errors; }
  const { age, weight, height, goal, activity_level, diet_type, meals_per_day } = data;
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

async function callServerProxy(input) {
  const prompt = buildPrompt(input);
  const res = await fetch('/api/ai-nutrition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`Server proxy returned ${res.status}`);
  const result = await res.json();
  if (!result.success) throw new Error(result.message || 'Proxy error');
  return result.data;
}

async function callEdgeFunction(input) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/fitlife-nutrition-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Edge function returned ${res.status}`);
  const result = await res.json();
  return result.data || result;
}

export async function generateNutritionPlan(onboardingData) {
  const sanitized = sanitizeUserData(onboardingData);
  const errors = validateNutritionInput(sanitized);
  if (errors.length > 0) return fail('VALIDATION_ERROR', 'Invalid data: ' + errors.join(', '), { validationErrors: errors });
  if (!sanitized.age || !sanitized.weight || !sanitized.height || !sanitized.goal || !sanitized.activity_level)
    return fail('MISSING_DATA', 'Missing required fields: age, weight, height, goal, activity_level');

  try {
    // Triple fallback: Edge Function → Server Proxy → Local BMR Calculation
    let plan;
    try {
      plan = await callEdgeFunction(sanitized);
    } catch {
      try {
        plan = await callServerProxy(sanitized);
      } catch {
        plan = generateFallbackPlan(sanitized);
      }
    }
    return ok('Nutrition plan generated.', plan);
  } catch (e) {
    return fail('AI_ERROR', e.message || 'Failed to generate plan', e);
  }
}

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
  return ok('Profile saved.', data);
}

export async function getNutritionProfile() {
  if (!isConfigured) return fail('SUPABASE_NOT_CONFIGURED', 'Supabase not available');
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return fail('NOT_AUTHENTICATED', 'Must be logged in', userErr);

  const { data, error } = await supabase.from('user_profiles').select('*').eq('user_id', user.id).single();
  if (error) {
    if (error.code === 'PGRST116') return ok('No profile found.', { profile: null });
    return fail('DATABASE_ERROR', 'Failed to fetch profile', error);
  }
  return ok('Profile fetched.', { profile: data });
}

export async function checkOnboardingCompleted() {
  const result = await getNutritionProfile();
  if (result.success && result.data.profile) {
    return ok('Status retrieved.', { completed: result.data.profile.onboarding_completed === true });
  }
  return ok('Not completed.', { completed: false });
}
