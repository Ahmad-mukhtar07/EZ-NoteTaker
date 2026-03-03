import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseClient, isSupabaseConfigured } from '../config/supabase-config.js';
import './AuthCallbackPage.css';

function parseHashParams(hash) {
  if (!hash || !hash.startsWith('#')) return {};
  const str = hash.slice(1);
  return Object.fromEntries(
    str.split('&').map((part) => {
      const eq = part.indexOf('=');
      const key = eq === -1 ? part : part.slice(0, eq);
      const value = eq === -1 ? '' : decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' '));
      return [key, value];
    })
  );
}

/**
 * OAuth callback: Supabase redirects here with #access_token=...&refresh_token=...
 * We set the session then redirect home. Session is stored in the browser by Supabase.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabaseClient) {
      setError('Supabase is not configured.');
      return;
    }
    const params = parseHashParams(window.location.hash);
    const access_token = params.access_token;
    const refresh_token = params.refresh_token;

    if (!access_token || !refresh_token) {
      setError(params.error_description || params.error || 'Missing tokens in callback.');
      return;
    }

    let cancelled = false;
    supabaseClient.auth
      .setSession({ access_token, refresh_token })
      .then(() => {
        if (cancelled) return;
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        navigate('/', { replace: true });
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to complete sign in.');
      });

    return () => { cancelled = true; };
  }, [navigate]);

  if (error) {
    return (
      <div className="auth-callback">
        <div className="auth-callback__card">
          <p className="auth-callback__error">{error}</p>
          <a href="/" className="auth-callback__link">Return home</a>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-callback">
      <div className="auth-callback__card">
        <p className="auth-callback__message">Signing you in…</p>
        <div className="auth-callback__spinner" aria-hidden />
      </div>
    </div>
  );
}
