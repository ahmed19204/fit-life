# FitLife — AI-Powered Fitness & Nutrition Platform

> Personalized meal plans, intelligent tracking, and real-time AI coaching.

## Overview

FitLife is a premium Progressive Web App (PWA) built with a modern vanilla JavaScript SPA architecture. It integrates Supabase for authentication and data persistence, and Google Gemini AI for intelligent nutrition planning and coaching.

**Design System**: Stitch "Midnight Emerald" — deep dark surfaces, emerald accents, glassmorphism, Plus Jakarta Sans typography.

## Live URLs

- **Preview**: (deploy to Vercel — see Deployment section below)
- **Supabase Dashboard**: https://ylalzdaaourwxbywdkyl.supabase.co

## Features

### Core
- User authentication (email/password + Google OAuth)
- 5-step onboarding with personalized AI nutrition plan generation
- AI-powered daily meal plans with calorie/macro targets
- Manual meal logging with nutrition tracking
- Real-time daily nutrition summary on dashboard

### AI Powered
- **AI Nutrition Plans**: Personalized meal plans via Google Gemini 2.0 Flash
- **AI Coach**: Real-time AI chat assistant with conversation history and profile context
- **AI Recipe Generator**: Category-based recipe discovery with ingredient search
- **Triple Fallback**: Edge Function → Direct API → BMR Calculation

### Gamification
- Daily streak tracking with consecutive day calculation
- 6 achievement badges with progress tracking
- Weekly activity visualization

### PWA
- Installable on mobile (manifest.json + service worker)
- Offline fallback page
- Smart caching (CDN cache-first, API network-first)
- App icons (192x192, 512x512)

### Admin
- Admin dashboard with real Supabase data
- User management, meal logs, AI profile stats
- System health monitoring

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla JS, ES Modules, Tailwind CSS (CDN) |
| Build | Vite 6.x |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| AI | Google Gemini 2.0 Flash |
| Icons | Material Symbols Outlined |
| Font | Plus Jakarta Sans |
| Deploy | Vercel |
| PWA | Service Worker + Web App Manifest |

## Project Structure

```
webapp/
├── src/
│   ├── app.js                 # Entry point, router, auth guards
│   ├── services/              # supabase, auth, ai, meals, router
│   ├── components/            # nav-bar, page-header
│   ├── utils/                 # validation
│   ├── styles/                # design-tokens
│   └── pages/                 # 20 page modules
├── public/                    # Static assets, manifest, SW, icons
├── index.html                 # Main HTML shell
├── vite.config.js             # Vite config
├── vercel.json                # Vercel deployment config
├── .env                       # Environment variables
└── [tracking docs]            # PROJECT_STATUS, CHANGELOG, etc.
```

## Pages (20)

| # | Route | Page | Status |
|---|-------|------|--------|
| 1 | `/#/` | Splash Screen | Complete |
| 2 | `/#/landing` | Landing Page | Complete |
| 3 | `/#/auth` | Login / Signup | Complete |
| 4 | `/#/welcome` | Welcome Screen | Complete |
| 5 | `/#/onboarding` | 5-Step Onboarding | Complete |
| 6 | `/#/plan` | AI Plan Results | Complete |
| 7 | `/#/dashboard` | Dashboard | Complete |
| 8 | `/#/meals` | Meal Analysis | Complete |
| 9 | `/#/daily-meals` | Daily AI Meals | Complete |
| 10 | `/#/recipe` | AI Recipe Generator | Complete |
| 11 | `/#/progress` | Progress Tracking | Complete |
| 12 | `/#/history` | Meal History | Complete |
| 13 | `/#/profile` | Profile & Settings | Complete |
| 14 | `/#/assistant` | AI Coach Chat | Complete |
| 15 | `/#/notifications` | Notifications | Complete |
| 16 | `/#/streaks` | Streaks & Achievements | Complete |
| 17 | `/#/premium` | Premium Membership | Complete |
| 18 | `/#/training` | Training Performance | Complete |
| 19 | `/#/admin` | Admin Dashboard | Complete |
| 20 | `*` | 404 Not Found | Complete |

## Database Schema

| Table | Purpose |
|-------|---------|
| `profiles` | User info synced from auth (id, email, full_name) |
| `user_profiles` | Nutrition profile, AI plan, onboarding data |
| `meals` | Logged meals with macros (calories, protein, carbs, fat) |
| `analysis_history` | AI analysis records |

All tables use Row Level Security (RLS) — users can only access their own data.

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+
- Supabase account with project configured

### Local Development

```bash
# Clone the repo
git clone <repo-url>
cd webapp

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Supabase and Google AI credentials

# Start dev server
npm run dev
# Opens at http://localhost:3000
```

### Environment Variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GOOGLE_AI_API_KEY=your-google-ai-key
```

## Deployment (Vercel)

### Quick Deploy

```bash
# Build
npm run build

# Deploy to Vercel
npx vercel --prod
```

### Vercel Settings
- **Framework**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**: Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_AI_API_KEY` in Vercel dashboard

### Supabase Edge Function Deployment
The AI handler edge function (`backend/ai-handler.js` from original project) should be deployed to your Supabase project:

```bash
supabase functions deploy fitlife-nutrition-ai
```

## User Guide

1. **Sign Up**: Create an account with email or Google
2. **Onboarding**: Complete 5-step profile (personal info, diet, activity, health goals, review)
3. **AI Plan**: Receive personalized daily nutrition plan with calorie/macro targets
4. **Dashboard**: View daily progress, log meals, access quick actions
5. **Meals**: Log meals manually or use AI Vision (coming soon)
6. **AI Coach**: Chat with AI for nutrition advice and meal suggestions
7. **Streaks**: Track daily logging streaks and earn achievements
8. **Premium**: Unlock unlimited AI plans and advanced features

## Security Notes

- Supabase anon key is safe to expose (RLS handles authorization)
- Google AI API key should ideally be server-side only (via Edge Functions)
- All user data is protected by Row Level Security policies
- No passwords are stored client-side
- JWT tokens auto-refresh via Supabase client

## License

Private — All rights reserved.

## Last Updated
2026-05-27
