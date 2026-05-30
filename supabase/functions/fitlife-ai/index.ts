/**
 * FitLife AI — Unified Multi-Provider Edge Function
 * =================================================
 * Single Edge Function handling ALL AI operations with professional
 * multi-provider fallback: Gemini (primary) → OpenRouter (fallback).
 *
 * Endpoints (via `action` field):
 *   1. coach       — AI fitness/nutrition chat
 *   2. analyze-image — Food image analysis (Gemini Vision / OpenRouter Vision)
 *   3. analyze-text  — Text-based meal analysis
 *   4. recipe       — AI recipe generation from ingredients
 *   5. nutrition    — Personalized nutrition plan generation
 *
 * Security:
 *   - JWT verification via Supabase auth
 *   - API keys from Supabase Secrets (never exposed to frontend)
 *   - Prompt injection sanitization
 *   - Request timeout protection (AbortController)
 *
 * Provider Strategy:
 *   PRIMARY:  Google Gemini (gemini-1.5-flash)
 *   FALLBACK: OpenRouter (deepseek/deepseek-chat-v3-0324 for text,
 *             meta-llama/llama-3.2-11b-vision-instruct:free for images)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

// ─── CORS ────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_TEXT_MODEL = "deepseek/deepseek-chat-v3-0324";
const OPENROUTER_VISION_MODEL = "meta-llama/llama-3.2-11b-vision-instruct:free";

const REQUEST_TIMEOUT_MS = 30_000; // 30s per provider attempt
const MAX_PROMPT_LENGTH = 5000;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB base64

// ─── LOGGING ─────────────────────────────────────────────────────────────────

function log(level: string, action: string, msg: string, meta?: Record<string, unknown>) {
  const entry: Record<string, unknown> = { ts: new Date().toISOString(), level, action, msg };
  if (meta) Object.assign(entry, meta);
  console.log(JSON.stringify(entry));
}

// ─── SANITIZATION ────────────────────────────────────────────────────────────

function sanitizeText(text: string, maxLen = MAX_PROMPT_LENGTH): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, "[filtered]")
    .replace(/system\s*:\s*/gi, "[filtered]")
    .replace(/you\s+are\s+now\s+/gi, "[filtered]")
    .replace(/forget\s+(all\s+)?your\s+(previous\s+)?instructions/gi, "[filtered]")
    .slice(0, maxLen);
}

function sanitizeContents(contents: any[]): any[] {
  if (!Array.isArray(contents)) return [];
  return contents.slice(-20).map((item: any) => {
    if (!item || typeof item !== "object") return null;
    const role = item.role === "model" || item.role === "assistant" ? "model" : "user";
    const parts = Array.isArray(item.parts)
      ? item.parts.map((p: any) => {
          if (!p || typeof p !== "object" || typeof p.text !== "string") return null;
          return { text: sanitizeText(p.text, 4000) };
        }).filter(Boolean)
      : [];
    if (parts.length === 0) return null;
    return { role, parts };
  }).filter(Boolean);
}

// ─── RESPONSE HELPERS ────────────────────────────────────────────────────────

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, message: string, code?: string): Response {
  return jsonResponse({ success: false, message, code: code || "ERROR" }, status);
}

// ─── PROVIDER ERROR CLASSIFICATION ──────────────────────────────────────────

/** Returns true if the error is recoverable (should trigger fallback) */
function isRecoverableError(status: number): boolean {
  // Fallback ONLY for: 429 rate limit, 5xx server errors, timeout
  return status === 429 || status >= 500;
}

/** Returns true if the error should NOT trigger fallback */
function isClientError(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429;
}

// ─── TIMEOUT FETCH ──────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── JSON PARSING ───────────────────────────────────────────────────────────

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
}

function parseJSON(text: string): any {
  const cleaned = stripCodeFences(text);
  // Try parsing directly
  try { return JSON.parse(cleaned); } catch (_) { /* fall through */ }
  // Try extracting JSON object from text
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) { /* fall through */ }
  }
  throw new Error("Failed to parse JSON from AI response");
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER: GEMINI
// ═══════════════════════════════════════════════════════════════════════════

