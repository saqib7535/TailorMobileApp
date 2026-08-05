/* ============================================================
   DashboardService — aggregate stats + chart dataset for the Home
   screen. This is pure read/aggregate work (no business rules to
   reuse), so every query runs directly via DB.query() against
   orders/payments/inventory_items rather than routing through
   OrderService/InventoryService, mirroring the instruction that
   Phase 5 queries the schema straight rather than wrapping it.

   "Today's revenue" and "month-to-date revenue" are both defined
   as money actually collected — SUM(payments.amount) filtered by
   paid_at — rather than the invoiced grand_total of orders placed
   in the period. Reasoning: a shop's real cash position on a given
   day is what came in via payments (which already includes advance
   payments, since OrderService.createOrder() writes those into the
   payments table too), not what was merely billed. An order placed
   today with a big advance but delivery next month shows up in
   today's revenue; an order placed last week and paid off today
   also shows up today — that's the "did we hit our numbers today"
   view a shop owner actually wants. getMonthlySales() follows the
   same collected-cash basis for its chart series, for consistency.

   getDueSoonOrders() deliberately does NOT filter out orders whose
   delivery_date has already passed — an overdue-but-undelivered
   order is more urgent than one that's merely "coming up soon", so
   sorting delivery_date ascending naturally surfaces overdue orders
   first, then the nearest upcoming ones.
   ============================================================ */

const DashboardService = (function () {
  async function getStats() {
    const [
      todayOrders, todayRevenue, monthRevenue, outstanding, lowStock, pendingOrders
    ] = await Promise.all([
      DB.query(`SELECT COUNT(*) AS c FROM orders WHERE date(order_date) = date('now')`),
      DB.query(`SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE date(paid_at) = date('now')`),
      DB.query(`SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE strftime('%Y-%m', paid_at) = strftime('%Y-%m','now')`),
      DB.query(`SELECT COALESCE(SUM(remaining_balance),0) AS s FROM orders WHERE status != 'Cancelled'`),
      DB.query(`SELECT COUNT(*) AS c FROM inventory_items WHERE quantity_in_stock <= low_stock_threshold`),
      DB.query(`SELECT COUNT(*) AS c FROM orders WHERE status NOT IN ('Delivered','Cancelled')`)
    ]);

    return {
      todayOrders: todayOrders[0].c,
      todayRevenue: todayRevenue[0].s,
      monthRevenue: monthRevenue[0].s,
      outstandingDues: outstanding[0].s,
      lowStockCount: lowStock[0].c,
      pendingOrders: pendingOrders[0].c
    };
  }

  // Returns exactly `monthsBack` entries (oldest first), zero-filling
  // any month that had no payments so the chart always shows a full,
  // evenly-spaced set of bars instead of silently skipping gaps.
  async function getMonthlySales(monthsBack) {
    monthsBack = monthsBack || 6;
    const rows = await DB.query(
      `SELECT strftime('%Y-%m', paid_at) AS ym, COALESCE(SUM(amount),0) AS total
       FROM payments
       WHERE paid_at >= datetime('now', '-${monthsBack - 1} months', 'start of month')
       GROUP BY ym ORDER BY ym ASC`
    );
    const totalsByMonth = {};
    rows.forEach((r) => { totalsByMonth[r.ym] = r.total; });

    const series = [];
    const cursor = new Date();
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
      const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      series.push({
        label: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
        total: totalsByMonth[ym] || 0
      });
    }
    return series;
  }

  async function getRecentOrders(limit) {
    return DB.query(
      `SELECT o.id, o.invoice_no, o.status, o.grand_total, o.order_date, c.name AS customer_name
       FROM orders o JOIN customers c ON c.id = o.customer_id
       ORDER BY o.id DESC LIMIT ?`,
      [limit || 5]
    );
  }

  async function getRecentPayments(limit) {
    return DB.query(
      `SELECT p.id, p.amount, p.method, p.paid_at, o.invoice_no, c.name AS customer_name
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       JOIN customers c ON c.id = o.customer_id
       ORDER BY p.id DESC LIMIT ?`,
      [limit || 5]
    );
  }

  async function getDueSoonOrders(limit) {
    return DB.query(
      `SELECT o.id, o.invoice_no, o.delivery_date, o.status, c.name AS customer_name
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.status NOT IN ('Delivered','Cancelled') AND o.delivery_date IS NOT NULL
       ORDER BY o.delivery_date ASC LIMIT ?`,
      [limit || 5]
    );
  }

  return { getStats, getMonthlySales, getRecentOrders, getRecentPayments, getDueSoonOrders };
})();
