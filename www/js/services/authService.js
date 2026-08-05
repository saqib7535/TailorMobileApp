/* ============================================================
   AuthService — login/logout, "remember login" persistence,
   session/auto-logout timer, change password, role checks.
   ============================================================ */

const AuthService = (function () {
  const SESSION_KEY = 'ts_session_user';
  const REMEMBER_KEY = 'ts_remember_user';

  let sessionUser = null;
  let autoLogoutTimer = null;
  let onAutoLogout = null;

  function loadSession() {
    if (sessionUser) return sessionUser;
    try {
      const remembered = localStorage.getItem(REMEMBER_KEY);
      if (remembered) { sessionUser = JSON.parse(remembered); return sessionUser; }
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) { sessionUser = JSON.parse(raw); return sessionUser; }
    } catch (e) { /* ignore */ }
    return null;
  }

  function isLoggedIn() { return !!loadSession(); }
  function currentUser() { return loadSession(); }

  async function login(username, password, remember) {
    const rows = await DB.query('SELECT * FROM users WHERE username = ?', [username]);
    if (!rows.length) return { ok: false, error: I18n.t('login.invalidCreds') };
    const user = rows[0];
    const valid = await CryptoUtil.verifyPassword(password, user.password_hash);
    if (!valid) return { ok: false, error: I18n.t('login.invalidCreds') };

    await DB.run('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?', [user.id]);

    sessionUser = { id: user.id, username: user.username, role: user.role, full_name: user.full_name };
    const payload = JSON.stringify(sessionUser);
    if (remember) {
      localStorage.setItem(REMEMBER_KEY, payload);
    } else {
      sessionStorage.setItem(SESSION_KEY, payload);
    }
    resetAutoLogoutTimer();
    return { ok: true, user: sessionUser };
  }

  function logout() {
    sessionUser = null;
    localStorage.removeItem(REMEMBER_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    clearTimeout(autoLogoutTimer);
    Router.replace('/login');
  }

  async function changePassword(username, currentPassword, newPassword) {
    const rows = await DB.query('SELECT * FROM users WHERE username = ?', [username]);
    if (!rows.length) return { ok: false, error: I18n.t('login.invalidCreds') };
    const valid = await CryptoUtil.verifyPassword(currentPassword, rows[0].password_hash);
    if (!valid) return { ok: false, error: I18n.t('login.invalidCreds') };
    const hash = await CryptoUtil.hashPassword(newPassword);
    await DB.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, rows[0].id]);
    return { ok: true };
  }

  // Returns true if the current logged-in user's role is one of the
  // allowed roles, or if no roles were specified (i.e. any logged-in
  // user passes an ungated check). Used by the router's role-gating
  // and by screens that need to hide/show admin-only actions inline.
  function hasRole(...allowedRoles) {
    const roles = allowedRoles.filter((r) => r !== undefined && r !== null);
    if (!roles.length) return true;
    const user = currentUser();
    if (!user) return false;
    return roles.includes(user.role);
  }

  // Same check as hasRole(), but throws when it fails so call sites
  // that must hard-stop (rather than just branch on a boolean) can
  // use it directly in a guard clause.
  function requireRole(...allowedRoles) {
    if (!hasRole(...allowedRoles)) {
      throw new Error('Not authorized for this action');
    }
    return true;
  }

  function setAutoLogoutHandler(fn) { onAutoLogout = fn; }

  function resetAutoLogoutTimer() {
    clearTimeout(autoLogoutTimer);
    const minutes = parseInt((window.__ts_autoLogoutMinutes || 0), 10);
    if (!minutes || !isLoggedIn()) return;
    autoLogoutTimer = setTimeout(() => {
      logout();
      if (onAutoLogout) onAutoLogout();
    }, minutes * 60 * 1000);
  }

  function setAutoLogoutMinutes(minutes) {
    window.__ts_autoLogoutMinutes = minutes;
    resetAutoLogoutTimer();
  }

  ['click', 'keydown', 'touchstart'].forEach((evt) => {
    document.addEventListener(evt, () => resetAutoLogoutTimer(), { passive: true });
  });

  return {
    isLoggedIn, currentUser, login, logout, changePassword,
    hasRole, requireRole,
    setAutoLogoutHandler, setAutoLogoutMinutes, resetAutoLogoutTimer
  };
})();
