/**
 * Member Chat Portal — mobile-first WhatsApp-style UI
 * Realtime via Socket.IO, multi-session via tabs
 */

// ─── State ────────────────────────────────────────────────────
const S = {
    socket: null,
    user: null,
    sessions: [],           // assigned sessions with live status
    activeSession: null,    // currently selected session id
    conversations: [],      // all conversations (across sessions)
    activeContact: null,    // currently open chat contact JID
    messages: new Map(),    // messageId → msg (dedup)
    pendingMsgs: new Map(), // tempId → msg
    unread: {},             // sessionId → count
    selectedFile: null,
    selectedFileData: null,
    _loadingConversations: false,  // Guard against concurrent loads
    _conversationsLoaded: false,   // Track if initial load done
    assignmentNotes: {},    // contact → { notes, priority }
    adminPhone: '',         // admin phone for report feature
};

const COLORS = [
    '#667eea','#f5576c','#4facfe','#43e97b','#fa709a','#a18cd1','#fad0c4','#ffecd2'
];

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load user info
    try {
        const r = await fetch('/api/auth/me');
        const d = await r.json();
        if (!d.success) { window.location.href = '/auth/login'; return; }
        S.user = d.user;
        document.getElementById('topbar-name').textContent = d.user.name;
    } catch { window.location.href = '/auth/login'; return; }

    // 2. Connect socket
    S.socket = io();
    setupSocketListeners();

    // 3. Load assignment notes (before sessions, so icons render on first paint)
    await loadAssignmentNotes();

    // 4. Load sessions (triggers selectSession → loadConversations → renderConversations)
    await loadSessions();

    // 5. UI wiring
    wireUI();
    wireNoteModal();
    wireReportModal();

    // 6. Load admin phone for report feature
    try {
        const rp = await fetch('/api/settings/public');
        const dp = await rp.json();
        if (dp.success && dp.settings?.admin_phone) S.adminPhone = dp.settings.admin_phone;
    } catch {}

    // 7. Poll unread every 60s as fallback sync
    loadUnread();
    setInterval(loadUnread, 60000);
});

// ─── Sessions ─────────────────────────────────────────────────
async function loadSessions() {
    try {
        const r = await fetch('/api/member/sessions');
        const d = await r.json();
        S.sessions = d.sessions || [];
    } catch { S.sessions = []; }

    if (S.sessions.length === 0) {
        document.getElementById('no-sessions').classList.remove('d-none');
        document.getElementById('conv-panel').classList.add('d-none');
        document.getElementById('chat-panel').classList.add('d-none');
        return;
    }

    document.getElementById('no-sessions').classList.add('d-none');
    document.getElementById('conv-panel').classList.remove('d-none');
    document.getElementById('chat-panel').classList.remove('d-none');

    renderSessionTabs();

    // Auto-select: restore saved session or pick first
    const savedSession = sessionStorage.getItem('member_activeSession');
    if (!S.activeSession) {
        if (savedSession && S.sessions.find(s => s.id === savedSession)) {
            selectSession(savedSession);
        } else {
            selectSession(S.sessions[0].id);
        }
    }
}

// ─── Assignment Notes ──────────────────────────────────────────
async function loadAssignmentNotes() {
    try {
        const r = await fetch('/api/member/assignment-notes');
        const d = await r.json();
        S.assignmentNotes = {};
        for (const n of (d.notes || [])) {
            if (n.notes || n.priority !== 'low') {
                S.assignmentNotes[n.contact] = { notes: n.notes || '', priority: n.priority || 'low', session_id: n.session_id };
            }
        }
    } catch { S.assignmentNotes = {}; }
}

function openNoteModal(contact) {
    const n = S.assignmentNotes[contact];
    if (!n) return;
    const modal = document.getElementById('note-modal');
    const overlay = document.getElementById('note-modal-overlay');
    const priorityLabels = { low: 'Low', medium: 'Medium', critical: 'Critical' };
    modal.className = 'note-modal priority-' + n.priority;
    document.getElementById('note-priority-badge').textContent = priorityLabels[n.priority] || 'Low';
    document.getElementById('note-content').textContent = n.notes || '(Tidak ada catatan)';
    overlay.classList.add('show');
}

function closeNoteModal() {
    document.getElementById('note-modal-overlay').classList.remove('show');
}

function wireNoteModal() {
    document.getElementById('note-modal-close').addEventListener('click', closeNoteModal);
    document.getElementById('note-modal-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('note-modal-overlay')) closeNoteModal();
    });
}

// ─── Report Modal ──────────────────────────────────────────────
function openReportModal(contact) {
    const overlay = document.getElementById('report-modal-overlay');
    document.getElementById('report-worker-name').value = S.user?.name || '-';
    document.getElementById('report-client-phone').value = cleanPhone(contact);
    document.getElementById('report-text').value = '';
    overlay.dataset.contact = contact;
    overlay.classList.add('show');
    document.getElementById('report-text').focus();
}

