// Initialize Socket.IO
const socket = io();

const urlParams = new URLSearchParams(window.location.search);
let currentSessionId = urlParams.get('id') || urlParams.get('sessionId') || '';
let currentSessionData = null;
let allSessions = [];
let adminToken = '';

// Bootstrap Modal Instances
let qrModalInst = null;
let pairingModalInst = null;

// Normalization helper for session matching (handles "wa 1 asli" vs "wa_1_asli")
function normalizeId(id) {
    return decodeURIComponent(id || '').trim().toLowerCase().replace(/[\s_-]+/g, '_');
}

function findSessionInList(targetId, list) {
    if (!targetId || !Array.isArray(list) || list.length === 0) return null;
    const direct = list.find(s => s.id === targetId);
    if (direct) return direct;
    
    const targetNorm = normalizeId(targetId);
    return list.find(s => normalizeId(s.id) === targetNorm) ||
           list.find(s => (s.id || '').toLowerCase() === targetId.toLowerCase()) || null;
}

// Helper to load HTML components
function loadHTMLWithScripts(containerId, html) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    const scripts = temp.querySelectorAll('script');
    scripts.forEach(script => script.remove());
    container.innerHTML = temp.innerHTML;
    
    scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        if (oldScript.src) {
            newScript.src = oldScript.src;
        } else {
            newScript.textContent = oldScript.textContent;
        }
        document.body.appendChild(newScript);
    });
}

// Load navigation components (header, sidebar, footer)
async function loadComponents() {
    try {
        const [headerRes, sidebarRes, footerRes] = await Promise.all([
            fetch('components/header.html'),
            fetch('components/sidebar.html'),
            fetch('components/footer.html')
        ]);
        
        loadHTMLWithScripts('header-container', await headerRes.text());
        loadHTMLWithScripts('sidebar-container', await sidebarRes.text());
        loadHTMLWithScripts('footer-container', await footerRes.text());
        
        if (typeof KTMenu !== 'undefined') KTMenu.createInstances();
        if (typeof KTDrawer !== 'undefined') KTDrawer.createInstances();
        if (typeof KTScroll !== 'undefined') KTScroll.createInstances();
        if (typeof initializeHeader === 'function') initializeHeader();
    } catch (error) {
        console.error('❌ Error loading components:', error);
    }
}

