/* ============================================================
   MeasurementService — CRUD over the measurements table, where
   values_json is a JSON blob keyed by each category's field_key.
   getFormShape() is what the measurements screen renders from: it
   merges a category's *current* field defs with any previously
   saved values, so editing after fields were added/removed still
   shows a sensible form (missing fields blank, old values not in
   the current field list preserved under legacyValues instead of
   silently dropped).
   ============================================================ */

const MeasurementService = (function () {
  function safeParse(json) {
    try { return JSON.parse(json || '{}'); } catch (e) { return {}; }
  }

  async function listByCustomer(customerId) {
    const rows = await DB.query(
      `SELECT m.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
       FROM measurements m
       JOIN categories c ON c.id = m.category_id
       WHERE m.customer_id = ?
       ORDER BY m.updated_at DESC, m.id DESC`,
      [customerId]
    );
    return rows.map((r) => Object.assign({}, r, { values: safeParse(r.values_json) }));
  }

  async function get(id) {
    const rows = await DB.query(
      `SELECT m.*, c.name AS category_name FROM measurements m
       JOIN categories c ON c.id = m.category_id WHERE m.id = ?`,
      [id]
    );
    if (!rows.length) return null;
    const row = rows[0];
    return Object.assign({}, row, { values: safeParse(row.values_json) });
  }

  async function getFormShape(categoryId, existingValues) {
    const fields = await MeasurementFieldService.listEnabledByCategory(categoryId);
    const saved = existingValues || {};
    const currentKeys = {};
    fields.forEach((f) => { currentKeys[f.field_key] = true; });

    const legacyValues = {};
    Object.keys(saved).forEach((k) => {
      if (!currentKeys[k]) legacyValues[k] = saved[k];
    });

    return {
      fields: fields.map((f) => ({
        id: f.id,
        field_key: f.field_key,
        field_label: f.field_label,
        field_label_ur: f.field_label_ur,
        unit: f.unit,
        field_order: f.field_order,
        value: saved[f.field_key] != null ? saved[f.field_key] : ''
      })),
      legacyValues
    };
  }

  async function create(customerId, categoryId, data) {
    const valuesJson = JSON.stringify(data.values || {});
    const res = await DB.run(
      `INSERT INTO measurements (customer_id, category_id, profile_label, values_json, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [customerId, categoryId, data.profile_label || null, valuesJson, data.notes || null]
    );
    return res.lastId;
  }

  async function update(id, data) {
    const valuesJson = JSON.stringify(data.values || {});
    await DB.run(
      `UPDATE measurements SET profile_label=?, values_json=?, notes=?, updated_at=datetime('now') WHERE id=?`,
      [data.profile_label || null, valuesJson, data.notes || null, id]
    );
  }

  async function remove(id) {
    await DB.run('DELETE FROM measurements WHERE id = ?', [id]);
  }

  async function countByCustomer(customerId) {
    const rows = await DB.query('SELECT COUNT(*) AS c FROM measurements WHERE customer_id = ?', [customerId]);
    return rows[0].c || 0;
  }

  return { listByCustomer, get, getFormShape, create, update, remove, countByCustomer };
})();
