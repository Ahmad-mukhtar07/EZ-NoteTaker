/**
 * Google Docs API: preview, insert text, insert image.
 * All calls run in background with token from auth.withTokenRetry.
 */

import { fetchDocPreview as fetchDocPreviewLib } from '../lib/docsPreview.js';
import { insertHighlightToDoc as insertHighlightLib, insertImageWithSource as insertImageLib } from '../lib/docsInsert.js';

const DRIVE_API_MEDIA = 'https://www.googleapis.com/drive/v3/files';

function extractDriveFileId(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    if (u.hostname === 'drive.google.com' && u.pathname === '/uc') return u.searchParams.get('id');
    if (u.hostname === 'drive.google.com' && u.pathname.startsWith('/file/d/')) {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      return m ? m[1] : null;
    }
    if (u.hostname === 'www.googleapis.com' && u.pathname.startsWith('/drive/v3/files/')) {
      return u.pathname.replace(/^\/drive\/v3\/files\//, '').replace(/\?.*$/, '');
    }
    if (u.hostname === 'lh3.google.com' && u.pathname.startsWith('/u/0/d/')) {
      return u.pathname.replace(/^\/u\/0\/d\//, '').split('=')[0];
    }
  } catch (_) {}
  return null;
}

async function fetchImageAsDataUrl(url, accessToken) {
  const fileId = extractDriveFileId(url);
  const fetchUrl = fileId ? `${DRIVE_API_MEDIA}/${fileId}?alt=media` : url;
  const res = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Image fetch: ${res.status}`);
  const blob = await res.blob();
  if (!blob.type || !blob.type.startsWith('image/')) throw new Error('Not an image');
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('FileReader failed'));
    fr.readAsDataURL(blob);
  });
}

/**
 * Resolve image URLs in blocks to data URLs for preview display.
 * @param {Array} blocks
 * @param {string} accessToken
 */
export async function resolveBlockImageUrls(blocks, accessToken) {
  const resolveOne = async (imageUrl) => {
    if (!imageUrl) return;
    try {
      return await fetchImageAsDataUrl(imageUrl, accessToken);
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

import { fetchDocsList as fetchDocsListLib } from '../lib/googleApi.js';

export const fetchDocPreview = fetchDocPreviewLib;
export const insertHighlightToDoc = insertHighlightLib;
export const insertImageWithSource = insertImageLib;
export const fetchDocsList = fetchDocsListLib;
