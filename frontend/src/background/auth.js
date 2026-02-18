/**
 * Background-only auth: token acquisition, validation, and retry on 401.
 * All Google API callers in the background must use getValidToken() or withTokenRetry().
 */

import {
  getAuthToken,
  getAuthTokenSilent,
  removeCachedAuthToken,
  storeAccessToken,
  getStoredAccessToken,
  clearStoredAccessToken,
  clearAllCachedAuthTokens,
} from '../lib/auth.js';
import { clearSelectedDocument } from '../lib/storage.js';
import { log } from './logger.js';
import { showNotification } from './notifications.js';

const SESSION_EXPIRED_MSG = 'SESSION_EXPIRED';

/**
 * Check if an error indicates auth failure (401 / expired).
 * @param {Error|unknown} err
 * @returns {boolean}
 */
export function isAuthError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg === SESSION_EXPIRED_MSG ||
    msg.includes('401') ||
    msg.includes('UNAUTHENTICATED') ||
    msg.includes('invalid authentication') ||
    msg.includes('Invalid Credentials') ||
    msg.includes('Session expired')
  );
}

/**
 * Get a valid token for API use (silent first, then stored).
 * Does not validate with a network call; validation happens on first API use.
 * @returns {Promise<string|null>}
 */
export async function getValidToken() {
  const token = await getAuthTokenSilent().catch(() => null) || await getStoredAccessToken();
  return token || null;
}

/**
 * Get a token, optionally interactive (for "Connect" flow).
 * @param {{ interactive: boolean }} [options]
 * @returns {Promise<string>} token
 * @throws {Error} when user cancels or not available
 */
export async function getTokenInteractive(options = { interactive: false }) {
  if (options.interactive) {
    const token = await getAuthToken();
    await storeAccessToken(token);
    return token;
  }
  const token = await getValidToken();
  if (!token) throw new Error('Not signed in');
  return token;
}

/**
 * Run an async function with a valid token. On 401, invalidate cache, reacquire token, retry once.
 * If retry still fails (or no new token), notifies user and clears auth state.
 * @param {(token: string) => Promise<T>} fn - Function that performs the API call(s). Should throw Error('SESSION_EXPIRED') on 401.
 * @returns {Promise<T>}
 * @throws {Error} Re-throws non-auth errors; auth failures throw after notifying user.
 */
export async function withTokenRetry(fn) {
  let token = await getValidToken();
  if (!token) {
    log.bg.warn('withTokenRetry: no token');
    throw new Error('Sign in required');
  }

  try {
    return await fn(token);
  } catch (err) {
    if (!isAuthError(err)) throw err;

    log.bg.info('Auth error, invalidating cache and retrying once');
    await removeCachedAuthToken(token);
    const newToken = await getAuthTokenSilent().catch(() => null);
    if (!newToken) {
      await clearAuthState();
      showNotification('Session expired', 'Please open the extension and connect Google Docs again.');
      throw new Error('Session expired');
    }
    await storeAccessToken(newToken);

    try {
      return await fn(newToken);
    } catch (retryErr) {
      if (isAuthError(retryErr)) {
        await clearAuthState();
        showNotification('Session expired', 'Please open the extension and connect Google Docs again.');
      }
      throw retryErr;
    }
  }
}

/**
 * Clear all auth and selected-doc state (for "Disconnect").
 * @returns {Promise<void>}
 */
export async function clearAuthState() {
  await clearStoredAccessToken();
  try {
    await clearAllCachedAuthTokens();
  } catch (_) {
    // Chrome < 87
  }
  await clearSelectedDocument();
  log.bg.info('Auth state cleared');
}

/**
 * Disconnect: clear tokens and stored document. Call from background only.
 * @returns {Promise<void>}
 */
export async function disconnect() {
  await clearAuthState();
}
