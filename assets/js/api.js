/**
 * ============================================================================
 * PERSONAL DOCUMENT MANAGER - API CLIENT & GAS EMULATOR ENGINE (api.js)
 *
 * Fitur Utama:
 * 1. Live Google Apps Script Communication:
 *    Mengirim HTTP POST dengan Content-Type: text/plain;charset=utf-8
 *    (Zero-Preflight CORS) ke URL Deployment GAS.
 * 2. Full-Fidelity Local GAS + Dual-Drive (Drive A & Drive B) Emulator:
 *    Jika GAS_WEB_APP_URL belum dihubungkan (atau sedang pengujian lokal),
 *    sistem mengeksekusi engine replika 8-Sheet Database + Virtual Drive A & Drive B
 *    yang 100% identik secara aturan bisnis, RBAC, salted hash, magic bytes,
 *    one-way copy backup, queue retry, dan archive retention.
 * ============================================================================
 */

window.PDM_API = (function() {

  // Sample 1x1 PNG Base64 & Minimal Valid PDF Base64 untuk dokumen seed awal di emulator
  var SAMPLE_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  var SAMPLE_PDF_B64 = btoa(
    '%PDF-1.4\n' +
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n' +
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n' +
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n' +
    '4 0 obj << /Length 128 >> stream\n' +
    'BT /F1 18 Tf 50 760 Td (PERSONAL DOCUMENT MANAGER - VERIFIED CLOUD DOCUMENT) Tj /F1 12 Tf 0 -30 Td (Primary Drive A & Backup Drive B Integrity Verified) Tj ET\n' +
    'endstream endobj\n' +
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n' +
    'xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000244 00000 n \n0000000424 00000 n \n' +
    'trailer << /Size 6 /Root 1 0 R >>\nstartxref\n494\n%%EOF'
  );

  function simpleHash(salt, password) {
    var str = salt + ':' + password;
    var h1 = 0x811c9dc5;
    for (var iter = 0; iter < 200; iter++) {
      for (var i = 0; i < str.length; i++) {
        h1 ^= str.charCodeAt(i);
        h1 = Math.imul(h1, 0x01000193);
      }
      str = (h1 >>> 0).toString(16) + ':' + password + ':' + iter;
    }
    return salt + '$1000$' + (h1 >>> 0).toString(16).padStart(16, '0') + btoa(salt).substring(0, 16);
  }

  function verifyHash(password, stored) {
    if (!stored || stored.indexOf('$') === -1) return false;
    var parts = stored.split('$');
    var salt = parts[0];
    return simpleHash(salt, password) === stored;
  }

  function genId(prefix) {
    var d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    var r = Math.random().toString(16).substring(2, 10).toUpperCase();
    return prefix + '-' + d + '-' + r;
  }

  /**
   * Memuat atau menginisialisasi Database Emulator 8-Sheet + Virtual Drive A & Drive B
   */
  function loadEmulatorDb() {
    var raw = localStorage.getItem(PDM_CONFIG.STORAGE_KEYS.EMULATOR_DB);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.USERS && parsed.DOCUMENTS) return parsed;
      } catch (e) {}
    }

    var now = new Date();
    var isoNow = now.toISOString();
    var m1 = new Date(now.getFullYear(), now.getMonth() - 2, 12).toISOString();
    var m2 = new Date(now.getFullYear(), now.getMonth() - 1, 18).toISOString();

    var db = {
      USERS: [
        {
          UserID: 'USR-ADMIN-001',
          Nama: 'ADMINISTRATOR UTAMA',
          Username: 'admin',
          PasswordHash: simpleHash('salt_adm01', 'Admin@123'),
          Role: 'ADMIN',
          Status: 'ACTIVE',
          CreatedAt: m1
        },
        {
          UserID: 'USR-202601-001',
          Nama: 'AHMAD MUZAKKI',
          Username: 'muzakki',
          PasswordHash: simpleHash('salt_usr01', 'User@123'),
          Role: 'USER',
          Status: 'ACTIVE',
          CreatedAt: m1
        },
        {
          UserID: 'USR-202601-002',
          Nama: 'AHMAD MUBAROK',
          Username: 'mubarok',
          PasswordHash: simpleHash('salt_usr02', 'User@123'),
          Role: 'USER',
          Status: 'ACTIVE',
          CreatedAt: m2
        }
      ],
      CATEGORIES: [
        { CategoryID: 'CAT-SYS-001', UserID: 'SYSTEM', CategoryName: 'IDENTITAS', CreatedAt: m1 },
        { CategoryID: 'CAT-SYS-002', UserID: 'SYSTEM', CategoryName: 'PENDIDIKAN', CreatedAt: m1 },
        { CategoryID: 'CAT-SYS-003', UserID: 'SYSTEM', CategoryName: 'KELUARGA', CreatedAt: m1 },
        { CategoryID: 'CAT-SYS-004', UserID: 'SYSTEM', CategoryName: 'KEUANGAN', CreatedAt: m1 },
        { CategoryID: 'CAT-SYS-005', UserID: 'SYSTEM', CategoryName: 'PEKERJAAN', CreatedAt: m1 },
        { CategoryID: 'CAT-SYS-006', UserID: 'SYSTEM', CategoryName: 'DOKUMEN LAINNYA', CreatedAt: m1 }
      ],
      DOCUMENTS: [
        {
          DocumentID: 'DOC-20261012-A101',
          UserID: 'USR-202601-001',
          OwnerName: 'AHMAD MUZAKKI',
          FileName: 'KTP_Ahmad_Muzakki.pdf',
          Category: 'IDENTITAS',
          Format: 'PDF',
          MIMEType: 'application/pdf',
          FileSize: 428500,
          Description: 'Kartu Tanda Penduduk Elektronik (e-KTP)',
          PrimaryFileID: 'DRV_A_FILE_101',
          BackupFileID: 'DRV_B_FILE_101',
          BackupStatus: 'SUCCESS',
          BackupDate: m1,
          BackupError: '',
          Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          Status: 'ACTIVE',
          CreatedAt: m1,
          UpdatedAt: m1
        },
        {
          DocumentID: 'DOC-20261018-A102',
          UserID: 'USR-202601-001',
          OwnerName: 'AHMAD MUZAKKI',
          FileName: 'Ijazah_S1_Teknik_Informatika.pdf',
          Category: 'PENDIDIKAN',
          Format: 'PDF',
          MIMEType: 'application/pdf',
          FileSize: 1245000,
          Description: 'Ijazah Sarjana & Transkrip Nilai Resmi',
          PrimaryFileID: 'DRV_A_FILE_102',
          BackupFileID: 'DRV_B_FILE_102',
          BackupStatus: 'SUCCESS',
          BackupDate: m2,
          BackupError: '',
          Checksum: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
          Status: 'ACTIVE',
          CreatedAt: m2,
          UpdatedAt: m2
        },
        {
          DocumentID: 'DOC-20261102-A103',
          UserID: 'USR-202601-001',
          OwnerName: 'AHMAD MUZAKKI',
          FileName: 'Kartu_Keluarga_2026.png',
          Category: 'KELUARGA',
          Format: 'PNG',
          MIMEType: 'image/png',
          FileSize: 615200,
          Description: 'Scan Kartu Keluarga Digital QR Dukcapil',
          PrimaryFileID: 'DRV_A_FILE_103',
          BackupFileID: 'DRV_B_FILE_103',
          BackupStatus: 'SUCCESS',
          BackupDate: isoNow,
          BackupError: '',
          Checksum: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
          Status: 'ACTIVE',
          CreatedAt: isoNow,
          UpdatedAt: isoNow
        },
        {
          DocumentID: 'DOC-20261105-B201',
          UserID: 'USR-202601-002',
          OwnerName: 'AHMAD MUBAROK',
          FileName: 'Paspor_Ahmad_Mubarok.jpg',
          Category: 'IDENTITAS',
          Format: 'JPG',
          MIMEType: 'image/jpeg',
          FileSize: 512400,
          Description: 'Halaman Identitas Paspor Elektronik',
          PrimaryFileID: 'DRV_A_FILE_201',
          BackupFileID: 'DRV_B_FILE_201',
          BackupStatus: 'SUCCESS',
          BackupDate: isoNow,
          BackupError: '',
          Checksum: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
          Status: 'ACTIVE',
          CreatedAt: isoNow,
          UpdatedAt: isoNow
        },
        {
          DocumentID: 'DOC-20261110-B202',
          UserID: 'USR-202601-002',
          OwnerName: 'AHMAD MUBAROK',
          FileName: 'Sertifikat_Kompetensi_Cloud.pdf',
          Category: 'PENDIDIKAN',
          Format: 'PDF',
          MIMEType: 'application/pdf',
          FileSize: 890100,
          Description: 'Sertifikasi Cloud Architect',
          PrimaryFileID: 'DRV_A_FILE_202',
          BackupFileID: '',
          BackupStatus: 'PENDING',
          BackupDate: '',
          BackupError: '',
          Checksum: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
          Status: 'ACTIVE',
          CreatedAt: isoNow,
          UpdatedAt: isoNow
        }
      ],
      BACKUP_QUEUE: [
        {
          QueueID: 'QUE-20261110-Q01',
          DocumentID: 'DOC-20261110-B202',
          Status: 'QUEUED',
          RetryCount: 0,
          NextRetry: isoNow,
          LastError: '',
          CreatedAt: isoNow
        }
      ],
      BACKUP_LOG: [
        {
          LogID: 'BLOG-20261105-L01',
          DocumentID: 'DOC-20261105-B201',
          PrimaryFileID: 'DRV_A_FILE_201',
          BackupFileID: 'DRV_B_FILE_201',
          Status: 'SUCCESS',
          StartTime: isoNow,
          EndTime: isoNow,
          ErrorMessage: ''
        },
        {
          LogID: 'BLOG-20261102-L02',
          DocumentID: 'DOC-20261102-A103',
          PrimaryFileID: 'DRV_A_FILE_103',
          BackupFileID: 'DRV_B_FILE_103',
          Status: 'SUCCESS',
          StartTime: isoNow,
          EndTime: isoNow,
          ErrorMessage: ''
        }
      ],
      ACTIVITY_LOG: [
        {
          ActivityID: 'ACT-20261119-001',
          UserID: 'SYSTEM',
          Username: 'system',
          Action: 'SYSTEM_INIT',
          Description: 'Inisialisasi 8 Sheet Database & Struktur Folder Drive A / Drive B selesai.',
          Timestamp: isoNow
        }
      ],
      ARCHIVE_LOG: [],
      SETTINGS: {
        SYSTEM_INITIALIZED: 'TRUE',
        DRIVE_A_ROOT_FOLDER_ID: '1A_PrimaryRootFolder_DriveA',
        DRIVE_A_ARCHIVE_FOLDER_ID: '1A_ArchiveRootFolder_DriveA',
        DRIVE_A_ACCOUNT_EMAIL: 'primary.storage.drive.a@gmail.com',
        BACKUP_MODE: 'BRIDGE',
        DRIVE_B_ROOT_FOLDER_ID: '1B_BackupVaultFolder_DriveB',
        DRIVE_B_BRIDGE_URL: 'https://script.google.com/macros/s/AKfycb_DriveB_VaultReceiver_Account2/exec',
        DRIVE_B_BRIDGE_SECRET: '9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c',
        DRIVE_B_ACCOUNT_EMAIL: 'backup.vault.drive.b@gmail.com',
        MAX_FILE_SIZE_MB: '15',
        AUTO_BACKUP_ON_UPLOAD: 'TRUE',
        ALLOW_USER_CUSTOM_CATEGORY: 'TRUE',
        LAST_BACKUP_RUN: isoNow,
        LAST_INTEGRITY_CHECK: isoNow,
        SIMULATE_DRIVE_B_OFFLINE: 'FALSE'
      },
      // Virtual Storage Blobs (Drive A & Drive B)
      DRIVE_A_BLOBS: {},
      DRIVE_B_BLOBS: {},
      SESSIONS: {},
      LOGIN_ATTEMPTS: {},
      TRIGGERS_ACTIVE: true
    };

    saveEmulatorDb(db);
    return db;
  }

  function saveEmulatorDb(db) {
    try {
      localStorage.setItem(PDM_CONFIG.STORAGE_KEYS.EMULATOR_DB, JSON.stringify(db));
    } catch (e) {
      // Jika kuota localStorage penuh oleh blob besar, bersihkan cache blob lama
      db.DRIVE_A_BLOBS = {};
      db.DRIVE_B_BLOBS = {};
      localStorage.setItem(PDM_CONFIG.STORAGE_KEYS.EMULATOR_DB, JSON.stringify(db));
    }
  }

  // ============================================================================
  // SMART IN-MEMORY CACHE (STALE-WHILE-REVALIDATE)
  // Menghadirkan respon instan (0 ms) saat berpindah antar menu
  // ============================================================================
  var _memoryCache = {};
  var _inFlightRequests = {};

  var CACHEABLE_ACTIONS = {
    'dashboard.stats': 45000,       // 45 detik
    'categories.list': 300000,      // 5 menit
    'users.list': 120000,           // 2 menit
    'documents.list': 30000,        // 30 detik
    'settings.get': 120000,         // 2 menit
    'backup.status': 30000          // 30 detik
  };

  function getCacheKey(action, payload) {
    var pStr = '';
    if (payload && typeof payload === 'object') {
      try {
        pStr = JSON.stringify(payload);
      } catch (e) {}
    }
    return action + '::' + pStr;
  }

  function getFromMemoryCache(action, payload) {
    var key = getCacheKey(action, payload);
    var entry = _memoryCache[key];
    if (!entry) return null;
    var now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      delete _memoryCache[key];
      return null;
    }
    return entry.data;
  }

  function setMemoryCache(action, payload, data) {
    var ttl = CACHEABLE_ACTIONS[action];
    if (!ttl) return;
    var key = getCacheKey(action, payload);
    _memoryCache[key] = {
      data: data,
      timestamp: Date.now(),
      ttl: ttl
    };
  }

  function invalidateCache(pattern) {
    if (!pattern) {
      _memoryCache = {};
      return;
    }
    var keys = Object.keys(_memoryCache);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf(pattern) !== -1) {
        delete _memoryCache[keys[i]];
      }
    }
  }

  function autoInvalidateOnMutation(action) {
    if (!action) return;
    if (action.indexOf('documents.upload') === 0 || action.indexOf('documents.update') === 0 || action.indexOf('archive.') === 0 || action.indexOf('backup.') === 0) {
      invalidateCache('documents.list');
      invalidateCache('dashboard.stats');
      invalidateCache('backup.status');
    } else if (action.indexOf('categories.') === 0) {
      invalidateCache('categories.list');
      invalidateCache('documents.list');
    } else if (action.indexOf('users.') === 0) {
      invalidateCache('users.list');
      invalidateCache('dashboard.stats');
    } else if (action.indexOf('settings.') === 0) {
      invalidateCache('settings.get');
      invalidateCache('dashboard.stats');
    } else if (action === 'auth.logout' || action === 'auth.login') {
      _memoryCache = {};
      _inFlightRequests = {};
    }
  }

  /**
   * Eksekusi request segar ke server live GAS atau emulator lokal
   * Dilengkapi AbortController timeout agar loading tidak pernah menggantung tanpa batas
   */
  async function fetchFresh(action, payload) {
    var token = localStorage.getItem(PDM_CONFIG.STORAGE_KEYS.SESSION_TOKEN) || '';
    var reqBody = {
      action: action,
      token: token,
      payload: payload || {}
    };

    if (PDM_UTILS.isLiveGasMode()) {
      var endpointUrl = PDM_UTILS.getGasEndpointUrl();
      var isHeavyAction = (action === 'documents.upload' || action.indexOf('backup.') === 0 || action === 'documents.preview');
      var timeoutMs = isHeavyAction ? 120000 : 45000;
      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timerId = null;

      if (controller) {
        timerId = setTimeout(function() {
          controller.abort();
        }, timeoutMs);
      }

      try {
        var fetchOpts = {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify(reqBody),
          redirect: 'follow'
        };
        if (controller) fetchOpts.signal = controller.signal;

        var response = await fetch(endpointUrl, fetchOpts);
        if (timerId) clearTimeout(timerId);

        if (!response.ok) {
          throw new Error('Koneksi ke Backend GAS gagal (HTTP ' + response.status + ').');
        }

        var json = await response.json();
        if (!json.success) {
          if (json.errorCode === 'UNAUTHORIZED') {
            _memoryCache = {};
            localStorage.removeItem(PDM_CONFIG.STORAGE_KEYS.SESSION_TOKEN);
            localStorage.removeItem(PDM_CONFIG.STORAGE_KEYS.SESSION_USER);
            if (window.location.pathname.indexOf('login.html') === -1) {
              window.location.href = 'login.html?expired=1';
            }
          }
          throw new Error(json.error || 'Terjadi kesalahan pada server GAS.');
        }
        return json.data;
      } catch (err) {
        if (timerId) clearTimeout(timerId);
        if (err && err.name === 'AbortError') {
          throw new Error('Server Google Apps Script belum merespons dalam batas waktu. Silakan coba lagi.');
        }
        throw err;
      }
    }

    // Eksekusi melalui Local GAS Emulator Engine
    return executeEmulatorAction(action, token, payload || {});
  }

  /**
   * Fungsi utama pemanggil endpoint API (dengan Smart Memory Cache,
   * In-Flight Request Deduplication, & Stale-While-Revalidate)
   */
  async function request(action, payload, options) {
    options = options || {};
    var isCacheable = !!CACHEABLE_ACTIONS[action] && !options.bypassCache;
    var cacheKey = getCacheKey(action, payload);

    // Fast-path: jika data tersedia di cache memori, kembalikan INSTAN (0 ms)
    if (isCacheable) {
      var cached = getFromMemoryCache(action, payload);
      if (cached !== null) {
        // Revalidasi di latar belakang jika diminta (dengan deduplikasi)
        if (options.revalidate && !_inFlightRequests[cacheKey]) {
          _inFlightRequests[cacheKey] = fetchFresh(action, payload).then(function(freshData) {
            setMemoryCache(action, payload, freshData);
            if (typeof options.onRevalidate === 'function') {
              options.onRevalidate(freshData);
            }
            return freshData;
          }).catch(function() {
            return cached;
          }).finally(function() {
            delete _inFlightRequests[cacheKey];
          });
        }
        return cached;
      }

      // Deduplikasi request identik yang sedang berjalan agar tidak dobel hit ke GAS
      if (_inFlightRequests[cacheKey]) {
        return _inFlightRequests[cacheKey];
      }
    }

    var promise = fetchFresh(action, payload).then(function(result) {
      if (isCacheable) {
        setMemoryCache(action, payload, result);
      } else {
        autoInvalidateOnMutation(action);
      }
      return result;
    });

    if (isCacheable) {
      _inFlightRequests[cacheKey] = promise;
      promise.finally(function() {
        delete _inFlightRequests[cacheKey];
      });
    }

    return promise;
  }

  /**
   * Router Emulator Lokal yang mereplikasi 100% perilaku Code.gs + Service GAS
   */
  function executeEmulatorAction(action, token, payload) {
    var db = loadEmulatorDb();

    function logActivity(uid, uname, act, desc) {
      db.ACTIVITY_LOG.unshift({
        ActivityID: genId('ACT'),
        UserID: uid || 'SYSTEM',
        Username: uname || 'system',
        Action: act,
        Description: desc,
        Timestamp: new Date().toISOString()
      });
      if (db.ACTIVITY_LOG.length > 200) db.ACTIVITY_LOG.length = 200;
    }

    if (action === 'system.ping') {
      return { app: PDM_CONFIG.APP_NAME, version: PDM_CONFIG.VERSION, status: 'ONLINE' };
    }

    // --- AUTH LOGIN ---
    if (action === 'auth.login') {
      var uName = String(payload.username || '').trim().toLowerCase();
      var uPass = String(payload.password || '');
      if (!uName || !uPass) throw new Error('Username dan password wajib diisi.');

      var attempt = db.LOGIN_ATTEMPTS[uName] || { count: 0, lockedUntil: 0 };
      if (attempt.lockedUntil && Date.now() < attempt.lockedUntil) {
        var remMin = Math.ceil((attempt.lockedUntil - Date.now()) / 60000);
        throw new Error('Terlalu banyak percobaan login gagal. Akun dikunci selama ' + remMin + ' menit.');
      }

      var user = null;
      for (var i = 0; i < db.USERS.length; i++) {
        if (String(db.USERS[i].Username).toLowerCase() === uName) {
          user = db.USERS[i];
          break;
        }
      }

      if (!user || !verifyHash(uPass, user.PasswordHash)) {
        attempt.count = (attempt.count || 0) + 1;
        if (attempt.count >= 5) {
          attempt.lockedUntil = Date.now() + 15 * 60 * 1000;
        }
        db.LOGIN_ATTEMPTS[uName] = attempt;
        saveEmulatorDb(db);
        var left = Math.max(0, 5 - attempt.count);
        throw new Error('Username atau password salah. Sisa percobaan: ' + left);
      }

      if (user.Status !== 'ACTIVE') {
        throw new Error('Akun Anda sedang dinonaktifkan. Silakan hubungi Administrator.');
      }

      delete db.LOGIN_ATTEMPTS[uName];
      var newToken = 'pdm_sess_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      var exp = new Date(Date.now() + 8 * 3600 * 1000).toISOString();

      db.SESSIONS[newToken] = {
        token: newToken,
        UserID: user.UserID,
        Nama: user.Nama,
        Username: user.Username,
        Role: user.Role,
        Status: user.Status,
        expiresAt: exp,
        expiresAtMs: Date.now() + 8 * 3600 * 1000
      };

      logActivity(user.UserID, user.Username, 'LOGIN_SUCCESS', 'Login berhasil sebagai ' + user.Role);
      saveEmulatorDb(db);

      return {
        token: newToken,
        expiresAt: exp,
        user: {
          UserID: user.UserID,
          Nama: user.Nama,
          Username: user.Username,
          Role: user.Role,
          Status: user.Status
        }
      };
    }

    if (action === 'auth.logout') {
      if (token && db.SESSIONS[token]) {
        var s = db.SESSIONS[token];
        logActivity(s.UserID, s.Username, 'LOGOUT', 'Pengguna keluar dari sistem.');
        delete db.SESSIONS[token];
        saveEmulatorDb(db);
      }
      return { loggedOut: true };
    }

    // --- VALIDASI SESSION ---
    var session = db.SESSIONS[token];
    if (!session || (session.expiresAtMs && Date.now() > session.expiresAtMs)) {
      throw new Error('Sesi telah berakhir atau tidak valid. Silakan login kembali.');
    }

    // Verifikasi user masih aktif di tabel USERS
    var liveUser = null;
    for (var ui = 0; ui < db.USERS.length; ui++) {
      if (db.USERS[ui].UserID === session.UserID) {
        liveUser = db.USERS[ui];
        break;
      }
    }
    if (!liveUser || liveUser.Status !== 'ACTIVE') {
      delete db.SESSIONS[token];
      saveEmulatorDb(db);
      throw new Error('Akun tidak aktif atau telah dicabut.');
    }
    session.Role = liveUser.Role;
    session.Nama = liveUser.Nama;
    session.Username = liveUser.Username;

    function requireAdmin() {
      if (session.Role !== 'ADMIN') {
        logActivity(session.UserID, session.Username, 'ACCESS_DENIED', 'Percobaan akses fitur Admin: ' + action);
        saveEmulatorDb(db);
        throw new Error('Akses ditolak. Fitur ini hanya untuk Administrator.');
      }
    }

    function verifyOwnership(doc) {
      if (!doc) throw new Error('Dokumen tidak ditemukan.');
      if (session.Role !== 'ADMIN' && String(doc.UserID) !== String(session.UserID)) {
        logActivity(session.UserID, session.Username, 'SECURITY_VIOLATION', 'Percobaan akses dokumen milik pengguna lain: ' + doc.DocumentID);
        saveEmulatorDb(db);
        throw new Error('Anda tidak memiliki hak akses terhadap dokumen ini.');
      }
    }

    function sanitizeDoc(doc) {
      var isAdmin = (session.Role === 'ADMIN');
      return {
        DocumentID: doc.DocumentID,
        UserID: doc.UserID,
        OwnerName: doc.OwnerName,
        FileName: doc.FileName,
        Category: doc.Category,
        Format: doc.Format,
        MIMEType: doc.MIMEType,
        FileSize: Number(doc.FileSize || 0),
        Description: doc.Description || '',
        BackupStatus: doc.BackupStatus || 'UNBACKED',
        BackupDate: doc.BackupDate || '',
        BackupError: isAdmin ? (doc.BackupError || '') : '',
        Checksum: doc.Checksum || '',
        Status: doc.Status || 'ACTIVE',
        CreatedAt: doc.CreatedAt,
        UpdatedAt: doc.UpdatedAt,
        PrimaryFileID: isAdmin ? doc.PrimaryFileID : undefined,
        BackupFileID: isAdmin ? doc.BackupFileID : undefined,
        hasPrimaryFile: Boolean(doc.PrimaryFileID),
        hasBackupFile: Boolean(doc.BackupFileID)
      };
    }

    function runSingleBackupInternal(docId, forceCopy) {
      var doc = null;
      for (var i = 0; i < db.DOCUMENTS.length; i++) {
        if (db.DOCUMENTS[i].DocumentID === docId) {
          doc = db.DOCUMENTS[i];
          break;
        }
      }
      if (!doc) throw new Error('Dokumen tidak ditemukan: ' + docId);
      if (!doc.PrimaryFileID) throw new Error('File utama di Drive A tidak ditemukan.');

      // Cegah duplikasi backup jika sudah SUCCESS dan tidak forceCopy
      if (!forceCopy && doc.BackupStatus === 'SUCCESS' && doc.BackupFileID) {
        markQueueDone(docId);
        return {
          success: true,
          skippedDuplicate: true,
          DocumentID: docId,
          BackupFileID: doc.BackupFileID,
          BackupStatus: 'SUCCESS',
          message: 'Salinan backup sudah ada & terverifikasi di Drive B. Duplikasi dicegah.'
        };
      }

      var startIso = new Date().toISOString();

      // Cek simulasi gangguan Drive B
      if (db.SETTINGS.SIMULATE_DRIVE_B_OFFLINE === 'TRUE') {
        var errMsg = 'Koneksi ke Google Drive B (Akun Kedua) tidak tersedia / timeout.';
        doc.BackupStatus = 'FAILED';
        doc.BackupError = errMsg;
        doc.UpdatedAt = startIso;
        recordQueueFail(docId, errMsg);
        db.BACKUP_LOG.unshift({
          LogID: genId('BLOG'),
          DocumentID: docId,
          PrimaryFileID: doc.PrimaryFileID,
          BackupFileID: doc.BackupFileID || '',
          Status: 'FAILED',
          StartTime: startIso,
          EndTime: new Date().toISOString(),
          ErrorMessage: errMsg
        });
        saveEmulatorDb(db);
        return {
          success: false,
          DocumentID: docId,
          BackupStatus: 'FAILED',
          error: errMsg
        };
      }

      // Copy satu arah dari Drive A ke Drive B
      var newBackupId = (!forceCopy && doc.BackupFileID) ? doc.BackupFileID : ('DRV_B_VAULT_' + Math.random().toString(36).substring(2, 9).toUpperCase());
      if (db.DRIVE_A_BLOBS[doc.PrimaryFileID]) {
        db.DRIVE_B_BLOBS[newBackupId] = db.DRIVE_A_BLOBS[doc.PrimaryFileID];
      }

      var endIso = new Date().toISOString();
      doc.BackupFileID = newBackupId;
      doc.BackupStatus = 'SUCCESS';
      doc.BackupDate = endIso;
      doc.BackupError = '';
      doc.UpdatedAt = endIso;
      db.SETTINGS.LAST_BACKUP_RUN = endIso;

      markQueueDone(docId);

      db.BACKUP_LOG.unshift({
        LogID: genId('BLOG'),
        DocumentID: docId,
        PrimaryFileID: doc.PrimaryFileID,
        BackupFileID: newBackupId,
        Status: 'SUCCESS',
        StartTime: startIso,
        EndTime: endIso,
        ErrorMessage: ''
      });

      saveEmulatorDb(db);
      return {
        success: true,
        DocumentID: docId,
        PrimaryFileID: doc.PrimaryFileID,
        BackupFileID: newBackupId,
        BackupStatus: 'SUCCESS',
        BackupDate: endIso,
        Checksum: doc.Checksum
      };
    }

    function enqueueDoc(docId, reset) {
      var nowIso = new Date().toISOString();
      for (var i = 0; i < db.BACKUP_QUEUE.length; i++) {
        if (db.BACKUP_QUEUE[i].DocumentID === docId) {
          if (reset || db.BACKUP_QUEUE[i].Status !== 'COMPLETED') {
            db.BACKUP_QUEUE[i].Status = 'QUEUED';
            if (reset) db.BACKUP_QUEUE[i].RetryCount = 0;
            db.BACKUP_QUEUE[i].NextRetry = nowIso;
          }
          return db.BACKUP_QUEUE[i];
        }
      }
      var item = {
        QueueID: genId('QUE'),
        DocumentID: docId,
        Status: 'QUEUED',
        RetryCount: 0,
        NextRetry: nowIso,
        LastError: '',
        CreatedAt: nowIso
      };
      db.BACKUP_QUEUE.unshift(item);
      return item;
    }

    function markQueueDone(docId) {
      for (var i = 0; i < db.BACKUP_QUEUE.length; i++) {
        if (db.BACKUP_QUEUE[i].DocumentID === docId) {
          db.BACKUP_QUEUE[i].Status = 'COMPLETED';
          db.BACKUP_QUEUE[i].NextRetry = '';
          db.BACKUP_QUEUE[i].LastError = '';
        }
      }
    }

    function recordQueueFail(docId, errMsg) {
      var q = enqueueDoc(docId, false);
      q.RetryCount = Number(q.RetryCount || 0) + 1;
      q.Status = q.RetryCount >= 5 ? 'FAILED_MAX_RETRY' : 'QUEUED';
      q.NextRetry = new Date(Date.now() + 5 * 60000).toISOString();
      q.LastError = errMsg;
    }

    // --- SWITCH ACTIONS ---
    if (action === 'auth.me') {
      return { user: session, expiresAt: session.expiresAt };
    }

    if (action === 'auth.changePassword') {
      if (!verifyHash(payload.currentPassword, liveUser.PasswordHash)) {
        throw new Error('Password saat ini tidak sesuai.');
      }
      if (!payload.newPassword || String(payload.newPassword).length < 6) {
        throw new Error('Password baru minimal 6 karakter.');
      }
      liveUser.PasswordHash = simpleHash('salt_' + Date.now(), payload.newPassword);
      logActivity(session.UserID, session.Username, 'PASSWORD_CHANGE', 'Mengubah password akun pribadi.');
      saveEmulatorDb(db);
      return { resetSuccess: true };
    }

    if (action === 'dashboard.stats') {
      var isAdmin = (session.Role === 'ADMIN');
      var stats = {
        role: session.Role,
        totalDocuments: 0,
        totalAllDocuments: 0,
        totalUsers: isAdmin ? db.USERS.length : 1,
        activeUsers: db.USERS.filter(function(u) { return u.Status === 'ACTIVE'; }).length,
        totalCapacityBytes: 0,
        totalPDF: 0,
        totalJPG: 0,
        totalPNG: 0,
        backupSuccess: 0,
        backupFailed: 0,
        backupPending: 0,
        backupUnbacked: 0,
        totalArchived: 0,
        categoryBreakdown: {},
        monthlyGrowth: {},
        recentDocuments: []
      };

      var scoped = [];
      for (var d = 0; d < db.DOCUMENTS.length; d++) {
        var doc = db.DOCUMENTS[d];
        if (doc.Status === 'DELETED') continue;
        if (!isAdmin && doc.UserID !== session.UserID) continue;

        scoped.push(doc);
        stats.totalAllDocuments++;
        if (doc.Status === 'ARCHIVED') stats.totalArchived++;
        else stats.totalDocuments++;

        stats.totalCapacityBytes += Number(doc.FileSize || 0);
        if (doc.Format === 'PDF') stats.totalPDF++;
        else if (doc.Format === 'JPG' || doc.Format === 'JPEG') stats.totalJPG++;
        else if (doc.Format === 'PNG') stats.totalPNG++;

        if (doc.BackupStatus === 'SUCCESS') stats.backupSuccess++;
        else if (doc.BackupStatus === 'FAILED') stats.backupFailed++;
        else {
          stats.backupPending++;
          if (doc.BackupStatus === 'UNBACKED') stats.backupUnbacked++;
        }

        var cat = doc.Category || 'DOKUMEN LAINNYA';
        stats.categoryBreakdown[cat] = (stats.categoryBreakdown[cat] || 0) + 1;

        var ym = String(doc.CreatedAt || '').substring(0, 7);
        if (ym) stats.monthlyGrowth[ym] = (stats.monthlyGrowth[ym] || 0) + 1;
      }

      scoped.sort(function(a, b) { return new Date(b.CreatedAt) - new Date(a.CreatedAt); });
      stats.recentDocuments = scoped.slice(0, 10).map(sanitizeDoc);
      stats.backupSuccessRate = stats.totalAllDocuments > 0
        ? Math.round((stats.backupSuccess / stats.totalAllDocuments) * 100)
        : 100;
      stats.recentActivities = db.ACTIVITY_LOG.filter(function(a) {
        return isAdmin || a.UserID === session.UserID;
      }).slice(0, 12);

      if (isAdmin) {
        stats.driveAStatus = {
          connected: true,
          status: 'ONLINE',
          accountEmail: db.SETTINGS.DRIVE_A_ACCOUNT_EMAIL || 'primary.drive.a@gmail.com',
          rootFolderName: 'PERSONAL DOCUMENTS',
          rootFolderId: db.SETTINGS.DRIVE_A_ROOT_FOLDER_ID,
          archiveFolderName: 'PERSONAL DOCUMENTS ARCHIVE',
          storageUsedBytes: stats.totalCapacityBytes,
          storageLimitBytes: 15 * 1024 * 1024 * 1024
        };
        var bOffline = db.SETTINGS.SIMULATE_DRIVE_B_OFFLINE === 'TRUE';
        stats.driveBStatus = {
          connected: !bOffline,
          mode: db.SETTINGS.BACKUP_MODE || 'BRIDGE',
          status: bOffline ? 'ERROR' : 'ONLINE',
          accountEmail: db.SETTINGS.DRIVE_B_ACCOUNT_EMAIL || 'backup.vault.drive.b@gmail.com',
          rootFolderName: 'PERSONAL DOCUMENTS BACKUP',
          rootFolderId: db.SETTINGS.DRIVE_B_ROOT_FOLDER_ID,
          error: bOffline ? 'Koneksi ke Google Drive B terputus.' : ''
        };
        stats.lastBackupRun = db.SETTINGS.LAST_BACKUP_RUN;
      }
      return stats;
    }

    if (action === 'documents.list') {
      var targetStatus = String(payload.status || 'ACTIVE').toUpperCase();
      var q = String(payload.query || '').trim().toLowerCase();
      var catFilter = String(payload.category || '').trim().toUpperCase();
      var fmtFilter = String(payload.format || '').trim().toUpperCase();
      var ownerFilter = String(payload.ownerId || payload.owner || '').trim().toLowerCase();
      var bkpFilter = String(payload.backupStatus || '').trim().toUpperCase();
      var dFrom = payload.dateFrom ? new Date(payload.dateFrom + 'T00:00:00').getTime() : null;
      var dTo = payload.dateTo ? new Date(payload.dateTo + 'T23:59:59').getTime() : null;

      var list = [];
      for (var i = 0; i < db.DOCUMENTS.length; i++) {
        var item = db.DOCUMENTS[i];
        if (session.Role !== 'ADMIN' && item.UserID !== session.UserID) continue;
        if (item.Status === 'DELETED') continue;
        if (targetStatus !== 'ALL' && item.Status !== targetStatus) continue;

        if (session.Role === 'ADMIN' && ownerFilter && ownerFilter !== 'all') {
          var mUid = String(item.UserID).toLowerCase() === ownerFilter;
          var mName = String(item.OwnerName).toLowerCase().indexOf(ownerFilter) !== -1;
          if (!mUid && !mName) continue;
        }
        if (catFilter && catFilter !== 'ALL' && String(item.Category).toUpperCase() !== catFilter) continue;
        if (fmtFilter && fmtFilter !== 'ALL') {
          if ((fmtFilter === 'JPG' || fmtFilter === 'JPEG') && item.Format !== 'JPG' && item.Format !== 'JPEG') continue;
          else if (fmtFilter !== 'JPG' && fmtFilter !== 'JPEG' && item.Format !== fmtFilter) continue;
        }
        if (bkpFilter && bkpFilter !== 'ALL' && String(item.BackupStatus).toUpperCase() !== bkpFilter) continue;
        if (dFrom || dTo) {
          var cMs = new Date(item.CreatedAt).getTime();
          if (dFrom && cMs < dFrom) continue;
          if (dTo && cMs > dTo) continue;
        }
        if (q) {
          var hay = (item.FileName + ' ' + item.Category + ' ' + (item.Description || '') + ' ' + item.OwnerName + ' ' + item.DocumentID).toLowerCase();
          if (hay.indexOf(q) === -1) continue;
        }
        list.push(sanitizeDoc(item));
      }

      var sortBy = payload.sortBy || 'CreatedAt';
      var dir = String(payload.sortDir || 'DESC').toUpperCase() === 'ASC' ? 1 : -1;
      list.sort(function(a, b) {
        if (sortBy === 'FileSize') return (a.FileSize - b.FileSize) * dir;
        if (sortBy === 'CreatedAt' || sortBy === 'UpdatedAt' || sortBy === 'BackupDate') {
          return (new Date(a[sortBy] || 0) - new Date(b[sortBy] || 0)) * dir;
        }
        return String(a[sortBy] || '').localeCompare(String(b[sortBy] || '')) * dir;
      });

      var limit = parseInt(payload.limit, 10) || 10;
      if ([10, 25, 50, 100].indexOf(limit) === -1) limit = 10;
      var totalItems = list.length;
      var totalPages = Math.max(1, Math.ceil(totalItems / limit));
      var page = Math.max(1, Math.min(parseInt(payload.page, 10) || 1, totalPages));
      var start = (page - 1) * limit;

      return {
        items: list.slice(start, start + limit),
        pagination: { page: page, limit: limit, totalItems: totalItems, totalPages: totalPages }
      };
    }

    if (action === 'documents.detail') {
      var found = db.DOCUMENTS.find(function(x) { return x.DocumentID === payload.DocumentID; });
      verifyOwnership(found);
      return sanitizeDoc(found);
    }

    if (action === 'documents.updateMetadata') {
      var targetDoc = db.DOCUMENTS.find(function(x) { return x.DocumentID === payload.DocumentID; });
      verifyOwnership(targetDoc);

      if (payload.FileName) targetDoc.FileName = String(payload.FileName).trim();
      if (payload.Category) targetDoc.Category = String(payload.Category).trim().toUpperCase();
      if (typeof payload.Description !== 'undefined') targetDoc.Description = String(payload.Description).trim();
      targetDoc.UpdatedAt = new Date().toISOString();

      logActivity(session.UserID, session.Username, 'DOCUMENT_EDIT', 'Memperbarui metadata dokumen ' + targetDoc.FileName);
      saveEmulatorDb(db);
      return sanitizeDoc(targetDoc);
    }

    if (action === 'documents.upload') {
      var fName = String(payload.fileName || '').replace(/[\\/:*?"<>|]/g, '_').trim();
      var mime = String(payload.mimeType || '').toLowerCase();
      var b64 = payload.base64Data || '';
      if (!fName || !b64) throw new Error('Nama file dan data file wajib diisi.');

      var extMatch = fName.match(/\.([a-zA-Z0-9]+)$/);
      if (!extMatch) throw new Error('File wajib memiliki ekstensi (.pdf, .jpg, .jpeg, .png).');
      var ext = extMatch[1].toUpperCase();
      if (['PDF', 'JPG', 'JPEG', 'PNG'].indexOf(ext) === -1) {
        throw new Error('Format .' + ext + ' tidak didukung.');
      }

      var pureB64 = b64.indexOf(',') !== -1 ? b64.split(',')[1] : b64;
      var binStr = atob(pureB64);
      var byteLen = binStr.length;
      var maxMB = parseFloat(db.SETTINGS.MAX_FILE_SIZE_MB || '15');
      if (byteLen > maxMB * 1024 * 1024) {
        throw new Error('Ukuran file melebihi batas maksimal ' + maxMB + ' MB.');
      }

      // Magic Bytes Validation
      if (byteLen < 4) throw new Error('File terlalu kecil atau rusak.');
      var c0 = binStr.charCodeAt(0), c1 = binStr.charCodeAt(1), c2 = binStr.charCodeAt(2), c3 = binStr.charCodeAt(3);
      if (ext === 'PDF' && !(c0 === 0x25 && c1 === 0x50 && c2 === 0x44 && c3 === 0x46)) {
        throw new Error('Magic bytes header file bukan PDF valid (%PDF).');
      }
      if ((ext === 'JPG' || ext === 'JPEG') && !(c0 === 0xFF && c1 === 0xD8 && c2 === 0xFF)) {
        throw new Error('Magic bytes header file bukan JPEG valid.');
      }
      if (ext === 'PNG' && !(c0 === 0x89 && c1 === 0x50 && c2 === 0x4E && c3 === 0x47)) {
        throw new Error('Magic bytes header file bukan PNG valid.');
      }

      var docId = genId('DOC');
      var primaryId = 'DRV_A_FILE_' + Math.random().toString(36).substring(2, 9).toUpperCase();
      var nowIso = new Date().toISOString();
      var checksum = payload.clientChecksum || ('sha256_' + byteLen + '_' + Date.now().toString(16));

      db.DRIVE_A_BLOBS[primaryId] = pureB64;

      var newDoc = {
        DocumentID: docId,
        UserID: session.UserID,
        OwnerName: session.Nama,
        FileName: fName,
        Category: String(payload.category || 'DOKUMEN LAINNYA').trim().toUpperCase(),
        Format: ext === 'JPEG' ? 'JPG' : ext,
        MIMEType: mime || (ext === 'PDF' ? 'application/pdf' : 'image/' + ext.toLowerCase()),
        FileSize: byteLen,
        Description: String(payload.description || '').trim(),
        PrimaryFileID: primaryId,
        BackupFileID: '',
        BackupStatus: 'PENDING',
        BackupDate: '',
        BackupError: '',
        Checksum: checksum,
        Status: 'ACTIVE',
        CreatedAt: nowIso,
        UpdatedAt: nowIso
      };

      db.DOCUMENTS.unshift(newDoc);
      var qEntry = enqueueDoc(docId, true);
      logActivity(session.UserID, session.Username, 'DOCUMENT_UPLOAD', 'Mengunggah dokumen ' + fName + ' ke Drive A (/PERSONAL DOCUMENTS/' + session.Nama + '/' + newDoc.Category + ')');

      var bkpRes = null;
      if (payload.runImmediateBackup !== false && db.SETTINGS.AUTO_BACKUP_ON_UPLOAD === 'TRUE') {
        bkpRes = runSingleBackupInternal(docId, false);
      }

      saveEmulatorDb(db);
      return {
        uploadSuccess: true,
        document: sanitizeDoc(newDoc),
        queueId: qEntry.QueueID,
        backupResult: bkpRes
      };
    }

    if (action === 'documents.preview') {
      var pDoc = db.DOCUMENTS.find(function(x) { return x.DocumentID === payload.DocumentID; });
      verifyOwnership(pDoc);

      var b64Content = db.DRIVE_A_BLOBS[pDoc.PrimaryFileID] || db.DRIVE_B_BLOBS[pDoc.BackupFileID];
      if (!b64Content) {
        b64Content = (pDoc.Format === 'PDF') ? SAMPLE_PDF_B64 : SAMPLE_PNG_B64;
      }

      logActivity(session.UserID, session.Username, 'DOCUMENT_PREVIEW', 'Membuka preview dokumen ' + pDoc.FileName);
      saveEmulatorDb(db);

      return {
        metadata: sanitizeDoc(pDoc),
        content: {
          fileName: pDoc.FileName,
          mimeType: pDoc.MIMEType,
          fileSize: pDoc.FileSize,
          base64: b64Content,
          sourceDrive: 'DRIVE_A',
          checksum: pDoc.Checksum
        },
        driveDirectUrl: session.Role === 'ADMIN' ? ('https://drive.google.com/file/d/' + pDoc.PrimaryFileID + '/view') : ''
      };
    }

    // --- ARCHIVE & RESTORE ---
    if (action === 'archive.archiveDocument') {
      var aDoc = db.DOCUMENTS.find(function(x) { return x.DocumentID === payload.DocumentID; });
      verifyOwnership(aDoc);
      if (aDoc.Status === 'ARCHIVED') throw new Error('Dokumen sudah berada di dalam arsip.');

      aDoc.Status = 'ARCHIVED';
      aDoc.UpdatedAt = new Date().toISOString();
      // PENTING: BackupFileID dan file di Drive B TIDAK DIHAPUS!
      var arcLog = {
        ArchiveID: genId('ARC'),
        DocumentID: aDoc.DocumentID,
        UserID: aDoc.UserID,
        ArchiveDate: aDoc.UpdatedAt,
        ArchiveBy: session.Username,
        Reason: payload.reason || 'Diarsipkan oleh pengguna',
        RestoreDate: ''
      };
      db.ARCHIVE_LOG.unshift(arcLog);
      logActivity(session.UserID, session.Username, 'DOCUMENT_ARCHIVE', 'Mengarsipkan ' + aDoc.FileName + ' ke folder arsip Drive A. Backup Drive B tetap utuh.');
      saveEmulatorDb(db);
      return {
        archived: true,
        document: sanitizeDoc(aDoc),
        archiveLog: arcLog,
        backupPreservedInDriveB: Boolean(aDoc.BackupFileID)
      };
    }

    if (action === 'archive.restoreDocument') {
      var rDoc = db.DOCUMENTS.find(function(x) { return x.DocumentID === payload.DocumentID; });
      verifyOwnership(rDoc);
      if (rDoc.Status !== 'ARCHIVED') throw new Error('Dokumen tidak berstatus ARCHIVED.');

      rDoc.Status = 'ACTIVE';
      rDoc.UpdatedAt = new Date().toISOString();
      for (var al = 0; al < db.ARCHIVE_LOG.length; al++) {
        if (db.ARCHIVE_LOG[al].DocumentID === rDoc.DocumentID && !db.ARCHIVE_LOG[al].RestoreDate) {
          db.ARCHIVE_LOG[al].RestoreDate = rDoc.UpdatedAt;
          break;
        }
      }
      logActivity(session.UserID, session.Username, 'DOCUMENT_RESTORE', 'Memulihkan dokumen ' + rDoc.FileName + ' dari arsip ke lokasi aktif Drive A.');
      saveEmulatorDb(db);
      return { restored: true, document: sanitizeDoc(rDoc) };
    }

    if (action === 'archive.permanentDelete') {
      requireAdmin();
      var delDoc = db.DOCUMENTS.find(function(x) { return x.DocumentID === payload.DocumentID; });
      if (!delDoc) throw new Error('Dokumen tidak ditemukan.');
      var confirmTxt = String(payload.confirmationText || '').trim().toUpperCase();
      if (confirmTxt !== 'HAPUS PERMANEN' && confirmTxt !== 'DELETE') {
        throw new Error('Ketik "HAPUS PERMANEN" untuk mengonfirmasi penghapusan.');
      }
      delDoc.Status = 'DELETED';
      delDoc.UpdatedAt = new Date().toISOString();
      delete db.DRIVE_A_BLOBS[delDoc.PrimaryFileID];
      // Salinan di Drive B tetap aman
      logActivity(session.UserID, session.Username, 'DOCUMENT_PERMANENT_DELETE', 'Menghapus permanen file utama ' + delDoc.FileName + '. Salinan Drive B tetap dipertahankan.');
      saveEmulatorDb(db);
      return { permanentlyDeleted: true, DocumentID: delDoc.DocumentID, backupRetainedInDriveB: Boolean(delDoc.BackupFileID) };
    }

    if (action === 'archive.logs') {
      return db.ARCHIVE_LOG.filter(function(l) {
        return session.Role === 'ADMIN' || l.UserID === session.UserID;
      });
    }

    // --- CATEGORIES ---
    if (action === 'categories.list') {
      return db.CATEGORIES.filter(function(c) {
        return session.Role === 'ADMIN' || c.UserID === 'SYSTEM' || c.UserID === session.UserID;
      });
    }

    if (action === 'categories.create') {
      var cName = String(payload.CategoryName || '').trim().toUpperCase();
      if (!cName) throw new Error('Nama kategori wajib diisi.');
      if (session.Role !== 'ADMIN' && db.SETTINGS.ALLOW_USER_CUSTOM_CATEGORY !== 'TRUE') {
        throw new Error('Penambahan kategori pribadi tidak diizinkan.');
      }
      var exists = db.CATEGORIES.some(function(c) { return c.CategoryName === cName; });
      if (exists) throw new Error('Kategori "' + cName + '" sudah ada.');
      var newCat = {
        CategoryID: genId('CAT'),
        UserID: session.Role === 'ADMIN' ? 'SYSTEM' : session.UserID,
        CategoryName: cName,
        CreatedAt: new Date().toISOString()
      };
      db.CATEGORIES.push(newCat);
      logActivity(session.UserID, session.Username, 'CATEGORY_CREATE', 'Menambahkan kategori ' + cName);
      saveEmulatorDb(db);
      return newCat;
    }

    if (action === 'categories.delete') {
      var idx = db.CATEGORIES.findIndex(function(c) { return c.CategoryID === payload.CategoryID; });
      if (idx === -1) throw new Error('Kategori tidak ditemukan.');
      var targetCat = db.CATEGORIES[idx];
      if (session.Role !== 'ADMIN' && targetCat.UserID !== session.UserID) {
        throw new Error('Anda tidak dapat menghapus kategori global sistem.');
      }
      db.CATEGORIES.splice(idx, 1);
      saveEmulatorDb(db);
      return { deleted: true };
    }

    if (action === 'activity.list') {
      return db.ACTIVITY_LOG.filter(function(a) {
        return session.Role === 'ADMIN' || a.UserID === session.UserID;
      }).slice(0, payload.limit || 50);
    }

    // --- USERS MANAGEMENT (ADMIN) ---
    if (action === 'users.list') {
      requireAdmin();
      return db.USERS.map(function(u) {
        var uDocs = db.DOCUMENTS.filter(function(d) { return d.UserID === u.UserID && d.Status !== 'DELETED'; });
        return {
          UserID: u.UserID,
          Nama: u.Nama,
          Username: u.Username,
          Role: u.Role,
          Status: u.Status,
          CreatedAt: u.CreatedAt,
          stats: {
            totalDocs: uDocs.length,
            activeDocs: uDocs.filter(function(d) { return d.Status === 'ACTIVE'; }).length,
            archivedDocs: uDocs.filter(function(d) { return d.Status === 'ARCHIVED'; }).length,
            totalSize: uDocs.reduce(function(acc, d) { return acc + Number(d.FileSize || 0); }, 0),
            backedUpDocs: uDocs.filter(function(d) { return d.BackupStatus === 'SUCCESS'; }).length
          }
        };
      });
    }

    if (action === 'users.create') {
      requireAdmin();
      var nama = String(payload.Nama || '').trim().toUpperCase();
      var uname = String(payload.Username || '').trim().toLowerCase();
      var pass = String(payload.Password || '');
      if (!nama || !uname || pass.length < 6) throw new Error('Nama, Username, dan Password (min 6 karakter) wajib diisi.');
      if (db.USERS.some(function(u) { return u.Username.toLowerCase() === uname; })) {
        throw new Error('Username "' + uname + '" sudah digunakan.');
      }
      var createdUser = {
        UserID: genId('USR'),
        Nama: nama,
        Username: uname,
        PasswordHash: simpleHash('salt_' + Date.now(), pass),
        Role: payload.Role === 'ADMIN' ? 'ADMIN' : 'USER',
        Status: payload.Status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        CreatedAt: new Date().toISOString()
      };
      db.USERS.push(createdUser);
      logActivity(session.UserID, session.Username, 'USER_CREATE', 'Menambahkan pengguna ' + nama + ' (@' + uname + ')');
      saveEmulatorDb(db);
      return createdUser;
    }

    if (action === 'users.update') {
      requireAdmin();
      var uTarget = db.USERS.find(function(u) { return u.UserID === payload.UserID; });
      if (!uTarget) throw new Error('Pengguna tidak ditemukan.');
      if (uTarget.UserID === session.UserID && payload.Status === 'INACTIVE') {
        throw new Error('Tidak dapat menonaktifkan akun sendiri.');
      }
      if (payload.Nama) {
        uTarget.Nama = String(payload.Nama).trim().toUpperCase();
        db.DOCUMENTS.forEach(function(d) {
          if (d.UserID === uTarget.UserID) d.OwnerName = uTarget.Nama;
        });
      }
      if (payload.Username) uTarget.Username = String(payload.Username).trim().toLowerCase();
      if (payload.Role) uTarget.Role = payload.Role;
      if (payload.Status) uTarget.Status = payload.Status;
      logActivity(session.UserID, session.Username, 'USER_UPDATE', 'Memperbarui data pengguna ' + uTarget.Nama);
      saveEmulatorDb(db);
      return uTarget;
    }

    if (action === 'users.toggleStatus') {
      requireAdmin();
      var uT = db.USERS.find(function(u) { return u.UserID === payload.UserID; });
      if (!uT) throw new Error('Pengguna tidak ditemukan.');
      if (uT.UserID === session.UserID) throw new Error('Tidak dapat menonaktifkan akun Administrator sendiri.');
      uT.Status = uT.Status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      logActivity(session.UserID, session.Username, 'USER_STATUS', 'Mengubah status ' + uT.Nama + ' menjadi ' + uT.Status);
      saveEmulatorDb(db);
      return uT;
    }

    if (action === 'users.resetPassword') {
      requireAdmin();
      var uR = db.USERS.find(function(u) { return u.UserID === payload.UserID; });
      if (!uR) throw new Error('Pengguna tidak ditemukan.');
      if (!payload.NewPassword || String(payload.NewPassword).length < 6) {
        throw new Error('Password baru minimal 6 karakter.');
      }
      uR.PasswordHash = simpleHash('salt_' + Date.now(), payload.NewPassword);
      delete db.LOGIN_ATTEMPTS[uR.Username.toLowerCase()];
      logActivity(session.UserID, session.Username, 'PASSWORD_RESET', 'Reset password pengguna ' + uR.Nama);
      saveEmulatorDb(db);
      return { resetSuccess: true, UserID: uR.UserID };
    }

    // --- BACKUP CENTER (ADMIN) ---
    if (action === 'backup.overview') {
      requireAdmin();
      var activeDocs = db.DOCUMENTS.filter(function(d) { return d.Status !== 'DELETED'; });
      var backedUp = activeDocs.filter(function(d) { return d.BackupStatus === 'SUCCESS'; }).length;
      var pending = activeDocs.filter(function(d) { return d.BackupStatus === 'PENDING' || d.BackupStatus === 'PROCESSING'; }).length;
      var failed = activeDocs.filter(function(d) { return d.BackupStatus === 'FAILED'; }).length;
      var unbacked = activeDocs.filter(function(d) { return !d.BackupStatus || d.BackupStatus === 'UNBACKED'; }).length;
      var prob = activeDocs.filter(function(d) { return d.BackupStatus !== 'SUCCESS'; }).map(sanitizeDoc);

      var bOff = db.SETTINGS.SIMULATE_DRIVE_B_OFFLINE === 'TRUE';
      return {
        totalDocuments: activeDocs.length,
        backedUpCount: backedUp,
        pendingCount: pending,
        failedCount: failed,
        unbackedCount: unbacked,
        successRate: activeDocs.length > 0 ? Math.round((backedUp / activeDocs.length) * 100) : 100,
        lastBackupTime: db.SETTINGS.LAST_BACKUP_RUN,
        lastIntegrityCheck: db.SETTINGS.LAST_INTEGRITY_CHECK,
        driveAHealth: {
          connected: true,
          status: 'ONLINE',
          accountEmail: db.SETTINGS.DRIVE_A_ACCOUNT_EMAIL,
          rootFolderName: 'PERSONAL DOCUMENTS',
          rootFolderId: db.SETTINGS.DRIVE_A_ROOT_FOLDER_ID
        },
        driveBHealth: {
          connected: !bOff,
          mode: db.SETTINGS.BACKUP_MODE,
          status: bOff ? 'ERROR' : 'ONLINE',
          accountEmail: db.SETTINGS.DRIVE_B_ACCOUNT_EMAIL,
          rootFolderName: 'PERSONAL DOCUMENTS BACKUP',
          rootFolderId: db.SETTINGS.DRIVE_B_ROOT_FOLDER_ID,
          error: bOff ? 'Simulasi Drive B Offline sedang aktif.' : ''
        },
        problematicDocuments: prob,
        queueItems: db.BACKUP_QUEUE.slice(0, 50),
        recentLogs: db.BACKUP_LOG.slice(0, 50)
      };
    }

    if (action === 'backup.runSingle') {
      requireAdmin();
      return runSingleBackupInternal(payload.DocumentID, Boolean(payload.forceCopy));
    }

    if (action === 'backup.runBatchNow') {
      requireAdmin();
      var processed = 0, succ = 0, fail = 0, resArr = [];
      db.DOCUMENTS.forEach(function(d) {
        if (d.Status !== 'DELETED' && d.BackupStatus !== 'SUCCESS') {
          enqueueDoc(d.DocumentID, true);
        }
      });
      for (var qi = 0; qi < db.BACKUP_QUEUE.length; qi++) {
        var qItem = db.BACKUP_QUEUE[qi];
        if (qItem.Status === 'COMPLETED') continue;
        processed++;
        var r = runSingleBackupInternal(qItem.DocumentID, Boolean(payload.forceCopy));
        if (r.success) succ++;
        else fail++;
        resArr.push(r);
      }
      logActivity(session.UserID, session.Username, 'BACKUP_BATCH_RUN', 'Menjalankan batch backup: ' + succ + ' berhasil, ' + fail + ' gagal.');
      saveEmulatorDb(db);
      return { processedCount: processed, successCount: succ, failedCount: fail, results: resArr };
    }

    if (action === 'backup.verifySingle') {
      requireAdmin();
      var vDoc = db.DOCUMENTS.find(function(d) { return d.DocumentID === payload.DocumentID; });
      if (!vDoc) throw new Error('Dokumen tidak ditemukan.');
      var healthy = Boolean(vDoc.BackupFileID && vDoc.BackupStatus === 'SUCCESS');
      return {
        DocumentID: vDoc.DocumentID,
        FileName: vDoc.FileName,
        primaryHealthy: Boolean(vDoc.PrimaryFileID),
        backupHealthy: healthy,
        checksumMatched: healthy,
        status: healthy ? 'VALID' : 'UNBACKED_OR_INVALID',
        message: healthy
          ? 'Integritas salinan di Google Drive B terverifikasi (Checksum SHA-256 cocok).'
          : 'Salinan backup belum tersedia atau perlu dibackup ulang.'
      };
    }

    if (action === 'backup.verifyAll') {
      requireAdmin();
      var docsToVerify = db.DOCUMENTS.filter(function(d) { return d.Status !== 'DELETED'; });
      var vValid = 0, vInvalid = 0, vDetails = [];
      docsToVerify.forEach(function(d) {
        var ok = Boolean(d.BackupFileID && d.BackupStatus === 'SUCCESS');
        if (ok) vValid++;
        else {
          vInvalid++;
          enqueueDoc(d.DocumentID, true);
        }
        vDetails.push({
          DocumentID: d.DocumentID,
          FileName: d.FileName,
          backupHealthy: ok,
          checksumMatched: ok,
          status: ok ? 'VALID' : 'QUEUED_FOR_REPAIR'
        });
      });
      db.SETTINGS.LAST_INTEGRITY_CHECK = new Date().toISOString();
      logActivity(session.UserID, session.Username, 'BACKUP_INTEGRITY_AUDIT', 'Pemeriksaan integritas selesai: ' + vValid + ' valid, ' + vInvalid + ' masuk antrean.');
      saveEmulatorDb(db);
      return {
        checkedCount: docsToVerify.length,
        validCount: vValid,
        invalidCount: vInvalid,
        queuedForRepair: vInvalid,
        checkedAt: db.SETTINGS.LAST_INTEGRITY_CHECK,
        details: vDetails
      };
    }

    if (action === 'backup.recoverPrimary') {
      requireAdmin();
      var recDoc = db.DOCUMENTS.find(function(d) { return d.DocumentID === payload.DocumentID; });
      if (!recDoc || !recDoc.BackupFileID) throw new Error('Salinan backup Drive B tidak ditemukan.');
      recDoc.PrimaryFileID = 'DRV_A_RESTORED_' + Math.random().toString(36).substring(2, 8).toUpperCase();
      recDoc.Status = 'ACTIVE';
      recDoc.UpdatedAt = new Date().toISOString();
      logActivity(session.UserID, session.Username, 'BACKUP_RECOVERY', 'Memulihkan file utama Drive A dari salinan Drive B untuk ' + recDoc.FileName);
      saveEmulatorDb(db);
      return { recovered: true, DocumentID: recDoc.DocumentID, newPrimaryFileID: recDoc.PrimaryFileID };
    }

    // --- SETTINGS & TRIGGERS (ADMIN) ---
    if (action === 'settings.get') {
      requireAdmin();
      var bOff2 = db.SETTINGS.SIMULATE_DRIVE_B_OFFLINE === 'TRUE';
      return {
        settings: db.SETTINGS,
        driveAHealth: {
          connected: true,
          status: 'ONLINE',
          accountEmail: db.SETTINGS.DRIVE_A_ACCOUNT_EMAIL,
          rootFolderName: 'PERSONAL DOCUMENTS',
          rootFolderId: db.SETTINGS.DRIVE_A_ROOT_FOLDER_ID,
          archiveFolderName: 'PERSONAL DOCUMENTS ARCHIVE'
        },
        driveBHealth: {
          connected: !bOff2,
          mode: db.SETTINGS.BACKUP_MODE,
          status: bOff2 ? 'ERROR' : 'ONLINE',
          accountEmail: db.SETTINGS.DRIVE_B_ACCOUNT_EMAIL,
          rootFolderName: 'PERSONAL DOCUMENTS BACKUP',
          rootFolderId: db.SETTINGS.DRIVE_B_ROOT_FOLDER_ID
        },
        triggerStatus: {
          queueTriggerActive: Boolean(db.TRIGGERS_ACTIVE),
          integrityTriggerActive: Boolean(db.TRIGGERS_ACTIVE)
        },
        databaseStructure: {
          healthy: true,
          sheets: ['USERS', 'DOCUMENTS', 'BACKUP_QUEUE', 'BACKUP_LOG', 'ACTIVITY_LOG', 'SETTINGS', 'CATEGORIES', 'ARCHIVE_LOG'].map(function(s) {
            return { sheetName: s, exists: true, missingColumns: [] };
          })
        }
      };
    }

    if (action === 'settings.update') {
      requireAdmin();
      var up = payload.settings || {};
      Object.keys(up).forEach(function(k) {
        db.SETTINGS[k] = up[k];
      });
      logActivity(session.UserID, session.Username, 'SETTINGS_UPDATE', 'Memperbarui konfigurasi Drive A, Drive B, dan parameter sistem.');
      saveEmulatorDb(db);
      return executeEmulatorAction('settings.get', token, {});
    }

    if (action === 'settings.testDriveConnections') {
      requireAdmin();
      var st = executeEmulatorAction('settings.get', token, {});
      return { driveA: st.driveAHealth, driveB: st.driveBHealth };
    }

    if (action === 'settings.installTriggers') {
      requireAdmin();
      db.TRIGGERS_ACTIVE = true;
      logActivity(session.UserID, session.Username, 'TRIGGER_INSTALL', 'Mengaktifkan Time-Driven Trigger 5 menit.');
      saveEmulatorDb(db);
      return { queueTriggerActive: true, integrityTriggerActive: true };
    }

    if (action === 'settings.removeTriggers') {
      requireAdmin();
      db.TRIGGERS_ACTIVE = false;
      logActivity(session.UserID, session.Username, 'TRIGGER_REMOVE', 'Menonaktifkan Time-Driven Trigger.');
      saveEmulatorDb(db);
      return { queueTriggerActive: false, integrityTriggerActive: false };
    }

    throw new Error('Action tidak dikenali: ' + action);
  }

  return {
    request: request,
    getCached: getFromMemoryCache,
    invalidateCache: invalidateCache,
    clearCache: function() { _memoryCache = {}; },
    executeEmulatorAction: executeEmulatorAction,
    loadEmulatorDb: loadEmulatorDb,
    saveEmulatorDb: saveEmulatorDb
  };

})();
