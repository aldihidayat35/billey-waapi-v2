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
    assignmentNotes: {},    // `${sessionId}::${contact}` -> { notes, priority }
    assignmentPanel: null,
    adminPhone: '',         // admin phone for report feature
    currentFilter: 'client', // 'semua' | 'client' | 'unread' | 'grup' | 'media'
    searchQuery: '',        // current search text
    editingMessage: null,
    isSending: false,
    notifiedMessages: new Set(),
    notificationAudio: null,
    mutedChats: new Set(),
};

const NOTIFICATION_SOUND_URL = '/assets/media/soundreality-notification-tone-443095.mp3';
const MUTED_CHATS_STORAGE_KEY = 'member_muted_chats_v1';

const COLORS = [
    '#667eea','#f5576c','#4facfe','#43e97b','#fa709a','#a18cd1','#fad0c4','#ffecd2'
];

function applyAppSettingsBranding(settings) {
    const appName = String(settings?.app_name || 'Billey WA').trim() || 'Billey WA';
    const title = document.getElementById('app-title');
    if (title) title.textContent = appName;
    const subtitle = document.getElementById('app-subtitle');
    if (subtitle && settings?.app_tagline) subtitle.textContent = settings.app_tagline;
    document.title = `${appName} - Member Dashboard`;
}

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    loadMutedChats();

    // 1. Load user info
    try {
        const r = await fetch('/api/auth/me');
        const d = await r.json();
        if (!d.success) { window.location.href = '/auth/login'; return; }
        S.user = d.user;
        document.getElementById('topbar-name').textContent = d.user.name;
        applyAppSettingsBranding(window.APP_SETTINGS);
        document.addEventListener('components-loaded', () => applyAppSettingsBranding(window.APP_SETTINGS));

        // Show admin-only navigation buttons in topbar
        if (d.user.role === 'adminwa' || d.user.role === 'admin') {
            const btnDash = document.getElementById('btn-admin-dashboard');
            const btnTugas = document.getElementById('btn-admin-penugasan');
            if (btnDash) btnDash.style.display = '';
            if (btnTugas) btnTugas.style.display = '';
            document.getElementById('btn-mobile-home')?.classList.remove('hidden');
            document.getElementById('btn-mobile-assignment')?.classList.remove('hidden');
        } else {
            document.getElementById('btn-mobile-home')?.classList.add('hidden');
            document.getElementById('btn-mobile-assignment')?.classList.add('hidden');
        }
    } catch { window.location.href = '/auth/login'; return; }

    // 2. Connect socket
    S.socket = io();
    setupSocketListeners();
    setupNotificationSound();
    initAssignmentPanel();

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
    window.addEventListener('focus', () => {
        if (S.activeSession && S.activeContact) {
            loadContactDetail(S.activeSession, S.activeContact, { force: true, background: true });
        }
    });
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

    // Auto-select: restore saved session or pick first (connected for admin)
    const savedSession = sessionStorage.getItem('member_activeSession');
    if (!S.activeSession) {
        const isAdmin = S.user && (S.user.role === 'adminwa' || S.user.role === 'admin');
        // Admin: prefer saved connected session, else first connected; others: prefer saved, else first
        const validSessions = isAdmin ? S.sessions.filter(s => s.isConnected) : S.sessions;
        if (savedSession && validSessions.find(s => s.id === savedSession)) {
            selectSession(savedSession);
        } else if (validSessions.length > 0) {
            selectSession(validSessions[0].id);
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
            S.assignmentNotes[assignmentNoteKey(n.session_id, n.contact)] = {
                notes: n.notes || '', priority: n.priority || 'low', session_id: n.session_id,
                start_datetime: n.start_datetime || null, end_datetime: n.end_datetime || null,
                visibility_start: n.visibility_start || null, visibility_end: n.visibility_end || null,
            };
        }
    } catch { S.assignmentNotes = {}; }
}

function assignmentNoteKey(sessionId, contact) {
    return `${sessionId || ''}::${contact || ''}`;
}

function getAssignmentNote(sessionId, contact) {
    return S.assignmentNotes[assignmentNoteKey(sessionId, contact)] || null;
}

function setAssignmentNote(sessionId, contact, assignment) {
    if (!sessionId || !contact || !assignment) return;
    S.assignmentNotes[assignmentNoteKey(sessionId, contact)] = {
        ...assignment,
        session_id: assignment.session_id || sessionId,
        contact: assignment.contact || contact,
    };
}

function clearAssignmentNote(sessionId, contact) {
    delete S.assignmentNotes[assignmentNoteKey(sessionId, contact)];
}

function initAssignmentPanel() {
    if (!window.MemberAssignmentPanel?.createAssignmentPanelController) return;
    S.assignmentPanel = window.MemberAssignmentPanel.createAssignmentPanelController({
        getActiveChat: () => ({ sessionId: S.activeSession, contact: S.activeContact }),
        fetchDetail: async (sessionId, contact, options = {}) => {
            const r = await fetch(`/api/member/contact-detail/${encodeURIComponent(sessionId)}/${encodeURIComponent(contact)}`, {
                signal: options.signal
            });
            const d = await r.json();
            return { ...d, sessionId, contact };
        },
        renderLoading: renderAssignmentLoading,
        renderDetail: renderContactDetail,
        renderEmpty: renderAssignmentEmpty,
        renderError: renderAssignmentError,
        getFallbackDetail: getAssignmentFallbackDetail,
        onAssignment: syncAssignmentFromDetail,
    });
}

function getAssignmentFallbackDetail(chat) {
    const sessionId = chat?.sessionId || S.activeSession;
    const contact = chat?.contact || S.activeContact;
    if (!sessionId || !contact) return null;
    const conv = getConversation(sessionId, contact) || {};
    const assignment = getAssignmentNote(sessionId, contact);
    const assignmentWorkers = Array.isArray(assignment?.assignedWorkers) ? assignment.assignedWorkers.filter(Boolean) : [];
    const conversationWorkers = Array.isArray(conv.assignedWorkers) ? conv.assignedWorkers.filter(Boolean) : [];
    const assignedWorkers = assignmentWorkers.length ? assignmentWorkers : conversationWorkers;
    if (!assignment && assignedWorkers.length === 0) return null;
    return {
        success: true,
        sessionId,
        contact,
        assignment,
        assignedWorkers,
        isGroup: conv.isGroup || String(contact).includes('@g.us'),
        displayName: conv.displayName || conv.name || '',
        phone: contact,
        totalMessages: conv.totalMessages || 0,
        mediaCount: conv.mediaCount || 0,
        docCount: conv.docCount || 0,
        mediaItems: [],
        activity: [],
    };
}

function renderAssignmentFromCachedState(sessionId, contact) {
    if (sessionId !== S.activeSession || contact !== S.activeContact) return;
    const fallback = getAssignmentFallbackDetail({ sessionId, contact });
    if (fallback) renderContactDetail(fallback);
}

function syncAssignmentFromDetail(detail) {
    if (!detail?.sessionId || !detail?.contact) return;
    if (detail.assignment) {
        setAssignmentNote(detail.sessionId, detail.contact, detail.assignment);
    } else {
        clearAssignmentNote(detail.sessionId, detail.contact);
    }
    updateHeaderNoteIcon(detail.contact);

    const conv = getConversation(detail.sessionId, detail.contact);
    if (conv && Array.isArray(detail.assignedWorkers)) {
        conv.assignedWorkers = detail.assignedWorkers;
        conv.displayName = detail.displayName || conv.displayName;
        if (detail.sessionId === S.activeSession) renderConversations(S.searchQuery);
    }
}

function getAssignmentSections() {
    return Array.from(document.querySelectorAll('#assign-content-wrap > section'));
}

function setAssignmentSectionsVisible(visible) {
    getAssignmentSections().forEach(el => el.classList.toggle('hidden', !visible));
}

function setAssignmentState(message, iconHtml) {
    const assignEmptyState = document.getElementById('assign-empty-state');
    if (!assignEmptyState) return;
    assignEmptyState.innerHTML = `${iconHtml || '<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm border border-slate-100 text-3xl text-slate-300"><i class="bi bi-inbox"></i></div>'}<p class="text-sm font-semibold text-slate-500">${escHtml(message)}</p>`;
    assignEmptyState.classList.remove('hidden');
    assignEmptyState.classList.add('flex');
    setAssignmentSectionsVisible(false);
}

function clearAssignmentFields(chat = {}) {
    const contact = chat.contact || S.activeContact || '';
    const sessionId = chat.sessionId || S.activeSession || '';
    const conv = getConversation(sessionId, contact) || {};
    const isGroup = String(contact || '').includes('@g.us') || conv.isGroup;
    const displayName = contact ? contactDisplayName(contact, conv) : '-';
    const session = S.sessions.find(s => s.id === sessionId);

    setText('detail-name', displayName || '-');
    setText('detail-phone', contact || '-');
    setText('detail-name-line', displayName || 'Kontak');
    setText('detail-phone-line', contact || '');
    setText('detail-session-name', session?.name || sessionId || '-');
    setText('assign-start-time', '-');
    setText('assign-end-time', '-');
    setText('assign-time-left', '');
    setText('assign-notes-text', '-');
    setText('detail-note', '');

    const avatar = document.getElementById('detail-avatar');
    if (avatar) {
        avatar.textContent = isGroup ? 'GR' : (cleanPhone(contact).slice(-2) || 'WA');
        avatar.style.background = isGroup ? '#047857' : avatarColor(cleanPhone(contact || 'WA'));
        avatar.style.color = '#fff';
    }

    const workerList = document.getElementById('assign-worker-list');
    if (workerList) workerList.textContent = '-';
    setBadge('assign-priority-badge', '-', 'bg-slate-100 text-slate-600');
    setBadge('assign-status-badge', '-', 'bg-slate-100 text-slate-600');
    setBadge('assign-vis-status', '-', 'bg-slate-100 text-slate-600');
    const visRange = document.getElementById('assign-vis-range');
    if (visRange) visRange.innerHTML = '<i class="bi bi-infinity text-emerald-500"></i> Tanpa Batas Waktu';
    setText('assign-vis-desc', 'Anda dapat melihat seluruh riwayat chat tanpa batasan jam kerja.');
    const mediaList = document.getElementById('detail-media-list');
    if (mediaList) mediaList.innerHTML = '';
    const activityList = document.getElementById('detail-activity-list');
    if (activityList) activityList.innerHTML = '';
}

