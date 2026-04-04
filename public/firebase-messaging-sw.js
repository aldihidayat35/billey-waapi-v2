// Firebase Messaging Service Worker
// This file MUST be at the root of the public folder (public/firebase-messaging-sw.js)
// It handles background push notifications when the app is not in focus

// ============================================
// IMPORTANT: Replace these values with your Firebase project config
// Get them from: Firebase Console → Project Settings → General → Your apps → Web app
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
    const sessionId = payload.data?.sessionId || '';
    const contactJid = payload.data?.contactJid || '';

    const notificationOptions = {
        body: notificationBody,
        icon: '/assets/media/logos/favicon.ico',
        badge: '/assets/media/logos/favicon.ico',
        tag: `${messageType}-${sessionId}-${contactJid}`,
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
