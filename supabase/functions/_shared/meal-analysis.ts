type MealType = "Breakfast" | "Lunch" | "Dinner" | "Snack";

export type MealAnalysis = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  foods: string[];
  servingSize: string;
  summary: string;
  mealType: MealType;
};

type FoodDef = {
  name: string;
  per100g: { calories: number; protein: number; carbs: number; fat: number };
  aliases: string[];
  defaultGrams: number;
  unitWeights?: Partial<Record<"g" | "kg" | "ml" | "cup" | "tbsp" | "tsp" | "piece" | "bowl" | "plate", number>>;
};

const EASTERN_ARABIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

const UNIT_ALIASES: Array<[RegExp, string]> = [
  [/\bgrams?\b|\bgramme?s?\b|\bgr\b|\bg\b|جرام|غرام|غم|غ\b|грамм(?:а|ов)?|\bгр\b/giu, " g "],
  [/\bkilograms?\b|\bkg\b|كيلو(?:جرام)?|кг/giu, " kg "],
  [/\bmillilit(?:er|re)s?\b|\bml\b|مل|مليلتر|миллилитр(?:а|ов)?/giu, " ml "],
  [/\bcups?\b|كوب|اكواب|чашк(?:а|и|у|е|ой)/giu, " cup "],
  [/\btablespoons?\b|\btbsp\b|ملعقة كبيرة|ملاعق كبيرة|столов(?:ая|ые)? ложк(?:а|и|у|е|ой)/giu, " tbsp "],
  [/\bteaspoons?\b|\btsp\b|ملعقة صغيرة|ملاعق صغيرة|чайн(?:ая|ые)? ложк(?:а|и|у|е|ой)/giu, " tsp "],
  [/\bpieces?\b|\bpcs?\b|قطعة|حبة|piece|штук(?:а|и)?|кусок|кусочка/giu, " piece "],
  [/\bbowls?\b|وعاء|زبدية|миск(?:а|и|у|е|ой)/giu, " bowl "],
  [/\bplates?\b|طبق|тарелк(?:а|и|у|е|ой)/giu, " plate "],
];

