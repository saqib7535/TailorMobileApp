/* ============================================================
   More screen — hub for secondary/admin features reachable from
   the bottom nav's "More" tab. Phase 1 kept this minimal: change
   password, language toggle, license status, logout. Phase 2 adds
   the Categories entry point (garment-type + measurement-field
   management) — it's Admin/Manager only, so the row is hidden for
   other roles via AuthService.hasRole rather than just relying on
   the route-level role gate. Phase 4 adds Suppliers/Purchases/
   Inventory/Expenses — all back-office, Admin/Manager only, and
   all reached from here rather than the bottom nav since none of
   them are daily-counter screens. Phase 5 adds Reports, same
   Admin/Manager-only treatment. Phase 6 (final) adds Users
   (Admin-only, hidden here in addition to the route-level gate),
   and Settings/Backup (Admin+Manager reachable, but each screen
   renders itself view-only for Manager rather than the row being
   hidden — see AppSettingsScreen/BackupScreen).
   ============================================================ */

const MoreScreen = (function () {
  function menuItem(icon, titleKey, descKey, id) {
    return `
      <div class="list-row" data-menu="${id}" style="margin:0 16px 10px">
        <div class="avatar">${Icons.svg(icon, 20)}</div>
        <div class="main">
          <div class="title" data-i18n="${titleKey}"></div>
          <div class="subtitle" data-i18n="${descKey}"></div>
        </div>
        ${Icons.svg('chevron', 18, 'text-muted')}
      </div>
    `;
  }

  async function render(app) {
    const user = AuthService.currentUser();
    app.innerHTML = `
      <header class="app-header">
        <h1 data-i18n="more.title"></h1>
      </header>
      <div class="page" style="padding-top:12px">
        ${menuItem('scissors', 'more.measurements', 'more.measurementsDesc', 'measurements')}
        ${AuthService.hasRole('admin', 'manager') ? menuItem('shirt', 'more.categories', 'more.categoriesDesc', 'categories') : ''}
        ${AuthService.hasRole('admin', 'manager') ? menuItem('scissors', 'more.fabricTypes', 'more.fabricTypesDesc', 'fabric-types') : ''}
        ${AuthService.hasRole('admin', 'manager') ? menuItem('scissors', 'more.designOptions', 'more.designOptionsDesc', 'design-options') : ''}
        ${AuthService.hasRole('admin', 'manager') ? menuItem('supplier', 'more.suppliers', 'more.suppliersDesc', 'suppliers') : ''}
        ${AuthService.hasRole('admin', 'manager') ? menuItem('purchase', 'more.purchases', 'more.purchasesDesc', 'purchases') : ''}
        ${AuthService.hasRole('admin', 'manager') ? menuItem('inventory', 'more.inventory', 'more.inventoryDesc', 'inventory') : ''}
        ${AuthService.hasRole('admin', 'manager') ? menuItem('expense', 'more.expenses', 'more.expensesDesc', 'expenses') : ''}
        ${AuthService.hasRole('admin', 'manager') ? menuItem('reports', 'more.reports', 'more.reportsDesc', 'reports') : ''}
        ${AuthService.hasRole('admin') ? menuItem('user', 'more.users', 'more.usersDesc', 'users') : ''}
        ${AuthService.hasRole('admin', 'manager') ? menuItem('settings', 'more.settings', 'more.settingsDesc', 'app-settings') : ''}
        ${AuthService.hasRole('admin', 'manager') ? menuItem('backup', 'more.backup', 'more.backupDesc', 'backup') : ''}
        ${menuItem('language', 'more.language', 'login.language', 'language')}
        ${menuItem('lock', 'more.license', 'more.licenseDesc', 'license')}
        ${menuItem('lock', 'more.changePassword', 'more.changePassword', 'change-password')}
        ${menuItem('logout', 'more.logout', 'more.logout', 'logout')}
        <p class="center text-muted mt-16" style="font-size:12px">${user ? '@' + user.username + (user.role ? ' · ' + user.role : '') + ' · ' : ''}<span data-i18n="more.version"></span> 1.0.0</p>
      </div>
    `;
    I18n.apply(app);

    app.querySelectorAll('[data-menu]').forEach((el) => {
      el.onclick = () => handleMenu(el.getAttribute('data-menu'));
    });
  }

  function handleMenu(id) {
    switch (id) {
      case 'measurements': Router.navigate('/measurements'); break;
      case 'categories': Router.navigate('/categories'); break;
      case 'fabric-types': Router.navigate('/fabric-types'); break;
      case 'design-options': Router.navigate('/design-options'); break;
      case 'suppliers': Router.navigate('/suppliers'); break;
      case 'purchases': Router.navigate('/purchases'); break;
      case 'inventory': Router.navigate('/inventory'); break;
      case 'expenses': Router.navigate('/expenses'); break;
      case 'reports': Router.navigate('/reports'); break;
      case 'users': Router.navigate('/users'); break;
      case 'app-settings': Router.navigate('/settings'); break;
      case 'backup': Router.navigate('/backup'); break;
      case 'language': openLanguagePicker(); break;
      case 'license': openLicenseInfo(); break;
      case 'change-password': openChangePassword(); break;
      case 'logout': doLogout(); break;
    }
  }

  function openLanguagePicker() {
    const langs = I18n.availableLanguages();
    const sheet = Modal.open(`
      <div class="modal-header"><h3 data-i18n="more.language"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="flex gap-8">
        ${langs.map((l) => `<button class="btn ${I18n.getLanguage() === l.code ? 'btn-primary' : 'btn-outline'} btn-block" data-lang="${l.code}">${l.label}</button>`).join('')}
      </div>
    `, { center: true });
    I18n.apply(sheet);
    sheet.querySelector('#m-close').onclick = () => Modal.close();
    sheet.querySelectorAll('[data-lang]').forEach((btn) => {
      btn.onclick = async () => {
        await I18n.setLanguage(btn.getAttribute('data-lang'));
        Modal.close();
        Router.navigate('/more');
      };
    });
  }

  function openLicenseInfo() {
    const status = LicenseService.getCachedStatus();
    const durationLabel = status.durationLabelKey ? I18n.t(status.durationLabelKey) : '—';
    const expiryLine = status.expiresAtMs == null
      ? I18n.t('license.expiresNever')
      : I18n.t('license.daysLeft', { days: status.daysLeft });

    const sheet = Modal.open(`
      <div class="modal-header"><h3 data-i18n="more.license"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="flex-between"><span class="text-muted" data-i18n="common.status"></span><b>${durationLabel}</b></div>
        <div class="flex-between mt-8"><span class="text-muted" data-i18n="license.expiresLabel"></span><b>${expiryLine}</b></div>
      </div>
      <div class="field" id="f-key">
        <label data-i18n="activation.placeholder"></label>
        <input id="in-new-key" data-i18n-placeholder="activation.placeholder" style="text-transform:uppercase;letter-spacing:.5px" />
        <div class="error-msg" data-i18n="activation.invalidKey"></div>
      </div>
      <button class="btn btn-primary btn-block" id="btn-reactivate" data-i18n="activation.activate"></button>
    `, { center: true });
    I18n.apply(sheet);
    const input = sheet.querySelector('#in-new-key');
    input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    sheet.querySelector('#btn-reactivate').onclick = async () => {
      const raw = input.value.trim();
      const fKey = sheet.querySelector('#f-key');
      if (!raw) { fKey.classList.add('invalid'); return; }
      const result = await LicenseService.activate(raw);
      if (!result.ok) { fKey.classList.add('invalid'); Toast.error(I18n.t('activation.invalidKey')); return; }
      Toast.success(I18n.t('activation.success'));
      Modal.close();
    };
  }

  async function doLogout() {
    const ok = await Modal.confirm({ message: I18n.t('more.logoutConfirm') });
    if (ok) AuthService.logout();
  }

  function openChangePassword() {
    const user = AuthService.currentUser();
    const sheet = Modal.open(`
      <div class="modal-header"><h3 data-i18n="login.changePassword"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="field"><label data-i18n="login.currentPassword"></label><input type="password" id="cp-current" /></div>
      <div class="field"><label data-i18n="login.newPassword"></label><input type="password" id="cp-new" /></div>
      <div class="field"><label data-i18n="login.confirmPassword"></label><input type="password" id="cp-confirm" /></div>
      <button class="btn btn-primary btn-block" id="cp-submit" data-i18n="common.confirm"></button>
    `, { center: true });
    I18n.apply(sheet);
    sheet.querySelector('#m-close').onclick = () => Modal.close();
    sheet.querySelector('#cp-submit').onclick = async () => {
      const current = sheet.querySelector('#cp-current').value;
      const next = sheet.querySelector('#cp-new').value;
      const confirmPw = sheet.querySelector('#cp-confirm').value;
      if (!current || !next) { Toast.error(I18n.t('common.requiredField')); return; }
      if (next !== confirmPw) { Toast.error(I18n.t('login.passwordMismatch')); return; }
      const res = await AuthService.changePassword(user.username, current, next);
      if (!res.ok) { Toast.error(res.error); return; }
      Toast.success(I18n.t('login.passwordChanged'));
      Modal.close();
    };
  }

  return { render };
})();
