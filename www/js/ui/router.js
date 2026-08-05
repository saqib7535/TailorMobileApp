/* ============================================================
   Router — tiny hash-based router with auth guard + bottom nav sync.

   Router.register('/orders/:id', handler, { auth:true, navKey:'orders' })
   Router.navigate('/orders/5')
   Router.start()

   `handler(container, params)` receives the #app element and any
   :params parsed from the path, and is responsible for filling it in.

   meta.roles (optional array) role-gates a route: if set, the current
   logged-in user's role must be one of the listed roles or the router
   redirects to /dashboard with a "Not authorized" toast.
   ============================================================ */

const Router = (function () {
  const routes = [];
  let notFoundHandler = null;
  let currentPath = null;
  let currentQuery = new URLSearchParams();

  function register(pattern, handler, meta) {
    const paramNames = [];
    const regex = new RegExp(
      '^' + pattern.replace(/:[^/]+/g, (m) => { paramNames.push(m.slice(1)); return '([^/]+)'; }) + '$'
    );
    routes.push({ pattern, regex, paramNames, handler, meta: meta || {} });
  }

  function setNotFound(handler) { notFoundHandler = handler; }

  function navigate(path) {
    if (location.hash.slice(1) === path) { render(); return; }
    location.hash = path;
  }

  function replace(path) {
    location.replace('#' + path);
  }

  function matchRoute(path) {
    for (const r of routes) {
      const m = path.match(r.regex);
      if (m) {
        const params = {};
        r.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
        return { route: r, params };
      }
    }
    return null;
  }

  function updateBottomNav(navKey) {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;
    const showNav = !!navKey;
    nav.classList.toggle('hidden', !showNav);
    document.getElementById('app').style.paddingBottom = showNav ? '' : '0px';
    nav.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-nav') === navKey);
    });
    const fab = document.getElementById('global-fab');
    if (fab) fab.classList.toggle('hidden', !showNav);
  }

  async function render() {
    let raw = location.hash.slice(1) || '/login';
    const qIndex = raw.indexOf('?');
    let path = qIndex === -1 ? raw : raw.slice(0, qIndex);
    currentQuery = new URLSearchParams(qIndex === -1 ? '' : raw.slice(qIndex + 1));
    const match = matchRoute(path);
    const app = document.getElementById('app');

    const licenseOk = typeof LicenseService === 'undefined' || LicenseService.isValidCached();
    if (!licenseOk && path !== '/activation') {
      replace('/activation');
      return;
    }
    if (licenseOk && path === '/activation') {
      replace('/login');
      return;
    }

    const loggedIn = typeof AuthService !== 'undefined' && AuthService.isLoggedIn();

    if (match && match.route.meta.auth && !loggedIn) {
      replace('/login');
      return;
    }
    if (match && match.route.meta.guestOnly && loggedIn) {
      replace('/dashboard');
      return;
    }
    if (match && match.route.meta.roles && !AuthService.hasRole(...match.route.meta.roles)) {
      replace('/dashboard');
      if (typeof Toast !== 'undefined') Toast.show(I18n.t('common.notAuthorized'), 'error');
      return;
    }

    currentPath = path;
    app.classList.remove('route-enter');

    if (!match) {
      if (notFoundHandler) await notFoundHandler(app);
      updateBottomNav(null);
      return;
    }

    try {
      await match.route.handler(app, match.params);
    } catch (err) {
      console.error('Route render error for', path, err);
      app.innerHTML = '<div class="empty-state"><div class="ei">⚠️</div><p>' + (err && err.message ? err.message : 'Render error') + '</p></div>';
    }
    updateBottomNav(match.route.meta.navKey || null);
    void app.offsetWidth;
    app.classList.add('route-enter');
  }

  function start() {
    window.addEventListener('hashchange', render);
    render();
  }

  function getCurrentPath() { return currentPath; }
  function getQuery() { return currentQuery; }

  return { register, setNotFound, navigate, replace, start, getCurrentPath, getQuery };
})();
