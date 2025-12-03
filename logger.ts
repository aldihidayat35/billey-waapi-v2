import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { messageLogDb, sessionLogDb, MessageLogEntry, SessionLogEntry } from './database.js'

// Get __dirname equivalent in ES module
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface SessionLog {
	timestamp: string
	sessionId: string
	action: 'login' | 'logout' | 'disconnect' | 'reconnect'
	user?: {
		id: string
		name: string
	}
	status: string
	details?: any
}

export interface MessageLog {
	timestamp: string
	sessionId: string
	direction: 'incoming' | 'outgoing'
	from: string
	to: string
	messageType: string
	content: string
	mediaInfo?: {
		mimetype?: string
		size?: number
		filename?: string
		url?: string
	}
	status: 'sent' | 'received' | 'failed'
	messageId?: string
	source?: 'contact' | 'mobile' | 'ui'
}

/**
 * Format timestamp to ISO string for database storage
 */
export function formatTimestamp(timestamp: string | number | Date): string {
	let date: Date
	
	if (typeof timestamp === 'number') {
		// If timestamp is in seconds (10 digits), convert to ms
		const ts = timestamp < 10000000000 ? timestamp * 1000 : timestamp
		date = new Date(ts)
	} else if (typeof timestamp === 'string') {
		date = new Date(timestamp)
	} else {
		date = timestamp
	}
	
	// Check if date is valid
	if (isNaN(date.getTime())) {
		return new Date().toISOString()
	}
	
	return date.toISOString()
}

/**
 * Format timestamp for display (DD-MM-YYYY HH:mm:ss)
 */
