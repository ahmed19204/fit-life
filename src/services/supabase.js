/**
 * FitLife Supabase Client
 * Singleton client with auth persistence
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[FitLife] Missing Supabase configuration. Check .env file.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
    storageKey: 'fitlife-auth',
  },
});

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
