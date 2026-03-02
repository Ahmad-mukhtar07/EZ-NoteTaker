import { Link, NavLink } from 'react-router-dom';
import './Navbar.css';

export function Navbar() {
  return (
    <header className="navbar" role="banner">
      <div className="navbar__container">
        <Link to="/" className="navbar__brand" aria-label="DocSourced home">
          <img src="/DocSourced-logo.png" alt="DocSourced" className="navbar__logo" width="140" height="32" />
        </Link>
        <nav className="navbar__nav" aria-label="Main">
          <NavLink to="/" end className="navbar__link" aria-current="page">Home</NavLink>
          {/* Placeholder for future: Features, Pricing, Login, CTA */}
        </nav>
      </div>
    </header>
  );
}
