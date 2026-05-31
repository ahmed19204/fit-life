/**
 * Edge Function: AI Image Analysis (Gemini Vision)
 * POST /functions/v1/ai-analyze-image
 * Body: { image: "data:image/jpeg;base64,..." | "<raw base64>" }
 * Returns: { success: true, data: { name, calories, protein, carbs, fat, foods, ... } }
 */
import { handleCors, jsonOk, jsonError } from "../_shared/cors.ts";
import {
  geminiVision,
  parseAIJson,
  LANGUAGE_INSTRUCTION,
} from "../_shared/gemini.ts";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB base64

const IMAGE_PROMPT = `You are a professional nutritionist analyzing a food image.
Identify all foods visible and estimate their nutritional content.

${LANGUAGE_INSTRUCTION}

Return ONLY a valid JSON object with this exact structure:
{"name":"Brief meal name","calories":number,"protein":number,"carbs":number,"fat":number,"foods":["food item 1","food item 2"],"servingSize":"estimated serving size","summary":"Brief 1-2 sentence description","mealType":"Breakfast|Lunch|Dinner|Snack"}

Rules:
- Be accurate with calorie and macro estimates based on typical serving sizes
- List each distinct food item in the foods array
- Estimate serving size (e.g., "1 plate", "1 bowl", "250g")
- ONLY return JSON, no markdown, no explanation`;

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

  const { image } = body;
  if (!image || typeof image !== "string") {
    return jsonError(400, "Missing image data", "INVALID_PAYLOAD");
  }

  // Extract base64 data and mime type
  let imageData: string;
  let mimeType: string;
  const dataUriMatch = image.match(
    /^data:image\/(jpeg|png|webp|gif);base64,(.+)$/,
  );
  if (dataUriMatch) {
    mimeType = `image/${dataUriMatch[1]}`;
    imageData = dataUriMatch[2];
  } else {
    // Assume raw base64 JPEG
    mimeType = "image/jpeg";
    imageData = image;
  }

  if (imageData.length > MAX_IMAGE_SIZE) {
    return jsonError(400, "Image too large. Max 10MB.", "IMAGE_TOO_LARGE");
  }

  console.log(
    `[ai-analyze-image] Processing: ${mimeType}, ${Math.round(imageData.length / 1024)}KB`,
  );

  try {
    const text = await geminiVision(apiKey, IMAGE_PROMPT, imageData, mimeType, {
      maxTokens: 1000,
      temperature: 0.4,
    });
    const data = parseAIJson(text);
    return jsonOk({ success: true, data });
  } catch (err: any) {
    console.error("[ai-analyze-image] Error:", err.message);
    const status = err.status || 500;
    if (status === 429) {
      return jsonError(429, "AI service busy. Please try again shortly.");
    }
    if (err.message?.includes("parse")) {
      return jsonError(
        502,
        "AI returned invalid format. Please try again.",
        "PARSE_ERROR",
      );
    }
    return jsonError(
      status >= 500 ? 502 : status,
      err.message || "Image analysis error",
      "GEMINI_ERROR",
    );
  }
});
