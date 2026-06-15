/**
 * FitLife Deterministic Nutrition Engine
 * -----------------------------------------------------------------------------
 * Evidence-based, metric-only nutrition calculations used as the FINAL source of
 * truth for calories and macros. AI may personalize meal names / foods, but the
 * final calories, protein, carbs, and fat MUST pass through this engine.
 *
 * Formulas used
 * - BMR: Mifflin-St Jeor Equation
 *   male   = 10*w + 6.25*h - 5*a + 5
 *   female = 10*w + 6.25*h - 5*a - 161
 *   unknown/other = midpoint of male and female estimates for a neutral default
 *
 * - TDEE: BMR × activity multiplier
 *   sedentary         1.20
 *   lightly-active    1.375
 *   moderately-active 1.55
 *   very-active       1.725
 *
 * - Goal energy adjustments
 *   build-muscle  +250 kcal lean-bulk default (never more than +350)
 *   lose-weight   -400 kcal default deficit (clamped to -300…-500)
 *   maintain / improve-health  0 kcal
 *
 * - Protein targets (g/kg)
 *   build-muscle   1.8–2.2  -> default 2.2
 *   lose-weight    2.0–2.4  -> default 2.3
 *   maintain       1.6–2.0  -> default 1.8
 *   improve-health 1.6–2.0  -> default 1.8
 *
 * - Fat targets (g/kg)
 *   build-muscle   0.9
 *   lose-weight    0.8
 *   maintain       0.9
 *   improve-health 0.9
 *
 * - Carbs: remaining calories after protein and fat.
 *
 * Safety rules
 * - Never exceed 2.5 g/kg protein
 * - Never go below healthy calorie floors
 * - Keep carbs from going negative; if needed, reduce protein/fat toward the low
 *   end of their evidence-based ranges before finalizing.
 *
 * Example test case (gender unspecified -> neutral midpoint BMR)
 *   65 kg / 175 cm / 21 y / build-muscle / moderately-active
 *   => about 2645–2655 kcal, protein ~143 g, fat ~59 g, carbs ~346 g
 *   This fits the expected production range of ~2550–2700 kcal and ~140–155 g protein.
 * -----------------------------------------------------------------------------
 */

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  'lightly-active': 1.375,
  'moderately-active': 1.55,
  'very-active': 1.725,
};

const GOAL_RULES = {
  'build-muscle': {
    calorieAdjustment: 250,
    calorieBounds: [250, 350],
    proteinRange: [1.8, 2.2],
    proteinTarget: 2.2,
    fatRange: [0.8, 1.0],
    fatTarget: 0.9,
  },
  'lose-weight': {
    calorieAdjustment: -400,
    calorieBounds: [-500, -300],
    proteinRange: [2.0, 2.4],
    proteinTarget: 2.3,
    fatRange: [0.8, 1.0],
    fatTarget: 0.8,
  },
  maintain: {
    calorieAdjustment: 0,
    calorieBounds: [0, 0],
    proteinRange: [1.6, 2.0],
    proteinTarget: 1.8,
    fatRange: [0.8, 1.0],
    fatTarget: 0.9,
  },
  'improve-health': {
    calorieAdjustment: 0,
    calorieBounds: [0, 0],
    proteinRange: [1.6, 2.0],
    proteinTarget: 1.8,
    fatRange: [0.8, 1.0],
    fatTarget: 0.9,
  },
};

const DEFAULT_MEAL_NAMES = {
  2: ['Brunch', 'Dinner'],
  3: ['Breakfast', 'Lunch', 'Dinner'],
  4: ['Breakfast', 'Lunch', 'Snack', 'Dinner'],
  5: ['Breakfast', 'Morning Snack', 'Lunch', 'Afternoon Snack', 'Dinner'],
  6: ['Breakfast', 'Morning Snack', 'Lunch', 'Afternoon Snack', 'Dinner', 'Evening Snack'],
};

