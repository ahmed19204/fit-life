# FitLife - Bugs & Issues Tracker

## Critical (P0) - Blocking Production

_None currently blocking._

## High Priority (P1)

### BUG-001: Google OAuth Redirect
- **Status**: Open
- **Severity**: P1
- **Description**: Google OAuth redirect URL uses `${window.location.origin}/#/dashboard`. After OAuth callback, the hash fragment may be stripped by the OAuth provider, causing the user to land on the wrong page.
- **Impact**: Google sign-in may not redirect to the correct page.
- **Fix**: Handle the OAuth callback in `app.js` initialization by checking for Supabase auth tokens in URL params.
- **File**: `src/services/auth.js`

### BUG-002: Admin Dashboard RLS Restrictions
- **Status**: Open
- **Severity**: P1
- **Description**: Admin dashboard queries use the anon key, which is restricted by RLS policies. Admin-specific queries (listing all users, all meals) may return empty or limited data.
- **Impact**: Admin stats may show inaccurate counts.
- **Fix**: Implement a Supabase Edge Function with service_role key for admin queries, or create admin-specific RLS policies.
- **File**: `src/pages/admin/index.js`

## Medium Priority (P2)

### BUG-004: Session Refresh on Tab Reactivation
- **Status**: Open
- **Severity**: P2
- **Description**: When user leaves the tab for extended periods and returns, the session may have expired. The app doesn't proactively refresh or redirect.
- **Impact**: Users may encounter errors when performing actions after long inactivity.
- **Fix**: Add visibility change listener to check session validity.

### BUG-005: Onboarding Data Persistence Between Steps
- **Status**: Open
- **Severity**: P2
- **Description**: Onboarding data is stored in a local JS object. If the user refreshes mid-onboarding, all data is lost.
- **Impact**: Users must restart onboarding from scratch after page refresh.
- **Fix**: Persist onboarding progress in sessionStorage.

### BUG-006: Chat History Not Persisted
- **Status**: Open
- **Severity**: P2
- **Description**: AI Coach chat history is stored in a module-level variable. Navigating away and returning clears the chat.
- **Impact**: Users lose conversation context when navigating.
- **Fix**: Store chat history in sessionStorage keyed by user ID.

## Low Priority (P3)

### BUG-007: Streaks Calculation Simplified
- **Status**: Open
- **Severity**: P3
- **Description**: Streak calculation fetches last 100 meals and counts consecutive days. For users with many meals, this may miss older streak data.
- **Impact**: Streak count may be inaccurate for very active users.
- **Fix**: Create a dedicated streak tracking table or use Supabase RPC.

### BUG-008: Static Notification Data
- **Status**: Open
- **Severity**: P3
- **Description**: Notifications page uses hardcoded sample data, not real push notifications.
- **Impact**: Notifications are not personalized or real-time.
- **Fix**: Implement Web Push API or Supabase Realtime.

### BUG-009: Training Page Demo Data
- **Status**: Open
- **Severity**: P3
- **Description**: Training page uses hardcoded workout data (RECENT_WORKOUTS, WEEKLY_STATS). No database integration for workout tracking.
- **Impact**: Training stats are static placeholders.
- **Fix**: Create `workouts` table in Supabase and implement CRUD service.

---

## Resolved

### BUG-003: AI API Key Exposed in Frontend ✅
- **Status**: RESOLVED (Session 3)
- **Resolution**: Moved Google AI API key to Vercel serverless functions (`api/ai-nutrition.js`, `api/ai-chat.js`). Removed ALL `VITE_GOOGLE_AI_API_KEY` references from `src/`. Key now uses non-VITE prefix (`GOOGLE_AI_API_KEY`) so Vite doesn't bundle it.

### BUG-010: Vite Host Blocking ✅
- **Status**: RESOLVED (Session 3)
- **Resolution**: Changed `allowedHosts: 'all'` (string, broken in Vite 8) to `allowedHosts: true` (boolean, correct). Vite 8 was parsing the string as characters `['a','l','l']` instead of bypassing the host check.

### BUG-011: XSS in Router Error Handler ✅
- **Status**: RESOLVED (Session 3)
- **Resolution**: Added HTML entity escaping to router.js error messages before innerHTML insertion.

### BUG-012: Admin Route Unprotected ✅
- **Status**: RESOLVED (Session 3)
- **Resolution**: Added email whitelist check in admin/index.js. Non-admin users see "Access Denied" page.

### BUG-013: Unbound window._ Globals ✅
- **Status**: RESOLVED (Session 3)
- **Resolution**: Added `setupRecipeHandlers()`, `setupNotificationHandlers()`, `setupPremiumHandlers()` with proper `setTimeout(..., 50)` binding after render.

### BUG-014: meals.js fail() Signature Mismatch ✅
- **Status**: RESOLVED (Session 3)
- **Resolution**: Updated shared `fail()` to support flexible call patterns. Updated all 18 fail() calls in meals.js.

## Last Updated
2026-05-27 (Session 3)
