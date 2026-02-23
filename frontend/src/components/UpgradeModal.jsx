import './UpgradeModal.css';

/**
 * Shown when the user hits the free-tier snip limit. Backdrop + modal with message and close.
 */
export function UpgradeModal({ open, onClose, limit = 25 }) {
  if (!open) return null;

  return (
    <div className="upgrade-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="upgrade-modal-title">
      <div className="upgrade-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="upgrade-modal-title" className="upgrade-modal__title">Monthly limit reached</h2>
        <p className="upgrade-modal__text">
          You've used all {limit} snips for this month on the free plan. Upgrade to continue adding highlights and screenshots to your doc.
        </p>
        <div className="upgrade-modal__actions">
          <button type="button" className="upgrade-modal__btn upgrade-modal__btn--primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
