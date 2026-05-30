/**
 * Vercel Serverless Function: AI Food Analyzer
 * Supports BOTH image-based and text-based meal analysis via Gemini.
 * POST /api/ai-food-analyze
 * Body: { image?: string (base64), description?: string, mode: 'image'|'text' }
 * Returns: { success: true, data: { name, calories, protein, carbs, fat, foods, servingSize, summary } }
 * 
 * Includes server-side rate limiting, input sanitization, and prompt injection protection.
 */

const requestLog = new Map();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 8; // 8 analyses per minute per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = requestLog.get(ip);
  if (!entry || now > entry.resetTime) {
    requestLog.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  entry.count++;
  return true;
}

function cleanupRateLimiter() {
  const now = Date.now();
  for (const [ip, entry] of requestLog) {
    if (now > entry.resetTime) requestLog.delete(ip);
  }
}

function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, '[filtered]')
    .replace(/system\s*:\s*/gi, '[filtered]')
    .replace(/you\s+are\s+now\s+/gi, '[filtered]')
    .replace(/forget\s+(all\s+)?your\s+(previous\s+)?instructions/gi, '[filtered]')
    .slice(0, 2000);
}

const IMAGE_ANALYSIS_PROMPT = `You are a professional nutritionist analyzing a food image. 
Identify all foods visible and estimate their nutritional content.

Return ONLY a valid JSON object with this exact structure:
{"name":"Brief meal name","calories":number,"protein":number,"carbs":number,"fat":number,"foods":["food item 1","food item 2"],"servingSize":"estimated serving size","summary":"Brief 1-2 sentence description of the meal and its nutritional highlights","mealType":"Breakfast|Lunch|Dinner|Snack"}

Rules:
- Be accurate with calorie and macro estimates based on typical serving sizes
- List each distinct food item in the foods array
- Estimate serving size (e.g., "1 plate", "1 bowl", "250g")
- The summary should mention key nutritional highlights
- Determine the most likely meal type based on the foods
- ONLY return JSON, no markdown, no explanation`;

const TEXT_ANALYSIS_PROMPT = `You are a professional nutritionist analyzing a meal description.
The user described what they ate. Estimate the nutritional content.

Return ONLY a valid JSON object with this exact structure:
{"name":"Brief meal name","calories":number,"protein":number,"carbs":number,"fat":number,"foods":["ingredient 1","ingredient 2"],"servingSize":"estimated serving size","summary":"Brief 1-2 sentence description of the meal and its nutritional highlights","mealType":"Breakfast|Lunch|Dinner|Snack"}

Rules:
- Be accurate with calorie and macro estimates based on the described portions
- Break down the meal into individual ingredients in the foods array
- Estimate serving size based on the description
- The summary should mention key nutritional highlights
- Determine the most likely meal type based on the foods
- ONLY return JSON, no markdown, no explanation

User's meal description:`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIP)) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please wait a moment.', retryAfter: 30 });
  }
  if (requestLog.size > 100) cleanupRateLimiter();

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, message: 'AI service not configured on server.' });
  }

  try {
    const { image, description, mode } = req.body || {};

    if (mode === 'image') {
      if (!image || typeof image !== 'string') {
        return res.status(400).json({ success: false, message: 'Missing image data.' });
      }
      // Validate base64 — expect data:image/...;base64, prefix or raw base64
      const base64Match = image.match(/^data:image\/(jpeg|png|webp|gif);base64,(.+)$/);
      let imageData, mimeType;
      if (base64Match) {
        mimeType = `image/${base64Match[1]}`;
        imageData = base64Match[2];
      } else {
        // Assume raw base64 JPEG
        mimeType = 'image/jpeg';
        imageData = image;
      }

      // Limit image size (~10MB base64)
      if (imageData.length > 10 * 1024 * 1024) {
        return res.status(400).json({ success: false, message: 'Image too large. Max 10MB.' });
      }

      const model = 'gemini-2.5-flash';
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: IMAGE_ANALYSIS_PROMPT },
                { inlineData: { mimeType, data: imageData } }
              ]
            }],
            generationConfig: { maxOutputTokens: 1000, temperature: 0.4 },
          }),
        }
      );

      if (!response.ok) {
        const status = response.status;
        let errBody = '';
        try { errBody = await response.text(); } catch (_) {}
        console.error(`[AI Food Image] Google AI error: ${status}`, errBody.slice(0, 300));
        if (status === 429) {
          return res.status(429).json({ success: false, message: 'AI service busy. Try again shortly.', retryAfter: 30 });
        }
        return res.status(502).json({ success: false, message: `AI service returned ${status}` });
      }

      const result = await response.json();
      let content = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!content) return res.status(502).json({ success: false, message: 'Empty AI response.' });

      content = content.replace(/^```json\n?/, '').replace(/\n?```$/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
      const parsed = JSON.parse(content);
      return res.status(200).json({ success: true, data: parsed });

    } else if (mode === 'text') {
      if (!description || typeof description !== 'string') {
        return res.status(400).json({ success: false, message: 'Missing meal description.' });
      }

      const sanitized = sanitizeText(description);
      if (sanitized.length < 3) {
        return res.status(400).json({ success: false, message: 'Description too short.' });
      }

      const model = 'gemini-2.5-flash';
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: TEXT_ANALYSIS_PROMPT + '\n' + sanitized }] }],
            generationConfig: { maxOutputTokens: 1000, temperature: 0.4 },
          }),
        }
      );

      if (!response.ok) {
        const status = response.status;
        let errBody = '';
        try { errBody = await response.text(); } catch (_) {}
        console.error(`[AI Food Text] Google AI error: ${status}`, errBody.slice(0, 300));
        if (status === 429) {
          return res.status(429).json({ success: false, message: 'AI service busy. Try again shortly.', retryAfter: 30 });
        }
        return res.status(502).json({ success: false, message: `AI service returned ${status}` });
      }

      const result = await response.json();
      let content = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!content) return res.status(502).json({ success: false, message: 'Empty AI response.' });

      content = content.replace(/^```json\n?/, '').replace(/\n?```$/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
      const parsed = JSON.parse(content);
      return res.status(200).json({ success: true, data: parsed });

    } else {
      return res.status(400).json({ success: false, message: 'Invalid mode. Use "image" or "text".' });
    }

  } catch (e) {
    console.error('[AI Food Analyze] Error:', e.message);
    if (e instanceof SyntaxError) {
      return res.status(502).json({ success: false, message: 'AI returned invalid format. Please try again.' });
    }
    return res.status(500).json({ success: false, message: 'Food analysis failed.' });
  }
}
