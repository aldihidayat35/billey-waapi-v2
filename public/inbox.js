/**
 * WhatsApp Inbox - 100% WhatsApp Style
 * Real-time messaging tanpa refresh, tanpa bug double bubble
 * Support media dengan preview yang persist
 */

// ============================================
// SOCKET & STATE MANAGEMENT
// ============================================
const socket = io();

const State = {
    sessionId: null,
    currentChat: null,
    conversations: new Map(),
    messages: new Map(),        // Map<messageId, message> untuk prevent duplicate
    pendingMessages: new Map(), // Track pending messages by tempId
    mediaModal: null,
    imageModal: null,
    mediaType: null,
    selectedFile: null,
    selectedFileData: null,
    lastMessageFrom: null
};

// Avatar colors
const AVATAR_COLORS = [
    'linear-gradient(135deg, #667eea, #764ba2)',
    'linear-gradient(135deg, #f093fb, #f5576c)',
    'linear-gradient(135deg, #4facfe, #00f2fe)',
    'linear-gradient(135deg, #43e97b, #38f9d7)',
    'linear-gradient(135deg, #fa709a, #fee140)',
    'linear-gradient(135deg, #a8edea, #fed6e3)',
    'linear-gradient(135deg, #ffecd2, #fcb69f)',
    'linear-gradient(135deg, #ff9a9e, #fad0c4)'
];

// ============================================
// DOM ELEMENTS
// ============================================
const DOM = {};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('📬 WhatsApp Inbox initialized');
    
    cacheDOM();
    loadComponents();
    initModals();
    setupEventListeners();
    setupSocketListeners();
    loadSessions();
    autoResizeTextarea();
});

function cacheDOM() {
    DOM.sessionSelect = document.getElementById('session-select');
    DOM.sessionBadge = document.getElementById('session-badge');
    DOM.sessionPhoneBadge = document.getElementById('session-phone-badge');
    DOM.connectionStatus = document.getElementById('connection-status');
    DOM.connectionText = document.getElementById('connection-text');
    DOM.searchInput = document.getElementById('search-input');
    DOM.conversationsList = document.getElementById('conversations-list');
    DOM.inboxSidebar = document.getElementById('inbox-sidebar');
    DOM.emptyChat = document.getElementById('empty-chat');
    DOM.activeChat = document.getElementById('active-chat');
    DOM.chatAvatar = document.getElementById('chat-avatar');
    DOM.chatName = document.getElementById('chat-name');
    DOM.chatPhone = document.getElementById('chat-phone');
    DOM.messagesContainer = document.getElementById('messages-container');
    DOM.messageInput = document.getElementById('message-input');
    DOM.sendBtn = document.getElementById('send-btn');
    DOM.attachmentMenu = document.getElementById('attachment-menu');
    DOM.scrollBottom = document.getElementById('scroll-bottom');
    DOM.fileInput = document.getElementById('file-input');
    DOM.uploadArea = document.getElementById('upload-area');
    DOM.previewArea = document.getElementById('preview-area');
    DOM.previewContent = document.getElementById('preview-content');
    DOM.previewFilename = document.getElementById('preview-filename');
    DOM.previewFilesize = document.getElementById('preview-filesize');
    DOM.mediaCaption = document.getElementById('media-caption');
    DOM.sendMediaBtn = document.getElementById('send-media-btn');
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
                        const link = document.querySelector('a[href="inbox.html"]');
                        if (link) link.classList.add('active');
                    }, 100);
                }
            })
            .catch(() => {});
    });
}

function initModals() {
    State.mediaModal = new bootstrap.Modal(document.getElementById('mediaModal'));
    State.imageModal = new bootstrap.Modal(document.getElementById('imagePreviewModal'));
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Session change
    DOM.sessionSelect?.addEventListener('change', (e) => {
        selectSession(e.target.value);
    });
    
    // Search
    DOM.searchInput?.addEventListener('input', (e) => {
        filterConversations(e.target.value);
    });
    
    // Message input - Enter to send
    DOM.messageInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Close attachment menu on outside click
    document.addEventListener('click', (e) => {
        const menu = DOM.attachmentMenu;
        const btn = document.getElementById('attachment-btn');
        if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
            menu.classList.remove('show');
        }
    });
    
    // Messages scroll
    DOM.messagesContainer?.addEventListener('scroll', () => {
        const el = DOM.messagesContainer;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        DOM.scrollBottom?.classList.toggle('show', !atBottom);
    });
    
    // Drag and drop for media
    const uploadArea = DOM.uploadArea;
    if (uploadArea) {
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#009ef7';
            uploadArea.style.background = '#f1faff';
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.borderColor = '#e4e6ef';
            uploadArea.style.background = '';
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#e4e6ef';
            uploadArea.style.background = '';
            if (e.dataTransfer.files[0]) {
                processFile(e.dataTransfer.files[0]);
            }
        });
    }
}

function autoResizeTextarea() {
    const textarea = DOM.messageInput;
    if (!textarea) return;
    
    textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    });
}

