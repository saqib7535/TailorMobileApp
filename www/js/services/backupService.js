/* ============================================================
   BackupService — export/import the whole database file, silent
   daily auto-backup, and reset-to-factory. Structurally mirrors
   the sibling DryClean POS project's backupService.js.

   NOTE ON FORMATS: the web (sql.js) adapter exports a real SQLite
   binary; the native (@capacitor-community/sqlite) adapter exports
   a JSON dump instead (that plugin's own backup format) — db.js
   already hides this difference behind DB.exportBytes()/
   importBytes(), so this service just needs to know the file
   extension differs. A backup taken on one platform can only be
   restored on that same platform — called out in the Backup screen
   copy so it's never a silent surprise.
   ============================================================ */

const BackupService = (function () {
  const AUTO_SLOT_KEY = 'ts_auto_backup_blob';
  const AUTO_DATE_KEY = 'ts_last_auto_backup_date';

  function fileExtension() { return DB.isNative ? 'json' : 'sqlite'; }

  function fileName() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `tailorpos-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${fileExtension()}`;
  }

  async function logBackup(name, size) {
    await DB.run('INSERT INTO backups (file_name, size) VALUES (?, ?)', [name, size]);
  }

  async function listBackupHistory() {
    return DB.query('SELECT * FROM backups ORDER BY created_at DESC LIMIT 20');
  }

  // Manual "Backup Now" — triggers a browser/WebView download of the
  // current database file and logs it to the backups table.
  async function exportBackup() {
    const bytes = await DB.exportBytes();
    const name = fileName();
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    await logBackup(name, bytes.byteLength || bytes.length || 0);
    return { name, size: bytes.byteLength || bytes.length || 0 };
  }

  // Manual "Restore from Backup" — replaces the live database with
  // the picked file's contents. Caller is responsible for confirming
  // with the user first (this cannot be undone) and reloading after.
  async function importBackup(file) {
    const buffer = await file.arrayBuffer();
    await DB.importBytes(new Uint8Array(buffer));
  }

  // The `backups` table only stores file_name/size (no BLOB column —
  // schema.js is not to be altered for this phase), so the silent
  // daily auto-backup keeps its actual bytes in localStorage instead,
  // the same workaround DryClean POS uses, so there's always a
  // same-day copy to fall back to even if the user never presses
  // "Backup Now" themselves.
  async function saveSilentAutoBackup() {
    const bytes = await DB.exportBytes();
    try {
      localStorage.setItem(AUTO_SLOT_KEY, btoa(String.fromCharCode(...new Uint8Array(bytes))));
      localStorage.setItem(AUTO_DATE_KEY, Format.todayIso());
    } catch (e) {
      console.warn('Auto-backup slot save skipped (storage limit?)', e);
    }
    await logBackup('auto-backup-' + Format.todayIso() + '.' + fileExtension(), bytes.byteLength || bytes.length || 0);
  }

  function hasAutoBackup() {
    try { return !!localStorage.getItem(AUTO_SLOT_KEY); } catch (e) { return false; }
  }

  function lastAutoBackupDate() {
    try { return localStorage.getItem(AUTO_DATE_KEY); } catch (e) { return null; }
  }

  async function restoreFromAutoBackup() {
    const b64 = localStorage.getItem(AUTO_SLOT_KEY);
    if (!b64) throw new Error('No auto-backup available');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    await DB.importBytes(bytes);
  }

  // Called once at app boot (see app.js). Respects the auto_backup
  // setting and runs at most once per calendar day.
  async function maybeRunAutoBackup() {
    const enabled = await SettingsService.get('auto_backup', '1');
    if (enabled !== '1') return;
    const today = Format.todayIso();
    if (lastAutoBackupDate() === today) return;
    await saveSilentAutoBackup();
  }

  // Wipes every table (children before parents, to stay safe under
  // engines that do enforce FK constraints) and clears local storage.
  // Deliberately does NOT re-seed here — the caller reloads the page
  // right after, and DB.init()'s existing seedIfEmpty() step notices
  // the now-empty settings/users/categories tables and repopulates
  // the same defaults a brand-new install would get, so "wipe +
  // reload" behaves exactly like "wipe + re-seed".
  async function resetToFactory() {
    const tables = [
      'payments', 'order_status_history', 'order_items', 'orders',
      'purchase_items', 'purchases',
      'measurements', 'measurement_fields', 'categories',
      'customers', 'suppliers', 'inventory_items', 'expenses',
      'backups', 'settings', 'users', 'meta'
    ];
    for (const t of tables) await DB.run(`DELETE FROM ${t}`);
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ }
  }

  return {
    fileExtension, exportBackup, importBackup, listBackupHistory,
    saveSilentAutoBackup, hasAutoBackup, lastAutoBackupDate, restoreFromAutoBackup,
    maybeRunAutoBackup, resetToFactory
  };
})();
