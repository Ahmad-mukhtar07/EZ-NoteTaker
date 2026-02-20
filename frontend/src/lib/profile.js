/**
 * Profiles table: id (uuid = auth.uid()), tier, full_name, email.
 * RLS: only "Users can view own profile" (SELECT) is needed.
 * Row is created by DB trigger on signup (see supabase-profiles-rls.sql).
 */

import { supabaseClient, isSupabaseConfigured } from '../config/supabase-config.js';

const TABLE = 'profiles';

/**
 * Fetch profile row for a user.
 * @param {string} userId - auth.users.id (uuid)
 * @returns {Promise<{ id: string, tier: string, full_name: string | null, email: string | null } | null>}
 */
export async function fetchProfile(userId) {
  if (!isSupabaseConfigured || !supabaseClient || !userId) return null;
  const { data, error } = await supabaseClient
    .from(TABLE)
    .select('id, tier, full_name, email')
    .eq('id', userId)
    .maybeSingle();
  if (error) return null;
  return data;
}

/**
 * Load profile for the user. Profile row should exist (created by trigger on signup).
 * If it's missing (e.g. user created before trigger), we only fetch; no insert.
 * @param {string} userId - auth.users.id
 * @returns {Promise<{ id: string, tier: string, full_name: string | null, email: string | null } | null>}
 */
export async function ensureProfile(userId) {
  if (!isSupabaseConfigured || !supabaseClient || !userId) return null;
  return fetchProfile(userId);
}