// Fetch comprehensive session details from HTTP REST API
async function fetchSessionDetail(showLoader = false) {
    if (!currentSessionId) return;

    if (showLoader) {
        document.getElementById('detailStatusDesc').textContent = 'Memperbarui data...';
    }

    try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(currentSessionId)}/detail`);
        if (!res.ok) {
            if (res.status === 404) {
                showSessionNotFound(currentSessionId);
                return;
            }
            throw new Error(`Server returned ${res.status}`);
        }

        const data = await res.json();
        if (data.success && data.session) {
            hideSessionNotFound();
            
            // Set canonical ID
            currentSessionId = data.session.id;
            currentSessionData = data.session;
            
            renderSessionUI(data.session, data.stats);
        } else {
            showSessionNotFound(currentSessionId);
        }
    } catch (err) {
        console.warn('⚠️ Fetch /api/sessions/:id/detail error:', err.message);
        // Fallback to socket allSessions if already received
        const matched = findSessionInList(currentSessionId, allSessions);
        if (matched) {
            hideSessionNotFound();
            currentSessionId = matched.id;
            renderSessionUI(matched, null);
        }
    }
}

// Render session information into UI
function renderSessionUI(session, stats) {
    const isConnected = !!session.isConnected;
    const phoneNumber = session.phoneNumber || session.user?.id?.split(':')[0] || '-';
    let userName = session.user?.name;
    if (!userName) {
        if (session.id.startsWith('guest_')) {
            userName = `Guest Session (${phoneNumber})`;
        } else if (phoneNumber !== '-') {
            userName = `WhatsApp User (${phoneNumber})`;
        } else {
            userName = 'WhatsApp Session';
        }
    }
    const jid = session.user?.id || (phoneNumber !== '-' ? `${phoneNumber}@s.whatsapp.net` : '-');
    const typeLabel = session.type === 'pairing' ? '🔢 Pairing Code' : '📱 QR Code';
    const createdAt = session.createdAt ? new Date(session.createdAt).toLocaleString('id-ID') : '-';
    const lastOn = session.lastConnected
        ? new Date(session.lastConnected).toLocaleString('id-ID')
        : (isConnected ? 'Saat ini' : '-');

    // Title & Subtitle
    document.getElementById('pageSessionId').textContent = session.id;
    document.getElementById('detailModalTitle').textContent = `Detail — ${session.id}`;
    document.getElementById('detailModalSubtitle').textContent = isConnected
        ? `✅ Aktif · ${userName}`
        : `❌ Offline · ${session.id}`;
        
    // Header gradient
    document.getElementById('detailModalHeader').style.background = isConnected
        ? 'linear-gradient(135deg,#50cd89 0%,#1bc5bd 100%)'
        : 'linear-gradient(135deg,#f1416c 0%,#d9214e 100%)';

    // Status Banner
    const dot = document.getElementById('detailStatusDot');
    const desc = document.getElementById('detailStatusDesc');
    if (isConnected) {
        dot.className = 'badge badge-light-success fs-7 px-4 py-2';
        dot.innerHTML = '<span class="status-dot-connected me-2"></span>Terhubung';
        desc.textContent = `Session aktif dan siap menerima / mengirim pesan WhatsApp`;
    } else {
        dot.className = 'badge badge-light-danger fs-7 px-4 py-2';
        dot.innerHTML = '<span class="status-dot-disconnected me-2"></span>Terputus';
        desc.textContent = 'Session tidak aktif. Klik Reconnect untuk menyambungkan kembali.';
    }

    // Stats
    if (stats) {
        document.getElementById('det-stat-total').textContent = (stats.total || 0).toLocaleString();
        document.getElementById('det-stat-incoming').textContent = (stats.incoming || 0).toLocaleString();
        document.getElementById('det-stat-outgoing').textContent = (stats.outgoing || 0).toLocaleString();
        document.getElementById('det-stat-last-activity').textContent = stats.lastActivity 
            ? new Date(stats.lastActivity).toLocaleString('id-ID') 
            : '-';
    }

    // Identitas
    document.getElementById('det-session-id').textContent = session.id;
    document.getElementById('det-name').textContent = userName;
    document.getElementById('det-phone').textContent = phoneNumber;
    document.getElementById('det-jid').textContent = jid;

    // Info Koneksi
    document.getElementById('det-connection-status').innerHTML = isConnected 
        ? '<span class="badge badge-light-success fw-bold">ONLINE</span>' 
        : '<span class="badge badge-light-danger fw-bold">OFFLINE</span>';
    document.getElementById('det-type').textContent = typeLabel;
    document.getElementById('det-created').textContent = createdAt;
    document.getElementById('det-last-connected').textContent = lastOn;

    // API Key & Endpoints
    const baseUrl = window.location.origin;
    const isGuest = !!session.guestToken || session.id.startsWith('guest_');
    const endpointPath = isGuest ? '/api/send-message' : '/api/wa/send';
    document.getElementById('det-base-url').value = baseUrl;
    document.getElementById('det-endpoint').value = `${baseUrl}${endpointPath}`;

    const tokenToUse = session.guestToken || adminToken;
    if (tokenToUse) {
        document.getElementById('det-api-key').value = tokenToUse;
        document.getElementById('det-curl-example').textContent = buildCurlExample(baseUrl, tokenToUse, session.id, isGuest);
    } else {
        // Will be populated when admin token loads
        document.getElementById('det-curl-example').textContent = buildCurlExample(baseUrl, '<YOUR_API_KEY>', session.id, isGuest);
    }

    // Raw JSON
    const cleanSessionForDisplay = {
        id: session.id,
        isConnected: isConnected,
        user: session.user || null,
        type: session.type || 'qr',
        phoneNumber: phoneNumber,
        createdAt: session.createdAt || null,
        lastConnected: session.lastConnected || null,
        stats: stats || undefined
    };
    document.getElementById('det-raw-json').textContent = JSON.stringify(cleanSessionForDisplay, null, 2);

    // Buttons
    document.getElementById('detailBtnLogout').classList.toggle('d-none', !isConnected);
    document.getElementById('detailBtnReconnectGroup').classList.toggle('d-none', isConnected);
}

function showSessionNotFound(id) {
    document.getElementById('sessionNotFoundAlert').classList.remove('d-none');
    document.getElementById('sessionNotFoundText').textContent = `Session "${id}" tidak ditemukan di memori server ataupun folder penyimpanan sessions.`;
    document.getElementById('sessionDetailContent').classList.add('d-none');
    document.getElementById('pageSessionId').textContent = `${id} (Tidak Ditemukan)`;
    document.getElementById('detailModalTitle').textContent = `Session Tidak Ditemukan`;
    document.getElementById('detailModalSubtitle').textContent = `ID: ${id}`;
    document.getElementById('detailModalHeader').style.background = 'linear-gradient(135deg,#6c757d 0%,#495057 100%)';
}

function hideSessionNotFound() {
    document.getElementById('sessionNotFoundAlert').classList.add('d-none');
    document.getElementById('sessionDetailContent').classList.remove('d-none');
}

function buildCurlExample(baseUrl, token, sessionId, isGuest = false) {
    if (isGuest) {
        return `curl -X POST "${baseUrl}/api/send-message" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "session_id": "${sessionId}",
    "to": "628123456789",
    "message": "Halo dari Billey WA API!"
  }'`;
    }
    return `curl -X POST "${baseUrl}/api/wa/send" \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: ${token}" \\
  -d '{
    "session_id": "${sessionId}",
    "to": "628123456789",
    "message": "Halo dari Billey WA API!"
  }'`;
}

