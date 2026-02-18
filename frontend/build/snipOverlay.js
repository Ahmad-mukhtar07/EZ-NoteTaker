/**
 * Snip overlay: transparent selection layer, draw rect, send bounds, crop image on request.
 * Injected via chrome.scripting; communicates with background via chrome.runtime messages.
 */
(function () {
  'use strict';

  var OVERLAY_ID = 'eznote-snip-overlay';

  // If overlay already exists (e.g. user clicked "Snip and Plug" again), remove it and exit.
  var existing = document.getElementById(OVERLAY_ID);
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
    document.body.style.cursor = '';
    document.documentElement.style.cursor = '';
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'SNIP_CANCEL' });
    }
    return;
  }

  let overlay = null;
  let rectEl = null;
  let startX = 0;
  let startY = 0;
  let currentW = 0;
  let currentH = 0;
  let isDrawing = false;

  function removeOverlay() {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = null;
    rectEl = null;
    document.body.style.cursor = '';
    document.documentElement.style.cursor = '';
  }

  function cancel() {
    removeOverlay();
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'SNIP_CANCEL' });
    }
  }

  function createOverlay() {
    if (overlay) return;
    // Set crosshair cursor on document immediately so it shows as soon as overlay is active
    document.body.style.cursor = 'crosshair';
    document.documentElement.style.cursor = 'crosshair';
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,0.15);';
    rectEl = document.createElement('div');
    rectEl.style.cssText =
      'position:fixed;border:2px solid #1a73e8;background:rgba(26,115,232,0.1);pointer-events:none;box-sizing:border-box;';
    overlay.appendChild(rectEl);

    overlay.addEventListener('mousedown', function (e) {
      e.preventDefault();
      isDrawing = true;
      startX = e.clientX;
      startY = e.clientY;
      currentW = 0;
      currentH = 0;
      rectEl.style.left = startX + 'px';
      rectEl.style.top = startY + 'px';
      rectEl.style.width = '0px';
      rectEl.style.height = '0px';
    });

    overlay.addEventListener('mousemove', function (e) {
      if (!isDrawing) return;
      e.preventDefault();
      let x = e.clientX;
      let y = e.clientY;
      let left = Math.min(startX, x);
      let top = Math.min(startY, y);
      currentW = Math.abs(x - startX);
      currentH = Math.abs(y - startY);
      rectEl.style.left = left + 'px';
      rectEl.style.top = top + 'px';
      rectEl.style.width = currentW + 'px';
      rectEl.style.height = currentH + 'px';
    });

    overlay.addEventListener('mouseup', function (e) {
      e.preventDefault();
      if (!isDrawing) return;
      isDrawing = false;
      let left = parseFloat(rectEl.style.left) || 0;
      let top = parseFloat(rectEl.style.top) || 0;
      if (currentW < 5 || currentH < 5) {
        rectEl.style.width = '0px';
        rectEl.style.height = '0px';
        return;
      }
      if (chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SNIP_BOUNDS',
          bounds: { x: left, y: top, width: currentW, height: currentH },
          pageUrl: window.location.href || '',
          pageTitle: document.title || 'Untitled',
        });
      }
      removeOverlay();
    });

    overlay.addEventListener('mouseleave', function () {
      if (isDrawing) {
        isDrawing = false;
        rectEl.style.width = '0px';
        rectEl.style.height = '0px';
      }
    });

    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        cancel();
      }
    });

    document.body.appendChild(overlay);
    overlay.style.cursor = 'crosshair';
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'SNIP_OVERLAY_CREATED' });
    }

    // Force browser to refresh cursor (it often only updates after tab switch or mousemove)
    var forceCursorRefresh = function () {
      var x = window.innerWidth >> 1;
      var y = window.innerHeight >> 1;
      try {
        var ev = new MouseEvent('mousemove', {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        });
        overlay.dispatchEvent(ev);
        document.dispatchEvent(ev);
      } catch (e) {}
      document.body.style.cursor = 'crosshair';
      document.documentElement.style.cursor = 'crosshair';
    };
    requestAnimationFrame(forceCursorRefresh);
    setTimeout(forceCursorRefresh, 0);
    setTimeout(forceCursorRefresh, 50);
  }

  function cropImage(dataUrl, bounds, dpr) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        var scale = dpr || window.devicePixelRatio || 1;
        var sx = Math.max(0, Math.round(bounds.x * scale));
        var sy = Math.max(0, Math.round(bounds.y * scale));
        var sw = Math.max(1, Math.round(bounds.width * scale));
        var sh = Math.max(1, Math.round(bounds.height * scale));
        sx = Math.min(sx, img.width - 1);
        sy = Math.min(sy, img.height - 1);
        sw = Math.min(sw, img.width - sx);
        sh = Math.min(sh, img.height - sy);
        var canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        canvas.toBlob(
          function (blob) {
            if (!blob) {
              reject(new Error('Canvas toBlob failed'));
              return;
            }
            var fr = new FileReader();
            fr.onloadend = function () {
              var base64 = fr.result;
              resolve({
                base64: base64,
                width: sw,
                height: sh,
              });
            };
            fr.onerror = function () {
              reject(new Error('FileReader failed'));
            };
            fr.readAsDataURL(blob);
          },
          'image/png',
          0.92
        );
      };
      img.onerror = function () {
        reject(new Error('Image load failed'));
      };
      img.src = dataUrl;
    });
  }

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (msg.type === 'CROP_IMAGE') {
      cropImage(msg.dataUrl, msg.bounds, msg.devicePixelRatio)
        .then(function (result) {
          sendResponse({ type: 'CROPPED_IMAGE', ...result });
        })
        .catch(function (err) {
          sendResponse({ type: 'SNIP_ERROR', error: err.message });
        });
      return true;
    }
    if (msg.type === 'REMOVE_SNIP_OVERLAY') {
      removeOverlay();
      sendResponse({ ok: true });
      return false;
    }
  });

  createOverlay();
})();
