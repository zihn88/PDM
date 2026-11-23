/**
 * ============================================================================
 * PERSONAL DOCUMENT MANAGER - DASHBOARD MODULE (dashboard.js)
 * Renders Administrator Dashboard (10 metrics, Drive A/B Status, Extension
 * Composition Chart, Growth Chart, Recent 10 Docs, Activity Stream) and
 * Personal User Dashboard (Scoped strictly to logged-in user)
 * ============================================================================
 */

window.PDM_DASHBOARD = (function() {

  async function loadDashboard(forceFresh) {
    var container = document.getElementById('dashboardContentContainer');
    if (!container) return;

    // Fast-path: render instan jika sudah ada data di cache memori (0 ms)
    var cached = (window.PDM_API && typeof PDM_API.getCached === 'function')
      ? PDM_API.getCached('dashboard.stats', {})
      : null;

    if (cached && !forceFresh) {
      if (!container.innerHTML.trim()) {
        renderDashboard(container, cached);
      }
    } else if (!container.innerHTML.trim()) {
      container.innerHTML =
        '<div class="card"><div class="empty-state" style="padding:36px 16px;">' +
          '<p style="color:var(--text-secondary);font-weight:600;">Memuat ringkasan dashboard...</p>' +
        '</div></div>';
    }

    try {
      var stats = await PDM_API.request('dashboard.stats', {}, {
        bypassCache: !!forceFresh,
        revalidate: true,
        onRevalidate: function(freshStats) {
          renderDashboard(container, freshStats);
        }
      });
      renderDashboard(container, stats);
    } catch (err) {
      if (!container.innerHTML.trim() || container.querySelector('.empty-state')) {
        container.innerHTML =
          '<div class="card"><div class="empty-state">' +
            '<p style="color:var(--status-red-text);font-weight:700;">Gagal memuat statistik dashboard: ' + PDM_UTILS.escapeHtml(err.message) + '</p>' +
            '<button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="PDM_DASHBOARD.loadDashboard(true)">Coba Lagi</button>' +
          '</div></div>';
      }
    }
  }

  function renderDashboard(container, stats) {
    var isAdmin = (stats.role === 'ADMIN');

    // Update badge counter pada sidebar
    var navDocCount = document.getElementById('navMyDocsBadge');
    if (navDocCount) navDocCount.textContent = stats.totalDocuments || 0;
    var navArchiveCount = document.getElementById('navArchiveBadge');
    if (navArchiveCount) navArchiveCount.textContent = stats.totalArchived || 0;

    var html = '';

    // 1. Jika Admin: Tampilkan Status Koneksi Google Drive A & Google Drive B
    if (isAdmin && stats.driveAStatus && stats.driveBStatus) {
      var dA = stats.driveAStatus;
      var dB = stats.driveBStatus;
      html +=
        '<div class="drive-status-grid">' +
          '<div class="drive-card">' +
            '<div class="drive-card-top">' +
              '<div class="drive-title-group">' +
                '<span class="drive-badge-role">PRIMARY STORAGE</span>' +
                '<strong style="font-size:14.5px;">Google Drive A (Akun Pertama)</strong>' +
              '</div>' +
              (dA.connected
                ? '<span class="badge badge-green"><span class="badge-dot"></span>Terhubung</span>'
                : '<span class="badge badge-red"><span class="badge-dot"></span>Bermasalah</span>') +
            '</div>' +
            '<div style="font-size:12.5px;color:var(--text-secondary);display:flex;flex-wrap:wrap;gap:16px;">' +
              '<div><span style="color:var(--text-muted);">Akun:</span> <strong>' + PDM_UTILS.escapeHtml(dA.accountEmail || 'Primary Account') + '</strong></div>' +
              '<div><span style="color:var(--text-muted);">Root Folder:</span> <code>/' + PDM_UTILS.escapeHtml(dA.rootFolderName || 'PERSONAL DOCUMENTS') + '</code></div>' +
              '<div><span style="color:var(--text-muted);">Kapasitas Dokumen:</span> <strong>' + PDM_UTILS.formatBytes(stats.totalCapacityBytes) + '</strong></div>' +
            '</div>' +
          '</div>' +

          '<div class="drive-card drive-b">' +
            '<div class="drive-card-top">' +
              '<div class="drive-title-group">' +
                '<span class="drive-badge-role" style="background:var(--status-green-bg);color:var(--status-green-text);">BACKUP VAULT (ONE-WAY)</span>' +
                '<strong style="font-size:14.5px;">Google Drive B (Akun Kedua)</strong>' +
              '</div>' +
              (dB.connected
                ? '<span class="badge badge-green"><span class="badge-dot"></span>Terhubung (' + PDM_UTILS.escapeHtml(dB.mode || 'BRIDGE') + ')</span>'
                : '<span class="badge badge-red"><span class="badge-dot"></span>Offline / Antrean Aktif</span>') +
            '</div>' +
            '<div style="font-size:12.5px;color:var(--text-secondary);display:flex;flex-wrap:wrap;gap:16px;">' +
              '<div><span style="color:var(--text-muted);">Akun:</span> <strong>' + PDM_UTILS.escapeHtml(dB.accountEmail || 'Backup Account B') + '</strong></div>' +
              '<div><span style="color:var(--text-muted);">Root Folder:</span> <code>/' + PDM_UTILS.escapeHtml(dB.rootFolderName || 'PERSONAL DOCUMENTS BACKUP') + '</code></div>' +
              '<div><span style="color:var(--text-muted);">Rasio Backup:</span> <strong style="color:var(--status-green-text);">' + stats.backupSuccessRate + '% Terverifikasi</strong></div>' +
            '</div>' +
          '</div>' +
        '</div>';
    }

    // 2. Kartu Metrik Statistik (10 Kartu untuk Admin, 8 Kartu untuk User)
    if (isAdmin) {
      html +=
        '<div class="stats-grid">' +
          buildStatCard('Total Dokumen Aktif', stats.totalDocuments, 'Total keseluruhan: ' + stats.totalAllDocuments + ' file', 'indigo', iconDoc()) +
          buildStatCard('Total Pengguna', stats.totalUsers, stats.activeUsers + ' pengguna aktif', 'violet', iconUsers()) +
          buildStatCard('Total Kapasitas', PDM_UTILS.formatBytes(stats.totalCapacityBytes), 'Tersimpan di Drive A & B', 'indigo', iconStorage()) +
          buildStatCard('Total PDF', stats.totalPDF, 'Dokumen portabel (.pdf)', 'rose', iconPdf()) +
          buildStatCard('Total JPG / JPEG', stats.totalJPG, 'Citra terkompresi (.jpg)', 'indigo', iconImage()) +
          buildStatCard('Total PNG', stats.totalPNG, 'Citra lossless (.png)', 'emerald', iconImage()) +
          buildStatCard('Backup Berhasil', stats.backupSuccess, stats.backupSuccessRate + '% terverifikasi di Drive B', 'emerald', iconCheck()) +
          buildStatCard('Backup Gagal', stats.backupFailed, 'Dijadwalkan retry otomatis', 'rose', iconAlert()) +
          buildStatCard('Belum / Menunggu Backup', stats.backupPending, 'Dalam antrean BACKUP_QUEUE', 'amber', iconClock()) +
          buildStatCard('Dokumen Diarsipkan', stats.totalArchived, 'Backup Drive B tetap utuh', 'slate', iconArchive()) +
        '</div>';
    } else {
      html +=
        '<div class="stats-grid">' +
          buildStatCard('Total Dokumen Pribadi', stats.totalDocuments, 'Ruang penyimpanan milik Anda', 'indigo', iconDoc()) +
          buildStatCard('Total Kapasitas', PDM_UTILS.formatBytes(stats.totalCapacityBytes), 'Pemakaian kuota pribadi', 'violet', iconStorage()) +
          buildStatCard('Dokumen PDF', stats.totalPDF, 'Format .pdf', 'rose', iconPdf()) +
          buildStatCard('Gambar JPG / JPEG', stats.totalJPG, 'Format .jpg / .jpeg', 'indigo', iconImage()) +
          buildStatCard('Gambar PNG', stats.totalPNG, 'Format .png', 'emerald', iconImage()) +
          buildStatCard('Sudah Dibackup', stats.backupSuccess, 'Tersimpan aman di Drive B', 'emerald', iconCheck()) +
          buildStatCard('Menunggu Backup', stats.backupPending + stats.backupFailed, 'Sedang diproses ke Drive B', 'amber', iconClock()) +
          buildStatCard('Arsip Pribadi', stats.totalArchived, 'Dapat dipulihkan kapan saja', 'slate', iconArchive()) +
        '</div>';
    }

    // 3. Grafik Komposisi Ekstensi & Pertumbuhan Dokumen / Ringkasan Backup
    var totalExt = Math.max(1, stats.totalPDF + stats.totalJPG + stats.totalPNG);
    var pdfPct = Math.round((stats.totalPDF / totalExt) * 100);
    var jpgPct = Math.round((stats.totalJPG / totalExt) * 100);
    var pngPct = Math.max(0, 100 - pdfPct - jpgPct);

    if (stats.totalAllDocuments === 0) {
      pdfPct = 0; jpgPct = 0; pngPct = 0;
    }

    html +=
      '<div class="dashboard-row">' +
        '<div class="card">' +
          '<div class="card-header">' +
            '<div>' +
              '<div class="card-title">Komposisi Format &amp; Pertumbuhan Dokumen</div>' +
              '<div class="card-subtitle">Distribusi tipe file (PDF, JPG/JPEG, PNG) dan tren unggahan bulanan</div>' +
            '</div>' +
            '<button class="btn btn-primary btn-sm" onclick="PDM_AUTH.navigateTo(\'upload\')">+ Upload Dokumen</button>' +
          '</div>' +

          '<div class="composition-bar">' +
            '<div class="comp-segment pdf" style="width:' + pdfPct + '%" title="PDF: ' + pdfPct + '%"></div>' +
            '<div class="comp-segment jpg" style="width:' + jpgPct + '%" title="JPG/JPEG: ' + jpgPct + '%"></div>' +
            '<div class="comp-segment png" style="width:' + pngPct + '%" title="PNG: ' + pngPct + '%"></div>' +
          '</div>' +

          '<div class="composition-legend">' +
            '<div class="legend-item"><span class="legend-dot" style="background:#ef4444;"></span>PDF: ' + stats.totalPDF + ' (' + pdfPct + '%)</div>' +
            '<div class="legend-item"><span class="legend-dot" style="background:#6366f1;"></span>JPG/JPEG: ' + stats.totalJPG + ' (' + jpgPct + '%)</div>' +
            '<div class="legend-item"><span class="legend-dot" style="background:#10b981;"></span>PNG: ' + stats.totalPNG + ' (' + pngPct + '%)</div>' +
          '</div>' +

          '<div style="margin-top:20px;">' +
            renderMonthlyGrowthChart(stats.monthlyGrowth || {}) +
          '</div>' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-header">' +
            '<div>' +
              '<div class="card-title">Ringkasan Replikasi Backup &amp; Kategori</div>' +
              '<div class="card-subtitle">Status sinkronisasi satu arah Drive A &rarr; Drive B</div>' +
            '</div>' +
            (isAdmin ? '<button class="btn btn-secondary btn-sm" onclick="PDM_AUTH.navigateTo(\'backup\')">Backup Center</button>' : '') +
          '</div>' +

          '<div style="padding:14px;background:var(--bg-surface-alt);border-radius:10px;border:1px solid var(--border-color);margin-bottom:16px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
              '<span style="font-size:12.5px;font-weight:700;">Tingkat Keberhasilan Auto-Backup</span>' +
              '<span class="badge badge-green">' + stats.backupSuccessRate + '% Terlindungi</span>' +
            '</div>' +
            '<div class="progress-bar-bg" style="height:10px;">' +
              '<div class="progress-bar-fill backup-fill" style="width:' + stats.backupSuccessRate + '%;"></div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-muted);margin-top:8px;">' +
              '<span>Hijau (Berhasil): <strong>' + stats.backupSuccess + '</strong></span>' +
              '<span>Kuning (Antrean): <strong>' + stats.backupPending + '</strong></span>' +
              '<span>Merah (Gagal): <strong>' + stats.backupFailed + '</strong></span>' +
            '</div>' +
          '</div>' +

          '<div style="font-size:12.5px;font-weight:700;color:var(--text-secondary);margin-bottom:10px;">Distribusi per Kategori Folder:</div>' +
          renderCategoryPills(stats.categoryBreakdown || {}) +
        '</div>' +
      '</div>';

    // 4. Tabel 10 Dokumen Terbaru & Log Aktivitas Pengguna
    html +=
      '<div class="dashboard-row">' +
        '<div class="card">' +
          '<div class="card-header">' +
            '<div>' +
              '<div class="card-title">10 Dokumen Terbaru</div>' +
              '<div class="card-subtitle">' + (isAdmin ? 'Unggahan terbaru dari seluruh pengguna' : 'Dokumen yang baru Anda unggah') + '</div>' +
            '</div>' +
            '<button class="btn btn-secondary btn-sm" onclick="PDM_AUTH.navigateTo(\'my-documents\')">Lihat Semua</button>' +
          '</div>' +
          renderRecentDocumentsTable(stats.recentDocuments || [], isAdmin) +
        '</div>' +

        '<div class="card">' +
          '<div class="card-header">' +
            '<div>' +
              '<div class="card-title">Statistik &amp; Log Aktivitas</div>' +
              '<div class="card-subtitle">Jejak audit autentikasi, dokumen, dan backup</div>' +
            '</div>' +
          '</div>' +
          renderActivityFeed(stats.recentActivities || []) +
        '</div>' +
      '</div>';

    container.innerHTML = html;
  }

  function buildStatCard(label, value, meta, colorClass, svgIcon) {
    return (
      '<div class="stat-card">' +
        '<div class="stat-info">' +
          '<div class="stat-label">' + PDM_UTILS.escapeHtml(label) + '</div>' +
          '<div class="stat-value">' + PDM_UTILS.escapeHtml(String(value)) + '</div>' +
          '<div class="stat-meta">' + PDM_UTILS.escapeHtml(meta) + '</div>' +
        '</div>' +
        '<div class="stat-icon ' + colorClass + '">' + svgIcon + '</div>' +
      '</div>'
    );
  }

  function renderMonthlyGrowthChart(monthlyGrowth) {
    var keys = Object.keys(monthlyGrowth).sort();
    if (keys.length === 0) {
      var curYm = new Date().toISOString().substring(0, 7);
      keys = [curYm];
      monthlyGrowth[curYm] = 0;
    }
    var recentKeys = keys.slice(-6);
    var maxVal = 1;
    recentKeys.forEach(function(k) {
      if (monthlyGrowth[k] > maxVal) maxVal = monthlyGrowth[k];
    });

    var cols = recentKeys.map(function(ym) {
      var count = monthlyGrowth[ym] || 0;
      var heightPct = Math.max(8, Math.round((count / maxVal) * 115));
      return (
        '<div class="bar-col">' +
          '<div class="bar-count">' + count + '</div>' +
          '<div class="bar-fill" style="height:' + heightPct + 'px;" title="' + ym + ': ' + count + ' dokumen"></div>' +
          '<div class="bar-label">' + PDM_UTILS.escapeHtml(ym) + '</div>' +
        '</div>'
      );
    }).join('');

    return '<div class="bar-chart-container">' + cols + '</div>';
  }

  function renderCategoryPills(catMap) {
    var keys = Object.keys(catMap);
    if (keys.length === 0) {
      return '<div style="font-size:12.5px;color:var(--text-muted);">Belum ada dokumen dalam kategori.</div>';
    }
    var items = keys.map(function(k) {
      return (
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;border-radius:7px;background:var(--bg-surface-alt);margin-bottom:6px;font-size:12.5px;">' +
          '<span style="font-weight:600;">' + PDM_UTILS.escapeHtml(k) + '</span>' +
          '<span class="badge badge-gray">' + catMap[k] + ' file</span>' +
        '</div>'
      );
    });
    return '<div>' + items.join('') + '</div>';
  }

  function renderRecentDocumentsTable(docs, isAdmin) {
    if (!docs || docs.length === 0) {
      return '<div class="empty-state"><p>Belum ada dokumen yang diunggah.</p></div>';
    }

    var rows = docs.map(function(doc) {
      return (
        '<tr>' +
          (isAdmin ? '<td><span style="font-weight:600;font-size:12.5px;">' + PDM_UTILS.escapeHtml(doc.OwnerName) + '</span></td>' : '') +
          '<td>' +
            '<div class="doc-name-cell">' +
              PDM_UTILS.renderFormatBadge(doc.Format) +
              '<a href="javascript:void(0)" onclick="PDM_AUTH.navigateTo(\'preview\', {documentId:\'' + PDM_UTILS.escapeHtml(doc.DocumentID) + '\', returnView:\'dashboard\'})" style="color:var(--text-primary);">' +
                PDM_UTILS.escapeHtml(doc.FileName) +
              '</a>' +
            '</div>' +
          '</td>' +
          '<td><span class="badge badge-gray">' + PDM_UTILS.escapeHtml(doc.Category) + '</span></td>' +
          '<td>' + PDM_UTILS.formatBytes(doc.FileSize) + '</td>' +
          '<td>' + PDM_UTILS.renderBackupBadge(doc.BackupStatus) + '</td>' +
          '<td>' +
            '<button class="btn btn-secondary btn-sm" onclick="PDM_AUTH.navigateTo(\'preview\', {documentId:\'' + PDM_UTILS.escapeHtml(doc.DocumentID) + '\', returnView:\'dashboard\'})">Preview</button>' +
          '</td>' +
        '</tr>'
      );
    }).join('');

    return (
      '<div class="table-responsive">' +
        '<table class="data-table">' +
          '<thead><tr>' +
            (isAdmin ? '<th>Pemilik</th>' : '') +
            '<th>Nama File</th>' +
            '<th>Kategori</th>' +
            '<th>Ukuran</th>' +
            '<th>Status Backup</th>' +
            '<th>Aksi</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>'
    );
  }

  function renderActivityFeed(activities) {
    if (!activities || activities.length === 0) {
      return '<div class="empty-state"><p>Belum ada aktivitas tercatat.</p></div>';
    }

    var items = activities.slice(0, 8).map(function(act) {
      return (
        '<div style="padding:9px 0;border-bottom:1px solid var(--border-subtle);display:flex;flex-direction:column;gap:2px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="font-size:11.5px;font-weight:700;color:var(--primary-600);">' + PDM_UTILS.escapeHtml(act.Action) + ' &bull; @' + PDM_UTILS.escapeHtml(act.Username) + '</span>' +
            '<span style="font-size:11px;color:var(--text-muted);">' + PDM_UTILS.formatDateTime(act.Timestamp) + '</span>' +
          '</div>' +
          '<div style="font-size:12.5px;color:var(--text-secondary);">' + PDM_UTILS.escapeHtml(act.Description) + '</div>' +
        '</div>'
      );
    }).join('');

    return '<div style="max-height:360px;overflow-y:auto;">' + items + '</div>';
  }

  // SVG Icons
  function iconDoc() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  }
  function iconUsers() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  }
  function iconStorage() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>';
  }
  function iconPdf() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M9 15h6"/><path d="M9 11h6"/></svg>';
  }
  function iconImage() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
  }
  function iconCheck() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  }
  function iconAlert() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  }
  function iconClock() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  }
  function iconArchive() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>';
  }

  return {
    loadDashboard: loadDashboard
  };

})();
