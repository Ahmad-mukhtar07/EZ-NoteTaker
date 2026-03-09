import { Container } from './ui/Container';
import { Section } from './ui/Section';
import { PricingCard } from './ui/PricingCard';
import { handleGetChromeExtension, handleUpgradeToProWithUser } from '../lib/ctaHandlers';
import { useAuth } from '../contexts/AuthContext';
import { supabaseClient } from '../config/supabase-config';
import './Pricing.css';

export function Pricing() {
  const { user, loading, tier, signInWithGoogle, isSupabaseConfigured } = useAuth();
  const canUpgrade = isSupabaseConfigured && !loading && user;
  const isPro = tier === 'pro';

  return (
    <Section id="pricing" className="pricing-section">
      <Container>
        <h2 className="pricing-section__title">Simple, transparent pricing</h2>
        <p className="pricing-section__support">
          Start free with one doc and source links, or unlock Pro for Format References and multi-document support.
        </p>
        <div className="pricing-section__grid">
          <div className="pricing-section__card-wrap">
            <div className="pricing-section__badge-row" aria-hidden />
            <PricingCard
              name="Free"
              price="$0"
              period=""
              description="Capture and plug text or image snips into one connected Google Doc. Every insert gets a clean, hyperlinked source line."
              features={[
                '25 snips per month',
                '1 connected document',
                'Insert with source links',
                'Sources Used in This Document panel',
                'Undo last insert',
                'Standard image quality',
              ]}
              ctaLabel="Get Free"
              onCtaClick={handleGetChromeExtension}
              highlighted={false}
              className="pricing-section__card"
            />
          </div>
          <div className="pricing-section__card-wrap pricing-section__card-wrap--pro">
            <div className="pricing-section__badge-row">
              <span className="pricing-section__badge">Pro</span>
            </div>
            {/* Pro CTA: if Pro → Dashboard; if logged in → Upgrade to Pro (Stripe); if not → Log in to upgrade */}
            <PricingCard
              name="Pro"
              price="$3.50"
              period="/month"
              description="Multi-document support, Format References (superscript citations + Sources section), Snip History, and higher usage limits for publication-ready docs."
              features={[
                'Unlimited text and image snips',
                'Multi-document support',
                'Insert with source links',
                'Format References (superscript + Sources section)',
                'Snip History & reinsert',
                'Undo last insert',
                'Full-quality image snips',
              ]}
              ctaLabel={isPro ? 'Dashboard' : canUpgrade ? 'Upgrade to Pro' : 'Log in to upgrade'}
              ctaHref={isPro ? '/dashboard' : undefined}
              onCtaClick={isPro ? undefined : (canUpgrade ? () => handleUpgradeToProWithUser(supabaseClient) : () => signInWithGoogle())}
              highlighted={true}
              className="pricing-section__card"
            />
          </div>
        </div>
      </Container>
    </Section>
  );
}
