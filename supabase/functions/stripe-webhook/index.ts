// Stripe webhook handler: syncs Stripe subscription state to public.subscriptions and public.profiles.
//
// Signature: verified using STRIPE_WEBHOOK_SIGNING_SECRET or STRIPE_WEBHOOK_SECRET (raw body required).
//
// Events:
// - checkout.session.completed: Extract metadata.user_id, subscription (id), customer. Upsert subscriptions
//   (user_id FK, status, price_id, cancel_at_period_end, current_period_end, created) and set profiles.tier = 'pro'.
// - customer.subscription.updated: Update subscriptions row by user_id; sync status, price_id, cancel_at_period_end,
//   current_period_end. Set profiles.tier = 'pro' or 'free' by status.
// - customer.subscription.deleted: Set subscriptions.status = 'canceled' and profiles.tier = 'free'.
// - invoice.payment_succeeded: Upsert subscription (keeps status active and current_period_end in sync with Stripe).
//
// Idempotency: upsert by user_id (select then update or insert). Clear error handling and logging.

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

// Support both common env var names for the webhook signing secret.
function getWebhookSecret(): string | undefined {
  return Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET') ?? Deno.env.get('STRIPE_WEBHOOK_SECRET')
}

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
// id is used by create-billing-portal-session to open Stripe's hosted billing portal.
function subscriptionPayload(
  userId: string,
  sub: Stripe.Subscription
): { user_id: string; status: string; price_id: string | null; cancel_at_period_end: boolean; current_period_end: string | null; id: string | null; created?: string } {
  const priceId = sub.items?.data?.[0]?.price?.id ?? null
  const currentPeriodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null
  return {
    user_id: userId,
    status: normalizeStatus(sub.status ?? ''),
    price_id: priceId,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    current_period_end: currentPeriodEnd,
    id: customerId,
  }
}

// Upsert subscriptions by user_id in a single DB call to avoid race conditions (e.g. checkout.session.completed and invoice.payment_succeeded firing together).
// Requires a UNIQUE constraint on user_id (see migration). subscriptions.id is FK to profiles(id); we set id = user_id.
// id is stored for create-billing-portal-session (Stripe Billing Portal redirect).
// We only set current_period_end when the payload has a value, so we never overwrite an existing date with null.
async function upsertSubscription(
  supabase: ReturnType<typeof createClient>,
  payload: { user_id: string; status: string; price_id: string | null; cancel_at_period_end: boolean; current_period_end: string | null; id?: string | null; created?: string }
): Promise<{ error: { message: string; details?: string; hint?: string } | null }> {
  const row: Record<string, unknown> = {
    id: payload.user_id,
    user_id: payload.user_id,
    status: payload.status,
    price_id: payload.price_id,
    cancel_at_period_end: payload.cancel_at_period_end,
    id: payload.id ?? null,
    created: payload.created ?? new Date().toISOString(),
  }
  if (payload.current_period_end != null && payload.current_period_end !== '') {
    row.current_period_end = payload.current_period_end
  }
  const { error } = await supabase
    .from(SUBSCRIPTIONS_TABLE)
    .upsert(row, { onConflict: 'user_id' })
  if (error) {
    console.error('upsertSubscription error', { message: error.message, details: error.details, hint: error.hint })
    return { error: { message: error.message, details: error.details, hint: error.hint } }
  }
  return { error: null }
}

