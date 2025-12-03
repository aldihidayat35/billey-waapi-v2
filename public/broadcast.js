/**
 * Broadcast Message - WhatsApp Gateway
 * Kirim pesan ke banyak nomor sekaligus dengan atau tanpa gambar
 */

// ============================================
// SOCKET & STATE
// ============================================
const socket = io();

const BroadcastState = {
    sessionId: null,
    phoneNumbers: [],       // Array of {phone, name}
    isRunning: false,
    shouldStop: false,
    successCount: 0,
    failedCount: 0,
    logs: [],
    mediaFile: null,
    mediaBase64: null
};

// ============================================
// DOM ELEMENTS
// ============================================
const DOM = {};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('📣 Broadcast page initialized');
    
    cacheDOM();
    loadComponents();
    setupEventListeners();
    setupSocketListeners();
    loadSessions();
    setupDragDrop();
});

function cacheDOM() {
    DOM.sessionSelect = document.getElementById('session-select');
    DOM.phoneTags = document.getElementById('phone-tags');
    DOM.phoneInput = document.getElementById('phone-input');
    DOM.phoneCount = document.getElementById('phone-count');
    DOM.importFile = document.getElementById('import-file');
    DOM.messageInput = document.getElementById('message-input');
    DOM.mediaUpload = document.getElementById('media-upload');
    DOM.mediaInput = document.getElementById('media-input');
    DOM.mediaLabel = document.getElementById('media-label');
    DOM.mediaPreview = document.getElementById('media-preview');
    DOM.clearMediaBtn = document.getElementById('clear-media-btn');
    DOM.delayMin = document.getElementById('delay-min');
    DOM.delayMax = document.getElementById('delay-max');
    DOM.sendBtn = document.getElementById('send-btn');
    DOM.progressSection = document.getElementById('progress-section');
    DOM.progressBar = document.getElementById('progress-bar');
    DOM.progressCurrent = document.getElementById('progress-current');
    DOM.progressTotal = document.getElementById('progress-total');
    DOM.progressStatus = document.getElementById('progress-status');
    DOM.statSuccess = document.getElementById('stat-success');
    DOM.statFailed = document.getElementById('stat-failed');
    DOM.statPending = document.getElementById('stat-pending');
    DOM.broadcastLog = document.getElementById('broadcast-log');
    DOM.stopBtn = document.getElementById('stop-btn');
    DOM.exportBtn = document.getElementById('export-btn');
}

function loadComponents() {
    ['header', 'sidebar', 'footer'].forEach(comp => {
        fetch(`components/${comp}.html`)
            .then(r => r.text())
            .then(html => {
                const el = document.getElementById(`${comp}-container`);
                if (el) el.innerHTML = html;
                if (comp === 'sidebar') {
                    setTimeout(() => {
                        const link = document.querySelector('a[href="broadcast.html"]');
                        if (link) link.classList.add('active');
                    }, 100);
                }
            })
            .catch(() => {});
    });
}

function setupEventListeners() {
    // Session change
    DOM.sessionSelect?.addEventListener('change', (e) => {
        BroadcastState.sessionId = e.target.value;
    });
    
    // Phone input - Enter to add
    DOM.phoneInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addPhoneNumber(DOM.phoneInput.value.trim());
            DOM.phoneInput.value = '';
        }
    });
    
    // Phone input - Paste handler
    DOM.phoneInput?.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text');
        const lines = text.split(/[\n,;]+/).map(l => l.trim()).filter(l => l);
        lines.forEach(line => {
            const parts = line.split(',');
            if (parts.length >= 1) {
                addPhoneNumber(parts[0].trim(), parts[1]?.trim());
            }
        });
        DOM.phoneInput.value = '';
    });
}

