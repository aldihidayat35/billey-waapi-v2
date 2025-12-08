import { Boom } from '@hapi/boom'
import P from 'pino'
import makeWASocket, {
	DisconnectReason,
	fetchLatestBaileysVersion,
	useMultiFileAuthState,
	makeCacheableSignalKeyStore,
	WASocket,
	AnyMessageContent,
	downloadMediaMessage
} from './src'
import { logger as activityLogger } from './logger'
import { messageLogDb, chatTemplateDb, autoReplyDb, autoReplyLogDb, autoReplyCooldownDb, db } from './database.js'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

const pinoLogger = P({ level: 'silent' })

// Track messages sent from UI to prevent duplicate display
const uiSentMessages: Set<string> = new Set()

// Cache for LID to phone mappings per session
const lidMappingCache: Map<string, Map<string, string>> = new Map()

export interface Session {
	id: string
	sock: WASocket | null
	qrCode: string | null
	isConnected: boolean
	user: any
	type: 'qr' | 'pairing'
	phoneNumber?: string
	createdAt: Date
}

export class SessionManager {
	private sessions: Map<string, Session> = new Map()
	private socketIO: any

	constructor(io: any) {
		this.socketIO = io
	}

	/**
	 * Load all LID mappings from auth folder into cache
	 */
	private loadLidMappings(sessionId: string): Map<string, string> {
		// Check cache first
		if (lidMappingCache.has(sessionId)) {
			return lidMappingCache.get(sessionId)!
		}

		const mappings = new Map<string, string>()
		const authFolder = `./baileys_auth_info_${sessionId}`

		try {
			if (!existsSync(authFolder)) {
				console.log(`⚠️ Auth folder not found: ${authFolder}`)
				return mappings
			}

			const files = readdirSync(authFolder)
			
			// Load all reverse mapping files (lid -> phone)
			files.filter(f => f.startsWith('lid-mapping-') && f.endsWith('_reverse.json')).forEach(file => {
				try {
					const lidNumber = file.replace('lid-mapping-', '').replace('_reverse.json', '')
					const filePath = join(authFolder, file)
					const phoneNumber = JSON.parse(readFileSync(filePath, 'utf-8'))
					
					// Store both @lid and raw LID as keys
					mappings.set(`${lidNumber}@lid`, `${phoneNumber}@s.whatsapp.net`)
					mappings.set(lidNumber, phoneNumber)
					
					console.log(`📱 LID mapping loaded: ${lidNumber} → ${phoneNumber}`)
				} catch (e) {
					console.error(`Error loading mapping from ${file}:`, e)
				}
			})

			// Also load regular mappings (phone -> lid) for reverse lookup
			files.filter(f => f.startsWith('lid-mapping-') && !f.endsWith('_reverse.json')).forEach(file => {
				try {
					const phoneNumber = file.replace('lid-mapping-', '').replace('.json', '')
					const filePath = join(authFolder, file)
					const lidNumber = JSON.parse(readFileSync(filePath, 'utf-8'))
					
					// Store phone -> lid mapping (useful for looking up from phone)
					if (!mappings.has(`${lidNumber}@lid`)) {
						mappings.set(`${lidNumber}@lid`, `${phoneNumber}@s.whatsapp.net`)
						mappings.set(lidNumber, phoneNumber)
					}
				} catch (e) {
					console.error(`Error loading mapping from ${file}:`, e)
				}
			})

			console.log(`✅ Loaded ${mappings.size / 2} LID mappings for session ${sessionId}`)
			lidMappingCache.set(sessionId, mappings)
		} catch (error) {
			console.error('Error loading LID mappings:', error)
		}

		return mappings
	}

	/**
	 * Resolve LID (Lidded Identity) to actual phone number using mapping cache
	 * LID format: 271455086481513@lid → 6289529537100@s.whatsapp.net
	 */
	private resolveLidToPhone(sessionId: string, lidJid: string): string {
		// If not a LID, return as-is
		if (!lidJid.includes('@lid')) {
			return lidJid
		}

		try {
			const mappings = this.loadLidMappings(sessionId)
			
			// Try to find in cache
			if (mappings.has(lidJid)) {
				const resolved = mappings.get(lidJid)!
				return resolved
			}

			// Fallback: try individual file lookup
			const lidNumber = lidJid.replace('@lid', '').replace(/[^0-9]/g, '')
			const authFolder = `./baileys_auth_info_${sessionId}`
			const reverseMappingFile = join(authFolder, `lid-mapping-${lidNumber}_reverse.json`)
			
			if (existsSync(reverseMappingFile)) {
				const phoneNumber = JSON.parse(readFileSync(reverseMappingFile, 'utf-8'))
				const actualJid = `${phoneNumber}@s.whatsapp.net`
				
				// Add to cache
				mappings.set(lidJid, actualJid)
				return actualJid
			}
			
			// Final fallback: return the LID as-is (don't convert to @s.whatsapp.net)
			return lidJid
		} catch (error) {
			return lidJid
		}
	}

	/**
	 * Resolve LID using socket's signalRepository (async version)
	 * This can query WhatsApp servers for unknown LID mappings
	 */
	private async resolveLidToPhoneAsync(sessionId: string, lidJid: string): Promise<string> {
		// If not a LID, return as-is
		if (!lidJid.includes('@lid')) {
			return lidJid
		}

		// First try sync resolution from cache/files
		const syncResult = this.resolveLidToPhone(sessionId, lidJid)
		if (!syncResult.includes('@lid')) {
			return syncResult
		}

		// Try using socket's signalRepository
		try {
			const session = this.getSession(sessionId)
			if (session?.sock && 'signalRepository' in session.sock) {
				const signalRepo = (session.sock as any).signalRepository
				if (signalRepo?.lidMapping) {
					const pnJid = await signalRepo.lidMapping.getPNForLID(lidJid)
					if (pnJid) {
						console.log(`✅ LID resolved via signalRepository: ${lidJid} → ${pnJid}`)
						// Cache the result
						const mappings = this.loadLidMappings(sessionId)
						mappings.set(lidJid, pnJid)
						return pnJid
					}
				}
			}
		} catch (error) {
			console.log(`⚠️ signalRepository LID resolution failed for ${lidJid}`)
		}

		return lidJid
	}