// ============================================
// SOCKET LISTENERS - CRITICAL FOR REALTIME
// ============================================
function setupSocketListeners() {
    // Connection status
    socket.on('connect', () => {
        console.log('🔌 Socket connected');
        setConnectionStatus('connected');
        if (State.sessionId) {
            loadConversations(State.sessionId);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Socket disconnected');
        setConnectionStatus('disconnected');
    });
    
    socket.on('reconnecting', () => {
        setConnectionStatus('connecting');
    });
    
    // ========================================
    // INCOMING MESSAGE - REALTIME UPDATE
    // ========================================
    socket.on('message-received', (data) => {
        console.log('📨 Message received via socket:', data);
        
        // Only process for current session
        if (data.sessionId !== State.sessionId) return;
        
        // Extract phone from the message
        const phone = cleanPhoneNumber(data.from);
        const isFromMe = data.fromMe === true;
        
        // Parse message content
        const msgContent = parseMessageContent(data.message);
        const messageId = data.messageId || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Check for duplicate
        if (State.messages.has(messageId)) {
            console.log('⚠️ Duplicate message ignored:', messageId);
            return;
        }
        
        // Create message object with media data from server
        const msg = {
            id: messageId,
            content: msgContent.text,
            messageType: msgContent.type,
            isFromMe: isFromMe,
            timestamp: data.timestamp || Date.now(),
            status: isFromMe ? 'sent' : 'received',
            mediaUrl: msgContent.mediaUrl,
            mediaData: data.mediaBase64 || '', // Media downloaded by server
            caption: msgContent.caption,
            filename: msgContent.filename,
            mimetype: msgContent.mimetype
        };
        
        // Store in messages map
        State.messages.set(messageId, msg);
        
        // Update conversation list
        updateConversationItem(phone, msg);
        
        // If this chat is open, append message
        if (State.currentChat === phone) {
            // For outgoing messages from mobile, check if we have a pending message with same content
            if (isFromMe) {
                // Check pending messages
                let matchedPending = null;
                State.pendingMessages.forEach((pending, tempId) => {
                    if (pending.content === msg.content && pending.phone === phone) {
                        matchedPending = tempId;
                    }
                });
                
                if (matchedPending) {
                    // Update pending bubble instead of creating new one
                    updatePendingMessage(matchedPending, msg);
                    State.pendingMessages.delete(matchedPending);
                    return;
                }
            }
            
            appendMessageToUI(msg);
            scrollToBottom();
        }
        
        // Play notification sound for incoming
        if (!isFromMe) {
            playNotificationSound();
        }
    });
    
    // ========================================
    // MESSAGE SENT CALLBACK - Update pending to sent
    // ========================================
    socket.on('message-sent', (data) => {
        console.log('✅ Message sent callback:', data);
        
        if (data.success && data.tempId) {
            // Check if this is a media message
            if (data.mediaType) {
                handleMediaSentSuccess(data, data.mediaType);
                return;
            }
            
            // Update pending text message status
            const pendingEl = document.querySelector(`[data-temp-id="${data.tempId}"]`);
            if (pendingEl) {
                const statusEl = pendingEl.querySelector('.message-status');
                if (statusEl) {
                    statusEl.className = 'message-status sent';
                    statusEl.innerHTML = '<i class="bi bi-check2"></i>';
                }
                
                // If this was a template message, update the content to show actual sent message
                if (data.isTemplate && data.messageContent) {
                    const textEl = pendingEl.querySelector('.message-text');
                    if (textEl) {
                        textEl.innerHTML = formatText(data.messageContent);
                    }
                }
                
                // Update messageId
                if (data.messageId) {
                    pendingEl.dataset.id = data.messageId;
                }
            }
            
            State.pendingMessages.delete(data.tempId);
            
            // Show template success toast
            if (data.isTemplate) {
                showToast('success', `Template #${data.templateCode} berhasil dikirim`);
            }
        }
    });
    
    // Media sent callbacks (legacy support)
    socket.on('image-sent', (data) => {
        console.log('📸 Image sent:', data);
        if (data.success) {
            handleMediaSentSuccess(data, 'image');
        }
    });
    
    socket.on('video-sent', (data) => {
        console.log('🎬 Video sent:', data);
        if (data.success) {
            handleMediaSentSuccess(data, 'video');
        }
    });
    
    socket.on('document-sent', (data) => {
        console.log('📄 Document sent:', data);
        if (data.success) {
            handleMediaSentSuccess(data, 'document');
        }
    });
    
    // Error handling
    socket.on('error', (error) => {
        console.error('❌ Socket error:', error);
        showToast('error', error);
    });
    
    socket.on('send-error', (data) => {
        console.error('❌ Send error:', data);
        showToast('error', `Gagal mengirim: ${data.error}`);
        
        // Mark pending as failed
        if (data.tempId) {
            const pendingEl = document.querySelector(`[data-temp-id="${data.tempId}"]`);
            if (pendingEl) {
                pendingEl.querySelector('.message-status')?.remove();
                pendingEl.insertAdjacentHTML('beforeend', '<span class="text-danger ms-2"><i class="bi bi-exclamation-circle"></i></span>');
            }
        }
    });
    
    // Template not found
    socket.on('template-not-found', (data) => {
        console.log('❌ Template not found:', data);
        showToast('warning', data.message || `Template "${data.code}" tidak ditemukan`);
    });
    
    // Session status
    socket.on('session-status', (data) => {
        console.log('📱 Session status:', data);
        loadSessions();
    });
}

function setConnectionStatus(status) {
    const el = DOM.connectionStatus;
    if (!el) return;
    
    el.className = 'connection-status';
    switch (status) {
        case 'connecting':
            el.classList.add('connecting');
            DOM.connectionText.textContent = 'Menghubungkan...';
            break;
        case 'disconnected':
            el.classList.add('disconnected');
            DOM.connectionText.textContent = 'Terputus. Mencoba menyambung ulang...';
            break;
        default:
            el.style.display = 'none';
    }
}

// ============================================
// SESSIONS
// ============================================
function loadSessions() {
    fetch('/api/sessions')
        .then(r => r.json())
        .then(data => {
            if (data.success && DOM.sessionSelect) {
                DOM.sessionSelect.innerHTML = '<option value="">Pilih Session...</option>';
                
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

function selectSession(sessionId) {
    State.sessionId = sessionId;
    State.currentChat = null;
    State.messages.clear();
    State.pendingMessages.clear();
    
    if (!sessionId) {
        DOM.sessionBadge?.classList.add('d-none');
        showEmptyConversations();
        hideChat();
        return;
    }
    
    // Get session info
    fetch(`/api/session/${sessionId}`)
        .then(r => r.json())
        .then(data => {
            if (data.success && data.session) {
                DOM.sessionBadge?.classList.remove('d-none');
                if (DOM.sessionPhoneBadge) {
                    DOM.sessionPhoneBadge.textContent = data.session.phoneNumber || 'Connected';
                }
            }
        });
    
    loadConversations(sessionId);
    hideChat();
}

// ============================================
// CONVERSATIONS
// ============================================
function loadConversations(sessionId) {
    DOM.conversationsList.innerHTML = `
        <div class="d-flex justify-content-center py-5">
            <div class="spinner-border spinner-border-sm text-primary"></div>
        </div>
    `;
    
    fetch(`/api/messages/conversations/${sessionId}`)
        .then(r => r.json())
        .then(data => {
            if (data.success && data.conversations?.length > 0) {
                renderConversations(data.conversations);
            } else {
                showEmptyConversations();
            }
        })
        .catch(() => showEmptyConversations());
}

function renderConversations(list) {
    State.conversations.clear();
    
    let html = '';
    list.forEach((conv, idx) => {
        const phone = cleanPhoneNumber(conv.phone);
        State.conversations.set(phone, conv);
        
        const name = conv.pushName || formatPhone(phone);
        const initial = getInitial(name);
        const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
        const time = conv.lastMessageTime ? formatTime(conv.lastMessageTime) : '';
        const preview = getPreview(conv.lastMessage, conv.lastMessageType);
        const isActive = State.currentChat === phone;
        
        html += `
            <div class="conversation-item ${isActive ? 'active' : ''}" 
                 data-phone="${phone}" 
                 onclick="openChat('${phone}')">
                <div class="conv-avatar" style="background: ${color}">${initial}</div>
                <div class="conv-content">
                    <div class="conv-header">
                        <span class="conv-name">${escapeHtml(name)}</span>
                        <span class="conv-time">${time}</span>
                    </div>
                    <div class="conv-preview">
                        <span class="conv-preview-text">${preview}</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    DOM.conversationsList.innerHTML = html;
}

function showEmptyConversations() {
    DOM.conversationsList.innerHTML = `
        <div class="empty-conversations">
            <i class="bi bi-inbox"></i>
            <p>Pilih session untuk melihat percakapan</p>
        </div>
    `;
}

function updateConversationItem(phone, msg) {
    const item = document.querySelector(`.conversation-item[data-phone="${phone}"]`);
    if (item) {
        const timeEl = item.querySelector('.conv-time');
        const previewEl = item.querySelector('.conv-preview-text');
        if (timeEl) timeEl.textContent = formatTime(msg.timestamp);
        if (previewEl) previewEl.innerHTML = getPreview(msg.content, msg.messageType);
        
        // Move to top
        DOM.conversationsList.prepend(item);
    } else {
        // New conversation, reload list
        loadConversations(State.sessionId);
    }
}

function filterConversations(query) {
    const items = document.querySelectorAll('.conversation-item');
    query = query.toLowerCase();
    
    items.forEach(item => {
        const name = item.querySelector('.conv-name')?.textContent.toLowerCase() || '';
        const phone = item.dataset.phone?.toLowerCase() || '';
        item.style.display = (name.includes(query) || phone.includes(query)) ? '' : 'none';
    });
}

function getPreview(content, type) {
    const icons = {
        image: '<i class="bi bi-camera-fill me-1"></i>Foto',
        video: '<i class="bi bi-camera-video-fill me-1"></i>Video',
        audio: '<i class="bi bi-music-note me-1"></i>Audio',
        voice: '<i class="bi bi-mic-fill me-1"></i>Voice',
        ptt: '<i class="bi bi-mic-fill me-1"></i>Voice',
        document: '<i class="bi bi-file-earmark me-1"></i>Dokumen',
        sticker: '<i class="bi bi-emoji-smile me-1"></i>Sticker',
        gif: '<i class="bi bi-filetype-gif me-1"></i>GIF',
        location: '<i class="bi bi-geo-alt me-1"></i>Lokasi'
    };
    
    if (type && icons[type]) return icons[type];
    if (content) {
        const text = content.length > 30 ? content.substring(0, 30) + '...' : content;
        return escapeHtml(text);
    }
    return '...';
}

// ============================================
// CHAT / MESSAGES
// ============================================
function openChat(phone) {
    State.currentChat = phone;
    State.messages.clear();
    State.lastMessageFrom = null;
    
    // Update sidebar
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.toggle('active', item.dataset.phone === phone);
    });
    
    // Show chat
    DOM.emptyChat.style.display = 'none';
    DOM.activeChat.style.display = 'flex';
    
    // Hide sidebar on mobile
    if (window.innerWidth < 768) {
        DOM.inboxSidebar?.classList.add('hidden');
    }
    
    // Set header
    const conv = State.conversations.get(phone);
    const name = conv?.pushName || formatPhone(phone);
    const idx = Array.from(State.conversations.keys()).indexOf(phone);
    const color = AVATAR_COLORS[Math.abs(idx) % AVATAR_COLORS.length];
    
    DOM.chatAvatar.textContent = getInitial(name);
    DOM.chatAvatar.style.background = color;
    DOM.chatName.textContent = name;
    DOM.chatPhone.textContent = formatPhone(phone);
    
    // Load messages
    loadMessages(phone);
    
    // Focus input
    setTimeout(() => DOM.messageInput?.focus(), 100);
}

function hideChat() {
    State.currentChat = null;
    DOM.emptyChat.style.display = '';
    DOM.activeChat.style.display = 'none';
}

function showSidebar() {
    DOM.inboxSidebar?.classList.remove('hidden');
}

function loadMessages(phone) {
    DOM.messagesContainer.innerHTML = `
        <div class="loading-messages">
            <div class="spinner-border spinner-border-sm text-primary mb-2"></div>
            <span>Memuat pesan...</span>
        </div>
    `;
    
    const apiUrl = `/api/messages/chat/${State.sessionId}/${encodeURIComponent(phone)}`;
    console.log('📥 Loading messages from:', apiUrl);
    
    fetch(apiUrl)
        .then(r => r.json())
        .then(data => {
            console.log('📥 API Response:', {
                success: data.success,
                messageCount: data.messages?.length || 0,
                messages: data.messages
            });
            
            if (data.success && data.messages?.length > 0) {
                // Log image messages specifically
                const imageMessages = data.messages.filter(m => 
                    (m.message_type === 'image' || m.messageType === 'image')
                );
                console.log('🖼️ Image messages found:', imageMessages.length);
                imageMessages.forEach(m => {
                    console.log('  - ID:', m.message_id || m.id, 
                        'media_data:', m.media_data ? m.media_data.length + ' chars' : 'EMPTY');
                });
                
                renderMessages(data.messages);
            } else {
                DOM.messagesContainer.innerHTML = `
                    <div class="loading-messages">
                        <i class="bi bi-chat-dots fs-1 text-muted mb-3"></i>
                        <span class="text-muted">Belum ada pesan</span>
                    </div>
                `;
            }
        })
        .catch((err) => {
            console.error('❌ Error loading messages:', err);
            DOM.messagesContainer.innerHTML = `
                <div class="loading-messages text-danger">
                    <i class="bi bi-exclamation-circle fs-1 mb-3"></i>
                    <span>Gagal memuat pesan</span>
                </div>
            `;
        });
}

function renderMessages(messages) {
    State.messages.clear();
    State.lastMessageFrom = null;
    
    let html = '';
    let lastDate = null;
    
    messages.forEach((msg, idx) => {
        try {
            const msgId = msg.message_id || msg.id || `msg_${idx}`;
            State.messages.set(msgId, msg);
            
            // Date divider
            const msgDate = formatDate(msg.timestamp);
            if (msgDate !== lastDate) {
                html += `<div class="date-divider"><span>${msgDate}</span></div>`;
                lastDate = msgDate;
            }
            
            html += renderMessageBubble(msg, msgId);
        } catch (err) {
            console.error('❌ Error rendering message:', msg, err);
        }
    });
    
    DOM.messagesContainer.innerHTML = html;
    scrollToBottom();
}

function renderMessageBubble(msg, msgId) {
    const isOut = msg.isFromMe || msg.fromMe || msg.direction === 'outgoing';
    const rowClass = isOut ? 'out' : 'in';
    
    // Check if consecutive from same sender
    const currentFrom = isOut ? 'me' : 'them';
    const isConsecutive = State.lastMessageFrom === currentFrom;
    State.lastMessageFrom = currentFrom;
    
    const timestamp = formatTimeFull(msg.timestamp);
    const status = isOut ? renderStatus(msg.status) : '';
    const content = renderContent(msg);
    
    return `
        <div class="message-row ${rowClass} ${isConsecutive ? 'consecutive' : ''}" data-id="${msgId}">
            <div class="message-bubble">
                ${content}
                <span class="message-footer">
                    <span class="message-time">${timestamp}</span>
                    ${status}
                </span>
            </div>
        </div>
    `;
}

function renderContent(msg) {
    const type = (msg.messageType || msg.message_type || 'text').toLowerCase();
    const text = msg.content || msg.text || '';
    const caption = msg.caption || text || '';
    const mediaUrl = msg.mediaUrl || msg.media_url || '';
    const mediaData = msg.mediaData || msg.media_data || '';
    const mimetype = msg.mimetype || msg.mimeType || '';
    
    // Debug log for image messages
    if (type === 'image') {
        console.log('🖼️ Rendering image:', {
            id: msg.id || msg.message_id,
            hasMediaUrl: !!mediaUrl,
            hasMediaData: !!mediaData,
            mediaDataLength: mediaData ? mediaData.length : 0,
            mimetype: mimetype
        });
    }
    
    switch (type) {
        case 'image':
            // Determine image source: prefer direct data, then base64
            let imgSrc = '';
            if (mediaUrl) {
                imgSrc = mediaUrl;
            } else if (mediaData) {
                // Use mimetype if available, otherwise default to jpeg
                const imgMime = mimetype.startsWith('image/') ? mimetype : 'image/jpeg';
                imgSrc = `data:${imgMime};base64,${mediaData}`;
            }
            
            if (imgSrc) {
                // Use data-src attribute to store base64 for preview, avoid putting in onclick
                const previewId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                // Store in a global map for preview
                if (!window._imagePreviewMap) window._imagePreviewMap = {};
                window._imagePreviewMap[previewId] = imgSrc;
                
                return `
                    <div class="media-container" onclick="previewImageById('${previewId}')">
                        <img src="${imgSrc}" alt="Image" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'media-placeholder\\'><i class=\\'bi bi-image\\'></i><span>📷 Foto</span></div>'">
                    </div>
                    ${caption ? `<div class="media-caption">${formatText(caption)}</div>` : ''}
                `;
            }
            // Fallback placeholder when no data available
            return `
                <div class="media-container">
                    <div class="media-placeholder">
                        <i class="bi bi-image"></i>
                        <span>📷 Foto</span>
                    </div>
                </div>
                ${caption ? `<div class="media-caption">${formatText(caption)}</div>` : ''}
            `;
            
        case 'video':
        case 'gif':
            let videoSrc = '';
            if (mediaUrl) {
                videoSrc = mediaUrl;
            } else if (mediaData) {
                const vidMime = mimetype.startsWith('video/') ? mimetype : 'video/mp4';
                videoSrc = `data:${vidMime};base64,${mediaData}`;
            }
            
            if (videoSrc) {
                return `
                    <div class="media-container">
                        <video controls ${type === 'gif' ? 'autoplay loop muted' : ''}>
                            <source src="${videoSrc}" type="${mimetype || 'video/mp4'}">
                        </video>
                    </div>
                    ${caption ? `<div class="media-caption">${formatText(caption)}</div>` : ''}
                `;
            }
            return `
                <div class="media-container">
                    <div class="media-placeholder">
                        <i class="bi bi-camera-video"></i>
                        <span>🎬 ${type === 'gif' ? 'GIF' : 'Video'}</span>
                    </div>
                </div>
                ${caption ? `<div class="media-caption">${formatText(caption)}</div>` : ''}
            `;
            
        case 'audio':
        case 'voice':
        case 'ptt':
            return `
                <div class="voice-bubble">
                    <div class="voice-play-btn"><i class="bi bi-play-fill"></i></div>
                    <div class="voice-waveform"></div>
                    <span class="voice-duration">${msg.duration || '0:00'}</span>
                </div>
            `;
            
        case 'document':
            const filename = msg.filename || msg.fileName || 'Document';
            const size = msg.filesize || msg.file_size || '';
            return `
                <div class="document-bubble">
                    <div class="document-icon"><i class="bi bi-file-earmark-text"></i></div>
                    <div class="document-info">
                        <div class="document-name">${escapeHtml(filename)}</div>
                        <div class="document-meta">${size ? formatFileSize(size) : 'Dokumen'}</div>
                    </div>
                </div>
            `;
            
        case 'sticker':
            if (mediaUrl || mediaData) {
                const stickerSrc = mediaUrl || `data:image/webp;base64,${mediaData}`;
                return `<div class="sticker-container"><img src="${stickerSrc}" alt="Sticker"></div>`;
            }
            return `
                <div class="media-placeholder" style="padding: 20px;">
                    <i class="bi bi-emoji-smile"></i>
                    <span>Sticker</span>
                </div>
            `;
            
        case 'location':
            return `
                <div class="media-placeholder">
                    <i class="bi bi-geo-alt-fill"></i>
                    <span>Lokasi</span>
                </div>
            `;
            
        default:
            return `<div class="message-text">${formatText(text)}</div>`;
    }
}

function renderStatus(status) {
    switch (status) {
        case 'read':
            return '<span class="message-status read"><i class="bi bi-check2-all"></i></span>';
        case 'delivered':
            return '<span class="message-status delivered"><i class="bi bi-check2-all"></i></span>';
        case 'sent':
            return '<span class="message-status sent"><i class="bi bi-check2"></i></span>';
        case 'pending':
            return '<span class="message-status pending"><i class="bi bi-clock"></i></span>';
        default:
            return '<span class="message-status sent"><i class="bi bi-check2"></i></span>';
    }
}

function appendMessageToUI(msg) {
    const msgId = msg.id || `msg_${Date.now()}`;
    
    // Add date divider if needed
    const lastRow = DOM.messagesContainer.querySelector('.message-row:last-child');
    const lastDateDiv = DOM.messagesContainer.querySelector('.date-divider:last-of-type');
    const msgDate = formatDate(msg.timestamp);
    const todayStr = formatDate(Date.now());
    
    let dividerHtml = '';
    if (!lastDateDiv || (lastDateDiv && !lastDateDiv.textContent.includes(msgDate === todayStr ? 'Hari ini' : msgDate))) {
        dividerHtml = `<div class="date-divider"><span>${msgDate}</span></div>`;
    }
    
    const html = renderMessageBubble(msg, msgId);
    DOM.messagesContainer.insertAdjacentHTML('beforeend', dividerHtml + html);
    
    // Add animation class
    const newRow = DOM.messagesContainer.querySelector(`[data-id="${msgId}"]`);
    if (newRow) newRow.classList.add('new');
}

function updatePendingMessage(tempId, actualMsg) {
    const el = document.querySelector(`[data-temp-id="${tempId}"]`);
    if (el) {
        el.dataset.id = actualMsg.id;
        el.removeAttribute('data-temp-id');
        
        const statusEl = el.querySelector('.message-status');
        if (statusEl) {
            statusEl.className = 'message-status sent';
            statusEl.innerHTML = '<i class="bi bi-check2"></i>';
        }
    }
}

function scrollToBottom() {
    if (DOM.messagesContainer) {
        DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
    }
    DOM.scrollBottom?.classList.remove('show');
}

function refreshChat() {
    if (State.currentChat) {
        loadMessages(State.currentChat);
    }
}

// ============================================
// SEND MESSAGE
// ============================================
function sendMessage() {
    if (!DOM.messageInput || !State.sessionId || !State.currentChat) return;
    
    const text = DOM.messageInput.value.trim();
    if (!text) return;
    
    // Generate temp ID for tracking
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create optimistic message
    const msg = {
        id: tempId,
        content: text,
        messageType: 'text',
        isFromMe: true,
        timestamp: Date.now(),
        status: 'pending'
    };
    
    // Store as pending
    State.pendingMessages.set(tempId, { ...msg, phone: State.currentChat });
    
    // Add to UI immediately (optimistic)
    appendPendingMessage(msg, tempId);
    scrollToBottom();
    
    // Clear input
    DOM.messageInput.value = '';
    DOM.messageInput.style.height = 'auto';
    
    // Send via socket
    socket.emit('send-message', {
        sessionId: State.sessionId,
        phone: State.currentChat,
        message: text,
        tempId: tempId
    });
    
    // Update conversation preview
    updateConversationItem(State.currentChat, msg);
}

function appendPendingMessage(msg, tempId) {
    const html = `
        <div class="message-row out new" data-temp-id="${tempId}">
            <div class="message-bubble">
                <div class="message-text">${formatText(msg.content)}</div>
                <span class="message-footer">
                    <span class="message-time">${formatTimeFull(msg.timestamp)}</span>
                    <span class="message-status pending"><i class="bi bi-clock"></i></span>
                </span>
            </div>
        </div>
    `;
    DOM.messagesContainer.insertAdjacentHTML('beforeend', html);
}

// ============================================
// MEDIA HANDLING
// ============================================
function toggleAttachment() {
    DOM.attachmentMenu?.classList.toggle('show');
}

function openMediaModal(type) {
    DOM.attachmentMenu?.classList.remove('show');
    State.mediaType = type;
    State.selectedFile = null;
    State.selectedFileData = null;
    
    // Reset modal
    DOM.uploadArea.classList.remove('d-none');
    DOM.previewArea.classList.add('d-none');
    DOM.mediaCaption.value = '';
    DOM.sendMediaBtn.disabled = true;
    DOM.fileInput.value = '';
    
    // Set file type hint
    const hints = {
        image: 'JPG, PNG, GIF, WebP',
        video: 'MP4, MKV, AVI',
        document: 'PDF, DOC, XLS, ZIP, dll'
    };
    document.getElementById('file-types-hint').textContent = hints[type] || '';
    document.getElementById('mediaModalTitle').textContent = type === 'image' ? 'Kirim Foto' : type === 'video' ? 'Kirim Video' : 'Kirim Dokumen';
    
    // Set accepted files
    const accepts = {
        image: 'image/*',
        video: 'video/*',
        document: '*/*'
    };
    DOM.fileInput.accept = accepts[type] || '*/*';
    
    // Show/hide caption
    document.getElementById('caption-group').style.display = type === 'document' ? 'none' : '';
    
    State.mediaModal.show();
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
}

function processFile(file) {
    State.selectedFile = file;
    
    DOM.uploadArea.classList.add('d-none');
    DOM.previewArea.classList.remove('d-none');
    DOM.sendMediaBtn.disabled = false;
    
    DOM.previewFilename.textContent = file.name;
    DOM.previewFilesize.textContent = formatFileSize(file.size);
    
    // Preview
    DOM.previewContent.innerHTML = '';
    
    if (State.mediaType === 'image' && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            State.selectedFileData = e.target.result;
            DOM.previewContent.innerHTML = `<img src="${e.target.result}" class="img-fluid rounded" style="max-height: 250px;">`;
        };
        reader.readAsDataURL(file);
    } else if (State.mediaType === 'video' && file.type.startsWith('video/')) {
        const url = URL.createObjectURL(file);
        DOM.previewContent.innerHTML = `<video src="${url}" class="img-fluid rounded" style="max-height: 250px;" controls></video>`;
        
        const reader = new FileReader();
        reader.onload = (e) => { State.selectedFileData = e.target.result; };
        reader.readAsDataURL(file);
    } else {
        const icon = getFileIcon(file.type);
        DOM.previewContent.innerHTML = `<i class="bi ${icon}" style="font-size: 60px;"></i>`;
        
        const reader = new FileReader();
        reader.onload = (e) => { State.selectedFileData = e.target.result; };
        reader.readAsDataURL(file);
    }
}

function getFileIcon(mimetype) {
    if (mimetype.includes('pdf')) return 'bi-file-earmark-pdf text-danger';
    if (mimetype.includes('word')) return 'bi-file-earmark-word text-primary';
    if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return 'bi-file-earmark-excel text-success';
    if (mimetype.includes('zip') || mimetype.includes('rar')) return 'bi-file-earmark-zip text-warning';
    return 'bi-file-earmark text-primary';
}

function clearFile() {
    State.selectedFile = null;
    State.selectedFileData = null;
    DOM.fileInput.value = '';
    DOM.uploadArea.classList.remove('d-none');
    DOM.previewArea.classList.add('d-none');
    DOM.sendMediaBtn.disabled = true;
}

function sendMedia() {
    if (!State.selectedFile || !State.selectedFileData || !State.sessionId || !State.currentChat) return;
    
    const caption = DOM.mediaCaption?.value || '';
    const base64 = State.selectedFileData.split(',')[1];
    
    // Show loading
    const btn = DOM.sendMediaBtn;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Mengirim...';
    btn.disabled = true;
    
    // Generate temp ID
    const tempId = `media_${Date.now()}`;
    
    // Add optimistic message
    const optimisticMsg = {
        id: tempId,
        content: caption,
        messageType: State.mediaType,
        isFromMe: true,
        timestamp: Date.now(),
        status: 'pending',
        filename: State.selectedFile.name,
        mediaData: base64.substring(0, 100) // Just for identification
    };
    
    State.pendingMessages.set(tempId, { ...optimisticMsg, phone: State.currentChat });
    appendPendingMediaMessage(optimisticMsg, tempId);
    scrollToBottom();
    
    // Send via socket
    const payload = {
        sessionId: State.sessionId,
        phone: State.currentChat,
        base64: base64,
        mimetype: State.selectedFile.type,
        tempId: tempId
    };
    
    if (State.mediaType === 'image') {
        payload.caption = caption;
        socket.emit('send-image', payload);
    } else if (State.mediaType === 'video') {
        payload.caption = caption;
        socket.emit('send-video', payload);
    } else {
        payload.filename = State.selectedFile.name;
        socket.emit('send-document', payload);
    }
    
    // Close modal
    State.mediaModal.hide();
    btn.innerHTML = originalText;
    btn.disabled = false;
    
    // Reset state
    State.selectedFile = null;
    State.selectedFileData = null;
}

function appendPendingMediaMessage(msg, tempId) {
    const type = msg.messageType;
    let contentHtml = '';
    
    if (type === 'image') {
        contentHtml = `
            <div class="media-container">
                <div class="media-placeholder">
                    <i class="bi bi-image"></i>
                    <span>Mengirim foto...</span>
                </div>
            </div>
            ${msg.content ? `<div class="media-caption">${formatText(msg.content)}</div>` : ''}
        `;
    } else if (type === 'video') {
        contentHtml = `
            <div class="media-container">
                <div class="media-placeholder">
                    <i class="bi bi-camera-video"></i>
                    <span>Mengirim video...</span>
                </div>
            </div>
            ${msg.content ? `<div class="media-caption">${formatText(msg.content)}</div>` : ''}
        `;
    } else {
        contentHtml = `
            <div class="document-bubble">
                <div class="document-icon"><i class="bi bi-file-earmark-text"></i></div>
                <div class="document-info">
                    <div class="document-name">${escapeHtml(msg.filename || 'Dokumen')}</div>
                    <div class="document-meta">Mengirim...</div>
                </div>
            </div>
        `;
    }
    
    const html = `
        <div class="message-row out new" data-temp-id="${tempId}">
            <div class="message-bubble">
                ${contentHtml}
                <span class="message-footer">
                    <span class="message-time">${formatTimeFull(msg.timestamp)}</span>
                    <span class="message-status pending"><i class="bi bi-clock"></i></span>
                </span>
            </div>
        </div>
    `;
    DOM.messagesContainer.insertAdjacentHTML('beforeend', html);
}

function handleMediaSentSuccess(data, type) {
    // Update pending message
    if (data.tempId) {
        const el = document.querySelector(`[data-temp-id="${data.tempId}"]`);
        if (el) {
            const statusEl = el.querySelector('.message-status');
            if (statusEl) {
                statusEl.className = 'message-status sent';
                statusEl.innerHTML = '<i class="bi bi-check2"></i>';
            }
            
            // Replace placeholder with actual media if base64 is available
            const placeholder = el.querySelector('.media-placeholder');
            if (placeholder && data.base64) {
                const container = placeholder.parentElement;
                if (type === 'image') {
                    const imgSrc = `data:image/jpeg;base64,${data.base64}`;
                    container.innerHTML = `<img src="${imgSrc}" alt="Image" loading="lazy" onclick="previewImage('${imgSrc}')">`;
                } else if (type === 'video') {
                    const vidSrc = `data:video/mp4;base64,${data.base64}`;
                    container.innerHTML = `<video controls><source src="${vidSrc}" type="video/mp4"></video>`;
                }
            } else if (placeholder) {
                // Just update text if no base64
                const span = placeholder.querySelector('span');
                if (span) {
                    span.textContent = type === 'image' ? '📷 Foto' : type === 'video' ? '🎬 Video' : '📄 Dokumen';
                }
            }
            
            // Update messageId for future reference
            if (data.messageId) {
                el.dataset.id = data.messageId;
            }
        }
        
        State.pendingMessages.delete(data.tempId);
    }
    
    showToast('success', `${type.charAt(0).toUpperCase() + type.slice(1)} berhasil dikirim`);
}

function previewImage(src) {
    if (!src) return;
    document.getElementById('preview-image-full').src = src;
    State.imageModal.show();
}

function previewImageById(previewId) {
    if (!window._imagePreviewMap || !window._imagePreviewMap[previewId]) return;
    const src = window._imagePreviewMap[previewId];
    document.getElementById('preview-image-full').src = src;
    State.imageModal.show();
}

// ============================================
// UTILITIES
// ============================================
function parseMessageContent(message) {
    if (!message) return { type: 'text', text: '' };
    
    if (message.conversation) {
        return { type: 'text', text: message.conversation };
    }
    if (message.extendedTextMessage?.text) {
        return { type: 'text', text: message.extendedTextMessage.text };
    }
    if (message.imageMessage) {
        return { 
            type: 'image', 
            text: message.imageMessage.caption || '',
            caption: message.imageMessage.caption || '',
            mimetype: message.imageMessage.mimetype || 'image/jpeg'
        };
    }
    if (message.videoMessage) {
        return { 
            type: message.videoMessage.gifPlayback ? 'gif' : 'video', 
            text: message.videoMessage.caption || '',
            caption: message.videoMessage.caption || '',
            mimetype: message.videoMessage.mimetype || 'video/mp4'
        };
    }
    if (message.documentMessage) {
        return { 
            type: 'document', 
            text: message.documentMessage.fileName || '',
            filename: message.documentMessage.fileName || 'Document',
            mimetype: message.documentMessage.mimetype || 'application/octet-stream'
        };
    }
    if (message.audioMessage) {
        return { 
            type: message.audioMessage.ptt ? 'voice' : 'audio', 
            text: '',
            mimetype: message.audioMessage.mimetype || 'audio/ogg'
        };
    }
    if (message.stickerMessage) {
        return { 
            type: 'sticker', 
            text: '',
            mimetype: message.stickerMessage.mimetype || 'image/webp'
        };
    }
    if (message.locationMessage) {
        return { type: 'location', text: message.locationMessage.name || 'Location' };
    }
    
    return { type: 'text', text: '' };
}

function cleanPhoneNumber(phone) {
    if (!phone) return '';
    return phone.replace(/@s\.whatsapp\.net/g, '').replace(/@c\.us/g, '').replace(/@lid/g, '');
}

function formatPhone(phone) {
    const clean = cleanPhoneNumber(phone);
    if (clean.startsWith('62')) {
        return '+' + clean;
    }
    return clean;
}

function getInitial(name) {
    if (!name) return '?';
    if (/^[\d+]/.test(name)) return name.replace(/\D/g, '').charAt(0) || '?';
    return name.charAt(0).toUpperCase();
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    
    let date;
    if (typeof timestamp === 'number') {
        date = new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp);
    } else {
        date = new Date(timestamp);
    }
    
    if (isNaN(date.getTime())) return '';
    
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
        return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return 'Kemarin';
    }
    
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatTimeFull(timestamp) {
    if (!timestamp) return '';
    
    let date;
    if (typeof timestamp === 'number') {
        date = new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp);
    } else {
        date = new Date(timestamp);
    }
    
    if (isNaN(date.getTime())) return '';
    
    // Format: DD-MM-YYYY HH:mm:ss
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    
    let date;
    if (typeof timestamp === 'number') {
        date = new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp);
    } else {
        date = new Date(timestamp);
    }
    
    if (isNaN(date.getTime())) return '';
    
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
        return 'Hari ini';
    }
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return 'Kemarin';
    }
    
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatFileSize(bytes) {
    if (!bytes) return '';
    if (typeof bytes === 'string') bytes = parseInt(bytes);
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatText(text) {
    if (!text) return '';
    
    let formatted = escapeHtml(text);
    
    // URLs
    formatted = formatted.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
    
    // Bold *text*
    formatted = formatted.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    
    // Italic _text_
    formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // Newlines
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function playNotificationSound() {
    try {
        const audio = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7v////////////////////////////////AAAAAA==');
        audio.volume = 0.3;
        audio.play().catch(() => {});
    } catch (e) {}
}

function showToast(type, message) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: type === 'error' ? 'error' : 'success',
            title: message,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000
        });
    } else if (typeof toastr !== 'undefined') {
        toastr[type](message);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

// ============================================
// GLOBAL FUNCTIONS
// ============================================
window.openChat = openChat;
window.toggleAttachment = toggleAttachment;
window.openMediaModal = openMediaModal;
window.handleFileSelect = handleFileSelect;
window.clearFile = clearFile;
window.sendMedia = sendMedia;
window.sendMessage = sendMessage;
window.scrollToBottom = scrollToBottom;
window.refreshChat = refreshChat;
window.showSidebar = showSidebar;
window.previewImage = previewImage;
window.previewImageById = previewImageById;
