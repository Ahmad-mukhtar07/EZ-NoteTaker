import { useState, useRef, useEffect } from 'react';
import { getPlugSelection, getDocSections, plugItInAtSection } from '../popup/messages.js';
import './ConnectedDocument.css';

/**
 * Shows the currently connected document, "Snip and Plug", and "Change document".
 * "Plug it in" opens a section picker to choose where to insert the selected text.
 */
export function ConnectedDocument({ documentName, onChangeDocument, disabled = false }) {
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

  // On popup open: restore snip button state so it stays clicked if overlay is still active
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    chrome.runtime.sendMessage({ type: 'GET_SNIP_STATE' }, (response) => {
      if (!chrome.runtime.lastError && response?.active) setSnipActive(true);
    });
  }, []);

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
        setTimeout(() => setPlugSuccess(false), 2500);
      } else {
        setPlugError(res?.error || 'Insert failed');
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

  const snipClass = 'connected-doc__btn connected-doc__btn--snip' + (snipActive ? ' connected-doc__btn--snip-active' : '');

  return (
    <div className="connected-doc">
      <p className="connected-doc__label">Connected document</p>
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
        <button
          type="button"
          className={snipClass}
          onClick={handleSnip}
          disabled={disabled}
        >
          Snip and Plug
        </button>
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
      <button
        type="button"
        className="connected-doc__change"
        onClick={onChangeDocument}
        disabled={disabled}
      >
        Change document
      </button>
    </div>
  );
}
