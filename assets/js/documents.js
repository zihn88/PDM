/**
 * ============================================================================
 * PERSONAL DOCUMENT MANAGER - DOCUMENTS, SEARCH & ARCHIVE MODULE (documents.js)
 * Handles:
 * 1. Dokumen Saya (Active Documents)
 * 2. Pencarian Dokumen (Multi-Filter: Nama, Pemilik [Admin], Kategori, Format,
 *    Tanggal Upload, Status Backup, Sorting, Pagination 10/25/50/100)
 * 3. Arsip Dokumen (Soft-Deleted in Drive A while Drive B Backup stays intact,
 *    Restore to Active, and Admin-Only Permanent Delete with Confirmation)
 * 4. Edit Metadata Modal & Direct Download
 * ============================================================================
 */

window.PDM_DOCUMENTS = (function() {

  var _state = {
    mode: 'ACTIVE', // 'ACTIVE', 'SEARCH', 'ARCHIVE'
    page: 1,
    limit: 10,
    sortBy: 'CreatedAt',
    sortDir: 'DESC',
    query: '',
    category: 'ALL',
    format: 'ALL',
    ownerId: 'ALL',
    backupStatus: 'ALL',
    dateFrom: '',
    dateTo: '',
    categoriesCache: [],
    usersCache: []
  };

  async function refreshFilterMetadata(forceFresh) {
    var user = PDM_AUTH.getCachedUser();
    // Fast-path: jika metadata sudah ada di memory cache, gunakan langsung tanpa jeda (0 ms)
    if (!forceFresh && _state.categoriesCache && _state.categoriesCache.length > 0) {
      populateCategoryDropdowns();
      if (user && user.Role === 'ADMIN' && _state.usersCache && _state.usersCache.length > 0) {
        populateOwnerDropdown();
      }
      return;
    }
    try {
      _state.categoriesCache = await PDM_API.request('categories.list', {}, { bypassCache: !!forceFresh });
      if (user && user.Role === 'ADMIN') {
        _state.usersCache = await PDM_API.request('users.list', {}, { bypassCache: !!forceFresh });
      }
    } catch (e) {}
    populateCategoryDropdowns();
    populateOwnerDropdown();
  }

  function populateCategoryDropdowns() {
    var selects = document.querySelectorAll('.dynamic-category-select');
    selects.forEach(function(sel) {
      var includeAll = sel.getAttribute('data-include-all') === 'true';
      var currentVal = sel.value;
      var html = includeAll ? '<option value="ALL">Semua Kategori</option>' : '';
      _state.categoriesCache.forEach(function(c) {
        html += '<option value="' + PDM_UTILS.escapeHtml(c.CategoryName) + '">' + PDM_UTILS.escapeHtml(c.CategoryName) + '</option>';
      });
      sel.innerHTML = html;
      if (currentVal) sel.value = currentVal;
    });
  }

  function populateOwnerDropdown() {
    var sel = document.getElementById('searchOwnerSelect');
    if (!sel) return;
    var html = '<option value="ALL">Semua Pemilik</option>';
    _state.usersCache.forEach(function(u) {
      html += '<option value="' + PDM_UTILS.escapeHtml(u.UserID) + '">' + PDM_UTILS.escapeHtml(u.Nama) + ' (@' + PDM_UTILS.escapeHtml(u.Username) + ')</option>';
    });
    sel.innerHTML = html;
  }

  /**
   * 1. Buka Menu "Dokumen Saya"
   */
  async function openMyDocumentsView() {
    _state.mode = 'ACTIVE';
    _state.page = 1;
    // Jalankan metadata filter secara paralel (non-blocking) agar tabel langsung dimuat
    refreshFilterMetadata();
    await fetchAndRenderTable('myDocsTableContainer', {
      status: 'ACTIVE',
      query: (document.getElementById('myDocsQuickSearch') || {}).value || '',
      category: (document.getElementById('myDocsCategoryFilter') || {}).value || 'ALL',
      format: (document.getElementById('myDocsFormatFilter') || {}).value || 'ALL',
      page: _state.page,
      limit: _state.limit,
      sortBy: _state.sortBy,
      sortDir: _state.sortDir
    });
  }

  /**
   * 2. Buka Menu "Pencarian Dokumen"
   */
  async function openSearchView() {
    _state.mode = 'SEARCH';
    _state.page = 1;
    refreshFilterMetadata();
    await runAdvancedSearch(1);
  }

  async function runAdvancedSearch(pageNum) {
    _state.page = pageNum || 1;
    var q = (document.getElementById('searchQueryInput') || {}).value || '';
    var cat = (document.getElementById('searchCategorySelect') || {}).value || 'ALL';
    var fmt = (document.getElementById('searchFormatSelect') || {}).value || 'ALL';
    var own = (document.getElementById('searchOwnerSelect') || {}).value || 'ALL';
    var bkp = (document.getElementById('searchBackupSelect') || {}).value || 'ALL';
    var dFrom = (document.getElementById('searchDateFrom') || {}).value || '';
    var dTo = (document.getElementById('searchDateTo') || {}).value || '';
    var lim = parseInt((document.getElementById('searchLimitSelect') || {}).value || _state.limit, 10);
    _state.limit = lim;

    await fetchAndRenderTable('searchResultsTableContainer', {
      status: 'ACTIVE',
      query: q,
      category: cat,
      format: fmt,
      ownerId: own,
      backupStatus: bkp,
      dateFrom: dFrom,
      dateTo: dTo,
      page: _state.page,
      limit: _state.limit,
      sortBy: _state.sortBy,
      sortDir: _state.sortDir
    });
  }

  /**
   * 3. Buka Menu "Arsip Dokumen"
   */
  async function openArchiveView() {
    _state.mode = 'ARCHIVE';
    _state.page = 1;
    refreshFilterMetadata();
    await fetchAndRenderTable('archiveTableContainer', {
      status: 'ARCHIVED',
      query: (document.getElementById('archiveQuickSearch') || {}).value || '',
      page: _state.page,
      limit: _state.limit,
      sortBy: 'UpdatedAt',
      sortDir: 'DESC'
    });
  }

  /**
   * Mengambil data dokumen dari API dan merender tabel lengkap dengan sorting & pagination
   */
  async function fetchAndRenderTable(containerId, filterParams) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var hasCached = (window.PDM_API && typeof PDM_API.getCached === 'function')
      ? !!PDM_API.getCached('documents.list', filterParams)
      : false;
    if (!hasCached && !container.innerHTML.trim()) {
      container.innerHTML =
        '<div class="empty-state" style="padding:32px 16px;">' +
          '<p style="color:var(--text-secondary);font-weight:600;">Memuat daftar dokumen...</p>' +
        '</div>';
    }

    try {
      var res = await PDM_API.request('documents.list', filterParams);
      var items = res.items || [];
      var pg = res.pagination || { page: 1, limit: 10, totalItems: 0, totalPages: 1 };
      var user = PDM_AUTH.getCachedUser();
      var isAdmin = (user && user.Role === 'ADMIN');
      var isArchiveView = (filterParams.status === 'ARCHIVED');
      var returnViewName = isArchiveView ? 'archive' : (_state.mode === 'SEARCH' ? 'search' : 'my-documents');

      if (items.length === 0) {
        container.innerHTML =
          '<div class="empty-state">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
            '<h4 style="color:var(--text-primary);margin-bottom:4px;">Tidak Ada Dokumen Ditemukan</h4>' +
            '<p style="font-size:12.5px;">' +
              (isArchiveView
                ? 'Belum ada dokumen yang diarsipkan. Semua dokumen Anda berada dalam daftar aktif.'
                : 'Belum ada dokumen yang sesuai dengan kriteria filter pencarian Anda.') +
            '</p>' +
          '</div>';
        return;
      }

      var rowsHtml = items.map(function(doc) {
        var docIdEsc = PDM_UTILS.escapeHtml(doc.DocumentID);
        var fileNameEsc = PDM_UTILS.escapeHtml(doc.FileName);

        var actionsHtml = '';
        if (!isArchiveView) {
          actionsHtml =
            '<div class="action-btn-group">' +
              '<button class="btn btn-secondary btn-sm" title="Preview Dokumen" onclick="PDM_AUTH.navigateTo(\'preview\', {documentId:\'' + docIdEsc + '\', returnView:\'' + returnViewName + '\'})">Preview</button>' +
              '<button class="btn btn-secondary btn-sm" title="Download Dokumen" onclick="PDM_DOCUMENTS.downloadDocument(\'' + docIdEsc + '\')">Download</button>' +
              '<button class="btn btn-secondary btn-sm" title="Edit Metadata" onclick="PDM_DOCUMENTS.openEditMetadataModal(\'' + docIdEsc + '\')">Edit</button>' +
              '<button class="btn btn-ghost btn-sm" style="color:var(--status-yellow-text);" title="Arsipkan Dokumen (Backup Drive B tetap aman)" onclick="PDM_DOCUMENTS.promptArchiveDocument(\'' + docIdEsc + '\', \'' + fileNameEsc + '\')">Arsipkan</button>' +
            '</div>';
        } else {
          actionsHtml =
            '<div class="action-btn-group">' +
              '<button class="btn btn-secondary btn-sm" onclick="PDM_AUTH.navigateTo(\'preview\', {documentId:\'' + docIdEsc + '\', returnView:\'archive\'})">Preview</button>' +
              '<button class="btn btn-success btn-sm" onclick="PDM_DOCUMENTS.restoreArchivedDocument(\'' + docIdEsc + '\')">Pulihkan</button>' +
              (isAdmin
                ? '<button class="btn btn-danger btn-sm" onclick="PDM_DOCUMENTS.promptPermanentDelete(\'' + docIdEsc + '\', \'' + fileNameEsc + '\')">Hapus Permanen</button>'
                : '') +
            '</div>';
        }

        return (
          '<tr>' +
            '<td><span style="font-weight:600;font-size:12.5px;">' + PDM_UTILS.escapeHtml(doc.OwnerName) + '</span></td>' +
            '<td>' +
              '<div class="doc-name-cell">' +
                '<a href="javascript:void(0)" onclick="PDM_AUTH.navigateTo(\'preview\', {documentId:\'' + docIdEsc + '\', returnView:\'' + returnViewName + '\'})" style="color:var(--text-primary);">' +
                  fileNameEsc +
                '</a>' +
              '</div>' +
              (doc.Description ? '<div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;">' + PDM_UTILS.escapeHtml(doc.Description) + '</div>' : '') +
            '</td>' +
            '<td><span class="badge badge-gray">' + PDM_UTILS.escapeHtml(doc.Category) + '</span></td>' +
            '<td>' + PDM_UTILS.renderFormatBadge(doc.Format) + '</td>' +
            '<td>' + PDM_UTILS.formatBytes(doc.FileSize) + '</td>' +
            '<td>' + PDM_UTILS.formatDateTime(doc.CreatedAt) + '</td>' +
            '<td>' + PDM_UTILS.renderBackupBadge(doc.BackupStatus) + '</td>' +
            '<td>' + actionsHtml + '</td>' +
          '</tr>'
        );
      }).join('');

      var sortIndicator = function(col) {
        if (_state.sortBy !== col) return ' &#8597;';
        return _state.sortDir === 'ASC' ? ' &#8593;' : ' &#8595;';
      };

      var limitOptionsHtml = [10, 25, 50, 100].map(function(n) {
        return '<option value="' + n + '"' + (pg.limit === n ? ' selected' : '') + '>' + n + ' baris</option>';
      }).join('');

      container.innerHTML =
        '<div class="table-responsive">' +
          '<table class="data-table">' +
            '<thead>' +
              '<tr>' +
                '<th class="sortable" onclick="PDM_DOCUMENTS.changeSort(\'OwnerName\')">Pemilik' + sortIndicator('OwnerName') + '</th>' +
                '<th class="sortable" onclick="PDM_DOCUMENTS.changeSort(\'FileName\')">Nama File' + sortIndicator('FileName') + '</th>' +
                '<th class="sortable" onclick="PDM_DOCUMENTS.changeSort(\'Category\')">Kategori' + sortIndicator('Category') + '</th>' +
                '<th class="sortable" onclick="PDM_DOCUMENTS.changeSort(\'Format\')">Format' + sortIndicator('Format') + '</th>' +
                '<th class="sortable" onclick="PDM_DOCUMENTS.changeSort(\'FileSize\')">Ukuran' + sortIndicator('FileSize') + '</th>' +
                '<th class="sortable" onclick="PDM_DOCUMENTS.changeSort(\'CreatedAt\')">Tanggal Upload' + sortIndicator('CreatedAt') + '</th>' +
                '<th class="sortable" onclick="PDM_DOCUMENTS.changeSort(\'BackupStatus\')">Status Backup' + sortIndicator('BackupStatus') + '</th>' +
                '<th>Aksi</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' + rowsHtml + '</tbody>' +
          '</table>' +
        '</div>' +

        '<div class="pagination-bar">' +
          '<div class="pagination-info">' +
            '<span>Menampilkan halaman <strong>' + pg.page + '</strong> dari <strong>' + pg.totalPages + '</strong> (Total <strong>' + pg.totalItems + '</strong> dokumen)</span>' +
            '<select class="form-control" style="width:auto;padding:5px 10px;font-size:12px;" onchange="PDM_DOCUMENTS.changePageLimit(this.value)">' +
              limitOptionsHtml +
            '</select>' +
          '</div>' +
          '<div class="pagination-controls">' +
            '<button class="btn btn-secondary btn-sm" ' + (pg.page <= 1 ? 'disabled' : '') + ' onclick="PDM_DOCUMENTS.goToPage(' + (pg.page - 1) + ')">Sebelumnya</button>' +
            '<button class="btn btn-secondary btn-sm" ' + (pg.page >= pg.totalPages ? 'disabled' : '') + ' onclick="PDM_DOCUMENTS.goToPage(' + (pg.page + 1) + ')">Berikutnya</button>' +
          '</div>' +
        '</div>';

    } catch (err) {
      container.innerHTML = '<div class="empty-state"><p style="color:var(--status-red-text);">' + PDM_UTILS.escapeHtml(err.message) + '</p></div>';
    }
  }

  function changeSort(columnName) {
    if (_state.sortBy === columnName) {
      _state.sortDir = (_state.sortDir === 'ASC') ? 'DESC' : 'ASC';
    } else {
      _state.sortBy = columnName;
      _state.sortDir = 'ASC';
    }
    reloadCurrentMode();
  }

  function changePageLimit(newLimit) {
    _state.limit = parseInt(newLimit, 10) || 10;
    _state.page = 1;
    var searchLim = document.getElementById('searchLimitSelect');
    if (searchLim) searchLim.value = String(_state.limit);
    reloadCurrentMode();
  }

  function goToPage(pageNum) {
    _state.page = Math.max(1, pageNum);
    reloadCurrentMode();
  }

  function reloadCurrentMode() {
    if (_state.mode === 'SEARCH') {
      runAdvancedSearch(_state.page);
    } else if (_state.mode === 'ARCHIVE') {
      openArchiveView();
    } else {
      fetchAndRenderTable('myDocsTableContainer', {
        status: 'ACTIVE',
        query: (document.getElementById('myDocsQuickSearch') || {}).value || '',
        category: (document.getElementById('myDocsCategoryFilter') || {}).value || 'ALL',
        format: (document.getElementById('myDocsFormatFilter') || {}).value || 'ALL',
        page: _state.page,
        limit: _state.limit,
        sortBy: _state.sortBy,
        sortDir: _state.sortDir
      });
    }
  }

  /**
   * Download Dokumen secara Terautentikasi
   */
  async function downloadDocument(documentId) {
    try {
      PDM_UTILS.showToast('Menyiapkan Unduhan', 'Mengambil stream terenkripsi dari Google Drive...', 'info');
      var res = await PDM_API.request('documents.preview', { DocumentID: documentId });
      var content = res.content;
      var byteChars = atob(content.base64);
      var byteNumbers = new Array(byteChars.length);
      for (var i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      var byteArray = new Uint8Array(byteNumbers);
      var blob = new Blob([byteArray], { type: content.mimeType || 'application/octet-stream' });
      var blobUrl = URL.createObjectURL(blob);

      var a = document.createElement('a');
      a.href = blobUrl;
      a.download = content.fileName || 'dokumen';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function() { URL.revokeObjectURL(blobUrl); }, 5000);

      PDM_UTILS.showToast('Unduhan Berhasil', 'File "' + content.fileName + '" berhasil diunduh.', 'success');
    } catch (err) {
      PDM_UTILS.showToast('Gagal Mengunduh', err.message, 'error');
    }
  }

  /**
   * Modal Edit Metadata Dokumen
   */
  async function openEditMetadataModal(documentId) {
    try {
      var doc = await PDM_API.request('documents.detail', { DocumentID: documentId });
      document.getElementById('editMetaDocId').value = doc.DocumentID;
      document.getElementById('editMetaFileName').value = doc.FileName;
      document.getElementById('editMetaCategory').value = doc.Category;
      document.getElementById('editMetaDescription').value = doc.Description || '';
      document.getElementById('editMetadataModal').classList.add('open');
    } catch (err) {
      PDM_UTILS.showToast('Gagal Memuat Metadata', err.message, 'error');
    }
  }

  async function saveMetadataChanges(e) {
    if (e) e.preventDefault();
    var docId = document.getElementById('editMetaDocId').value;
    var fName = document.getElementById('editMetaFileName').value.trim();
    var cat = document.getElementById('editMetaCategory').value;
    var desc = document.getElementById('editMetaDescription').value.trim();

    if (!fName) {
      PDM_UTILS.showToast('Validasi', 'Nama file tidak boleh kosong.', 'warning');
      return;
    }

    try {
      await PDM_API.request('documents.updateMetadata', {
        DocumentID: docId,
        FileName: fName,
        Category: cat,
        Description: desc
      });
      document.getElementById('editMetadataModal').classList.remove('open');
      PDM_UTILS.showToast('Metadata Diperbarui', 'Perubahan informasi dokumen telah disimpan ke Spreadsheet & Drive A.', 'success');
      reloadCurrentMode();
    } catch (err) {
      PDM_UTILS.showToast('Gagal Menyimpan', err.message, 'error');
    }
  }

  /**
   * Arsipkan Dokumen (Soft-Delete ke Folder Arsip Drive A; Backup Drive B Tetap Utuh!)
   */
  function promptArchiveDocument(documentId, fileName) {
    document.getElementById('archiveConfirmDocId').value = documentId;
    document.getElementById('archiveConfirmFileName').textContent = fileName;
    document.getElementById('archiveReasonInput').value = 'Diarsipkan dari daftar dokumen aktif';
    document.getElementById('archiveConfirmModal').classList.add('open');
  }

  async function executeArchiveDocument() {
    var docId = document.getElementById('archiveConfirmDocId').value;
    var reason = document.getElementById('archiveReasonInput').value.trim();
    try {
      var res = await PDM_API.request('archive.archiveDocument', {
        DocumentID: docId,
        reason: reason
      });
      document.getElementById('archiveConfirmModal').classList.remove('open');
      PDM_UTILS.showToast(
        'Dokumen Diarsipkan',
        'File utama dipindahkan ke Folder Arsip Drive A. Salinan Backup di Drive B TETAP UTUH.',
        'success'
      );
      reloadCurrentMode();
      if (window.PDM_DASHBOARD) PDM_DASHBOARD.loadDashboard();
    } catch (err) {
      PDM_UTILS.showToast('Gagal Mengarsipkan', err.message, 'error');
    }
  }

  /**
   * Pulihkan Dokumen dari Arsip ke Daftar Aktif
   */
  async function restoreArchivedDocument(documentId) {
    try {
      await PDM_API.request('archive.restoreDocument', { DocumentID: documentId });
      PDM_UTILS.showToast(
        'Dokumen Dipulihkan',
        'File utama dikembalikan ke folder aktif Drive A dan relasi backup Drive B tetap terjaga.',
        'success'
      );
      reloadCurrentMode();
      if (window.PDM_DASHBOARD) PDM_DASHBOARD.loadDashboard();
    } catch (err) {
      PDM_UTILS.showToast('Gagal Memulihkan', err.message, 'error');
    }
  }

  /**
   * Hapus Permanen (Khusus Administrator dengan Konfirmasi Ketik "HAPUS PERMANEN")
   */
  function promptPermanentDelete(documentId, fileName) {
    document.getElementById('permDeleteDocId').value = documentId;
    document.getElementById('permDeleteFileName').textContent = fileName;
    document.getElementById('permDeleteConfirmInput').value = '';
    document.getElementById('permDeleteReasonInput').value = '';
    document.getElementById('permanentDeleteModal').classList.add('open');
  }

  async function executePermanentDelete() {
    var docId = document.getElementById('permDeleteDocId').value;
    var confirmTxt = document.getElementById('permDeleteConfirmInput').value.trim();
    var reason = document.getElementById('permDeleteReasonInput').value.trim() || 'Dihapus permanen oleh Administrator';

    try {
      await PDM_API.request('archive.permanentDelete', {
        DocumentID: docId,
        confirmationText: confirmTxt,
        reason: reason
      });
      document.getElementById('permanentDeleteModal').classList.remove('open');
      PDM_UTILS.showToast(
        'File Utama Dihapus Permanen',
        'Dokumen utama dihapus dari Drive A dan dicatat ke log audit. Salinan cadangan di Drive B tetap terlindungi.',
        'warning'
      );
      openArchiveView();
    } catch (err) {
      PDM_UTILS.showToast('Konfirmasi Ditolak', err.message, 'error');
    }
  }

  return {
    openMyDocumentsView: openMyDocumentsView,
    openSearchView: openSearchView,
    runAdvancedSearch: runAdvancedSearch,
    openArchiveView: openArchiveView,
    changeSort: changeSort,
    changePageLimit: changePageLimit,
    goToPage: goToPage,
    reloadCurrentMode: reloadCurrentMode,
    downloadDocument: downloadDocument,
    openEditMetadataModal: openEditMetadataModal,
    saveMetadataChanges: saveMetadataChanges,
    promptArchiveDocument: promptArchiveDocument,
    executeArchiveDocument: executeArchiveDocument,
    restoreArchivedDocument: restoreArchivedDocument,
    promptPermanentDelete: promptPermanentDelete,
    executePermanentDelete: executePermanentDelete
  };

})();
