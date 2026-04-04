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

    // 3. Load sessions
    await loadSessions();

    // 4. UI wiring
    wireUI();

    // 5. Poll unread every 60s as fallback sync
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

    // Auto-select first session
    if (!S.activeSession) {
        selectSession(S.sessions[0].id);
    }
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
    renderSessionTabs();
    loadConversations();
    showConvPanel();
}

// ─── Conversations ────────────────────────────────────────────
async function loadConversations() {
    try {
        const r = await fetch('/api/member/conversations');
        const d = await r.json();
        S.conversations = (d.conversations || []).filter(c =>
            c.sessionId === S.activeSession &&
            !/@broadcast$/i.test(c.contact) &&
            !/@newsletter$/i.test(c.contact)
        );
    } catch { S.conversations = []; }
    // Sync session unread from actual conversation unread sums
    if (S.activeSession) {
        S.unread[S.activeSession] = S.conversations.reduce((sum, c) => sum + (c.unread || 0), 0);
    }
    renderConversations();
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
        return `<div class="conv-item ${active}" data-contact="${c.contact}">
            <div class="conv-ava" style="background:${color};">${initials}</div>
            <div class="conv-body">
                <div class="conv-row1">
                    <div class="conv-name">${escHtml(displayPhone)}</div>
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
}

// ─── Chat ─────────────────────────────────────────────────────
async function openChat(contact) {
    S.activeContact = contact;
    S.messages.clear();

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

        // Media
        if (m.message_type === 'image' && m.media_data) {
            const mime = m.mimetype || 'image/jpeg';
            body += `<div class="msg-media"><img src="data:${mime};base64,${m.media_data}" onclick="viewImage(this.src)" alt=""></div>`;
        } else if (m.message_type === 'image' && !m.media_data) {
            body += `<div class="msg-media-expired"><i class="bi bi-image"></i> Media sudah dihapus otomatis</div>`;
        } else if (m.message_type === 'document' && m.media_data) {
            const msgId = m.message_id || m.id;
            body += `<div class="msg-doc" onclick="downloadDoc('${escHtml(msgId)}')"><i class="bi bi-file-earmark-arrow-down"></i><span class="msg-doc-name">${escHtml(m.filename || 'Document')}</span></div>`;
        } else if (m.message_type === 'document' && !m.media_data) {
            body += `<div class="msg-doc msg-doc-expired"><i class="bi bi-file-earmark-x"></i><span class="msg-doc-name">${escHtml(m.filename || 'Document')} (dihapus)</span></div>`;
        } else if (m.message_type === 'video' && m.media_data) {
            const mime = m.mimetype || 'video/mp4';
            body += `<div class="msg-media"><video controls><source src="data:${mime};base64,${m.media_data}"></video></div>`;
        } else if (m.message_type === 'video' && !m.media_data) {
            body += `<div class="msg-media-expired"><i class="bi bi-camera-video"></i> Media sudah dihapus otomatis</div>`;
        }

        // Text/caption content
        if (m.content) {
            body += `<div class="${m.message_type !== 'text' ? 'msg-caption' : 'msg-text'}">${escHtml(m.content)}</div>`;
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
    const base64 = S.selectedFileData;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const eventType = isImage ? 'send-image' : isVideo ? 'send-video' : 'send-document';

    // Optimistic
    const msg = {
        message_id: tempId,
        session_id: S.activeSession,
        direction: 'outgoing',
        from_number: S.activeSession,
        to_number: S.activeContact,
        message_type: isImage ? 'image' : isVideo ? 'video' : 'document',
        content: caption || file.name,
        media_data: isImage ? base64 : null,
        mimetype: file.type,
        filename: file.name,
        timestamp: new Date().toISOString(),
        status: 'pending',
    };
    S.messages.set(tempId, msg);
    renderMessages();
    scrollToBottom();

    const payload = {
        sessionId: S.activeSession,
        phone,
        caption,
        mimetype: file.type,
        filename: file.name,
        tempId,
    };

    if (isImage) payload.base64 = base64;
    else if (isVideo) payload.base64 = base64;
    else payload.base64 = base64;

    S.socket.emit(eventType, payload);

    // Close overlay
    closeMediaOverlay();
}

// ─── Socket Listeners ─────────────────────────────────────────
function setupSocketListeners() {
    const sock = S.socket;

    // Reconnect handler — sync missed messages after connection drop
    sock.on('connect', () => {
        console.log('🔌 Socket connected:', sock.id);
        // If we already had sessions loaded, this is a reconnection — reload data
        if (S.sessions.length > 0) {
            console.log('🔄 Reconnected — syncing missed data...');
            loadConversations();
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
                media_data: data.base64 || null,
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

        const msg = {
            message_id: msgId,
            session_id: data.sessionId,
            direction: 'incoming',
            from_number: data.from || data.phone || '',
            to_number: data.sessionId,
            message_type: data.type || data.messageType || 'text',
            content: data.message || data.content || data.body || '',
            media_data: data.media || data.base64 || data.mediaBase64 || null,
            mimetype: data.mimetype || null,
            filename: data.filename || null,
            timestamp: data.timestamp || new Date().toISOString(),
            status: 'received',
        };

        // If this chat is open, add message and render
        const contact = msg.from_number;
        const chatIsOpen = isChatOpen(data.sessionId, contact);
        if (chatIsOpen) {
            S.messages.set(msgId, msg);
            renderMessages();
            scrollToBottom();
            // User is actively viewing — mark read immediately
            markConversationRead(data.sessionId, contact);
        }

        // Update conversation list event-driven (no HTTP fetch)
        upsertConversation(data.sessionId, contact, msg.content, msg.message_type, 'incoming', msg.timestamp, !chatIsOpen);
        if (!chatIsOpen) {
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
    if (!msg || !msg.media_data) return;
    const mime = msg.mimetype || 'application/octet-stream';
    const byteChars = atob(msg.media_data);
    const byteArr = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArr], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = msg.filename || 'document';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
