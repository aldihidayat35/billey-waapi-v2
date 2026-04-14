// ============================================
// Unified Service Worker: PWA + Firebase Cloud Messaging
// Handles: offline caching, app install, background push notifications
// ============================================

const CACHE_NAME = 'billey-wa-v2';
const PRECACHE_URLS = [
    '/member/dashboard.html',
    '/member/chat.js',
    '/js/notifications.js',
    '/js/app-init.js',
    '/assets/media/logos/favicon.ico',
    '/assets/media/logos/pwa-192.png',
    '/assets/media/logos/pwa-512.png',
    '/manifest.json'
];

// ============================================
// Install: precache essential assets
// ============================================
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
    );
    self.skipWaiting();
});

// ============================================
// Activate: clean old caches
// ============================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
        )
    );
    self.clients.claim();
});

// ============================================
// Fetch: network-first with cache fallback for navigations & assets
// ============================================
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET, socket.io, and API calls
    if (event.request.method !== 'GET') return;
    if (url.pathname.startsWith('/socket.io')) return;
    if (url.pathname.startsWith('/api/')) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Cache successful responses for offline access
                if (response.ok && url.origin === self.location.origin) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

// ============================================
// Firebase Cloud Messaging (FCM)
// ============================================
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAlVxYvpR3xdvZDndYg7bbxJVUdYMU6BQ0",
    authDomain: "wa-api-massage.firebaseapp.com",
    projectId: "wa-api-massage",
    storageBucket: "wa-api-massage.firebasestorage.app",
    messagingSenderId: "552872690202",
    appId: "1:552872690202:web:386ce012f32f3b012bc7a3"
};

// Import Firebase scripts for service worker
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp(FIREBASE_CONFIG);
const messaging = firebase.messaging();

// Handle background messages (when app is not in focus)
messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Background message received:', payload);

    // Support both notification field and data-only messages
    const notificationTitle = payload.notification?.title || payload.data?.title || 'Notifikasi Baru';
    const notificationBody = payload.notification?.body || payload.data?.body || '';
    const messageType = payload.data?.type || 'default';

    // Use unique tag from backend (prevents silent replacement of previous notifications)
    // Fallback: generate unique tag if not provided
    const tag = payload.data?.tag || `${messageType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Use dynamic icon from backend if provided
    const iconUrl = payload.data?.icon || '/assets/media/logos/pwa-192.png';

    const notificationOptions = {
        body: notificationBody,
        icon: iconUrl,
        badge: iconUrl,
        tag: tag,
        data: payload.data || {},
        requireInteraction: messageType === 'incoming_message',
        actions: [
            { action: 'open', title: 'Buka' },
            { action: 'dismiss', title: 'Tutup' }
        ]
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event.action);
    event.notification.close();

    if (event.action === 'dismiss') return;

    // Open the app or focus existing tab
    const urlToOpen = event.notification.data?.url || '/member/dashboard.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Focus existing tab if found
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.focus();
                    client.postMessage({
                        type: 'NOTIFICATION_CLICK',
                        data: event.notification.data
                    });
                    return;
                }
            }
            // Otherwise open new tab
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
