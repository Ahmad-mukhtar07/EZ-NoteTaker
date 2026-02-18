/**
 * Chrome notifications for the extension. No dependencies on other background modules.
 */

// 16x16 PNG so Chrome's required iconUrl is satisfied (no separate icon file needed)
const NOTIFICATION_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKklEQVQ4T2NkYGD4z0ABYBzVMGoB1AIMDAwM/xkZGP4zMjL+Z2RkZPwPAG2cBAdMLsCFAAAAAElFTkSuQmCC';

/**
 * Show a Chrome notification.
 * @param {string} title
 * @param {string} message
 */
export function showNotification(title, message) {
  if (typeof chrome === 'undefined' || !chrome.notifications?.create) return;
  chrome.notifications.create({
    type: 'basic',
    iconUrl: NOTIFICATION_ICON,
    title: title,
    message: message,
  });
}
