# FitLife — AI-Powered Fitness & Nutrition Platform

## Overview

FitLife is a full-featured AI fitness platform with personalized meal plans, intelligent nutrition tracking, and a real-time AI coach. Built with the **"Midnight Emerald"** design system (Stitch UI).

## Live Preview

- **Sandbox:** https://3000-ibth68tmukrueycxz3vcw-5c13a017.sandbox.novita.ai
- **Production:** Deploy to Vercel (see DEPLOYMENT_GUIDE.md)

## Features (19 Routes + 404)

### Implemented with Real Backend
| Page | Route | Description |
|------|-------|-------------|
| Splash | `/#/` | Animated splash with auto-redirect |
| Landing | `/#/landing` | Marketing page with hero & features |
| Auth | `/#/auth` | Login/signup with Google OAuth |
| Welcome | `/#/welcome` | Personalized post-signup greeting |
| Onboarding | `/#/onboarding` | 5-step AI data collection |
| Plan | `/#/plan` | AI-generated nutrition plan display |
| Dashboard | `/#/dashboard` | Calorie ring, macros, today's meals |
| Meals | `/#/meals` | Manual meal logging with Supabase |
| Daily Meals | `/#/daily-meals` | AI meal plan timeline view |
| History | `/#/history` | Meal history from database |
| Progress | `/#/progress` | Body stats & transformation tracking |
| Profile | `/#/profile` | User profile, stats, settings, sign out |
| AI Coach | `/#/assistant` | Real AI chat via Gemini (server proxy) |
| Admin | `/#/admin` | Admin dashboard with real Supabase data |
| Streaks | `/#/streaks` | Streak calculation from meal data |

### UI-Complete (Sample/Demo Data)
| Page | Route | Description |
|------|-------|-------------|
| Recipes | `/#/recipe` | Category filters, search, AI generator (premium gated) |
| Notifications | `/#/notifications` | Grouped notification center (static data) |
| Premium | `/#/premium` | Plan comparison & pricing |
| Training | `/#/training` | Workout tracking & performance (demo data) |

## Tech Stack

- **Frontend:** Vanilla JavaScript SPA (no frameworks), ES Modules
- **Styling:** Tailwind CSS (CDN) + "Midnight Emerald" design tokens
- **Build:** Vite 8.0.14
- **Backend:** Supabase (Auth + PostgreSQL + RLS + Edge Functions)
- **AI:** Google Gemini 2.0 Flash (triple fallback: Edge Function → Vercel proxy → local BMR)
- **Hosting:** Vercel (Serverless Functions + Static)
- **PWA:** Service Worker + Web App Manifest
- **Font:** Plus Jakarta Sans + Material Symbols

## Security

- ✅ Google AI API key stored server-side only (Vercel environment variables)
- ✅ No secrets exposed in frontend bundle (verified by grep on dist/)
- ✅ XSS protection in router error handling (HTML entity escaping)
- ✅ Admin route access enforcement (email whitelist)
- ✅ Auth guards on all 16 protected routes
- ✅ Supabase RLS policies for data isolation
- ✅ Input validation on all user inputs (meals, nutrition data, prompts)

## Quick Start

```bash
# Install dependencies
npm install

# Create .env from template
cp .env.example .env
# Fill in your Supabase and Google AI credentials

# Development
npm run build && npx vite preview --host 0.0.0.0 --port 3000

# Production deploy
vercel --prod
```

## Project Structure

```
src/
├── app.js                    # Main entry: 19 routes, auth guards, onboarding checks
├── services/
│   ├── supabase.js           # Supabase client singleton
│   ├── auth.js               # Auth service (signup, login, OAuth, session)
│   ├── ai.js                 # AI service (nutrition plans, triple fallback)
│   ├── meals.js              # Meals CRUD + daily summary
│   └── router.js             # Hash-based SPA router with guards
├── utils/
│   ├── response.js           # Shared ok()/fail() response helpers
│   └── validation.js         # Email, password, field validation
├── components/
│   ├── nav-bar.js            # Bottom navigation bar
│   └── page-header.js        # Sticky glass header
└── pages/                    # 19 page modules (one per route)
api/
├── ai-nutrition.js           # Vercel serverless: AI nutrition plan proxy
└── ai-chat.js                # Vercel serverless: AI chat proxy
```

## Documentation

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) — Full deployment instructions
- [SUPABASE_REQUIRED_STEPS.md](./SUPABASE_REQUIRED_STEPS.md) — Database setup SQL
- [VERCEL_REQUIRED_STEPS.md](./VERCEL_REQUIRED_STEPS.md) — Vercel setup checklist
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture
- [CHANGELOG.md](./CHANGELOG.md) — Version history
- [PROJECT_STATUS.md](./PROJECT_STATUS.md) — Current status & progress
- [BUGS_AND_ISSUES.md](./BUGS_AND_ISSUES.md) — Known issues tracker

## Version

**v1.1.1** — Session 3 Final Stabilization (2026-05-27)