	/**
	 * Resolve multiple LIDs in batch (more efficient)
	 */
	private async resolveLidsInBatch(sessionId: string, jids: string[]): Promise<Map<string, string>> {
		const results = new Map<string, string>()
		const unresolved: string[] = []

		// First pass: resolve from cache/files
		for (const jid of jids) {
			if (!jid.includes('@lid')) {
				results.set(jid, jid)
			} else {
				const resolved = this.resolveLidToPhone(sessionId, jid)
				if (!resolved.includes('@lid')) {
					results.set(jid, resolved)
				} else {
					unresolved.push(jid)
				}
			}
		}

		// Second pass: try signalRepository for unresolved LIDs
		if (unresolved.length > 0) {
			try {
				const session = this.getSession(sessionId)
				if (session?.sock && 'signalRepository' in session.sock) {
					const signalRepo = (session.sock as any).signalRepository
					if (signalRepo?.lidMapping) {
						for (const lid of unresolved) {
							try {
								const pnJid = await signalRepo.lidMapping.getPNForLID(lid)
								if (pnJid && !pnJid.includes('@lid')) {
									results.set(lid, pnJid)
									// Cache the result
									const mappings = this.loadLidMappings(sessionId)
									mappings.set(lid, pnJid)
								} else {
									results.set(lid, lid) // Keep original if not resolved
								}
							} catch {
								results.set(lid, lid)
							}
						}
					}
				}
			} catch (error) {
				// If signalRepository fails, keep original LIDs
				for (const lid of unresolved) {
					if (!results.has(lid)) {
						results.set(lid, lid)
					}
				}
			}
		}

		return results
	}

	/**
	 * Resolve participant JID - handles both LID and regular JIDs
	 */
	private resolveParticipantJid(sessionId: string, jid: string): string {
		if (jid.includes('@lid')) {
			return this.resolveLidToPhone(sessionId, jid)
		}
		return jid
	}

	createSession(sessionId: string): Session {
		if (this.sessions.has(sessionId)) {
			return this.sessions.get(sessionId)!
		}

		const session: Session = {
			id: sessionId,
			sock: null,
			qrCode: null,
			isConnected: false,
			user: null,
			type: 'qr',
			createdAt: new Date()
		}

		this.sessions.set(sessionId, session)
		return session
	}

	getSession(sessionId: string): Session | undefined {
		return this.sessions.get(sessionId)
	}

	getSessionInfo(sessionId: string): { id: string, name: string, phoneNumber: string, status: string } | null {
		const session = this.sessions.get(sessionId)
		if (!session) return null
		
		return {
			id: session.id,
			name: session.user?.name || session.id,
			phoneNumber: session.phoneNumber || session.user?.id?.replace(/:.+/, '') || '-',
			status: session.isConnected ? 'connected' : 'disconnected'
		}
	}

	getAllSessions(): Session[] {
		return Array.from(this.sessions.values()).map(s => ({
			id: s.id,
			isConnected: s.isConnected,
			user: s.user,
			type: s.type,
			phoneNumber: s.phoneNumber,
			createdAt: s.createdAt,
			sock: null,
			qrCode: null
		}))
	}

	async deleteSession(sessionId: string): Promise<void> {
		const session = this.sessions.get(sessionId)
		if (session) {
			if (session.sock) {
				try {
					await session.sock.logout()
				} catch (error) {
					console.error('Error logging out session:', error)
				}
			}
			this.sessions.delete(sessionId)
		}
	}

