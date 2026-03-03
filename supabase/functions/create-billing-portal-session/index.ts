// Create a Stripe Billing Portal session so the user can manage subscription (cancel, update payment, etc.).
// Called by the website when a logged-in Pro user clicks "Manage Subscription".
// Requires the Supabase auth JWT; we resolve the user and load their subscriptions row to get
// stripe_customer_id (set by stripe-webhook from subscription.customer). We create a portal session
// with return_url = SITE_URL so after leaving the portal the user returns to the site.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=denonext'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUBSCRIPTIONS_TABLE = 'subscriptions'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid Authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  const siteUrl = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '')

  if (!stripeSecretKey || !siteUrl) {
    console.error('Missing STRIPE_SECRET_KEY or SITE_URL')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const userId = user.id

  // Load subscription row for this user; stripe_customer_id is set by stripe-webhook when
  // checkout completes or subscription is synced (subscription.customer).
  const { data: sub, error: subError } = await supabase
    .from(SUBSCRIPTIONS_TABLE)
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (subError) {
    console.error('subscriptions select error', subError)
    return new Response(
      JSON.stringify({ error: 'Failed to load subscription' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const stripeCustomerId = sub?.stripe_customer_id?.trim() || null
  if (!stripeCustomerId) {
    return new Response(
      JSON.stringify({
        error: 'No billing customer found. If you just upgraded, try again in a moment.',
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const stripe = new Stripe(stripeSecretKey, {})

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: siteUrl,
    })

    return new Response(
      JSON.stringify({ url: portalSession.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Stripe billing portal session create failed:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Billing portal failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