function closeReportModal() {
    document.getElementById('report-modal-overlay').classList.remove('show');
}

function wireReportModal() {
    document.getElementById('report-modal-close').addEventListener('click', closeReportModal);
    document.getElementById('report-modal-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('report-modal-overlay')) closeReportModal();
    });
    document.getElementById('report-send-btn').addEventListener('click', () => {
        const reportText = document.getElementById('report-text').value.trim();
        if (!reportText) {
            Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'Laporan tidak boleh kosong', timer: 2000, showConfirmButton: false });
            return;
        }
        if (!S.adminPhone) {
            Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Nomor admin belum diatur', timer: 2500, showConfirmButton: false });
            return;
        }
        const workerName = S.user?.name || '-';
        const clientPhone = document.getElementById('report-client-phone').value;
        const message = `*Laporan Worker*\n\nWorker : ${workerName}\nClient : ${clientPhone}\nLaporan : ${reportText}`;
        const waUrl = `https://wa.me/${S.adminPhone}?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
        closeReportModal();
    });
}

function renderSessionTabs() {
    const container = document.getElementById('session-tabs');
    container.innerHTML = S.sessions.map(s => {
        const active = s.id === S.activeSession ? 'active' : '';
        const dotCls = s.isConnected ? 'online' : 'offline';
        const label = s.name || s.id;
        const unread = S.unread[s.id] || 0;
        const badge = unread > 0 ? `<span class="tab-badge">${unread > 99 ? '99+' : unread}</span>` : '';
        return `<div class="wa-tab ${active}" data-sid="${s.id}">
            <span class="dot ${dotCls}"></span>${escHtml(label)}${badge}
        </div>`;
    }).join('');

    container.querySelectorAll('.wa-tab').forEach(tab => {
        tab.addEventListener('click', () => selectSession(tab.dataset.sid));
    });
}

function selectSession(sid) {
    S.activeSession = sid;
    S.activeContact = null;
    S._conversationsLoaded = false;
    S._loadingConversations = false;
    sessionStorage.setItem('member_activeSession', sid);
    renderSessionTabs();
    loadConversations();
    showConvPanel();
}

// ─── Conversations ────────────────────────────────────────────
async function loadConversations(silent = false) {
    // Guard: skip if already loading
    if (S._loadingConversations) return;
    S._loadingConversations = true;
    
    // Show loading indicator only on first explicit load (not silent reconnect)
    const list = document.getElementById('conv-list');
    if (!silent && !S._conversationsLoaded) {
        list.innerHTML = `<div class="conv-empty"><div class="spinner-border spinner-border-sm text-primary"></div><p>Memuat percakapan...</p></div>`;
    }
    
    try {
        const r = await fetch('/api/member/conversations');
        const d = await r.json();
        S.conversations = (d.conversations || []).filter(c =>
            c.sessionId === S.activeSession &&
            !/@broadcast$/i.test(c.contact) &&
            !/@newsletter$/i.test(c.contact)
        );
    } catch { S.conversations = []; }
    
    S._loadingConversations = false;
    S._conversationsLoaded = true;
    
    // Sync session unread from actual conversation unread sums
    if (S.activeSession) {
        S.unread[S.activeSession] = S.conversations.reduce((sum, c) => sum + (c.unread || 0), 0);
    }
    renderConversations();
    
    // Auto-restore last opened chat after refresh
    if (!S.activeContact && !silent) {
        const savedContact = sessionStorage.getItem('member_activeContact');
        if (savedContact && S.conversations.find(c => c.contact === savedContact)) {
            openChat(savedContact);
        }
    }
}

function renderConversations(filter = '') {
    const list = document.getElementById('conv-list');
    let items = S.conversations;
    if (filter) {
        const f = filter.toLowerCase();
        items = items.filter(c => cleanPhone(c.contact).includes(f) || (c.lastMessage || '').toLowerCase().includes(f));
    }

    if (items.length === 0) {
        list.innerHTML = `<div class="conv-empty"><i class="bi bi-chat-left-dots"></i><p>Belum ada percakapan</p></div>`;
        return;
    }

    list.innerHTML = items.map(c => {
        const phone = cleanPhone(c.contact);
        const color = avatarColor(phone);
        const initials = phone.slice(-2);
        const active = c.contact === S.activeContact ? 'active' : '';
        const time = formatTime(c.lastTime);
        const unreadBadge = c.unread > 0 ? `<div class="conv-unread">${c.unread > 99 ? '99+' : c.unread}</div>` : '';
        const typeIcon = c.lastMessageType && c.lastMessageType !== 'text' ? '📎 ' : '';
        const lastMsg = c.lastMessage ? truncate(`${typeIcon}${c.lastMessage}`, 40) : '—';
        const displayPhone = maskPhone(phone);
        const noteData = S.assignmentNotes[c.contact];
        const noteIcon = noteData ? `<span class="note-icon note-${noteData.priority}" data-note-contact="${c.contact}" title="Catatan penugasan"><i class="bi bi-sticky-fill"></i></span>` : '';
        const reportIcon = `<span class="report-icon" data-report-contact="${c.contact}" title="Laporan"><i class="bi bi-flag-fill"></i></span>`;
        return `<div class="conv-item ${active}" data-contact="${c.contact}">
            <div class="conv-ava" style="background:${color};">${initials}</div>
            <div class="conv-body">
                <div class="conv-row1">
                    <div class="conv-name">${escHtml(displayPhone)}${noteIcon}${reportIcon}</div>
                    <div class="conv-time">${time}</div>
                </div>
                <div class="conv-row2">
                    <div class="conv-last">${escHtml(lastMsg)}</div>
                    ${unreadBadge}
                </div>
            </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.conv-item').forEach(el => {
        el.addEventListener('click', () => openChat(el.dataset.contact));
    });
    list.querySelectorAll('.note-icon[data-note-contact]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            openNoteModal(el.dataset.noteContact);
        });
    });
    list.querySelectorAll('.report-icon[data-report-contact]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            openReportModal(el.dataset.reportContact);
        });
    });
}

