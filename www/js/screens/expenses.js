/* ============================================================
   Expenses screen — date-range + category filter, a running total
   of the filtered set shown prominently, and add/edit/delete via
   modal. Admin/Manager only, same defense-in-depth gate as the
   other Phase 4 screens. Structurally modeled on the sibling
   DryClean POS project's expenses.js (same domain, same shape),
   adapted to this project's i18n/category conventions.
   ============================================================ */

const ExpensesScreen = (function () {
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // exp.cat.<Category> translates the fixed CATEGORIES list; falls back
  // to the raw stored value for any legacy/unrecognized category text
  // (the column is free-text, not an FK, so this is defensive rather
  // than expected in normal use).
  function categoryLabel(cat) {
    return ExpenseService.CATEGORIES.includes(cat) ? I18n.t('exp.cat.' + cat) : cat;
  }

  function monthRange() {
    const today = Format.todayIso();
    return { from: today.slice(0, 8) + '01', to: today };
  }

  async function render(app) {
    if (!AuthService.hasRole('admin', 'manager')) {
      app.innerHTML = '<div class="empty-state"><div class="ei">🔒</div><p data-i18n="common.notAuthorized"></p></div>';
      I18n.apply(app);
      return;
    }

    const range = monthRange();
    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn back-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <h1 data-i18n="exp.title"></h1>
        <button class="icon-btn" id="btn-add-exp">${Icons.svg('plus', 24)}</button>
      </header>
      <div class="page-pad" style="padding-top:12px">
        <div class="card">
          <div class="field-row">
            <div class="field"><label data-i18n="exp.dateFrom"></label><input type="date" id="exp-from" value="${range.from}" /></div>
            <div class="field"><label data-i18n="exp.dateTo"></label><input type="date" id="exp-to" value="${range.to}" /></div>
          </div>
          <div class="field" style="margin-bottom:0">
            <label data-i18n="exp.category"></label>
            <select id="exp-category">
              <option value="" data-i18n="exp.allCategories"></option>
              ${ExpenseService.CATEGORIES.map((c) => `<option value="${c}">${categoryLabel(c)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="stat-grid" style="padding:14px 0" id="exp-summary"></div>
        <div id="exp-list"></div>
      </div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-back').onclick = () => Router.navigate('/more');
    app.querySelector('#btn-add-exp').onclick = () => openForm();
    app.querySelector('#exp-from').addEventListener('change', loadList);
    app.querySelector('#exp-to').addEventListener('change', loadList);
    app.querySelector('#exp-category').addEventListener('change', loadList);

    await loadList();
  }

  function currentFilters() {
    return {
      dateFrom: document.getElementById('exp-from').value,
      dateTo: document.getElementById('exp-to').value,
      category: document.getElementById('exp-category').value
    };
  }

  async function loadList() {
    const listEl = document.getElementById('exp-list');
    const summaryEl = document.getElementById('exp-summary');
    if (!listEl) return;
    const filters = currentFilters();
    const rows = await ExpenseService.list(filters);
    const total = await ExpenseService.getTotal(filters);

    summaryEl.innerHTML = `
      <div class="stat-card stat-c5"><div class="stat-label" data-i18n="exp.total"></div><div class="stat-value">${Format.money(total)}</div></div>
      <div class="stat-card stat-c8"><div class="stat-label" data-i18n="exp.count"></div><div class="stat-value">${rows.length}</div></div>
    `;
    I18n.apply(summaryEl);

    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="ei">${Icons.svg('expense', 40)}</div><p data-i18n="exp.noExpenses"></p></div>`;
      I18n.apply(listEl);
      return;
    }
    listEl.innerHTML = rows.map(rowHtml).join('');
    listEl.querySelectorAll('[data-edit]').forEach((el) => {
      el.onclick = async () => {
        const exp = await ExpenseService.get(parseInt(el.getAttribute('data-edit'), 10));
        if (exp) openForm(exp);
      };
    });
  }

  function rowHtml(e) {
    return `
      <div class="list-row" data-edit="${e.id}">
        <div class="avatar">${Icons.svg('expense', 20)}</div>
        <div class="main">
          <div class="title">${escapeHtml(categoryLabel(e.category))}</div>
          <div class="subtitle">${escapeHtml(e.description || '')}${e.description ? ' &middot; ' : ''}${Format.shortDate(e.expense_date)}</div>
        </div>
        <div class="end"><div class="amount">${Format.money(e.amount)}</div></div>
      </div>
    `;
  }

  function categoryOptions(selected) {
    return ExpenseService.CATEGORIES.map((c) => `<option value="${c}" ${c === selected ? 'selected' : ''}>${categoryLabel(c)}</option>`).join('');
  }

  function openForm(existing) {
    const isEdit = !!existing;
    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="${isEdit ? 'exp.editExpense' : 'exp.addExpense'}"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="field-row">
        <div class="field">
          <label data-i18n="common.date"></label>
          <input type="date" id="in-date" value="${existing ? existing.expense_date : Format.todayIso()}" />
        </div>
        <div class="field">
          <label data-i18n="exp.category"></label>
          <select id="in-category">${categoryOptions(existing ? existing.category : 'Rent')}</select>
        </div>
      </div>
      <div class="field" id="f-amount">
        <label data-i18n="exp.amount"></label>
        <input type="number" min="0" step="0.01" id="in-amount" value="${existing ? existing.amount : ''}" />
        <div class="error-msg" data-i18n="common.requiredField"></div>
      </div>
      <div class="field">
        <label data-i18n="exp.description"></label>
        <textarea id="in-desc" rows="2">${existing ? escapeHtml(existing.description || '') : ''}</textarea>
      </div>
      <div class="field">
        <label data-i18n="exp.paymentMethod"></label>
        <select id="in-method">
          <option value="Cash" data-i18n="payment.Cash"></option>
          <option value="Card" data-i18n="payment.Card"></option>
          <option value="Bank Transfer" data-i18n="payment.Bank Transfer"></option>
          <option value="Other" data-i18n="payment.Other"></option>
        </select>
      </div>
      <div class="flex gap-8 mt-16">
        ${isEdit ? `<button class="btn btn-danger" id="btn-del-exp">${Icons.svg('trash', 18)}</button>` : ''}
        <button class="btn btn-primary btn-block" id="btn-save-exp" data-i18n="common.save"></button>
      </div>
    `, { center: true });
    I18n.apply(sheet);
    if (existing) sheet.querySelector('#in-method').value = existing.payment_method;

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    if (isEdit) {
      sheet.querySelector('#btn-del-exp').onclick = async () => {
        const ok = await Modal.confirm({ message: I18n.t('exp.deleteConfirm'), danger: true });
        if (!ok) return;
        await ExpenseService.remove(existing.id);
        Modal.close();
        Toast.success(I18n.t('common.deleted'));
        loadList();
      };
    }
    sheet.querySelector('#btn-save-exp').onclick = async () => {
      const amount = parseFloat(sheet.querySelector('#in-amount').value);
      const fAmount = sheet.querySelector('#f-amount');
      fAmount.classList.toggle('invalid', !amount || amount <= 0);
      if (!amount || amount <= 0) return;
      const data = {
        expense_date: sheet.querySelector('#in-date').value || Format.todayIso(),
        category: sheet.querySelector('#in-category').value,
        description: sheet.querySelector('#in-desc').value.trim(),
        amount,
        payment_method: sheet.querySelector('#in-method').value
      };
      if (isEdit) await ExpenseService.update(existing.id, data);
      else await ExpenseService.create(data);
      Toast.success(I18n.t('common.saved'));
      Modal.close();
      loadList();
    };
  }

  return { render };
})();
