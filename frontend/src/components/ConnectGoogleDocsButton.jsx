import { useState } from 'react';
import { authConnect } from '../popup/messages.js';
import './ConnectGoogleDocsButton.css';

/**
 * Primary CTA to connect Google Docs via background (AUTH_CONNECT). No direct auth/API calls.
 */
export function ConnectGoogleDocsButton({ onSuccess, disabled = false }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [redirectUri, setRedirectUri] = useState(null);

  const handleClick = async () => {
    setError(null);
    setRedirectUri(null);
    setLoading(true);
    try {
      const res = await authConnect();
      if (res?.success) {
        onSuccess?.();
      } else {
        setError(res?.error || 'Something went wrong');
        if (res?.redirectUri) setRedirectUri(res.redirectUri);
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
      <p className="connect-google-docs__intro">
        DocSourced lets you capture text and screenshots from the web and add them to a Google Doc—with sources attached. Great for research, reading lists, and cited notes.
      </p>
      <div className="connect-google-docs__cta-wrap">
        <p className="connect-google-docs__cta-label">Get started</p>
        <button
          type="button"
          className="connect-google-docs__btn"
          onClick={handleClick}
          disabled={disabled || loading}
          aria-busy={loading}
        >
          {loading ? 'Connecting…' : 'Connect Google Docs'}
        </button>
      </div>
      {error && (
        <div className="connect-google-docs__error" role="alert">
          <p>{error}</p>
          {redirectUri && (
            <p className="connect-google-docs__redirect-hint">
              Add this <strong>exact</strong> URI in Google Cloud Console → your Web application client → Authorized redirect URIs:
              <br />
              <code className="connect-google-docs__redirect-uri">{redirectUri}</code>
            </p>
          )}
        </div>
      )}
      <section className="connect-google-docs__about" aria-label="What the extension does">
        <h2 className="connect-google-docs__about-title">What you can do</h2>
        <ul className="connect-google-docs__about-list">
          <li><strong>Text Snip</strong> — Select text on any page and add it to your Google Doc with source and link. Or copy to clipboard to paste anywhere.</li>
          <li><strong>Image Snip</strong> — Capture a screenshot region and insert it into your doc (or copy to clipboard). Source is included.</li>
          <li>Choose where to add content: at the start, end, or in any section of your doc.</li>
          <li>Use <strong>Format References</strong> to turn inline sources into numbered references and a Sources list (Pro).</li>
        </ul>
      </section>
      <section className="connect-google-docs__steps" aria-label="How it works">
        <h2 className="connect-google-docs__about-title">How it works</h2>
        <ol className="connect-google-docs__steps-list">
          <li><strong>Connect</strong> — Sign in with Google and pick a Doc (or create one).</li>
          <li><strong>Snip</strong> — Use Text Snip or Image Snip from the extension or right‑click on the page.</li>
          <li><strong>Done</strong> — Content appears in your doc with source and link; format references when you’re ready.</li>
        </ol>
      </section>
    </div>
  );
}
