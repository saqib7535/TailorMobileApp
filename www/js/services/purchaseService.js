/* ============================================================
   PurchaseService — purchase numbering, purchase/item creation,
   and search. This is the write-side of inventory: saving a
   purchase is the only normal way stock quantity goes up.

   Purchase numbering: TS-PO-<year>-000001, sequential per calendar
   year — the exact same meta-table-counter mechanism OrderService
   uses for invoice numbers (see orderService.js's header comment
   for the full rationale), just with its own counter key
   (`purchase_seq_<year>`) so the two sequences never collide.
   nextPurchaseNo() only peeks; reservePurchaseNo() is the only
   thing that mutates the counter, and it only runs inside
   createPurchase() so cancelling out of the New Purchase screen
   never burns a number.

   New-item-inline-during-purchase: each line in `items` either
   carries an existing inventoryItemId (picked from a search), or a
   bare itemName with no id — which means "this fabric/material
   doesn't exist in inventory yet". For the latter, createPurchase()
   first creates the inventory_items row itself (starting stock 0,
   category/unit/rate taken from what the user typed on this line),
   then inserts the purchase_items row against the new id, then calls
   InventoryService.receiveStock() exactly like it would for an
   existing item — so a brand-new fabric and a restock of an existing
   one go through the identical stock-increase path.

   No explicit SQL transaction wraps the multi-step write, matching
   OrderService.createOrder()'s approach (a single-writer offline app
   has no concurrent-device contention to guard against) — just a
   sequential run of awaited DB.run() calls.
   ============================================================ */

const PurchaseService = (function () {
  // ---------------------------------------------------------
  // Purchase numbering
  // ---------------------------------------------------------
  function formatPurchaseNo(year, n) {
    return 'TS-PO-' + year + '-' + String(n).padStart(6, '0');
  }

  async function nextPurchaseNo() {
    const year = new Date().getFullYear();
    const key = 'purchase_seq_' + year;
    const rows = await DB.query('SELECT value FROM meta WHERE key = ?', [key]);
    const next = (rows.length ? parseInt(rows[0].value, 10) : 0) + 1;
    return formatPurchaseNo(year, next);
  }

  async function reservePurchaseNo() {
    const year = new Date().getFullYear();
    const key = 'purchase_seq_' + year;
    const rows = await DB.query('SELECT value FROM meta WHERE key = ?', [key]);
    const next = (rows.length ? parseInt(rows[0].value, 10) : 0) + 1;
    if (rows.length) {
      await DB.run('UPDATE meta SET value = ? WHERE key = ?', [String(next), key]);
    } else {
      await DB.run('INSERT INTO meta (key, value) VALUES (?, ?)', [key, String(next)]);
    }
    return formatPurchaseNo(year, next);
  }

  // ---------------------------------------------------------
  // Totals
  // ---------------------------------------------------------
  function computeTotals(items, opts) {
    opts = opts || {};
    const subtotal = (items || []).reduce(
      (sum, it) => sum + Number(it.quantity || 0) * Number(it.rate || 0), 0
    );
    const discount = Number(opts.discount || 0);
    const grandTotal = Math.max(0, subtotal - discount);
    return { subtotal, discount, grandTotal };
  }

  // ---------------------------------------------------------
  // Create
  // ---------------------------------------------------------
  async function createPurchase(data) {
    data = data || {};
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) throw new Error('At least one item is required');

    const totals = computeTotals(items, { discount: data.discount });
    const paidAmount = Number(data.paidAmount || 0);
    const balance = Math.max(0, totals.grandTotal - paidAmount);
    const purchaseNo = await reservePurchaseNo();

    const res = await DB.run(
      `INSERT INTO purchases (
         purchase_no, supplier_id, purchase_date, subtotal, discount,
         grand_total, paid_amount, balance, payment_method, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        purchaseNo, data.supplierId || null, data.purchaseDate || Format.todayIso(),
        totals.subtotal, totals.discount, totals.grandTotal,
        paidAmount, balance, data.paymentMethod || 'Cash', data.notes || ''
      ]
    );
    const purchaseId = res.lastId;

    for (const it of items) {
      const qty = Number(it.quantity || 0);
      const rate = Number(it.rate || 0);
      const unit = it.unit || 'meter';
      let inventoryItemId = it.inventoryItemId || null;
      let itemName = String(it.itemName || it.newItemName || '').trim();

      if (!inventoryItemId && itemName) {
        inventoryItemId = await InventoryService.create({
          name: itemName,
          category: it.category || 'Fabric',
          unit,
          unit_price: rate,
          quantity_in_stock: 0,
          low_stock_threshold: it.lowStockThreshold != null ? it.lowStockThreshold : 5,
          sku: it.sku || ''
        });
      } else if (inventoryItemId && !itemName) {
        const existing = await InventoryService.get(inventoryItemId);
        itemName = existing ? existing.name : '';
      }

      await DB.run(
        `INSERT INTO purchase_items (purchase_id, inventory_item_id, item_name, quantity, unit, rate, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [purchaseId, inventoryItemId, itemName, qty, unit, rate, qty * rate]
      );

      if (inventoryItemId && qty > 0) {
        await InventoryService.receiveStock(inventoryItemId, qty, rate);
      }
    }

    return getPurchase(purchaseId);
  }

  // ---------------------------------------------------------
  // Read
  // ---------------------------------------------------------
  async function getPurchase(id) {
    const rows = await DB.query(
      `SELECT p.*, s.name AS supplier_name, s.phone AS supplier_phone
       FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`,
      [id]
    );
    if (!rows.length) return null;
    const items = await DB.query(
      `SELECT pi.*, ii.name AS inventory_name FROM purchase_items pi
       LEFT JOIN inventory_items ii ON ii.id = pi.inventory_item_id
       WHERE pi.purchase_id = ? ORDER BY pi.id`,
      [id]
    );
    return Object.assign({}, rows[0], { items });
  }

  // ---------------------------------------------------------
  // Search
  // ---------------------------------------------------------
  async function search(filters) {
    filters = filters || {};
    const clauses = [];
    const params = [];

    if (filters.supplierId) { clauses.push('p.supplier_id = ?'); params.push(filters.supplierId); }
    if (filters.dateFrom) { clauses.push('p.purchase_date >= ?'); params.push(filters.dateFrom); }
    if (filters.dateTo) { clauses.push('p.purchase_date <= ?'); params.push(filters.dateTo); }
    if (filters.query && filters.query.trim()) {
      const term = '%' + filters.query.trim() + '%';
      clauses.push('(p.purchase_no LIKE ? OR s.name LIKE ?)');
      params.push(term, term);
    }

    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    return DB.query(
      `SELECT p.*, s.name AS supplier_name
       FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
       ${where}
       ORDER BY p.purchase_date DESC, p.id DESC
       LIMIT 300`,
      params
    );
  }

  return { nextPurchaseNo, computeTotals, createPurchase, getPurchase, search };
})();
