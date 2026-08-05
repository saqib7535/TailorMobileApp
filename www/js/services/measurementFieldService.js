/* ============================================================
   MeasurementFieldService — CRUD over measurement_fields, scoped
   to a single category_id. field_key becomes a JSON key inside
   measurements.values_json, so it's validated as a safe lowercase
   identifier and kept unique per category (matches the schema's
   UNIQUE(category_id, field_key) constraint).
   ============================================================ */

const MeasurementFieldService = (function () {
  const KEY_RE = /^[a-z][a-z0-9_]*$/;

  function isValidKey(key) {
    return typeof key === 'string' && KEY_RE.test(key);
  }

  async function listByCategory(categoryId) {
    return DB.query(
      'SELECT * FROM measurement_fields WHERE category_id = ? ORDER BY field_order, id',
      [categoryId]
    );
  }

  async function listEnabledByCategory(categoryId) {
    return DB.query(
      'SELECT * FROM measurement_fields WHERE category_id = ? AND enabled = 1 ORDER BY field_order, id',
      [categoryId]
    );
  }

  async function get(id) {
    const rows = await DB.query('SELECT * FROM measurement_fields WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async function isKeyTaken(categoryId, fieldKey, excludeId) {
    const rows = await DB.query(
      'SELECT id FROM measurement_fields WHERE category_id = ? AND field_key = ?',
      [categoryId, fieldKey]
    );
    return rows.some((r) => r.id !== excludeId);
  }

  async function nextOrder(categoryId) {
    const rows = await DB.query(
      'SELECT COALESCE(MAX(field_order), -1) AS m FROM measurement_fields WHERE category_id = ?',
      [categoryId]
    );
    return (rows[0].m == null ? -1 : rows[0].m) + 1;
  }

  // Returns { ok:true, id } on success, or { ok:false, error } where
  // error is 'invalidKey' | 'duplicateKey' so the screen can show the
  // right inline message.
  async function create(categoryId, data) {
    const key = String(data.field_key || '').trim().toLowerCase();
    if (!isValidKey(key)) return { ok: false, error: 'invalidKey' };
    if (await isKeyTaken(categoryId, key)) return { ok: false, error: 'duplicateKey' };

    const order = data.field_order != null ? data.field_order : await nextOrder(categoryId);
    const res = await DB.run(
      `INSERT INTO measurement_fields (category_id, field_key, field_label, field_label_ur, unit, field_order, enabled)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [categoryId, key, data.field_label || key, data.field_label_ur || null, data.unit || 'in', order]
    );
    return { ok: true, id: res.lastId };
  }

  async function update(id, data) {
    const existing = await get(id);
    if (!existing) return { ok: false, error: 'notFound' };

    let key = existing.field_key;
    if (data.field_key != null) {
      key = String(data.field_key).trim().toLowerCase();
      if (!isValidKey(key)) return { ok: false, error: 'invalidKey' };
      if (await isKeyTaken(existing.category_id, key, id)) return { ok: false, error: 'duplicateKey' };
    }

    await DB.run(
      `UPDATE measurement_fields SET field_key=?, field_label=?, field_label_ur=?, unit=?, field_order=?, enabled=? WHERE id=?`,
      [
        key,
        data.field_label != null ? data.field_label : existing.field_label,
        data.field_label_ur != null ? data.field_label_ur : existing.field_label_ur,
        data.unit != null ? data.unit : existing.unit,
        data.field_order != null ? data.field_order : existing.field_order,
        data.enabled != null ? (data.enabled ? 1 : 0) : existing.enabled,
        id
      ]
    );
    return { ok: true };
  }

  async function remove(id) {
    await DB.run('DELETE FROM measurement_fields WHERE id = ?', [id]);
  }

  // orderedIds is the field ids in their new display order; each gets
  // its field_order set to its index in the array.
  async function reorder(categoryId, orderedIds) {
    for (let i = 0; i < orderedIds.length; i++) {
      await DB.run(
        'UPDATE measurement_fields SET field_order = ? WHERE id = ? AND category_id = ?',
        [i, orderedIds[i], categoryId]
      );
    }
  }

  // Every screen that renders a field's label (measurements form,
  // order item entry, tailor print copy, ...) should go through this
  // so Urdu-mode always shows the Urdu label when one's been set,
  // and falls back to English if it hasn't.
  function label(field) {
    if (!field) return '';
    if (I18n.getLanguage() === 'ur' && field.field_label_ur) return field.field_label_ur;
    return field.field_label;
  }

  return { listByCategory, listEnabledByCategory, get, create, update, remove, reorder, isValidKey, label };
})();
