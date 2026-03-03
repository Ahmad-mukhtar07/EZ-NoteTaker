-- Add stripe_customer_id so create-billing-portal-session can redirect to Stripe Billing Portal.
-- Populated by stripe-webhook from subscription.customer.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;
