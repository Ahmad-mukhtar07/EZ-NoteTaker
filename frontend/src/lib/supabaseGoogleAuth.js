/**
 * Supabase Google OAuth for Chrome extension (Manifest V3).
 * Uses chrome.identity.getRedirectURL() and launchWebAuthFlow; does not touch
 * the existing Google Docs OAuth (chrome.identity.getAuthToken) used elsewhere.
 */

import { supabaseClient, isSupabaseConfigured } from '../config/supabase-config.js';

const IDENTITY = typeof chrome !== 'undefined' && chrome.identity;

/**
 * Parse hash fragment from a URL into a Map of key -> value (decoded).
 * @param {string} url - Full URL including hash (e.g. redirect callback)
 * @returns {Map<string, string>}
 */
function parseUrlHash(url) {
  const hash = new URL(url).hash.slice(1);
  if (!hash) return new Map();
  return new Map(
    hash.split('&').map((part) => {
      const eq = part.indexOf('=');
      const name = eq === -1 ? part : part.slice(0, eq);
      const value = eq === -1 ? '' : part.slice(eq + 1);
      return [name, decodeURIComponent(value.replace(/\+/g, ' '))];
    })
  );
}

/**
 * Sign in with Google via Supabase OAuth using the Chrome extension redirect flow.
 * 1. Get redirect URL from chrome.identity.getRedirectURL()
 * 2. Get auth URL from supabase.auth.signInWithOAuth({ provider: 'google' })
 * 3. Open it with chrome.identity.launchWebAuthFlow
 * 4. Parse callback URL hash and call supabase.auth.setSession()
 * Session is persisted by Supabase client (e.g. localStorage); onAuthStateChange will fire.
 *
 * Ensure the redirect URL is added in Supabase Dashboard: Authentication → URL Configuration → Redirect URLs.
 *
 * @returns {Promise<{ error: string | null }>}
 */
export async function signInWithGoogle() {
  if (!isSupabaseConfigured || !supabaseClient) {
    return { error: 'Supabase is not configured.' };
  }

  if (!IDENTITY?.getRedirectURL || !IDENTITY?.launchWebAuthFlow) {
    return { error: 'Chrome identity API is not available.' };
  }

  const redirectTo = IDENTITY.getRedirectURL();

  let authUrl;
  try {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) return { error: error.message || 'Failed to start sign in.' };
    if (!data?.url) return { error: 'No auth URL returned.' };
    authUrl = data.url;
  } catch (e) {
    return { error: e?.message || 'Failed to start sign in.' };
  }

  return new Promise((resolve) => {
    IDENTITY.launchWebAuthFlow(
      {
        url: authUrl,
        interactive: true,
      },
      async (callbackUrl) => {
        if (chrome.runtime?.lastError) {
          const msg = chrome.runtime.lastError.message || '';
          if (msg.toLowerCase().includes('cancel') || msg.includes('access_denied')) {
            resolve({ error: null }); // user cancelled, not a fatal error to show
            return;
          }
          resolve({ error: chrome.runtime.lastError.message || 'Sign-in was cancelled or failed.' });
          return;
        }
        if (!callbackUrl) {
          resolve({ error: 'No callback URL received.' });
          return;
        }

        const params = parseUrlHash(callbackUrl);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (!access_token || !refresh_token) {
          const errDesc = params.get('error_description') || params.get('error');
          resolve({
            error: errDesc || 'Sign-in failed. Missing tokens in callback.',
          });
          return;
        }

        try {
          const { error } = await supabaseClient.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) {
            resolve({ error: error.message || 'Failed to set session.' });
            return;
          }
          resolve({ error: null });
        } catch (e) {
          resolve({ error: e?.message || 'Failed to complete sign in.' });
        }
      }
    );
  });
}
