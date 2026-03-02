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
  insertImageWithSourceAtPosition,
  deleteInsertRange,
  formatReferences,
} from './googleDocs.js';
import { createNewDoc } from './googleDrive.js';
import { getSelectionAndPageInfo } from './captureSelection.js';
import { recordSnipAndCheckLimit, getSnipUsage, getSnipsMetadata } from './snipUsage.js';
import { pushUndoInsert, popUndoInsert, canUndoInsert } from './undoInsertStack.js';
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
      const usage = await recordSnipAndCheckLimit({
        content: selectionData.selectedText ?? '',
        source_url: selectionData.pageUrl ?? '',
        target_doc_id: documentId,
        page_title: selectionData.pageTitle ?? '',
        domain: selectionData.pageUrl ? (() => {
          try {
            const u = new URL(selectionData.pageUrl);
            return (u.hostname || '').replace(/^www\./i, '');
          } catch (_) { return ''; }
        })() : '',
      });
      if (usage.error === 'snip_limit_reached') {
        return {
          sendResponse: true,
          response: { success: false, error: 'snip_limit_reached', limit: usage.limit },
        };
      }
      if (usage.error) {
        return {
          sendResponse: true,
          response: {
            success: false,
            error: usage.error === 'not_authenticated' ? 'not_authenticated' : usage.error,
            limit: usage.limit,
          },
        };
      }
      const snipId = usage.snip_id ?? null;
      const range = await withTokenRetry((token) =>
        insertHighlightAtPosition(documentId, token, { ...selectionData, snipId }, insertIndex, { getSnipsMetadata })
      );
      pushUndoInsert({ documentId, startIndex: range.startIndex, endIndex: range.endIndex, snipId });
      return { sendResponse: true, response: { success: true } };
    } catch (err) {
      log.bg.warn('PLUG_IT_IN_AT_SECTION failed', err);
      return {
        sendResponse: true,
        response: { success: false, error: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  // --- Reinsert image from Snip History at section ---
  if (type === 'REINSERT_IMAGE_AT_SECTION') {
    const { driveUrl, insertIndex, pageUrl = '', pageTitle = '', snipId = null } = msg;
    if (!driveUrl || typeof insertIndex !== 'number') {
      return {
        sendResponse: true,
        response: { success: false, error: 'Missing driveUrl or insertIndex' },
      };
    }
    try {
      const documentId = await getSelectedDocumentId();
      if (!documentId) {
        return { sendResponse: true, response: { success: false, error: 'No document selected' } };
      }
      const imageData = {
        imageUrl: driveUrl,
        imageWidthPt: 200,
        imageHeightPt: 150,
        pageUrl,
        pageTitle,
        snipId: snipId ?? null,
      };
      const range = await withTokenRetry((token) =>
        insertImageWithSourceAtPosition(documentId, token, imageData, insertIndex, { getSnipsMetadata })
      );
      pushUndoInsert({ documentId, startIndex: range.startIndex, endIndex: range.endIndex, snipId: range.snipId });
      return { sendResponse: true, response: { success: true } };
    } catch (err) {
      log.bg.warn('REINSERT_IMAGE_AT_SECTION failed', err);
      return {
        sendResponse: true,
        response: { success: false, error: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  // --- Format References (Pro): replace SNIP_REF_ inline sources with superscript refs + Sources list ---
  if (type === 'FORMAT_REFERENCES') {
    try {
      const documentId = await getSelectedDocumentId();
      if (!documentId) {
        return { sendResponse: true, response: { success: false, error: 'No document selected' } };
      }
      const result = await withTokenRetry((token) =>
        formatReferences(documentId, token, getSnipsMetadata)
      );
      return { sendResponse: true, response: result };
    } catch (err) {
      log.bg.warn('FORMAT_REFERENCES failed', err);
      return {
        sendResponse: true,
        response: {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  // --- Undo Last Insert ---
  if (type === 'GET_UNDO_STATE') {
    const documentId = await getSelectedDocumentId();
    const available = documentId ? canUndoInsert(documentId) : false;
    return { sendResponse: true, response: { available } };
  }

  if (type === 'UNDO_LAST_INSERT') {
    let entry = null;
    try {
      const documentId = await getSelectedDocumentId();
      if (!documentId) {
        return { sendResponse: true, response: { success: false, error: 'No document selected' } };
      }
      entry = popUndoInsert();
      if (!entry || entry.documentId !== documentId) {
        return {
          sendResponse: true,
          response: { success: false, error: 'Nothing to undo for this document' },
        };
      }
      const result = await withTokenRetry((token) =>
        deleteInsertRange(documentId, token, entry.startIndex, entry.endIndex, entry.snipId ?? undefined)
      );
      if (result.success === false) {
        pushUndoInsert(entry);
        return { sendResponse: true, response: { success: false, error: result.error } };
      }
      return { sendResponse: true, response: { success: true } };
    } catch (err) {
      log.bg.warn('UNDO_LAST_INSERT failed', err);
      if (entry) pushUndoInsert(entry);
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
