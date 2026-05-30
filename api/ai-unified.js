/**
 * FitLife AI — Unified Multi-Provider Serverless Function
 * ========================================================
 * Single endpoint handling ALL 5 AI operations with professional
 * multi-provider fallback: Gemini (primary) → OpenRouter (fallback).
 *
 * POST /api/ai-unified
 * Body: { action: "coach"|"analyze-image"|"analyze-text"|"recipe"|"nutrition", ...payload }
 *
 * Provider Strategy:
 *   PRIMARY:  Google Gemini (gemini-1.5-flash)
 *   FALLBACK: OpenRouter (deepseek-chat-v3 for text, llama-3.2-vision for images)
 *
 * Fallback Rules:
 *   ONLY on: 429 rate limit, timeout, 5xx server errors
 *   NOT on:  400/401/403 client errors, invalid payload
 *
 * Security:
 *   - API keys from environment variables (GEMINI_API_KEY, OPENROUTER_API_KEY)
 *   - Prompt injection sanitization
 *   - Rate limiting (per IP, per minute)
 *   - Request timeout protection (AbortController)
 */

// ─── CONFIG ─────────────────────────────────────────────────────────────────

const GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_TEXT_MODEL = 'deepseek/deepseek-chat-v3-0324';
const OPENROUTER_VISION_MODEL = 'meta-llama/llama-3.2-11b-vision-instruct:free';

const REQUEST_TIMEOUT_MS = 30000; // 30s per provider attempt
const MAX_PROMPT_LENGTH = 5000;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB base64

// ─── RATE LIMITING ──────────────────────────────────────────────────────────

const requestLog = new Map();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX = 12; // 12 requests/min/IP across all actions

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = requestLog.get(ip);
  if (!entry || now > entry.resetTime) {
    requestLog.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

function cleanupRateLimiter() {
  const now = Date.now();
  for (const [ip, entry] of requestLog) {
    if (now > entry.resetTime) requestLog.delete(ip);
  }
}

// ─── LOGGING ────────────────────────────────────────────────────────────────

function log(level, action, msg, meta) {
  const entry = { ts: new Date().toISOString(), level, action, msg };
  if (meta) Object.assign(entry, meta);
  console.log(JSON.stringify(entry));
}

// ─── SANITIZATION ───────────────────────────────────────────────────────────

function sanitizeText(text, maxLen = MAX_PROMPT_LENGTH) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, '[filtered]')
    .replace(/system\s*:\s*/gi, '[filtered]')
    .replace(/you\s+are\s+now\s+/gi, '[filtered]')
    .replace(/forget\s+(all\s+)?your\s+(previous\s+)?instructions/gi, '[filtered]')
    .slice(0, maxLen);
}

function sanitizeContents(contents) {
  if (!Array.isArray(contents)) return [];
  return contents.slice(-20).map(item => {
    if (!item || typeof item !== 'object') return null;
    const role = item.role === 'model' || item.role === 'assistant' ? 'model' : 'user';
    const parts = Array.isArray(item.parts)
      ? item.parts.map(p => {
          if (!p || typeof p !== 'object' || typeof p.text !== 'string') return null;
          return { text: sanitizeText(p.text, 4000) };
        }).filter(Boolean)
      : [];
    if (parts.length === 0) return null;
    return { role, parts };
  }).filter(Boolean);
}

// ─── ERROR CLASSIFICATION ───────────────────────────────────────────────────

function isRecoverableError(status) {
  return status === 429 || status >= 500;
}

function isClientError(status) {
  return status >= 400 && status < 500 && status !== 429;
}

// ─── TIMEOUT FETCH ──────────────────────────────────────────────────────────

async function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
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

function stripCodeFences(text) {
  return text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
}

function parseJSON(text) {
  const cleaned = stripCodeFences(text);
  try { return JSON.parse(cleaned); } catch (_) { /* fall through */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) { /* fall through */ }
  }
  throw new Error('Failed to parse JSON from AI response');
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER: GEMINI
// ═══════════════════════════════════════════════════════════════════════════

