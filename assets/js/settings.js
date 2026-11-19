/**
 * ============================================================================
 * PERSONAL DOCUMENT MANAGER - SETTINGS & DRIVE INTEGRATION MODULE (settings.js)
 * Manages:
 * 1. Primary Google Drive A & Secondary Google Drive B Configuration (Admin)
 * 2. Cross-Account Connection Testing & Time-Driven Trigger Management (Admin)
 * 3. Document Categories Management (Global for Admin, Personal for User)
 * 4. Personal Profile & Change Password
 * ============================================================================
 */

window.PDM_SETTINGS = (function() {

  async function loadSettingsView() {
    var user = PDM_AUTH.getCachedUser();
    var isAdmin = (user && user.Role === 'ADMIN');

    // Isi profil pengguna
    var pName = document.getElementById('settingsProfileName');
    var pUser = document.getElementById('settingsProfileUsername');
    var pRole = document.getElementById('settingsProfileRole');
    if (user) {
      if (pName) pName.value = user.Nama;
      if (pUser) pUser.value = '@' + user.Username;
      if (pRole) pRole.value = user.Role;
    }

    // Isi URL Endpoint GAS saat ini
    var gasInput = document.getElementById('settingsGasEndpointInput');
    if (gasInput) {
      gasInput.value = PDM_UTILS.getGasEndpointUrl();
    }

    // Muat daftar kategori
    await loadCategoriesList();

    // Jika Admin, muat konfigurasi Drive A, Drive B, Trigger, dan Struktur Database
    if (isAdmin) {
      await loadAdminSystemSettings();
    }
  }

  async function loadCategoriesList() {
    var container = document.getElementById('settingsCategoriesList');
    if (!container) return;

    try {
      var cats = await PDM_API.request('categories.list', {});
      var user = PDM_AUTH.getCachedUser();
      var isAdmin = (user && user.Role === 'ADMIN');

      var html = cats.map(function(c) {
        var canDelete = isAdmin || (String(c.UserID) === String(user.UserID));
        return (
          '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:8px;background:var(--bg-surface-alt);border:1px solid var(--border-color);">' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<span style="font-weight:700;font-size:13px;">' + PDM_UTILS.escapeHtml(c.CategoryName) + '</span>' +
              (c.UserID === 'SYSTEM'
                ? '<span class="badge badge-gray" style="font-size:10px;">GLOBAL</span>'
                : '<span class="badge badge-green" style="font-size:10px;">PRIBADI</span>') +
            '</div>' +
            (canDelete
              ? '<button class="btn btn-ghost btn-sm" style="color:var(--status-red-text);padding:3px 8px;" onclick="PDM_SETTINGS.deleteCategory(\'' + PDM_UTILS.escapeHtml(c.CategoryID) + '\')">Hapus</button>'
              : '') +
          '</div>'
        );
      }).join('');

      container.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;">' + html + '</div>';
    } catch (err) {
      container.innerHTML = '<p style="color:var(--status-red-text);">' + PDM_UTILS.escapeHtml(err.message) + '</p>';
    }
  }

  async function addCategory(e) {
    if (e) e.preventDefault();
    var input = document.getElementById('newCategoryNameInput');
    var name = (input ? input.value : '').trim();
    if (!name) return;

    try {
      await PDM_API.request('categories.create', { CategoryName: name });
      input.value = '';
      PDM_UTILS.showToast('Kategori Ditambahkan', 'Kategori "' + name.toUpperCase() + '" siap digunakan.', 'success');
      loadCategoriesList();
    } catch (err) {
      PDM_UTILS.showToast('Gagal Menambah Kategori', err.message, 'error');
    }
  }

  async function deleteCategory(categoryId) {
    try {
      await PDM_API.request('categories.delete', { CategoryID: categoryId });
      PDM_UTILS.showToast('Kategori Dihapus', 'Kategori berhasil dihapus.', 'success');
      loadCategoriesList();
    } catch (err) {
      PDM_UTILS.showToast('Gagal Menghapus', err.message, 'error');
    }
  }

  async function changeOwnPassword(e) {
    if (e) e.preventDefault();
    var cur = document.getElementById('changePassCurrent').value;
    var nw = document.getElementById('changePassNew').value;

    try {
      await PDM_API.request('auth.changePassword', {
        currentPassword: cur,
        newPassword: nw
      });
      document.getElementById('changePassCurrent').value = '';
      document.getElementById('changePassNew').value = '';
      PDM_UTILS.showToast('Password Diperbarui', 'Password akun Anda telah berhasil diperbarui.', 'success');
    } catch (err) {
      PDM_UTILS.showToast('Gagal Mengubah Password', err.message, 'error');
    }
  }

  async function loadAdminSystemSettings() {
    try {
      var data = await PDM_API.request('settings.get', {});
      var s = data.settings || {};

      setVal('cfgDriveARootId', s.DRIVE_A_ROOT_FOLDER_ID || '');
      setVal('cfgDriveAArchiveId', s.DRIVE_A_ARCHIVE_FOLDER_ID || '');
      setVal('cfgBackupMode', s.BACKUP_MODE || 'BRIDGE');
      setVal('cfgDriveBAccountEmail', s.DRIVE_B_ACCOUNT_EMAIL || '');
      setVal('cfgDriveBRootId', s.DRIVE_B_ROOT_FOLDER_ID || '');
      setVal('cfgDriveBBridgeUrl', s.DRIVE_B_BRIDGE_URL || '');
      setVal('cfgDriveBBridgeSecret', s.DRIVE_B_BRIDGE_SECRET || '');
      setVal('cfgMaxFileSizeMb', s.MAX_FILE_SIZE_MB || '15');
      setVal('cfgAutoBackupOnUpload', s.AUTO_BACKUP_ON_UPLOAD || 'TRUE');
      setVal('cfgAllowUserCategory', s.ALLOW_USER_CUSTOM_CATEGORY || 'TRUE');

      renderTriggerAndDbStatus(data.triggerStatus, data.databaseStructure, data.driveAHealth, data.driveBHealth);
    } catch (err) {
      PDM_UTILS.showToast('Gagal Memuat Pengaturan Admin', err.message, 'error');
    }
  }

  function setVal(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val;
  }

  function renderTriggerAndDbStatus(triggerSt, dbSt, dA, dB) {
    var box = document.getElementById('adminSystemHealthBox');
    if (!box) return;

    var qActive = triggerSt && triggerSt.queueTriggerActive;
    var dbHealthy = dbSt && dbSt.healthy;

    box.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">' +
        '<div style="padding:12px;border-radius:8px;background:var(--bg-surface-alt);border:1px solid var(--border-color);">' +
          '<div style="font-size:11.5px;color:var(--text-muted);font-weight:700;">STATUS GOOGLE DRIVE A</div>' +
          '<div style="margin-top:6px;">' +
            (dA && dA.connected
              ? '<span class="badge badge-green"><span class="badge-dot"></span>ONLINE (' + PDM_UTILS.escapeHtml(dA.rootFolderName) + ')</span>'
              : '<span class="badge badge-red"><span class="badge-dot"></span>ERROR</span>') +
          '</div>' +
        '</div>' +

        '<div style="padding:12px;border-radius:8px;background:var(--bg-surface-alt);border:1px solid var(--border-color);">' +
          '<div style="font-size:11.5px;color:var(--text-muted);font-weight:700;">STATUS GOOGLE DRIVE B (AKUN KEDUA)</div>' +
          '<div style="margin-top:6px;">' +
            (dB && dB.connected
              ? '<span class="badge badge-green"><span class="badge-dot"></span>ONLINE (' + PDM_UTILS.escapeHtml(dB.mode) + ')</span>'
              : '<span class="badge badge-red"><span class="badge-dot"></span>' + PDM_UTILS.escapeHtml((dB && dB.error) || 'OFFLINE') + '</span>') +
          '</div>' +
        '</div>' +

        '<div style="padding:12px;border-radius:8px;background:var(--bg-surface-alt);border:1px solid var(--border-color);">' +
          '<div style="font-size:11.5px;color:var(--text-muted);font-weight:700;">TIME-DRIVEN TRIGGER (5 MENIT)</div>' +
          '<div style="margin-top:6px;display:flex;align-items:center;justify-content:space-between;">' +
            (qActive
              ? '<span class="badge badge-green"><span class="badge-dot"></span>AKTIF</span>'
              : '<span class="badge badge-yellow"><span class="badge-dot"></span>NONAKTIF</span>') +
            '<button type="button" class="btn btn-secondary btn-sm" onclick="PDM_SETTINGS.toggleTriggers(' + (!qActive) + ')">' +
              (qActive ? 'Matikan' : 'Aktifkan Trigger') +
            '</button>' +
          '</div>' +
        '</div>' +

        '<div style="padding:12px;border-radius:8px;background:var(--bg-surface-alt);border:1px solid var(--border-color);">' +
          '<div style="font-size:11.5px;color:var(--text-muted);font-weight:700;">DATABASE SPREADSHEET (8 SHEETS)</div>' +
          '<div style="margin-top:6px;">' +
            (dbHealthy
              ? '<span class="badge badge-green"><span class="badge-dot"></span>8 SHEET LENGKAP &amp; VALID</span>'
              : '<span class="badge badge-yellow"><span class="badge-dot"></span>PERLU VERIFIKASI</span>') +
          '</div>' +
        '</div>' +
      '</div>';
  }

  async function saveAdminDriveSettings(e) {
    if (e) e.preventDefault();
    var settingsPayload = {
      DRIVE_A_ROOT_FOLDER_ID: document.getElementById('cfgDriveARootId').value.trim(),
      DRIVE_A_ARCHIVE_FOLDER_ID: document.getElementById('cfgDriveAArchiveId').value.trim(),
      BACKUP_MODE: document.getElementById('cfgBackupMode').value,
      DRIVE_B_ACCOUNT_EMAIL: document.getElementById('cfgDriveBAccountEmail').value.trim(),
      DRIVE_B_ROOT_FOLDER_ID: document.getElementById('cfgDriveBRootId').value.trim(),
      DRIVE_B_BRIDGE_URL: document.getElementById('cfgDriveBBridgeUrl').value.trim(),
      DRIVE_B_BRIDGE_SECRET: document.getElementById('cfgDriveBBridgeSecret').value.trim(),
      MAX_FILE_SIZE_MB: document.getElementById('cfgMaxFileSizeMb').value.trim() || '15',
      AUTO_BACKUP_ON_UPLOAD: document.getElementById('cfgAutoBackupOnUpload').value,
      ALLOW_USER_CUSTOM_CATEGORY: document.getElementById('cfgAllowUserCategory').value
    };

    try {
      await PDM_API.request('settings.update', { settings: settingsPayload });
      PDM_UTILS.showToast('Konfigurasi Disimpan', 'Pengaturan Google Drive A, Google Drive B, dan sistem berhasil diperbarui.', 'success');
      loadAdminSystemSettings();
    } catch (err) {
      PDM_UTILS.showToast('Gagal Menyimpan Konfigurasi', err.message, 'error');
    }
  }

  async function testDriveConnections() {
    try {
      PDM_UTILS.showToast('Menguji Koneksi', 'Memeriksa akses Google Drive A dan Google Drive B...', 'info');
      var res = await PDM_API.request('settings.testDriveConnections', {});
      var okA = res.driveA && res.driveA.connected;
      var okB = res.driveB && res.driveB.connected;
      if (okA && okB) {
        PDM_UTILS.showToast('Koneksi Drive A & Drive B Sukses', 'Kedua akun Google Drive siap melayani penyimpanan utama dan auto-backup.', 'success');
      } else {
        PDM_UTILS.showToast(
          'Hasil Tes Koneksi',
          'Drive A: ' + (okA ? 'ONLINE' : 'ERROR') + ' | Drive B: ' + (okB ? 'ONLINE' : (res.driveB.error || 'OFFLINE')),
          'warning'
        );
      }
      loadAdminSystemSettings();
    } catch (err) {
      PDM_UTILS.showToast('Tes Koneksi Gagal', err.message, 'error');
    }
  }

  async function toggleTriggers(install) {
    try {
      if (install) {
        await PDM_API.request('settings.installTriggers', {});
        PDM_UTILS.showToast('Trigger Diaktifkan', 'Time-Driven Trigger 5 menit untuk antrean backup berhasil dipasang.', 'success');
      } else {
        await PDM_API.request('settings.removeTriggers', {});
        PDM_UTILS.showToast('Trigger Dinonaktifkan', 'Time-Driven Trigger otomatis telah dihentikan.', 'warning');
      }
      loadAdminSystemSettings();
    } catch (err) {
      PDM_UTILS.showToast('Gagal Mengelola Trigger', err.message, 'error');
    }
  }

  function saveFrontendGasEndpoint() {
    var val = document.getElementById('settingsGasEndpointInput').value.trim();
    PDM_UTILS.setGasEndpointUrl(val);
    PDM_UTILS.showToast(
      'Endpoint Diperbarui',
      val ? 'Terhubung ke Live Google Apps Script Web App.' : 'Menggunakan Dual-Drive Sandbox Engine.',
      'success'
    );
  }

  return {
    loadSettingsView: loadSettingsView,
    addCategory: addCategory,
    deleteCategory: deleteCategory,
    changeOwnPassword: changeOwnPassword,
    saveAdminDriveSettings: saveAdminDriveSettings,
    testDriveConnections: testDriveConnections,
    toggleTriggers: toggleTriggers,
    saveFrontendGasEndpoint: saveFrontendGasEndpoint
  };

})();
