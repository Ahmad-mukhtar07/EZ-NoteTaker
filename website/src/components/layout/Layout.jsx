import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { handleCheckoutReturn } from '../../lib/ctaHandlers';
import './Layout.css';

export function Layout() {
  // Optional: handle Stripe success/cancel return — see lib/ctaHandlers.js handleCheckoutReturn
  useEffect(() => {
    handleCheckoutReturn();
  }, []);

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Navbar />
      <main id="main-content" className="layout__main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
