// manage-storage.js - Billey WhatsApp Gateway Storage & Gallery Management
// Includes Multi-Select Media Deletion & Per-Session Select All

let globalGalleryData = [];
let currentFilterSession = 'ALL';
const selectedMediaMap = new Map(); // key: url, value: { url, session, name, size }

$(document).ready(function() {
    loadStorageStats();
    loadGallery();
});

// Load overall storage statistics
function loadStorageStats() {
    $('#storage-total-size').text('Memuat...');
    
    $.ajax({
        url: '/api/storage/stats',
        method: 'GET',
        success: function(res) {
            if (res.success) {
                const data = res.data;
                $('#storage-total-size').text(formatBytes(data.totalSize));
                $('#storage-file-count').text(data.fileCount + ' File Media Tersimpan');
                
                if (data.oldestFileDate) {
                    $('#storage-oldest-date').text(formatDate(data.oldestFileDate));
                } else {
                    $('#storage-oldest-date').text('-');
                }
                
                if (data.newestFileDate) {
                    $('#storage-newest-date').text(formatDate(data.newestFileDate));
                } else {
                    $('#storage-newest-date').text('-');
                }
            } else {
                toastr.error('Gagal memuat statistik storage');
            }
        },
        error: function(err) {
            toastr.error('Kesalahan koneksi ke server saat memuat statistik');
        }
    });
}

// Load gallery media grouped by session
function loadGallery() {
    $('#gallery-container').html(`
        <div class="d-flex flex-column flex-center py-10">
            <div class="spinner-border text-primary" role="status"></div>
            <div class="text-muted mt-3">Memuat galeri media...</div>
        </div>
    `);
    
    $.ajax({
        url: '/api/storage/gallery',
        method: 'GET',
        success: function(res) {
            if (res.success && res.data.length > 0) {
                globalGalleryData = res.data;
                populateSessionFilterDropdown(globalGalleryData);
                renderGallery();
            } else if (res.success) {
                globalGalleryData = [];
                populateSessionFilterDropdown([]);
                $('#gallery-container').html('<div class="text-center text-muted py-10"><i class="bi bi-images fs-2x text-gray-400 d-block mb-3"></i>Tidak ada media yang ditemukan di server.</div>');
                unselectAllMedia();
            } else {
                $('#gallery-container').html('<div class="text-center text-danger py-10"><i class="bi bi-exclamation-octagon fs-2x d-block mb-2"></i>Gagal memuat galeri.</div>');
            }
        },
        error: function() {
            $('#gallery-container').html('<div class="text-center text-danger py-10"><i class="bi bi-wifi-off fs-2x d-block mb-2"></i>Kesalahan koneksi ke server.</div>');
        }
    });
}

// Populate the session filter dropdown
function populateSessionFilterDropdown(data) {
    const $select = $('#gallery-session-filter');
    const prevVal = $select.val() || 'ALL';
    $select.empty();
    
    $select.append('<option value="ALL">Semua Sesi (' + data.length + ')</option>');
    data.forEach(item => {
        $select.append(`<option value="${escapeHtmlAttr(item.session)}">${escapeHtml(item.session)} (${item.count})</option>`);
    });

    if (data.some(d => d.session === prevVal)) {
        $select.val(prevVal);
        currentFilterSession = prevVal;
    } else {
        $select.val('ALL');
        currentFilterSession = 'ALL';
    }
}

// Filter gallery view by session
window.filterGalleryBySession = function() {
    currentFilterSession = $('#gallery-session-filter').val() || 'ALL';
    renderGallery();
};

