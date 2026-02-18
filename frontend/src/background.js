/**
 * EZ-NoteTaker background service worker.
 * Context menu "Plug it in", Snip and Plug messaging.
 */

import { createContextMenu, onContextMenuClick, plugSelectionFromTab } from './background/contextMenu.js';
import { startSnipMode, handleSnipBounds } from './background/snipFlow.js';
import { getSelectedDocumentId } from './lib/storage.js';
import { getAuthTokenSilent, getStoredAccessToken, removeCachedAuthToken, storeAccessToken } from './lib/auth.js';
import { fetchDocPreview } from './lib/docsPreview.js';

const SNIP_STATE_KEY = 'eznote_snip_overlay_active';
const SNIP_TAB_ID_KEY = 'eznote_snip_tab_id';
const storage = chrome.storage?.session || chrome.storage?.local;

function setSnipOverlayActive(active, tabId = null) {
  if (!storage) return Promise.resolve();
  const updates = {
    [SNIP_STATE_KEY]: !!active,
    [SNIP_TAB_ID_KEY]: active && tabId != null ? tabId : null,
  };
  return storage.set(updates);
}

function getSnipOverlayActive() {
  if (!storage) return Promise.resolve(false);
  return storage.get(SNIP_STATE_KEY).then((o) => !!o[SNIP_STATE_KEY]);
}

const DRIVE_API_MEDIA = 'https://www.googleapis.com/drive/v3/files';

/** Extract Drive file ID from common URL patterns (drive.google.com, lh3.google.com, etc.). */
function extractDriveFileId(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    if (u.hostname === 'drive.google.com' && u.pathname === '/uc') {
      const id = u.searchParams.get('id');
      if (id) return id;
    }
    if (u.hostname === 'drive.google.com' && (u.pathname === '/file/d/' || u.pathname.startsWith('/file/d/'))) {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      if (m) return m[1];
    }
    if (u.hostname === 'www.googleapis.com' && u.pathname.startsWith('/drive/v3/files/')) {
      const id = u.pathname.replace(/^\/drive\/v3\/files\//, '').replace(/\?.*$/, '');
      if (id) return id;
    }
    if (u.hostname === 'lh3.google.com' && u.pathname.startsWith('/u/0/d/')) {
      const rest = u.pathname.replace(/^\/u\/0\/d\//, '');
      const fileId = rest.split('=')[0];
      if (fileId) return fileId;
    }
    return null;
  } catch (_) {
    return null;
  }
}

/** Fetch image as data URL: prefer Drive API alt=media when URL is a Drive file, else direct fetch with token. */
async function fetchImageAsDataUrl(url, accessToken) {
  const fileId = extractDriveFileId(url);
  const fetchUrl = fileId
    ? `${DRIVE_API_MEDIA}/${fileId}?alt=media`
    : url;
  const res = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Image fetch: ${res.status}`);
  const blob = await res.blob();
  if (!blob.type || !blob.type.startsWith('image/')) {
    throw new Error('Not an image');
  }
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('FileReader failed'));
    fr.readAsDataURL(blob);
  });
}

/** Resolve image URLs inside blocks to data URLs so they display in the preview (Drive + any URL that accepts Bearer). */
async function resolveBlockImageUrls(blocks, token) {
  const resolveOne = async (imageUrl) => {
    if (!imageUrl) return;
    try {
      return await fetchImageAsDataUrl(imageUrl, token);
    } catch (_) {
      return undefined;
    }
  };
  for (const block of blocks) {
    if (block.type === 'image' && block.url) {
      const dataUrl = await resolveOne(block.url);
      if (dataUrl) block.url = dataUrl;
    }
    if (block.type === 'paragraph' && Array.isArray(block.children)) {
      for (const child of block.children) {
        if (child.type === 'image' && child.url) {
          const dataUrl = await resolveOne(child.url);
          if (dataUrl) child.url = dataUrl;
        }
      }
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu();
});

// Open side panel when extension icon is clicked (panel stays open until user closes it).
// Must open in the same synchronous turn as the click; avoid await before open().
chrome.action.onClicked.addListener(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0];
    if (tab?.windowId) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch((e) => console.error('EZ-NoteTaker: open side panel failed', e));
    }
  });
});

// When the tab that has the snip overlay is reloaded or navigated, clear snip state
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return;
  storage?.get(SNIP_TAB_ID_KEY).then((o) => {
    if (o[SNIP_TAB_ID_KEY] === tabId) setSnipOverlayActive(false);
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  onContextMenuClick(info, tab).catch((err) => {
    console.error('EZ-NoteTaker: plug it in failed', err);
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_SNIP') {
    const tabId = msg.tabId ?? sender.tab?.id;
    if (tabId) {
      startSnipMode(tabId)
        .then(() => sendResponse({ ok: true }), (err) => sendResponse({ error: String(err) }));
    } else {
      sendResponse({ error: 'No tab' });
    }
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
  if (msg.type === 'GET_DOC_PREVIEW') {
    // Don't use sendResponse: service worker may suspend before async fetch completes.
    // Run the fetch and broadcast result so the side panel can receive it via onMessage.
    (async () => {
      let payload;
      try {
        const documentId = await getSelectedDocumentId();
        if (!documentId) {
          payload = { error: 'No document selected' };
        } else {
          let token = await getAuthTokenSilent() || await getStoredAccessToken();
          if (!token) {
            payload = { error: 'Sign in required' };
          } else {
            let result;
            try {
              result = await fetchDocPreview(documentId, token);
              await resolveBlockImageUrls(result.blocks, token);
              payload = { title: result.title, blocks: result.blocks };
            } catch (err) {
              if (err instanceof Error && err.message === 'SESSION_EXPIRED') {
                await removeCachedAuthToken(token);
                const newToken = await getAuthTokenSilent();
                if (newToken) {
                  await storeAccessToken(newToken);
                  result = await fetchDocPreview(documentId, newToken);
                  await resolveBlockImageUrls(result.blocks, newToken);
                  payload = { title: result.title, blocks: result.blocks };
                } else {
                  payload = { error: 'Session expired. Sign in again.' };
                }
              } else {
                payload = { error: err instanceof Error ? err.message : String(err) };
              }
            }
          }
        }
      } catch (e) {
        payload = { error: e instanceof Error ? e.message : 'Failed to load preview' };
      }
      try {
        chrome.runtime.sendMessage({ type: 'DOC_PREVIEW_RESULT', ...payload });
      } catch (_) {
        // No listener (e.g. side panel closed)
      }
    })();
    return false;
  }
});
