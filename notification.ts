/**
 * Notification Service
 * Handles dual-channel notifications: Socket.IO (online) + FCM (offline)
 * 
 * Architecture:
 *   1. User online  → Socket.IO realtime emit
 *   2. User offline → Firebase Cloud Messaging push
 * 
 * Filtering rules:
 *   - Member: only receives notif from assigned sessions (member_sessions)
 *   - Worker: only receives notif from assigned contacts (worker_assignments)
 */

import { Server as SocketIO } from 'socket.io'
import admin from 'firebase-admin'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { db, fcmTokenDb, notificationDb, type NotificationEntry } from './database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ============================================
// Types
// ============================================

export interface NotificationPayload {
    type: 'incoming_message' | 'session_status' | 'assignment_update' | 'system'
    title: string
    body: string
    data?: Record<string, string>  // Must be string values for FCM
}

interface OnlineUser {
    userId: number
    role: string
    socketIds: Set<string>
}

// ============================================
// Firebase Admin Initialization
// ============================================

let fcmInitialized = false

function initFirebase(): boolean {
    if (fcmInitialized) return true

    // Look for service account JSON file
    const possiblePaths = [
        join(__dirname, 'firebase-service-account.json'),
        join(__dirname, 'wa-api-massage-8855cf1d4f6c.json'),
    ]

    let serviceAccountPath: string | null = null
    for (const p of possiblePaths) {
        if (existsSync(p)) {
            serviceAccountPath = p
            break
        }
    }

    if (!serviceAccountPath) {
        console.warn('⚠️ Firebase service account not found. FCM push notifications disabled.')
        console.warn('   Place firebase-service-account.json in project root.')
        return false
    }

    try {
        const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'))
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        })
        fcmInitialized = true
        console.log('🔔 Firebase Admin SDK initialized for FCM push notifications')
        return true
    } catch (err) {
        console.error('❌ Failed to initialize Firebase Admin SDK:', err)
        return false
    }
}

// ============================================
// User Presence Tracking (Socket.IO)
// ============================================

// Map: userId → OnlineUser (tracks all socket connections per user)
const onlineUsers: Map<number, OnlineUser> = new Map()

// Reverse map: socketId → userId (for fast disconnect cleanup)
const socketToUser: Map<string, number> = new Map()

// Track admin sockets separately (admins see all messages)
const adminSocketIds: Set<string> = new Set()

export function registerAdminSocket(socketId: string): void {
    adminSocketIds.add(socketId)
    console.log(`🟢 Admin socket connected [${socketId}] — ${adminSocketIds.size} active`)
}

export function unregisterAdminSocket(socketId: string): void {
    adminSocketIds.delete(socketId)
}

export function registerUserSocket(userId: number, role: string, socketId: string): void {
    const existing = onlineUsers.get(userId)
    if (existing) {
        existing.socketIds.add(socketId)
    } else {
        onlineUsers.set(userId, {
            userId,
            role,
            socketIds: new Set([socketId])
        })
    }
    socketToUser.set(socketId, userId)
    console.log(`🟢 User ${userId} (${role}) connected [socket: ${socketId}] — ${onlineUsers.get(userId)!.socketIds.size} active`)
}

export function unregisterUserSocket(socketId: string): void {
    const userId = socketToUser.get(socketId)
    if (userId === undefined) return

    socketToUser.delete(socketId)
    const user = onlineUsers.get(userId)
    if (user) {
        user.socketIds.delete(socketId)
        if (user.socketIds.size === 0) {
            onlineUsers.delete(userId)
            console.log(`🔴 User ${userId} went offline (all sockets closed)`)
        } else {
            console.log(`🟡 User ${userId} disconnected socket ${socketId} — ${user.socketIds.size} remaining`)
        }
    }
}

export function isUserOnline(userId: number): boolean {
    return onlineUsers.has(userId)
}

export function getUserSocketIds(userId: number): string[] {
    const user = onlineUsers.get(userId)
    return user ? Array.from(user.socketIds) : []
}

export function getOnlineUserCount(): number {
    return onlineUsers.size
}

/**
 * Get all socket IDs authorized to receive a message from a specific session+contact
 * Returns: admin sockets + assigned member sockets + assigned worker sockets
 */
