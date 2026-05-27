/**
 * Vercel Serverless Function: AI Nutrition Plan Generator
 * Proxies Google Gemini AI requests to keep the API key server-side.
 * POST /api/ai-nutrition
 * Body: { prompt: string }
 * Returns: { success: true, data: <parsed JSON plan> } or { success: false, message: string }
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
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ success: false, message: 'Missing prompt field.' });
    }

    // Limit prompt length to prevent abuse
    if (prompt.length > 5000) {
      return res.status(400).json({ success: false, message: 'Prompt too long.' });
    }

    const model = 'gemini-2.0-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2000, temperature: 0.7 },
        }),
      }
    );

    if (!response.ok) {
      console.error('[AI Nutrition] Google AI error:', response.status);
      return res.status(502).json({ success: false, message: `AI service returned ${response.status}` });
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