const FOODS: FoodDef[] = [
  {
    name: "chicken breast",
    aliases: ["chicken", "chicken breast", "دجاج", "فراخ", "chiken", "курица", "куриная грудка", "грудка"],
    per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
    defaultGrams: 150,
    unitWeights: { piece: 140, plate: 180 },
  },
  {
    name: "rice",
    aliases: ["rice", "white rice", "رز", "ارز", "рис"],
    per100g: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
    defaultGrams: 150,
    unitWeights: { cup: 158, bowl: 180, plate: 220 },
  },
  {
    name: "bread",
    aliases: ["bread", "toast", "خبز", "عيش", "bread slice", "хлеб", "тост"],
    per100g: { calories: 265, protein: 9, carbs: 49, fat: 3.2 },
    defaultGrams: 60,
    unitWeights: { piece: 30 },
  },
  {
    name: "egg",
    aliases: ["egg", "eggs", "بيض", "بيضة", "яйцо", "яйца"],
    per100g: { calories: 143, protein: 12.6, carbs: 1.1, fat: 9.5 },
    defaultGrams: 100,
    unitWeights: { piece: 50 },
  },
  {
    name: "banana",
    aliases: ["banana", "bananas", "موز", "банан", "бананы"],
    per100g: { calories: 89, protein: 1.1, carbs: 23, fat: 0.3 },
    defaultGrams: 120,
    unitWeights: { piece: 120 },
  },
  {
    name: "apple",
    aliases: ["apple", "apples", "تفاح", "яблоко", "яблоки"],
    per100g: { calories: 52, protein: 0.3, carbs: 14, fat: 0.2 },
    defaultGrams: 150,
    unitWeights: { piece: 150 },
  },
  {
    name: "beef",
    aliases: ["beef", "steak", "لحم", "لحم بقري", "говядина", "стейк"],
    per100g: { calories: 217, protein: 26, carbs: 0, fat: 12 },
    defaultGrams: 150,
    unitWeights: { piece: 150, plate: 180 },
  },
  {
    name: "salmon",
    aliases: ["salmon", "سمك", "سلمون", "рыба", "лосось", "семга"],
    per100g: { calories: 208, protein: 20, carbs: 0, fat: 13 },
    defaultGrams: 150,
    unitWeights: { piece: 150, plate: 180 },
  },
  {
    name: "potato",
    aliases: ["potato", "potatoes", "بطاطس", "بطاطا", "картофель", "картошка"],
    per100g: { calories: 87, protein: 1.9, carbs: 20, fat: 0.1 },
    defaultGrams: 180,
    unitWeights: { piece: 170, plate: 220 },
  },
  {
    name: "oats",
    aliases: ["oats", "oatmeal", "شوفان", "овсянка", "овес"],
    per100g: { calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9 },
    defaultGrams: 60,
    unitWeights: { cup: 80, bowl: 80 },
  },
  {
    name: "milk",
    aliases: ["milk", "حليب", "молоко"],
    per100g: { calories: 61, protein: 3.2, carbs: 4.8, fat: 3.3 },
    defaultGrams: 240,
    unitWeights: { cup: 240, ml: 1 },
  },
  {
    name: "yogurt",
    aliases: ["yogurt", "yoghurt", "greek yogurt", "زبادي", "لبن", "йогурт"],
    per100g: { calories: 59, protein: 10, carbs: 3.6, fat: 0.4 },
    defaultGrams: 170,
    unitWeights: { cup: 245, bowl: 180 },
  },
  {
    name: "cheese",
    aliases: ["cheese", "جبن", "جبنة", "сыр"],
    per100g: { calories: 402, protein: 25, carbs: 1.3, fat: 33 },
    defaultGrams: 30,
    unitWeights: { piece: 30 },
  },
  {
    name: "olive oil",
    aliases: ["olive oil", "oil", "زيت زيتون", "زيت", "оливковое масло", "масло"],
    per100g: { calories: 884, protein: 0, carbs: 0, fat: 100 },
    defaultGrams: 14,
    unitWeights: { tbsp: 14, tsp: 5 },
  },
  {
    name: "pasta",
    aliases: ["pasta", "macaroni", "مكرونة", "باستا", "паста", "макароны"],
    per100g: { calories: 157, protein: 5.8, carbs: 30.9, fat: 0.9 },
    defaultGrams: 180,
    unitWeights: { cup: 140, bowl: 180, plate: 220 },
  },
  {
    name: "lentils",
    aliases: ["lentils", "عدس", "чечевица"],
    per100g: { calories: 116, protein: 9, carbs: 20, fat: 0.4 },
    defaultGrams: 180,
    unitWeights: { cup: 198, bowl: 200 },
  },
  {
    name: "beans",
    aliases: ["beans", "لوبيا", "فاصوليا", "фасоль", "бобы"],
    per100g: { calories: 127, protein: 8.7, carbs: 22.8, fat: 0.5 },
    defaultGrams: 180,
    unitWeights: { cup: 177, bowl: 190 },
  },
  {
    name: "nuts",
    aliases: ["nuts", "almonds", "mixed nuts", "مكسرات", "لوز", "орехи", "миндаль"],
    per100g: { calories: 607, protein: 20, carbs: 21, fat: 54 },
    defaultGrams: 30,
    unitWeights: { tbsp: 10, piece: 5 },
  },
  {
    name: "dates",
    aliases: ["dates", "date", "تمر", "تمور", "финики", "финик"],
    per100g: { calories: 282, protein: 2.5, carbs: 75, fat: 0.4 },
    defaultGrams: 24,
    unitWeights: { piece: 24 },
  },
  {
    name: "cucumber",
    aliases: ["cucumber", "خيار", "огурец"],
    per100g: { calories: 15, protein: 0.7, carbs: 3.6, fat: 0.1 },
    defaultGrams: 100,
    unitWeights: { piece: 200 },
  },
  {
    name: "tomato",
    aliases: ["tomato", "tomatoes", "طماطم", "بندورة", "помидор", "томаты"],
    per100g: { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2 },
    defaultGrams: 100,
    unitWeights: { piece: 120 },
  },
];

