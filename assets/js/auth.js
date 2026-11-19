/**
 * ============================================================================
 * PERSONAL DOCUMENT MANAGER - AUTH, SESSION, NAVIGATION & THEME (auth.js)
 * Manages Login/Logout Flow, Role-Based Navigation Guard, Theme Switching,
 * and App Shell Initialization
 * ============================================================================
 */

window.PDM_AUTH = (function() {

  function initTheme() {
    var saved = localStorage.getItem(PDM_CONFIG.STORAGE_KEYS.THEME) || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeButtons(saved);
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') || 'light';
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(PDM_CONFIG.STORAGE_KEYS.THEME, next);
    updateThemeButtons(next);
  }

  function updateThemeButtons(theme) {
    var labelEl = document.getElementById('themeToggleLabel');
    if (labelEl) {
      labelEl.textContent = theme === 'dark' ? 'Mode Terang' : 'Mode Gelap';
    }
  }

  function getCachedUser() {
    var raw = localStorage.getItem(PDM_CONFIG.STORAGE_KEYS.SESSION_USER);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function getToken() {
    return localStorage.getItem(PDM_CONFIG.STORAGE_KEYS.SESSION_TOKEN) || '';
  }

  async function login(username, password) {
    var data = await PDM_API.request('auth.login', {
      username: username,
      password: password
    });
    localStorage.setItem(PDM_CONFIG.STORAGE_KEYS.SESSION_TOKEN, data.token);
    localStorage.setItem(PDM_CONFIG.STORAGE_KEYS.SESSION_USER, JSON.stringify(data.user));
    return data;
  }

  async function logout() {
    try {
      await PDM_API.request('auth.logout', {});
    } catch (e) {}
    localStorage.removeItem(PDM_CONFIG.STORAGE_KEYS.SESSION_TOKEN);
    localStorage.removeItem(PDM_CONFIG.STORAGE_KEYS.SESSION_USER);
    window.location.href = 'login.html';
  }

  /**
   * Memverifikasi sesi di halaman utama (index.html)
   * dan menerapkan pembatasan menu sesuai Role (ADMIN vs USER)
   */
  async function guardMainApp() {
    initTheme();

    var token = getToken();
    if (!token) {
      window.location.href = 'login.html';
      return null;
    }

    try {
      var me = await PDM_API.request('auth.me', {});
      var user = me.user;
      localStorage.setItem(PDM_CONFIG.STORAGE_KEYS.SESSION_USER, JSON.stringify(user));
      applyUserToShell(user);
      return user;
    } catch (err) {
      localStorage.removeItem(PDM_CONFIG.STORAGE_KEYS.SESSION_TOKEN);
      localStorage.removeItem(PDM_CONFIG.STORAGE_KEYS.SESSION_USER);
      window.location.href = 'login.html?expired=1';
      return null;
    }
  }

  function applyUserToShell(user) {
    var isAdmin = (user.Role === 'ADMIN');

    // Update Sidebar Profile Info
    var initials = String(user.Nama || user.Username || 'U')
      .split(' ')
      .map(function(w) { return w.charAt(0); })
      .join('')
      .substring(0, 2)
      .toUpperCase();

    var avatarEl = document.getElementById('sidebarAvatar');
    var nameEl = document.getElementById('sidebarUserName');
    var roleEl = document.getElementById('sidebarUserRole');

    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl) nameEl.textContent = user.Nama;
    if (roleEl) {
      roleEl.innerHTML = isAdmin
        ? '<span class="badge badge-green" style="padding:1px 7px;font-size:10px;">ADMINISTRATOR</span>'
        : '<span class="badge badge-gray" style="padding:1px 7px;font-size:10px;">PERSONAL USER</span>';
    }

    // Tampilkan/sembunyikan elemen khusus Admin
    var adminEls = document.querySelectorAll('.admin-only');
    adminEls.forEach(function(el) {
      el.style.display = isAdmin ? '' : 'none';
    });

    // Update indikator koneksi (Live GAS vs Local GAS Emulator)
    var connText = document.getElementById('connectionModeText');
    var connDot = document.getElementById('connectionPulseDot');
    if (connText) {
      if (PDM_UTILS.isLiveGasMode()) {
        connText.textContent = 'Google Apps Script Connected';
        if (connDot) connDot.className = 'pulse-dot';
      } else {
        connText.textContent = 'Dual-Drive Sandbox Engine';
        if (connDot) connDot.className = 'pulse-dot';
      }
    }
  }

  /**
   * Navigasi antar View di dalam Single Page Application (index.html)
   */
  function navigateTo(viewName, params) {
    var user = getCachedUser();
    var isAdmin = user && user.Role === 'ADMIN';

    // Guard halaman khusus Admin
    if ((viewName === 'backup' || viewName === 'users') && !isAdmin) {
      PDM_UTILS.showToast('Akses Ditolak', 'Halaman tersebut hanya dapat diakses oleh Administrator.', 'error');
      return;
    }

    var allViews = document.querySelectorAll('.view-section');
    allViews.forEach(function(sec) {
      sec.classList.remove('active');
    });

    var targetEl = document.getElementById('view-' + viewName);
    if (targetEl) {
      targetEl.classList.add('active');
    }

    var navBtns = document.querySelectorAll('.nav-item[data-view]');
    navBtns.forEach(function(btn) {
      if (btn.getAttribute('data-view') === viewName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Tutup sidebar mobile jika sedang terbuka
    var sb = document.getElementById('appSidebar');
    if (sb) sb.classList.remove('mobile-open');

    // Update Judul Halaman di Topbar
    var titles = {
      'dashboard': {
        title: isAdmin ? 'Dashboard Administrator' : 'Dashboard Ruang Pribadi',
        sub: isAdmin
          ? 'Ringkasan seluruh dokumen, kapasitas, pengguna, dan status replikasi Drive A ke Drive B'
          : 'Ringkasan dokumen pribadi Anda beserta status backup otomatis'
      },
      'my-documents': {
        title: isAdmin ? 'Seluruh Dokumen Aktif' : 'Dokumen Saya',
        sub: 'Kelola dokumen aktif yang tersimpan di Google Drive A & terbackup ke Drive B'
      },
      'search': {
        title: 'Pencarian & Filter Dokumen Tingkat Lanjut',
        sub: 'Cari berdasarkan nama file, kategori, format, pemilik, rentang tanggal, dan status backup'
      },
      'upload': {
        title: 'Upload Dokumen Baru',
        sub: 'Unggah PDF, JPG, JPEG, atau PNG ke Google Drive A dengan auto-backup ke Google Drive B'
      },
      'archive': {
        title: 'Arsip Dokumen',
        sub: 'Dokumen yang diarsipkan dari Drive A (Salinan cadangan di Drive B tetap utuh dan terlindungi)'
      },
      'preview': {
        title: 'Detail & Preview Dokumen',
        sub: 'Pratinjau dokumen terautentikasi, rincian metadata, checksum SHA-256, dan QR Code internal'
      },
      'backup': {
        title: 'Backup Center (Drive A \u2192 Drive B)',
        sub: 'Pusat kendali replikasi satu arah lintas akun Google Drive, antrean retry, dan audit integritas'
      },
      'users': {
        title: 'Manajemen Pengguna & Hak Akses',
        sub: 'Kelola akun pengguna, status aktif/nonaktif, reset password, dan kuota dokumen'
      },
      'settings': {
        title: 'Pengaturan Sistem & Konfigurasi Cloud',
        sub: 'Konfigurasi Google Drive A, Google Drive B, kategori dokumen, keamanan akun, dan Time-Driven Trigger'
      }
    };

    var meta = titles[viewName] || { title: PDM_CONFIG.APP_NAME, sub: '' };
    var h1 = document.getElementById('topbarTitle');
    var p = document.getElementById('topbarSubtitle');
    if (h1) h1.textContent = meta.title;
    if (p) p.textContent = meta.sub;

    // Trigger loader masing-masing modul
    if (viewName === 'dashboard' && window.PDM_DASHBOARD) {
      PDM_DASHBOARD.loadDashboard();
    } else if (viewName === 'my-documents' && window.PDM_DOCUMENTS) {
      PDM_DOCUMENTS.openMyDocumentsView();
    } else if (viewName === 'search' && window.PDM_DOCUMENTS) {
      PDM_DOCUMENTS.openSearchView();
    } else if (viewName === 'archive' && window.PDM_DOCUMENTS) {
      PDM_DOCUMENTS.openArchiveView();
    } else if (viewName === 'upload' && window.PDM_UPLOAD) {
      PDM_UPLOAD.initUploadView();
    } else if (viewName === 'preview' && window.PDM_PREVIEW && params && params.documentId) {
      PDM_PREVIEW.loadDocumentPreview(params.documentId, params.returnView || 'my-documents');
    } else if (viewName === 'backup' && window.PDM_BACKUP) {
      PDM_BACKUP.loadBackupCenter();
    } else if (viewName === 'users' && window.PDM_USERS) {
      PDM_USERS.loadUsersManagement();
    } else if (viewName === 'settings' && window.PDM_SETTINGS) {
      PDM_SETTINGS.loadSettingsView();
    }
  }

  return {
    initTheme: initTheme,
    toggleTheme: toggleTheme,
    getCachedUser: getCachedUser,
    getToken: getToken,
    login: login,
    logout: logout,
    guardMainApp: guardMainApp,
    navigateTo: navigateTo
  };

})();
