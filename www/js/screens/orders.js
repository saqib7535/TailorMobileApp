/* ============================================================
   Orders screen — list (with status filter chips) + detail view
   with the status pipeline stepper (Order Placed -> ... -> Ready
   -> Delivered/Cancelled), payment history, and the delivery flow.

   Role gating (inline, in addition to the route-level gate in
   app.js): Admin/Manager get every action. Reception can create
   orders, record payments and delivery, and move status forward,
   but cannot cancel an order. Tailor can only move status forward
   (no create, no payments, no delivery, no cancel) — kept simple
   per the phase brief by leaving totals visible to everyone and
   just hiding the mutating buttons Tailor shouldn't have.

   Delivery timing: recordDelivery() is technically allowed from any
   non-terminal status (a shop may need to hand an order back early),
   but the UI nudges towards reaching "Ready" first — the button
   reads "Mark Delivered" and is a primary action once Ready, and
   reads "Deliver Early" with a confirm-and-warn step at any earlier
   status.
   ============================================================ */

const OrdersScreen = (function () {
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function canCreate() { return AuthService.hasRole('admin', 'manager', 'reception'); }
  function canRecordPayment() { return AuthService.hasRole('admin', 'manager', 'reception'); }
  function canRecordDelivery() { return AuthService.hasRole('admin', 'manager', 'reception'); }
  function canCancel() { return AuthService.hasRole('admin', 'manager'); }
  function canUpdateStatus() { return AuthService.hasRole('admin', 'manager', 'reception', 'tailor'); }
  // Delivered orders are a closed transaction — never editable/deletable
  // regardless of role (also enforced in OrderService as the real backstop).
  function canEditOrDelete() { return AuthService.hasRole('admin', 'manager', 'reception'); }

  function rowHtml(o) {
    const remaining = Number(o.remaining_balance || 0);
    const isOpen = o.status !== 'Delivered' && o.status !== 'Cancelled';
    return `
      <div class="list-row" data-order="${o.id}">
        <div class="avatar">${Format.initials(o.customer_name)}</div>
        <div class="main">
          <div class="title">${escapeHtml(o.invoice_no)} ${o.urgent ? `<span class="badge badge-urgent">${I18n.t('order.urgent')}</span>` : ''}</div>
          <div class="subtitle">${escapeHtml(o.customer_name)} &middot; ${Format.shortDate(o.order_date)}</div>
        </div>
        <div class="end">
          <div class="amount">${Format.money(o.grand_total)}</div>
          <span class="${Format.statusBadgeClass(o.status)}">${I18n.t('status.' + o.status)}</span>
          ${remaining > 0.001 && o.status !== 'Cancelled' ? `<div class="text-danger" style="font-size:11px;font-weight:700;margin-top:2px">${Format.money(remaining)} ${I18n.t('order.due')}</div>` : ''}
        </div>
        ${isOpen && canEditOrDelete() ? `
        <div class="row-actions" style="display:flex;gap:2px;flex-shrink:0">
          <button class="icon-btn sm" data-row-edit="${o.id}" title="${I18n.t('common.edit')}">${Icons.svg('edit', 15)}</button>
          <button class="icon-btn sm" data-row-delete="${o.id}" title="${I18n.t('common.delete')}">${Icons.svg('trash', 15)}</button>
        </div>` : ''}
      </div>
    `;
  }

  function wireRows(container) {
    container.querySelectorAll('[data-order]').forEach((el) => {
      el.onclick = () => Router.navigate('/orders/' + el.getAttribute('data-order'));
    });
    container.querySelectorAll('[data-row-edit]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        Router.navigate('/orders/' + btn.getAttribute('data-row-edit') + '/edit');
      };
    });
    container.querySelectorAll('[data-row-delete]').forEach((btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-row-delete');
        const ok = await Modal.confirm({ message: I18n.t('order.deleteConfirm'), danger: true });
        if (!ok) return;
        try {
          await OrderService.deleteOrder(parseInt(id, 10));
          Toast.success(I18n.t('common.deleted'));
          const activeTab = document.querySelector('#status-tabs .tab-chip.active');
          loadList(activeTab ? activeTab.getAttribute('data-status') : '');
        } catch (err) {
          console.error(err);
          Toast.error(I18n.t('common.error'));
        }
      };
    });
  }

  // ---------------- List ----------------

  async function renderList(app) {
    const query = Router.getQuery();
    const initialStatus = query.get('status') || '';

    app.innerHTML = `
      <header class="app-header">
        <h1 data-i18n="order.listTitle"></h1>
        <button class="icon-btn" id="btn-search-orders">${Icons.svg('search', 22)}</button>
        ${canCreate() ? `<button class="icon-btn" id="btn-new-order">${Icons.svg('plus', 24)}</button>` : ''}
      </header>
      <div class="tabs" id="status-tabs">
        <div class="tab-chip ${!initialStatus ? 'active' : ''}" data-status="">${I18n.t('common.all')}</div>
        ${OrderService.ALL_STATUSES.map((s) => `<div class="tab-chip ${s === initialStatus ? 'active' : ''}" data-status="${s}">${I18n.t('status.' + s)}</div>`).join('')}
      </div>
      <div id="orders-list"></div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-search-orders').onclick = () => Router.navigate('/orders/search');
    if (canCreate()) app.querySelector('#btn-new-order').onclick = () => Router.navigate('/orders/new');

    app.querySelectorAll('#status-tabs .tab-chip').forEach((el) => {
      el.onclick = () => {
        app.querySelectorAll('#status-tabs .tab-chip').forEach((c) => c.classList.remove('active'));
        el.classList.add('active');
        loadList(el.getAttribute('data-status'));
      };
    });

    await loadList(initialStatus);
  }

  async function loadList(status) {
    const listEl = document.getElementById('orders-list');
    if (!listEl) return;
    const rows = await OrderService.search(status ? { status } : {});
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="ei">${Icons.svg('orders', 40)}</div><p data-i18n="order.noOrders"></p></div>`;
      I18n.apply(listEl);
      return;
    }
    listEl.innerHTML = rows.map(rowHtml).join('');
    wireRows(listEl);
  }

  // ---------------- Status stepper ----------------

  function stepperHtml(order) {
    if (order.status === 'Cancelled') {
      return `
        <div class="card" style="margin-bottom:14px;border-color:var(--status-cancelled);background:var(--status-cancelled-bg)">
          <div class="flex-between">
            <b style="color:var(--status-cancelled)">${I18n.t('status.Cancelled')}</b>
            ${Icons.svg('alert', 18)}
          </div>
        </div>
      `;
    }
    const idx = OrderService.STATUS_FLOW.indexOf(order.status);
    return `
      <div class="card" style="margin-bottom:14px;padding:0 4px">
        <div class="status-stepper">
          ${OrderService.STATUS_FLOW.map((s, i) => `
            <div class="status-step ${i < idx ? 'done' : ''} ${i === idx ? 'current' : ''}">
              <div class="status-step-dot"></div>
              <div class="status-step-label">${I18n.t('status.' + s)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ---------------- Detail ----------------

  async function renderDetail(app, params) {
    const order = await OrderService.getOrder(parseInt(params.id, 10));
    if (!order) {
      app.innerHTML = `<div class="empty-state"><div class="ei">🔍</div><p data-i18n="order.noOrders"></p></div>`;
      I18n.apply(app);
      return;
    }

    const readyForDelivery = order.status === 'Ready';
    const isOpenOrder = order.status !== 'Delivered' && order.status !== 'Cancelled';
    const nextStatuses = canUpdateStatus() && isOpenOrder ? OrderService.nextStatusOptions(order.status) : [];

    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn back-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <div>
          <h1>${escapeHtml(order.invoice_no)}</h1>
          <div class="subtitle">${Format.shortDate(order.order_date)}${order.urgent ? ' · ⚡' : ''}</div>
        </div>
        <span class="${Format.statusBadgeClass(order.status)}">${I18n.t('status.' + order.status)}</span>
        ${canEditOrDelete() && isOpenOrder ? `<button class="icon-btn" id="btn-edit-order" title="${I18n.t('common.edit')}">${Icons.svg('edit', 20)}</button>` : ''}
      </header>

      <div class="page page-pad" style="padding-top:14px;padding-bottom:24px">
        <div class="card" style="margin-bottom:14px">
          <div class="flex-between">
            <div>
              <div style="font-weight:700">${escapeHtml(order.customer_name)}</div>
              <div class="text-muted" style="font-size:12.5px">${escapeHtml(order.customer_phone || '')}</div>
            </div>
            <div class="flex gap-8">
              ${order.customer_phone ? `<a class="btn btn-outline btn-sm btn-icon" href="tel:${escapeHtml(order.customer_phone)}">${Icons.svg('phone', 16)}</a>` : ''}
              ${(order.customer_whatsapp || order.customer_phone) ? `<a class="btn btn-outline btn-sm btn-icon" target="_blank" rel="noopener" href="https://wa.me/${Format.toWhatsappNumber(order.customer_whatsapp || order.customer_phone)}">${Icons.svg('whatsapp', 16)}</a>` : ''}
            </div>
          </div>
          <div class="flex-between mt-8" style="font-size:12.5px">
            <span class="text-muted" data-i18n="order.deliveryDate"></span>
            <b>${order.delivery_date ? Format.shortDate(order.delivery_date) : '—'}</b>
          </div>
        </div>

        ${stepperHtml(order)}

        <div class="flex gap-8" style="margin-bottom:14px">
          <button class="btn btn-outline btn-block" id="btn-print-invoice">${Icons.svg('printer', 16)} <span data-i18n="order.customerCopy"></span></button>
          <button class="btn btn-outline btn-block" id="btn-print-tailor">${Icons.svg('scissors', 16)} <span data-i18n="order.tailorCopy"></span></button>
        </div>

        ${order.status === 'Ready' && (order.customer_whatsapp || order.customer_phone) ? `
        <button class="btn btn-block" id="btn-whatsapp-ready" style="margin-bottom:14px;background:#25D366;color:#fff">${Icons.svg('whatsapp', 18)} <span data-i18n="order.sendReadyNotification"></span></button>` : ''}

        ${canRecordDelivery() && isOpenOrder ? `
        <button class="btn ${readyForDelivery ? 'btn-accent' : 'btn-outline'} btn-block" id="btn-mark-delivered" style="margin-bottom:14px">
          ${Icons.svg('truck', 18)} <span>${readyForDelivery ? I18n.t('delivery.confirm') : I18n.t('order.deliverEarly')}</span>
        </button>` : ''}

        ${order.status === 'Delivered' ? `
        <div class="card" style="margin-bottom:14px">
          <div class="flex-between"><span class="text-muted" data-i18n="order.deliveredOn"></span><b>${Format.dateTime(order.delivered_at)}</b></div>
          ${order.delivered_by ? `<div class="flex-between mt-8"><span class="text-muted" data-i18n="delivery.deliveredBy"></span><b>${escapeHtml(order.delivered_by)}</b></div>` : ''}
          ${order.signature_data ? `<div class="mt-8"><img src="${order.signature_data}" style="max-width:100%;border:1px solid var(--color-border);border-radius:8px" /></div>` : ''}
        </div>` : ''}

        <div class="card" style="margin-bottom:14px">
          <div class="card-title" data-i18n="order.items"></div>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th data-i18n="order.garmentLabel"></th><th data-i18n="order.quantity"></th><th data-i18n="order.rate"></th><th data-i18n="order.subtotal"></th><th></th></tr></thead>
              <tbody>
                ${order.items.map((it) => `
                  <tr>
                    <td>${escapeHtml(it.garment_label || it.category_name)}${it.for_customer_name && it.for_customer_name !== order.customer_name ? `<div class="text-muted" style="font-size:11px">👤 ${escapeHtml(it.for_customer_name)}</div>` : ''}${it.measurement_label ? `<div class="text-muted" style="font-size:11px">${escapeHtml(it.category_name)} &middot; ${escapeHtml(it.measurement_label)}</div>` : `<div class="text-muted" style="font-size:11px">${escapeHtml(it.category_name)}${!it.measurement_id ? ' · ' + I18n.t('order.noProfile') : ''}</div>`}${it.fabric_type_name || (it.designLabelsArr && it.designLabelsArr.length) ? `<div class="text-muted" style="font-size:11px">${[it.fabric_type_name, (it.designLabelsArr || []).join(', ')].filter(Boolean).join(' · ')}</div>` : ''}</td>
                    <td>${it.quantity}</td>
                    <td>${Format.money(it.rate)}</td>
                    <td>${Format.money(it.subtotal)}</td>
                    <td>${it.photo_path ? `<img class="item-photo-thumb" data-photo="${it.photo_path}" src="${it.photo_path}" style="width:28px;height:28px;object-fit:cover;border-radius:6px;cursor:zoom-in" />` : ''}</td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
          </div>
        </div>

        <div class="card" style="margin-bottom:14px">
          <div class="flex-between"><span class="text-muted" data-i18n="order.subtotal"></span><b>${Format.money(order.subtotal)}</b></div>
          <div class="flex-between mt-8"><span class="text-muted" data-i18n="order.discount"></span><b>-${Format.money(order.discount)}</b></div>
          <div class="flex-between mt-8"><span class="text-muted" data-i18n="order.extraCharges"></span><b>${Format.money(order.extra_charges)}</b></div>
          <div class="flex-between mt-8"><span class="text-muted" data-i18n="order.deliveryCharges"></span><b>${Format.money(order.delivery_charges)}</b></div>
          <div class="flex-between mt-8" style="font-weight:800;color:var(--color-primary)"><span data-i18n="order.grandTotal"></span><b>${Format.money(order.grand_total)}</b></div>
          <div class="flex-between mt-8"><span class="text-muted" data-i18n="order.advancePaid"></span><b>${Format.money(order.advance_paid)}</b></div>
          <div class="flex-between mt-8"><span class="text-muted text-danger" data-i18n="order.remainingBalance"></span><b class="text-danger">${Format.money(order.remaining_balance)}</b></div>
        </div>

        ${order.remaining_balance > 0.001 && canRecordPayment() && order.status !== 'Cancelled' ? `
        <button class="btn btn-success btn-block" id="btn-receive-payment" style="margin-bottom:14px">${Icons.svg('money', 18)} <span data-i18n="order.receivePaymentBtn"></span></button>` : ''}

        ${order.notes ? `<div class="card" style="margin-bottom:14px"><div class="card-title" data-i18n="order.notes"></div><p>${escapeHtml(order.notes)}</p></div>` : ''}

        ${order.payments.length ? `
        <div class="card" style="margin-bottom:14px">
          <div class="card-title" data-i18n="order.paymentHistory"></div>
          ${order.payments.map((p) => `<div class="flex-between mt-8" style="font-size:13px"><span class="text-muted">${Format.dateTime(p.paid_at)} &middot; ${escapeHtml(p.method)}${p.note ? ' · ' + escapeHtml(p.note) : ''}</span><b>${Format.money(p.amount)}</b></div>`).join('')}
        </div>` : ''}

        ${order.history && order.history.length ? `
        <div class="card" style="margin-bottom:14px">
          <div class="card-title" data-i18n="order.timeline"></div>
          ${order.history.map((h) => `<div class="flex-between mt-8" style="font-size:13px"><span class="${Format.statusBadgeClass(h.status)}">${I18n.t('status.' + h.status)}</span><span class="text-muted">${Format.dateTime(h.changed_at)}${h.changed_by ? ' · ' + escapeHtml(h.changed_by) : ''}</span></div>`).join('')}
        </div>` : ''}

        ${nextStatuses.length ? `
        <div class="card" style="margin-bottom:14px">
          <div class="card-title" data-i18n="order.changeStatus"></div>
          <div class="tabs" style="padding:0;flex-wrap:wrap" id="status-changer">
            ${nextStatuses.map((s) => `<div class="tab-chip" data-set-status="${s}">${I18n.t('status.' + s)}</div>`).join('')}
          </div>
        </div>` : ''}

        ${canCancel() && isOpenOrder ? `
        <button class="btn btn-danger btn-block" id="btn-cancel-order">${Icons.svg('close', 16)} <span data-i18n="order.cancelOrder"></span></button>` : ''}

        ${canEditOrDelete() && isOpenOrder ? `
        <button class="btn btn-outline btn-block mt-8" id="btn-delete-order" style="color:var(--color-danger);border-color:var(--color-danger)">${Icons.svg('trash', 16)} <span data-i18n="order.deleteOrder"></span></button>` : ''}
      </div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-back').onclick = () => Router.navigate('/orders');
    app.querySelectorAll('.item-photo-thumb').forEach((img) => {
      img.onclick = () => Lightbox.open(img.getAttribute('data-photo'));
    });
    app.querySelector('#btn-print-invoice').onclick = () => Documents.openInvoicePreview(order);
    app.querySelector('#btn-print-tailor').onclick = () => Documents.openTailorCopyPreview(order);

    const editBtn = app.querySelector('#btn-edit-order');
    if (editBtn) editBtn.onclick = () => Router.navigate('/orders/' + order.id + '/edit');

    const deleteBtn = app.querySelector('#btn-delete-order');
    if (deleteBtn) {
      deleteBtn.onclick = async () => {
        const ok = await Modal.confirm({ message: I18n.t('order.deleteConfirm'), danger: true });
        if (!ok) return;
        try {
          await OrderService.deleteOrder(order.id);
          Toast.success(I18n.t('common.deleted'));
          Router.navigate('/orders');
        } catch (err) {
          console.error(err);
          Toast.error(I18n.t('common.error'));
        }
      };
    }

    const whatsappBtn = app.querySelector('#btn-whatsapp-ready');
    if (whatsappBtn) whatsappBtn.onclick = () => sendReadyNotification(order);

    const deliveryBtn = app.querySelector('#btn-mark-delivered');
    if (deliveryBtn) {
      deliveryBtn.onclick = async () => {
        if (!readyForDelivery) {
          const ok = await Modal.confirm({ message: I18n.t('delivery.earlyWarning'), confirmText: I18n.t('order.deliverEarly') });
          if (!ok) return;
        }
        DeliveryModal.open(order, () => renderDetail(app, params));
      };
    }

    const paymentBtn = app.querySelector('#btn-receive-payment');
    if (paymentBtn) {
      paymentBtn.onclick = () => PaymentModal.open(order, () => renderDetail(app, params));
    }

    app.querySelectorAll('[data-set-status]').forEach((el) => {
      el.onclick = async () => {
        const status = el.getAttribute('data-set-status');
        try {
          await OrderService.updateStatus(order.id, status);
          Toast.success(I18n.t('common.saved'));
          renderDetail(app, params);
        } catch (err) {
          console.error(err);
          Toast.error(I18n.t('common.error'));
        }
      };
    });

    const cancelBtn = app.querySelector('#btn-cancel-order');
    if (cancelBtn) {
      cancelBtn.onclick = () => openCancelDialog(order, () => renderDetail(app, params));
    }
  }

  // Builds the "your order is ready" WhatsApp message in both English
  // and Urdu (shop owner may have staff/customers who read either),
  // then opens it pre-filled in WhatsApp via a wa.me deep link —
  // there's no WhatsApp Business API integration here, so this is a
  // "compose and let the person hit send" flow, not a silent auto-send.
  function buildItemsTableText(order) {
    const nameW = 24;
    const header = 'Item'.padEnd(nameW) + 'Qty';
    const rows = order.items.map((it) => {
      let label = it.garment_label && it.garment_label.trim() ? it.garment_label : it.category_name;
      if (it.for_customer_name && it.for_customer_name !== order.customer_name) label += ' (' + it.for_customer_name + ')';
      if (label.length > nameW - 1) label = label.slice(0, nameW - 2) + '…';
      return label.padEnd(nameW) + 'x' + it.quantity;
    });
    // Triple backticks render as a monospace block in WhatsApp, which
    // is what keeps the Qty column aligned on the recipient's phone.
    return '```\n' + header + '\n' + rows.join('\n') + '\n```';
  }

  async function sendReadyNotification(order) {
    const shopName = await SettingsService.get('shop_name', 'Tailor Shop');
    const shopAddress = await SettingsService.get('shop_address', '');
    const shopPhone = await SettingsService.get('shop_phone', '');
    const paid = Number(order.grand_total) - Number(order.remaining_balance);
    const itemsTable = buildItemsTableText(order);

    const lines = [
      `Dear ${order.customer_name},`,
      `Your order ${order.invoice_no} is ready! Please collect it at your earliest convenience.`,
      '',
      itemsTable,
      '',
      `Total: ${Format.money(order.grand_total)}`,
      `Advance Paid: ${Format.money(paid)}`,
      `Remaining: ${Format.money(order.remaining_balance)}`,
      '',
      `محترم ${order.customer_name}،`,
      `آپ کا آرڈر ${order.invoice_no} تیار ہے۔ براہ مہربانی اپنا آرڈر وصول کر لیں۔`,
      '',
      `کل رقم: ${Format.money(order.grand_total)}`,
      `ایڈوانس: ${Format.money(paid)}`,
      `باقی رقم: ${Format.money(order.remaining_balance)}`,
      '',
      shopName
    ];
    if (shopAddress) lines.push(shopAddress);
    if (shopPhone) lines.push('📞 ' + shopPhone);

    const message = lines.join('\n');
    const number = Format.toWhatsappNumber(order.customer_whatsapp || order.customer_phone);
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, '_blank');
  }

  function openCancelDialog(order, onDone) {
    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="order.cancelOrder"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <p class="text-muted" style="margin-bottom:14px">${I18n.t('order.cancelConfirm')}</p>
      <div class="field">
        <label data-i18n="order.cancelReason"></label>
        <textarea id="in-cancel-reason" rows="2" data-i18n-placeholder="common.optional"></textarea>
      </div>
      <button class="btn btn-danger btn-block mt-8" id="btn-confirm-cancel" data-i18n="order.cancelOrder"></button>
    `, { center: true });
    I18n.apply(sheet);
    sheet.querySelector('#m-close').onclick = () => Modal.close();
    sheet.querySelector('#btn-confirm-cancel').onclick = async () => {
      const reason = sheet.querySelector('#in-cancel-reason').value.trim();
      const btn = sheet.querySelector('#btn-confirm-cancel');
      btn.disabled = true;
      try {
        await OrderService.cancel(order.id, reason);
        Toast.success(I18n.t('common.saved'));
        Modal.close();
        if (onDone) onDone();
      } catch (err) {
        console.error(err);
        Toast.error(I18n.t('common.error'));
        btn.disabled = false;
      }
    };
  }

  return { renderList, renderDetail, rowHtml, wireRows };
})();
