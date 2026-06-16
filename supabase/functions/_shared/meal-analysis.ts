/**
 * FitLife Multilingual Meal Analysis Helper
 * ----------------------------------------------------------------------------
 * Production-grade extractor for multilingual meal descriptions.
 *
 * Pipeline:
 *   raw user text
 *     -> normalize digits (Arabic-Indic, Persian, decimal commas)
 *     -> normalize units (g, kg, ml, cup, tbsp, tsp, piece, bowl, plate, sandwich)
 *     -> segment on line breaks, commas, plus signs, and language-aware separators
 *     -> for EACH segment: greedy multi-match against the multilingual dictionary
 *     -> attach a quantity to each matched food (default if absent)
 *     -> compute nutrition deterministically from per-100g/per-unit tables
 *     -> aggregate, validate, and produce a canonical English JSON result
 *
 * Goals:
 *   - Arabic + English + Russian + mixed-language input must all work
 *   - NEVER drop foods. Detected foods count must equal extracted foods count.
 *   - When the AI provider fails, the local engine alone must still produce a
 *     usable, accurate result for the user.
 */

// ─── Public Types ───────────────────────────────────────────────────────────

export type MealType = "Breakfast" | "Lunch" | "Dinner" | "Snack";

export interface MealAnalysis {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  foods: string[];
  servingSize: string;
  summary: string;
  mealType: MealType;
}

export interface DebugTrace {
  rawInput: string;
  normalizedInput: string;
  segments: string[];
  extractedFoods: ExtractedFood[];
  matchedCount: number;
  totals: { calories: number; protein: number; carbs: number; fat: number };
}

interface ExtractedFood {
  canonical: string;
  display: string;
  grams: number;
  source: "explicit" | "default" | "unit";
  segment: string;
}

