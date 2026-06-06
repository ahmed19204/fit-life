/**
 * FitLife Authentication Service
 * Handles signup, login, logout, session management, and profile sync.
 * Includes session refresh on tab reactivation and OAuth handling.
 */
import { supabase, isConfigured } from './supabase.js';
import { ok, fail } from '../utils/response.js';
import { clearAICache } from './ai-request-manager.js';
import { invalidateProfileCache } from './ai.js';
import { logger } from '../utils/logger.js';

const log = logger.scoped('Auth');

function mapAuthError(error, action) {
  const raw = error?.message || 'Unexpected authentication error.';
  const n = raw.toLowerCase();

  if (n.includes('already registered')) return fail('EMAIL_EXISTS', 'This email is already registered.', error);
  if (n.includes('invalid login credentials')) return fail('INVALID_CREDENTIALS', 'Invalid email or password.', error);
  if (n.includes('email not confirmed')) return fail('EMAIL_NOT_CONFIRMED', 'Please confirm your email before logging in.', error);
  if (n.includes('password') && (n.includes('at least') || n.includes('weak')))
    return fail('WEAK_PASSWORD', 'Password too weak. Use at least 6 characters with mixed letters, numbers, symbols.', error);
  if (n.includes('invalid') && n.includes('email')) return fail('INVALID_EMAIL', 'Please enter a valid email address.', error);
  if (n.includes('network') || n.includes('fetch')) return fail('NETWORK_ERROR', 'Network error. Check your connection.', error);

  return fail(action === 'login' ? 'LOGIN_ERROR' : 'SIGNUP_ERROR', raw, error);
}

async function syncUserProfile(user) {
  if (!user?.id) return fail('PROFILE_SYNC_SKIPPED', 'No user for profile sync.');

  const payload = {
    id: user.id,
    email: user.email || null,
    full_name: user.user_metadata?.full_name || null,
  };

  try {
    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
    if (error) return fail('PROFILE_SYNC_FAILED', 'Profile sync failed.', error);
    return ok('Profile synced.', { profile: payload });
  } catch (e) {
    return fail('PROFILE_SYNC_FAILED', 'Profile sync failed.', e);
  }
}

export async function registerUser({ email, password, fullName }) {
  if (!isConfigured) return fail('SUPABASE_NOT_CONFIGURED', 'Supabase not ready.');

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) return mapAuthError(error, 'signup');

    let session = data.session;
    let user = data.user;
    let requiresEmailConfirmation = !session;

    // Auto-login if email confirmation disabled
    if (!session && user) {
      const login = await supabase.auth.signInWithPassword({ email, password });
      if (!login.error) {
        session = login.data.session;
        user = login.data.user;
        requiresEmailConfirmation = false;
      } else {
        const loginErr = mapAuthError(login.error, 'login');
        if (loginErr.data?.code === 'EMAIL_NOT_CONFIRMED') {
          requiresEmailConfirmation = true;
        } else {
          return loginErr;
        }
      }
    }

    let profileSync = null;
    if (user && session) {
      profileSync = await syncUserProfile(user);
    }

    return ok(
      requiresEmailConfirmation
        ? 'Account created. Check your email to confirm.'
        : 'Account created successfully.',
      { user, session, requiresEmailConfirmation, profileSyncSuccess: profileSync?.success || false }
    );
  } catch (e) {
    return mapAuthError(e, 'signup');
  }
}

export async function loginUser({ email, password }) {
  if (!isConfigured) return fail('SUPABASE_NOT_CONFIGURED', 'Supabase not ready.');

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return mapAuthError(error, 'login');

    const profileSync = await syncUserProfile(data.user);
    return ok('Login successful.', {
      user: data.user,
      session: data.session,
      profileSyncSuccess: profileSync.success,
    });
  } catch (e) {
    return mapAuthError(e, 'login');
  }
}

