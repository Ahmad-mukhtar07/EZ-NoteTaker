// Stripe webhook handler: syncs Stripe subscription state to public.subscriptions and public.profiles.
//
// Events handled:
// - checkout.session.completed: create/update subscription row from session metadata (user_id), set profiles.tier = 'pro'
// - invoice.payment_succeeded: ensure subscription row and profiles.tier = 'pro'
// - customer.subscription.updated: update subscription row; set tier = 'pro' or 'free' by status
// - customer.subscription.deleted: set subscription status canceled, profiles.tier = 'free'
//
// Security: Stripe-Signature is verified with STRIPE_WEBHOOK_SIGNING_SECRET before processing.
// Idempotency: we upsert by user_id (select then update or insert) to avoid duplicate rows.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=denonext'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  // Omit apiVersion to use the SDK's default (avoids "Invalid Stripe API version" if Stripe deprecates a version).
})
const cryptoProvider = Stripe.createSubtleCryptoProvider()

const SUBSCRIPTIONS_TABLE = 'subscriptions'
const PROFILES_TABLE = 'profiles'
const PRO_TIER = 'pro'
const FREE_TIER = 'free'

// Map Stripe subscription status to our subscriptions.status (store as-is for debugging).
function normalizeStatus(stripeStatus: string): string {
  const s = (stripeStatus || '').toLowerCase()
  if (['active', 'trialing'].includes(s)) return 'active'
  if (['canceled', 'cancelled', 'unpaid', 'incomplete_expired'].includes(s)) return 'canceled'
  return s || 'incomplete'
}

// Returns true when the subscription entitles the user to Pro.
function isActiveTier(status: string): boolean {
  return normalizeStatus(status) === 'active'
}

// Returns true when we should set profiles.tier = 'free' (canceled or unpaid; not past_due grace).
function shouldDowngradeToFree(status: string): boolean {
  const n = normalizeStatus(status)
  return n === 'canceled' || n === 'unpaid'
}

// Build subscription row from Stripe subscription object (shared by several events).
function subscriptionPayload(
  userId: string,
  sub: Stripe.Subscription
): { user_id: string; status: string; price_id: string | null; cancel_at_period_end: boolean; current_period_end: string | null; created?: string } {
  const priceId = sub.items?.data?.[0]?.price?.id ?? null
  const currentPeriodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null
  return {
    user_id: userId,
    status: normalizeStatus(sub.status ?? ''),
    price_id: priceId,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    current_period_end: currentPeriodEnd,
  }
}

// Upsert subscriptions by user_id (idempotent: update if row exists, else insert).
async function upsertSubscription(
  supabase: ReturnType<typeof createClient>,
  payload: { user_id: string; status: string; price_id: string | null; cancel_at_period_end: boolean; current_period_end: string | null; created?: string }
): Promise<{ error: Error | null }> {
  const { data: existing } = await supabase
    .from(SUBSCRIPTIONS_TABLE)
    .select('id, created')
    .eq('user_id', payload.user_id)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from(SUBSCRIPTIONS_TABLE)
      .update({
        status: payload.status,
        price_id: payload.price_id,
        cancel_at_period_end: payload.cancel_at_period_end,
        current_period_end: payload.current_period_end,
      })
      .eq('user_id', payload.user_id)
    return { error: error ?? null }
  }

  const { error } = await supabase.from(SUBSCRIPTIONS_TABLE).insert({
    user_id: payload.user_id,
    status: payload.status,
    price_id: payload.price_id,
    cancel_at_period_end: payload.cancel_at_period_end,
    current_period_end: payload.current_period_end,
    created: payload.created ?? new Date().toISOString(),
  })
  return { error: error ?? null }
}

