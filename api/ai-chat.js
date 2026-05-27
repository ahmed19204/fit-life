/**
 * Vercel Serverless Function: AI Chat (Assistant/Coach)
 * Proxies Google Gemini AI chat requests to keep the API key server-side.
 * POST /api/ai-chat
 * Body: { contents: Array<{role, parts}> }
 * Returns: { success: true, text: string } or { success: false, message: string }
 */
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, message: 'AI service not configured on server.' });
  }

  try {
    const { contents } = req.body || {};
    if (!Array.isArray(contents) || contents.length === 0) {
      return res.status(400).json({ success: false, message: 'Missing or empty contents array.' });
    }

    // Limit to 20 messages to prevent abuse
    const trimmed = contents.slice(-20);

    const model = 'gemini-2.0-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: trimmed,
          generationConfig: { maxOutputTokens: 800, temperature: 0.7 },
        }),
      }
    );

    if (!response.ok) {
      console.error('[AI Chat] Google AI error:', response.status);
      return res.status(502).json({ success: false, message: `AI service returned ${response.status}` });
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
