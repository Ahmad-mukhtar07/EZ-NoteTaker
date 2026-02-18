/**
 * Context menu: "Plug it in" — only when text is selected.
 * On click: capture selection, page URL/title, timestamp; send to insertion flow.
 */

import { getSelectionAndPageInfo } from './captureSelection.js';
import { plugHighlightIntoDoc } from './plugHighlightIntoDoc.js';
import { showNotification } from './notifications.js';

const MENU_ID = 'eznote-plug-it-in';

/**
 * Create the "Plug it in" context menu (selection context only).
 */
export function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: MENU_ID,
        title: 'Plug it in',
        contexts: ['selection'],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error('EZ-Note: context menu create failed', chrome.runtime.lastError);
        }
      }
    );
  });
}

/**
 * Handle context menu click: capture selection from tab, then plug into Doc.
 * All errors are caught so no uncaught promise rejection can occur.
 * @param {chrome.contextMenus.OnClickData} info
 * @param {chrome.tabs.Tab} [tab]
 */
export async function onContextMenuClick(info, tab) {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;

  try {
    const selection = await getSelectionAndPageInfo(tab);
    if (!selection.selectedText?.trim()) {
      showNotification('No text selected', 'Select some text on the page, then right‑click and choose "Plug it in".');
      return;
    }
    await plugHighlightIntoDoc(selection);
  } catch (err) {
    console.error('EZ-Note: plug it in failed', err);
    showNotification(
      'Could not plug in',
      err instanceof Error ? err.message : 'Something went wrong. Try again.'
    );
  }
}

/**
 * Plug the current selection from a tab into the connected Doc (same as context menu "Plug it in").
 * Call from popup button or elsewhere with the tab id.
 * @param {number} tabId
 */
export async function plugSelectionFromTab(tabId) {
  if (!tabId) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    const selection = await getSelectionAndPageInfo(tab);
    if (!selection.selectedText?.trim()) {
      showNotification('No text selected', 'Select some text on the page, then click "Plug it in" in the extension.');
      return;
    }
    await plugHighlightIntoDoc(selection);
  } catch (err) {
    console.error('EZ-Note: plug it in failed', err);
    showNotification(
      'Could not plug in',
      err instanceof Error ? err.message : 'Something went wrong. Try again.'
    );
  }
}

export { showNotification };
