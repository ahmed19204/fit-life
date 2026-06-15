/**
 * Shared Gemini + OpenRouter fallback helpers for FitLife Edge Functions.
 * -----------------------------------------------------------------------------
 * Primary provider: Gemini
 * Fallback provider: OpenRouter
 *
 * Reliability features:
 * - strict JSON mode for structured outputs
 * - exponential backoff on 429/5xx/timeout/empty responses
 * - provider failover after Gemini retries are exhausted
 * - response timeout protection
 * - lightweight in-memory response cache
 * - markdown fence stripping, JSON extraction, JSON repair, recursive coercion
 * - provider / parse / repair logging without exposing secrets
 */

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 30_000;

const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.1-8b-instruct:free";
const DEFAULT_OPENROUTER_VISION_MODEL = "qwen/qwen2.5-vl-72b-instruct:free";

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const PROVIDER_BACKOFF_MS = [1000, 2000, 4000];
const EDGE_CACHE_TTL_MS = 5 * 60 * 1000;
const EDGE_CACHE_MAX_ENTRIES = 100;

const responseCache = new Map<string, { value: any; timestamp: number }>();

export const LANGUAGE_INSTRUCTION = [
  "You must support Arabic, English, Russian, and mixed-language inputs in the same request.",
  "Interpret quantities written with Arabic script, Cyrillic script, or Latin script.",
  "Internally normalize the nutrition reasoning to canonical English food names and standard metric units.",
].join(" ");

type GeminiContent = { role: string; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> };
type TextConfig = { maxTokens?: number; temperature?: number; strictJson?: boolean; context?: string };
type ProviderResult = { text: string; provider: "gemini" | "openrouter"; cached?: boolean };

type JsonOptions = TextConfig & {
  repairPrompt?: string;
  fallbackValue?: any;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function djb2(input: string) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) hash = ((hash << 5) + hash) + input.charCodeAt(i);
  return (hash >>> 0).toString(36);
}

function getCacheKey(prefix: string, payload: unknown) {
  return `${prefix}:${djb2(typeof payload === "string" ? payload : JSON.stringify(payload))}`;
}

function getCached(key: string) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if ((Date.now() - entry.timestamp) > EDGE_CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key: string, value: any) {
  responseCache.set(key, { value, timestamp: Date.now() });
  if (responseCache.size <= EDGE_CACHE_MAX_ENTRIES) return;
  for (const [cacheKey, entry] of responseCache.entries()) {
    if ((Date.now() - entry.timestamp) > EDGE_CACHE_TTL_MS) responseCache.delete(cacheKey);
  }
  while (responseCache.size > EDGE_CACHE_MAX_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (!oldest) break;
    responseCache.delete(oldest);
  }
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isRetryableError(error: any) {
  const status = error?.status || error?.statusCode;
  const message = String(error?.message || "").toLowerCase();
  return Boolean(
    (status && RETRYABLE_STATUS_CODES.has(status))
    || error?.name === "AbortError"
    || message.includes("timeout")
    || message.includes("network")
    || message.includes("fetch")
    || message.includes("empty response")
  );
}

function replaceUnicodeDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٫]/g, ".")
    .replace(/[،]/g, ",");
}

function normalizeQuotes(value: string) {
  return value
    .replace(/[“”«»„‟]/g, '"')
    .replace(/[‘’‚‛‹›]/g, "'")
    .replace(/\u00A0/g, " ")
    .replace(/^\uFEFF/, "");
}

