import { useState, useEffect } from 'react';
import { fetchDocsList } from '../lib/googleApi.js';
import { setSelectedDocument } from '../lib/storage.js';
import './DocsList.css';

/**
 * Fetches and displays the user's Google Docs. On select, stores documentId and name.
 */
export function DocsList({ accessToken, onSelectDocument, onError }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const list = await fetchDocsList(accessToken);
        if (!cancelled) setDocs(list);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load documents';
        if (!cancelled) setError(message);
        onError?.(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (accessToken) load();
    return () => { cancelled = true; };
  }, [accessToken, onError]);

  const handleSelect = async (doc) => {
    try {
      await setSelectedDocument(doc.id, doc.name);
      onSelectDocument?.(doc);
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
            >
              <span className="docs-list__item-name">{doc.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