function renderAssignmentLoading(chat) {
    clearAssignmentFields(chat);
    setAssignmentState(
        'Memuat data penugasan...',
        '<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm border border-slate-100 text-emerald-500"><span class="spinner-border spinner-border-sm"></span></div>'
    );
}

function renderAssignmentEmpty(chat) {
    clearAssignmentFields(chat);
    setAssignmentState('Belum ada penugasan untuk chat ini.');
}

function renderAssignmentError(chat) {
    clearAssignmentFields(chat);
    setAssignmentState(
        'Gagal memuat data penugasan.',
        '<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm border border-rose-100 text-3xl text-rose-400"><i class="bi bi-exclamation-triangle"></i></div>'
    );
}

function setBadge(id, text, className) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `rounded-lg px-2.5 py-1 text-xs font-bold ${className || 'bg-slate-100 text-slate-600'}`;
    el.textContent = text;
}

function openNoteModal(contact) {
    const n = getAssignmentNote(S.activeSession, contact);
    if (!n) return;
    const modal = document.getElementById('note-modal');
    const overlay = document.getElementById('note-modal-overlay');
    const priorityLabels = { low: 'Low', medium: 'Medium', critical: 'Critical' };
    modal.className = 'note-modal priority-' + n.priority;
    document.getElementById('note-priority-badge').textContent = priorityLabels[n.priority] || 'Low';
    document.getElementById('note-content').textContent = n.notes || '(Tidak ada catatan)';
    // Show deadline info if available
    let deadlineHtml = '';
    if (n.start_datetime || n.end_datetime) {
        deadlineHtml += '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,.2);font-size:12px;">';
        if (n.start_datetime) deadlineHtml += '<div><i class="bi bi-calendar-event me-1"></i>Mulai: ' + formatDateTimeFull(n.start_datetime) + '</div>';
        if (n.end_datetime) deadlineHtml += '<div><i class="bi bi-calendar-check me-1"></i>Deadline: ' + formatDateTimeFull(n.end_datetime) + '</div>';
        if (n.visibility_start && n.visibility_end) {
            deadlineHtml += '<div><i class="bi bi-eye me-1"></i>Visibilitas: ' + n.visibility_start + ' - ' + n.visibility_end + '</div>';
        }
        deadlineHtml += '</div>';
    }
    const deadlineArea = document.getElementById('note-deadline-info');
    if (deadlineArea) deadlineArea.innerHTML = deadlineHtml;
    else {
        // Create deadline area dynamically if not present
        const existing = modal.querySelector('.note-deadline-dynamic');
        if (existing) existing.remove();
        if (deadlineHtml) {
            const d = document.createElement('div');
            d.className = 'note-deadline-dynamic';
            d.innerHTML = deadlineHtml;
            modal.querySelector('.note-modal-body')?.appendChild(d) || modal.appendChild(d);
        }
    }
    overlay.classList.add('show');
}

