/**
 * chrome.storage helpers for EZ-Note extension state.
 * Stores selected Google Doc id and name for later use.
 */

const STORAGE_KEYS = {
  SELECTED_DOCUMENT_ID: 'eznote_selected_document_id',
  SELECTED_DOCUMENT_NAME: 'eznote_selected_document_name',
};

/**
 * @returns {Promise<chrome.storage.LocalStorageArea>|null}
 */
function getStorage() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
  return chrome.storage.local;
}

/**
 * Get the currently selected Google Doc id (if any).
 * @returns {Promise<string|null>}
 */
export function getSelectedDocumentId() {
  const storage = getStorage();
  if (!storage) return Promise.resolve(null);
  return storage.get(STORAGE_KEYS.SELECTED_DOCUMENT_ID).then((data) => data[STORAGE_KEYS.SELECTED_DOCUMENT_ID] || null);
}

/**
 * Get the currently selected document's display name (if any).
 * @returns {Promise<string|null>}
 */
export function getSelectedDocumentName() {
  const storage = getStorage();
  if (!storage) return Promise.resolve(null);
  return storage.get(STORAGE_KEYS.SELECTED_DOCUMENT_NAME).then((data) => data[STORAGE_KEYS.SELECTED_DOCUMENT_NAME] || null);
}

/**
 * Store the selected Google Doc for later use.
 * @param {string} documentId - Google Doc id
 * @param {string} [documentName] - Display name for the doc
 * @returns {Promise<void>}
 */
export function setSelectedDocument(documentId, documentName = '') {
  const storage = getStorage();
  if (!storage) return Promise.resolve();
  return storage.set({
    [STORAGE_KEYS.SELECTED_DOCUMENT_ID]: documentId,
    [STORAGE_KEYS.SELECTED_DOCUMENT_NAME]: documentName || '',
  });
}

/**
 * Clear the selected document from storage.
 * @returns {Promise<void>}
 */
export function clearSelectedDocument() {
  const storage = getStorage();
  if (!storage) return Promise.resolve();
  return storage.remove([STORAGE_KEYS.SELECTED_DOCUMENT_ID, STORAGE_KEYS.SELECTED_DOCUMENT_NAME]);
}
