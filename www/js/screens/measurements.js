/* ============================================================
   MeasurementsScreen — pick a customer (unless one is already
   scoped via the /measurements/:customerId route from the
   customer detail sheet) -> pick a category -> render the
   dynamic form from MeasurementService.getFormShape() -> save.
   Tailor gets full CRUD; Reception is view-only (inputs disabled,
   add/delete controls hidden); Admin/Manager get full CRUD too.
   ============================================================ */

const MeasurementsScreen = (function () {
  function canEdit() { return AuthService.hasRole('admin', 'manager', 'tailor'); }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  async function render(app, params) {
    const customerId = params && params.customerId ? parseInt(params.customerId, 10) : null;
    if (!customerId) {
      await renderCustomerPicker(app);
      return;
    }
    const customer = await CustomerService.get(customerId);
    if (!customer) {
      app.innerHTML = '<div class="empty-state"><div class="ei">⚠️</div><p data-i18n="common.noResults"></p></div>';
      I18n.apply(app);
      return;
    }
    await renderCustomerMeasurements(app, customer);
  }

  async function renderCustomerPicker(app) {
    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <h1 data-i18n="meas.selectCustomer"></h1>
      </header>
      <div class="search-bar">
        ${Icons.svg('search', 18)}
        <input type="text" id="pick-search" data-i18n-placeholder="cust.searchPlaceholder" />
      </div>
      <div id="pick-list"></div>
    `;
    I18n.apply(app);
    app.querySelector('#btn-back').onclick = () => Router.navigate('/customers');

    let debounce = null;
    app.querySelector('#pick-search').addEventListener('input', (e) => {
      clearTimeout(debounce);
      const val = e.target.value;
      debounce = setTimeout(() => loadPickList(val), 200);
    });
    await loadPickList('');
  }

  async function loadPickList(term) {
    const listEl = document.getElementById('pick-list');
    if (!listEl) return;
    const rows = await CustomerService.list({ search: term });
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="ei">${Icons.svg('customers', 40)}</div><p data-i18n="cust.noCustomers"></p></div>`;
      I18n.apply(listEl);
      return;
    }
    listEl.innerHTML = rows.map((c) => `
      <div class="list-row" data-id="${c.id}">
        <div class="avatar">${Format.initials(c.name)}</div>
        <div class="main">
          <div class="title">${escapeHtml(c.name)}</div>
          <div class="subtitle">${escapeHtml(c.phone || '')}</div>
        </div>
        ${Icons.svg('chevron', 18, 'text-muted')}
      </div>
    `).join('');
    listEl.querySelectorAll('.list-row').forEach((el) => {
      el.onclick = () => Router.navigate('/measurements/' + el.getAttribute('data-id'));
    });
  }

  async function renderCustomerMeasurements(app, customer) {
    const editable = canEdit();
    const categories = await CategoryService.listEnabled();
    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <h1>${escapeHtml(customer.name)}</h1>
      </header>
      <div class="section-header"><h2 data-i18n="meas.profiles"></h2></div>
      <div id="meas-list" class="page-pad"></div>
      ${editable && categories.length ? `
      <div class="page-pad mt-16">
        <div class="field">
          <label data-i18n="meas.selectCategory"></label>
          <select id="sel-category">
            ${categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary btn-block" id="btn-new-profile" data-i18n="meas.newProfile"></button>
      </div>` : ''}
    `;
    I18n.apply(app);
    app.querySelector('#btn-back').onclick = () => Router.navigate('/customers');
    if (editable && categories.length) {
      app.querySelector('#btn-new-profile').onclick = () => {
        const categoryId = parseInt(app.querySelector('#sel-category').value, 10);
        if (!categoryId) return;
        openMeasurementForm(customer, categoryId, null, editable);
      };
    }
    await loadMeasurements(customer, editable);
  }

  async function loadMeasurements(customer, editable) {
    const listEl = document.getElementById('meas-list');
    if (!listEl) return;
    const rows = await MeasurementService.listByCustomer(customer.id);
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="ei">📏</div><p data-i18n="meas.noProfiles"></p></div>`;
      I18n.apply(listEl);
      return;
    }
    listEl.innerHTML = rows.map((m) => `
      <div class="list-row" data-id="${m.id}" data-cat="${m.category_id}">
        <span class="color-dot" style="background:${m.category_color};width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-size:16px">${Icons.categoryEmoji(m.category_icon)}</span>
        <div class="main">
          <div class="title">${escapeHtml(m.category_name)}${m.profile_label ? ' &middot; ' + escapeHtml(m.profile_label) : ''}</div>
          <div class="subtitle">${Format.shortDate(m.updated_at)}</div>
        </div>
        ${Icons.svg('chevron', 18, 'text-muted')}
      </div>
    `).join('');
    listEl.querySelectorAll('.list-row').forEach((el) => {
      el.onclick = () => openMeasurementForm(
        customer,
        parseInt(el.getAttribute('data-cat'), 10),
        parseInt(el.getAttribute('data-id'), 10),
        editable
      );
    });
  }

  async function openMeasurementForm(customer, categoryId, measurementId, editable) {
    let existing = null;
    if (measurementId) existing = await MeasurementService.get(measurementId);
    let shape = await MeasurementService.getFormShape(categoryId, existing ? existing.values : null);
    const category = await CategoryService.get(categoryId);

    const sheet = Modal.open(`
      <div class="modal-header">
        <h3>${escapeHtml(category ? category.name : '')}</h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="field">
        <label data-i18n="meas.profileLabel"></label>
        <input id="in-profile-label" ${editable ? '' : 'disabled'} value="${existing ? escapeHtml(existing.profile_label || '') : ''}" data-i18n-placeholder="meas.profileLabelHint" />
      </div>
      ${editable ? `<p class="text-muted" style="font-size:11.5px;margin:-4px 0 8px" data-i18n="field.dblclickHint"></p>` : ''}
      <div class="dyn-form-grid" id="dyn-form-grid"></div>
      ${editable ? `<a class="link" id="btn-add-field-inline" style="display:inline-block;margin-top:4px">+ <span data-i18n="field.add"></span></a>` : ''}
      <div class="field mt-16">
        <label data-i18n="common.notes"></label>
        <textarea id="in-meas-notes" rows="2" ${editable ? '' : 'disabled'}>${existing ? escapeHtml(existing.notes || '') : ''}</textarea>
      </div>
      ${editable ? `
      <div class="flex gap-8 mt-16">
        ${existing ? `<button class="btn btn-danger" id="btn-del-meas">${Icons.svg('trash', 18)}</button>` : ''}
        <button class="btn btn-primary btn-block" id="btn-save-meas" data-i18n="common.save"></button>
      </div>` : ''}
    `);
    I18n.apply(sheet);

    // Collects whatever the person has typed so far, so re-rendering
    // the grid (after adding/editing/deleting a field definition)
    // never throws away values for the *other* fields.
    function collectTypedValues() {
      const values = {};
      sheet.querySelectorAll('.dyn-field-input').forEach((inp) => {
        const v = inp.value.trim();
        if (v !== '') values[inp.getAttribute('data-key')] = v;
      });
      return values;
    }

    function fieldItemHtml(f) {
      return `
        <div class="field dyn-field-item" data-field-id="${f.id}" data-field-key="${f.field_key}">
          <label class="dyn-field-label" style="cursor:pointer">${escapeHtml(MeasurementFieldService.label(f))} <span class="text-muted">(${escapeHtml(f.unit)})</span> ${editable ? `<button type="button" class="icon-btn sm btn-edit-field-inline" style="width:20px;height:20px;vertical-align:middle">${Icons.svg('edit', 12)}</button>` : ''}</label>
          <input class="dyn-field-input" data-key="${f.field_key}" type="number" step="0.1" ${editable ? '' : 'disabled'} value="${f.value != null ? f.value : ''}" />
          <div class="dyn-field-editor hidden" data-editor-for="${f.id}"></div>
        </div>`;
    }

    function renderGrid() {
      sheet.querySelector('#dyn-form-grid').innerHTML = shape.fields.map(fieldItemHtml).join('');
      I18n.apply(sheet);
      wireFieldEditors();
    }

    function fieldEditorHtml(f) {
      // f is null when adding a brand-new field (key becomes editable).
      const isNew = !f;
      return `
        <div class="card" style="margin-top:6px;background:var(--color-surface-alt)">
          ${isNew ? `
          <div class="field" style="margin-bottom:8px">
            <label data-i18n="field.key"></label>
            <input class="ed-key" data-i18n-placeholder="field.keyHint" />
          </div>` : ''}
          <div class="field" style="margin-bottom:8px">
            <label data-i18n="field.label"></label>
            <input class="ed-label" value="${!isNew ? escapeHtml(f.field_label) : ''}" />
          </div>
          <div class="field" style="margin-bottom:8px">
            <label data-i18n="field.labelUrdu"></label>
            <input class="ed-label-ur" dir="rtl" style="text-align:right;font-family:'Jameel Noori Nastaleeq','Noto Nastaliq Urdu',var(--font-main)" value="${!isNew ? escapeHtml(f.field_label_ur || '') : ''}" data-i18n-placeholder="field.labelUrduHint" />
          </div>
          <div class="field" style="margin-bottom:10px">
            <label data-i18n="field.unit"></label>
            <input class="ed-unit" value="${!isNew ? escapeHtml(f.unit) : 'in'}" />
          </div>
          <div class="flex gap-8">
            ${!isNew ? `<button type="button" class="btn btn-danger btn-sm ed-delete">${Icons.svg('trash', 15)}</button>` : ''}
            <button type="button" class="btn btn-outline btn-sm btn-block ed-cancel" data-i18n="common.cancel"></button>
            <button type="button" class="btn btn-primary btn-sm btn-block ed-save" data-i18n="common.save"></button>
          </div>
        </div>`;
    }

    function closeAllEditors() {
      sheet.querySelectorAll('.dyn-field-editor').forEach((el) => {
        el.classList.add('hidden');
        el.innerHTML = '';
        const item = el.closest('.dyn-field-item');
        if (item) item.style.gridColumn = '';
      });
    }

    function openFieldEditor(fieldId) {
      const isAddNew = fieldId === 'new';
      const f = isAddNew ? null : shape.fields.find((x) => x.id === fieldId);
      closeAllEditors();
      const target = isAddNew
        ? sheet.querySelector('#new-field-editor')
        : sheet.querySelector(`.dyn-field-editor[data-editor-for="${fieldId}"]`);
      if (!target) return;
      target.innerHTML = fieldEditorHtml(f);
      target.classList.remove('hidden');
      const item = target.closest('.dyn-field-item');
      if (item) item.style.gridColumn = '1 / -1';
      I18n.apply(target);

      target.querySelector('.ed-cancel').onclick = () => closeAllEditors();

      if (!isAddNew) {
        target.querySelector('.ed-delete').onclick = async () => {
          const ok = await Modal.confirm({ message: I18n.t('field.deleteConfirm'), danger: true });
          if (!ok) return;
          await MeasurementFieldService.remove(f.id);
          Toast.success(I18n.t('common.deleted'));
          const typed = collectTypedValues();
          delete typed[f.field_key];
          shape = await MeasurementService.getFormShape(categoryId, typed);
          renderGrid();
        };
      }

      target.querySelector('.ed-save').onclick = async () => {
        const label = target.querySelector('.ed-label').value.trim();
        if (!label) { target.querySelector('.ed-label').closest('.field').classList.add('invalid'); return; }
        const labelUr = target.querySelector('.ed-label-ur').value.trim();
        const unit = target.querySelector('.ed-unit').value.trim() || 'in';
        const typed = collectTypedValues();

        if (isAddNew) {
          const key = target.querySelector('.ed-key').value.trim().toLowerCase();
          const result = await MeasurementFieldService.create(categoryId, { field_key: key, field_label: label, field_label_ur: labelUr || null, unit });
          if (!result.ok) {
            Toast.error(I18n.t(result.error === 'duplicateKey' ? 'field.duplicateKey' : 'field.invalidKey'));
            return;
          }
        } else {
          await MeasurementFieldService.update(f.id, { field_label: label, field_label_ur: labelUr || null, unit });
        }
        Toast.success(I18n.t('common.saved'));
        shape = await MeasurementService.getFormShape(categoryId, typed);
        renderGrid();
      };
    }

    function wireFieldEditors() {
      sheet.querySelectorAll('.dyn-field-label').forEach((lbl) => {
        lbl.addEventListener('dblclick', () => {
          const id = parseInt(lbl.closest('.dyn-field-item').getAttribute('data-field-id'), 10);
          openFieldEditor(id);
        });
      });
      sheet.querySelectorAll('.btn-edit-field-inline').forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const id = parseInt(btn.closest('.dyn-field-item').getAttribute('data-field-id'), 10);
          openFieldEditor(id);
        };
      });
    }

    renderGrid();

    if (editable) {
      const addLink = sheet.querySelector('#btn-add-field-inline');
      if (addLink) {
        addLink.onclick = () => {
          let holder = sheet.querySelector('#new-field-editor');
          if (!holder) {
            holder = document.createElement('div');
            holder.id = 'new-field-editor';
            addLink.insertAdjacentElement('afterend', holder);
          }
          openFieldEditor('new');
        };
      }
    }

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    if (editable) {
      if (existing) {
        sheet.querySelector('#btn-del-meas').onclick = async () => {
          const ok = await Modal.confirm({ message: I18n.t('meas.deleteConfirm'), danger: true });
          if (!ok) return;
          await MeasurementService.remove(existing.id);
          Modal.close();
          Toast.success(I18n.t('common.deleted'));
          loadMeasurements(customer, editable);
        };
      }
      sheet.querySelector('#btn-save-meas').onclick = async () => {
        const values = Object.assign({}, shape.legacyValues, collectTypedValues());
        const data = {
          profile_label: sheet.querySelector('#in-profile-label').value.trim(),
          notes: sheet.querySelector('#in-meas-notes').value.trim(),
          values
        };
        if (existing) {
          await MeasurementService.update(existing.id, data);
        } else {
          await MeasurementService.create(customer.id, categoryId, data);
        }
        Toast.success(I18n.t('common.saved'));
        Modal.close();
        loadMeasurements(customer, editable);
      };
    }
  }

  return { render };
})();
