/**
 * Image Snip: inject overlay, capture tab, crop in content script, upload to Drive (Research Snips folder), insert into Doc.
 * All API calls go through auth.withTokenRetry, googleDrive, and googleDocs.
 */

import { getSelectedDocumentId } from '../lib/storage.js';
import { withTokenRetry } from './auth.js';
import { ensureResearchSnipsFolder, uploadImageToDrive } from './googleDrive.js';
import { insertImageWithSource, insertImageWithSourceAtPosition } from './googleDocs.js';
import { showNotification } from './notifications.js';
import { tryPasteImageAtCursorInDocTab } from './pasteAtCursor.js';
import { recordSnipAndCheckLimit, recordImageSnipAndCheckLimit, getSnipsMetadata } from './snipUsage.js';
import { pushUndoInsert } from './undoInsertStack.js';

const SNIP_OVERLAY_PATH = 'snipOverlay.js';
const SNIP_INSERT_INDEX_KEY = 'eznote_snip_insert_index';
const SNIP_INSERT_SUCCESS_KEY = 'eznote_snip_insert_success';
const SNIP_INSERT_ERROR_KEY = 'eznote_snip_insert_error';
const SNIP_INSERTING_KEY = 'eznote_snip_inserting';
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
const sessionStorage = chrome.storage?.session || chrome.storage?.local;

let offscreenDocumentCreating = null;

async function ensureOffscreenDocument() {
  if (typeof chrome.offscreen === 'undefined') return false;
  const url = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  let exists = false;
  if (chrome.runtime.getContexts) {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [url],
    });
    exists = existing.length > 0;
  }
  if (!exists && typeof self.clients !== 'undefined') {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    exists = clientList.some((c) => c.url === url);
  }
  if (exists) return true;
  if (offscreenDocumentCreating) return offscreenDocumentCreating;
  offscreenDocumentCreating = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['CLIPBOARD'],
    justification: 'Copy snip image to clipboard when user chooses Copy to clipboard.',
  });
  try {
    await offscreenDocumentCreating;
    return true;
  } finally {
    offscreenDocumentCreating = null;
  }
}

export async function getSnipInsertIndex() {
  if (!sessionStorage) return null;
  const o = await sessionStorage.get(SNIP_INSERT_INDEX_KEY);
  const v = o[SNIP_INSERT_INDEX_KEY];
  return typeof v === 'number' ? v : null;
}

export function setSnipInsertIndex(index) {
  if (!sessionStorage) return Promise.resolve();
  return sessionStorage.set({ [SNIP_INSERT_INDEX_KEY]: index });
}

export function clearSnipInsertIndex() {
  if (!sessionStorage) return Promise.resolve();
  return sessionStorage.remove(SNIP_INSERT_INDEX_KEY);
}

async function notifyAndRemoveOverlay(tabId, title, message, isError = false) {
  if (isError && sessionStorage) await sessionStorage.set({ [SNIP_INSERT_ERROR_KEY]: message });
  showNotification(title, message);
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'REMOVE_SNIP_OVERLAY' });
  } catch (_) {}
  try {
    chrome.runtime.sendMessage({ type: 'SNIP_OVERLAY_CLOSED' });
  } catch (_) {}
}

function clearSnipFlowState() {
  if (sessionStorage) sessionStorage.remove(SNIP_INSERTING_KEY);
  try {
    chrome.runtime.sendMessage({ type: 'SNIP_FLOW_DONE' });
  } catch (_) {}
}

function userFriendlyInsertError(message) {
  if (typeof message !== 'string') return 'Could not add image to document.';
  if (message.includes('Unable to download all specified images')) {
    return 'Google Docs could not use the image link. Try again in a moment or use a smaller selection.';
  }
  return message;
}

/**
 * Handle SNIP_BOUNDS: remove overlay, capture tab, crop via content script, then withTokenRetry: ensure folder, upload, insert.
 */
