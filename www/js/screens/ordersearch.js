/* ============================================================
   Order search screen — filter by invoice #, customer name/phone,
   status and date range. Reuses OrdersScreen.rowHtml/wireRows for
   the results list so the row markup stays in one place.
   ============================================================ */

const OrderSearchScreen = (function () {
  async function render(app) {
    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn back-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <h1 data-i18n="order.searchTitle"></h1>
      </header>
      <div class="page page-pad" style="padding-top:14px">
        <button class="btn btn-accent btn-block" id="btn-scan" style="margin-bottom:14px">${Icons.svg('qr', 16)} <span data-i18n="scan.openCamera"></span></button>
        <div class="card" style="margin-bottom:14px">
          <div class="field"><label data-i18n="order.searchByInvoice"></label><input id="f-invoice" /></div>
          <div class="field-row">
            <div class="field"><label data-i18n="order.searchByCustomer"></label><input id="f-customer" /></div>
            <div class="field"><label data-i18n="order.searchByPhone"></label><input id="f-phone" type="tel" /></div>
          </div>
          <div class="field">
            <label data-i18n="common.status"></label>
            <select id="f-status">
              <option value="" data-i18n="common.all"></option>
              ${OrderService.ALL_STATUSES.map((s) => `<option value="${s}">${I18n.t('status.' + s)}</option>`).join('')}
            </select>
          </div>
          <div class="field-row">
            <div class="field"><label data-i18n="order.dateFrom"></label><input id="f-date-from" type="date" /></div>
            <div class="field"><label data-i18n="order.dateTo"></label><input id="f-date-to" type="date" /></div>
          </div>
          <div class="flex gap-8">
            <button class="btn btn-outline btn-block" id="btn-clear" data-i18n="order.clearFilters"></button>
            <button class="btn btn-primary btn-block" id="btn-search" data-i18n="common.search"></button>
          </div>
        </div>
        <div id="search-results"></div>
      </div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-back').onclick = () => Router.navigate('/orders');
    app.querySelector('#btn-search').onclick = runSearch;
    app.querySelector('#btn-scan').onclick = () => {
      Scanner.open(async (text) => {
        const rows = await OrderService.search({ query: text.trim() });
        if (rows.length === 1) {
          Router.navigate('/orders/' + rows[0].id);
        } else if (rows.length > 1) {
          document.getElementById('f-invoice').value = text.trim();
          runSearch();
        } else {
          document.getElementById('f-invoice').value = text.trim();
          Toast.error(I18n.t('scan.notFound'));
        }
      });
    };
    app.querySelector('#btn-clear').onclick = () => {
      ['#f-invoice', '#f-customer', '#f-phone', '#f-status', '#f-date-from', '#f-date-to'].forEach((sel) => { app.querySelector(sel).value = ''; });
      document.getElementById('search-results').innerHTML = '';
    };
    ['#f-invoice', '#f-customer', '#f-phone'].forEach((sel) => {
      app.querySelector(sel).addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });
    });
  }

  // OrderService.search() takes a single free-text `query` that's
  // OR-matched against invoice_no/customer name/phone/whatsapp
  // (see orderService.js) rather than one clause per field, so the
  // three text boxes below feed the same slot — whichever one the
  // user actually filled in wins, in invoice -> name -> phone order.
  async function runSearch() {
    const invoice = document.getElementById('f-invoice').value.trim();
    const customer = document.getElementById('f-customer').value.trim();
    const phone = document.getElementById('f-phone').value.trim();
    const status = document.getElementById('f-status').value;
    const dateFrom = document.getElementById('f-date-from').value;
    const dateTo = document.getElementById('f-date-to').value;

    const rows = await OrderService.search({
      query: invoice || customer || phone,
      status,
      dateFrom,
      dateTo
    });

    const box = document.getElementById('search-results');
    if (!rows.length) {
      box.innerHTML = `<div class="empty-state"><div class="ei">🔍</div><p data-i18n="order.noOrders"></p></div>`;
      I18n.apply(box);
      return;
    }
    box.innerHTML = rows.map(OrdersScreen.rowHtml).join('');
    OrdersScreen.wireRows(box);
  }

  return { render };
})();
