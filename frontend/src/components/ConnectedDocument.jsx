import { useState, useRef, useEffect } from 'react';
import { getPlugSelection, getDocSections, plugItInAtSection, getSnipUsage, setSelectedDoc, formatReferences, getUndoState, undoLastInsert } from '../popup/messages.js';
import { useAuth } from '../hooks/useAuth.js';
import { useFeatureAccess } from '../hooks/useFeatureAccess.js';
import { getConnectedDocs, removeConnectedDoc } from '../lib/connectedDocsService.js';
import { UpgradeModal } from './UpgradeModal';
import { SnipHistory } from './SnipHistory';
import './ConnectedDocument.css';

/**
 * Shows the currently connected document, "Snip and Plug", and "Change document".
 * "Plug it in" opens a section picker to choose where to insert the selected text.
 */
export function ConnectedDocument({ documentId, documentName, onChangeDocument, onSwitchDocument, onDocumentRemoved, disabled = false }) {
  const { user: supabaseUser, syncSessionTokenToStorage } = useAuth();
  const [snipActive, setSnipActive] = useState(false);
  const snipActiveTimer = useRef(null);
  const [plugStep, setPlugStep] = useState(null); // null | 'loading' | 'sections' | 'inserting'
  const [plugSelection, setPlugSelection] = useState(null);
  const [plugSections, setPlugSections] = useState([]);
  const [plugError, setPlugError] = useState(null);
  const [plugSuccess, setPlugSuccess] = useState(false);
  const [snipStep, setSnipStep] = useState(null); // null | 'loading_sections' | 'sections' | 'inserting'
  const [snipSections, setSnipSections] = useState([]);
  const [snipError, setSnipError] = useState(null);
  const [snipSuccess, setSnipSuccess] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeModalReason, setUpgradeModalReason] = useState('snip_limit');
  const [upgradeModalLimit, setUpgradeModalLimit] = useState(25);
  const { canAccessSnipHistory, canUseUnlimitedSnips } = useFeatureAccess();
  // Block Snip and Plug only after we've queried usage and user is over limit (allow by default until then)
  const [snipUsage, setSnipUsage] = useState({ used: 0, limit: 25, allowed: true });
  const [snipUsageLoaded, setSnipUsageLoaded] = useState(false);
  const [snipUsageError, setSnipUsageError] = useState(null);
  const [docDropdownOpen, setDocDropdownOpen] = useState(false);
  const [connectedDocs, setConnectedDocs] = useState([]);
  const [collapsed, setCollapsed] = useState(false);
  const docDropdownRef = useRef(null);
  const [formatRefLoading, setFormatRefLoading] = useState(false);
  const [formatRefError, setFormatRefError] = useState(null);
  const [formatRefSuccess, setFormatRefSuccess] = useState(null);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [undoLoading, setUndoLoading] = useState(false);
  const [undoError, setUndoError] = useState(null);
  const [undoSuccess, setUndoSuccess] = useState(false);

  useEffect(() => {
    if (collapsed) setDocDropdownOpen(false);
  }, [collapsed]);

  const refreshUndoState = () => {
    getUndoState().then((r) => setUndoAvailable(r?.available === true)).catch(() => setUndoAvailable(false));
  };

  useEffect(() => {
    if (!documentId) {
      setUndoAvailable(false);
      return;
    }
    refreshUndoState();
  }, [documentId]);

  const fetchSnipUsage = async () => {
    try {
      const u = await getSnipUsage();
      if (u && typeof u.error === 'string') {
        const isChannelOrTimeout = /channel closed|timed out|message failed/i.test(u.error);
        setSnipUsage((prev) => ({
          ...prev,
          allowed: isChannelOrTimeout ? prev.allowed : false,
        }));
        setSnipUsageError(isChannelOrTimeout ? 'Connection lost. Reopen the extension to try again.' : null);
        setSnipUsageLoaded(true);
        return;
      }
      setSnipUsage({
        used: typeof u?.used === 'number' ? u.used : 0,
        limit: typeof u?.limit === 'number' ? u.limit : 25,
        allowed: u?.allowed === true || (u?.allowed !== false && (typeof u?.limit === 'number' && u.limit > 0 ? (typeof u?.used === 'number' && u.used < u.limit) : true)),
      });
      setSnipUsageError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isChannelOrTimeout = /channel closed|timed out|message failed/i.test(msg);
      setSnipUsage((prev) => ({
        ...prev,
        allowed: isChannelOrTimeout ? prev.allowed : false,
      }));
      setSnipUsageError(isChannelOrTimeout ? 'Connection lost. Reopen the extension to try again.' : null);
    } finally {
      setSnipUsageLoaded(true);
    }
  };

  const userId = supabaseUser?.id ?? null;

  // On popup open: restore snip overlay state only
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    chrome.runtime.sendMessage({ type: 'GET_SNIP_STATE' }, (response) => {
      if (!chrome.runtime.lastError && response?.active) setSnipActive(true);
    });
  }, []);

  // When user is set or changes (e.g. switch account), sync token to storage then fetch usage for that user
  useEffect(() => {
    setSnipUsageLoaded(false);
    if (userId != null && typeof syncSessionTokenToStorage === 'function') {
      syncSessionTokenToStorage().then(() => fetchSnipUsage());
    } else {
      setSnipUsageLoaded(true);
      setSnipUsage((prev) => ({ ...prev, allowed: false }));
    }
  }, [userId, syncSessionTokenToStorage]);

  // Load connected docs for dropdown (when user is set)
  useEffect(() => {
    if (userId == null) return;
    getConnectedDocs()
      .then(setConnectedDocs)
      .catch(() => setConnectedDocs([]));
  }, [userId, documentId]);

  // After downgrade to free, excess docs are removed server-side. If current doc is no longer in the list, sync to the remaining one.
  useEffect(() => {
    if (!documentId || connectedDocs.length === 0) return;
    const currentInList = connectedDocs.some((d) => d.google_doc_id === documentId);
    if (currentInList) return;
    const remaining = connectedDocs[0];
    setSelectedDoc(remaining.google_doc_id, remaining.doc_title || 'Untitled').then((res) => {
      if (res?.success) onSwitchDocument?.({ id: remaining.google_doc_id, name: remaining.doc_title || 'Untitled' });
    });
  }, [connectedDocs, documentId, onSwitchDocument]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!docDropdownOpen) return;
    const handleClickOutside = (e) => {
      if (docDropdownRef.current && !docDropdownRef.current.contains(e.target)) {
        setDocDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [docDropdownOpen]);

  const SNIP_SUCCESS_KEY = 'eznote_snip_insert_success';
  const SNIP_ERROR_KEY = 'eznote_snip_insert_error';
  const SNIP_INSERTING_KEY = 'eznote_snip_inserting';
  const snipOverlayClosedTimer = useRef(null);

  // When overlay is closed (complete/cancel/error), background sets state false; keep button in sync. Clear inserting only on success, error, or explicit cancel (not when overlay closes — it closes as soon as user draws the region).
  useEffect(() => {
    const storage = chrome.storage?.session || chrome.storage?.local;
    if (!storage?.onChanged) return;
    const listener = (changes) => {
      if (changes['eznote_snip_overlay_active'] !== undefined) {
        setSnipActive(!!changes['eznote_snip_overlay_active'].newValue);
      }
      if (changes['eznote_snip_cancelled'] !== undefined && changes['eznote_snip_cancelled'].newValue === true) {
        if (snipOverlayClosedTimer.current) clearTimeout(snipOverlayClosedTimer.current);
        setSnipStep(null);
        storage.remove(SNIP_INSERTING_KEY);
        storage.remove('eznote_snip_cancelled');
      }
      if (changes[SNIP_SUCCESS_KEY] !== undefined && changes[SNIP_SUCCESS_KEY].newValue === true) {
        if (snipOverlayClosedTimer.current) {
          clearTimeout(snipOverlayClosedTimer.current);
          snipOverlayClosedTimer.current = null;
        }
        setSnipStep(null);
        storage.remove(SNIP_INSERTING_KEY);
        setSnipSuccess(true);
        storage.remove(SNIP_SUCCESS_KEY);
        fetchSnipUsage();
        getUndoState().then((r) => setUndoAvailable(r?.available === true)).catch(() => setUndoAvailable(false));
        setTimeout(() => setSnipSuccess(false), 2500);
      }
      if (changes[SNIP_ERROR_KEY] !== undefined && changes[SNIP_ERROR_KEY].newValue) {
        const errMsg = changes[SNIP_ERROR_KEY].newValue;
        if (snipOverlayClosedTimer.current) {
          clearTimeout(snipOverlayClosedTimer.current);
          snipOverlayClosedTimer.current = null;
        }
        setSnipStep(null);
        storage.remove(SNIP_INSERTING_KEY);
        setSnipError(typeof errMsg === 'string' ? errMsg : 'Snip and Plug failed');
        storage.remove(SNIP_ERROR_KEY);
      }
    };
    storage.onChanged.addListener(listener);
    return () => {
      storage.onChanged.removeListener(listener);
      if (snipOverlayClosedTimer.current) clearTimeout(snipOverlayClosedTimer.current);
    };
  }, []);

  // On popup open: if snip just succeeded (e.g. user had popup closed), show success once. Restore inserting state so spinner shows until success/error. Clear inserting when cancelled.
  useEffect(() => {
    const storage = chrome.storage?.session || chrome.storage?.local;
    if (!storage?.get) return;
    storage.get([SNIP_SUCCESS_KEY, SNIP_ERROR_KEY, SNIP_INSERTING_KEY, 'eznote_snip_overlay_active', 'eznote_snip_cancelled'], (result) => {
      if (result?.[SNIP_SUCCESS_KEY] === true) {
        setSnipStep(null);
        storage.remove(SNIP_INSERTING_KEY);
        setSnipSuccess(true);
        storage.remove(SNIP_SUCCESS_KEY);
        setTimeout(() => setSnipSuccess(false), 2500);
      }
      if (result?.[SNIP_ERROR_KEY]) {
        setSnipStep(null);
        storage.remove(SNIP_INSERTING_KEY);
        setSnipError(typeof result[SNIP_ERROR_KEY] === 'string' ? result[SNIP_ERROR_KEY] : 'Snip and Plug failed');
        storage.remove(SNIP_ERROR_KEY);
      }
      if (result?.['eznote_snip_cancelled'] === true) {
        setSnipStep(null);
        storage.remove(SNIP_INSERTING_KEY);
        storage.remove('eznote_snip_cancelled');
      }
      if (result?.[SNIP_INSERTING_KEY] === true && result?.[SNIP_SUCCESS_KEY] !== true && !result?.[SNIP_ERROR_KEY] && !result?.['eznote_snip_cancelled']) {
        setSnipStep('inserting');
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (snipActiveTimer.current) clearTimeout(snipActiveTimer.current);
    };
  }, []);

  const handleSnip = async () => {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return;
    setSnipError(null);
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) {
      setSnipError('No active tab');
      return;
    }
    setSnipStep('loading_sections');
    try {
      const secRes = await getDocSections();
      if (!secRes?.success || !Array.isArray(secRes.sections) || secRes.sections.length === 0) {
        setSnipError(secRes?.error || 'Could not load document sections');
        setSnipStep(null);
        return;
      }
      setSnipSections(secRes.sections);
      setSnipStep('sections');
    } catch (e) {
      setSnipError(e instanceof Error ? e.message : 'Something went wrong');
      setSnipStep(null);
    }
  };

  const handlePickSnipSection = (section) => {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return;
    setSnipError(null);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) return;
      setSnipActive(true);
      if (snipActiveTimer.current) clearTimeout(snipActiveTimer.current);
      chrome.runtime.sendMessage(
        { type: 'SNIP_START_WITH_SECTION', insertIndex: section.index, tabId: tab.id },
        (response) => {
          if (chrome.runtime.lastError) {
            setSnipError(chrome.runtime.lastError.message || 'Failed to start snip');
            setSnipStep('sections');
            return;
          }
          if (response?.error) {
            setSnipError(response.error);
            setSnipStep('sections');
            return;
          }
          setSnipStep('inserting');
          setSnipSections([]);
          const storage = chrome.storage?.session || chrome.storage?.local;
          if (storage) storage.set({ [SNIP_INSERTING_KEY]: true });
        }
      );
    });
  };

  const handleCancelSnipSection = () => {
    setSnipStep(null);
    setSnipSections([]);
    setSnipError(null);
  };

  const handlePlugItIn = async () => {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return;
    setPlugError(null);
    setPlugSuccess(false);
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) {
      setPlugError('No active tab');
      return;
    }
    setPlugStep('loading');
    try {
      const selRes = await getPlugSelection(tab.id);
      if (!selRes?.success || !selRes?.selection) {
        setPlugError(selRes?.error || 'Could not get selection');
        setPlugStep(null);
        return;
      }
      if (!selRes.selection.selectedText?.trim()) {
        setPlugError('No text selected. Select some text on the page first.');
        setPlugStep(null);
        return;
      }
      const secRes = await getDocSections();
      if (!secRes?.success || !Array.isArray(secRes.sections) || secRes.sections.length === 0) {
        setPlugError(secRes?.error || 'Could not load document sections');
        setPlugStep(null);
        return;
      }
      setPlugSelection(selRes.selection);
      setPlugSections(secRes.sections);
      setPlugStep('sections');
    } catch (e) {
      setPlugError(e instanceof Error ? e.message : 'Something went wrong');
      setPlugStep(null);
    }
  };

  const handlePickSection = async (section) => {
    if (!plugSelection) return;
    setPlugStep('inserting');
    setPlugError(null);
    try {
      const res = await plugItInAtSection(plugSelection, section.index);
      if (res?.success) {
        setPlugSuccess(true);
        setPlugStep(null);
        setPlugSelection(null);
        setPlugSections([]);
        fetchSnipUsage();
        refreshUndoState();
        setTimeout(() => setPlugSuccess(false), 2500);
      } else if (res?.error === 'snip_limit_reached') {
        setPlugStep(null);
        setPlugSelection(null);
        setPlugSections([]);
        setPlugError(null);
        setUpgradeModalLimit(res?.limit ?? 25);
        setUpgradeModalReason('snip_limit');
        setShowUpgradeModal(true);
        setSnipUsage((prev) => ({ ...prev, allowed: false }));
      } else {
        const errMsg = res?.error === 'not_authenticated'
          ? 'Sign in to your account to use Snip and Plug.'
          : (res?.error || 'Insert failed');
        setPlugError(errMsg);
        setPlugStep('sections');
      }
    } catch (e) {
      setPlugError(e instanceof Error ? e.message : 'Insert failed');
      setPlugStep('sections');
    }
  };

  const handleCancelPlug = () => {
    setPlugStep(null);
    setPlugSelection(null);
    setPlugSections([]);
    setPlugError(null);
  };

  const handleFormatReferences = async () => {
    setFormatRefError(null);
    setFormatRefSuccess(null);
    setFormatRefLoading(true);
    try {
      const res = await formatReferences();
      if (res?.success) {
        setFormatRefSuccess(res.message || 'References formatted.');
        setTimeout(() => setFormatRefSuccess(null), 4000);
      } else {
        setFormatRefError(res?.error || 'Format failed');
      }
    } catch (e) {
      setFormatRefError(e instanceof Error ? e.message : 'Format failed');
    } finally {
      setFormatRefLoading(false);
    }
  };

  const handleUndoLastInsert = async () => {
    if (!undoAvailable || undoLoading) return;
    setUndoError(null);
    setUndoLoading(true);
    try {
      const res = await undoLastInsert();
      if (res?.success) {
        setUndoAvailable(false);
        setUndoSuccess(true);
        setTimeout(() => setUndoSuccess(false), 2000);
        refreshUndoState();
      } else {
        setUndoError(res?.error || 'Undo failed');
        refreshUndoState();
      }
    } catch (e) {
      setUndoError(e instanceof Error ? e.message : 'Undo failed');
      refreshUndoState();
    } finally {
      setUndoLoading(false);
    }
  };

  const snipClass =
    'connected-doc__btn connected-doc__btn--snip' +
    (snipActive ? ' connected-doc__btn--snip-active' : '') +
    (snipUsageLoaded && !snipUsage.allowed ? ' connected-doc__btn--snip-disabled' : '');

  const handleSelectDoc = async (doc) => {
    const res = await setSelectedDoc(doc.google_doc_id, doc.doc_title || 'Untitled');
    if (res?.success) {
      onSwitchDocument?.({ id: doc.google_doc_id, name: doc.doc_title || 'Untitled' });
      setDocDropdownOpen(false);
    }
  };

  const handleRemoveDoc = async (e, doc) => {
    e.stopPropagation();
    if (disabled) return;
    try {
      await removeConnectedDoc(doc.id);
      const nextList = connectedDocs.filter((d) => d.id !== doc.id);
      setConnectedDocs(nextList);
      if (documentId === doc.google_doc_id) {
        if (nextList.length > 0) {
          const next = nextList[0];
          const res = await setSelectedDoc(next.google_doc_id, next.doc_title || 'Untitled');
          if (res?.success) onSwitchDocument?.({ id: next.google_doc_id, name: next.doc_title || 'Untitled' });
        } else {
          await setSelectedDoc('', '');
          onDocumentRemoved?.();
        }
      }
      setDocDropdownOpen(false);
    } catch (_) {
      // keep list as-is on error
    }
  };

  return (
    <div className={`connected-doc ${collapsed ? 'connected-doc--collapsed' : ''}`}>
      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason={upgradeModalReason}
        limit={upgradeModalLimit}
      />
      <div className="connected-doc__row">
        <span className="connected-doc__row-label">Active document</span>
        <div className="connected-doc__row-right">
          <div className="connected-doc__dropdown" ref={docDropdownRef}>
            <button
              type="button"
              className="connected-doc__dropdown-trigger"
              onClick={() => setDocDropdownOpen((open) => !open)}
              disabled={disabled}
              aria-expanded={docDropdownOpen}
              aria-haspopup="listbox"
              aria-label="Change document"
            >
              <span className="connected-doc__dropdown-trigger-text">Change document</span>
              <span className="connected-doc__dropdown-trigger-icon" aria-hidden>{docDropdownOpen ? '▲' : '▼'}</span>
            </button>
          {docDropdownOpen && (
            <div className="connected-doc__dropdown-panel" role="listbox">
              {connectedDocs.map((doc) => {
                const isActive = documentId === doc.google_doc_id;
                return (
                  <div
                    key={doc.id}
                    className={`connected-doc__dropdown-row ${isActive ? 'connected-doc__dropdown-option--active' : ''}`}
                    role="option"
                    aria-selected={isActive}
                  >
                    <button
                      type="button"
                      className="connected-doc__dropdown-option"
                      onClick={() => handleSelectDoc(doc)}
                    >
                      {doc.doc_title || 'Untitled'}
                    </button>
                    <button
                      type="button"
                      className="connected-doc__dropdown-remove"
                      onClick={(e) => handleRemoveDoc(e, doc)}
                      disabled={disabled}
                      aria-label={`Remove ${doc.doc_title || 'Untitled'} from list`}
                      title="Remove from list"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                className="connected-doc__dropdown-add"
                onClick={() => {
                  setDocDropdownOpen(false);
                  onChangeDocument?.();
                }}
              >
                + Connect new document
              </button>
            </div>
          )}
          </div>
          <button
            type="button"
            className="connected-doc__collapse"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand section' : 'Collapse section'}
            disabled={disabled}
          >
            <span className="connected-doc__collapse-icon" aria-hidden>{collapsed ? '▶' : '▼'}</span>
          </button>
        </div>
      </div>
      {!collapsed && (
        <>
      <p className="connected-doc__name">{documentName || 'Untitled'}</p>

      {/* Primary actions: each slot = button + its section picker (when active) */}
      <div className="connected-doc__actions connected-doc__actions--primary">
        <div className="connected-doc__primary-slot">
          <button
            type="button"
            className={`connected-doc__btn connected-doc__btn--plug ${plugStep !== null ? 'connected-doc__btn--loading' : ''}`}
            onClick={plugStep === null ? handlePlugItIn : undefined}
            disabled={disabled || snipStep !== null || plugStep !== null}
          >
            {(plugStep === 'loading' || plugStep === 'inserting') && (
              <span className="connected-doc__loader-spinner connected-doc__loader-spinner--inline" aria-hidden />
            )}
            {plugStep === 'loading' && <span>Loading…</span>}
            {plugStep === 'inserting' && <span>Adding…</span>}
            {plugStep === 'sections' && <span>Choose section…</span>}
            {plugStep === null && 'Plug it in'}
          </button>
          {plugStep === 'sections' && (
            <div className="connected-doc__sections">
              <p className="connected-doc__sections-label">Choose where to add the selected text:</p>
              <ul className="connected-doc__sections-list">
                {plugSections.map((sec) => (
                  <li key={sec.index}>
                    <button
                      type="button"
                      className="connected-doc__section-btn"
                      onClick={() => handlePickSection(sec)}
                      disabled={disabled}
                    >
                      {sec.label}
                    </button>
                  </li>
                ))}
              </ul>
              {plugError && <p className="connected-doc__plug-error" role="alert">{plugError}</p>}
              <button type="button" className="connected-doc__section-cancel" onClick={handleCancelPlug}>
                Cancel
              </button>
            </div>
          )}
        </div>
        <div className="connected-doc__primary-slot">
          {snipStep === null ? (
            <span className="connected-doc__btn-tooltip-wrap">
              <button
                type="button"
                className={snipClass}
                onClick={handleSnip}
                disabled={disabled || plugStep !== null || !snipUsage.allowed}
                title={
                  !snipUsage.allowed
                    ? (userId == null ? 'Sign in to use Snip and Plug' : undefined)
                    : plugStep !== null
                      ? 'Wait for Plug it in to finish'
                      : undefined
                }
                aria-label={
                  !canUseUnlimitedSnips && snipUsageLoaded
                    ? `Snip and Plug. ${snipUsage.allowed ? `${snipUsage.used} of ${snipUsage.limit} snips used this month` : `Monthly limit reached (${snipUsage.used}/${snipUsage.limit})`}`
                    : undefined
                }
              >
                Snip and Plug
              </button>
              {!canUseUnlimitedSnips && snipUsageLoaded && (
                <span className="connected-doc__tooltip connected-doc__tooltip--snip" role="tooltip">
                  {userId == null
                    ? 'Sign in to use Snip and Plug'
                    : snipUsage.allowed
                      ? `${snipUsage.used} of ${snipUsage.limit} snips used this month`
                      : `Monthly limit reached (${snipUsage.used}/${snipUsage.limit})`}
                </span>
              )}
            </span>
          ) : (
            <button
              type="button"
              className={`connected-doc__btn connected-doc__btn--snip connected-doc__btn--loading`}
              disabled
            >
              <span className="connected-doc__loader-spinner connected-doc__loader-spinner--inline" aria-hidden />
              <span>
                {snipStep === 'loading_sections' && 'Loading…'}
                {snipStep === 'inserting' && 'Adding…'}
                {snipStep === 'sections' && 'Choose section…'}
              </span>
            </button>
          )}
          {snipStep === 'sections' && (
            <div className="connected-doc__sections">
              <p className="connected-doc__sections-label">Choose where to add the screenshot:</p>
              <ul className="connected-doc__sections-list">
                {snipSections.map((sec) => (
                  <li key={sec.index}>
                    <button
                      type="button"
                      className="connected-doc__section-btn"
                      onClick={() => handlePickSnipSection(sec)}
                      disabled={disabled}
                    >
                      {sec.label}
                    </button>
                  </li>
                ))}
              </ul>
              {snipError && <p className="connected-doc__plug-error" role="alert">{snipError}</p>}
              <button type="button" className="connected-doc__section-cancel" onClick={handleCancelSnipSection}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
      {plugError && plugStep === null && (
        <p className="connected-doc__plug-error" role="alert">{plugError}</p>
      )}
      {plugSuccess && (
        <p className="connected-doc__plug-success">Added to doc!</p>
      )}
      {snipStep === null && (
        <>
          {snipUsageLoaded && !snipUsage.allowed && (
            <p className="connected-doc__plug-error" role="alert">
              {userId == null
                ? 'Sign in to use Snip and Plug.'
                : `Monthly Snip limit reached (${snipUsage.used}/${snipUsage.limit}). Upgrade to add more.`}
            </p>
          )}
          {snipUsageError && (
            <p className="connected-doc__plug-error" role="alert">{snipUsageError}</p>
          )}
        </>
      )}
      {snipError && snipStep === null && (
        <p className="connected-doc__plug-error" role="alert">{snipError}</p>
      )}
      {snipSuccess && (
        <p className="connected-doc__plug-success">Screenshot added to doc!</p>
      )}
      {/* Secondary actions: document tools */}
      <div className="connected-doc__actions connected-doc__actions--secondary">
        <button
          type="button"
          className="connected-doc__btn connected-doc__btn--tool"
          onClick={handleUndoLastInsert}
          disabled={disabled || !undoAvailable || undoLoading || !documentId}
          title={!documentId ? 'Select a document first' : !undoAvailable ? 'No extension insert to undo' : 'Remove the last Plug or Snip insert'}
        >
          {undoLoading ? 'Undoing…' : 'Undo Last Insert'}
        </button>
        <span className="connected-doc__btn-tooltip-wrap">
          <button
            type="button"
            className="connected-doc__btn connected-doc__btn--tool"
            onClick={handleFormatReferences}
            disabled={disabled || formatRefLoading || !documentId || !canAccessSnipHistory}
            title={
              !canAccessSnipHistory
                ? undefined
                : !documentId
                  ? 'Select a document first'
                  : 'Replace inline sources with superscript numbers and add a Sources list at the bottom'
            }
            aria-label={!canAccessSnipHistory ? 'Format References (Available for Pro users)' : undefined}
          >
            {formatRefLoading ? 'Formatting…' : 'Format References'}
          </button>
          {!canAccessSnipHistory && (
            <span className="connected-doc__tooltip" role="tooltip">
              Available for Pro users
            </span>
          )}
        </span>
      </div>
      {undoError && (
        <p className="connected-doc__plug-error" role="alert">{undoError}</p>
      )}
      {undoSuccess && (
        <p className="connected-doc__plug-success">Insert removed.</p>
      )}
      {canAccessSnipHistory && (
        <>
          {formatRefError && (
            <p className="connected-doc__plug-error" role="alert">{formatRefError}</p>
          )}
          {formatRefSuccess && (
            <p className="connected-doc__plug-success">{formatRefSuccess}</p>
          )}
        </>
      )}
      <SnipHistory
        documentId={documentId}
        onShowUpgrade={() => {
          setUpgradeModalReason('snip_history');
          setShowUpgradeModal(true);
        }}
        disabled={disabled}
      />
        </>
      )}
    </div>
  );
}
