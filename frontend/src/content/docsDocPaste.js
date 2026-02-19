/**
 * Content script for docs.google.com: on message, trigger a paste at the current cursor.
 * Used when the user has the connected doc open in a tab and uses "Plug it in" for insert-at-cursor.
 */
(function () {
  'use strict';

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (msg.type !== 'TRIGGER_PASTE') return;
    try {
      var target = document.activeElement;
      if (!target || target === document.body) {
        var editable = document.querySelector('[contenteditable="true"]') || document.querySelector('.kix-appview-editor') || document.body;
        if (editable && editable.focus) editable.focus();
        target = document.activeElement || editable;
      }
      var ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: null });
      (target || document.body).dispatchEvent(ev);
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return true;
  });
})();
