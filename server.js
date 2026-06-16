# FitLife — AI-Powered Fitness & Nutrition Platform

## Overview

FitLife is a full-featured AI fitness platform with personalized meal plans, intelligent nutrition tracking, real-time AI coaching, AI food scanning, recipe generation, and comprehensive analytics. Built with the **"Midnight Emerald"** design system (Stitch UI).

## Live Preview

- **Sandbox:** https://3000-ibth68tmukrueycxz3vcw-5c13a017.sandbox.novita.ai
- **Production:** Deploy via Supabase Edge Functions + any static host

## Features (19 Routes + 404)

### All Features — Fully Functional

| Page | Route | Description | Status |
|------|-------|-------------|--------|
| Splash | `/#/` | Animated splash with auto-redirect | ✅ |
| Landing | `/#/landing` | Marketing page with hero & features | ✅ |
| Auth | `/#/auth` | Login/signup with Google OAuth | ✅ |
| Welcome | `/#/welcome` | Personalized post-signup greeting | ✅ |
| Onboarding | `/#/onboarding` | 5-step AI data collection | ✅ |
| Plan | `/#/plan` | AI-generated nutrition plan display | ✅ |
| Dashboard | `/#/dashboard` | Calorie ring, macros, today's meals, food icons, analytics link | ✅ |
| Meals | `/#/meals` | **3-tab AI analysis**: Camera scan + Text describe + Manual entry | ✅ |
| Daily Meals | `/#/daily-meals` | AI meal plan timeline view | ✅ |
| History | `/#/history` | Date-grouped meals, food icons, daily totals, delete | ✅ |
| Progress | `/#/progress` | **Canvas charts**, weekly/monthly analytics, BMI, consistency score | ✅ |
| Profile | `/#/profile` | **Full edit form**, weight tracking, auto-recalculation | ✅ |
| AI Coach | `/#/assistant` | Real AI chat via Supabase Edge Function → Gemini | ✅ |
| Recipes | `/#/recipe` | **Real AI recipe generation** from ingredients + search/filter | ✅ |
| Streaks | `/#/streaks` | Enhanced: best streak, AI achievements, consistency % | ✅ |
| Admin | `/#/admin` | Admin dashboard with real Supabase data | ✅ |
| Notifications | `/#/notifications` | Grouped notification center | ✅ |
| Premium | `/#/premium` | Plan comparison & pricing | ✅ |
| Training | `/#/training` | Workout tracking & performance | ✅ |

## Tech Stack

- **Frontend:** Vanilla JavaScript SPA (no frameworks), ES Modules
- **Styling:** Tailwind CSS (CDN) + "Midnight Emerald" design tokens
- **Build:** Vite 6.4.2
- **Backend:** Supabase (Auth + PostgreSQL + RLS + Edge Functions)
- **AI Model:** Google Gemini 2.5 Flash (GA, stable until Oct 2026)
- **AI Routing:** `supabase.functions.invoke()` → 5 individual Deno Edge Functions → Gemini API
- **Hosting:** Any static host (Express dev server for sandbox)
- **PWA:** Service Worker + Web App Manifest
- **Font:** Plus Jakarta Sans + Material Symbols

## AI System Architecture (v4.0 — Supabase Edge Functions)

```
User Action → Frontend (ai.js)
  → AI Request Manager (queue, throttle, dedup, cache, retry)
    → supabase.functions.invoke(fnName, { body })
      → Supabase Edge Function (Deno) → Gemini 2.5 Flash API
      → FINAL FALLBACK: Local BMR calculation (nutrition only)

  5 Edge Functions (each individual, in supabase/functions/):
    1. ai-coach          — AI fitness/nutrition chat
    2. ai-analyze-image  — Food image analysis (Gemini Vision multimodal)
    3. ai-analyze-text   — Text-based meal analysis
    4. ai-recipe         — AI recipe generation from ingredients
    5. ai-nutrition      — Personalized nutrition plan generation

  Shared modules (supabase/functions/_shared/):
    - cors.ts   — CORS headers, jsonOk(), jsonError(), handleCors()
    - gemini.ts — geminiText(), geminiVision(), parseAIJson(), LANGUAGE_INSTRUCTION

  Key Design Decisions:
    ✅ No API keys in frontend — GEMINI_API_KEY in Supabase Secrets
    ✅ supabase-js auto-attaches auth headers (anon key + JWT)
    ✅ All prompts include LANGUAGE_INSTRUCTION (multilingual responses)
    ✅ Image handling: Canvas compression → base64 data URI → Edge Function → Gemini Vision
    ✅ 30s AbortController timeout per Gemini request
    ✅ Robust JSON parsing: strips markdown fences, extracts JSON objects
    ✅ Input sanitization: prompt injection filtering, length limits
```

## Security

- ✅ All API keys stored in Supabase Secrets (GEMINI_API_KEY) — never in frontend
- ✅ No secrets exposed in frontend bundle (verified)
- ✅ Express server has NO AI proxy routes — only static file serving
- ✅ XSS protection in router error handling (HTML entity escaping)
- ✅ Admin route access enforcement (email whitelist)
- ✅ Auth guards on all 16 protected routes
- ✅ Supabase RLS policies for data isolation
- ✅ Input validation on all user inputs (meals, nutrition data, prompts)
- ✅ Prompt injection sanitization on all Edge Functions
- ✅ Image size validation (max 10MB), mime type extraction
- ✅ Base64 validation on image uploads
- ✅ AbortController timeout protection (30s per Gemini request)
- ✅ AI Request Manager: queue, throttle, dedup, cache, retry
- ✅ Session refresh on tab reactivation
- ✅ Cache clearing on sign-out

