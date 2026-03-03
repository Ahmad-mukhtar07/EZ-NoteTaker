-- Ensure subscriptions has columns required for dashboard (status, current_period_end, cancel_at_period_end).
-- The stripe-webhook upserts these; get-user-subscription reads them for the dashboard "Current period ends" etc.
-- Safe to run: ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS price_id text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean DEFAULT false;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS current_period_end timestamptz;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS created timestamptz DEFAULT now();
