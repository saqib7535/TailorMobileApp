/* ============================================================
   Modal — bottom-sheet style modal + a promise-based confirm dialog.
   Modal.open(innerHtml, {center:false}) -> returns the sheet element
   Modal.close()
   Modal.confirm({title, message, confirmText, danger}) -> Promise<boolean>
   ============================================================ */

const Modal = (function () {
  let overlay = null;

  function ensureOverlay() {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = '<div class="modal-sheet"></div>';
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function open(html, opts) {
    opts = opts || {};
    const ov = ensureOverlay();
    ov.classList.toggle('center', !!opts.center);
    const sheet = ov.querySelector('.modal-sheet');
    sheet.innerHTML = html;
    requestAnimationFrame(() => ov.classList.add('open'));
    if (I18n && I18n.apply) I18n.apply(sheet);
    return sheet;
  }

  function close() {
    if (overlay) overlay.classList.remove('open');
  }

  function confirm(opts) {
    opts = opts || {};
    const title = opts.title || I18n.t('common.confirm');
    const message = opts.message || '';
    const confirmText = opts.confirmText || I18n.t('common.confirm');
    const cancelText = opts.cancelText || I18n.t('common.cancel');
    return new Promise((resolve) => {
      const sheet = open(`
        <div class="modal-header"><h3>${title}</h3></div>
        <p style="margin-bottom:20px;color:var(--color-text-muted)">${message}</p>
        <div class="flex gap-8">
          <button class="btn btn-outline btn-block" data-act="cancel">${cancelText}</button>
          <button class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'} btn-block" data-act="ok">${confirmText}</button>
        </div>
      `, { center: true });
      sheet.querySelector('[data-act="cancel"]').onclick = () => { close(); resolve(false); };
      sheet.querySelector('[data-act="ok"]').onclick = () => { close(); resolve(true); };
    });
  }

  return { open, close, confirm };
})();
