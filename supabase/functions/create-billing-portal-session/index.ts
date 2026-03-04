// Create a Stripe Billing Portal session so the user can manage subscription (cancel, update payment, etc.).
// Called by the website when a logged-in Pro user clicks "Manage Subscription".
// We resolve the user from the JWT, then find their Stripe customer by:
// 1) subscription metadata (user_id set at checkout) — most reliable
// 2) fallback: Stripe customer list by user email

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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  const envSiteUrl = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '')

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (!stripeSecretKey) {
    console.error('Missing STRIPE_SECRET_KEY')
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

  const userId = user.id
  const stripe = new Stripe(stripeSecretKey, {})
  let customerIdForPortal = null

  // 1) Find customer via subscription metadata (user_id is set at checkout in create-checkout-session).
  try {
    const subs = await stripe.subscriptions.list({ status: 'all', limit: 100 })
    const match = subs.data.find((s) => (s.metadata?.user_id ?? '') === userId)
    const customerId = match?.customer
    if (typeof customerId === 'string') {
      customerIdForPortal = customerId
    } else if (customerId && typeof customerId === 'object' && 'id' in customerId) {
      customerIdForPortal = (customerId as { id: string }).id
    }
  } catch (err) {
    console.error('Stripe subscriptions.list failed', err)
  }

  // 2) Fallback: look up by user email (customer created at checkout may use this email).
  if (!customerIdForPortal && user.email?.trim()) {
    try {
      const customers = await stripe.customers.list({ email: user.email.trim(), limit: 10 })
      const withSubscription = customers.data.filter((c) => c.subscriptions?.data?.some((s) => ['active', 'trialing'].includes(s.status)))
      const customer = withSubscription[0] ?? customers.data[0]
      if (customer?.id) customerIdForPortal = customer.id
    } catch (err) {
      console.error('Stripe customers.list failed', err)
    }
  }

  if (!customerIdForPortal) {
    return new Response(
      JSON.stringify({
        error: 'No billing customer found. If you have an active subscription, the email on your account may not match the one used at checkout. Try again or contact support.',
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerIdForPortal,
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
