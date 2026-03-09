import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabaseClient, isSupabaseConfigured } from '../config/supabase-config.js';
import { ensureProfile } from '../lib/profile.js';
import { validateAccess, persistTierToStorage, getStoredTier } from '../lib/validateAccess.js';

const AuthContext = createContext(null);

/** Re-validate Pro access this often so extension stays in sync with website (e.g. after user cancels on web). */
const VALIDATE_ACCESS_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Auth + profile state for the extension. Use in popup/side panel only.
 * - Resolves session on load (getSession) so we can route without flashing login.
 * - Subscribes to onAuthStateChange.
 * - When user is set, fetches/creates profile (for full_name/email) and validates Pro access
 *   via the validate-access Edge Function so tier cannot be tampered with client-side.
 * - Tier is always from server (validate-access); on failure we default to free and never crash.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  /** Server-verified tier: 'pro' | 'free'. From validate-access only; never from profile.tier. */
  const [tier, setTier] = useState(null);
  /** True until first validate-access call completes (so we don't show Pro UI before we know). */
  const [accessValidationLoading, setAccessValidationLoading] = useState(true);
  /** Set when validate-access fails (network/401); tier is then 'free' but UI can show a hint. */
  const [accessValidationError, setAccessValidationError] = useState(null);
  const validateIntervalRef = useRef(null);

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

  /**
   * Call validate-access Edge Function and update tier state. Safe: never throws;
   * on failure sets tier to 'free' and optionally accessValidationError.
   */
  const runAccessValidation = useCallback(async (accessToken) => {
    if (!accessToken) {
      setTier('free');
      setAccessValidationLoading(false);
      setAccessValidationError(null);
      persistTierToStorage('free');
      return;
    }
    const result = await validateAccess(supabaseClient, accessToken);
    setAccessValidationLoading(false);
    if (result.error) {
      setAccessValidationError(result.error);
      setTier('free');
      persistTierToStorage('free');
      return;
    }
    setAccessValidationError(null);
    const nextTier = result.pro ? 'pro' : 'free';
    setTier(nextTier);
    persistTierToStorage(nextTier);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabaseClient) {
      setLoading(false);
      setAccessValidationLoading(false);
      setTier('free');
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
          // Server-verified tier: validate-access prevents client-side tampering and syncs with website.
          setAccessValidationLoading(true);
          await runAccessValidation(session?.access_token ?? null);
        } else {
          setTier('free');
          setAccessValidationLoading(false);
          setAccessValidationError(null);
          persistTierToStorage('free');
        }
      } catch (_) {
        if (!cancelled) {
          setUser(null);
          setTier('free');
          setAccessValidationLoading(false);
          persistTierToStorage('free');
        }
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
          setTier('free');
          setAccessValidationLoading(false);
          setAccessValidationError(null);
          persistTierToStorage('free');
          if (chrome?.storage?.local) chrome.storage.local.remove('eznote_supabase_access_token');
          if (chrome?.storage?.local) chrome.storage.local.remove('eznote_pro_tier');
          if (chrome?.runtime?.sendMessage) chrome.runtime.sendMessage({ type: 'AUTH_DISCONNECT' }, () => {});
        } else {
          loadProfile(nextUser.id).catch(() => {});
          setAccessValidationLoading(true);
          runAccessValidation(session?.access_token ?? null);
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
  }, [loadProfile, runAccessValidation]);

  // Periodic re-validation so extension stays in sync with website (e.g. user cancelled on web).
  useEffect(() => {
    if (!isSupabaseConfigured || !supabaseClient || !user) return;

    const scheduleNext = () => {
      validateIntervalRef.current = setTimeout(async () => {
        const { data } = await supabaseClient.auth.getSession();
        const token = data?.session?.access_token ?? null;
        const result = await validateAccess(supabaseClient, token);
        if (!result.error && !result.pro) {
          setTier('free');
          persistTierToStorage('free');
        } else if (!result.error && result.pro) {
          setTier('pro');
          setAccessValidationError(null);
          persistTierToStorage('pro');
        }
        scheduleNext();
      }, VALIDATE_ACCESS_INTERVAL_MS);
    };

    scheduleNext();
    return () => {
      if (validateIntervalRef.current) clearTimeout(validateIntervalRef.current);
    };
  }, [user]);

  const logout = useCallback(async () => {
    if (!isSupabaseConfigured || !supabaseClient) return;
    await supabaseClient.auth.signOut();
    setUser(null);
    setProfile(null);
    setTier('free');
    setAccessValidationLoading(false);
    setAccessValidationError(null);
    if (chrome?.storage?.local) {
      chrome.storage.local.remove('eznote_supabase_access_token');
      chrome.storage.local.remove('eznote_pro_tier');
    }
    // Clear Google Docs state so the next user doesn't get 403 (wrong token/folder).
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'AUTH_DISCONNECT' }, () => {});
    }
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

  /** Re-run validate-access (e.g. after user returns from website upgrade/cancel). */
  const refetchAccess = useCallback(async () => {
    if (!user) return;
    setAccessValidationLoading(true);
    const { data } = await supabaseClient.auth.getSession();
    await runAccessValidation(data?.session?.access_token ?? null);
  }, [user, runAccessValidation]);

  const value = {
    user,
    loading,
    logout,
    profile,
    tier,
    profileUserId,
    syncSessionTokenToStorage,
    accessValidationLoading,
    accessValidationError,
    refetchAccess,
    getStoredTier,
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