// ─── Chat ─────────────────────────────────────────────────────
async function openChat(contact) {
    S.activeContact = contact;
    S.messages.clear();
    sessionStorage.setItem('member_activeContact', contact);

    // Highlight in list
    document.querySelectorAll('.conv-item').forEach(el => el.classList.toggle('active', el.dataset.contact === contact));

    // Show chat panel (mobile: hide conv-panel)
    showChatPanel();

    // Update header
    const phone = cleanPhone(contact);
    const color = avatarColor(phone);
    document.getElementById('chat-hdr-avatar').style.background = color;
    document.getElementById('chat-hdr-avatar').textContent = phone.slice(-2);
    document.getElementById('chat-hdr-name').textContent = maskPhone(phone);
    document.getElementById('chat-hdr-phone').textContent = isPhoneVisible() ? contact : '***';

    // Note icon in header
    const hdrNote = document.getElementById('chat-hdr-note');
    const noteData = S.assignmentNotes[contact];
    if (noteData) {
        hdrNote.className = 'note-icon-hdr note-' + noteData.priority;
        hdrNote.classList.remove('d-none');
        hdrNote.onclick = () => openNoteModal(contact);
    } else {
        hdrNote.classList.add('d-none');
    }

    // Report icon in header
    const hdrReport = document.getElementById('chat-hdr-report');
    if (hdrReport) {
        hdrReport.onclick = () => openReportModal(contact);
    }

    // Show chat UI elements
    document.getElementById('chat-hdr').classList.remove('d-none');
    document.getElementById('chat-messages').classList.remove('d-none');
    document.getElementById('input-bar').classList.remove('d-none');
    document.getElementById('chat-empty').classList.add('d-none');

    // Load messages
    try {
        const r = await fetch(`/api/member/messages/${encodeURIComponent(S.activeSession)}/${encodeURIComponent(contact)}?limit=200`);
        const d = await r.json();
        (d.messages || []).forEach(m => {
            S.messages.set(m.message_id || m.id, m);
        });
    } catch (e) { console.error('Load messages error:', e); }

    renderMessages();
    scrollToBottom();
    // Clear unread immediately when opening a conversation
    markConversationRead(S.activeSession, contact);
}

// Reload active chat messages (used after reconnect to catch missed messages)
async function reloadActiveChat() {
    if (!S.activeSession || !S.activeContact) return;
    try {
        const r = await fetch(`/api/member/messages/${encodeURIComponent(S.activeSession)}/${encodeURIComponent(S.activeContact)}?limit=200`);
        const d = await r.json();
        let hasNew = false;
        (d.messages || []).forEach(m => {
            const id = m.message_id || m.id;
            if (!S.messages.has(id)) hasNew = true;
            S.messages.set(id, m);
        });
        if (hasNew) {
            renderMessages();
            scrollToBottom();
        }
    } catch (e) { console.error('Reload chat error:', e); }
}

