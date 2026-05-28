/**
 * Vercel Serverless Function: AI Chat (Assistant/Coach)
 * Proxies Google Gemini AI chat requests to keep the API key server-side.
 * POST /api/ai-chat
 * Body: { contents: Array<{role, parts}> }
 * Returns: { success: true, text: string } or { success: false, message: string }
 * 
 * Includes server-side rate limiting and input sanitization.
 */

// Simple in-memory rate limiter (per instance, resets on cold start)
const requestLog = new Map(); // IP -> { count, resetTime }
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 10;  // 10 chat requests per minute per IP (more generous than nutrition)

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = requestLog.get(ip);
  
  if (!entry || now > entry.resetTime) {
    requestLog.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  entry.count++;
  return true;
}

function cleanupRateLimiter() {
  const now = Date.now();
  for (const [ip, entry] of requestLog) {
    if (now > entry.resetTime) requestLog.delete(ip);
  }
}

// Sanitize chat message contents to prevent prompt injection
function sanitizeContents(contents) {
  if (!Array.isArray(contents)) return [];
  return contents.slice(-20).map(item => {
    if (!item || typeof item !== 'object') return null;
    const role = item.role === 'model' ? 'model' : 'user';
    const parts = Array.isArray(item.parts) ? item.parts.map(p => {
      if (!p || typeof p !== 'object' || typeof p.text !== 'string') return null;
      // Sanitize text: strip injection patterns, limit length
      const text = p.text
        .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, '[filtered]')
        .replace(/system\s*:\s*/gi, '[filtered]')
        .replace(/you\s+are\s+now\s+/gi, '[filtered]')
        .replace(/forget\s+(all\s+)?your\s+(previous\s+)?instructions/gi, '[filtered]')
        .slice(0, 4000); // Max 4000 chars per message part
      return { text };
    }).filter(Boolean) : [];
    
    if (parts.length === 0) return null;
    return { role, parts };
  }).filter(Boolean);
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
    console.warn(`[AI Chat] Rate limited: ${clientIP}`);
    return res.status(429).json({ 
      success: false, 
      message: 'Too many requests. Please slow down and try again in a moment.',
      retryAfter: 30
    });
  }

  // Cleanup old entries periodically
  if (requestLog.size > 100) cleanupRateLimiter();

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, message: 'AI service not configured on server.' });
  }

  try {
    const { contents } = req.body || {};
    if (!Array.isArray(contents) || contents.length === 0) {
      return res.status(400).json({ success: false, message: 'Missing or empty contents array.' });
    }

    // Sanitize and validate all message contents
    const sanitized = sanitizeContents(contents);
    if (sanitized.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid message contents provided.' });
    }

    const model = 'gemini-2.0-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: sanitized,
          generationConfig: { maxOutputTokens: 800, temperature: 0.7 },
        }),
      }
    );

    if (!response.ok) {
      const status = response.status;
      console.error('[AI Chat] Google AI error:', status);
      
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
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      return res.status(502).json({ success: false, message: 'Empty response from AI service.' });
    }

    return res.status(200).json({ success: true, text });
  } catch (e) {
    console.error('[AI Chat] Error:', e.message);
    return res.status(500).json({ success: false, message: 'AI chat service error.' });
  }
}