window.copyDetailField = function(id, label) {
    const el = document.getElementById(id);
    if (!el) return;
    const text = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? el.value : el.textContent;

    const doToast = () => Swal.fire({
        icon: 'success',
        title: `${label} disalin!`,
        timer: 1400,
        showConfirmButton: false,
        toast: true,
        position: 'top-end',
        customClass: { popup: 'p-3' }
    });

    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(doToast).catch(() => fallbackCopy(text, doToast));
    } else {
        fallbackCopy(text, doToast);
    }
};

function fallbackCopy(text, cb) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        if (cb) cb();
    } catch (e) {
        console.error('Fallback copy failed', e);
    }
    document.body.removeChild(textarea);
}

// Document Ready Initialization
document.addEventListener('DOMContentLoaded', () => {
    if (!currentSessionId) {
        Swal.fire({
            icon: 'error',
            title: 'Parameter Hilang',
            text: 'Session ID tidak ditemukan di URL. Mengalihkan ke daftar session...'
        }).then(() => {
            window.location.href = 'manage-sessions.html';
        });
        return;
    }

    document.getElementById('pageSessionId').textContent = currentSessionId;
    loadComponents();

    // Initialize Bootstrap Modals
    const qEl = document.getElementById('qrModal');
    if (qEl && typeof bootstrap !== 'undefined') {
        qrModalInst = new bootstrap.Modal(qEl, { backdrop: 'static', keyboard: false });
    }
    const pEl = document.getElementById('pairingModal');
    if (pEl && typeof bootstrap !== 'undefined') {
        pairingModalInst = new bootstrap.Modal(pEl, { backdrop: 'static', keyboard: false });
    }

    // Toggle API Key Show/Hide
    const btnToggleApiKey = document.getElementById('btnToggleApiKey');
    if (btnToggleApiKey) {
        btnToggleApiKey.addEventListener('click', function() {
            const input = document.getElementById('det-api-key');
            const icon = document.getElementById('iconApiKey');
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'bi bi-eye-slash fs-6';
            } else {
                input.type = 'password';
                icon.className = 'bi bi-eye fs-6';
            }
        });
    }

    // Refresh button
    const btnRefresh = document.getElementById('btnRefreshDetail');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            fetchSessionDetail(true);
            socket.emit('get-sessions');
        });
    }

    // Actions
    document.getElementById('detailBtnLogout').onclick = () => logoutSession();
    document.getElementById('detailBtnDelete').onclick = () => deleteSession();
    document.getElementById('detailBtnReconnect').onclick = () => reconnectViaQr();
    document.getElementById('reconnectViaQrAction').onclick = () => reconnectViaQr();
    document.getElementById('reconnectViaPairingAction').onclick = () => reconnectViaPairing();

    // Fetch Admin API Token
    fetch('/api/auth/me')
        .then(r => r.json())
        .then(data => {
            adminToken = data.user?.token || '';
            const keyInput = document.getElementById('det-api-key');
            if (!keyInput.value || keyInput.value === 'Memuat...' || keyInput.value === '(token tidak tersedia)') {
                keyInput.value = adminToken || '(token tidak tersedia)';
                const baseUrl = window.location.origin;
                document.getElementById('det-curl-example').textContent = buildCurlExample(baseUrl, adminToken || '<YOUR_API_KEY>', currentSessionId);
            }
        })
        .catch(() => {});

    // Initial Fetch via REST API
    fetchSessionDetail();
    fetchSessionTemplatePackages();
    fetchSessionAutoReplyPackages();

    document.getElementById('btnSaveSessionPackages')?.addEventListener('click', saveSessionTemplatePackages);
    document.getElementById('btnSaveSessionAutoReplyPackages')?.addEventListener('click', saveSessionAutoReplyPackages);
});

