/**
 * Google Drive/Docs API calls.
 * Uses access token from chrome.identity; handles 401 with token refresh.
 */

import { getAuthToken, getAuthTokenSilent, removeCachedAuthToken } from './auth.js';

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DOCS_MIME_TYPE = 'application/vnd.google-apps.document';

/**
 * Fetch list of Google Docs for the authenticated user.
 * On 401, invalidates the cached token and retries once with a fresh token.
 * @param {string} [accessToken] - Optional token; if not provided, getAuthToken() is used
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
export async function fetchDocsList(accessToken) {
  const token = accessToken || (await getAuthToken());
  const url = `${DRIVE_FILES_URL}?q=${encodeURIComponent(`mimeType='${DOCS_MIME_TYPE}'`)}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=100`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401) {
    await removeCachedAuthToken(token);
    const newToken = await getAuthTokenSilent();
    if (newToken) {
      return fetchDocsList(newToken);
    }
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) {
    const body = await res.text();
    let message = `Drive API error: ${res.status}`;
    try {
      const json = JSON.parse(body);
      if (json.error?.message) message = json.error.message;
    } catch (_) {
      if (body) message += ` ${body.slice(0, 200)}`;
    }
    throw new Error(message);
  }

  const data = await res.json();
  const files = data.files || [];
  return files.map((f) => ({ id: f.id, name: f.name || 'Untitled', modifiedTime: f.modifiedTime }));
}
