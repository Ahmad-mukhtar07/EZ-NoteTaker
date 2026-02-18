import { useState, useEffect } from 'react';
import { getDocsList, setSelectedDoc } from '../popup/messages.js';
import './DocsList.css';

/**
 * Fetches docs list via background (DOCS_LIST) and stores selection via DOCS_SET_SELECTED. No direct API.
 */
export function DocsList({ onSelectDocument, onError, disabled = false }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getDocsList();
        if (cancelled) return;
        if (res?.success && Array.isArray(res.docs)) {
          setDocs(res.docs);
        } else {
          setError(res?.error || 'Failed to load documents');
          onError?.();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load documents';
        if (!cancelled) setError(message);
        onError?.(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [onError]);

  const handleSelect = async (doc) => {
    try {
      const res = await setSelectedDoc(doc.id, doc.name);
      if (res?.success) {
        onSelectDocument?.(doc);
      } else {
        setError(res?.error || 'Failed to save selection');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save selection';
      setError(message);
    }
  };

  if (loading) {
    return <div className="docs-list docs-list--loading">Loading your documents…</div>;
  }

  if (error) {
    return (
      <div className="docs-list docs-list--error" role="alert">
        {error}
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="docs-list docs-list--empty">
        No Google Docs found. Create a doc at docs.google.com and try again.
      </div>
    );
  }

  return (
    <div className="docs-list">
      <p className="docs-list__label">Select a document to connect:</p>
      <ul className="docs-list__list" role="listbox">
        {docs.map((doc) => (
          <li key={doc.id} className="docs-list__item">
            <button
              type="button"
              className="docs-list__item-btn"
              onClick={() => handleSelect(doc)}
              role="option"
              disabled={disabled}
            >
              <span className="docs-list__item-name">{doc.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
