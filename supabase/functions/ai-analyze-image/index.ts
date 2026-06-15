/**
 * Edge Function: AI Image Meal Analysis
 * POST /functions/v1/ai-analyze-image
 * Body: { image: dataUri | rawBase64 }
 */
import { handleCors, jsonOk, jsonError } from "../_shared/cors.ts";
import { generateVisionJson, LANGUAGE_INSTRUCTION } from "../_shared/gemini.ts";
import {
  buildCanonicalMealJsonInstructions,
  buildGenericMealFallback,
  sanitizeMealAnalysis,
} from "../_shared/meal-analysis.ts";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (req.method !== "POST") return jsonError(405, "Method not allowed");

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("[ai-analyze-image] GEMINI_API_KEY not set");
    return jsonError(500, "AI service not configured", "CONFIG_ERROR");
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body", "INVALID_JSON");
  }

  const image = String(body?.image || "").trim();
  if (!image) return jsonError(400, "Missing image data", "INVALID_PAYLOAD");

  let imageData = image;
  let mimeType = "image/jpeg";
  const dataUriMatch = image.match(/^data:image\/(jpeg|png|webp|gif);base64,(.+)$/i);
  if (dataUriMatch) {
    mimeType = `image/${dataUriMatch[1].toLowerCase()}`;
    imageData = dataUriMatch[2];
  }

  if (imageData.length > MAX_IMAGE_SIZE) {
    return jsonError(400, "Image too large. Max 10MB.", "IMAGE_TOO_LARGE");
  }

  const fallbackEstimate = buildGenericMealFallback("Approximate fallback estimate used because image AI analysis was temporarily unavailable.");
  const prompt = [
    "You are a production nutrition vision analysis engine.",
    LANGUAGE_INSTRUCTION,
    buildCanonicalMealJsonInstructions(),
    "Identify the visible food items, estimate realistic serving sizes, and compute calories, protein, carbs, and fat.",
    "If the image is uncertain, return the most probable meal estimate rather than refusing.",
    "Use canonical English food names in foods[].",
  ].join("\n\n");

  try {
    const result = await generateVisionJson(apiKey, prompt, imageData, mimeType, {
      context: "ai-analyze-image",
      maxTokens: 900,
      temperature: 0.15,
      repairPrompt: `${buildCanonicalMealJsonInstructions()}\nReturn the same answer again as strict raw JSON only.`,
      fallbackValue: fallbackEstimate,
    });

    const safeData = sanitizeMealAnalysis(result.data, fallbackEstimate);
    return jsonOk({
      success: true,
      data: safeData,
      provider: result.provider,
      fallback_used: result.fallbackUsed === true,
    });
  } catch (err: any) {
    console.error("[ai-analyze-image] fatal error", {
      message: err?.message,
      status: err?.status || null,
      raw: String(err?.rawResponse || "").slice(0, 1200),
      repaired: String(err?.repairedResponse || "").slice(0, 1200),
    });

    return jsonOk({
      success: true,
      data: fallbackEstimate,
      provider: "fallback",
      fallback_used: true,
    });
  }
});