const MEAL_TYPE_HINTS: Array<[MealType, string[]]> = [
  ["Breakfast", ["breakfast", "morning", "فطور", "افطار", "завтрак", "oats", "egg"]],
  ["Lunch", ["lunch", "غداء", "обед", "rice", "chicken", "beef"]],
  ["Dinner", ["dinner", "عشاء", "ужин", "salmon", "pasta"]],
  ["Snack", ["snack", "وجبة خفيفة", "перекус", "banana", "apple", "nuts", "dates"]],
];

const GENERIC_FALLBACK: MealAnalysis = {
  name: "Mixed meal",
  calories: 520,
  protein: 28,
  carbs: 48,
  fat: 20,
  foods: ["mixed meal"],
  servingSize: "1 serving",
  summary: "Approximate fallback estimate used because AI analysis was unavailable.",
  mealType: "Lunch",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundInt(value: number) {
  return Math.round(Number.isFinite(value) ? value : 0);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceArabicDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => EASTERN_ARABIC_DIGITS[digit] || digit);
}

function normalizeNumericText(value: string) {
  return replaceArabicDigits(value)
    .replace(/[،]/g, ",")
    .replace(/(?<=\d),(?=\d)/g, ".")
    .replace(/[٫]/g, ".");
}

export function detectLanguage(value: string): "ar" | "ru" | "en" {
  if (/[\u0600-\u06FF]/u.test(value)) return "ar";
  if (/[\u0400-\u04FF]/u.test(value)) return "ru";
  return "en";
}

export function normalizeMealDescription(input: string) {
  let text = normalizeNumericText(String(input || "")).toLowerCase();
  for (const [pattern, replacement] of UNIT_ALIASES) {
    text = text.replace(pattern, replacement);
  }

  const foodAliasPairs = FOODS
    .flatMap((food) => food.aliases.map((alias) => [alias, food.name] as const))
    .sort((a, b) => b[0].length - a[0].length);

  for (const [alias, canonical] of foodAliasPairs) {
    text = text.replace(new RegExp(escapeRegExp(alias.toLowerCase()), "giu"), canonical);
  }

  text = text
    .replace(/\s*\+\s*/g, " | ")
    .replace(/\s*(?:and|with|plus|و|مع|и|с)\s+/giu, " | ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    language: detectLanguage(input),
    normalizedText: text,
  };
}

function parseQuantity(segment: string, food: FoodDef) {
  const match = segment.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|cup|tbsp|tsp|piece|bowl|plate)\b/u);
  if (!match) {
    return food.defaultGrams;
  }

  const amount = Number(match[1]);
  const unit = match[2] as keyof NonNullable<FoodDef["unitWeights"]>;
  if (!Number.isFinite(amount) || amount <= 0) return food.defaultGrams;

  if (unit === "g") return amount;
  if (unit === "kg") return amount * 1000;
  if (unit === "ml") return amount * (food.unitWeights?.ml || 1);

  const unitWeight = food.unitWeights?.[unit] || {
    cup: 240,
    tbsp: 15,
    tsp: 5,
    piece: food.defaultGrams,
    bowl: 250,
    plate: 300,
  }[unit];

  return amount * (unitWeight || food.defaultGrams);
}

function inferMealType(text: string): MealType {
  for (const [mealType, hints] of MEAL_TYPE_HINTS) {
    if (hints.some((hint) => text.includes(hint))) return mealType;
  }
  return "Lunch";
}

