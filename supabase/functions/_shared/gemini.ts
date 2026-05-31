/**
 * Shared Gemini API helpers for all FitLife Edge Functions.
 * Model: gemini-2.5-flash (GA, stable until Oct 2026)
 * Includes timeout, error logging, and response extraction.
 */

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 30_000;

/** Language-aware system instruction appended to every prompt */
export const LANGUAGE_INSTRUCTION =
  "IMPORTANT: Detect the language of the user's input and respond in that SAME language (e.g., Arabic, English, Russian, French, etc.). Always match the user's language.";

/** Fetch with AbortController timeout */
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

/**
 * Send a text-only request to Gemini.
 * @param apiKey  GEMINI_API_KEY from Deno.env
 * @param contents  Gemini-format [{role, parts:[{text}]}]
 * @param config  Optional generation config overrides
 */
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

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(
      `[Gemini] ${res.status} error:`,
      errText.slice(0, 500),
    );
    const err = new Error(
      `Gemini returned ${res.status}: ${errText.slice(0, 200)}`,
    );
    (err as any).status = res.status;
    throw err;
  }

  const result = await res.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) {
    console.error(
      "[Gemini] Empty response. Candidates:",
      JSON.stringify(result?.candidates?.slice(0, 1)).slice(0, 300),
    );
    throw new Error("Empty Gemini response");
  }

  return text;
}

/**
 * Send a multimodal (image + text) request to Gemini Vision.
 * @param apiKey  GEMINI_API_KEY from Deno.env
 * @param prompt  Text prompt describing what to analyze
 * @param imageBase64  Raw base64 image data (no data:uri prefix)
 * @param mimeType  e.g. "image/jpeg"
 */
export async function geminiVision(
  apiKey: string,
  prompt: string,
  imageBase64: string,
  mimeType: string,
  config: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: config.maxTokens || 1000,
      temperature: config.temperature ?? 0.4,
    },
  };

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(
      `[Gemini Vision] ${res.status} error:`,
      errText.slice(0, 500),
    );
    const err = new Error(
      `Gemini Vision returned ${res.status}: ${errText.slice(0, 200)}`,
    );
    (err as any).status = res.status;
    throw err;
  }

  const result = await res.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) {
    console.error(
      "[Gemini Vision] Empty response. promptFeedback:",
      JSON.stringify(result?.promptFeedback).slice(0, 200),
    );
    throw new Error("Empty Gemini Vision response");
  }

  return text;
}

/** Strip markdown code fences and parse JSON from AI text */
export function parseAIJson(text: string): any {
  const cleaned = text
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    /* try extracting object */
  }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (_) {
      /* fall through */
    }
  }
  throw new Error("Failed to parse JSON from AI response");
}
