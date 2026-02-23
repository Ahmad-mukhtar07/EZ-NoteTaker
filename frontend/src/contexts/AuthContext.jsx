import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabaseClient, isSupabaseConfigured } from '../config/supabase-config.js';
import { ensureProfile } from '../lib/profile.js';

const AuthContext = createContext(null);

/**
 * Auth + profile state for the extension. Use in popup/side panel only.
 * - Resolves session on load (getSession) so we can route without flashing login.
 * - Subscribes to onAuthStateChange.
 * - When user is set, fetches/creates profile and exposes tier for feature gating.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  const tier = profile?.tier ?? null;
  const profileUserId = profile?.id ?? null;

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    try {
      const row = await ensureProfile(userId);
      setProfile(row);
    } catch (_) {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabaseClient) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function initSession() {
      const timeout = new Promise((resolve) => {
        setTimeout(() => resolve(null), 8000);
      });
      try {
        const session = await Promise.race([
          supabaseClient.auth.getSession().then(({ data }) => data?.session ?? null),
          timeout,
        ]);
        if (cancelled) return;
        const nextUser = session?.user ?? null;
        setUser(nextUser);
        if (nextUser && session?.access_token && chrome?.storage?.local) {
          chrome.storage.local.set({ eznote_supabase_access_token: session.access_token });
        }
        if (nextUser) {
          loadProfile(nextUser.id).catch(() => {});
        }
      } catch (_) {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    initSession();

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
      (_event, session) => {
        if (cancelled) return;
        const nextUser = session?.user ?? null;
        setUser(nextUser);
        if (!nextUser) {
          setProfile(null);
          if (chrome?.storage?.local) chrome.storage.local.remove('eznote_supabase_access_token');
        } else {
          loadProfile(nextUser.id).catch(() => {});
          if (session?.access_token && chrome?.storage?.local) {
            chrome.storage.local.set({ eznote_supabase_access_token: session.access_token });
          }
        }
      }
    );

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [loadProfile]);

  const logout = useCallback(async () => {
    if (!isSupabaseConfigured || !supabaseClient) return;
    await supabaseClient.auth.signOut();
    setUser(null);
    setProfile(null);
    if (chrome?.storage?.local) chrome.storage.local.remove('eznote_supabase_access_token');
  }, []);

  /** Sync current Supabase session token to chrome.storage so the background script uses the right user. Call before fetching snip usage after account switch. */
  const syncSessionTokenToStorage = useCallback(() => {
    if (!isSupabaseConfigured || !supabaseClient || !chrome?.storage?.local) return Promise.resolve();
    return supabaseClient.auth.getSession().then(({ data }) => {
      const session = data?.session ?? null;
      if (!session?.access_token) return Promise.resolve();
      return new Promise((resolve) => {
        chrome.storage.local.set({ eznote_supabase_access_token: session.access_token }, resolve);
      });
    });
  }, []);

  const value = {
    user,
    loading,
    logout,
    profile,
    tier,
    profileUserId,
    syncSessionTokenToStorage,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
