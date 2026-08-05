/* ============================================================
   Inventory screen — stock list (low-stock rows flagged), search,
   add/edit inventory items, and a "+/-" quick stock-adjust action
   per row. Admin/Manager only, same defense-in-depth gate as
   SuppliersScreen.

   The add/edit form deliberately has no "quantity in stock" field —
   stock only moves through two sanctioned paths: PurchaseService
   (receiving goods) and the quick-adjust modal here
   (InventoryService.adjustStock, for corrections/wastage/returns).
   Letting the edit form silently overwrite quantity would bypass
   both audit trails.
   ============================================================ */

const InventoryScreen = (function () {
  let searchDebounce = null;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function isLow(item) { return Number(item.quantity_in_stock) <= Number(item.low_stock_threshold); }

  async function render(app) {
    if (!AuthService.hasRole('admin', 'manager')) {
      app.innerHTML = '<div class="empty-state"><div class="ei">🔒</div><p data-i18n="common.notAuthorized"></p></div>';
      I18n.apply(app);
      return;
    }

    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn back-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <h1 data-i18n="inventory.title"></h1>
        <button class="icon-btn" id="btn-add-item">${Icons.svg('plus', 24)}</button>
      </header>
      <div class="search-bar">
        ${Icons.svg('search', 18)}
        <input type="text" id="inv-search" data-i18n-placeholder="inventory.searchPlaceholder" />
      </div>
      <div class="checkbox-row" style="margin:0 16px 12px">
        <input type="checkbox" id="inv-low-only" />
        <label for="inv-low-only" style="margin:0;text-transform:none;font-weight:500" data-i18n="inventory.lowStockOnly"></label>
      </div>
      <div id="inv-list"></div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-back').onclick = () => Router.navigate('/more');
    app.querySelector('#btn-add-item').onclick = () => openForm();
    app.querySelector('#inv-search').addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(loadList, 200);
    });
    app.querySelector('#inv-low-only').addEventListener('change', loadList);

    await loadList();
  }

  async function loadList() {
    const listEl = document.getElementById('inv-list');
    if (!listEl) return;
    const search = document.getElementById('inv-search').value;
    const lowStockOnly = document.getElementById('inv-low-only').checked;
    const rows = await InventoryService.list({ search, lowStockOnly });
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="ei">${Icons.svg('inventory', 40)}</div><p data-i18n="inventory.noItems"></p></div>`;
      I18n.apply(listEl);
      return;
    }
    listEl.innerHTML = rows.map(rowHtml).join('');
    I18n.apply(listEl);

    listEl.querySelectorAll('[data-edit]').forEach((el) => {
      el.onclick = async () => {
        const item = await InventoryService.get(parseInt(el.getAttribute('data-edit'), 10));
        if (item) openForm(item);
      };
    });
    listEl.querySelectorAll('[data-adjust]').forEach((el) => {
      el.onclick = async (e) => {
        e.stopPropagation();
        const item = await InventoryService.get(parseInt(el.getAttribute('data-adjust'), 10));
        if (item) openAdjustForm(item);
      };
    });
  }

  function rowHtml(it) {
    const low = isLow(it);
    return `
      <div class="list-row ${low ? 'low-stock' : ''}" data-edit="${it.id}">
        <div class="avatar">${Icons.svg('inventory', 20)}</div>
        <div class="main">
          <div class="title">${escapeHtml(it.name)} ${low ? `<span class="badge badge-lowstock" data-i18n="inventory.lowStock"></span>` : ''}</div>
          <div class="subtitle">${escapeHtml(it.category)} &middot; ${Format.money(it.unit_price)} / ${escapeHtml(it.unit)}</div>
        </div>
        <div class="end">
          <div class="amount">${it.quantity_in_stock} ${escapeHtml(it.unit)}</div>
          <button class="btn btn-sm btn-outline mt-8" data-adjust="${it.id}">+/-</button>
        </div>
      </div>
    `;
  }

  function openForm(existing) {
    const isEdit = !!existing;
    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="${isEdit ? 'inventory.editItem' : 'inventory.addItem'}"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="field" id="f-name">
        <label data-i18n="inventory.name"></label>
        <input id="in-name" value="${existing ? escapeHtml(existing.name) : ''}" />
        <div class="error-msg" data-i18n="common.requiredField"></div>
      </div>
      <div class="field-row">
        <div class="field">
          <label data-i18n="inventory.category"></label>
          <input id="in-category" value="${existing ? escapeHtml(existing.category) : 'Fabric'}" />
        </div>
        <div class="field">
          <label data-i18n="inventory.unit"></label>
          <input id="in-unit" value="${existing ? escapeHtml(existing.unit) : 'meter'}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label data-i18n="inventory.unitPrice"></label>
          <input type="number" min="0" step="0.01" id="in-price" value="${existing ? existing.unit_price : 0}" />
        </div>
        <div class="field">
          <label data-i18n="inventory.lowStockThreshold"></label>
          <input type="number" min="0" step="0.01" id="in-threshold" value="${existing ? existing.low_stock_threshold : 5}" />
        </div>
      </div>
      <div class="field">
        <label data-i18n="inventory.sku"></label>
        <input id="in-sku" value="${existing ? escapeHtml(existing.sku || '') : ''}" />
      </div>
      ${isEdit ? `
      <div class="flex-between" style="margin-bottom:14px;font-size:13px">
        <span class="text-muted" data-i18n="inventory.currentStock"></span>
        <b>${existing.quantity_in_stock} ${escapeHtml(existing.unit)}</b>
      </div>` : ''}
      <div class="field">
        <label data-i18n="inventory.notes"></label>
        <textarea id="in-notes" rows="2">${existing ? escapeHtml(existing.notes || '') : ''}</textarea>
      </div>
      <div class="flex gap-8 mt-8">
        ${isEdit ? `<button class="btn btn-danger" id="btn-del-item">${Icons.svg('trash', 18)}</button>` : ''}
        <button class="btn btn-primary btn-block" id="btn-save-item" data-i18n="common.save"></button>
      </div>
    `);
    I18n.apply(sheet);

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    if (isEdit) {
      sheet.querySelector('#btn-del-item').onclick = async () => {
        const ok = await Modal.confirm({ message: I18n.t('inventory.deleteConfirm'), danger: true });
        if (!ok) return;
        const res = await InventoryService.remove(existing.id);
        if (!res.ok) {
          Toast.error(I18n.t('inventory.hasReferences'));
          return;
        }
        Modal.close();
        Toast.success(I18n.t('common.deleted'));
        loadList();
      };
    }
    sheet.querySelector('#btn-save-item').onclick = async () => {
      const name = sheet.querySelector('#in-name').value.trim();
      const fName = sheet.querySelector('#f-name');
      fName.classList.toggle('invalid', !name);
      if (!name) return;

      const data = {
        name,
        category: sheet.querySelector('#in-category').value.trim() || 'Fabric',
        unit: sheet.querySelector('#in-unit').value.trim() || 'meter',
        unit_price: parseFloat(sheet.querySelector('#in-price').value) || 0,
        low_stock_threshold: parseFloat(sheet.querySelector('#in-threshold').value) || 0,
        sku: sheet.querySelector('#in-sku').value.trim(),
        notes: sheet.querySelector('#in-notes').value.trim()
      };

      if (isEdit) await InventoryService.update(existing.id, data);
      else await InventoryService.create(data);
      Toast.success(I18n.t('common.saved'));
      Modal.close();
      loadList();
    };
  }

  function openAdjustForm(item) {
    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="inventory.adjustStock"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="flex-between" style="margin-bottom:14px">
        <span class="text-muted">${escapeHtml(item.name)}</span>
        <span class="text-muted" data-i18n="inventory.currentStock"></span>
      </div>
      <div class="flex-between" style="margin-bottom:14px">
        <span></span><b style="font-size:20px">${item.quantity_in_stock} ${escapeHtml(item.unit)}</b>
      </div>
      <div class="field" id="f-delta">
        <label data-i18n="inventory.delta"></label>
        <input type="number" step="0.01" id="in-delta" value="" />
        <div class="error-msg" data-i18n="common.requiredField"></div>
      </div>
      <p class="text-muted" style="font-size:12px;margin:-8px 0 14px" data-i18n="inventory.deltaHint"></p>
      <div class="field">
        <label data-i18n="inventory.reason"></label>
        <input id="in-reason" data-i18n-placeholder="inventory.reasonHint" />
      </div>
      <button class="btn btn-primary btn-block" id="btn-save-adjust" data-i18n="common.save"></button>
    `, { center: true });
    I18n.apply(sheet);

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    sheet.querySelector('#btn-save-adjust').onclick = async () => {
      const delta = parseFloat(sheet.querySelector('#in-delta').value);
      const fDelta = sheet.querySelector('#f-delta');
      fDelta.classList.toggle('invalid', !delta);
      if (!delta) return;
      const reason = sheet.querySelector('#in-reason').value.trim();
      try {
        await InventoryService.adjustStock(item.id, delta, reason);
        Toast.success(I18n.t('inventory.stockUpdated'));
        Modal.close();
        loadList();
      } catch (err) {
        console.error(err);
        Toast.error(I18n.t('common.error'));
      }
    };
  }

  return { render };
})();
