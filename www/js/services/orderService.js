/* ============================================================
   OrderService — invoice numbering, order/item CRUD, the status
   pipeline, payments and delivery.

   Invoice numbering: TS-<year>-000001, sequential per calendar
   year. The next number is derived from a counter stored in the
   `meta` table (key `invoice_seq_<year>`), not from counting rows,
   so a deleted/edited order can never cause a collision. This is a
   single-writer offline app (no concurrent devices touch the same
   DB file), so a plain read-then-write on that counter is race-safe
   enough — there is no multi-process contention to guard against.
   `nextInvoiceNo()` only *peeks* at the counter (for the "next
   invoice will be TS-2026-000007" preview on the New Order screen)
   and never mutates it; the actual reservation happens once, inside
   createOrder(), so cancelling out of the New Order screen never
   burns a number.

   Status pipeline: Order Placed -> Cutting -> Stitching -> Finishing
   -> Ready -> Delivered, with Cancelled reachable from any
   non-terminal state. updateStatus() only handles forward moves
   along that pipeline (it will happily skip steps, e.g. Order
   Placed -> Ready, since a shop may legitimately not need every
   intermediate stage — but it always rejects backward moves and
   rejects moving *to* Delivered, which must go through
   recordDelivery() so delivered_at/delivered_by/signature_data are
   always set together with the status change). cancel() reuses the
   same status-history mechanism and folds the reason into the
   order's notes, since order_status_history has no reason column.

   Payments: every rupee collected against an order — including the
   advance taken at creation time — is a row in `payments`, so
   remaining_balance is always simply grand_total minus the sum of
   payments on file. That keeps a single source of truth instead of
   tracking advance_paid and payments separately.
   ============================================================ */

