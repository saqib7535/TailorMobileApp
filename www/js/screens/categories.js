/* ============================================================
   Categories screen — garment-type management (enable/disable,
   add/edit/delete) plus a link into MeasurementFieldsScreen per
   category. Admin/Manager only — the route itself is role-gated
   in app.js, but the mutating controls are also hidden here via
   AuthService.hasRole() as defense in depth.
   ============================================================ */

const CategoriesScreen = (function () {
  const PALETTE = ['#7c2d3c', '#0891b2', '#475569', '#6d28d9', '#db2777', '#4b5563', '#b45309', '#78350f', '#16a34a', '#64748b', '#0d9488', '#dc2626'];

  function canManage() { return AuthService.hasRole('admin', 'manager'); }

  async function render(app) {
    const editable = canManage();
    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <h1 data-i18n="cat.title"></h1>
        ${editable ? `<button class="icon-btn" id="btn-add-cat">${Icons.svg('plus', 24)}</button>` : ''}
      </header>
      <div id="cat-list" class="page-pad" style="padding-top:12px"></div>
    `;
    I18n.apply(app);
    app.querySelector('#btn-back').onclick = () => Router.navigate('/more');
    if (editable) app.querySelector('#btn-add-cat').onclick = () => openForm();
    await loadList();
  }

  async function loadList() {
    const listEl = document.getElementById('cat-list');
    if (!listEl) return;
    const editable = canManage();
    const rows = await CategoryService.list();
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="ei">🧵</div><p data-i18n="cat.noCategories"></p></div>`;
      I18n.apply(listEl);
      return;
    }
    listEl.innerHTML = rows.map((c) => rowHtml(c, editable)).join('');
    I18n.apply(listEl);

    if (editable) {
      listEl.querySelectorAll('[data-edit]').forEach((el) => {
        el.onclick = async () => {
          const cat = await CategoryService.get(parseInt(el.getAttribute('data-edit'), 10));
          openForm(cat);
        };
      });
      listEl.querySelectorAll('[data-toggle]').forEach((el) => {
        el.onclick = async (e) => {
          e.stopPropagation();
          const id = parseInt(el.getAttribute('data-toggle'), 10);
          const enabled = el.getAttribute('data-enabled') === '1';
          await CategoryService.setEnabled(id, !enabled);
          loadList();
        };
      });
    }
    listEl.querySelectorAll('[data-fields]').forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        Router.navigate('/measurement-fields/' + el.getAttribute('data-fields'));
      };
    });
  }

  function rowHtml(c, editable) {
    return `
      <div class="card flex-between" style="margin-bottom:10px;${editable ? 'cursor:pointer' : ''}" ${editable ? `data-edit="${c.id}"` : ''}>
        <div class="flex gap-8" style="align-items:center">
          <span class="color-dot" style="background:${c.color};width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px">${Icons.categoryEmoji(c.icon)}</span>
          <div>
            <div style="font-weight:700">${c.name}</div>
            <div class="text-muted" style="font-size:12.5px">${Format.money(c.default_price)}</div>
          </div>
        </div>
        <div class="flex gap-8" style="align-items:center">
          <button class="btn btn-sm btn-outline" data-fields="${c.id}" data-i18n="field.manage"></button>
          ${editable ? `<button class="btn btn-sm ${c.enabled ? 'btn-success' : 'btn-outline'}" data-toggle="${c.id}" data-enabled="${c.enabled}">${c.enabled ? I18n.t('cat.enabled') : I18n.t('common.no')}</button>` : ''}
        </div>
      </div>
    `;
  }

  function openForm(existing) {
    const isEdit = !!existing;
    const selectedIcon = existing ? existing.icon : 'shirt';
    const selectedColor = existing ? existing.color : PALETTE[0];

    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="${isEdit ? 'cat.editCategory' : 'cat.addCategory'}"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="field" id="f-name">
        <label data-i18n="cat.name"></label>
        <input id="in-name" value="${existing ? existing.name : ''}" />
        <div class="error-msg" data-i18n="common.requiredField"></div>
      </div>
      <div class="field">
        <label data-i18n="cat.defaultPrice"></label>
        <input id="in-price" type="number" min="0" step="1" value="${existing ? existing.default_price : 0}" />
      </div>
      <div class="field">
        <label data-i18n="cat.icon"></label>
        <div class="swatch-row" id="icon-row">
          ${Object.keys(Icons.CATEGORY_EMOJI).map((k) => `<span class="swatch ${k === selectedIcon ? 'selected' : ''}" data-icon="${k}" style="background:var(--color-surface-alt);display:flex;align-items:center;justify-content:center;font-size:16px">${Icons.categoryEmoji(k)}</span>`).join('')}
        </div>
      </div>
      <div class="field">
        <label data-i18n="cat.color"></label>
        <div class="swatch-row" id="color-row">
          ${PALETTE.map((c) => `<span class="swatch ${c === selectedColor ? 'selected' : ''}" data-color="${c}" style="background:${c}"></span>`).join('')}
        </div>
      </div>
      <div class="checkbox-row mt-8">
        <input type="checkbox" id="in-enabled" ${!existing || existing.enabled ? 'checked' : ''} />
        <label for="in-enabled" style="margin:0;text-transform:none;font-weight:500" data-i18n="cat.enabled"></label>
      </div>
      <div class="flex gap-8 mt-16">
        ${isEdit ? `<button class="btn btn-danger" id="btn-del-cat">${Icons.svg('trash', 18)}</button>` : ''}
        <button class="btn btn-primary btn-block" id="btn-save-cat" data-i18n="common.save"></button>
      </div>
    `);
    I18n.apply(sheet);

    let icon = selectedIcon;
    let color = selectedColor;
    sheet.querySelectorAll('#icon-row .swatch').forEach((el) => {
      el.onclick = () => {
        sheet.querySelectorAll('#icon-row .swatch').forEach((s) => s.classList.remove('selected'));
        el.classList.add('selected');
        icon = el.getAttribute('data-icon');
      };
    });
    sheet.querySelectorAll('#color-row .swatch').forEach((el) => {
      el.onclick = () => {
        sheet.querySelectorAll('#color-row .swatch').forEach((s) => s.classList.remove('selected'));
        el.classList.add('selected');
        color = el.getAttribute('data-color');
      };
    });

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    if (isEdit) {
      sheet.querySelector('#btn-del-cat').onclick = async () => {
        const ok = await Modal.confirm({ message: I18n.t('cat.deleteConfirm'), danger: true });
        if (!ok) return;
        const result = await CategoryService.remove(existing.id);
        Modal.close();
        Toast.success(result.hardDeleted ? I18n.t('common.deleted') : I18n.t('cat.disabledInstead'));
        loadList();
      };
    }
    sheet.querySelector('#btn-save-cat').onclick = async () => {
      const name = sheet.querySelector('#in-name').value.trim();
      const fName = sheet.querySelector('#f-name');
      fName.classList.toggle('invalid', !name);
      if (!name) return;
      const data = {
        name,
        icon,
        color,
        default_price: parseFloat(sheet.querySelector('#in-price').value) || 0,
        enabled: sheet.querySelector('#in-enabled').checked
      };
      if (isEdit) await CategoryService.update(existing.id, data);
      else await CategoryService.create(data);
      Toast.success(I18n.t('common.saved'));
      Modal.close();
      loadList();
    };
  }

  return { render };
})();