function formatDateTimeFull(dtStr) {
    if (!dtStr) return '-';
    try {
        const d = new Date(dtStr);
        return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
               d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } catch { return dtStr; }
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
    const phoneRaw = cleanPhone(contact);
    const phoneVisible = isPhoneVisible();

    document.getElementById('report-worker-name').value = S.user?.name || '-';
    // Tampilkan nomor yang di-mask jika worker tidak bisa melihat HP
    document.getElementById('report-client-phone').value = phoneVisible ? phoneRaw : maskPhone(phoneRaw);
    document.getElementById('report-text').value = '';

    // Simpan contact asli di dataset untuk digunakan saat kirim
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
        // Ambil contact asli dari dataset overlay (bukan dari field yang mungkin sudah di-mask)
        const overlay = document.getElementById('report-modal-overlay');
        const contactRaw = overlay.dataset.contact || '';
        const phoneRaw = cleanPhone(contactRaw);
        const phoneVisible = isPhoneVisible();
        // Jika worker tidak bisa melihat HP, sembunyikan nomor di pesan WA juga
        const clientPhoneInMsg = phoneVisible ? phoneRaw : maskPhone(phoneRaw);
        const message = `*Laporan Worker*\n\nWorker : ${workerName}\nClient : ${clientPhoneInMsg}\nLaporan : ${reportText}`;
        const waUrl = `https://wa.me/${S.adminPhone}?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
        closeReportModal();
    });
}

function renderSessionTabs() {
    const container = document.getElementById('session-tabs');
    const mobileContainer = document.getElementById('session-tabs-mobile');
    // Admin: only show connected (aktif) sessions; worker/member: show all assigned
    const isAdmin = S.user && (S.user.role === 'adminwa' || S.user.role === 'admin');
    const visibleSessions = isAdmin ? S.sessions.filter(s => s.isConnected) : S.sessions;

    const html = visibleSessions.map(s => {
        const active = s.id === S.activeSession ? 'active' : '';
        const dotCls = s.isConnected ? 'online' : 'offline';
        const label = s.name || s.id;
        const unread = S.unread[s.id] || 0;
        const badge = unread > 0 ? `<span class="tab-badge">${unread > 99 ? '99+' : unread}</span>` : '';
        return `<div class="wa-tab ${active}" data-sid="${s.id}">
            <span class="dot ${dotCls}"></span>${escHtml(label)}${badge}
        </div>`;
    }).join('');

    if (container) container.innerHTML = html;
    if (mobileContainer) {
        const countClass = visibleSessions.length <= 3 ? `count-${visibleSessions.length || 1}` : 'scroll';
        mobileContainer.className = `session-tabs-mobile ${countClass} md:hidden border-b border-slate-100 p-2`;
        mobileContainer.innerHTML = html || '<div class="session-empty-mobile">Belum ada session</div>';
    }

    document.querySelectorAll('#session-tabs .wa-tab, #session-tabs-mobile .wa-tab').forEach(tab => {
        tab.addEventListener('click', () => selectSession(tab.dataset.sid));
    });
}

function selectSession(sid) {
    S.activeSession = sid;
    S.activeContact = null;
    S.assignmentPanel?.reset?.();
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

function renderConversations(filter = '', activeFilter = S.currentFilter) {
    const list = document.getElementById('conv-list');
    let items = S.conversations;
    activeFilter = activeFilter === 'all' ? 'semua' : activeFilter === 'group' ? 'grup' : activeFilter;

    // Apply category filter first
    if (activeFilter === 'client') {
        items = items.filter(c => !(c.isGroup || String(c.contact || '').includes('@g.us')));
    } else if (activeFilter === 'unread') {
        items = items.filter(c => c.unread > 0);
    } else if (activeFilter === 'grup' || activeFilter === 'group') {
        items = items.filter(c => c.isGroup || c.contact.includes('@g.us'));
    } else if (activeFilter === 'media') {
        items = items.filter(c => c.hasMedia || c.mediaCount > 0);
    }
    // 'semua' → show all, no filter applied

    // Then apply search filter on top
    if (filter) {
        const f = filter.toLowerCase();
        items = items.filter(c =>
            cleanPhone(c.contact).includes(f) ||
            String(c.contact || '').toLowerCase().includes(f) ||
            (c.lastMessage || '').toLowerCase().includes(f) ||
            (Array.isArray(c.assignedWorkers) ? c.assignedWorkers.join(' ').toLowerCase().includes(f) : false)
        );
    }

    if (items.length === 0) {
        let emptyMsg = 'Belum ada percakapan';
        if (activeFilter === 'client') emptyMsg = 'Belum ada chat client';
        else if (activeFilter === 'unread') emptyMsg = 'Tidak ada chat yang belum dibaca';
        else if (activeFilter === 'grup' || activeFilter === 'group') emptyMsg = 'Tidak ada grup';
        else if (filter) emptyMsg = 'Pencarian tidak ditemukan';
        list.innerHTML = `<div class="conv-empty"><i class="bi bi-chat-left-dots"></i><p>${emptyMsg}</p></div>`;
        return;
    }

    list.innerHTML = items.map(c => {
        const phone = cleanPhone(c.contact);
        const color = avatarColor(phone);
        const isGroup = c.isGroup || c.contact.includes('@g.us');
        const initials = isGroup ? 'GR' : phone.slice(-2);
        const active = c.contact === S.activeContact ? 'active' : '';
        const time = formatTime(c.lastTime);
        const unreadBadge = c.unread > 0 ? `<div class="conv-unread">${c.unread > 99 ? '99+' : c.unread}</div>` : '';
        const typeIcon = c.lastMessageType && c.lastMessageType !== 'text' ? '📎 ' : '';
        const lastMsg = c.lastMessage ? truncate(`${typeIcon}${c.lastMessage}`, 40) : '—';
        const displayName = contactDisplayName(c.contact, c);
        const subtitlePhone = conversationPhoneLabel(c.contact, isGroup);
        const groupBadge = isGroup ? '<span class="group-badge">Grup</span>' : '';
        const workerBadge = renderWorkerBadges(c.assignedWorkers, isGroup);
        const noteData = getAssignmentNote(c.sessionId || S.activeSession, c.contact);
        const noteIcon = noteData ? `<span class="note-icon note-${noteData.priority}" data-note-contact="${c.contact}" title="Catatan penugasan"><i class="bi bi-sticky-fill"></i></span>` : '';
        const reportIcon = `<span class="report-icon" data-report-contact="${c.contact}" title="Laporan"><i class="bi bi-flag-fill"></i></span>`;
        const muted = isChatMuted(c.sessionId || S.activeSession, c.contact);
        const muteTitle = muted ? 'Aktifkan suara chat' : 'Mute chat';
        const muteIcon = muted ? 'bi-volume-mute-fill' : 'bi-volume-up-fill';
        const muteBtn = `<button class="conv-mute-btn ${muted ? 'muted' : ''}" type="button" data-mute-contact="${escHtml(c.contact)}" data-mute-session="${escHtml(c.sessionId || S.activeSession || '')}" title="${muteTitle}" aria-label="${muteTitle}"><i class="bi ${muteIcon}"></i></button>`;
        return `<div class="conv-item ${active}" data-contact="${c.contact}">
            <div class="conv-ava" style="background:${color};">${initials}</div>
            <div class="conv-body">
                <div class="conv-row1">
                    <div class="conv-title-line">
                        <span class="conv-name">${escHtml(displayName)}</span>
                        <span class="conv-phone">${escHtml(subtitlePhone)}</span>
                    </div>
                    <div class="conv-time">${time}</div>
                </div>
                <div class="conv-status-row">${workerBadge}${groupBadge}${noteIcon}${reportIcon}</div>
                <div class="conv-row2">
                    <div class="conv-last">${escHtml(lastMsg)}</div>
                    ${muteBtn}
                    ${unreadBadge}
                </div>
            </div>
        </div>`;
    }).join('');

    decorateConversationRows(list, items);

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
    list.querySelectorAll('.conv-mute-btn[data-mute-contact]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleChatMute(el.dataset.muteSession || S.activeSession, el.dataset.muteContact);
        });
    });
}

// ─── Chat ─────────────────────────────────────────────────────
function decorateConversationRows(list, items) {
    if (!list) return;
    const rows = Array.from(list.querySelectorAll('.conv-item'));
    rows.forEach((row, idx) => {
        const c = items[idx];
        if (!c) return;
        const typeIcon = c.lastMessageType && c.lastMessageType !== 'text' ? '📎 ' : '';
        const preview = c.lastMessage ? truncate(`${typeIcon}${c.lastMessage}`, 40) : '-';
        const last = row.querySelector('.conv-last');
        if (last) last.textContent = preview;

        const row2 = row.querySelector('.conv-row2');
        if (!row2 || row2.querySelector('.conv-mute-btn')) return;
        const muted = isChatMuted(c.sessionId || S.activeSession, c.contact);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `conv-mute-btn ${muted ? 'muted' : ''}`;
        btn.dataset.muteContact = c.contact || '';
        btn.dataset.muteSession = c.sessionId || S.activeSession || '';
        btn.title = muted ? 'Aktifkan suara chat' : 'Mute chat';
        btn.setAttribute('aria-label', btn.title);
        btn.innerHTML = `<i class="bi ${muted ? 'bi-volume-mute-fill' : 'bi-volume-up-fill'}"></i>`;
        const unread = row2.querySelector('.conv-unread');
        row2.insertBefore(btn, unread || null);
    });
}

function renderWorkerBadges(workers, isGroup) {
    if (isGroup) return '';
    const names = Array.isArray(workers) ? workers.filter(Boolean) : [];
    if (names.length === 0) {
        return '<div class="worker-badges"><span class="worker-badge muted">Belum ditugaskan</span></div>';
    }
    const badges = names.slice(0, 3).map(name => {
        const first = String(name || '').trim().split(/\s+/)[0] || '';
        return first ? `<span class="worker-badge">${escHtml(first)}</span>` : '';
    }).join('');
    const more = names.length > 3 ? `<span class="worker-badge more">+${names.length - 3}</span>` : '';
    return `<div class="worker-badges">${badges}${more}</div>`;
}

function renderHeaderWorkerBadges(workers, isGroup) {
    const container = document.getElementById('chat-hdr-workers');
    if (!container) return;
    if (isGroup) {
        container.innerHTML = '';
        container.classList.add('empty');
        return;
    }
    const names = Array.isArray(workers) ? workers.filter(Boolean) : [];
    if (names.length === 0) {
        container.innerHTML = '<span class="hdr-worker-badge muted">Belum ditugaskan</span>';
        container.classList.remove('empty');
        return;
    }
    const badges = names.slice(0, 2).map(name => {
        const first = String(name || '').trim().split(/\s+/)[0] || '';
        return first ? `<span class="hdr-worker-badge">${escHtml(first)}</span>` : '';
    }).join('');
    const more = names.length > 2 ? `<span class="hdr-worker-badge more">+${names.length - 2}</span>` : '';
    container.innerHTML = badges + more;
    container.classList.toggle('empty', !(badges || more));
}

function getConversation(sessionId, contact) {
    return S.conversations.find(c => c.sessionId === sessionId && c.contact === contact);
}

function fallbackClientName(contact) {
    const digits = cleanPhone(contact);
    return `Client-${(digits.slice(-4) || '0000').padStart(4, '0')}`;
}

function normalizeContactName(name) {
    const value = String(name || '').trim();
    if (!value) return '';
    if (/^(unknown|null|undefined|-|nomor)$/i.test(value)) return '';
    return value;
}

function contactDisplayName(contact, source = {}) {
    const isGroup = String(contact || '').includes('@g.us');
    const name = normalizeContactName(source.displayName || source.name || source.pushName || source.contactName || source.username);
    if (name) return name;
    if (isGroup) return String(contact || '').replace('@g.us', '') || 'Grup';
    return fallbackClientName(contact);
}

function updateChatHeader(contact, source = {}) {
    const isGroup = String(contact || '').includes('@g.us');
    const phone = cleanPhone(contact);
    const displayName = contactDisplayName(contact, source);
    const color = avatarColor(phone || contact);
    const avatar = document.getElementById('chat-hdr-avatar');
    if (avatar) {
        avatar.style.background = isGroup ? '#047857' : color;
        avatar.textContent = isGroup ? 'GR' : ((phone.slice(-2) || 'WA').padStart(2, '0'));
    }
    setText('chat-hdr-name', displayName);
    setText('chat-hdr-phone', conversationPhoneLabel(contact, isGroup));
    renderHeaderWorkerBadges(source.assignedWorkers || [], isGroup);
}

function updateHeaderNoteIcon(contact) {
    const hdrNote = document.getElementById('chat-hdr-note');
    if (!hdrNote) return;
    const noteData = getAssignmentNote(S.activeSession, contact);
    if (noteData) {
        hdrNote.className = 'note-icon-hdr note-' + (noteData.priority || 'low');
        hdrNote.classList.remove('d-none');
        hdrNote.onclick = () => openNoteModal(contact);
    } else {
        hdrNote.classList.add('d-none');
        hdrNote.onclick = null;
    }
}

async function openChat(contact) {
    const sessionId = S.activeSession;
    S.activeContact = contact;
    S.messages.clear();
    sessionStorage.setItem('member_activeContact', contact);

    // Highlight in list
    document.querySelectorAll('.conv-item').forEach(el => el.classList.toggle('active', el.dataset.contact === contact));

    // Show chat panel (mobile: hide conv-panel)
    showChatPanel();

    // Update header
    const currentConversation = getConversation(sessionId, contact) || {};
    updateChatHeader(contact, currentConversation);

    // Note icon in header
    const hdrNote = document.getElementById('chat-hdr-note');
    updateHeaderNoteIcon(contact);

    // Report icon in header
    const hdrReport = document.getElementById('chat-hdr-report');
    if (hdrReport) {
        hdrReport.onclick = () => openReportModal(contact);
    }

    // Show chat UI elements
    document.getElementById('chat-hdr').classList.remove('d-none');
    document.getElementById('chat-msg-wrap')?.classList.remove('d-none');
    document.getElementById('chat-messages').classList.remove('d-none');
    document.getElementById('input-bar').classList.remove('d-none');
    document.getElementById('chat-empty').classList.add('d-none');
    
    loadContactDetail(sessionId, contact);

    // Load messages
    try {
        const r = await fetch(`/api/member/messages/${encodeURIComponent(sessionId)}/${encodeURIComponent(contact)}?limit=200`);
        const d = await r.json();
        
        if (sessionId !== S.activeSession || contact !== S.activeContact) return;

        if (d.assignment) {
            setAssignmentNote(sessionId, contact, d.assignment);
        } else {
            clearAssignmentNote(sessionId, contact);
        }
        updateHeaderNoteIcon(contact);
        renderAssignmentFromCachedState(sessionId, contact);

        (d.messages || []).forEach(m => {
            S.messages.set(m.message_id || m.id, m);
        });
        // Show assignment deadline banner for workers
        const bannerEl = document.getElementById('assignment-banner');
        if (bannerEl) {
            if (d.assignment && (d.assignment.start_datetime || d.assignment.end_datetime)) {
                let bannerHtml = '<i class="bi bi-clock-history me-1"></i>';
                if (d.assignment.start_datetime) bannerHtml += '<span>Mulai: ' + formatDateTimeFull(d.assignment.start_datetime) + '</span>';
                if (d.assignment.end_datetime) bannerHtml += '<span class="ms-2">Deadline: <b>' + formatDateTimeFull(d.assignment.end_datetime) + '</b></span>';
                if (d.assignment.visibility_start && d.assignment.visibility_end) {
                    bannerHtml += '<span class="ms-2"><i class="bi bi-eye me-1"></i>' + d.assignment.visibility_start + ' - ' + d.assignment.visibility_end + '</span>';
                }
                bannerEl.innerHTML = bannerHtml;
                bannerEl.classList.remove('d-none');
            } else {
                bannerEl.classList.add('d-none');
            }
        }
    } catch (e) { console.error('Load messages error:', e); }

    renderMessages();
    scrollToBottom();
    // Clear unread immediately when opening a conversation
    markConversationRead(sessionId, contact);
}

async function loadContactDetail(sessionId, contact, options = {}) {
    if (!sessionId || !contact) {
        S.assignmentPanel?.reset?.();
        return null;
    }
    if (S.assignmentPanel) {
        return S.assignmentPanel.load({ sessionId, contact }, options);
    }
    renderAssignmentLoading({ sessionId, contact });
    try {
        const r = await fetch(`/api/member/contact-detail/${encodeURIComponent(sessionId)}/${encodeURIComponent(contact)}`);
        const d = await r.json();
        const detail = { ...d, sessionId, contact };
        if (sessionId !== S.activeSession || contact !== S.activeContact) return null;
        if (!d.success) {
            renderAssignmentError({ sessionId, contact });
            return null;
        }
        syncAssignmentFromDetail(detail);
        if ((Array.isArray(detail.assignedWorkers) && detail.assignedWorkers.length) || detail.assignment) {
            renderContactDetail(detail);
        } else {
            renderAssignmentEmpty({ sessionId, contact });
        }
        return detail;
    } catch (e) {
        if (sessionId === S.activeSession && contact === S.activeContact) {
            renderAssignmentError({ sessionId, contact });
        }
        console.error('Load contact detail error:', e);
        return null;
    }
}

function renderContactDetail(detail) {
    if (detail.sessionId && detail.sessionId !== S.activeSession) return;
    if (detail.contact !== S.activeContact) return;

    const isGroup = detail.isGroup || String(detail.contact || '').includes('@g.us');
    const displayName = contactDisplayName(detail.contact, detail);
    const phone = detail.phone || detail.contact || '-';
    const initials = isGroup ? 'GR' : cleanPhone(phone).slice(-2) || 'WA';
    const workers = Array.isArray(detail.assignedWorkers) ? detail.assignedWorkers : [];
    const assign = detail.assignment || getAssignmentNote(detail.sessionId || S.activeSession, detail.contact) || {};

    const assignEmptyState = document.getElementById('assign-empty-state');
    const assignDetailsCards = getAssignmentSections();
    
    if (Object.keys(assign).length === 0 && workers.length === 0) {
        renderAssignmentEmpty({ sessionId: detail.sessionId || S.activeSession, contact: detail.contact });
        return;
    } else {
        if (assignEmptyState) {
            assignEmptyState.classList.add('hidden');
            assignEmptyState.classList.remove('flex');
        }
        assignDetailsCards.forEach(el => el.classList.remove('hidden'));
    }

    if (detail.contact === S.activeContact) {
        const conv = getConversation(S.activeSession, detail.contact) || {};
        Object.assign(conv, { displayName: detail.displayName || conv.displayName, assignedWorkers: workers });
        updateChatHeader(detail.contact, { ...conv, ...detail, assignedWorkers: workers });
    }

    setText('detail-name', displayName || '-');
    setText('detail-phone', phone);
    setText('detail-name-line', displayName || 'Kontak');
    setText('detail-phone-line', phone || detail.contact || '');
    const session = S.sessions.find(s => s.id === (detail.sessionId || S.activeSession));
    setText('detail-session-name', session?.name || detail.sessionId || S.activeSession || '-');
    const avatar = document.getElementById('detail-avatar');
    if (avatar) {
        avatar.textContent = initials;
        avatar.style.background = isGroup ? '#047857' : avatarColor(cleanPhone(phone));
        avatar.style.color = '#fff';
    }

    renderAssignmentFields(detail, assign, workers);

    const note = document.getElementById('detail-note');
    if (note) {
        const summary = [
            workers.length ? `Worker: ${workers.map(n => String(n).split(/\s+/)[0]).join(', ')}` : '',
            `Total pesan: ${detail.totalMessages || 0}`,
            `Media: ${detail.mediaCount || 0}`,
            `Dokumen: ${detail.docCount || 0}`
        ].filter(Boolean).join('\n');
        note.textContent = detail.notes ? `${detail.notes}\n\n${summary}` : summary;
    }

    const mediaList = document.getElementById('detail-media-list');
    if (mediaList) {
        const mediaItems = detail.mediaItems || [];
        if (mediaItems.length === 0) {
            mediaList.innerHTML = '<div class="detail-empty">Belum ada media pada chat ini.</div>';
        } else {
            mediaList.innerHTML = mediaItems.map(item => {
                const thumb = renderDetailMediaThumb(item);
                const title = item.filename || item.caption || item.content || item.message_type || 'Media';
                const size = item.file_size ? formatBytes(item.file_size) : '';
                const date = item.timestamp ? formatMsgTime(item.timestamp) : '';
                const linkUrl = item.message_type === 'link' ? extractFirstUrl(item.content || item.caption || '') : '';
                const canDownload = item.message_id && item.message_type !== 'link';
                return `<div class="detail-media-item" data-msgid="${escHtml(item.message_id || '')}" data-link="${escHtml(linkUrl)}">
                    ${thumb}
                    <span class="detail-media-body">
                        <span class="detail-media-title">${escHtml(truncate(title, 36))}</span>
                        <span class="detail-media-meta">${escHtml(item.message_type || 'file')}${size ? ' • ' + escHtml(size) : ''}${date ? ' • ' + escHtml(date) : ''}</span>
                    </span>
                    ${canDownload ? '<i class="bi bi-download detail-media-download"></i>' : linkUrl ? '<i class="bi bi-box-arrow-up-right detail-media-download"></i>' : ''}
                </div>`;
            }).join('');
            mediaList.querySelectorAll('.detail-media-item').forEach(el => {
                el.addEventListener('click', () => {
                    if (el.dataset.link) {
                        window.open(el.dataset.link, '_blank', 'noopener,noreferrer');
                        return;
                    }
                    const msgId = el.dataset.msgid;
                    if (msgId) window.downloadDoc(msgId);
                });
            });
        }
    }

    const activityList = document.getElementById('detail-activity-list');
    if (activityList) {
        const rows = detail.activity || [];
        activityList.innerHTML = rows.length ? rows.map(row => {
            const label = row.is_deleted ? 'Pesan ditandai dihapus' : row.is_edited ? 'Pesan diedit' : row.direction === 'incoming' ? 'Pesan masuk diterima' : 'Pesan keluar terkirim';
            return `<div class="detail-activity-item">
                <i class="bi bi-check-circle-fill"></i>
                <span><b>${escHtml(label)}</b><small>${escHtml(formatDate(row.timestamp))} ${escHtml(formatMsgTime(row.timestamp))}</small></span>
            </div>`;
        }).join('') : '<div class="detail-empty">Belum ada aktivitas.</div>';
    }
}

function renderAssignmentFields(detail, assign, workers) {
    const workerList = document.getElementById('assign-worker-list');
    if (workerList) {
        workerList.innerHTML = workers.length
            ? workers.map(name => `<span>${escHtml(name)}</span>`).join('')
            : '<span class="text-slate-400">Belum ditugaskan</span>';
    }

    const priority = assign.priority || '-';
    const priorityInfo = getPriorityInfo(priority);
    setBadge('assign-priority-badge', priorityInfo.label, priorityInfo.className);

    const statusInfo = getAssignmentStatus(assign, workers);
    setBadge('assign-status-badge', statusInfo.label, statusInfo.className);
    setText('assign-start-time', assign.start_datetime ? formatDateTimeFull(assign.start_datetime) : '-');
    setText('assign-end-time', assign.end_datetime ? formatDateTimeFull(assign.end_datetime) : '-');
    setText('assign-time-left', getTimeLeftText(assign.end_datetime));

    const visibilityInfo = getVisibilityInfo(assign.visibility_start, assign.visibility_end);
    setBadge('assign-vis-status', visibilityInfo.status, visibilityInfo.statusClass);
    const visRange = document.getElementById('assign-vis-range');
    if (visRange) visRange.innerHTML = visibilityInfo.rangeHtml;
    setText('assign-vis-desc', visibilityInfo.description);

    setText('assign-notes-text', assign.notes || '-');
    const notesCard = document.getElementById('assign-notes-card');
    if (notesCard) {
        notesCard.classList.toggle('bg-amber-50', !!assign.notes);
        notesCard.classList.toggle('border-amber-200', !!assign.notes);
        notesCard.classList.toggle('bg-white', !assign.notes);
        notesCard.classList.toggle('border-slate-200', !assign.notes);
    }
}

function getPriorityInfo(priority) {
    const value = String(priority || '').toLowerCase();
    if (value === 'critical') return { label: 'Critical', className: 'bg-rose-100 text-rose-700' };
    if (value === 'medium') return { label: 'Medium', className: 'bg-amber-100 text-amber-700' };
    if (value === 'low') return { label: 'Low', className: 'bg-emerald-100 text-emerald-700' };
    return { label: '-', className: 'bg-slate-100 text-slate-600' };
}

function getAssignmentStatus(assign, workers) {
    if (!assign || Object.keys(assign).length === 0) {
        return workers.length
            ? { label: 'Ditugaskan', className: 'bg-emerald-100 text-emerald-700' }
            : { label: '-', className: 'bg-slate-100 text-slate-600' };
    }
    const now = Date.now();
    const start = parseDateMs(assign.start_datetime);
    const end = parseDateMs(assign.end_datetime);
    if (start && start > now) return { label: 'Belum mulai', className: 'bg-sky-100 text-sky-700' };
    if (end && end < now) return { label: 'Lewat deadline', className: 'bg-rose-100 text-rose-700' };
    return { label: 'Aktif', className: 'bg-emerald-100 text-emerald-700' };
}

function parseDateMs(value) {
    if (!value) return null;
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
}

function getTimeLeftText(endDatetime) {
    const end = parseDateMs(endDatetime);
    if (!end) return '';
    const diff = end - Date.now();
    if (diff <= 0) return 'Deadline terlewat';
    const minutes = Math.ceil(diff / 60000);
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;
    const parts = [];
    if (days) parts.push(`${days} hari`);
    if (hours) parts.push(`${hours} jam`);
    if (!days && mins) parts.push(`${mins} menit`);
    return `Sisa waktu: ${parts.join(' ') || 'kurang dari 1 menit'}`;
}

function getVisibilityInfo(start, end) {
    if (!start && !end) {
        return {
            status: 'Aktif',
            statusClass: 'bg-emerald-100 text-emerald-700',
            rangeHtml: '<i class="bi bi-infinity text-emerald-500"></i> Tanpa Batas Waktu',
            description: 'Anda dapat melihat seluruh riwayat chat tanpa batasan jam kerja.'
        };
    }
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const active = isTimeInRange(hhmm, start, end);
    const range = [start || '00:00', end || '23:59'].join(' - ');
    return {
        status: active ? 'Aktif' : 'Di luar jam',
        statusClass: active ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
        rangeHtml: `<i class="bi bi-clock text-emerald-500"></i> ${escHtml(range)}`,
        description: active
            ? 'Worker dapat melihat chat sesuai range waktu visibilitas ini.'
            : 'Saat ini berada di luar range waktu visibilitas worker.'
    };
}

function isTimeInRange(current, start, end) {
    const from = start || '00:00';
    const to = end || '23:59';
    if (from <= to) return current >= from && current <= to;
    return current >= from || current <= to;
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function mediaIcon(type) {
    if (type === 'link') return 'bi-link-45deg';
    if (type === 'image' || type === 'sticker') return 'bi-image-fill';
    if (type === 'video' || type === 'gif') return 'bi-play-circle-fill';
    if (type === 'audio' || type === 'voice' || type === 'ptt') return 'bi-volume-up-fill';
    if (type === 'document') return 'bi-file-earmark-text-fill';
    return 'bi-paperclip';
}

function renderDetailMediaThumb(item) {
    const type = item.message_type || 'file';
    const msgId = item.message_id || '';
    const mediaSrc = item.media_url || (msgId ? `/api/member/media/${encodeURIComponent(msgId)}` : '');
    if ((type === 'image' || type === 'sticker') && mediaSrc) {
        return `<span class="detail-media-thumb ${escHtml(type)} image-thumb"><img src="${escHtml(mediaSrc)}" alt="" loading="lazy" onerror="this.remove();this.parentElement.innerHTML='<i class=&quot;bi ${mediaIcon(type)}&quot;></i>'"></span>`;
    }
    if (type === 'video' && mediaSrc) {
        return `<span class="detail-media-thumb ${escHtml(type)} image-thumb"><video src="${escHtml(mediaSrc)}" muted preload="metadata"></video><i class="bi bi-play-fill media-play-mark"></i></span>`;
    }
    return `<span class="detail-media-thumb ${escHtml(type)}"><i class="bi ${mediaIcon(type)}"></i></span>`;
}

function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (!n) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
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
    closeMessageActionMenu();
    const msgs = Array.from(S.messages.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (msgs.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:var(--wa-text2);padding:40px 20px;font-size:13px;">Belum ada pesan.</div>';
        document.getElementById('sticky-date-label')?.classList.add('hidden');
        return;
    }

    let html = '';
    let lastDate = '';

    for (const m of msgs) {
        const date = formatDate(m.timestamp);
        if (date !== lastDate) {
            html += `<div class="msg-day" data-date="${escHtml(date)}"><div class="msg-day-label">${escHtml(date)}</div></div>`;
            lastDate = date;
        }

        const dir = m.direction === 'outgoing' ? 'out' : 'in';
        const isPending = m.status === 'pending';
        const time = formatMsgTime(m.timestamp);
        let body = '';
        const msgId = m.message_id || m.id;
        const mediaUrl = m.media_url || '';
        const hasMedia = mediaUrl || m.media_data || m.has_media;
        const isDeleted = m.is_deleted === true || m.is_deleted === 1 || m.status === 'deleted';
        const isEdited = m.is_edited === true || m.is_edited === 1;
        const remoteJid = m.remote_jid || (dir === 'out' ? m.to_number : m.from_number) || S.activeContact || '';
        const participant = m.participant || '';

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
        if (isDeleted) {
            body += '<div class="msg-deleted"><i class="bi bi-ban"></i><span>Pesan ini telah dihapus</span></div>';
        } else if (m.message_type === 'image' && hasMedia) {
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
        if (displayText && !isDeleted) {
            const isFilenameOnly = (m.message_type === 'document') && m.filename && displayText === m.filename;
            if (!isFilenameOnly) {
                body += `<div class="${m.message_type !== 'text' ? 'msg-caption' : 'msg-text'}">${escHtml(displayText)}</div>`;
                const linkPreview = renderLinkPreview(displayText);
                if (linkPreview) body += linkPreview;
            }
        }

        const check = dir === 'out' ? `<i class="bi bi-check2-all msg-check"></i>` : '';
        const editedLabel = isEdited && !isDeleted ? '<span class="msg-edited-label">diedit</span>' : '';
        const isHidden = m.is_hidden === true || m.is_hidden === 1;
        const hiddenClass = isHidden ? ' msg-hidden' : '';
        const isNonWorker = S.user && S.user.role !== 'worker';
        const reactions = renderMessageReactions(m.reaction_json);
        const displayTextForActions = (m.message_type !== 'text') ? (m.caption || m.content || '') : (m.content || '');
        const canDownload = !isDeleted && hasMedia && msgId;
        const actionPayload = `data-msgid="${escHtml(msgId || '')}" data-remotejid="${escHtml(remoteJid)}" data-fromme="${dir === 'out' ? '1' : '0'}" data-participant="${escHtml(participant)}" data-dir="${dir}"`;
        const actionRail = msgId && !isPending ? `<div class="msg-action-wrap ${dir}">
            <button class="msg-action-toggle" type="button" title="Aksi pesan" ${actionPayload}><i class="bi bi-three-dots"></i></button>
        </div>` : '';
        const hideBadge = (isHidden && isNonWorker) ? '<span class="msg-hidden-badge"><i class="bi bi-eye-slash me-1"></i>Disembunyikan</span>' : '';
        html += `<div class="msg-row ${dir}">`;
        html += `<div class="msg-bubble${isPending ? ' pending' : ''}${hiddenClass}" data-msgid="${escHtml(msgId || '')}">${actionRail}${body}${reactions}`;
        html += `<div class="msg-footer">${editedLabel}<span class="msg-time">${time}</span>${hideBadge}${check}</div>`;
        html += `</div></div>`;
    }

    container.innerHTML = html;
    wireMessageActions(container);
    setupStickyDateLabel(container);
}

function setupStickyDateLabel(container) {
    const label = document.getElementById('sticky-date-label');
    if (!container || !label) return;
    const update = () => updateStickyDateLabel(container, label);
    container.removeEventListener('scroll', container._stickyDateHandler);
    container._stickyDateHandler = update;
    container.addEventListener('scroll', update, { passive: true });
    if (!container._closeActionMenuHandler) {
        container._closeActionMenuHandler = () => closeMessageActionMenu();
        container.addEventListener('scroll', container._closeActionMenuHandler, { passive: true });
    }
    requestAnimationFrame(update);
}

function updateStickyDateLabel(container, label) {
    const days = Array.from(container.querySelectorAll('.msg-day'));
    if (!days.length || container.classList.contains('d-none')) {
        label.classList.add('hidden');
        return;
    }
    const containerTop = container.getBoundingClientRect().top + 10;
    let active = days[0].dataset.date || days[0].textContent.trim();
    for (const day of days) {
        if (day.getBoundingClientRect().top <= containerTop) {
            active = day.dataset.date || day.textContent.trim();
        } else {
            break;
        }
    }
    label.textContent = active;
    label.classList.remove('hidden');
}

function parseReactionJson(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function renderMessageReactions(value) {
    const reactions = parseReactionJson(value).filter(r => r && r.emoji);
    if (!reactions.length) return '';
    const grouped = reactions.reduce((acc, r) => {
        acc[r.emoji] = (acc[r.emoji] || 0) + 1;
        return acc;
    }, {});
    return `<div class="msg-reactions">${Object.entries(grouped).map(([emoji, count]) =>
        `<span class="msg-reaction-pill">${escHtml(emoji)}${count > 1 ? `<span class="msg-reaction-count">${count}</span>` : ''}</span>`
    ).join('')}</div>`;
}

function wireMessageActions(container) {
    container.querySelectorAll('.msg-action-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openMessageActionMenu(btn);
        });
    });
}

function closeMessageActionMenu() {
    document.getElementById('message-action-menu')?.remove();
    document.querySelectorAll('.msg-action-toggle.active').forEach(btn => btn.classList.remove('active'));
}

function getMessageActionContext(anchor) {
    const msgId = anchor.dataset.msgid;
    const msg = S.messages.get(msgId);
    if (!msg) return null;
    const dir = msg.direction === 'outgoing' ? 'out' : 'in';
    const isDeleted = msg.is_deleted === true || msg.is_deleted === 1 || msg.status === 'deleted';
    const hasMedia = !!(msg.media_url || msg.media_data || msg.has_media);
    const text = (msg.message_type !== 'text') ? (msg.caption || msg.content || '') : (msg.content || '');
    const remoteJid = msg.remote_jid || (dir === 'out' ? msg.to_number : msg.from_number) || S.activeContact || anchor.dataset.remotejid || '';
    return {
        msg,
        msgId,
        dir,
        isDeleted,
        hasMedia,
        text,
        remoteJid,
        fromMe: dir === 'out',
        participant: msg.participant || anchor.dataset.participant || '',
        isHidden: msg.is_hidden === true || msg.is_hidden === 1,
        isNonWorker: S.user && S.user.role !== 'worker',
    };
}

function buildMessageActionItems(ctx) {
    const common = `data-msgid="${escHtml(ctx.msgId)}" data-remotejid="${escHtml(ctx.remoteJid)}" data-fromme="${ctx.fromMe ? '1' : '0'}" data-participant="${escHtml(ctx.participant)}"`;
    const items = [];
    items.push({ action: 'reaction', className: 'action-menu-reaction', icon: 'bi-emoji-smile', label: 'Reaction', attrs: common });
    if (!ctx.isDeleted && ctx.fromMe) {
        items.push({ action: 'edit', className: 'action-menu-edit', icon: 'bi-pencil', label: 'Edit', attrs: common });
    }
    if (!ctx.isDeleted) {
        items.push({ action: 'forward', className: 'action-menu-forward', icon: 'bi-forward-fill', label: 'Forward', attrs: common });
    }
    if (ctx.text && !ctx.isDeleted) {
        items.push({ action: 'copy', className: 'action-menu-copy', icon: 'bi-copy', label: 'Copy', attrs: `data-text="${escHtml(ctx.text)}"` });
    }
    if (!ctx.isDeleted && ctx.hasMedia) {
        items.push({ action: 'download', className: 'action-menu-download', icon: 'bi-download', label: 'Download', attrs: `data-msgid="${escHtml(ctx.msgId)}"` });
    }
    if (ctx.isNonWorker) {
        items.push({
            action: 'hide',
            className: 'action-menu-hide',
            icon: ctx.isHidden ? 'bi-eye-slash-fill' : 'bi-eye',
            label: ctx.isHidden ? 'Tampilkan' : 'Sembunyikan',
            attrs: `data-msgid="${escHtml(ctx.msgId)}" data-hidden="${ctx.isHidden ? '1' : '0'}"`,
        });
    }
    return items;
}

function openMessageActionMenu(anchor) {
    const ctx = getMessageActionContext(anchor);
    if (!ctx) return;
    const alreadyOpen = document.getElementById('message-action-menu')?.dataset.msgid === ctx.msgId;
    closeMessageActionMenu();
    if (alreadyOpen) return;

    const items = buildMessageActionItems(ctx);
    if (!items.length) return;

    const menu = document.createElement('div');
    menu.id = 'message-action-menu';
    menu.className = `message-action-menu ${ctx.dir}`;
    menu.dataset.msgid = ctx.msgId;
    menu.innerHTML = items.map(item => `
        <button class="message-action-menu-item ${item.className}" type="button" data-action="${item.action}" ${item.attrs}>
            <i class="bi ${item.icon}"></i><span>${escHtml(item.label)}</span>
        </button>
    `).join('');
    document.body.appendChild(menu);

    const rect = anchor.getBoundingClientRect();
    const gap = 10;
    const width = menu.offsetWidth || 190;
    const height = menu.offsetHeight || 44;
    let left = ctx.dir === 'out' ? rect.left - width - gap : rect.right + gap;
    if (left < 8) left = Math.min(window.innerWidth - width - 8, rect.left);
    if (left + width > window.innerWidth - 8) left = Math.max(8, rect.right - width);
    let top = rect.top - 4;
    if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    requestAnimationFrame(() => menu.classList.add('show'));
    anchor.classList.add('active');

    menu.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            if (action === 'reaction') {
                openReactionPicker(btn);
                closeMessageActionMenu();
                return;
            }
            closeMessageActionMenu();
            if (action === 'edit') return startEditMessage(btn.dataset);
            if (action === 'forward') return openForwardPrompt(btn.dataset);
            if (action === 'copy') {
                await navigator.clipboard?.writeText(btn.dataset.text || '');
                return Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Pesan disalin', timer: 1500, showConfirmButton: false });
            }
            if (action === 'download') return window.downloadDoc(btn.dataset.msgid);
            if (action === 'hide') return toggleHideMsg(btn);
        });
    });
}

function openReactionPicker(anchor) {
    let picker = document.getElementById('reaction-picker');
    if (!picker) {
        picker = document.createElement('div');
        picker.id = 'reaction-picker';
        picker.className = 'reaction-picker';
        document.body.appendChild(picker);
    }

    const options = ['👍', '❤️', '😂', '😮', '😢', '🙏', ''];
    picker.innerHTML = options.map(emoji =>
        `<button type="button" data-emoji="${escHtml(emoji)}" title="${emoji ? 'Reaction ' + escHtml(emoji) : 'Hapus reaction'}">${emoji || '<i class="bi bi-x-lg"></i>'}</button>`
    ).join('');

    const rect = anchor.getBoundingClientRect();
    picker.style.left = Math.max(8, Math.min(rect.left - 72, window.innerWidth - 260)) + 'px';
    picker.style.top = Math.max(8, rect.top - 44) + 'px';
    picker.classList.add('show');

    picker.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            sendReaction(anchor.dataset, btn.dataset.emoji || '');
            picker.classList.remove('show');
        });
    });
}

function sendReaction(data, emoji) {
    if (!S.socket || !S.activeSession || !data.msgid || !data.remotejid) return;
    S.socket.emit('send-reaction', {
        sessionId: S.activeSession,
        remoteJid: data.remotejid,
        messageId: data.msgid,
        fromMe: data.fromme === '1',
        participant: data.participant || null,
        emoji
    });
}

function startEditMessage(data) {
    const msg = S.messages.get(data.msgid);
    if (!msg || !S.socket) return;
    if (msg.message_type !== 'text' && !(msg.caption || msg.content)) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'Media/file tidak dapat diedit langsung. Kirim ulang file baru jika perlu.', timer: 2800, showConfirmButton: false });
        return;
    }
    const currentText = msg.message_type !== 'text' ? (msg.caption || msg.content || '') : (msg.content || '');
    S.editingMessage = {
        messageId: data.msgid,
        remoteJid: data.remotejid,
        participant: data.participant || null,
        originalText: currentText
    };
    const input = document.getElementById('msg-input');
    input.value = currentText;
    autoResizeTextarea(input);
    updateEditModeUI();
    input.focus();
}

function cancelEditMode() {
    S.editingMessage = null;
    const input = document.getElementById('msg-input');
    input.value = '';
    autoResizeTextarea(input);
    updateEditModeUI();
}

function updateEditModeUI() {
    const editBar = document.getElementById('edit-bar');
    const preview = document.getElementById('edit-preview');
    const sendBtn = document.getElementById('btn-send');
    if (!editBar || !sendBtn) return;
    if (S.editingMessage) {
        editBar.classList.remove('hidden');
        if (preview) preview.textContent = truncate(S.editingMessage.originalText || '', 90);
        sendBtn.title = 'Simpan edit';
        sendBtn.classList.add('editing');
    } else {
        editBar.classList.add('hidden');
        if (preview) preview.textContent = '';
        sendBtn.title = 'Kirim';
        sendBtn.classList.remove('editing', 'sending');
    }
}

function saveEditedMessage() {
    if (!S.editingMessage || !S.socket) return;
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'Pesan tidak boleh kosong', timer: 1800, showConfirmButton: false });
        return;
    }
    if (text === S.editingMessage.originalText) {
        cancelEditMode();
        return;
    }
    setComposerSending(true);
    S.socket.emit('edit-message', {
        sessionId: S.activeSession,
        remoteJid: S.editingMessage.remoteJid,
        messageId: S.editingMessage.messageId,
        fromMe: true,
        participant: S.editingMessage.participant || null,
        text
    });
}

async function openForwardPrompt(data) {
    const msg = S.messages.get(data.msgid);
    if (!msg) return;
    const result = await Swal.fire({
        title: 'Forward pesan',
        input: 'text',
        inputPlaceholder: 'Nomor tujuan atau JID grup',
        showCancelButton: true,
        confirmButtonText: 'Forward',
        cancelButtonText: 'Batal',
        showLoaderOnConfirm: true,
        preConfirm: async (target) => {
            const to = String(target || '').trim();
            if (!to) {
                Swal.showValidationMessage('Tujuan forward wajib diisi');
                return false;
            }
            try {
                const r = await fetch('/api/member/forward-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: S.activeSession,
                        contact: S.activeContact,
                        messageId: data.msgid,
                        to
                    })
                });
                const d = await r.json();
                if (!d.success) throw new Error(d.error || 'Forward gagal');
                return d;
            } catch (error) {
                Swal.showValidationMessage(error.message || 'Forward gagal');
                return false;
            }
        },
        allowOutsideClick: () => !Swal.isLoading()
    });
    if (result.isConfirmed) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Pesan berhasil diforward', timer: 1800, showConfirmButton: false });
    }
}

function scrollToBottom() {
    const c = document.getElementById('chat-messages');
    if (!c) return;
    requestAnimationFrame(() => {
        c.scrollTop = c.scrollHeight;
        const label = document.getElementById('sticky-date-label');
        if (label) updateStickyDateLabel(c, label);
    });
}

// ─── Hide/Unhide Messages (Admin & Member) ────────────────────
async function toggleHideMsg(btn) {
    const msgId = btn.dataset.msgid;
    const isHidden = btn.dataset.hidden === '1';
    const endpoint = isHidden ? '/api/chat/unhide' : '/api/chat/hide';
    const body = isHidden
        ? { message_ids: [msgId] }
        : { message_ids: [msgId], session_id: S.activeSession };
    try {
        const r = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const d = await r.json();
        if (d.success) {
            // Update in-memory message state
            const msg = S.messages.get(msgId);
            if (msg) msg.is_hidden = !isHidden;
            // Re-render the bubble inline
            const bubble = btn.closest('.msg-bubble');
            if (!bubble) {
                renderMessages();
                return;
            }
            if (bubble) {
                if (!isHidden) {
                    bubble.classList.add('msg-hidden');
                    btn.dataset.hidden = '1';
                    btn.title = 'Tampilkan kembali';
                    btn.innerHTML = '<i class="bi bi-eye-slash-fill"></i>';
                    // Add badge
                    const footer = bubble.querySelector('.msg-footer');
                    if (footer && !footer.querySelector('.msg-hidden-badge')) {
                        const badge = document.createElement('span');
                        badge.className = 'msg-hidden-badge';
                        badge.innerHTML = '<i class="bi bi-eye-slash me-1"></i>Disembunyikan';
                        footer.insertBefore(badge, footer.querySelector('.msg-check') || null);
                    }
                } else {
                    bubble.classList.remove('msg-hidden');
                    btn.dataset.hidden = '0';
                    btn.title = 'Sembunyikan dari worker';
                    btn.innerHTML = '<i class="bi bi-eye"></i>';
                    const badge = bubble.querySelector('.msg-hidden-badge');
                    if (badge) badge.remove();
                }
            }
        }
    } catch (e) { console.error('Toggle hide error:', e); }
}

// ─── Send Message ─────────────────────────────────────────────
function sendTextMessage() {
    if (S.editingMessage) {
        saveEditedMessage();
        return;
    }
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !S.activeSession || !S.activeContact || S.isSending) return;

    const tempId = 'tmp_' + Date.now();
    const phone = normalizeContactForSend(S.activeContact);
    setComposerSending(true);

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

function setComposerSending(isSending) {
    S.isSending = !!isSending;
    const sendBtn = document.getElementById('btn-send');
    const input = document.getElementById('msg-input');
    if (sendBtn) {
        sendBtn.disabled = !!isSending;
        sendBtn.classList.toggle('sending', !!isSending);
        sendBtn.innerHTML = isSending ? '<i class="bi bi-hourglass-split"></i>' : '<i class="bi bi-send-fill"></i>';
    }
    if (input) input.disabled = !!isSending;
}

function sendMediaMessage() {
    if (!S.selectedFile || !S.activeSession || !S.activeContact) return;

    const caption = document.getElementById('media-caption').value.trim();
    const phone = normalizeContactForSend(S.activeContact);
    const tempId = 'tmp_' + Date.now();
    const file = S.selectedFile;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');

    // Optimistic render
    const msg = {
        message_id: tempId,
        session_id: S.activeSession,
        direction: 'outgoing',
        from_number: S.activeSession,
        to_number: S.activeContact,
        message_type: isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'document',
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
function setupNotificationSound() {
    try {
        S.notificationAudio = new Audio(NOTIFICATION_SOUND_URL);
        S.notificationAudio.preload = 'auto';
        const unlock = () => {
            if (!S.notificationAudio) return;
            S.notificationAudio.load();
            document.removeEventListener('click', unlock);
            document.removeEventListener('keydown', unlock);
            document.removeEventListener('touchstart', unlock);
        };
        document.addEventListener('click', unlock, { once: true });
        document.addEventListener('keydown', unlock, { once: true });
        document.addEventListener('touchstart', unlock, { once: true, passive: true });
    } catch (e) {
        S.notificationAudio = null;
    }
}

function trimNotificationDedup() {
    if (S.notifiedMessages.size <= 500) return;
    const keep = Array.from(S.notifiedMessages).slice(-250);
    S.notifiedMessages = new Set(keep);
}

function playNotificationSound(messageId, sessionId, contact) {
    if (!messageId || !S.notificationAudio) return;
    if (isChatMuted(sessionId || S.activeSession, contact)) return;
    try {
        const audio = S.notificationAudio.cloneNode(true);
        audio.volume = 0.78;
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
        }
    } catch (e) {}
}

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

    sock.on('assignment-updated', (data) => {
        console.log('📋 Assignment updated event received:', data);
        const userId = window.userId || (document.body.dataset.userId ? parseInt(document.body.dataset.userId) : null);
        const userRole = window.userRole || document.body.dataset.userRole;
        if (userRole === 'worker' && data.workerId !== userId) return;
        loadConversations(true);
        if (S.activeSession && S.activeContact) {
            loadContactDetail(S.activeSession, S.activeContact, { force: true });
        }
    });

    sock.on('message-sent', data => {
        setComposerSending(false);
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
                remote_jid: data.to?.includes('@') ? data.to : `${(data.to || '').replace(/[^0-9]/g, '')}@s.whatsapp.net`,
                participant: data.participant || null,
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
        if (S.notifiedMessages.has(msgId) || S.messages.has(msgId)) return; // dedup
        S.notifiedMessages.add(msgId);
        trimNotificationDedup();

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
            remote_jid: data.remoteJid || data.from || data.phone || '',
            participant: data.participant || null,
            displayName: data.displayName || data.pushName || '',
            pushName: data.pushName || data.displayName || '',
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
        upsertConversation(data.sessionId, contact, previewText, msg.message_type, msg.direction, msg.timestamp, !chatIsOpen, msg.displayName);
        if (chatIsOpen && msg.displayName) {
            updateChatHeader(contact, { ...(getConversation(data.sessionId, contact) || {}), displayName: msg.displayName });
        }
        if (!data.fromMe) playNotificationSound(msgId, data.sessionId, contact);
        if (!chatIsOpen && !data.fromMe) {
            S.unread[data.sessionId] = (S.unread[data.sessionId] || 0) + 1;
        }
        if (S.activeSession === data.sessionId) renderConversations();
        renderSessionTabs();
    });

    sock.on('send-error', data => {
        setComposerSending(false);
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

    sock.on('message.reaction.updated', data => applyMessageMutation('reaction', data));
    sock.on('message.deleted', data => applyMessageMutation('deleted', data));
    sock.on('message.edited', data => applyMessageMutation('edited', data));
}

function applyMessageMutation(type, data) {
    if (!data || data.sessionId !== S.activeSession) return;
    const contact = data.remoteJid || data.contact || '';
    if (S.activeContact && contact && !isChatOpen(data.sessionId, contact)) return;

    const msgId = data.messageId || data.message_id || data.updatedMessage?.message_id;
    if (!msgId) return;

    let msg = S.messages.get(msgId);
    if (!msg && data.updatedMessage) {
        msg = data.updatedMessage;
        S.messages.set(msgId, msg);
    }
    if (!msg) return;

    const updated = data.updatedMessage || {};
    if (type === 'reaction') {
        msg.reaction_json = updated.reaction_json || JSON.stringify(data.reaction || []);
    } else if (type === 'deleted') {
        msg.is_deleted = true;
        msg.deleted_at = updated.deleted_at || new Date().toISOString();
        msg.status = 'deleted';
    } else if (type === 'edited') {
        msg.is_edited = true;
        msg.edited_at = updated.edited_at || new Date().toISOString();
        const text = data.updatedText || updated.edited_message || updated.content || '';
        if (text) {
            msg.content = text;
            msg.edited_message = text;
        }
    }

    renderMessages();
    if (type === 'edited') {
        const editingThisMessage = S.editingMessage?.messageId === msgId;
        if (editingThisMessage) {
            setComposerSending(false);
            cancelEditMode();
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Pesan diedit', timer: 1600, showConfirmButton: false });
        }
    }
    loadContactDetail(S.activeSession, S.activeContact);
    if (type !== 'reaction') loadConversations(true);
}

function isChatOpen(sessionId, contact) {
    if (S.activeSession !== sessionId) return false;
    if (!S.activeContact || !contact) return false;
    if (S.activeContact === contact) return true;
    const c1 = cleanPhone(S.activeContact);
    const c2 = cleanPhone(contact);
    return c1 === c2;
}

function muteKey(sessionId, contact) {
    return `${sessionId || ''}::${contact || ''}`;
}

function loadMutedChats() {
    try {
        const raw = localStorage.getItem(MUTED_CHATS_STORAGE_KEY);
        const values = JSON.parse(raw || '[]');
        S.mutedChats = new Set(Array.isArray(values) ? values.filter(Boolean) : []);
    } catch {
        S.mutedChats = new Set();
    }
}

function saveMutedChats() {
    try {
        localStorage.setItem(MUTED_CHATS_STORAGE_KEY, JSON.stringify(Array.from(S.mutedChats)));
    } catch {}
}

function isChatMuted(sessionId, contact) {
    return S.mutedChats.has(muteKey(sessionId, contact));
}

function toggleChatMute(sessionId, contact) {
    if (!sessionId || !contact) return;
    const key = muteKey(sessionId, contact);
    const nextMuted = !S.mutedChats.has(key);
    if (nextMuted) S.mutedChats.add(key);
    else S.mutedChats.delete(key);
    saveMutedChats();
    renderConversations(S.searchQuery);
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: nextMuted ? 'info' : 'success',
        title: nextMuted ? 'Chat dimute' : 'Suara chat aktif',
        timer: 1500,
        showConfirmButton: false
    });
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

// ─── Filter Helpers ────────────────────────────────────────────
function applyFilter(filter) {
    filter = filter === 'all' ? 'semua' : filter === 'group' ? 'grup' : filter;
    S.currentFilter = filter;
    // Update active button styles
    const btns = {
        'semua': document.getElementById('filter-all'),
        'client': document.getElementById('filter-client'),
        'unread': document.getElementById('filter-unread'),
        'grup': document.getElementById('filter-grup'),
    };
    Object.values(btns).forEach(b => {
        if (b) {
            b.classList.remove('border-emerald-400', 'bg-emerald-50', 'text-emerald-700', 'font-extrabold');
            b.classList.add('border-slate-200', 'bg-white', 'text-slate-600', 'font-bold');
        }
    });
    const active = btns[filter];
    if (active) {
        active.classList.remove('border-slate-200', 'bg-white', 'text-slate-600', 'font-bold');
        active.classList.add('border-emerald-400', 'bg-emerald-50', 'text-emerald-700', 'font-extrabold');
    }
    document.querySelectorAll('#filter-menu-mobile [data-filter]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderConversations(S.searchQuery);
}

function openContactDetailPanel() {
    const panel = document.getElementById('contact-detail-panel');
    if (!panel || !S.activeSession || !S.activeContact) return;
    loadContactDetail(S.activeSession, S.activeContact);
    if (window.matchMedia('(max-width: 820px)').matches) {
        panel.classList.add('mobile-open');
    }
}

function closeContactDetailPanel() {
    document.getElementById('contact-detail-panel')?.classList.remove('mobile-open');
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

    // Mobile topbar dropdown
    const mobileTopMenu = document.getElementById('mobile-top-menu');
    document.getElementById('btn-mobile-top-menu')?.addEventListener('click', (e) => {
        e.stopPropagation();
        mobileTopMenu?.classList.toggle('show');
    });
    document.getElementById('btn-mobile-home')?.addEventListener('click', () => { window.location.href = '/'; });
    document.getElementById('btn-mobile-assignment')?.addEventListener('click', () => { window.location.href = '/penugasan.html'; });
    document.getElementById('btn-mobile-refresh')?.addEventListener('click', () => location.reload());
    document.getElementById('btn-mobile-read-all')?.addEventListener('click', () => {
        mobileTopMenu?.classList.remove('show');
        readAllConversations();
    });
    document.getElementById('btn-mobile-pwa-install')?.addEventListener('click', () => {
        mobileTopMenu?.classList.remove('show');
        window.PWAInstall?.promptInstall?.();
    });
    document.getElementById('btn-mobile-sessions')?.addEventListener('click', () => {
        mobileTopMenu?.classList.remove('show');
        showConvPanel();
        const tabs = document.getElementById('session-tabs-mobile');
        tabs?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        tabs?.classList.add('session-pulse');
        setTimeout(() => tabs?.classList.remove('session-pulse'), 900);
    });
    document.getElementById('btn-mobile-logout')?.addEventListener('click', async () => {
        mobileTopMenu?.classList.remove('show');
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/auth/login';
    });

    // Search conversations
    const searchInput = document.getElementById('conv-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            S.searchQuery = e.target.value;
            renderConversations(S.searchQuery);
        });
    }

    // Filter buttons — React creates/destroys these on every render.
    // Wire via MutationObserver so we catch the initial render AND every re-render.
    const filterButtons = {
        'filter-all': 'semua',
        'filter-client': 'client',
        'filter-unread': 'unread',
        'filter-grup': 'grup',
    };
    Object.entries(filterButtons).forEach(([id, filter]) => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => applyFilter(filter));
    });
    document.getElementById('btn-filter-mobile')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('filter-menu-mobile')?.classList.toggle('show');
    });
    document.querySelectorAll('#filter-menu-mobile [data-filter]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            applyFilter(btn.dataset.filter);
            document.getElementById('filter-menu-mobile')?.classList.remove('show');
        });
    });
    applyFilter(S.currentFilter);

    // Back button (mobile)
    document.getElementById('btn-back').addEventListener('click', showConvPanel);
    document.getElementById('chat-hdr-info')?.addEventListener('click', openContactDetailPanel);
    document.getElementById('chat-hdr-avatar')?.addEventListener('click', openContactDetailPanel);
    document.getElementById('btn-chat-detail')?.addEventListener('click', openContactDetailPanel);
    document.getElementById('btn-close-contact-detail')?.addEventListener('click', closeContactDetailPanel);

    // Send text
    document.getElementById('btn-send').addEventListener('click', sendTextMessage);
    document.getElementById('btn-cancel-edit')?.addEventListener('click', cancelEditMode);
    document.getElementById('msg-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMessage(); }
        if (e.key === 'Escape' && S.editingMessage) { e.preventDefault(); cancelEditMode(); }
    });

    // Auto-resize textarea
    document.getElementById('msg-input').addEventListener('input', function () {
        autoResizeTextarea(this);
    });

    // Attach file
    const attachMenu = document.getElementById('attach-menu');
    document.getElementById('btn-attach').addEventListener('click', (e) => {
        e.stopPropagation();
        if (attachMenu) {
            attachMenu.classList.toggle('show');
        } else {
            document.getElementById('file-input').click();
        }
    });
    attachMenu?.querySelectorAll('.attachment-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const fileInput = document.getElementById('file-input');
            fileInput.setAttribute('accept', btn.dataset.accept || 'image/*,video/*,audio/*,application/pdf,application/msword,.doc,.docx,.xlsx,.xls,.pptx,.ppt');
            attachMenu.classList.remove('show');
            fileInput.click();
        });
    });
    document.addEventListener('click', (e) => {
        if (attachMenu && !attachMenu.contains(e.target) && e.target !== document.getElementById('btn-attach')) {
            attachMenu.classList.remove('show');
        }
        const reactionPicker = document.getElementById('reaction-picker');
        if (reactionPicker && !reactionPicker.contains(e.target) && !e.target.closest?.('[data-action="reaction"], .msg-reaction-btn')) {
            reactionPicker.classList.remove('show');
        }
        if (!e.target.closest?.('.message-action-menu') && !e.target.closest?.('.msg-action-toggle')) {
            closeMessageActionMenu();
        }
        if (!e.target.closest?.('.conv-search-row')) {
            document.getElementById('filter-menu-mobile')?.classList.remove('show');
        }
        if (!e.target.closest?.('.mobile-top-menu-wrap')) {
            document.getElementById('mobile-top-menu')?.classList.remove('show');
        }
    });
    document.getElementById('btn-voice')?.addEventListener('click', () => {
        const fileInput = document.getElementById('file-input');
        fileInput.setAttribute('accept', 'audio/*');
        fileInput.click();
    });
    document.getElementById('btn-emoji')?.addEventListener('click', () => {
        const input = document.getElementById('msg-input');
        input.value += '🙂';
        autoResizeTextarea(input);
        input.focus();
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
    closeContactDetailPanel();
    document.getElementById('conv-panel').classList.remove('mob-hide');
    document.getElementById('chat-panel').classList.add('mob-hide');
    document.getElementById('chat-hdr').classList.add('d-none');
    document.getElementById('chat-msg-wrap')?.classList.add('d-none');
    document.getElementById('sticky-date-label')?.classList.add('hidden');
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
function upsertConversation(sessionId, contact, content, msgType, direction, ts, incrementUnread = true, displayName = '') {
    // Ignore broadcast and newsletter JIDs
    if (/@broadcast$/i.test(contact) || /@newsletter$/i.test(contact)) return;
    const idx = S.conversations.findIndex(c => c.sessionId === sessionId && c.contact === contact);
    if (idx !== -1) {
        const c = S.conversations[idx];
        c.lastMessage = content;
        c.lastMessageType = msgType || 'text';
        c.lastDirection = direction;
        c.lastTime = ts;
        if (normalizeContactName(displayName)) c.displayName = displayName;
        c.isGroup = c.isGroup || /@g\.us$/i.test(contact);
        if (msgType && msgType !== 'text') {
            c.hasMedia = true;
            c.mediaCount = (c.mediaCount || 0) + 1;
        }
        c.totalMessages = (c.totalMessages || 0) + 1;
        if (direction === 'incoming' && incrementUnread) c.unread = (c.unread || 0) + 1;
    } else {
        S.conversations.push({
            sessionId, contact,
            lastMessage: content,
            lastMessageType: msgType || 'text',
            lastDirection: direction,
            lastTime: ts,
            displayName: normalizeContactName(displayName),
            totalMessages: 1,
            unread: (direction === 'incoming' && incrementUnread) ? 1 : 0,
            isGroup: /@g\.us$/i.test(contact),
            hasMedia: !!(msgType && msgType !== 'text'),
            mediaCount: msgType && msgType !== 'text' ? 1 : 0,
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
function conversationPhoneLabel(contact, isGroup = false) {
    if (isGroup || String(contact || '').includes('@g.us')) return String(contact || '') || '-';
    const phone = cleanPhone(contact);
    if (!phone) return '-';
    if (isPhoneVisible()) return phone;
    return `**** ${phone.slice(-4) || phone}`;
}

function cleanPhone(jid) {
    if (!jid) return '';
    return jid.replace(/@s\.whatsapp\.net$/i, '').replace(/@.*$/, '').replace(/[^0-9]/g, '');
}

function normalizeContactForSend(contact) {
    if (!contact) return '';
    if (/@g\.us$/i.test(contact) || /@s\.whatsapp\.net$/i.test(contact) || /@lid$/i.test(contact)) return contact;
    return cleanPhone(contact);
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

function extractFirstUrl(text) {
    const match = String(text || '').match(/https?:\/\/[^\s]+/i);
    return match ? match[0] : '';
}

function renderLinkPreview(text) {
    const href = extractFirstUrl(text);
    if (!href) return '';
    try {
        const url = new URL(href);
        return `<a class="msg-link-preview" href="${escHtml(url.href)}" target="_blank" rel="noopener noreferrer">
            <span class="msg-link-icon"><i class="bi bi-link-45deg"></i></span>
            <span class="msg-link-body">
                <span class="msg-link-domain">${escHtml(url.hostname.replace(/^www\./, ''))}</span>
                <span class="msg-link-url">${escHtml(url.href)}</span>
            </span>
        </a>`;
    } catch {
        return '';
    }
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
