/**
 * Edge Function: AI Recipe Generator
 * POST /functions/v1/ai-recipe
 */
import { handleCors, jsonOk, jsonError } from "../_shared/cors.ts";
import { generateTextJson, LANGUAGE_INSTRUCTION } from "../_shared/gemini.ts";

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (req.method !== "POST") return jsonError(405, "Method not allowed");

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("[ai-recipe] GEMINI_API_KEY not set");
    return jsonError(500, "AI service not configured", "CONFIG_ERROR");
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body", "INVALID_JSON");
  }

  const ingredients = String(body?.ingredients || "").trim();
  if (ingredients.length < 3) {
    return jsonError(400, "Please provide some ingredients", "INVALID_PAYLOAD");
  }

  const profile = body?.profile || {};
  const restrictions = Array.isArray(profile?.restrictions) && profile.restrictions.length > 0
    ? profile.restrictions.join(", ")
    : "none";

  const prompt = [
    "You are a chef and sports nutrition assistant.",
    LANGUAGE_INSTRUCTION,
    "Return ONLY one raw JSON object. No markdown. No code fences. No explanation.",
    'Schema: {"name":"string","prepTime":"string","cookTime":"string","servings":number,"calories":number,"protein":number,"carbs":number,"fat":number,"ingredients":["string"],"instructions":["string"],"tips":"string"}',
    `User ingredients: ${ingredients.replace(/ignore\s+(all\s+)?previous\s+instructions/gi, "[filtered]").replace(/system\s*:\s*/gi, "[filtered]").slice(0, 800)}.`,
    `Diet: ${profile?.diet_type || "balanced"}. Goal: ${profile?.goal || "improve-health"}. Restrictions: ${restrictions}.`,
    "Use practical ingredient amounts and realistic macro totals.",
  ].join("\n\n");

  try {
    const result = await generateTextJson(apiKey, [{ role: "user", parts: [{ text: prompt }] }], {
      context: "ai-recipe",
      maxTokens: 1800,
      temperature: 0.35,
      repairPrompt: 'Return the same recipe again as strict raw JSON only using the schema {"name":"string","prepTime":"string","cookTime":"string","servings":number,"calories":number,"protein":number,"carbs":number,"fat":number,"ingredients":["string"],"instructions":["string"],"tips":"string"}.',
    });

    return jsonOk({
      success: true,
      data: result.data,
      provider: result.provider,
      fallback_used: result.fallbackUsed === true,
    });
  } catch (err: any) {
    console.error("[ai-recipe] error", {
      message: err?.message,
      status: err?.status || null,
      raw: String(err?.rawResponse || "").slice(0, 1200),
      repaired: String(err?.repairedResponse || "").slice(0, 1200),
    });
    return jsonError(502, "Recipe generation temporarily unavailable", "AI_PROVIDER_ERROR");
  }
});
