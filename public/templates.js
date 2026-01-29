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
    currentTemplate: null,
    templateModal: null,
    viewModal: null,
    deleteModal: null,
    deleteId: null
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('📝 Chat Templates Manager initialized');
    
    loadComponents();
    initModals();
    setupEventListeners();
    loadTemplates();
});

function loadComponents() {
    ['header', 'sidebar', 'footer'].forEach(comp => {
        fetch(`components/${comp}.html`)
            .then(r => r.text())
            .then(html => {
                const el = document.getElementById(`${comp}-container`);
                if (el) el.innerHTML = html;
                if (comp === 'sidebar') {
                    setTimeout(() => {
                        const link = document.querySelector('a[href="templates.html"]');
                        if (link) link.classList.add('active');
                    }, 100);
                }
            })
            .catch(() => {});
    });
}

function initModals() {
    TemplateState.templateModal = new bootstrap.Modal(document.getElementById('templateModal'));
    TemplateState.viewModal = new bootstrap.Modal(document.getElementById('viewModal'));
    TemplateState.deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
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
                                <div class="template-code">${escapeHtml(template.code)}</div>
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
        
        return matchSearch && matchStatus;
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
        const payload = {
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
