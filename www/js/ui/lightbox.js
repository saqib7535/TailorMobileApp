/* ============================================================
   Lightbox — full-screen image viewer. Tap the backdrop or the
   close button to dismiss, double-tap/double-click the image to
   toggle 2x zoom. Used for item/customer photo thumbnails.
   Lightbox.open(src)
   ============================================================ */

const Lightbox = (function () {
  let overlay = null;

  function ensure() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'lightbox-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:300', 'background:rgba(0,0,0,.92)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'opacity:0', 'pointer-events:none', 'transition:opacity .18s ease'
    ].join(';');
    overlay.innerHTML = `
      <button id="lightbox-close" style="position:absolute;top:calc(env(safe-area-inset-top,0px) + 14px);right:14px;width:40px;height:40px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:20px;display:flex;align-items:center;justify-content:center;z-index:2">✕</button>
      <img id="lightbox-img" src="" style="max-width:92vw;max-height:88vh;object-fit:contain;transition:transform .2s ease;cursor:zoom-in;touch-action:pan-x pan-y;" />
    `;
    document.body.appendChild(overlay);

    const img = overlay.querySelector('#lightbox-img');
    let zoomed = false;

    function close() {
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      zoomed = false;
      img.style.transform = 'scale(1)';
      img.style.cursor = 'zoom-in';
    }

    function toggleZoom() {
      zoomed = !zoomed;
      img.style.transform = zoomed ? 'scale(2)' : 'scale(1)';
      img.style.cursor = zoomed ? 'zoom-out' : 'zoom-in';
    }

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#lightbox-close').onclick = close;
    img.addEventListener('dblclick', toggleZoom);

    let lastTap = 0;
    img.addEventListener('touchend', () => {
      const now = Date.now();
      if (now - lastTap < 300) toggleZoom();
      lastTap = now;
    });

    overlay._close = close;
    return overlay;
  }

  function open(src) {
    if (!src) return;
    const ov = ensure();
    ov.querySelector('#lightbox-img').src = src;
    ov.querySelector('#lightbox-img').style.transform = 'scale(1)';
    ov.style.pointerEvents = 'auto';
    requestAnimationFrame(() => { ov.style.opacity = '1'; });
  }

  function close() {
    if (overlay && overlay._close) overlay._close();
  }

  return { open, close };
})();
