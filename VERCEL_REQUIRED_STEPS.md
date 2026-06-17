# Vercel Required Steps

**Date:** 2026-05-27

---

## Step 1: Push to GitHub

```bash
git add .
git commit -m "FitLife v1.1.0 - Stabilized & secured"
git push origin main
```

## Step 2: Connect to Vercel

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Vercel auto-detects **Vite** framework
4. Confirm settings:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`

## Step 3: Set Environment Variables

In Vercel Dashboard → Project → Settings → Environment Variables:

| Name | Value | Environment |
|------|-------|-------------|
| `VITE_SUPABASE_URL` | `https://ylalzdaaourwxbywdkyl.supabase.co` | Production, Preview, Development |
| `VITE_SUPABASE_ANON_KEY` | `<your-anon-key>` | Production, Preview, Development |
| `VITE_APP_URL` | `https://your-app.vercel.app` | Production |
| `GOOGLE_AI_API_KEY` | `<your-google-ai-key>` | Production, Preview |

**CRITICAL:** `GOOGLE_AI_API_KEY` must NOT have the `VITE_` prefix. It's used only by the `/api/` serverless functions.

## Step 4: Deploy

Click "Deploy" in Vercel Dashboard, or:
```bash
vercel --prod
```

## Step 5: Verify

1. Visit `https://your-app.vercel.app` — should show splash → landing
2. Test auth flow: sign up, login, onboarding
3. Test AI: `/api/ai-chat` and `/api/ai-nutrition` endpoints
4. Check PWA: install prompt on mobile

## Step 6: Custom Domain (Optional)

1. Vercel Dashboard → Settings → Domains
2. Add domain, configure DNS
3. Update `VITE_APP_URL` to new domain
4. Update Supabase OAuth redirect URLs

## Vercel Configuration (vercel.json)

Already configured with:
- SPA rewrites (all routes → index.html)
- API routes preserved (`/api/*`)
- Cache headers for service worker, assets, manifest
- Framework: Vite

## Serverless Functions

Two API functions are deployed automatically:
- `POST /api/ai-nutrition` — AI nutrition plan generation proxy
- `POST /api/ai-chat` — AI chat/coach proxy

Both use `process.env.GOOGLE_AI_API_KEY` server-side.