interface NutritionPer100g {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface UnitWeights {
  g?: number;
  kg?: number;
  ml?: number;
  cup?: number;
  tbsp?: number;
  tsp?: number;
  piece?: number;
  bowl?: number;
  plate?: number;
  sandwich?: number;
  slice?: number;
}

interface FoodDef {
  canonical: string;          // canonical English name (used in foods[])
  displayName?: string;       // human-friendly variant (optional)
  per100g: NutritionPer100g;
  aliases: string[];          // multilingual aliases, longest first wins
  defaultGrams: number;       // when no quantity provided
  unitWeights?: UnitWeights;  // grams per unit
}

// ─── Constants ──────────────────────────────────────────────────────────────

const EASTERN_ARABIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

// Unit aliases - mapped to canonical lowercase tokens we use later.
// IMPORTANT: order matters; longer/specific aliases first.
const UNIT_ALIASES: Array<[RegExp, string]> = [
  [/\bkilograms?\b|\bkilogrammes?\b|\bkgs?\b|كيلو\s*جرام|كيلو\s*غرام|كيلوجرام|كيلوغرام|كيلو\b|кг\b|килограмм(?:а|ов)?/giu, " kg "],
  [/\bmillilit(?:er|re)s?\b|\bmls?\b|مليلتر|مللتر|مل\b|мл\b|миллилитр(?:а|ов)?/giu, " ml "],
  [/\bgrams?\b|\bgramme?s?\b|\bgr\b|\bg\b|جرامات|جرام|غرامات|غرام|غم\b|غ\b|грамм(?:ов|а)?|гр\b|г\b/giu, " g "],
  [/\btablespoons?\b|\btbsps?\b|ملعقة\s*كبيرة|ملاعق\s*كبيرة|столов(?:ая|ые|ую)?\s*ложк(?:а|и|у|е|ой)/giu, " tbsp "],
  [/\bteaspoons?\b|\btsps?\b|ملعقة\s*صغيرة|ملاعق\s*صغيرة|чайн(?:ая|ые|ую)?\s*ложк(?:а|и|у|е|ой)/giu, " tsp "],
  [/\bsandwich(?:es)?\b|ساندوتش(?:ات)?|ساندويتش(?:ات)?|сэндвич(?:ей|и|а)?/giu, " sandwich "],
  [/\bslices?\b|شريحة|شرائح|кусочек|ломтик(?:а|ов)?/giu, " slice "],
  [/\bcups?\b|كوب|أكواب|اكواب|чашк(?:а|и|у|е|ой)/giu, " cup "],
  [/\bbowls?\b|وعاء|زبدية|أوعية|миск(?:а|и|у|е|ой)/giu, " bowl "],
  [/\bplates?\b|طبق|أطباق|тарелк(?:а|и|у|е|ой)/giu, " plate "],
  [/\bpieces?\b|\bpcs?\b|قطعة|قطع|حبة|حبات|штук(?:а|и|у)?|кусок|кусочка/giu, " piece "],
  [/\bloaf\b|\bloaves\b|رغيف|أرغفة|буханк(?:а|и)/giu, " piece "],
];

// Multilingual food dictionary. Aliases are matched case-insensitively against
// the normalized text. Longer/more specific aliases are checked first to avoid
// "بطاطس مهروسة" being eaten by "بطاطس".
const FOODS: FoodDef[] = [
  // ── Compound / sandwich-style items first so they win greedy matching ────
  {
    canonical: "beef kofta sandwich",
    per100g: { calories: 245, protein: 14, carbs: 22, fat: 12 },
    aliases: [
      "beef kofta sandwich", "kofta sandwich",
      "ساندوتش كفتة بقري", "ساندوتش كفتة لحم", "ساندوتش كفتة", "ساندويتش كفتة",
      "ساندوتش فيه كفتة", "ساندوتش بكفتة",
      "сэндвич с говяжьей кюфтой", "сэндвич с кюфтой", "сэндвич с кефтой",
    ],
    defaultGrams: 220,
    unitWeights: { sandwich: 220, piece: 220 },
  },
  {
    canonical: "chicken sandwich",
    per100g: { calories: 230, protein: 16, carbs: 23, fat: 8 },
    aliases: [
      "chicken sandwich", "ساندوتش دجاج", "ساندوتش فراخ", "ساندويتش دجاج",
      "сэндвич с курицей", "сэндвич с куриным",
    ],
    defaultGrams: 200,
    unitWeights: { sandwich: 200, piece: 200 },
  },
  {
    canonical: "beef kofta",
    per100g: { calories: 280, protein: 18, carbs: 4, fat: 22 },
    aliases: [
      "beef kofta", "kofta", "kefta",
      "كفتة بقري", "كفتة لحم", "كفتة لحمة", "كفتة",
      "صباع كفتة", "أصابع كفتة",
      "говяжья кюфта", "кюфта говяжья", "кюфта", "кефта",
    ],
    defaultGrams: 120,
    unitWeights: { piece: 60, sandwich: 220 },
  },
  {
    canonical: "mashed potatoes",
    per100g: { calories: 88, protein: 1.9, carbs: 17, fat: 1.5 },
    aliases: [
      "mashed potatoes", "mashed potato", "potato puree", "potatoe puree",
      "بطاطس مهروسة", "بطاطا مهروسة", "بطاطس مهروسه", "هريسة بطاطس", "بيوريه بطاطس",
      "картофельное пюре", "пюре картофельное", "картошка пюре", "пюре из картофеля",
    ],
    defaultGrams: 150,
    unitWeights: { cup: 210, bowl: 220, plate: 250, piece: 150 },
  },
  {
    canonical: "french fries",
    per100g: { calories: 312, protein: 3.4, carbs: 41, fat: 15 },
    aliases: [
      "french fries", "fries", "chips",
      "بطاطس مقلية", "بطاطا مقلية", "بطاطس محمرة",
      "картофель фри", "картошка фри", "фри",
    ],
    defaultGrams: 120,
    unitWeights: { plate: 180, bowl: 150, cup: 120 },
  },
  // ── Staples ─────────────────────────────────────────────────────────────
  {
    canonical: "chicken breast",
    per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
    aliases: [
      "chicken breast", "chicken", "grilled chicken",
      "دجاج مشوي", "صدر دجاج", "صدور دجاج", "دجاج", "فراخ مشوية", "فراخ",
      "куриная грудка", "грудка куриная", "курица гриль", "курица",
    ],
    defaultGrams: 150,
    unitWeights: { piece: 140, plate: 200, bowl: 180 },
  },
  {
    canonical: "rice",
    per100g: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
    aliases: [
      "white rice", "rice",
      "أرز أبيض", "ارز ابيض", "رز ابيض", "أرز", "ارز", "رز",
      "белый рис", "рис",
    ],
    defaultGrams: 150,
    unitWeights: { cup: 158, bowl: 180, plate: 220 },
  },
  {
    canonical: "bread",
    per100g: { calories: 265, protein: 9, carbs: 49, fat: 3.2 },
    aliases: [
      "white bread", "bread", "toast", "pita", "pita bread",
      "خبز أبيض", "خبز ابيض", "خبز", "عيش بلدي", "عيش شامي", "عيش", "رغيف",
      "хлеб белый", "хлеб", "тост", "лаваш",
    ],
    defaultGrams: 60,
    unitWeights: { piece: 90, slice: 30 },
  },
  {
    canonical: "egg",
    per100g: { calories: 143, protein: 12.6, carbs: 1.1, fat: 9.5 },
    aliases: [
      "boiled egg", "fried egg", "scrambled eggs", "scrambled egg",
      "eggs", "egg",
      "بيض مسلوق", "بيض مقلي", "بيضة", "بيض",
      "варёные яйца", "вареные яйца", "жареные яйца", "яйца", "яйцо",
    ],
    defaultGrams: 50,
    unitWeights: { piece: 50 },
  },
  {
    canonical: "banana",
    per100g: { calories: 89, protein: 1.1, carbs: 23, fat: 0.3 },
    aliases: ["banana", "bananas", "موز", "موزة", "банан", "бананы"],
    defaultGrams: 120,
    unitWeights: { piece: 120 },
  },
  {
    canonical: "apple",
    per100g: { calories: 52, protein: 0.3, carbs: 14, fat: 0.2 },
    aliases: ["apple", "apples", "تفاحة", "تفاح", "яблоко", "яблоки"],
    defaultGrams: 150,
    unitWeights: { piece: 150 },
  },
  {
    canonical: "beef",
    per100g: { calories: 217, protein: 26, carbs: 0, fat: 12 },
    aliases: [
      "beef", "steak", "ground beef", "lean beef",
      "لحم بقري", "لحمة بقري", "ستيك", "لحم",
      "говядина", "говяжий", "стейк",
    ],
    defaultGrams: 150,
    unitWeights: { piece: 150, plate: 200 },
  },
  {
    canonical: "beef patty",
    per100g: { calories: 250, protein: 17, carbs: 3, fat: 19 },
    aliases: [
      "beef patty", "burger patty", "patty",
      "قرص لحم", "كبدة قرص", "كبسة قرص",
      "котлета говяжья", "котлета", "котлеты",
    ],
    defaultGrams: 110,
    unitWeights: { piece: 110 },
  },
  {
    canonical: "salmon",
    per100g: { calories: 208, protein: 20, carbs: 0, fat: 13 },
    aliases: ["salmon", "سلمون", "سمك سلمون", "сёмга", "семга", "лосось"],
    defaultGrams: 150,
    unitWeights: { piece: 150, plate: 180 },
  },
  {
    canonical: "potato",
    per100g: { calories: 87, protein: 1.9, carbs: 20, fat: 0.1 },
    aliases: [
      "boiled potatoes", "potato", "potatoes",
      "بطاطس مسلوقة", "بطاطس", "بطاطا",
      "картофель варёный", "картофель", "картошка",
    ],
    defaultGrams: 180,
    unitWeights: { piece: 170, plate: 220 },
  },
  {
    canonical: "oats",
    per100g: { calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9 },
    aliases: ["oats", "oatmeal", "rolled oats", "شوفان", "овсянка", "овёс", "овес"],
    defaultGrams: 60,
    unitWeights: { cup: 80, bowl: 80 },
  },
  {
    canonical: "milk",
    per100g: { calories: 61, protein: 3.2, carbs: 4.8, fat: 3.3 },
    aliases: ["milk", "حليب", "لبن", "молоко"],
    defaultGrams: 240,
    unitWeights: { cup: 240, ml: 1 },
  },
  {
    canonical: "yogurt",
    per100g: { calories: 59, protein: 10, carbs: 3.6, fat: 0.4 },
    aliases: ["greek yogurt", "yogurt", "yoghurt", "زبادي يوناني", "زبادي", "йогурт"],
    defaultGrams: 170,
    unitWeights: { cup: 245, bowl: 180 },
  },
  {
    canonical: "cheese",
    per100g: { calories: 402, protein: 25, carbs: 1.3, fat: 33 },
    aliases: ["cheese", "feta", "جبنة بيضاء", "جبنة", "جبن", "сыр"],
    defaultGrams: 30,
    unitWeights: { piece: 30, slice: 20 },
  },
  {
    canonical: "olive oil",
    per100g: { calories: 884, protein: 0, carbs: 0, fat: 100 },
    aliases: ["olive oil", "oil", "زيت زيتون", "زيت", "оливковое масло", "масло"],
    defaultGrams: 14,
    unitWeights: { tbsp: 14, tsp: 5 },
  },
  {
    canonical: "pasta",
    per100g: { calories: 157, protein: 5.8, carbs: 30.9, fat: 0.9 },
    aliases: ["pasta", "macaroni", "spaghetti", "مكرونة", "باستا", "паста", "макароны", "спагетти"],
    defaultGrams: 180,
    unitWeights: { cup: 140, bowl: 180, plate: 220 },
  },
  {
    canonical: "lentils",
    per100g: { calories: 116, protein: 9, carbs: 20, fat: 0.4 },
    aliases: ["lentils", "lentil soup", "عدس", "شوربة عدس", "чечевица"],
    defaultGrams: 180,
    unitWeights: { cup: 198, bowl: 200 },
  },
  {
    canonical: "beans",
    per100g: { calories: 127, protein: 8.7, carbs: 22.8, fat: 0.5 },
    aliases: ["beans", "white beans", "kidney beans", "فول", "فاصوليا", "لوبيا", "фасоль", "бобы"],
    defaultGrams: 180,
    unitWeights: { cup: 177, bowl: 190 },
  },
  {
    canonical: "nuts",
    per100g: { calories: 607, protein: 20, carbs: 21, fat: 54 },
    aliases: ["nuts", "almonds", "mixed nuts", "مكسرات", "لوز", "орехи", "миндаль"],
    defaultGrams: 30,
    unitWeights: { tbsp: 10, piece: 5 },
  },
  {
    canonical: "dates",
    per100g: { calories: 282, protein: 2.5, carbs: 75, fat: 0.4 },
    aliases: ["dates", "date", "تمر", "تمور", "بلح", "финики", "финик"],
    defaultGrams: 24,
    unitWeights: { piece: 24 },
  },
  {
    canonical: "cucumber",
    per100g: { calories: 15, protein: 0.7, carbs: 3.6, fat: 0.1 },
    aliases: ["cucumber", "خيار", "огурец"],
    defaultGrams: 100,
    unitWeights: { piece: 200 },
  },
  {
    canonical: "tomato",
    per100g: { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2 },
    aliases: ["tomato", "tomatoes", "طماطم", "بندورة", "помидор", "томаты"],
    defaultGrams: 100,
    unitWeights: { piece: 120 },
  },
  {
    canonical: "salad",
    per100g: { calories: 35, protein: 1.5, carbs: 5, fat: 1.2 },
    aliases: ["green salad", "mixed salad", "salad", "سلطة خضراء", "سلطة", "салат"],
    defaultGrams: 150,
    unitWeights: { bowl: 200, plate: 220, cup: 100 },
  },
];

const MEAL_TYPE_HINTS: Array<[MealType, string[]]> = [
  ["Breakfast", ["breakfast", "morning", "فطور", "افطار", "إفطار", "завтрак", "oats", "egg"]],
  ["Lunch", ["lunch", "غداء", "обед", "rice", "chicken breast", "beef"]],
  ["Dinner", ["dinner", "supper", "عشاء", "ужин", "salmon", "pasta"]],
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
  summary: "Approximate fallback estimate used because no recognizable foods were extracted.",
  mealType: "Lunch",
};

// ─── Small helpers ──────────────────────────────────────────────────────────

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
    .replace(/[٫]/g, ".")
    .replace(/(?<=\d),(?=\d)/g, ".");
}

