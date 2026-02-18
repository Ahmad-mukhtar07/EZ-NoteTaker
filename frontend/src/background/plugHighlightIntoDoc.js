/**
 * Orchestrates "Plug it in": read documentId and token from storage,
 * show notifications if not set, then call Docs API to append content.
 */

import { insertHighlightToDoc } from '../lib/docsInsert.js';
import { getStoredAccessToken, getAuthTokenSilent, removeCachedAuthToken, storeAccessToken } from '../lib/auth.js';
import { getSelectedDocumentId } from '../lib/storage.js';
import { showNotification } from './notifications.js';

/**
 * Get documentId and a valid access token (fresh from Chrome when possible).
 * @returns {Promise<{ documentId: string, accessToken: string }|null>}
 */
async function getDocAndToken() {
  const documentId = await getSelectedDocumentId();
  if (!documentId) return null;
  const accessToken = await getAuthTokenSilent() || await getStoredAccessToken();
  if (!accessToken) return null;
  return { documentId, accessToken };
}

function isAuthError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg === 'SESSION_EXPIRED' ||
    msg.includes('401') ||
    msg.includes('UNAUTHENTICATED') ||
    msg.includes('invalid authentication') ||
    msg.includes('Unable to download all specified images')
  );
}

function friendlyPlugError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('Unable to download all specified images') || msg.includes('download')) {
    return 'Could not add text to the document. Try again in a moment.';
  }
  if (msg.includes('SESSION_EXPIRED') || msg.includes('401')) {
    return 'Session expired. Open the extension and click "Connect Google Docs" to sign in again.';
  }
  return msg || 'Something went wrong. Try again.';
}

/**
 * Plug the captured highlight (and source/timestamp) into the connected Google Doc.
 * Shows notifications when not authenticated or no document selected.
 * Never throws — all errors are caught and shown as notifications.
 * @param {{ selectedText: string, pageUrl: string, pageTitle: string, timestamp: string }} data
 */
export async function plugHighlightIntoDoc(data) {
  try {
    const docAndToken = await getDocAndToken();

    if (!docAndToken) {
      const hasToken = await getStoredAccessToken();
      const docId = await getSelectedDocumentId();
      if (!hasToken) {
        showNotification('Sign in required', 'Open the EZ-Note extension and click "Connect Google Docs" to sign in.');
        return;
      }
      if (!docId) {
        showNotification('No document selected', 'Open the EZ-Note extension and select a Google Doc to connect.');
        return;
      }
      showNotification('Connection problem', 'Open the EZ-Note extension and connect Google Docs again, then try "Plug it in" again.');
      return;
    }

    let { documentId, accessToken } = docAndToken;
    try {
      await insertHighlightToDoc(documentId, accessToken, data);
      showNotification('Plugged in', 'Highlight was added to your connected Google Doc.');
    } catch (err) {
      if (isAuthError(err)) {
        await removeCachedAuthToken(accessToken);
        const newToken = await getAuthTokenSilent();
        if (newToken) {
          await storeAccessToken(newToken);
          try {
            await insertHighlightToDoc(documentId, newToken, data);
            showNotification('Plugged in', 'Highlight was added to your connected Google Doc.');
            return;
          } catch (retryErr) {
            showNotification('Could not plug in', friendlyPlugError(retryErr));
            return;
          }
        }
        showNotification('Session expired', 'Open the extension and click "Connect Google Docs" to sign in again.');
        return;
      }
      showNotification('Could not plug in', friendlyPlugError(err));
    }
  } catch (err) {
    console.error('EZ-Note: plug it in failed', err);
    showNotification('Could not plug in', friendlyPlugError(err));
  }
}
