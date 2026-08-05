/* ============================================================
   Users screen — admin-only staff account management (list,
   add, edit role/full name/active state, reset password).
   Route is already role-gated to 'admin' in app.js; this screen
   re-checks with AuthService.hasRole() on render too, same
   defense-in-depth pattern as CategoriesScreen, in case it's ever
   reached some other way than the router (e.g. a stale bfcache page).

   Two self-lockout guards, at different layers:
     - UserService.update() refuses to demote/deactivate the LAST
       active admin account, shop-wide (server-ish-side rule).
     - This screen additionally disables the role select and the
       active toggle when editing your OWN account, so an admin can
       never accidentally demote or deactivate themselves even while
       other admins still exist (a client-side "why would you do that
       to yourself" guard, separate from the last-admin rule above).
   ============================================================ */

const UsersScreen = (function () {
  const ROLE_STYLE = {
    admin: { color: 'var(--color-primary)', bg: 'var(--color-primary-light)' },
    manager: { color: 'var(--status-cutting)', bg: 'var(--status-cutting-bg)' },
    tailor: { color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
    reception: { color: 'var(--status-stitching)', bg: 'var(--status-stitching-bg)' }
  };

  function roleLabel(role) {
    return I18n.t('user.role' + role.charAt(0).toUpperCase() + role.slice(1));
  }

  async function render(app) {
    if (!AuthService.hasRole('admin')) {
      Router.navigate('/more');
      Toast.error(I18n.t('common.notAuthorized'));
      return;
    }
    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <h1 data-i18n="more.users"></h1>
        <button class="icon-btn" id="btn-add-user">${Icons.svg('plus', 24)}</button>
      </header>
      <div id="user-list" class="page-pad" style="padding-top:12px"></div>
    `;
    I18n.apply(app);
    app.querySelector('#btn-back').onclick = () => Router.navigate('/more');
    app.querySelector('#btn-add-user').onclick = () => openForm();
    await loadList();
  }

  async function loadList() {
    const listEl = document.getElementById('user-list');
    if (!listEl) return;
    const rows = await UserService.list();
    const me = AuthService.currentUser();
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="ei">👤</div><p data-i18n="user.noUsers"></p></div>`;
      I18n.apply(listEl);
      return;
    }
    listEl.innerHTML = rows.map((u) => rowHtml(u, me && me.id === u.id)).join('');
    I18n.apply(listEl);
    listEl.querySelectorAll('[data-edit]').forEach((el) => {
      el.onclick = async () => {
        const u = await UserService.get(parseInt(el.getAttribute('data-edit'), 10));
        openForm(u);
      };
    });
  }

  function rowHtml(u, isSelf) {
    const style = ROLE_STYLE[u.role] || ROLE_STYLE.tailor;
    return `
      <div class="list-row" data-edit="${u.id}">
        <div class="avatar">${Format.initials(u.full_name || u.username)}</div>
        <div class="main">
          <div class="title">${u.full_name || u.username}${isSelf ? ' · ' + I18n.t('common.you') : ''}</div>
          <div class="subtitle">@${u.username}</div>
        </div>
        <div class="end">
          <span class="badge" style="color:${style.color};background:${style.bg}">${roleLabel(u.role)}</span>
          <div class="mt-8"><span class="badge ${u.active ? 'badge-delivered' : 'badge-cancelled'}">${u.active ? I18n.t('user.active') : I18n.t('user.inactive')}</span></div>
        </div>
      </div>
    `;
  }

  function openForm(existing) {
    const isEdit = !!existing;
    const me = AuthService.currentUser();
    const isSelf = isEdit && me && me.id === existing.id;

    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="${isEdit ? 'user.editUser' : 'user.addUser'}"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="field" id="f-username">
        <label data-i18n="user.username"></label>
        <input id="in-username" value="${existing ? existing.username : ''}" ${isEdit ? 'disabled' : ''} />
        ${isEdit ? '' : `<div class="text-muted" style="font-size:11.5px;margin-top:4px" data-i18n="user.usernameHint"></div>`}
        <div class="error-msg" data-i18n="common.requiredField"></div>
      </div>
      ${isEdit ? '' : `
        <div class="field" id="f-password">
          <label data-i18n="user.password"></label>
          <input type="password" id="in-password" />
          <div class="error-msg" data-i18n="common.requiredField"></div>
        </div>
      `}
      <div class="field" id="f-fullname">
        <label data-i18n="user.fullName"></label>
        <input id="in-fullname" value="${existing ? (existing.full_name || '') : ''}" />
      </div>
      <div class="field">
        <label data-i18n="user.role"></label>
        <select id="in-role" ${isSelf ? 'disabled' : ''}>
          ${UserService.ROLES.map((r) => `<option value="${r}" ${existing && existing.role === r ? 'selected' : ''}>${roleLabel(r)}</option>`).join('')}
        </select>
      </div>
      ${isEdit ? `
        <div class="checkbox-row mt-8">
          <input type="checkbox" id="in-active" ${!existing || existing.active ? 'checked' : ''} ${isSelf ? 'disabled' : ''} />
          <label for="in-active" style="margin:0;text-transform:none;font-weight:500" data-i18n="user.active"></label>
        </div>
      ` : ''}
      ${isSelf ? `<p class="text-muted mt-8" style="font-size:11.5px" data-i18n="user.cannotEditSelf"></p>` : ''}
      <div class="flex gap-8 mt-16">
        ${isEdit ? `<button class="btn btn-outline" id="btn-reset-pw" data-i18n="user.resetPassword"></button>` : ''}
        <button class="btn btn-primary btn-block" id="btn-save-user" data-i18n="common.save"></button>
      </div>
    `);
    I18n.apply(sheet);

    sheet.querySelector('#m-close').onclick = () => Modal.close();

    if (isEdit) {
      sheet.querySelector('#btn-reset-pw').onclick = () => openResetPassword(existing);
    }

    sheet.querySelector('#btn-save-user').onclick = async () => {
      const fUsername = sheet.querySelector('#f-username');
      const fullName = sheet.querySelector('#in-fullname').value.trim();
      const role = sheet.querySelector('#in-role').value;
      let ok = true;

      if (isEdit) {
        const active = isSelf ? !!existing.active : sheet.querySelector('#in-active').checked;
        const result = await UserService.update(existing.id, { fullName, role, active });
        if (!result.ok) {
          Toast.error(result.error === 'lastAdmin' ? I18n.t('user.lastAdminError') : I18n.t('common.error'));
          return;
        }
        Toast.success(I18n.t('common.saved'));
      } else {
        const username = sheet.querySelector('#in-username').value.trim();
        const password = sheet.querySelector('#in-password').value;
        fUsername.classList.toggle('invalid', !username);
        const fPassword = sheet.querySelector('#f-password');
        fPassword.classList.toggle('invalid', !password);
        if (!username || !password) return;

        const result = await UserService.create({ username, password, role, fullName });
        if (!result.ok) {
          if (result.error === 'usernameTaken') {
            fUsername.classList.add('invalid');
            Toast.error(I18n.t('user.usernameTaken'));
          } else {
            Toast.error(I18n.t('common.error'));
          }
          return;
        }
        Toast.success(I18n.t('user.userCreated'));
      }

      Modal.close();
      loadList();
    };
  }

  function openResetPassword(existing) {
    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="user.resetPassword"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <p class="text-muted" style="margin-bottom:14px">@${existing.username}</p>
      <div class="field" id="f-new-pw">
        <label data-i18n="user.newPassword"></label>
        <input type="password" id="in-new-pw" />
        <div class="error-msg" data-i18n="common.requiredField"></div>
      </div>
      <div class="field" id="f-confirm-pw">
        <label data-i18n="login.confirmPassword"></label>
        <input type="password" id="in-confirm-pw" />
        <div class="error-msg" data-i18n="login.passwordMismatch"></div>
      </div>
      <button class="btn btn-primary btn-block" id="btn-do-reset" data-i18n="user.resetPassword"></button>
    `, { center: true });
    I18n.apply(sheet);
    sheet.querySelector('#m-close').onclick = () => Modal.close();
    sheet.querySelector('#btn-do-reset').onclick = async () => {
      const pw = sheet.querySelector('#in-new-pw').value;
      const confirmPw = sheet.querySelector('#in-confirm-pw').value;
      const fPw = sheet.querySelector('#f-new-pw');
      const fConfirm = sheet.querySelector('#f-confirm-pw');
      fPw.classList.toggle('invalid', !pw);
      fConfirm.classList.toggle('invalid', !!pw && pw !== confirmPw);
      if (!pw || pw !== confirmPw) return;

      await UserService.resetPassword(existing.id, pw);
      Toast.success(I18n.t('user.passwordReset'));
      Modal.close();
    };
  }

  return { render };
})();
