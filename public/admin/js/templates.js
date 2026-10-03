/**
 * Chat Templates Manager
 * CRUD untuk mengelola template pesan WhatsApp
 */

// ============================================
// STATE
// ============================================
const TemplateState = {
    templates: [],
    filteredTemplates: [],
    packages: [],
    selectedPackageId: 'all',
    currentTemplate: null,
    templateModal: null,
    viewModal: null,
    deleteModal: null,
    deleteId: null,
    importModal: null,
    importedData: null,
    packageManageModal: null,
    packageEditModal: null,
    packageSessionsModal: null
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('📝 Chat Templates Manager initialized');
    
    loadComponents();
    initModals();
    setupEventListeners();
    loadPackages();
    loadTemplates();
});

function loadComponents() {
    const _comps = ['header', 'sidebar', 'footer'];
    let _loaded = 0;
    _comps.forEach(comp => {
        fetch(`components/${comp}.html`)
            .then(r => r.text())
            .then(html => {
                const el = document.getElementById(`${comp}-container`);
                if (!el) { _loaded++; return; }
                const tmp = document.createElement('div');
                tmp.innerHTML = html;
                const scripts = Array.from(tmp.querySelectorAll('script'));
                scripts.forEach(s => s.remove());
                el.innerHTML = tmp.innerHTML;
                scripts.forEach(os => {
                    const ns = document.createElement('script');
                    if (os.src) { ns.src = os.src; } else { ns.textContent = os.textContent; }
                    document.body.appendChild(ns);
                });
                if (comp === 'sidebar') {
                    setTimeout(() => {
                        const link = document.querySelector('a[href="templates.html"]');
                        if (link) link.classList.add('active');
                        if (typeof KTMenu !== 'undefined') KTMenu.createInstances();
                        if (typeof KTDrawer !== 'undefined') KTDrawer.createInstances();
                        if (typeof KTScroll !== 'undefined') KTScroll.createInstances();
                    }, 200);
                }
                _loaded++;
                if (_loaded === _comps.length) {
                    document.dispatchEvent(new Event('components-loaded'));
                    if (typeof initializeHeader === 'function') initializeHeader();
                }
            })
            .catch(() => { _loaded++; });
    });
}

function initModals() {
    TemplateState.templateModal = new bootstrap.Modal(document.getElementById('templateModal'));
    TemplateState.viewModal = new bootstrap.Modal(document.getElementById('viewModal'));
    TemplateState.deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
    const importModalEl = document.getElementById('importModal');
    if (importModalEl) {
        TemplateState.importModal = new bootstrap.Modal(importModalEl);
    }
    const pkgManageEl = document.getElementById('packageManageModal');
    if (pkgManageEl) {
        TemplateState.packageManageModal = new bootstrap.Modal(pkgManageEl);
    }
    const pkgEditEl = document.getElementById('packageEditModal');
    if (pkgEditEl) {
        TemplateState.packageEditModal = new bootstrap.Modal(pkgEditEl);
    }
    const pkgSessionsEl = document.getElementById('packageSessionsModal');
    if (pkgSessionsEl) {
        TemplateState.packageSessionsModal = new bootstrap.Modal(pkgSessionsEl);
    }
}

function setupEventListeners() {
    // Search
    document.getElementById('search-input')?.addEventListener('input', (e) => {
        filterTemplates();
    });
    
    // Filter status
    document.getElementById('filter-status')?.addEventListener('change', (e) => {
        filterTemplates();
    });
    
    // Code input - force uppercase and remove invalid chars
    document.getElementById('template-code')?.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '');
    });
    
    // Form submit
    document.getElementById('template-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        saveTemplate();
    });
    
    // Media file input
    document.getElementById('template-media')?.addEventListener('change', handleMediaUpload);
}

// ============================================
// LOAD TEMPLATES
// ============================================
async function loadTemplates() {
    try {
        const response = await fetch('/api/templates');
        const data = await response.json();
        
        if (data.success) {
            TemplateState.templates = data.templates || [];
            TemplateState.filteredTemplates = [...TemplateState.templates];
            
            document.getElementById('template-count').textContent = data.count || 0;
            
            renderTemplates();
        } else {
            showToast('error', 'Gagal memuat templates');
        }
    } catch (error) {
        console.error('Error loading templates:', error);
        showToast('error', 'Gagal memuat templates');
        renderEmptyState();
    }
}

function refreshTemplates() {
    loadTemplates();
    showToast('success', 'Templates di-refresh');
}

