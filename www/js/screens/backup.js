/* ============================================================
   Backup screen — manual backup/restore, auto-backup toggle, and
   a short history log. Reached from More → Backup & Restore.
   Route allows Admin + Manager; Manager gets a view-only render
   (all controls disabled/hidden, current values still shown) per
   the role matrix — enforced here in the screen, not by hiding the
   More-menu row, same split as AppSettingsScreen.
   ============================================================ */

const BackupScreen = (function () {
  function canEdit() { return AuthService.hasRole('admin'); }

  async function render(app) {
    const editable = canEdit();
    const autoBackup = await SettingsService.get('auto_backup', '1');
    const lastAuto = BackupService.lastAutoBackupDate();
    const history = await BackupService.listBackupHistory();

    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <h1 data-i18n="more.backup"></h1>
      </header>
      <div class="page page-pad" style="padding-top:14px;padding-bottom:24px">
        ${editable ? '' : `<p class="text-muted center mt-8" style="font-size:12.5px" data-i18n="common.viewOnlyNotice"></p>`}

        <div class="card mt-16" style="margin-bottom:14px">
          <div style="font-weight:700" data-i18n="backup.now"></div>
          <div class="text-muted mt-8" style="font-size:12.5px" data-i18n="backup.nowDesc"></div>
          <button class="btn btn-primary btn-block mt-8" id="btn-backup-now" ${editable ? '' : 'disabled'}>${Icons.svg('backup', 16)} <span data-i18n="backup.now"></span></button>
        </div>

        <div class="card" style="margin-bottom:14px">
          <div style="font-weight:700" data-i18n="backup.restore"></div>
          <div class="text-muted mt-8" style="font-size:12.5px" data-i18n="backup.restoreDesc"></div>
          <input type="file" id="in-restore-file" class="hidden" accept=".sqlite,.db,.json" />
          <button class="btn btn-outline btn-block mt-8" id="btn-restore" ${editable ? '' : 'disabled'}>${Icons.svg('upload', 16)} <span data-i18n="backup.restore"></span></button>
        </div>

        <div class="card" style="margin-bottom:14px">
          <div class="flex-between">
            <div>
              <div style="font-weight:700" data-i18n="backup.autoBackup"></div>
              <div class="text-muted" style="font-size:12px" data-i18n="backup.autoBackupDesc"></div>
            </div>
            <input type="checkbox" id="in-auto-backup" ${autoBackup === '1' ? 'checked' : ''} ${editable ? '' : 'disabled'} style="width:22px;height:22px" />
          </div>
          <div class="flex-between mt-8" style="font-size:12.5px">
            <span class="text-muted" data-i18n="backup.lastAutoBackup"></span>
            <b>${lastAuto || I18n.t('backup.never')}</b>
          </div>
        </div>

        <div class="card" style="margin-bottom:14px">
          <div class="card-title" data-i18n="backup.history"></div>
          <div id="backup-history"></div>
        </div>

        <p class="text-muted center" style="font-size:11.5px" data-i18n="backup.formatNote"></p>
      </div>
    `;
    I18n.apply(app);
    renderHistory(history);

    app.querySelector('#btn-back').onclick = () => Router.navigate('/more');

    if (!editable) return;

    app.querySelector('#btn-backup-now').onclick = async () => {
      const btn = app.querySelector('#btn-backup-now');
      btn.disabled = true;
      try {
        await BackupService.exportBackup();
        Toast.success(I18n.t('backup.done'));
        renderHistory(await BackupService.listBackupHistory());
      } catch (e) {
        console.error(e);
        Toast.error(I18n.t('common.error'));
      }
      btn.disabled = false;
    };

    app.querySelector('#btn-restore').onclick = () => app.querySelector('#in-restore-file').click();
    app.querySelector('#in-restore-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const ok = await Modal.confirm({ message: I18n.t('backup.restoreConfirm'), danger: true });
      if (!ok) return;
      try {
        await BackupService.importBackup(file);
        Toast.success(I18n.t('backup.restoreDone'));
        setTimeout(() => location.reload(), 900);
      } catch (err) {
        console.error(err);
        Toast.error(I18n.t('common.error'));
      }
    });

    app.querySelector('#in-auto-backup').addEventListener('change', async (e) => {
      await SettingsService.set('auto_backup', e.target.checked ? '1' : '0');
      Toast.success(I18n.t('common.saved'));
    });
  }

  function renderHistory(rows) {
    const el = document.getElementById('backup-history');
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = `<p class="text-muted center" data-i18n="backup.noHistory"></p>`;
      I18n.apply(el);
      return;
    }
    el.innerHTML = rows.map((r) => `
      <div class="flex-between mt-8" style="font-size:12.5px">
        <span>${r.file_name}</span>
        <span class="text-muted">${Format.dateTime(r.created_at)}</span>
      </div>
    `).join('');
  }

  return { render };
})();
