// Create a Stripe Checkout Session for "Pro" subscription.
// Called by the website when the user clicks "Upgrade to Pro". The request must include
// the Supabase auth JWT; we resolve the user from it (same identity as public.profiles.id).
// The returned session URL is opened by the frontend (e.g. new tab). After payment,
// Stripe sends webhooks — use the webhook handler to upsert public.subscriptions
// (existing table: id, user_id, status, price_id, cancel_at_period_end, current_period_end, created)
// using metadata.user_id (same as profiles.id). Optionally update public.profiles.tier to 'pro'.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=denonext'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
  const stripeProPriceId = Deno.env.get('STRIPE_PRO_PRICE_ID')
  const envSiteUrl = Deno.env.get('SITE_URL')?.replace(/\/$/, '') || ''

  if (!stripeSecretKey || !stripeProPriceId) {
    console.error('Missing STRIPE_SECRET_KEY or STRIPE_PRO_PRICE_ID')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let body = {}
  try {
    body = await req.json()
  } catch (_) {}
  const origin = typeof body?.site_url === 'string' && body.site_url.trim() ? body.site_url.trim().replace(/\/$/, '') : ''
  const siteUrl = (origin && /^https?:\/\//i.test(origin) ? origin : null) || envSiteUrl
  if (!siteUrl) {
    console.error('Missing SITE_URL env and no site_url in request body')
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

  // user.id is the same as public.profiles.id (created by handle_new_user trigger on signup).
  // Webhook will use metadata.user_id to update public.subscriptions; subscriptions.user_id
  // references profiles(id). See: supabase/migrations or docs for subscriptions schema.
  const userId = user.id

  const stripe = new Stripe(stripeSecretKey, {
    // Omit apiVersion to use the SDK's default (avoids "Invalid Stripe API version" if Stripe deprecates a version).
  })

  // Stripe requires a recurring price for mode: 'subscription'. Verify the configured price is recurring.
  // STRIPE_PRO_PRICE_ID must be a Price ID (price_xxx), not a Product ID (prod_xxx).
  let priceId = stripeProPriceId
  if (stripeProPriceId.startsWith('prod_')) {
    return new Response(
      JSON.stringify({
        error:
          'STRIPE_PRO_PRICE_ID must be a Price ID (starts with price_), not a Product ID (prod_). In Stripe Dashboard open your product, add or select a recurring Price (e.g. $9/month), and copy the Price ID from that row.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (stripeProPriceId.startsWith('price_')) {
    try {
      const price = await stripe.prices.retrieve(stripeProPriceId)
      if (!price.recurring) {
        console.error('STRIPE_PRO_PRICE_ID must be a recurring price (e.g. monthly/yearly). Found type:', price.type)
        return new Response(
          JSON.stringify({
            error:
              'Server misconfiguration: STRIPE_PRO_PRICE_ID must be a recurring price. In Stripe Dashboard, create a Price with type "Recurring" (e.g. monthly) and use its ID.',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } catch (e) {
      console.error('Failed to retrieve price', stripeProPriceId, e)
      return new Response(
        JSON.stringify({ error: 'Invalid STRIPE_PRO_PRICE_ID or Stripe error.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/cancel`,
      client_reference_id: userId,
      subscription_data: {
        metadata: { user_id: userId },
      },
      // Metadata on the session for the webhook: link to profiles.id so the webhook
      // can upsert public.subscriptions (user_id, status, price_id, cancel_at_period_end,
      // current_period_end) and optionally set profiles.tier = 'pro'.
      metadata: {
        user_id: userId,
      },
    })

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Stripe checkout session create failed:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Checkout failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