// Socket.IO Events
socket.on('connect', () => {
    console.log('⚡ Socket connected to server');
    socket.emit('get-sessions');
});

socket.on('all-sessions', (sessions) => {
    allSessions = sessions || [];
    const matched = findSessionInList(currentSessionId, allSessions);
    if (matched) {
        hideSessionNotFound();
        currentSessionId = matched.id;
        // Keep stats intact if already loaded
        fetchSessionDetail();
    }
});

socket.on('session-status', (data) => {
    if (!data || !data.sessionId) return;
    if (data.sessionId === currentSessionId || normalizeId(data.sessionId) === normalizeId(currentSessionId)) {
        console.log('🔄 Session status update received:', data);
        
        if (data.status === 'connected') {
            if (qrModalInst) qrModalInst.hide();
            if (pairingModalInst) pairingModalInst.hide();
            Swal.close();
            
            Swal.fire({
                icon: 'success',
                title: 'Terhubung!',
                text: `Session ${data.sessionId} berhasil terhubung!`,
                timer: 2000,
                showConfirmButton: false
            });
        }
        
        fetchSessionDetail();
    }
});

// Handle QR events (supporting both 'qr' and 'qr-code')
function handleQrReceived(data) {
    if (!data || !data.sessionId) return;
    if (data.sessionId !== currentSessionId && normalizeId(data.sessionId) !== normalizeId(currentSessionId)) return;

    Swal.close();
    if (pairingModalInst) pairingModalInst.hide();

    const container = document.getElementById('qr-code-container');
    if (container) {
        container.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
            try {
                new QRCode(container, {
                    text: data.qr,
                    width: 256,
                    height: 256,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.M
                });
            } catch (qrErr) {
                renderQrFallback(data.qr, container);
            }
        } else {
            renderQrFallback(data.qr, container);
        }
    }
    
    if (qrModalInst) {
        qrModalInst.show();
    } else {
        const qEl = document.getElementById('qrModal');
        if (qEl && typeof bootstrap !== 'undefined') {
            qrModalInst = new bootstrap.Modal(qEl, { backdrop: 'static', keyboard: false });
            qrModalInst.show();
        }
    }
}

function renderQrFallback(qrData, container) {
    container.innerHTML = '';
    const img = document.createElement('img');
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(qrData)}`;
    img.alt = 'QR Code WhatsApp';
    img.className = 'img-fluid rounded shadow-sm';
    container.appendChild(img);
}

socket.on('qr', handleQrReceived);
socket.on('qr-code', handleQrReceived);

// Handle Pairing Code
socket.on('pairing-code', (data) => {
    if (!data || !data.sessionId) return;
    if (data.sessionId !== currentSessionId && normalizeId(data.sessionId) !== normalizeId(currentSessionId)) return;

    Swal.close();
    if (qrModalInst) qrModalInst.hide();

    const display = document.getElementById('pairing-code-display');
    if (display) {
        display.textContent = data.code || '------';
    }

    if (pairingModalInst) {
        pairingModalInst.show();
    } else {
        const pEl = document.getElementById('pairingModal');
        if (pEl && typeof bootstrap !== 'undefined') {
            pairingModalInst = new bootstrap.Modal(pEl, { backdrop: 'static', keyboard: false });
            pairingModalInst.show();
        }
    }
});

socket.on('message', (msg) => {
    console.log('Server message:', msg);
});

socket.on('error', (err) => {
    Swal.fire({
        icon: 'error',
        title: 'Terjadi Kesalahan',
        text: err
    });
});

// Action implementations
function logoutSession() {
    Swal.fire({
        title: 'Logout Session?',
        text: `Koneksi WhatsApp pada session "${currentSessionId}" akan diputus.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f1416c',
        cancelButtonColor: '#b5b5c3',
        confirmButtonText: 'Ya, Logout',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            Swal.fire({
                title: 'Melogout session...',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });
            socket.emit('logout', currentSessionId);
            setTimeout(() => {
                fetchSessionDetail();
                Swal.close();
            }, 1500);
        }
    });
}

