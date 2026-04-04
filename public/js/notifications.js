/**
 * Client-side Notification Manager
 * Handles:
 *   1. Socket.IO realtime notifications (when online)
 *   2. FCM push notification registration (for when offline)
 *   3. In-app notification UI (toast + badge)
 * 
 * Usage:
 *   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
 *   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js"></script>
 *   <script src="/js/notifications.js"></script>
 *   <script>
 *     NotificationManager.init(socket, { vapidKey: 'YOUR_VAPID_KEY' });
 *   </script>
 */

// ============================================
// IMPORTANT: Replace these values with your Firebase project config
// ============================================
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAlVxYvpR3xdvZDndYg7bbxJVUdYMU6BQ0",
    authDomain: "wa-api-massage.firebaseapp.com",
    projectId: "wa-api-massage",
    storageBucket: "wa-api-massage.firebasestorage.app",
    messagingSenderId: "552872690202",
    appId: "1:552872690202:web:386ce012f32f3b012bc7a3"
};

const NotificationManager = {
    socket: null,
    messaging: null,
    currentToken: null,
    unreadCount: 0,
    initialized: false,

    /**
     * Initialize the notification system
     * @param {object} socket - Socket.IO client instance
     * @param {object} options - { vapidKey: string }
     */
    async init(socket, options = {}) {
        if (this.initialized) return;
        this.socket = socket;

        // 1. Setup Socket.IO notification listener
        this._setupSocketListeners();

        // 2. Setup FCM push notifications
        await this._setupFCM(options.vapidKey);

        // 3. Load initial unread count
        this._loadUnreadCount();

        // 4. Listen for service worker messages (notification clicks)
        this._setupServiceWorkerListener();

        this.initialized = true;
        console.log('🔔 NotificationManager initialized');
    },

    // ============================================
    // Socket.IO Realtime Notifications
    // ============================================

    _setupSocketListeners() {
        if (!this.socket) return;

        // Register user presence when connected
        const sessionToken = this._getCookie('wa_session');
        if (sessionToken) {
            this.socket.emit('register-user', { sessionToken });
        }

        // Socket reconnect → re-register
        this.socket.on('connect', () => {
            const token = this._getCookie('wa_session');
            if (token) {
                this.socket.emit('register-user', { sessionToken: token });
            }
        });

        // Receive realtime notification
        this.socket.on('notification', (data) => {
            console.log('🔔 Notification received:', data);
            this.unreadCount++;
            this._updateBadge();
            this._showToast(data);
            this._playSound();

            // Show system browser notification when page is not visible (background tab, minimized)
            if (document.hidden) {
                this._showBrowserNotification(data);
            }

            // Dispatch custom event for pages to handle
            window.dispatchEvent(new CustomEvent('wa-notification', { detail: data }));
        });

        // Receive unread count
        this.socket.on('unread-count', (data) => {
            this.unreadCount = data.count || 0;
            this._updateBadge();
        });

        // User registered confirmation
        this.socket.on('user-registered', (data) => {
            console.log('✅ User registered for notifications:', data);
        });
    },

    // ============================================
    // FCM Push Notification Setup
    // ============================================

    async _setupFCM(vapidKey) {
        if (!vapidKey) {
            console.warn('⚠️ VAPID key not provided. FCM push notifications disabled.');
            console.warn('   Get your VAPID key from: Firebase Console → Project Settings → Cloud Messaging → Web Push certificates');
            return;
        }

        // Check browser support
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('⚠️ Browser does not support push notifications');
            return;
        }

        // Check if Firebase SDK is loaded
        if (typeof firebase === 'undefined') {
            console.warn('⚠️ Firebase SDK not loaded. Add Firebase scripts before notifications.js');
            return;
        }

        try {
            // Initialize Firebase
            if (!firebase.apps.length) {
                firebase.initializeApp(FIREBASE_CONFIG);
            }
            this.messaging = firebase.messaging();

            // Register service worker
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            console.log('📋 Service Worker registered:', registration.scope);

            // Handle foreground messages from FCM
            // Socket.IO already handles in-app UI (toast/sound), so FCM foreground
            // only updates badge to avoid duplicate toasts
            this.messaging.onMessage((payload) => {
                console.log('🔔 FCM foreground message (suppressed, Socket.IO handles UI):', payload.data?.type);
                // Don't show toast/sound — Socket.IO notification handler already does that
                // Just ensure badge is up to date
                this._updateBadge();
            });

            // Request permission & get token
            await this._requestPermissionAndToken(vapidKey, registration);

        } catch (err) {
            console.error('❌ FCM setup failed:', err);
        }
    },

    async _requestPermissionAndToken(vapidKey, registration) {
        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.warn('⚠️ Notification permission denied');
                return;
            }

            const token = await this.messaging.getToken({
                vapidKey: vapidKey,
                serviceWorkerRegistration: registration
            });

            if (token) {
                this.currentToken = token;
                console.log('🔑 FCM Token obtained');

                // Register token with backend
                await this._registerTokenWithBackend(token);
            }
        } catch (err) {
            console.error('❌ Failed to get FCM token:', err);
        }
    },

    async _registerTokenWithBackend(token) {
        try {
            const response = await fetch('/api/notifications/fcm-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: token,
                    platform: 'web',
                    browser: navigator.userAgent.includes('Chrome') ? 'chrome' :
                             navigator.userAgent.includes('Firefox') ? 'firefox' :
                             navigator.userAgent.includes('Safari') ? 'safari' : 'other'
                })
            });
            const data = await response.json();
            if (data.success) {
                console.log('✅ FCM token registered with backend');
            }
        } catch (err) {
            console.error('❌ Failed to register FCM token:', err);
        }
    },

    // ============================================
    // Service Worker Message Listener
    // ============================================

    _setupServiceWorkerListener() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data?.type === 'NOTIFICATION_CLICK') {
                    const data = event.data.data;
                    if (data?.sessionId && data?.contactJid) {
                        // Navigate to the specific chat
                        window.dispatchEvent(new CustomEvent('wa-notification-click', { detail: data }));
                    }
                }
            });
        }
    },

    // ============================================
    // UI: Toast Notification
    // ============================================

    _showToast(data) {
        // Remove existing toast if any
        const existingToast = document.getElementById('wa-notif-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.id = 'wa-notif-toast';
        toast.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 99999;
            min-width: 320px; max-width: 420px;
            background: #fff; border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.15);
            padding: 16px 20px; display: flex; align-items: flex-start; gap: 12px;
            border-left: 4px solid #25D366;
            animation: slideInRight 0.3s ease-out;
            cursor: pointer; transition: opacity 0.3s;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        const icon = data.type === 'incoming_message' ? '💬' :
                     data.type === 'session_status' ? '📡' :
                     data.type === 'assignment_update' ? '📋' : '🔔';

        toast.innerHTML = `
            <div style="font-size: 24px; flex-shrink: 0;">${icon}</div>
            <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 600; font-size: 14px; color: #1a1a1a; margin-bottom: 2px;">
                    ${this._escapeHtml(data.title || 'Notifikasi')}
                </div>
                <div style="font-size: 13px; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${this._escapeHtml(data.body || '')}
                </div>
                <div style="font-size: 11px; color: #999; margin-top: 4px;">
                    ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                </div>
            </div>
            <button onclick="this.parentElement.remove()" style="
                background: none; border: none; color: #999; cursor: pointer;
                font-size: 18px; padding: 0; line-height: 1; flex-shrink: 0;
            ">×</button>
        `;

        // Click handler → navigate to relevant page
        toast.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            const url = data.data?.url || '/member/dashboard.html';
            if (window.location.pathname !== url) {
                window.location.href = url;
            }
            toast.remove();
        });

        // Add CSS animation
        if (!document.getElementById('wa-notif-style')) {
            const style = document.createElement('style');
            style.id = 'wa-notif-style';
            style.textContent = `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOutRight {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(toast);

        // Auto-remove after 6 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.animation = 'slideOutRight 0.3s ease-in forwards';
                setTimeout(() => toast.remove(), 300);
            }
        }, 6000);
    },

    // ============================================
    // UI: Badge Counter
    // ============================================

    _updateBadge() {
        // Update any element with data-notif-badge attribute
        const badges = document.querySelectorAll('[data-notif-badge]');
        badges.forEach(badge => {
            badge.textContent = this.unreadCount > 99 ? '99+' : String(this.unreadCount);
            badge.style.display = this.unreadCount > 0 ? '' : 'none';
        });

        // Update document title
        if (this.unreadCount > 0) {
            const baseTitle = document.title.replace(/^\(\d+\+?\)\s*/, '');
            document.title = `(${this.unreadCount > 99 ? '99+' : this.unreadCount}) ${baseTitle}`;
        } else {
            document.title = document.title.replace(/^\(\d+\+?\)\s*/, '');
        }
    },

    // ============================================
    // Sound
    // ============================================

    _playSound() {
        try {
            // Use a simple beep via Web Audio API
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gain.gain.value = 0.1;
            oscillator.start();
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            oscillator.stop(ctx.currentTime + 0.3);
        } catch (e) {
            // Sound not critical
        }
    },

    // ============================================
    // Notification Inbox API
    // ============================================

    async loadNotifications(limit = 50, offset = 0) {
        try {
            const res = await fetch(`/api/notifications?limit=${limit}&offset=${offset}`);
            const data = await res.json();
            if (data.success) {
                this.unreadCount = data.unreadCount;
                this._updateBadge();
                return data.notifications;
            }
            return [];
        } catch (err) {
            console.error('Failed to load notifications:', err);
            return [];
        }
    },

    async markAsRead(notificationId) {
        try {
            await fetch(`/api/notifications/${notificationId}/read`, { method: 'PUT' });
            this.unreadCount = Math.max(0, this.unreadCount - 1);
            this._updateBadge();
        } catch (err) {
            console.error('Failed to mark notification as read:', err);
        }
    },

    async markAllAsRead() {
        try {
            await fetch('/api/notifications/read-all', { method: 'PUT' });
            this.unreadCount = 0;
            this._updateBadge();
        } catch (err) {
            console.error('Failed to mark all as read:', err);
        }
    },

    async _loadUnreadCount() {
        try {
            const res = await fetch('/api/notifications/unread-count');
            const data = await res.json();
            if (data.success) {
                this.unreadCount = data.count;
                this._updateBadge();
            }
        } catch (err) {
            // Non-critical
        }
    },

    // ============================================
    // Helpers
    // ============================================

    _getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    },

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    // ============================================
    // Browser Notification API (system-level push when tab is hidden)
    // ============================================

    _showBrowserNotification(data) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        try {
            const icon = '/assets/media/logos/favicon.ico';
            const tag = `${data.type || 'default'}-${data.data?.sessionId || ''}-${data.data?.contactJid || ''}`;

            const notif = new Notification(data.title || 'Notifikasi Baru', {
                body: data.body || '',
                icon: icon,
                badge: icon,
                tag: tag, // Same tag prevents duplicate notifications
                requireInteraction: data.type === 'incoming_message',
                silent: false
            });

            notif.onclick = () => {
                window.focus();
                const url = data.data?.url || '/member/dashboard.html';
                if (window.location.pathname !== url) {
                    window.location.href = url;
                }
                notif.close();
            };

            // Auto-close after 10 seconds
            setTimeout(() => notif.close(), 10000);
        } catch (e) {
            console.warn('Browser notification failed:', e);
        }
    }
};

// Export for module usage if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationManager;
}
