/* ============================================================
   DB — storage-agnostic SQLite access layer.

   Two adapters implement the same tiny interface:
     - webAdapter:    sql.js (WASM SQLite) persisted to IndexedDB.
                       Used in browser/dev preview and as the
                       Capacitor "web" platform fallback.
     - nativeAdapter: @capacitor-community/sqlite via the
                       auto-generated Capacitor.Plugins bridge.
                       Used when running inside the compiled
                       Android app (window.Capacitor.isNativePlatform()).

   Both adapters expose: run(sql, params), query(sql, params),
   exportBytes(), importBytes(bytes), and are fully offline —
   no network access of any kind is required at runtime.
   ============================================================ */

const DB = (function () {
  const DB_NAME = 'tailorpos';
  const IDB_NAME = 'ts_pos_storage';
  const IDB_STORE = 'sqlite_files';
  const IDB_KEY = 'main';

  let adapter = null;
  let native = false;
  let ready = false;

  // ---------------------------------------------------------
  // IndexedDB helpers (persist the sql.js binary between reloads)
  // ---------------------------------------------------------
  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbLoad() {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSave(bytes) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---------------------------------------------------------
  // Web adapter (sql.js)
  // ---------------------------------------------------------
  function createWebAdapter() {
    let sqljs = null;
    let sdb = null;
    let saveTimer = null;

    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          const bytes = sdb.export();
          idbSave(bytes).catch((e) => console.error('DB persist failed', e));
        } catch (e) { console.error(e); }
      }, 250);
    }

    function rowsFromResult(res) {
      if (!res || !res.length) return [];
      const { columns, values } = res[0];
      return values.map((row) => {
        const obj = {};
        columns.forEach((col, i) => { obj[col] = row[i]; });
        return obj;
      });
    }

    return {
      async init() {
        sqljs = await initSqlJs({ locateFile: (file) => 'js/vendor/' + file });
        const existing = await idbLoad().catch(() => null);
        sdb = existing ? new sqljs.Database(new Uint8Array(existing)) : new sqljs.Database();
      },
      async run(sql, params = []) {
        const stmt = sdb.prepare(sql);
        stmt.bind(params);
        stmt.step();
        stmt.free();
        const changes = sdb.getRowsModified();
        let lastId = null;
        try {
          const r = sdb.exec('SELECT last_insert_rowid() AS id');
          lastId = r.length ? r[0].values[0][0] : null;
        } catch (e) { /* ignore */ }
        scheduleSave();
        return { changes, lastId };
      },
      async query(sql, params = []) {
        const stmt = sdb.prepare(sql);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return rows;
      },
      async execRaw(sql) {
        sdb.run(sql);
        scheduleSave();
      },
      async exportBytes() {
        return sdb.export();
      },
      async importBytes(bytes) {
        sdb.close();
        sdb = new sqljs.Database(new Uint8Array(bytes));
        await idbSave(sdb.export());
      }
    };
  }

  // ---------------------------------------------------------
  // Native adapter (@capacitor-community/sqlite)
  // ---------------------------------------------------------
  function createNativeAdapter() {
    const plugin = window.Capacitor.Plugins.CapacitorSQLite;

    async function ensureSecret() {
      try {
        const check = await plugin.isSecretStored();
        if (!check || !check.result) {
          // First launch on device: derive a local passphrase and store it
          // in the plugin's secure keystore. This is independent from the
          // user's login password so changing the login password never
          // requires re-encrypting the database.
          const passphrase = 'ts-pos-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now());
          await plugin.setEncryptionSecret({ passphrase });
        }
      } catch (e) {
        console.warn('Encryption secret setup skipped:', e && e.message);
      }
    }

    return {
      async init() {
        await ensureSecret();
        await plugin.createConnection({ database: DB_NAME, encrypted: true, mode: 'secret', version: 1 });
        await plugin.open({ database: DB_NAME });
      },
      async run(sql, params = []) {
        const res = await plugin.run({ database: DB_NAME, statement: sql, values: params, transaction: true });
        const changes = (res && res.changes && res.changes.changes) || 0;
        const lastId = (res && res.changes && res.changes.lastId) || null;
        return { changes, lastId };
      },
      async query(sql, params = []) {
        const res = await plugin.query({ database: DB_NAME, statement: sql, values: params });
        return (res && res.values) || [];
      },
      async execRaw(sql) {
        await plugin.execute({ database: DB_NAME, statements: sql, transaction: true });
      },
      async exportBytes() {
        const res = await plugin.exportToJson({ database: DB_NAME, jsonexportmode: 'full' });
        const json = JSON.stringify(res.export || {});
        return new TextEncoder().encode(json);
      },
      async importBytes(bytes) {
        const json = new TextDecoder().decode(bytes);
        await plugin.importFromJson({ jsonstring: json });
      }
    };
  }

  // ---------------------------------------------------------
  // Schema + seed
  // ---------------------------------------------------------
  async function applySchema() {
    for (const stmt of SCHEMA_STATEMENTS) {
      await adapter.execRaw(stmt);
    }
    const versionRow = await adapter.query('SELECT value FROM meta WHERE key = ?', ['schema_version']);
    if (!versionRow.length) {
      await adapter.run('INSERT INTO meta (key, value) VALUES (?, ?)', ['schema_version', String(SCHEMA_VERSION)]);
    }
  }

  async function columnExists(table, column) {
    const cols = await adapter.query(`PRAGMA table_info(${table})`);
    return cols.some((c) => c.name === column);
  }

  async function ensureColumn(table, column, definition) {
    if (await columnExists(table, column)) return;
    await adapter.execRaw(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  /* `CREATE TABLE IF NOT EXISTS` (applySchema, above) only helps a
     brand-new database — on an install that already has these tables,
     it's a no-op and newly-added columns never show up. This runs
     once per app-version bump and adds exactly what's missing via
     ALTER TABLE, so upgrading never loses existing data. */
  async function runMigrations() {
    const versionRow = await adapter.query('SELECT value FROM meta WHERE key = ?', ['schema_version']);
    const storedVersion = versionRow.length ? parseInt(versionRow[0].value, 10) : SCHEMA_VERSION;
    if (storedVersion >= SCHEMA_VERSION) return;

    if (storedVersion < 2) {
      // Family tree (customers can belong to a "head" customer),
      // bilingual measurement field labels, and per-garment
      // fabric/design attribution on order_items.
      await ensureColumn('customers', 'head_customer_id', 'INTEGER REFERENCES customers(id)');
      await ensureColumn('customers', 'relation', 'TEXT');
      await ensureColumn('measurement_fields', 'field_label_ur', 'TEXT');
      await ensureColumn('order_items', 'for_customer_id', 'INTEGER REFERENCES customers(id)');
      await ensureColumn('order_items', 'for_customer_name', 'TEXT');
      await ensureColumn('order_items', 'fabric_type_id', 'INTEGER REFERENCES fabric_types(id)');
      await ensureColumn('order_items', 'fabric_type_name', 'TEXT');
      await ensureColumn('order_items', 'design_labels', 'TEXT');
    }

    await adapter.run('UPDATE meta SET value = ? WHERE key = ?', [String(SCHEMA_VERSION), 'schema_version']);
  }

  async function seedIfEmpty() {
    const settingsCount = await adapter.query('SELECT COUNT(*) AS c FROM settings');
    if (settingsCount[0].c === 0) {
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        await adapter.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, DEFAULT_SETTINGS[key]]);
      }
    }

    const userCount = await adapter.query('SELECT COUNT(*) AS c FROM users');
    if (userCount[0].c === 0) {
      const hash = await CryptoUtil.hashPassword('admin123');
      await adapter.run(
        'INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, ?, ?)',
        ['admin', hash, 'admin', 'Administrator']
      );
    }

    const catCount = await adapter.query('SELECT COUNT(*) AS c FROM categories');
    if (catCount[0].c === 0) {
      let order = 0;
      const categoryIds = {};
      for (const cat of DEFAULT_CATEGORIES) {
        const res = await adapter.run(
          'INSERT INTO categories (name, icon, color, default_price, enabled, sort_order) VALUES (?, ?, ?, ?, 1, ?)',
          [cat.name, cat.icon, cat.color, cat.price, order++]
        );
        categoryIds[cat.name] = res.lastId;
      }

      const fieldCount = await adapter.query('SELECT COUNT(*) AS c FROM measurement_fields');
      if (fieldCount[0].c === 0) {
        for (const catName of Object.keys(DEFAULT_MEASUREMENT_FIELDS)) {
          const categoryId = categoryIds[catName];
          if (!categoryId) continue;
          const fields = DEFAULT_MEASUREMENT_FIELDS[catName];
          for (const field of fields) {
            await adapter.run(
              'INSERT INTO measurement_fields (category_id, field_key, field_label, field_label_ur, unit, field_order, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)',
              [categoryId, field.field_key, field.field_label, field.field_label_ur || null, field.unit, field.order]
            );
          }
        }
      }
    }

    const fabricCount = await adapter.query('SELECT COUNT(*) AS c FROM fabric_types');
    if (fabricCount[0].c === 0) {
      let order = 0;
      for (const f of DEFAULT_FABRIC_TYPES) {
        await adapter.run(
          'INSERT INTO fabric_types (name, name_ur, enabled, sort_order) VALUES (?, ?, 1, ?)',
          [f.name, f.name_ur || null, order++]
        );
      }
    }

    const designCount = await adapter.query('SELECT COUNT(*) AS c FROM design_options');
    if (designCount[0].c === 0) {
      let order = 0;
      for (const d of DEFAULT_DESIGN_OPTIONS) {
        await adapter.run(
          'INSERT INTO design_options (category_id, name, name_ur, enabled, sort_order) VALUES (NULL, ?, ?, 1, ?)',
          [d.name, d.name_ur || null, order++]
        );
      }
    }
  }

  async function init() {
    native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    adapter = native ? createNativeAdapter() : createWebAdapter();
    await adapter.init();
    await applySchema();
    await runMigrations();
    await seedIfEmpty();
    ready = true;
  }

  function assertReady() {
    if (!ready) throw new Error('DB.init() must complete before using DB.run/query');
  }

  async function run(sql, params) { assertReady(); return adapter.run(sql, params || []); }
  async function query(sql, params) { assertReady(); return adapter.query(sql, params || []); }
  async function exportBytes() { assertReady(); return adapter.exportBytes(); }
  async function importBytes(bytes) {
    assertReady();
    await adapter.importBytes(bytes);
  }

  return {
    init, run, query, exportBytes, importBytes,
    get isNative() { return native; },
    get isReady() { return ready; }
  };
})();
