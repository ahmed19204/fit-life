/**
 * FitLife Development Server
 * Serves static files from dist/ AND handles /api/* serverless functions.
 * This mimics Vercel's routing behavior for local development.
 */
import express from 'express';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();

// Parse JSON bodies (needed for API endpoints, including large base64 images)
app.use(express.json({ limit: '15mb' }));

// CORS headers for all routes
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// ── API Routes ──────────────────────────────────────────────────────────────
// Dynamically import and mount Vercel-style serverless functions

async function loadHandler(modulePath) {
  const mod = await import(modulePath);
  return mod.default;
}

// Unified AI endpoint (multi-provider)
app.all('/api/ai-unified', async (req, res) => {
  try {
    const handler = await loadHandler('./api/ai-unified.js');
    await handler(req, res);
  } catch (e) {
    console.error('[Server] Error loading ai-unified:', e.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Individual AI endpoints (fallback compatibility)
app.all('/api/ai-chat', async (req, res) => {
  try {
    const handler = await loadHandler('./api/ai-chat.js');
    await handler(req, res);
  } catch (e) {
    console.error('[Server] Error loading ai-chat:', e.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.all('/api/ai-nutrition', async (req, res) => {
  try {
    const handler = await loadHandler('./api/ai-nutrition.js');
    await handler(req, res);
  } catch (e) {
    console.error('[Server] Error loading ai-nutrition:', e.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.all('/api/ai-food-analyze', async (req, res) => {
  try {
    const handler = await loadHandler('./api/ai-food-analyze.js');
    await handler(req, res);
  } catch (e) {
    console.error('[Server] Error loading ai-food-analyze:', e.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ── Static Files ────────────────────────────────────────────────────────────
// Serve dist/ for production build
app.use(express.static(resolve(__dirname, 'dist')));

// SPA fallback — serve index.html for all non-API routes
app.get('/{*path}', (req, res) => {
  res.sendFile(resolve(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[FitLife] Server running on http://0.0.0.0:${PORT}`);
  console.log(`[FitLife] API endpoints: /api/ai-unified, /api/ai-chat, /api/ai-nutrition, /api/ai-food-analyze`);
});
