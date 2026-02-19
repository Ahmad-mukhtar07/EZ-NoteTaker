/**
 * "Plug it in": insert selected text (and source/timestamp) into the connected Google Doc.
 * When the doc is open in a tab, tries to paste at cursor first; otherwise appends via API.
 */

import { getSelectedDocumentId } from '../lib/storage.js';
import { withTokenRetry } from './auth.js';
import { insertHighlightToDoc } from './googleDocs.js';
import { showNotification } from './notifications.js';
import { buildPlugPlainText, tryPasteAtCursorInDocTab } from './pasteAtCursor.js';

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
 * Plug the captured highlight into the connected Google Doc.
 * If sourceTabId is provided and the doc is open in another tab, pastes at cursor there; else appends via API.
 * @param {{ selectedText: string, pageUrl: string, pageTitle: string, timestamp: string }} data
 * @param {number} [sourceTabId] - tab where the user selected text (for clipboard + paste-at-cursor)
 */
export async function plugHighlightIntoDoc(data, sourceTabId) {
  const documentId = await getSelectedDocumentId();
  if (!documentId) {
    showNotification('No document selected', 'Open the EZ-NoteTaker extension and select a Google Doc to connect.');
    return;
  }

  const plainText = buildPlugPlainText(data);
  if (sourceTabId) {
    const pasted = await tryPasteAtCursorInDocTab(documentId, sourceTabId, plainText);
    if (pasted) {
      showNotification('Plugged in', 'Added at cursor in your open doc.');
      return;
    }
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
