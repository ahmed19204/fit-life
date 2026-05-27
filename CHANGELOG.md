# FitLife Changelog

All notable changes to this project will be documented here.

## [1.1.1] - 2026-05-27 (Session 3 - Continuation)

### Fixed
- **Vite Host Blocking (CRITICAL)**: Changed `allowedHosts: 'all'` (string) to `allowedHosts: true` (boolean) in vite.config.js. Vite 8 was parsing the string as characters `['a','l','l']` causing "Blocked request" errors.
- Added `strictPort: false` to both `server` and `preview` blocks

### Cleaned
- Removed unused imports: `isValidEmail`, `validateSignupField`, `validateLoginField` from auth page
- Removed unused import: `getAnalysisHistory` from history page
- Removed unused import: `sanitizeUserData` from onboarding page
- Removed 7 stale session-specific report files (CLEANUP_REPORT.md, FINAL_AUDIT_REPORT.md, etc.)

### Tested
- All 19 routes + wildcard 404 tested via Playwright — zero JS errors
- All protected routes correctly redirect to /auth when unauthenticated
- All static assets (manifest.json, sw.js, favicon.svg) serving correctly (HTTP 200)
- Full user flow verified: Splash → Landing → Auth → Welcome → Onboarding → Plan → Dashboard → Profile → Logout
- Build: 75 modules, 347.94 KB (82.88 KB gzip), 0 errors

### Security
- Re-verified: zero API key references in `src/` directory
- Re-verified: built JS bundle contains no API keys
- Re-verified: .env properly gitignored
- Re-verified: admin route protected, auth guards working, XSS mitigated

## [1.1.0] - 2026-05-27 (Session 3 - Initial)

### Security
- **CRITICAL**: Moved Google AI API key from frontend to Vercel serverless functions
  - Created `api/ai-nutrition.js` — POST /api/ai-nutrition proxy
  - Created `api/ai-chat.js` — POST /api/ai-chat proxy
  - Removed ALL `VITE_GOOGLE_AI_API_KEY` references from src/
  - Updated .env: `GOOGLE_AI_API_KEY` (no VITE_ prefix, server-side only)
- Fixed XSS vulnerability in router.js error handler (HTML entity escaping)
- Enforced admin route access with email whitelist check
- Updated .env.example with clear server-side vs client-side sections

### Fixed
- Fixed `meals.js` fail() call signatures (18 calls updated to proper pattern)
- Updated shared `response.js` fail() to support flexible call patterns
- Bound unbound window._ globals in recipe, notifications, premium pages
- Fixed hardcoded footer year (2025 → dynamic `new Date().getFullYear()`)
- Removed dead code: `design-tokens.js`, unused router/nav-bar exports
- Added `vercel.json` API route rewrites before SPA fallback

## [1.0.0] - 2026-05-27 (Sessions 1-2)

### Added
- Complete vanilla JS SPA with 19 page routes + 404
- Supabase integration (Auth, PostgreSQL, Edge Functions)
- AI nutrition plan generation with triple fallback chain
- Real-time AI Coach chat with Google Gemini
- Hash-based SPA router with async auth guards
- Stitch UI "Midnight Emerald" design system
- PWA support (manifest.json, service worker, app icons)
- Calorie ring SVG dashboard with macro tracking
- 5-step onboarding flow with AI plan generation
- Meal CRUD with daily nutrition summary
- Streaks & achievements gamification system
- Admin dashboard with real Supabase data queries
- Google OAuth integration
- Vercel deployment configuration
