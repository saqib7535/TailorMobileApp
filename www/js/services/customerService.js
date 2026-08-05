/* ============================================================
   CustomerService — CRUD over the customers table + a summary
   rollup (measurement profile count, order count) used by the
   customer detail sheet.

   Family tree: a customer can optionally point at another customer
   as its "head" (head_customer_id) with a relation label (Bhai/Beta/
   Wife/...). A customer with head_customer_id = NULL is either an
   independent customer or the head of a family — which one just
   depends on whether any other customer points back at them.
   ============================================================ */

const CustomerService = (function () {
  async function list(opts) {
    opts = opts || {};
    const search = opts.search;
    if (search && search.trim()) {
      const term = '%' + search.trim() + '%';
      return DB.query(
        'SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? OR whatsapp LIKE ? ORDER BY name COLLATE NOCASE',
        [term, term, term]
      );
    }
    return DB.query('SELECT * FROM customers ORDER BY name COLLATE NOCASE');
  }

  // Top-level list for the Customers screen: independent customers
  // and family heads only (family members are nested under their
  // head, not shown as their own top-level row), each annotated with
  // how many family members they have.
  async function listTopLevel(opts) {
    opts = opts || {};
    const search = opts.search;
    let rows;
    if (search && search.trim()) {
      const term = '%' + search.trim() + '%';
      // A search can match a family member's name/phone even though
      // only the head is shown — so pull in the matching member's
      // head too, and de-dupe.
      rows = await DB.query(
        `SELECT DISTINCT h.* FROM customers h
         LEFT JOIN customers m ON m.head_customer_id = h.id
         WHERE h.head_customer_id IS NULL
           AND (h.name LIKE ? OR h.phone LIKE ? OR h.whatsapp LIKE ?
                OR m.name LIKE ? OR m.phone LIKE ? OR m.whatsapp LIKE ?)
         ORDER BY h.name COLLATE NOCASE`,
        [term, term, term, term, term, term]
      );
    } else {
      rows = await DB.query('SELECT * FROM customers WHERE head_customer_id IS NULL ORDER BY name COLLATE NOCASE');
    }
    const counts = await DB.query(
      'SELECT head_customer_id AS id, COUNT(*) AS c FROM customers WHERE head_customer_id IS NOT NULL GROUP BY head_customer_id'
    );
    const countMap = {};
    counts.forEach((r) => { countMap[r.id] = r.c; });
    return rows.map((r) => ({ ...r, familyMemberCount: countMap[r.id] || 0 }));
  }

  async function get(id) {
    const rows = await DB.query('SELECT * FROM customers WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async function getFamilyMembers(headCustomerId) {
    return DB.query('SELECT * FROM customers WHERE head_customer_id = ? ORDER BY name COLLATE NOCASE', [headCustomerId]);
  }

  // Resolves any customer (head or member) to its full family group:
  // { head, members[] }. Works whether you pass the head's id or a
  // member's id — a member's "family" is still headed by their head.
  async function getFamilyGroup(customerId) {
    const customer = await get(customerId);
    if (!customer) return null;
    const head = customer.head_customer_id ? await get(customer.head_customer_id) : customer;
    if (!head) return null;
    const members = await getFamilyMembers(head.id);
    return { head, members };
  }

  async function create(data) {
    const res = await DB.run(
      `INSERT INTO customers (name, phone, whatsapp, address, notes, photo_path, head_customer_id, relation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.phone || '', data.whatsapp || '', data.address || '', data.notes || '', data.photo_path || null,
       data.head_customer_id || null, data.relation || null]
    );
    return res.lastId;
  }

  async function update(id, data) {
    await DB.run(
      `UPDATE customers SET name=?, phone=?, whatsapp=?, address=?, notes=?, photo_path=?, head_customer_id=?, relation=?, updated_at=datetime('now')
       WHERE id=?`,
      [data.name, data.phone || '', data.whatsapp || '', data.address || '', data.notes || '', data.photo_path || null,
       data.head_customer_id || null, data.relation || null, id]
    );
  }

  // Blocks a hard delete whenever the customer has measurement
  // profiles, orders, or (if this is a family head) family members
  // on file.
  async function remove(id) {
    const summary = await getSummary(id);
    if (summary.measurementCount > 0 || summary.orderCount > 0 || summary.familyMemberCount > 0) {
      return { ok: false, error: 'hasReferences', summary };
    }
    await DB.run('DELETE FROM customers WHERE id = ?', [id]);
    return { ok: true };
  }

  async function getSummary(customerId) {
    const measRows = await DB.query('SELECT COUNT(*) AS c FROM measurements WHERE customer_id = ?', [customerId]);
    const familyRows = await DB.query('SELECT COUNT(*) AS c FROM customers WHERE head_customer_id = ?', [customerId]);
    let orderCount = 0;
    try {
      const orderRows = await DB.query('SELECT COUNT(*) AS c FROM orders WHERE customer_id = ?', [customerId]);
      orderCount = orderRows[0].c || 0;
    } catch (e) {
      orderCount = 0;
    }
    return { measurementCount: measRows[0].c || 0, orderCount, familyMemberCount: familyRows[0].c || 0 };
  }

  // Customer khata: every order placed under this customer_id
  // (family orders are always created under the head's customer_id,
  // even when individual items belong to different family members —
  // see order_items.for_customer_id), with totals rolled up. Reads
  // straight from orders/payments so it's always in sync with
  // whatever the dashboard/reports show — there's no separate cached
  // ledger number anywhere to fall out of date.
  async function getLedger(customerId) {
    const orders = await DB.query(
      `SELECT id, invoice_no, order_date, status, grand_total, remaining_balance
       FROM orders WHERE customer_id = ? ORDER BY order_date DESC, id DESC`,
      [customerId]
    );
    const totals = orders.reduce((acc, o) => {
      acc.totalBilled += Number(o.grand_total || 0);
      acc.totalRemaining += Number(o.remaining_balance || 0);
      return acc;
    }, { totalBilled: 0, totalRemaining: 0 });
    totals.totalPaid = totals.totalBilled - totals.totalRemaining;
    totals.orders = orders;
    return totals;
  }

  return { list, listTopLevel, get, getFamilyMembers, getFamilyGroup, create, update, remove, getSummary, getLedger };
})();