// ============================================
// RENDER TEMPLATES
// ============================================
function renderTemplates() {
    const container = document.getElementById('templates-container');
    const templates = TemplateState.filteredTemplates;
    
    // Update showing info
    document.getElementById('showing-info').textContent = `Menampilkan ${templates.length} template`;
    
    if (templates.length === 0) {
        renderEmptyState();
        return;
    }
    
    let html = '';
    templates.forEach(template => {
        const isActive = template.is_active === 1;
        const hasMedia = !!template.media_data;
        const contentPreview = template.content.length > 150 
            ? template.content.substring(0, 150) + '...' 
            : template.content;
        
        html += `
            <div class="col-xl-4 col-md-6">
                <div class="card template-card ${!isActive ? 'inactive' : ''}" data-id="${template.id}">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-3">
                            <div>
                                <div class="d-flex align-items-center flex-wrap gap-1">
                                    <div class="template-code">${escapeHtml(template.code)}</div>
                                    <span class="badge" style="background-color: ${template.package_color || '#3699FF'}; color: #fff; font-size: 0.7rem; font-weight: 500;">
                                        ${escapeHtml(template.package_name || 'Umum / Default')}
                                    </span>
                                </div>
                                ${hasMedia ? '<span class="badge badge-light-info ms-2"><i class="bi bi-image me-1"></i>Gambar</span>' : ''}
                            </div>
                            <div class="dropdown">
                                <button class="btn btn-sm btn-light btn-icon" data-bs-toggle="dropdown">
                                    <i class="bi bi-three-dots-vertical"></i>
                                </button>
                                <ul class="dropdown-menu dropdown-menu-end">
                                    <li>
                                        <a class="dropdown-item" href="#" onclick="viewTemplate(${template.id}); return false;">
                                            <i class="bi bi-eye me-2 text-info"></i>Lihat Detail
                                        </a>
                                    </li>
                                    <li>
                                        <a class="dropdown-item" href="#" onclick="editTemplate(${template.id}); return false;">
                                            <i class="bi bi-pencil me-2 text-primary"></i>Edit
                                        </a>
                                    </li>
                                    <li>
                                        <a class="dropdown-item" href="#" onclick="toggleTemplate(${template.id}); return false;">
                                            <i class="bi bi-toggle-${isActive ? 'on' : 'off'} me-2 text-${isActive ? 'warning' : 'success'}"></i>
                                            ${isActive ? 'Nonaktifkan' : 'Aktifkan'}
                                        </a>
                                    </li>
                                    <li><hr class="dropdown-divider"></li>
                                    <li>
                                        <a class="dropdown-item text-danger" href="#" onclick="deleteTemplate(${template.id}, '${escapeHtml(template.code)}'); return false;">
                                            <i class="bi bi-trash me-2"></i>Hapus
                                        </a>
                                    </li>
                                </ul>
                            </div>
                        </div>
                        
                        ${hasMedia ? `
                            <div class="mb-2">
                                <img src="data:${template.media_mimetype || 'image/jpeg'};base64,${template.media_data}" 
                                     style="max-width: 100%; max-height: 80px; border-radius: 6px; object-fit: cover;">
                            </div>
                        ` : ''}
                        
                        ${template.title ? `<div class="template-title">${escapeHtml(template.title)}</div>` : ''}
                        ${template.description ? `<div class="template-description mb-2">${escapeHtml(template.description)}</div>` : ''}
                        
                        <div class="template-content">${escapeHtml(contentPreview)}</div>
                        
                        <div class="d-flex justify-content-between align-items-center mt-3">
                            <span class="badge ${isActive ? 'badge-light-success' : 'badge-light-secondary'}">
                                ${isActive ? 'Aktif' : 'Nonaktif'}
                            </span>
                            <span class="template-meta">
                                ${formatDate(template.updated_at || template.created_at)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function renderEmptyState() {
    const container = document.getElementById('templates-container');
    const searchValue = document.getElementById('search-input')?.value || '';
    const filterValue = document.getElementById('filter-status')?.value || 'all';
    
    let message = 'Belum ada template';
    let subMessage = 'Klik tombol "Tambah Template" untuk membuat template baru';
    
    if (searchValue || filterValue !== 'all') {
        message = 'Tidak ada template yang cocok';
        subMessage = 'Coba ubah kata kunci pencarian atau filter';
    }
    
    container.innerHTML = `
        <div class="col-12">
            <div class="empty-state">
                <i class="bi bi-chat-square-text"></i>
                <h4 class="text-muted">${message}</h4>
                <p class="text-muted">${subMessage}</p>
                ${!searchValue && filterValue === 'all' ? `
                    <button class="btn btn-primary mt-3" onclick="openCreateModal()">
                        <i class="bi bi-plus-lg me-1"></i>Tambah Template
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

// ============================================
// FILTER
// ============================================
function filterTemplates() {
    const searchValue = (document.getElementById('search-input')?.value || '').toLowerCase();
    const filterValue = document.getElementById('filter-status')?.value || 'all';
    
    TemplateState.filteredTemplates = TemplateState.templates.filter(template => {
        // Search filter
        const matchSearch = !searchValue || 
            template.code.toLowerCase().includes(searchValue) ||
            (template.title || '').toLowerCase().includes(searchValue) ||
            (template.content || '').toLowerCase().includes(searchValue) ||
            (template.description || '').toLowerCase().includes(searchValue);
        
        // Status filter
        let matchStatus = true;
        if (filterValue === 'active') {
            matchStatus = template.is_active === 1;
        } else if (filterValue === 'inactive') {
            matchStatus = template.is_active !== 1;
        }
        
        // Package filter
        let matchPackage = true;
        if (TemplateState.selectedPackageId !== 'all') {
            matchPackage = Number(template.package_id || 1) === Number(TemplateState.selectedPackageId);
        }
        
        return matchSearch && matchStatus && matchPackage;
    });
    
    renderTemplates();
}

// ============================================
// MEDIA HANDLING
// ============================================
function handleMediaUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        showToast('error', 'Format file tidak didukung. Gunakan JPG, PNG, GIF, atau WebP.');
        event.target.value = '';
        return;
    }
    
    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
        showToast('error', 'Ukuran file terlalu besar. Maksimal 5MB.');
        event.target.value = '';
        return;
    }
    
    // Read file as base64
    const reader = new FileReader();
    reader.onload = function(e) {
        const base64Full = e.target.result;
        const base64Data = base64Full.split(',')[1]; // Remove data:image/xxx;base64, prefix
        
        // Store in hidden inputs
        document.getElementById('template-media-data').value = base64Data;
        document.getElementById('template-media-mimetype').value = file.type;
        document.getElementById('template-media-filename').value = file.name;
        
        // Show preview
        const previewContainer = document.getElementById('media-preview-container');
        const previewImg = document.getElementById('media-preview');
        previewImg.src = base64Full;
        previewContainer.classList.remove('d-none');
        
        console.log('📷 Media uploaded:', file.name, file.type, file.size, 'bytes');
    };
    reader.readAsDataURL(file);
}

function removeMedia() {
    // Clear hidden inputs
    document.getElementById('template-media-data').value = '';
    document.getElementById('template-media-mimetype').value = '';
    document.getElementById('template-media-filename').value = '';
    
    // Clear file input
    document.getElementById('template-media').value = '';
    
    // Hide preview
    document.getElementById('media-preview-container').classList.add('d-none');
    document.getElementById('media-preview').src = '';
    
    console.log('🗑️ Media removed');
}

function showMediaPreview(mediaData, mimetype) {
    if (!mediaData) {
        document.getElementById('media-preview-container').classList.add('d-none');
        return;
    }
    
    const previewContainer = document.getElementById('media-preview-container');
    const previewImg = document.getElementById('media-preview');
    previewImg.src = `data:${mimetype};base64,${mediaData}`;
    previewContainer.classList.remove('d-none');
}

// ============================================
// CREATE / EDIT
// ============================================
function openCreateModal() {
    TemplateState.currentTemplate = null;
    
    // Reset form
    document.getElementById('template-id').value = '';
    document.getElementById('template-code').value = '';
    document.getElementById('template-code').disabled = false;
    document.getElementById('template-title').value = '';
    document.getElementById('template-content').value = '';
    document.getElementById('template-description').value = '';
    document.getElementById('template-active').checked = true;
    
    // Populate packages
    populatePackageSelect(TemplateState.selectedPackageId !== 'all' ? TemplateState.selectedPackageId : null);
    
    // Reset media fields
    removeMedia();
    
    // Update modal
    document.getElementById('modal-title').innerHTML = '<i class="bi bi-plus-circle text-primary me-2"></i>Tambah Template';
    document.getElementById('save-btn').innerHTML = '<i class="bi bi-check-lg me-1"></i>Simpan';
    
    TemplateState.templateModal.show();
}

function editTemplate(id) {
    const template = TemplateState.templates.find(t => t.id === id);
    if (!template) return;
    
    TemplateState.currentTemplate = template;
    
    // Fill form
    document.getElementById('template-id').value = template.id;
    document.getElementById('template-code').value = template.code;
    document.getElementById('template-code').disabled = false; // Allow code editing
    document.getElementById('template-title').value = template.title || '';
    document.getElementById('template-content').value = template.content || '';
    document.getElementById('template-description').value = template.description || '';
    document.getElementById('template-active').checked = template.is_active === 1;
    
    // Populate packages with current template's package
    populatePackageSelect(template.package_id || 1);
    
    // Load existing media
    if (template.media_data) {
        document.getElementById('template-media-data').value = template.media_data;
        document.getElementById('template-media-mimetype').value = template.media_mimetype || 'image/jpeg';
        document.getElementById('template-media-filename').value = template.media_filename || 'image.jpg';
        showMediaPreview(template.media_data, template.media_mimetype || 'image/jpeg');
    } else {
        removeMedia();
    }
    
    // Update modal
    document.getElementById('modal-title').innerHTML = '<i class="bi bi-pencil text-primary me-2"></i>Edit Template';
    document.getElementById('save-btn').innerHTML = '<i class="bi bi-check-lg me-1"></i>Update';
    
    TemplateState.templateModal.show();
}

async function saveTemplate() {
    const id = document.getElementById('template-id').value;
    const code = document.getElementById('template-code').value.trim();
    const title = document.getElementById('template-title').value.trim();
    const content = document.getElementById('template-content').value.trim();
    const description = document.getElementById('template-description').value.trim();
    const isActive = document.getElementById('template-active').checked;
    
    // Media fields
    const mediaData = document.getElementById('template-media-data').value || null;
    const mediaMimetype = document.getElementById('template-media-mimetype').value || null;
    const mediaFilename = document.getElementById('template-media-filename').value || null;
    
    // Validation
    if (!code) {
        showToast('warning', 'Kode template wajib diisi');
        document.getElementById('template-code').focus();
        return;
    }
    
    if (!content) {
        showToast('warning', 'Isi template wajib diisi');
        document.getElementById('template-content').focus();
        return;
    }
    
    // Disable button
    const btn = document.getElementById('save-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Menyimpan...';
    btn.disabled = true;
    
    try {
        const packageId = Number(document.getElementById('template-package-id')?.value || 1);
        const payload = {
            package_id: packageId,
            code: code,
            title: title || null,
            content: content,
            description: description || null,
            is_active: isActive,
            media_data: mediaData,
            media_mimetype: mediaMimetype,
            media_filename: mediaFilename
        };
        
        let response;
        if (id) {
            // Update
            response = await fetch(`/api/templates/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            // Create
            response = await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }
        
        const data = await response.json();
        
        if (data.success) {
            showToast('success', data.message || 'Template berhasil disimpan');
            TemplateState.templateModal.hide();
            loadTemplates();
        } else {
            showToast('error', data.error || 'Gagal menyimpan template');
        }
    } catch (error) {
        console.error('Error saving template:', error);
        showToast('error', 'Terjadi kesalahan saat menyimpan');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ============================================
// VIEW
// ============================================
function viewTemplate(id) {
    const template = TemplateState.templates.find(t => t.id === id);
    if (!template) return;
    
    TemplateState.currentTemplate = template;
    
    document.getElementById('view-code').textContent = template.code;
    document.getElementById('view-title').textContent = template.title || '-';
    document.getElementById('view-content').textContent = template.content;
    document.getElementById('view-description').textContent = template.description || '-';
    document.getElementById('view-created').textContent = formatDateTime(template.created_at);
    document.getElementById('view-updated').textContent = formatDateTime(template.updated_at);
    
    const pkgEl = document.getElementById('view-package');
    if (pkgEl) {
        pkgEl.innerHTML = `<span class="badge" style="background-color:${template.package_color || '#3699FF'}; color:#fff; font-size:0.85rem;">${escapeHtml(template.package_name || 'Umum / Default')}</span>`;
    }
    
    const statusHtml = template.is_active === 1 
        ? '<span class="badge badge-light-success fs-7">Aktif</span>'
        : '<span class="badge badge-light-secondary fs-7">Nonaktif</span>';
    document.getElementById('view-status').innerHTML = statusHtml;
    
    // Show media if exists
    const mediaContainer = document.getElementById('view-media-container');
    const mediaImg = document.getElementById('view-media');
    if (template.media_data) {
        mediaImg.src = `data:${template.media_mimetype || 'image/jpeg'};base64,${template.media_data}`;
        mediaContainer.style.display = 'block';
    } else {
        mediaContainer.style.display = 'none';
        mediaImg.src = '';
    }
    
    TemplateState.viewModal.show();
}

function editFromView() {
    if (TemplateState.currentTemplate) {
        TemplateState.viewModal.hide();
        setTimeout(() => {
            editTemplate(TemplateState.currentTemplate.id);
        }, 300);
    }
}

// ============================================
// TOGGLE STATUS
// ============================================
async function toggleTemplate(id) {
    try {
        const response = await fetch(`/api/templates/${id}/toggle`, {
            method: 'PATCH'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('success', data.message);
            loadTemplates();
        } else {
            showToast('error', data.error || 'Gagal mengubah status');
        }
    } catch (error) {
        console.error('Error toggling template:', error);
        showToast('error', 'Terjadi kesalahan');
    }
}

// ============================================
// DELETE
// ============================================
function deleteTemplate(id, code) {
    TemplateState.deleteId = id;
    document.getElementById('delete-code').textContent = '#' + code;
    TemplateState.deleteModal.show();
}

async function confirmDelete() {
    if (!TemplateState.deleteId) return;
    
    const btn = document.getElementById('confirm-delete-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Menghapus...';
    btn.disabled = true;
    
    try {
        const response = await fetch(`/api/templates/${TemplateState.deleteId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('success', data.message || 'Template berhasil dihapus');
            TemplateState.deleteModal.hide();
            loadTemplates();
        } else {
            showToast('error', data.error || 'Gagal menghapus template');
        }
    } catch (error) {
        console.error('Error deleting template:', error);
        showToast('error', 'Terjadi kesalahan saat menghapus');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        TemplateState.deleteId = null;
    }
}

// ============================================
// UTILITIES
// ============================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
    });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('id-ID', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showToast(type, message) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'success',
            title: message,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000
        });
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

// ============================================
// EXPORT & IMPORT TEMPLATES
// ============================================

async function exportTemplates() {
    try {
        showToast('info', 'Menyiapkan file export backup...');
        const response = await fetch('/api/templates/export');
        const data = await response.json();

        if (!data.success || !data.templates) {
            showToast('error', data.error || 'Gagal mengexport templates');
            return;
        }

        if (data.templates.length === 0) {
            showToast('warning', 'Belum ada data template untuk diexport.');
            return;
        }

        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `chat-templates-backup-${dateStr}.json`;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const blobUrl = URL.createObjectURL(blob);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = blobUrl;
        downloadAnchor.download = fileName;
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

        showToast('success', `Berhasil mengexport ${data.templates.length} template (${fileName})`);
    } catch (error) {
        console.error('Error exporting templates:', error);
        showToast('error', 'Terjadi kesalahan saat mengexport template');
    }
}

function openImportModal() {
    TemplateState.importedData = null;
    const fileInput = document.getElementById('import-file');
    if (fileInput) fileInput.value = '';

    const previewBox = document.getElementById('import-preview-box');
    if (previewBox) previewBox.classList.add('d-none');

    const submitBtn = document.getElementById('btn-submit-import');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="bi bi-upload me-1"></i>Mulai Import';
    }

    const overwriteCb = document.getElementById('import-overwrite');
    if (overwriteCb) overwriteCb.checked = false;

    if (TemplateState.importModal) {
        TemplateState.importModal.show();
    }
}

function handleImportFileSelect(event) {
    const file = event.target.files?.[0];
    const previewBox = document.getElementById('import-preview-box');
    const submitBtn = document.getElementById('btn-submit-import');

    if (!file) {
        TemplateState.importedData = null;
        if (previewBox) previewBox.classList.add('d-none');
        if (submitBtn) submitBtn.disabled = true;
        return;
    }

    if (!file.name.toLowerCase().endsWith('.json')) {
        showToast('error', 'Harap pilih file dengan format .json');
        event.target.value = '';
        TemplateState.importedData = null;
        if (previewBox) previewBox.classList.add('d-none');
        if (submitBtn) submitBtn.disabled = true;
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const content = JSON.parse(e.target.result);
            let templates = [];

            if (Array.isArray(content)) {
                templates = content;
            } else if (content && Array.isArray(content.templates)) {
                templates = content.templates;
            } else {
                throw new Error('Format file JSON tidak berisi array template yang dikenali.');
            }

            // Filter items that have at least code & content
            const validTemplates = templates.filter(t => t && t.code && t.content);

            if (validTemplates.length === 0) {
                showToast('warning', 'File JSON valid namun tidak ditemukan template dengan #KODE dan isi.');
                TemplateState.importedData = null;
                if (previewBox) previewBox.classList.add('d-none');
                if (submitBtn) submitBtn.disabled = true;
                return;
            }

            TemplateState.importedData = validTemplates;

            // Update UI preview
            const nameEl = document.getElementById('import-filename');
            const sizeEl = document.getElementById('import-filesize');
            const countEl = document.getElementById('import-template-count');
            const metaEl = document.getElementById('import-file-meta');

            if (nameEl) nameEl.textContent = file.name;
            if (sizeEl) sizeEl.textContent = (file.size / 1024).toFixed(1) + ' KB';
            if (countEl) countEl.textContent = `${validTemplates.length} Template`;
            
            if (metaEl) {
                let infoText = `Terdeteksi <strong>${validTemplates.length} template</strong> siap diimpor.`;
                if (content.exported_at) {
                    infoText += ` Dibuat pada: ${formatDate(content.exported_at)}.`;
                }
                metaEl.innerHTML = infoText;
            }

            if (previewBox) previewBox.classList.remove('d-none');
            if (submitBtn) submitBtn.disabled = false;

        } catch (err) {
            console.error('JSON Parse error:', err);
            showToast('error', 'File JSON rusak atau format tidak valid: ' + err.message);
            event.target.value = '';
            TemplateState.importedData = null;
            if (previewBox) previewBox.classList.add('d-none');
            if (submitBtn) submitBtn.disabled = true;
        }
    };
    reader.readAsText(file);
}

async function submitImportTemplates() {
    if (!TemplateState.importedData || TemplateState.importedData.length === 0) {
        showToast('error', 'Tidak ada data template untuk diimpor.');
        return;
    }

    const submitBtn = document.getElementById('btn-submit-import');
    const overwrite = document.getElementById('import-overwrite')?.checked || false;

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Mengimpor...';
        }

        const response = await fetch('/api/templates/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                templates: TemplateState.importedData,
                overwrite: overwrite
            })
        });

        const data = await response.json();

        if (data.success) {
            if (TemplateState.importModal) {
                TemplateState.importModal.hide();
            }

            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'success',
                    title: 'Import Selesai!',
                    html: `
                        <div class="text-start p-3 bg-light rounded-3 fs-7 mb-2">
                            <div><i class="bi bi-check-circle-fill text-success me-2"></i>Ditambahkan: <strong>${data.imported || 0}</strong> template</div>
                            <div><i class="bi bi-arrow-repeat text-primary me-2"></i>Diperbarui (Timpa): <strong>${data.updated || 0}</strong> template</div>
                            <div><i class="bi bi-dash-circle text-muted me-2"></i>Dilewati (Skip): <strong>${data.skipped || 0}</strong> template</div>
                            <div class="border-top mt-2 pt-2 fw-bold text-gray-800">Total diproses: ${data.total || 0} template</div>
                        </div>
                    `,
                    confirmButtonText: 'Tutup'
                });
            } else {
                showToast('success', data.message || 'Import template berhasil!');
            }

            loadTemplates();
        } else {
            showToast('error', data.error || 'Gagal mengimpor template.');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="bi bi-upload me-1"></i>Mulai Import';
            }
        }
    } catch (error) {
        console.error('Error submitting import:', error);
        showToast('error', 'Terjadi kesalahan koneksi saat mengimpor template');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bi bi-upload me-1"></i>Mulai Import';
        }
    }
}

// Global functions
window.openCreateModal = openCreateModal;
window.editTemplate = editTemplate;
window.viewTemplate = viewTemplate;
window.editFromView = editFromView;
window.saveTemplate = saveTemplate;
window.deleteTemplate = deleteTemplate;
window.confirmDelete = confirmDelete;
window.toggleTemplate = toggleTemplate;
window.refreshTemplates = refreshTemplates;
window.exportTemplates = exportTemplates;
window.openImportModal = openImportModal;
window.handleImportFileSelect = handleImportFileSelect;
window.submitImportTemplates = submitImportTemplates;

// ============================================
// PACKAGE MANAGEMENT & PILLS
// ============================================

async function loadPackages() {
    try {
        const res = await fetch('/api/template-packages');
        const data = await res.json();
        if (data.success) {
            TemplateState.packages = data.packages || [];
            renderPackagePills();
            populatePackageSelect();
        }
    } catch (err) {
        console.error('Error loading template packages:', err);
    }
}

function renderPackagePills() {
    const container = document.getElementById('package-pills-container');
    if (!container) return;

    const totalTemplates = TemplateState.templates.length;
    const isAllActive = TemplateState.selectedPackageId === 'all';

    let html = `
        <button type="button" class="btn btn-sm ${isAllActive ? 'btn-primary' : 'btn-light'} fw-bold px-4 py-2" onclick="selectPackageFilter('all')">
            Semua <span class="badge badge-circle ${isAllActive ? 'bg-white text-primary' : 'badge-light-primary'} ms-1 fs-8">${totalTemplates}</span>
        </button>
    `;

    TemplateState.packages.forEach(pkg => {
        const isActive = String(TemplateState.selectedPackageId) === String(pkg.id);
        const count = pkg.template_count || 0;
        const color = pkg.color || '#3699FF';

        if (isActive) {
            html += `
                <button type="button" class="btn btn-sm text-white fw-bold px-3 py-2 d-flex align-items-center gap-1 shadow-sm" 
                        style="background-color: ${color};" onclick="selectPackageFilter(${pkg.id})">
                    <span>${escapeHtml(pkg.name)}</span>
                    <span class="badge badge-circle bg-white text-dark ms-1 fs-8">${count}</span>
                </button>
            `;
        } else {
            html += `
                <button type="button" class="btn btn-sm btn-light fw-semibold px-3 py-2 d-flex align-items-center gap-1" 
                        onclick="selectPackageFilter(${pkg.id})">
                    <span class="bullet bullet-dot me-1" style="background-color: ${color}; width:8px; height:8px;"></span>
                    <span>${escapeHtml(pkg.name)}</span>
                    <span class="badge badge-light-secondary ms-1 fs-8">${count}</span>
                </button>
            `;
        }
    });

    container.innerHTML = html;
}

function selectPackageFilter(pkgId) {
    TemplateState.selectedPackageId = pkgId;
    renderPackagePills();
    filterTemplates();
}

function populatePackageSelect(selectedId = null) {
    const select = document.getElementById('template-package-id');
    if (!select) return;

    let html = '';
    TemplateState.packages.forEach(pkg => {
        const isSelected = selectedId !== null 
            ? Number(pkg.id) === Number(selectedId) 
            : (pkg.is_default === 1);
        html += `<option value="${pkg.id}" ${isSelected ? 'selected' : ''}>${escapeHtml(pkg.name)} ${pkg.is_default ? '(Default)' : ''}</option>`;
    });

    if (TemplateState.packages.length === 0) {
        html = '<option value="1">Umum / Default</option>';
    }

    select.innerHTML = html;
}

function setColorPreset(color) {
    const input = document.getElementById('pkg-color');
    if (input) input.value = color;
}

function openPackageManagementModal() {
    renderPackageListTable();
    if (TemplateState.packageManageModal) {
        TemplateState.packageManageModal.show();
    }
}

function renderPackageListTable() {
    const tbody = document.getElementById('package-list-tbody');
    if (!tbody) return;

    if (TemplateState.packages.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Belum ada paket template.</td></tr>';
        return;
    }

    let html = '';
    TemplateState.packages.forEach(pkg => {
        const color = pkg.color || '#3699FF';
        const isDefault = pkg.is_default === 1;

        html += `
            <tr>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="symbol symbol-30px me-3">
                            <span class="symbol-label rounded-circle" style="background-color: ${color};"></span>
                        </div>
                        <div>
                            <span class="text-dark fw-bold text-hover-primary d-block fs-6">${escapeHtml(pkg.name)}</span>
                            <span class="text-muted fs-8">${escapeHtml(pkg.description || 'Tidak ada deskripsi')}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="badge" style="background-color: ${color}; color: #fff;">${color}</span>
                </td>
                <td>
                    <span class="badge badge-light-info fw-semibold">${pkg.priority || 0}</span>
                </td>
                <td>
                    <span class="badge badge-light-primary fw-bold">${pkg.template_count || 0} template</span>
                </td>
                <td>
                    ${isDefault ? '<span class="badge badge-light-success fw-bold">Default</span>' : '<span class="badge badge-light-secondary">Opsional</span>'}
                </td>
                <td class="text-end">
                    <button class="btn btn-icon btn-light-success btn-sm me-1" title="Atur Sesi" onclick="openPackageSessionsModal(${pkg.id}, '${escapeHtml(pkg.name)}')">
                        <i class="bi bi-whatsapp"></i>
                    </button>
                    <button class="btn btn-icon btn-light-primary btn-sm me-1" title="Edit Paket" onclick="editPackage(${pkg.id})">
                        <i class="bi bi-pencil"></i>
                    </button>
                    ${!isDefault && pkg.id !== 1 ? `
                    <button class="btn btn-icon btn-light-danger btn-sm" title="Hapus Paket" onclick="deletePackage(${pkg.id}, '${escapeHtml(pkg.name)}')">
                        <i class="bi bi-trash"></i>
                    </button>
                    ` : ''}
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function openCreatePackageModal() {
    document.getElementById('pkg-id').value = '';
    document.getElementById('pkg-name').value = '';
    document.getElementById('pkg-description').value = '';
    document.getElementById('pkg-color').value = '#3699FF';
    document.getElementById('pkg-priority').value = '0';
    document.getElementById('pkg-is-default').checked = false;

    document.getElementById('package-modal-title').innerHTML = '<i class="bi bi-folder-plus text-primary me-2"></i>Tambah Paket Template';
    document.getElementById('btn-save-package').innerHTML = '<i class="bi bi-check-lg me-1"></i>Simpan Paket';

    if (TemplateState.packageEditModal) {
        TemplateState.packageEditModal.show();
    }
}

function editPackage(id) {
    const pkg = TemplateState.packages.find(p => Number(p.id) === Number(id));
    if (!pkg) return;

    document.getElementById('pkg-id').value = pkg.id;
    document.getElementById('pkg-name').value = pkg.name || '';
    document.getElementById('pkg-description').value = pkg.description || '';
    document.getElementById('pkg-color').value = pkg.color || '#3699FF';
    document.getElementById('pkg-priority').value = pkg.priority || 0;
    document.getElementById('pkg-is-default').checked = pkg.is_default === 1;

    document.getElementById('package-modal-title').innerHTML = '<i class="bi bi-pencil text-primary me-2"></i>Edit Paket Template';
    document.getElementById('btn-save-package').innerHTML = '<i class="bi bi-check-lg me-1"></i>Update Paket';

    if (TemplateState.packageEditModal) {
        TemplateState.packageEditModal.show();
    }
}

async function savePackage() {
    const id = document.getElementById('pkg-id').value;
    const name = document.getElementById('pkg-name').value.trim();
    const description = document.getElementById('pkg-description').value.trim();
    const color = document.getElementById('pkg-color').value.trim();
    const priority = Number(document.getElementById('pkg-priority').value || 0);
    const isDefault = document.getElementById('pkg-is-default').checked;

    if (!name) {
        showToast('warning', 'Nama paket wajib diisi');
        document.getElementById('pkg-name').focus();
        return;
    }

    const payload = {
        name,
        description: description || null,
        color: color || '#3699FF',
        priority,
        is_default: isDefault
    };

    const btn = document.getElementById('btn-save-package');
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Menyimpan...';

    try {
        let res;
        if (id) {
            res = await fetch(`/api/template-packages/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch('/api/template-packages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        const data = await res.json();
        if (data.success) {
            showToast('success', data.message || 'Paket template berhasil disimpan');
            if (TemplateState.packageEditModal) TemplateState.packageEditModal.hide();
            await loadPackages();
            await loadTemplates();
            renderPackageListTable();
        } else {
            showToast('error', data.error || 'Gagal menyimpan paket template');
        }
    } catch (err) {
        console.error('Error saving package:', err);
        showToast('error', 'Terjadi kesalahan saat menyimpan paket template');
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
    }
}

async function deletePackage(id, name) {
    Swal.fire({
        title: 'Hapus Paket Template?',
        html: `Paket <strong>"${name}"</strong> akan dihapus.<br><small class="text-danger">Template di dalam paket ini akan otomatis dialihkan ke paket Umum / Default.</small>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f1416c',
        cancelButtonColor: '#b5b5c3',
        confirmButtonText: 'Ya, Hapus',
        cancelButtonText: 'Batal'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const res = await fetch(`/api/template-packages/${id}`, {
                    method: 'DELETE'
                });
                const data = await res.json();
                if (data.success) {
                    showToast('success', 'Paket berhasil dihapus');
                    if (TemplateState.selectedPackageId == id) {
                        TemplateState.selectedPackageId = 'all';
                    }
                    await loadPackages();
                    await loadTemplates();
                    renderPackageListTable();
                } else {
                    showToast('error', data.error || 'Gagal menghapus paket');
                }
            } catch (err) {
                console.error('Error deleting package:', err);
                showToast('error', 'Terjadi kesalahan saat menghapus paket');
            }
        }
    });
}

async function openPackageSessionsModal(id, name) {
    document.getElementById('pkg-session-target-id').value = id;
    document.getElementById('pkg-session-target-name').textContent = name;
    const container = document.getElementById('pkg-sessions-list-container');
    container.innerHTML = '<div class="text-muted fs-7"><span class="spinner-border spinner-border-sm me-2"></span>Memuat sesi...</div>';

    if (TemplateState.packageSessionsModal) {
        TemplateState.packageSessionsModal.show();
    }

    try {
        const [pkgSessionsRes, allSessionsRes] = await Promise.all([
            fetch(`/api/template-packages/${id}/sessions`),
            fetch('/api/sessions')
        ]);
        const pkgData = await pkgSessionsRes.json();
        const allData = await allSessionsRes.json();

        const activeSessions = new Set((pkgData.sessions || []).map(s => s.session_id));
        const allSessionsList = Array.isArray(allData) ? allData : (allData.sessions || []);

        if (allSessionsList.length === 0) {
            container.innerHTML = '<div class="alert alert-warning py-3 fs-7 mb-0">Belum ada WhatsApp Session yang terdaftar di sistem.</div>';
            return;
        }

        let html = '';
        allSessionsList.forEach(sess => {
            const isChecked = activeSessions.has(sess.id);
            const isConnected = !!sess.isConnected;
            const phone = sess.phoneNumber || sess.user?.id?.split(':')[0] || '';

            html += `
                <div class="border rounded p-3 d-flex align-items-center justify-content-between bg-light">
                    <div class="form-check form-check-custom form-check-solid">
                        <input class="form-check-input pkg-session-check" type="checkbox" value="${escapeHtml(sess.id)}" id="sess_${escapeHtml(sess.id)}" ${isChecked ? 'checked' : ''}>
                        <label class="form-check-label fw-bold text-gray-800 cursor-pointer ms-2" for="sess_${escapeHtml(sess.id)}">
                            ${escapeHtml(sess.id)}
                            ${phone ? `<span class="text-muted fs-8 fw-normal ms-1">(${phone})</span>` : ''}
                        </label>
                    </div>
                    <div>
                        <span class="badge ${isConnected ? 'badge-light-success' : 'badge-light-danger'} fs-8">
                            ${isConnected ? 'Online' : 'Offline'}
                        </span>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (err) {
        console.error('Error fetching package sessions:', err);
        container.innerHTML = '<div class="text-danger fs-7">Gagal memuat daftar sesi.</div>';
    }
}

async function savePackageSessions() {
    const pkgId = document.getElementById('pkg-session-target-id').value;
    const checkedInputs = Array.from(document.querySelectorAll('.pkg-session-check:checked'));
    const selectedSessionIds = checkedInputs.map(el => el.value);

    const btn = document.getElementById('btn-save-pkg-sessions');
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Menyimpan...';

    try {
        const res = await fetch(`/api/template-packages/${pkgId}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_ids: selectedSessionIds })
        });
        const data = await res.json();
        if (data.success) {
            showToast('success', 'Sesi untuk paket berhasil disimpan');
            if (TemplateState.packageSessionsModal) {
                TemplateState.packageSessionsModal.hide();
            }
        } else {
            showToast('error', data.error || 'Gagal menyimpan sesi untuk paket');
        }
    } catch (err) {
        console.error('Error saving package sessions:', err);
        showToast('error', 'Terjadi kesalahan server saat menyimpan sesi');
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
    }
}
