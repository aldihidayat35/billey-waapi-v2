/**
 * guest-integration.js
 * Billey WA API - Professional Guest Integration Management
 */

const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('id') || '';
const token = urlParams.get('key') || '';

const els = {
    statusBadge: document.getElementById('status-badge'),
    sessionLabel: document.getElementById('session-id-label'),
    mainContent: document.getElementById('mainContent'),
    alertError: document.getElementById('alertError'),
    errorText: document.getElementById('errorText'),
    toast: document.getElementById('toast'),
    dataGrid: document.getElementById('dataGrid'),
    
    // Account details
    accountPhone: document.getElementById('account-phone-display'),
    accountName: document.getElementById('account-name-display'),
    accountJid: document.getElementById('account-jid-display'),
    
    // Stats
    statTotal: document.getElementById('stat-total-msg'),
    statIncoming: document.getElementById('stat-incoming-msg'),
    statOutgoing: document.getElementById('stat-outgoing-msg'),
    
    // Test sender
    testTo: document.getElementById('test-to'),
    testMessage: document.getElementById('test-message'),
    btnSendTest: document.getElementById('btn-send-test'),
    testResultBox: document.getElementById('test-result-box')
};

let socket = null;
let isConnected = false;
let currentInfo = null;

if (!sessionId || !token) {
    showError('Link integrasi tidak valid. Parameter "id" dan "key" diperlukan untuk membuka kredensial.');
} else {
    initApp();
}

function initApp() {
    els.sessionLabel.textContent = sessionId;

    // Initial Fetch
    fetchStatus();

    // Socket Connection for Realtime updates
    try {
        socket = io();
        socket.on('connect', () => {
            console.log('⚡ Socket connected, watching guest session:', sessionId);
            socket.emit('guest-watch', { sessionId, token });
        });

        socket.on('guest-session.status', (data) => {
            if (data.sessionId !== sessionId) return;
            console.log('🔄 Socket guest-session.status:', data);
            isConnected = (data.status === 'connected' || !!data.isConnected);
            updateStatusUI(data.status, isConnected);
            fetchStatus();
        });

        socket.on('guest-session.deleted', (data) => {
            if (data.sessionId !== sessionId) return;
            showError('Session ini telah dihapus secara permanen dari server.');
        });

        socket.on('guest-session.error', (data) => {
            if (data.error && data.error.includes('Token guest tidak valid')) {
                showError('Akses ditolak. Token API Anda salah atau telah kadaluarsa.');
            }
        });
    } catch (err) {
        console.warn('Socket init error:', err);
    }
}

async function fetchStatus() {
    try {
        const baseUrl = window.location.origin;
        const res = await fetch(`${baseUrl}/api/guest-session/${encodeURIComponent(sessionId)}/status`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                showError('Akses ditolak. Token API guest tidak valid.');
                return;
            }
            if (res.status === 404) {
                showError('Session tidak ditemukan di server.');
                return;
            }
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data.success) {
            throw new Error(data.error || 'Gagal memuat status session');
        }

        isConnected = (data.status === 'connected');
        updateStatusUI(data.status, isConnected);

        if (data.info) {
            renderData(data.info);
        }
    } catch (err) {
        console.error('Fetch status error:', err);
    }
}

function renderData(info) {
    currentInfo = info;

    // 1. Account profile box
    const rawPhone = info.phoneNumber || (info.jid ? info.jid.split(':')[0].split('@')[0] : '');
    const formattedPhone = formatPhone(rawPhone);
    const displayName = info.pushName || info.sessionName || 'WhatsApp User';
    const jid = info.jid || (rawPhone ? `${rawPhone}@s.whatsapp.net` : '-');

    els.accountPhone.innerHTML = `<span>${formattedPhone || '-'}</span>`;
    els.accountName.textContent = displayName;
    els.accountJid.textContent = `JID: ${jid}`;

    // Fill test destination if empty
    if (!els.testTo.value && rawPhone) {
        els.testTo.value = rawPhone;
    }

    // 2. Message statistics
    const stats = info.stats || {};
    els.statTotal.textContent = (stats.total || 0).toLocaleString();
    els.statIncoming.textContent = (stats.incoming || 0).toLocaleString();
    els.statOutgoing.textContent = (stats.outgoing || 0).toLocaleString();

    // 3. Populate 2-Column Data Grid
    const configJson = JSON.stringify(info, null, 2);
    const payloadJson = JSON.stringify(info.examplePayload || {
        session_id: info.sessionId,
        to: rawPhone || '628xxxxxxxxxx',
        message: 'Halo dari aplikasi lain'
    }, null, 2);

    const curlExample = info.exampleCurl || `curl -X POST "${info.apiBaseUrl}/send-message" \\
  -H "Authorization: Bearer ${info.apiToken}" \\
  -H "Content-Type: application/json" \\
  -d '${payloadJson}'`;

    const statusHtml = isConnected
        ? '<span style="color:#15803d; font-weight:800;"><i class="bi bi-circle-fill me-1" style="font-size:9px;"></i>CONNECTED (Online)</span>'
        : '<span style="color:#e11d48; font-weight:800;"><i class="bi bi-circle-fill me-1" style="font-size:9px;"></i>DISCONNECTED (Offline)</span>';

    els.dataGrid.innerHTML = `
        ${renderGridItem('Session ID', info.sessionId, 'Salin Session ID')}
        ${renderGridItem('Status Koneksi', statusHtml, null, false, true)}
        ${renderGridItem('Nomor WhatsApp', formattedPhone || '-', 'Salin Nomor')}
        ${renderGridItem('Nama Akun / Push Name', displayName, 'Salin Nama')}
        ${renderGridItem('JID WhatsApp', jid, 'Salin JID', true)}
        ${renderGridItem('API Base URL', info.apiBaseUrl, 'Salin Base URL', true)}
        ${renderGridItem('API Access Token', info.apiToken, 'Salin Token', true, false, true)}
        ${renderGridItem('Endpoint Kirim Pesan', info.sendMessageEndpoint || 'POST /api/send-message', 'Salin Endpoint', true)}
        ${renderGridItem('Waktu Terhubung', formatDate(info.connectedAt))}
        ${renderGridItem('Waktu Dibuat', formatDate(info.createdAt))}
        ${renderPreBlock('Contoh Request cURL', curlExample, 'Salin cURL')}
        ${renderPreBlock('Contoh Payload JSON', payloadJson, 'Salin Payload')}
    `;

    // Re-attach event listeners for copy and secret toggles
    attachGridInteractions();
}

