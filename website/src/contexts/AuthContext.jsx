import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabaseClient, isSupabaseConfigured } from '../config/supabase-config.js';

const AuthContext = createContext(null);

/**
 * Build the URL Supabase will redirect to after Google OAuth.
 * Add this exact URL (and localhost for dev) to Supabase Dashboard:
 * Authentication → URL Configuration → Redirect URLs.
 */
function getAuthRedirectUrl() {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  return `${origin}/auth/callback`;
}

/**
 * Sign in with Google via redirect. User is sent to Google then back to
 * /auth/callback, where we set the session and redirect to home.
 * Session is stored in the browser by Supabase (localStorage).
 */
export async function signInWithGoogle() {
  if (!isSupabaseConfigured || !supabaseClient) {
    return { error: 'Supabase is not configured.' };
  }
  const redirectTo = getAuthRedirectUrl();
  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  if (error) return { error: error.message };
  if (!data?.url) return { error: 'No auth URL returned.' };
  window.location.href = data.url;
  return { error: null };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabaseClient) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function initSession() {
      try {
        const { data } = await supabaseClient.auth.getSession();
        if (cancelled) return;
        setUser(data?.session?.user ?? null);
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
        setUser(session?.user ?? null);
      }
    );

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  const logout = useCallback(async () => {
    if (!isSupabaseConfigured || !supabaseClient) return;
    await supabaseClient.auth.signOut();
    setUser(null);
  }, []);

  const value = {
    user,
    loading,
    logout,
    signInWithGoogle,
    isSupabaseConfigured,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