export async function handleSnipBounds(tabId, bounds, windowId = null, pageInfo = {}) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'REMOVE_SNIP_OVERLAY' });
  } catch (_) {}
  await new Promise((r) => setTimeout(r, 120));

  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(windowId ?? undefined, { format: 'png' });
  } catch (err) {
    await notifyAndRemoveOverlay(tabId, 'Capture failed', err?.message || 'Could not capture the tab. Try again.', true);
    clearSnipFlowState();
    return;
  }

  let cropResult;
  try {
    cropResult = await chrome.tabs.sendMessage(tabId, { type: 'CROP_IMAGE', dataUrl, bounds });
  } catch (err) {
    await notifyAndRemoveOverlay(tabId, 'Snip failed', 'Could not process selection. Try again.', true);
    clearSnipFlowState();
    return;
  }

  if (cropResult?.type === 'SNIP_ERROR') {
    await notifyAndRemoveOverlay(tabId, 'Snip failed', cropResult.error || 'Crop failed.', true);
    clearSnipFlowState();
    return;
  }
  if (cropResult?.type !== 'CROPPED_IMAGE' || !cropResult.base64) {
    await notifyAndRemoveOverlay(tabId, 'Snip failed', 'No image data received.', true);
    clearSnipFlowState();
    return;
  }

  const pageUrl = pageInfo.pageUrl ?? '';
  const pageTitle = pageInfo.pageTitle ?? 'Untitled';
  const insertIndex = await getSnipInsertIndex();
  await clearSnipInsertIndex();

  // Copy-only: user chose "Copy to clipboard" instead of inserting into doc.
  if (insertIndex === -1) {
    const pageTitleForNotify = pageTitle;
    const sourceText = 'Source: ' + pageTitle + (pageUrl ? '\n' + pageUrl : '');
    try {
      // Copy from the tab after focusing it so the page has focus (clipboard often requires it).
      await chrome.tabs.update(tabId, { active: true });
      await new Promise((r) => setTimeout(r, 400));
      const tabCopyOk = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 5000);
        const listener = (msg, sender) => {
          if (sender.tab?.id !== tabId || msg?.type !== 'SNIP_COPY_TO_CLIPBOARD_RESULT') return;
          chrome.runtime.onMessage.removeListener(listener);
          clearTimeout(timeout);
          resolve(msg.success === true);
        };
        chrome.runtime.onMessage.addListener(listener);
        chrome.scripting.executeScript({
          target: { tabId },
          func: (dataUrl, source) => {
            fetch(dataUrl)
              .then((r) => r.blob())
              .then((blob) => {
                const items = { 'image/png': blob };
                if (source && typeof source === 'string') {
                  items['text/plain'] = new Blob([source], { type: 'text/plain' });
                }
                return navigator.clipboard.write([new ClipboardItem(items)]);
              })
              .then(() => {
                if (chrome.runtime?.sendMessage) {
                  chrome.runtime.sendMessage({ type: 'SNIP_COPY_TO_CLIPBOARD_RESULT', success: true });
                }
              })
              .catch((err) => {
                if (chrome.runtime?.sendMessage) {
                  chrome.runtime.sendMessage({
                    type: 'SNIP_COPY_TO_CLIPBOARD_RESULT',
                    success: false,
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
              });
          },
          args: [cropResult.base64, sourceText],
        }).catch(() => {
          chrome.runtime.onMessage.removeListener(listener);
          clearTimeout(timeout);
          resolve(false);
        });
      });
      if (!tabCopyOk) {
        const hasOffscreen = await ensureOffscreenDocument();
        if (!hasOffscreen) {
          throw new Error('Clipboard not available. Try on a normal webpage (not chrome:// or an extension page).');
        }
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {
              target: 'offscreen',
              type: 'copy-snip-image',
              data: { imageDataUrl: cropResult.base64, sourceText },
            },
            (res) => {
              if (chrome.runtime.lastError) {
                resolve({ success: false, error: chrome.runtime.lastError.message });
              } else {
                resolve(res || { success: false });
              }
            }
          );
        });
        if (!response?.success) {
          throw new Error(response?.error || 'Could not copy to clipboard');
        }
      }
      try {
        chrome.runtime.sendMessage({ type: 'SNIP_COPY_SUCCESS' });
      } catch (_) {}
    } catch (err) {
      await notifyAndRemoveOverlay(tabId, 'Copy failed', err?.message || 'Could not copy to clipboard.', true);
      clearSnipFlowState();
      return;
    }
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'REMOVE_SNIP_OVERLAY' });
    } catch (_) {}
    if (sessionStorage) await sessionStorage.remove(SNIP_INSERT_ERROR_KEY);
    showNotification(
      'Image Snip',
      'Image copied to clipboard. Paste anywhere.' + (pageTitleForNotify ? ` Source: ${pageTitleForNotify}` : '')
    );
    clearSnipFlowState();
    return;
  }

  const documentId = await getSelectedDocumentId();
  if (!documentId) {
    await notifyAndRemoveOverlay(tabId, 'No document selected', 'Open DocSourced and select a Google Doc to connect.', true);
    clearSnipFlowState();
    return;
  }

  const domain = (() => {
    try {
      if (!pageUrl) return '';
      const u = new URL(pageUrl);
      return u.hostname || '';
    } catch (_) {
      return '';
    }
  })();
  const timestamp = new Date().toISOString();
  let sourceText = '';

  // Try paste-at-cursor first (no Drive upload — no drive link to store).
  // Check limit first so we never paste without recording.
  const willTryPaste = !insertIndex;
  if (willTryPaste) {
    const usage = await recordSnipAndCheckLimit({
      content: pageTitle,
      source_url: '', // paste path: image not uploaded to Drive
      target_doc_id: documentId,
    });
    if (usage.error === 'snip_limit_reached') {
      await notifyAndRemoveOverlay(tabId, 'Snip limit reached', 'You\'ve reached your monthly limit. Upgrade to add more.', true);
      clearSnipFlowState();
      return;
    }
    if (usage.error === 'not_authenticated') {
      await notifyAndRemoveOverlay(tabId, 'Sign in required', 'Open the extension and sign in to your account to use Image Snip.', true);
      clearSnipFlowState();
      return;
    }
    if (usage.error) {
      await notifyAndRemoveOverlay(tabId, 'Image Snip failed', usage.error, true);
      clearSnipFlowState();
      return;
    }
    const snipId = usage.snip_id ?? null;
    sourceText = '\nSource: ' + pageTitle;
  }

  const pastedAtCursor = willTryPaste && (await tryPasteImageAtCursorInDocTab(
    documentId,
    tabId,
    cropResult.base64,
    sourceText
  ));
  if (pastedAtCursor) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'REMOVE_SNIP_OVERLAY' });
    } catch (_) {}
    if (sessionStorage) {
      await sessionStorage.remove(SNIP_INSERT_ERROR_KEY);
      await sessionStorage.set({ [SNIP_INSERT_SUCCESS_KEY]: true });
    }
    showNotification('Image Snip', 'Screenshot added at cursor in your open doc.');
    clearSnipFlowState();
    return;
  }

  // API path: upload to Drive first so we have the image link for source_url.
  const blob = await fetch(cropResult.base64).then((r) => r.blob());
  const filename = `eznote-snip-${Date.now()}.png`;
  const widthPt = cropResult.width ?? 400;
  const heightPt = cropResult.height ?? 300;
  const scale = 72 / 96;
  const wPt = Math.max(1, Math.round(widthPt * scale * 0.75));
  const hPt = Math.max(1, Math.round(heightPt * scale * 0.75));

  const imageData = {
    imageWidthPt: wPt,
    imageHeightPt: hPt,
    pageUrl,
    pageTitle,
    timestamp,
  };

  // When willTryPaste we already recorded one slot (paste path); don't record again if we fell through to API path.
  const alreadyRecorded = willTryPaste;
  let snipIdForInsert = null;

  try {
    const range = await withTokenRetry(async (token) => {
      const folderId = await ensureResearchSnipsFolder(token);
      const { fileId, imageUrl } = await uploadImageToDrive(token, blob, filename, folderId);
      if (!alreadyRecorded) {
        const driveLink = imageUrl || (fileId ? `https://drive.google.com/uc?export=view&id=${fileId}` : '');
        const usage = await recordImageSnipAndCheckLimit({
          source_url: pageUrl,
          page_title: pageTitle,
          domain,
          drive_url: driveLink,
          target_doc_id: documentId,
        });
        if (usage.error === 'snip_limit_reached') {
          await notifyAndRemoveOverlay(tabId, 'Snip limit reached', 'You\'ve reached your monthly limit. Upgrade to add more.', true);
          clearSnipFlowState();
          throw new Error('SNIP_LIMIT_REACHED');
        }
        if (usage.error === 'not_authenticated') {
          await notifyAndRemoveOverlay(tabId, 'Sign in required', 'Open the extension and sign in to your account to use Image Snip.', true);
          clearSnipFlowState();
          throw new Error('NOT_AUTHENTICATED');
        }
        if (usage.error) {
          throw new Error(usage.error);
        }
        snipIdForInsert = usage.snip_id ?? null;
      }
      if (typeof insertIndex === 'number') {
        return await insertImageWithSourceAtPosition(documentId, token, { ...imageData, imageUrl, snipId: snipIdForInsert }, insertIndex, { getSnipsMetadata });
      } else {
        return await insertImageWithSource(documentId, token, { ...imageData, imageUrl, snipId: snipIdForInsert }, { getSnipsMetadata });
      }
    });
    pushUndoInsert({ documentId, startIndex: range.startIndex, endIndex: range.endIndex, snipId: range.snipId });
    if (sessionStorage) {
      await sessionStorage.remove(SNIP_INSERT_ERROR_KEY);
      await sessionStorage.set({ [SNIP_INSERT_SUCCESS_KEY]: true });
    }
    showNotification('Image Snip', 'Screenshot was added to your Google Doc.');
    clearSnipFlowState();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'SNIP_LIMIT_REACHED' || msg === 'NOT_AUTHENTICATED') {
      clearSnipFlowState();
      return;
    }
    if (msg.includes('Sign in required')) {
      await notifyAndRemoveOverlay(tabId, 'Sign in required', 'Open DocSourced and click "Connect Google Docs" to sign in.', true);
      clearSnipFlowState();
      return;
    }
    await notifyAndRemoveOverlay(tabId, 'Image Snip failed', userFriendlyInsertError(msg), true);
    clearSnipFlowState();
  }
}

export async function startSnipMode(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [SNIP_OVERLAY_PATH],
    });
  } catch (err) {
    showNotification('Snip failed', 'Could not start snipping on this page. Try a different tab or reload.');
  }
}
