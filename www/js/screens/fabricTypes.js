/* ============================================================
   FabricTypesScreen — manage the shop's fabric catalog (Cotton,
   Wash n Wear, Latha, ...) used as a dropdown on order items.
   Admin/Manager only.
   ============================================================ */

const FabricTypesScreen = (function () {
  function canManage() { return AuthService.hasRole('admin', 'manager'); }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  async function render(app) {
    const editable = canManage();
    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <h1 data-i18n="fabric.title"></h1>
        ${editable ? `<button class="icon-btn" id="btn-add">${Icons.svg('plus', 24)}</button>` : ''}
      </header>
      <p class="text-muted center mt-8" data-i18n="fabric.subtitle" style="padding:0 20px"></p>
      <div id="fabric-list" class="page-pad" style="padding-top:12px"></div>
    `;
    I18n.apply(app);
    app.querySelector('#btn-back').onclick = () => Router.navigate('/more');
    if (editable) app.querySelector('#btn-add').onclick = () => openForm();
    await loadList();
  }

  async function loadList() {
    const listEl = document.getElementById('fabric-list');
    if (!listEl) return;
    const editable = canManage();
    const rows = await FabricTypeService.list();
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="ei">🧵</div><p data-i18n="fabric.noneYet"></p></div>`;
      I18n.apply(listEl);
      return;
    }
    listEl.innerHTML = rows.map((f) => `
      <div class="list-row" ${editable ? `data-edit="${f.id}"` : ''} style="${editable ? '' : 'cursor:default'};${f.enabled ? '' : 'opacity:.5'}">
        <div class="avatar">${Icons.svg('scissors', 18)}</div>
        <div class="main">
          <div class="title">${escapeHtml(f.name)}${f.name_ur ? ` <span class="text-muted" dir="rtl">(${escapeHtml(f.name_ur)})</span>` : ''}</div>
          ${!f.enabled ? `<div class="subtitle" data-i18n="common.disabled"></div>` : ''}
        </div>
        ${editable ? Icons.svg('chevron', 18, 'text-muted') : ''}
      </div>
    `).join('');
    I18n.apply(listEl);
    if (editable) {
      listEl.querySelectorAll('[data-edit]').forEach((el) => {
        el.onclick = async () => openForm(await FabricTypeService.get(parseInt(el.getAttribute('data-edit'), 10)));
      });
    }
  }

  function openForm(existing) {
    const isEdit = !!existing;
    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="${isEdit ? 'fabric.edit' : 'fabric.add'}"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="field" id="f-name">
        <label data-i18n="fabric.name"></label>
        <input id="in-name" value="${existing ? escapeHtml(existing.name) : ''}" />
        <div class="error-msg" data-i18n="common.requiredField"></div>
      </div>
      <div class="field">
        <label data-i18n="fabric.nameUrdu"></label>
        <input id="in-name-ur" dir="rtl" style="text-align:right;font-family:'Jameel Noori Nastaleeq','Noto Nastaliq Urdu',var(--font-main))" value="${existing ? escapeHtml(existing.name_ur || '') : ''}" />
      </div>
      ${isEdit ? `
      <div class="checkbox-row">
        <input type="checkbox" id="in-enabled" ${existing.enabled ? 'checked' : ''} />
        <label for="in-enabled" style="margin:0;text-transform:none;font-weight:600" data-i18n="common.enabled"></label>
      </div>` : ''}
      <div class="flex gap-8 mt-16">
        ${isEdit ? `<button class="btn btn-danger" id="btn-del">${Icons.svg('trash', 18)}</button>` : ''}
        <button class="btn btn-primary btn-block" id="btn-save" data-i18n="common.save"></button>
      </div>
    `);
    I18n.apply(sheet);

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    if (isEdit) {
      sheet.querySelector('#btn-del').onclick = async () => {
        const ok = await Modal.confirm({ message: I18n.t('fabric.deleteConfirm'), danger: true });
        if (!ok) return;
        await FabricTypeService.remove(existing.id);
        Modal.close();
        Toast.success(I18n.t('common.deleted'));
        loadList();
      };
    }
    sheet.querySelector('#btn-save').onclick = async () => {
      const name = sheet.querySelector('#in-name').value.trim();
      sheet.querySelector('#f-name').classList.toggle('invalid', !name);
      if (!name) return;
      const payload = {
        name,
        name_ur: sheet.querySelector('#in-name-ur').value.trim() || null,
        enabled: isEdit ? sheet.querySelector('#in-enabled').checked : true
      };
      if (isEdit) await FabricTypeService.update(existing.id, payload);
      else await FabricTypeService.create(payload);
      Toast.success(I18n.t('common.saved'));
      Modal.close();
      loadList();
    };
  }

  return { render };
})();
