import { Button } from './ui/Button';
import { Container } from './ui/Container';
import { Link } from 'react-router-dom';
import { hero, heroDemoSlot } from '../content/placeholders';
import { handleGetChromeExtension } from '../lib/ctaHandlers';
import { useAuth } from '../contexts/AuthContext';
import './Hero.css';

export function Hero() {
  const { user, loading, signInWithGoogle, isSupabaseConfigured } = useAuth();
  const showLoginCta = isSupabaseConfigured && !loading && !user;
  const showDashboardCta = isSupabaseConfigured && !loading && user;

  return (
    <section id="hero" className="hero" aria-labelledby="hero-heading">
      <Container className="hero__container">
        <div className="hero__content">
          <h1 id="hero-heading" className="hero__headline">
            {hero.headline}
          </h1>
          <p className="hero__support">
            {hero.support}
          </p>
          <div className="hero__ctas">
            {/* Primary CTA: replace handleGetChromeExtension with Stripe/auth flow when ready */}
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="hero__cta hero__cta--primary"
              onClick={handleGetChromeExtension}
            >
              {hero.ctaPrimary}
            </Button>
            <Button as="a" href="#demo" variant="secondary" size="lg" className="hero__cta hero__cta--secondary">
              {hero.ctaSecondary}
            </Button>
            {showLoginCta && (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="hero__cta hero__cta--login"
                onClick={() => signInWithGoogle()}
              >
                Log in with Google
              </Button>
            )}
            {/* Dashboard: for logged-in users; manage subscription only through that page. */}
            {showDashboardCta && (
              <Button
                as={Link}
                to="/dashboard"
                variant="primary"
                size="lg"
                className="hero__cta hero__cta--upgrade"
                aria-label="Go to Dashboard"
              >
                Dashboard
              </Button>
            )}
          </div>
        </div>
        <div className="hero__mockup-wrap">
          <div className="hero__mockup" aria-hidden>
            <div className="hero__mockup-chrome">
              <span className="hero__mockup-dots" aria-hidden>
                <span /><span /><span />
              </span>
              <span className="hero__mockup-bar">DocSourced</span>
            </div>
            <div className="hero__mockup-content">
              <img
                src={hero.mockupImageUrl}
                alt={hero.mockupAlt}
                className="hero__mockup-img"
                width={640}
                height={400}
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </Container>

      {/* Placeholder: replace with real video/GIF embed when ready */}
      <div id="hero-demo" className="hero__demo-slot" aria-label="Product demo">
        <Container>
          <h2 className="hero__demo-title">{heroDemoSlot.title}</h2>
          <div className="hero__demo-inner">
            <div className="hero__demo-placeholder">
              <span className="hero__demo-play" aria-hidden>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              <span className="hero__demo-placeholder-label">{heroDemoSlot.placeholderLabel}</span>
              <span className="hero__demo-placeholder-hint">{heroDemoSlot.placeholderHint}</span>
            </div>
          </div>
        </Container>
      </div>
    </section>
  );
}