function setupSocketListeners() {
    socket.on('connect', () => {
        console.log('🔌 Socket connected');
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Socket disconnected');
    });
    
    // Message sent callbacks
    socket.on('message-sent', (data) => {
        if (data.broadcastId) {
            handleBroadcastResult(data.phone, true);
        }
    });
    
    socket.on('image-sent', (data) => {
        if (data.broadcastId) {
            handleBroadcastResult(data.phone, data.success, data.error);
        }
    });
    
    socket.on('send-error', (data) => {
        if (data.broadcastId) {
            handleBroadcastResult(data.phone, false, data.error);
        }
    });
}

function setupDragDrop() {
    const uploadArea = DOM.mediaUpload;
    if (!uploadArea) return;
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#009ef7';
        uploadArea.style.background = '#f1faff';
    });
    
    uploadArea.addEventListener('dragleave', () => {
        if (!BroadcastState.mediaFile) {
            uploadArea.style.borderColor = '#e4e6ef';
            uploadArea.style.background = '#f9f9f9';
        }
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files[0]) {
            processMediaFile(e.dataTransfer.files[0]);
        }
    });
}

// ============================================
// SESSION MANAGEMENT
// ============================================
function loadSessions() {
    fetch('/api/sessions')
        .then(r => r.json())
        .then(data => {
            if (data.success && DOM.sessionSelect) {
                DOM.sessionSelect.innerHTML = '<option value="">-- Pilih Session --</option>';
                
                (data.sessions || []).forEach(s => {
                    if (s.status === 'connected') {
                        const opt = document.createElement('option');
                        opt.value = s.id;
                        opt.textContent = `${s.id} ${s.phoneNumber ? '- ' + s.phoneNumber : ''}`;
                        DOM.sessionSelect.appendChild(opt);
                    }
                });
            }
        })
        .catch(console.error);
}

// ============================================
// PHONE NUMBER MANAGEMENT
// ============================================
function addPhoneNumber(phone, name = '') {
    if (!phone) return;
    
    // Clean phone number
    phone = phone.replace(/[^0-9]/g, '');
    
    // Convert 0 prefix to 62
    if (phone.startsWith('0')) {
        phone = '62' + phone.slice(1);
    }
    
    // Validate
    if (phone.length < 10 || phone.length > 15) {
        showToast('warning', 'Nomor telepon tidak valid');
        return;
    }
    
    // Check duplicate
    if (BroadcastState.phoneNumbers.find(p => p.phone === phone)) {
        showToast('info', 'Nomor sudah ada dalam daftar');
        return;
    }
    
    // Add to state
    BroadcastState.phoneNumbers.push({ phone, name: name || phone });
    
    // Render tag
    renderPhoneTags();
}

function removePhoneNumber(phone) {
    BroadcastState.phoneNumbers = BroadcastState.phoneNumbers.filter(p => p.phone !== phone);
    renderPhoneTags();
}

function renderPhoneTags() {
    if (!DOM.phoneTags) return;
    
    DOM.phoneTags.innerHTML = BroadcastState.phoneNumbers.map(p => `
        <span class="phone-tag">
            ${p.name !== p.phone ? `<strong>${escapeHtml(p.name)}</strong> - ` : ''}${p.phone}
            <span class="remove-tag" onclick="removePhoneNumber('${p.phone}')">×</span>
        </span>
    `).join('');
    
    DOM.phoneCount.textContent = BroadcastState.phoneNumbers.length;
}

function clearAllPhones() {
    if (BroadcastState.phoneNumbers.length === 0) return;
    
    Swal.fire({
        title: 'Hapus Semua?',
        text: 'Semua nomor akan dihapus dari daftar',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Ya, Hapus',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            BroadcastState.phoneNumbers = [];
            renderPhoneTags();
            showToast('success', 'Daftar nomor dikosongkan');
        }
    });
}

function importFromFile() {
    DOM.importFile?.click();
}

