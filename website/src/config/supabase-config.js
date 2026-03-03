import { createClient } from '@supabase/supabase-js';

/**
 * Same Supabase project as the Chrome extension — use the same
 * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY so website and extension
 * share auth and data.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')
);

const supabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export { supabaseClient, supabaseUrl, supabaseAnonKey };
export default supabaseClient;
