/* ============================================================
   Customers screen — list/search + add/edit/delete + a detail
   sheet that links into Measurements for that customer.
   Reception/Admin/Manager get full CRUD; Tailor is view-only, so
   the add/edit/delete controls are hidden (not just route-gated)
   based on AuthService.hasRole().

   openNew(onSaved) (Phase 3) opens the same add-customer sheet from
   outside this screen — e.g. the New Order screen's "+ Add New
   Customer" quick-add link — and reports the new id back through
   onSaved(id, data) instead of refreshing a Customers list that
   isn't on screen in that context.
   ============================================================ */

/* ============================================================
   Customers screen — list/search + add/edit/delete + a detail
   sheet that links into Measurements for that customer.
   Reception/Admin/Manager get full CRUD; Tailor is view-only, so
   the add/edit/delete controls are hidden (not just route-gated)
   based on AuthService.hasRole().

   Family tree: the top-level list only shows independent customers
   and family heads (CustomerService.listTopLevel groups members
   under their head). The detail sheet for a head lists its members
   with an "Add Family Member" action; a member's detail sheet shows
   which family/head it belongs to instead.

   openNew(onSaved, opts) (used by New Order's quick-add link) opens
   the same add-customer sheet from outside this screen and reports
   the new id back through onSaved(id, data) instead of refreshing a
   Customers list that isn't on screen in that context. opts.headCustomer
   pre-fills the "part of an existing family" picker.
   ============================================================ */

