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
  return sendMessage({ type: 'AUTH_CONNECT' });
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
