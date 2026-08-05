/* ============================================================
   CategoryService — CRUD over the categories table (garment types).
   Deleting a category that's referenced by measurements or
   order_items would orphan those rows, so remove() checks for
   references first and soft-disables (enabled=0) instead of a
   hard DELETE whenever any exist.
   ============================================================ */

const CategoryService = (function () {
  async function list() {
    return DB.query('SELECT * FROM categories ORDER BY sort_order, name COLLATE NOCASE');
  }

  async function listEnabled() {
    return DB.query('SELECT * FROM categories WHERE enabled = 1 ORDER BY sort_order, name COLLATE NOCASE');
  }

  async function get(id) {
    const rows = await DB.query('SELECT * FROM categories WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async function create(data) {
    const res = await DB.run(
      `INSERT INTO categories (name, icon, color, default_price, enabled, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.icon || 'others',
        data.color || '#7c2d3c',
        data.default_price || 0,
        data.enabled === false ? 0 : 1,
        data.sort_order || 0
      ]
    );
    return res.lastId;
  }

  async function update(id, data) {
    await DB.run(
      `UPDATE categories SET name=?, icon=?, color=?, default_price=?, sort_order=? WHERE id=?`,
      [data.name, data.icon || 'others', data.color || '#7c2d3c', data.default_price || 0, data.sort_order || 0, id]
    );
  }

  async function setEnabled(id, enabled) {
    await DB.run('UPDATE categories SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
  }

  // A category is "in use" if any saved measurement or order_item
  // still points at it — hard-deleting it would orphan those rows.
  async function hasReferences(id) {
    const measRows = await DB.query('SELECT COUNT(*) AS c FROM measurements WHERE category_id = ?', [id]);
    const itemRows = await DB.query('SELECT COUNT(*) AS c FROM order_items WHERE category_id = ?', [id]);
    return (measRows[0].c || 0) > 0 || (itemRows[0].c || 0) > 0;
  }

  // Returns { hardDeleted: boolean } so the caller can tell the user
  // whether the category was actually removed or just disabled.
  async function remove(id) {
    const referenced = await hasReferences(id);
    if (referenced) {
      await setEnabled(id, false);
      return { hardDeleted: false };
    }
    await DB.run('DELETE FROM measurement_fields WHERE category_id = ?', [id]);
    await DB.run('DELETE FROM categories WHERE id = ?', [id]);
    return { hardDeleted: true };
  }

  return { list, listEnabled, get, create, update, setEnabled, hasReferences, remove };
})();
