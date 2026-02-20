/**
 * Popup: send structured messages to background. No direct Google API or auth calls.
 */

import { log } from './logger.js';

/**
 * @returns {Promise<any>} response from background
 */
export function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      log.popup.warn('Chrome runtime not available');
      reject(new Error('Chrome runtime not available'));
      return;
    }
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        log.popup.warn('Message failed', chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message || 'Message failed'));
        return;
      }
      resolve(response);
    });
  });
}

export async function getAuthStatus() {
  return sendMessage({ type: 'AUTH_GET_STATUS' });
}

export async function authConnect() {
  const webClientId = typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_DOCS_WEB_CLIENT_ID;
  return sendMessage({ type: 'AUTH_CONNECT', webClientId: webClientId || '' });
}

export async function authDisconnect() {
  return sendMessage({ type: 'AUTH_DISCONNECT' });
}

export async function getDocsList() {
  return sendMessage({ type: 'DOCS_LIST' });
}

export async function setSelectedDoc(documentId, documentName = '') {
  return sendMessage({ type: 'DOCS_SET_SELECTED', documentId, documentName });
}

/**
 * Create a new Google Doc and set it as the selected document.
 * @param {string} [name] - Document title (default "Untitled")
 * @returns {Promise<{ success: boolean, doc?: { id: string, name: string }, error?: string }>}
 */
export async function createDoc(name = 'Untitled') {
  return sendMessage({ type: 'DOCS_CREATE', name: name || 'Untitled' });
}

/**
 * Get selection from a tab (for Plug it in section flow).
 * @param {number} tabId
 * @returns {Promise<{ success: boolean, selection?: { selectedText, pageUrl, pageTitle, timestamp }, error?: string }>}
 */
export async function getPlugSelection(tabId) {
  return sendMessage({ type: 'GET_PLUG_SELECTION', tabId });
}

/**
 * Get document sections (insertion points) for the connected doc.
 * @returns {Promise<{ success: boolean, sections?: Array<{ label: string, index: number }>, error?: string }>}
 */
export async function getDocSections() {
  return sendMessage({ type: 'DOCS_GET_SECTIONS' });
}

/**
 * Insert the given selection at the chosen index in the connected doc.
 * @param {object} selectionData - { selectedText, pageUrl, pageTitle, timestamp }
 * @param {number} insertIndex
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function plugItInAtSection(selectionData, insertIndex) {
  return sendMessage({ type: 'PLUG_IT_IN_AT_SECTION', selectionData, insertIndex });
}
