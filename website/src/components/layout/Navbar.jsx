import { useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useScrollSpy } from '../../hooks/useScrollSpy';
import { useAuth } from '../../contexts/AuthContext';
import './Navbar.css';

const SECTION_LINKS = [
  { id: 'hero', label: 'Hero' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'features', label: 'Features' },
  { id: 'demo', label: 'Demo' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'faq', label: 'FAQ' },
  { id: 'footer', label: 'Footer' },
];

/** Display name: user metadata full_name, or email local part, or email */
function getUserDisplayName(user) {
  const name = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
  if (name && typeof name === 'string') return name.trim();
  const email = user?.email ?? '';
  const at = email.indexOf('@');
  if (at > 0) return email.slice(0, at);
  return email || 'Account';
}

export function Navbar() {
  const activeId = useScrollSpy(SECTION_LINKS.map((l) => l.id));
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { user, loading, tier, subscriptionLoading, subscriptionError, logout, signInWithGoogle, isSupabaseConfigured } = useAuth();

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const handleLinkClick = () => {
    closeMenu();
  };

  const handleLogin = () => {
    closeMenu();
    signInWithGoogle();
  };

  const handleLogout = () => {
    closeMenu();
    logout();
  };

  return (
    <header className="navbar" role="banner">
      <div className="navbar__container">
        <Link to="/" className="navbar__brand" aria-label="DocSourced home">
          <img src="/DocSourced-logo.png" alt="DocSourced" className="navbar__logo" width={140} height={32} />
        </Link>

        <button
          type="button"
          className={`navbar__toggle ${menuOpen ? 'navbar__toggle--open' : ''}`}
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-controls="navbar-menu"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        >
          <span className="navbar__toggle-bar" />
          <span className="navbar__toggle-bar" />
          <span className="navbar__toggle-bar" />
        </button>

        <nav
          id="navbar-menu"
          className={`navbar__nav ${menuOpen ? 'navbar__nav--open' : ''}`}
          aria-label="Main"
        >
          {SECTION_LINKS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className={`navbar__link ${activeId === id ? 'navbar__link--active' : ''}`}
              onClick={handleLinkClick}
              aria-current={activeId === id ? 'true' : undefined}
            >
              {label}
            </a>
          ))}
          {!loading && isSupabaseConfigured && (
            <div className="navbar__auth">
              {user ? (
                <>
                  {/* Plan label from profiles.tier; syncs with Supabase after login and when returning from Stripe. */}
                  {subscriptionLoading ? (
                    <span className="navbar__plan navbar__plan--loading" aria-hidden>…</span>
                  ) : (
                    <span className="navbar__plan" title={subscriptionError || undefined}>
                      {subscriptionError ? 'Free Plan' : tier === 'pro' ? 'Pro Plan' : 'Free Plan'}
                    </span>
                  )}
                  <Link
                    to="/dashboard"
                    className={`navbar__btn navbar__btn--primary ${location.pathname === '/dashboard' ? 'navbar__link--active' : ''}`}
                    onClick={handleLinkClick}
                  >
                    Dashboard
                  </Link>
                  <span className="navbar__user" title={user.email}>
                    {getUserDisplayName(user)}
                  </span>
                  <button
                    type="button"
                    className="navbar__btn navbar__btn--secondary"
                    onClick={handleLogout}
                  >
                    Log out
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="navbar__btn navbar__btn--primary"
                  onClick={handleLogin}
                >
                  Log in
                </button>
              )}
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