function renderGridItem(label, value, copyLabel, isMono = false, isRawHtml = false, isSecret = false) {
    let copyButtonHtml = '';
    let toggleButtonHtml = '';
    let displayValueHtml = '';

    if (isSecret && value) {
        const masked = value.slice(0, 8) + '••••••••••••••••' + value.slice(-4);
        toggleButtonHtml = `<button type="button" class="copy-btn btn-secret-toggle" data-real="${escapeAttr(value)}" data-masked="${escapeAttr(masked)}" title="Tampilkan / Sembunyikan"><i class="bi bi-eye-fill"></i></button>`;
        copyButtonHtml = `<button type="button" class="copy-btn" data-copy="${escapeAttr(value)}" data-label="${copyLabel}"><i class="bi bi-copy"></i></button>`;
        displayValueHtml = `<div class="data-value mono val-secret">${escapeHtml(masked)}</div>`;
    } else {
        if (copyLabel) {
            const rawCopyVal = isRawHtml ? '' : value;
            copyButtonHtml = `<button type="button" class="copy-btn" data-copy="${escapeAttr(rawCopyVal)}" data-label="${copyLabel}"><i class="bi bi-copy"></i></button>`;
        }
        displayValueHtml = `<div class="data-value ${isMono ? 'mono' : ''}">${isRawHtml ? value : escapeHtml(value || '-')}</div>`;
    }

    return `
        <div class="data-item">
            <div class="data-label">
                <span>${label}</span>
                <div class="data-label-actions">
                    ${toggleButtonHtml}
                    ${copyButtonHtml}
                </div>
            </div>
            ${displayValueHtml}
        </div>
    `;
}

function renderPreBlock(label, content, copyLabel) {
    return `
        <div class="data-item full">
            <div class="data-label">
                <span>${label}</span>
                <button type="button" class="copy-btn" data-copy="${escapeAttr(content)}" data-label="${copyLabel}">
                    <i class="bi bi-clipboard-check me-1"></i> Salin Kode
                </button>
            </div>
            <pre class="data-value">${escapeHtml(content)}</pre>
        </div>
    `;
}

function attachGridInteractions() {
    // Copy buttons
    els.dataGrid.querySelectorAll('[data-copy]').forEach(btn => {
        btn.onclick = () => {
            copyText(btn.dataset.copy, btn.dataset.label || 'Data disalin');
        };
    });

    // Secret show/hide toggle
    els.dataGrid.querySelectorAll('.btn-secret-toggle').forEach(btn => {
        btn.onclick = (e) => {
            const wrap = e.currentTarget.closest('.data-item');
            const valEl = wrap.querySelector('.val-secret');
            const icon = btn.querySelector('i');
            const real = btn.dataset.real;
            const masked = btn.dataset.masked;

            if (valEl.textContent === masked) {
                valEl.textContent = real;
                icon.className = 'bi bi-eye-slash-fill';
            } else {
                valEl.textContent = masked;
                icon.className = 'bi bi-eye-fill';
            }
        };
    });
}

