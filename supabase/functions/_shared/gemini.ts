/**
 * Shared Gemini + OpenRouter fallback helpers for FitLife Edge Functions.
 * ----------------------------------------------------------------------------
 * Primary:   Gemini 2.5 Flash (free tier friendly, multimodal)
 * Fallback:  OpenRouter — automatically tried on 429 / 503 / 5xx / timeout.
 *
 * Required Supabase secrets:
 *   GEMINI_API_KEY        (primary)
 *   OPENROUTER_API_KEY    (optional fallback)
 *   OPENROUTER_MODEL      (optional, defaults to "google/gemini-2.5-flash")
 */

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 30_000;

const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";
const FALLBACK_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export const LANGUAGE_INSTRUCTION =
  "IMPORTANT: Detect the language of the user's input and respond in that SAME language (e.g., Arabic, English, Russian, French, etc.). Always match the user's language.";

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── OpenRouter fallback ─────────────────────────────────────────────────────
function geminiContentsToOpenRouterMessages(
  contents: Array<{ role: string; parts: Array<{ text?: string; inlineData?: any }> }>,
): Array<{ role: string; content: any }> {
  const messages: Array<{ role: string; content: any }> = [];
  for (const c of contents) {
    const role = c.role === "model" ? "assistant" : "user";
    // Merge text parts; ignore inlineData (vision handled separately via image_url)
    const textPart = (c.parts || []).map((p) => p.text || "").filter(Boolean).join("\n");
    if (textPart) messages.push({ role, content: textPart });
  }
  return messages;
}

async function openRouterText(
  messages: Array<{ role: string; content: any }>,
  config: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  const model = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";

  const res = await fetchWithTimeout(OPENROUTER_BASE, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": Deno.env.get("OPENROUTER_REFERER") || "https://fitlife.app",
      "X-Title": "FitLife AI",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: config.maxTokens || 1500,
      temperature: config.temperature ?? 0.7,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const err = new Error(`OpenRouter ${res.status}: ${errText.slice(0, 200)}`);
    (err as any).status = res.status;
    throw err;
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty OpenRouter response");
  return text;
}

// ── Gemini Text ─────────────────────────────────────────────────────────────
export async function geminiText(
  apiKey: string,
  contents: Array<{ role: string; parts: Array<{ text: string }> }>,
  config: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: config.maxTokens || 2000,
      temperature: config.temperature ?? 0.7,
    },
  };

  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[Gemini] ${res.status} error:`, errText.slice(0, 500));
      const err = new Error(`Gemini returned ${res.status}: ${errText.slice(0, 200)}`);
      (err as any).status = res.status;
      // Try OpenRouter fallback on overload / rate limit
      if (FALLBACK_STATUS_CODES.has(res.status) && Deno.env.get("OPENROUTER_API_KEY")) {
        console.warn(`[Gemini→OpenRouter] Falling back due to status ${res.status}`);
        return await openRouterText(geminiContentsToOpenRouterMessages(contents), config);
      }
      throw err;
    }

    const result = await res.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      console.error("[Gemini] Empty response. Candidates:", JSON.stringify(result?.candidates?.slice(0, 1)).slice(0, 300));
      // Try OpenRouter fallback on empty response
      if (Deno.env.get("OPENROUTER_API_KEY")) {
        console.warn("[Gemini→OpenRouter] Empty response — falling back");
        return await openRouterText(geminiContentsToOpenRouterMessages(contents), config);
      }
      throw new Error("Empty Gemini response");
    }
    return text;
  } catch (err: any) {
    // Network/timeout errors → also fallback
    if (err.name === "AbortError" || /timeout|network|fetch/i.test(err.message || "")) {
      if (Deno.env.get("OPENROUTER_API_KEY")) {
        console.warn("[Gemini→OpenRouter] Network/timeout — falling back:", err.message);
        return await openRouterText(geminiContentsToOpenRouterMessages(contents), config);
      }
    }
    throw err;
  }
}

// ── Gemini Vision ───────────────────────────────────────────────────────────
export async function geminiVision(
  apiKey: string,
  prompt: string,
  imageBase64: string,
  mimeType: string,
  config: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: imageBase64 } },
      ],
    }],
    generationConfig: {
      maxOutputTokens: config.maxTokens || 1000,
      temperature: config.temperature ?? 0.4,
    },
  };

  const tryOpenRouterVision = async (): Promise<string> => {
    const key = Deno.env.get("OPENROUTER_API_KEY");
    if (!key) throw new Error("OPENROUTER_API_KEY not set");
    const model = Deno.env.get("OPENROUTER_VISION_MODEL") || "google/gemini-2.5-flash";
    const res = await fetchWithTimeout(OPENROUTER_BASE, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("OPENROUTER_REFERER") || "https://fitlife.app",
        "X-Title": "FitLife AI",
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        }],
        max_tokens: config.maxTokens || 1000,
        temperature: config.temperature ?? 0.4,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const err = new Error(`OpenRouter Vision ${res.status}: ${errText.slice(0, 200)}`);
      (err as any).status = res.status;
      throw err;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Empty OpenRouter Vision response");
    return text;
  };

  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[Gemini Vision] ${res.status} error:`, errText.slice(0, 500));
      const err = new Error(`Gemini Vision returned ${res.status}: ${errText.slice(0, 200)}`);
      (err as any).status = res.status;
      if (FALLBACK_STATUS_CODES.has(res.status) && Deno.env.get("OPENROUTER_API_KEY")) {
        console.warn(`[Gemini Vision→OpenRouter] Falling back due to ${res.status}`);
        return await tryOpenRouterVision();
      }
      throw err;
    }
    const result = await res.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      console.error("[Gemini Vision] Empty response. promptFeedback:", JSON.stringify(result?.promptFeedback).slice(0, 200));
      if (Deno.env.get("OPENROUTER_API_KEY")) {
        console.warn("[Gemini Vision→OpenRouter] Empty — falling back");
        return await tryOpenRouterVision();
      }
      throw new Error("Empty Gemini Vision response");
    }
    return text;
  } catch (err: any) {
    if (err.name === "AbortError" || /timeout|network|fetch/i.test(err.message || "")) {
      if (Deno.env.get("OPENROUTER_API_KEY")) {
        console.warn("[Gemini Vision→OpenRouter] Network/timeout — falling back:", err.message);
        return await tryOpenRouterVision();
      }
    }
    throw err;
  }
}

/** Strip markdown code fences and parse JSON from AI text. */
export function parseAIJson(text: string): any {
  const cleaned = text
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
  try { return JSON.parse(cleaned); } catch (_) { /* try extracting object */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) { /* fall through */ }
  }
  throw new Error("Failed to parse JSON from AI response");
}
