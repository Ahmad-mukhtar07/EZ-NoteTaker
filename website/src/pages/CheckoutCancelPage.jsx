import { Link } from 'react-router-dom';
import './CheckoutCancelPage.css';

/**
 * Shown when user cancels Stripe Checkout (cancel_url).
 */
export function CheckoutCancelPage() {
  return (
    <div className="checkout-result">
      <div className="checkout-result__card">
        <h1 className="checkout-result__title">Checkout canceled</h1>
        <p className="checkout-result__message">
          You can upgrade to Pro anytime from the Pricing section.
        </p>
        <Link to="/#pricing" className="checkout-result__link">
          Back to pricing
        </Link>
      </div>
    </div>
  );
}
