import { Link } from 'react-router-dom';
import { productName, productTagline } from '../../content/placeholders';
import './Footer.css';

const socialLinks = [
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/ahmad-mukhtar-bhatti/', icon: 'linkedin' },
  { label: 'Medium', href: 'https://medium.com/@ahmadmukhtar2001', icon: 'medium' },
];

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer id="footer" className="footer" role="contentinfo">
      <div className="footer__container">
        <div className="footer__top">
          <div className="footer__brand-block">
            <Link to="/" className="footer__brand" aria-label={`${productName} home`}>
              <img
                src="/DocSourced-logo.png"
                alt=""
                className="footer__logo"
                width={120}
                height={28}
                aria-hidden
              />
              <span className="footer__brand-name">{productName}</span>
            </Link>
            <p className="footer__tagline">
              {productTagline}
            </p>
          </div>
          <div className="footer__right">
            <nav className="footer__nav" aria-label="Footer">
              <Link to="/" className="footer__link">Home</Link>
              <Link to="/privacy" className="footer__link">Privacy Policy</Link>
              <a href="mailto:ahmadmukhtar2001@gmail.com" className="footer__link">Contact</a>
            </nav>
            <div className="footer__social">
              {socialLinks.map(({ label, href, icon }) => (
                <a
                  key={icon}
                  href={href}
                  className="footer__social-link"
                  aria-label={label}
                  title={label}
                >
                  <span className={`footer__social-icon footer__social-icon--${icon}`} aria-hidden>
                    {icon === 'linkedin' && (
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                      </svg>
                    )}
                    {icon === 'medium' && (
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M13.54 12a6.8 6.8 0 0 1-6.77 6.82A6.8 6.8 0 0 1 0 12a6.8 6.8 0 0 1 6.77-6.82A6.8 6.8 0 0 1 13.54 12zm7.42 0c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z" />
                      </svg>
                    )}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="footer__bottom">
          <p className="footer__copy">
            © {currentYear} {productName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