## Performance

- **Bundle size:** 421.36 KB (100.56 KB gzip) — single JS file, 75 modules
- **Build time:** ~1.95s
- **DNS prefetch:** fonts.googleapis.com, fonts.gstatic.com, cdn.tailwindcss.com, cdn.jsdelivr.net
- **Profile caching:** 60s TTL in-memory
- **Onboarding cache:** 30s TTL in-memory
- **Page transitions:** 120ms smooth fade with translateY
- **Image compression:** Canvas-based, max 1024px, JPEG quality 0.8
- **Chart rendering:** Custom canvas (no external chart library)
- **AI response cache:** configurable TTL per operation (2-30 min)

## Project Structure

```
src/
├── app.js                    # Main entry: 19 routes, auth guards, day-change detection
├── services/
│   ├── supabase.js           # Supabase client singleton
│   ├── auth.js               # Auth (signup, login, OAuth, session refresh)
│   ├── ai.js                 # AI service — invokeEdgeFunction() for all 5 operations
│   ├── ai-request-manager.js # Centralized AI manager (queue, throttle, dedup, cache, retry)
│   ├── meals.js              # Meals CRUD + daily/weekly/monthly analytics + day-change
│   ├── events.js             # Pub/sub event system (MEAL_SAVED, PROFILE_UPDATED, etc.)
│   └── router.js             # Hash-based SPA router with guards
├── utils/
│   ├── response.js           # ok()/fail() response helpers
│   └── validation.js         # Email, password, field validation, escapeHtml
├── components/
│   ├── nav-bar.js            # Bottom navigation (ARIA accessible)
│   └── page-header.js        # Sticky glass header (ARIA accessible)
└── pages/                    # 19 page modules (one per route)
supabase/functions/
├── _shared/
│   ├── cors.ts               # Shared CORS headers + jsonOk/jsonError helpers
│   └── gemini.ts             # Shared Gemini API: geminiText, geminiVision, parseAIJson
├── ai-coach/index.ts         # AI chat — sanitizes history, calls geminiText
├── ai-analyze-image/index.ts # Image analysis — base64/data-uri → geminiVision
├── ai-analyze-text/index.ts  # Text meal analysis — description → geminiText
├── ai-recipe/index.ts        # Recipe generation — ingredients + profile → geminiText
└── ai-nutrition/index.ts     # Nutrition plan — structured input → geminiText
server.js                     # Express dev server (static files only, NO AI routes)
public/
├── manifest.json             # PWA manifest
├── sw.js                     # Service worker
└── assets/icons/             # PWA icons
```

## Supabase Database Tables Required

```sql
-- user_profiles: stores nutrition profiles, targets, onboarding data
-- meals: stores logged meals (name, type, time, calories, protein, carbs, fat, ai_suggested, food_emoji)
-- profiles: basic user profile sync (id, email, full_name)
-- analysis_history: tracks AI analysis inputs/results
```

## Environment Variables

```bash
# Frontend (Vite — exposed to browser)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Supabase Secrets (set via: supabase secrets set GEMINI_API_KEY=your-key)
GEMINI_API_KEY=your-gemini-api-key    # Used by Edge Functions
```

## Deployment — Supabase Edge Functions

```bash
# Deploy all 5 Edge Functions:
supabase functions deploy ai-coach --no-verify-jwt
supabase functions deploy ai-analyze-image --no-verify-jwt
supabase functions deploy ai-analyze-text --no-verify-jwt
supabase functions deploy ai-recipe --no-verify-jwt
supabase functions deploy ai-nutrition --no-verify-jwt

# Set the Gemini API key as a secret:
supabase secrets set GEMINI_API_KEY=your-gemini-api-key

# Verify deployment:
supabase functions list
```

## Quick Start

```bash
npm install
cp .env.example .env   # Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run build          # Build frontend (75 modules, ~421 KB)
node --env-file=.env server.js  # Start static server
# Or: pm2 start ecosystem.config.cjs  # Daemonized
```

## Version History

- **v4.0.0** — Supabase Edge Function Migration: All 5 AI features migrated from Express proxy to individual Supabase Edge Functions (Deno). Frontend uses `supabase.functions.invoke()`. Express server cleaned to static-only. Old monolithic `fitlife-ai` function deleted. Multilingual AI responses. Real error surfacing in UI.
- **v3.1.0** — Gemini Model Fix: Updated all endpoints from deprecated gemini-1.5-flash/2.0-flash to gemini-2.5-flash (GA)
- **v3.0.0** — Multi-Provider AI Backend: Unified endpoint, Gemini+OpenRouter, professional fallback routing
- **v2.0.0** — Full AI Feature Completion: 10-feature implementation, zero "Coming Soon", all AI features live
- **v1.2.0** — 10-Part Audit: Performance, security, clean code review
- **v1.1.0** — Stabilization: Rate limiting, error handling, PWA
- **v1.0.0** — Initial release: Core platform with onboarding, dashboard, AI coach
