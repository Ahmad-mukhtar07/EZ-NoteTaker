import { useState } from 'react';
import { authConnect } from '../popup/messages.js';
import './ConnectGoogleDocsButton.css';

/**
 * Primary CTA to connect Google Docs via background (AUTH_CONNECT). No direct auth/API calls.
 */
export function ConnectGoogleDocsButton({ onSuccess, disabled = false }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleClick = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await authConnect();
      if (res?.success) {
        onSuccess?.();
      } else {
        setError(res?.error || 'Something went wrong');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
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
