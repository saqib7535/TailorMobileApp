/* ============================================================
   Dashboard screen — the Home tab. Stat cards for today's/month's
   numbers, role-gated quick actions, and two compact recent-activity
   lists (due soon, recent orders/payments).

   Role gating: "New Order" is hidden for Tailor, matching
   OrdersScreen.canCreate()'s roles exactly. "Add Customer" is hidden
   for Tailor too — CustomersScreen only hides its own add button for
   non-editable roles but CustomersScreen.openNew() itself has no
   role guard, so gating the quick action here (mirroring
   CustomersScreen.canEdit()'s roles) is required, not just cosmetic,
   to avoid a Tailor bypassing the Customers screen's read-only UI via
   this shortcut.
   ============================================================ */

const DashboardScreen = (function () {
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function canCreateOrder() { return AuthService.hasRole('admin', 'manager', 'reception'); }
  function canManageCustomers() { return AuthService.hasRole('admin', 'manager', 'reception'); }

  function statCard(cls, icon, labelKey, value) {
    return `
      <div class="stat-card ${cls}">
        <div class="stat-icon">${Icons.svg(icon, 20)}</div>
        <div>
          <div class="stat-value">${value}</div>
          <div class="stat-label" data-i18n="${labelKey}"></div>
        </div>
      </div>
    `;
  }

  function quickBtn(color, icon, labelKey, action) {
    return `
      <div class="quick-btn" data-action="${action}">
        <div class="qi" style="background:${color}">${icon}</div>
        <span class="label" data-i18n="${labelKey}"></span>
      </div>
    `;
  }

  function orderRowHtml(o, useDeliveryDate) {
    return `
      <div class="list-row" data-order="${o.id}">
        <div class="avatar">${Format.initials(o.customer_name)}</div>
        <div class="main">
          <div class="title">${escapeHtml(o.invoice_no)}</div>
          <div class="subtitle">${escapeHtml(o.customer_name)} &middot; ${Format.shortDate(useDeliveryDate ? o.delivery_date : o.order_date)}</div>
        </div>
        <div class="end">
          ${o.grand_total != null ? `<div class="amount">${Format.money(o.grand_total)}</div>` : ''}
          <span class="${Format.statusBadgeClass(o.status)}">${I18n.t('status.' + o.status)}</span>
        </div>
      </div>
    `;
  }

  function paymentRowHtml(p) {
    return `
      <div class="list-row" style="cursor:default">
        <div class="avatar">${Icons.svg('money', 18)}</div>
        <div class="main">
          <div class="title">${escapeHtml(p.customer_name)}</div>
          <div class="subtitle">${escapeHtml(p.invoice_no)} &middot; ${Format.dateTime(p.paid_at)}</div>
        </div>
        <div class="end"><div class="amount">${Format.money(p.amount)}</div></div>
      </div>
    `;
  }

  async function render(app) {
    const [stats, recentOrders, recentPayments, dueSoon] = await Promise.all([
      DashboardService.getStats(),
      DashboardService.getRecentOrders(5),
      DashboardService.getRecentPayments(5),
      DashboardService.getDueSoonOrders(5)
    ]);

    const showNewOrder = canCreateOrder();
    const showNewCustomer = canManageCustomers();

    app.innerHTML = `
      <header class="app-header">
        <h1 data-i18n="nav.dashboard"></h1>
      </header>
      <div class="page" style="padding-bottom:8px">
        <div class="stat-grid">
          ${statCard('stat-c2', 'orders', 'dash.todayOrders', stats.todayOrders)}
          ${statCard('stat-c3', 'money', 'dash.todayRevenue', Format.money(stats.todayRevenue))}
          ${statCard('stat-c1', 'calendar', 'dash.monthRevenue', Format.money(stats.monthRevenue))}
          ${statCard('stat-c5', 'alert', 'dash.outstandingDues', Format.money(stats.outstandingDues))}
          ${statCard('stat-c4', 'inventory', 'dash.lowStock', stats.lowStockCount)}
          ${statCard('stat-c7', 'truck', 'dash.pendingOrders', stats.pendingOrders)}
        </div>

        ${(showNewOrder || showNewCustomer) ? `
        <div class="section-header"><h2 data-i18n="dash.quickActions"></h2></div>
        <div class="quick-grid">
          ${showNewOrder ? quickBtn('linear-gradient(135deg,#c9972c,#a67821)', Icons.svg('plus', 18), 'dash.newOrder', 'new-order') : ''}
          ${showNewCustomer ? quickBtn('linear-gradient(135deg,#2563eb,#1d4ed8)', Icons.svg('customers', 18), 'dash.newCustomer', 'new-customer') : ''}
        </div>` : ''}

        <div class="section-header">
          <h2 data-i18n="dash.dueSoon"></h2>
          <a class="link" id="link-view-orders" data-i18n="dash.viewAll"></a>
        </div>
        <div class="page-pad" id="due-soon-list">
          ${dueSoon.length ? dueSoon.map((o) => orderRowHtml(o, true)).join('') : `<div class="empty-state"><div class="ei">${Icons.svg('truck', 36)}</div><p data-i18n="dash.noDueSoon"></p></div>`}
        </div>

        <div class="section-header"><h2 data-i18n="dash.recentOrders"></h2></div>
        <div class="page-pad" id="recent-orders-list">
          ${recentOrders.length ? recentOrders.map((o) => orderRowHtml(o, false)).join('') : `<div class="empty-state"><div class="ei">${Icons.svg('orders', 36)}</div><p data-i18n="order.noOrders"></p></div>`}
        </div>

        <div class="section-header"><h2 data-i18n="dash.recentPayments"></h2></div>
        <div class="page-pad" id="recent-payments-list">
          ${recentPayments.length ? recentPayments.map(paymentRowHtml).join('') : `<div class="empty-state"><div class="ei">${Icons.svg('money', 36)}</div><p data-i18n="dash.noPayments"></p></div>`}
        </div>
      </div>
    `;
    I18n.apply(app);

    app.querySelector('#link-view-orders').onclick = () => Router.navigate('/orders');
    app.querySelectorAll('#due-soon-list [data-order], #recent-orders-list [data-order]').forEach((el) => {
      el.onclick = () => Router.navigate('/orders/' + el.getAttribute('data-order'));
    });
    app.querySelectorAll('.quick-btn').forEach((el) => {
      el.onclick = () => handleQuickAction(el.getAttribute('data-action'));
    });
  }

  function handleQuickAction(action) {
    switch (action) {
      case 'new-order': Router.navigate('/orders/new'); break;
      case 'new-customer':
        Router.navigate('/customers');
        setTimeout(() => { if (typeof CustomersScreen !== 'undefined' && CustomersScreen.openNew) CustomersScreen.openNew(); }, 120);
        break;
    }
  }

  return { render };
})();
