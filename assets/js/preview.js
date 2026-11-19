/**
 * ============================================================================
 * PERSONAL DOCUMENT MANAGER - SPLIT-VIEW PREVIEW & QR MODULE (preview.js)
 * Left Pane: PDF Viewer (Zoom, Page Navigation) & Image Viewer (Zoom, Fit, Rotate)
 * Right Pane: Full Metadata, Backup Integrity Status, Actions (Download, Archive,
 * Restore, Open in Drive [Role-checked]), and Authenticated App QR Code
 * ============================================================================
 */

window.PDM_PREVIEW = (function() {

  var _currentDoc = null;
  var _currentBlobUrl = null;
  var _returnView = 'my-documents';
  var _zoomLevel = 100;
  var _rotationDeg = 0;
  var _pdfPage = 1;

  async function loadDocumentPreview(documentId, returnView) {
    _returnView = returnView || 'my-documents';
    _zoomLevel = 100;
    _rotationDeg = 0;
    _pdfPage = 1;

    var stageEl = document.getElementById('previewCanvasStage');
    var metaContainer = document.getElementById('previewMetadataContainer');
    var toolbarTitle = document.getElementById('previewToolbarFileName');

    if (stageEl) {
      stageEl.innerHTML = '<div style="color:#cbd5e1;font-weight:600;">Memuat stream dokumen terautentikasi dari Google Drive...</div>';
    }
    if (metaContainer) {
      metaContainer.innerHTML = '<div style="color:var(--text-muted);">Memverifikasi kepemilikan &amp; metadata...</div>';
    }

    if (_currentBlobUrl) {
      try { URL.revokeObjectURL(_currentBlobUrl); } catch (e) {}
      _currentBlobUrl = null;
    }

    try {
      var data = await PDM_API.request('documents.preview', { DocumentID: documentId });
      _currentDoc = data.metadata;
      var content = data.content;

      if (toolbarTitle) {
        toolbarTitle.textContent = _currentDoc.FileName + ' (' + PDM_UTILS.formatBytes(_currentDoc.FileSize) + ')';
      }

      // Konversi Base64 ke Blob URL lokal
      var byteChars = atob(content.base64);
      var byteNumbers = new Array(byteChars.length);
      for (var i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      var byteArray = new Uint8Array(byteNumbers);
      var blob = new Blob([byteArray], { type: content.mimeType });
      _currentBlobUrl = URL.createObjectURL(blob);

      renderViewerStage(_currentDoc, _currentBlobUrl);
      renderMetadataPanel(_currentDoc, data.driveDirectUrl);

    } catch (err) {
      if (stageEl) {
        stageEl.innerHTML =
          '<div style="text-align:center;color:#f87171;padding:24px;">' +
            '<div style="font-weight:800;font-size:16px;margin-bottom:6px;">Gagal Memuat Pratinjau Dokumen</div>' +
            '<div style="font-size:13px;">' + PDM_UTILS.escapeHtml(err.message) + '</div>' +
          '</div>';
      }
    }
  }

  function renderViewerStage(doc, blobUrl) {
    var stageEl = document.getElementById('previewCanvasStage');
    var controlsEl = document.getElementById('previewZoomControls');
    if (!stageEl) return;

    var isPdf = (String(doc.Format).toUpperCase() === 'PDF' || String(doc.MIMEType).indexOf('pdf') !== -1);

    if (isPdf) {
      if (controlsEl) {
        controlsEl.innerHTML =
          '<button class="btn btn-secondary btn-sm" onclick="PDM_PREVIEW.changePdfPage(-1)">Hal -</button>' +
          '<span id="pdfPageIndicator" style="font-size:12px;font-weight:700;padding:0 6px;">Hal ' + _pdfPage + '</span>' +
          '<button class="btn btn-secondary btn-sm" onclick="PDM_PREVIEW.changePdfPage(1)">Hal +</button>' +
          '<button class="btn btn-secondary btn-sm" onclick="PDM_PREVIEW.adjustZoom(-25)">Zoom -</button>' +
          '<span id="zoomPctIndicator" style="font-size:12px;font-weight:700;padding:0 6px;">' + _zoomLevel + '%</span>' +
          '<button class="btn btn-secondary btn-sm" onclick="PDM_PREVIEW.adjustZoom(25)">Zoom +</button>';
      }
      stageEl.innerHTML =
        '<iframe id="pdfViewerIframe" src="' + blobUrl + '#page=' + _pdfPage + '&zoom=' + _zoomLevel + '" title="PDF Preview"></iframe>';
    } else {
      if (controlsEl) {
        controlsEl.innerHTML =
          '<button class="btn btn-secondary btn-sm" onclick="PDM_PREVIEW.adjustZoom(-20)">Zoom -</button>' +
          '<span id="zoomPctIndicator" style="font-size:12px;font-weight:700;padding:0 6px;">' + _zoomLevel + '%</span>' +
          '<button class="btn btn-secondary btn-sm" onclick="PDM_PREVIEW.adjustZoom(20)">Zoom +</button>' +
          '<button class="btn btn-secondary btn-sm" onclick="PDM_PREVIEW.resetImageZoom()">100%</button>' +
          '<button class="btn btn-secondary btn-sm" onclick="PDM_PREVIEW.rotateImage()">Putar 90&deg;</button>';
      }
      stageEl.innerHTML =
        '<img id="imageViewerEl" src="' + blobUrl + '" alt="' + PDM_UTILS.escapeHtml(doc.FileName) + '" style="transform:scale(' + (_zoomLevel / 100) + ') rotate(' + _rotationDeg + 'deg);" />';
    }
  }

  function adjustZoom(delta) {
    _zoomLevel = Math.max(40, Math.min(250, _zoomLevel + delta));
    var ind = document.getElementById('zoomPctIndicator');
    if (ind) ind.textContent = _zoomLevel + '%';

    var img = document.getElementById('imageViewerEl');
    if (img) {
      img.style.transform = 'scale(' + (_zoomLevel / 100) + ') rotate(' + _rotationDeg + 'deg)';
    }

    var iframe = document.getElementById('pdfViewerIframe');
    if (iframe && _currentBlobUrl) {
      iframe.src = _currentBlobUrl + '#page=' + _pdfPage + '&zoom=' + _zoomLevel;
    }
  }

  function resetImageZoom() {
    _zoomLevel = 100;
    _rotationDeg = 0;
    adjustZoom(0);
  }

  function rotateImage() {
    _rotationDeg = (_rotationDeg + 90) % 360;
    adjustZoom(0);
  }

  function changePdfPage(delta) {
    _pdfPage = Math.max(1, _pdfPage + delta);
    var pInd = document.getElementById('pdfPageIndicator');
    if (pInd) pInd.textContent = 'Hal ' + _pdfPage;
    var iframe = document.getElementById('pdfViewerIframe');
    if (iframe && _currentBlobUrl) {
      iframe.src = _currentBlobUrl + '#page=' + _pdfPage + '&zoom=' + _zoomLevel;
    }
  }

  function renderMetadataPanel(doc, driveDirectUrl) {
    var metaContainer = document.getElementById('previewMetadataContainer');
    if (!metaContainer) return;

    var baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/index.html');
    var authenticatedAppUrl = baseUrl + '?doc=' + encodeURIComponent(doc.DocumentID);
    var qrSvg = PDM_UTILS.generateAuthQrSvg(authenticatedAppUrl);

    var isArchived = (String(doc.Status).toUpperCase() === 'ARCHIVED');

    metaContainer.innerHTML =
      '<div class="metadata-list">' +
        '<div class="metadata-row"><span class="metadata-key">ID Dokumen</span><span class="metadata-val"><code>' + PDM_UTILS.escapeHtml(doc.DocumentID) + '</code></span></div>' +
        '<div class="metadata-row"><span class="metadata-key">Nama Pemilik</span><span class="metadata-val">' + PDM_UTILS.escapeHtml(doc.OwnerName) + '</span></div>' +
        '<div class="metadata-row"><span class="metadata-key">Nama File</span><span class="metadata-val">' + PDM_UTILS.escapeHtml(doc.FileName) + '</span></div>' +
        '<div class="metadata-row"><span class="metadata-key">Kategori Folder</span><span class="metadata-val"><span class="badge badge-gray">' + PDM_UTILS.escapeHtml(doc.Category) + '</span></span></div>' +
        '<div class="metadata-row"><span class="metadata-key">Format / MIME</span><span class="metadata-val">' + PDM_UTILS.renderFormatBadge(doc.Format) + ' <small style="color:var(--text-muted);">(' + PDM_UTILS.escapeHtml(doc.MIMEType) + ')</small></span></div>' +
        '<div class="metadata-row"><span class="metadata-key">Ukuran File</span><span class="metadata-val">' + PDM_UTILS.formatBytes(doc.FileSize) + '</span></div>' +
        '<div class="metadata-row"><span class="metadata-key">Tanggal Upload</span><span class="metadata-val">' + PDM_UTILS.formatDateTime(doc.CreatedAt) + '</span></div>' +
        '<div class="metadata-row"><span class="metadata-key">Status Dokumen</span><span class="metadata-val">' +
          (isArchived ? '<span class="badge badge-yellow">DIARSIPKAN (DRIVE A)</span>' : '<span class="badge badge-green">AKTIF (DRIVE A)</span>') +
        '</span></div>' +
        '<div class="metadata-row"><span class="metadata-key">Status Backup (Drive B)</span><span class="metadata-val">' + PDM_UTILS.renderBackupBadge(doc.BackupStatus) + '</span></div>' +
        '<div class="metadata-row"><span class="metadata-key">Tanggal Backup</span><span class="metadata-val">' + PDM_UTILS.formatDateTime(doc.BackupDate) + '</span></div>' +
        '<div class="metadata-row"><span class="metadata-key">Checksum SHA-256</span><span class="metadata-val"><code style="font-size:11px;">' + PDM_UTILS.escapeHtml((doc.Checksum || '').substring(0, 24)) + '...</code></span></div>' +
      '</div>' +

      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;">' +
        '<button class="btn btn-primary" style="flex:1;" onclick="PDM_DOCUMENTS.downloadDocument(\'' + PDM_UTILS.escapeHtml(doc.DocumentID) + '\')">Download File</button>' +
        '<button class="btn btn-secondary" onclick="PDM_PREVIEW.goBack()">Kembali</button>' +
      '</div>' +

      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">' +
        (!isArchived
          ? '<button class="btn btn-secondary btn-sm" style="flex:1;" onclick="PDM_DOCUMENTS.promptArchiveDocument(\'' + PDM_UTILS.escapeHtml(doc.DocumentID) + '\', \'' + PDM_UTILS.escapeHtml(doc.FileName) + '\')">Arsipkan Dokumen</button>'
          : '<button class="btn btn-success btn-sm" style="flex:1;" onclick="PDM_DOCUMENTS.restoreArchivedDocument(\'' + PDM_UTILS.escapeHtml(doc.DocumentID) + '\')">Pulihkan dari Arsip</button>') +
        (driveDirectUrl
          ? '<a class="btn btn-secondary btn-sm" href="' + PDM_UTILS.escapeHtml(driveDirectUrl) + '" target="_blank" rel="noopener noreferrer">Buka di Google Drive</a>'
          : '') +
      '</div>' +

      '<div class="qr-auth-box">' +
        '<div class="qr-canvas-holder" title="QR Tautan Aplikasi Terautentikasi">' + qrSvg + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:700;font-size:12.5px;color:var(--text-primary);">QR Code Akses Terautentikasi</div>' +
          '<div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;">Tautan ini menggunakan autentikasi aplikasi (bukan URL publik Drive). Hanya pemilik atau Administrator yang dapat membuka dokumen ini.</div>' +
          '<div style="margin-top:6px;">' +
            '<button class="btn btn-secondary btn-sm" style="font-size:11px;padding:4px 8px;" onclick="navigator.clipboard.writeText(\'' + PDM_UTILS.escapeHtml(authenticatedAppUrl) + '\');PDM_UTILS.showToast(\'Tautan Disalin\', \'Tautan dokumen terautentikasi berhasil disalin.\', \'success\')">Salin Tautan Aplikasi</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function goBack() {
    PDM_AUTH.navigateTo(_returnView || 'my-documents');
  }

  return {
    loadDocumentPreview: loadDocumentPreview,
    adjustZoom: adjustZoom,
    resetImageZoom: resetImageZoom,
    rotateImage: rotateImage,
    changePdfPage: changePdfPage,
    goBack: goBack
  };

})();
