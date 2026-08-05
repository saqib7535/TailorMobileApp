/* ============================================================
   BackButtonHandler — makes Android's hardware/gesture back button
   behave the way every other app does: close whatever's on top
   (photo viewer, then modal sheet), otherwise go back one screen,
   and only actually exit the app when there's nowhere left to go
   (one of the 5 bottom-nav root tabs, or the login screen).

   Without this, Capacitor's default behavior is to exit the app on
   the very first back-press from anywhere — which feels like the
   app "closing on you" the moment you touch back, instead of
   stepping back through screens like Android users expect.

   Router already uses `location.hash = path` for every real
   navigation (Router.replace() is reserved for guard redirects and
   uses location.replace(), which does NOT add a history entry) — so
   the WebView's native history stack already mirrors the screens the
   person actually visited. Stepping back through it with
   window.history.back() is what re-triggers the router's own
   hashchange -> render() cycle, landing exactly where the screen's
   own back arrow would have taken them.
   ============================================================ */

const BackButtonHandler = (function () {
  const ROOT_PATHS = ['/dashboard', '/orders', '/customers', '/reports', '/more', '/login', '/activation'];

  function isModalOpen() {
    const overlay = document.querySelector('.modal-overlay');
    return !!(overlay && overlay.classList.contains('open'));
  }

  function isLightboxOpen() {
    const overlay = document.getElementById('lightbox-overlay');
    return !!(overlay && overlay.style.opacity === '1');
  }

  function exitApp() {
    const plugins = window.Capacitor && window.Capacitor.Plugins;
    if (plugins && plugins.App && plugins.App.exitApp) plugins.App.exitApp();
  }

  function handleBack() {
    if (isLightboxOpen()) { Lightbox.close(); return; }
    if (isModalOpen()) { Modal.close(); return; }

    const path = Router.getCurrentPath();
    if (!path || ROOT_PATHS.indexOf(path) !== -1) {
      exitApp();
      return;
    }
    window.history.back();
  }

  function init() {
    if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) return;
    const plugins = window.Capacitor.Plugins;
    if (!plugins || !plugins.App) return;
    plugins.App.addListener('backButton', handleBack);
  }

  return { init };
})();
