/**
 * Edge Function: AI Text Meal Analysis
 * POST /functions/v1/ai-analyze-text
 * Body: { description: "I ate a chicken salad with rice..." }
 * Returns: { success: true, data: { name, calories, protein, carbs, fat, foods, ... } }
 */
import { handleCors, jsonOk, jsonError } from "../_shared/cors.ts";
import {
  geminiText,
  parseAIJson,
  LANGUAGE_INSTRUCTION,
} from "../_shared/gemini.ts";

const TEXT_PROMPT = `You are a professional nutritionist analyzing a meal description.
Estimate the nutritional content based on what the user described eating.

${LANGUAGE_INSTRUCTION}

Return ONLY a valid JSON object with this exact structure:
{"name":"Brief meal name","calories":number,"protein":number,"carbs":number,"fat":number,"foods":["ingredient 1","ingredient 2"],"servingSize":"estimated serving size","summary":"Brief 1-2 sentence description","mealType":"Breakfast|Lunch|Dinner|Snack"}

Rules:
- Be accurate with calorie and macro estimates
- Break down the meal into individual ingredients
- ONLY return JSON, no markdown, no explanation

User's meal description:`;

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

  const { description } = body;
  if (!description || typeof description !== "string") {
    return jsonError(400, "Missing meal description", "INVALID_PAYLOAD");
  }

  const sanitized = description
    .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, "[filtered]")
    .replace(/system\s*:\s*/gi, "[filtered]")
    .slice(0, 2000)
    .trim();

  if (sanitized.length < 3) {
    return jsonError(400, "Description too short", "INVALID_PAYLOAD");
  }

  const contents = [
    { role: "user", parts: [{ text: TEXT_PROMPT + "\n" + sanitized }] },
  ];

  try {
    const text = await geminiText(apiKey, contents, {
      maxTokens: 1000,
      temperature: 0.4,
    });
    const data = parseAIJson(text);
    return jsonOk({ success: true, data });
  } catch (err: any) {
    console.error("[ai-analyze-text] Error:", err.message);
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
      err.message || "Text analysis error",
      "GEMINI_ERROR",
    );
  }
});
