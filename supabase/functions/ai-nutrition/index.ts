/**
 * Edge Function: AI Nutrition Plan Generator
 * POST /functions/v1/ai-nutrition
 */
import { handleCors, jsonOk, jsonError } from "../_shared/cors.ts";
import { generateTextJson, LANGUAGE_INSTRUCTION } from "../_shared/gemini.ts";

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

  const { prompt, input, targets } = body || {};

  let finalPrompt = "";
  if (typeof prompt === "string" && prompt.trim()) {
    finalPrompt = prompt
      .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, "[filtered]")
      .replace(/system\s*:\s*/gi, "[filtered]")
      .slice(0, 5000)
      .trim();
  } else if (input && typeof input === "object") {
    const restrictions = Array.isArray(input.restrictions) && input.restrictions.length > 0
      ? input.restrictions.join(", ")
      : "none";
    const conditions = Array.isArray(input.health_conditions) && input.health_conditions.length > 0
      ? input.health_conditions.join(", ")
      : "none";

    finalPrompt = [
      "You are an AI nutrition planning assistant.",
      LANGUAGE_INSTRUCTION,
      "Return ONLY one raw JSON object. No markdown. No code fences. No explanation.",
      'Schema: {"calories":number,"protein":number,"carbs":number,"fat":number,"meal_plan":[{"name":"string","calories":number,"protein":number,"carbs":number,"fat":number,"foods":["string"]}]}',
      "Keep meal names and foods practical, globally understandable, and nutritionally realistic.",
      `Age: ${input.age}, Weight: ${input.weight}kg, Height: ${input.height}cm, Gender: ${input.gender || "neutral"}.`,
      `Goal: ${input.goal || "maintain"}. Activity: ${input.activity_level || "sedentary"}. Meals/day: ${input.meals_per_day || 3}.`,
      `Diet type: ${input.diet_type || "balanced"}. Restrictions: ${restrictions}. Health conditions: ${conditions}.`,
      targets && typeof targets === "object"
        ? `Stay close to these deterministic targets already computed by the app: ${targets.target_calories ?? "?"} kcal, ${targets.target_protein ?? "?"} g protein, ${targets.target_carbs ?? "?"} g carbs, ${targets.target_fat ?? "?"} g fat.`
        : "Use evidence-based macro targets.",
      `Return exactly ${input.meals_per_day || 3} meals. Use 2 to 4 foods per meal.`,
    ].join("\n\n");
  } else {
    return jsonError(400, "Missing prompt or input data", "INVALID_PAYLOAD");
  }

  if (finalPrompt.length < 10) {
    return jsonError(400, "Prompt too short", "INVALID_PAYLOAD");
  }

  try {
    const result = await generateTextJson(apiKey, [{ role: "user", parts: [{ text: finalPrompt }] }], {
      context: "ai-nutrition",
      maxTokens: 1800,
      temperature: 0.2,
      repairPrompt: 'Return the same nutrition plan again as strict raw JSON only using the exact schema {"calories":number,"protein":number,"carbs":number,"fat":number,"meal_plan":[{"name":"string","calories":number,"protein":number,"carbs":number,"fat":number,"foods":["string"]}]}.',
    });

    return jsonOk({
      success: true,
      data: result.data,
      provider: result.provider,
      fallback_used: result.fallbackUsed === true,
    });
  } catch (err: any) {
    console.error("[ai-nutrition] error", {
      message: err?.message,
      status: err?.status || null,
      raw: String(err?.rawResponse || "").slice(0, 1200),
      repaired: String(err?.repairedResponse || "").slice(0, 1200),
    });
    return jsonError(502, "Nutrition plan generation temporarily unavailable", "AI_PROVIDER_ERROR");
  }
});
