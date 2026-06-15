/**
 * Edge Function: AI Text Meal Analysis
 * POST /functions/v1/ai-analyze-text
 * Body: { description: string }
 */
import { handleCors, jsonOk, jsonError } from "../_shared/cors.ts";
import { generateTextJson, LANGUAGE_INSTRUCTION } from "../_shared/gemini.ts";
import {
  buildCanonicalMealJsonInstructions,
  estimateMealFromDescription,
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

  const sanitizedDescription = description
    .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, "[filtered]")
    .replace(/system\s*:\s*/gi, "[filtered]")
    .slice(0, 2500)
    .trim();

  if (sanitizedDescription.length < 3) {
    return jsonError(400, "Description too short", "INVALID_PAYLOAD");
  }

  const normalized = normalizeMealDescription(sanitizedDescription);
  const fallbackEstimate = estimateMealFromDescription(sanitizedDescription);

  const prompt = [
    "You are a production nutrition analysis engine.",
    LANGUAGE_INSTRUCTION,
    buildCanonicalMealJsonInstructions(),
    "Use the user's quantity hints if present.",
    "If the user mixed Arabic, Russian, and English, normalize everything correctly.",
    "Do not output markdown or explanatory text.",
    "Original user description:",
    sanitizedDescription,
    "Normalized helper text:",
    normalized.normalizedText,
  ].join("\n\n");

  try {
    const result = await generateTextJson(apiKey, [{ role: "user", parts: [{ text: prompt }] }], {
      context: "ai-analyze-text",
      maxTokens: 900,
      temperature: 0.2,
      repairPrompt: `${buildCanonicalMealJsonInstructions()}\nReturn the same answer again as strict raw JSON only.`,
      fallbackValue: fallbackEstimate,
    });

    const safeData = sanitizeMealAnalysis(result.data, fallbackEstimate);
    return jsonOk({
      success: true,
      data: safeData,
      provider: result.provider,
      fallback_used: result.fallbackUsed === true,
      detected_language: normalized.language,
    });
  } catch (err: any) {
    console.error("[ai-analyze-text] fatal error", {
      message: err?.message,
      status: err?.status || null,
      raw: String(err?.rawResponse || "").slice(0, 1200),
      repaired: String(err?.repairedResponse || "").slice(0, 1200),
    });

    const safeFallback = sanitizeMealAnalysis(fallbackEstimate, fallbackEstimate);
    return jsonOk({
      success: true,
      data: safeFallback,
      provider: "fallback",
      fallback_used: true,
      detected_language: normalized.language,
    });
  }
});
