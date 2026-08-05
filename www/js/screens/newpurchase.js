/* ============================================================
   New Purchase screen — supplier picker (search or quick-add),
   purchase date, multi-item cart where each line either points at
   an existing inventory item (searched/picked) or introduces a
   brand-new one by name, live totals, discount/paid/payment
   method, save -> purchase detail. Admin/Manager only (route-
   gated in app.js; re-checked here as defense in depth, same
   pattern as NewOrderScreen).

   Item picking mirrors the customer-picker pattern in
   neworder.js: typing searches InventoryService for a match; tapping
   a suggestion "locks" the row to that inventory_item_id and prefills
   its unit/rate (still overridable). Leaving a row unlocked and just
   typing a name means "this is a new item" — PurchaseService.
   createPurchase() creates the inventory_items row for it when saved.
   ============================================================ */

const NewPurchaseScreen = (function () {
  let selectedSupplier = null;
  let items = [];
  let rowSeq = 0;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  async function render(app) {
    if (!AuthService.hasRole('admin', 'manager')) {
      app.innerHTML = '<div class="empty-state"><div class="ei">🔒</div><p data-i18n="common.notAuthorized"></p></div>';
      I18n.apply(app);
      return;
    }

    selectedSupplier = null;
    items = [];
    rowSeq = 0;
    const purchaseNoPreview = await PurchaseService.nextPurchaseNo();

    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn back-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <div>
          <h1 data-i18n="purchase.newTitle"></h1>
          <div class="subtitle">${purchaseNoPreview}</div>
        </div>
      </header>
      <div class="page page-pad" style="padding-top:14px;padding-bottom:24px">

        <div class="card" style="margin-bottom:14px">
          <div class="card-title" data-i18n="purchase.supplier"></div>
          <div id="supplier-picker"></div>
        </div>

        <div class="card" style="margin-bottom:14px">
          <div class="field" style="margin-bottom:0">
            <label data-i18n="purchase.purchaseDate"></label>
            <input type="date" id="in-purchase-date" value="${Format.todayIso()}" />
          </div>
        </div>

        <div class="section-header" style="padding:0 0 8px">
          <h2 data-i18n="purchase.items"></h2>
          <a class="link" id="btn-add-item">+ <span data-i18n="purchase.addItem"></span></a>
        </div>
        <div id="items-container"></div>

        <div class="card" style="margin:14px 0">
          <div class="field"><label data-i18n="purchase.discount"></label><input type="number" min="0" id="in-discount" value="0" /></div>
          <div class="flex-between mt-8" style="font-size:14px"><span data-i18n="purchase.subtotal"></span><b id="sum-subtotal">${Format.money(0)}</b></div>
          <div class="flex-between mt-8" style="font-size:16px;font-weight:800;color:var(--color-primary)"><span data-i18n="purchase.grandTotal"></span><b id="sum-grand">${Format.money(0)}</b></div>
        </div>

        <div class="card" style="margin-bottom:14px">
          <div class="field-row">
            <div class="field"><label data-i18n="purchase.paidAmount"></label><input type="number" min="0" id="in-paid" value="0" /></div>
            <div class="field">
              <label data-i18n="purchase.paymentMethod"></label>
              <select id="in-payment-method">
                <option value="Cash" data-i18n="payment.Cash"></option>
                <option value="Card" data-i18n="payment.Card"></option>
                <option value="Bank Transfer" data-i18n="payment.Bank Transfer"></option>
                <option value="Other" data-i18n="payment.Other"></option>
              </select>
            </div>
          </div>
          <div class="flex-between mt-8" style="font-size:14px"><span class="text-muted" data-i18n="purchase.balance"></span><b id="sum-balance">${Format.money(0)}</b></div>
        </div>

        <div class="field">
          <label data-i18n="purchase.notes"></label>
          <textarea id="in-notes" rows="2"></textarea>
        </div>

        <button class="btn btn-primary btn-block mt-8" id="btn-save-purchase" data-i18n="purchase.savePurchase"></button>
      </div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-back').onclick = () => Router.navigate('/purchases');
    app.querySelector('#btn-add-item').onclick = () => { addItemRow(); renderItems(); };
    app.querySelector('#btn-save-purchase').onclick = save;

    ['#in-discount', '#in-paid'].forEach((sel) => {
      app.querySelector(sel).addEventListener('input', recomputeTotals);
    });

    renderSupplierPicker();
    addItemRow();
    renderItems();
    recomputeTotals();
  }

  // ---------------- Supplier picker ----------------

  function renderSupplierPicker() {
    const el = document.getElementById('supplier-picker');
    if (!el) return;
    if (selectedSupplier) {
      el.innerHTML = `
        <div class="list-row" style="margin:0">
          <div class="avatar">${Icons.svg('supplier', 18)}</div>
          <div class="main">
            <div class="title">${escapeHtml(selectedSupplier.name)}</div>
            <div class="subtitle">${escapeHtml(selectedSupplier.phone || '')}</div>
          </div>
          <button class="btn btn-sm btn-outline" id="btn-change-sup" data-i18n="common.edit"></button>
        </div>
      `;
      I18n.apply(el);
      el.querySelector('#btn-change-sup').onclick = () => {
        selectedSupplier = null;
        renderSupplierPicker();
      };
      return;
    }
    el.innerHTML = `
      <input type="text" id="sup-search" data-i18n-placeholder="purchase.searchSupplier" />
      <div id="sup-suggestions" style="margin-top:8px"></div>
      <a class="link" id="btn-quick-add-sup" data-i18n="purchase.addNewSupplier" style="display:inline-block;margin-top:8px"></a>
    `;
    I18n.apply(el);
    let debounce = null;
    el.querySelector('#sup-search').addEventListener('input', (e) => {
      clearTimeout(debounce);
      const val = e.target.value;
      debounce = setTimeout(async () => {
        const rows = val.trim() ? await SupplierService.list({ search: val }) : [];
        const box = document.getElementById('sup-suggestions');
        if (!box) return;
        box.innerHTML = rows.slice(0, 6).map((s) => `
          <div class="list-row" style="margin:0 0 8px" data-pick="${s.id}">
            <div class="avatar">${Icons.svg('supplier', 18)}</div>
            <div class="main"><div class="title">${escapeHtml(s.name)}</div><div class="subtitle">${escapeHtml(s.phone || '')}</div></div>
          </div>
        `).join('');
        box.querySelectorAll('[data-pick]').forEach((row) => {
          row.onclick = () => {
            const id = parseInt(row.getAttribute('data-pick'), 10);
            selectedSupplier = rows.find((r) => r.id === id);
            renderSupplierPicker();
          };
        });
      }, 200);
    });
    el.querySelector('#btn-quick-add-sup').onclick = () => {
      SuppliersScreen.openNew((newId, data) => {
        selectedSupplier = { id: newId, name: data.name, phone: data.phone };
        renderSupplierPicker();
      });
    };
  }

  // ---------------- Item rows ----------------

  function addItemRow() {
    items.push({
      rowId: ++rowSeq,
      inventoryItemId: null,
      itemName: '',
      category: 'Fabric',
      unit: 'meter',
      quantity: 1,
      rate: 0,
      currentStock: null
    });
  }

  function renderItems() {
    const container = document.getElementById('items-container');
    if (!container) return;
    if (!items.length) {
      container.innerHTML = `<p class="text-muted center" data-i18n="purchase.noItems" style="padding:16px 0"></p>`;
      I18n.apply(container);
      return;
    }
    container.innerHTML = items.map(itemRowHtml).join('');
    I18n.apply(container);

    items.forEach((it) => {
      const row = container.querySelector(`[data-row="${it.rowId}"]`);
      if (!row) return;

      if (it.inventoryItemId) {
        const changeBtn = row.querySelector('.btn-change-inv-item');
        if (changeBtn) {
          changeBtn.onclick = () => {
            it.inventoryItemId = null;
            it.currentStock = null;
            renderItems();
          };
        }
      } else {
        const searchInput = row.querySelector('.in-item-search');
        if (searchInput) {
          let debounce = null;
          searchInput.addEventListener('input', (e) => {
            it.itemName = e.target.value;
            clearTimeout(debounce);
            const val = e.target.value;
            debounce = setTimeout(async () => {
              const box = row.querySelector('.item-suggestions');
              if (!box) return;
              if (!val.trim()) { box.innerHTML = ''; return; }
              const matches = await InventoryService.list({ search: val });
              box.innerHTML = matches.slice(0, 6).map((m) => `
                <div class="list-row" style="margin:0 0 8px" data-pick-item="${m.id}">
                  <div class="avatar">${Icons.svg('inventory', 16)}</div>
                  <div class="main"><div class="title">${escapeHtml(m.name)}</div><div class="subtitle">${escapeHtml(m.category)} &middot; ${m.quantity_in_stock} ${escapeHtml(m.unit)} ${I18n.t('inventory.currentStock')}</div></div>
                </div>
              `).join('');
              box.querySelectorAll('[data-pick-item]').forEach((sugg) => {
                sugg.onclick = () => {
                  const match = matches.find((m) => m.id === parseInt(sugg.getAttribute('data-pick-item'), 10));
                  if (!match) return;
                  it.inventoryItemId = match.id;
                  it.itemName = match.name;
                  it.category = match.category;
                  it.unit = match.unit;
                  it.rate = Number(match.unit_price || 0);
                  it.currentStock = match.quantity_in_stock;
                  renderItems();
                  recomputeTotals();
                };
              });
            }, 200);
          });
        }
        const catInput = row.querySelector('.in-item-category');
        if (catInput) {
          catInput.addEventListener('input', (e) => { it.category = e.target.value; });
        }
      }

      row.querySelector('.in-unit').addEventListener('input', (e) => { it.unit = e.target.value; });
      row.querySelector('.in-qty').addEventListener('input', (e) => {
        it.quantity = Math.max(0, parseFloat(e.target.value) || 0);
        updateRowSubtotal(it);
        recomputeTotals();
      });
      row.querySelector('.in-rate').addEventListener('input', (e) => {
        it.rate = Math.max(0, parseFloat(e.target.value) || 0);
        updateRowSubtotal(it);
        recomputeTotals();
      });
      row.querySelector('.btn-remove-item').addEventListener('click', () => {
        items = items.filter((x) => x.rowId !== it.rowId);
        renderItems();
        recomputeTotals();
      });
    });
  }

  function updateRowSubtotal(it) {
    const el = document.querySelector(`[data-row="${it.rowId}"] .row-subtotal`);
    if (el) el.textContent = Format.money(it.quantity * it.rate);
  }

  function itemRowHtml(it) {
    const itemPicker = it.inventoryItemId ? `
      <div class="flex-between" style="margin-bottom:8px">
        <div>
          <b>${escapeHtml(it.itemName)}</b>
          <div class="text-muted" style="font-size:11px">${escapeHtml(it.category)} &middot; ${it.currentStock != null ? it.currentStock : '—'} ${escapeHtml(it.unit)} ${I18n.t('inventory.currentStock')}</div>
        </div>
        <a class="link btn-change-inv-item" data-i18n="common.edit"></a>
      </div>
    ` : `
      <div class="field" style="margin-bottom:8px">
        <label data-i18n="purchase.itemName"></label>
        <input class="in-item-search" data-i18n-placeholder="purchase.newItemHint" value="${escapeHtml(it.itemName)}" />
        <div class="item-suggestions" style="margin-top:6px"></div>
      </div>
      <div class="field" style="margin-bottom:8px">
        <label data-i18n="purchase.category"></label>
        <input class="in-item-category" value="${escapeHtml(it.category)}" />
      </div>
    `;

    return `
      <div class="card" style="margin-bottom:10px" data-row="${it.rowId}">
        ${itemPicker}
        <div class="field-row" style="align-items:flex-end">
          <div class="field" style="margin-bottom:0">
            <label data-i18n="purchase.unit"></label>
            <input class="in-unit" value="${escapeHtml(it.unit)}" />
          </div>
          <div class="field" style="margin-bottom:0">
            <label data-i18n="purchase.quantity"></label>
            <input type="number" min="0" step="any" class="in-qty" value="${it.quantity}" />
          </div>
        </div>
        <div class="field-row mt-8" style="align-items:flex-end">
          <div class="field" style="margin-bottom:0">
            <label data-i18n="purchase.rate"></label>
            <input type="number" min="0" class="in-rate" value="${it.rate}" />
          </div>
          <button class="btn btn-danger btn-icon btn-remove-item" style="width:40px;height:40px;flex-shrink:0">${Icons.svg('trash', 16)}</button>
        </div>
        <div class="flex-between mt-8" style="font-size:13px">
          <span class="text-muted" data-i18n="purchase.subtotal"></span>
          <b class="row-subtotal">${Format.money(it.quantity * it.rate)}</b>
        </div>
      </div>
    `;
  }

  // ---------------- Totals ----------------

  function recomputeTotals() {
    const discount = parseFloat(document.getElementById('in-discount').value) || 0;
    const paid = parseFloat(document.getElementById('in-paid').value) || 0;
    const totals = PurchaseService.computeTotals(items, { discount });
    document.getElementById('sum-subtotal').textContent = Format.money(totals.subtotal);
    document.getElementById('sum-grand').textContent = Format.money(totals.grandTotal);
    document.getElementById('sum-balance').textContent = Format.money(Math.max(0, totals.grandTotal - paid));
    return totals;
  }

  // ---------------- Save ----------------

  async function save() {
    if (!selectedSupplier) { Toast.error(I18n.t('purchase.selectSupplierFirst')); return; }
    if (!items.length) { Toast.error(I18n.t('purchase.addAtLeastOneItem')); return; }
    const invalidItem = items.some((it) => !it.itemName.trim() || it.quantity <= 0);
    if (invalidItem) { Toast.error(I18n.t('purchase.invalidItem')); return; }

    const btn = document.getElementById('btn-save-purchase');
    btn.disabled = true;

    const discount = parseFloat(document.getElementById('in-discount').value) || 0;
    const paid = parseFloat(document.getElementById('in-paid').value) || 0;

    const purchaseData = {
      supplierId: selectedSupplier.id,
      purchaseDate: document.getElementById('in-purchase-date').value || Format.todayIso(),
      items: items.map((it) => ({
        inventoryItemId: it.inventoryItemId,
        itemName: it.itemName.trim(),
        category: it.category,
        unit: it.unit,
        quantity: it.quantity,
        rate: it.rate
      })),
      discount,
      paidAmount: paid,
      paymentMethod: document.getElementById('in-payment-method').value,
      notes: document.getElementById('in-notes').value.trim()
    };

    try {
      const purchase = await PurchaseService.createPurchase(purchaseData);
      Toast.success(I18n.t('purchase.purchaseCreated') + ': ' + purchase.purchase_no);
      Router.navigate('/purchases/' + purchase.id);
    } catch (err) {
      console.error(err);
      Toast.error(I18n.t('common.error'));
      btn.disabled = false;
    }
  }

  return { render };
})();