// Render gallery items according to current filter
function renderGallery() {
    let filteredData = globalGalleryData;
    if (currentFilterSession !== 'ALL') {
        filteredData = globalGalleryData.filter(f => f.session === currentFilterSession);
    }

    if (!filteredData || filteredData.length === 0) {
        $('#gallery-container').html(`
            <div class="text-center text-muted py-10">
                <i class="bi bi-folder2-open fs-2x text-gray-400 d-block mb-3"></i>
                Tidak ada media untuk sesi <strong>${escapeHtml(currentFilterSession)}</strong>.
            </div>
        `);
        return;
    }

    let html = '';

    filteredData.forEach(folder => {
        const totalSessionFiles = folder.files.length;
        
        // Count how many files in this folder are already selected
        let sessionSelectedCount = 0;
        folder.files.forEach(f => {
            if (selectedMediaMap.has(f.url)) sessionSelectedCount++;
        });
        const isAllSelectedInSession = totalSessionFiles > 0 && sessionSelectedCount === totalSessionFiles;
        const isIndeterminate = sessionSelectedCount > 0 && sessionSelectedCount < totalSessionFiles;

        html += `
        <div class="session-gallery-block mb-10" data-session="${escapeHtmlAttr(folder.session)}">
            <!-- Session Section Header with Select All & Direct Delete -->
            <div class="d-flex align-items-center justify-content-between p-4 mb-4 rounded-3 bg-light-subtle border border-dashed border-gray-300 flex-wrap gap-3">
                <div class="d-flex align-items-center flex-wrap gap-2">
                    <span class="symbol symbol-35px symbol-circle me-1">
                        <span class="symbol-label bg-light-warning text-warning">
                            <i class="bi bi-folder-fill fs-4"></i>
                        </span>
                    </span>
                    <h5 class="fw-bold text-gray-900 mb-0">${escapeHtml(folder.session)}</h5>
                    <span class="badge badge-light-primary ms-2">${folder.count} file</span>
                    <span class="badge badge-light-info">${formatBytes(folder.totalSize)}</span>
                </div>

                <div class="d-flex align-items-center gap-3">
                    <!-- Select All for this 1 Session Only -->
                    <label class="form-check form-check-custom form-check-sm form-check-solid cursor-pointer user-select-none" title="Pilih semua file dalam sesi ${escapeHtmlAttr(folder.session)}">
                        <input class="form-check-input select-session-all-cb" type="checkbox" 
                            data-session="${escapeHtmlAttr(folder.session)}" 
                            ${isAllSelectedInSession ? 'checked' : ''} 
                            ${isIndeterminate ? 'data-indeterminate="true"' : ''}
                            onchange="toggleSelectSession('${escapeHtmlAttr(folder.session)}', this.checked)">
                        <span class="form-check-label fw-bold fs-7 text-gray-700">
                            Pilih Semua di Sesi Ini
                        </span>
                    </label>

                    <!-- Direct delete all files in this session button -->
                    <button type="button" class="btn btn-sm btn-light-danger py-1 px-3 fs-8 fw-semibold" 
                        style="height: 30px; line-height: 1;"
                        onclick="deleteSessionDirectly('${escapeHtmlAttr(folder.session)}', ${folder.count})" 
                        title="Hapus semua ${folder.count} file media pada sesi ${escapeHtmlAttr(folder.session)}">
                        <i class="bi bi-trash me-1"></i>Hapus Semua Sesi Ini
                    </button>
                </div>
            </div>

            <!-- Media Grid -->
            <div class="row g-4">
        `;

        folder.files.forEach(file => {
            const isImage = file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            const isVideo = file.name.match(/\.(mp4|webm|ogg)$/i);
            const isAudio = file.name.match(/\.(mp3|wav|ogg|m4a|aac)$/i);
            const isChecked = selectedMediaMap.has(file.url);
            const cardSelectedClass = isChecked ? 'is-selected' : 'border-gray-200';

            html += `
                <div class="col-sm-6 col-md-4 col-xl-2 col-xxl-2">
                    <div class="card h-100 media-card position-relative cursor-pointer transition-all border ${cardSelectedClass}" 
                        id="media-card-${encodeId(file.url)}"
                        data-url="${escapeHtmlAttr(file.url)}" 
                        data-session="${escapeHtmlAttr(folder.session)}" 
                        data-name="${escapeHtmlAttr(file.name)}" 
                        data-size="${file.size}"
                        onclick="handleCardClick(event, this)">
                        
                        <!-- Checkbox in top-left overlay -->
                        <div class="media-checkbox-wrapper">
                            <input type="checkbox" class="form-check-input media-checkbox" 
                                data-url="${escapeHtmlAttr(file.url)}" 
                                data-session="${escapeHtmlAttr(folder.session)}" 
                                data-name="${escapeHtmlAttr(file.name)}" 
                                data-size="${file.size}" 
                                ${isChecked ? 'checked' : ''}
                                onchange="handleCheckboxChange(this, event)">
                        </div>

                        <!-- Thumbnail Preview Area -->
                        <div class="media-thumb-box p-2">
            `;

            if (isImage) {
                html += `<img src="${file.url}" class="img-fluid rounded" style="max-height: 110px; max-width: 100%; object-fit: contain;" alt="${escapeHtml(file.name)}" loading="lazy">`;
            } else if (isVideo) {
                html += `<video src="${file.url}" class="img-fluid rounded shadow-xs" style="max-height: 110px; max-width: 95%;" controls preload="metadata" onclick="event.stopPropagation();"></video>`;
            } else if (isAudio) {
                html += `<i class="bi bi-file-earmark-music fs-3x text-warning mb-1"></i><span class="fs-9 text-muted font-monospace">Audio</span>`;
            } else {
                html += `<i class="bi bi-file-earmark-text fs-3x text-muted mb-1"></i><span class="fs-9 text-muted font-monospace">${escapeHtml(file.name.split('.').pop() || 'File')}</span>`;
            }

            html += `
                        </div>

                        <!-- Card Footer / File Info -->
                        <div class="card-footer p-3 text-center border-0 bg-transparent">
                            <div class="text-truncate fs-8 text-gray-800 fw-bold mb-1" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
                            <div class="text-muted fs-9 mb-2">${formatBytes(file.size)} &bull; ${formatDate(file.date)}</div>
                            
                            <div class="d-flex align-items-center gap-2 pt-2 border-top border-gray-100">
                                <a href="${file.url}" target="_blank" class="btn btn-light-primary media-btn-open flex-grow-1" 
                                    onclick="event.stopPropagation();" title="Buka / Download file di tab baru">
                                    <i class="bi bi-box-arrow-up-right fs-9 text-primary"></i>
                                    <span>Buka</span>
                                </a>
                                <button type="button" class="btn btn-light-danger media-btn-delete" 
                                    onclick="deleteSingleMedia(event, '${escapeHtmlAttr(file.url)}', '${escapeHtmlAttr(file.name)}', '${escapeHtmlAttr(folder.session)}')" 
                                    title="Hapus file ini">
                                    <i class="bi bi-trash fs-8"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `
            </div>
        </div>
        <div class="separator separator-dashed my-8"></div>
        `;
    });

    $('#gallery-container').html(html);

    // Apply indeterminate state to session checkboxes if needed
    document.querySelectorAll('.select-session-all-cb[data-indeterminate="true"]').forEach(el => {
        el.indeterminate = true;
    });

    updateSelectionUI();
}

// Handle clicking on card background to toggle selection
window.handleCardClick = function(event, cardEl) {
    // If clicked on action button or video control, don't toggle
    if (event.target.closest('a, button, video, audio')) return;
    
    const cb = cardEl.querySelector('.media-checkbox');
    if (!cb) return;

    // If click directly landed on checkbox, handleCheckboxChange will fire
    if (event.target === cb) return;

    cb.checked = !cb.checked;
    handleCheckboxChange(cb, event);
};

// Handle individual checkbox change
window.handleCheckboxChange = function(cb, event) {
    if (event) event.stopPropagation();
    
    const url = cb.getAttribute('data-url');
    const session = cb.getAttribute('data-session');
    const name = cb.getAttribute('data-name');
    const size = parseInt(cb.getAttribute('data-size') || '0', 10);
    const cardEl = document.getElementById('media-card-' + encodeId(url));

    if (cb.checked) {
        selectedMediaMap.set(url, { url, session, name, size });
        if (cardEl) {
            cardEl.classList.add('is-selected');
            cardEl.classList.remove('border-gray-200');
        }
    } else {
        selectedMediaMap.delete(url);
        if (cardEl) {
            cardEl.classList.remove('is-selected');
            cardEl.classList.add('border-gray-200');
        }
    }

    updateSelectionUI();
};

// "Select All untuk 1 Session Saja"
// Toggles all checkboxes strictly belonging to the specified session
window.toggleSelectSession = function(sessionName, isChecked) {
    const sessionBlock = document.querySelector(`.session-gallery-block[data-session="${sessionName}"]`);
    if (!sessionBlock) return;

    const sessionCheckboxes = sessionBlock.querySelectorAll('.media-checkbox');
    sessionCheckboxes.forEach(cb => {
        cb.checked = isChecked;
        const url = cb.getAttribute('data-url');
        const session = cb.getAttribute('data-session');
        const name = cb.getAttribute('data-name');
        const size = parseInt(cb.getAttribute('data-size') || '0', 10);
        const cardEl = document.getElementById('media-card-' + encodeId(url));

        if (isChecked) {
            selectedMediaMap.set(url, { url, session, name, size });
            if (cardEl) {
                cardEl.classList.add('is-selected');
                cardEl.classList.remove('border-gray-200');
            }
        } else {
            selectedMediaMap.delete(url);
            if (cardEl) {
                cardEl.classList.remove('is-selected');
                cardEl.classList.add('border-gray-200');
            }
        }
    });

    updateSelectionUI();
};

// Unselect all media across all sessions
window.unselectAllMedia = function() {
    selectedMediaMap.clear();
    document.querySelectorAll('.media-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('.select-session-all-cb').forEach(cb => {
        cb.checked = false;
        cb.indeterminate = false;
    });
    document.querySelectorAll('.media-card').forEach(card => {
        card.classList.remove('is-selected');
        card.classList.add('border-gray-200');
    });
    updateSelectionUI();
};

// Update UI counters and visibility of action bars
function updateSelectionUI() {
    const count = selectedMediaMap.size;
    let totalBytes = 0;
    selectedMediaMap.forEach(f => {
        totalBytes += (f.size || 0);
    });

    const formattedSize = formatBytes(totalBytes);

    // Update bottom floating toolbar
    const $toolbar = $('#media-selection-toolbar');
    const $cardBanner = $('#card-selection-banner');

    if (count > 0) {
        $toolbar.removeClass('d-none');
        $cardBanner.removeClass('d-none');

        $('#selected-count-badge').text(count);
        $('#selected-size-badge').text(formattedSize);
        $('#card-selected-count').text(count);
        $('#card-selected-size').text(`(${formattedSize})`);
    } else {
        $toolbar.addClass('d-none');
        $cardBanner.addClass('d-none');
    }

    // Update each session's Select All checkbox status (checked / indeterminate / unchecked)
    document.querySelectorAll('.session-gallery-block').forEach(block => {
        const sessionName = block.getAttribute('data-session');
        const sessionCb = block.querySelector('.select-session-all-cb');
        if (!sessionCb) return;

        const allInSession = block.querySelectorAll('.media-checkbox');
        const checkedInSession = block.querySelectorAll('.media-checkbox:checked');

        if (allInSession.length > 0 && checkedInSession.length === allInSession.length) {
            sessionCb.checked = true;
            sessionCb.indeterminate = false;
        } else if (checkedInSession.length > 0) {
            sessionCb.checked = false;
            sessionCb.indeterminate = true;
        } else {
            sessionCb.checked = false;
            sessionCb.indeterminate = false;
        }
    });
}

// Delete Selected Media (Multi-Select Batch Delete)
window.deleteSelectedMedia = function() {
    const count = selectedMediaMap.size;
    if (count === 0) {
        toastr.warning('Tidak ada media yang dipilih.');
        return;
    }

    let totalBytes = 0;
    selectedMediaMap.forEach(f => { totalBytes += (f.size || 0); });

    Swal.fire({
        title: 'Hapus Media Terpilih?',
        html: `Anda akan menghapus <strong>${count} file media</strong> terpilih secara permanen.<br>` +
              `<span class="badge badge-light-danger mt-2">Kapasitas yang dibebaskan: ${formatBytes(totalBytes)}</span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f1416c',
        cancelButtonColor: '#b5b5c3',
        confirmButtonText: `<i class="bi bi-trash-fill me-1"></i> Ya, Hapus ${count} Media!`,
        cancelButtonText: 'Batal'
    }).then(result => {
        if (result.isConfirmed) {
            Swal.fire({
                title: 'Sedang menghapus media...',
                text: 'Harap tunggu beberapa saat',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });

            const filesArray = Array.from(selectedMediaMap.values());

            $.ajax({
                url: '/api/storage/media',
                method: 'DELETE',
                contentType: 'application/json',
                data: JSON.stringify({ files: filesArray }),
                success: function(res) {
                    if (res.success) {
                        Swal.fire({
                            title: 'Berhasil Dihapus!',
                            html: `${res.message}<br><span class="text-success fw-bold">Membebaskan: ${formatBytes(res.deletedSize)}</span>`,
                            icon: 'success'
                        });
                        selectedMediaMap.clear();
                        loadStorageStats();
                        loadGallery();
                    } else {
                        Swal.fire('Gagal', res.error || 'Terjadi kesalahan saat menghapus media.', 'error');
                    }
                },
                error: function(err) {
                    Swal.fire('Error', 'Kesalahan koneksi ke server saat menghapus media.', 'error');
                }
            });
        }
    });
};

// Delete single media item
window.deleteSingleMedia = function(event, url, fileName, sessionName) {
    if (event) event.stopPropagation();

    Swal.fire({
        title: 'Hapus File Media?',
        text: `Hapus file "${fileName}" dari sesi "${sessionName}"?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f1416c',
        cancelButtonColor: '#b5b5c3',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    }).then(result => {
        if (result.isConfirmed) {
            $.ajax({
                url: '/api/storage/media',
                method: 'DELETE',
                contentType: 'application/json',
                data: JSON.stringify({ files: [{ url, session: sessionName, name: fileName }] }),
                success: function(res) {
                    if (res.success) {
                        toastr.success('File media berhasil dihapus');
                        selectedMediaMap.delete(url);
                        loadStorageStats();
                        loadGallery();
                    } else {
                        toastr.error(res.error || 'Gagal menghapus file');
                    }
                },
                error: function() {
                    toastr.error('Kesalahan koneksi ke server');
                }
            });
        }
    });
};

// Delete ALL media for 1 specific session directly
window.deleteSessionDirectly = function(sessionName, fileCount) {
    Swal.fire({
        title: `Hapus Seluruh Media Sesi?`,
        html: `Apakah Anda yakin ingin menghapus <strong>semua ${fileCount} file media</strong> untuk sesi <strong>${escapeHtml(sessionName)}</strong>?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f1416c',
        cancelButtonColor: '#b5b5c3',
        confirmButtonText: `Ya, Hapus Semua Sesi Ini!`,
        cancelButtonText: 'Batal'
    }).then(result => {
        if (result.isConfirmed) {
            Swal.fire({
                title: 'Sedang menghapus media sesi...',
                text: 'Harap tunggu sebentar',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });

            $.ajax({
                url: '/api/storage/media',
                method: 'DELETE',
                contentType: 'application/json',
                data: JSON.stringify({ session: sessionName }),
                success: function(res) {
                    if (res.success) {
                        Swal.fire({
                            title: 'Berhasil Dihapus!',
                            html: `${res.message}<br><span class="text-success fw-bold">Membebaskan: ${formatBytes(res.deletedSize)}</span>`,
                            icon: 'success'
                        });
                        // Remove any deleted files of this session from selection map
                        for (const [key, val] of selectedMediaMap.entries()) {
                            if (val.session === sessionName) selectedMediaMap.delete(key);
                        }
                        loadStorageStats();
                        loadGallery();
                    } else {
                        Swal.fire('Gagal', res.error || 'Terjadi kesalahan saat menghapus media sesi.', 'error');
                    }
                },
                error: function() {
                    Swal.fire('Error', 'Kesalahan koneksi ke server.', 'error');
                }
            });
        }
    });
};

// Legacy Bulk Cleanup by Days (from the top card)
window.executeCleanup = function() {
    const days = $('#cleanup-options').val();
    let confirmMsg = `Apakah Anda yakin ingin menghapus file media yang lebih tua dari ${days} hari?`;
    if (days === '0') {
        confirmMsg = "PERINGATAN KERAS! Anda akan menghapus SEMUA file media di seluruh sesi. Apakah Anda sangat yakin?";
    }
    
    Swal.fire({
        title: 'Konfirmasi Pembersihan Massal',
        text: confirmMsg,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f1416c',
        cancelButtonColor: '#b5b5c3',
        confirmButtonText: 'Ya, Eksekusi Pembersihan!',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            Swal.fire({
                title: 'Sedang membersihkan media...',
                text: 'Harap tunggu sebentar',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });
            
            $.ajax({
                url: '/api/storage/media',
                method: 'DELETE',
                data: JSON.stringify({ olderThanDays: days }),
                contentType: 'application/json',
                success: function(res) {
                    if (res.success) {
                        Swal.fire(
                            'Pembersihan Selesai!',
                            res.message + '<br>Kapasitas yang dibebaskan: ' + formatBytes(res.deletedSize),
                            'success'
                        );
                        selectedMediaMap.clear();
                        loadStorageStats(); 
                        loadGallery();
                    } else {
                        Swal.fire('Gagal', res.error || 'Terjadi kesalahan', 'error');
                    }
                },
                error: function() {
                    Swal.fire('Error', 'Kesalahan koneksi ke server', 'error');
                }
            });
        }
    });
};

// Utility formatters
function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString('id-ID', options);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeHtmlAttr(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function encodeId(str) {
    return btoa(unescape(encodeURIComponent(str))).replace(/[/+=]/g, '_');
}
