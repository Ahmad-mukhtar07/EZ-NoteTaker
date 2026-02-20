/**
 * Central message router: popup and content scripts send structured actions;
 * background handles auth, token retry, and API calls. All Google API access is here.
 */

import { getValidToken, getTokenInteractive, withTokenRetry, disconnect, clearAuthState } from './auth.js';
import { getSelectedDocumentId, getSelectedDocumentName, setSelectedDocument } from '../lib/storage.js';
import {
  fetchDocsList,
  fetchDocPreview,
  resolveBlockImageUrls,
  getDocumentSections,
  insertHighlightAtPosition,
} from './googleDocs.js';
import { createNewDoc } from './googleDrive.js';
import { getSelectionAndPageInfo } from './captureSelection.js';
import { log } from './logger.js';

/**
 * Handle a message and return a result for sendResponse, or start async work and return no response.
 * @param {object} msg - { type, ...payload }
 * @param {chrome.runtime.MessageSender} sender
 * @returns {Promise<{ sendResponse: true, response: any } | { sendResponse: false }>}
 */
export async function handleMessage(msg, sender) {
  const type = msg?.type;

  // --- Auth ---
  if (type === 'AUTH_GET_STATUS') {
    const token = await getValidToken();
    const documentId = await getSelectedDocumentId();
    const documentName = await getSelectedDocumentName();
    return {
      sendResponse: true,
      response: {
        connected: !!token,
        documentId: documentId || null,
        documentName: documentName || null,
      },
    };
  }

  if (type === 'AUTH_CONNECT') {
    const redirectUri = typeof chrome?.identity?.getRedirectURL === 'function' ? chrome.identity.getRedirectURL('oauth2') : '';
    try {
      await clearAuthState();
      const webClientId = msg.webClientId || '';
      await getTokenInteractive({ interactive: true, webClientId });
      return { sendResponse: true, response: { success: true } };
    } catch (err) {
      log.bg.warn('AUTH_CONNECT failed', err);
      return {
        sendResponse: true,
        response: {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          redirectUri,
        },
      };
    }
  }

  if (type === 'AUTH_DISCONNECT') {
    await disconnect();
    return { sendResponse: true, response: { success: true } };
  }

  // --- Docs list & selection ---
  if (type === 'DOCS_LIST') {
    try {
      const docs = await withTokenRetry((token) => fetchDocsList(token));
      return { sendResponse: true, response: { success: true, docs } };
    } catch (err) {
      log.bg.warn('DOCS_LIST failed', err);
      return {
        sendResponse: true,
        response: {
          success: false,
          error: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  if (type === 'DOCS_SET_SELECTED') {
    const { documentId, documentName } = msg;
    if (!documentId) {
      return { sendResponse: true, response: { success: false, error: 'Missing documentId' } };
    }
    await setSelectedDocument(documentId, documentName || '');
    return { sendResponse: true, response: { success: true } };
  }

  if (type === 'DOCS_CREATE') {
    const name = typeof msg.name === 'string' ? msg.name.trim() : 'Untitled';
    try {
      const doc = await withTokenRetry((token) => createNewDoc(token, name || 'Untitled'));
      await setSelectedDocument(doc.id, doc.name);
      return { sendResponse: true, response: { success: true, doc: { id: doc.id, name: doc.name } } };
    } catch (err) {
      log.bg.warn('DOCS_CREATE failed', err);
      return {
        sendResponse: true,
        response: { success: false, error: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  // --- Plug it in: get selection from tab ---
  if (type === 'GET_PLUG_SELECTION') {
    const tabId = msg.tabId;
    if (!tabId) {
      return { sendResponse: true, response: { success: false, error: 'No tab' } };
    }
    try {
      const tab = await chrome.tabs.get(tabId);
      const selection = await getSelectionAndPageInfo(tab);
      return {
        sendResponse: true,
        response: {
          success: true,
          selection: {
            selectedText: selection.selectedText,
            pageUrl: selection.pageUrl,
            pageTitle: selection.pageTitle,
            timestamp: selection.timestamp,
          },
        },
      };
    } catch (err) {
      log.bg.warn('GET_PLUG_SELECTION failed', err);
      return {
        sendResponse: true,
        response: { success: false, error: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  // --- Plug it in: get document sections for placement ---
  if (type === 'DOCS_GET_SECTIONS') {
    try {
      const documentId = await getSelectedDocumentId();
      if (!documentId) {
        return { sendResponse: true, response: { success: false, error: 'No document selected' } };
      }
      const sections = await withTokenRetry((token) => getDocumentSections(documentId, token));
      return { sendResponse: true, response: { success: true, sections } };
    } catch (err) {
      log.bg.warn('DOCS_GET_SECTIONS failed', err);
      return {
        sendResponse: true,
        response: { success: false, error: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  // --- Plug it in: insert at chosen section ---
  if (type === 'PLUG_IT_IN_AT_SECTION') {
    const { selectionData, insertIndex } = msg;
    if (!selectionData || typeof insertIndex !== 'number') {
      return {
        sendResponse: true,
        response: { success: false, error: 'Missing selectionData or insertIndex' },
      };
    }
    try {
      const documentId = await getSelectedDocumentId();
      if (!documentId) {
        return { sendResponse: true, response: { success: false, error: 'No document selected' } };
      }
      await withTokenRetry((token) =>
        insertHighlightAtPosition(documentId, token, selectionData, insertIndex)
      );
      return { sendResponse: true, response: { success: true } };
    } catch (err) {
      log.bg.warn('PLUG_IT_IN_AT_SECTION failed', err);
      return {
        sendResponse: true,
        response: { success: false, error: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  // --- Doc preview (async broadcast; no sendResponse) ---
  if (type === 'GET_DOC_PREVIEW') {
    (async () => {
      let payload;
      try {
        const documentId = await getSelectedDocumentId();
        if (!documentId) {
          payload = { error: 'No document selected' };
        } else {
          const result = await withTokenRetry(async (token) => {
            const preview = await fetchDocPreview(documentId, token);
            await resolveBlockImageUrls(preview.blocks, token);
            return preview;
          });
          payload = { title: result.title, blocks: result.blocks };
        }
      } catch (err) {
        payload = { error: err instanceof Error ? err.message : 'Failed to load preview' };
      }
      try {
        chrome.runtime.sendMessage({ type: 'DOC_PREVIEW_RESULT', ...payload });
      } catch (_) {}
    })();
    return { sendResponse: false };
  }

  return null;
}
