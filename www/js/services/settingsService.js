/* ============================================================
   SettingsService — cached key/value access over the settings table.
   ============================================================ */

const SettingsService = (function () {
  let cache = null;

  async function loadAll() {
    const rows = await DB.query('SELECT key, value FROM settings');
    cache = {};
    rows.forEach((r) => { cache[r.key] = r.value; });
    return cache;
  }

  async function all() {
    if (!cache) await loadAll();
    return cache;
  }

  async function get(key, fallback) {
    if (!cache) await loadAll();
    return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : fallback;
  }

  async function set(key, value) {
    if (!cache) await loadAll();
    const exists = Object.prototype.hasOwnProperty.call(cache, key);
    if (exists) {
      await DB.run('UPDATE settings SET value = ? WHERE key = ?', [String(value), key]);
    } else {
      await DB.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
    }
    cache[key] = String(value);
  }

  async function setMany(obj) {
    for (const key of Object.keys(obj)) {
      await set(key, obj[key]);
    }
  }

  function invalidate() { cache = null; }

  return { all, get, set, setMany, invalidate };
})();
