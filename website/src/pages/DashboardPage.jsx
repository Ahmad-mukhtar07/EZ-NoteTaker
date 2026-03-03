/**
 * User dashboard: account and subscription state from server-verified get-user-subscription.
 *
 * Access: any logged-in user. If not authenticated, redirects to home.
 * Data: We do not query profiles/subscriptions directly from the client. Instead we call the
 * get-user-subscription Edge Function, which validates the JWT and returns tier, full_name,
 * email, status, current_period_end, cancel_at_period_end. This prevents client-side tampering
 * and ensures subscription state is authoritative. Loading and error states are shown until
 * the response is received.
 */
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { handleUpgradeToProWithUser, handleManageSubscription } from '../lib/ctaHandlers';
import { fetchUserSubscription } from '../lib/getSubscription';
import { supabaseClient } from '../config/supabase-config';
import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import './DashboardPage.css';

function formatDate(isoString) {
  if (!isoString) return '—';
  try {
    return new Date(isoString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoString;
  }
}

function formatStatus(status) {
  if (!status) return '—';
  const s = String(status).toLowerCase();
  if (s === 'active') return 'Active';
  if (s === 'canceled' || s === 'cancelled') return 'Canceled';
  if (s === 'past_due') return 'Past due';
  if (s === 'trialing') return 'Trialing';
  return status;
}

// Scheduled downgrade: Pro access is determined by tier from the server (profiles.tier). The
// stripe-webhook only sets tier to 'free' when the subscription is fully canceled (e.g.
// customer.subscription.deleted after current_period_end). So we do not restrict Pro features
// when cancel_at_period_end is true—the user keeps Pro until current_period_end. This avoids
// prematurely locking them out; the banner below is informational only.
function isScheduledDowngrade(d) {
  return Boolean(d?.cancel_at_period_end && d?.current_period_end);
}

export function DashboardPage() {
  const { user, loading: authLoading, tier, refetchSubscription } = useAuth();
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(null);

  // Redirect if not logged in.
  if (!authLoading && !user) {
    return <Navigate to="/" replace />;
  }

  // Fetch subscription from get-user-subscription Edge Function (server-verified) instead of
  // querying profiles/subscriptions from the client. Ensures tier and status cannot be tampered with.
  useEffect(() => {
    if (!user?.id || !supabaseClient) {
      setDataLoading(false);
      return;
    }

    let cancelled = false;
    setDataLoading(true);
    setDataError(null);

    fetchUserSubscription(supabaseClient)
      .then((result) => {
        if (cancelled) return;
        if (result.error) {
          setDataError(result.error);
          setSubscriptionData(null);
          return;
        }
        setSubscriptionData(result.data ?? null);
        setDataError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setDataError(err?.message ?? 'Failed to load dashboard');
          setSubscriptionData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });

    return () => { cancelled = true; };
  }, [user?.id]);

  if (authLoading || !user) {
    return null;
  }

  const d = subscriptionData;
  const displayTier = (d?.tier || tier || 'free').toLowerCase() === 'pro' ? 'Pro' : 'Free';
  const hasPro = displayTier === 'Pro';
  // Show subscription block when we have any subscription data or user is Pro (e.g. canceled but still Pro until period end).
  const hasSubscription = d && (hasPro || d.status != null || d.current_period_end != null || d.cancel_at_period_end === true);
  // Show cancellation warning when subscription is set to cancel at period end. After they
  // reverse cancellation in the Billing Portal, returning to the site triggers a fresh
  // fetch (dashboard mount or refetchSubscription), so the banner disappears without reload.
  const showCancellationWarning = isScheduledDowngrade(d);

  return (
    <div className="dashboard-page">
      <Section>
        <Container>
          <div className="dashboard-page__header">
            <h1 className="dashboard-page__title">Dashboard</h1>
            <Link to="/" className="dashboard-page__back">
              ← Back to home
            </Link>
          </div>

          {dataLoading && (
            <div className="dashboard-page__loading" aria-busy="true" aria-live="polite">
              <div className="dashboard-page__spinner" aria-hidden />
              <p className="dashboard-page__loading-text">Loading your account…</p>
            </div>
          )}

          {dataError && !dataLoading && (
            <div className="dashboard-page__error" role="alert">
              <p className="dashboard-page__error-text">{dataError}</p>
              <p className="dashboard-page__error-hint">You can still use the plan and actions below from the navbar.</p>
            </div>
          )}

          {/* Cancellation scheduled: show exact period end and that Pro access continues until then.
              Revalidation after returning from Billing Portal (e.g. after reversing cancellation)
              updates subscription data so this banner hides when cancel_at_period_end becomes false. */}
          {!dataLoading && showCancellationWarning && (
            <div className="dashboard-page__cancellation-banner" role="status" aria-live="polite">
              <p className="dashboard-page__cancellation-title">Subscription set to cancel</p>
              <p className="dashboard-page__cancellation-text">
                {d.current_period_end ? (
                  <>
                    You will keep Pro access until <strong>{formatDate(d.current_period_end)}</strong>.
                    After that date, your plan will downgrade to Free.
                  </>
                ) : (
                  'Your subscription will end at the close of the current billing period. Pro access will continue until then.'
                )}
                {' '}
                To keep Pro, open Manage Subscription and reverse the cancellation before the period ends.
              </p>
            </div>
          )}

          {!dataLoading && (
            <div className="dashboard-page__card">
              {/* Account: full_name and email from server-verified get-user-subscription response. */}
              <section className="dashboard-page__block" aria-labelledby="dashboard-profile-heading">
                <h2 id="dashboard-profile-heading" className="dashboard-page__block-title">Account</h2>
                <dl className="dashboard-page__dl">
                  <div className="dashboard-page__row">
                    <dt className="dashboard-page__dt">Name</dt>
                    <dd className="dashboard-page__dd">
                      {d?.full_name?.trim() || user?.user_metadata?.full_name || '—'}
                    </dd>
                  </div>
                  <div className="dashboard-page__row">
                    <dt className="dashboard-page__dt">Email</dt>
                    <dd className="dashboard-page__dd">{d?.email ?? user?.email ?? '—'}</dd>
                  </div>
                </dl>
              </section>

              {/* Plan & subscription: server-verified tier, status, period end, cancel_at_period_end. */}
              <section className="dashboard-page__block" aria-labelledby="dashboard-plan-heading">
                <h2 id="dashboard-plan-heading" className="dashboard-page__block-title">Plan &amp; subscription</h2>
                <dl className="dashboard-page__dl">
                  <div className="dashboard-page__row">
                    <dt className="dashboard-page__dt">Current tier</dt>
                    <dd className="dashboard-page__dd">
                      <span className={`dashboard-page__badge dashboard-page__badge--${displayTier.toLowerCase()}`}>
                        {displayTier}
                      </span>
                    </dd>
                  </div>
                  {hasSubscription ? (
                    <>
                      <div className="dashboard-page__row">
                        <dt className="dashboard-page__dt">Status</dt>
                        <dd className="dashboard-page__dd">{formatStatus(d.status)}</dd>
                      </div>
                      <div className="dashboard-page__row">
                        <dt className="dashboard-page__dt">Current period ends</dt>
                        <dd className="dashboard-page__dd">{formatDate(d.current_period_end)}</dd>
                      </div>
                      <div className="dashboard-page__row">
                        <dt className="dashboard-page__dt">Cancel at period end</dt>
                        <dd className="dashboard-page__dd">
                          {d.cancel_at_period_end ? 'Yes' : 'No'}
                        </dd>
                      </div>
                    </>
                  ) : (
                    <div className="dashboard-page__empty">
                      <p className="dashboard-page__empty-text">No subscription yet.</p>
                      <p className="dashboard-page__empty-hint">
                        Your tier is shown above. Upgrade to Pro to get a subscription and manage it here.
                      </p>
                    </div>
                  )}
                </dl>
              </section>

              {/* Pro access: tier from server stays 'pro' until the subscription is fully canceled
                  (webhook sets tier = 'free' on customer.subscription.deleted). So we do not
                  restrict access when cancel_at_period_end is true; the cancellation banner is
                  informational. Manage Subscription lets them reverse cancellation; revalidation
                  on next load/mount reflects the updated status. */}
              <div className="dashboard-page__actions">
                {hasPro ? (
                  <button
                    type="button"
                    className="dashboard-page__btn navbar__btn navbar__btn--primary"
                    onClick={() => handleManageSubscription(supabaseClient, refetchSubscription)}
                  >
                    Manage Subscription
                  </button>
                ) : (
                  <button
                    type="button"
                    className="dashboard-page__btn navbar__btn navbar__btn--primary"
                    onClick={() => handleUpgradeToProWithUser(supabaseClient)}
                  >
                    Upgrade to Pro
                  </button>
                )}
              </div>
            </div>
          )}
        </Container>
      </Section>
    </div>
  );
}