export function getAuthorizedSocketIds(sessionId: string, remoteJid: string): string[] {
    const socketIds: string[] = []

    // 1. All admin sockets see everything
    for (const sid of adminSocketIds) {
        socketIds.push(sid)
    }

    // 2. Members assigned to this session
    const memberRows = db.prepare(`
        SELECT ms.user_id FROM member_sessions ms
        JOIN users u ON u.id = ms.user_id
        WHERE ms.session_id = ? AND u.status = 'aktif' AND u.role = 'memberwa'
    `).all(sessionId) as { user_id: number }[]

    for (const row of memberRows) {
        const sids = getUserSocketIds(row.user_id)
        socketIds.push(...sids)
    }

    // 3. Workers assigned to this contact+session
    // worker_assignments.contact stores full JID (e.g. 6281234567890@s.whatsapp.net)
    const contactPhone = remoteJid.replace(/@.*$/, '')
    const workerRows = db.prepare(`
        SELECT wa.worker_id as user_id FROM worker_assignments wa
        JOIN users u ON u.id = wa.worker_id
        WHERE wa.session_id = ? AND (wa.contact = ? OR wa.contact = ?) AND u.status = 'aktif' AND u.role = 'worker'
    `).all(sessionId, remoteJid, contactPhone) as { user_id: number }[]

    for (const row of workerRows) {
        const sids = getUserSocketIds(row.user_id)
        socketIds.push(...sids)
    }

    return [...new Set(socketIds)] // deduplicate
}

/**
 * Mask phone number for privacy: 6281234567890 → 6281****890
 */
export function maskPhoneNumber(phone: string): string {
    if (!phone || phone.length <= 5) return '***'
    return phone.slice(0, 4) + '****' + phone.slice(-3)
}

// ============================================
// Notification Dispatcher
// ============================================

export class NotificationService {
    private io: SocketIO

    constructor(io: SocketIO) {
        this.io = io
        initFirebase()
    }

    /**
     * Send notification to a specific user
     * Dual-channel: Socket.IO (realtime in-app) + FCM (system push notification)
     * Both channels fire simultaneously so users get push notifs even when tab is in background
     */
    async sendToUser(userId: number, payload: NotificationPayload): Promise<{ channel: string; success: boolean; error?: string }> {
        let socketSent = false
        let fcmSent = false

        // 1. Socket.IO: send if user is online (instant in-app update)
        if (isUserOnline(userId)) {
            const socketIds = getUserSocketIds(userId)
            for (const sid of socketIds) {
                this.io.to(sid).emit('notification', {
                    type: payload.type,
                    title: payload.title,
                    body: payload.body,
                    data: payload.data,
                    timestamp: new Date().toISOString()
                })
            }
            socketSent = true
        }

        // 2. FCM: always try to send push notification (system-level notif for background/closed browser)
        if (fcmInitialized) {
            const tokens = fcmTokenDb.getForUser(userId)
            if (tokens.length > 0) {
                try {
                    const tokenStrings = tokens.map(t => t.token)
                    const message: admin.messaging.MulticastMessage = {
                        tokens: tokenStrings,
                        // Use data-only message to let client/SW control display
                        // This prevents FCM from auto-showing notification when page is focused
                        data: {
                            type: payload.type,
                            title: payload.title,
                            body: payload.body,
                            ...(payload.data || {})
                        },
                        webpush: {
                            notification: {
                                title: payload.title,
                                body: payload.body,
                                icon: '/assets/media/logos/favicon.ico',
                                badge: '/assets/media/logos/favicon.ico',
                                tag: `${payload.type}-${payload.data?.sessionId || ''}-${payload.data?.contactJid || ''}`,
                                requireInteraction: payload.type === 'incoming_message'
                            },
                            fcmOptions: {
                                link: payload.data?.url || '/'
                            }
                        }
                    }

                    const response = await admin.messaging().sendEachForMulticast(message)

                    // Clean up invalid tokens
                    response.responses.forEach((resp, idx) => {
                        if (!resp.success && resp.error) {
                            const code = resp.error.code
                            if (code === 'messaging/invalid-registration-token' ||
                                code === 'messaging/registration-token-not-registered') {
                                fcmTokenDb.remove(tokenStrings[idx])
                                console.log(`🗑️ Removed invalid FCM token for user ${userId}`)
                            }
                        }
                    })

                    fcmSent = response.successCount > 0
                } catch (err: any) {
                    console.error(`❌ FCM send failed for user ${userId}:`, err.message)
                }
            }
        }

        // 3. Record notification
        const channel = socketSent && fcmSent ? 'both' : socketSent ? 'socket' : fcmSent ? 'fcm' : 'none'
        const notifRecord: NotificationEntry = {
            user_id: userId,
            type: payload.type,
            title: payload.title,
            body: payload.body,
            data: payload.data ? JSON.stringify(payload.data) : undefined,
            channel,
            status: (socketSent || fcmSent) ? 'delivered' : 'failed'
        }
        notificationDb.insert(notifRecord)

        return {
            channel,
            success: socketSent || fcmSent,
            error: (!socketSent && !fcmSent) ? 'User offline and no FCM tokens' : undefined
        }
    }

