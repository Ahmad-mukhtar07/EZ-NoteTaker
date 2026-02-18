import { useState, useEffect } from 'react';
import { getDocsList, setSelectedDoc, createDoc } from '../popup/messages.js';
import './DocsList.css';

/**
 * Fetches docs list via background (DOCS_LIST), stores selection via DOCS_SET_SELECTED, can create new doc (DOCS_CREATE).
 */
export function DocsList({ onSelectDocument, onError, disabled = false }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newDocName, setNewDocName] = useState('');

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

  const handleCreateNew = async () => {
    setError(null);
    setCreating(true);
    const name = newDocName.trim() || 'Untitled';
    try {
      const res = await createDoc(name);
      if (res?.success && res?.doc) {
        setNewDocName('');
        onSelectDocument?.({ id: res.doc.id, name: res.doc.name });
      } else {
        setError(res?.error || 'Failed to create document');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create document';
      setError(message);
    } finally {
      setCreating(false);
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
        <p>No Google Docs found.</p>
        <div className="docs-list__new-form docs-list__new-form--empty">
          <label htmlFor="docs-list-new-name" className="docs-list__new-label">New document title</label>
          <div className="docs-list__new-row">
            <input
              id="docs-list-new-name"
              type="text"
              className="docs-list__new-input"
              placeholder="Untitled"
              value={newDocName}
              onChange={(e) => setNewDocName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateNew()}
              disabled={disabled || creating}
              aria-label="New document title"
            />
            <button
              type="button"
              className="docs-list__create"
              onClick={handleCreateNew}
              disabled={disabled || creating}
              aria-busy={creating}
            >
              {creating ? 'Creating…' : 'Create new document'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="docs-list">
      <p className="docs-list__label">Select a document to connect:</p>
      <div className="docs-list__new-form">
        <label htmlFor="docs-list-new-name-inline" className="docs-list__new-label">New document title</label>
        <div className="docs-list__new-row">
          <input
            id="docs-list-new-name-inline"
            type="text"
            className="docs-list__new-input"
            placeholder="Untitled"
            value={newDocName}
            onChange={(e) => setNewDocName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateNew()}
            disabled={disabled || creating}
            aria-label="New document title"
          />
          <button
            type="button"
            className="docs-list__create"
            onClick={handleCreateNew}
            disabled={disabled || creating}
            aria-busy={creating}
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
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
