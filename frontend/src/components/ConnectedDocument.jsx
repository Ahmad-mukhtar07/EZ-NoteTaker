import { useState, useRef, useEffect } from 'react';
import { getPlugSelection, getDocSections, plugItInAtSection, getSnipUsage, setSelectedDoc } from '../popup/messages.js';
import { useAuth } from '../hooks/useAuth.js';
import { useFeatureAccess } from '../hooks/useFeatureAccess.js';
import { getConnectedDocs, removeConnectedDoc } from '../lib/connectedDocsService.js';
import { UpgradeModal } from './UpgradeModal';
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
  const [snipStep, setSnipStep] = useState(null); // null | 'loading_sections' | 'sections'
  const [snipSections, setSnipSections] = useState([]);
  const [snipError, setSnipError] = useState(null);
  const [snipSuccess, setSnipSuccess] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeModalReason, setUpgradeModalReason] = useState('snip_limit');
  const [upgradeModalLimit, setUpgradeModalLimit] = useState(25);
  const { canAccessSnipHistory } = useFeatureAccess();
  // Block Snip and Plug by default until we've queried usage (then allow only if under limit)
  const [snipUsage, setSnipUsage] = useState({ used: 0, limit: 25, allowed: false });
  const [snipUsageLoaded, setSnipUsageLoaded] = useState(false);
  const [docDropdownOpen, setDocDropdownOpen] = useState(false);
  const [connectedDocs, setConnectedDocs] = useState([]);
  const [collapsed, setCollapsed] = useState(false);
  const docDropdownRef = useRef(null);

  useEffect(() => {
    if (collapsed) setDocDropdownOpen(false);
  }, [collapsed]);

  const fetchSnipUsage = async () => {
    try {
      const u = await getSnipUsage();
      setSnipUsage({
        used: typeof u?.used === 'number' ? u.used : 0,
        limit: typeof u?.limit === 'number' ? u.limit : 25,
        allowed: u?.allowed === true,
      });
    } catch (_) {
      setSnipUsage((prev) => ({ ...prev, allowed: false }));
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
    setSnipUsage({ used: 0, limit: 25, allowed: false });
    setSnipUsageLoaded(false);
    if (userId != null && typeof syncSessionTokenToStorage === 'function') {
      syncSessionTokenToStorage().then(() => fetchSnipUsage());
    } else {
      setSnipUsageLoaded(true);
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

  // When overlay is closed (complete/cancel/error), background sets state false; keep button in sync. Also show success when snip insert completes.
  useEffect(() => {
    const storage = chrome.storage?.session || chrome.storage?.local;
    if (!storage?.onChanged) return;
    const listener = (changes) => {
      if (changes['eznote_snip_overlay_active'] !== undefined) setSnipActive(!!changes['eznote_snip_overlay_active'].newValue);
      if (changes[SNIP_SUCCESS_KEY] !== undefined && changes[SNIP_SUCCESS_KEY].newValue === true) {
        setSnipSuccess(true);
        storage.remove(SNIP_SUCCESS_KEY);
        fetchSnipUsage();
        setTimeout(() => setSnipSuccess(false), 2500);
      }
    };
    storage.onChanged.addListener(listener);
    return () => storage.onChanged.removeListener(listener);
  }, []);

  // On popup open: if snip just succeeded (e.g. user had popup closed), show success once
  useEffect(() => {
    const storage = chrome.storage?.session || chrome.storage?.local;
    if (!storage?.get) return;
    storage.get(SNIP_SUCCESS_KEY, (result) => {
      if (result?.[SNIP_SUCCESS_KEY] === true) {
        setSnipSuccess(true);
        storage.remove(SNIP_SUCCESS_KEY);
        setTimeout(() => setSnipSuccess(false), 2500);
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
          setSnipStep(null);
          setSnipSections([]);
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
      {plugStep === null && (
        <button
          type="button"
          className="connected-doc__btn connected-doc__btn--plug"
          onClick={handlePlugItIn}
          disabled={disabled}
        >
          Plug it in
        </button>
      )}
      {plugStep === 'loading' && (
        <p className="connected-doc__plug-status">Loading… Select text on the page first.</p>
      )}
      {plugError && plugStep === null && (
        <p className="connected-doc__plug-error" role="alert">{plugError}</p>
      )}
      {plugSuccess && (
        <p className="connected-doc__plug-success">Added to doc!</p>
      )}
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
      {plugStep === 'inserting' && (
        <p className="connected-doc__plug-status">Adding…</p>
      )}
      {snipStep === null && (
        <>
          <button
            type="button"
            className={snipClass}
            onClick={handleSnip}
            disabled={disabled || !snipUsage.allowed}
            title={!snipUsage.allowed ? `Monthly limit reached (${snipUsage.used}/${snipUsage.limit})` : undefined}
          >
            Snip and Plug
          </button>
          {snipUsageLoaded && !snipUsage.allowed && (
            <p className="connected-doc__plug-error" role="alert">
              Monthly limit reached ({snipUsage.used}/{snipUsage.limit}). Upgrade to add more.
            </p>
          )}
        </>
      )}
      {snipStep === 'loading_sections' && (
        <p className="connected-doc__plug-status">Loading sections…</p>
      )}
      {snipError && snipStep === null && (
        <p className="connected-doc__plug-error" role="alert">{snipError}</p>
      )}
      {snipSuccess && (
        <p className="connected-doc__plug-success">Screenshot added to doc!</p>
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
      {canAccessSnipHistory ? (
        <p className="connected-doc__hint">Snip History (Pro) — view past snips here in a future update.</p>
      ) : (
        <button
          type="button"
          className="connected-doc__btn connected-doc__btn--secondary"
          onClick={() => {
            setUpgradeModalReason('snip_history');
            setShowUpgradeModal(true);
          }}
          disabled={disabled}
          title="Upgrade to Pro to access Snip History"
        >
          Snip History <span className="connected-doc__pro-badge">Pro</span>
        </button>
      )}
      <button
        type="button"
        className="connected-doc__btn connected-doc__btn--magic"
        disabled
        title="Clean and structure your notes with AI—coming in a future update"
      >
        Magic AI Format <span className="connected-doc__coming-soon">(Coming soon)</span>
      </button>
      <p className="connected-doc__hint connected-doc__hint--magic">AI-powered cleanup and structure for your doc. Coming soon.</p>
      <p className="connected-doc__hint connected-doc__hint--cursor">Tip: Open your doc in a new tab (below) to add at cursor with Plug it in or Snip and Plug.</p>
        </>
      )}
    </div>
  );
}