function renderMessages() {
    const container = document.getElementById('chat-messages');
    const msgs = Array.from(S.messages.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (msgs.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:var(--wa-text2);padding:40px 20px;font-size:13px;">Belum ada pesan.</div>';
        return;
    }

    let html = '';
    let lastDate = '';

    for (const m of msgs) {
        const date = formatDate(m.timestamp);
        if (date !== lastDate) {
            html += `<div class="msg-day"><div class="msg-day-label">${date}</div></div>`;
            lastDate = date;
        }

        const dir = m.direction === 'outgoing' ? 'out' : 'in';
        const isPending = m.status === 'pending';
        const time = formatMsgTime(m.timestamp);
        let body = '';
        const msgId = m.message_id || m.id;
        const mediaUrl = m.media_url || '';
        const hasMedia = mediaUrl || m.media_data || m.has_media;

        // Resolve media source: prefer media_url (file), then API endpoint, then base64
        function resolveMediaSrc(defaultMime) {
            if (mediaUrl) return mediaUrl;
            if (msgId) return `/api/member/media/${encodeURIComponent(msgId)}`;
            if (m.media_data && m.media_data.length > 10) {
                return `data:${m.mimetype || defaultMime};base64,${m.media_data}`;
            }
            return '';
        }

        // Media rendering — uses file URL first, then API endpoint, then inline base64
        if (m.message_type === 'image' && hasMedia) {
            const imgSrc = resolveMediaSrc('image/jpeg');
            body += `<div class="msg-media"><img src="${imgSrc}" onclick="viewImage(this.src)" alt="" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=msg-media-expired><i class=bi-image></i> Media sudah dihapus</div>'"></div>`;
        } else if (m.message_type === 'image' && !hasMedia) {
            body += `<div class="msg-media-expired"><i class="bi bi-image"></i> Media sudah dihapus otomatis</div>`;
        } else if (m.message_type === 'document' && hasMedia) {
            const fname = m.filename || 'Document';
            const docSrc = resolveMediaSrc('application/octet-stream');
            body += `<div class="msg-doc" onclick="window.open('${docSrc}', '_blank')"><i class="bi bi-file-earmark-arrow-down"></i><span class="msg-doc-name">${escHtml(fname)}</span></div>`;
        } else if (m.message_type === 'document' && !hasMedia) {
            const fname = m.filename || 'Document';
            body += `<div class="msg-doc"><i class="bi bi-file-earmark"></i><span class="msg-doc-name">${escHtml(fname)}</span></div>`;
        } else if (m.message_type === 'video' && hasMedia) {
            const vidSrc = resolveMediaSrc('video/mp4');
            body += `<div class="msg-media"><video controls preload="metadata"><source src="${vidSrc}" type="${m.mimetype || 'video/mp4'}"></video></div>`;
        } else if (m.message_type === 'video' && !hasMedia) {
            body += `<div class="msg-media-expired"><i class="bi bi-camera-video"></i> Media sudah dihapus otomatis</div>`;
        } else if ((m.message_type === 'audio' || m.message_type === 'voice' || m.message_type === 'ptt') && hasMedia) {
            const audioSrc = resolveMediaSrc('audio/ogg');
            body += `<div class="msg-media"><audio controls preload="metadata"><source src="${audioSrc}" type="${m.mimetype || 'audio/ogg'}"></audio></div>`;
        } else if (m.message_type === 'sticker' && hasMedia) {
            const stickerSrc = resolveMediaSrc('image/webp');
            body += `<div class="msg-media"><img src="${stickerSrc}" alt="Sticker" style="max-width:150px;max-height:150px;"></div>`;
        }

        // Text/caption content — use caption field for media, content for text
        const displayText = (m.message_type !== 'text') ? (m.caption || m.content || '') : (m.content || '');
        if (displayText) {
            const isFilenameOnly = (m.message_type === 'document') && m.filename && displayText === m.filename;
            if (!isFilenameOnly) {
                body += `<div class="${m.message_type !== 'text' ? 'msg-caption' : 'msg-text'}">${escHtml(displayText)}</div>`;
            }
        }

        const check = dir === 'out' ? `<i class="bi bi-check2-all msg-check"></i>` : '';
        html += `<div class="msg-row ${dir}">`;
        html += `<div class="msg-bubble${isPending ? ' pending' : ''}">${body}`;
        html += `<div class="msg-footer"><span class="msg-time">${time}</span>${check}</div>`;
        html += `</div></div>`;
    }

    container.innerHTML = html;
}

function scrollToBottom() {
    const c = document.getElementById('chat-messages');
    requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
}

// ─── Send Message ─────────────────────────────────────────────
function sendTextMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !S.activeSession || !S.activeContact) return;

    const tempId = 'tmp_' + Date.now();
    const phone = cleanPhone(S.activeContact);

    // Optimistic add
    const msg = {
        message_id: tempId,
        session_id: S.activeSession,
        direction: 'outgoing',
        from_number: S.activeSession,
        to_number: S.activeContact,
        message_type: 'text',
        content: text,
        timestamp: new Date().toISOString(),
        status: 'pending',
    };
    S.messages.set(tempId, msg);
    S.pendingMsgs.set(tempId, msg);
    renderMessages();
    scrollToBottom();
    input.value = '';
    autoResizeTextarea(input);

    // Emit via socket
    S.socket.emit('send-message', {
        sessionId: S.activeSession,
        phone,
        message: text,
        tempId,
    });
}

