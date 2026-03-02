/**
 * In-memory stack of the most recent Plug/Snip insert operations (per session).
 * Used by "Undo Last Insert" to remove the last extension-generated insertion.
 */

/** @type {Array<{ documentId: string, startIndex: number, endIndex: number, snipId?: string | null }>} */
let stack = [];

/**
 * @param {{ documentId: string, startIndex: number, endIndex: number, snipId?: string | null }} entry
 */
export function pushUndoInsert(entry) {
  if (!entry?.documentId || typeof entry.startIndex !== 'number' || typeof entry.endIndex !== 'number') return;
  stack.push({
    documentId: String(entry.documentId),
    startIndex: entry.startIndex,
    endIndex: entry.endIndex,
    snipId: entry.snipId ?? null,
  });
}

/**
 * @returns {{ documentId: string, startIndex: number, endIndex: number, snipId?: string | null } | null}
 */
export function peekUndoInsert() {
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

/**
 * @returns {{ documentId: string, startIndex: number, endIndex: number, snipId?: string | null } | null}
 */
export function popUndoInsert() {
  return stack.length > 0 ? stack.pop() : null;
}

/**
 * True if there is at least one tracked insert for the given document.
 * @param {string} documentId
 * @returns {boolean}
 */
export function canUndoInsert(documentId) {
  const top = peekUndoInsert();
  return top !== null && top.documentId === documentId;
}
