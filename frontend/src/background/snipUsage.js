/**
 * Backend-enforced snip usage: call Supabase RPC before allowing a plug/snip insert.
 * Uses token from chrome.storage (synced by popup when user is signed in).
 */

const STORAGE_KEY_URL = 'eznote_supabase_url';
const STORAGE_KEY_ANON = 'eznote_supabase_anon_key';
const STORAGE_KEY_TOKEN = 'eznote_supabase_access_token';

/**
 * Call record_snip_and_check_limit RPC. Returns { success: true } or { error: string }.
 * @param {{ content?: string, source_url?: string, target_doc_id?: string }} params
 * @returns {Promise<{ success?: boolean, error?: string, limit?: number }>}
 */
export async function recordSnipAndCheckLimit(params = {}) {
  const { content = '', source_url = '', target_doc_id = '' } = params;
  const stored = await new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY_URL, STORAGE_KEY_ANON, STORAGE_KEY_TOKEN], resolve);
  });
  const url = stored[STORAGE_KEY_URL];
  const anonKey = stored[STORAGE_KEY_ANON];
  const token = stored[STORAGE_KEY_TOKEN];
  if (!url || !anonKey || !token) {
    return { error: 'not_authenticated' };
  }

  const rpcUrl = `${url.replace(/\/$/, '')}/rest/v1/rpc/record_snip_and_check_limit`;
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Apikey: anonKey,
      Authorization: `Bearer ${token}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      p_content: String(content).slice(0, 10000),
      p_source_url: String(source_url).slice(0, 2048),
      p_target_doc_id: String(target_doc_id).slice(0, 256),
    }),
  });

  let data = await res.json().catch(() => ({}));
  if (Array.isArray(data) && data[0]) data = data[0];
  if (!res.ok) {
    const msg = data?.message || data?.error_description || data?.error || 'record_snip_failed';
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      console.warn('[EZ-Note] record_snip_and_check_limit failed', res.status, msg, data);
    }
    return { error: msg };
  }
  if (data?.error) {
    return { error: data.error, limit: data.limit };
  }
  return { success: true };
}

/**
 * Call get_snip_usage RPC. Returns { used, limit, allowed } or { error }.
 * Used to disable "Snip and Plug" when limit is reached.
 * @returns {Promise<{ used?: number, limit?: number, allowed?: boolean, error?: string }>}
 */
export async function getSnipUsage() {
  const stored = await new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY_URL, STORAGE_KEY_ANON, STORAGE_KEY_TOKEN], resolve);
  });
  const url = stored[STORAGE_KEY_URL];
  const anonKey = stored[STORAGE_KEY_ANON];
  const token = stored[STORAGE_KEY_TOKEN];
  if (!url || !anonKey || !token) {
    return { error: 'not_authenticated', allowed: true };
  }

  const rpcUrl = `${url.replace(/\/$/, '')}/rest/v1/rpc/get_snip_usage`;
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });

  let data = await res.json().catch(() => ({}));
  if (Array.isArray(data) && data[0]) data = data[0];
  if (!res.ok) {
    return { error: data?.message || data?.error || 'get_snip_usage_failed', allowed: true };
  }
  if (data?.error) {
    return { used: 0, limit: 25, allowed: data.allowed !== false };
  }
  return {
    used: typeof data.used === 'number' ? data.used : 0,
    limit: typeof data.limit === 'number' ? data.limit : 25,
    allowed: data.allowed !== false,
  };
}