function sendMediaMessage() {
    if (!S.selectedFile || !S.activeSession || !S.activeContact) return;

    const caption = document.getElementById('media-caption').value.trim();
    const phone = cleanPhone(S.activeContact);
    const tempId = 'tmp_' + Date.now();
    const file = S.selectedFile;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    // Optimistic render
    const msg = {
        message_id: tempId,
        session_id: S.activeSession,
        direction: 'outgoing',
        from_number: S.activeSession,
        to_number: S.activeContact,
        message_type: isImage ? 'image' : isVideo ? 'video' : 'document',
        content: caption || '',
        media_data: null,
        mimetype: file.type,
        filename: file.name,
        timestamp: new Date().toISOString(),
        status: 'pending',
    };
    S.messages.set(tempId, msg);
    S.pendingMsgs.set(tempId, msg);
    renderMessages();
    scrollToBottom();

    // Show progress UI
    const progressEl = document.getElementById('upload-progress');
    const statusEl = document.getElementById('upload-status');
    const percentEl = document.getElementById('upload-percent');
    const barEl = document.getElementById('upload-bar');
    const sendBtn = document.getElementById('media-send');
    progressEl.style.display = '';
    barEl.style.transition = 'width 0.3s ease';
    barEl.style.width = '0%';
    percentEl.textContent = '0%';
    statusEl.textContent = 'Mengunggah...';
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Mengunggah...';

    // Build FormData for multipart upload
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sessionId', S.activeSession);
    formData.append('phone', phone);
    formData.append('caption', caption);
    formData.append('tempId', tempId);

    // Track processing phase animation
    let processingInterval = null;
    let currentProcessPct = 70;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/chat/send-media');

    // Phase 1: Upload bytes (0% → 70%)
    xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
            const uploadPct = Math.round((e.loaded / e.total) * 70);
            barEl.style.width = uploadPct + '%';
            percentEl.textContent = uploadPct + '%';
        }
    };

    // Phase 2: Upload complete, server processing (70% → 95% animated)
    xhr.upload.onloadend = function() {
        statusEl.textContent = 'Memproses...';
        sendBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Memproses...';
        barEl.style.width = '70%';
        percentEl.textContent = '70%';

        processingInterval = setInterval(function() {
            if (currentProcessPct < 95) {
                currentProcessPct += 1;
                barEl.style.width = currentProcessPct + '%';
                percentEl.textContent = currentProcessPct + '%';
            } else {
                clearInterval(processingInterval);
                processingInterval = null;
            }
        }, 300);
    };

    xhr.onload = function() {
        if (processingInterval) clearInterval(processingInterval);

        // Phase 3: Complete (100%)
        statusEl.textContent = 'Selesai!';
        barEl.style.width = '100%';
        percentEl.textContent = '100%';

        const isSuccess = xhr.status >= 200 && xhr.status < 300;

        setTimeout(function() {
            progressEl.style.display = 'none';
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="bi bi-send-fill"></i> Kirim';
            closeMediaOverlay();

            if (!isSuccess) {
                try {
                    const err = JSON.parse(xhr.responseText);
                    console.error('Upload error:', err.error);
                } catch(e) { console.error('Upload failed:', xhr.statusText); }
                const pendingMsg = S.messages.get(tempId);
                if (pendingMsg) { pendingMsg.status = 'failed'; renderMessages(); }
            }
        }, 500);
    };

    xhr.onerror = function() {
        if (processingInterval) clearInterval(processingInterval);
        statusEl.textContent = 'Gagal!';
        barEl.style.background = '#dc3545';

        setTimeout(function() {
            progressEl.style.display = 'none';
            barEl.style.background = '';
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="bi bi-send-fill"></i> Kirim';
            closeMediaOverlay();
        }, 1000);
        console.error('Upload network error');
    };

    xhr.send(formData);
}

