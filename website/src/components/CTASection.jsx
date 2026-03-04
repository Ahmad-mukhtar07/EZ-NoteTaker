import { Container } from './ui/Container';
import { Section } from './ui/Section';
import { Button } from './ui/Button';
import { Link } from 'react-router-dom';
import { productTagline } from '../content/placeholders';
import { handleGetChromeExtension, handleUpgradeToProWithUser } from '../lib/ctaHandlers';
import { useAuth } from '../contexts/AuthContext';
import { supabaseClient } from '../config/supabase-config';
import './CTASection.css';

export function CTASection() {
  const { user, loading, tier, isSupabaseConfigured } = useAuth();
  const showUpgradeCta = isSupabaseConfigured && !loading && user;
  const isPro = tier === 'pro';

  return (
    <Section id="cta" className="cta-section">
      <Container className="cta-section__container">
        <div className="cta-section__card">
          <h2 className="cta-section__title">Ready to transform your research?</h2>
          <p className="cta-section__support">
            {productTagline}
          </p>
          <div className="cta-section__actions">
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="cta-section__btn cta-section__btn--primary"
              onClick={handleGetChromeExtension}
            >
              Get the Chrome Extension
            </Button>
            {showUpgradeCta && (
              isPro ? (
                <Button
                  as={Link}
                  to="/dashboard"
                  variant="primary"
                  size="lg"
                  className="cta-section__btn cta-section__btn--upgrade"
                  aria-label="Go to Dashboard"
                >
                  Dashboard
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  className="cta-section__btn cta-section__btn--upgrade"
                  onClick={() => handleUpgradeToProWithUser(supabaseClient)}
                  aria-label="Upgrade to Pro subscription"
                >
                  Upgrade to Pro
                </Button>
              )
            )}
            <a href="#hero-demo" className="cta-section__link">
              See how it works
            </a>
          </div>
        </div>
      </Container>
    </Section>
  );
}
