import { useAuth } from './useAuth.js';

/**
 * Feature gating by profile tier. Use tier from auth (profiles table).
 * @param {string} [requiredTier] - Minimum tier needed (e.g. 'pro', 'premium'). Falsy = no gate.
 * @returns {{ allowed: boolean, tier: string | null }}
 */
export function useFeatureGate(requiredTier) {
  const { tier } = useAuth();
  if (!requiredTier) return { allowed: true, tier };
  const order = ['free', 'pro', 'premium', 'enterprise'];
  const tierIndex = order.indexOf((tier || 'free').toLowerCase());
  const requiredIndex = order.indexOf(requiredTier.toLowerCase());
  const allowed = requiredIndex !== -1 && tierIndex >= requiredIndex;
  return { allowed, tier };
}
