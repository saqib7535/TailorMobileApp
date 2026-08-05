/* ============================================================
   InventoryService — CRUD over inventory_items (fabric/material
   stock) plus two distinct ways stock quantity changes:

     - receiveStock(id, qty, rate): called only from
       PurchaseService.createPurchase() when a purchase is saved.
       Bumps quantity_in_stock up and refreshes unit_price to the
       latest purchase rate, so the inventory screen always shows
       current cost. Never touches notes — this is routine, not a
       correction that needs explaining.

     - adjustStock(id, delta, reason): the manual "+/-" quick-adjust
       action on the Inventory screen (correction, wastage, returned
       to supplier, etc). delta can be negative; the result is
       clamped at 0 (stock can't go negative). There's no dedicated
       adjustments table in the schema, so the reason is folded into
       the item's notes field instead — the same trick
       OrderService.updateStatus() uses to fold a cancellation reason
       into an order's notes when there's no reason column for it.

   remove() blocks a hard delete whenever the item is referenced by
   any purchase_items row (would otherwise orphan purchase history) —
   same reference-check pattern as CategoryService.hasReferences().
   ============================================================ */

const InventoryService = (function () {
  async function list(opts) {
    opts = opts || {};
    const clauses = [];
    const params = [];
    if (opts.search && opts.search.trim()) {
      const term = '%' + opts.search.trim() + '%';
      clauses.push('(name LIKE ? OR sku LIKE ?)');
      params.push(term, term);
    }
    if (opts.lowStockOnly) {
      clauses.push('quantity_in_stock <= low_stock_threshold');
    }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    return DB.query(`SELECT * FROM inventory_items ${where} ORDER BY name COLLATE NOCASE`, params);
  }

  async function get(id) {
    const rows = await DB.query('SELECT * FROM inventory_items WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async function create(data) {
    const res = await DB.run(
      `INSERT INTO inventory_items (name, category, unit, unit_price, quantity_in_stock, low_stock_threshold, sku, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.category || 'Fabric',
        data.unit || 'meter',
        Number(data.unit_price || 0),
        Number(data.quantity_in_stock || 0),
        Number(data.low_stock_threshold != null ? data.low_stock_threshold : 5),
        data.sku || '',
        data.notes || ''
      ]
    );
    return res.lastId;
  }

  // Deliberately excludes quantity_in_stock — the only sanctioned ways
  // to change stock are receiveStock() (via a purchase) and
  // adjustStock() (manual correction), so the edit form never offers a
  // raw "set quantity" field.
  async function update(id, data) {
    await DB.run(
      `UPDATE inventory_items SET name=?, category=?, unit=?, unit_price=?, low_stock_threshold=?, sku=?, notes=?, updated_at=datetime('now')
       WHERE id=?`,
      [
        data.name,
        data.category || 'Fabric',
        data.unit || 'meter',
        Number(data.unit_price || 0),
        Number(data.low_stock_threshold != null ? data.low_stock_threshold : 5),
        data.sku || '',
        data.notes || '',
        id
      ]
    );
  }

  async function receiveStock(id, quantity, rate) {
    const qty = Number(quantity || 0);
    await DB.run(
      `UPDATE inventory_items SET quantity_in_stock = quantity_in_stock + ?, unit_price = ?, updated_at = datetime('now') WHERE id = ?`,
      [qty, Number(rate || 0), id]
    );
  }

  async function adjustStock(id, delta, reason) {
    const item = await get(id);
    if (!item) throw new Error('Inventory item not found');
    const d = Number(delta || 0);
    if (!d) throw new Error('Adjustment amount must not be zero');
    const newQty = Math.max(0, Number(item.quantity_in_stock || 0) + d);
    const line = '[' + Format.todayIso() + '] ' + (d > 0 ? '+' : '') + d + ' ' + item.unit + (reason ? ' — ' + reason : '');
    const notes = item.notes ? item.notes + '\n' + line : line;
    await DB.run(
      `UPDATE inventory_items SET quantity_in_stock = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
      [newQty, notes, id]
    );
    return get(id);
  }

  async function hasReferences(id) {
    const rows = await DB.query('SELECT COUNT(*) AS c FROM purchase_items WHERE inventory_item_id = ?', [id]);
    return (rows[0].c || 0) > 0;
  }

  async function remove(id) {
    if (await hasReferences(id)) {
      return { ok: false, error: 'hasReferences' };
    }
    await DB.run('DELETE FROM inventory_items WHERE id = ?', [id]);
    return { ok: true };
  }

  async function getLowStock() {
    return DB.query('SELECT * FROM inventory_items WHERE quantity_in_stock <= low_stock_threshold ORDER BY name COLLATE NOCASE');
  }

  return { list, get, create, update, receiveStock, adjustStock, hasReferences, remove, getLowStock };
})();
