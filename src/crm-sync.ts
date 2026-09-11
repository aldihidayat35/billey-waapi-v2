/**
 * Compatibility facade for the Billey WA API -> Laravel CRM integration.
 * Business rules and status definitions intentionally remain in Laravel.
 */
import { contactDb } from './database.js'

interface CrmConfig {
	baseUrl: string
	apiToken: string
	enabled: boolean
}

interface ForwardOptions {
	simulate?: boolean
	source?: string
}

export interface CrmForwardResult {
	forwarded: boolean
	success: boolean
	httpStatus?: number
	type?: string
	response?: any
	error?: string
}

export interface OrderStatusPayload {
	order_id: number
	status: string
	nomor_client: string
	message?: string | null
}

function getCrmConfig(): CrmConfig {
	const baseUrl = (process.env.CRM_API_URL || '').replace(/\/+$/, '')
	const apiToken = process.env.CRM_API_TOKEN || ''

	return { baseUrl, apiToken, enabled: Boolean(baseUrl && apiToken) }
}

async function crmFetch(path: string, options: RequestInit = {}): Promise<Response | null> {
	const config = getCrmConfig()
	if (!config.enabled) return null

	try {
		return await fetch(`${config.baseUrl}${path}`, {
			...options,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				Authorization: `Bearer ${config.apiToken}`,
				...((options.headers as Record<string, string>) || {})
			},
			signal: AbortSignal.timeout(15000)
		})
	} catch (error) {
		console.error(`CRM request failed [${path}]:`, (error as Error).message)
		return null
	}
}

/** Generic transport-level detection. Status aliases are owned by Laravel. */
export function isCrmCommand(message: string): boolean {
	return /^\s*[*#@][\p{L}\p{N}_-]+/mu.test(message)
}

export function getCrmIntegrationStatus(): { enabled: boolean; baseUrl: string } {
	const config = getCrmConfig()
	return { enabled: config.enabled, baseUrl: config.baseUrl }
}

export async function getCrmCommands(): Promise<CrmForwardResult> {
	const response = await crmFetch('/automation/commands')
	if (!response) {
		return { forwarded: false, success: false, error: 'Laravel CRM tidak dapat dihubungi.' }
	}

	const data = await response.json().catch(() => ({}))
	return {
		forwarded: true,
		success: response.ok,
		httpStatus: response.status,
		response: data,
		error: response.ok ? undefined : data.message || 'Gagal mengambil konfigurasi command.'
	}
}

export async function forwardMessageToCrm(
	message: string,
	senderPhone: string,
	sessionId: string,
	options: ForwardOptions = {}
): Promise<CrmForwardResult> {
	if (!isCrmCommand(message)) {
		return { forwarded: false, success: false, error: 'Pesan bukan command integrasi.' }
	}

	const response = await crmFetch('/automation/process-message', {
		method: 'POST',
		body: JSON.stringify({
			message,
			sender: senderPhone,
			source: options.source || 'whatsapp',
			session_id: sessionId,
			simulate: options.simulate || false
		})
	})

	if (!response) {
		return { forwarded: false, success: false, error: 'Laravel CRM tidak dapat dihubungi.' }
	}

	const data = await response.json().catch(() => ({}))
	return {
		forwarded: true,
		success: response.ok,
		httpStatus: response.status,
		type: data.type,
		response: data,
		error: response.ok ? undefined : data.message || data.error || `Laravel merespons HTTP ${response.status}.`
	}
}

export async function syncNewContact(sessionId: string, phoneNumber: string, pushName?: string): Promise<boolean> {
	const isNew = contactDb.upsert(sessionId, phoneNumber, pushName)
	if (!isNew) return true

	const response = await crmFetch('/sync/webhook/contact-chat', {
		method: 'POST',
		body: JSON.stringify({ nomor_wa: phoneNumber, push_name: pushName || null, session_id: sessionId })
	})

	if (response?.ok) {
		const contact = contactDb.getUnsyncedContacts(1)[0]
		if (contact?.id) contactDb.markSynced([contact.id])
		return true
	}

	console.warn(`Contact sync queued for retry: ${phoneNumber}`)
	return false
}

export async function syncPendingContacts(): Promise<number> {
	let synced = 0
	for (const contact of contactDb.getUnsyncedContacts(50)) {
		const response = await crmFetch('/sync/webhook/contact-chat', {
			method: 'POST',
			body: JSON.stringify({
				nomor_wa: contact.phone_number,
				push_name: contact.push_name || null,
				session_id: contact.session_id
			})
		})
		if (response?.ok && contact.id) {
			contactDb.markSynced([contact.id])
			synced++
		}
	}
	return synced
}

export async function notifyWorkerChanged(
	action: 'created' | 'updated' | 'deleted',
	user: { id: number; name: string; email: string; role: string; status?: string; phone?: string }
): Promise<boolean> {
	if (user.role !== 'worker') return true
	const response = await crmFetch('/sync/webhook/worker-changed', {
		method: 'POST',
		body: JSON.stringify({ action, user })
	})
	return Boolean(response?.ok)
}

export function handleOrderStatusWebhook(payload: OrderStatusPayload): {
	success: boolean
	sendMessage: { to: string; message: string }
} {
	return {
		success: true,
		sendMessage: {
			to: payload.nomor_client,
			message: payload.message || `Status order #${payload.order_id}: ${payload.status}`
		}
	}
}

export default {
	forwardMessageToCrm,
	getCrmCommands,
	getCrmIntegrationStatus,
	handleOrderStatusWebhook,
	isCrmCommand,
	notifyWorkerChanged,
	syncNewContact,
	syncPendingContacts
}
