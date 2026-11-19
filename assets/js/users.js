/**
 * ============================================================================
 * PERSONAL DOCUMENT MANAGER - USER MANAGEMENT MODULE (users.js)
 * Admin-Only Module: List Users + Storage Stats, Add User, Edit User,
 * Toggle Active/Inactive Status, and Reset User Password
 * ============================================================================
 */

window.PDM_USERS = (function() {

  var _usersList = [];

  async function loadUsersManagement() {
    var container = document.getElementById('usersTableContainer');
    if (!container) return;

    try {
      _usersList = await PDM_API.request('users.list', {});
      renderUsersTable(container, _usersList);
    } catch (err) {
      container.innerHTML = '<div class="empty-state"><p style="color:var(--status-red-text);">' + PDM_UTILS.escapeHtml(err.message) + '</p></div>';
    }
  }

  function renderUsersTable(container, users) {
    if (!users || users.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Belum ada data pengguna.</p></div>';
      return;
    }

    var currentAdmin = PDM_AUTH.getCachedUser();

    var rows = users.map(function(u) {
      var st = u.stats || { totalDocs: 0, activeDocs: 0, archivedDocs: 0, totalSize: 0, backedUpDocs: 0 };
      var isSelf = currentAdmin && String(currentAdmin.UserID) === String(u.UserID);
      var uidEsc = PDM_UTILS.escapeHtml(u.UserID);
      var isActive = String(u.Status).toUpperCase() === 'ACTIVE';

      return (
        '<tr>' +
          '<td><code>' + uidEsc + '</code></td>' +
          '<td><strong>' + PDM_UTILS.escapeHtml(u.Nama) + '</strong></td>' +
          '<td>@' + PDM_UTILS.escapeHtml(u.Username) + '</td>' +
          '<td>' +
            (u.Role === 'ADMIN'
              ? '<span class="badge badge-green">ADMIN</span>'
              : '<span class="badge badge-gray">USER</span>') +
          '</td>' +
          '<td>' +
            (isActive
              ? '<span class="badge badge-green"><span class="badge-dot"></span>ACTIVE</span>'
              : '<span class="badge badge-red"><span class="badge-dot"></span>INACTIVE</span>') +
          '</td>' +
          '<td><strong>' + st.activeDocs + '</strong> aktif / ' + st.archivedDocs + ' arsip</td>' +
          '<td>' + PDM_UTILS.formatBytes(st.totalSize) + '</td>' +
          '<td>' + PDM_UTILS.formatDateShort(u.CreatedAt) + '</td>' +
          '<td>' +
            '<div class="action-btn-group">' +
              '<button class="btn btn-secondary btn-sm" onclick="PDM_USERS.openEditUserModal(\'' + uidEsc + '\')">Edit</button>' +
              '<button class="btn btn-secondary btn-sm" onclick="PDM_USERS.openResetPasswordModal(\'' + uidEsc + '\', \'' + PDM_UTILS.escapeHtml(u.Nama) + '\')">Reset Password</button>' +
              (!isSelf
                ? '<button class="btn ' + (isActive ? 'btn-danger' : 'btn-success') + ' btn-sm" onclick="PDM_USERS.toggleStatus(\'' + uidEsc + '\')">' +
                    (isActive ? 'Nonaktifkan' : 'Aktifkan') +
                  '</button>'
                : '') +
            '</div>' +
          '</td>' +
        '</tr>'
      );
    }).join('');

    container.innerHTML =
      '<div class="table-responsive">' +
        '<table class="data-table">' +
          '<thead>' +
            '<tr>' +
              '<th>UserID</th>' +
              '<th>Nama Lengkap (Folder Drive)</th>' +
              '<th>Username</th>' +
              '<th>Role</th>' +
              '<th>Status</th>' +
              '<th>Dokumen</th>' +
              '<th>Kapasitas</th>' +
              '<th>Dibuat</th>' +
              '<th>Aksi</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>';
  }

  function openCreateUserModal() {
    document.getElementById('userFormMode').value = 'CREATE';
    document.getElementById('userFormUserId').value = '';
    document.getElementById('userFormModalTitle').textContent = 'Tambah Akun Pengguna Baru';
    document.getElementById('userFormNama').value = '';
    document.getElementById('userFormUsername').value = '';
    document.getElementById('userFormPasswordGroup').style.display = 'flex';
    document.getElementById('userFormPassword').value = '';
    document.getElementById('userFormRole').value = 'USER';
    document.getElementById('userFormStatus').value = 'ACTIVE';
    document.getElementById('userFormModal').classList.add('open');
  }

  function openEditUserModal(userId) {
    var u = _usersList.find(function(item) { return item.UserID === userId; });
    if (!u) return;

    document.getElementById('userFormMode').value = 'EDIT';
    document.getElementById('userFormUserId').value = u.UserID;
    document.getElementById('userFormModalTitle').textContent = 'Edit Akun Pengguna: ' + u.Nama;
    document.getElementById('userFormNama').value = u.Nama;
    document.getElementById('userFormUsername').value = u.Username;
    document.getElementById('userFormPasswordGroup').style.display = 'none';
    document.getElementById('userFormPassword').value = '';
    document.getElementById('userFormRole').value = u.Role;
    document.getElementById('userFormStatus').value = u.Status;
    document.getElementById('userFormModal').classList.add('open');
  }

  async function saveUserForm(e) {
    if (e) e.preventDefault();
    var mode = document.getElementById('userFormMode').value;
    var uid = document.getElementById('userFormUserId').value;
    var nama = document.getElementById('userFormNama').value.trim();
    var uname = document.getElementById('userFormUsername').value.trim();
    var pass = document.getElementById('userFormPassword').value;
    var role = document.getElementById('userFormRole').value;
    var status = document.getElementById('userFormStatus').value;

    try {
      if (mode === 'CREATE') {
        await PDM_API.request('users.create', {
          Nama: nama,
          Username: uname,
          Password: pass,
          Role: role,
          Status: status
        });
        PDM_UTILS.showToast('Pengguna Ditambahkan', 'Akun ' + nama.toUpperCase() + ' berhasil dibuat.', 'success');
      } else {
        await PDM_API.request('users.update', {
          UserID: uid,
          Nama: nama,
          Username: uname,
          Role: role,
          Status: status
        });
        PDM_UTILS.showToast('Pengguna Diperbarui', 'Data akun ' + nama.toUpperCase() + ' berhasil disimpan.', 'success');
      }
      document.getElementById('userFormModal').classList.remove('open');
      loadUsersManagement();
    } catch (err) {
      PDM_UTILS.showToast('Gagal Menyimpan Pengguna', err.message, 'error');
    }
  }

  async function toggleStatus(userId) {
    try {
      var updated = await PDM_API.request('users.toggleStatus', { UserID: userId });
      PDM_UTILS.showToast('Status Diubah', 'Status akun ' + updated.Nama + ' kini ' + updated.Status + '.', 'success');
      loadUsersManagement();
    } catch (err) {
      PDM_UTILS.showToast('Gagal Mengubah Status', err.message, 'error');
    }
  }

  function openResetPasswordModal(userId, userName) {
    document.getElementById('resetPassUserId').value = userId;
    document.getElementById('resetPassUserName').textContent = userName;
    document.getElementById('resetPassNewInput').value = '';
    document.getElementById('resetPasswordModal').classList.add('open');
  }

  async function executeResetPassword(e) {
    if (e) e.preventDefault();
    var uid = document.getElementById('resetPassUserId').value;
    var newPass = document.getElementById('resetPassNewInput').value;
    try {
      await PDM_API.request('users.resetPassword', {
        UserID: uid,
        NewPassword: newPass
      });
      document.getElementById('resetPasswordModal').classList.remove('open');
      PDM_UTILS.showToast('Password Direset', 'Password baru telah di-hash dengan Salted SHA-256 dan disimpan.', 'success');
    } catch (err) {
      PDM_UTILS.showToast('Gagal Reset Password', err.message, 'error');
    }
  }

  return {
    loadUsersManagement: loadUsersManagement,
    openCreateUserModal: openCreateUserModal,
    openEditUserModal: openEditUserModal,
    saveUserForm: saveUserForm,
    toggleStatus: toggleStatus,
    openResetPasswordModal: openResetPasswordModal,
    executeResetPassword: executeResetPassword
  };

})();
