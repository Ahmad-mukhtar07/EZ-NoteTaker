import { createClient } from '@supabase/supabase-js';

/**
 * Vite exposes only env vars prefixed with VITE_ via import.meta.env.
 * These are inlined at build time (e.g. when building the extension popup).
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** Whether Supabase is configured (safe to use auth/API). */
export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')
);

/**
 * Singleton Supabase client. Use this everywhere for auth and data.
 * If env vars are missing, a dummy client is still created so imports don't throw;
 * check isSupabaseConfigured() before relying on auth/API.
 */
const supabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export { supabaseClient };
export default supabaseClient;
