/* ============================================================
   DesignOptionService — CRUD over the customizable design_options
   catalog (Gol Daman / Front Pocket / Round Collar / ...). Each
   option can optionally be scoped to a category_id (e.g. "Gol Daman"
   only makes sense for Shirt/Kurta); category_id = NULL means it
   shows up for every category. An order item can pick *several*
   design options at once (e.g. Gol Daman + Front Pocket + Round
   Collar all on the same shirt), so the order screen multi-selects
   from this list rather than choosing just one.
   ============================================================ */

const DesignOptionService = (function () {
  async function list() {
    return DB.query('SELECT * FROM design_options ORDER BY sort_order, id');
  }

  // Options that apply to a given category: global ones (category_id
  // IS NULL) plus any scoped specifically to this category.
  async function listForCategory(categoryId) {
    return DB.query(
      'SELECT * FROM design_options WHERE enabled = 1 AND (category_id IS NULL OR category_id = ?) ORDER BY sort_order, id',
      [categoryId]
    );
  }

  async function get(id) {
    const rows = await DB.query('SELECT * FROM design_options WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async function nextOrder() {
    const rows = await DB.query('SELECT COALESCE(MAX(sort_order), -1) AS m FROM design_options');
    return (rows[0].m == null ? -1 : rows[0].m) + 1;
  }

  async function create(data) {
    const order = data.sort_order != null ? data.sort_order : await nextOrder();
    const res = await DB.run(
      'INSERT INTO design_options (category_id, name, name_ur, enabled, sort_order) VALUES (?, ?, ?, 1, ?)',
      [data.category_id || null, data.name, data.name_ur || null, order]
    );
    return res.lastId;
  }

  async function update(id, data) {
    const existing = await get(id);
    if (!existing) return;
    await DB.run(
      'UPDATE design_options SET category_id=?, name=?, name_ur=?, enabled=? WHERE id=?',
      [
        data.category_id !== undefined ? data.category_id : existing.category_id,
        data.name != null ? data.name : existing.name,
        data.name_ur != null ? data.name_ur : existing.name_ur,
        data.enabled != null ? (data.enabled ? 1 : 0) : existing.enabled,
        id
      ]
    );
  }

  async function remove(id) {
    await DB.run('DELETE FROM design_options WHERE id = ?', [id]);
  }

  function label(opt) {
    if (!opt) return '';
    if (I18n.getLanguage() === 'ur' && opt.name_ur) return opt.name_ur;
    return opt.name;
  }

  return { list, listForCategory, get, create, update, remove, label };
})();