export function sanitizeMealAnalysis(raw: Partial<MealAnalysis> & Record<string, unknown>, fallback: Partial<MealAnalysis> = {}): MealAnalysis {
  const calories = clamp(roundInt(Number(raw.calories ?? fallback.calories ?? 0)), 0, 5000);
  const protein = clamp(roundInt(Number(raw.protein ?? fallback.protein ?? 0)), 0, 400);
  const carbs = clamp(roundInt(Number(raw.carbs ?? fallback.carbs ?? 0)), 0, 600);
  const fat = clamp(roundInt(Number(raw.fat ?? fallback.fat ?? 0)), 0, 250);

  const foods = Array.isArray(raw.foods)
    ? raw.foods.map((food) => String(food || "").trim()).filter(Boolean).slice(0, 8)
    : Array.isArray(fallback.foods)
      ? fallback.foods.slice(0, 8)
      : [];

  const mealTypeRaw = String(raw.mealType || fallback.mealType || inferMealType(`${raw.name || ""} ${foods.join(" ")}`)).trim();
  const mealType = ["Breakfast", "Lunch", "Dinner", "Snack"].includes(mealTypeRaw)
    ? (mealTypeRaw as MealType)
    : inferMealType(`${raw.name || ""} ${foods.join(" ")}`);

  const normalized: MealAnalysis = {
    name: String(raw.name || fallback.name || foods[0] || GENERIC_FALLBACK.name).trim().slice(0, 120),
    calories,
    protein,
    carbs,
    fat,
    foods: foods.length > 0 ? foods : (fallback.foods || GENERIC_FALLBACK.foods),
    servingSize: String(raw.servingSize || raw.serving_size || fallback.servingSize || GENERIC_FALLBACK.servingSize).trim().slice(0, 80),
    summary: String(raw.summary || fallback.summary || GENERIC_FALLBACK.summary).trim().slice(0, 240),
    mealType,
  };

  if (!normalized.name) normalized.name = normalized.foods[0] || GENERIC_FALLBACK.name;
  if (!normalized.summary) normalized.summary = GENERIC_FALLBACK.summary;
  if (!normalized.servingSize) normalized.servingSize = GENERIC_FALLBACK.servingSize;
  return normalized;
}

export function estimateMealFromDescription(description: string): MealAnalysis {
  const { normalizedText } = normalizeMealDescription(description);
  const segments = normalizedText.split(/[|,]/).map((segment) => segment.trim()).filter(Boolean);

  const totals = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  };
  const foods: string[] = [];

  for (const segment of segments) {
    const food = FOODS.find((candidate) => segment.includes(candidate.name));
    if (!food) continue;

    const grams = parseQuantity(segment, food);
    const factor = grams / 100;
    totals.calories += food.per100g.calories * factor;
    totals.protein += food.per100g.protein * factor;
    totals.carbs += food.per100g.carbs * factor;
    totals.fat += food.per100g.fat * factor;
    foods.push(food.name);
  }

  if (foods.length === 0) {
    const fallback = { ...GENERIC_FALLBACK };
    fallback.mealType = inferMealType(normalizedText);
    fallback.summary = "Approximate fallback estimate generated from multilingual text normalization because AI analysis was unavailable.";
    return fallback;
  }

  const servingSize = `${foods.length} item${foods.length > 1 ? "s" : ""}`;
  const mealType = inferMealType(normalizedText);
  const name = foods.length === 1 ? foods[0] : `${foods[0]} meal`;

  return sanitizeMealAnalysis({
    name,
    calories: totals.calories,
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat,
    foods: Array.from(new Set(foods)),
    servingSize,
    summary: "Approximate fallback estimate generated from normalized multilingual text input.",
    mealType,
  }, GENERIC_FALLBACK);
}

export function buildGenericMealFallback(message = "Approximate fallback estimate used because AI analysis was unavailable."): MealAnalysis {
  return sanitizeMealAnalysis({
    ...GENERIC_FALLBACK,
    summary: message,
  }, GENERIC_FALLBACK);
}

export function buildCanonicalMealJsonInstructions() {
  return [
    "Return ONLY one raw JSON object.",
    "No markdown.",
    "No code fences.",
    "No explanation.",
    "Use English JSON keys and canonical English food names inside foods[].",
    "Convert mixed Arabic / Russian / English quantities into the JSON result.",
    "Accept grams, cups, spoons, pieces, bowls, and plates.",
    "Output schema exactly:",
    '{"name":"string","calories":number,"protein":number,"carbs":number,"fat":number,"foods":["string"],"servingSize":"string","summary":"string","mealType":"Breakfast|Lunch|Dinner|Snack"}',
  ].join("\n");
}