function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split(/[\n\r]+/).filter(l => l.trim());
        let added = 0;
        
        lines.forEach(line => {
            const parts = line.split(',').map(p => p.trim());
            if (parts[0]) {
                const phone = parts[0].replace(/[^0-9]/g, '');
                const name = parts[1] || '';
                
                if (phone.length >= 10) {
                    const cleanPhone = phone.startsWith('0') ? '62' + phone.slice(1) : phone;
                    if (!BroadcastState.phoneNumbers.find(p => p.phone === cleanPhone)) {
                        BroadcastState.phoneNumbers.push({ phone: cleanPhone, name: name || cleanPhone });
                        added++;
                    }
                }
            }
        });
        
        renderPhoneTags();
        showToast('success', `${added} nomor berhasil diimport`);
    };
    
    reader.readAsText(file);
    event.target.value = ''; // Reset input
}

// ============================================
// MEDIA HANDLING
// ============================================
function handleMediaSelect(event) {
    const file = event.target.files[0];
    if (file) {
        processMediaFile(file);
    }
}

function processMediaFile(file) {
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showToast('error', 'File harus berupa gambar');
        return;
    }
    
    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
        showToast('error', 'Ukuran file maksimal 5MB');
        return;
    }
    
    BroadcastState.mediaFile = file;
    
    // Convert to base64
    const reader = new FileReader();
    reader.onload = (e) => {
        BroadcastState.mediaBase64 = e.target.result;
        
        // Show preview
        DOM.mediaPreview.src = e.target.result;
        DOM.mediaPreview.classList.remove('d-none');
        DOM.mediaLabel.textContent = file.name;
        DOM.mediaUpload.classList.add('has-file');
        DOM.clearMediaBtn.classList.remove('d-none');
    };
    reader.readAsDataURL(file);
}

function clearMedia() {
    BroadcastState.mediaFile = null;
    BroadcastState.mediaBase64 = null;
    
    DOM.mediaPreview.src = '';
    DOM.mediaPreview.classList.add('d-none');
    DOM.mediaLabel.textContent = 'Klik atau drag gambar ke sini';
    DOM.mediaUpload.classList.remove('has-file');
    DOM.mediaUpload.style.borderColor = '#e4e6ef';
    DOM.mediaUpload.style.background = '#f9f9f9';
    DOM.clearMediaBtn.classList.add('d-none');
    DOM.mediaInput.value = '';
}

