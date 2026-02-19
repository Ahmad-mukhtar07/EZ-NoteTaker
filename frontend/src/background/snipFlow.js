/**
 * Snip and Plug: inject overlay, capture tab, crop in content script, upload to Drive (Research Snips folder), insert into Doc.
 * All API calls go through auth.withTokenRetry, googleDrive, and googleDocs.
 */

import { getSelectedDocumentId } from '../lib/storage.js';
import { withTokenRetry } from './auth.js';
import { ensureResearchSnipsFolder, uploadImageToDrive } from './googleDrive.js';
import { insertImageWithSource } from './googleDocs.js';
import { showNotification } from './notifications.js';
import { tryPasteImageAtCursorInDocTab } from './pasteAtCursor.js';

const SNIP_OVERLAY_PATH = 'snipOverlay.js';

async function notifyAndRemoveOverlay(tabId, title, message) {
  showNotification(title, message);
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'REMOVE_SNIP_OVERLAY' });
  } catch (_) {}
  try {
    chrome.runtime.sendMessage({ type: 'SNIP_OVERLAY_CLOSED' });
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
  const documentId = await getSelectedDocumentId();
  if (!documentId) {
    await notifyAndRemoveOverlay(tabId, 'No document selected', 'Open EZ-NoteTaker and select a Google Doc to connect.');
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, { type: 'REMOVE_SNIP_OVERLAY' });
  } catch (_) {}
  await new Promise((r) => setTimeout(r, 120));

  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(windowId ?? undefined, { format: 'png' });
  } catch (err) {
    await notifyAndRemoveOverlay(tabId, 'Capture failed', err?.message || 'Could not capture the tab. Try again.');
    return;
  }

  let cropResult;
  try {
    cropResult = await chrome.tabs.sendMessage(tabId, { type: 'CROP_IMAGE', dataUrl, bounds });
  } catch (err) {
    await notifyAndRemoveOverlay(tabId, 'Snip failed', 'Could not process selection. Try again.');
    return;
  }

  if (cropResult?.type === 'SNIP_ERROR') {
    await notifyAndRemoveOverlay(tabId, 'Snip failed', cropResult.error || 'Crop failed.');
    return;
  }
  if (cropResult?.type !== 'CROPPED_IMAGE' || !cropResult.base64) {
    await notifyAndRemoveOverlay(tabId, 'Snip failed', 'No image data received.');
    return;
  }

  const pageUrl = pageInfo.pageUrl ?? '';
  const pageTitle = pageInfo.pageTitle ?? 'Untitled';
  const timestamp = new Date().toISOString();
  const sourceText = '\nSource: ' + pageTitle + ' ' + timestamp;

  const pastedAtCursor = await tryPasteImageAtCursorInDocTab(
    documentId,
    tabId,
    cropResult.base64,
    sourceText
  );
  if (pastedAtCursor) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'REMOVE_SNIP_OVERLAY' });
    } catch (_) {}
    showNotification('Snip and Plug', 'Screenshot added at cursor in your open doc.');
    return;
  }

  const blob = await fetch(cropResult.base64).then((r) => r.blob());
  const filename = `eznote-snip-${Date.now()}.png`;
  const widthPt = cropResult.width ?? 400;
  const heightPt = cropResult.height ?? 300;
  const scale = 72 / 96;
  const wPt = Math.max(1, Math.round(widthPt * scale * 0.75));
  const hPt = Math.max(1, Math.round(heightPt * scale * 0.75));

  try {
    await withTokenRetry(async (token) => {
      const folderId = await ensureResearchSnipsFolder(token);
      const { imageUrl } = await uploadImageToDrive(token, blob, filename, folderId);
      await insertImageWithSource(documentId, token, {
        imageUrl,
        imageWidthPt: wPt,
        imageHeightPt: hPt,
        pageUrl,
        pageTitle,
        timestamp,
      });
    });
    showNotification('Snip and Plug', 'Screenshot was added to your Google Doc.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Sign in required')) {
      await notifyAndRemoveOverlay(tabId, 'Sign in required', 'Open EZ-NoteTaker and click "Connect Google Docs" to sign in.');
      return;
    }
    await notifyAndRemoveOverlay(tabId, 'Snip and Plug failed', userFriendlyInsertError(msg));
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
