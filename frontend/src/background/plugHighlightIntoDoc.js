/**
 * "Plug it in": append selected text (and source/timestamp) to the connected Google Doc.
 * Uses background auth.withTokenRetry and googleDocs.insertHighlightToDoc only.
 */

import { getSelectedDocumentId } from '../lib/storage.js';
import { withTokenRetry } from './auth.js';
import { insertHighlightToDoc } from './googleDocs.js';
import { showNotification } from './notifications.js';

function friendlyError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('Unable to download all specified images') || msg.includes('download')) {
    return 'Could not add text to the document. Try again in a moment.';
  }
  if (msg.includes('Session expired') || msg.includes('Sign in required')) {
    return 'Open the extension and click "Connect Google Docs" to sign in again.';
  }
  return msg || 'Something went wrong. Try again.';
}

/**
 * Plug the captured highlight into the connected Google Doc. Shows notifications on missing doc/token or error.
 * @param {{ selectedText: string, pageUrl: string, pageTitle: string, timestamp: string }} data
 */
export async function plugHighlightIntoDoc(data) {
  const documentId = await getSelectedDocumentId();
  if (!documentId) {
    showNotification('No document selected', 'Open the EZ-NoteTaker extension and select a Google Doc to connect.');
    return;
  }

  try {
    await withTokenRetry((token) => insertHighlightToDoc(documentId, token, data));
    showNotification('Plugged in', 'Highlight was added to your connected Google Doc.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Sign in required')) {
      showNotification('Sign in required', 'Open the EZ-NoteTaker extension and click "Connect Google Docs" to sign in.');
      return;
    }
    showNotification('Could not plug in', friendlyError(err));
  }
}