async function geminiGenerateText(apiKey, contents, config = {}) {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: config.maxTokens || 2000,
      temperature: config.temperature ?? 0.7,
    },
  };

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = new Error(`Gemini returned ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const result = await res.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Empty Gemini response');

  return { text, provider: 'gemini' };
}

async function geminiAnalyzeImage(apiKey, prompt, imageData, mimeType) {
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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = new Error(`Gemini Vision returned ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const result = await res.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Empty Gemini Vision response');

  return { text, provider: 'gemini' };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER: OPENROUTER
// ═══════════════════════════════════════════════════════════════════════════

async function openrouterGenerateText(apiKey, messages, config = {}) {
  const model = config.model || OPENROUTER_TEXT_MODEL;
  const body = {
    model,
    messages,
    max_tokens: config.maxTokens || 2000,
    temperature: config.temperature ?? 0.7,
  };

  const res = await fetchWithTimeout(OPENROUTER_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://fitlife.app',
      'X-Title': 'FitLife AI',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = new Error(`OpenRouter returned ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const result = await res.json();
  const text = result?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty OpenRouter response');

  log('info', 'openrouter', 'Response received', {
    model,
    tokens: result?.usage?.total_tokens,
  });

  return { text, provider: `openrouter/${model}` };
}

async function openrouterAnalyzeImage(apiKey, prompt, imageBase64, mimeType) {
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;
  const body = {
    model: OPENROUTER_VISION_MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    }],
    max_tokens: 1000,
    temperature: 0.4,
  };

  const res = await fetchWithTimeout(OPENROUTER_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://fitlife.app',
      'X-Title': 'FitLife AI',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = new Error(`OpenRouter Vision returned ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const result = await res.json();
  const text = result?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty OpenRouter Vision response');

  return { text, provider: `openrouter/${OPENROUTER_VISION_MODEL}` };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER ROUTER — Professional Fallback Logic
// ═══════════════════════════════════════════════════════════════════════════

function geminiToOpenRouterMessages(contents) {
  return contents.map(c => ({
    role: c.role === 'model' ? 'assistant' : 'user',
    content: c.parts?.map(p => p.text).join('\n') || '',
  }));
}

async function routeTextRequest(geminiKey, openrouterKey, contents, config) {
  // 1. Try Gemini (primary)
  try {
    log('info', config.action, 'Attempting Gemini', { model: GEMINI_MODEL });
    const result = await geminiGenerateText(geminiKey, contents, config);
    log('info', config.action, 'Gemini succeeded', { provider: result.provider });
    return result;
  } catch (err) {
    log('warn', config.action, 'Gemini failed', { status: err.status, message: err.message });

    // Do NOT fallback for client errors (400, 401, 403)
    if (err.status && isClientError(err.status)) {
      throw err;
    }

    // 2. Fallback to OpenRouter for recoverable errors
    if (!openrouterKey) throw err;

    log('info', config.action, 'Falling back to OpenRouter', {
      model: OPENROUTER_TEXT_MODEL,
      reason: err.message,
    });

    const messages = geminiToOpenRouterMessages(contents);
    return await openrouterGenerateText(openrouterKey, messages, config);
  }
}

async function routeImageRequest(geminiKey, openrouterKey, prompt, imageData, mimeType, action) {
  // 1. Try Gemini Vision (primary)
  try {
    log('info', action, 'Attempting Gemini Vision', {
      model: GEMINI_MODEL,
      imageSize: `${Math.round(imageData.length / 1024)}KB`,
    });
    const result = await geminiAnalyzeImage(geminiKey, prompt, imageData, mimeType);
    log('info', action, 'Gemini Vision succeeded', { provider: result.provider });
    return result;
  } catch (err) {
    log('warn', action, 'Gemini Vision failed', { status: err.status, message: err.message });

    if (err.status && isClientError(err.status)) {
      throw err;
    }

    // 2. Fallback to OpenRouter Vision
    if (!openrouterKey) throw err;

    log('info', action, 'Falling back to OpenRouter Vision', {
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

// ── 1. AI Coach ─────────────────────────────────────────────────────────────

async function handleCoach(body, geminiKey, openrouterKey) {
  const { contents } = body;
  if (!Array.isArray(contents) || contents.length === 0) {
    return { status: 400, body: { success: false, message: 'Missing or empty contents array.', code: 'INVALID_PAYLOAD' } };
  }

  const sanitized = sanitizeContents(contents);
  if (sanitized.length === 0) {
    return { status: 400, body: { success: false, message: 'No valid message contents.', code: 'INVALID_PAYLOAD' } };
  }

  const result = await routeTextRequest(geminiKey, openrouterKey, sanitized, {
    maxTokens: 800,
    temperature: 0.7,
    action: 'coach',
  });

  return { status: 200, body: { success: true, text: result.text, provider: result.provider } };
}

// ── 2. Image Analysis ───────────────────────────────────────────────────────

async function handleAnalyzeImage(body, geminiKey, openrouterKey) {
  const { image } = body;
  if (!image || typeof image !== 'string') {
    return { status: 400, body: { success: false, message: 'Missing image data.', code: 'INVALID_PAYLOAD' } };
  }

  const base64Match = image.match(/^data:image\/(jpeg|png|webp|gif);base64,(.+)$/);
  let imageData, mimeType;
  if (base64Match) {
    mimeType = `image/${base64Match[1]}`;
    imageData = base64Match[2];
  } else {
    mimeType = 'image/jpeg';
    imageData = image;
  }

  if (imageData.length > MAX_IMAGE_SIZE) {
    return { status: 400, body: { success: false, message: 'Image too large. Max 10MB.', code: 'IMAGE_TOO_LARGE' } };
  }

  log('info', 'analyze-image', 'Processing image', {
    mimeType,
    sizeKB: Math.round(imageData.length / 1024),
  });

  const result = await routeImageRequest(
    geminiKey, openrouterKey,
    IMAGE_ANALYSIS_PROMPT,
    imageData, mimeType,
    'analyze-image',
  );

  const parsed = parseJSON(result.text);
  return { status: 200, body: { success: true, data: parsed, provider: result.provider } };
}

// ── 3. Text Analysis ────────────────────────────────────────────────────────

async function handleAnalyzeText(body, geminiKey, openrouterKey) {
  const { description } = body;
  if (!description || typeof description !== 'string') {
    return { status: 400, body: { success: false, message: 'Missing meal description.', code: 'INVALID_PAYLOAD' } };
  }

  const sanitized = sanitizeText(description, 2000);
  if (sanitized.length < 3) {
    return { status: 400, body: { success: false, message: 'Description too short.', code: 'INVALID_PAYLOAD' } };
  }

  const contents = [{ role: 'user', parts: [{ text: TEXT_ANALYSIS_PROMPT + '\n' + sanitized }] }];

  const result = await routeTextRequest(geminiKey, openrouterKey, contents, {
    maxTokens: 1000,
    temperature: 0.4,
    action: 'analyze-text',
  });

  const parsed = parseJSON(result.text);
  return { status: 200, body: { success: true, data: parsed, provider: result.provider } };
}

// ── 4. Recipe Generator ────────────────────────────────────────────────────

async function handleRecipe(body, geminiKey, openrouterKey) {
  const { ingredients, profile } = body;
  if (!ingredients || typeof ingredients !== 'string' || ingredients.trim().length < 3) {
    return { status: 400, body: { success: false, message: 'Please provide some ingredients.', code: 'INVALID_PAYLOAD' } };
  }

  const diet = profile?.diet_type || 'balanced';
  const goal = profile?.goal || 'improve-health';
  const restrictions = (profile?.restrictions || []).join(', ') || 'none';

  const prompt = `You are a professional chef and nutritionist. Create a recipe using these ingredients: ${sanitizeText(ingredients.trim(), 500)}.
User profile: Diet: ${diet}, Goal: ${goal}, Restrictions: ${restrictions}.

Return ONLY valid JSON:
{"name":"Recipe name","prepTime":"X min","cookTime":"X min","servings":number,"calories":number,"protein":number,"carbs":number,"fat":number,"ingredients":["amount ingredient"],"instructions":["step 1","step 2"],"tips":"Optional cooking tip"}

Keep it practical and healthy. ONLY JSON, no markdown.`;

  const contents = [{ role: 'user', parts: [{ text: prompt }] }];

  const result = await routeTextRequest(geminiKey, openrouterKey, contents, {
    maxTokens: 2000,
    temperature: 0.7,
    action: 'recipe',
  });

  const parsed = parseJSON(result.text);
  return { status: 200, body: { success: true, data: parsed, provider: result.provider } };
}

// ── 5. Nutrition Plan ──────────────────────────────────────────────────────

async function handleNutrition(body, geminiKey, openrouterKey) {
  const { prompt, input } = body;

  let finalPrompt;
  if (prompt && typeof prompt === 'string') {
    finalPrompt = sanitizeText(prompt);
  } else if (input && typeof input === 'object') {
    const i = input;
    const diet = (i.restrictions?.length > 0) ? `Dietary restrictions: ${i.restrictions.join(', ')}.` : 'No dietary restrictions.';
    const health = (i.health_conditions?.length > 0 && !i.health_conditions.includes('none'))
      ? `Health considerations: ${i.health_conditions.join(', ')}.`
      : 'No specific health conditions.';
    finalPrompt = `You are a professional nutritionist creating a personalized meal plan.

User Profile:
- Age: ${i.age}, Weight: ${i.weight}kg, Height: ${i.height}cm
- Goal: ${(i.goal || '').replace(/-/g, ' ')}, Activity: ${(i.activity_level || '').replace(/-/g, ' ')}
- Diet: ${i.diet_type || 'balanced'}, ${diet} ${health}
- Meals/day: ${i.meals_per_day || 3}

Return ONLY a JSON object:
{"calories":number,"protein":number,"carbs":number,"fat":number,"meal_plan":[{"name":"string","calories":number,"protein":number,"carbs":number,"fat":number,"foods":["string"]}]}

Requirements: Mifflin-St Jeor + activity multiplier + goal adjustment. ${i.meals_per_day || 3} meals. 2-4 foods per meal. ONLY JSON, no markdown.`;
  } else {
    return { status: 400, body: { success: false, message: 'Missing prompt or input data.', code: 'INVALID_PAYLOAD' } };
  }

  if (finalPrompt.length < 10) {
    return { status: 400, body: { success: false, message: 'Prompt too short.', code: 'INVALID_PAYLOAD' } };
  }

  const contents = [{ role: 'user', parts: [{ text: finalPrompt }] }];

  const result = await routeTextRequest(geminiKey, openrouterKey, contents, {
    maxTokens: 2000,
    temperature: 0.7,
    action: 'nutrition',
  });

  const parsed = parseJSON(result.text);
  return { status: 200, body: { success: true, data: parsed, provider: result.provider } };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  // Rate limiting
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIP)) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please slow down.',
      retryAfter: 30,
    });
  }
  if (requestLog.size > 100) cleanupRateLimiter();

  // Load API keys from environment
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (!geminiKey) {
    return res.status(500).json({ success: false, message: 'AI service not configured.' });
  }

  // Parse request
  const body = req.body || {};
  const action = body.action;

  if (!action || typeof action !== 'string') {
    return res.status(400).json({
      success: false,
      message: "Missing 'action' field. Use: coach, analyze-image, analyze-text, recipe, nutrition",
      code: 'MISSING_ACTION',
    });
  }

  log('info', action, 'Request received', { ip: clientIP.slice(0, 8) + '...' });

  try {
    let result;
    switch (action) {
      case 'coach':
        result = await handleCoach(body, geminiKey, openrouterKey);
        break;
      case 'analyze-image':
        result = await handleAnalyzeImage(body, geminiKey, openrouterKey);
        break;
      case 'analyze-text':
        result = await handleAnalyzeText(body, geminiKey, openrouterKey);
        break;
      case 'recipe':
        result = await handleRecipe(body, geminiKey, openrouterKey);
        break;
      case 'nutrition':
        result = await handleNutrition(body, geminiKey, openrouterKey);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: `Unknown action: ${action}. Use: coach, analyze-image, analyze-text, recipe, nutrition`,
          code: 'UNKNOWN_ACTION',
        });
    }

    return res.status(result.status).json(result.body);
  } catch (err) {
    const status = err.status || 500;

    log('error', action, 'Request failed', {
      status,
      message: err.message,
      name: err.name,
    });

    if (err.name === 'AbortError') {
      return res.status(504).json({ success: false, message: 'AI request timed out. Please try again.', code: 'TIMEOUT' });
    }

    if (status === 429) {
      return res.status(429).json({ success: false, message: 'AI service busy. Please try again shortly.', retryAfter: 30 });
    }

    if (err instanceof SyntaxError || err.message?.includes('parse')) {
      return res.status(502).json({ success: false, message: 'AI returned invalid format. Please try again.', code: 'PARSE_ERROR' });
    }

    return res.status(status >= 500 ? 502 : status).json({
      success: false,
      message: err.message || 'AI service error',
      code: 'PROVIDER_ERROR',
    });
  }
}
