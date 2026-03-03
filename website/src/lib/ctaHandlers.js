/**
 * Placeholder CTA handlers for Stripe Checkout and Supabase auth integration.
 *
 * INTEGRATION NOTES:
 * - Stripe: Replace redirects below with your Stripe Checkout session URL.
 *   Create the session server-side (or via Supabase Edge Function), then redirect
 *   to session.url. Use success_url and cancel_url for post-payment redirects.
 *   When creating the Checkout Session, pass the authenticated user's Supabase
 *   user.id (e.g. from useAuth().user.id) as client_reference_id or in metadata
 *   so you can link the subscription to their profile in Supabase (e.g. via
 *   Stripe webhooks updating a profiles or subscriptions table).
 * - Supabase: Session is now available site-wide via useAuth(); same project
 *   as the extension so extension and website share the same user identity.
 * - Chrome Web Store: Replace GET_CHROME_EXTENSION_URL with your extension's
 *   store listing URL when published.
 */

// TODO: Replace with your Chrome Web Store listing URL when published
const GET_CHROME_EXTENSION_URL = 'https://chrome.google.com/webstore';

// TODO: Replace with Stripe Checkout session URL (create via API or Stripe Dashboard).
// For dynamic pricing, create the session server-side and redirect to session.url
const STRIPE_CHECKOUT_UPGRADE_URL = '#';

// TODO: Success/cancel redirects after Stripe Checkout
const STRIPE_SUCCESS_URL = '/?checkout=success';
const STRIPE_CANCEL_URL = '/?checkout=cancelled';

/**
 * "Get the Chrome Extension" / "Get Free" — send user to Chrome Web Store or
 * optionally trigger Supabase sign-in first (e.g. to create account before install).
 * When ready: check auth with Supabase; if not logged in, optionally open login
 * or redirect to extension install.
 */
export function handleGetChromeExtension() {
  // TODO: Optional — check Supabase session; if no user, show login modal or redirect to auth
  // const session = await supabase.auth.getSession();
  window.location.href = GET_CHROME_EXTENSION_URL;
}

/**
 * "Upgrade to Pro" — redirect to Stripe Checkout for subscription.
 * Used when no user context (e.g. static link). Prefer handleUpgradeToProWithUser(userId).
 */
export function handleUpgradeToPro() {
  // TODO: Create Stripe Checkout Session and redirect to session.url
  window.location.href = STRIPE_CHECKOUT_UPGRADE_URL;
}

/**
 * Calls the create-checkout-session Edge Function with the current Supabase session.
 * The Edge Function resolves the user from the JWT (same as profiles.id) and creates
 * a Stripe Checkout session; success_url and cancel_url point to /success and /cancel.
 * Returns { url } or { error }.
 */
export async function createCheckoutSession(supabaseClient) {
  if (!supabaseClient) return { error: 'Supabase not configured' };
  // Refresh session so we send a non-expired token (avoids 401 Invalid JWT from the gateway).
  const { data: { session: refreshed } } = await supabaseClient.auth.refreshSession();
  const session = refreshed ?? (await supabaseClient.auth.getSession()).data?.session;
  if (!session?.access_token) return { error: 'Not logged in' };
  const { data, error } = await supabaseClient.functions.invoke('create-checkout-session', {
    method: 'POST',
    body: {},
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  if (!data?.url) return { error: 'No checkout URL returned' };
  return { url: data.url };
}

/**
 * "Upgrade to Pro" for logged-in users. Invokes the create-checkout-session Edge Function
 * (which uses the session JWT to get user id from profiles) and opens the returned
 * Stripe Checkout URL in a new tab. Pass supabaseClient from config.
 */
export async function handleUpgradeToProWithUser(supabaseClient) {
  const result = await createCheckoutSession(supabaseClient);
  if (result.error) {
    if (typeof window !== 'undefined' && window.alert) {
      window.alert(result.error);
    }
    return;
  }
  if (result.url && typeof window !== 'undefined') {
    window.open(result.url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Optional: run on page load to restore session or handle post-checkout.
 * e.g. ?checkout=success → show thank-you, sync subscription to Supabase/profile.
 */
export function handleCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('checkout') === 'success') {
    // TODO: Optionally fetch updated subscription from your backend and update UI
  }
  if (params.get('checkout') === 'cancelled') {
    // TODO: Optionally show "checkout cancelled" message
  }
}
