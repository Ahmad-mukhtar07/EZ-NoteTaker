import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * When the user lands on /success or /cancel (return from Stripe Checkout or Billing Portal),
 * refetch profile tier so the Navbar shows the correct plan as soon as they navigate back.
 * This component is mounted for all routes so the effect runs on Stripe return pages.
 */
export function SubscriptionRefetchOnReturn() {
  const location = useLocation();
  const { user, refetchSubscription } = useAuth();

  useEffect(() => {
    if (!user?.id || typeof refetchSubscription !== 'function') return;
    if (location.pathname === '/success' || location.pathname === '/cancel') {
      refetchSubscription();
    }
  }, [location.pathname, user?.id, refetchSubscription]);

  return null;
}
