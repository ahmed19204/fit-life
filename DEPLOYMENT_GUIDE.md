# FitLife Deployment Guide

**Target Platform:** Vercel
**Date:** 2026-05-27

---

## Prerequisites

1. **Node.js** 18+ installed
2. **Vercel CLI** (`npm i -g vercel`) or Vercel Dashboard account
3. **Supabase project** with tables created (see SUPABASE_REQUIRED_STEPS.md)
4. **Google AI API key** for Gemini AI features

## Environment Variables

### Set in Vercel Dashboard (Settings → Environment Variables)

| Variable | Scope | Description |
|----------|-------|-------------|
| `VITE_SUPABASE_URL` | All | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | All | Supabase anonymous/public key |
| `VITE_APP_URL` | Production | Production URL (e.g., https://fitlife.vercel.app) |
| `GOOGLE_AI_API_KEY` | All | Google Gemini API key (server-side only!) |

**IMPORTANT:** `GOOGLE_AI_API_KEY` does NOT have the `VITE_` prefix — it is server-side only and used by the `/api/` serverless functions.

## Deploy via CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy (first time — follow prompts)
vercel

# Deploy to production
vercel --prod
```

## Deploy via Git (Recommended)

1. Push code to GitHub
2. Connect repo in Vercel Dashboard → New Project
3. Set environment variables
4. Auto-deploys on push to `main`

## Deploy via Vercel Dashboard

1. Go to https://vercel.com/new
2. Import your Git repository
3. Framework: **Vite**
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Set environment variables
7. Deploy

## Post-Deployment Verification

```bash
# Test main page
curl https://your-app.vercel.app

# Test API proxy
curl -X POST https://your-app.vercel.app/api/ai-chat \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"hello"}]}]}'

# Test manifest
curl https://your-app.vercel.app/manifest.json
```

## Project Structure for Vercel

```
webapp/
├── api/                    ← Vercel Serverless Functions
│   ├── ai-nutrition.js     ← POST /api/ai-nutrition
│   └── ai-chat.js          ← POST /api/ai-chat
├── dist/                   ← Build output (auto-generated)
├── src/                    ← Source code (Vite builds this)
├── public/                 ← Static assets (copied to dist/)
├── vercel.json             ← Vercel configuration
├── vite.config.js          ← Vite build config
└── package.json            ← Dependencies and scripts
```

## Custom Domain

1. Vercel Dashboard → Project → Settings → Domains
2. Add your domain
3. Update DNS records as instructed
4. Update `VITE_APP_URL` env var to match
5. Update Supabase OAuth redirect URLs