// ============================================
// BROADCAST EXECUTION
// ============================================
async function startBroadcast() {
    // Validation
    if (!BroadcastState.sessionId) {
        showToast('warning', 'Pilih session terlebih dahulu');
        return;
    }
    
    if (BroadcastState.phoneNumbers.length === 0) {
        showToast('warning', 'Tambahkan minimal 1 nomor tujuan');
        return;
    }
    
    const message = DOM.messageInput.value.trim();
    if (!message && !BroadcastState.mediaBase64) {
        showToast('warning', 'Tulis pesan atau pilih gambar untuk dikirim');
        return;
    }
    
    // Confirm
    const result = await Swal.fire({
        title: 'Mulai Broadcast?',
        html: `
            <p>Anda akan mengirim pesan ke <strong>${BroadcastState.phoneNumbers.length}</strong> nomor.</p>
            ${BroadcastState.mediaBase64 ? '<p><i class="bi bi-image"></i> Dengan gambar</p>' : ''}
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Mulai',
        cancelButtonText: 'Batal'
    });
    
    if (!result.isConfirmed) return;
    
    // Initialize
    BroadcastState.isRunning = true;
    BroadcastState.shouldStop = false;
    BroadcastState.successCount = 0;
    BroadcastState.failedCount = 0;
    BroadcastState.logs = [];
    
    // Show progress section
    DOM.progressSection.classList.remove('d-none');
    DOM.sendBtn.disabled = true;
    DOM.stopBtn.disabled = false;
    DOM.exportBtn.disabled = true;
    
    // Update UI
    const total = BroadcastState.phoneNumbers.length;
    DOM.progressTotal.textContent = total;
    DOM.statPending.textContent = total;
    DOM.statSuccess.textContent = '0';
    DOM.statFailed.textContent = '0';
    DOM.progressBar.style.width = '0%';
    DOM.broadcastLog.innerHTML = '';
    
    // Get delay settings
    const delayMin = parseInt(DOM.delayMin.value) || 3;
    const delayMax = parseInt(DOM.delayMax.value) || 7;
    
    addLog('info', `Memulai broadcast ke ${total} nomor...`);
    
    // Process each phone number
    for (let i = 0; i < BroadcastState.phoneNumbers.length; i++) {
        if (BroadcastState.shouldStop) {
            addLog('info', 'Broadcast dihentikan oleh user');
            break;
        }
        
        const { phone, name } = BroadcastState.phoneNumbers[i];
        
        // Replace template variables
        let personalizedMessage = message
            .replace(/\{name\}/g, name || phone)
            .replace(/\{phone\}/g, phone);
        
        DOM.progressStatus.textContent = `Mengirim ke ${phone}...`;
        
        try {
            if (BroadcastState.mediaBase64) {
                // Send image with caption
                await sendImageMessage(phone, BroadcastState.mediaBase64, personalizedMessage);
            } else {
                // Send text only
                await sendTextMessage(phone, personalizedMessage);
            }
            
            BroadcastState.successCount++;
            addLog('success', `✓ ${phone} - Terkirim`);
        } catch (error) {
            BroadcastState.failedCount++;
            addLog('error', `✗ ${phone} - ${error.message || 'Gagal'}`);
        }
        
        // Update progress
        const current = i + 1;
        const progress = Math.round((current / total) * 100);
        DOM.progressCurrent.textContent = current;
        DOM.progressBar.style.width = `${progress}%`;
        DOM.statSuccess.textContent = BroadcastState.successCount;
        DOM.statFailed.textContent = BroadcastState.failedCount;
        DOM.statPending.textContent = total - current;
        
        // Delay before next message (except last one)
        if (i < BroadcastState.phoneNumbers.length - 1 && !BroadcastState.shouldStop) {
            const delay = Math.random() * (delayMax - delayMin) + delayMin;
            DOM.progressStatus.textContent = `Menunggu ${delay.toFixed(1)} detik...`;
            await sleep(delay * 1000);
        }
    }
    
    // Finished
    BroadcastState.isRunning = false;
    DOM.sendBtn.disabled = false;
    DOM.stopBtn.disabled = true;
    DOM.exportBtn.disabled = false;
    DOM.progressStatus.textContent = 'Selesai!';
    
    addLog('info', `Broadcast selesai: ${BroadcastState.successCount} berhasil, ${BroadcastState.failedCount} gagal`);
    
    // Show completion notification
    Swal.fire({
        title: 'Broadcast Selesai!',
        html: `
            <div class="text-center">
                <p class="text-success fs-3 mb-0">${BroadcastState.successCount} Berhasil</p>
                <p class="text-danger fs-3 mb-0">${BroadcastState.failedCount} Gagal</p>
            </div>
        `,
        icon: 'success',
        confirmButtonText: 'OK'
    });
}

function sendTextMessage(phone, message) {
    return new Promise((resolve, reject) => {
        const tempId = `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        socket.emit('send-message', {
            sessionId: BroadcastState.sessionId,
            to: phone,
            message: message,
            tempId: tempId,
            broadcastId: tempId
        });
        
        // Wait for response with timeout
        const timeout = setTimeout(() => {
            socket.off(`message-sent-${tempId}`);
            socket.off(`send-error-${tempId}`);
            resolve(); // Assume success if no error
        }, 10000);
        
        const handleSuccess = (data) => {
            clearTimeout(timeout);
            socket.off(`send-error-${tempId}`);
            resolve(data);
        };
        
        const handleError = (data) => {
            clearTimeout(timeout);
            socket.off(`message-sent-${tempId}`);
            reject(new Error(data.error || 'Send failed'));
        };
        
        socket.once('message-sent', (data) => {
            if (data.tempId === tempId) handleSuccess(data);
        });
        
        socket.once('send-error', (data) => {
            if (data.tempId === tempId) handleError(data);
        });
    });
}

