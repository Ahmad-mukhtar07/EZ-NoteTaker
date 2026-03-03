import { Link } from 'react-router-dom';
import './CheckoutSuccessPage.css';

/**
 * Shown after Stripe Checkout success (success_url).
 * Optional: use session_id query param to verify session or show receipt.
 */
export function CheckoutSuccessPage() {
  return (
    <div className="checkout-result">
      <div className="checkout-result__card">
        <h1 className="checkout-result__title">Thank you!</h1>
        <p className="checkout-result__message">
          Your Pro subscription is active. You can now use Pro features in the extension.
        </p>
        <Link to="/" className="checkout-result__link">
          Return home
        </Link>
      </div>
    </div>
  );
}
