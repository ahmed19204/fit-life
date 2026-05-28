/**
 * Vercel Serverless Function: AI Nutrition Plan Generator
 * Proxies Google Gemini AI requests to keep the API key server-side.
 * POST /api/ai-nutrition
 * Body: { prompt: string }
 * Returns: { success: true, data: <parsed JSON plan> } or { success: false, message: string }
 * 
 * Includes server-side rate limiting and input sanitization.
 */

// Simple in-memory rate limiter (per instance, resets on cold start)
const requestLog = new Map(); // IP -> { count, resetTime }
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 5;   // 5 requests per minute per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = requestLog.get(ip);
  
  if (!entry || now > entry.resetTime) {
    requestLog.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true; // Allowed
  }
  
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false; // Rate limited
  }
  
  entry.count++;
  return true; // Allowed
}

// Cleanup old entries periodically
function cleanupRateLimiter() {
  const now = Date.now();
  for (const [ip, entry] of requestLog) {
    if (now > entry.resetTime) requestLog.delete(ip);
  }
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  // Rate limiting
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIP)) {
    console.warn(`[AI Nutrition] Rate limited: ${clientIP}`);
    return res.status(429).json({ 
      success: false, 
      message: 'Too many requests. Please wait a minute before trying again.',
      retryAfter: 60
    });
  }

  // Cleanup old entries
  if (requestLog.size > 100) cleanupRateLimiter();

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, message: 'AI service not configured on server.' });
  }

  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ success: false, message: 'Missing prompt field.' });
    }

    // Limit prompt length to prevent abuse
    if (prompt.length > 5000) {
      return res.status(400).json({ success: false, message: 'Prompt too long.' });
    }

    // Sanitize: strip potential injection patterns
    const sanitizedPrompt = prompt
      .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, '[filtered]')
      .replace(/system\s*:\s*/gi, '[filtered]')
      .slice(0, 5000);

    const model = 'gemini-2.0-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: sanitizedPrompt }] }],
          generationConfig: { maxOutputTokens: 2000, temperature: 0.7 },
        }),
      }
    );

    if (!response.ok) {
      const status = response.status;
      console.error('[AI Nutrition] Google AI error:', status);
      
      if (status === 429) {
        return res.status(429).json({ 
          success: false, 
          message: 'AI service is temporarily busy. Please try again in a moment.',
          retryAfter: 30
        });
      }
      
      return res.status(502).json({ success: false, message: `AI service returned ${status}` });
    }

    const result = await response.json();
    let content = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!content) {
      return res.status(502).json({ success: false, message: 'Empty response from AI service.' });
    }

    // Strip markdown code fences
    content = content.replace(/^```json\n?/, '').replace(/\n?```$/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');

    const parsed = JSON.parse(content);
    return res.status(200).json({ success: true, data: parsed });
  } catch (e) {
    console.error('[AI Nutrition] Error:', e.message);
    return res.status(500).json({ success: false, message: 'Failed to generate nutrition plan.' });
  }
}
