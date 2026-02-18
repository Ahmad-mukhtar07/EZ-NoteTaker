/**
 * Upload image to Google Drive and set public view permission for use in Docs.
 */

const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';

/**
 * Set a file to be viewable by anyone with the link.
 * @param {string} fileId
 * @param {string} accessToken
 */
async function setPublicViewPermission(fileId, accessToken) {
  const url = `${FILES_URL}/${fileId}/permissions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'anyone', role: 'reader' }),
  });

  if (res.status === 401) {
    throw new Error('SESSION_EXPIRED');
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive permission error: ${res.status} ${body.slice(0, 150)}`);
  }
}

/**
 * Upload an image blob to Drive and return a viewable URL.
 * @param {string} accessToken - OAuth access token
 * @param {Blob} imageBlob - Image data
 * @param {string} [filename] - Filename for the Drive file
 * @returns {Promise<{ fileId: string, imageUrl: string }>}
 */
export async function uploadImageToDrive(accessToken, imageBlob, filename = 'eznote-snip.png') {
  const boundary = '-------' + Math.random().toString(36).slice(2, 12);
  const meta = {
    name: filename,
    mimeType: imageBlob.type || 'image/png',
  };
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

  if (res.status === 401) {
    throw new Error('SESSION_EXPIRED');
  }
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
  if (!fileId) {
    throw new Error('No file ID returned from Drive');
  }

  await setPublicViewPermission(fileId, accessToken);

  // Prefer webContentLink (direct download URL) so Docs API can fetch the image when file is public
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
  if (!imageUrl) {
    imageUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
  }
  return { fileId, imageUrl };
}
