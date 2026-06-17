/**
 * FitLife Development Server
 * Serves static files from dist/ for local development.
 *
 * AI endpoints have been migrated to Supabase Edge Functions.
 * The frontend calls them via supabase.functions.invoke() — no Express proxy needed.
 */
import express from 'express';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();

// Parse JSON bodies (kept for any future non-AI endpoints)
app.use(express.json({ limit: '15mb' }));

// CORS headers for all routes
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
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
  console.log(`[FitLife] AI calls route through Supabase Edge Functions (no local proxy).`);
});
