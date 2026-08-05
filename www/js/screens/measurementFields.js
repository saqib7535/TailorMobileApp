/* ============================================================
   MeasurementFieldsScreen — manage the dynamic field list for a
   single category (add/edit/delete, reorder via up/down). Reached
   from CategoriesScreen; Admin/Manager only (route + inline gated).
   ============================================================ */

const MeasurementFieldsScreen = (function () {
  function canManage() { return AuthService.hasRole('admin', 'manager'); }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  async function render(app, params) {
    const categoryId = parseInt(params.categoryId, 10);
    const category = await CategoryService.get(categoryId);
    if (!category) {
      app.innerHTML = '<div class="empty-state"><div class="ei">⚠️</div><p data-i18n="common.noResults"></p></div>';
      I18n.apply(app);
      return;
    }
    const editable = canManage();
    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <h1>${escapeHtml(category.name)}</h1>
        ${editable ? `<button class="icon-btn" id="btn-add-field">${Icons.svg('plus', 24)}</button>` : ''}
      </header>
      <p class="text-muted center mt-8" data-i18n="field.subtitle" style="padding:0 20px"></p>
      <div id="field-list" class="page-pad" style="padding-top:12px"></div>
    `;
    I18n.apply(app);
    app.querySelector('#btn-back').onclick = () => Router.navigate('/categories');
    if (editable) app.querySelector('#btn-add-field').onclick = () => openForm(categoryId);
    await loadList(categoryId);
  }

  async function loadList(categoryId) {
    const listEl = document.getElementById('field-list');
    if (!listEl) return;
    const editable = canManage();
    const rows = await MeasurementFieldService.listByCategory(categoryId);
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="ei">📏</div><p data-i18n="field.noFields"></p></div>`;
      I18n.apply(listEl);
      return;
    }
    listEl.innerHTML = `<div class="field-reorder-list">${rows.map((f, i) => rowHtml(f, i, rows.length, editable)).join('')}</div>`;
    I18n.apply(listEl);

    if (editable) {
      listEl.querySelectorAll('[data-edit-field]').forEach((el) => {
        el.onclick = async () => {
          const field = await MeasurementFieldService.get(parseInt(el.getAttribute('data-edit-field'), 10));
          openForm(categoryId, field);
        };
      });
      listEl.querySelectorAll('[data-up]').forEach((el) => {
        el.onclick = async (e) => { e.stopPropagation(); await move(categoryId, rows, parseInt(el.getAttribute('data-up'), 10), -1); };
      });
      listEl.querySelectorAll('[data-down]').forEach((el) => {
        el.onclick = async (e) => { e.stopPropagation(); await move(categoryId, rows, parseInt(el.getAttribute('data-down'), 10), 1); };
      });
    }
  }

  async function move(categoryId, rows, index, dir) {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const ids = rows.map((r) => r.id);
    const tmp = ids[index];
    ids[index] = ids[target];
    ids[target] = tmp;
    await MeasurementFieldService.reorder(categoryId, ids);
    loadList(categoryId);
  }

  function rowHtml(f, index, total, editable) {
    return `
      <div class="list-row field-row-item" ${editable ? `data-edit-field="${f.id}"` : ''} style="${editable ? '' : 'cursor:default'}">
        <div class="avatar">${Icons.svg('ready', 18)}</div>
        <div class="main">
          <div class="title">${escapeHtml(f.field_label)}${f.field_label_ur ? ` <span class="text-muted" dir="rtl">(${escapeHtml(f.field_label_ur)})</span>` : ''}</div>
          <div class="subtitle">${escapeHtml(f.field_key)} &middot; ${escapeHtml(f.unit)}</div>
        </div>
        ${editable ? `
        <div class="field-reorder-controls">
          <button class="icon-btn sm" data-up="${index}" ${index === 0 ? 'disabled' : ''}>&#9650;</button>
          <button class="icon-btn sm" data-down="${index}" ${index === total - 1 ? 'disabled' : ''}>&#9660;</button>
        </div>` : ''}
      </div>
    `;
  }

  function openForm(categoryId, existing) {
    const isEdit = !!existing;
    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="${isEdit ? 'field.edit' : 'field.add'}"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="field" id="f-key">
        <label data-i18n="field.key"></label>
        <input id="in-key" value="${existing ? existing.field_key : ''}" data-i18n-placeholder="field.keyHint" />
        <div class="error-msg" id="err-key" data-i18n="field.invalidKey"></div>
      </div>
      <div class="field" id="f-label">
        <label data-i18n="field.label"></label>
        <input id="in-label" value="${existing ? escapeHtml(existing.field_label) : ''}" />
        <div class="error-msg" data-i18n="common.requiredField"></div>
      </div>
      <div class="field">
        <label data-i18n="field.labelUrdu"></label>
        <input id="in-label-ur" dir="rtl" style="text-align:right;font-family:'Jameel Noori Nastaleeq','Noto Nastaliq Urdu',var(--font-main)" value="${existing ? escapeHtml(existing.field_label_ur || '') : ''}" data-i18n-placeholder="field.labelUrduHint" />
      </div>
      <div class="field">
        <label data-i18n="field.unit"></label>
        <input id="in-unit" value="${existing ? escapeHtml(existing.unit) : 'in'}" />
      </div>
      <div class="flex gap-8 mt-16">
        ${isEdit ? `<button class="btn btn-danger" id="btn-del-field">${Icons.svg('trash', 18)}</button>` : ''}
        <button class="btn btn-primary btn-block" id="btn-save-field" data-i18n="common.save"></button>
      </div>
    `);
    I18n.apply(sheet);

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    if (isEdit) {
      sheet.querySelector('#btn-del-field').onclick = async () => {
        const ok = await Modal.confirm({ message: I18n.t('field.deleteConfirm'), danger: true });
        if (!ok) return;
        await MeasurementFieldService.remove(existing.id);
        Modal.close();
        Toast.success(I18n.t('common.deleted'));
        loadList(categoryId);
      };
    }
    sheet.querySelector('#btn-save-field').onclick = async () => {
      const key = sheet.querySelector('#in-key').value.trim().toLowerCase();
      const label = sheet.querySelector('#in-label').value.trim();
      const labelUr = sheet.querySelector('#in-label-ur').value.trim();
      const unit = sheet.querySelector('#in-unit').value.trim() || 'in';
      const fLabel = sheet.querySelector('#f-label');
      fLabel.classList.toggle('invalid', !label);
      if (!label) return;

      const payload = { field_key: key, field_label: label, field_label_ur: labelUr || null, unit };
      const result = isEdit
        ? await MeasurementFieldService.update(existing.id, payload)
        : await MeasurementFieldService.create(categoryId, payload);

      if (!result.ok) {
        const fKey = sheet.querySelector('#f-key');
        const errEl = sheet.querySelector('#err-key');
        errEl.setAttribute('data-i18n', result.error === 'duplicateKey' ? 'field.duplicateKey' : 'field.invalidKey');
        I18n.apply(sheet);
        fKey.classList.add('invalid');
        return;
      }
      Toast.success(I18n.t('common.saved'));
      Modal.close();
      loadList(categoryId);
    };
  }

  return { render };
})();
