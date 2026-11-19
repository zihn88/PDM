/**
 * ============================================================================
 * PERSONAL DOCUMENT MANAGER - BACKUP CENTER MODULE (backup.js)
 * Admin-Only Control Center for Cross-Account Backup (Drive A -> Drive B)
 * Color Indicators:
 * - HIJAU: Backup berhasil
 * - KUNING: Menunggu atau sedang diproses
 * - MERAH: Backup gagal
 * - ABU-ABU: Belum dibackup
 * Actions: Backup Sekarang, Backup Ulang, Verifikasi Backup, Lihat Riwayat,
 * Jalankan Pemeriksaan Semua Dokumen, Pemulihan dari Backup Drive B
 * ============================================================================
 */

window.PDM_BACKUP = (function() {

  async function loadBackupCenter() {
    var container = document.getElementById('backupCenterContainer');
    if (!container) return;

    try {
      var data = await PDM_API.request('backup.overview', {});
      renderBackupCenter(container, data);
    } catch (err) {
      container.innerHTML =
        '<div class="card"><div class="empty-state">' +
          '<p style="color:var(--status-red-text);font-weight:700;">' + PDM_UTILS.escapeHtml(err.message) + '</p>' +
        '</div></div>';
    }
  }

  function renderBackupCenter(container, data) {
    var dA = data.driveAHealth || {};
    var dB = data.driveBHealth || {};

    var html =
      /* Action Toolbar */
      '<div class="card" style="margin-bottom:20px;">' +
        '<div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:14px;">' +
          '<div>' +
            '<h3 style="font-size:15px;font-weight:800;">Mesin Replikasi Satu Arah: Google Drive A &rarr; Google Drive B</h3>' +
            '<p style="font-size:12px;color:var(--text-muted);margin-top:2px;">' +
              'Backup Terakhir: <strong>' + PDM_UTILS.formatDateTime(data.lastBackupTime) + '</strong> &bull; ' +
              'Audit Integritas Terakhir: <strong>' + PDM_UTILS.formatDateTime(data.lastIntegrityCheck) + '</strong>' +
            '</p>' +
          '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
            '<button class="btn btn-primary btn-sm" onclick="PDM_BACKUP.runBatchBackupNow(false)">Backup Sekarang (Antrean)</button>' +
            '<button class="btn btn-secondary btn-sm" onclick="PDM_BACKUP.runBatchBackupNow(true)">Backup Ulang Semua</button>' +
            '<button class="btn btn-success btn-sm" onclick="PDM_BACKUP.runFullIntegrityAudit()">Jalankan Pemeriksaan Semua Dokumen</button>' +
            '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'backupHistorySection\').scrollIntoView({behavior:\'smooth\'})">Lihat Riwayat</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* 5 Metric Cards with HIJAU / KUNING / MERAH / ABU-ABU Indicators */
      '<div class="stats-grid">' +
        '<div class="stat-card">' +
          '<div class="stat-info">' +
            '<div class="stat-label">Total Dokumen</div>' +
            '<div class="stat-value">' + data.totalDocuments + '</div>' +
            '<div class="stat-meta">Keberhasilan: <strong>' + data.successRate + '%</strong></div>' +
          '</div>' +
          '<span class="badge badge-green">' + data.successRate + '%</span>' +
        '</div>' +

        '<div class="stat-card">' +
          '<div class="stat-info">' +
            '<div class="stat-label">Sudah Dibackup (HIJAU)</div>' +
            '<div class="stat-value" style="color:var(--status-green-text);">' + data.backedUpCount + '</div>' +
            '<div class="stat-meta">Checksum cocok di Drive B</div>' +
          '</div>' +
          '<span class="badge badge-green"><span class="badge-dot"></span>HIJAU</span>' +
        '</div>' +

        '<div class="stat-card">' +
          '<div class="stat-info">' +
            '<div class="stat-label">Menunggu Backup (KUNING)</div>' +
            '<div class="stat-value" style="color:var(--status-yellow-text);">' + data.pendingCount + '</div>' +
            '<div class="stat-meta">Dalam antrean / sedang diproses</div>' +
          '</div>' +
          '<span class="badge badge-yellow"><span class="badge-dot"></span>KUNING</span>' +
        '</div>' +

        '<div class="stat-card">' +
          '<div class="stat-info">' +
            '<div class="stat-label">Backup Gagal (MERAH)</div>' +
            '<div class="stat-value" style="color:var(--status-red-text);">' + data.failedCount + '</div>' +
            '<div class="stat-meta">Dijadwalkan retry bertahap</div>' +
          '</div>' +
          '<span class="badge badge-red"><span class="badge-dot"></span>MERAH</span>' +
        '</div>' +

        '<div class="stat-card">' +
          '<div class="stat-info">' +
            '<div class="stat-label">Belum Dibackup (ABU-ABU)</div>' +
            '<div class="stat-value">' + data.unbackedCount + '</div>' +
            '<div class="stat-meta">Siap dimasukkan ke antrean</div>' +
          '</div>' +
          '<span class="badge badge-gray"><span class="badge-dot"></span>ABU-ABU</span>' +
        '</div>' +
      '</div>' +

      /* Daftar Dokumen Bermasalah / Menunggu Backup */
      '<div class="card" style="margin-bottom:20px;">' +
        '<div class="card-header">' +
          '<div>' +
            '<div class="card-title">Daftar Dokumen Bermasalah / Menunggu Backup</div>' +
            '<div class="card-subtitle">Dokumen dengan status KUNING (Pending), MERAH (Gagal), atau ABU-ABU (Belum Backup)</div>' +
          '</div>' +
        '</div>' +
        renderProblematicDocsTable(data.problematicDocuments || []) +
      '</div>' +

      /* Antrean BACKUP_QUEUE & Riwayat BACKUP_LOG */
      '<div class="dashboard-row" id="backupHistorySection">' +
        '<div class="card">' +
          '<div class="card-header">' +
            '<div>' +
              '<div class="card-title">Riwayat Proses Backup (BACKUP_LOG)</div>' +
              '<div class="card-subtitle">Catatan waktu mulai, selesai, ID file Drive A &rarr; Drive B, dan pesan error</div>' +
            '</div>' +
          '</div>' +
          renderBackupLogTable(data.recentLogs || []) +
        '</div>' +

        '<div class="card">' +
          '<div class="card-header">' +
            '<div>' +
              '<div class="card-title">Status Antrean (BACKUP_QUEUE)</div>' +
              '<div class="card-subtitle">Mekanisme retry bertahap &amp; LockService batch worker</div>' +
            '</div>' +
          '</div>' +
          renderQueueTable(data.queueItems || []) +
        '</div>' +
      '</div>';

    container.innerHTML = html;
  }

  function renderProblematicDocsTable(docs) {
    if (!docs || docs.length === 0) {
      return (
        '<div class="empty-state" style="padding:24px;">' +
          '<span class="badge badge-green" style="font-size:13px;padding:6px 14px;"><span class="badge-dot"></span>100% Dokumen Telah Terbackup &amp; Terverifikasi di Google Drive B</span>' +
          '<p style="margin-top:8px;font-size:12.5px;">Tidak ada dokumen bermasalah atau tertunda saat ini.</p>' +
        '</div>'
      );
    }

    var rows = docs.map(function(doc) {
      var docIdEsc = PDM_UTILS.escapeHtml(doc.DocumentID);
      return (
        '<tr>' +
          '<td><code>' + docIdEsc + '</code></td>' +
          '<td><strong>' + PDM_UTILS.escapeHtml(doc.OwnerName) + '</strong></td>' +
          '<td>' + PDM_UTILS.escapeHtml(doc.FileName) + '</td>' +
          '<td>' + PDM_UTILS.renderBackupBadge(doc.BackupStatus) + '</td>' +
          '<td style="color:var(--status-red-text);font-size:12px;">' + PDM_UTILS.escapeHtml(doc.BackupError || '-') + '</td>' +
          '<td>' +
            '<div class="action-btn-group">' +
              '<button class="btn btn-primary btn-sm" onclick="PDM_BACKUP.backupSingleNow(\'' + docIdEsc + '\', false)">Backup Sekarang</button>' +
              '<button class="btn btn-secondary btn-sm" onclick="PDM_BACKUP.verifySingleNow(\'' + docIdEsc + '\')">Verifikasi</button>' +
            '</div>' +
          '</td>' +
        '</tr>'
      );
    }).join('');

    return (
      '<div class="table-responsive">' +
        '<table class="data-table">' +
          '<thead><tr><th>ID Dokumen</th><th>Pemilik</th><th>Nama File</th><th>Status</th><th>Penyebab / Catatan</th><th>Aksi</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>'
    );
  }

  function renderBackupLogTable(logs) {
    if (!logs || logs.length === 0) {
      return '<div class="empty-state"><p>Belum ada riwayat log backup.</p></div>';
    }
    var rows = logs.slice(0, 15).map(function(l) {
      var docIdEsc = PDM_UTILS.escapeHtml(l.DocumentID);
      return (
        '<tr>' +
          '<td><code>' + docIdEsc + '</code></td>' +
          '<td>' + PDM_UTILS.renderBackupBadge(l.Status) + '</td>' +
          '<td><code style="font-size:11px;">' + PDM_UTILS.escapeHtml(l.BackupFileID || '-') + '</code></td>' +
          '<td style="font-size:12px;">' + PDM_UTILS.formatDateTime(l.EndTime || l.StartTime) + '</td>' +
          '<td style="font-size:12px;color:var(--status-red-text);">' + PDM_UTILS.escapeHtml(l.ErrorMessage || '-') + '</td>' +
          '<td>' +
            '<div class="action-btn-group">' +
              '<button class="btn btn-secondary btn-sm" onclick="PDM_BACKUP.verifySingleNow(\'' + docIdEsc + '\')">Verifikasi</button>' +
              '<button class="btn btn-ghost btn-sm" onclick="PDM_BACKUP.backupSingleNow(\'' + docIdEsc + '\', true)" title="Buat Salinan Versi Baru">Backup Ulang</button>' +
            '</div>' +
          '</td>' +
        '</tr>'
      );
    }).join('');

    return (
      '<div class="table-responsive">' +
        '<table class="data-table">' +
          '<thead><tr><th>DocumentID</th><th>Status</th><th>BackupFileID (Drive B)</th><th>Waktu</th><th>Error</th><th>Aksi</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>'
    );
  }

  function renderQueueTable(queue) {
    if (!queue || queue.length === 0) {
      return '<div class="empty-state"><p>Antrean backup kosong.</p></div>';
    }
    var rows = queue.slice(0, 12).map(function(q) {
      var stBadge = q.Status === 'COMPLETED'
        ? '<span class="badge badge-green">COMPLETED</span>'
        : (q.Status === 'QUEUED' ? '<span class="badge badge-yellow">QUEUED</span>' : '<span class="badge badge-red">' + PDM_UTILS.escapeHtml(q.Status) + '</span>');
      return (
        '<tr>' +
          '<td><code>' + PDM_UTILS.escapeHtml(q.DocumentID) + '</code></td>' +
          '<td>' + stBadge + '</td>' +
          '<td>' + Number(q.RetryCount || 0) + ' / 5</td>' +
          '<td style="font-size:11.5px;">' + PDM_UTILS.formatDateTime(q.NextRetry) + '</td>' +
        '</tr>'
      );
    }).join('');

    return (
      '<div class="table-responsive">' +
        '<table class="data-table">' +
          '<thead><tr><th>DocumentID</th><th>Status</th><th>Retry</th><th>Jadwal Retry</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>'
    );
  }

  async function backupSingleNow(documentId, forceCopy) {
    try {
      PDM_UTILS.showToast('Memproses Backup', 'Menyalin dokumen ' + documentId + ' dari Drive A ke Drive B...', 'info');
      var res = await PDM_API.request('backup.runSingle', {
        DocumentID: documentId,
        forceCopy: Boolean(forceCopy)
      });
      if (res.success) {
        PDM_UTILS.showToast(
          res.skippedDuplicate ? 'Duplikasi Dicegah' : 'Backup Berhasil',
          res.message || ('Dokumen ' + documentId + ' berhasil disalin ke Drive B (' + res.BackupFileID + ').'),
          'success'
        );
      } else {
        PDM_UTILS.showToast('Backup Gagal', res.error || 'Terjadi kesalahan saat menyalin ke Drive B.', 'error');
      }
      loadBackupCenter();
    } catch (err) {
      PDM_UTILS.showToast('Error Backup', err.message, 'error');
    }
  }

  async function runBatchBackupNow(forceCopy) {
    try {
      PDM_UTILS.showToast('Menjalankan Batch Backup', 'Memproses antrean BACKUP_QUEUE ke Google Drive B...', 'info');
      var res = await PDM_API.request('backup.runBatchNow', { forceCopy: Boolean(forceCopy) });
      PDM_UTILS.showToast(
        'Batch Backup Selesai',
        'Diproses: ' + res.processedCount + ' dokumen (Berhasil: ' + res.successCount + ', Gagal: ' + res.failedCount + ').',
        res.failedCount === 0 ? 'success' : 'warning'
      );
      loadBackupCenter();
    } catch (err) {
      PDM_UTILS.showToast('Gagal Menjalankan Batch', err.message, 'error');
    }
  }

  async function verifySingleNow(documentId) {
    try {
      var res = await PDM_API.request('backup.verifySingle', { DocumentID: documentId });
      PDM_UTILS.showToast(
        res.backupHealthy && res.checksumMatched ? 'Verifikasi Integritas Valid' : 'Integritas Bermasalah',
        res.message,
        res.backupHealthy && res.checksumMatched ? 'success' : 'warning'
      );
      loadBackupCenter();
    } catch (err) {
      PDM_UTILS.showToast('Gagal Verifikasi', err.message, 'error');
    }
  }

  async function runFullIntegrityAudit() {
    try {
      PDM_UTILS.showToast('Memeriksa Seluruh Dokumen', 'Memverifikasi keberadaan file & kecocokan Checksum SHA-256 di Drive B...', 'info');
      var res = await PDM_API.request('backup.verifyAll', {});
      PDM_UTILS.showToast(
        'Audit Integritas Selesai',
        'Diperiksa: ' + res.checkedCount + ' dokumen (' + res.validCount + ' valid, ' + res.queuedForRepair + ' dijadwalkan perbaikan otomatis).',
        res.invalidCount === 0 ? 'success' : 'warning'
      );
      loadBackupCenter();
    } catch (err) {
      PDM_UTILS.showToast('Audit Gagal', err.message, 'error');
    }
  }

  return {
    loadBackupCenter: loadBackupCenter,
    backupSingleNow: backupSingleNow,
    runBatchBackupNow: runBatchBackupNow,
    verifySingleNow: verifySingleNow,
    runFullIntegrityAudit: runFullIntegrityAudit
  };

})();
