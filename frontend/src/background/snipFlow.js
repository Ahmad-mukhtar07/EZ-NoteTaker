/**
 * Snip and Plug flow: inject overlay, capture tab, crop in content script, upload to Drive, insert into Doc.
 */

import { getStoredAccessToken, getAuthTokenSilent, removeCachedAuthToken, storeAccessToken } from '../lib/auth.js';
import { getSelectedDocumentId } from '../lib/storage.js';
import { uploadImageToDrive } from '../lib/driveUpload.js';
import { insertImageWithSource } from '../lib/docsInsert.js';
import { showNotification } from './notifications.js';

const SNIP_OVERLAY_PATH = 'snipOverlay.js';

/**
 * Get documentId and a valid access token (fresh from Chrome if possible).
 * @returns {Promise<{ documentId: string, accessToken: string }|null>}
 */
async function getDocAndToken() {
  const documentId = await getSelectedDocumentId();
  if (!documentId) return null;
  let accessToken = await getAuthTokenSilent() || await getStoredAccessToken();
  if (!accessToken) return null;
  return { documentId, accessToken };
}

/**
 * Show notification and remove overlay from the tab.
 * @param {number} tabId
 * @param {string} title
 * @param {string} message
 */
async function notifyAndRemoveOverlay(tabId, title, message) {
  showNotification(title, message);
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'REMOVE_SNIP_OVERLAY' });
  } catch (_) {
    // overlay may already be gone
  }
  try {
    chrome.runtime.sendMessage({ type: 'SNIP_OVERLAY_CLOSED' });
  } catch (_) {}
}

/**
 * Handle SNIP_BOUNDS: capture visible tab, crop via content script, upload to Drive, insert into Doc.
 * @param {number} tabId
 * @param {{ x: number, y: number, width: number, height: number }} bounds
 * @param {number|null} windowId
 * @param {{ pageUrl?: string, pageTitle?: string }} pageInfo
 */
function userFriendlyInsertError(message) {
  if (typeof message !== 'string') return 'Could not add image to document.';
  if (message.includes('Unable to download all specified images')) {
    return 'Google Docs could not use the image link. Try again in a moment or use a smaller selection.';
  }
  return message;
}

export async function handleSnipBounds(tabId, bounds, windowId = null, pageInfo = {}) {
  try {
    return await handleSnipBoundsInner(tabId, bounds, windowId, pageInfo);
  } catch (err) {
    console.error('EZ-Note: Snip and Plug failed', err);
    const msg = err instanceof Error ? err.message : String(err);
    await notifyAndRemoveOverlay(tabId, 'Snip and Plug failed', userFriendlyInsertError(msg));
    throw err;
  }
}

async function handleSnipBoundsInner(tabId, bounds, windowId = null, pageInfo = {}) {
  const docAndToken = await getDocAndToken();

  if (!docAndToken) {
    const hasToken = await getStoredAccessToken();
    const docId = await getSelectedDocumentId();
    if (!hasToken) {
      await notifyAndRemoveOverlay(tabId, 'Sign in required', 'Open EZ-Note and click "Connect Google Docs" to sign in.');
      return;
    }
    if (!docId) {
      await notifyAndRemoveOverlay(tabId, 'No document selected', 'Open EZ-Note and select a Google Doc to connect.');
      return;
    }
    await notifyAndRemoveOverlay(tabId, 'Connection problem', 'Open EZ-Note and connect Google Docs again, then try Snip and Plug.');
    return;
  }

  // Remove overlay and wait for repaint so the capture does not include the selection border or dimmed background.
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'REMOVE_SNIP_OVERLAY' });
  } catch (_) {
    // Overlay may already be gone
  }
  await new Promise((r) => setTimeout(r, 120));

  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(windowId ?? undefined, { format: 'png' });
  } catch (err) {
    console.error('EZ-Note: captureVisibleTab failed', err);
    await notifyAndRemoveOverlay(tabId, 'Capture failed', err?.message || 'Could not capture the tab. Try again.');
    return;
  }

  let cropResult;
  try {
    cropResult = await chrome.tabs.sendMessage(tabId, { type: 'CROP_IMAGE', dataUrl, bounds });
  } catch (err) {
    console.error('EZ-Note: crop message failed', err);
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

  const blob = await fetch(cropResult.base64).then((r) => r.blob());
  const { documentId, accessToken } = docAndToken;
  const pageUrl = pageInfo.pageUrl ?? '';
  const pageTitle = pageInfo.pageTitle ?? 'Untitled';
  const timestamp = new Date().toISOString();
  const filename = `eznote-snip-${Date.now()}.png`;

  let imageUrl;
  let token = accessToken;
  try {
    const uploadResult = await uploadImageToDrive(token, blob, filename);
    imageUrl = uploadResult.imageUrl;
  } catch (err) {
    if (err instanceof Error && err.message === 'SESSION_EXPIRED') {
      await removeCachedAuthToken(token);
      const newToken = await getAuthTokenSilent();
      if (newToken) {
        await storeAccessToken(newToken);
        try {
          const uploadResult = await uploadImageToDrive(newToken, blob, filename);
          imageUrl = uploadResult.imageUrl;
          token = newToken;
        } catch (retryErr) {
          console.error('EZ-Note: Drive upload retry failed', retryErr);
          await notifyAndRemoveOverlay(tabId, 'Upload failed', retryErr instanceof Error ? retryErr.message : 'Could not upload image. Try again.');
          return;
        }
      } else {
        await notifyAndRemoveOverlay(tabId, 'Session expired', 'Open EZ-Note and click "Connect Google Docs" to sign in again.');
        return;
      }
    } else {
      console.error('EZ-Note: Drive upload failed', err);
      await notifyAndRemoveOverlay(tabId, 'Upload failed', err instanceof Error ? err.message : 'Could not upload image. Try again.');
      return;
    }
  }

  const widthPt = cropResult.width ?? 400;
  const heightPt = cropResult.height ?? 300;
  const scale = 72 / 96;
  const wPt = Math.max(1, Math.round(widthPt * scale * 0.75));
  const hPt = Math.max(1, Math.round(heightPt * scale * 0.75));

  try {
    await insertImageWithSource(documentId, token, {
      imageUrl,
      imageWidthPt: wPt,
      imageHeightPt: hPt,
      pageUrl,
      pageTitle,
      timestamp,
    });
    showNotification('Snip and Plug', 'Screenshot was added to your Google Doc.');
  } catch (err) {
    if (err instanceof Error && err.message === 'SESSION_EXPIRED') {
      await removeCachedAuthToken(token);
      const newToken = await getAuthTokenSilent();
      if (newToken) {
        await storeAccessToken(newToken);
        try {
          await insertImageWithSource(documentId, newToken, {
            imageUrl,
            imageWidthPt: wPt,
            imageHeightPt: hPt,
            pageUrl,
            pageTitle,
            timestamp,
          });
          showNotification('Snip and Plug', 'Screenshot was added to your Google Doc.');
          return;
        } catch (retryErr) {
          throw retryErr;
        }
      }
      await notifyAndRemoveOverlay(tabId, 'Session expired', 'Open EZ-Note and sign in again.');
      throw err;
    }
    throw err;
  }
}

/**
 * Start snip mode: inject the snip overlay into the tab.
 * @param {number} tabId
 */
export async function startSnipMode(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [SNIP_OVERLAY_PATH],
    });
  } catch (err) {
    console.error('EZ-Note: inject snip overlay failed', err);
    showNotification('Snip failed', 'Could not start snipping on this page. Try a different tab or reload.');
  }
}
