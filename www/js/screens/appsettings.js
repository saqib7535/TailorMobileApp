/* ============================================================
   App Settings screen — shop profile/logo, tax & currency,
   language/theme/auto-logout preferences, license status, and the
   reset-to-factory danger zone. Reached from More → Settings.
   Route allows Admin + Manager; Manager gets a view-only render
   (every input/button disabled, current values still shown) per
   the role matrix — enforced here, not by hiding the More-menu row.
   ============================================================ */

const AppSettingsScreen = (function () {
  let logoDataUrl = null;

  function canEdit() { return AuthService.hasRole('admin'); }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  async function render(app) {
    const editable = canEdit();
    const s = await SettingsService.all();
    logoDataUrl = s.shop_logo || null;
    const dis = editable ? '' : 'disabled';
    const status = LicenseService.getCachedStatus();
    const durationLabel = status.durationLabelKey ? I18n.t(status.durationLabelKey) : '—';
    const expiryLine = status.expiresAtMs == null ? I18n.t('license.expiresNever') : I18n.t('license.daysLeft', { days: status.daysLeft });

    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <h1 data-i18n="more.settings"></h1>
      </header>
      <div class="page page-pad" style="padding-top:14px;padding-bottom:24px">
        ${editable ? '' : `<p class="text-muted center mt-8" style="font-size:12.5px" data-i18n="common.viewOnlyNotice"></p>`}

        <div class="card mt-16" style="margin-bottom:14px">
          <div class="card-title" data-i18n="settings.shopProfile"></div>
          <div class="center mt-8">
            <div id="logo-preview" class="login-logo" style="${editable ? 'cursor:pointer' : ''}">${logoDataUrl ? `<img src="${logoDataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:22px" />` : Icons.svg('scissors', 30)}</div>
            <input type="file" accept="image/*" id="in-logo-file" class="hidden" ${dis} />
            ${editable ? `<a class="link" id="btn-pick-logo" data-i18n="settings.logo" style="display:inline-block;margin-top:6px"></a>` : ''}
          </div>
          <div class="field mt-8"><label data-i18n="settings.shopName"></label><input id="in-shop-name" value="${s.shop_name || ''}" ${dis} /></div>
          <div class="field"><label data-i18n="settings.shopAddress"></label><textarea id="in-shop-address" rows="2" ${dis}>${s.shop_address || ''}</textarea></div>
          <div class="field-row">
            <div class="field"><label data-i18n="settings.shopPhone"></label><input id="in-shop-phone" value="${s.shop_phone || ''}" ${dis} /></div>
            <div class="field"><label data-i18n="settings.currency"></label><input id="in-currency" value="${s.currency || 'Rs.'}" ${dis} /></div>
          </div>
          <div class="field"><label data-i18n="settings.taxPercent"></label><input type="number" min="0" step="0.1" id="in-tax" value="${s.tax_percent || '0'}" ${dis} /></div>
          <div class="field">
            <label data-i18n="settings.invoiceMessage"></label>
            <input id="in-invoice-message" value="${escapeHtml(s.invoice_message || '')}" data-i18n-placeholder="settings.invoiceMessageHint" ${dis} />
          </div>
        </div>

        <div class="card" style="margin-bottom:14px">
          <div class="card-title" data-i18n="settings.preferences"></div>
          <div class="field">
            <label data-i18n="settings.language"></label>
            <select id="in-language" ${dis}>
              ${I18n.availableLanguages().map((l) => `<option value="${l.code}" ${l.code === I18n.getLanguage() ? 'selected' : ''}>${l.label}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label data-i18n="settings.theme"></label>
            <select id="in-theme" ${dis}>
              <option value="light" ${s.theme === 'light' ? 'selected' : ''} data-i18n="settings.themeLight"></option>
              <option value="dark" ${s.theme === 'dark' ? 'selected' : ''} data-i18n="settings.themeDark"></option>
              <option value="system" ${s.theme === 'system' ? 'selected' : ''} data-i18n="settings.themeSystem"></option>
            </select>
          </div>
          <div class="field">
            <label data-i18n="settings.autoLogout"></label>
            <input type="number" min="0" id="in-auto-logout" value="${s.auto_logout_minutes || '0'}" ${dis} />
          </div>
        </div>

        ${editable ? `<button class="btn btn-primary btn-block" id="btn-save-settings" data-i18n="settings.saveSettings" style="margin-bottom:20px"></button>` : ''}

        <div class="card" style="margin-bottom:14px">
          <div class="card-title" data-i18n="settings.licenseStatus"></div>
          <div class="flex-between"><span class="text-muted" data-i18n="settings.licensePlan"></span><b>${durationLabel}</b></div>
          <div class="flex-between mt-8"><span class="text-muted" data-i18n="settings.licenseExpiry"></span><b>${expiryLine}</b></div>
          ${editable ? `
            <p class="text-muted mt-8" style="font-size:12px" data-i18n="settings.licenseRenewHint"></p>
            <div class="field" id="f-license-key" style="margin-top:8px">
              <input id="in-new-key" data-i18n-placeholder="activation.placeholder" style="text-transform:uppercase;letter-spacing:.5px" />
              <div class="error-msg" data-i18n="activation.invalidKey"></div>
            </div>
            <button class="btn btn-outline btn-block" id="btn-reactivate" data-i18n="activation.activate"></button>
          ` : ''}
        </div>

        ${editable ? `
          <div class="card" style="border-color:var(--color-danger)">
            <div class="card-title text-danger" data-i18n="settings.dangerZone"></div>
            <div class="flex-between">
              <div>
                <div style="font-weight:700" data-i18n="settings.reset"></div>
                <div class="text-muted" style="font-size:12px" data-i18n="settings.resetDesc"></div>
              </div>
              <button class="btn btn-danger btn-sm" id="btn-reset-app">${Icons.svg('trash', 16)}</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-back').onclick = () => Router.navigate('/more');
    if (!editable) return;

    app.querySelector('#btn-pick-logo').onclick = () => app.querySelector('#in-logo-file').click();
    app.querySelector('#logo-preview').onclick = () => app.querySelector('#in-logo-file').click();
    app.querySelector('#in-logo-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        logoDataUrl = reader.result;
        app.querySelector('#logo-preview').innerHTML = `<img src="${logoDataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:22px" />`;
      };
      reader.readAsDataURL(file);
    });

    app.querySelector('#btn-save-settings').onclick = save;
    app.querySelector('#btn-reset-app').onclick = openResetToFactory;

    const keyInput = app.querySelector('#in-new-key');
    keyInput.addEventListener('input', () => { keyInput.value = keyInput.value.toUpperCase(); });
    app.querySelector('#btn-reactivate').onclick = async () => {
      const raw = keyInput.value.trim();
      const fKey = app.querySelector('#f-license-key');
      if (!raw) { fKey.classList.add('invalid'); return; }
      const result = await LicenseService.activate(raw);
      if (!result.ok) { fKey.classList.add('invalid'); Toast.error(I18n.t('activation.invalidKey')); return; }
      Toast.success(I18n.t('activation.success'));
      render(app);
    };
  }

  async function save() {
    const language = document.getElementById('in-language').value;
    const theme = document.getElementById('in-theme').value;
    const autoLogoutMinutes = parseInt(document.getElementById('in-auto-logout').value, 10) || 0;

    await SettingsService.setMany({
      shop_name: document.getElementById('in-shop-name').value.trim(),
      shop_address: document.getElementById('in-shop-address').value.trim(),
      shop_phone: document.getElementById('in-shop-phone').value.trim(),
      invoice_message: document.getElementById('in-invoice-message').value.trim(),
      currency: document.getElementById('in-currency').value.trim() || 'Rs.',
      tax_percent: document.getElementById('in-tax').value || '0',
      theme,
      auto_logout_minutes: String(autoLogoutMinutes),
      language
    });
    if (logoDataUrl) await SettingsService.set('shop_logo', logoDataUrl);

    ThemeManager.apply(theme);
    Format.setCurrencySymbol(document.getElementById('in-currency').value.trim() || 'Rs.');
    AuthService.setAutoLogoutMinutes(autoLogoutMinutes);
    if (language !== I18n.getLanguage()) await I18n.setLanguage(language);

    Toast.success(I18n.t('common.saved'));
  }

  // Two layers of friction for the single most destructive action in
  // the app: a danger-styled confirm dialog, then a modal that only
  // enables its confirm button once the shop owner has typed the
  // literal word RESET — hard to trigger by a stray tap or a curious
  // employee poking around a Manager's screen.
  async function openResetToFactory() {
    const ok = await Modal.confirm({ message: I18n.t('settings.resetConfirm1'), danger: true });
    if (!ok) return;

    const sheet = Modal.open(`
      <div class="modal-header"><h3 class="text-danger" data-i18n="settings.reset"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="field" id="f-reset-word">
        <label data-i18n="settings.resetTypeLabel"></label>
        <input id="in-reset-word" style="text-transform:uppercase;letter-spacing:1px" />
        <div class="error-msg" data-i18n="settings.resetTypeMismatch"></div>
      </div>
      <button class="btn btn-danger btn-block" id="btn-confirm-reset" data-i18n="settings.reset"></button>
    `, { center: true });
    I18n.apply(sheet);
    sheet.querySelector('#m-close').onclick = () => Modal.close();
    sheet.querySelector('#btn-confirm-reset').onclick = async () => {
      const word = sheet.querySelector('#in-reset-word').value.trim().toUpperCase();
      const fWord = sheet.querySelector('#f-reset-word');
      if (word !== 'RESET') { fWord.classList.add('invalid'); return; }
      Modal.close();
      await BackupService.resetToFactory();
      Toast.success(I18n.t('settings.resetDone'));
      setTimeout(() => location.reload(), 900);
    };
  }

  return { render };
})();
