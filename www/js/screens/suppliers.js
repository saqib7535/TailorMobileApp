/* ============================================================
   Suppliers screen — list/search + add/edit/delete + a detail
   sheet showing purchase count/total owed with a link into
   Purchases filtered by this supplier. Admin/Manager only —
   route-gated in app.js, and this screen re-checks on render as
   defense in depth (the same pattern NewOrderScreen uses for its
   own admin/manager/reception gate), since every screen this
   phase adds is back-office/money-sensitive.

   openNew(onSaved) mirrors CustomersScreen.openNew() — it opens
   the add-supplier sheet from outside this screen (the New
   Purchase screen's "+ Add New Supplier" quick-add link) and
   reports the new id back through onSaved(id, data) instead of
   refreshing a Suppliers list that isn't on screen in that context.
   ============================================================ */

const SuppliersScreen = (function () {
  let searchDebounce = null;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  async function render(app) {
    if (!AuthService.hasRole('admin', 'manager')) {
      app.innerHTML = '<div class="empty-state"><div class="ei">🔒</div><p data-i18n="common.notAuthorized"></p></div>';
      I18n.apply(app);
      return;
    }

    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn back-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <h1 data-i18n="supplier.title"></h1>
        <button class="icon-btn" id="btn-add-supplier">${Icons.svg('plus', 24)}</button>
      </header>
      <div class="search-bar">
        ${Icons.svg('search', 18)}
        <input type="text" id="sup-search" data-i18n-placeholder="supplier.searchPlaceholder" />
      </div>
      <div id="sup-list"></div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-back').onclick = () => Router.navigate('/more');
    app.querySelector('#btn-add-supplier').onclick = () => openForm();
    app.querySelector('#sup-search').addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      const val = e.target.value;
      searchDebounce = setTimeout(() => loadList(val), 200);
    });

    await loadList('');
  }

  async function loadList(term) {
    const listEl = document.getElementById('sup-list');
    if (!listEl) return;
    const rows = await SupplierService.list({ search: term });
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="ei">${Icons.svg('supplier', 40)}</div><p data-i18n="supplier.noSuppliers"></p></div>`;
      I18n.apply(listEl);
      return;
    }
    listEl.innerHTML = rows.map(rowHtml).join('');
    listEl.querySelectorAll('.list-row').forEach((el) => {
      el.onclick = () => openDetail(parseInt(el.getAttribute('data-id'), 10));
    });
  }

  function rowHtml(s) {
    return `
      <div class="list-row" data-id="${s.id}">
        <div class="avatar">${Icons.svg('supplier', 20)}</div>
        <div class="main">
          <div class="title">${escapeHtml(s.name)}</div>
          <div class="subtitle">${escapeHtml(s.phone || '')}</div>
        </div>
        ${Icons.svg('chevron', 18, 'text-muted')}
      </div>
    `;
  }

  function openNew(onSaved) {
    openForm(null, onSaved);
  }

  function openForm(existing, onSaved) {
    const isEdit = !!existing;
    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="${isEdit ? 'supplier.editSupplier' : 'supplier.addSupplier'}"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="field" id="f-name">
        <label data-i18n="supplier.name"></label>
        <input id="in-name" value="${existing ? escapeHtml(existing.name) : ''}" />
        <div class="error-msg" data-i18n="common.requiredField"></div>
      </div>
      <div class="field">
        <label data-i18n="supplier.phone"></label>
        <input id="in-phone" type="tel" value="${existing ? escapeHtml(existing.phone || '') : ''}" />
      </div>
      <div class="field">
        <label data-i18n="supplier.address"></label>
        <textarea id="in-address" rows="2">${existing ? escapeHtml(existing.address || '') : ''}</textarea>
      </div>
      <div class="field">
        <label data-i18n="supplier.notes"></label>
        <textarea id="in-notes" rows="2">${existing ? escapeHtml(existing.notes || '') : ''}</textarea>
      </div>
      <button class="btn btn-primary btn-block" id="btn-save-supplier" data-i18n="common.save"></button>
    `);
    I18n.apply(sheet);

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    sheet.querySelector('#btn-save-supplier').onclick = async () => {
      const name = sheet.querySelector('#in-name').value.trim();
      const fName = sheet.querySelector('#f-name');
      fName.classList.toggle('invalid', !name);
      if (!name) return;

      const data = {
        name,
        phone: sheet.querySelector('#in-phone').value.trim(),
        address: sheet.querySelector('#in-address').value.trim(),
        notes: sheet.querySelector('#in-notes').value.trim()
      };

      let newId = existing ? existing.id : null;
      if (isEdit) {
        await SupplierService.update(existing.id, data);
      } else {
        newId = await SupplierService.create(data);
      }
      Toast.success(I18n.t('common.saved'));
      Modal.close();
      if (onSaved) {
        onSaved(newId, data);
      } else {
        const searchInput = document.getElementById('sup-search');
        loadList(searchInput ? searchInput.value : '');
      }
    };
  }

  async function openDetail(id) {
    const supplier = await SupplierService.get(id);
    if (!supplier) return;
    const summary = await SupplierService.getSummary(id);

    const sheet = Modal.open(`
      <div class="modal-header">
        <h3>${escapeHtml(supplier.name)}</h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="flex gap-8 mt-8" style="margin-bottom:14px">
        ${supplier.phone ? `<a class="btn btn-outline btn-sm" href="tel:${escapeHtml(supplier.phone)}">${Icons.svg('phone', 16)} <span data-i18n="cust.call"></span></a>` : ''}
      </div>
      <div class="stat-grid" style="padding:0;margin-bottom:14px">
        <div class="stat-card stat-c2"><div class="stat-label" data-i18n="supplier.purchaseCount"></div><div class="stat-value">${summary.purchaseCount}</div></div>
        <div class="stat-card stat-c5"><div class="stat-label" data-i18n="supplier.totalOwed"></div><div class="stat-value">${Format.money(summary.totalOwed)}</div></div>
      </div>
      ${supplier.address ? `<p class="text-muted mt-8">${escapeHtml(supplier.address)}</p>` : ''}
      ${supplier.notes ? `<p class="text-muted mt-8">${escapeHtml(supplier.notes)}</p>` : ''}
      <button class="btn btn-outline btn-block mt-16" id="btn-view-purchases">${Icons.svg('purchase', 16)} <span data-i18n="supplier.viewPurchases"></span></button>
      <div class="flex gap-8 mt-8">
        <button class="btn btn-outline btn-block" id="btn-edit-sup">${Icons.svg('edit', 16)} <span data-i18n="common.edit"></span></button>
        <button class="btn btn-danger btn-block" id="btn-del-sup">${Icons.svg('trash', 16)} <span data-i18n="common.delete"></span></button>
      </div>
    `, { center: true });
    I18n.apply(sheet);

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    sheet.querySelector('#btn-view-purchases').onclick = () => { Modal.close(); Router.navigate('/purchases?supplierId=' + id); };
    sheet.querySelector('#btn-edit-sup').onclick = () => { Modal.close(); setTimeout(() => openForm(supplier), 200); };
    sheet.querySelector('#btn-del-sup').onclick = async () => {
      const ok = await Modal.confirm({ message: I18n.t('supplier.deleteConfirm'), danger: true });
      if (!ok) return;
      const res = await SupplierService.remove(id);
      if (!res.ok) {
        Toast.error(I18n.t('supplier.hasReferences'));
        return;
      }
      Modal.close();
      Toast.success(I18n.t('common.deleted'));
      loadList('');
    };
  }

  return { render, openDetail, openNew };
})();
