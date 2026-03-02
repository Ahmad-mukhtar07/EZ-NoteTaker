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

/**
 * Get current snip usage (used, limit, allowed). For disabling "Snip and Plug" when limit reached.
 * @returns {Promise<{ used?: number, limit?: number, allowed?: boolean, error?: string }>}
 */
export async function getSnipUsage() {
  return sendMessage({ type: 'GET_SNIP_USAGE' });
}

/**
 * Format References: replace SNIP_REF_ inline source lines with superscript numbers and append Sources list. Pro-only.
 * @returns {Promise<{ success: boolean, message?: string, error?: string, refsCount?: number }>}
 */
export async function formatReferences() {
  return sendMessage({ type: 'FORMAT_REFERENCES' });
}

/**
 * Reinsert an image from Snip History into the current doc at the given section index.
 * Uses existing snip_id for the source-line marker so references stay linked to the same DB record.
 * @param {string} driveUrl - Image URL (Drive link)
 * @param {number} insertIndex - Section index from getDocSections
 * @param {{ pageUrl?: string, pageTitle?: string, snipId?: string | null }} meta - Source metadata and snip UUID for marker
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function reinsertImageAtSection(driveUrl, insertIndex, meta = {}) {
  return sendMessage({
    type: 'REINSERT_IMAGE_AT_SECTION',
    driveUrl,
    insertIndex,
    pageUrl: meta.pageUrl ?? '',
    pageTitle: meta.pageTitle ?? '',
    snipId: meta.snipId ?? null,
  });
}

/**
 * Whether the last Plug/Snip insert can be undone for the current document.
 * @returns {Promise<{ available: boolean }>}
 */
export async function getUndoState() {
  return sendMessage({ type: 'GET_UNDO_STATE' });
}

/**
 * Undo the last Plug or Snip insert in the current document.
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function undoLastInsert() {
  return sendMessage({ type: 'UNDO_LAST_INSERT' });
}
