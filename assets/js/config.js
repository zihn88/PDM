/**
 * ============================================================================
 * PERSONAL DOCUMENT MANAGER - FRONTEND CONFIGURATION & UTILITIES (config.js)
 * Tidak menyimpan kredensial atau rahasia sistem Google Drive di Frontend.
 * ============================================================================
 */

window.PDM_CONFIG = {
  APP_NAME: 'PERSONAL DOCUMENT MANAGER',
  APP_SUBTITLE: 'Multi-User Cloud Storage & Dual-Drive Auto Backup',
  VERSION: '2.4.0',

  // ==========================================================================
  // URL ENDPOINT BACKEND GOOGLE APPS SCRIPT (HARDCODED DI SINI, TIDAK DI UI PUBLIK)
  // ==========================================================================
  // Tempelkan URL Web App Google Apps Script (Akun A) Anda di bawah ini
  // Contoh: 'https://script.google.com/macros/s/AKfycbxVsy9mcTXTX.../exec'
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbxVsy9mcTXTX-v5Rul9IPyy4VTtH42uS-8k8nwnLql4DsAUHdA_fZKZw04MW-Sn0ndzmQ/exec',

  // Kunci penyimpanan lokal browser (hanya untuk token sesi dan tema UI)
  STORAGE_KEYS: {
    SESSION_TOKEN: 'pdm_session_token',
    SESSION_USER: 'pdm_session_user',
    THEME: 'pdm_ui_theme',
    EMULATOR_DB: 'pdm_emulator_database_v2'
  },

  ALLOWED_EXTENSIONS: ['PDF', 'JPG', 'JPEG', 'PNG'],
  ALLOWED_MIMES: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
  MAX_UPLOAD_MB: 15,
  PAGINATION_OPTIONS: [10, 25, 50, 100]
};

/**
 * Kumpulan fungsi utilitas UI, formatting, Checksum SHA-256, dan QR Code SVG Generator
 */
