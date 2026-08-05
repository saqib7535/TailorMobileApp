/* ============================================================
   ThemeManager — applies the light/dark data-theme attribute
   that theme.css keys off of.

   Phase 6: adds a 'system' option (Settings screen) — instead of
   forcing 'light' or 'dark', it removes the data-theme attribute
   entirely so theme.css's `@media (prefers-color-scheme: dark)`
   block decides based on the OS/browser setting. That media query
   is native CSS, so it already tracks OS changes live with no JS
   watcher needed here.
   ============================================================ */

const ThemeManager = (function () {
  function apply(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      // 'system' (or anything unrecognized): no explicit attribute,
      // theme.css's prefers-color-scheme media query takes over.
      document.documentElement.removeAttribute('data-theme');
    }
  }

  async function initFromSettings() {
    const theme = await SettingsService.get('theme', 'light');
    apply(theme);
  }

  return { apply, initFromSettings };
})();
