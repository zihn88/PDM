/**
 * ============================================================================
 * PERSONAL DOCUMENT MANAGER - UPLOAD SERVICE MODULE (upload.js)
 * Drag & Drop File Upload (PDF, JPG, JPEG, PNG), Client SHA-256 Checksum,
 * Dual Progress Bar (1. Upload to Primary Drive A, 2. Auto-Backup to Drive B),
 * and Smart Backup-Only Retry without re-uploading the Primary File.
 * ============================================================================
 */

window.PDM_UPLOAD = (function() {

  var _bound = false;

  async function initUploadView() {
    var user = PDM_AUTH.getCachedUser();
    var ownerInput = document.getElementById('uploadOwnerReadonly');
    var folderPreviewEl = document.getElementById('uploadTargetFolderPreview');
    var catSelect = document.getElementById('uploadCategorySelect');

    if (user && ownerInput) {
      ownerInput.value = user.Nama + ' (@' + user.Username + ')';
    }

    // Fast-path: isi dropdown kategori seketika dari memory cache jika tersedia
    var cachedCats = PDM_API.getCached('categories.list', {});
    if (cachedCats && catSelect && cachedCats.length > 0 && catSelect.children.length === 0) {
      catSelect.innerHTML = cachedCats.map(function(c) {
        return '<option value="' + PDM_UTILS.escapeHtml(c.CategoryName) + '">' + PDM_UTILS.escapeHtml(c.CategoryName) + '</option>';
      }).join('');
    }

    // Muat kategori (0 ms jika sudah di cache)
    try {
      var cats = await PDM_API.request('categories.list', {});
      if (catSelect && cats.length > 0) {
        var cur = catSelect.value;
        catSelect.innerHTML = cats.map(function(c) {
          return '<option value="' + PDM_UTILS.escapeHtml(c.CategoryName) + '">' + PDM_UTILS.escapeHtml(c.CategoryName) + '</option>';
        }).join('');
        if (cur) catSelect.value = cur;
      }
    } catch (e) {}

    updateFolderPathPreview();

    if (!_bound) {
      bindUploadEvents();
      _bound = true;
    }
  }

  function updateFolderPathPreview() {
    var user = PDM_AUTH.getCachedUser();
    var catSelect = document.getElementById('uploadCategorySelect');
    var folderPreviewEl = document.getElementById('uploadTargetFolderPreview');
    var backupPreviewEl = document.getElementById('uploadBackupFolderPreview');

    var uName = user ? user.Nama.toUpperCase() : 'PENGGUNA';
    var cat = (catSelect && catSelect.value) ? catSelect.value.toUpperCase() : 'IDENTITAS';

    if (folderPreviewEl) {
      folderPreviewEl.textContent = 'PERSONAL DOCUMENTS / ' + uName + ' / ' + cat;
    }
    if (backupPreviewEl) {
      backupPreviewEl.textContent = 'PERSONAL DOCUMENTS BACKUP / ' + uName + ' / ' + cat;
    }
  }

  function bindUploadEvents() {
    var dropzone = document.getElementById('uploadDropzone');
    var fileInput = document.getElementById('uploadFileInput');
    var catSelect = document.getElementById('uploadCategorySelect');

    if (catSelect) {
      catSelect.addEventListener('change', updateFolderPathPreview);
    }

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', function() {
        fileInput.click();
      });

      dropzone.addEventListener('dragover', function(e) {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });

      dropzone.addEventListener('dragleave', function() {
        dropzone.classList.remove('dragover');
      });

      dropzone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleSelectedFiles(e.dataTransfer.files);
        }
      });

      fileInput.addEventListener('change', function() {
        if (fileInput.files && fileInput.files.length > 0) {
          handleSelectedFiles(fileInput.files);
          fileInput.value = '';
        }
      });
    }
  }

  function handleSelectedFiles(fileList) {
    var queueContainer = document.getElementById('uploadQueueContainer');
    if (!queueContainer) return;

    var category = (document.getElementById('uploadCategorySelect') || {}).value || 'IDENTITAS';
    var description = (document.getElementById('uploadDescriptionInput') || {}).value || '';

    for (var i = 0; i < fileList.length; i++) {
      processSingleFileUpload(fileList[i], category, description, queueContainer);
    }
  }

  async function processSingleFileUpload(file, category, description, queueContainer) {
    var itemId = 'up_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    var ext = String(file.name || '').split('.').pop().toUpperCase();
    var card = document.createElement('div');
    card.className = 'upload-item-card';
    card.id = itemId;

    card.innerHTML =
      '<div class="upload-item-header">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          PDM_UTILS.renderFormatBadge(ext) +
          '<div>' +
            '<div style="font-weight:700;font-size:13.5px;">' + PDM_UTILS.escapeHtml(file.name) + '</div>' +
            '<div style="font-size:11.5px;color:var(--text-muted);">Ukuran: ' + PDM_UTILS.formatBytes(file.size) + ' &bull; Kategori: ' + PDM_UTILS.escapeHtml(category) + '</div>' +
          '</div>' +
        '</div>' +
        '<div id="' + itemId + '_badge"><span class="badge badge-yellow"><span class="badge-dot"></span>Memvalidasi File...</span></div>' +
      '</div>' +

      '<div class="dual-progress-grid">' +
        '<div class="progress-track-wrap">' +
          '<div class="progress-label-row">' +
            '<span>1. Progres Upload (Google Drive A)</span>' +
            '<span id="' + itemId + '_upPct">0%</span>' +
          '</div>' +
          '<div class="progress-bar-bg"><div id="' + itemId + '_upBar" class="progress-bar-fill" style="width:0%;"></div></div>' +
        '</div>' +
        '<div class="progress-track-wrap">' +
          '<div class="progress-label-row">' +
            '<span>2. Progres Auto-Backup (Google Drive B)</span>' +
            '<span id="' + itemId + '_bkpPct">Menunggu...</span>' +
          '</div>' +
          '<div class="progress-bar-bg"><div id="' + itemId + '_bkpBar" class="progress-bar-fill backup-fill" style="width:0%;"></div></div>' +
        '</div>' +
      '</div>' +
      '<div id="' + itemId + '_footer" style="font-size:12px;color:var(--text-secondary);display:flex;justify-content:space-between;align-items:center;"></div>';

    queueContainer.prepend(card);

    var badgeEl = document.getElementById(itemId + '_badge');
    var upPctEl = document.getElementById(itemId + '_upPct');
    var upBarEl = document.getElementById(itemId + '_upBar');
    var bkpPctEl = document.getElementById(itemId + '_bkpPct');
    var bkpBarEl = document.getElementById(itemId + '_bkpBar');
    var footerEl = document.getElementById(itemId + '_footer');

    // Validasi Ekstensi & Ukuran di Client sebelum baca Base64
    if (PDM_CONFIG.ALLOWED_EXTENSIONS.indexOf(ext) === -1) {
      badgeEl.innerHTML = '<span class="badge badge-red"><span class="badge-dot"></span>Format Ditolak</span>';
      footerEl.innerHTML = '<span style="color:var(--status-red-text);">Hanya format PDF, JPG, JPEG, dan PNG yang didukung.</span>';
      return;
    }

    if (file.size > PDM_CONFIG.MAX_UPLOAD_MB * 1024 * 1024) {
      badgeEl.innerHTML = '<span class="badge badge-red"><span class="badge-dot"></span>Ukuran Terlalu Besar</span>';
      footerEl.innerHTML = '<span style="color:var(--status-red-text);">Ukuran file melebihi batas ' + PDM_CONFIG.MAX_UPLOAD_MB + ' MB.</span>';
      return;
    }

    try {
      // Step 1: Baca file & hitung SHA-256 Checksum
      upPctEl.textContent = '35%';
      upBarEl.style.width = '35%';
      var arrayBuf = await readFileAsArrayBuffer(file);
      var checksumHex = await PDM_UTILS.computeSha256Hex(arrayBuf);
      var base64Data = arrayBufferToBase64(arrayBuf);

      // Step 2: Kirim ke Google Drive A (tanpa menggabungkan kegagalan backup)
      badgeEl.innerHTML = '<span class="badge badge-yellow"><span class="badge-dot"></span>Menyimpan ke Drive A...</span>';
      upPctEl.textContent = '75%';
      upBarEl.style.width = '75%';

      var uploadRes = await PDM_API.request('documents.upload', {
        fileName: file.name,
        mimeType: file.type || (ext === 'PDF' ? 'application/pdf' : 'image/' + ext.toLowerCase()),
        base64Data: base64Data,
        category: category,
        description: description,
        clientChecksum: checksumHex,
        runImmediateBackup: true
      });

      // Upload ke Drive A berhasil 100%!
      upPctEl.textContent = '100% (Tersimpan)';
      upBarEl.style.width = '100%';

      var doc = uploadRes.document;
      var bkp = uploadRes.backupResult;

      if (doc.BackupStatus === 'SUCCESS' || (bkp && bkp.success)) {
        bkpPctEl.textContent = '100% (Terverifikasi)';
        bkpBarEl.style.width = '100%';
        badgeEl.innerHTML = '<span class="badge badge-green"><span class="badge-dot"></span>Upload &amp; Backup Selesai</span>';
        footerEl.innerHTML =
          '<span>ID: <code>' + PDM_UTILS.escapeHtml(doc.DocumentID) + '</code> &bull; Checksum SHA-256 Terverifikasi</span>' +
          '<button class="btn btn-secondary btn-sm" onclick="PDM_AUTH.navigateTo(\'preview\', {documentId:\'' + PDM_UTILS.escapeHtml(doc.DocumentID) + '\', returnView:\'upload\'})">Lihat Preview</button>';
        PDM_UTILS.showToast('Upload & Backup Berhasil', file.name + ' telah tersimpan di Drive A dan otomatis disalin ke Drive B.', 'success');
      } else {
        // File utama SUDAH tersimpan di Drive A, namun backup ke Drive B gagal / masuk antrean.
        // Sesuai instruksi: JANGAN mengulang upload file utama, cukup sediakan tombol Ulangi Backup dari Drive A!
        bkpPctEl.textContent = 'Dalam Antrean Retry';
        bkpBarEl.style.width = '40%';
        bkpBarEl.style.background = '#f59e0b';
        badgeEl.innerHTML = '<span class="badge badge-yellow"><span class="badge-dot"></span>Tersimpan di Drive A (Menunggu Backup Drive B)</span>';
        footerEl.innerHTML =
          '<span style="color:var(--status-yellow-text);">File utama aman di Drive A. Backup Drive B masuk antrean (' + PDM_UTILS.escapeHtml((bkp && bkp.error) || 'Menunggu koneksi Drive B') + ').</span>' +
          '<button class="btn btn-primary btn-sm" onclick="PDM_UPLOAD.retryBackupOnly(\'' + PDM_UTILS.escapeHtml(doc.DocumentID) + '\', \'' + itemId + '\')">Ulangi Backup Saja</button>';
      }

    } catch (err) {
      upPctEl.textContent = 'Gagal';
      upBarEl.style.background = '#ef4444';
      badgeEl.innerHTML = '<span class="badge badge-red"><span class="badge-dot"></span>Upload Gagal</span>';
      footerEl.innerHTML = '<span style="color:var(--status-red-text);">' + PDM_UTILS.escapeHtml(err.message) + '</span>';
      PDM_UTILS.showToast('Upload Gagal', err.message, 'error');
    }
  }

  /**
   * Mengulangi proses backup dari file yang sudah tersimpan di Drive A ke Drive B
   * TANPA mengunggah ulang file utama.
   */
  async function retryBackupOnly(documentId, cardItemId) {
    var badgeEl = document.getElementById(cardItemId + '_badge');
    var bkpPctEl = document.getElementById(cardItemId + '_bkpPct');
    var bkpBarEl = document.getElementById(cardItemId + '_bkpBar');
    var footerEl = document.getElementById(cardItemId + '_footer');

    if (badgeEl) badgeEl.innerHTML = '<span class="badge badge-yellow"><span class="badge-dot"></span>Menyalin dari Drive A ke Drive B...</span>';
    if (bkpPctEl) bkpPctEl.textContent = '65%';
    if (bkpBarEl) bkpBarEl.style.width = '65%';

    try {
      var res = await PDM_API.request('backup.runSingle', {
        DocumentID: documentId,
        forceCopy: false
      });

      if (res && res.success) {
        if (bkpPctEl) bkpPctEl.textContent = '100% (Terverifikasi)';
        if (bkpBarEl) {
          bkpBarEl.style.width = '100%';
          bkpBarEl.style.background = '#10b981';
        }
        if (badgeEl) badgeEl.innerHTML = '<span class="badge badge-green"><span class="badge-dot"></span>Backup Berhasil</span>';
        if (footerEl) {
          footerEl.innerHTML =
            '<span>Backup ke Drive B berhasil diselesaikan dari file Drive A tanpa upload ulang.</span>' +
            '<button class="btn btn-secondary btn-sm" onclick="PDM_AUTH.navigateTo(\'preview\', {documentId:\'' + PDM_UTILS.escapeHtml(documentId) + '\', returnView:\'upload\'})">Lihat Preview</button>';
        }
        PDM_UTILS.showToast('Backup Berhasil', 'Salinan dokumen di Google Drive B berhasil diverifikasi.', 'success');
      } else {
        throw new Error((res && res.error) || 'Drive B belum merespons.');
      }
    } catch (err) {
      if (bkpPctEl) bkpPctEl.textContent = 'Terjadwal di Antrean';
      if (badgeEl) badgeEl.innerHTML = '<span class="badge badge-red"><span class="badge-dot"></span>Retry Gagal</span>';
      PDM_UTILS.showToast('Backup Masih Tertunda', err.message, 'warning');
    }
  }

  function readFileAsArrayBuffer(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function(e) { resolve(e.target.result); };
      reader.onerror = function() { reject(new Error('Gagal membaca file lokal.')); };
      reader.readAsArrayBuffer(file);
    });
  }

  function arrayBufferToBase64(buffer) {
    var binary = '';
    var bytes = new Uint8Array(buffer);
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  return {
    initUploadView: initUploadView,
    retryBackupOnly: retryBackupOnly
  };

})();
