import { useState, useRef, useEffect } from 'react';
import './ConnectedDocument.css';

/**
 * Shows the currently connected document, "Snip and Plug", and "Change document".
 * Snip button stays "clicked" while overlay is active and restores that state when popup reopens.
 * Unclicked only after: press button again, complete a snip, or reload the page.
 */
export function ConnectedDocument({ documentName, onChangeDocument }) {
  const [snipActive, setSnipActive] = useState(false);
  const snipActiveTimer = useRef(null);

  // On popup open: restore snip button state so it stays clicked if overlay is still active
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    chrome.runtime.sendMessage({ type: 'GET_SNIP_STATE' }, (response) => {
      if (!chrome.runtime.lastError && response?.active) setSnipActive(true);
    });
  }, []);

  // When overlay is closed (complete/cancel/error), background sets state false; keep button in sync
  useEffect(() => {
    const storage = chrome.storage?.session || chrome.storage?.local;
    if (!storage?.onChanged) return;
    const key = 'eznote_snip_overlay_active';
    const listener = (changes) => {
      if (changes[key] !== undefined) setSnipActive(!!changes[key].newValue);
    };
    storage.onChanged.addListener(listener);
    return () => storage.onChanged.removeListener(listener);
  }, []);

  useEffect(() => {
    return () => {
      if (snipActiveTimer.current) clearTimeout(snipActiveTimer.current);
    };
  }, []);

  const handleSnip = () => {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return;
    setSnipActive(true);
    if (snipActiveTimer.current) clearTimeout(snipActiveTimer.current);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) return;
      chrome.runtime.sendMessage({ type: 'START_SNIP', tabId: tab.id }, () => {
        if (chrome.runtime.lastError) {
          console.error('EZ-Note: START_SNIP failed', chrome.runtime.lastError);
        }
      });
    });
  };

  const handlePlugItIn = () => {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) return;
      chrome.runtime.sendMessage({ type: 'PLUG_IT_IN', tabId: tab.id }, () => {
        if (chrome.runtime.lastError) {
          console.error('EZ-Note: PLUG_IT_IN failed', chrome.runtime.lastError);
        }
      });
    });
  };

  const snipClass = 'connected-doc__btn connected-doc__btn--snip' + (snipActive ? ' connected-doc__btn--snip-active' : '');

  return (
    <div className="connected-doc">
      <p className="connected-doc__label">Connected document</p>
      <p className="connected-doc__name">{documentName || 'Untitled'}</p>
      <button
        type="button"
        className="connected-doc__btn connected-doc__btn--plug"
        onClick={handlePlugItIn}
      >
        Plug it in
      </button>
      <button
        type="button"
        className={snipClass}
        onClick={handleSnip}
      >
        Snip and Plug
      </button>
      <button
        type="button"
        className="connected-doc__change"
        onClick={onChangeDocument}
      >
        Change document
      </button>
    </div>
  );
}
