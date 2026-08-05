/* ============================================================
   App bootstrap — DB/i18n init, route registration, shell wiring.

   Phase 1 scope: /activation, /login, /dashboard (placeholder), /more.

   Phase 2 scope: added /customers (full CRUD), /categories +
   /measurement-fields/:categoryId (garment-type + dynamic field
   management, Admin/Manager only — reached from the More menu, not
   the bottom nav, to keep it compact), and /measurements(/:customerId)
   (dynamic per-category measurement profiles).

   Phase 3 scope: adds /orders (list, now the primary bottom-nav slot
   since it's the busiest daily screen), /orders/new (Admin/Manager/
   Reception only — role-gated here in addition to the "+" entry
   point being hidden from Tailor in orders.js, as defense in depth),
   /orders/search, and /orders/:id (full detail — status pipeline,
   payments, delivery). Bottom nav is now Home/Orders/Customers/More.

   Phase 4 scope: adds /suppliers, /purchases(+/new,/:id), /inventory
   and /expenses — all back-office (Admin/Manager only) and all
   reached from the More menu rather than the bottom nav, same
   treatment as /categories in Phase 2.

   Phase 5 scope: replaces the Phase 1 PlaceholderScreen stand-in at
   /dashboard with the real DashboardScreen (stat cards, monthly
   sales chart, recent activity), and adds /reports (Admin/Manager
   only, reached from the More menu like the Phase 4 back-office
   screens rather than the bottom nav).

   Phase 6 scope (final): adds /users (Admin only — staff account
   management), /settings (Admin full access, Manager view-only —
   shop profile, tax/currency, language/theme/auto-logout, license
   status, reset-to-factory) and /backup (Admin full access, Manager
   view-only — manual backup/restore, auto-backup toggle, history).
   Also wires the auto-logout-minutes setting into AuthService (it
   existed as a stubbed timer since Phase 1 but nothing ever told it
   what the configured timeout was until now), runs the once-daily
   silent auto-backup, and seeds Format's currency symbol from
   settings so it's correct everywhere, not just on printed documents.
   ============================================================ */

(async function () {
  const splash = document.getElementById('boot-splash');

  function renderShell() {
    document.body.insertAdjacentHTML('beforeend', `
      <nav class="bottom-nav hidden" id="bottom-nav">
        <div class="nav-item" data-nav="dashboard">${Icons.svg('home', 21, 'ni')}<span data-i18n="nav.dashboard"></span></div>
        <div class="nav-item" data-nav="orders">${Icons.svg('orders', 21, 'ni')}<span data-i18n="nav.orders"></span></div>
        <div class="nav-item" data-nav="customers">${Icons.svg('customers', 21, 'ni')}<span data-i18n="nav.customers"></span></div>
        <div class="nav-item" data-nav="more">${Icons.svg('more', 21, 'ni')}<span data-i18n="nav.more"></span></div>
      </nav>
    `);

    document.querySelectorAll('#bottom-nav .nav-item').forEach((el) => {
      el.addEventListener('click', () => Router.navigate('/' + el.getAttribute('data-nav')));
    });

    I18n.apply(document.getElementById('bottom-nav'));
    I18n.on(() => I18n.apply(document.getElementById('bottom-nav')));
  }

  function registerRoutes() {
    Router.register('/activation', ActivationScreen.render, { auth: false });
    Router.register('/login', LoginScreen.render, { auth: false, guestOnly: true });
    Router.register('/dashboard', DashboardScreen.render, { auth: true, navKey: 'dashboard' });
    Router.register('/orders', OrdersScreen.renderList, { auth: true, navKey: 'orders' });
    Router.register('/orders/new', NewOrderScreen.render, { auth: true, navKey: 'orders', roles: ['admin', 'manager', 'reception'] });
    Router.register('/orders/search', OrderSearchScreen.render, { auth: true, navKey: 'orders' });
    Router.register('/orders/:id/edit', NewOrderScreen.render, { auth: true, navKey: 'orders', roles: ['admin', 'manager', 'reception'] });
    Router.register('/orders/:id', OrdersScreen.renderDetail, { auth: true, navKey: 'orders' });
    Router.register('/customers', CustomersScreen.render, { auth: true, navKey: 'customers' });
    Router.register('/categories', CategoriesScreen.render, { auth: true, roles: ['admin', 'manager'] });
    Router.register('/fabric-types', FabricTypesScreen.render, { auth: true, roles: ['admin', 'manager'] });
    Router.register('/design-options', DesignOptionsScreen.render, { auth: true, roles: ['admin', 'manager'] });
    Router.register('/measurement-fields/:categoryId', MeasurementFieldsScreen.render, { auth: true, roles: ['admin', 'manager'] });
    Router.register('/measurements', MeasurementsScreen.render, { auth: true });
    Router.register('/measurements/:customerId', MeasurementsScreen.render, { auth: true });
    Router.register('/suppliers', SuppliersScreen.render, { auth: true, roles: ['admin', 'manager'] });
    Router.register('/purchases', PurchasesScreen.renderList, { auth: true, roles: ['admin', 'manager'] });
    Router.register('/purchases/new', NewPurchaseScreen.render, { auth: true, roles: ['admin', 'manager'] });
    Router.register('/purchases/:id', PurchasesScreen.renderDetail, { auth: true, roles: ['admin', 'manager'] });
    Router.register('/inventory', InventoryScreen.render, { auth: true, roles: ['admin', 'manager'] });
    Router.register('/expenses', ExpensesScreen.render, { auth: true, roles: ['admin', 'manager'] });
    Router.register('/reports', ReportsScreen.render, { auth: true, roles: ['admin', 'manager'] });
    Router.register('/users', UsersScreen.render, { auth: true, roles: ['admin'] });
    Router.register('/settings', AppSettingsScreen.render, { auth: true, roles: ['admin', 'manager'] });
    Router.register('/backup', BackupScreen.render, { auth: true, roles: ['admin', 'manager'] });
    Router.register('/more', MoreScreen.render, { auth: true, navKey: 'more' });
    Router.setNotFound(async (app) => {
      app.innerHTML = '<div class="empty-state"><div class="ei">🔍</div><p data-i18n="common.noResults"></p></div>';
      I18n.apply(app);
    });
  }

  try {
    await I18n.init();
    await DB.init();
    await LicenseService.touch();
    await ThemeManager.initFromSettings();
    AuthService.setAutoLogoutHandler(() => Toast.info('Session expired — please sign in again'));
    AuthService.setAutoLogoutMinutes(parseInt(await SettingsService.get('auto_logout_minutes', '0'), 10) || 0);
    Format.setCurrencySymbol(await SettingsService.get('currency', 'Rs.'));
    BackupService.maybeRunAutoBackup().catch((e) => console.warn('Auto-backup skipped', e));

    renderShell();
    registerRoutes();
    Router.start();
    BackButtonHandler.init();

    // Catch expiry while the app is left open on one screen, not just on navigation.
    setInterval(() => {
      if (!LicenseService.isValidCached() && Router.getCurrentPath() !== '/activation') {
        Router.navigate('/activation');
      }
    }, 60000);
  } catch (err) {
    console.error('Bootstrap failed', err);
    document.getElementById('app').innerHTML =
      '<div class="empty-state"><div class="ei">⚠️</div><p>Failed to start app: ' + (err && err.message) + '</p></div>';
  } finally {
    if (splash) splash.remove();
  }
})();
