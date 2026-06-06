/**
 * FitLife Authentication Service
 * Handles signup, login, logout, session management, and profile sync.
 * Preserved from original FitLife backend - source of truth for auth logic.
 */
import { supabase, isConfigured } from './supabase.js';

function ok(message, data) {
  return { success: true, message, data: data || {} };
}

function fail(code, message, error) {
  return {
    success: false,
    message,
    data: {
      code,
      error: error ? { message: error.message || 'Unexpected error', status: error.status || null } : null,
    },
  };
}

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
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/#/dashboard`,
      },
    });
    if (error) return mapAuthError(error, 'oauth');
    return ok('Redirecting to Google...', data);
  } catch (e) {
    return mapAuthError(e, 'oauth');
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
