/**
 * Edge Function: AI Nutrition Plan Generator
 * POST /functions/v1/ai-nutrition
 * Body: { input: { age, weight, height, goal, activity_level, diet_type, ... } }
 *    OR { prompt: "raw prompt string" }
 * Returns: { success: true, data: { calories, protein, carbs, fat, meal_plan } }
 */
import { handleCors, jsonOk, jsonError } from "../_shared/cors.ts";
import {
  geminiText,
  parseAIJson,
  LANGUAGE_INSTRUCTION,
} from "../_shared/gemini.ts";

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (req.method !== "POST") return jsonError(405, "Method not allowed");

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("[ai-nutrition] GEMINI_API_KEY not set");
    return jsonError(500, "AI service not configured", "CONFIG_ERROR");
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body", "INVALID_JSON");
  }

  const { prompt, input } = body;

  let finalPrompt: string;

  if (prompt && typeof prompt === "string") {
    // Legacy prompt-based call
    finalPrompt = prompt
      .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, "[filtered]")
      .replace(/system\s*:\s*/gi, "[filtered]")
      .slice(0, 5000);
  } else if (input && typeof input === "object") {
    const i = input;
    const diet =
      i.restrictions?.length > 0
        ? `Dietary restrictions: ${i.restrictions.join(", ")}.`
        : "No dietary restrictions.";
    const health =
      i.health_conditions?.length > 0 &&
      !i.health_conditions.includes("none")
        ? `Health considerations: ${i.health_conditions.join(", ")}.`
        : "No specific health conditions.";

    finalPrompt = `You are a professional nutritionist creating a personalized meal plan.

${LANGUAGE_INSTRUCTION}

User Profile:
- Age: ${i.age}, Weight: ${i.weight}kg, Height: ${i.height}cm
- Goal: ${(i.goal || "").replace(/-/g, " ")}, Activity: ${(i.activity_level || "").replace(/-/g, " ")}
- Diet: ${i.diet_type || "balanced"}, ${diet} ${health}
- Meals/day: ${i.meals_per_day || 3}

Return ONLY a JSON object:
{"calories":number,"protein":number,"carbs":number,"fat":number,"meal_plan":[{"name":"string","calories":number,"protein":number,"carbs":number,"fat":number,"foods":["string"]}]}

Requirements: Mifflin-St Jeor + activity multiplier + goal adjustment. ${i.meals_per_day || 3} meals. 2-4 foods per meal. ONLY JSON, no markdown.`;
  } else {
    return jsonError(
      400,
      "Missing prompt or input data",
      "INVALID_PAYLOAD",
    );
  }

  if (finalPrompt.length < 10) {
    return jsonError(400, "Prompt too short", "INVALID_PAYLOAD");
  }

  const contents = [{ role: "user", parts: [{ text: finalPrompt }] }];

  try {
    const text = await geminiText(apiKey, contents, {
      maxTokens: 2000,
      temperature: 0.7,
    });
    const data = parseAIJson(text);
    return jsonOk({ success: true, data });
  } catch (err: any) {
    console.error("[ai-nutrition] Error:", err.message);
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
      err.message || "Nutrition plan error",
      "GEMINI_ERROR",
    );
  }
});
