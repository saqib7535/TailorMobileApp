/* ============================================================
   ExpenseService — CRUD + filtered totals for shop overheads
   (rent, utilities, salaries, supplies, maintenance, etc).
   `category` is a free-text column (not an FK), constrained only
   by the fixed CATEGORIES list the Expenses screen offers in its
   dropdown.
   ============================================================ */

const ExpenseService = (function () {
  const CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Supplies', 'Maintenance', 'Other'];

  function buildFilter(opts) {
    opts = opts || {};
    const clauses = [];
    const params = [];
    if (opts.dateFrom) { clauses.push('expense_date >= ?'); params.push(opts.dateFrom); }
    if (opts.dateTo) { clauses.push('expense_date <= ?'); params.push(opts.dateTo); }
    if (opts.category) { clauses.push('category = ?'); params.push(opts.category); }
    return { where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', params };
  }

  async function list(opts) {
    const { where, params } = buildFilter(opts);
    return DB.query(`SELECT * FROM expenses ${where} ORDER BY expense_date DESC, id DESC LIMIT 300`, params);
  }

  async function get(id) {
    const rows = await DB.query('SELECT * FROM expenses WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async function create(data) {
    const res = await DB.run(
      `INSERT INTO expenses (expense_date, category, description, amount, payment_method) VALUES (?, ?, ?, ?, ?)`,
      [
        data.expense_date || Format.todayIso(),
        data.category || 'Other',
        data.description || '',
        Number(data.amount || 0),
        data.payment_method || 'Cash'
      ]
    );
    return res.lastId;
  }

  async function update(id, data) {
    await DB.run(
      `UPDATE expenses SET expense_date=?, category=?, description=?, amount=?, payment_method=? WHERE id=?`,
      [
        data.expense_date || Format.todayIso(),
        data.category || 'Other',
        data.description || '',
        Number(data.amount || 0),
        data.payment_method || 'Cash',
        id
      ]
    );
  }

  async function remove(id) {
    await DB.run('DELETE FROM expenses WHERE id = ?', [id]);
  }

  // Uses a SQL SUM rather than reducing list()'s rows client-side, so
  // the total stays correct even when the filtered set exceeds list()'s
  // 300-row cap.
  async function getTotal(opts) {
    const { where, params } = buildFilter(opts);
    const rows = await DB.query(`SELECT COALESCE(SUM(amount),0) AS s FROM expenses ${where}`, params);
    return rows[0].s;
  }

  return { list, get, create, update, remove, getTotal, CATEGORIES };
})();