// ─── Language detection ─────────────────────────────────────────────────────

export function detectLanguage(value: string): "ar" | "ru" | "en" {
  if (/[\u0600-\u06FF]/u.test(value)) return "ar";
  if (/[\u0400-\u04FF]/u.test(value)) return "ru";
  return "en";
}

// ─── Normalization (digits + units only — NO destructive food rename here) ──

export function normalizeMealDescription(input: string) {
  let text = normalizeNumericText(String(input || "")).toLowerCase();
  for (const [pattern, replacement] of UNIT_ALIASES) {
    text = text.replace(pattern, replacement);
  }

  // Collapse whitespace, preserve line break as a strong separator (we use ;)
  text = text
    .replace(/[()]/g, " ")
    .replace(/[\r\n]+/g, " ; ")
    .replace(/\s*\+\s*/g, " ; ")
    .replace(/[،,]+/g, " ; ")
    .replace(/\s+(?:and|with|plus|و|مع|и|с)\s+/giu, " ; ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    language: detectLanguage(input),
    normalizedText: text,
  };
}

// ─── Multi-food extraction with quantity per food ──────────────────────────

const FOOD_INDEX: Array<{ alias: string; pattern: RegExp; def: FoodDef }> = (() => {
  const list: Array<{ alias: string; pattern: RegExp; def: FoodDef }> = [];
  for (const def of FOODS) {
    // Always include canonical itself as a matchable alias.
    const seenAliases = new Set<string>();
    const all = [def.canonical, ...def.aliases];
    for (const alias of all) {
      const lower = String(alias || "").toLowerCase().trim();
      if (!lower || seenAliases.has(lower)) continue;
      seenAliases.add(lower);
      // Use a simple substring pattern; multi-word aliases are matched as phrases.
      list.push({
        alias: lower,
        pattern: new RegExp(escapeRegExp(lower), "iu"),
        def,
      });
    }
  }
  // Longest aliases first so "mashed potatoes" wins over "potato",
  // and "beef kofta sandwich" wins over "kofta" / "sandwich" alone.
  list.sort((a, b) => b.alias.length - a.alias.length);
  return list;
})();

