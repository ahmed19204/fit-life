# FitLife - Bugs & Issues Tracker

## Critical (P0) - Blocking Production

_None currently blocking._

## High Priority (P1)

### BUG-001: Google OAuth Redirect
- **Status**: Open
- **Severity**: P1
- **Description**: Google OAuth redirect URL is set to `${window.location.origin}/dashboard` but the app uses hash-based routing (`/#/dashboard`). After OAuth callback, the user may land on the wrong page.
- **Impact**: Google sign-in may not redirect to the correct page.
- **Fix**: Update `signInWithGoogle()` redirectTo to use hash-based URL or handle the OAuth callback in `app.js` initialization.
- **File**: `src/services/auth.js`, line 130

### BUG-002: Admin Dashboard RLS Restrictions
- **Status**: Open
- **Severity**: P1
- **Description**: Admin dashboard queries use the anon key, which is restricted by RLS policies. Some admin-specific queries (listing all users, all meals) may return empty or limited data.
- **Impact**: Admin stats may show inaccurate counts.
- **Fix**: Implement a Supabase Edge Function with service_role key for admin queries, or create admin-specific RLS policies.
- **File**: `src/pages/admin/index.js`

### BUG-003: AI API Key Exposed in Frontend
- **Status**: Open  
- **Severity**: P1
- **Description**: `VITE_GOOGLE_AI_API_KEY` is embedded in the frontend bundle via Vite's `import.meta.env`. While this is the anon key pattern, the Google AI API key should ideally be server-side only.
- **Impact**: API key visible in browser DevTools/source.
- **Fix**: Route all AI calls through Supabase Edge Functions only (remove direct Google AI fallback from frontend).
- **File**: `src/services/ai.js`, `src/pages/assistant/index.js`

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
- **Fix**: Persist onboarding progress in localStorage or sessionStorage.

### BUG-006: Chat History Not Persisted
- **Status**: Open
- **Severity**: P2
- **Description**: AI Coach chat history is stored in a module-level variable. Navigating away and returning clears the chat.
- **Impact**: Users lose conversation context when navigating.
- **Fix**: Store chat history in localStorage keyed by user ID.

## Low Priority (P3)

### BUG-007: Streaks Calculation Simplified
- **Status**: Open
- **Severity**: P3
- **Description**: Streak calculation fetches last 100 meals and counts consecutive days. For users with many meals, this may miss older streak data.
- **Impact**: Streak count may be inaccurate for very active users.
- **Fix**: Create a dedicated streak tracking table or use Supabase RPC for efficient calculation.

### BUG-008: Static Notification Data
- **Status**: Open
- **Severity**: P3
- **Description**: Notifications page uses hardcoded sample data, not real push notifications.
- **Impact**: Notifications are not personalized or real-time.
- **Fix**: Implement Web Push API or Supabase Realtime for live notifications.

---

## Resolved

_No resolved bugs yet — all identified issues are from initial audit._

## Last Updated
2026-05-27