const OrderService = (function () {
  const STATUS_FLOW = ['Order Placed', 'Cutting', 'Stitching', 'Finishing', 'Ready', 'Delivered'];
  const ALL_STATUSES = STATUS_FLOW.concat(['Cancelled']);

  function currentUsername() {
    const u = (typeof AuthService !== 'undefined') ? AuthService.currentUser() : null;
    return u ? u.username : null;
  }

  // ---------------------------------------------------------
  // Invoice numbering
  // ---------------------------------------------------------
  function formatInvoiceNo(year, n) {
    return 'TS-' + year + '-' + String(n).padStart(6, '0');
  }

  async function nextInvoiceNo() {
    const year = new Date().getFullYear();
    const key = 'invoice_seq_' + year;
    const rows = await DB.query('SELECT value FROM meta WHERE key = ?', [key]);
    const next = (rows.length ? parseInt(rows[0].value, 10) : 0) + 1;
    return formatInvoiceNo(year, next);
  }

  async function reserveInvoiceNo() {
    const year = new Date().getFullYear();
    const key = 'invoice_seq_' + year;
    const rows = await DB.query('SELECT value FROM meta WHERE key = ?', [key]);
    const next = (rows.length ? parseInt(rows[0].value, 10) : 0) + 1;
    if (rows.length) {
      await DB.run('UPDATE meta SET value = ? WHERE key = ?', [String(next), key]);
    } else {
      await DB.run('INSERT INTO meta (key, value) VALUES (?, ?)', [key, String(next)]);
    }
    return formatInvoiceNo(year, next);
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
    const extraCharges = Number(opts.extraCharges || 0);
    const deliveryCharges = Number(opts.deliveryCharges || 0);
    const grandTotal = Math.max(0, subtotal - discount + extraCharges + deliveryCharges);
    return { subtotal, discount, extraCharges, deliveryCharges, grandTotal };
  }

  async function recomputeRemaining(orderId) {
    const orderRows = await DB.query('SELECT grand_total FROM orders WHERE id = ?', [orderId]);
    if (!orderRows.length) return 0;
    const paidRows = await DB.query('SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE order_id = ?', [orderId]);
    const remaining = Math.max(0, Number(orderRows[0].grand_total) - Number(paidRows[0].paid));
    await DB.run(`UPDATE orders SET remaining_balance = ?, updated_at = datetime('now') WHERE id = ?`, [remaining, orderId]);
    return remaining;
  }

  // ---------------------------------------------------------
  // Create
  // ---------------------------------------------------------
  async function createOrder(data) {
    data = data || {};
    if (!data.customerId) throw new Error('customerId is required');
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) throw new Error('At least one item is required');

    const totals = computeTotals(items, {
      discount: data.discount, extraCharges: data.extraCharges, deliveryCharges: data.deliveryCharges
    });
    const advancePaid = Number(data.advancePaid || 0);
    const invoiceNo = await reserveInvoiceNo();
    const username = currentUsername();
    const paymentMethod = data.paymentMethod || 'Cash';

    const res = await DB.run(
      `INSERT INTO orders (
         invoice_no, customer_id, order_date, delivery_date, urgent, status,
         subtotal, discount, extra_charges, delivery_charges, grand_total,
         advance_paid, remaining_balance, payment_method, notes, created_by
       ) VALUES (?, ?, ?, ?, ?, 'Order Placed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNo, data.customerId, data.orderDate || Format.todayIso(), data.deliveryDate || null,
        data.urgent ? 1 : 0,
        totals.subtotal, totals.discount, totals.extraCharges, totals.deliveryCharges, totals.grandTotal,
        advancePaid, totals.grandTotal, paymentMethod, data.notes || '', username
      ]
    );
    const orderId = res.lastId;

    for (const it of items) {
      const qty = Number(it.quantity || 1);
      const rate = Number(it.rate || 0);
      await DB.run(
        `INSERT INTO order_items (
           order_id, category_id, category_name, measurement_id, garment_label,
           for_customer_id, for_customer_name, fabric_type_id, fabric_type_name, design_labels,
           quantity, rate, subtotal, photo_path, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId, it.categoryId || null, it.categoryName || '', it.measurementId || null,
          it.garmentLabel || '',
          it.forCustomerId || data.customerId, it.forCustomerName || '',
          it.fabricTypeId || null, it.fabricTypeName || '',
          it.designLabels && it.designLabels.length ? JSON.stringify(it.designLabels) : null,
          qty, rate, qty * rate, it.photoPath || null, it.notes || null
        ]
      );
    }

    await DB.run(
      `INSERT INTO order_status_history (order_id, status, changed_by) VALUES (?, 'Order Placed', ?)`,
      [orderId, username]
    );

    if (advancePaid > 0) {
      await DB.run(
        `INSERT INTO payments (order_id, amount, method, note, received_by) VALUES (?, ?, ?, ?, ?)`,
        [orderId, advancePaid, paymentMethod, 'Advance payment at order creation', username]
      );
      await recomputeRemaining(orderId);
    }

    return getOrder(orderId);
  }

  // ---------------------------------------------------------
  // Read
  // ---------------------------------------------------------
  async function getOrderRaw(id) {
    const rows = await DB.query('SELECT * FROM orders WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async function getOrder(id) {
    const rows = await DB.query(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, c.whatsapp AS customer_whatsapp, c.address AS customer_address
       FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?`,
      [id]
    );
    if (!rows.length) return null;
    const items = await DB.query(
      `SELECT oi.*, m.profile_label AS measurement_label
       FROM order_items oi
       LEFT JOIN measurements m ON m.id = oi.measurement_id
       WHERE oi.order_id = ? ORDER BY oi.id`,
      [id]
    );
    items.forEach((it) => {
      try { it.designLabelsArr = it.design_labels ? JSON.parse(it.design_labels) : []; }
      catch (e) { it.designLabelsArr = []; }
    });
    const payments = await DB.query('SELECT * FROM payments WHERE order_id = ? ORDER BY paid_at, id', [id]);
    const history = await DB.query('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY changed_at, id', [id]);
    return Object.assign({}, rows[0], { items, payments, history });
  }

  // ---------------------------------------------------------
  // Status pipeline
  // ---------------------------------------------------------
  function nextStatusOptions(status) {
    const idx = STATUS_FLOW.indexOf(status);
    if (idx === -1) return [];
    // Delivered is intentionally excluded here — it only ever happens
    // through recordDelivery(), never through the plain status changer.
    return STATUS_FLOW.slice(idx + 1).filter((s) => s !== 'Delivered');
  }

  function canTransition(currentStatus, newStatus) {
    if (currentStatus === 'Delivered' || currentStatus === 'Cancelled') return false;
    if (newStatus === 'Cancelled') return true;
    if (newStatus === 'Delivered') return false; // must go through recordDelivery()
    const curIdx = STATUS_FLOW.indexOf(currentStatus);
    const nextIdx = STATUS_FLOW.indexOf(newStatus);
    if (curIdx === -1 || nextIdx === -1) return false;
    return nextIdx > curIdx;
  }

  async function updateStatus(orderId, newStatus, opts) {
    opts = opts || {};
    const order = await getOrderRaw(orderId);
    if (!order) throw new Error('Order not found');
    if (!canTransition(order.status, newStatus)) {
      throw new Error('Cannot move an order from "' + order.status + '" to "' + newStatus + '"');
    }
    let notes = order.notes || '';
    if (newStatus === 'Cancelled' && opts.reason) {
      notes = (notes ? notes + '\n' : '') + '[Cancelled] ' + opts.reason;
    }
    await DB.run(
      `UPDATE orders SET status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
      [newStatus, notes, orderId]
    );
    await DB.run(
      `INSERT INTO order_status_history (order_id, status, changed_by) VALUES (?, ?, ?)`,
      [orderId, newStatus, currentUsername()]
    );
    return getOrder(orderId);
  }

  async function cancel(orderId, reason) {
    return updateStatus(orderId, 'Cancelled', { reason: reason || '' });
  }

  // ---------------------------------------------------------
  // Payments
  // ---------------------------------------------------------
  async function recordPayment(orderId, amount, method, note) {
    const amt = Number(amount || 0);
    if (amt <= 0) throw new Error('Payment amount must be greater than zero');
    const order = await getOrderRaw(orderId);
    if (!order) throw new Error('Order not found');
    await DB.run(
      `INSERT INTO payments (order_id, amount, method, note, received_by) VALUES (?, ?, ?, ?, ?)`,
      [orderId, amt, method || 'Cash', note || '', currentUsername()]
    );
    await recomputeRemaining(orderId);
    return getOrder(orderId);
  }

  // ---------------------------------------------------------
  // Delivery
  // ---------------------------------------------------------
  async function recordDelivery(orderId, data) {
    data = data || {};
    const order = await getOrderRaw(orderId);
    if (!order) throw new Error('Order not found');
    if (order.status === 'Delivered' || order.status === 'Cancelled') {
      throw new Error('Order is already ' + order.status);
    }

    const finalAmount = Number(data.finalPaymentAmount || 0);
    if (finalAmount > 0) {
      await DB.run(
        `INSERT INTO payments (order_id, amount, method, note, received_by) VALUES (?, ?, ?, ?, ?)`,
        [orderId, finalAmount, data.method || 'Cash', 'Final payment on delivery', currentUsername()]
      );
    }
    await recomputeRemaining(orderId);

    const deliveredBy = data.deliveredBy || currentUsername() || '';
    await DB.run(
      `UPDATE orders SET status = 'Delivered', delivered_at = datetime('now'), delivered_by = ?, signature_data = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [deliveredBy, data.signatureData || null, orderId]
    );
    await DB.run(
      `INSERT INTO order_status_history (order_id, status, changed_by) VALUES (?, 'Delivered', ?)`,
      [orderId, currentUsername()]
    );
    return getOrder(orderId);
  }

  // ---------------------------------------------------------
  // Edit / Delete
  // ---------------------------------------------------------
  // Both are refused once an order is Delivered — a delivered order
  // is a closed transaction (the garment is gone, money is settled);
  // editing it after the fact would silently rewrite history. The
  // UI hides the buttons too, but this is the real backstop.
  async function updateOrder(orderId, data) {
    const order = await getOrderRaw(orderId);
    if (!order) throw new Error('Order not found');
    if (order.status === 'Delivered') throw new Error('Delivered orders cannot be edited');

    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) throw new Error('At least one item is required');
    const totals = computeTotals(items, {
      discount: data.discount, extraCharges: data.extraCharges, deliveryCharges: data.deliveryCharges
    });

    await DB.run(
      `UPDATE orders SET
         customer_id = ?, order_date = ?, delivery_date = ?, urgent = ?,
         subtotal = ?, discount = ?, extra_charges = ?, delivery_charges = ?, grand_total = ?,
         payment_method = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        data.customerId, data.orderDate || order.order_date, data.deliveryDate || null, data.urgent ? 1 : 0,
        totals.subtotal, totals.discount, totals.extraCharges, totals.deliveryCharges, totals.grandTotal,
        data.paymentMethod || order.payment_method, data.notes || '', orderId
      ]
    );

    await DB.run('DELETE FROM order_items WHERE order_id = ?', [orderId]);
    for (const it of items) {
      const qty = Number(it.quantity || 1);
      const rate = Number(it.rate || 0);
      await DB.run(
        `INSERT INTO order_items (
           order_id, category_id, category_name, measurement_id, garment_label,
           for_customer_id, for_customer_name, fabric_type_id, fabric_type_name, design_labels,
           quantity, rate, subtotal, photo_path, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId, it.categoryId || null, it.categoryName || '', it.measurementId || null,
          it.garmentLabel || '',
          it.forCustomerId || data.customerId, it.forCustomerName || '',
          it.fabricTypeId || null, it.fabricTypeName || '',
          it.designLabels && it.designLabels.length ? JSON.stringify(it.designLabels) : null,
          qty, rate, qty * rate, it.photoPath || null, it.notes || null
        ]
      );
    }

    // grand_total may have changed — remaining_balance is always
    // grand_total minus whatever's already in the payments table
    // (including the advance), so just re-derive it rather than
    // touching payments directly.
    await recomputeRemaining(orderId);
    return getOrder(orderId);
  }

  async function deleteOrder(orderId) {
    const order = await getOrderRaw(orderId);
    if (!order) throw new Error('Order not found');
    if (order.status === 'Delivered') throw new Error('Delivered orders cannot be deleted');
    await DB.run('DELETE FROM order_items WHERE order_id = ?', [orderId]);
    await DB.run('DELETE FROM payments WHERE order_id = ?', [orderId]);
    await DB.run('DELETE FROM order_status_history WHERE order_id = ?', [orderId]);
    await DB.run('DELETE FROM orders WHERE id = ?', [orderId]);
  }

  // ---------------------------------------------------------
  // Search
  // ---------------------------------------------------------
  async function search(filters) {
    filters = filters || {};
    const clauses = [];
    const params = [];

    if (filters.status) { clauses.push('o.status = ?'); params.push(filters.status); }
    if (filters.customerId) { clauses.push('o.customer_id = ?'); params.push(filters.customerId); }
    if (filters.dateFrom) { clauses.push('o.order_date >= ?'); params.push(filters.dateFrom); }
    if (filters.dateTo) { clauses.push('o.order_date <= ?'); params.push(filters.dateTo); }
    if (filters.query && filters.query.trim()) {
      const term = '%' + filters.query.trim() + '%';
      clauses.push('(o.invoice_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR c.whatsapp LIKE ?)');
      params.push(term, term, term, term);
    }

    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    return DB.query(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, c.whatsapp AS customer_whatsapp
       FROM orders o JOIN customers c ON c.id = o.customer_id
       ${where}
       ORDER BY o.order_date DESC, o.id DESC
       LIMIT 300`,
      params
    );
  }

  return {
    STATUS_FLOW, ALL_STATUSES,
    nextInvoiceNo, computeTotals,
    createOrder, getOrder, updateOrder, deleteOrder, updateStatus, cancel, recordPayment, recordDelivery, search,
    nextStatusOptions, canTransition
  };
})();
