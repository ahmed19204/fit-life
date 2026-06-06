# FitLife - Architecture Documentation

## System Overview

FitLife is a modern single-page application (SPA) built with vanilla JavaScript and ES Modules. It uses Supabase as the backend-as-a-service platform and Google Gemini AI for intelligent nutrition planning.

## Architecture Diagram

```
┌─────────────────────────────────────────────┐
│                  Frontend                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Pages   │  │Components│  │  Styles    │  │
│  │ (20 pgs) │  │(nav,hdr) │  │ (tokens)  │  │
│  └────┬─────┘  └────┬─────┘  └───────────┘  │
│       │              │                        │
│  ┌────┴──────────────┴──────────────────────┐│
│  │            SPA Router (hash-based)        ││
│  │         Auth Guards · Page Transitions    ││
│  └──────────────────┬───────────────────────┘│
│                     │                         │
│  ┌──────────────────┴───────────────────────┐│
│  │              Services Layer               ││
│  │  auth.js · ai.js · meals.js · supabase.js││
│  └──────────────────┬───────────────────────┘│
│                     │                         │
│  ┌──────────────────┴───────────────────────┐│
│  │            Supabase JS Client             ││
│  └──────────────────┬───────────────────────┘│
└─────────────────────┼─────────────────────────┘
                      │ HTTPS
┌─────────────────────┼─────────────────────────┐
│               Supabase Cloud                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐│
│  │PostgreSQL│  │   Auth   │  │Edge Functions ││
│  │  (D1)    │  │(JWT/OAuth)│ │(Deno Runtime) ││
│  └──────────┘  └──────────┘  └──────┬───────┘│
└──────────────────────────────────────┼────────┘
                                       │
                      ┌────────────────┴────────┐
                      │   Google Gemini AI API   │
                      │   (gemini-2.0-flash)     │
                      └─────────────────────────┘
```

## Directory Structure

```
webapp/
├── index.html                 # Main HTML shell (Tailwind config, PWA, fonts)
├── package.json               # Vite + Supabase dependencies
├── vite.config.js             # Vite build configuration
├── vercel.json                # Vercel deployment config (SPA rewrites)
├── ecosystem.config.cjs       # PM2 dev server configuration
├── .env                       # Environment variables (Supabase + AI keys)
├── .env.example               # Template for environment variables
├── .gitignore                 # Git ignore rules
│
├── src/
│   ├── app.js                 # Main entry: imports, routes, auth guards
│   │
│   ├── services/
│   │   ├── supabase.js        # Supabase client singleton
│   │   ├── auth.js            # Authentication (register, login, OAuth, session)
│   │   ├── ai.js              # AI nutrition plan (Edge Function → Google AI → fallback)
│   │   ├── meals.js           # Meals CRUD + analysis history
│   │   └── router.js          # Hash-based SPA router with guards
│   │
│   ├── components/
│   │   ├── nav-bar.js         # Bottom navigation bar (5 items)
│   │   └── page-header.js     # Sticky glass-blur page header
│   │
│   ├── utils/
│   │   └── validation.js      # Form validation helpers
│   │
│   ├── styles/
│   │   └── design-tokens.js   # Midnight Emerald color tokens
│   │
│   └── pages/                 # 20 page modules
│       ├── splash/index.js
│       ├── landing/index.js
│       ├── auth/index.js
│       ├── welcome/index.js
│       ├── onboarding/index.js
│       ├── plan/index.js
│       ├── dashboard/index.js
│       ├── meals/index.js
│       ├── daily-meals/index.js
│       ├── recipe/index.js
│       ├── progress/index.js
│       ├── history/index.js
│       ├── profile/index.js
│       ├── assistant/index.js
│       ├── notifications/index.js
│       ├── streaks/index.js
│       ├── premium/index.js
│       ├── training/index.js
│       └── admin/index.js
│
└── public/                    # Static assets (copied to dist)
    ├── manifest.json          # PWA manifest
    ├── sw.js                  # Service worker
    └── assets/
        └── icons/
            ├── favicon.svg
            ├── icon-192.png
            ├── icon-512.png
            └── apple-touch-icon.png
```

## Data Flow

### Authentication Flow
```
User → Auth Page → Supabase Auth → JWT Token → localStorage
                                  → profiles table (upsert)
                                  → Auth Guard → Dashboard
```

### AI Nutrition Plan Flow
```
Onboarding Data → sanitize/validate → Edge Function (try)
                                     → Google AI Direct (fallback)
                                     → BMR Calculation (final fallback)
                → user_profiles table (upsert)
                → Plan Display Page
```

### Meal Logging Flow
```
Manual Entry → sanitize → meals table (insert)
                        → getDailyNutritionSummary()
                        → Dashboard Update
```

## Database Schema

### Tables
- **profiles** — Basic user info (id, email, full_name) synced from auth
- **user_profiles** — Nutrition profile + onboarding data + AI plan
- **meals** — Logged meals with macros
- **analysis_history** — AI analysis records

### Row Level Security (RLS)
All tables use RLS policies ensuring users can only access their own data. The setup.sql file in the original project defines all policies.

## Design System: Midnight Emerald

| Token | Value | Usage |
|-------|-------|-------|
| Surface | #0e150e | Background |
| Primary | #4be277 | Interactive elements |
| Primary Container | #22c55e | CTA buttons |
| Secondary | #9ddf2e | Accent highlights |
| Tertiary | #ffb5ab | Warning/orange elements |
| On Surface | #dce5d9 | Primary text |
| On Surface Variant | #bccbb9 | Secondary text |
| Outline Variant | #3d4a3d | Borders |
| Font | Plus Jakarta Sans | All text |
| Icons | Material Symbols Outlined | All icons |

## Routing

Hash-based SPA routing (`/#/path`) with three access levels:
1. **Public**: `/`, `/landing`, `/auth`
2. **Auth (no onboarding)**: `/welcome`, `/onboarding`, `/plan`
3. **Protected (auth + onboarding)**: All other routes

## Build & Deploy

### Build Process
```
Vite Build → dist/
  ├── index.html (with hashed JS reference)
  ├── assets/main-[hash].js (bundled app)
  ├── manifest.json
  ├── sw.js
  └── assets/icons/
```

### Deployment Target: Vercel
- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- SPA rewrite: `/(.*) → /index.html`
