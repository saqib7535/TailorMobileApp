/* ============================================================
   Reports screen — pick a report type, view results, export PDF
   or print. Fully generic over ReportService's
   {title, columns, rows, totals} shape — this screen never has a
   switch statement over report type for rendering, only for which
   param inputs to show. Admin/Manager only, self-gated the same
   way ExpensesScreen/SuppliersScreen gate themselves in addition to
   the route-level role gate in app.js.
   ============================================================ */

const ReportsScreen = (function () {
  const TYPES = ReportService.REPORT_TYPES;
  // Report types that need extra input beyond "just run it" — every
  // other type (customer, category, supplierPurchases, orderStatus)
  // is an all-time/all-rows grouping with nothing to parameterize.
  const PARAM_TYPES = ['daily', 'weekly', 'monthly', 'yearly', 'revenue', 'delivered', 'expense', 'invoiceCustomer', 'invoiceDate', 'pending', 'inventory'];

  let currentType = 'daily';
  let currentReport = null;
  let customersCache = [];

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function needsParams(type) { return PARAM_TYPES.includes(type); }

  function customerOptions(includeAll) {
    const opts = includeAll ? [`<option value="" data-i18n="report.allCustomers"></option>`] : [];
    return opts.concat(customersCache.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)).join('');
  }

  function paramsHtml(type) {
    const today = Format.todayIso();
    const monthStart = today.slice(0, 8) + '01';

    if (type === 'daily' || type === 'weekly') {
      return `<div class="field"><label data-i18n="report.${type}"></label><input type="date" id="p-date" value="${today}" /></div>`;
    }
    if (type === 'monthly') {
      return `<div class="field"><label data-i18n="report.monthly"></label><input type="month" id="p-month" value="${today.slice(0, 7)}" /></div>`;
    }
    if (type === 'yearly') {
      return `<div class="field"><label data-i18n="report.yearly"></label><input type="number" id="p-year" value="${new Date().getFullYear()}" /></div>`;
    }
    if (type === 'revenue') {
      return `
        <div class="field-row">
          <div class="field"><label data-i18n="report.fromDate"></label><input type="date" id="p-from" value="${monthStart}" /></div>
          <div class="field"><label data-i18n="report.toDate"></label><input type="date" id="p-to" value="${today}" /></div>
        </div>
        <div class="field" style="margin-bottom:0">
          <label data-i18n="report.groupBy"></label>
          <select id="p-groupby">
            <option value="day" data-i18n="report.day"></option>
            <option value="week" data-i18n="report.week"></option>
            <option value="month" data-i18n="report.month"></option>
            <option value="year" data-i18n="report.year"></option>
          </select>
        </div>`;
    }
    if (type === 'delivered' || type === 'expense') {
      return `
        <div class="field-row">
          <div class="field"><label data-i18n="report.fromDate"></label><input type="date" id="p-from" value="${monthStart}" /></div>
          <div class="field"><label data-i18n="report.toDate"></label><input type="date" id="p-to" value="${today}" /></div>
        </div>`;
    }
    if (type === 'invoiceCustomer') {
      return `
        <div class="field"><label data-i18n="report.selectCustomer"></label><select id="p-customer">${customerOptions(false)}</select></div>
        <div class="field-row">
          <div class="field"><label data-i18n="report.fromDate"></label><input type="date" id="p-from" /></div>
          <div class="field"><label data-i18n="report.toDate"></label><input type="date" id="p-to" value="${today}" /></div>
        </div>`;
    }
    if (type === 'invoiceDate') {
      return `
        <div class="field-row">
          <div class="field"><label data-i18n="report.fromDate"></label><input type="date" id="p-from" value="${monthStart}" /></div>
          <div class="field"><label data-i18n="report.toDate"></label><input type="date" id="p-to" value="${today}" /></div>
        </div>
        <div class="field" style="margin-bottom:0"><label data-i18n="report.selectCustomer"></label><select id="p-customer">${customerOptions(true)}</select></div>`;
    }
    if (type === 'pending') {
      return `
        <div class="field" style="margin-bottom:0">
          <label data-i18n="report.sortBy"></label>
          <select id="p-sortby">
            <option value="amount" data-i18n="report.byAmount"></option>
            <option value="age" data-i18n="report.byAge"></option>
          </select>
        </div>`;
    }
    if (type === 'inventory') {
      return `<div class="checkbox-row"><input type="checkbox" id="p-lowstock" /><label for="p-lowstock" data-i18n="report.lowStockOnly"></label></div>`;
    }
    return '';
  }

  function readParams(type) {
    if (type === 'daily' || type === 'weekly') return { date: document.getElementById('p-date').value };
    if (type === 'monthly') return { yearMonth: document.getElementById('p-month').value };
    if (type === 'yearly') return { year: document.getElementById('p-year').value };
    if (type === 'revenue') {
      return {
        from: document.getElementById('p-from').value,
        to: document.getElementById('p-to').value,
        groupBy: document.getElementById('p-groupby').value
      };
    }
    if (type === 'delivered' || type === 'expense') {
      return { from: document.getElementById('p-from').value, to: document.getElementById('p-to').value };
    }
    if (type === 'invoiceCustomer') {
      return {
        customerId: parseInt(document.getElementById('p-customer').value, 10),
        from: document.getElementById('p-from').value || null,
        to: document.getElementById('p-to').value || null
      };
    }
    if (type === 'invoiceDate') {
      const custVal = document.getElementById('p-customer').value;
      return {
        from: document.getElementById('p-from').value,
        to: document.getElementById('p-to').value,
        customerId: custVal ? parseInt(custVal, 10) : null
      };
    }
    if (type === 'pending') return { sortBy: document.getElementById('p-sortby').value };
    if (type === 'inventory') return { lowStockOnly: document.getElementById('p-lowstock').checked };
    return {};
  }

  async function render(app) {
    if (!AuthService.hasRole('admin', 'manager')) {
      app.innerHTML = '<div class="empty-state"><div class="ei">🔒</div><p data-i18n="common.notAuthorized"></p></div>';
      I18n.apply(app);
      return;
    }

    customersCache = await CustomerService.list();

    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn back-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <h1 data-i18n="report.title"></h1>
      </header>
      <div class="tabs" id="type-tabs">
        ${TYPES.map((t) => `<div class="tab-chip ${t.key === currentType ? 'active' : ''}" data-type="${t.key}" data-i18n="${t.labelKey}"></div>`).join('')}
      </div>
      <div class="page-pad">
        <div class="card" id="params-card" style="margin-bottom:14px"></div>
        <div id="report-summary" class="stat-grid" style="padding:0;margin-bottom:14px"></div>
        <div class="flex gap-8" style="margin-bottom:14px">
          <button class="btn btn-outline btn-block" id="btn-print">${Icons.svg('printer', 16)} <span data-i18n="common.print"></span></button>
          <button class="btn btn-primary btn-block" id="btn-export-pdf">${Icons.svg('download', 16)} <span data-i18n="report.exportPdf"></span></button>
        </div>
        <div class="card report-table-wrap">
          <div id="report-table"></div>
        </div>
      </div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-back').onclick = () => Router.navigate('/more');

    app.querySelectorAll('#type-tabs .tab-chip').forEach((el) => {
      el.onclick = () => {
        currentType = el.getAttribute('data-type');
        app.querySelectorAll('#type-tabs .tab-chip').forEach((c) => c.classList.remove('active'));
        el.classList.add('active');
        renderParams();
        runReport();
      };
    });

    app.querySelector('#btn-print').onclick = () => openPreview();
    app.querySelector('#btn-export-pdf').onclick = () => openPreview();

    renderParams();
    await runReport();
  }

  function renderParams() {
    const card = document.getElementById('params-card');
    if (!needsParams(currentType)) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    card.innerHTML = paramsHtml(currentType) + `<button class="btn btn-primary btn-block mt-16" id="btn-run" data-i18n="report.generate"></button>`;
    I18n.apply(card);
    card.querySelector('#btn-run').onclick = runReport;
  }

  async function runReport() {
    if (currentType === 'invoiceCustomer' && !customersCache.length) {
      currentReport = { title: I18n.t('report.invoiceCustomer'), columns: [], rows: [], totals: [] };
      renderSummary(currentReport);
      renderTable(currentReport);
      return;
    }
    const params = needsParams(currentType) ? readParams(currentType) : {};
    currentReport = await ReportService.generate(currentType, params);
    renderSummary(currentReport);
    renderTable(currentReport);
  }

  function renderSummary(report) {
    const el = document.getElementById('report-summary');
    const palette = ['stat-c1', 'stat-c3', 'stat-c5', 'stat-c7'];
    el.innerHTML = (report.totals || []).map((t, i) => `
      <div class="stat-card ${palette[i % palette.length]}">
        <div class="stat-value">${t.money ? Format.money(t.value) : t.value}</div>
        <div class="stat-label">${escapeHtml(t.label)}</div>
      </div>
    `).join('');
  }

  function renderTable(report) {
    const el = document.getElementById('report-table');
    if (!report.rows.length) {
      el.innerHTML = `<div class="empty-state"><div class="ei">${Icons.svg('reports', 40)}</div><p data-i18n="report.noData"></p></div>`;
      I18n.apply(el);
      return;
    }
    el.innerHTML = `
      <table class="data-table">
        <thead><tr>${report.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
        <tbody>
          ${report.rows.map((r) => `<tr>${report.columns.map((c) => `<td>${c.money ? Format.money(r[c.key]) : escapeHtml(r[c.key])}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  async function openPreview() {
    if (!currentReport || !currentReport.rows.length) { Toast.error(I18n.t('report.noData')); return; }
    await Documents.openReportPreview(currentReport);
  }

  return { render };
})();