    /**
     * Notify users about an incoming WhatsApp message
     * Applies filtering rules:
     *   - Member: only if session is assigned to them
     *   - Worker: only if contact (remoteJid) is assigned to them
     * Applies phone privacy masking per user's phone_visible setting
     */
    async notifyIncomingMessage(sessionId: string, remoteJid: string, messageContent: string, messageType: string): Promise<void> {
        // Clean phone number from JID (e.g., 6281234567890@s.whatsapp.net → 6281234567890)
        const phoneNumber = remoteJid.replace(/@.*$/, '')

        // 1. Find members assigned to this session (include phone_visible)
        const memberRows = db.prepare(`
            SELECT ms.user_id, u.name, u.role, u.phone_visible FROM member_sessions ms
            JOIN users u ON u.id = ms.user_id
            WHERE ms.session_id = ? AND u.status = 'aktif' AND u.role = 'memberwa'
        `).all(sessionId) as { user_id: number; name: string; role: string; phone_visible: number }[]

        // 2. Find workers assigned to this contact+session
        // worker_assignments.contact stores full JID (e.g. 6281234567890@s.whatsapp.net)
        const workerRows = db.prepare(`
            SELECT wa.worker_id as user_id, u.name, u.role, u.phone_visible FROM worker_assignments wa
            JOIN users u ON u.id = wa.worker_id
            WHERE wa.session_id = ? AND (wa.contact = ? OR wa.contact = ?) AND u.status = 'aktif' AND u.role = 'worker'
        `).all(sessionId, remoteJid, phoneNumber) as { user_id: number; name: string; role: string; phone_visible: number }[]

        const targetUsers = [...memberRows, ...workerRows]

        if (targetUsers.length === 0) return

        // Build notification payload
        const truncatedContent = messageContent.length > 100
            ? messageContent.substring(0, 100) + '...'
            : messageContent

        const displayType = messageType === 'text' ? '' : ` [${messageType}]`

        // Send to each target user with per-user phone masking
        const results = await Promise.allSettled(
            targetUsers.map(user => {
                const displayPhone = user.phone_visible ? phoneNumber : maskPhoneNumber(phoneNumber)
                const payload: NotificationPayload = {
                    type: 'incoming_message',
                    title: `Pesan masuk dari ${displayPhone}`,
                    body: `${truncatedContent}${displayType}`,
                    data: {
                        sessionId,
                        contactJid: remoteJid,
                        phoneNumber: user.phone_visible ? phoneNumber : displayPhone,
                        messageType,
                        url: '/member/dashboard.html'
                    }
                }
                return this.sendToUser(user.user_id, payload)
            })
        )

        const sent = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length
        if (sent > 0) {
            console.log(`🔔 Notified ${sent}/${targetUsers.length} users for message from ${phoneNumber} on session ${sessionId}`)
        }
    }

    /**
     * Notify about session status change (connected/disconnected)
     */
    async notifySessionStatus(sessionId: string, status: 'connected' | 'disconnected'): Promise<void> {
        // Notify members assigned to this session
        const memberRows = db.prepare(`
            SELECT ms.user_id FROM member_sessions ms
            JOIN users u ON u.id = ms.user_id
            WHERE ms.session_id = ? AND u.status = 'aktif' AND u.role IN ('memberwa', 'worker')
        `).all(sessionId) as { user_id: number }[]

        // Also find workers who have assignments on this session
        // worker_assignments.contact stores full JID, match both formats
        const workerRows = db.prepare(`
            SELECT DISTINCT wa.worker_id as user_id FROM worker_assignments wa
            JOIN users u ON u.id = wa.worker_id
            WHERE wa.session_id = ? AND u.status = 'aktif'
        `).all(sessionId) as { user_id: number }[]

        const userIds = new Set([...memberRows, ...workerRows].map(r => r.user_id))

        const emoji = status === 'connected' ? '🟢' : '🔴'
        const payload: NotificationPayload = {
            type: 'session_status',
            title: `Session ${sessionId}`,
            body: `${emoji} Session ${status === 'connected' ? 'terhubung' : 'terputus'}`,
            data: { sessionId, status }
        }

        await Promise.allSettled(
            Array.from(userIds).map(uid => this.sendToUser(uid, payload))
        )
    }

    /**
     * Notify worker about assignment changes
     */
    async notifyAssignmentUpdate(workerId: number, message: string): Promise<void> {
        const payload: NotificationPayload = {
            type: 'assignment_update',
            title: 'Penugasan Diperbarui',
            body: message,
            data: { url: '/member/dashboard.html' }
        }
        await this.sendToUser(workerId, payload)
    }
}
