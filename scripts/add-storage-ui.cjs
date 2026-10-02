const fs = require('fs');
const path = require('path');

const htmlPath = path.join(process.cwd(), 'public', 'admin', 'manage-storage.html');
const jsPath = path.join(process.cwd(), 'public', 'admin', 'manage-storage.js');
const templatePath = path.join(process.cwd(), 'public', 'admin', 'app-settings.html');

let html = fs.readFileSync(templatePath, 'utf8');

// Replace title
html = html.replace('<title>Pengaturan Aplikasi - Billey WA</title>', '<title>Kelola Storage Media - Billey WA</title>');

// Replace breadcrumb and header
html = html.replace(/<h1 class="page-heading[^>]*>.*?<\/h1>/s, '<h1 class="page-heading d-flex text-dark fw-bold fs-3 flex-column justify-content-center my-0">Kelola Storage Media</h1>');
html = html.replace(/<ul class="breadcrumb[^>]*>.*?<\/ul>/s, `
<ul class="breadcrumb breadcrumb-separatorless fw-semibold fs-7 my-0 pt-1">
    <li class="breadcrumb-item text-muted">
        <a href="index.html" class="text-muted text-hover-primary">Home</a>
    </li>
    <li class="breadcrumb-item"><span class="bullet bg-gray-400 w-5px h-2px"></span></li>
    <li class="breadcrumb-item text-dark">Storage Media</li>
</ul>
`);

// Replace the main content inside kt_app_content_container
const contentStart = html.indexOf('<div class="row g-5 g-xl-10 mb-5 mb-xl-10">');
const contentEnd = html.indexOf('</div>\r\n                    </div>\r\n                    <!-- Footer Container -->');

const newContent = `
<div class="row g-5 g-xl-10 mb-5 mb-xl-10">
    <div class="col-xl-6">
        <!-- Storage Stats Card -->
        <div class="card card-flush h-md-100">
            <div class="card-header pt-7">
                <h3 class="card-title align-items-start flex-column">
                    <span class="card-label fw-bold text-gray-800">Status Storage Media</span>
                    <span class="text-gray-400 mt-1 fw-semibold fs-6">Informasi penggunaan disk untuk file media WhatsApp</span>
                </h3>
            </div>
            <div class="card-body pt-5">
                <div class="d-flex flex-center flex-column py-10">
                    <!-- Icon -->
                    <div class="symbol symbol-100px symbol-circle mb-7">
                        <div class="symbol-label bg-light-primary">
                            <i class="bi bi-hdd-network fs-3x text-primary"></i>
                        </div>
                    </div>
                    <!-- Stats -->
                    <a href="#" class="fs-2 text-gray-800 text-hover-primary fw-bold mb-3" id="storage-total-size">Memuat...</a>
                    <div class="fw-semibold text-gray-400 mb-6" id="storage-file-count">0 File Media Tersimpan</div>
                    
                    <div class="d-flex flex-wrap flex-center gap-5 mb-7">
                        <div class="border border-gray-300 border-dashed rounded py-3 px-4 text-center">
                            <div class="fs-6 fw-bold text-gray-700" id="storage-oldest-date">-</div>
                            <div class="fw-semibold text-gray-400 fs-8">Media Paling Lama</div>
                        </div>
                        <div class="border border-gray-300 border-dashed rounded py-3 px-4 text-center">
                            <div class="fs-6 fw-bold text-gray-700" id="storage-newest-date">-</div>
                            <div class="fw-semibold text-gray-400 fs-8">Media Terbaru</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <div class="col-xl-6">
        <!-- Cleanup Card -->
        <div class="card card-flush h-md-100">
            <div class="card-header pt-7">
                <h3 class="card-title align-items-start flex-column">
                    <span class="card-label fw-bold text-danger">Pembersihan Storage</span>
                    <span class="text-gray-400 mt-1 fw-semibold fs-6">Hapus file media lama untuk menghemat kapasitas server</span>
                </h3>
            </div>
            <div class="card-body pt-5">
                
                <div class="notice d-flex bg-light-warning rounded border-warning border border-dashed p-6 mb-8">
                    <i class="bi bi-exclamation-triangle fs-2tx text-warning me-4"></i>
                    <div class="d-flex flex-stack flex-grow-1 flex-wrap flex-md-nowrap">
                        <div class="mb-3 mb-md-0 fw-semibold">
                            <h4 class="text-gray-900 fw-bold">Peringatan!</h4>
                            <div class="fs-6 text-gray-700 pe-7">
                                File media yang dihapus dari server tidak akan bisa diakses lagi melalui link (URL), tetapi gambar yang sudah terdownload di HP pengirim/penerima akan tetap ada di HP mereka.
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mb-10">
                    <label class="form-label fs-5 fw-bold text-gray-800">Opsi Pembersihan Massal</label>
                    <select id="cleanup-options" class="form-select form-select-solid mt-2">
                        <option value="30">Hapus file yang lebih tua dari 30 Hari</option>
                        <option value="15">Hapus file yang lebih tua dari 15 Hari</option>
                        <option value="7">Hapus file yang lebih tua dari 7 Hari</option>
                        <option value="0">Hapus SEMUA file media sekarang</option>
                    </select>
                </div>
                
                <div class="d-flex justify-content-end">
                    <button type="button" class="btn btn-danger" onclick="executeCleanup()">
                        <i class="bi bi-trash fs-4 me-2"></i> Eksekusi Pembersihan
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>
`;

html = html.substring(0, contentStart) + newContent + html.substring(contentEnd);

// Replace script src
html = html.replace('<script src="app-settings.js"></script>', '<script src="manage-storage.js"></script>');

fs.writeFileSync(htmlPath, html);

const jsCode = `
// manage-storage.js

$(document).ready(function() {
    loadStorageStats();
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

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return \`\${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} \${sizes[i]}\`;
}

function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('id-ID', options);
}

window.executeCleanup = function() {
    const days = $('#cleanup-options').val();
    let confirmMsg = \`Apakah Anda yakin ingin menghapus file media yang lebih tua dari \${days} hari?\`;
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
                        loadStorageStats(); // Refresh
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
`;

fs.writeFileSync(jsPath, jsCode);
console.log('manage-storage.html and manage-storage.js created successfully.');
