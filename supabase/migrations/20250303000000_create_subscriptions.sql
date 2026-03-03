-- Existing tables (do not create; for reference only):
--
-- public.profiles: id, tier, full_name, email
-- public.subscriptions: id (FK to profiles), user_id (uuid), status (text), price_id (text),
--   cancel_at_period_end (bool), current_period_end (timestamptz), created (timestamptz)
--
-- The create-checkout-session Edge Function passes user_id (profiles.id) in session metadata.
-- The Stripe webhook handler should upsert public.subscriptions with: user_id, status, price_id,
-- cancel_at_period_end, current_period_end (and set created/updated as needed), and optionally
-- update public.profiles.tier to 'pro' when subscription is active.

-- Optional: add indexes if they do not already exist (safe to run).
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
-- Required for webhook upsert by user_id (avoids duplicate-key 500 when multiple events fire together).
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_id_unique ON public.subscriptions(user_id);
