/**
 * Compatibility facade for the Billey WA API -> Laravel CRM integration.
 * Supports multiple CRM connections mapped to WhatsApp sessions.
 * Business rules and status definitions intentionally remain in Laravel.
 */
import { contactDb, crmConnectionDb } from './database.js'
import type { CrmConnection } from './database.js'

interface CrmConfig {
	baseUrl: string
	apiToken: string
	enabled: boolean
}

interface ForwardOptions {
	simulate?: boolean
	source?: string
	connectionId?: number
}

export interface CrmForwardResult {
	forwarded: boolean
	success: boolean
	httpStatus?: number
	type?: string
	response?: any
	error?: string
	connectionName?: string
}

export interface OrderStatusPayload {
	order_id: number
	status: string
	nomor_client: string
	message?: string | null
}

function getEnvCrmConfig(): CrmConfig {
	const baseUrl = (process.env.CRM_API_URL || '').replace(/\/+$/, '')
	const apiToken = process.env.CRM_API_TOKEN || ''
	return { baseUrl, apiToken, enabled: Boolean(baseUrl && apiToken) }
}

async function fetchEndpoint(baseUrl: string, apiToken: string, path: string, options: RequestInit = {}): Promise<Response | null> {
	const cleanUrl = baseUrl.replace(/\/+$/, '')
	try {
		return await fetch(`${cleanUrl}${path}`, {
			...options,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiToken}`,
				...((options.headers as Record<string, string>) || {})
			},
			signal: AbortSignal.timeout(15000)
		})
	} catch (error) {
		console.error(`CRM request failed [${cleanUrl}${path}]:`, (error as Error).message)
		return null
	}
}

/** Generic transport-level detection. Status aliases are owned by Laravel. */
export function isCrmCommand(message: string): boolean {
	return /^\s*[*#@][\p{L}\p{N}_-]+/mu.test(message)
}

export function getCrmIntegrationStatus(connectionId?: number): { enabled: boolean; baseUrl: string; name?: string; count: number } {
	const all = crmConnectionDb.getActive()
	if (connectionId) {
		const target = crmConnectionDb.getById(connectionId)
		if (target) {
			return { enabled: target.is_active === 1, baseUrl: target.base_url, name: target.name, count: all.length }
		}
	}
	if (all.length > 0) {
		return { enabled: true, baseUrl: all[0].base_url, name: all[0].name, count: all.length }
	}
	const env = getEnvCrmConfig()
	return { enabled: env.enabled, baseUrl: env.baseUrl, name: 'Default (.env)', count: env.enabled ? 1 : 0 }
}

/** Test connectivity and API token for a CRM endpoint */
export async function testCrmConnection(baseUrl: string, apiToken: string): Promise<{ success: boolean; message: string; httpStatus?: number; data?: any }> {
	if (!baseUrl || !apiToken) {
		return { success: false, message: 'Base URL dan API Token wajib diisi.' }
	}
	const response = await fetchEndpoint(baseUrl, apiToken, '/automation/commands')
	if (!response) {
		return { success: false, message: 'Laravel CRM tidak dapat dihubungi (koneksi timeout / server offline).' }
	}
	const data = await response.json().catch(() => ({}))
	if (!response.ok) {
		return {
			success: false,
			httpStatus: response.status,
			message: data.message || `Server CRM merespons HTTP ${response.status}. Periksa kembali token API.`
		}
	}
	return {
		success: true,
		httpStatus: response.status,
		message: 'Koneksi berhasil terhubung ke Laravel CRM!',
		data
	}
}

export async function getCrmCommands(connectionId?: number): Promise<CrmForwardResult> {
	let targetConn: CrmConnection | null = null
	if (connectionId) {
		targetConn = crmConnectionDb.getById(connectionId)
	} else {
		const active = crmConnectionDb.getActive()
		if (active.length > 0) targetConn = active[0]
	}

	let baseUrl: string
	let apiToken: string
	if (targetConn) {
		baseUrl = targetConn.base_url
		apiToken = targetConn.api_token
	} else {
		const env = getEnvCrmConfig()
		if (!env.enabled) {
			return { forwarded: false, success: false, error: 'Tidak ada koneksi CRM yang aktif.' }
		}
		baseUrl = env.baseUrl
		apiToken = env.apiToken
	}

	const response = await fetchEndpoint(baseUrl, apiToken, '/automation/commands')
	if (!response) {
		return { forwarded: false, success: false, error: 'Laravel CRM tidak dapat dihubungi.' }
	}

	const data = await response.json().catch(() => ({}))
	return {
		forwarded: true,
		success: response.ok,
		httpStatus: response.status,
		response: data,
		connectionName: targetConn?.name || 'Default CRM',
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

	// 1. If connectionId explicitly given (e.g. from simulator)
	let targets: CrmConnection[] = []
	if (options.connectionId) {
		const specific = crmConnectionDb.getById(options.connectionId)
		if (specific && specific.is_active === 1) targets = [specific]
	} else {
		// 2. Resolve connections mapped to this sessionId with sync_orders = 1
		targets = crmConnectionDb.getForSession(sessionId, 'orders')
	}

	// Fallback to .env if no DB connections matched
	if (targets.length === 0) {
		const env = getEnvCrmConfig()
		if (env.enabled) {
			targets = [{
				id: 0,
				name: 'Default CRM (.env)',
				base_url: env.baseUrl,
				api_token: env.apiToken,
				is_active: 1,
				all_sessions: 1,
				sync_orders: 1,
				sync_contacts: 1,
				sync_workers: 1
			}]
		}
	}

	if (targets.length === 0) {
		return { forwarded: false, success: false, error: 'Tidak ada koneksi CRM aktif yang terhubung ke sesi WhatsApp ini.' }
	}

	// Forward to the first matching target connection (or primary)
	const conn = targets[0]
	const response = await fetchEndpoint(conn.base_url, conn.api_token, '/automation/process-message', {
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
		return { forwarded: false, success: false, connectionName: conn.name, error: `Laravel CRM "${conn.name}" tidak dapat dihubungi.` }
	}

	const data = await response.json().catch(() => ({}))
	return {
		forwarded: true,
		success: response.ok,
		httpStatus: response.status,
		type: data.type,
		response: data,
		connectionName: conn.name,
		error: response.ok ? undefined : data.message || data.error || `Laravel merespons HTTP ${response.status}.`
	}
}

export async function syncNewContact(sessionId: string, phoneNumber: string, pushName?: string): Promise<boolean> {
	const isNew = contactDb.upsert(sessionId, phoneNumber, pushName)
	if (!isNew) return true

	let targets = crmConnectionDb.getForSession(sessionId, 'contacts')
	if (targets.length === 0) {
		const env = getEnvCrmConfig()
		if (env.enabled) {
			targets = [{
				id: 0, name: 'Default (.env)', base_url: env.baseUrl, api_token: env.apiToken,
				is_active: 1, all_sessions: 1, sync_orders: 1, sync_contacts: 1, sync_workers: 1
			}]
		}
	}

	let anySuccess = false
	for (const conn of targets) {
		try {
			const response = await fetchEndpoint(conn.base_url, conn.api_token, '/sync/webhook/contact-chat', {
				method: 'POST',
				body: JSON.stringify({ nomor_wa: phoneNumber, push_name: pushName || null, session_id: sessionId })
			})
			if (response?.ok) anySuccess = true
		} catch (err) {
			console.error(`Contact sync error to ${conn.name}:`, err)
		}
	}

	if (anySuccess) {
		const contact = contactDb.getUnsyncedContacts(1)[0]
		if (contact?.id) contactDb.markSynced([contact.id])
		return true
	}

	console.warn(`Contact sync queued for retry: ${phoneNumber}`)
	return false
}

export async function syncPendingContacts(): Promise<number> {
	let synced = 0
	const pending = contactDb.getUnsyncedContacts(50)
	if (pending.length === 0) return 0

	for (const contact of pending) {
		let targets = crmConnectionDb.getForSession(contact.session_id, 'contacts')
		if (targets.length === 0) {
			const env = getEnvCrmConfig()
			if (env.enabled) {
				targets = [{
					id: 0, name: 'Default (.env)', base_url: env.baseUrl, api_token: env.apiToken,
					is_active: 1, all_sessions: 1, sync_orders: 1, sync_contacts: 1, sync_workers: 1
				}]
			}
		}

		let anySuccess = false
		for (const conn of targets) {
			const response = await fetchEndpoint(conn.base_url, conn.api_token, '/sync/webhook/contact-chat', {
				method: 'POST',
				body: JSON.stringify({
					nomor_wa: contact.phone_number,
					push_name: contact.push_name || null,
					session_id: contact.session_id
				})
			})
			if (response?.ok) anySuccess = true
		}

		if (anySuccess && contact.id) {
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

	let targets = crmConnectionDb.getActive().filter(c => c.sync_workers === 1)
	if (targets.length === 0) {
		const env = getEnvCrmConfig()
		if (env.enabled) {
			targets = [{
				id: 0, name: 'Default (.env)', base_url: env.baseUrl, api_token: env.apiToken,
				is_active: 1, all_sessions: 1, sync_orders: 1, sync_contacts: 1, sync_workers: 1
			}]
		}
	}

	let anySuccess = false
	for (const conn of targets) {
		try {
			const response = await fetchEndpoint(conn.base_url, conn.api_token, '/sync/webhook/worker-changed', {
				method: 'POST',
				body: JSON.stringify({ action, user })
			})
			if (response?.ok) anySuccess = true
		} catch (err) {
			console.error(`Worker notify error to ${conn.name}:`, err)
		}
	}
	return anySuccess
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
	syncPendingContacts,
	testCrmConnection
}

