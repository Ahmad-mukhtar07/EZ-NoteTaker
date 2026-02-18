/**
 * Capture selected text and page info from the active tab using chrome.scripting.
 * Used when the user clicks "Plug it in" from the context menu.
 */

/**
 * Get the current selection text from a tab (run in page context).
 * @param {number} tabId
 * @returns {Promise<{ selectedText: string, pageUrl: string, pageTitle: string }>}
 */
export async function getSelectionAndPageInfo(tab) {
  const timestamp = new Date().toISOString();
  const pageUrl = tab.url || '';
  const pageTitle = tab.title || 'Untitled';

  const injection = {
    target: { tabId: tab.id },
    func: () => window.getSelection()?.toString()?.trim() ?? '',
  };

  const [result] = await chrome.scripting.executeScript(injection);
  const selectedText = result?.result ?? '';

  return {
    selectedText,
    pageUrl,
    pageTitle,
    timestamp,
  };
}