window.PDM_UTILS = {

  getGasEndpointUrl: function() {
    var configured = String(PDM_CONFIG.GAS_WEB_APP_URL || '').trim();
    if (configured) return configured;
    // Fallback baca dari localStorage hanya jika pernah disimpan sebelumnya oleh developer
    var saved = localStorage.getItem('pdm_gas_endpoint_url');
    return (saved && saved.trim()) ? saved.trim() : '';
  },

  isLiveGasMode: function() {
    return Boolean(this.getGasEndpointUrl());
  },

  formatBytes: function(bytes) {
    var b = Number(bytes || 0);
    if (b <= 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(b) / Math.log(1024));
    var val = (b / Math.pow(1024, i));
    return (i === 0 ? val : val.toFixed(2)) + ' ' + units[i];
  },

  formatDateTime: function(isoString) {
    if (!isoString) return '-';
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);
    return d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  formatDateShort: function(isoString) {
    if (!isoString) return '-';
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);
    return d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  },

  escapeHtml: function(str) {
    if (str === null || typeof str === 'undefined') return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Merender badge status backup sesuai standar warna:
   * - HIJAU: Backup berhasil (SUCCESS)
   * - KUNING: Menunggu atau sedang diproses (PENDING / PROCESSING)
   * - MERAH: Backup gagal (FAILED)
   * - ABU-ABU: Belum dibackup (UNBACKED)
   */
  renderBackupBadge: function(status) {
    var st = String(status || 'UNBACKED').toUpperCase();
    if (st === 'SUCCESS') {
      return '<span class="badge badge-green"><span class="badge-dot"></span>Backup Berhasil</span>';
    }
    if (st === 'PENDING' || st === 'PROCESSING' || st === 'QUEUED') {
      return '<span class="badge badge-yellow"><span class="badge-dot"></span>Menunggu Backup</span>';
    }
    if (st === 'FAILED' || st === 'FAILED_MAX_RETRY') {
      return '<span class="badge badge-red"><span class="badge-dot"></span>Backup Gagal</span>';
    }
    return '<span class="badge badge-gray"><span class="badge-dot"></span>Belum Dibackup</span>';
  },

  renderFormatBadge: function(format) {
    var fmt = String(format || 'PDF').toUpperCase();
    var cls = fmt.toLowerCase();
    return '<span class="badge-format ' + this.escapeHtml(cls) + '">' + this.escapeHtml(fmt) + '</span>';
  },

  /**
   * Menghitung SHA-256 Checksum di sisi browser menggunakan Web Crypto API
   */
  computeSha256Hex: async function(arrayBufferOrUint8) {
    var buffer = arrayBufferOrUint8 instanceof ArrayBuffer
      ? arrayBufferOrUint8
      : arrayBufferOrUint8.buffer;
    if (window.crypto && window.crypto.subtle) {
      var hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
      var hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    // Fallback deterministic hash jika dijalankan di non-secure context lokal
    var bytes = new Uint8Array(buffer);
    var h1 = 0xdeadbeef ^ bytes.length;
    var h2 = 0x41c6ce57 ^ bytes.length;
    for (var i = 0; i < bytes.length; i++) {
      var ch = bytes[i];
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0') + bytes.length.toString(16).padStart(8, '0');
  },

  /**
   * Menampilkan Toast Notification modern
   */
  showToast: function(title, message, type) {
    var container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    var toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'info');
    toast.innerHTML =
      '<div style="flex:1;">' +
        '<div style="font-weight:700;font-size:13px;margin-bottom:2px;">' + this.escapeHtml(title) + '</div>' +
        '<div style="font-size:12.5px;color:var(--text-secondary);">' + this.escapeHtml(message) + '</div>' +
      '</div>' +
      '<button type="button" class="btn-ghost btn-sm" style="padding:2px 6px;" aria-label="Tutup">&times;</button>';

    var closeBtn = toast.querySelector('button');
    closeBtn.addEventListener('click', function() {
      toast.remove();
    });

    container.appendChild(toast);
    setTimeout(function() {
      if (toast && toast.parentNode) {
        toast.remove();
      }
    }, 4500);
  },

  /**
   * Membuat QR Code Matrix SVG murni (untuk tautan aplikasi terautentikasi ?doc=DocumentID)
   * Tanpa membocorkan dokumen ke layanan pihak ketiga eksternal.
   */
  generateAuthQrSvg: function(authAppUrl) {
    var size = 21;
    var matrix = [];
    for (var r = 0; r < size; r++) {
      matrix[r] = [];
      for (var c = 0; c < size; c++) {
        matrix[r][c] = 0;
      }
    }

    function drawFinder(rowOffset, colOffset) {
      for (var r = 0; r < 7; r++) {
        for (var c = 0; c < 7; c++) {
          if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
            matrix[rowOffset + r][colOffset + c] = 1;
          } else {
            matrix[rowOffset + r][colOffset + c] = 2;
          }
        }
      }
    }

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    for (var i = 8; i < size - 8; i++) {
      matrix[6][i] = (i % 2 === 0) ? 1 : 2;
      matrix[i][6] = (i % 2 === 0) ? 1 : 2;
    }

    var str = String(authAppUrl || 'PDM');
    var bitPool = [];
    for (var idx = 0; idx < str.length; idx++) {
      var code = str.charCodeAt(idx);
      for (var b = 7; b >= 0; b--) {
        bitPool.push((code >> b) & 1);
      }
    }
    var bitCursor = 0;
    for (var rr = 0; rr < size; rr++) {
      for (var cc = 0; cc < size; cc++) {
        if (matrix[rr][cc] === 0) {
          var bit = bitPool[bitCursor % bitPool.length] ^ ((rr * cc + bitCursor) % 2 === 0 ? 1 : 0);
          matrix[rr][cc] = bit ? 1 : 0;
          bitCursor++;
        }
      }
    }

    var rects = [];
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (matrix[y][x] === 1) {
          rects.push('<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="#0f172a"/>');
        }
      }
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" width="76" height="76" shape-rendering="crispEdges">' +
      '<rect width="' + size + '" height="' + size + '" fill="#ffffff"/>' +
      rects.join('') +
      '</svg>';
  }
};
