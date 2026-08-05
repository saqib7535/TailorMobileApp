/* ============================================================
   SupplierService — CRUD over the suppliers table + a summary
   rollup (purchase count, total owed) used by the supplier
   detail sheet. Mirrors CustomerService's structure closely —
   suppliers are the purchase-side equivalent of customers.
   ============================================================ */

const SupplierService = (function () {
  async function list(opts) {
    opts = opts || {};
    const search = opts.search;
    if (search && search.trim()) {
      const term = '%' + search.trim() + '%';
      return DB.query(
        'SELECT * FROM suppliers WHERE name LIKE ? OR phone LIKE ? ORDER BY name COLLATE NOCASE',
        [term, term]
      );
    }
    return DB.query('SELECT * FROM suppliers ORDER BY name COLLATE NOCASE');
  }

  async function get(id) {
    const rows = await DB.query('SELECT * FROM suppliers WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async function create(data) {
    const res = await DB.run(
      `INSERT INTO suppliers (name, phone, address, notes) VALUES (?, ?, ?, ?)`,
      [data.name, data.phone || '', data.address || '', data.notes || '']
    );
    return res.lastId;
  }

  async function update(id, data) {
    await DB.run(
      `UPDATE suppliers SET name=?, phone=?, address=?, notes=?, updated_at=datetime('now') WHERE id=?`,
      [data.name, data.phone || '', data.address || '', data.notes || '', id]
    );
  }

  // Blocks a hard delete whenever the supplier has purchases on file —
  // same reference-check pattern as CustomerService.remove().
  async function remove(id) {
    const summary = await getSummary(id);
    if (summary.purchaseCount > 0) {
      return { ok: false, error: 'hasReferences', summary };
    }
    await DB.run('DELETE FROM suppliers WHERE id = ?', [id]);
    return { ok: true };
  }

  // totalOwed sums each purchase's stored `balance` column (grand_total
  // minus paid_amount, kept in sync by PurchaseService at creation time)
  // rather than recomputing it here, so there's a single source of truth
  // for what's owed on any given purchase.
  async function getSummary(supplierId) {
    const rows = await DB.query(
      'SELECT COUNT(*) AS c, COALESCE(SUM(balance),0) AS owed FROM purchases WHERE supplier_id = ?',
      [supplierId]
    );
    return { purchaseCount: rows[0].c || 0, totalOwed: rows[0].owed || 0 };
  }

  return { list, get, create, update, remove, getSummary };
})();
