/**
 * Edge Function: AI Recipe Generator
 * POST /functions/v1/ai-recipe
 * Body: { ingredients: "chicken, rice, broccoli", profile?: { diet_type, goal, restrictions } }
 * Returns: { success: true, data: { name, prepTime, cookTime, servings, ... } }
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
    console.error("[ai-recipe] GEMINI_API_KEY not set");
    return jsonError(500, "AI service not configured", "CONFIG_ERROR");
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body", "INVALID_JSON");
  }

  const { ingredients, profile } = body;
  if (
    !ingredients ||
    typeof ingredients !== "string" ||
    ingredients.trim().length < 3
  ) {
    return jsonError(
      400,
      "Please provide some ingredients",
      "INVALID_PAYLOAD",
    );
  }

  const diet = profile?.diet_type || "balanced";
  const goal = profile?.goal || "improve-health";
  const restrictions = (profile?.restrictions || []).join(", ") || "none";

  const sanitizedIngredients = ingredients
    .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, "[filtered]")
    .replace(/system\s*:\s*/gi, "[filtered]")
    .slice(0, 500)
    .trim();

  const prompt = `You are a professional chef and nutritionist. Create a recipe using these ingredients: ${sanitizedIngredients}.
User profile: Diet: ${diet}, Goal: ${goal}, Restrictions: ${restrictions}.

${LANGUAGE_INSTRUCTION}

Return ONLY valid JSON:
{"name":"Recipe name","prepTime":"X min","cookTime":"X min","servings":number,"calories":number,"protein":number,"carbs":number,"fat":number,"ingredients":["amount ingredient"],"instructions":["step 1","step 2"],"tips":"Optional cooking tip"}

Keep it practical and healthy. ONLY JSON, no markdown.`;

  const contents = [{ role: "user", parts: [{ text: prompt }] }];

  try {
    const text = await geminiText(apiKey, contents, {
      maxTokens: 2000,
      temperature: 0.7,
    });
    const data = parseAIJson(text);
    return jsonOk({ success: true, data });
  } catch (err: any) {
    console.error("[ai-recipe] Error:", err.message);
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
      err.message || "Recipe generation error",
      "GEMINI_ERROR",
    );
  }
});
