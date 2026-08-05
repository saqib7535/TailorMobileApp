/* ============================================================
   DeliveryModal — optional final-payment + signature capture shown
   when handing garments back to the customer. Confirming marks the
   order Delivered and appends the final order_status_history row.
   Invoked from the order detail screen (orders.js); Admin/Manager/
   Reception only. The signature pad is a plain <canvas> driven by
   pointer events, exported as a PNG data URL — mirrors the sibling
   dry-cleaning project's implementation exactly.
   ============================================================ */

const DeliveryModal = (function () {
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function setupSignaturePad(canvas) {
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-text') || '#0f172a';
    let drawing = false;
    let hasDrawn = false;

    function pos(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    canvas.addEventListener('pointerdown', (e) => {
      drawing = true; hasDrawn = true;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((evt) => {
      canvas.addEventListener(evt, () => { drawing = false; });
    });

    return {
      clear: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); hasDrawn = false; },
      isEmpty: () => !hasDrawn,
      dataUrl: () => canvas.toDataURL('image/png')
    };
  }

  function open(order, onDone) {
    const remaining = Number(order.remaining_balance || 0);
    const currentUser = AuthService.currentUser();
    const readyForDelivery = order.status === 'Ready';

    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="delivery.title"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      ${!readyForDelivery ? `<p class="text-danger" style="font-size:12.5px;margin-bottom:10px" data-i18n="delivery.earlyWarning"></p>` : ''}
      <div class="card" style="margin-bottom:14px">
        <div class="flex-between"><span class="text-muted">${escapeHtml(order.invoice_no)}</span><b>${escapeHtml(order.customer_name)}</b></div>
        <div class="flex-between mt-8"><span class="text-muted" data-i18n="order.grandTotal"></span><b>${Format.money(order.grand_total)}</b></div>
        <div class="flex-between mt-8" style="font-weight:800"><span class="text-danger" data-i18n="order.remainingBalance"></span><b class="text-danger">${Format.money(remaining)}</b></div>
      </div>

      ${remaining > 0 ? `
      <div class="field-row">
        <div class="field">
          <label data-i18n="delivery.receivePayment"></label>
          <input type="number" min="0" max="${remaining}" step="0.01" id="in-pay-amount" value="${remaining}" />
        </div>
        <div class="field">
          <label data-i18n="order.paymentMethod"></label>
          <select id="in-pay-method">
            <option value="Cash" data-i18n="payment.Cash"></option>
            <option value="Card" data-i18n="payment.Card"></option>
            <option value="Bank Transfer" data-i18n="payment.Bank Transfer"></option>
            <option value="Other" data-i18n="payment.Other"></option>
          </select>
        </div>
      </div>` : ''}
      <div class="field">
        <label data-i18n="delivery.deliveredBy"></label>
        <input id="in-staff-name" value="${currentUser ? escapeHtml(currentUser.username) : ''}" />
      </div>
      <div class="field">
        <label data-i18n="delivery.signature"></label>
        <div class="sig-pad-wrap">
          <canvas id="sig-canvas"></canvas>
          <div class="sig-pad-placeholder" id="sig-placeholder" data-i18n="delivery.signHere"></div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm mt-8" id="btn-clear-sig" data-i18n="delivery.clearSignature"></button>
      </div>
      <button class="btn btn-primary btn-block mt-8" id="btn-confirm-delivery-submit" data-i18n="delivery.confirm"></button>
    `, { center: true });
    I18n.apply(sheet);

    const canvas = sheet.querySelector('#sig-canvas');
    const placeholder = sheet.querySelector('#sig-placeholder');
    const pad = setupSignaturePad(canvas);
    canvas.addEventListener('pointerdown', () => { placeholder.style.display = 'none'; });

    sheet.querySelector('#btn-clear-sig').onclick = () => { pad.clear(); placeholder.style.display = 'flex'; };
    sheet.querySelector('#m-close').onclick = () => Modal.close();

    sheet.querySelector('#btn-confirm-delivery-submit').onclick = async () => {
      const payAmountEl = sheet.querySelector('#in-pay-amount');
      const payMethodEl = sheet.querySelector('#in-pay-method');
      const amount = payAmountEl ? (parseFloat(payAmountEl.value) || 0) : 0;
      const method = payMethodEl ? payMethodEl.value : 'Cash';
      const deliveredBy = sheet.querySelector('#in-staff-name').value.trim();

      const btn = sheet.querySelector('#btn-confirm-delivery-submit');
      btn.disabled = true;
      try {
        await OrderService.recordDelivery(order.id, {
          finalPaymentAmount: amount,
          method,
          deliveredBy,
          signatureData: pad.isEmpty() ? null : pad.dataUrl()
        });
        Toast.success(I18n.t('delivery.delivered'));
        Modal.close();
        if (onDone) onDone();
      } catch (err) {
        console.error(err);
        Toast.error(I18n.t('common.error'));
        btn.disabled = false;
      }
    };
  }

  return { open };
})();
