/**
 * Edge Function: AI Text Meal Analysis (Multilingual + Multi-Food)
 * POST /functions/v1/ai-analyze-text
 * Body: { description: string }
 * Returns: { success, data: MealAnalysis, provider, fallback_used, detected_language, debug }
 *
 * Pipeline:
 *   1) Validate + sanitize description
 *   2) Run local multilingual extractor (extractFoods)
 *      - guarantees every detected food is preserved, regardless of language
 *   3) Build strict-JSON prompt for Gemini that includes the local food list
 *   4) Call Gemini with retry/backoff; fall back to OpenRouter on retryable errors
 *   5) Sanitize + auto-repair the AI payload using the local food list as ground truth
 *   6) If everything fails, return the deterministic local estimate
 *   7) Always return:  Detected Foods count >= local extracted count
 *
 * No food is ever silently dropped.
 */
import { handleCors, jsonOk, jsonError } from "../_shared/cors.ts";
import { generateTextJson, LANGUAGE_INSTRUCTION } from "../_shared/gemini.ts";
import {
  buildCanonicalMealJsonInstructions,
  estimateMealFromDescription,
  extractFoods,
  normalizeMealDescription,
  sanitizeMealAnalysis,
} from "../_shared/meal-analysis.ts";

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (req.method !== "POST") return jsonError(405, "Method not allowed");

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("[ai-analyze-text] GEMINI_API_KEY not set");
    return jsonError(500, "AI service not configured", "CONFIG_ERROR");
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body", "INVALID_JSON");
  }

  const description = String(body?.description || "").trim();
  if (!description) {
    return jsonError(400, "Missing meal description", "INVALID_PAYLOAD");
  }

  // Basic prompt-injection scrub + length cap.
  const sanitizedDescription = description
    .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, "[filtered]")
    .replace(/system\s*:\s*/gi, "[filtered]")
    .slice(0, 2500)
    .trim();

  if (sanitizedDescription.length < 3) {
    return jsonError(400, "Description too short", "INVALID_PAYLOAD");
  }

  // Step 1+2: deterministic local extraction. This is the ground truth.
  const normalized = normalizeMealDescription(sanitizedDescription);
  const extraction = extractFoods(sanitizedDescription);
  const localEstimate = estimateMealFromDescription(sanitizedDescription);

  const localFoodList = Array.from(new Set(extraction.foods.map((f) => f.canonical)));

  console.info("[ai-analyze-text] pipeline", {
    detected_language: normalized.language,
    normalized_input: normalized.normalizedText,
    segments: extraction.segments,
    extracted_count: extraction.foods.length,
    local_foods: localFoodList,
    local_totals: {
      calories: localEstimate.calories,
      protein: localEstimate.protein,
      carbs: localEstimate.carbs,
      fat: localEstimate.fat,
    },
  });

  // Step 3: prompt with the local food list bound in so the AI MUST cover every item.
  const promptParts = [
    "You are a production nutrition analysis engine.",
    LANGUAGE_INSTRUCTION,
    buildCanonicalMealJsonInstructions(),
    "Each line or comma-separated item in the user's description is a distinct food.",
    "You MUST include every distinct food in the foods[] array.",
    "Use canonical English food names.",
    localFoodList.length > 0
      ? `The deterministic extractor identified these foods: ${localFoodList.join(", ")}. Your foods[] array MUST include all of them.`
      : "If the input contains multiple lines, treat every line as a separate food.",
    "Original user description:",
    sanitizedDescription,
    "Normalized helper text:",
    normalized.normalizedText,
  ];
  const prompt = promptParts.join("\n\n");

  let provider: "gemini" | "openrouter" | "fallback" = "fallback";
  let fallbackUsed = false;
  let aiResult: any = null;

  try {
    const result = await generateTextJson(
      apiKey,
      [{ role: "user", parts: [{ text: prompt }] }],
      {
        context: "ai-analyze-text",
        maxTokens: 1200,
        temperature: 0.2,
        repairPrompt:
          `${buildCanonicalMealJsonInstructions()}\nThe foods[] array must include every distinct food the user mentioned. Return the same answer again as strict raw JSON only.`,
        fallbackValue: localEstimate,
      },
    );
    aiResult = result.data;
    provider = result.provider as "gemini" | "openrouter";
    fallbackUsed = result.fallbackUsed === true;
  } catch (err: any) {
    console.error("[ai-analyze-text] AI providers exhausted, using local estimate", {
      message: err?.message,
      status: err?.status || null,
      raw: String(err?.rawResponse || "").slice(0, 800),
      repaired: String(err?.repairedResponse || "").slice(0, 800),
    });
    aiResult = localEstimate;
    provider = "fallback";
    fallbackUsed = true;
  }

  // Step 5+6: sanitize + auto-repair against the local extractor.
  // sanitizeMealAnalysis will UNION foods and recompute totals if the AI dropped any.
  const safeData = sanitizeMealAnalysis(aiResult || {}, localEstimate, {
    description: sanitizedDescription,
  });

  // Final validation: never return zero calories when local extractor found foods.
  if (localFoodList.length > 0 && safeData.calories <= 0) {
    console.warn("[ai-analyze-text] AI returned zero calories; recomputing from local estimate");
    safeData.calories = localEstimate.calories;
    safeData.protein = localEstimate.protein;
    safeData.carbs = localEstimate.carbs;
    safeData.fat = localEstimate.fat;
  }

  // Step 7: hard guarantee — detected foods count >= extracted foods count.
  const detectedLower = safeData.foods.map((f) => f.toLowerCase());
  const missing = localFoodList.filter(
    (canon) => !detectedLower.some((f) => f.includes(canon) || canon.includes(f)),
  );
  if (missing.length > 0) {
    console.warn("[ai-analyze-text] union repair: re-adding dropped foods", {
      missing,
      before: safeData.foods,
    });
    safeData.foods = Array.from(new Set([...safeData.foods, ...missing]));
  }

  console.info("[ai-analyze-text] final", {
    provider,
    fallback_used: fallbackUsed,
    final_foods: safeData.foods,
    final_macros: {
      calories: safeData.calories,
      protein: safeData.protein,
      carbs: safeData.carbs,
      fat: safeData.fat,
    },
  });

  return jsonOk({
    success: true,
    data: safeData,
    provider,
    fallback_used: fallbackUsed,
    detected_language: normalized.language,
    debug: {
      normalized_input: normalized.normalizedText,
      segments: extraction.segments,
      extracted_foods: extraction.foods.map((f) => ({
        canonical: f.canonical,
        grams: Math.round(f.grams),
        source: f.source,
      })),
      local_estimate: {
        calories: localEstimate.calories,
        protein: localEstimate.protein,
        carbs: localEstimate.carbs,
        fat: localEstimate.fat,
      },
    },
  });
});