export function formatDisplayTimestamp(timestamp: string | number | Date): string {
	let date: Date
	
	if (typeof timestamp === 'number') {
		const ts = timestamp < 10000000000 ? timestamp * 1000 : timestamp
		date = new Date(ts)
	} else if (typeof timestamp === 'string') {
		date = new Date(timestamp)
	} else {
		date = timestamp
	}
	
	if (isNaN(date.getTime())) {
		return 'Invalid Date'
	}
	
	const day = String(date.getDate()).padStart(2, '0')
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const year = date.getFullYear()
	const hours = String(date.getHours()).padStart(2, '0')
	const minutes = String(date.getMinutes()).padStart(2, '0')
	const seconds = String(date.getSeconds()).padStart(2, '0')
	
	return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`
}

export class Logger {
	private logDir: string
	private sessionLogFile: string
	private messageLogFile: string
	private processedMessageIds: Set<string> = new Set()

	constructor() {
		this.logDir = path.join(__dirname, 'logs')
		this.sessionLogFile = path.join(this.logDir, 'sessions.log')
		this.messageLogFile = path.join(this.logDir, 'messages.log')
		
		// Create logs directory if not exists
		if (!fs.existsSync(this.logDir)) {
			fs.mkdirSync(this.logDir, { recursive: true })
		}
	}

	// Log session activity (to both file and database)
	logSession(log: SessionLog): void {
		const logEntry = {
			...log,
			timestamp: formatTimestamp(log.timestamp || new Date())
		}

		// Log to file (for backward compatibility)
		const logLine = JSON.stringify(logEntry) + '\n'
		fs.appendFileSync(this.sessionLogFile, logLine, 'utf8')
		
		// Log to database
		try {
			sessionLogDb.insert({
				session_id: log.sessionId,
				action: log.action,
				status: log.status,
				user_id: log.user?.id,
				user_name: log.user?.name,
				details: log.details ? JSON.stringify(log.details) : undefined,
				timestamp: logEntry.timestamp
			})
		} catch (error) {
			console.error('❌ Error logging session to database:', error)
		}
		
		// Console log untuk monitoring
		console.log(`📋 [SESSION ${log.action.toUpperCase()}] ${log.sessionId} - ${log.status}`)
		if (log.user) {
			console.log(`   👤 User: ${log.user.name} (${log.user.id})`)
		}
	}

	// Log message activity (to both file and database)
	logMessage(log: MessageLog): void {
		// Prevent duplicate logging using messageId
		if (log.messageId) {
			if (this.processedMessageIds.has(log.messageId)) {
				console.log(`⚠️ Skipping duplicate message: ${log.messageId}`)
				return
			}
			
			// Check database for duplicate
			if (messageLogDb.exists(log.messageId)) {
				console.log(`⚠️ Message already in database: ${log.messageId}`)
				this.processedMessageIds.add(log.messageId)
				return
			}
			
			this.processedMessageIds.add(log.messageId)
			
			// Clean up old message IDs (keep last 1000)
			if (this.processedMessageIds.size > 1000) {
				const idsArray = Array.from(this.processedMessageIds)
				this.processedMessageIds = new Set(idsArray.slice(-500))
			}
		}

		const logEntry = {
			...log,
			timestamp: formatTimestamp(log.timestamp || new Date())
		}

		// Log to file (for backward compatibility)
		const logLine = JSON.stringify(logEntry) + '\n'
		fs.appendFileSync(this.messageLogFile, logLine, 'utf8')
		
		// Log to database
		try {
			// Ensure file_size is a number (might be Long object from protobuf)
			let fileSize: number | undefined = undefined
			if (log.mediaInfo?.size) {
				const size = log.mediaInfo.size as any
				if (typeof size === 'number') {
					fileSize = size
				} else if (typeof size === 'object' && size.low !== undefined) {
					fileSize = size.low
				} else if (typeof size === 'bigint') {
					fileSize = Number(size)
				}
			}
			
			messageLogDb.insert({
				message_id: log.messageId,
				session_id: log.sessionId,
				direction: log.direction,
				from_number: log.from,
				to_number: log.to,
				message_type: log.messageType,
				content: log.content,
				media_url: log.mediaInfo?.url,
				filename: log.mediaInfo?.filename,
				file_size: fileSize,
				mimetype: log.mediaInfo?.mimetype,
				timestamp: logEntry.timestamp,
				status: log.status,
				source: log.source || (log.direction === 'incoming' ? 'contact' : 'ui')
			})
		} catch (error) {
			console.error('❌ Error logging message to database:', error)
		}
		
		// Console log untuk monitoring
		const direction = log.direction === 'incoming' ? '📨' : '📤'
		const typeIcon = this.getMessageTypeIcon(log.messageType)
		const sourceTag = log.source === 'mobile' ? ' [Mobile]' : log.source === 'ui' ? ' [UI]' : ''
		
		console.log(`${direction} [${log.direction.toUpperCase()}]${sourceTag} ${log.sessionId}`)
		console.log(`   ${typeIcon} ${log.messageType}: ${log.from} → ${log.to}`)
		if (log.content) {
			const preview = log.content.length > 50 
				? log.content.substring(0, 50) + '...' 
				: log.content
			console.log(`   💬 "${preview}"`)
		}
		if (log.mediaInfo) {
			console.log(`   📎 ${log.mediaInfo.filename || 'media'} (${this.formatBytes(log.mediaInfo.size || 0)})`)
		}
	}

	// Get session logs from database
	getSessionLogs(limit: number = 100): SessionLogEntry[] {
		return sessionLogDb.getAll(limit)
	}

	// Get message logs from database with filters
	getMessageLogs(options: {
		sessionId?: string
		contactNumber?: string
		direction?: string
		startDate?: string
		endDate?: string
		limit?: number
	} = {}): MessageLogEntry[] {
		return messageLogDb.getAll({
			sessionId: options.sessionId,
			contactNumber: options.contactNumber,
			direction: options.direction,
			startDate: options.startDate,
			endDate: options.endDate,
			limit: options.limit || 100
		})
	}

	// Get chat history for a specific contact
	getChatHistory(sessionId: string, contactNumber: string, limit: number = 100): MessageLogEntry[] {
		return messageLogDb.getChatHistory(sessionId, contactNumber, limit)
	}

	// Get logs by date (from file - for backward compatibility)
	getLogsByDate(date: string, type: 'session' | 'message' = 'message'): any[] {
		const logFile = type === 'session' ? this.sessionLogFile : this.messageLogFile
		
		if (!fs.existsSync(logFile)) {
			return []
		}

		const content = fs.readFileSync(logFile, 'utf8')
		const lines = content.trim().split('\n').filter(line => line.length > 0)
		
		return lines
			.map(line => {
				try {
					return JSON.parse(line)
				} catch {
					return null
				}
			})
			.filter(log => log && log.timestamp && log.timestamp.startsWith(date))
	}

	// Get statistics from database
	getStatistics(sessionId?: string): any {
		const stats = messageLogDb.getStatistics(sessionId)
		const typeStats = messageLogDb.getTypeStatistics(sessionId)
		
		return {
			totalMessages: stats?.total_messages || 0,
			incoming: stats?.incoming || 0,
			outgoing: stats?.outgoing || 0,
			sessions: stats?.sessions || 0,
			contacts: stats?.contacts || 0,
			messageTypes: typeStats.reduce((acc: any, item: any) => {
				acc[item.message_type] = item.count
				return acc
			}, {})
		}
	}

	// Get unique sessions
	getSessions(): string[] {
		return messageLogDb.getSessions()
	}

	// Get contacts for a session
	getContacts(sessionId: string): string[] {
		return messageLogDb.getContacts(sessionId)
	}

	// Get conversations for inbox page
	getConversations(sessionId: string): any[] {
		return messageLogDb.getConversations(sessionId)
	}

	// Get chat messages for inbox page
	getChatMessages(sessionId: string, phone: string): any[] {
		return messageLogDb.getChatHistory(sessionId, phone, 100)
	}

	// Clear old logs (older than days)
	clearOldLogs(days: number = 30): number {
		const deletedCount = messageLogDb.deleteOlderThan(days)
		console.log(`🗑️  Cleared ${deletedCount} logs older than ${days} days`)
		return deletedCount
	}

	private getMessageTypeIcon(type: string): string {
		const icons: Record<string, string> = {
			'text': '💬',
			'image': '📷',
			'video': '🎥',
			'gif': '🎞️',
			'sticker': '🎨',
			'document': '📎',
			'audio': '🎵',
			'voice': '🎤',
			'contact': '👤',
			'location': '📍'
		}
		return icons[type] || '📄'
	}

	private formatBytes(bytes: number): string {
		if (bytes === 0) return '0 Bytes'
		const k = 1024
		const sizes = ['Bytes', 'KB', 'MB', 'GB']
		const i = Math.floor(Math.log(bytes) / Math.log(k))
		return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
	}
}

// Export singleton instance
export const logger = new Logger()
