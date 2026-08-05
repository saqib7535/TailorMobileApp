/* ============================================================
   Login screen
   ============================================================ */

const LoginScreen = (function () {
  function langBtn(code, label) {
    const active = I18n.getLanguage() === code;
    return `<button type="button" class="btn btn-sm ${active ? 'btn-primary' : 'btn-outline'}" data-lang="${code}">${label}</button>`;
  }

  async function render(app) {
    const shopName = await SettingsService.get('shop_name', 'Tailor Shop POS');

    app.innerHTML = `
      <div class="login-screen">
        <div class="login-card">
          <div class="login-logo">${Icons.svg('scissors', 32)}</div>
          <div class="login-shopname">${shopName}</div>
          <div class="login-tag" data-i18n="app.tagline"></div>

          <div class="lang-switch" id="lang-switch">
            ${langBtn('en', 'English')}
            ${langBtn('ur', 'اردو')}
          </div>

          <form id="login-form" novalidate>
            <div class="field" id="f-username">
              <label data-i18n="login.username"></label>
              <input type="text" id="in-username" autocomplete="username" />
              <div class="error-msg" data-i18n="common.requiredField"></div>
            </div>
            <div class="field" id="f-password">
              <label data-i18n="login.password"></label>
              <div class="input-group">
                <input type="password" id="in-password" autocomplete="current-password" style="flex:1" />
                <button type="button" class="icon-btn" id="toggle-pw">${Icons.svg('eye', 20)}</button>
              </div>
              <div class="error-msg" data-i18n="common.requiredField"></div>
            </div>
            <div class="checkbox-row mt-8">
              <input type="checkbox" id="in-remember" />
              <label for="in-remember" data-i18n="login.remember" style="margin:0;text-transform:none;font-weight:500"></label>
            </div>
            <button type="submit" class="btn btn-primary btn-block mt-16" id="btn-signin">
              <span id="signin-label" data-i18n="login.signin"></span>
            </button>
            <button type="button" class="btn btn-ghost btn-block mt-8" id="btn-changepw" data-i18n="login.changePassword"></button>
            <p class="center text-muted mt-16" style="font-size:12px" data-i18n="login.defaultCreds"></p>
          </form>
        </div>
      </div>
    `;

    I18n.apply(app);

    app.querySelector('#toggle-pw').onclick = () => {
      const inp = app.querySelector('#in-password');
      const isPw = inp.type === 'password';
      inp.type = isPw ? 'text' : 'password';
      app.querySelector('#toggle-pw').innerHTML = Icons.svg(isPw ? 'eyeOff' : 'eye', 20);
    };

    app.querySelectorAll('#lang-switch [data-lang]').forEach((btn) => {
      btn.onclick = async () => {
        await I18n.setLanguage(btn.getAttribute('data-lang'));
        render(app);
      };
    });

    app.querySelector('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = app.querySelector('#in-username').value.trim();
      const password = app.querySelector('#in-password').value;
      const remember = app.querySelector('#in-remember').checked;

      let valid = true;
      const fUser = app.querySelector('#f-username');
      const fPass = app.querySelector('#f-password');
      fUser.classList.toggle('invalid', !username); if (!username) valid = false;
      fPass.classList.toggle('invalid', !password); if (!password) valid = false;
      if (!valid) return;

      const btn = app.querySelector('#btn-signin');
      const label = app.querySelector('#signin-label');
      btn.disabled = true;
      const prevHtml = label.textContent;
      label.innerHTML = '<span class="spinner"></span>';

      const result = await AuthService.login(username, password, remember);
      btn.disabled = false;
      label.textContent = prevHtml;

      if (!result.ok) {
        Toast.error(result.error);
        return;
      }
      Toast.success(I18n.t('login.welcomeBack') + ', ' + result.user.username);
      Router.navigate('/dashboard');
    });

    app.querySelector('#btn-changepw').onclick = () => openChangePasswordModal();
  }

  function openChangePasswordModal() {
    const sheet = Modal.open(`
      <div class="modal-header"><h3 data-i18n="login.changePassword"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="field"><label data-i18n="login.username"></label><input id="cp-username" /></div>
      <div class="field"><label data-i18n="login.currentPassword"></label><input type="password" id="cp-current" /></div>
      <div class="field"><label data-i18n="login.newPassword"></label><input type="password" id="cp-new" /></div>
      <div class="field"><label data-i18n="login.confirmPassword"></label><input type="password" id="cp-confirm" /></div>
      <button class="btn btn-primary btn-block" id="cp-submit" data-i18n="common.confirm"></button>
    `, { center: true });

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    sheet.querySelector('#cp-submit').onclick = async () => {
      const username = sheet.querySelector('#cp-username').value.trim();
      const current = sheet.querySelector('#cp-current').value;
      const next = sheet.querySelector('#cp-new').value;
      const confirmPw = sheet.querySelector('#cp-confirm').value;
      if (!username || !current || !next) { Toast.error(I18n.t('common.requiredField')); return; }
      if (next !== confirmPw) { Toast.error(I18n.t('login.passwordMismatch')); return; }
      const res = await AuthService.changePassword(username, current, next);
      if (!res.ok) { Toast.error(res.error); return; }
      Toast.success(I18n.t('login.passwordChanged'));
      Modal.close();
    };
  }

  return { render };
})();
