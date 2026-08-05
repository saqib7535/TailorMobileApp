/* ============================================================
   PaymentModal — receive a partial or full payment against an
   order's remaining balance at any point (not tied to delivery).
   Records a payments row and recomputes remaining_balance.
   Invoked from the order detail screen (orders.js); Admin/Manager/
   Reception only — orders.js hides the entry point for Tailor.
   ============================================================ */

const PaymentModal = (function () {
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function open(order, onDone) {
    const remaining = Number(order.remaining_balance || 0);
    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="order.receivePaymentBtn"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="flex-between"><span class="text-muted">${escapeHtml(order.invoice_no)}</span><b>${escapeHtml(order.customer_name)}</b></div>
        <div class="flex-between mt-8" style="font-weight:800"><span class="text-danger" data-i18n="order.remainingBalance"></span><b class="text-danger">${Format.money(remaining)}</b></div>
      </div>

      <div class="field" id="f-amount">
        <label data-i18n="common.amount"></label>
        <input type="number" min="0.01" max="${remaining}" step="0.01" id="in-pay-amount" value="${remaining}" />
        <div class="error-msg" data-i18n="order.invalidPaymentAmount"></div>
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
      <div class="field">
        <label data-i18n="common.notes"></label>
        <input id="in-pay-note" data-i18n-placeholder="common.optional" />
      </div>
      <button class="btn btn-success btn-block mt-8" id="btn-submit-payment" data-i18n="order.receivePaymentBtn"></button>
    `, { center: true });
    I18n.apply(sheet);

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    sheet.querySelector('#btn-submit-payment').onclick = async () => {
      const amount = parseFloat(sheet.querySelector('#in-pay-amount').value);
      const fAmount = sheet.querySelector('#f-amount');
      const valid = amount > 0 && amount <= remaining + 0.01;
      fAmount.classList.toggle('invalid', !valid);
      if (!valid) return;

      const method = sheet.querySelector('#in-pay-method').value;
      const note = sheet.querySelector('#in-pay-note').value.trim();

      const btn = sheet.querySelector('#btn-submit-payment');
      btn.disabled = true;
      try {
        await OrderService.recordPayment(order.id, amount, method, note);
        Toast.success(I18n.t('order.paymentRecorded'));
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
