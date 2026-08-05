/* ============================================================
   Purchases screen — list (search + optional supplier filter
   carried in via ?supplierId= from the Suppliers detail sheet)
   and a read-only detail view (items, totals, supplier, balance
   owed). Admin/Manager only, same defense-in-depth gate as the
   other Phase 4 screens.

   Unlike orders, a purchase has no status pipeline or later
   payments to record against it — paid_amount/balance are fixed
   at creation time in NewPurchaseScreen, so the detail view here
   is pure history.
   ============================================================ */

const PurchasesScreen = (function () {
  let searchDebounce = null;
  let supplierFilter = null; // { id, name } or null

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function canCreate() { return AuthService.hasRole('admin', 'manager'); }

  // ---------------- List ----------------

  async function renderList(app) {
    if (!AuthService.hasRole('admin', 'manager')) {
      app.innerHTML = '<div class="empty-state"><div class="ei">🔒</div><p data-i18n="common.notAuthorized"></p></div>';
      I18n.apply(app);
      return;
    }

    const supplierId = Router.getQuery().get('supplierId');
    supplierFilter = null;
    if (supplierId) {
      const supplier = await SupplierService.get(parseInt(supplierId, 10));
      if (supplier) supplierFilter = { id: supplier.id, name: supplier.name };
    }

    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn back-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <h1 data-i18n="purchase.listTitle"></h1>
        ${canCreate() ? `<button class="icon-btn" id="btn-new-purchase">${Icons.svg('plus', 24)}</button>` : ''}
      </header>
      <div class="search-bar">
        ${Icons.svg('search', 18)}
        <input type="text" id="pur-search" data-i18n-placeholder="common.search" />
      </div>
      <div id="pur-filter-chip"></div>
      <div id="pur-list"></div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-back').onclick = () => Router.navigate('/more');
    if (canCreate()) app.querySelector('#btn-new-purchase').onclick = () => Router.navigate('/purchases/new');

    app.querySelector('#pur-search').addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      const val = e.target.value;
      searchDebounce = setTimeout(() => loadList(val), 200);
    });

    renderFilterChip();
    await loadList('');
  }

  function renderFilterChip() {
    const chipEl = document.getElementById('pur-filter-chip');
    if (!chipEl) return;
    if (!supplierFilter) { chipEl.innerHTML = ''; return; }
    chipEl.innerHTML = `
      <div class="tab-chip active" style="margin:0 16px 10px;display:inline-flex;gap:6px" id="chip-clear-supplier">
        ${escapeHtml(supplierFilter.name)} ${Icons.svg('close', 14)}
      </div>
    `;
    chipEl.querySelector('#chip-clear-supplier').onclick = () => {
      supplierFilter = null;
      Router.navigate('/purchases');
    };
  }

  async function loadList(term) {
    const listEl = document.getElementById('pur-list');
    if (!listEl) return;
    const rows = await PurchaseService.search({
      query: term,
      supplierId: supplierFilter ? supplierFilter.id : null
    });
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="ei">${Icons.svg('purchase', 40)}</div><p data-i18n="purchase.noPurchases"></p></div>`;
      I18n.apply(listEl);
      return;
    }
    listEl.innerHTML = rows.map(rowHtml).join('');
    listEl.querySelectorAll('[data-purchase]').forEach((el) => {
      el.onclick = () => Router.navigate('/purchases/' + el.getAttribute('data-purchase'));
    });
  }

  function rowHtml(p) {
    const balance = Number(p.balance || 0);
    return `
      <div class="list-row" data-purchase="${p.id}">
        <div class="avatar">${Icons.svg('purchase', 20)}</div>
        <div class="main">
          <div class="title">${escapeHtml(p.purchase_no)}</div>
          <div class="subtitle">${escapeHtml(p.supplier_name || I18n.t('common.none'))} &middot; ${Format.shortDate(p.purchase_date)}</div>
        </div>
        <div class="end">
          <div class="amount">${Format.money(p.grand_total)}</div>
          ${balance > 0.001 ? `<div class="text-danger" style="font-size:11px;font-weight:700;margin-top:2px">${Format.money(balance)} ${I18n.t('purchase.due')}</div>` : ''}
        </div>
      </div>
    `;
  }

  // ---------------- Detail ----------------

  async function renderDetail(app, params) {
    if (!AuthService.hasRole('admin', 'manager')) {
      app.innerHTML = '<div class="empty-state"><div class="ei">🔒</div><p data-i18n="common.notAuthorized"></p></div>';
      I18n.apply(app);
      return;
    }

    const purchase = await PurchaseService.getPurchase(parseInt(params.id, 10));
    if (!purchase) {
      app.innerHTML = `<div class="empty-state"><div class="ei">🔍</div><p data-i18n="purchase.noPurchases"></p></div>`;
      I18n.apply(app);
      return;
    }

    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn back-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <div>
          <h1>${escapeHtml(purchase.purchase_no)}</h1>
          <div class="subtitle">${Format.shortDate(purchase.purchase_date)}</div>
        </div>
      </header>

      <div class="page page-pad" style="padding-top:14px;padding-bottom:24px">
        <div class="card" style="margin-bottom:14px">
          <div style="font-weight:700">${escapeHtml(purchase.supplier_name || I18n.t('common.none'))}</div>
          ${purchase.supplier_phone ? `<div class="text-muted" style="font-size:12.5px">${escapeHtml(purchase.supplier_phone)}</div>` : ''}
        </div>

        <div class="card" style="margin-bottom:14px">
          <div class="card-title" data-i18n="purchase.items"></div>
          <table class="data-table">
            <thead><tr><th data-i18n="purchase.itemName"></th><th data-i18n="purchase.quantity"></th><th data-i18n="purchase.rate"></th><th data-i18n="purchase.subtotal"></th></tr></thead>
            <tbody>
              ${purchase.items.map((it) => `
                <tr>
                  <td>${escapeHtml(it.item_name || it.inventory_name || '')}</td>
                  <td>${it.quantity} ${escapeHtml(it.unit || '')}</td>
                  <td>${Format.money(it.rate)}</td>
                  <td>${Format.money(it.subtotal)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="card" style="margin-bottom:14px">
          <div class="flex-between"><span class="text-muted" data-i18n="purchase.subtotal"></span><b>${Format.money(purchase.subtotal)}</b></div>
          <div class="flex-between mt-8"><span class="text-muted" data-i18n="purchase.discount"></span><b>-${Format.money(purchase.discount)}</b></div>
          <div class="flex-between mt-8" style="font-weight:800;color:var(--color-primary)"><span data-i18n="purchase.grandTotal"></span><b>${Format.money(purchase.grand_total)}</b></div>
          <div class="flex-between mt-8"><span class="text-muted" data-i18n="purchase.paidAmount"></span><b>${Format.money(purchase.paid_amount)}</b></div>
          <div class="flex-between mt-8"><span class="text-muted text-danger" data-i18n="purchase.balance"></span><b class="text-danger">${Format.money(purchase.balance)}</b></div>
          <div class="flex-between mt-8"><span class="text-muted" data-i18n="purchase.paymentMethod"></span><b>${I18n.t('payment.' + purchase.payment_method)}</b></div>
        </div>

        ${purchase.notes ? `<div class="card" style="margin-bottom:14px"><div class="card-title" data-i18n="purchase.notes"></div><p>${escapeHtml(purchase.notes)}</p></div>` : ''}
      </div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-back').onclick = () => Router.navigate('/purchases');
  }

  return { renderList, renderDetail };
})();