	async startSession(
		sessionId: string,
		type: 'qr' | 'pairing',
		phoneNumber?: string
	): Promise<void> {
		console.log(`🔄 startSession called: ${sessionId}, type: ${type}`)
		
		let session = this.getSession(sessionId)
		
		if (!session) {
			console.log(`📝 Creating new session object for: ${sessionId}`)
			session = this.createSession(sessionId)
		} else {
			console.log(`📋 Session object exists: ${sessionId}, isConnected: ${session.isConnected}, hasSock: ${!!session.sock}`)
		}

		if (session.isConnected) {
			console.log(`⚠️ Session ${sessionId} already connected`)
			throw new Error('Session already connected')
		}

		if (session.sock) {
			console.log(`⚠️ Session ${sessionId} already has sock, closing it first...`)
			// Instead of throwing error, close existing connection and restart
			try {
				session.sock.end(undefined)
			} catch (e) {
				console.log('Error closing sock:', e)
			}
			session.sock = null
			// Wait a moment before proceeding
			await new Promise(resolve => setTimeout(resolve, 500))
		}

		session.type = type
		session.phoneNumber = phoneNumber

		const authFolder = `baileys_auth_info_${sessionId}`
		console.log(`📁 Using auth folder: ${authFolder}`)
		
		const { state, saveCreds } = await useMultiFileAuthState(authFolder)
		const { version } = await fetchLatestBaileysVersion()
		console.log(`📦 Baileys version: ${version.join('.')}`)

		const sock = makeWASocket({
			version,
			logger: pinoLogger,
			printQRInTerminal: type === 'qr',
			auth: {
				creds: state.creds,
				keys: makeCacheableSignalKeyStore(state.keys, pinoLogger),
			},
			browser: [`WhatsApp Web ${sessionId}`, 'Chrome', '1.0.0'],
			getMessage: async () => undefined
		})

		session.sock = sock

		// Handle connection updates
		sock.ev.on('connection.update', async (update) => {
			const { connection, lastDisconnect, qr } = update
			console.log(`🔔 Connection update for ${sessionId}:`, { connection, hasQR: !!qr })

			if (qr && type === 'qr') {
				session.qrCode = qr
				console.log(`📱 QR Code generated for session ${sessionId}, length: ${qr.length}`)
				this.socketIO.emit('qr', { sessionId, qr })
				console.log(`📤 QR event emitted for ${sessionId}`)
			}

			if (connection === 'close') {
				const shouldReconnect = 
					(lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
				
				session.sock = null
				session.isConnected = false
				session.qrCode = null

				if (shouldReconnect) {
					console.log(`Session ${sessionId} closed, reconnecting...`)
					this.socketIO.emit('session-status', {
						sessionId,
						status: 'reconnecting'
					})
					setTimeout(() => this.startSession(sessionId, type, phoneNumber), 3000)
				} else {
					console.log(`Session ${sessionId} logged out`)
					
					// Log logout
					activityLogger.logSession({
						timestamp: new Date().toISOString(),
						sessionId,
						action: 'logout',
						status: 'disconnected',
						user: session.user
					})
					
					this.socketIO.emit('session-status', {
						sessionId,
						status: 'disconnected',
						isConnected: false
					})
				}
			} else if (connection === 'open') {
				session.isConnected = true
				session.qrCode = null
				session.user = sock.user
				console.log(`Session ${sessionId} connected!`)
				
				// Log successful login
				activityLogger.logSession({
					timestamp: new Date().toISOString(),
					sessionId,
					action: 'login',
					status: 'connected',
					user: sock.user ? {
						id: sock.user.id || '',
						name: sock.user.name || sock.user.id?.split(':')[0] || 'Unknown'
					} : undefined,
					details: {
						type,
						phoneNumber,
						connectedAt: new Date().toISOString()
					}
				})
				
				this.socketIO.emit('session-status', {
					sessionId,
					status: 'connected',
					isConnected: true,
					user: sock.user
				})
			}
		})

		// Save credentials
		sock.ev.on('creds.update', saveCreds)

		// Handle incoming messages
		sock.ev.on('messages.upsert', async ({ messages }) => {
			for (const msg of messages) {
				if (msg.message) {
					// Convert timestamp to milliseconds (WhatsApp sends in seconds)
					let timestamp = Date.now()
					if (msg.messageTimestamp) {
						if (typeof msg.messageTimestamp === 'number') {
							// If timestamp is in seconds (10 digits), convert to ms
							timestamp = msg.messageTimestamp < 10000000000 
								? msg.messageTimestamp * 1000 
								: msg.messageTimestamp
						} else if (msg.messageTimestamp.low) {
							// Handle Long type timestamp
							timestamp = msg.messageTimestamp.low * 1000
						}
					}
					
					// Extract message info for logging
					const fromMe = msg.key.fromMe || false
					let remoteJid = msg.key.remoteJid || ''
					
					// Handle LID (Lidded Identity) - resolve to actual phone number
					// LID is used for privacy but we need the actual phone JID for UI
					if (remoteJid.includes('@lid')) {
						remoteJid = this.resolveLidToPhone(sessionId, remoteJid)
					}
					
					const messageType = this.getMessageType(msg.message)
					const messageContent = this.getMessageContent(msg.message)
					const mediaInfo = this.getMediaInfo(msg.message)
					const messageId = msg.key.id || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
					
					// Skip if this message was sent from UI (already saved)
					if (fromMe && uiSentMessages.has(messageId)) {
						console.log(`⏭️ Skipping UI-sent message: ${messageId}`)
						uiSentMessages.delete(messageId) // Clean up
						continue
					}
					
					// Determine source
					const source = fromMe ? 'mobile' : 'contact'
					
					// Check if message from mobile contains template codes (#CODE pattern)
					if (fromMe && messageType === 'text' && messageContent.includes('#')) {
						// Detect all template codes in the message
						const templatePattern = /#([A-Za-z0-9_]+)/g
						const foundCodes: string[] = []
						let match
						
						while ((match = templatePattern.exec(messageContent)) !== null) {
							foundCodes.push(match[1].toUpperCase())
						}
						
						// Remove duplicates
						const uniqueCodes = [...new Set(foundCodes)]
						
						if (uniqueCodes.length > 0) {
							console.log(`📱📝 Template codes from mobile detected: ${uniqueCodes.join(', ')}`)
							
							const notFoundCodes: string[] = []
							
							// Process each template code
							for (const templateCode of uniqueCodes) {
								const template = chatTemplateDb.getByCode(templateCode)
								
								if (template) {
									console.log(`✅ Template found: ${template.code} - "${template.title || 'No title'}"`)
									
									// Small delay between messages
									await new Promise(resolve => setTimeout(resolve, 500))
									
									// Send template content (with or without media)
									if (template.media_data) {
										// Send image with caption
										try {
											const mediaBuffer = Buffer.from(template.media_data, 'base64')
											const messageContentToSend: AnyMessageContent = {
												image: mediaBuffer,
												caption: template.content,
												mimetype: template.media_mimetype || 'image/jpeg'
											}
											
											console.log(`📷 Sending template ${templateCode} media to ${remoteJid}...`)
											const result = await sock.sendMessage(remoteJid, messageContentToSend)
											console.log(`✅ Template ${templateCode} media sent successfully`)
											
											// Track this message
											if (result?.key?.id) {
												uiSentMessages.add(result.key.id)
												setTimeout(() => uiSentMessages.delete(result.key.id), 30000)
											}
											
											// Log the template message
											activityLogger.logMessage({
												timestamp: new Date().toISOString(),
												sessionId,
												direction: 'outgoing',
												from: session.user?.id || sessionId,
												to: remoteJid,
												messageType: 'image',
												content: template.content,
												status: 'sent',
												messageId: result?.key?.id || `template_${Date.now()}`,
												source: 'template'
											})
											
											// Emit template-sent event
											this.socketIO.emit('template-sent', {
												success: true,
												sessionId,
												to: remoteJid,
												templateCode: templateCode,
												templateContent: template.content,
												hasMedia: true,
												fromMobile: true,
												messageId: result?.key?.id
											})
										} catch (mediaError) {
											console.error(`❌ Failed to send template ${templateCode} media from mobile:`, mediaError)
										}
									} else {
										// Send text only
										try {
											const result = await sock.sendMessage(remoteJid, { text: template.content })
											console.log(`✅ Template ${templateCode} text sent successfully`)
											
											// Track this message
											if (result?.key?.id) {
												uiSentMessages.add(result.key.id)
												setTimeout(() => uiSentMessages.delete(result.key.id), 30000)
											}
											
											// Log the template message
											activityLogger.logMessage({
												timestamp: new Date().toISOString(),
												sessionId,
												direction: 'outgoing',
												from: session.user?.id || sessionId,
												to: remoteJid,
												messageType: 'text',
												content: template.content,
												status: 'sent',
												messageId: result?.key?.id || `template_${Date.now()}`,
												source: 'template'
											})
											
											// Emit template-sent event
											this.socketIO.emit('template-sent', {
												success: true,
												sessionId,
												to: remoteJid,
												templateCode: templateCode,
												templateContent: template.content,
												hasMedia: false,
												fromMobile: true,
												messageId: result?.key?.id
											})
										} catch (textError) {
											console.error(`❌ Failed to send template ${templateCode} text from mobile:`, textError)
										}
									}
								} else {
									console.log(`❌ Template not found: ${templateCode}`)
									notFoundCodes.push(templateCode)
								}
							}
							
							// Emit template-not-found for all missing templates
							if (notFoundCodes.length > 0) {
								this.socketIO.emit('template-not-found', {
									sessionId,
									phone: remoteJid,
									codes: notFoundCodes,
									message: `Template tidak ditemukan: ${notFoundCodes.map(c => '#' + c).join(', ')}`,
									fromMobile: true
								})
							}
							
							// Continue to log the original message as well
						}
					}
					
					// Try to download media for incoming messages
					let mediaBase64: string | undefined = undefined
					if (!fromMe && (messageType === 'image' || messageType === 'video' || messageType === 'document' || messageType === 'audio' || messageType === 'sticker')) {
						try {
							console.log(`📥 Downloading ${messageType} from ${remoteJid}...`)
							const buffer = await downloadMediaMessage(
								msg,
								'buffer',
								{},
								{
									logger: pinoLogger,
									reuploadRequest: sock.updateMediaMessage
								}
							)
							if (buffer) {
								mediaBase64 = buffer.toString('base64')
								console.log(`✅ Downloaded ${messageType}: ${buffer.length} bytes`)
							}
						} catch (downloadError) {
							console.error(`⚠️ Failed to download ${messageType}:`, downloadError)
						}
					}
					
					// Log message with messageId for duplicate prevention
					activityLogger.logMessage({
						timestamp: new Date(timestamp).toISOString(),
						sessionId,
						direction: fromMe ? 'outgoing' : 'incoming',
						from: fromMe ? (session.user?.id || sessionId) : remoteJid,
						to: fromMe ? remoteJid : (session.user?.id || sessionId),
						messageType,
						content: messageContent,
						mediaInfo,
						status: fromMe ? 'sent' : 'received',
						messageId: messageId,
						source: source
					})
					
					// Also save media data directly to database if downloaded
					if (mediaBase64) {
						try {
							// Update the just-inserted message with media data using imported db
							const updateStmt = db.prepare(`UPDATE message_logs SET media_data = ? WHERE message_id = ?`)
							updateStmt.run(mediaBase64, messageId)
							console.log(`✅ Media data saved to database for ${messageId}`)
						} catch (dbError) {
							console.error('⚠️ Failed to save media data:', dbError)
						}
					}
					
					// ============================================
					// AUTO REPLY HANDLER
					// ============================================
					// Only process incoming text messages (not fromMe)
					if (!fromMe && messageType === 'text' && messageContent) {
						try {
							const isGroup = remoteJid.includes('@g.us')
							const senderNumber = isGroup ? (msg.key.participant || remoteJid) : remoteJid
							
							// Find matching rule
							const matchedRule = autoReplyDb.matchMessage(sessionId, messageContent, isGroup)
							
							if (matchedRule) {
								console.log(`🤖 Auto-reply rule matched: "${matchedRule.name}" for message: "${messageContent.substring(0, 50)}..."`)
								
								// Check cooldown
								const isInCooldown = autoReplyCooldownDb.isInCooldown(
									matchedRule.id!,
									sessionId,
									senderNumber,
									matchedRule.cooldown_seconds || 0
								)
								
								if (isInCooldown) {
									console.log(`⏳ Auto-reply skipped (cooldown): ${matchedRule.name}`)
									
									// Log cooldown skip
									autoReplyLogDb.insert({
										rule_id: matchedRule.id!,
										rule_name: matchedRule.name,
										session_id: sessionId,
										message_id: messageId,
										from_number: senderNumber,
										chat_id: remoteJid,
										is_group: isGroup ? 1 : 0,
										matched_text: messageContent.substring(0, 500),
										trigger_value: matchedRule.trigger_value,
										response_sent: null,
										status: 'cooldown',
										error_message: 'Sender is in cooldown period'
									})
								} else {
									// Send auto-reply
									try {
										let replyResult: any = null
										const targetJid = remoteJid // Reply to the chat (group or private)
										
										// Handle different response types
										if (matchedRule.response_type === 'template') {
											// Get template by code
											const template = chatTemplateDb.getByCode(matchedRule.response_content)
											if (template) {
												if (template.media_data) {
													// Send template with media
													const mediaBuffer = Buffer.from(template.media_data, 'base64')
													replyResult = await sock.sendMessage(targetJid, {
														image: mediaBuffer,
														caption: template.content,
														mimetype: template.media_mimetype || 'image/jpeg'
													})
												} else {
													// Send template text only
													replyResult = await sock.sendMessage(targetJid, { text: template.content })
												}
												console.log(`✅ Auto-reply template sent: ${template.code}`)
											} else {
												throw new Error(`Template not found: ${matchedRule.response_content}`)
											}
										} else if (matchedRule.response_type === 'image' && matchedRule.response_media_data) {
											// Send image response
											const mediaBuffer = Buffer.from(matchedRule.response_media_data, 'base64')
											replyResult = await sock.sendMessage(targetJid, {
												image: mediaBuffer,
												caption: matchedRule.response_content || undefined,
												mimetype: matchedRule.response_media_mimetype || 'image/jpeg'
											})
											console.log(`✅ Auto-reply image sent`)
										} else if (matchedRule.response_type === 'document' && matchedRule.response_media_data) {
											// Send document response
											const mediaBuffer = Buffer.from(matchedRule.response_media_data, 'base64')
											replyResult = await sock.sendMessage(targetJid, {
												document: mediaBuffer,
												fileName: matchedRule.response_media_filename || 'document',
												mimetype: matchedRule.response_media_mimetype || 'application/octet-stream',
												caption: matchedRule.response_content || undefined
											})
											console.log(`✅ Auto-reply document sent`)
										} else if (matchedRule.response_type === 'audio' && matchedRule.response_media_data) {
											// Send audio response
											const mediaBuffer = Buffer.from(matchedRule.response_media_data, 'base64')
											replyResult = await sock.sendMessage(targetJid, {
												audio: mediaBuffer,
												mimetype: matchedRule.response_media_mimetype || 'audio/mp4',
												ptt: false
											})
											console.log(`✅ Auto-reply audio sent`)
										} else if (matchedRule.response_type === 'video' && matchedRule.response_media_data) {
											// Send video response
											const mediaBuffer = Buffer.from(matchedRule.response_media_data, 'base64')
											replyResult = await sock.sendMessage(targetJid, {
												video: mediaBuffer,
												caption: matchedRule.response_content || undefined,
												mimetype: matchedRule.response_media_mimetype || 'video/mp4'
											})
											console.log(`✅ Auto-reply video sent`)
										} else {
											// Send text response (default)
											replyResult = await sock.sendMessage(targetJid, { text: matchedRule.response_content })
											console.log(`✅ Auto-reply text sent: "${matchedRule.response_content.substring(0, 50)}..."`)
										}
										
										// Track the sent message to prevent duplicate processing
										if (replyResult?.key?.id) {
											uiSentMessages.add(replyResult.key.id)
											setTimeout(() => uiSentMessages.delete(replyResult.key.id), 30000)
										}
										
										// Update cooldown
										if (matchedRule.cooldown_seconds && matchedRule.cooldown_seconds > 0) {
											autoReplyCooldownDb.updateCooldown(matchedRule.id!, sessionId, senderNumber)
										}
										
										// Log success
										autoReplyLogDb.insert({
											rule_id: matchedRule.id!,
											rule_name: matchedRule.name,
											session_id: sessionId,
											message_id: messageId,
											from_number: senderNumber,
											chat_id: remoteJid,
											is_group: isGroup ? 1 : 0,
											matched_text: messageContent.substring(0, 500),
											trigger_value: matchedRule.trigger_value,
											response_sent: matchedRule.response_content.substring(0, 500),
											status: 'success'
										})
										
										// Log the auto-reply message
										activityLogger.logMessage({
											timestamp: new Date().toISOString(),
											sessionId,
											direction: 'outgoing',
											from: session.user?.id || sessionId,
											to: targetJid,
											messageType: matchedRule.response_type === 'text' ? 'text' : matchedRule.response_type,
											content: matchedRule.response_content,
											status: 'sent',
											messageId: replyResult?.key?.id || `auto_reply_${Date.now()}`,
											source: 'auto-reply'
										})
										
										// Emit auto-reply-sent event
										this.socketIO.emit('auto-reply-sent', {
											success: true,
											sessionId,
											to: targetJid,
											ruleName: matchedRule.name,
											ruleId: matchedRule.id,
											trigger: matchedRule.trigger_value,
											response: matchedRule.response_content,
											isGroup: isGroup,
											messageId: replyResult?.key?.id
										})
									} catch (sendError: any) {
										console.error(`❌ Auto-reply failed:`, sendError)
										
										// Log failure
										autoReplyLogDb.insert({
											rule_id: matchedRule.id!,
											rule_name: matchedRule.name,
											session_id: sessionId,
											message_id: messageId,
											from_number: senderNumber,
											chat_id: remoteJid,
											is_group: isGroup ? 1 : 0,
											matched_text: messageContent.substring(0, 500),
											trigger_value: matchedRule.trigger_value,
											response_sent: matchedRule.response_content.substring(0, 500),
											status: 'failed',
											error_message: sendError.message
										})
									}
								}
							}
						} catch (autoReplyError) {
							console.error('⚠️ Auto-reply processing error:', autoReplyError)
						}
					}
					
					// Emit message for real-time updates
					// Include mediaBase64 for immediate display
					this.socketIO.emit('message-received', {
						sessionId,
						from: remoteJid,
						to: fromMe ? remoteJid : (session.user?.id || sessionId),
						message: msg.message,
						timestamp: timestamp,
						fromMe: fromMe,
						messageId: messageId,
						participant: msg.key.participant,
						originalJid: msg.key.remoteJid,
						mediaBase64: mediaBase64 // Include downloaded media
					})
					
					console.log(`${fromMe ? '📱➡️' : '📨'} Message ${fromMe ? 'from Mobile' : 'received'}: ${remoteJid} - ${messageType}`)
				}
			}
		})

		// Request pairing code
		if (type === 'pairing' && phoneNumber && !sock.authState.creds.registered) {
			const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''))
			this.socketIO.emit('pairing-code', { sessionId, code })
		}
	}

	async sendMessage(
		sessionId: string,
		phone: string,
		message: string
	): Promise<any> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		const jid = phone.includes('@s.whatsapp.net')
			? phone
			: `${phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`

		const result = await session.sock.sendMessage(jid, { text: message })
		
		// Track this message to prevent duplicate display
		if (result?.key?.id) {
			uiSentMessages.add(result.key.id)
			// Clean up after 30 seconds
			setTimeout(() => uiSentMessages.delete(result.key.id), 30000)
		}
		
		return result
	}

	async sendImage(
		sessionId: string,
		phone: string,
		imageBuffer: Buffer,
		caption?: string,
		mimetype?: string,
		filename?: string
	): Promise<any> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		const jid = phone.includes('@s.whatsapp.net')
			? phone
			: `${phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`

		const messageContent: AnyMessageContent = {
			image: imageBuffer,
		}

		if (caption) {
			messageContent.caption = caption
		}

		if (mimetype) {
			messageContent.mimetype = mimetype
		}

		if (filename) {
			messageContent.fileName = filename
		}

		console.log('📤 Sending image to', jid, 'size:', imageBuffer.length, 'bytes')
		const result = await session.sock.sendMessage(jid, messageContent)
		console.log('✅ Image sent successfully')
		
		// Track this message to prevent duplicate display
		if (result?.key?.id) {
			uiSentMessages.add(result.key.id)
			setTimeout(() => uiSentMessages.delete(result.key.id), 30000)
		}
		
		return result
	}

	async sendVideo(
		sessionId: string,
		phone: string,
		videoBuffer: Buffer,
		caption?: string,
		mimetype?: string,
		filename?: string
	): Promise<any> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		const jid = phone.includes('@s.whatsapp.net')
			? phone
			: `${phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`

		const messageContent: AnyMessageContent = {
			video: videoBuffer,
		}

		if (caption) {
			messageContent.caption = caption
		}

		if (mimetype) {
			messageContent.mimetype = mimetype
		}

		if (filename) {
			messageContent.fileName = filename
		}

		console.log('📤 Sending video to', jid, 'size:', videoBuffer.length, 'bytes')
		const result = await session.sock.sendMessage(jid, messageContent)
		console.log('✅ Video sent successfully')
		
		// Track this message to prevent duplicate display
		if (result?.key?.id) {
			uiSentMessages.add(result.key.id)
			setTimeout(() => uiSentMessages.delete(result.key.id), 30000)
		}
		
		return result
	}

	async sendDocument(
		sessionId: string,
		phone: string,
		documentBuffer: Buffer,
		mimetype?: string,
		filename?: string
	): Promise<any> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		const jid = phone.includes('@s.whatsapp.net')
			? phone
			: `${phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`

		const messageContent: AnyMessageContent = {
			document: documentBuffer,
		}

		if (mimetype) {
			messageContent.mimetype = mimetype
		}

		if (filename) {
			messageContent.fileName = filename
		} else {
			messageContent.fileName = 'document'
		}

		console.log('📤 Sending document to', jid, 'size:', documentBuffer.length, 'bytes')
		const result = await session.sock.sendMessage(jid, messageContent)
		console.log('✅ Document sent successfully')
		
		// Track this message to prevent duplicate display
		if (result?.key?.id) {
			uiSentMessages.add(result.key.id)
			setTimeout(() => uiSentMessages.delete(result.key.id), 30000)
		}
		
		return result
	}

	async getChatHistory(
		sessionId: string,
		phone: string,
		limit: number = 50
	): Promise<any[]> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			console.log('⚠️ Session not connected, returning empty history')
			return []
		}

		const jid = phone.includes('@s.whatsapp.net')
			? phone
			: `${phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`

		try {
			console.log('📜 Fetching chat history for', jid, 'limit:', limit)
			
			// Baileys stores messages in memory during session
			// We'll fetch using fetchMessagesFromWA if available
			// Otherwise return empty array (messages will sync via events)
			
			// Note: In a production app, you should store messages in a database
			// For now, we rely on real-time message sync from WhatsApp events
			
			console.log('ℹ️ Chat history loading relies on message sync events')
			console.log('💡 Messages will appear as they are synced from WhatsApp')
			
			return []

		} catch (error) {
			console.error('❌ Error fetching chat history:', error)
			return []
		}
	}

	private getMessageType(message: any): string {
		if (message.conversation) return 'text'
		if (message.extendedTextMessage) return 'text'
		if (message.imageMessage) return 'image'
		if (message.videoMessage) {
			return message.videoMessage.gifPlayback ? 'gif' : 'video'
		}
		if (message.stickerMessage) return 'sticker'
		if (message.documentMessage) return 'document'
		if (message.audioMessage) {
			return message.audioMessage.ptt ? 'voice' : 'audio'
		}
		if (message.contactMessage) return 'contact'
		if (message.locationMessage) return 'location'
		return 'unknown'
	}

	private getMessageContent(message: any): string {
		if (message.conversation) return message.conversation
		if (message.extendedTextMessage?.text) return message.extendedTextMessage.text
		if (message.imageMessage?.caption) return message.imageMessage.caption
		if (message.videoMessage?.caption) return message.videoMessage.caption
		if (message.documentMessage?.fileName) return message.documentMessage.fileName
		if (message.contactMessage?.displayName) return message.contactMessage.displayName
		if (message.locationMessage?.name) return message.locationMessage.name || 'Location'
		return ''
	}

	private getMediaInfo(message: any): any {
		const mediaInfo: any = {}
		
		if (message.imageMessage) {
			mediaInfo.mimetype = message.imageMessage.mimetype
			mediaInfo.size = message.imageMessage.fileLength
			mediaInfo.filename = 'image'
		}
		if (message.videoMessage) {
			mediaInfo.mimetype = message.videoMessage.mimetype
			mediaInfo.size = message.videoMessage.fileLength
			mediaInfo.filename = 'video'
		}
		if (message.documentMessage) {
			mediaInfo.mimetype = message.documentMessage.mimetype
			mediaInfo.size = message.documentMessage.fileLength
			mediaInfo.filename = message.documentMessage.fileName
		}
		if (message.audioMessage) {
			mediaInfo.mimetype = message.audioMessage.mimetype
			mediaInfo.size = message.audioMessage.fileLength
			mediaInfo.filename = 'audio'
		}
		
		return Object.keys(mediaInfo).length > 0 ? mediaInfo : undefined
	}

	async logout(sessionId: string): Promise<void> {
		const session = this.getSession(sessionId)
		
		if (session && session.sock) {
			await session.sock.logout()
			session.sock = null
			session.isConnected = false
			session.qrCode = null
			session.user = null
			this.socketIO.emit('session-status', {
				sessionId,
				status: 'disconnected',
				isConnected: false
			})
		}
	}

	// ============================================
	// GROUP MANAGEMENT METHODS
	// ============================================

	/**
	 * Get all groups the user is participating in
	 */
	async getAllGroups(sessionId: string): Promise<any[]> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		try {
			console.log('📋 Fetching all groups for session:', sessionId)
			const groups = await session.sock.groupFetchAllParticipating()
			
			// Collect all LIDs that need resolution (those without phoneNumber from server)
			const lidsToResolve: string[] = []
			Object.values(groups).forEach((group: any) => {
				(group.participants || []).forEach((p: any) => {
					// Only add to resolution list if it's a LID without server-provided phoneNumber
					if (p.id.includes('@lid') && !p.phoneNumber) {
						if (!lidsToResolve.includes(p.id)) {
							lidsToResolve.push(p.id)
						}
					}
				})
				// Add owner/subjectOwner LIDs too
				if (group.owner?.includes('@lid')) {
					if (!lidsToResolve.includes(group.owner)) {
						lidsToResolve.push(group.owner)
					}
				}
				if (group.subjectOwner?.includes('@lid')) {
					if (!lidsToResolve.includes(group.subjectOwner)) {
						lidsToResolve.push(group.subjectOwner)
					}
				}
			})

			// Batch resolve only LIDs that don't have server phoneNumber
			console.log(`🔄 Resolving ${lidsToResolve.length} LIDs without server phoneNumber...`)
			const resolvedJids = lidsToResolve.length > 0 
				? await this.resolveLidsInBatch(sessionId, lidsToResolve)
				: new Map<string, string>()
			
			// Convert to array with resolved participants
			const groupList = Object.values(groups).map((group: any) => {
				// Resolve LID for each participant - prioritize server-provided phoneNumber
				const resolvedParticipants = (group.participants || []).map((p: any) => {
					let resolvedId = p.id
					
					// Priority 1: Use phoneNumber from server (if jid is LID and phoneNumber exists)
					if (p.phoneNumber && p.id.includes('@lid')) {
						resolvedId = p.phoneNumber
					}
					// Priority 2: Use our batch-resolved mapping
					else if (resolvedJids.has(p.id)) {
						resolvedId = resolvedJids.get(p.id)!
					}
					// Priority 3: Keep original (either already a PN, or unresolved LID)
					
					return {
						...p,
						id: resolvedId,
						originalId: p.id,
						originalLid: p.lid || (p.id.includes('@lid') ? p.id : undefined),
						serverPhoneNumber: p.phoneNumber, // Keep server's phoneNumber for reference
						admin: p.admin || null
					}
				})

				// Count admins and superadmins
				const adminCount = resolvedParticipants.filter((p: any) => p.admin === 'admin' || p.admin === 'superadmin').length
				const ownerCount = resolvedParticipants.filter((p: any) => p.admin === 'superadmin').length

				// Resolve owner
				let resolvedOwner = group.owner || ''
				if (resolvedJids.has(group.owner)) {
					resolvedOwner = resolvedJids.get(group.owner)!
				}
				
				// Resolve subject owner
				let resolvedSubjectOwner = group.subjectOwner || ''
				if (resolvedJids.has(group.subjectOwner)) {
					resolvedSubjectOwner = resolvedJids.get(group.subjectOwner)!
				}

				// Count resolved vs unresolved
				const resolvedCount = resolvedParticipants.filter((p: any) => 
					!p.id.includes('@lid')
				).length
				const unresolvedCount = resolvedParticipants.length - resolvedCount

				return {
					id: group.id,
					subject: group.subject,
					subjectOwner: resolvedSubjectOwner,
					subjectTime: group.subjectTime,
					creation: group.creation,
					owner: resolvedOwner,
					desc: group.desc,
					descId: group.descId,
					restrict: group.restrict,
					announce: group.announce,
					size: group.size || resolvedParticipants.length || 0,
					participantCount: resolvedParticipants.length,
					resolvedCount,
					unresolvedLidCount: unresolvedCount,
					adminCount,
					ownerCount,
					participants: resolvedParticipants,
					ephemeralDuration: group.ephemeralDuration,
					inviteCode: group.inviteCode
				}
			})
			
			console.log(`✅ Found ${groupList.length} groups`)
			return groupList
		} catch (error) {
			console.error('❌ Error fetching groups:', error)
			throw error
		}
	}

	/**
	 * Get group metadata (detailed info)
	 */
	async getGroupMetadata(sessionId: string, groupId: string): Promise<any> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		try {
			// Ensure groupId has correct format
			const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`
			
			console.log('📋 Fetching group metadata for:', jid)
			const metadata = await session.sock.groupMetadata(jid)
			
			// Log raw participant data for debugging
			console.log('📊 Raw participant count:', metadata.participants?.length || 0)
			if (metadata.participants?.length > 0) {
				const sample = metadata.participants[0]
				console.log('📊 Sample participant:', JSON.stringify({
					id: sample.id,
					phoneNumber: sample.phoneNumber,
					lid: sample.lid,
					admin: sample.admin
				}))
			}
			
			// Collect LIDs that need resolution (those without phoneNumber from server)
			const lidsToResolve: string[] = []
			for (const p of (metadata.participants || [])) {
				// If participant has phoneNumber from server, use it directly
				// Otherwise, if it's a LID, we need to try to resolve it
				if (!p.phoneNumber && p.id.includes('@lid')) {
					lidsToResolve.push(p.id)
				}
			}
			
			// Add owner/subjectOwner if they're LIDs without server-provided PN
			if (metadata.owner && metadata.owner.includes('@lid') && !metadata.ownerPn) {
				lidsToResolve.push(metadata.owner)
			}
			if (metadata.subjectOwner && metadata.subjectOwner.includes('@lid') && !metadata.subjectOwnerPn) {
				lidsToResolve.push(metadata.subjectOwner)
			}

			// Batch resolve remaining LIDs from our cache/files
			const resolvedJids = lidsToResolve.length > 0 
				? await this.resolveLidsInBatch(sessionId, lidsToResolve)
				: new Map<string, string>()
			
			// Process participants - prioritize server-provided phoneNumber
			const resolvedParticipants = (metadata.participants || []).map((p: any) => {
				let resolvedId = p.id
				
				// Priority 1: Use phoneNumber from server (if jid is LID and phoneNumber exists)
				if (p.phoneNumber && p.id.includes('@lid')) {
					resolvedId = p.phoneNumber
				}
				// Priority 2: Use our batch-resolved mapping
				else if (resolvedJids.has(p.id)) {
					resolvedId = resolvedJids.get(p.id)!
				}
				// Priority 3: Keep original (either already a PN, or unresolved LID)
				
				return {
					...p,
					id: resolvedId,
					originalId: p.id,
					originalLid: p.lid || (p.id.includes('@lid') ? p.id : undefined),
					serverPhoneNumber: p.phoneNumber, // Keep server's phoneNumber for reference
					admin: p.admin || null
				}
			})

			// Resolve owner
			let resolvedOwner = metadata.owner || ''
			if (metadata.ownerPn) {
				resolvedOwner = metadata.ownerPn
			} else if (resolvedJids.has(metadata.owner)) {
				resolvedOwner = resolvedJids.get(metadata.owner)!
			}
			
			// Resolve subject owner
			let resolvedSubjectOwner = metadata.subjectOwner || ''
			if (metadata.subjectOwnerPn) {
				resolvedSubjectOwner = metadata.subjectOwnerPn
			} else if (resolvedJids.has(metadata.subjectOwner)) {
				resolvedSubjectOwner = resolvedJids.get(metadata.subjectOwner)!
			}

			// Count resolved vs unresolved
			const resolvedCount = resolvedParticipants.filter((p: any) => 
				!p.id.includes('@lid')
			).length
			const unresolvedCount = resolvedParticipants.length - resolvedCount

			// Return metadata with resolved participants
			const result = {
				...metadata,
				participants: resolvedParticipants,
				participantCount: resolvedParticipants.length,
				resolvedCount,
				unresolvedLidCount: unresolvedCount,
				adminCount: resolvedParticipants.filter((p: any) => p.admin === 'admin' || p.admin === 'superadmin').length,
				ownerCount: resolvedParticipants.filter((p: any) => p.admin === 'superadmin').length,
				owner: resolvedOwner,
				subjectOwner: resolvedSubjectOwner
			}
			
			console.log(`✅ Group: ${result.subject}, Members: ${result.participantCount}, Resolved: ${resolvedCount}, Unresolved LIDs: ${unresolvedCount}`)
			return result
		} catch (error) {
			console.error('❌ Error fetching group metadata:', error)
			throw error
		}
	}

	/**
	 * Get group invite code
	 */
	async getGroupInviteCode(sessionId: string, groupId: string): Promise<string> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		try {
			const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`
			const code = await session.sock.groupInviteCode(jid)
			console.log(`✅ Invite code for ${jid}: ${code}`)
			return code
		} catch (error) {
			console.error('❌ Error getting invite code:', error)
			throw error
		}
	}

	/**
	 * Revoke group invite code
	 */
	async revokeGroupInvite(sessionId: string, groupId: string): Promise<string> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		try {
			const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`
			const newCode = await session.sock.groupRevokeInvite(jid)
			console.log(`✅ New invite code for ${jid}: ${newCode}`)
			return newCode
		} catch (error) {
			console.error('❌ Error revoking invite:', error)
			throw error
		}
	}

	/**
	 * Join group by invite code
	 */
	async joinGroupByCode(sessionId: string, inviteCode: string): Promise<string> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		try {
			// Remove URL prefix if present
			const code = inviteCode.replace('https://chat.whatsapp.com/', '').trim()
			const groupId = await session.sock.groupAcceptInvite(code)
			console.log(`✅ Joined group: ${groupId}`)
			return groupId
		} catch (error) {
			console.error('❌ Error joining group:', error)
			throw error
		}
	}

	/**
	 * Create new group
	 */
	async createGroup(sessionId: string, subject: string, participants: string[]): Promise<any> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		try {
			// Format participant JIDs
			const jids = participants.map(p => 
				p.includes('@s.whatsapp.net') ? p : `${p.replace(/[^0-9]/g, '')}@s.whatsapp.net`
			)
			
			console.log(`📝 Creating group "${subject}" with ${jids.length} participants`)
			const group = await session.sock.groupCreate(subject, jids)
			console.log(`✅ Group created: ${group.id}`)
			return group
		} catch (error) {
			console.error('❌ Error creating group:', error)
			throw error
		}
	}

	/**
	 * Leave group
	 */
	async leaveGroup(sessionId: string, groupId: string): Promise<void> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		try {
			const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`
			await session.sock.groupLeave(jid)
			console.log(`✅ Left group: ${jid}`)
		} catch (error) {
			console.error('❌ Error leaving group:', error)
			throw error
		}
	}

	/**
	 * Update group subject (name)
	 */
	async updateGroupSubject(sessionId: string, groupId: string, subject: string): Promise<void> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		try {
			const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`
			await session.sock.groupUpdateSubject(jid, subject)
			console.log(`✅ Updated group subject to: ${subject}`)
		} catch (error) {
			console.error('❌ Error updating group subject:', error)
			throw error
		}
	}

	/**
	 * Update group description
	 */
	async updateGroupDescription(sessionId: string, groupId: string, description: string): Promise<void> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		try {
			const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`
			await session.sock.groupUpdateDescription(jid, description)
			console.log(`✅ Updated group description`)
		} catch (error) {
			console.error('❌ Error updating group description:', error)
			throw error
		}
	}

	/**
	 * Add participants to group
	 */
	async addGroupParticipants(sessionId: string, groupId: string, participants: string[]): Promise<any> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		try {
			const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`
			const jids = participants.map(p => 
				p.includes('@s.whatsapp.net') ? p : `${p.replace(/[^0-9]/g, '')}@s.whatsapp.net`
			)
			
			console.log(`📝 Adding ${jids.length} participants to ${jid}`)
			const result = await session.sock.groupParticipantsUpdate(jid, jids, 'add')
			console.log(`✅ Participants added`)
			return result
		} catch (error) {
			console.error('❌ Error adding participants:', error)
			throw error
		}
	}

	/**
	 * Remove participants from group
	 */
	async removeGroupParticipants(sessionId: string, groupId: string, participants: string[]): Promise<any> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		try {
			const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`
			const jids = participants.map(p => 
				p.includes('@s.whatsapp.net') ? p : `${p.replace(/[^0-9]/g, '')}@s.whatsapp.net`
			)
			
			console.log(`📝 Removing ${jids.length} participants from ${jid}`)
			const result = await session.sock.groupParticipantsUpdate(jid, jids, 'remove')
			console.log(`✅ Participants removed`)
			return result
		} catch (error) {
			console.error('❌ Error removing participants:', error)
			throw error
		}
	}

	/**
	 * Promote participants to admin
	 */
	async promoteGroupParticipants(sessionId: string, groupId: string, participants: string[]): Promise<any> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		try {
			const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`
			const jids = participants.map(p => 
				p.includes('@s.whatsapp.net') ? p : `${p.replace(/[^0-9]/g, '')}@s.whatsapp.net`
			)
			
			console.log(`📝 Promoting ${jids.length} participants to admin in ${jid}`)
			const result = await session.sock.groupParticipantsUpdate(jid, jids, 'promote')
			console.log(`✅ Participants promoted to admin`)
			return result
		} catch (error) {
			console.error('❌ Error promoting participants:', error)
			throw error
		}
	}

	/**
	 * Demote participants from admin
	 */
	async demoteGroupParticipants(sessionId: string, groupId: string, participants: string[]): Promise<any> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		try {
			const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`
			const jids = participants.map(p => 
				p.includes('@s.whatsapp.net') ? p : `${p.replace(/[^0-9]/g, '')}@s.whatsapp.net`
			)
			
			console.log(`📝 Demoting ${jids.length} participants from admin in ${jid}`)
			const result = await session.sock.groupParticipantsUpdate(jid, jids, 'demote')
			console.log(`✅ Participants demoted from admin`)
			return result
		} catch (error) {
			console.error('❌ Error demoting participants:', error)
			throw error
		}
	}

	/**
	 * Send message to group
	 */
	async sendGroupMessage(sessionId: string, groupId: string, message: string): Promise<any> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		try {
			const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`
			
			console.log(`📤 Sending message to group ${jid}`)
			const result = await session.sock.sendMessage(jid, { text: message })
			console.log(`✅ Message sent to group`)
			
			// Track this message
			if (result?.key?.id) {
				uiSentMessages.add(result.key.id)
				setTimeout(() => uiSentMessages.delete(result.key.id), 30000)
			}
			
			return result
		} catch (error) {
			console.error('❌ Error sending group message:', error)
			throw error
		}
	}

	/**
	 * Update group settings (who can send messages, edit info)
	 */
	async updateGroupSettings(sessionId: string, groupId: string, setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked'): Promise<void> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		try {
			const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`
			await session.sock.groupSettingUpdate(jid, setting)
			console.log(`✅ Group settings updated: ${setting}`)
		} catch (error) {
			console.error('❌ Error updating group settings:', error)
			throw error
		}
	}

	/**
	 * Get group profile picture URL
	 */
	async getGroupProfilePicture(sessionId: string, groupId: string): Promise<string | null> {
		const session = this.getSession(sessionId)
		
		if (!session || !session.sock || !session.isConnected) {
			throw new Error('Session not connected')
		}

		try {
			const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`
			const url = await session.sock.profilePictureUrl(jid, 'image')
			return url
		} catch (error) {
			// No profile picture
			return null
		}
	}
}