// Set profiles.tier for a user (syncs Pro access with subscription state).
async function setProfileTier(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  tier: 'pro' | 'free'
): Promise<{ error: { message: string; details?: string } | null }> {
  const { error } = await supabase
    .from(PROFILES_TABLE)
    .update({ tier })
    .eq('id', userId)
  if (error) {
    console.error('setProfileTier error', { userId, tier, message: error.message, details: error.details })
    return { error: { message: error.message, details: error.details } }
  }
  return { error: null }
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

  const secret = getWebhookSecret()
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SIGNING_SECRET or STRIPE_WEBHOOK_SECRET not set')
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
    console.error('Webhook signature verification failed', { error: (err as Error).message })
    return new Response((err as Error).message, { status: 400 })
  }

  const eventId = event?.id ?? 'unknown'
  const eventType = event?.type ?? 'unknown'
  console.log('Webhook received', { eventId, type: eventType })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')
  if (!serviceRoleKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY (or SERVICE_ROLE_KEY) not set')
    return new Response('Server configuration error', { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        // Extract metadata.user_id (our FK to profiles), session.subscription (id), and session.customer.
        // Retrieve full subscription object to get status, price_id, cancel_at_period_end, current_period_end.
        // Upsert subscriptions by user_id; set profiles.tier = 'pro'.
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.user_id as string | undefined
        const _customerId = session.customer // available if needed (string or Stripe.Customer)
        if (!userId) {
          console.warn('checkout.session.completed missing metadata.user_id', { eventId, sessionId: session.id })
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
          console.warn('checkout.session.completed missing subscription', { eventId, sessionId: session.id })
          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const payload = subscriptionPayload(userId, sub)
        payload.created = new Date().toISOString()
        const { error: upsertErr } = await upsertSubscription(supabase, payload)
        if (upsertErr) {
          console.error('checkout.session.completed upsertSubscription failed', { eventId, userId, error: upsertErr })
          return new Response(JSON.stringify({ error: 'Subscription update failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const { error: tierErr } = await setProfileTier(supabase, userId, PRO_TIER)
        if (tierErr) {
          console.error('checkout.session.completed setProfileTier failed', { eventId, userId, error: tierErr })
        }
        console.log('checkout.session.completed synced', { eventId, userId, subscriptionId: sub.id })
        break
      }

      case 'invoice.payment_succeeded': {
        // Recurring payment succeeded. Retrieve subscription (has updated current_period_end from Stripe).
        // Upsert subscriptions so status stays active and current_period_end is extended; set profiles.tier = 'pro'.
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
          console.warn('invoice.payment_succeeded subscription missing metadata.user_id', { eventId, subId })
          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const payload = subscriptionPayload(userId, sub)
        const { error: upsertErr } = await upsertSubscription(supabase, payload)
        if (upsertErr) {
          console.error('invoice.payment_succeeded upsertSubscription failed', { eventId, userId, error: upsertErr })
          return new Response(JSON.stringify({ error: 'Subscription update failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const { error: tierErr } = await setProfileTier(supabase, userId, PRO_TIER)
        if (tierErr) {
          console.error('invoice.payment_succeeded setProfileTier failed', { eventId, userId, error: tierErr })
        }
        console.log('invoice.payment_succeeded synced', { eventId, userId })
        break
      }

      case 'customer.subscription.updated': {
        // Update existing subscriptions row by user_id (from subscription.metadata.user_id).
        // Synchronize status, price_id, cancel_at_period_end, current_period_end. Set profiles.tier by status.
        // Retrieve full subscription from API so we always get current_period_end (event object can sometimes omit it).
        const subFromEvent = event.data.object as Stripe.Subscription
        const userId = subFromEvent.metadata?.user_id as string | undefined
        if (!userId) {
          console.warn('customer.subscription.updated missing metadata.user_id', { eventId, subId: subFromEvent.id })
          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const sub = await stripe.subscriptions.retrieve(subFromEvent.id)
        const payload = subscriptionPayload(userId, sub)
        const { error: upsertErr } = await upsertSubscription(supabase, payload)
        if (upsertErr) {
          console.error('customer.subscription.updated upsertSubscription failed', { eventId, userId, error: upsertErr })
          return new Response(JSON.stringify({ error: 'Subscription update failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const tier = isActiveTier(sub.status) ? PRO_TIER : shouldDowngradeToFree(sub.status) ? FREE_TIER : undefined
        if (tier) {
          const { error: tierErr } = await setProfileTier(supabase, userId, tier)
          if (tierErr) {
            console.error('customer.subscription.updated setProfileTier failed', { eventId, userId, error: tierErr })
          }
        }
        console.log('customer.subscription.updated synced', { eventId, userId, status: payload.status })
        break
      }

      case 'customer.subscription.deleted': {
        // Set subscriptions.status = 'canceled' and profiles.tier = 'free'.
        // Retrieve full subscription so we persist current_period_end for dashboard display.
        const subFromEvent = event.data.object as Stripe.Subscription
        const userId = subFromEvent.metadata?.user_id as string | undefined
        if (!userId) {
          console.warn('customer.subscription.deleted missing metadata.user_id', { eventId, subId: subFromEvent.id })
          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        let sub: Stripe.Subscription
        try {
          sub = await stripe.subscriptions.retrieve(subFromEvent.id)
        } catch {
          sub = subFromEvent
        }
        const payload = subscriptionPayload(userId, sub)
        payload.status = 'canceled'
        const { error: upsertErr } = await upsertSubscription(supabase, payload)
        if (upsertErr) {
          console.error('customer.subscription.deleted upsertSubscription failed', { eventId, userId, error: upsertErr })
          return new Response(JSON.stringify({ error: 'Subscription update failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const { error: tierErr } = await setProfileTier(supabase, userId, FREE_TIER)
        if (tierErr) {
          console.error('customer.subscription.deleted setProfileTier failed', { eventId, userId, error: tierErr })
        }
        console.log('customer.subscription.deleted synced', { eventId, userId })
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
    console.error('Webhook handler error', { eventId, eventType, error: (err as Error).message })
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
