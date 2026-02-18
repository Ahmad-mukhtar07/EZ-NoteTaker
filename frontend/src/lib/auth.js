/**
 * Google OAuth authentication using chrome.identity.
 * Handles getAuthToken, token invalidation (refresh path), and errors.
 */

const IDENTITY = typeof chrome !== 'undefined' && chrome.identity;
const STORAGE_KEY_TOKEN = 'eznote_access_token';

/**
 * Get a valid Google OAuth access token.
 * Uses Chrome's cached token; Chrome may refresh it automatically.
 * @returns {Promise<string>} Access token
 * @throws {Error} When user cancels, is not signed in, or token cannot be obtained
 */
export function getAuthToken() {
  if (!IDENTITY || !IDENTITY.getAuthToken) {
    return Promise.reject(new Error('Chrome identity API is not available.'));
  }

  return new Promise((resolve, reject) => {
    IDENTITY.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        const message = chrome.runtime.lastError.message || 'Failed to get auth token';
        reject(new AuthError(message, chrome.runtime.lastError));
        return;
      }
      if (!token) {
        reject(new AuthError('No token returned.'));
        return;
      }
      resolve(token);
    });
  });
}

/**
 * Get a token for background/non-interactive use (e.g. retry after 401).
 * Use interactive: false to avoid opening a sign-in UI; will fail if not already signed in.
 * @returns {Promise<string|null>} Access token or null if not available
 */
export function getAuthTokenSilent() {
  if (!IDENTITY || !IDENTITY.getAuthToken) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    IDENTITY.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve(null);
        return;
      }
      resolve(token);
    });
  });
}

/**
 * Remove a cached auth token so the next getAuthToken returns a fresh one.
 * Call this when the API returns 401 (e.g. expired token).
 * @param {string} token - The token to invalidate
 * @returns {Promise<void>}
 */
export function removeCachedAuthToken(token) {
  if (!IDENTITY || !IDENTITY.removeCachedAuthToken) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    IDENTITY.removeCachedAuthToken({ token }, () => {
      resolve();
    });
  });
}

/**
 * Store access token in chrome.storage for use by the extension.
 * Call after successful getAuthToken if you want to persist for the session.
 */
export function storeAccessToken(token) {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return Promise.resolve();
  return chrome.storage.local.set({ [STORAGE_KEY_TOKEN]: token });
}

/**
 * Retrieve stored access token from chrome.storage (may be stale).
 * Prefer getAuthToken() for a valid token; use this only for optional optimization.
 */
export function getStoredAccessToken() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return Promise.resolve(null);
  return chrome.storage.local.get(STORAGE_KEY_TOKEN).then((data) => data[STORAGE_KEY_TOKEN] || null);
}

/**
 * Clear stored access token from chrome.storage.
 */
export function clearStoredAccessToken() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return Promise.resolve();
  return chrome.storage.local.remove(STORAGE_KEY_TOKEN);
}

/**
 * Error thrown when auth fails (user cancel, not signed in, etc.).
 */
export class AuthError extends Error {
  /**
   * @param {string} message
   * @param {chrome.runtime.LastError|undefined} [chromeError]
   */
  constructor(message, chromeError) {
    super(message);
    this.name = 'AuthError';
    this.chromeError = chromeError;
  }

  /** User closed the sign-in window or denied access */
  get isUserCancel() {
    const m = (this.message || '').toLowerCase();
    return m.includes('cancel') || m.includes('access_denied') || m.includes('user did not approve');
  }
}
