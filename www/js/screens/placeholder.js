/* ============================================================
   Generic "coming soon" placeholder used for nav destinations
   that haven't been built yet in the current phase. Screens get
   swapped out for the real implementation as each phase lands.
   ============================================================ */

const PlaceholderScreen = {
  render(titleKey, icon) {
    return async function (app) {
      app.innerHTML = `
        <header class="app-header">
          <h1 data-i18n="${titleKey}"></h1>
        </header>
        <div class="empty-state">
          <div class="ei">${Icons.svg(icon || 'settings', 40)}</div>
          <p>Coming soon in a later phase</p>
        </div>
      `;
      I18n.apply(app);
    };
  }
};