const CustomersScreen = (function () {
  let searchDebounce = null;

  const RELATIONS = ['Self', 'Wife', 'Husband', 'Son', 'Daughter', 'Brother', 'Sister', 'Father', 'Mother', 'Other'];

  function canEdit() { return AuthService.hasRole('admin', 'manager', 'reception'); }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  async function render(app) {
    const editable = canEdit();
    app.innerHTML = `
      <header class="app-header">
        <h1 data-i18n="cust.title"></h1>
        ${editable ? `<button class="icon-btn" id="btn-add-customer">${Icons.svg('plus', 24)}</button>` : ''}
      </header>
      <div class="search-bar">
        ${Icons.svg('search', 18)}
        <input type="text" id="cust-search" data-i18n-placeholder="cust.searchPlaceholder" />
      </div>
      <div id="cust-list"></div>
    `;
    I18n.apply(app);

    if (editable) app.querySelector('#btn-add-customer').onclick = () => openForm();

    app.querySelector('#cust-search').addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      const val = e.target.value;
      searchDebounce = setTimeout(() => loadList(val), 200);
    });

    await loadList('');
  }

  async function loadList(term) {
    const listEl = document.getElementById('cust-list');
    if (!listEl) return;
    const rows = await CustomerService.listTopLevel({ search: term });
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="ei">${Icons.svg('customers', 40)}</div><p data-i18n="cust.noCustomers"></p></div>`;
      I18n.apply(listEl);
      return;
    }
    listEl.innerHTML = rows.map(rowHtml).join('');
    I18n.apply(listEl);
    listEl.querySelectorAll('.list-row').forEach((el) => {
      el.onclick = () => openDetail(parseInt(el.getAttribute('data-id'), 10));
    });
  }

  function avatarHtml(c) {
    return c.photo_path
      ? `<div class="avatar" style="padding:0;overflow:hidden"><img src="${c.photo_path}" style="width:100%;height:100%;object-fit:cover" /></div>`
      : `<div class="avatar">${Format.initials(c.name)}</div>`;
  }

  function rowHtml(c) {
    return `
      <div class="list-row" data-id="${c.id}">
        ${avatarHtml(c)}
        <div class="main">
          <div class="title">${escapeHtml(c.name)} ${c.familyMemberCount ? `<span class="badge badge-muted">${Icons.svg('customers', 11)} ${c.familyMemberCount + 1}</span>` : ''}</div>
          <div class="subtitle">${escapeHtml(c.phone || '')}${c.familyMemberCount ? ` · <span data-i18n="cust.familyOf"></span>` : ''}</div>
        </div>
        ${Icons.svg('chevron', 18, 'text-muted')}
      </div>
    `;
  }

  // Opens the add-customer sheet outside of the Customers screen flow
  // (e.g. from the New Order screen's "quick add" link) — onSaved(id,
  // data) fires after a successful create instead of reloading the
  // Customers list, which wouldn't be on screen in that context.
  function openNew(onSaved, opts) {
    openForm(null, onSaved, opts && opts.headCustomer);
  }

  async function openForm(existing, onSaved, presetHead) {
    const isEdit = !!existing;
    let headCustomer = presetHead || null;
    if (isEdit && existing.head_customer_id) {
      headCustomer = await CustomerService.get(existing.head_customer_id);
    }

    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="${isEdit ? 'cust.editCustomer' : 'cust.addCustomer'}"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="center">
        <div id="cust-photo-preview" class="login-logo" style="cursor:pointer">${existing && existing.photo_path ? `<img src="${existing.photo_path}" style="width:100%;height:100%;object-fit:cover;border-radius:22px" />` : Icons.svg('camera', 26)}</div>
        <input type="file" accept="image/*" capture="environment" id="in-cust-photo" class="hidden" />
        <a class="link" id="btn-pick-cust-photo" data-i18n="cust.photo" style="display:inline-block;margin:6px 0 4px"></a>
      </div>
      <div class="field" id="f-name">
        <label data-i18n="cust.name"></label>
        <input id="in-name" value="${existing ? escapeHtml(existing.name) : ''}" />
        <div class="error-msg" data-i18n="common.requiredField"></div>
      </div>
      <div class="field-row">
        <div class="field" id="f-phone">
          <label data-i18n="cust.phone"></label>
          <input id="in-phone" type="tel" value="${existing ? escapeHtml(existing.phone || '') : ''}" />
          <div class="error-msg" data-i18n="common.invalidPhone"></div>
        </div>
        <div class="field">
          <label data-i18n="cust.whatsapp"></label>
          <input id="in-whatsapp" type="tel" value="${existing ? escapeHtml(existing.whatsapp || '') : ''}" data-i18n-placeholder="cust.sameAsPhone" />
        </div>
      </div>
      <div class="field">
        <label data-i18n="cust.address"></label>
        <textarea id="in-address" rows="2">${existing ? escapeHtml(existing.address || '') : ''}</textarea>
      </div>

      <div class="card" style="margin:14px 0">
        <div class="checkbox-row">
          <input type="checkbox" id="in-is-family" ${headCustomer ? 'checked' : ''} ${presetHead ? 'disabled' : ''} />
          <label for="in-is-family" style="margin:0;text-transform:none;font-weight:600" data-i18n="cust.partOfFamily"></label>
        </div>
        <div id="family-picker-wrap" style="display:${headCustomer ? 'block' : 'none'};margin-top:10px">
          <div id="family-head-picker"></div>
          <div class="field mt-8">
            <label data-i18n="cust.relation"></label>
            <select id="in-relation">
              ${RELATIONS.map((r) => `<option value="${r}" ${existing && existing.relation === r ? 'selected' : ''} data-i18n="relation.${r}"></option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div class="field">
        <label data-i18n="cust.notes"></label>
        <textarea id="in-notes" rows="2">${existing ? escapeHtml(existing.notes || '') : ''}</textarea>
      </div>
      <button class="btn btn-primary btn-block" id="btn-save-customer" data-i18n="common.save"></button>
    `);
    I18n.apply(sheet);

    function renderFamilyHeadPicker() {
      const el = sheet.querySelector('#family-head-picker');
      if (!el) return;
      if (headCustomer) {
        el.innerHTML = `
          <div class="list-row" style="margin:0">
            <div class="avatar">${Format.initials(headCustomer.name)}</div>
            <div class="main"><div class="title">${escapeHtml(headCustomer.name)}</div></div>
            ${presetHead ? '' : `<button class="btn btn-sm btn-outline" id="btn-change-head" type="button" data-i18n="common.edit"></button>`}
          </div>`;
        I18n.apply(el);
        const changeBtn = el.querySelector('#btn-change-head');
        if (changeBtn) changeBtn.onclick = () => { headCustomer = null; renderFamilyHeadPicker(); };
        return;
      }
      el.innerHTML = `<input type="text" id="head-search" data-i18n-placeholder="order.searchCustomer" /><div id="head-suggestions" style="margin-top:8px"></div>`;
      I18n.apply(el);
      let debounce = null;
      el.querySelector('#head-search').addEventListener('input', (e) => {
        clearTimeout(debounce);
        const val = e.target.value;
        debounce = setTimeout(async () => {
          const rows = val.trim() ? await CustomerService.list({ search: val }) : [];
          const filtered = rows.filter((r) => !existing || r.id !== existing.id);
          const box = sheet.querySelector('#head-suggestions');
          if (!box) return;
          box.innerHTML = filtered.slice(0, 6).map((c) => `
            <div class="list-row" style="margin:0 0 8px" data-pick="${c.id}">
              <div class="avatar">${Format.initials(c.name)}</div>
              <div class="main"><div class="title">${escapeHtml(c.name)}</div><div class="subtitle">${escapeHtml(c.phone || '')}</div></div>
            </div>`).join('');
          box.querySelectorAll('[data-pick]').forEach((row) => {
            row.onclick = () => {
              const id = parseInt(row.getAttribute('data-pick'), 10);
              headCustomer = filtered.find((r) => r.id === id);
              renderFamilyHeadPicker();
            };
          });
        }, 200);
      });
    }
    renderFamilyHeadPicker();

    sheet.querySelector('#in-is-family').addEventListener('change', (e) => {
      sheet.querySelector('#family-picker-wrap').style.display = e.target.checked ? 'block' : 'none';
      if (!e.target.checked) headCustomer = null;
    });

    let photoDataUrl = existing && existing.photo_path ? existing.photo_path : null;
    sheet.querySelector('#btn-pick-cust-photo').onclick = () => sheet.querySelector('#in-cust-photo').click();
    sheet.querySelector('#cust-photo-preview').onclick = () => sheet.querySelector('#in-cust-photo').click();
    sheet.querySelector('#in-cust-photo').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        photoDataUrl = reader.result;
        sheet.querySelector('#cust-photo-preview').innerHTML = `<img src="${photoDataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:22px" />`;
      };
      reader.readAsDataURL(file);
    });

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    sheet.querySelector('#btn-save-customer').onclick = async () => {
      const name = sheet.querySelector('#in-name').value.trim();
      const fName = sheet.querySelector('#f-name');
      fName.classList.toggle('invalid', !name);

      const phone = sheet.querySelector('#in-phone').value.trim();
      const phoneDigits = phone.replace(/\D/g, '');
      const phoneInvalid = phone.length > 0 && phoneDigits.length < 7;
      sheet.querySelector('#f-phone').classList.toggle('invalid', phoneInvalid);

      const isFamily = sheet.querySelector('#in-is-family').checked;
      if (!name || phoneInvalid || (isFamily && !headCustomer)) return;

      const data = {
        name,
        photo_path: photoDataUrl,
        phone,
        whatsapp: sheet.querySelector('#in-whatsapp').value.trim(),
        address: sheet.querySelector('#in-address').value.trim(),
        notes: sheet.querySelector('#in-notes').value.trim(),
        head_customer_id: isFamily && headCustomer ? headCustomer.id : null,
        relation: isFamily ? sheet.querySelector('#in-relation').value : null
      };

      let newId = existing ? existing.id : null;
      if (isEdit) {
        await CustomerService.update(existing.id, data);
      } else {
        newId = await CustomerService.create(data);
      }
      Toast.success(I18n.t('common.saved'));
      Modal.close();
      if (onSaved) {
        onSaved(newId, data);
      } else {
        const searchInput = document.getElementById('cust-search');
        if (searchInput) loadList(searchInput.value);
      }
    };
  }

  async function openDetail(id) {
    const customer = await CustomerService.get(id);
    if (!customer) return;
    const summary = await CustomerService.getSummary(id);
    const ledger = await CustomerService.getLedger(id);
    const editable = canEdit();
    const isHead = !customer.head_customer_id;
    const family = await CustomerService.getFamilyGroup(id);
    const members = isHead ? family.members : [];
    const headName = !isHead ? (await CustomerService.get(customer.head_customer_id) || {}).name : null;

    const sheet = Modal.open(`
      <div class="modal-header">
        <h3>${escapeHtml(customer.name)}</h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      ${!isHead ? `<p class="text-muted" style="margin-top:-6px"><span data-i18n="cust.familyMemberOf"></span> <b>${escapeHtml(headName || '')}</b> · ${I18n.t('relation.' + (customer.relation || 'Other'))}</p>` : ''}
      <div class="flex gap-8 mt-8" style="margin-bottom:14px">
        ${customer.phone ? `<a class="btn btn-outline btn-sm" href="tel:${escapeHtml(customer.phone)}">${Icons.svg('phone', 16)} <span data-i18n="cust.call"></span></a>` : ''}
        ${(customer.whatsapp || customer.phone) ? `<a class="btn btn-outline btn-sm" target="_blank" rel="noopener" href="https://wa.me/${Format.toWhatsappNumber(customer.whatsapp || customer.phone)}">${Icons.svg('whatsapp', 16)} <span data-i18n="cust.whatsappBtn"></span></a>` : ''}
      </div>
      <div class="stat-grid" style="padding:0;margin-bottom:14px">
        <div class="stat-card stat-c1"><div class="stat-label" data-i18n="cust.measurements"></div><div class="stat-value">${summary.measurementCount}</div></div>
        <div class="stat-card stat-c2"><div class="stat-label" data-i18n="nav.orders"></div><div class="stat-value">${summary.orderCount}</div></div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <div class="card-title" data-i18n="cust.ledger"></div>
        <div class="flex-between mt-8"><span class="text-muted" data-i18n="cust.totalBilled"></span><b>${Format.money(ledger.totalBilled)}</b></div>
        <div class="flex-between mt-8"><span class="text-muted" data-i18n="cust.totalPaid"></span><b style="color:var(--color-success)">${Format.money(ledger.totalPaid)}</b></div>
        <div class="flex-between mt-8" style="font-size:15px;font-weight:800"><span data-i18n="cust.totalRemaining"></span><b style="color:${ledger.totalRemaining > 0 ? 'var(--color-danger)' : 'var(--color-success)'}">${Format.money(ledger.totalRemaining)}</b></div>
        ${ledger.orders.length ? `
        <div style="margin-top:12px;border-top:1px solid var(--color-border);padding-top:10px">
          ${ledger.orders.slice(0, 5).map((o) => `
            <div class="flex-between" style="font-size:12.5px;margin-bottom:6px;cursor:pointer" data-open-order="${o.id}">
              <span class="text-muted">${escapeHtml(o.invoice_no)} · ${Format.shortDate(o.order_date)}</span>
              <b>${Format.money(o.grand_total)}${o.remaining_balance > 0 ? ` <span style="color:var(--color-danger)">(-${Format.money(o.remaining_balance)})</span>` : ''}</b>
            </div>`).join('')}
        </div>` : ''}
      </div>

      ${customer.address ? `<p class="text-muted mt-8">${escapeHtml(customer.address)}</p>` : ''}
      ${customer.notes ? `<p class="text-muted mt-8">${escapeHtml(customer.notes)}</p>` : ''}

      ${isHead ? `
      <div class="section-header" style="padding:14px 0 8px">
        <h2 data-i18n="cust.familyMembers"></h2>
        ${editable ? `<a class="link" id="btn-add-member">+ <span data-i18n="cust.addFamilyMember"></span></a>` : ''}
      </div>
      <div id="family-members-list">
        ${members.length ? members.map((m) => `
          <div class="list-row" data-member="${m.id}" style="margin-bottom:6px">
            ${avatarHtml(m)}
            <div class="main"><div class="title">${escapeHtml(m.name)}</div><div class="subtitle">${I18n.t('relation.' + (m.relation || 'Other'))}${m.phone ? ' · ' + escapeHtml(m.phone) : ''}</div></div>
            ${Icons.svg('chevron', 16, 'text-muted')}
          </div>`).join('') : `<p class="text-muted" style="font-size:13px" data-i18n="cust.noFamilyMembers"></p>`}
      </div>` : ''}

      <button class="btn btn-outline btn-block mt-16" id="btn-open-meas">${Icons.svg('scissors', 16)} <span data-i18n="cust.measurements"></span></button>
      ${editable ? `
      <div class="flex gap-8 mt-8">
        <button class="btn btn-outline btn-block" id="btn-edit-cust">${Icons.svg('edit', 16)} <span data-i18n="common.edit"></span></button>
        <button class="btn btn-danger btn-block" id="btn-del-cust">${Icons.svg('trash', 16)} <span data-i18n="common.delete"></span></button>
      </div>` : ''}
    `, { center: true });
    I18n.apply(sheet);

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    sheet.querySelector('#btn-open-meas').onclick = () => { Modal.close(); Router.navigate('/measurements/' + id); };
    sheet.querySelectorAll('[data-open-order]').forEach((row) => {
      row.onclick = () => { Modal.close(); Router.navigate('/orders/' + row.getAttribute('data-open-order')); };
    });

    sheet.querySelectorAll('[data-member]').forEach((row) => {
      row.onclick = () => { Modal.close(); setTimeout(() => openDetail(parseInt(row.getAttribute('data-member'), 10)), 150); };
    });

    const addMemberBtn = sheet.querySelector('#btn-add-member');
    if (addMemberBtn) {
      addMemberBtn.onclick = () => {
        Modal.close();
        setTimeout(() => openForm(null, () => openDetail(id), { id: customer.id, name: customer.name }), 200);
      };
    }

    if (editable) {
      sheet.querySelector('#btn-edit-cust').onclick = () => { Modal.close(); setTimeout(() => openForm(customer), 200); };
      sheet.querySelector('#btn-del-cust').onclick = async () => {
        const ok = await Modal.confirm({ message: I18n.t('cust.deleteConfirm'), danger: true });
        if (!ok) return;
        const res = await CustomerService.remove(id);
        if (!res.ok) {
          Toast.error(I18n.t(res.summary && res.summary.familyMemberCount ? 'cust.hasFamilyMembers' : 'cust.hasReferences'));
          return;
        }
        Modal.close();
        Toast.success(I18n.t('common.deleted'));
        loadList('');
      };
    }
  }

  return { render, openDetail, openNew };
})();
