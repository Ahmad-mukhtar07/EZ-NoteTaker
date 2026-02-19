/**
 * Try to insert text at the cursor in the connected Google Doc when it's open in a tab.
 * Uses clipboard + programmatic paste. Falls back to API append if this fails.
 */

/**
 * Build the same plain text we would insert via API (quote + source line).
 * @param {{ selectedText: string, pageTitle?: string, timestamp: string }} data
 * @returns {string}
 */
export function buildPlugPlainText(data) {
  const { selectedText = '', pageTitle = 'Untitled', timestamp } = data;
  const title = pageTitle || 'Untitled';
  return '\n' + selectedText.trim() + '\nSource: ' + title + ' ' + (timestamp || new Date().toISOString());
}

/**
 * Try to paste the given text at the cursor in a tab that has the doc open.
 * 1) Copy text to clipboard in sourceTabId. 2) Activate doc tab. 3) Send TRIGGER_PASTE to doc tab.
 * @param {string} documentId
 * @param {number} sourceTabId - tab where we run clipboard.writeText (user gesture context)
 * @param {string} plainText
 * @returns {Promise<boolean>} true if paste was triggered, false to fall back to API
 */
export async function tryPasteAtCursorInDocTab(documentId, sourceTabId, plainText) {
  if (!documentId || !sourceTabId || typeof plainText !== 'string') return false;
  const docUrlPattern = 'https://docs.google.com/document/d/' + documentId + '/';
  let docTabs;
  try {
    docTabs = await chrome.tabs.query({ url: docUrlPattern + '*' });
  } catch (_) {
    return false;
  }
  const docTab = docTabs && docTabs[0];
  if (!docTab?.id) return false;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: sourceTabId },
      func: (text) => {
        if (typeof navigator.clipboard !== 'undefined' && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(text);
        }
        return Promise.reject(new Error('Clipboard not available'));
      },
      args: [plainText],
    });
  } catch (_) {
    return false;
  }

  try {
    await chrome.tabs.update(docTab.id, { active: true });
    await new Promise((r) => setTimeout(r, 150));
    const response = await chrome.tabs.sendMessage(docTab.id, { type: 'TRIGGER_PASTE' });
    return response?.ok === true;
  } catch (_) {
    return false;
  }
}

/**
 * Try to paste an image (and optional source text) at the cursor in a tab that has the doc open.
 * @param {string} documentId
 * @param {number} sourceTabId
 * @param {string} imageDataUrl - data URL of the image (e.g. from crop)
 * @param {string} [sourceText] - e.g. "\nSource: title timestamp"
 * @returns {Promise<boolean>}
 */
export async function tryPasteImageAtCursorInDocTab(documentId, sourceTabId, imageDataUrl, sourceText) {
  if (!documentId || !sourceTabId || !imageDataUrl) return false;
  const docUrlPattern = 'https://docs.google.com/document/d/' + documentId + '/';
  let docTabs;
  try {
    docTabs = await chrome.tabs.query({ url: docUrlPattern + '*' });
  } catch (_) {
    return false;
  }
  const docTab = docTabs && docTabs[0];
  if (!docTab?.id) return false;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: sourceTabId },
      func: async (dataUrl) => {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      },
      args: [imageDataUrl],
    });
  } catch (_) {
    return false;
  }

  try {
    await chrome.tabs.update(docTab.id, { active: true });
    await new Promise((r) => setTimeout(r, 150));
    await chrome.tabs.sendMessage(docTab.id, { type: 'TRIGGER_PASTE' });
    if (sourceText) {
      await chrome.scripting.executeScript({
        target: { tabId: sourceTabId },
        func: (text) => navigator.clipboard.writeText(text),
        args: [sourceText],
      });
      await new Promise((r) => setTimeout(r, 80));
      await chrome.tabs.sendMessage(docTab.id, { type: 'TRIGGER_PASTE' });
    }
    return true;
  } catch (_) {
    return false;
  }
}
