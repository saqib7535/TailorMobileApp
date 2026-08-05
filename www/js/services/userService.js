/* ============================================================
   UserService — CRUD over the users table for the admin-only
   User Management screen. Complements AuthService (which only
   ever touches "the current session's own row" for login/change
   password) by managing every account in the shop.

   Users are never hard-deleted: orders/payments/purchases store
   created_by/received_by/changed_by as a plain username string,
   not a foreign key, so a hard delete wouldn't break referential
   integrity — but soft-deactivation (the `active` flag) keeps a
   readable audit trail ("who did what") intact even after someone
   leaves, which a hard delete would erase.

   Last-admin guard: a shop must always have at least one active
   admin account, or nobody could ever get back into User
   Management to fix a lockout. update() (and therefore deactivate()
   and role changes, which both funnel through it) refuses any
   change that would drop the active-admin count to zero.
   ============================================================ */

const UserService = (function () {
  const ROLES = ['admin', 'manager', 'tailor', 'reception'];

  async function list() {
    return DB.query(
      'SELECT id, username, role, full_name, active, last_login, created_at FROM users ORDER BY username COLLATE NOCASE'
    );
  }

  async function get(id) {
    const rows = await DB.query(
      'SELECT id, username, role, full_name, active, last_login, created_at FROM users WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  async function usernameExists(username, excludeId) {
    const params = excludeId ? [username, excludeId] : [username];
    const rows = await DB.query(
      'SELECT COUNT(*) AS c FROM users WHERE username = ?' + (excludeId ? ' AND id != ?' : ''),
      params
    );
    return (rows[0].c || 0) > 0;
  }

  // Counts active admins, optionally excluding one user id — used to
  // check "would this change leave zero active admins?" before it happens.
  async function countActiveAdmins(excludeId) {
    const params = excludeId ? [excludeId] : [];
    const rows = await DB.query(
      "SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1" + (excludeId ? ' AND id != ?' : ''),
      params
    );
    return rows[0].c || 0;
  }

  async function create(data) {
    const username = String(data.username || '').trim();
    if (!username) return { ok: false, error: 'usernameRequired' };
    if (!data.password) return { ok: false, error: 'passwordRequired' };
    if (!ROLES.includes(data.role)) return { ok: false, error: 'invalidRole' };
    if (await usernameExists(username)) return { ok: false, error: 'usernameTaken' };

    const hash = await CryptoUtil.hashPassword(data.password);
    const res = await DB.run(
      'INSERT INTO users (username, password_hash, role, full_name, active) VALUES (?, ?, ?, ?, 1)',
      [username, hash, data.role, data.fullName || '']
    );
    return { ok: true, id: res.lastId };
  }

  // Username is intentionally never part of this update — it's the
  // stable identity string every order/payment references, so it's
  // fixed at creation time. fullName/role/active are all optional;
  // whichever are omitted keep their current value.
  async function update(id, data) {
    const existing = await get(id);
    if (!existing) return { ok: false, error: 'notFound' };

    const nextRole = data.role !== undefined ? data.role : existing.role;
    const nextActive = data.active !== undefined ? (data.active ? 1 : 0) : existing.active;
    if (!ROLES.includes(nextRole)) return { ok: false, error: 'invalidRole' };

    const wasActiveAdmin = existing.role === 'admin' && existing.active === 1;
    const losingAdminStatus = wasActiveAdmin && (nextRole !== 'admin' || nextActive === 0);
    if (losingAdminStatus) {
      const remaining = await countActiveAdmins(id);
      if (remaining === 0) return { ok: false, error: 'lastAdmin' };
    }

    const nextFullName = data.fullName !== undefined ? data.fullName : existing.full_name;
    await DB.run(
      'UPDATE users SET full_name = ?, role = ?, active = ? WHERE id = ?',
      [nextFullName, nextRole, nextActive, id]
    );
    return { ok: true };
  }

  async function resetPassword(id, newPassword) {
    if (!newPassword) return { ok: false, error: 'passwordRequired' };
    const hash = await CryptoUtil.hashPassword(newPassword);
    await DB.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
    return { ok: true };
  }

  // Both route through update() so the last-admin guard above is the
  // single place that logic lives, rather than being duplicated here.
  async function deactivate(id) { return update(id, { active: false }); }
  async function reactivate(id) { return update(id, { active: true }); }

  return { ROLES, list, get, create, update, resetPassword, deactivate, reactivate, countActiveAdmins, usernameExists };
})();
