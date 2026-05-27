# FitLife — AI-Powered Fitness & Nutrition Platform

## Overview

FitLife is a full-featured AI fitness platform with personalized meal plans, intelligent nutrition tracking, and a real-time AI coach. Built with the **"Midnight Emerald"** design system (Stitch UI).

## Live Preview

- **Sandbox:** https://3000-ibth68tmukrueycxz3vcw-5c13a017.sandbox.novita.ai
- **Production:** Deploy to Vercel (see DEPLOYMENT_GUIDE.md)

## Features (20 Pages)

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

### UI-Complete (Sample Data)
| Page | Route | Description |
|------|-------|-------------|
| Recipes | `/#/recipe` | Category filters, search, AI generator UI |
| Notifications | `/#/notifications` | Grouped notification center |
| Premium | `/#/premium` | Plan comparison & pricing |
| Training | `/#/training` | Workout tracking & performance |

## Tech Stack

- **Frontend:** Vanilla JavaScript SPA (no frameworks)
- **Styling:** Tailwind CSS (CDN) + "Midnight Emerald" tokens
- **Build:** Vite 8.x
- **Backend:** Supabase (Auth + PostgreSQL + RLS + Edge Functions)
- **AI:** Google Gemini 2.0 Flash (via Vercel serverless proxy)
- **Hosting:** Vercel (Serverless Functions + Static)
- **PWA:** Service Worker + Web App Manifest
- **Font:** Plus Jakarta Sans + Material Symbols

## Security

- Google AI API key stored server-side only (Vercel environment variables)
- No secrets exposed in frontend bundle
- XSS protection in router error handling
- Admin route access enforcement
- Auth guards on all protected routes
- Supabase RLS policies for data isolation

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

## Documentation

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) — Full deployment instructions
- [SUPABASE_REQUIRED_STEPS.md](./SUPABASE_REQUIRED_STEPS.md) — Database setup SQL
- [VERCEL_REQUIRED_STEPS.md](./VERCEL_REQUIRED_STEPS.md) — Vercel setup checklist
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture
- [SECURITY_REPORT.md](./SECURITY_REPORT.md) — Security audit results
- [FINAL_AUDIT_REPORT.md](./FINAL_AUDIT_REPORT.md) — Complete audit report
- [FINAL_PROJECT_STRUCTURE.md](./FINAL_PROJECT_STRUCTURE.md) — File structure

## Version

**v1.1.0** — Post-Stabilization Release (2026-05-27)
