/**
 * Edge Function: AI Coach
 * POST /functions/v1/ai-coach
 * Body: { contents: [{role, parts:[{text}]}] }
 * Returns: { success: true, text: string }
 */
import { handleCors, jsonOk, jsonError } from "../_shared/cors.ts";
import { geminiText, LANGUAGE_INSTRUCTION } from "../_shared/gemini.ts";

Deno.serve(async (req: Request) => {
  // CORS preflight
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("[ai-coach] GEMINI_API_KEY not set");
    return jsonError(500, "AI service not configured", "CONFIG_ERROR");
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body", "INVALID_JSON");
  }

  const { contents } = body;
  if (!Array.isArray(contents) || contents.length === 0) {
    return jsonError(400, "Missing or empty contents array", "INVALID_PAYLOAD");
  }

  // Sanitize: keep last 20 messages, strip injection patterns
  const sanitized = contents.slice(-20).map((item: any) => {
    if (!item || typeof item !== "object") return null;
    const role =
      item.role === "model" || item.role === "assistant" ? "model" : "user";
    const parts = Array.isArray(item.parts)
      ? item.parts
          .map((p: any) => {
            if (!p || typeof p.text !== "string") return null;
            return {
              text: p.text
                .replace(
                  /ignore\s+(all\s+)?previous\s+instructions/gi,
                  "[filtered]",
                )
                .replace(/system\s*:\s*/gi, "[filtered]")
                .slice(0, 4000),
            };
          })
          .filter(Boolean)
      : [];
    if (parts.length === 0) return null;
    return { role, parts };
  }).filter(Boolean);

  if (sanitized.length === 0) {
    return jsonError(400, "No valid message contents", "INVALID_PAYLOAD");
  }

  // Prepend language instruction to the first user message
  if (sanitized[0]?.parts?.[0]?.text) {
    sanitized[0].parts[0].text =
      LANGUAGE_INSTRUCTION + "\n\n" + sanitized[0].parts[0].text;
  }

  try {
    const text = await geminiText(apiKey, sanitized, {
      maxTokens: 800,
      temperature: 0.7,
    });
    return jsonOk({ success: true, text });
  } catch (err: any) {
    console.error("[ai-coach] Error:", err.message);
    const status = err.status || 500;
    if (status === 429) {
      return jsonError(429, "AI service busy. Please try again shortly.");
    }
    return jsonError(
      status >= 500 ? 502 : status,
      err.message || "AI coach error",
      "GEMINI_ERROR",
    );
  }
});
