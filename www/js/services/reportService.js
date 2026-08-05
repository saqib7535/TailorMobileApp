/* ============================================================
   ReportService — generates the dataset for every report type.
   Every report returns { title, columns:[{key,label,money?}],
   rows:[...], totals:[{label,value,money?}] } so the Reports
   screen and the PDF/print exporter (Documents.buildReportPdf)
   can stay completely generic over the shape — they never know
   which report produced the data they're rendering.

   ORDER_COLUMNS/orderRows()/invoiceListTotals() are shared by every
   report whose rows are individual invoices (the four sales-summary
   reports, pending dues, delivered, and both invoice reports) so
   that shape only needs to be kept in one place.

   generate(type, params) is the single entry point the Reports
   screen calls; REPORT_TYPES drives the type-picker UI.
   ============================================================ */

const ReportService = (function () {
  function sum(rows, key) { return rows.reduce((s, r) => s + Number(r[key] || 0), 0); }

  // ---------------------------------------------------------
  // Shared invoice-list shape
  // ---------------------------------------------------------
  const ORDER_COLUMNS = [
    { key: 'invoice_no', label: 'Invoice #' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'order_date', label: 'Date' },
    { key: 'status', label: 'Status' },
    { key: 'grand_total', label: 'Total', money: true },
    { key: 'advance_paid', label: 'Advance', money: true },
    { key: 'remaining_balance', label: 'Remaining', money: true }
  ];

  function orderRows(rows) {
    return rows.map((o) => ({
      invoice_no: o.invoice_no, customer_name: o.customer_name, order_date: o.order_date,
      status: o.status, grand_total: o.grand_total, advance_paid: o.advance_paid, remaining_balance: o.remaining_balance
    }));
  }

  // Used by every invoice-list report except the sales-summary ones
  // (which show "Total Collected" instead of "Advance Received" —
  // see salesSummary() below for why that distinction matters).
  function invoiceListTotals(rows) {
    const nonCancelled = rows.filter((r) => r.status !== 'Cancelled');
    return [
      { label: 'Orders', value: rows.length },
      { label: 'Total Revenue', value: sum(nonCancelled, 'grand_total'), money: true },
      { label: 'Advance Received', value: sum(nonCancelled, 'advance_paid'), money: true },
      { label: 'Remaining Balance', value: sum(nonCancelled, 'remaining_balance'), money: true }
    ];
  }

  async function ordersInDateRange(fromDate, toDate) {
    return DB.query(
      `SELECT o.*, c.name AS customer_name FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.order_date >= ? AND o.order_date <= ? ORDER BY o.order_date, o.id`,
      [fromDate, toDate]
    );
  }

  async function paymentsTotalInRange(fromDate, toDate) {
    const rows = await DB.query(
      `SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE date(paid_at) BETWEEN ? AND ?`,
      [fromDate, toDate]
    );
    return rows[0].s;
  }

  function lastDayOfMonth(year, month1to12) {
    const d = new Date(year, month1to12, 0); // day 0 of next month = last day of this month
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ---------------------------------------------------------
  // Sales summary — daily/weekly/monthly/yearly all funnel through
  // this one range+totals query; only the date-range calculation
  // differs per unit, so there's exactly one query to keep in sync.
  // "Total Collected" comes from a separate payments query (money
  // actually received in the window) rather than reusing "Advance
  // Received" from invoiceListTotals() — advance-received only
  // reflects orders *created* in this window, which understates
  // collections whenever a customer pays off an older order's
  // balance today. Total Revenue/Outstanding still exclude
  // Cancelled orders, matching invoiceListTotals()'s convention.
  // ---------------------------------------------------------
  async function salesSummary(fromDate, toDate, title) {
    const rows = await ordersInDateRange(fromDate, toDate);
    const nonCancelled = rows.filter((r) => r.status !== 'Cancelled');
    const totalCollected = await paymentsTotalInRange(fromDate, toDate);
    return {
      title,
      columns: ORDER_COLUMNS,
      rows: orderRows(rows),
      totals: [
        { label: 'Orders', value: rows.length },
        { label: 'Total Revenue', value: sum(nonCancelled, 'grand_total'), money: true },
        { label: 'Total Collected', value: totalCollected, money: true },
        { label: 'Total Outstanding', value: sum(nonCancelled, 'remaining_balance'), money: true }
      ]
    };
  }

  async function daily(dateIso) {
    return salesSummary(dateIso, dateIso, 'Daily Sales Report — ' + dateIso);
  }

  async function weekly(endDateIso) {
    const end = new Date(endDateIso);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    const startIso = start.toISOString().slice(0, 10);
    return salesSummary(startIso, endDateIso, `Weekly Sales Report — ${startIso} to ${endDateIso}`);
  }

  async function monthly(yearMonth) {
    const [y, m] = yearMonth.split('-').map(Number);
    const from = yearMonth + '-01';
    const to = lastDayOfMonth(y, m);
    return salesSummary(from, to, 'Monthly Sales Report — ' + yearMonth);
  }

  async function yearly(year) {
    const y = Number(year);
    return salesSummary(y + '-01-01', y + '-12-31', 'Yearly Sales Report — ' + y);
  }

  // ---------------------------------------------------------
  // Customer report — revenue/order-count grouped by customer.
  // Only customers with at least one order are listed (HAVING
  // filters out the zero-order rows a plain LEFT JOIN would leave
  // full of empty/duplicate-looking entries).
  // ---------------------------------------------------------
  async function customerReport() {
    const rows = await DB.query(`
      SELECT c.name AS customer_name, c.phone,
        COUNT(o.id) AS total_orders,
        COALESCE(SUM(CASE WHEN o.status != 'Cancelled' THEN o.grand_total ELSE 0 END),0) AS total_billed,
        COALESCE(SUM(CASE WHEN o.status != 'Cancelled' THEN o.remaining_balance ELSE 0 END),0) AS total_remaining
      FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
      GROUP BY c.id HAVING total_orders > 0 ORDER BY total_billed DESC
    `);
    return {
      title: 'Customer Revenue Report',
      columns: [
        { key: 'customer_name', label: 'Customer' }, { key: 'phone', label: 'Phone' },
        { key: 'total_orders', label: 'Orders' },
        { key: 'total_billed', label: 'Revenue', money: true },
        { key: 'total_remaining', label: 'Remaining', money: true }
      ],
      rows,
      totals: [
        { label: 'Customers', value: rows.length },
        { label: 'Total Revenue', value: sum(rows, 'total_billed'), money: true },
        { label: 'Total Remaining', value: sum(rows, 'total_remaining'), money: true }
      ]
    };
  }

  // ---------------------------------------------------------
  // Revenue-over-time — a single query parameterized by groupBy
  // unit (day/week/month/year) instead of four near-duplicate
  // functions. This is a different report shape from the
  // daily/weekly/monthly/yearly presets above (grouped time-series
  // vs. a per-order invoice list + totals for one fixed period), so
  // it doesn't collapse into salesSummary() even though both slice
  // by date.
  // ---------------------------------------------------------
  function periodExpr(groupBy) {
    if (groupBy === 'month') return "strftime('%Y-%m', o.order_date)";
    if (groupBy === 'year') return "strftime('%Y', o.order_date)";
    if (groupBy === 'week') return "strftime('%Y-W%W', o.order_date)";
    return 'o.order_date'; // day
  }

  async function revenueReport(fromDate, toDate, groupBy) {
    const unit = groupBy || 'day';
    const expr = periodExpr(unit);
    const rows = await DB.query(`
      SELECT ${expr} AS period, COUNT(*) AS orders, COALESCE(SUM(grand_total),0) AS revenue
      FROM orders o
      WHERE o.order_date >= ? AND o.order_date <= ? AND o.status != 'Cancelled'
      GROUP BY period ORDER BY period
    `, [fromDate, toDate]);
    return {
      title: `Revenue Report (${unit}) — ${fromDate} to ${toDate}`,
      columns: [
        { key: 'period', label: 'Period' }, { key: 'orders', label: 'Orders' },
        { key: 'revenue', label: 'Revenue', money: true }
      ],
      rows,
      totals: [
        { label: 'Orders', value: sum(rows, 'orders') },
        { label: 'Total Revenue', value: sum(rows, 'revenue'), money: true }
      ]
    };
  }

  // ---------------------------------------------------------
  // Pending dues — remaining_balance > 0, sorted by amount (default,
  // biggest debts first) or age (oldest order first).
  // ---------------------------------------------------------
  async function pendingReport(sortBy) {
    const orderBy = sortBy === 'age' ? 'o.order_date ASC, o.id ASC' : 'o.remaining_balance DESC';
    const rows = await DB.query(`
      SELECT o.*, c.name AS customer_name FROM orders o JOIN customers c ON c.id = o.customer_id
      WHERE o.remaining_balance > 0 AND o.status != 'Cancelled'
      ORDER BY ${orderBy}
    `);
    return { title: 'Pending Dues Report', columns: ORDER_COLUMNS, rows: orderRows(rows), totals: invoiceListTotals(rows) };
  }

  // ---------------------------------------------------------
  // Delivered — orders delivered within a date range (by
  // delivered_at, not order_date, since that's the date that
  // actually matters for this report).
  // ---------------------------------------------------------
  async function deliveredReport(fromDate, toDate) {
    const rows = await DB.query(`
      SELECT o.*, c.name AS customer_name FROM orders o JOIN customers c ON c.id = o.customer_id
      WHERE o.status = 'Delivered' AND date(o.delivered_at) BETWEEN ? AND ?
      ORDER BY o.delivered_at DESC
    `, [fromDate, toDate]);
    return { title: `Delivered Orders — ${fromDate} to ${toDate}`, columns: ORDER_COLUMNS, rows: orderRows(rows), totals: invoiceListTotals(rows) };
  }

  // ---------------------------------------------------------
  // Garment category (all-time) — revenue/qty grouped by category
  // across order_items. Uses order_items.category_name directly
  // (stored at order-creation time) rather than joining categories,
  // so a renamed/disabled category still reports correctly under
  // the label it had when the order was placed.
  // ---------------------------------------------------------
  async function categoryReport() {
    const rows = await DB.query(`
      SELECT COALESCE(oi.category_name, 'Others') AS category_name,
        COUNT(*) AS line_items, COALESCE(SUM(oi.quantity),0) AS qty, COALESCE(SUM(oi.subtotal),0) AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status != 'Cancelled'
      GROUP BY category_name ORDER BY revenue DESC
    `);
    return {
      title: 'Garment Category Report',
      columns: [
        { key: 'category_name', label: 'Category' }, { key: 'line_items', label: 'Line Items' },
        { key: 'qty', label: 'Qty' }, { key: 'revenue', label: 'Revenue', money: true }
      ],
      rows,
      totals: [{ label: 'Total Revenue', value: sum(rows, 'revenue'), money: true }]
    };
  }

  // ---------------------------------------------------------
  // Expenses grouped by category in a date range — same filter
  // shape as ExpenseService.getTotal()/list(), just grouped instead
  // of listed row-by-row.
  // ---------------------------------------------------------
  async function expenseReport(fromDate, toDate) {
    const rows = await DB.query(`
      SELECT category, COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
      FROM expenses WHERE expense_date >= ? AND expense_date <= ?
      GROUP BY category ORDER BY total DESC
    `, [fromDate, toDate]);
    return {
      title: `Expense Report — ${fromDate} to ${toDate}`,
      columns: [
        { key: 'category', label: 'Category' }, { key: 'count', label: 'Entries' },
        { key: 'total', label: 'Amount', money: true }
      ],
      rows,
      totals: [{ label: 'Total Expenses', value: sum(rows, 'total'), money: true }]
    };
  }

  // ---------------------------------------------------------
  // Inventory — current stock levels, flagging low-stock rows.
  // Reuses InventoryService's own queries (list()/getLowStock())
  // rather than re-querying inventory_items directly, since those
  // already encode the "low stock" definition (quantity <= threshold)
  // in one place.
  // ---------------------------------------------------------
  async function inventoryReport(lowStockOnly) {
    const items = lowStockOnly ? await InventoryService.getLowStock() : await InventoryService.list();
    const rows = items.map((i) => Object.assign({}, i, {
      stock_status: Number(i.quantity_in_stock) <= Number(i.low_stock_threshold) ? 'Low Stock' : 'OK'
    }));
    return {
      title: lowStockOnly ? 'Low Stock Report' : 'Inventory Stock Report',
      columns: [
        { key: 'name', label: 'Item' }, { key: 'category', label: 'Category' },
        { key: 'quantity_in_stock', label: 'Stock' }, { key: 'unit', label: 'Unit' },
        { key: 'low_stock_threshold', label: 'Threshold' }, { key: 'stock_status', label: 'Status' }
      ],
      rows,
      totals: [
        { label: 'Items', value: rows.length },
        { label: 'Low Stock Items', value: rows.filter((r) => r.stock_status === 'Low Stock').length }
      ]
    };
  }

  // ---------------------------------------------------------
  // Purchases grouped by supplier, showing amount owed.
  // ---------------------------------------------------------
  async function supplierPurchasesReport() {
    const rows = await DB.query(`
      SELECT s.name AS supplier_name,
        COUNT(p.id) AS purchase_count,
        COALESCE(SUM(p.grand_total),0) AS total_purchased,
        COALESCE(SUM(p.paid_amount),0) AS total_paid,
        COALESCE(SUM(p.balance),0) AS total_owed
      FROM suppliers s LEFT JOIN purchases p ON p.supplier_id = s.id
      GROUP BY s.id HAVING purchase_count > 0 ORDER BY total_owed DESC
    `);
    return {
      title: 'Supplier Purchases Report',
      columns: [
        { key: 'supplier_name', label: 'Supplier' }, { key: 'purchase_count', label: 'Purchases' },
        { key: 'total_purchased', label: 'Total', money: true }, { key: 'total_paid', label: 'Paid', money: true },
        { key: 'total_owed', label: 'Owed', money: true }
      ],
      rows,
      totals: [
        { label: 'Suppliers', value: rows.length },
        { label: 'Total Owed', value: sum(rows, 'total_owed'), money: true }
      ]
    };
  }

  // ---------------------------------------------------------
  // Full invoice list for one customer (optionally date-scoped).
  // ---------------------------------------------------------
  async function invoiceByCustomer(customerId, fromDate, toDate) {
    const clauses = ['o.customer_id = ?'];
    const params = [customerId];
    if (fromDate) { clauses.push('o.order_date >= ?'); params.push(fromDate); }
    if (toDate) { clauses.push('o.order_date <= ?'); params.push(toDate); }
    const rows = await DB.query(
      `SELECT o.*, c.name AS customer_name FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE ${clauses.join(' AND ')} ORDER BY o.order_date DESC, o.id DESC`,
      params
    );
    const custRows = await DB.query('SELECT name FROM customers WHERE id = ?', [customerId]);
    const customerName = custRows.length ? custRows[0].name : '';
    return { title: `Invoices — ${customerName}`, columns: ORDER_COLUMNS, rows: orderRows(rows), totals: invoiceListTotals(rows) };
  }

  // ---------------------------------------------------------
  // Full invoice list for a date range (optionally one customer).
  // ---------------------------------------------------------
  async function invoiceByDate(fromDate, toDate, customerId) {
    const clauses = ['o.order_date >= ?', 'o.order_date <= ?'];
    const params = [fromDate, toDate];
    if (customerId) { clauses.push('o.customer_id = ?'); params.push(customerId); }
    const rows = await DB.query(
      `SELECT o.*, c.name AS customer_name FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE ${clauses.join(' AND ')} ORDER BY o.order_date DESC, o.id DESC`,
      params
    );
    return { title: `Invoices — ${fromDate} to ${toDate}`, columns: ORDER_COLUMNS, rows: orderRows(rows), totals: invoiceListTotals(rows) };
  }

  // ---------------------------------------------------------
  // Order counts grouped by current status.
  // ---------------------------------------------------------
  async function orderStatusReport() {
    const rows = await DB.query(`
      SELECT status, COUNT(*) AS count, COALESCE(SUM(grand_total),0) AS total
      FROM orders GROUP BY status ORDER BY count DESC
    `);
    return {
      title: 'Orders by Status',
      columns: [
        { key: 'status', label: 'Status' }, { key: 'count', label: 'Orders' },
        { key: 'total', label: 'Total Value', money: true }
      ],
      rows,
      totals: [{ label: 'Total Orders', value: sum(rows, 'count') }]
    };
  }

  const REPORT_TYPES = [
    { key: 'daily', labelKey: 'report.daily' },
    { key: 'weekly', labelKey: 'report.weekly' },
    { key: 'monthly', labelKey: 'report.monthly' },
    { key: 'yearly', labelKey: 'report.yearly' },
    { key: 'revenue', labelKey: 'report.revenue' },
    { key: 'customer', labelKey: 'report.customer' },
    { key: 'pending', labelKey: 'report.pending' },
    { key: 'delivered', labelKey: 'report.delivered' },
    { key: 'category', labelKey: 'report.category' },
    { key: 'expense', labelKey: 'report.expense' },
    { key: 'inventory', labelKey: 'report.inventory' },
    { key: 'supplierPurchases', labelKey: 'report.supplierPurchases' },
    { key: 'invoiceCustomer', labelKey: 'report.invoiceCustomer' },
    { key: 'invoiceDate', labelKey: 'report.invoiceDate' },
    { key: 'orderStatus', labelKey: 'report.orderStatus' }
  ];

  async function generate(type, params) {
    params = params || {};
    const today = Format.todayIso();
    switch (type) {
      case 'daily': return daily(params.date || today);
      case 'weekly': return weekly(params.date || today);
      case 'monthly': return monthly(params.yearMonth || today.slice(0, 7));
      case 'yearly': return yearly(params.year || new Date().getFullYear());
      case 'revenue': return revenueReport(params.from || today.slice(0, 8) + '01', params.to || today, params.groupBy || 'day');
      case 'customer': return customerReport();
      case 'pending': return pendingReport(params.sortBy);
      case 'delivered': return deliveredReport(params.from || '1970-01-01', params.to || today);
      case 'category': return categoryReport();
      case 'expense': return expenseReport(params.from || today.slice(0, 8) + '01', params.to || today);
      case 'inventory': return inventoryReport(!!params.lowStockOnly);
      case 'supplierPurchases': return supplierPurchasesReport();
      case 'invoiceCustomer': return invoiceByCustomer(params.customerId, params.from || null, params.to || null);
      case 'invoiceDate': return invoiceByDate(params.from || today, params.to || today, params.customerId || null);
      case 'orderStatus': return orderStatusReport();
      default: return { title: 'Report', columns: [], rows: [], totals: [] };
    }
  }

  return { generate, REPORT_TYPES };
})();