function stripMarkdownFences(value: string) {
  return value
    .replace(/^```[a-z0-9_-]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractBalancedJson(value: string) {
  const start = value.search(/[\[{]/);
  if (start === -1) return value;

  const open = value[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < value.length; i += 1) {
    const char = value[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === open) depth += 1;
    if (char === close) depth -= 1;
    if (depth === 0) return value.slice(start, i + 1);
  }

  return value.slice(start);
}

function repairJsonCandidate(value: string) {
  let repaired = normalizeQuotes(stripMarkdownFences(value));
  repaired = extractBalancedJson(repaired);
  repaired = replaceUnicodeDigits(repaired);
  repaired = repaired.replace(/\r/g, " ");
  repaired = repaired.replace(/\n+/g, " ");
  repaired = repaired.replace(/([{,]\s*)'([^']+?)'\s*:/g, '$1"$2":');
  repaired = repaired.replace(/:\s*'([^']*?)'(\s*[,}\]])/g, ': "$1"$2');
  repaired = repaired.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_\- ]*)(\s*:)/g, (_m, left, key, right) => `${left}"${String(key).trim()}"${right}`);
  repaired = repaired.replace(/,\s*([}\]])/g, "$1");
  repaired = repaired.replace(/:\s*undefined(\s*[,}\]])/g, ": null$1");
  repaired = repaired.replace(/:\s*NaN(\s*[,}\]])/g, ": 0$1");
  repaired = repaired.trim();
  return repaired;
}

function coercePrimitive(value: any): any {
  if (Array.isArray(value)) return value.map((item) => coercePrimitive(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [String(key).trim(), coercePrimitive(item)]));
  }
  if (typeof value !== "string") return value;

  const clean = replaceUnicodeDigits(value).trim();
  if (!clean) return "";
  if (/^(true|false)$/i.test(clean)) return clean.toLowerCase() === "true";
  if (/^(null|none|n\/a)$/i.test(clean)) return null;

  const numeric = clean.replace(/(?<=\d),(?=\d)/g, ".").replace(/[^0-9+\-.]/g, "");
  if (numeric && /^[-+]?\d+(?:\.\d+)?$/.test(numeric)) {
    const parsed = Number(numeric);
    if (Number.isFinite(parsed)) return parsed;
  }

  return clean;
}

function summarizeParseError(error: any) {
  return {
    message: error?.message || "Unknown parse error",
    rawResponse: String(error?.rawResponse || "").slice(0, 1200),
    repairedResponse: String(error?.repairedResponse || "").slice(0, 1200),
  };
}

function buildGeminiBody(contents: GeminiContent[], config: TextConfig) {
  return {
    contents,
    generationConfig: {
      maxOutputTokens: config.maxTokens || 2000,
      temperature: config.temperature ?? 0.3,
      responseMimeType: config.strictJson ? "application/json" : undefined,
    },
  };
}

function geminiContentsToOpenRouterMessages(contents: GeminiContent[]) {
  return contents.map((content) => ({
    role: content.role === "model" ? "assistant" : "user",
    content: content.parts
      .filter((part) => typeof part.text === "string" && part.text)
      .map((part) => part.text)
      .join("\n"),
  })).filter((message) => message.content);
}

async function requestGeminiText(apiKey: string, contents: GeminiContent[], config: TextConfig): Promise<string> {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildGeminiBody(contents, config)),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    const error = new Error(`Gemini returned ${res.status}: ${errorText.slice(0, 200)}`);
    (error as any).status = res.status;
    throw error;
  }

  const result = await res.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) {
    const error = new Error("Empty Gemini response");
    (error as any).status = 502;
    throw error;
  }
  return text;
}

async function requestOpenRouterText(contents: GeminiContent[], config: TextConfig): Promise<string> {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  const model = Deno.env.get("OPENROUTER_MODEL") || DEFAULT_OPENROUTER_MODEL;

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
      messages: geminiContentsToOpenRouterMessages(contents),
      max_tokens: config.maxTokens || 1500,
      temperature: config.temperature ?? 0.3,
      response_format: config.strictJson ? { type: "json_object" } : undefined,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    const error = new Error(`OpenRouter returned ${res.status}: ${errorText.slice(0, 200)}`);
    (error as any).status = res.status;
    throw error;
  }

  const result = await res.json();
  const text = result?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    const error = new Error("Empty OpenRouter response");
    (error as any).status = 502;
    throw error;
  }
  return text;
}

async function requestProviderWithRetries(provider: "gemini" | "openrouter", runner: () => Promise<string>, context: string) {
  let lastError: any = null;
  for (let attempt = 0; attempt < PROVIDER_BACKOFF_MS.length; attempt += 1) {
    try {
      console.info(`[FitLife:AI:${context}] ${provider} attempt ${attempt + 1}`);
      return await runner();
    } catch (error) {
      lastError = error;
      console.warn(`[FitLife:AI:${context}] ${provider} attempt ${attempt + 1} failed`, {
        message: error?.message,
        status: error?.status || null,
      });
      if (!isRetryableError(error) || attempt === PROVIDER_BACKOFF_MS.length - 1) break;
      await sleep(PROVIDER_BACKOFF_MS[attempt]);
    }
  }
  throw lastError;
}

async function getTextWithProvider(apiKey: string, contents: GeminiContent[], config: TextConfig = {}): Promise<ProviderResult> {
  const context = config.context || "edge-text";
  const cacheKey = getCacheKey("text", { contents, strictJson: config.strictJson, maxTokens: config.maxTokens, temperature: config.temperature });
  const cached = getCached(cacheKey);
  if (cached) {
    console.info(`[FitLife:AI:${context}] cache hit`);
    return { ...cached, cached: true };
  }

  try {
    const text = await requestProviderWithRetries("gemini", () => requestGeminiText(apiKey, contents, config), context);
    const value = { text, provider: "gemini" as const };
    setCached(cacheKey, value);
    return value;
  } catch (geminiError) {
    if (!Deno.env.get("OPENROUTER_API_KEY")) throw geminiError;
    const text = await requestProviderWithRetries("openrouter", () => requestOpenRouterText(contents, config), context);
    const value = { text, provider: "openrouter" as const };
    setCached(cacheKey, value);
    return value;
  }
}

async function requestGeminiVision(apiKey: string, prompt: string, imageBase64: string, mimeType: string, config: TextConfig) {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
      }],
      generationConfig: {
        maxOutputTokens: config.maxTokens || 1000,
        temperature: config.temperature ?? 0.2,
        responseMimeType: config.strictJson ? "application/json" : undefined,
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    const error = new Error(`Gemini Vision returned ${res.status}: ${errorText.slice(0, 200)}`);
    (error as any).status = res.status;
    throw error;
  }

  const result = await res.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) {
    const error = new Error("Empty Gemini Vision response");
    (error as any).status = 502;
    throw error;
  }
  return text;
}

async function requestOpenRouterVision(prompt: string, imageBase64: string, mimeType: string, config: TextConfig) {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  const model = Deno.env.get("OPENROUTER_VISION_MODEL") || DEFAULT_OPENROUTER_VISION_MODEL;

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
      temperature: config.temperature ?? 0.2,
      response_format: config.strictJson ? { type: "json_object" } : undefined,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    const error = new Error(`OpenRouter Vision returned ${res.status}: ${errorText.slice(0, 200)}`);
    (error as any).status = res.status;
    throw error;
  }

  const result = await res.json();
  const text = result?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    const error = new Error("Empty OpenRouter Vision response");
    (error as any).status = 502;
    throw error;
  }
  return text;
}

async function getVisionWithProvider(apiKey: string, prompt: string, imageBase64: string, mimeType: string, config: TextConfig = {}): Promise<ProviderResult> {
  const context = config.context || "edge-vision";
  const cacheKey = getCacheKey("vision", { prompt, imageHash: djb2(imageBase64.slice(0, 4000)), mimeType, strictJson: config.strictJson, maxTokens: config.maxTokens, temperature: config.temperature });
  const cached = getCached(cacheKey);
  if (cached) {
    console.info(`[FitLife:AI:${context}] cache hit`);
    return { ...cached, cached: true };
  }

  try {
    const text = await requestProviderWithRetries("gemini", () => requestGeminiVision(apiKey, prompt, imageBase64, mimeType, config), context);
    const value = { text, provider: "gemini" as const };
    setCached(cacheKey, value);
    return value;
  } catch (geminiError) {
    if (!Deno.env.get("OPENROUTER_API_KEY")) throw geminiError;
    const text = await requestProviderWithRetries("openrouter", () => requestOpenRouterVision(prompt, imageBase64, mimeType, config), context);
    const value = { text, provider: "openrouter" as const };
    setCached(cacheKey, value);
    return value;
  }
}

export async function geminiText(apiKey: string, contents: GeminiContent[], config: TextConfig = {}): Promise<string> {
  const result = await getTextWithProvider(apiKey, contents, config);
  return result.text;
}

export async function geminiVision(apiKey: string, prompt: string, imageBase64: string, mimeType: string, config: TextConfig = {}): Promise<string> {
  const result = await getVisionWithProvider(apiKey, prompt, imageBase64, mimeType, config);
  return result.text;
}

export async function generateTextResponse(apiKey: string, contents: GeminiContent[], config: TextConfig = {}): Promise<ProviderResult> {
  return getTextWithProvider(apiKey, contents, config);
}

export async function generateVisionResponse(apiKey: string, prompt: string, imageBase64: string, mimeType: string, config: TextConfig = {}): Promise<ProviderResult> {
  return getVisionWithProvider(apiKey, prompt, imageBase64, mimeType, config);
}

export function parseAIJson(text: string, options: { context?: string } = {}) {
  const context = options.context || "structured-json";
  const cleaned = repairJsonCandidate(String(text || ""));

  try {
    const parsed = JSON.parse(cleaned);
    return coercePrimitive(parsed);
  } catch (error) {
    console.error(`[FitLife:AI:${context}] JSON parse failed`, {
      message: error?.message,
      rawResponse: String(text || "").slice(0, 1200),
      repairedResponse: cleaned.slice(0, 1200),
    });
    const parseError = new Error("Failed to parse JSON from AI response");
    (parseError as any).rawResponse = text;
    (parseError as any).repairedResponse = cleaned;
    throw parseError;
  }
}

export async function generateTextJson(apiKey: string, contents: GeminiContent[], options: JsonOptions = {}) {
  const context = options.context || "text-json";
  const response = await generateTextResponse(apiKey, contents, { ...options, strictJson: true, context });

  try {
    return { data: parseAIJson(response.text, { context }), provider: response.provider, rawText: response.text };
  } catch (parseError) {
    console.warn(`[FitLife:AI:${context}] retrying after parse failure`, summarizeParseError(parseError));
    if (!options.repairPrompt) {
      if (options.fallbackValue !== undefined) {
        console.warn(`[FitLife:AI:${context}] using fallback data after parse failure`);
        return { data: options.fallbackValue, provider: response.provider, rawText: response.text, fallbackUsed: true };
      }
      throw parseError;
    }

    const retryContents = [
      ...contents,
      {
        role: "user",
        parts: [{ text: options.repairPrompt }],
      },
    ];

    const retryResponse = await generateTextResponse(apiKey, retryContents, { ...options, strictJson: true, context: `${context}:repair` });
    try {
      return { data: parseAIJson(retryResponse.text, { context: `${context}:repair` }), provider: retryResponse.provider, rawText: retryResponse.text };
    } catch (retryParseError) {
      console.error(`[FitLife:AI:${context}] repair parse failed`, summarizeParseError(retryParseError));
      if (options.fallbackValue !== undefined) {
        console.warn(`[FitLife:AI:${context}] using fallback data after repair failure`);
        return { data: options.fallbackValue, provider: retryResponse.provider, rawText: retryResponse.text, fallbackUsed: true };
      }
      throw retryParseError;
    }
  }
}

export async function generateVisionJson(apiKey: string, prompt: string, imageBase64: string, mimeType: string, options: JsonOptions = {}) {
  const context = options.context || "vision-json";
  const response = await generateVisionResponse(apiKey, prompt, imageBase64, mimeType, { ...options, strictJson: true, context });

  try {
    return { data: parseAIJson(response.text, { context }), provider: response.provider, rawText: response.text };
  } catch (parseError) {
    console.warn(`[FitLife:AI:${context}] retrying after vision parse failure`, summarizeParseError(parseError));
    if (!options.repairPrompt) {
      if (options.fallbackValue !== undefined) {
        return { data: options.fallbackValue, provider: response.provider, rawText: response.text, fallbackUsed: true };
      }
      throw parseError;
    }

    const retryPrompt = `${prompt}\n\n${options.repairPrompt}`;
    const retryResponse = await generateVisionResponse(apiKey, retryPrompt, imageBase64, mimeType, { ...options, strictJson: true, context: `${context}:repair` });
    try {
      return { data: parseAIJson(retryResponse.text, { context: `${context}:repair` }), provider: retryResponse.provider, rawText: retryResponse.text };
    } catch (retryParseError) {
      console.error(`[FitLife:AI:${context}] repair parse failed`, summarizeParseError(retryParseError));
      if (options.fallbackValue !== undefined) {
        return { data: options.fallbackValue, provider: retryResponse.provider, rawText: retryResponse.text, fallbackUsed: true };
      }
      throw retryParseError;
    }
  }
}
