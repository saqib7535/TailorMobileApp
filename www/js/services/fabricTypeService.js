/* ============================================================
   FabricTypeService — CRUD over the customizable fabric_types
   catalog (Cotton / Wash n Wear / Latha / Boski / ...) used as a
   dropdown when adding an order item. Shop-configurable from
   Settings so it isn't hard-coded to any one shop's fabric list.
   ============================================================ */

const FabricTypeService = (function () {
  async function list() {
    return DB.query('SELECT * FROM fabric_types ORDER BY sort_order, id');
  }

  async function listEnabled() {
    return DB.query('SELECT * FROM fabric_types WHERE enabled = 1 ORDER BY sort_order, id');
  }

  async function get(id) {
    const rows = await DB.query('SELECT * FROM fabric_types WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async function nextOrder() {
    const rows = await DB.query('SELECT COALESCE(MAX(sort_order), -1) AS m FROM fabric_types');
    return (rows[0].m == null ? -1 : rows[0].m) + 1;
  }

  async function create(data) {
    const order = data.sort_order != null ? data.sort_order : await nextOrder();
    const res = await DB.run(
      'INSERT INTO fabric_types (name, name_ur, enabled, sort_order) VALUES (?, ?, 1, ?)',
      [data.name, data.name_ur || null, order]
    );
    return res.lastId;
  }

  async function update(id, data) {
    const existing = await get(id);
    if (!existing) return;
    await DB.run(
      'UPDATE fabric_types SET name=?, name_ur=?, enabled=? WHERE id=?',
      [
        data.name != null ? data.name : existing.name,
        data.name_ur != null ? data.name_ur : existing.name_ur,
        data.enabled != null ? (data.enabled ? 1 : 0) : existing.enabled,
        id
      ]
    );
  }

  async function remove(id) {
    await DB.run('DELETE FROM fabric_types WHERE id = ?', [id]);
  }

  // Same Urdu-aware label pick as MeasurementFieldService.label(), so
  // the fabric dropdown, order summary, and print copies all agree.
  function label(fabric) {
    if (!fabric) return '';
    if (I18n.getLanguage() === 'ur' && fabric.name_ur) return fabric.name_ur;
    return fabric.name;
  }

  return { list, listEnabled, get, create, update, remove, label };
})();
