import './UpgradeModal.css';

/** @type {'snip_limit' | 'doc_limit' | 'snip_history'} */
const REASONS = ['snip_limit', 'doc_limit', 'snip_history'];

const UPGRADE_URL = 'https://doc-sourced.vercel.app/';

/**
 * Open the upgrade page in a new tab. Uses chrome.tabs in extension context, else window.open.
 */
function openUpgradePage() {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.create({ url: UPGRADE_URL });
  } else {
    window.open(UPGRADE_URL, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Upgrade prompt when a Pro feature is blocked. Backdrop + modal with reason-specific message.
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {'snip_limit' | 'doc_limit' | 'snip_history'} [props.reason] - Which limit was hit (default: snip_limit)
 * @param {number} [props.limit] - Snip limit number when reason is snip_limit (default: 25)
 */
export function UpgradeModal({ open, onClose, reason = 'snip_limit', limit = 25 }) {
  if (!open) return null;
  const r = REASONS.includes(reason) ? reason : 'snip_limit';

  const content = {
    snip_limit: {
      title: 'Monthly limit reached',
      text: `You've used all ${limit} snips for this month on the free plan. Upgrade to Pro for unlimited snips and to keep adding highlights and screenshots to your doc.`,
    },
    doc_limit: {
      title: 'Connect more documents with Pro',
      text: 'Free accounts can connect one document. Upgrade to Pro to connect multiple documents and switch between them anytime.',
    },
    snip_history: {
      title: 'Snip History is a Pro feature',
      text: 'Upgrade to Pro to view and manage your past snips in one place.',
    },
  }[r];

  const handleUpgrade = () => {
    openUpgradePage();
    onClose();
  };

  return (
    <div className="upgrade-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="upgrade-modal-title">
      <div className="upgrade-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="upgrade-modal-title" className="upgrade-modal__title">{content.title}</h2>
        <p className="upgrade-modal__text">{content.text}</p>
        <div className="upgrade-modal__actions">
          <button type="button" className="upgrade-modal__btn upgrade-modal__btn--secondary" onClick={onClose}>
            Maybe later
          </button>
          <button type="button" className="upgrade-modal__btn upgrade-modal__btn--primary" onClick={handleUpgrade}>
            Upgrade to Pro
          </button>
        </div>
      </div>
    </div>
  );
}
