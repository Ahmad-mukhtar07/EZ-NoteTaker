import { Link } from 'react-router-dom';
import './Footer.css';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer" role="contentinfo">
      <div className="footer__container">
        <div className="footer__top">
          <Link to="/" className="footer__brand">DocSourced</Link>
          <nav className="footer__nav" aria-label="Footer">
            <Link to="/" className="footer__link">Home</Link>
            {/* Placeholder for Privacy, Terms, Contact */}
          </nav>
        </div>
        <div className="footer__bottom">
          <p className="footer__copy">
            © {currentYear} DocSourced. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
