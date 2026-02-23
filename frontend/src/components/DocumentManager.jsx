import { useState, useEffect, useRef } from 'react';
import { getConnectedDocs, addConnectedDoc, removeConnectedDoc } from '../lib/connectedDocsService.js';
import { setSelectedDoc } from '../popup/messages.js';
import { useFeatureAccess } from '../hooks/useFeatureAccess.js';
import { DocsList } from './DocsList.jsx';
import { UpgradeModal } from './UpgradeModal.jsx';
import './DocumentManager.css';

/**
 * Manages connected documents: list from Supabase, switch active, or add new (Drive list).
 * Free tier: one doc only — "Connect new document" shows upgrade when limit reached.
 */
export function DocumentManager({
  currentDocumentId,
  onSelectDocument,
  onDocumentRemoved,
  onClose,
  disabled = false,
}) {
  const { canUseMultipleDocs } = useFeatureAccess();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('list'); // 'list' | 'add'
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const didInjectCurrentRef = useRef(false);

  const loadDocs = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getConnectedDocs();
      setDocs(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, []);

  // Once list is loaded: if active doc (from storage) is not in connected_docs, add it so it appears (one-time)
  useEffect(() => {
    if (loading || !currentDocumentId || didInjectCurrentRef.current) return;
    const inList = docs.some((d) => d.google_doc_id === currentDocumentId);
    if (inList) return;
    didInjectCurrentRef.current = true;
    addConnectedDoc(currentDocumentId, 'Current document')
      .then((row) => {
        if (row?.id) setDocs((prev) => [row, ...prev]);
      })
      .catch(() => {});
  }, [loading, currentDocumentId, docs]);

  const handleSelectConnected = async (doc) => {
    try {
      const res = await setSelectedDoc(doc.google_doc_id, doc.doc_title);
      if (res?.success) {
        onSelectDocument?.({ id: doc.google_doc_id, name: doc.doc_title });
        onClose?.();
      } else {
        setError(res?.error || 'Failed to set document');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set document');
    }
  };

  const handleAddNewSelect = async (doc) => {
    try {
      await addConnectedDoc(doc.id, doc.name);
      const res = await setSelectedDoc(doc.id, doc.name);
      if (res?.success) {
        onSelectDocument?.(doc);
        onClose?.();
      } else {
        setError(res?.error || 'Failed to set document');
      }
    } catch (e) {
      if (e?.code === 'DOC_LIMIT_REACHED') {
        setShowUpgradeModal(true);
        return;
      }
      setError(e instanceof Error ? e.message : 'Failed to add document');
    }
  };

  const handleConnectNewClick = () => {
    if (!canUseMultipleDocs && docs.length >= 1) {
      setShowUpgradeModal(true);
      return;
    }
    setMode('add');
  };

  const handleRemoveDoc = async (e, doc) => {
    e.stopPropagation();
    if (disabled) return;
    try {
      await removeConnectedDoc(doc.id);
      const nextList = docs.filter((d) => d.id !== doc.id);
      setDocs(nextList);
      const wasActive = currentDocumentId === doc.google_doc_id;
      if (wasActive) {
        if (nextList.length > 0) {
          const next = nextList[0];
          const res = await setSelectedDoc(next.google_doc_id, next.doc_title);
          if (res?.success) onSelectDocument?.({ id: next.google_doc_id, name: next.doc_title });
        } else {
          onDocumentRemoved?.();
          onClose?.();
        }
      }
    } catch (_) {
      loadDocs();
    }
  };

  if (mode === 'add') {
    return (
      <div className="doc-manager">
        <button
          type="button"
          className="doc-manager__back"
          onClick={() => setMode('list')}
          disabled={disabled}
        >
          ← Back to my documents
        </button>
        <DocsList
          onSelectDocument={handleAddNewSelect}
          onError={() => setError('Could not load Google Docs')}
          disabled={disabled}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="doc-manager doc-manager--loading">
        <p>Loading your documents…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="doc-manager doc-manager--error" role="alert">
        <p>{error}</p>
        <button type="button" className="doc-manager__retry" onClick={loadDocs}>
          Retry
        </button>
        <button type="button" className="doc-manager__back" onClick={onClose}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="doc-manager">
      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason="doc_limit"
      />
      <p className="doc-manager__label">Select active document (used for Plug and Snip):</p>
      <ul className="doc-manager__list" role="listbox">
        {docs.map((doc) => {
          const isActive = currentDocumentId === doc.google_doc_id;
          return (
            <li key={doc.id} className="doc-manager__item">
              <button
                type="button"
                className={`doc-manager__item-btn ${isActive ? 'doc-manager__item-btn--active' : ''}`}
                onClick={() => handleSelectConnected(doc)}
                disabled={disabled}
                role="option"
                aria-selected={isActive}
              >
                <span className="doc-manager__item-name">{doc.doc_title || 'Untitled'}</span>
                {isActive && <span className="doc-manager__item-badge">Active</span>}
              </button>
              <button
                type="button"
                className="doc-manager__item-remove"
                onClick={(e) => handleRemoveDoc(e, doc)}
                disabled={disabled}
                aria-label={`Remove ${doc.doc_title || 'Untitled'} from list`}
                title="Remove from list"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="doc-manager__add"
        onClick={handleConnectNewClick}
        disabled={disabled}
        title={!canUseMultipleDocs && docs.length >= 1 ? 'Upgrade to Pro to connect more documents' : undefined}
      >
        + Connect new document
      </button>
      <button type="button" className="doc-manager__cancel" onClick={onClose} disabled={disabled}>
        Cancel
      </button>
    </div>
  );
}