function parseQuantity(segment: string, food: FoodDef): { grams: number; source: ExtractedFood["source"] } {
  // Look for "<number><unit>" or "<number> <unit>" anywhere in the segment.
  const m = segment.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|cup|tbsp|tsp|piece|bowl|plate|sandwich|slice)\b/u);
  if (m) {
    const amount = Number(m[1]);
    const unit = m[2] as keyof UnitWeights;
    if (Number.isFinite(amount) && amount > 0) {
      if (unit === "g") return { grams: amount, source: "explicit" };
      if (unit === "kg") return { grams: amount * 1000, source: "explicit" };
      if (unit === "ml") return { grams: amount * (food.unitWeights?.ml || 1), source: "explicit" };
      const unitWeight = food.unitWeights?.[unit] ?? {
        cup: 240, tbsp: 15, tsp: 5, piece: food.defaultGrams,
        bowl: 250, plate: 300, sandwich: 200, slice: 30,
      }[unit];
      return { grams: amount * (unitWeight || food.defaultGrams), source: "unit" };
    }
  }
  // Bare-number quantity at start: "2 eggs" -> 2 * piece weight
  const bare = segment.match(/^\s*(\d+(?:\.\d+)?)\s+/u);
  if (bare) {
    const amount = Number(bare[1]);
    if (Number.isFinite(amount) && amount > 0) {
      const perPiece = food.unitWeights?.piece || food.defaultGrams;
      return { grams: amount * perPiece, source: "unit" };
    }
  }
  return { grams: food.defaultGrams, source: "default" };
}

