// manage-storage.js

let globalGalleryData = [];
let currentRenderIndex = 0;
const SESSIONS_PER_PAGE = 3;

$(document).ready(function() {
    loadStorageStats();
    loadGallery();
});

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
            toastr.error('Kesalahan koneksi ke server');
        }
    });
}

function loadGallery() {
    $('#gallery-container').html('<div class="d-flex flex-column flex-center py-10"><div class="spinner-border text-primary" role="status"></div><div class="text-muted mt-3">Memuat galeri...</div></div>');
    
    $.ajax({
        url: '/api/storage/gallery',
        method: 'GET',
        success: function(res) {
            if (res.success && res.data.length > 0) {
                globalGalleryData = res.data;
                currentRenderIndex = 0;
                $('#gallery-container').empty();
                renderGalleryChunk();
            } else if (res.success) {
                $('#gallery-container').html('<div class="text-center text-muted py-10">Tidak ada media yang ditemukan.</div>');
            } else {
                $('#gallery-container').html('<div class="text-center text-danger py-10">Gagal memuat galeri.</div>');
            }
        },
        error: function() {
            $('#gallery-container').html('<div class="text-center text-danger py-10">Kesalahan koneksi ke server.</div>');
        }
    });
}

function renderGalleryChunk() {
    let html = '';
    const endIndex = Math.min(currentRenderIndex + SESSIONS_PER_PAGE, globalGalleryData.length);
    
    for (let i = currentRenderIndex; i < endIndex; i++) {
        const folder = globalGalleryData[i];
        html += `
        <div class="mb-10">
            <h4 class="fw-bold text-gray-800 mb-3 d-flex align-items-center">
                <i class="bi bi-folder-fill text-warning fs-3 me-2"></i>
                ${folder.session}
                <span class="badge badge-light-primary ms-3">${folder.count} files</span>
                <span class="badge badge-light-info ms-2">${formatBytes(folder.totalSize)}</span>
            </h4>
            <div class="row g-4">
        `;
        
        folder.files.forEach(file => {
            const isImage = file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            const isVideo = file.name.match(/\.(mp4|webm|ogg)$/i);
            
            html += `
                <div class="col-sm-4 col-md-3 col-xl-2">
                    <div class="card shadow-sm h-100">
                        <div class="card-body p-2 text-center d-flex flex-column justify-content-center align-items-center" style="height: 150px; background: #f9f9f9; border-radius: 8px;">
            `;
            
            if (isImage) {
                html += `<img src="${file.url}" class="img-fluid rounded" style="max-height: 100px; max-width: 100%; object-fit: contain;" alt="${file.name}" loading="lazy">`;
            } else if (isVideo) {
                html += `<video src="${file.url}" class="img-fluid rounded" style="max-height: 100px; max-width: 100%;" controls preload="metadata"></video>`;
            } else {
                html += `<i class="bi bi-file-earmark-text fs-3x text-muted mb-2"></i>`;
            }
            
            html += `
                        </div>
                        <div class="card-footer p-2 text-center border-0">
                            <div class="text-truncate fs-8 text-gray-800" title="${file.name}">${file.name}</div>
                            <div class="text-muted fs-9">${formatBytes(file.size)} &bull; ${formatDate(file.date)}</div>
                            <a href="${file.url}" target="_blank" class="btn btn-sm btn-icon btn-light-primary w-100 mt-2" title="Lihat/Download">
                                <i class="bi bi-eye"></i> Buka
                            </a>
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
    }
    
    currentRenderIndex = endIndex;
    
    $('#gallery-container').append(html);
    $('#load-more-btn-container').remove();
    
    if (currentRenderIndex < globalGalleryData.length) {
        $('#gallery-container').append(`
            <div class="text-center mt-5" id="load-more-btn-container">
                <button class="btn btn-light-primary" onclick="renderGalleryChunk()">
                    <i class="bi bi-arrow-down-circle fs-4 me-2"></i> Muat Lebih Banyak Session
                </button>
            </div>
        `);
    }
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('id-ID', options);
}

window.executeCleanup = function() {
    const days = $('#cleanup-options').val();
    let confirmMsg = `Apakah Anda yakin ingin menghapus file media yang lebih tua dari ${days} hari?`;
    if (days === '0') {
        confirmMsg = "PERINGATAN KERAS! Anda akan menghapus SEMUA file media. Apakah Anda sangat yakin?";
    }
    
    Swal.fire({
        title: 'Konfirmasi Hapus Media',
        text: confirmMsg,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f1416c',
        cancelButtonColor: '#b5b5c3',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            Swal.fire({
                title: 'Sedang menghapus...',
                text: 'Harap tunggu sebentar',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
            
            $.ajax({
                url: '/api/storage/media',
                method: 'DELETE',
                data: JSON.stringify({ olderThanDays: days }),
                contentType: 'application/json',
                success: function(res) {
                    if (res.success) {
                        Swal.fire(
                            'Berhasil!',
                            res.message + '<br>Kapasitas yang dibebaskan: ' + formatBytes(res.deletedSize),
                            'success'
                        );
                        loadStorageStats(); 
                        loadGallery(); // Refresh
                    } else {
                        Swal.fire('Gagal', res.error || 'Terjadi kesalahan', 'error');
                    }
                },
                error: function(err) {
                    Swal.fire('Error', 'Kesalahan koneksi ke server', 'error');
                }
            });
        }
    });
};
