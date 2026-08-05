/* ============================================================
   Lightweight i18n engine.
   Usage:
     await I18n.init();               // loads saved/default language
     I18n.t('common.save');           // -> translated string
     I18n.apply(document);            // translates all [data-i18n] nodes
     await I18n.setLanguage('ur');    // switches language + RTL + re-renders
     I18n.on(fn) / I18n.off(fn)       // subscribe to language changes
   ============================================================ */

const I18n = (function () {
  const LANGS = {
    en: { file: 'js/i18n/en.json', dir: 'ltr', label: 'English' },
    ur: { file: 'js/i18n/ur.json', dir: 'rtl', label: 'اردو' }
  };
  const STORAGE_KEY = 'ts_language';

  let current = 'en';
  let dict = {};
  let fallbackDict = {};
  const listeners = [];

  async function loadJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error('Failed to load language file: ' + path);
    return res.json();
  }

  function applyDocumentDirection(lang) {
    const dir = LANGS[lang] ? LANGS[lang].dir : 'ltr';
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', dir);
    const rtlLink = document.getElementById('rtl-stylesheet');
    if (rtlLink) rtlLink.disabled = dir !== 'rtl';
  }

  function t(key, vars) {
    let str = (dict && dict[key]) || (fallbackDict && fallbackDict[key]) || key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
      });
    }
    return str;
  }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
  }

  async function setLanguage(lang) {
    if (!LANGS[lang]) lang = 'en';
    dict = await loadJson(LANGS[lang].file);
    current = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    applyDocumentDirection(lang);
    apply(document);
    listeners.forEach((fn) => { try { fn(lang); } catch (e) { console.error(e); } });
  }

  async function init() {
    fallbackDict = await loadJson(LANGS.en.file);
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    await setLanguage(saved || 'en');
  }

  function on(fn) { listeners.push(fn); }
  function off(fn) { const i = listeners.indexOf(fn); if (i > -1) listeners.splice(i, 1); }

  function getLanguage() { return current; }
  function isRTL() { return LANGS[current] && LANGS[current].dir === 'rtl'; }
  function availableLanguages() {
    return Object.keys(LANGS).map((code) => ({ code, label: LANGS[code].label }));
  }

  return { init, t, apply, setLanguage, getLanguage, isRTL, availableLanguages, on, off };
})();
