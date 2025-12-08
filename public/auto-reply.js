// Auto Reply Rules Management JavaScript

let rules = [];
let sessions = [];
let deleteRuleId = null;
let mediaBase64 = null;
let mediaMimetype = null;
let mediaFilename = null;

// Initialize socket connection
const socket = io();

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadSessions();
    loadRules();
    loadStats();
    
    // Search functionality
    document.getElementById('search-input').addEventListener('input', filterRules);
    document.getElementById('filter-scope').addEventListener('change', filterRules);
    document.getElementById('filter-status').addEventListener('change', filterRules);
    
    // Listen for auto-reply events
    socket.on('auto-reply-sent', (data) => {
        console.log('Auto-reply sent:', data);
        showToast('success', `Auto-reply terkirim: ${data.ruleName}`);
        loadStats(); // Refresh stats
    });
});

// Load all sessions for dropdown
async function loadSessions() {
    try {
        const response = await fetch('/api/sessions');
        const data = await response.json();
        
        if (data.success) {
            sessions = data.sessions || [];
            
            const sessionSelect = document.getElementById('rule-session');
            sessionSelect.innerHTML = '<option value="">Semua Session (Global)</option>';
            
            sessions.forEach(session => {
                const option = document.createElement('option');
                option.value = session.id;
                option.textContent = `${session.id} ${session.isConnected ? '🟢' : '🔴'} ${session.phoneNumber || ''}`;
                sessionSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading sessions:', error);
    }
}

// Load all rules
async function loadRules() {
    try {
        const response = await fetch('/api/auto-reply');
        const data = await response.json();
        
        if (data.success) {
            rules = data.rules || [];
            renderRules(rules);
        } else {
            showToast('error', 'Gagal memuat rules: ' + data.error);
        }
    } catch (error) {
        console.error('Error loading rules:', error);
        showToast('error', 'Gagal memuat rules');
    }
}

// Load statistics
async function loadStats() {
    try {
        const response = await fetch('/api/auto-reply-stats');
        const data = await response.json();
        
        if (data.success && data.stats) {
            document.getElementById('total-rules').textContent = data.stats.total_rules || 0;
            document.getElementById('active-rules').textContent = data.stats.active_rules || 0;
            document.getElementById('total-replies').textContent = data.stats.total_replies || 0;
            document.getElementById('failed-replies').textContent = data.stats.failed || 0;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Render rules grid
function renderRules(rulesToRender) {
    const container = document.getElementById('rules-container');
    const emptyState = document.getElementById('empty-state');
    
    document.getElementById('filter-result-count').textContent = `${rulesToRender.length} rules`;
    
    if (rulesToRender.length === 0) {
        container.classList.add('d-none');
        emptyState.classList.remove('d-none');
        return;
    }
    
    container.classList.remove('d-none');
    emptyState.classList.add('d-none');
    
    container.innerHTML = rulesToRender.map(rule => `
        <div class="col-md-6 col-xl-4">
            <div class="rule-card card h-100 ${rule.enabled ? '' : 'inactive'}">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-3">
                        <div>
                            <div class="rule-name">${escapeHtml(rule.name)}</div>
                            <span class="scope-badge ${rule.scope}">${getScopeLabel(rule.scope)}</span>
                            ${rule.session_id ? `<span class="badge badge-light-info ms-1">${rule.session_id}</span>` : ''}
                        </div>
                        <div class="d-flex gap-1">
                            <button class="btn btn-icon btn-sm btn-light-primary" onclick="editRule(${rule.id})" title="Edit">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-icon btn-sm btn-light-danger" onclick="deleteRule(${rule.id}, '${escapeHtml(rule.name)}')" title="Hapus">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="mb-3">
                        <span class="trigger-badge ${rule.trigger_type}">${getTriggerTypeLabel(rule.trigger_type)}</span>
                        <div class="trigger-value mt-2">${escapeHtml(rule.trigger_value)}</div>
                    </div>
                    
                    <div class="response-content">
                        <small class="text-muted d-block mb-1">Response (${rule.response_type}):</small>
                        ${escapeHtml(rule.response_content)}
                    </div>
                    
                    <div class="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
                        <div class="rule-meta">
                            <span class="me-2">⏱️ ${rule.cooldown_seconds || 0}s</span>
                            <span>🎯 P${rule.priority || 0}</span>
                        </div>
                        <div class="form-check form-switch">
                            <input class="form-check-input" type="checkbox" 
                                   ${rule.enabled ? 'checked' : ''} 
                                   onchange="toggleRule(${rule.id})">
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Filter rules
function filterRules() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const scopeFilter = document.getElementById('filter-scope').value;
    const statusFilter = document.getElementById('filter-status').value;
    
    let filtered = rules;
    
    if (searchTerm) {
        filtered = filtered.filter(rule => 
            rule.name.toLowerCase().includes(searchTerm) ||
            rule.trigger_value.toLowerCase().includes(searchTerm) ||
            rule.response_content.toLowerCase().includes(searchTerm)
        );
    }
    
    if (scopeFilter) {
        filtered = filtered.filter(rule => rule.scope === scopeFilter);
    }
    
    if (statusFilter === 'active') {
        filtered = filtered.filter(rule => rule.enabled);
    } else if (statusFilter === 'inactive') {
        filtered = filtered.filter(rule => !rule.enabled);
    }
    
    renderRules(filtered);
}

// Open create modal
function openCreateModal() {
    document.getElementById('ruleModalTitle').textContent = 'Tambah Auto Reply Rule';
    document.getElementById('ruleForm').reset();
    document.getElementById('rule-id').value = '';
    document.getElementById('rule-enabled').checked = true;
    document.getElementById('media-preview').innerHTML = '';
    document.getElementById('test-result').classList.add('d-none');
    mediaBase64 = null;
    mediaMimetype = null;
    mediaFilename = null;
    toggleMediaInput();
    
    new bootstrap.Modal(document.getElementById('ruleModal')).show();
}

// Edit rule
async function editRule(id) {
    try {
        const response = await fetch(`/api/auto-reply/${id}`);
        const data = await response.json();
        
        if (data.success && data.rule) {
            const rule = data.rule;
            
            document.getElementById('ruleModalTitle').textContent = 'Edit Auto Reply Rule';
            document.getElementById('rule-id').value = rule.id;
            document.getElementById('rule-name').value = rule.name;
            document.getElementById('rule-session').value = rule.session_id || '';
            document.getElementById('rule-trigger-type').value = rule.trigger_type;
            document.getElementById('rule-trigger-value').value = rule.trigger_value;
            document.getElementById('rule-match-case').checked = rule.match_case === 1;
            document.getElementById('rule-scope').value = rule.scope;
            document.getElementById('rule-cooldown').value = rule.cooldown_seconds || 0;
            document.getElementById('rule-response-type').value = rule.response_type;
            document.getElementById('rule-priority').value = rule.priority || 0;
            document.getElementById('rule-enabled').checked = rule.enabled === 1;
            document.getElementById('rule-response-content').value = rule.response_content;
            document.getElementById('test-result').classList.add('d-none');
            
            // Handle media
            mediaBase64 = rule.response_media_data;
            mediaMimetype = rule.response_media_mimetype;
            mediaFilename = rule.response_media_filename;
            
            if (mediaBase64) {
                document.getElementById('media-preview').innerHTML = `
                    <img src="data:${mediaMimetype};base64,${mediaBase64}" 
                         style="max-width: 200px; max-height: 200px; border-radius: 8px;">
                    <button type="button" class="btn btn-sm btn-light-danger ms-2" onclick="removeMedia()">
                        <i class="bi bi-x"></i> Hapus
                    </button>
                `;
            } else {
                document.getElementById('media-preview').innerHTML = '';
            }
            
            toggleMediaInput();
            new bootstrap.Modal(document.getElementById('ruleModal')).show();
        } else {
            showToast('error', 'Rule tidak ditemukan');
        }
    } catch (error) {
        console.error('Error loading rule:', error);
        showToast('error', 'Gagal memuat rule');
    }
}

// Save rule (create or update)
async function saveRule() {
    const id = document.getElementById('rule-id').value;
    const name = document.getElementById('rule-name').value.trim();
    const sessionId = document.getElementById('rule-session').value;
    const triggerType = document.getElementById('rule-trigger-type').value;
    const triggerValue = document.getElementById('rule-trigger-value').value.trim();
    const matchCase = document.getElementById('rule-match-case').checked;
    const scope = document.getElementById('rule-scope').value;
    const cooldown = parseInt(document.getElementById('rule-cooldown').value) || 0;
    const responseType = document.getElementById('rule-response-type').value;
    const priority = parseInt(document.getElementById('rule-priority').value) || 0;
    const enabled = document.getElementById('rule-enabled').checked;
    const responseContent = document.getElementById('rule-response-content').value.trim();
    
    // Validation
    if (!name) {
        showToast('error', 'Nama rule wajib diisi');
        return;
    }
    
    if (!triggerValue) {
        showToast('error', 'Nilai trigger wajib diisi');
        return;
    }
    
    if (!responseContent) {
        showToast('error', 'Konten response wajib diisi');
        return;
    }
    
    const payload = {
        session_id: sessionId || null,
        name,
        trigger_type: triggerType,
        trigger_value: triggerValue,
        match_case: matchCase,
        response_type: responseType,
        response_content: responseContent,
        response_media_data: responseType === 'image' ? mediaBase64 : null,
        response_media_mimetype: responseType === 'image' ? mediaMimetype : null,
        response_media_filename: responseType === 'image' ? mediaFilename : null,
        scope,
        enabled,
        priority,
        cooldown_seconds: cooldown
    };
    
    try {
        const url = id ? `/api/auto-reply/${id}` : '/api/auto-reply';
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('success', data.message);
            bootstrap.Modal.getInstance(document.getElementById('ruleModal')).hide();
            loadRules();
            loadStats();
        } else {
            showToast('error', data.error);
        }
    } catch (error) {
        console.error('Error saving rule:', error);
        showToast('error', 'Gagal menyimpan rule');
    }
}

// Delete rule
function deleteRule(id, name) {
    deleteRuleId = id;
    document.getElementById('delete-rule-name').textContent = name;
    new bootstrap.Modal(document.getElementById('deleteModal')).show();
}

async function confirmDelete() {
    if (!deleteRuleId) return;
    
    try {
        const response = await fetch(`/api/auto-reply/${deleteRuleId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('success', data.message);
            bootstrap.Modal.getInstance(document.getElementById('deleteModal')).hide();
            loadRules();
            loadStats();
        } else {
            showToast('error', data.error);
        }
    } catch (error) {
        console.error('Error deleting rule:', error);
        showToast('error', 'Gagal menghapus rule');
    }
    
    deleteRuleId = null;
}

// Toggle rule enabled status
async function toggleRule(id) {
    try {
        const response = await fetch(`/api/auto-reply/${id}/toggle`, {
            method: 'PATCH'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('success', data.message);
            loadRules();
            loadStats();
        } else {
            showToast('error', data.error);
        }
    } catch (error) {
        console.error('Error toggling rule:', error);
        showToast('error', 'Gagal mengubah status rule');
    }
}

// Test rule
async function testRule() {
    const id = document.getElementById('rule-id').value;
    const message = document.getElementById('test-message').value;
    const isGroup = document.getElementById('test-is-group').value === 'true';
    
    if (!message) {
        showToast('error', 'Masukkan pesan untuk test');
        return;
    }
    
    const resultDiv = document.getElementById('test-result');
    
    // If editing existing rule, test via API
    if (id) {
        try {
            const response = await fetch(`/api/auto-reply/${id}/test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, isGroup })
            });
            
            const data = await response.json();
            
            if (data.success) {
                resultDiv.className = `test-result ${data.matched ? 'success' : 'failed'}`;
                resultDiv.innerHTML = data.matched 
                    ? `<i class="bi bi-check-circle me-2"></i><strong>Match!</strong> Response: "${escapeHtml(data.response)}"`
                    : `<i class="bi bi-x-circle me-2"></i><strong>Tidak Match.</strong> ${data.reason}`;
                resultDiv.classList.remove('d-none');
            }
        } catch (error) {
            console.error('Error testing rule:', error);
            showToast('error', 'Gagal test rule');
        }
    } else {
        // Test locally for new rule
        const triggerType = document.getElementById('rule-trigger-type').value;
        const triggerValue = document.getElementById('rule-trigger-value').value;
        const matchCase = document.getElementById('rule-match-case').checked;
        const scope = document.getElementById('rule-scope').value;
        const responseContent = document.getElementById('rule-response-content').value;
        
        // Check scope
        if (scope === 'private' && isGroup) {
            resultDiv.className = 'test-result failed';
            resultDiv.innerHTML = `<i class="bi bi-x-circle me-2"></i><strong>Tidak Match.</strong> Rule hanya untuk chat pribadi`;
            resultDiv.classList.remove('d-none');
            return;
        }
        if (scope === 'group' && !isGroup) {
            resultDiv.className = 'test-result failed';
            resultDiv.innerHTML = `<i class="bi bi-x-circle me-2"></i><strong>Tidak Match.</strong> Rule hanya untuk grup`;
            resultDiv.classList.remove('d-none');
            return;
        }
        
        const text = matchCase ? message : message.toLowerCase();
        const trigger = matchCase ? triggerValue : triggerValue.toLowerCase();
        
        let matched = false;
        switch (triggerType) {
            case 'exact': matched = text === trigger; break;
            case 'contains': matched = text.includes(trigger); break;
            case 'starts_with': matched = text.startsWith(trigger); break;
            case 'ends_with': matched = text.endsWith(trigger); break;
            case 'regex':
                try {
                    const regex = new RegExp(triggerValue, matchCase ? '' : 'i');
                    matched = regex.test(message);
                } catch (e) {
                    showToast('error', 'Regex tidak valid');
                    return;
                }
                break;
        }
        
        resultDiv.className = `test-result ${matched ? 'success' : 'failed'}`;
        resultDiv.innerHTML = matched 
            ? `<i class="bi bi-check-circle me-2"></i><strong>Match!</strong> Response: "${escapeHtml(responseContent)}"`
            : `<i class="bi bi-x-circle me-2"></i><strong>Tidak Match.</strong> Pesan tidak cocok dengan trigger`;
        resultDiv.classList.remove('d-none');
    }
}

// Toggle media input visibility
function toggleMediaInput() {
    const responseType = document.getElementById('rule-response-type').value;
    const mediaSection = document.getElementById('media-upload-section');
    const responseHint = document.getElementById('response-hint');
    
    if (responseType === 'image') {
        mediaSection.classList.remove('d-none');
        responseHint.textContent = 'Caption untuk image (opsional)';
    } else if (responseType === 'template') {
        mediaSection.classList.add('d-none');
        responseHint.textContent = 'Masukkan kode template (tanpa #). Contoh: GREETING';
    } else {
        mediaSection.classList.add('d-none');
        responseHint.textContent = 'Teks response yang akan dikirim';
    }
}

// Handle media upload
function handleMediaUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('error', 'File harus berupa image');
        event.target.value = '';
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
        showToast('error', 'Ukuran file maksimal 10MB');
        event.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        mediaBase64 = e.target.result.split(',')[1];
        mediaMimetype = file.type;
        mediaFilename = file.name;
        
        document.getElementById('media-preview').innerHTML = `
            <img src="${e.target.result}" 
                 style="max-width: 200px; max-height: 200px; border-radius: 8px;">
            <button type="button" class="btn btn-sm btn-light-danger ms-2" onclick="removeMedia()">
                <i class="bi bi-x"></i> Hapus
            </button>
        `;
    };
    reader.readAsDataURL(file);
}

// Remove media
function removeMedia() {
    mediaBase64 = null;
    mediaMimetype = null;
    mediaFilename = null;
    document.getElementById('rule-media').value = '';
    document.getElementById('media-preview').innerHTML = '';
}

// Refresh rules
function refreshRules() {
    loadRules();
    loadStats();
    showToast('success', 'Rules berhasil direfresh');
}

// Helper functions
function getTriggerTypeLabel(type) {
    const labels = {
        'exact': 'Exact Match',
        'contains': 'Contains',
        'starts_with': 'Starts With',
        'ends_with': 'Ends With',
        'regex': 'Regex'
    };
    return labels[type] || type;
}

function getScopeLabel(scope) {
    const labels = {
        'all': 'All Chat',
        'private': 'Private',
        'group': 'Group'
    };
    return labels[scope] || scope;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(type, message) {
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: type,
        title: message,
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
    });
}