function deleteSession() {
    Swal.fire({
        title: 'Hapus Session?',
        text: `Semua data autentikasi dan histori session "${currentSessionId}" akan dihapus permanen!`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f1416c',
        cancelButtonColor: '#b5b5c3',
        confirmButtonText: 'Ya, Hapus Permanen',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            Swal.fire({
                title: 'Menghapus session...',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });
            socket.emit('delete-session', currentSessionId);
            setTimeout(() => {
                Swal.fire({
                    icon: 'success',
                    title: 'Terhapus!',
                    text: 'Session berhasil dihapus.',
                    timer: 1500,
                    showConfirmButton: false
                }).then(() => {
                    window.location.href = 'manage-sessions.html';
                });
            }, 1800);
        }
    });
}

function reconnectViaQr() {
    Swal.fire({
        title: 'Menyiapkan QR Code...',
        text: 'Meminta QR Code WhatsApp dari server',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });
    
    // Clear old container
    const container = document.getElementById('qr-code-container');
    if (container) {
        container.innerHTML = '<div class="text-center text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Meminta QR code dari server...</div>';
    }
    
    socket.emit('start-session-qr', currentSessionId);
}

function reconnectViaPairing() {
    const existingPhone = currentSessionData?.phoneNumber || '';
    
    Swal.fire({
        title: 'Pairing Code',
        text: 'Masukkan nomor WhatsApp untuk menerima Pairing Code (contoh: 628123456789):',
        input: 'text',
        inputValue: existingPhone.replace(/[^0-9]/g, ''),
        inputPlaceholder: '628xxxxxxxxxx',
        showCancelButton: true,
        confirmButtonText: 'Minta Kode Pairing',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#50cd89',
        preConfirm: (phone) => {
            if (!phone || phone.trim().length < 9) {
                Swal.showValidationMessage('Nomor WhatsApp harus valid (minimal 9 digit)!');
                return false;
            }
            return phone.trim();
        }
    }).then((res) => {
        if (res.isConfirmed && res.value) {
            Swal.fire({
                title: 'Membuat Pairing Code...',
                text: 'Harap tunggu...',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });
            
            socket.emit('start-session-pairing', {
                sessionId: currentSessionId,
                phoneNumber: res.value
            });
        }
    });
}

