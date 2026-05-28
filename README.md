# FitLife — AI-Powered Fitness & Nutrition Platform

## Overview

FitLife is a full-featured AI fitness platform with personalized meal plans, intelligent nutrition tracking, real-time AI coaching, AI food scanning, recipe generation, and comprehensive analytics. Built with the **"Midnight Emerald"** design system (Stitch UI).

## Live Preview

- **Sandbox:** https://3000-ibth68tmukrueycxz3vcw-5c13a017.sandbox.novita.ai
- **Production:** Deploy to Vercel (see DEPLOYMENT_GUIDE.md)

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
| Meals | `/#/meals` | **3-tab AI analysis**: Camera scan + Text describe + Manual entry | ✅ NEW |
| Daily Meals | `/#/daily-meals` | AI meal plan timeline view | ✅ |
| History | `/#/history` | Date-grouped meals, food icons, daily totals, delete | ✅ Enhanced |
| Progress | `/#/progress` | **Canvas charts**, weekly/monthly analytics, BMI, consistency score | ✅ NEW |
| Profile | `/#/profile` | **Full edit form**, weight tracking, auto-recalculation | ✅ NEW |
| AI Coach | `/#/assistant` | Real AI chat via Gemini (server proxy) | ✅ |
| Recipes | `/#/recipe` | **Real AI recipe generation** from ingredients + search/filter | ✅ NEW |
| Streaks | `/#/streaks` | Enhanced: best streak, AI achievements, consistency % | ✅ Enhanced |
| Admin | `/#/admin` | Admin dashboard with real Supabase data | ✅ |
| Notifications | `/#/notifications` | Grouped notification center | ✅ |
| Premium | `/#/premium` | Plan comparison & pricing | ✅ |
| Training | `/#/training` | Workout tracking & performance | ✅ |

### Zero "Coming Soon" — All Features Complete
- ❌ ~~"Coming Soon" on Progress charts~~ → **Canvas bar charts with weekly/monthly analytics**
- ❌ ~~"Premium feature" on Recipe generation~~ → **Real AI recipe generation from ingredients**
- ❌ ~~Read-only Profile~~ → **Full edit form with auto-recalculation**
- ❌ ~~Basic meal logging~~ → **3-tab AI scanner (Camera + Text + Manual)**

## v2.0.0 Feature Highlights

### 1. AI Image Analysis (Gemini Vision)
- Camera capture (mobile) + gallery upload
- Canvas-based image compression (max 1024px, quality 0.8)
- Base64 encoding → server-side Gemini Vision API
- Returns: name, calories, protein, carbs, fat, detected foods, serving size

### 2. AI Text Meal Analysis
- Describe any meal in natural language
- AI estimates full nutritional breakdown
- 5-minute cache for repeated descriptions

### 3. Food Visual Representation
- 17+ food-keyword → Material icon mappings
- Every meal shows a contextual food icon (pizza, salad, steak, etc.)
- Fallback to meal type icons (Breakfast, Lunch, Dinner, Snack)

### 4. Profile Editing System
- Full edit form: name, weight, height, age, gender, goal, activity level
- Quick weight update (separate widget)
- Auto-recalculates BMR/TDEE/macros when body metrics change
- Avatar color cycling
- Toast notifications on save

### 5. AI Recipe Generation
- Enter ingredients → AI creates complete recipe
- Nutrition breakdown, ingredients list, step-by-step instructions
- Personalized to user's diet type, goal, and restrictions

### 6. Dashboard + History Auto-Sync
- Custom pub/sub event system (`events.js`)
- MEAL_SAVED / MEAL_DELETED / PROFILE_UPDATED events
- Meals service emits events on CRUD operations

### 7. Daily Reset & Smart Tracking
- Timezone-aware `getTodaysMeals()` using local midnight
- Day-change detection on visibility change + navigation
- Weekly analytics: 7-day calorie/protein trends
- Monthly analytics: 4-week aggregated summaries
- Canvas bar chart rendering (custom, no external lib)

### 8. Enhanced Streaks & Achievements
- Best streak tracking (all-time)
- AI Scanner achievement (10 AI-analyzed meals)
- Goal Crusher achievement (hit daily calorie target)
- Weekly consistency percentage
- 8 unique achievements with progress tracking

## Tech Stack

