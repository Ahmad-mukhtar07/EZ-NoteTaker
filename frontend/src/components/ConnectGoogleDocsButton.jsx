import { useState } from 'react';
import './ConnectGoogleDocsButton.css';

/**
 * Primary CTA to start Google sign-in and connect to Docs.
 * Shows loading and error state.
 */
export function ConnectGoogleDocsButton({ onSuccess, disabled = false }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleClick = async () => {
    setError(null);
    setLoading(true);
    try {
      const { getAuthToken, storeAccessToken, AuthError } = await import('../lib/auth.js');
      const token = await getAuthToken();
      await storeAccessToken(token);
      onSuccess?.(token);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      const isUserCancel = err?.name === 'AuthError' && err?.isUserCancel;
      setError(isUserCancel ? 'Sign-in was cancelled.' : message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="connect-google-docs">
      <button
        type="button"
        className="connect-google-docs__btn"
        onClick={handleClick}
        disabled={disabled || loading}
        aria-busy={loading}
      >
        {loading ? 'Connecting…' : 'Connect Google Docs'}
      </button>
      {error && <p className="connect-google-docs__error" role="alert">{error}</p>}
    </div>
  );
}