// ============================================
// Session Template Packages
// ============================================
async function fetchSessionTemplatePackages() {
    if (!currentSessionId) return;
    const container = document.getElementById('sessionTemplatePackagesContainer');
    if (!container) return;

    try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(currentSessionId)}/template-packages`);
        const data = await res.json();

        if (!data.success) {
            container.innerHTML = `<div class="col-12 text-danger fs-7">Gagal memuat paket template: ${data.error || 'Unknown error'}</div>`;
            return;
        }

        const allPackages = data.all || [];
        const assigned = data.assigned || [];
        const assignedIds = new Set(assigned.map(p => Number(p.id)));

        if (allPackages.length === 0) {
            container.innerHTML = `
                <div class="col-12 text-muted fs-7">
                    Belum ada kelompok paket template. Buat paket terlebih dahulu di <a href="templates.html" class="fw-bold text-primary">Halaman Chat Templates</a>.
                </div>
            `;
            return;
        }

        const isNoneAssigned = assigned.length === 0;
        let html = '';
        allPackages.forEach(pkg => {
            const isChecked = assignedIds.has(Number(pkg.id));
            const isDefaultFallback = isNoneAssigned && pkg.is_default === 1;

            html += `
                <div class="col-md-6 col-lg-4">
                    <div class="border rounded p-3 d-flex align-items-start gap-3 h-100 bg-light ${isChecked ? 'border-primary' : 'border-gray-300'}">
                        <div class="form-check form-check-custom form-check-solid mt-1">
                            <input class="form-check-input session-pkg-check" type="checkbox" value="${pkg.id}" id="pkg_${pkg.id}" ${isChecked ? 'checked' : ''}>
                        </div>
                        <div class="flex-grow-1">
                            <label class="form-check-label fw-bold text-gray-800 d-flex align-items-center gap-2 cursor-pointer mb-1" for="pkg_${pkg.id}">
                                <span class="badge" style="background-color: ${pkg.color || '#3699FF'}; color: #fff; font-size: 0.8rem;">
                                    ${escapeHtml(pkg.name)}
                                </span>
                                ${pkg.is_default ? '<span class="badge badge-light-primary fs-8">Default</span>' : ''}
                            </label>
                            <div class="text-muted fs-8 mb-1">${escapeHtml(pkg.description || 'Tidak ada deskripsi')}</div>
                            <div class="d-flex align-items-center gap-2">
                                <span class="badge badge-light fs-8 text-gray-700">
                                    <i class="bi bi-file-text me-1 text-primary"></i>${pkg.template_count || 0} template
                                </span>
                                ${isDefaultFallback ? '<span class="text-warning fs-8 fst-italic">(aktif otomatis sbg default)</span>' : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Status hint
        const hint = document.getElementById('sessionPackageStatusHint');
        if (hint) {
            if (assigned.length > 0) {
                const names = assigned.map(p => p.name).join(', ');
                hint.innerHTML = `<i class="bi bi-check-circle-fill text-success me-1"></i>Paket aktif khusus: <strong>${escapeHtml(names)}</strong>`;
            } else {
                hint.innerHTML = `<i class="bi bi-info-circle text-primary me-1"></i>Tidak ada paket khusus dipilih. Menggunakan paket bawaan (Default).`;
            }
        }
    } catch (err) {
        console.error('Error fetching session template packages:', err);
        container.innerHTML = `<div class="col-12 text-danger fs-7">Terjadi kesalahan saat memuat paket template.</div>`;
    }
}

async function saveSessionTemplatePackages() {
    if (!currentSessionId) return;

    const btn = document.getElementById('btnSaveSessionPackages');
    const checkedInputs = Array.from(document.querySelectorAll('.session-pkg-check:checked'));
    const selectedIds = checkedInputs.map(el => Number(el.value));

    const originalBtnHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Menyimpan...';
    }

    try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(currentSessionId)}/template-packages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ package_ids: selectedIds })
        });
        const data = await res.json();

        if (data.success) {
            Swal.fire({
                icon: 'success',
                title: 'Berhasil!',
                text: 'Paket template untuk session ini berhasil disimpan.',
                timer: 1800,
                showConfirmButton: false
            });
            await fetchSessionTemplatePackages();
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Gagal Menyimpan',
                text: data.error || 'Terjadi kesalahan saat menyimpan paket template.'
            });
        }
    } catch (err) {
        console.error('Error saving session template packages:', err);
        Swal.fire({
            icon: 'error',
            title: 'Kesalahan Server',
            text: err.message
        });
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalBtnHtml;
        }
    }
}


