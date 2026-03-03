import { Container } from './ui/Container';
import { Section } from './ui/Section';
import { PricingCard } from './ui/PricingCard';
import { handleGetChromeExtension, handleUpgradeToProWithUser } from '../lib/ctaHandlers';
import { useAuth } from '../contexts/AuthContext';
import { supabaseClient } from '../config/supabase-config';
import './Pricing.css';

export function Pricing() {
  const { user, loading, signInWithGoogle, isSupabaseConfigured } = useAuth();
  const canUpgrade = isSupabaseConfigured && !loading && user;

  return (
    <Section id="pricing" className="pricing-section">
      <Container>
        <h2 className="pricing-section__title">Simple, transparent pricing</h2>
        <p className="pricing-section__support">
          Start free or unlock Pro features to supercharge your research.
        </p>
        <div className="pricing-section__grid">
          <div className="pricing-section__card-wrap">
            <div className="pricing-section__badge-row" aria-hidden />
            {/* Get Free: replace onCtaClick with auth/Chrome Store flow — see lib/ctaHandlers.js */}
            <PricingCard
              name="Free"
              price="$0"
              period=""
              description="Everything you need to capture and plug snippets into one Google Doc with source links."
              features={[
                'Unlimited text snips per month',
                'Unlimited image snips per month',
                '1 connected document',
                'Insert with source links',
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
            {/* Pro CTA: when logged in → Upgrade to Pro (Stripe placeholder in handleUpgradeToProWithUser); when not → Log in to upgrade */}
            <PricingCard
              name="Pro"
              price="$9"
              period="/month"
              description="Unlimited snips, multiple docs, and one-click reference formatting for publication-ready documents."
              features={[
                'Unlimited text and image snips',
                'Multi-document support',
                'Insert with source links',
                'Format References (superscript + Sources section)',
                'Snip History & reinsert',
                'Undo last insert',
                'Full-quality image snips',
              ]}
              ctaLabel={canUpgrade ? 'Upgrade to Pro' : 'Log in to upgrade'}
              onCtaClick={canUpgrade ? () => handleUpgradeToProWithUser(supabaseClient) : () => signInWithGoogle()}
              highlighted={true}
              className="pricing-section__card"
            />
          </div>
        </div>
      </Container>
    </Section>
  );
}
