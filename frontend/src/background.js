/**
 * EZ-Note background service worker.
 * Single message router: messageHub for auth/docs/preview; inline handlers for snip/context menu.
 */

import { createContextMenu, onContextMenuClick, plugSelectionFromTab } from './background/contextMenu.js';
import { startSnipMode, handleSnipBounds, setSnipInsertIndex, clearSnipInsertIndex } from './background/snipFlow.js';
import { handleMessage } from './background/messageHub.js';
import { log } from './background/logger.js';

const SNIP_STATE_KEY = 'eznote_snip_overlay_active';
const SNIP_TAB_ID_KEY = 'eznote_snip_tab_id';
const storage = chrome.storage?.session || chrome.storage?.local;

function setSnipOverlayActive(active, tabId = null) {
  if (!storage) return Promise.resolve();
  return storage.set({
    [SNIP_STATE_KEY]: !!active,
    [SNIP_TAB_ID_KEY]: active && tabId != null ? tabId : null,
  });
}

function getSnipOverlayActive() {
  if (!storage) return Promise.resolve(false);
  return storage.get(SNIP_STATE_KEY).then((o) => !!o[SNIP_STATE_KEY]);
}

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu();
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0];
    if (tab?.windowId) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch((e) => log.bg.error('open side panel failed', e));
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return;
  storage?.get(SNIP_TAB_ID_KEY).then((o) => {
    if (o[SNIP_TAB_ID_KEY] === tabId) setSnipOverlayActive(false);
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  onContextMenuClick(info, tab).catch((err) => log.bg.error('plug it in failed', err));
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const hubTypes = [
    'AUTH_GET_STATUS',
    'AUTH_CONNECT',
    'AUTH_DISCONNECT',
    'DOCS_LIST',
    'DOCS_SET_SELECTED',
    'DOCS_CREATE',
    'DOCS_GET_SECTIONS',
    'GET_PLUG_SELECTION',
    'PLUG_IT_IN_AT_SECTION',
    'GET_DOC_PREVIEW',
  ];
  if (hubTypes.includes(msg?.type)) {
    handleMessage(msg, sender)
      .then((r) => {
        if (r && r.sendResponse) sendResponse(r.response);
      })
      .catch((e) => {
        log.bg.error('messageHub', e);
        sendResponse({ error: e instanceof Error ? e.message : String(e) });
      });
    return true;
  }

  if (msg.type === 'START_SNIP') {
    const tabId = msg.tabId ?? sender.tab?.id;
    if (tabId) {
      clearSnipInsertIndex();
      startSnipMode(tabId)
        .then(() => sendResponse({ ok: true }), (err) => sendResponse({ error: String(err) }));
    } else {
      sendResponse({ error: 'No tab' });
    }
    return true;
  }
  if (msg.type === 'SNIP_START_WITH_SECTION') {
    const tabId = msg.tabId ?? sender.tab?.id;
    const insertIndex = msg.insertIndex;
    if (!tabId || typeof insertIndex !== 'number') {
      sendResponse({ ok: false, error: 'Missing tab or insertIndex' });
      return true;
    }
    setSnipInsertIndex(insertIndex)
      .then(() => startSnipMode(tabId))
      .then(() => sendResponse({ ok: true }), (err) => sendResponse({ error: String(err) }));
    return true;
  }
  if (msg.type === 'SNIP_OVERLAY_CREATED') {
    const tabId = sender.tab?.id;
    if (tabId) setSnipOverlayActive(true, tabId);
    return false;
  }
  if (msg.type === 'SNIP_BOUNDS') {
    setSnipOverlayActive(false);
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId ?? null;
    if (tabId && msg.bounds) {
      handleSnipBounds(tabId, msg.bounds, windowId, {
        pageUrl: msg.pageUrl,
        pageTitle: msg.pageTitle,
      }).then(() => sendResponse({ ok: true }), (err) => sendResponse({ error: String(err) }));
    } else {
      sendResponse({ error: 'No tab or bounds' });
    }
    return true;
  }
  if (msg.type === 'SNIP_CANCEL') {
    setSnipOverlayActive(false);
    clearSnipInsertIndex();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'PLUG_IT_IN') {
    const tabId = msg.tabId ?? sender.tab?.id;
    if (tabId) {
      plugSelectionFromTab(tabId).then(() => sendResponse({ ok: true }), (err) => sendResponse({ error: String(err) }));
    } else {
      sendResponse({ error: 'No tab' });
    }
    return true;
  }
  if (msg.type === 'GET_SNIP_STATE') {
    getSnipOverlayActive().then((active) => sendResponse({ active }));
    return true;
  }
  if (msg.type === 'SNIP_OVERLAY_CLOSED') {
    setSnipOverlayActive(false);
    return false;
  }
  return false;
});