// ============================================
// Session Auto Reply Packages
// ============================================
async function fetchSessionAutoReplyPackages() {
    if (!currentSessionId) return;
    const container = document.getElementById('sessionAutoReplyPackagesContainer');
    if (!container) return;

    try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(currentSessionId)}/auto-reply-packages`);
        const data = await res.json();

        if (!data.success) {
            container.innerHTML = `<div class="col-12 text-danger fs-7">Gagal memuat paket auto reply: ${data.error || 'Unknown error'}</div>`;
            return;
        }

        const allPackages = data.all || [];
        const assigned = data.assigned || [];
        const assignedIds = new Set(assigned.map(p => Number(p.id)));

        if (allPackages.length === 0) {
            container.innerHTML = `
                <div class="col-12 text-muted fs-7">
                    Belum ada kelompok paket auto reply. Buat paket terlebih dahulu di <a href="auto-reply.html" class="fw-bold text-warning">Halaman Auto Reply</a>.
                </div>
            `;
            return;
        }

        let html = '';
        allPackages.forEach(pkg => {
            const isChecked = assignedIds.has(Number(pkg.id));

            html += `
                <div class="col-md-6 col-lg-4">
                    <div class="border rounded p-3 d-flex align-items-start gap-3 h-100 bg-light ${isChecked ? 'border-warning shadow-xs' : 'border-gray-300'}">
                        <div class="form-check form-check-custom form-check-solid mt-1">
                            <input class="form-check-input session-autoreply-pkg-check" type="checkbox" value="${pkg.id}" id="arpkg_${pkg.id}" ${isChecked ? 'checked' : ''}>
                        </div>
                        <div class="flex-grow-1">
                            <label class="form-check-label fw-bold text-gray-800 d-flex align-items-center gap-2 cursor-pointer mb-1" for="arpkg_${pkg.id}">
                                <span class="badge" style="background-color: ${pkg.color || '#25D366'}; color: #fff; font-size: 0.8rem;">
                                    ${escapeHtml(pkg.name)}
                                </span>
                                ${pkg.is_default ? '<span class="badge badge-light-primary fs-8">Default</span>' : ''}
                            </label>
                            <div class="text-muted fs-8 mb-1">${escapeHtml(pkg.description || 'Tidak ada deskripsi')}</div>
                            <div class="d-flex align-items-center gap-2">
                                <span class="badge badge-light fs-8 text-gray-700">
                                    <i class="bi bi-robot me-1 text-warning"></i>${pkg.rule_count || 0} rule
                                </span>
                                <span class="badge badge-light fs-8 text-muted">
                                    Prioritas: ${pkg.priority || 0}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Status hint
        const hint = document.getElementById('sessionAutoReplyPackageStatusHint');
        if (hint) {
            if (assigned.length > 0) {
                const names = assigned.map(p => p.name).join(', ');
                hint.innerHTML = `<span class="badge badge-light-success fw-bold me-2"><i class="bi bi-check-circle-fill text-success me-1"></i>Auto Reply AKTIF</span> <span class="text-gray-700">Paket aktif: <strong>${escapeHtml(names)}</strong> (${assigned.length} paket)</span>`;
            } else {
                hint.innerHTML = `<span class="badge badge-light-danger fw-bold me-2"><i class="bi bi-x-circle-fill text-danger me-1"></i>Auto Reply NONAKTIF</span> <span class="text-danger fs-8">Tidak ada paket yang dipilih. Session ini tidak akan membalas pesan otomatis.</span>`;
            }
        }
    } catch (err) {
        console.error('Error fetching session auto reply packages:', err);
        container.innerHTML = `<div class="col-12 text-danger fs-7">Terjadi kesalahan saat memuat paket auto reply.</div>`;
    }
}

async function saveSessionAutoReplyPackages() {
    if (!currentSessionId) return;

    const btn = document.getElementById('btnSaveSessionAutoReplyPackages');
    const checkedInputs = Array.from(document.querySelectorAll('.session-autoreply-pkg-check:checked'));
    const selectedIds = checkedInputs.map(el => Number(el.value));

    const originalBtnHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Menyimpan...';
    }

    try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(currentSessionId)}/auto-reply-packages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ package_ids: selectedIds })
        });
        const data = await res.json();

        if (data.success) {
            Swal.fire({
                icon: 'success',
                title: 'Berhasil!',
                text: selectedIds.length > 0 
                    ? 'Paket auto reply untuk session ini berhasil disimpan.'
                    : 'Auto reply dinonaktifkan untuk session ini (tidak ada paket dipilih).',
                timer: 1800,
                showConfirmButton: false
            });
            await fetchSessionAutoReplyPackages();
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Gagal Menyimpan',
                text: data.error || 'Terjadi kesalahan saat menyimpan paket auto reply.'
            });
        }
    } catch (err) {
        console.error('Error saving session auto reply packages:', err);
        Swal.fire({
            icon: 'error',
            title: 'Kesalahan Server',
            text: err.message
        });
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalBtnHtml;
        }
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
