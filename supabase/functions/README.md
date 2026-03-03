# Edge Functions

## create-checkout-session

Creates a Stripe Checkout Session for the Pro subscription. Called by the website when a logged-in user clicks "Upgrade to Pro".

- **Auth:** Request must include `Authorization: Bearer <supabase_jwt>`. The function resolves the user from the JWT; that user's `id` matches `public.profiles.id`.
- **401 Invalid JWT:** The website refreshes the session before calling so the token is not expired. If you still get 401, ensure `VITE_SUPABASE_URL` in the website points to the same project where this function is deployed. If your project uses ES256 JWT signing and the gateway rejects the token, deploy with `--no-verify-jwt` and rely on the function's internal `getUser()` check: `supabase functions deploy create-checkout-session --no-verify-jwt`.
- **Secrets (set in Supabase Dashboard → Edge Functions → Secrets):**
  - `STRIPE_SECRET_KEY` – Stripe secret key
  - `STRIPE_PRO_PRICE_ID` – Stripe Price ID for the Pro plan (recurring)
  - `SITE_URL` – Website origin for redirects (e.g. `https://yourdomain.com` or `http://localhost:5173`)

**Response:** `{ url: string }` – Redirect the user to this URL (e.g. open in new tab).

See also **create-billing-portal-session** for Pro users to manage subscription (cancel, update payment) via Stripe Billing Portal.

**Webhook:** Use a separate Edge Function (e.g. `stripe-webhook`) to handle Stripe events. On `checkout.session.completed` or `customer.subscription.updated` / `created` / `deleted`, upsert `public.subscriptions` with:

- `user_id` – from session or subscription `metadata.user_id` (same as `profiles.id`)
- `status` – e.g. `active`, `canceled`, `past_due`
- `price_id` – Stripe price ID
- `cancel_at_period_end` – boolean
- `current_period_end` – timestamptz
- `stripe_customer_id` – Stripe customer ID (from subscription.customer) for Billing Portal redirects
- `created` – set on insert as needed

Optionally update `public.profiles.tier` to `'pro'` when status is active and back to `'free'` when the subscription ends.

**Existing schema:** `profiles` (id, tier, full_name, email); `subscriptions` (id FK to profiles, user_id, status, price_id, cancel_at_period_end, current_period_end, stripe_customer_id, created).

---

## create-billing-portal-session

Creates a Stripe Billing Portal session so a Pro user can manage their subscription (cancel, update payment method, view invoices) on Stripe's hosted portal.

- **Auth:** Request must include `Authorization: Bearer <supabase_jwt>`. The function resolves the user from the JWT and loads their `public.subscriptions` row to get `stripe_customer_id` (set by stripe-webhook from `subscription.customer`).
- **Secrets:**
  - `STRIPE_SECRET_KEY` – Stripe secret key (same as create-checkout-session)
  - `SITE_URL` – Where to redirect after the user leaves the portal (e.g. `https://yourdomain.com` or `http://localhost:5173`)

**Response:** `{ url: string }` – Redirect the user to this URL (same tab or new tab). After they finish in the portal, Stripe sends them back to `SITE_URL`; the website should refetch `profiles.tier` so the Navbar updates (e.g. "Pro Plan" → "Free Plan" if they canceled).

**Errors:** If the user has no `subscriptions` row or `stripe_customer_id` is missing (e.g. they just upgraded and the webhook hasn’t run yet), the function returns 400 with a message like "No billing customer found. If you just upgraded, try again in a moment."

---

## stripe-webhook

Secure Stripe webhook handler that syncs subscription state to `public.subscriptions` and `public.profiles`.

- **Security:** Verifies `Stripe-Signature` using **STRIPE_WEBHOOK_SIGNING_SECRET** or **STRIPE_WEBHOOK_SECRET** (raw body required; do not parse JSON before verification).
- **Secrets:**
  - **STRIPE_SECRET_KEY** – Stripe secret key (same as create-checkout-session)
  - **STRIPE_WEBHOOK_SIGNING_SECRET** or **STRIPE_WEBHOOK_SECRET** – Webhook signing secret from Stripe Dashboard → Developers → Webhooks → endpoint → Signing secret
  - **SUPABASE_SERVICE_ROLE_KEY** – So the function can write to `subscriptions` and `profiles` (bypass RLS)

**Events:**

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Get `user_id` from session metadata; retrieve subscription; upsert `subscriptions` (user_id, status, price_id, current_period_end, cancel_at_period_end, **stripe_customer_id**, created); set `profiles.tier = 'pro'` |
| `invoice.payment_succeeded` | Resolve subscription → metadata.user_id; upsert `subscriptions`; set `profiles.tier = 'pro'` |
| `customer.subscription.updated` | Upsert `subscriptions` from subscription object; if status active set `profiles.tier = 'pro'`, if canceled/unpaid set `profiles.tier = 'free'` |
| `customer.subscription.deleted` | Update `subscriptions.status = 'canceled'`; set `profiles.tier = 'free'` |

**Idempotency:** Upsert by `user_id` (select by user_id, then update or insert) so duplicate events do not create duplicate rows.

**Stripe Dashboard:** Add endpoint URL `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`, select the four events above, and copy the signing secret into `STRIPE_WEBHOOK_SIGNING_SECRET`.
