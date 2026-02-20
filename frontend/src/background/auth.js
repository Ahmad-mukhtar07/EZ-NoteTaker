/**
 * Background-only auth: token acquisition, validation, and retry on 401.
 * All Google API callers in the background must use getValidToken() or withTokenRetry().
 */

import {
  getAuthToken,
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
 * Get a valid token for API use. Only returns a token from the explicit "Connect Google Docs"
 * flow (stored token). Does not use Chrome's primary account—user must click Connect and pick an account.
 * @returns {Promise<string|null>}
 */
export async function getValidToken() {
  return getStoredAccessToken();
}

/**
 * Get a token via launchWebAuthFlow so the user can choose which Google account to use.
 * Uses the Web application OAuth client ID (with redirect URI), passed from the popup.
 * @param {string} [webClientId] - Web application client ID from .env (popup sends it). Required for Connect flow.
 * @returns {Promise<string>} token
 * @throws {Error} when user cancels or flow fails
 */
export async function getTokenViaLaunchWebAuthFlow(webClientId) {
  const IDENTITY = chrome?.identity;
  if (!IDENTITY?.getRedirectURL || !IDENTITY?.launchWebAuthFlow) {
    throw new Error('Chrome identity API is not available.');
  }

  const manifest = chrome.runtime.getManifest();
  const scopes = Array.isArray(manifest?.oauth2?.scopes) ? manifest.oauth2.scopes : [];
  if (scopes.length === 0) {
    throw new Error('OAuth2 scopes missing in manifest.');
  }

  const clientId = (webClientId && webClientId.trim()) || manifest?.oauth2?.client_id;
  if (!clientId) {
    throw new Error(
      'Set VITE_GOOGLE_DOCS_WEB_CLIENT_ID in .env to your Web application OAuth client ID (with redirect URI ' +
        IDENTITY.getRedirectURL() + ').'
    );
  }

  // Redirect URI must match Google Console exactly. Use path "oauth2" (Chromium docs / launchWebAuthFlow).
  const redirectUri = IDENTITY.getRedirectURL('oauth2');
  const scope = scopes.join(' ');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope,
    prompt: 'select_account',
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return new Promise((resolve, reject) => {
    IDENTITY.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (callbackUrl) => {
        if (chrome.runtime?.lastError) {
          const msg = chrome.runtime.lastError.message || '';
          if (msg.toLowerCase().includes('cancel') || msg.includes('access_denied')) {
            reject(new Error('Sign-in was cancelled.'));
            return;
          }
          reject(new Error(chrome.runtime.lastError.message || 'Sign-in failed.'));
          return;
        }
        if (!callbackUrl) {
          reject(new Error('No callback URL received.'));
          return;
        }

        const hash = new URL(callbackUrl).hash?.slice(1) || '';
        const hashParams = new URLSearchParams(hash);
        const accessToken = hashParams.get('access_token');
        if (!accessToken) {
          const err = hashParams.get('error_description') || hashParams.get('error') || 'Missing access token';
          reject(new Error(err));
          return;
        }
        storeAccessToken(accessToken).then(() => resolve(accessToken));
      }
    );
  });
}

/**
 * Get a token, optionally interactive (for "Connect" flow).
 * Uses launchWebAuthFlow with webClientId when provided; falls back to getAuthToken.
 * @param {{ interactive: boolean, webClientId?: string }} [options]
 * @returns {Promise<string>} token
 * @throws {Error} when user cancels or not available
 */
export async function getTokenInteractive(options = { interactive: false }) {
  if (options.interactive) {
    const webClientId = options.webClientId || '';
    if (webClientId.trim()) {
      try {
        return await getTokenViaLaunchWebAuthFlow(webClientId.trim());
      } catch (err) {
        log.bg.warn('launchWebAuthFlow failed, falling back to getAuthToken', err?.message);
      }
    }
    const token = await getAuthToken();
    await storeAccessToken(token);
    return token;
  }
  const token = await getValidToken();
  if (!token) throw new Error('Not signed in');
  return token;
}

/**
 * Run an async function with a valid token. On 401, clears auth and notifies user to reconnect.
 * (No automatic retry with a different token, so the chosen Google account is preserved.)
 * @param {(token: string) => Promise<T>} fn - Function that performs the API call(s). Should throw Error('SESSION_EXPIRED') on 401.
 * @returns {Promise<T>}
 * @throws {Error} Re-throws non-auth errors; auth failures throw after notifying user.
 */
export async function withTokenRetry(fn) {
  const token = await getValidToken();
  if (!token) {
    log.bg.warn('withTokenRetry: no token');
    throw new Error('Sign in required');
  }

  try {
    return await fn(token);
  } catch (err) {
    if (!isAuthError(err)) throw err;
    log.bg.info('Auth error, clearing state');
    await clearAuthState();
    showNotification('Session expired', 'Please open the extension and connect Google Docs again.');
    throw new Error('Session expired');
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