async function geminiGenerateText(
  apiKey: string,
  contents: any[],
  config: { maxTokens?: number; temperature?: number } = {},
): Promise<{ text: string; provider: string }> {
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
    const err: any = new Error(`Gemini returned ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const result = await res.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Empty Gemini response");

  return { text, provider: "gemini" };
}

async function geminiAnalyzeImage(
  apiKey: string,
  prompt: string,
  imageData: string,
  mimeType: string,
): Promise<{ text: string; provider: string }> {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: imageData } },
      ],
    }],
    generationConfig: { maxOutputTokens: 1000, temperature: 0.4 },
  };

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err: any = new Error(`Gemini Vision returned ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const result = await res.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Empty Gemini Vision response");

  return { text, provider: "gemini" };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER: OPENROUTER
// ═══════════════════════════════════════════════════════════════════════════

async function openrouterGenerateText(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  config: { model?: string; maxTokens?: number; temperature?: number } = {},
): Promise<{ text: string; provider: string }> {
  const model = config.model || OPENROUTER_TEXT_MODEL;
  const body = {
    model,
    messages,
    max_tokens: config.maxTokens || 2000,
    temperature: config.temperature ?? 0.7,
  };

  const res = await fetchWithTimeout(OPENROUTER_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://fitlife.app",
      "X-Title": "FitLife AI",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err: any = new Error(`OpenRouter returned ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const result = await res.json();
  const text = result?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty OpenRouter response");

  log("info", "openrouter", "Response received", {
    model,
    tokens: result?.usage?.total_tokens,
  });

  return { text, provider: `openrouter/${model}` };
}

async function openrouterAnalyzeImage(
  apiKey: string,
  prompt: string,
  imageBase64: string,
  mimeType: string,
): Promise<{ text: string; provider: string }> {
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;
  const body = {
    model: OPENROUTER_VISION_MODEL,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    }],
    max_tokens: 1000,
    temperature: 0.4,
  };

  const res = await fetchWithTimeout(OPENROUTER_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://fitlife.app",
      "X-Title": "FitLife AI",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err: any = new Error(`OpenRouter Vision returned ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const result = await res.json();
  const text = result?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty OpenRouter Vision response");

  return { text, provider: `openrouter/${OPENROUTER_VISION_MODEL}` };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER ROUTER — Professional Fallback Logic
// ═══════════════════════════════════════════════════════════════════════════

interface ProviderResult {
  text: string;
  provider: string;
}

/** Convert Gemini chat format → OpenRouter messages format */
function geminiToOpenRouterMessages(
  contents: any[],
): Array<{ role: string; content: string }> {
  return contents.map((c: any) => ({
    role: c.role === "model" ? "assistant" : "user",
    content: c.parts?.map((p: any) => p.text).join("\n") || "",
  }));
}

async function routeTextRequest(
  geminiKey: string,
  openrouterKey: string,
  contents: any[],
  config: { maxTokens?: number; temperature?: number; action: string },
): Promise<ProviderResult> {
  // 1. Try Gemini (primary)
  try {
    log("info", config.action, "Attempting Gemini", { model: GEMINI_MODEL });
    const result = await geminiGenerateText(geminiKey, contents, config);
    log("info", config.action, "Gemini succeeded", { provider: result.provider });
    return result;
  } catch (err: any) {
    log("warn", config.action, "Gemini failed", {
      status: err.status,
      message: err.message,
    });

    // Do NOT fallback for client errors (400, 401, 403)
    if (err.status && isClientError(err.status)) {
      throw err;
    }

    // 2. Fallback to OpenRouter for recoverable errors
    if (!openrouterKey) throw err;

    log("info", config.action, "Falling back to OpenRouter", {
      model: OPENROUTER_TEXT_MODEL,
      reason: err.message,
    });

    const messages = geminiToOpenRouterMessages(contents);
    return await openrouterGenerateText(openrouterKey, messages, config);
  }
}

async function routeImageRequest(
  geminiKey: string,
  openrouterKey: string,
  prompt: string,
  imageData: string,
  mimeType: string,
  action: string,
): Promise<ProviderResult> {
  // 1. Try Gemini Vision (primary)
  try {
    log("info", action, "Attempting Gemini Vision", {
      model: GEMINI_MODEL,
      imageSize: `${(imageData.length / 1024).toFixed(0)}KB`,
    });
    const result = await geminiAnalyzeImage(geminiKey, prompt, imageData, mimeType);
    log("info", action, "Gemini Vision succeeded", { provider: result.provider });
    return result;
  } catch (err: any) {
    log("warn", action, "Gemini Vision failed", {
      status: err.status,
      message: err.message,
    });

    if (err.status && isClientError(err.status)) {
      throw err;
    }

    // 2. Fallback to OpenRouter Vision
    if (!openrouterKey) throw err;

    log("info", action, "Falling back to OpenRouter Vision", {
      model: OPENROUTER_VISION_MODEL,
      reason: err.message,
    });

    return await openrouterAnalyzeImage(openrouterKey, prompt, imageData, mimeType);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

const IMAGE_ANALYSIS_PROMPT = `You are a professional nutritionist analyzing a food image. 
Identify all foods visible and estimate their nutritional content.

Return ONLY a valid JSON object with this exact structure:
{"name":"Brief meal name","calories":number,"protein":number,"carbs":number,"fat":number,"foods":["food item 1","food item 2"],"servingSize":"estimated serving size","summary":"Brief 1-2 sentence description","mealType":"Breakfast|Lunch|Dinner|Snack"}

Rules:
- Be accurate with calorie and macro estimates based on typical serving sizes
- List each distinct food item in the foods array
- Estimate serving size (e.g., "1 plate", "1 bowl", "250g")
- ONLY return JSON, no markdown, no explanation`;

const TEXT_ANALYSIS_PROMPT = `You are a professional nutritionist analyzing a meal description.
Estimate the nutritional content based on what the user described eating.

Return ONLY a valid JSON object with this exact structure:
{"name":"Brief meal name","calories":number,"protein":number,"carbs":number,"fat":number,"foods":["ingredient 1","ingredient 2"],"servingSize":"estimated serving size","summary":"Brief 1-2 sentence description","mealType":"Breakfast|Lunch|Dinner|Snack"}

Rules:
- Be accurate with calorie and macro estimates
- Break down the meal into individual ingredients
- ONLY return JSON, no markdown, no explanation

User's meal description:`;

// ═══════════════════════════════════════════════════════════════════════════
// ACTION HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

// ── 1. AI Coach ──────────────────────────────────────────────────────────

async function handleCoach(
  body: any,
  geminiKey: string,
  openrouterKey: string,
): Promise<Response> {
  const { contents } = body;
  if (!Array.isArray(contents) || contents.length === 0) {
    return errorResponse(400, "Missing or empty contents array.", "INVALID_PAYLOAD");
  }

  const sanitized = sanitizeContents(contents);
  if (sanitized.length === 0) {
    return errorResponse(400, "No valid message contents.", "INVALID_PAYLOAD");
  }

  const result = await routeTextRequest(geminiKey, openrouterKey, sanitized, {
    maxTokens: 800,
    temperature: 0.7,
    action: "coach",
  });

  return jsonResponse({ success: true, text: result.text, provider: result.provider });
}

// ── 2. Image Analysis ────────────────────────────────────────────────────

async function handleAnalyzeImage(
  body: any,
  geminiKey: string,
  openrouterKey: string,
): Promise<Response> {
  const { image } = body;
  if (!image || typeof image !== "string") {
    return errorResponse(400, "Missing image data.", "INVALID_PAYLOAD");
  }

  // Parse base64
  const base64Match = image.match(/^data:image\/(jpeg|png|webp|gif);base64,(.+)$/);
  let imageData: string, mimeType: string;
  if (base64Match) {
    mimeType = `image/${base64Match[1]}`;
    imageData = base64Match[2];
  } else {
    mimeType = "image/jpeg";
    imageData = image;
  }

  if (imageData.length > MAX_IMAGE_SIZE) {
    return errorResponse(400, "Image too large. Max 10MB.", "IMAGE_TOO_LARGE");
  }

  log("info", "analyze-image", "Processing image", {
    mimeType,
    sizeKB: Math.round(imageData.length / 1024),
  });

  const result = await routeImageRequest(
    geminiKey,
    openrouterKey,
    IMAGE_ANALYSIS_PROMPT,
    imageData,
    mimeType,
    "analyze-image",
  );

  const parsed = parseJSON(result.text);
  return jsonResponse({ success: true, data: parsed, provider: result.provider });
}

// ── 3. Text Analysis ─────────────────────────────────────────────────────

async function handleAnalyzeText(
  body: any,
  geminiKey: string,
  openrouterKey: string,
): Promise<Response> {
  const { description } = body;
  if (!description || typeof description !== "string") {
    return errorResponse(400, "Missing meal description.", "INVALID_PAYLOAD");
  }

  const sanitized = sanitizeText(description, 2000);
  if (sanitized.length < 3) {
    return errorResponse(400, "Description too short.", "INVALID_PAYLOAD");
  }

  const contents = [{ role: "user", parts: [{ text: TEXT_ANALYSIS_PROMPT + "\n" + sanitized }] }];

  const result = await routeTextRequest(geminiKey, openrouterKey, contents, {
    maxTokens: 1000,
    temperature: 0.4,
    action: "analyze-text",
  });

  const parsed = parseJSON(result.text);
  return jsonResponse({ success: true, data: parsed, provider: result.provider });
}

// ── 4. Recipe Generator ──────────────────────────────────────────────────

async function handleRecipe(
  body: any,
  geminiKey: string,
  openrouterKey: string,
): Promise<Response> {
  const { ingredients, profile } = body;
  if (!ingredients || typeof ingredients !== "string" || ingredients.trim().length < 3) {
    return errorResponse(400, "Please provide some ingredients.", "INVALID_PAYLOAD");
  }

  const diet = profile?.diet_type || "balanced";
  const goal = profile?.goal || "improve-health";
  const restrictions = (profile?.restrictions || []).join(", ") || "none";

  const prompt = `You are a professional chef and nutritionist. Create a recipe using these ingredients: ${sanitizeText(ingredients.trim(), 500)}.
User profile: Diet: ${diet}, Goal: ${goal}, Restrictions: ${restrictions}.

Return ONLY valid JSON:
{"name":"Recipe name","prepTime":"X min","cookTime":"X min","servings":number,"calories":number,"protein":number,"carbs":number,"fat":number,"ingredients":["amount ingredient"],"instructions":["step 1","step 2"],"tips":"Optional cooking tip"}

Keep it practical and healthy. ONLY JSON, no markdown.`;

  const contents = [{ role: "user", parts: [{ text: prompt }] }];

  const result = await routeTextRequest(geminiKey, openrouterKey, contents, {
    maxTokens: 2000,
    temperature: 0.7,
    action: "recipe",
  });

  const parsed = parseJSON(result.text);
  return jsonResponse({ success: true, data: parsed, provider: result.provider });
}

// ── 5. Nutrition Plan ────────────────────────────────────────────────────

async function handleNutrition(
  body: any,
  geminiKey: string,
  openrouterKey: string,
): Promise<Response> {
  const { prompt, input } = body;

  // Support both prompt-based (legacy) and structured input
  let finalPrompt: string;
  if (prompt && typeof prompt === "string") {
    finalPrompt = sanitizeText(prompt);
  } else if (input && typeof input === "object") {
    const i = input;
    const diet = (i.restrictions?.length > 0) ? `Dietary restrictions: ${i.restrictions.join(", ")}.` : "No dietary restrictions.";
    const health = (i.health_conditions?.length > 0 && !i.health_conditions.includes("none"))
      ? `Health considerations: ${i.health_conditions.join(", ")}.`
      : "No specific health conditions.";
    finalPrompt = `You are a professional nutritionist creating a personalized meal plan.

User Profile:
- Age: ${i.age}, Weight: ${i.weight}kg, Height: ${i.height}cm
- Goal: ${(i.goal || "").replace(/-/g, " ")}, Activity: ${(i.activity_level || "").replace(/-/g, " ")}
- Diet: ${i.diet_type || "balanced"}, ${diet} ${health}
- Meals/day: ${i.meals_per_day || 3}

Return ONLY a JSON object:
{"calories":number,"protein":number,"carbs":number,"fat":number,"meal_plan":[{"name":"string","calories":number,"protein":number,"carbs":number,"fat":number,"foods":["string"]}]}

Requirements: Mifflin-St Jeor + activity multiplier + goal adjustment. ${i.meals_per_day || 3} meals. 2-4 foods per meal. ONLY JSON, no markdown.`;
  } else {
    return errorResponse(400, "Missing prompt or input data.", "INVALID_PAYLOAD");
  }

  if (finalPrompt.length < 10) {
    return errorResponse(400, "Prompt too short.", "INVALID_PAYLOAD");
  }

  const contents = [{ role: "user", parts: [{ text: finalPrompt }] }];

  const result = await routeTextRequest(geminiKey, openrouterKey, contents, {
    maxTokens: 2000,
    temperature: 0.7,
    action: "nutrition",
  });

  const parsed = parseJSON(result.text);
  return jsonResponse({ success: true, data: parsed, provider: result.provider });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }

  // ── JWT Verification ───────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse(401, "Missing authorization token", "AUTH_REQUIRED");
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !supabaseServiceKey) {
    log("error", "init", "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return errorResponse(500, "Server configuration error");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    log("warn", "auth", "JWT verification failed", { error: authError?.message });
    return errorResponse(401, "Invalid or expired token", "AUTH_INVALID");
  }

  // ── Load API Keys ─────────────────────────────────────────────────────
  const geminiKey = Deno.env.get("GEMINI_API_KEY") || "";
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY") || "";

  if (!geminiKey) {
    log("error", "init", "GEMINI_API_KEY not configured");
    return errorResponse(500, "AI service not configured");
  }

  // ── Parse Request Body ────────────────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Invalid JSON body", "INVALID_JSON");
  }

  const action = body?.action;
  if (!action || typeof action !== "string") {
    return errorResponse(400, "Missing 'action' field. Use: coach, analyze-image, analyze-text, recipe, nutrition", "MISSING_ACTION");
  }

  log("info", action, "Request received", { userId: user.id.slice(0, 8) });

  // ── Route to Handler ──────────────────────────────────────────────────
  try {
    switch (action) {
      case "coach":
        return await handleCoach(body, geminiKey, openrouterKey);
      case "analyze-image":
        return await handleAnalyzeImage(body, geminiKey, openrouterKey);
      case "analyze-text":
        return await handleAnalyzeText(body, geminiKey, openrouterKey);
      case "recipe":
        return await handleRecipe(body, geminiKey, openrouterKey);
      case "nutrition":
        return await handleNutrition(body, geminiKey, openrouterKey);
      default:
        return errorResponse(400, `Unknown action: ${action}. Use: coach, analyze-image, analyze-text, recipe, nutrition`, "UNKNOWN_ACTION");
    }
  } catch (err: any) {
    // ── Top-Level Error Handler ────────────────────────────────────────
    const status = err.status || 500;

    log("error", action, "Request failed", {
      status,
      message: err.message,
      name: err.name,
    });

    if (err.name === "AbortError") {
      return errorResponse(504, "AI request timed out. Please try again.", "TIMEOUT");
    }

    if (status === 429) {
      return jsonResponse(
        { success: false, message: "AI service busy. Please try again shortly.", retryAfter: 30 },
        429,
      );
    }

    if (err instanceof SyntaxError || err.message?.includes("parse")) {
      return errorResponse(502, "AI returned invalid format. Please try again.", "PARSE_ERROR");
    }

    return errorResponse(
      status >= 500 ? 502 : status,
      err.message || "AI service error",
      "PROVIDER_ERROR",
    );
  }
});