export async function signInWithGoogle() {
  if (!isConfigured) return fail('SUPABASE_NOT_CONFIGURED', 'Supabase not ready.');

  try {
    // Use origin without hash — Supabase OAuth drops the hash fragment.
    // After redirect, app.js init() routes the signed-in user to /dashboard or /welcome.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) return mapAuthError(error, 'oauth');
    return ok('Redirecting to Google...', data);
  } catch (e) {
    return mapAuthError(e, 'oauth');
  }
}

/**
 * Verify the 6-digit OTP code emailed by Supabase after signUp.
 * Supabase sends it as the `token` for type `signup` (or `email`).
 */
export async function verifyEmailOtp({ email, token, type = 'signup' }) {
  if (!isConfigured) return fail('SUPABASE_NOT_CONFIGURED', 'Supabase not ready.');
  if (!email || !token) return fail('MISSING_DATA', 'Email and code are required.');

  try {
    const cleanToken = String(token).replace(/\D/g, '').slice(0, 8);
    const { data, error } = await supabase.auth.verifyOtp({ email, token: cleanToken, type });
    if (error) {
      log.warn('verifyOtp failed', { message: error.message });
      return fail('OTP_INVALID', error.message || 'Invalid or expired code.', error);
    }
    if (data?.user) await syncUserProfile(data.user);
    return ok('Email verified.', { user: data.user, session: data.session });
  } catch (e) {
    return fail('OTP_ERROR', e.message || 'OTP verification failed.', e);
  }
}

/**
 * Resend the email confirmation OTP. Supabase rate-limits this server-side.
 */
export async function resendVerificationOtp({ email, type = 'signup' }) {
  if (!isConfigured) return fail('SUPABASE_NOT_CONFIGURED', 'Supabase not ready.');
  if (!email) return fail('MISSING_DATA', 'Email is required.');
  try {
    const { error } = await supabase.auth.resend({ email, type });
    if (error) return fail('RESEND_FAILED', error.message || 'Could not resend code.', error);
    return ok('Verification code resent.');
  } catch (e) {
    return fail('RESEND_FAILED', e.message || 'Could not resend code.', e);
  }
}

export async function getCurrentUser() {
  if (!isConfigured) return fail('SUPABASE_NOT_CONFIGURED', 'Supabase not ready.');
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return mapAuthError(error, 'user');
    return ok('User loaded.', { user: data.user });
  } catch (e) {
    return mapAuthError(e, 'user');
  }
}

export async function getCurrentSession() {
  if (!isConfigured) return fail('SUPABASE_NOT_CONFIGURED', 'Supabase not ready.');
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return mapAuthError(error, 'session');
    return ok('Session loaded.', { session: data.session });
  } catch (e) {
    return mapAuthError(e, 'session');
  }
}

export async function signOut() {
  if (!isConfigured) return fail('SUPABASE_NOT_CONFIGURED', 'Supabase not ready.');
  try {
    const { error } = await supabase.auth.signOut();
    if (error) return mapAuthError(error, 'signout');
    
    // Clear all cached data on sign out
    clearAICache();
    invalidateProfileCache();
    sessionStorage.clear();
    
    return ok('Signed out successfully.');
  } catch (e) {
    return mapAuthError(e, 'signout');
  }
}

export async function isLoggedIn() {
  const res = await getCurrentUser();
  return res.success && res.data?.user;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}

export function getDisplayName(user) {
  return user?.user_metadata?.full_name || user?.email || 'FitLife User';
}

/**
 * Setup session refresh on tab reactivation.
 * When user returns to the app tab, refresh the session to prevent stale tokens.
 * Call this once during app initialization.
 */
export function setupSessionRefresh() {
  if (!isConfigured) return;
  
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Check if token is close to expiring (within 5 minutes)
          const expiresAt = session.expires_at;
          const now = Math.floor(Date.now() / 1000);
          if (expiresAt && (expiresAt - now) < 300) {
            console.log('[Auth] Session near expiry, refreshing...');
            await supabase.auth.refreshSession();
          }
        }
      } catch (e) {
        console.warn('[Auth] Session refresh check failed:', e.message);
      }
    }
  });
}