// Set profiles.tier for a user (syncs Pro access with subscription state).
async function setProfileTier(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  tier: 'pro' | 'free'
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from(PROFILES_TABLE)
    .update({ tier })
    .eq('id', userId)
  return { error: error ?? null }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const signature = req.headers.get('Stripe-Signature')
  if (!signature) {
    console.error('Webhook missing Stripe-Signature')
    return new Response('Missing Stripe-Signature', { status: 400 })
  }

  const secret = Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SIGNING_SECRET not set')
    return new Response('Server configuration error', { status: 500 })
  }

  // Signature verification requires the raw body; do not parse JSON first.
  const body = await req.text()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      secret,
      undefined,
      cryptoProvider
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return new Response((err as Error).message, { status: 400 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceRoleKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY not set')
    return new Response('Server configuration error', { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        // First payment completed; create or update subscription and set tier = pro.
        // user_id comes from session metadata (set by create-checkout-session Edge Function).
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.user_id as string | undefined
        if (!userId) {
          console.warn('checkout.session.completed missing metadata.user_id', session.id)
          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        let sub: Stripe.Subscription | null = null
        if (session.subscription) {
          const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
          sub = await stripe.subscriptions.retrieve(subId)
        }
        if (!sub) {
          console.warn('checkout.session.completed missing subscription', session.id)
          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const payload = subscriptionPayload(userId, sub)
        payload.created = new Date().toISOString()
        const { error: upsertErr } = await upsertSubscription(supabase, payload)
        if (upsertErr) {
          console.error('checkout.session.completed upsertSubscription failed', upsertErr)
          return new Response('Subscription update failed', { status: 500 })
        }
        const { error: tierErr } = await setProfileTier(supabase, userId, PRO_TIER)
        if (tierErr) console.error('checkout.session.completed setProfileTier failed', tierErr)
        console.log('checkout.session.completed synced', { userId, subscriptionId: sub.id })
        break
      }

      case 'invoice.payment_succeeded': {
        // Recurring payment succeeded; keep subscription and tier = pro.
        const invoice = event.data.object as Stripe.Invoice
        const subId = invoice.subscription as string | null
        if (!subId) {
          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const sub = await stripe.subscriptions.retrieve(subId)
        const userId = sub.metadata?.user_id as string | undefined
        if (!userId) {
          console.warn('invoice.payment_succeeded subscription missing metadata.user_id', sub.id)
          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const payload = subscriptionPayload(userId, sub)
        const { error: upsertErr } = await upsertSubscription(supabase, payload)
        if (upsertErr) {
          console.error('invoice.payment_succeeded upsertSubscription failed', upsertErr)
          return new Response('Subscription update failed', { status: 500 })
        }
        const { error: tierErr } = await setProfileTier(supabase, userId, PRO_TIER)
        if (tierErr) console.error('invoice.payment_succeeded setProfileTier failed', tierErr)
        console.log('invoice.payment_succeeded synced', { userId })
        break
      }

      case 'customer.subscription.updated': {
        // Subscription changed (renewal, cancel_at_period_end, etc.); update row and tier.
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.user_id as string | undefined
        if (!userId) {
          console.warn('customer.subscription.updated missing metadata.user_id', sub.id)
          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const payload = subscriptionPayload(userId, sub)
        const { error: upsertErr } = await upsertSubscription(supabase, payload)
        if (upsertErr) {
          console.error('customer.subscription.updated upsertSubscription failed', upsertErr)
          return new Response('Subscription update failed', { status: 500 })
        }
        const tier = isActiveTier(sub.status) ? PRO_TIER : shouldDowngradeToFree(sub.status) ? FREE_TIER : undefined
        if (tier) {
          const { error: tierErr } = await setProfileTier(supabase, userId, tier)
          if (tierErr) console.error('customer.subscription.updated setProfileTier failed', tierErr)
        }
        console.log('customer.subscription.updated synced', { userId, status: payload.status })
        break
      }

      case 'customer.subscription.deleted': {
        // Subscription canceled or expired; update status and downgrade to free.
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.user_id as string | undefined
        if (!userId) {
          console.warn('customer.subscription.deleted missing metadata.user_id', sub.id)
          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const payload = subscriptionPayload(userId, sub)
        payload.status = 'canceled'
        const { error: upsertErr } = await upsertSubscription(supabase, payload)
        if (upsertErr) {
          console.error('customer.subscription.deleted upsertSubscription failed', upsertErr)
          return new Response('Subscription update failed', { status: 500 })
        }
        const { error: tierErr } = await setProfileTier(supabase, userId, FREE_TIER)
        if (tierErr) console.error('customer.subscription.deleted setProfileTier failed', tierErr)
        console.log('customer.subscription.deleted synced', { userId })
        break
      }

      default:
        console.log('Unhandled event type', event.type)
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Webhook handler error', event.type, err)
    return new Response('Internal error', { status: 500 })
  }
})