function inferMealType(text: string): MealType {
  for (const [mealType, hints] of MEAL_TYPE_HINTS) {
    if (hints.some((hint) => text.includes(hint))) return mealType;
  }
  return "Lunch";
}

/**
 * Extract every food mentioned in the description. Within a single segment,
 * multiple distinct foods are allowed (e.g. "120g mashed potatoes 2 eggs bread").
 * After a food is matched, its alias text is masked so it cannot match again
 * but other distinct foods in the same segment still can.
 */
export function extractFoods(description: string): { segments: string[]; foods: ExtractedFood[]; normalizedText: string; language: "ar" | "ru" | "en" } {
  const { normalizedText, language } = normalizeMealDescription(description);

  const segments = normalizedText
    .split(/[;|]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const extracted: ExtractedFood[] = [];

  for (const rawSegment of segments) {
    let workingSegment = ` ${rawSegment} `;
    let matchedInSegment = 0;

    // Greedy multi-match loop within the segment.
    while (true) {
      let bestMatch: { entry: typeof FOOD_INDEX[number]; index: number } | null = null;

      for (const entry of FOOD_INDEX) {
        const idx = workingSegment.toLowerCase().indexOf(entry.alias);
        if (idx === -1) continue;
        if (!bestMatch || entry.alias.length > bestMatch.entry.alias.length) {
          bestMatch = { entry, index: idx };
        }
      }

      if (!bestMatch) break;

      // Use the chunk of segment around the match to determine quantity.
      // We pass the FULL rawSegment so leading "120g" or "2 " still applies
      // when the food appears later in the string.
      const { grams, source } = parseQuantity(rawSegment, bestMatch.entry.def);

      extracted.push({
        canonical: bestMatch.entry.def.canonical,
        display: bestMatch.entry.def.displayName || bestMatch.entry.def.canonical,
        grams,
        source,
        segment: rawSegment,
      });
      matchedInSegment += 1;

      // Mask the matched alias so we don't re-match it; replace with spaces.
      const start = workingSegment.toLowerCase().indexOf(bestMatch.entry.alias);
      const end = start + bestMatch.entry.alias.length;
      workingSegment =
        workingSegment.slice(0, start) +
        " ".repeat(end - start) +
        workingSegment.slice(end);

      // Safety cap to avoid infinite loops in pathological inputs.
      if (matchedInSegment > 8) break;
    }
  }

  return { segments, foods: extracted, normalizedText, language };
}

// ─── Deterministic nutrition calculator ─────────────────────────────────────

function buildLocalMealAnalysis(extracted: ExtractedFood[], normalizedText: string): MealAnalysis {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const orderedFoods: string[] = [];

  for (const food of extracted) {
    const def = FOODS.find((f) => f.canonical === food.canonical);
    if (!def) continue;
    const factor = food.grams / 100;
    totals.calories += def.per100g.calories * factor;
    totals.protein += def.per100g.protein * factor;
    totals.carbs += def.per100g.carbs * factor;
    totals.fat += def.per100g.fat * factor;
    if (!orderedFoods.includes(def.canonical)) orderedFoods.push(def.canonical);
  }

  if (orderedFoods.length === 0) {
    return {
      ...GENERIC_FALLBACK,
      mealType: inferMealType(normalizedText),
    };
  }

  const headline = orderedFoods.length === 1
    ? orderedFoods[0]
    : `${orderedFoods[0]} meal (+${orderedFoods.length - 1})`;

  return {
    name: headline,
    calories: clamp(roundInt(totals.calories), 0, 6000),
    protein: clamp(roundInt(totals.protein), 0, 500),
    carbs: clamp(roundInt(totals.carbs), 0, 700),
    fat: clamp(roundInt(totals.fat), 0, 300),
    foods: orderedFoods,
    servingSize: `${orderedFoods.length} item${orderedFoods.length > 1 ? "s" : ""}`,
    summary: `Local deterministic estimate for ${orderedFoods.length} detected food${orderedFoods.length > 1 ? "s" : ""}.`,
    mealType: inferMealType(normalizedText),
  };
}

export function estimateMealFromDescription(description: string): MealAnalysis {
  const { foods, normalizedText } = extractFoods(description);
  return buildLocalMealAnalysis(foods, normalizedText);
}

export function debugExtract(description: string): DebugTrace {
  const { segments, foods, normalizedText } = extractFoods(description);
  const analysis = buildLocalMealAnalysis(foods, normalizedText);
  return {
    rawInput: description,
    normalizedInput: normalizedText,
    segments,
    extractedFoods: foods,
    matchedCount: foods.length,
    totals: {
      calories: analysis.calories,
      protein: analysis.protein,
      carbs: analysis.carbs,
      fat: analysis.fat,
    },
  };
}

// ─── Validation + sanitization for AI-returned payloads ─────────────────────

function ensureNonNegative(value: any, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return clamp(roundInt(n), 0, max);
}

function asStringArray(value: any, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Sanitize an AI meal payload. If the AI dropped foods that the local
 * extractor found, we union them back in and recompute totals locally.
 */
export function sanitizeMealAnalysis(
  raw: Partial<MealAnalysis> & Record<string, unknown>,
  fallback: Partial<MealAnalysis> = {},
  options: { description?: string } = {},
): MealAnalysis {
  const expectedFromLocal = options.description ? extractFoods(options.description).foods : [];
  const expectedCanonicals = Array.from(new Set(expectedFromLocal.map((f) => f.canonical)));

  const aiFoods = asStringArray(raw.foods, 12);
  const aiFoodsLower = aiFoods.map((f) => f.toLowerCase());

  // If local extracted more foods than AI returned, REPAIR by unioning.
  const missingFromAI = expectedCanonicals.filter(
    (c) => !aiFoodsLower.some((f) => f.includes(c) || c.includes(f)),
  );
  if (missingFromAI.length > 0) {
    console.warn("[FitLife:meal-analysis] AI dropped foods; auto-repairing", {
      ai: aiFoods,
      local: expectedCanonicals,
      missing: missingFromAI,
    });
  }

  const unionFoods = Array.from(new Set([...expectedCanonicals, ...aiFoods.map((f) => f.toLowerCase())]));

  // If AI numbers look reasonable AND no foods are missing, keep AI numbers.
  let calories = ensureNonNegative(raw.calories ?? fallback.calories, 6000);
  let protein = ensureNonNegative(raw.protein ?? fallback.protein, 500);
  let carbs = ensureNonNegative(raw.carbs ?? fallback.carbs, 700);
  let fat = ensureNonNegative(raw.fat ?? fallback.fat, 300);

  const aiSeemsTooLow = expectedCanonicals.length >= 2 && calories > 0 && calories < (expectedCanonicals.length * 80);
  const shouldRecompute = missingFromAI.length > 0 || aiSeemsTooLow || calories <= 0;

  if (shouldRecompute && expectedFromLocal.length > 0) {
    const local = buildLocalMealAnalysis(expectedFromLocal, options.description || "");
    calories = local.calories;
    protein = local.protein;
    carbs = local.carbs;
    fat = local.fat;
  }

  const mealTypeRaw = String(raw.mealType || fallback.mealType || "").trim();
  const mealType = (["Breakfast", "Lunch", "Dinner", "Snack"] as MealType[]).includes(mealTypeRaw as MealType)
    ? (mealTypeRaw as MealType)
    : inferMealType((options.description || "").toLowerCase());

  const finalFoods = unionFoods.length > 0
    ? unionFoods
    : asStringArray(fallback.foods, 12);

  const safeFoods = finalFoods.length > 0 ? finalFoods : GENERIC_FALLBACK.foods;
  const name = String(raw.name || fallback.name || safeFoods[0] || GENERIC_FALLBACK.name)
    .trim()
    .slice(0, 120);

  return {
    name: name || GENERIC_FALLBACK.name,
    calories,
    protein,
    carbs,
    fat,
    foods: safeFoods,
    servingSize: String(raw.servingSize || (raw as any).serving_size || fallback.servingSize || `${safeFoods.length} item${safeFoods.length > 1 ? "s" : ""}`)
      .trim()
      .slice(0, 80),
    summary: String(raw.summary || fallback.summary || `Estimate for ${safeFoods.length} detected food${safeFoods.length > 1 ? "s" : ""}.`)
      .trim()
      .slice(0, 240),
    mealType,
  };
}

export function buildGenericMealFallback(message = "Approximate fallback estimate used because AI analysis was unavailable."): MealAnalysis {
  return { ...GENERIC_FALLBACK, summary: message };
}

export function buildCanonicalMealJsonInstructions() {
  return [
    "Return ONLY one raw JSON object.",
    "No markdown.",
    "No code fences.",
    "No explanation.",
    "Use English JSON keys and canonical English food names inside foods[].",
    "Convert mixed Arabic / Russian / English quantities into the JSON result.",
    "Accept grams, kilograms, milliliters, cups, spoons, pieces, slices, bowls, plates, and sandwiches.",
    'Schema: {"name":"string","calories":number,"protein":number,"carbs":number,"fat":number,"foods":["string"],"servingSize":"string","summary":"string","mealType":"Breakfast|Lunch|Dinner|Snack"}',
    "If the user mentions multiple foods on separate lines, every line is a distinct food. Never drop any.",
    "The foods array must contain every food mentioned in the input.",
  ].join("\n");
}