- **Frontend:** Vanilla JavaScript SPA (no frameworks), ES Modules
- **Styling:** Tailwind CSS (CDN) + "Midnight Emerald" design tokens
- **Build:** Vite 8.0.14
- **Backend:** Supabase (Auth + PostgreSQL + RLS + Edge Functions)
- **AI:** Google Gemini 2.0 Flash (triple fallback: Edge → Vercel → local BMR)
- **AI Vision:** Gemini 2.0 Flash multimodal (image analysis)
- **Hosting:** Vercel (Serverless Functions + Static)
- **PWA:** Service Worker + Web App Manifest
- **Font:** Plus Jakarta Sans + Material Symbols

## Security

- ✅ Google AI API key stored server-side only (Vercel environment variables)
- ✅ No secrets exposed in frontend bundle (verified)
- ✅ XSS protection in router error handling (HTML entity escaping)
- ✅ Admin route access enforcement (email whitelist)
- ✅ Auth guards on all 16 protected routes
- ✅ Supabase RLS policies for data isolation
- ✅ Input validation on all user inputs (meals, nutrition data, prompts)
- ✅ Server-side rate limiting: 5/min (nutrition), 8/min (food analysis), 10/min (chat)
- ✅ Prompt injection sanitization on all 3 AI API endpoints
- ✅ Image size validation (max 10MB), mime type extraction
- ✅ Base64 validation on image uploads
- ✅ Security headers via vercel.json
- ✅ Session refresh on tab reactivation
- ✅ Cache clearing on sign-out

## AI System Architecture

```
User Action → Frontend (ai.js)
  → AI Request Manager (queue, throttle, dedup, cache, retry)
    → Request Types:
      1. Nutrition Plan → Triple Fallback: Edge → Proxy → Local BMR
      2. Food Image Analysis → /api/ai-food-analyze (Gemini Vision)
      3. Food Text Analysis → /api/ai-food-analyze (Gemini)
      4. Recipe Generation → /api/ai-nutrition (custom prompt)
      5. AI Chat → /api/ai-chat (Gemini)
    → Server-side protections:
      - In-memory rate limiting per IP
      - Prompt injection filtering
      - Content/image sanitization
      - 429 handling with retryAfter
```

## Performance

- **Bundle size:** 411.88 KB (97.12 KB gzip) — single JS file, 77 modules
- **Build time:** ~514ms
- **DNS prefetch:** fonts.googleapis.com, fonts.gstatic.com, cdn.tailwindcss.com, cdn.jsdelivr.net
- **Profile caching:** 60s TTL in-memory
- **Onboarding cache:** 30s TTL in-memory
- **Page transitions:** 120ms smooth fade with translateY
- **Image compression:** Canvas-based, max 1024px, JPEG quality 0.8
- **Chart rendering:** Custom canvas (no external chart library)

## Project Structure

```
src/
├── app.js                    # Main entry: 19 routes, auth guards, day-change detection
├── services/
│   ├── supabase.js           # Supabase client singleton
│   ├── auth.js               # Auth (signup, login, OAuth, session refresh)
│   ├── ai.js                 # AI service (plans, image/text analysis, recipes, profile update)
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
api/
├── ai-nutrition.js           # Vercel: AI nutrition proxy (5 req/min/IP)
├── ai-chat.js                # Vercel: AI chat proxy (10 req/min/IP)
└── ai-food-analyze.js        # Vercel: AI food image + text analysis (8 req/min/IP)
public/
├── manifest.json             # PWA manifest
├── sw.js                     # Service worker v1.1.0
└── assets/icons/             # PWA icons
```

## Supabase Database Tables Required

```sql
-- user_profiles: stores nutrition profiles, targets, onboarding data
-- meals: stores logged meals (name, type, time, calories, protein, carbs, fat, ai_suggested, food_emoji)
-- profiles: basic user profile sync (id, email, full_name)
-- analysis_history: tracks AI analysis inputs/results
```

## Vercel Environment Variables Required

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
GOOGLE_AI_API_KEY=your-gemini-api-key
```

## Quick Start

```bash
npm install
cp .env.example .env   # Fill in credentials
npm run build && npx vite preview --host 0.0.0.0 --port 3000
```

## Version History

- **v2.0.0** — Full AI Feature Completion: 10-feature implementation, zero "Coming Soon", all AI features live
- **v1.2.0** — 10-Part Audit: Performance, security, clean code review
- **v1.1.0** — Stabilization: Rate limiting, error handling, PWA
- **v1.0.0** — Initial release: Core platform with onboarding, dashboard, AI coach