// ─── Socket Listeners ─────────────────────────────────────────
function setupSocketListeners() {
    const sock = S.socket;

    // Reconnect handler — sync missed messages after connection drop
    sock.on('connect', () => {
        console.log('🔌 Socket connected:', sock.id);
        // Only silently refresh on reconnect (not on first connect — selectSession handles initial load)
        if (S.sessions.length > 0 && S._conversationsLoaded) {
            console.log('🔄 Reconnected — silently syncing...');
            loadConversations(true);
            loadUnread();
            // If a chat is open, reload messages to catch any missed during disconnect
            if (S.activeSession && S.activeContact) {
                reloadActiveChat();
            }
        }
    });

    sock.on('disconnect', (reason) => {
        console.log('🔴 Socket disconnected:', reason);
    });

    sock.on('message-sent', data => {
        if (data.tempId && S.pendingMsgs.has(data.tempId)) {
            S.messages.delete(data.tempId);
            S.pendingMsgs.delete(data.tempId);
        }
        if (data.messageId) {
            const msg = {
                message_id: data.messageId,
                session_id: data.sessionId,
                direction: 'outgoing',
                from_number: data.sessionId,
                to_number: data.to?.includes('@') ? data.to : `${data.to}@s.whatsapp.net`,
                message_type: data.mediaType || 'text',
                content: data.messageContent || data.caption || data.message || '',
                caption: data.caption || '',
                media_url: data.mediaUrl || null,
                has_media: !!(data.mediaUrl),
                mimetype: data.mimetype || null,
                filename: data.filename || null,
                timestamp: new Date().toISOString(),
                status: 'sent',
            };
            S.messages.set(data.messageId, msg);
        }
        if (isChatOpen(data.sessionId, data.to)) {
            renderMessages();
            scrollToBottom();
        }
        // Update conversation list in real-time (no HTTP fetch needed)
        const sentContact = data.to?.includes('@') ? data.to : `${(data.to || '').replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        const sentContent = data.messageContent || data.caption || data.message || '';
        if (data.sessionId && sentContact) {
            upsertConversation(data.sessionId, sentContact, sentContent, data.mediaType || 'text', 'outgoing', new Date().toISOString(), false);
            if (S.activeSession === data.sessionId) renderConversations();
        }
    });

    sock.on('message-received', data => {
        if (!data || !data.sessionId) return;
        // Only process for our assigned sessions
        if (!S.sessions.find(s => s.id === data.sessionId)) return;

        const msgId = data.messageId || data.message_id || `in_${Date.now()}`;
        if (S.messages.has(msgId)) return; // dedup

        const resolvedType = data.type || data.messageType || 'text';
        const msg = {
            message_id: msgId,
            session_id: data.sessionId,
            direction: data.fromMe ? 'outgoing' : 'incoming',
            from_number: data.from || data.phone || '',
            to_number: data.sessionId,
            message_type: resolvedType,
            content: resolvedType === 'text' ? (data.messageText || data.message || data.content || data.body || '') : '',
            caption: data.caption || '',
            media_url: data.mediaUrl || null,
            has_media: !!(data.mediaUrl),
            mimetype: data.mimetype || null,
            filename: data.filename || null,
            timestamp: data.timestamp || new Date().toISOString(),
            status: data.fromMe ? 'sent' : 'received',
        };

        // If this chat is open, add message and render
        const contact = msg.from_number;
        const chatIsOpen = isChatOpen(data.sessionId, contact);
        if (chatIsOpen) {
            S.messages.set(msgId, msg);
            renderMessages();
            scrollToBottom();
            markConversationRead(data.sessionId, contact);
        }

        // Update conversation list
        const previewText = msg.caption || msg.content || '';
        upsertConversation(data.sessionId, contact, previewText, msg.message_type, msg.direction, msg.timestamp, !chatIsOpen);
        if (!chatIsOpen && !data.fromMe) {
            S.unread[data.sessionId] = (S.unread[data.sessionId] || 0) + 1;
        }
        if (S.activeSession === data.sessionId) renderConversations();
        renderSessionTabs();
    });

    sock.on('send-error', data => {
        if (data.tempId && S.pendingMsgs.has(data.tempId)) {
            S.messages.delete(data.tempId);
            S.pendingMsgs.delete(data.tempId);
            renderMessages();
        }
        Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Gagal mengirim pesan', text: data.error, timer: 3000, showConfirmButton: false });
    });

    sock.on('session-status', data => {
        // Update session status in tabs
        const sess = S.sessions.find(s => s.id === data.sessionId);
        if (sess) {
            sess.isConnected = data.isConnected;
            renderSessionTabs();
        }
    });
}

function isChatOpen(sessionId, contact) {
    if (S.activeSession !== sessionId) return false;
    if (!S.activeContact || !contact) return false;
    const c1 = cleanPhone(S.activeContact);
    const c2 = cleanPhone(contact);
    return c1 === c2;
}

// ─── Unread Count ─────────────────────────────────────────────
async function loadUnread() {
    try {
        const r = await fetch('/api/member/unread');
        const d = await r.json();
        S.unread = d.perSession || {};
        // Override active session unread with actual conversation sum for accuracy
        if (S.activeSession && S.conversations.length > 0) {
            S.unread[S.activeSession] = S.conversations.reduce((sum, c) => sum + (c.unread || 0), 0);
        }
        renderSessionTabs();
    } catch {}
}

// ─── UI Wiring ────────────────────────────────────────────────
function wireUI() {
    // Logout
    document.getElementById('btn-logout').addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/auth/login';
    });

    // Refresh (hard reload)
    document.getElementById('btn-refresh').addEventListener('click', () => {
        location.reload();
    });

    // Read All — mark every conversation as read
    document.getElementById('btn-read-all').addEventListener('click', readAllConversations);

    // PWA Install
    const pwaBtn = document.getElementById('btn-pwa-install');
    if (pwaBtn) pwaBtn.addEventListener('click', () => PWAInstall.promptInstall());

    // Search conversations
    document.getElementById('conv-search-input').addEventListener('input', (e) => {
        renderConversations(e.target.value);
    });

    // Back button (mobile)
    document.getElementById('btn-back').addEventListener('click', showConvPanel);

    // Send text
    document.getElementById('btn-send').addEventListener('click', sendTextMessage);
    document.getElementById('msg-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMessage(); }
    });

    // Auto-resize textarea
    document.getElementById('msg-input').addEventListener('input', function () {
        autoResizeTextarea(this);
    });

    // Attach file
    document.getElementById('btn-attach').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });
    document.getElementById('file-input').addEventListener('change', handleFileSelect);

    // Media overlay
    document.getElementById('media-close').addEventListener('click', closeMediaOverlay);
    document.getElementById('media-send').addEventListener('click', sendMediaMessage);

    // Image viewer
    document.getElementById('image-viewer').addEventListener('click', () => {
        document.getElementById('image-viewer').classList.remove('show');
    });

    // Template picker
    wireTemplatePicker();
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = ''; // reset

    S.selectedFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
        // Strip data:... prefix → pure base64
        const full = ev.target.result;
        S.selectedFileData = full.includes(',') ? full.split(',')[1] : full;

        // Preview
        const preview = document.getElementById('media-preview');
        if (file.type.startsWith('image/')) {
            preview.innerHTML = `<img src="${full}">`;
        } else if (file.type.startsWith('video/')) {
            preview.innerHTML = `<video controls style="max-width:100%;border-radius:8px;"><source src="${full}"></video>`;
        } else {
            preview.innerHTML = `<div class="doc-icon"><i class="bi bi-file-earmark-text"></i></div><div class="mt-2 fs-7">${escHtml(file.name)}</div>`;
        }
        document.getElementById('media-caption').value = '';
        document.getElementById('media-overlay').classList.add('show');
    };
    reader.readAsDataURL(file);
}

function closeMediaOverlay() {
    document.getElementById('media-overlay').classList.remove('show');
    S.selectedFile = null;
    S.selectedFileData = null;
}

// ─── View helpers ─────────────────────────────────────────────
function showConvPanel() {
    document.getElementById('conv-panel').classList.remove('mob-hide');
    document.getElementById('chat-panel').classList.add('mob-hide');
    document.getElementById('chat-hdr').classList.add('d-none');
}
function showChatPanel() {
    document.getElementById('conv-panel').classList.add('mob-hide');
    document.getElementById('chat-panel').classList.remove('mob-hide');
}

window.viewImage = function (src) {
    document.getElementById('image-viewer-img').src = src;
    document.getElementById('image-viewer').classList.add('show');
};

window.downloadDoc = function (messageId) {
    const msg = S.messages.get(messageId);
    const fname = (msg && msg.filename) || 'document';

    // If base64 in memory (real-time message), use it directly
    if (msg && msg.media_data) {
        const mime = msg.mimetype || 'application/octet-stream';
        const byteChars = atob(msg.media_data);
        const byteArr = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteArr], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
    }

    // Otherwise fetch from API (DB-loaded messages)
    const a = document.createElement('a');
    a.href = `/api/member/media/${encodeURIComponent(messageId)}`;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

// Update or insert a conversation entry, then re-sort by recency
function upsertConversation(sessionId, contact, content, msgType, direction, ts, incrementUnread = true) {
    // Ignore broadcast and newsletter JIDs
    if (/@broadcast$/i.test(contact) || /@newsletter$/i.test(contact)) return;
    const idx = S.conversations.findIndex(c => c.sessionId === sessionId && c.contact === contact);
    if (idx !== -1) {
        const c = S.conversations[idx];
        c.lastMessage = content;
        c.lastMessageType = msgType || 'text';
        c.lastDirection = direction;
        c.lastTime = ts;
        c.totalMessages = (c.totalMessages || 0) + 1;
        if (direction === 'incoming' && incrementUnread) c.unread = (c.unread || 0) + 1;
    } else {
        S.conversations.push({
            sessionId, contact,
            lastMessage: content,
            lastMessageType: msgType || 'text',
            lastDirection: direction,
            lastTime: ts,
            totalMessages: 1,
            unread: (direction === 'incoming' && incrementUnread) ? 1 : 0,
        });
    }
    S.conversations.sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));
}

// Zero out unread for a conversation locally and persist to backend
async function readAllConversations() {
    // Optimistic update: zero all unread state immediately
    S.conversations.forEach(c => { c.unread = 0; });
    Object.keys(S.unread).forEach(sid => { S.unread[sid] = 0; });
    renderConversations();
    renderSessionTabs();
    // Persist to backend
    try {
        await fetch('/api/member/read-all', { method: 'POST' });
    } catch (e) {}
}

function markConversationRead(sessionId, contact) {
    const conv = S.conversations.find(c => c.sessionId === sessionId && c.contact === contact);
    if (conv && conv.unread > 0) {
        const prevUnread = conv.unread;
        conv.unread = 0;
        S.unread[sessionId] = Math.max(0, (S.unread[sessionId] || 0) - prevUnread);
        renderConversations();
        renderSessionTabs();
    }
    // Persist read status to backend (fire and forget)
    fetch(`/api/member/messages/${encodeURIComponent(sessionId)}/${encodeURIComponent(contact)}/read`, { method: 'POST' }).catch(() => {});
}

// ─── Phone privacy helpers ────────────────────────────────────
function isPhoneVisible() {
    // If user status is nonaktif, always hide phone numbers
    if (S.user && S.user.status !== 'aktif') return false;
    const sess = S.sessions.find(s => s.id === S.activeSession);
    return sess ? sess.phoneVisible !== false : true;
}

function maskPhone(phone) {
    if (!phone) return '—';
    if (isPhoneVisible()) return phone;
    // Keep country code prefix (first 2-4 digits) + mask rest, show last 2
    if (phone.length <= 5) return '***';
    return phone.slice(0, 3) + '****' + phone.slice(-2);
}

// ─── Utilities ────────────────────────────────────────────────
function cleanPhone(jid) {
    if (!jid) return '';
    return jid.replace(/@s\.whatsapp\.net$/i, '').replace(/@.*$/, '').replace(/[^0-9]/g, '');
}

function avatarColor(phone) {
    let hash = 0;
    for (let i = 0; i < phone.length; i++) hash = phone.charCodeAt(i) + ((hash << 5) - hash);
    return COLORS[Math.abs(hash) % COLORS.length];
}

function escHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function truncate(str, n) {
    return str.length > n ? str.slice(0, n) + '…' : str;
}

function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = (now - d) / 1000 / 60 / 60;
    if (diff < 24 && d.getDate() === now.getDate()) {
        return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 48) return 'Kemarin';
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatMsgTime(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = Math.floor((now - d) / 86400000);
    if (diff === 0 && d.getDate() === now.getDate()) return 'Hari ini';
    if (diff <= 1) return 'Kemarin';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}

console.log('✅ Member chat portal initialized');

// ─── Template Picker (Instant Chat) ──────────────────────────
const TPL = {
    templates: [],
    loaded: false,
};

async function loadTemplates() {
    if (TPL.loaded) return;
    try {
        const r = await fetch('/api/member/templates');
        const d = await r.json();
        TPL.templates = d.templates || [];
        TPL.loaded = true;
    } catch { TPL.templates = []; }
}

function openTemplatePicker() {
    const overlay = document.getElementById('tpl-overlay');
    overlay.classList.add('show');
    document.getElementById('tpl-search-input').value = '';
    loadTemplates().then(() => renderTemplateList());
    setTimeout(() => document.getElementById('tpl-search-input').focus(), 200);
}

function closeTemplatePicker() {
    document.getElementById('tpl-overlay').classList.remove('show');
}

function renderTemplateList(filter = '') {
    const list = document.getElementById('tpl-list');
    let items = TPL.templates;
    if (filter) {
        const f = filter.toLowerCase();
        items = items.filter(t =>
            t.code.toLowerCase().includes(f) ||
            (t.title || '').toLowerCase().includes(f) ||
            (t.content || '').toLowerCase().includes(f)
        );
    }

    if (items.length === 0) {
        list.innerHTML = `<div class="tpl-empty"><i class="bi bi-chat-square-text"></i>${filter ? 'Tidak ditemukan' : 'Belum ada template'}</div>`;
        return;
    }

    list.innerHTML = '';
    items.forEach((t, idx) => {
        const preview = t.content.length > 100 ? t.content.substring(0, 100) + '…' : t.content;
        const mediaBadge = t.has_media ? `<span class="tpl-media-badge"><i class="bi bi-image"></i>Gambar</span>` : '';
        const title = t.title ? `<div class="tpl-title">${escHtml(t.title)}</div>` : '';
        const div = document.createElement('div');
        div.className = 'tpl-item';
        div.dataset.idx = idx;
        div.innerHTML = `<div><span class="tpl-code">${escHtml(t.code)}</span>${mediaBadge}</div>${title}<div class="tpl-preview">${escHtml(preview)}</div>`;
        div.addEventListener('click', () => {
            closeTemplatePicker();
            const input = document.getElementById('msg-input');
            if (t.has_media) {
                input.value = '#' + t.code;
            } else {
                input.value = t.content;
            }
            autoResizeTextarea(input);
            input.focus();
        });
        list.appendChild(div);
    });
}

function wireTemplatePicker() {
    document.getElementById('btn-template')?.addEventListener('click', openTemplatePicker);
    document.getElementById('tpl-close')?.addEventListener('click', closeTemplatePicker);
    document.getElementById('tpl-overlay')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('tpl-overlay')) closeTemplatePicker();
    });
    document.getElementById('tpl-search-input')?.addEventListener('input', (e) => {
        renderTemplateList(e.target.value);
    });
}
