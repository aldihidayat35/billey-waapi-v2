/**
 * CRM Sync Module — Billey WA API ↔ Jokiin CRM
 *
 * Handles bi-directional sync:
 * - Worker changes → notify Jokiin CRM
 * - New contacts → notify Jokiin CRM (1x saat awal chat)
 * - Order status changes ← receive from Jokiin CRM
 */

import { contactDb } from './database.js'

// ═══════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════

interface CrmConfig {
    baseUrl: string     // e.g. http://localhost:8000/api
    apiToken: string    // AUTOMATION_API_TOKEN dari Jokiin
    enabled: boolean
}

function getCrmConfig(): CrmConfig {
    const baseUrl = process.env.CRM_API_URL || ''
    const apiToken = process.env.CRM_API_TOKEN || ''
    return {
        baseUrl: baseUrl.replace(/\/+$/, ''),
        apiToken,
        enabled: !!(baseUrl && apiToken),
    }
}

async function crmFetch(path: string, options: RequestInit = {}): Promise<Response | null> {
    const config = getCrmConfig()
    if (!config.enabled) return null

    const url = `${config.baseUrl}${path}`
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${config.apiToken}`,
        ...(options.headers as Record<string, string> || {}),
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers,
            signal: AbortSignal.timeout(15000),
        })
        return response
    } catch (error) {
        console.error(`❌ CRM sync failed [${path}]:`, (error as Error).message)
        return null
    }
}

// ═══════════════════════════════════════════════════════════════
//  WORKER SYNC (WA API → Jokiin)
// ═══════════════════════════════════════════════════════════════

export async function notifyWorkerChanged(action: 'created' | 'updated' | 'deleted', user: {
    id: number
    name: string
    email: string
    role: string
    status?: string
    phone?: string
}): Promise<boolean> {
    if (user.role !== 'worker') return true // skip non-workers

    const response = await crmFetch('/sync/webhook/worker-changed', {
        method: 'POST',
        body: JSON.stringify({ action, user }),
    })

    if (response?.ok) {
        console.log(`✅ Worker sync to CRM: ${action} ${user.name}`)
        return true
    }

    console.error(`❌ Worker sync failed: ${response?.status} ${response?.statusText}`)
    return false
}

// ═══════════════════════════════════════════════════════════════
//  CONTACT SYNC (WA API → Jokiin)
//  Hanya 1x saat pertama kali chat (bukan setiap pesan)
// ═══════════════════════════════════════════════════════════════

export async function syncNewContact(sessionId: string, phoneNumber: string, pushName?: string): Promise<boolean> {
    // Upsert ke local DB dan cek apakah ini contact baru
    const isNew = contactDb.upsert(sessionId, phoneNumber, pushName)

    if (!isNew) return true // sudah ada, skip sync

    // Notify CRM tentang contact baru
    const response = await crmFetch('/sync/webhook/contact-chat', {
        method: 'POST',
        body: JSON.stringify({
            nomor_wa: phoneNumber,
            push_name: pushName || null,
            session_id: sessionId,
        }),
    })

    if (response?.ok) {
        // Mark as synced
        const contacts = contactDb.getUnsyncedContacts(1)
        if (contacts.length > 0 && contacts[0].id) {
            contactDb.markSynced([contacts[0].id])
        }
        console.log(`✅ New contact synced to CRM: ${phoneNumber}`)
        return true
    }

    console.log(`⚠️ Contact sync queued (CRM unreachable): ${phoneNumber}`)
    return false
}

// ═══════════════════════════════════════════════════════════════
//  BATCH SYNC (retry unsynced contacts)
// ═══════════════════════════════════════════════════════════════

export async function syncPendingContacts(): Promise<number> {
    const unsynced = contactDb.getUnsyncedContacts(50)
    let synced = 0

    for (const contact of unsynced) {
        const response = await crmFetch('/sync/webhook/contact-chat', {
            method: 'POST',
            body: JSON.stringify({
                nomor_wa: contact.phone_number,
                push_name: contact.push_name || null,
                session_id: contact.session_id,
            }),
        })

        if (response?.ok && contact.id) {
            contactDb.markSynced([contact.id])
            synced++
        }
    }

    if (synced > 0) {
        console.log(`✅ Batch synced ${synced} contacts to CRM`)
    }

    return synced
}

// ═══════════════════════════════════════════════════════════════
//  ORDER STATUS (receive from CRM via webhook)
// ═══════════════════════════════════════════════════════════════

export interface OrderStatusPayload {
    order_id: number
    status: string
    nomor_client: string
}

// ═══════════════════════════════════════════════════════════════
//  ORDER PROCESSING (WA message → Jokiin CRM)
//  Forward pesan masuk yang mengandung command ke CRM untuk diproses
// ═══════════════════════════════════════════════════════════════

/** Pola command yang perlu diteruskan ke CRM untuk diproses */
const ORDER_COMMAND_PATTERN = /^[*#@](proses|cancel|cencel|selesai|revisi|payment|pembayaran|pay)\b/im

export async function forwardMessageToCrm(
    message: string,
    senderPhone: string,
    sessionId: string,
): Promise<{ success: boolean; type?: string; response?: any }> {
    if (!ORDER_COMMAND_PATTERN.test(message)) {
        return { success: false }
    }

    const response = await crmFetch('/automation/process-message', {
        method: 'POST',
        body: JSON.stringify({
            message,
            sender: senderPhone,
            source: 'whatsapp',
            session_id: sessionId,
        }),
    })

    if (!response) {
        console.warn(`⚠️ CRM unreachable, could not process order message from ${senderPhone}`)
        return { success: false }
    }

    const data = await response.json().catch(() => ({}))

    if (response.ok) {
        console.log(`✅ CRM order processed [${data.type}] from ${senderPhone}`)
    } else {
        console.warn(`⚠️ CRM order processing failed [${response.status}]: ${data.message || ''}`)
    }

    return { success: response.ok, type: data.type, response: data }
}

// This will be called from web-server.ts route handler
export function handleOrderStatusWebhook(payload: OrderStatusPayload): {
    success: boolean
    sendMessage?: { to: string; message: string }
} {
    const statusMessages: Record<string, string> = {
        'proses': '🔄 Pesanan Anda sedang diproses.',
        'cancel': '❌ Pesanan Anda telah dibatalkan.',
        'payment': '💳 Silakan lakukan pembayaran/pelunasan sesuai kesepakatan.',
        'selesai': '✅ Terima kasih sudah order, ditunggu order selanjutnya!',
        'revisi': '✏️ Pesanan Anda sedang dalam revisi.',
    }

    const message = statusMessages[payload.status] || `📌 Status pesanan: ${payload.status}`

    return {
        success: true,
        sendMessage: {
            to: payload.nomor_client,
            message,
        },
    }
}

export default {
    notifyWorkerChanged,
    syncNewContact,
    syncPendingContacts,
    forwardMessageToCrm,
    handleOrderStatusWebhook,
}
