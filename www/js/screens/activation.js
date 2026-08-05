/* ============================================================
   Activation screen — gates the entire app until a valid,
   non-expired product key is on record. Shown instead of Login
   whenever LicenseService.isValidCached() is false, whether that's
   a brand-new install, an expired trial/month key, or a detected
   clock rollback.
   ============================================================ */

const ActivationScreen = (function () {
  async function render(app) {
    const shopName = await SettingsService.get('shop_name', 'Tailor Shop POS');
    const status = LicenseService.getCachedStatus();

    let heading = I18n.t('activation.title');
    let subtitle = I18n.t('activation.subtitle');

    if (status.tampered) {
      heading = I18n.t('activation.tamperedTitle');
      subtitle = I18n.t('activation.tamperedMessage');
    } else if (status.activated && status.expired) {
      heading = I18n.t('activation.expiredTitle');
      const durationLabel = status.durationLabelKey ? I18n.t(status.durationLabelKey) : '';
      subtitle = I18n.t('activation.expiredMessage', { duration: durationLabel });
    }

    app.innerHTML = `
      <div class="login-screen">
        <div class="login-card">
          <div class="login-logo">${Icons.svg('lock', 32)}</div>
          <div class="login-shopname">${shopName}</div>
          <div class="login-tag" style="margin-bottom:18px">${heading}</div>

          <p class="text-muted" style="font-size:13px;text-align:center;margin-bottom:18px">${subtitle}</p>

          <div class="field" id="f-key">
            <label data-i18n="activation.placeholder"></label>
            <input id="in-product-key" data-i18n-placeholder="activation.placeholder" style="text-transform:uppercase;letter-spacing:.5px" />
            <div class="error-msg" data-i18n="activation.invalidKey"></div>
          </div>

          <button class="btn btn-primary btn-block" id="btn-activate">
            <span id="activate-label" data-i18n="activation.activate"></span>
          </button>
          <p class="center text-muted mt-16" style="font-size:12px" data-i18n="activation.contactVendor"></p>
        </div>
      </div>
    `;
    I18n.apply(app);

    const input = app.querySelector('#in-product-key');
    input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });

    app.querySelector('#btn-activate').onclick = async () => {
      const raw = input.value.trim();
      const fKey = app.querySelector('#f-key');
      if (!raw) { fKey.classList.add('invalid'); return; }

      const btn = app.querySelector('#btn-activate');
      const label = app.querySelector('#activate-label');
      btn.disabled = true;
      const prevText = label.textContent;
      label.innerHTML = '<span class="spinner"></span>';

      const result = await LicenseService.activate(raw);

      btn.disabled = false;
      label.textContent = prevText;

      if (!result.ok) {
        fKey.classList.add('invalid');
        Toast.error(I18n.t('activation.invalidKey'));
        return;
      }
      fKey.classList.remove('invalid');
      Toast.success(I18n.t('activation.success'));
      Router.navigate('/login');
    };
  }

  return { render };
})();