// Live Interactive Test Message Sender
window.sendTestMessage = async function() {
    const to = (els.testTo.value || '').trim();
    const message = (els.testMessage.value || '').trim();

    if (!to) {
        showToast('Masukkan nomor tujuan WhatsApp!');
        els.testTo.focus();
        return;
    }
    if (!message) {
        showToast('Masukkan pesan teks!');
        els.testMessage.focus();
        return;
    }

    const btn = els.btnSendTest;
    const resBox = els.testResultBox;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> Mengirim Pesan...`;
    resBox.className = 'd-none';

    try {
        const baseUrl = window.location.origin;
        const res = await fetch(`${baseUrl}/api/send-message`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: sessionId,
                to: to,
                message: message
            })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'Gagal mengirim pesan');
        }

        resBox.className = '';
        resBox.style.background = '#dcfce7';
        resBox.style.color = '#15803d';
        resBox.style.border = '1px solid #bbf7d0';
        resBox.innerHTML = `
            <strong><i class="bi bi-check-circle-fill me-1"></i> Berhasil Terkirim!</strong><br>
            Tujuan: <code>${escapeHtml(to)}</code> · Msg ID: <code>${escapeHtml(data.data?.msg_id || '-')}</code>
        `;

        showToast('Pesan uji coba berhasil terkirim!');

        // Update stats
        const curOut = parseInt(els.statOutgoing.textContent.replace(/,/g, '') || '0', 10);
        const curTot = parseInt(els.statTotal.textContent.replace(/,/g, '') || '0', 10);
        els.statOutgoing.textContent = (curOut + 1).toLocaleString();
        els.statTotal.textContent = (curTot + 1).toLocaleString();

    } catch (err) {
        console.error('Test message error:', err);
        resBox.className = '';
        resBox.style.background = '#fff1f2';
        resBox.style.color = '#be123c';
        resBox.style.border = '1px solid #ffe4e6';
        resBox.innerHTML = `<strong><i class="bi bi-exclamation-triangle-fill me-1"></i> Gagal Mengirim:</strong> ${escapeHtml(err.message)}`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-send-fill"></i><span>Kirim Pesan Sekarang</span>`;
    }
};

window.downloadConfigJson = function() {
    if (!currentInfo) return;
    const configStr = JSON.stringify(currentInfo, null, 2);
    const blob = new Blob([configStr], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${sessionId}-config.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    showToast('Konfigurasi JSON diunduh');
};

window.copyAllConfig = function() {
    if (!currentInfo) return;
    const configStr = JSON.stringify(currentInfo, null, 2);
    copyText(configStr, 'Semua konfigurasi berhasil disalin!');
};

window.logoutSession = function() {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: 'Logout Sesi WhatsApp?',
            text: 'Koneksi WhatsApp pada HP Anda akan diputuskan dari server kami.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#e11d48',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Ya, Logout Sekarang',
            cancelButtonText: 'Batal'
        }).then((result) => {
            if (result.isConfirmed) {
                if (socket) socket.emit('guest-logout', { sessionId, token });
                showToast('Permintaan logout dikirim...');
                setTimeout(fetchStatus, 1500);
            }
        });
    } else {
        if (confirm('Koneksi WhatsApp Anda akan terputus dari server. Lanjutkan Logout?')) {
            if (socket) socket.emit('guest-logout', { sessionId, token });
        }
    }
};

window.deleteSession = function() {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: 'Hapus Sesi Permanen?',
            text: 'Seluruh kredensial dan sesi WhatsApp ini akan dihapus permanen. API token tidak akan dapat digunakan lagi.',
            icon: 'error',
            showCancelButton: true,
            confirmButtonColor: '#be123c',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Ya, Hapus Permanen',
            cancelButtonText: 'Batal'
        }).then((result) => {
            if (result.isConfirmed) {
                if (socket) socket.emit('guest-delete', { sessionId, token });
                showToast('Menghapus sesi...');
                setTimeout(() => {
                    showError('Sesi ini telah berhasil dihapus secara permanen.');
                }, 1000);
            }
        });
    } else {
        if (confirm('Seluruh data sesi akan dihapus permanen. Lanjutkan?')) {
            if (socket) socket.emit('guest-delete', { sessionId, token });
        }
    }
};

function updateStatusUI(status, connected) {
    if (connected) {
        els.statusBadge.className = 'badge connected';
        els.statusBadge.textContent = 'Terhubung';
    } else {
        els.statusBadge.className = 'badge disconnected';
        els.statusBadge.textContent = 'Terputus';
    }
}

function showError(msg) {
    els.mainContent.classList.add('d-none');
    els.alertError.classList.remove('d-none');
    els.errorText.textContent = msg;
}

function showToast(text) {
    els.toast.textContent = text;
    els.toast.classList.add('show');
    setTimeout(() => {
        els.toast.classList.remove('show');
    }, 1800);
}

async function copyText(text, label = 'Data disalin') {
    if (!text) return;
    try {
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        showToast(label);
    } catch (err) {
        console.error('Copy failed:', err);
    }
}

function formatPhone(phone) {
    if (!phone) return '-';
    let clean = String(phone).replace(/[^0-9]/g, '');
    if (clean.startsWith('62')) {
        return `+62 ${clean.slice(2, 5)}-${clean.slice(5, 9)}-${clean.slice(9)}`;
    }
    return `+${clean}`;
}

function formatDate(val) {
    if (!val) return '-';
    try {
        return new Date(val).toLocaleString('id-ID', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    } catch {
        return String(val);
    }
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, s => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[s]));
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
}
