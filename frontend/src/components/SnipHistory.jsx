import { useState, useEffect, useCallback } from 'react';
import { useFeatureAccess } from '../hooks/useFeatureAccess.js';
import { getSnipsHistory, deleteSnip, getDriveThumbnailUrl } from '../lib/snipsHistoryService.js';
import { getDocSections, reinsertImageAtSection } from '../popup/messages.js';
import './SnipHistory.css';

function formatTimestamp(createdAt) {
  if (!createdAt) return '—';
  const d = new Date(createdAt);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

/**
 * Pro-only Snip History panel: image snippets only. Thumbnail, domain, page title, date; search, Reinsert, Delete.
 */
export function SnipHistory({ documentId, onShowUpgrade, disabled = false }) {
  const { canAccessSnipHistory } = useFeatureAccess();
  const [collapsed, setCollapsed] = useState(true);
  const [snips, setSnips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [reinsertSnip, setReinsertSnip] = useState(null);
  const [sections, setSections] = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [reinsertError, setReinsertError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadSnips = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getSnipsHistory();
      setSnips(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load snip history');
      setSnips([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canAccessSnipHistory) loadSnips();
  }, [canAccessSnipHistory, loadSnips]);

  const filteredSnips = search.trim()
    ? snips.filter((s) => {
        const q = search.trim().toLowerCase();
        const pageTitle = (s.page_title || '').toLowerCase();
        const domain = (s.domain || '').toLowerCase();
        const url = (s.source_url || '').toLowerCase();
        const doc = (s.doc_title || '').toLowerCase();
        return pageTitle.includes(q) || domain.includes(q) || url.includes(q) || doc.includes(q);
      })
    : snips;

  const handleReinsertClick = async (snip) => {
    setReinsertError(null);
    setSectionsLoading(true);
    try {
      const res = await getDocSections();
      if (!res?.success || !Array.isArray(res.sections) || res.sections.length === 0) {
        setReinsertError(res?.error || 'Could not load document sections. Select a document first.');
        setSectionsLoading(false);
        return;
      }
      setSections(res.sections);
      setReinsertSnip(snip);
    } catch (e) {
      setReinsertError(e instanceof Error ? e.message : 'Failed to load sections');
    } finally {
      setSectionsLoading(false);
    }
  };

  const handlePickSectionForReinsert = async (section) => {
    if (!reinsertSnip?.drive_url) return;
    setReinsertError(null);
    try {
      const res = await reinsertImageAtSection(
        reinsertSnip.drive_url,
        section.index,
        { pageUrl: reinsertSnip.source_url || '', pageTitle: reinsertSnip.page_title || '' }
      );
      if (res?.success) {
        setReinsertSnip(null);
        setSections([]);
      } else {
        setReinsertError(res?.error || 'Failed to insert');
      }
    } catch (e) {
      setReinsertError(e instanceof Error ? e.message : 'Failed to insert');
    }
  };

  const handleDelete = async (snip) => {
    setDeletingId(snip.id);
    try {
      await deleteSnip(snip.id);
      setSnips((prev) => prev.filter((s) => s.id !== snip.id));
    } catch (_) {
      setError('Failed to delete snip');
    } finally {
      setDeletingId(null);
    }
  };

  if (!canAccessSnipHistory) {
    return (
      <div className={`snip-history snip-history--locked ${collapsed ? 'snip-history--collapsed' : ''}`}>
        <button
          type="button"
          className="snip-history__header"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-controls="snip-history-content-locked"
          id="snip-history-label-locked"
        >
          <span className="snip-history__header-title">Snip History</span>
          <span className="snip-history__collapse-icon" aria-hidden>{collapsed ? '▶' : '▼'}</span>
        </button>
        <div id="snip-history-content-locked" className="snip-history__content" aria-labelledby="snip-history-label-locked" hidden={collapsed}>
          <p className="snip-history__locked-text">View and reinsert past snips. Upgrade to Pro to unlock.</p>
          <button
            type="button"
            className="snip-history__upgrade-btn"
            onClick={onShowUpgrade}
            disabled={disabled}
          >
            Upgrade to Pro
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`snip-history ${collapsed ? 'snip-history--collapsed' : ''}`}>
      <button
        type="button"
        className="snip-history__header"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-controls="snip-history-content"
        id="snip-history-label"
      >
        <span className="snip-history__header-title">Snip History</span>
        <span className="snip-history__collapse-icon" aria-hidden>{collapsed ? '▶' : '▼'}</span>
      </button>
      <div id="snip-history-content" className="snip-history__content" aria-labelledby="snip-history-label" hidden={collapsed}>
      <input
        type="search"
        className="snip-history__search"
        placeholder="Search by page title, domain or URL…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search snips"
      />
      {loading && <p className="snip-history__status">Loading…</p>}
      {error && <p className="snip-history__error" role="alert">{error}</p>}
      {!loading && !error && reinsertSnip && (
        <div className="snip-history__sections">
          <p className="snip-history__sections-label">Choose where to insert:</p>
          <ul className="snip-history__sections-list">
            {sections.map((sec) => (
              <li key={sec.index}>
                <button
                  type="button"
                  className="snip-history__section-btn"
                  onClick={() => handlePickSectionForReinsert(sec)}
                  disabled={disabled}
                >
                  {sec.label}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="snip-history__section-cancel" onClick={() => { setReinsertSnip(null); setSections([]); setReinsertError(null); }}>
            Cancel
          </button>
          {reinsertError && <p className="snip-history__error">{reinsertError}</p>}
        </div>
      )}
      {!loading && !error && !reinsertSnip && sectionsLoading && <p className="snip-history__status">Loading sections…</p>}
      {!loading && !error && !reinsertSnip && !sectionsLoading && (
        <div className="snip-history__list-wrap">
          {filteredSnips.length === 0 ? (
            <p className="snip-history__empty">{search.trim() ? 'No snips match your search.' : 'No image snips yet. Use Snip and Plug to add screenshots.'}</p>
          ) : (
            <ul className="snip-history__list">
              {filteredSnips.map((snip) => (
                <li key={snip.id} className="snip-history__item">
                  <div className="snip-history__item-inner">
                    {snip.drive_url ? (
                      <img
                        src={getDriveThumbnailUrl(snip.drive_url)}
                        alt=""
                        className="snip-history__thumb"
                      />
                    ) : (
                      <div className="snip-history__thumb snip-history__thumb--placeholder" aria-hidden />
                    )}
                    <div className="snip-history__item-body">
                      {snip.domain && <span className="snip-history__domain">{snip.domain}</span>}
                      <p className="snip-history__page-title">{snip.page_title || 'Untitled'}</p>
                      {snip.source_url ? (
                        <a
                          href={snip.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="snip-history__url"
                        >
                          {snip.source_url.length > 50 ? snip.source_url.slice(0, 47) + '…' : snip.source_url}
                        </a>
                      ) : (
                        <span className="snip-history__url snip-history__url--muted">No source URL</span>
                      )}
                      <div className="snip-history__meta">
                        {snip.doc_title && <span className="snip-history__doc">{snip.doc_title}</span>}
                        <span className="snip-history__time">{formatTimestamp(snip.created_at)}</span>
                      </div>
                      <div className="snip-history__actions">
                        <button
                          type="button"
                          className="snip-history__btn snip-history__btn--reinsert"
                          onClick={() => handleReinsertClick(snip)}
                          disabled={disabled || !documentId || !snip.drive_url}
                          title={!documentId ? 'Select a document first' : 'Insert into current document'}
                        >
                          Reinsert
                        </button>
                        <button
                          type="button"
                          className="snip-history__btn snip-history__btn--delete"
                          onClick={() => handleDelete(snip)}
                          disabled={disabled || deletingId === snip.id}
                          title="Remove from history"
                        >
                          {deletingId === snip.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