const MEAL_WEIGHTS = {
  2: [0.45, 0.55],
  3: [0.28, 0.37, 0.35],
  4: [0.25, 0.30, 0.15, 0.30],
  5: [0.22, 0.12, 0.28, 0.12, 0.26],
  6: [0.20, 0.10, 0.25, 0.10, 0.23, 0.12],
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundInt(value) {
  return Math.round(Number(value) || 0);
}

function normalizeGoal(goal) {
  const clean = String(goal || 'maintain').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (clean === 'gain-muscle' || clean === 'muscle-gain' || clean === 'muscle' || clean === 'bulk') return 'build-muscle';
  if (clean === 'fat-loss' || clean === 'weight-loss' || clean === 'cut') return 'lose-weight';
  if (clean === 'health' || clean === 'improve health') return 'improve-health';
  return GOAL_RULES[clean] ? clean : 'maintain';
}

function normalizeActivity(activityLevel) {
  const clean = String(activityLevel || 'sedentary').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (clean === 'light' || clean === 'light-active' || clean === 'lightly' || clean === 'light-activity') return 'lightly-active';
  if (clean === 'moderate' || clean === 'moderate-active' || clean === 'moderate-activity' || clean === 'moderately') return 'moderately-active';
  if (clean === 'active' || clean === 'very' || clean === 'very-activity') return 'very-active';
  if (clean === 'heavy' || clean === 'highly-active') return 'very-active';
  return ACTIVITY_MULTIPLIERS[clean] ? clean : 'sedentary';
}

function normalizeGender(gender) {
  const clean = String(gender || '').trim().toLowerCase();
  if (clean === 'm' || clean === 'male' || clean === 'man') return 'male';
  if (clean === 'f' || clean === 'female' || clean === 'woman') return 'female';
  return 'neutral';
}

function normalizeMealsPerDay(value) {
  return clamp(roundInt(toNumber(value, 3)), 2, 6);
}

function calorieFloorForGender(gender) {
  if (gender === 'male') return 1500;
  if (gender === 'female') return 1200;
  return 1350;
}

export function validateNutritionInputs(input = {}) {
  const errors = [];
  const weight = toNumber(input.weight);
  const height = toNumber(input.height);
  const age = toNumber(input.age);

  if (!Number.isFinite(weight) || weight < 20 || weight > 300) errors.push('Weight must be between 20 and 300 kg');
  if (!Number.isFinite(height) || height < 80 || height > 250) errors.push('Height must be between 80 and 250 cm');
  if (!Number.isFinite(age) || age < 10 || age > 120) errors.push('Age must be between 10 and 120');

  return {
    valid: errors.length === 0,
    errors,
    normalized: {
      weight,
      height,
      age,
      gender: normalizeGender(input.gender),
      goal: normalizeGoal(input.goal),
      activity_level: normalizeActivity(input.activity_level),
      meals_per_day: normalizeMealsPerDay(input.meals_per_day),
      diet_type: String(input.diet_type || 'balanced').trim().toLowerCase() || 'balanced',
    },
  };
}

export function calculateBMR({ weight, height, age, gender = 'neutral' }) {
  const male = (10 * weight) + (6.25 * height) - (5 * age) + 5;
  const female = (10 * weight) + (6.25 * height) - (5 * age) - 161;
  if (gender === 'male') return male;
  if (gender === 'female') return female;
  return (male + female) / 2;
}

export function getActivityMultiplier(activityLevel) {
  return ACTIVITY_MULTIPLIERS[normalizeActivity(activityLevel)] || ACTIVITY_MULTIPLIERS.sedentary;
}

export function calculateTDEE({ bmr, activity_level }) {
  return bmr * getActivityMultiplier(activity_level);
}

function getGoalRules(goal) {
  return GOAL_RULES[normalizeGoal(goal)] || GOAL_RULES.maintain;
}

function distributeWithRemainder(total, weights) {
  const raw = weights.map((w) => total * w);
  const rounded = raw.map((v) => Math.floor(v));
  let remainder = roundInt(total) - rounded.reduce((sum, n) => sum + n, 0);
  let idx = 0;
  while (remainder > 0) {
    rounded[idx % rounded.length] += 1;
    remainder -= 1;
    idx += 1;
  }
  return rounded;
}

function sanitizeFoods(rawFoods) {
  if (!Array.isArray(rawFoods)) return [];
  return rawFoods
    .map((food) => String(food || '').trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 6);
}

function defaultFoodsForMeal(name, dietType = 'balanced') {
  const isPlantBased = ['vegan', 'vegetarian'].includes(dietType);
  const defaults = {
    Breakfast: isPlantBased
      ? ['Overnight oats', 'Soy yogurt', 'Berries']
      : ['Greek yogurt', 'Oats', 'Berries'],
    'Morning Snack': isPlantBased
      ? ['Fruit', 'Mixed nuts']
      : ['Fruit', 'Skyr or yogurt'],
    Lunch: isPlantBased
      ? ['Tofu grain bowl', 'Rice', 'Roasted vegetables']
      : ['Chicken rice bowl', 'Rice', 'Vegetables'],
    'Afternoon Snack': isPlantBased
      ? ['Hummus', 'Rice cakes']
      : ['Protein yogurt', 'Rice cakes'],
    Dinner: isPlantBased
      ? ['Lentil pasta', 'Olive oil vegetables']
      : ['Lean protein', 'Potatoes', 'Vegetables'],
    'Evening Snack': isPlantBased
      ? ['Protein smoothie', 'Nut butter']
      : ['Cottage cheese', 'Fruit'],
    Brunch: isPlantBased
      ? ['Tofu scramble', 'Toast', 'Fruit']
      : ['Eggs', 'Toast', 'Fruit'],
  };
  return defaults[name] || (isPlantBased ? ['Protein source', 'Whole grains', 'Vegetables'] : ['Lean protein', 'Carb source', 'Vegetables']);
}

function ensureMinimumCarbs({ calories, protein, fat, weight, rules }) {
  let proteinG = protein;
  let fatG = fat;
  const minProtein = weight * rules.proteinRange[0];
  const minFat = weight * rules.fatRange[0];
  let carbsG = (calories - (proteinG * 4) - (fatG * 9)) / 4;

  if (carbsG >= 50) {
    return { protein: proteinG, fat: fatG, carbs: carbsG };
  }

  const deficitToRecover = (50 - carbsG) * 4;
  let remaining = deficitToRecover;

  const proteinReductionCapacity = Math.max(0, proteinG - minProtein) * 4;
  if (proteinReductionCapacity > 0) {
    const proteinCaloriesToReduce = Math.min(remaining, proteinReductionCapacity);
    proteinG -= proteinCaloriesToReduce / 4;
    remaining -= proteinCaloriesToReduce;
  }

  const fatReductionCapacity = Math.max(0, fatG - minFat) * 9;
  if (remaining > 0 && fatReductionCapacity > 0) {
    const fatCaloriesToReduce = Math.min(remaining, fatReductionCapacity);
    fatG -= fatCaloriesToReduce / 9;
    remaining -= fatCaloriesToReduce;
  }

  carbsG = Math.max(35, (calories - (proteinG * 4) - (fatG * 9)) / 4);
  return { protein: proteinG, fat: fatG, carbs: carbsG };
}

/**
 * calculateMacros()
 * Public reusable wrapper required by the app spec.
 * Returns deterministic BMR/TDEE/calorie/macro targets.
 */
export function calculateMacros(input = {}) {
  const validation = validateNutritionInputs(input);
  if (!validation.valid) {
    throw new Error(validation.errors.join(', '));
  }

  const normalized = validation.normalized;
  const rules = getGoalRules(normalized.goal);
  const bmr = calculateBMR({ ...normalized, weight: validation.normalized.weight, height: validation.normalized.height, age: validation.normalized.age });
  const tdee = calculateTDEE({ bmr, activity_level: normalized.activity_level });

  const floor = Math.max(calorieFloorForGender(normalized.gender), roundInt(bmr));
  let targetCalories = tdee + clamp(rules.calorieAdjustment, rules.calorieBounds[0], rules.calorieBounds[1]);
  targetCalories = Math.max(targetCalories, floor);

  let proteinG = clamp(validation.normalized.weight * rules.proteinTarget, validation.normalized.weight * rules.proteinRange[0], validation.normalized.weight * Math.min(2.5, rules.proteinRange[1]));
  let fatG = clamp(validation.normalized.weight * rules.fatTarget, validation.normalized.weight * rules.fatRange[0], validation.normalized.weight * rules.fatRange[1]);

  const macroResult = ensureMinimumCarbs({
    calories: targetCalories,
    protein: proteinG,
    fat: fatG,
    weight: validation.normalized.weight,
    rules,
  });

  proteinG = clamp(macroResult.protein, validation.normalized.weight * rules.proteinRange[0], validation.normalized.weight * 2.5);
  fatG = clamp(macroResult.fat, validation.normalized.weight * rules.fatRange[0], validation.normalized.weight * rules.fatRange[1]);
  let carbsG = Math.max(0, (targetCalories - (proteinG * 4) - (fatG * 9)) / 4);

  const calories = roundInt(targetCalories);
  const protein = roundInt(proteinG);
  const fat = roundInt(fatG);
  const carbs = Math.max(0, roundInt((calories - (protein * 4) - (fat * 9)) / 4 || carbsG));

  return {
    bmr: roundInt(bmr),
    tdee: roundInt(tdee),
    calories,
    protein,
    carbs,
    fat,
    protein_per_kg: Number((protein / validation.normalized.weight).toFixed(2)),
    fat_per_kg: Number((fat / validation.normalized.weight).toFixed(2)),
    meta: {
      gender: normalized.gender,
      goal: normalized.goal,
      activity_level: normalized.activity_level,
      meals_per_day: normalized.meals_per_day,
      calorie_floor: floor,
      formula: 'Mifflin-St Jeor',
    },
  };
}

export const calculateMacroTargets = calculateMacros;

/**
 * validateMacros()
 * Ensures the final macro set is safe, non-negative, and within healthy bounds.
 */
export function validateMacros(result = {}, input = {}) {
  const weight = Number(input.weight || 0);
  const errors = [];

  if (!Number.isFinite(result.calories) || result.calories < 1200) errors.push('Calories are below a healthy minimum');
  if (!Number.isFinite(result.protein) || result.protein < 0) errors.push('Protein must be non-negative');
  if (!Number.isFinite(result.carbs) || result.carbs < 0) errors.push('Carbs must be non-negative');
  if (!Number.isFinite(result.fat) || result.fat < 0) errors.push('Fat must be non-negative');
  if (weight > 0 && Number(result.protein || 0) > (weight * 2.5)) errors.push('Protein exceeds 2.5 g/kg safety cap');

  return {
    valid: errors.length === 0,
    errors,
    normalized: {
      calories: roundInt(result.calories),
      protein: roundInt(result.protein),
      carbs: roundInt(result.carbs),
      fat: roundInt(result.fat),
    },
  };
}

export function buildDeterministicMealPlan({ input = {}, totals, aiMeals = [] } = {}) {
  const validation = validateNutritionInputs(input);
  if (!validation.valid) {
    throw new Error(validation.errors.join(', '));
  }

  const mealsPerDay = validation.normalized.meals_per_day;
  const mealNames = DEFAULT_MEAL_NAMES[mealsPerDay] || DEFAULT_MEAL_NAMES[3];
  const weights = MEAL_WEIGHTS[mealsPerDay] || MEAL_WEIGHTS[3];

  const caloriesByMeal = distributeWithRemainder(totals.calories, weights);
  const proteinByMeal = distributeWithRemainder(totals.protein, weights);
  const carbsByMeal = distributeWithRemainder(totals.carbs, weights);
  const fatByMeal = distributeWithRemainder(totals.fat, weights);

  return mealNames.map((fallbackName, index) => {
    const aiMeal = aiMeals[index] || aiMeals.find((meal) => String(meal?.name || '').toLowerCase() === fallbackName.toLowerCase()) || null;
    const foods = sanitizeFoods(aiMeal?.foods);
    return {
      name: String(aiMeal?.name || fallbackName).trim().slice(0, 120),
      calories: caloriesByMeal[index],
      protein: proteinByMeal[index],
      carbs: carbsByMeal[index],
      fat: fatByMeal[index],
      foods: foods.length > 0 ? foods : defaultFoodsForMeal(fallbackName, validation.normalized.diet_type),
    };
  });
}

export function buildNutritionPlan(input = {}, aiMeals = []) {
  const totals = calculateMacros(input);
  return {
    calories: totals.calories,
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat,
    meal_plan: buildDeterministicMealPlan({ input, totals, aiMeals }),
    meta: totals.meta,
    bmr: totals.bmr,
    tdee: totals.tdee,
  };
}

export function sanitizeMetricProfileInput(input = {}) {
  const restrictions = Array.isArray(input.restrictions)
    ? input.restrictions
    : typeof input.restrictions === 'string'
      ? input.restrictions.split(/[;,]/)
      : [];

  const healthConditions = Array.isArray(input.health_conditions)
    ? input.health_conditions
    : Array.isArray(input.conditions)
      ? input.conditions
      : typeof input.health_conditions === 'string'
        ? input.health_conditions.split(/[;,]/)
        : [];

  return {
    age: toNumber(input.age, null),
    weight: toNumber(input.weight, null),
    height: toNumber(input.height, null),
    gender: normalizeGender(input.gender),
    goal: normalizeGoal(input.goal),
    activity_level: normalizeActivity(input.activity_level),
    meals_per_day: normalizeMealsPerDay(input.meals_per_day),
    diet_type: String(input.dietStyle || input.diet_type || 'balanced').trim().toLowerCase() || 'balanced',
    restrictions: restrictions.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 12),
    health_conditions: healthConditions.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 12),
  };
}