function sendImageMessage(phone, imageBase64, caption) {
    return new Promise((resolve, reject) => {
        const tempId = `broadcast_img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        socket.emit('send-image', {
            sessionId: BroadcastState.sessionId,
            to: phone,
            imageBase64: imageBase64,
            caption: caption,
            tempId: tempId,
            broadcastId: tempId
        });
        
        // Wait for response with timeout
        const timeout = setTimeout(() => {
            socket.off(`image-sent-${tempId}`);
            socket.off(`send-error-${tempId}`);
            resolve(); // Assume success if no error
        }, 15000);
        
        const handleSuccess = (data) => {
            clearTimeout(timeout);
            socket.off(`send-error-${tempId}`);
            resolve(data);
        };
        
        const handleError = (data) => {
            clearTimeout(timeout);
            socket.off(`image-sent-${tempId}`);
            reject(new Error(data.error || 'Send failed'));
        };
        
        socket.once('image-sent', (data) => {
            if (data.tempId === tempId) handleSuccess(data);
        });
        
        socket.once('send-error', (data) => {
            if (data.tempId === tempId) handleError(data);
        });
    });
}

function stopBroadcast() {
    Swal.fire({
        title: 'Hentikan Broadcast?',
        text: 'Proses broadcast akan dihentikan',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Ya, Hentikan',
        cancelButtonText: 'Lanjutkan'
    }).then((result) => {
        if (result.isConfirmed) {
            BroadcastState.shouldStop = true;
            DOM.stopBtn.disabled = true;
            DOM.progressStatus.textContent = 'Menghentikan...';
        }
    });
}

function handleBroadcastResult(phone, success, error = null) {
    if (success) {
        BroadcastState.successCount++;
        addLog('success', `✓ ${phone} - Terkirim`);
    } else {
        BroadcastState.failedCount++;
        addLog('error', `✗ ${phone} - ${error || 'Gagal'}`);
    }
    
    DOM.statSuccess.textContent = BroadcastState.successCount;
    DOM.statFailed.textContent = BroadcastState.failedCount;
}

// ============================================
// LOG MANAGEMENT
// ============================================
function addLog(type, message) {
    const time = new Date().toLocaleTimeString('id-ID');
    const logEntry = { time, type, message };
    BroadcastState.logs.push(logEntry);
    
    const logHtml = `
        <div class="log-entry ${type}">
            <span class="time">[${time}]</span>${escapeHtml(message)}
        </div>
    `;
    
    DOM.broadcastLog.insertAdjacentHTML('beforeend', logHtml);
    DOM.broadcastLog.scrollTop = DOM.broadcastLog.scrollHeight;
}

function clearLog() {
    BroadcastState.logs = [];
    DOM.broadcastLog.innerHTML = '';
}

function exportLog() {
    if (BroadcastState.logs.length === 0) {
        showToast('info', 'Tidak ada log untuk diekspor');
        return;
    }
    
    let content = 'BROADCAST LOG - ' + new Date().toLocaleString('id-ID') + '\n';
    content += '='.repeat(50) + '\n\n';
    content += `Total: ${BroadcastState.phoneNumbers.length}\n`;
    content += `Berhasil: ${BroadcastState.successCount}\n`;
    content += `Gagal: ${BroadcastState.failedCount}\n\n`;
    content += 'LOG:\n';
    content += '-'.repeat(50) + '\n';
    
    BroadcastState.logs.forEach(log => {
        content += `[${log.time}] ${log.message}\n`;
    });
    
    // Download file
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `broadcast-log-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('success', 'Log berhasil diekspor');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(type, message) {
    const icons = {
        success: 'success',
        error: 'error',
        warning: 'warning',
        info: 'info'
    };
    
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: icons[type] || 'info',
        title: message,
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
    });
}
