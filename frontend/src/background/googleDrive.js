/**
 * Google Drive API: Research Snips folder and image upload.
 * All calls run in background with token from auth.withTokenRetry.
 */

import { getResearchSnipsFolderId, setResearchSnipsFolderId } from '../lib/storage.js';
import { log } from './logger.js';

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webContentLink,webViewLink';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DOC_MIME = 'application/vnd.google-apps.document';
const RESEARCH_SNIPS_NAME = 'Research Snips';

/**
 * Set a file to be viewable by anyone with the link (required for Docs insertInlineImage).
 * @param {string} fileId
 * @param {string} accessToken
 */
async function setPublicViewPermission(fileId, accessToken) {
  const res = await fetch(`${FILES_URL}/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'anyone', role: 'reader' }),
  });
  if (res.status === 401) throw new Error('SESSION_EXPIRED');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive permission error: ${res.status} ${body.slice(0, 150)}`);
  }
}

/**
 * Get or create the "Research Snips" folder in the user's Drive. Store folderId in chrome.storage.
 * @param {string} accessToken
 * @returns {Promise<string>} folderId
 */
export async function ensureResearchSnipsFolder(accessToken) {
  let folderId = await getResearchSnipsFolderId();
  if (folderId) return folderId;

  const res = await fetch(FILES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: RESEARCH_SNIPS_NAME,
      mimeType: FOLDER_MIME,
    }),
  });
  if (res.status === 401) throw new Error('SESSION_EXPIRED');
  if (!res.ok) {
    const text = await res.text();
    let msg = `Drive create folder error: ${res.status}`;
    try {
      const j = JSON.parse(text);
      if (j.error?.message) msg = j.error.message;
    } catch (_) {}
    throw new Error(msg);
  }

  const data = await res.json();
  folderId = data.id;
  if (!folderId) throw new Error('No folder ID returned from Drive');
  await setResearchSnipsFolderId(folderId);
  log.bg.info('Created Research Snips folder', folderId);
  return folderId;
}

/**
 * Upload image to Drive (multipart). Uses Research Snips folder if available.
 * Sets anyone-with-link reader permission so Docs can use the image.
 * @param {string} accessToken
 * @param {Blob} imageBlob
 * @param {string} [filename]
 * @param {string} [parentFolderId] - Research Snips folder id (optional)
 * @returns {Promise<{ fileId: string, imageUrl: string }>}
 */
export async function uploadImageToDrive(accessToken, imageBlob, filename = 'eznote-snip.png', parentFolderId = null) {
  const boundary = '-------' + Math.random().toString(36).slice(2, 12);
  const meta = {
    name: filename,
    mimeType: imageBlob.type || 'image/png',
  };
  if (parentFolderId) meta.parents = [parentFolderId];

  const metaPart = [
    '\r\n--' + boundary + '\r\n',
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(meta),
  ].join('');
  const filePart = [
    '\r\n--' + boundary + '\r\n',
    'Content-Type: ' + (imageBlob.type || 'image/png') + '\r\n\r\n',
  ].join('');
  const end = '\r\n--' + boundary + '--\r\n';
  const body = new Blob([metaPart, filePart, imageBlob, end], {
    type: 'multipart/related; boundary=' + boundary,
  });

  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'multipart/related; boundary=' + boundary,
    },
    body,
  });

  if (res.status === 401) throw new Error('SESSION_EXPIRED');
  if (!res.ok) {
    const text = await res.text();
    let message = `Drive upload error: ${res.status}`;
    try {
      const json = JSON.parse(text);
      if (json.error?.message) message = json.error.message;
    } catch (_) {
      if (text) message += ' ' + text.slice(0, 200);
    }
    throw new Error(message);
  }

  const data = await res.json();
  const fileId = data.id;
  if (!fileId) throw new Error('No file ID returned from Drive');

  await setPublicViewPermission(fileId, accessToken);

  let imageUrl = data.webContentLink;
  if (!imageUrl) {
    const getRes = await fetch(`${FILES_URL}/${fileId}?fields=webContentLink`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (getRes.ok) {
      const fileMeta = await getRes.json();
      imageUrl = fileMeta.webContentLink;
    }
  }
  if (!imageUrl) imageUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
  return { fileId, imageUrl };
}

/**
 * Create a new Google Doc in the user's Drive.
 * @param {string} accessToken
 * @param {string} [name] - Document title (default "Untitled")
 * @returns {Promise<{ id: string, name: string }>}
 */
export async function createNewDoc(accessToken, name = 'Untitled') {
  const res = await fetch(FILES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: name.trim() || 'Untitled',
      mimeType: DOC_MIME,
    }),
  });
  if (res.status === 401) throw new Error('SESSION_EXPIRED');
  if (!res.ok) {
    const text = await res.text();
    let msg = `Drive create doc error: ${res.status}`;
    try {
      const j = JSON.parse(text);
      if (j.error?.message) msg = j.error.message;
    } catch (_) {}
    throw new Error(msg);
  }
  const data = await res.json();
  const id = data.id;
  if (!id) throw new Error('No document ID returned from Drive');
  return { id, name: data.name || name || 'Untitled' };
}
