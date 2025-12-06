import express from 'express'
import { createServer } from 'http'
import { Server as SocketIO } from 'socket.io'
import { SessionManager } from './session-manager'
import { logger as activityLogger } from './logger'
import { messageLogDb, sessionLogDb, chatTemplateDb, groupExportDb, db } from './database.js'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as XLSX from 'xlsx'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Create exports directory
const exportsDir = path.join(__dirname, 'data', 'exports')
if (!fs.existsSync(exportsDir)) {
	fs.mkdirSync(exportsDir, { recursive: true })
}

const app = express()
const server = createServer(app)
const io = new SocketIO(server, {
	cors: {
		origin: '*',
		methods: ['GET', 'POST']
	}
})

const sessionManager = new SessionManager(io)

// Serve static files
app.use(express.static('public'))
app.use('/api', express.static('api')) // Serve API folder
app.use(express.json({ limit: '50mb' })) // Increase limit for media uploads

// ============================================
// User Frontend Routes
// ============================================

// Main route - Redirect to Frontend Login
app.get('/', (req, res) => {
	res.redirect('/frontend/')
})

// User frontend routes
app.get('/user/', (req, res) => {
	res.sendFile(__dirname + '/public/user/index.html')
})

app.get('/user/connect', (req, res) => {
	res.sendFile(__dirname + '/public/user/connect.html')
})

app.get('/user/exports', (req, res) => {
	res.sendFile(__dirname + '/public/user/exports.html')
})

app.get('/user/export/:id', (req, res) => {
	res.sendFile(__dirname + '/public/user/export-detail.html')
})

// Serve user static assets
app.use('/user/assets', express.static('public/user/assets'))

// ============================================
// NEW Frontend Routes (public/frontend)
// ============================================

// Frontend login page
app.get('/frontend/', (req, res) => {
	res.sendFile(__dirname + '/public/frontend/index.html')
})

app.get('/frontend/index.html', (req, res) => {
	res.sendFile(__dirname + '/public/frontend/index.html')
})

// Frontend home page (after login)
app.get('/frontend/home', (req, res) => {
	res.sendFile(__dirname + '/public/frontend/home.html')
})

app.get('/frontend/home.html', (req, res) => {
	res.sendFile(__dirname + '/public/frontend/home.html')
})

// Serve frontend static assets
app.use('/frontend/assets', express.static('public/frontend/assets'))

// Dashboard route - Admin Dashboard
app.get('/dashboard', (req, res) => {
	res.sendFile(__dirname + '/public/index.html')
})

// ============================================
// API Endpoints for Message Logs (Database)
// ============================================

// Get all message logs with filters
app.get('/api/logs/messages', (req, res) => {
	try {
		const sessionId = req.query.sessionId as string
		const contactNumber = req.query.contactNumber as string
		const direction = req.query.direction as string
		const startDate = req.query.startDate as string
		const endDate = req.query.endDate as string
		const limit = parseInt(req.query.limit as string) || 100
		
		const logs = activityLogger.getMessageLogs({
			sessionId,
			contactNumber,
			direction,
			startDate,
			endDate,
			limit
		})
		
		res.json({ success: true, data: logs, count: logs.length })
	} catch (error: any) {
		console.error('Error fetching message logs:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get session logs
app.get('/api/logs/sessions', (req, res) => {
	try {
		const limit = parseInt(req.query.limit as string) || 100
		const logs = activityLogger.getSessionLogs(limit)
		res.json({ success: true, data: logs, count: logs.length })
	} catch (error: any) {
		console.error('Error fetching session logs:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get statistics
app.get('/api/logs/statistics', (req, res) => {
	try {
		const sessionId = req.query.sessionId as string
		const stats = activityLogger.getStatistics(sessionId)
		res.json({ success: true, data: stats })
	} catch (error: any) {
		console.error('Error fetching statistics:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get chat history for a contact
app.get('/api/chat/history/:sessionId/:contactNumber', (req, res) => {
	try {
		const { sessionId, contactNumber } = req.params
		const limit = parseInt(req.query.limit as string) || 100
		
		const history = activityLogger.getChatHistory(sessionId, contactNumber, limit)
		res.json({ success: true, data: history, count: history.length })
	} catch (error: any) {
		console.error('Error fetching chat history:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get unique sessions from database (for logs/activity)
app.get('/api/sessions/list', (req, res) => {
	try {
		const sessions = activityLogger.getSessions()
		res.json({ success: true, data: sessions })
	} catch (error: any) {
		console.error('Error fetching sessions:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get active sessions (for inbox page dropdown)
app.get('/api/sessions', (req, res) => {
	try {
		const allSessions = sessionManager.getAllSessions()
		const sessions = allSessions.map(s => ({
			id: s.id,
			status: s.isConnected ? 'connected' : 'disconnected',
			phoneNumber: s.phoneNumber || (s.user?.id ? s.user.id.replace(/:.+/, '') : null),
			name: s.user?.name || s.id
		}))
		res.json({ success: true, sessions })
	} catch (error: any) {
		console.error('Error fetching active sessions:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get session info (for inbox page)
app.get('/api/session/:sessionId', (req, res) => {
	try {
		const { sessionId } = req.params
		const sessionInfo = sessionManager.getSessionInfo(sessionId)
		if (sessionInfo) {
			res.json({ 
				success: true, 
				session: {
					id: sessionId,
					name: sessionInfo.name || sessionId,
					phoneNumber: sessionInfo.phoneNumber || '-',
					status: sessionInfo.status || 'unknown'
				}
			})
		} else {
			res.json({ success: false, error: 'Session not found' })
		}
	} catch (error: any) {
		console.error('Error fetching session info:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get conversations for a session (for inbox page)
app.get('/api/messages/conversations/:sessionId', (req, res) => {
	try {
		const { sessionId } = req.params
		const conversations = activityLogger.getConversations(sessionId)
		res.json({ success: true, conversations })
	} catch (error: any) {
		console.error('Error fetching conversations:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get messages for a specific chat (for inbox page)
app.get('/api/messages/chat/:sessionId/:phone', (req, res) => {
	try {
		const { sessionId, phone } = req.params
		const messages = activityLogger.getChatMessages(sessionId, phone)
		res.json({ success: true, messages })
	} catch (error: any) {
		console.error('Error fetching chat messages:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get contacts for a session
app.get('/api/contacts/:sessionId', (req, res) => {
	try {
		const { sessionId } = req.params
		const contacts = activityLogger.getContacts(sessionId)
		res.json({ success: true, data: contacts })
	} catch (error: any) {
		console.error('Error fetching contacts:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get logs by date
app.get('/api/logs/date/:date', (req, res) => {
	try {
		const date = req.params.date
		const type = (req.query.type as 'session' | 'message') || 'message'
		const logs = activityLogger.getLogsByDate(date, type)
		res.json({ success: true, data: logs, count: logs.length })
	} catch (error: any) {
		console.error('Error fetching logs by date:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Clear old logs
app.delete('/api/logs/clear', (req, res) => {
	try {
		const days = parseInt(req.query.days as string) || 30
		const deletedCount = activityLogger.clearOldLogs(days)
		res.json({ success: true, message: `Deleted ${deletedCount} old logs` })
	} catch (error: any) {
		console.error('Error clearing logs:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Socket.IO connection
io.on('connection', (socket) => {
	console.log('Client connected:', socket.id)

	// Send all sessions status
	const sessions = sessionManager.getAllSessions()
	socket.emit('all-sessions', sessions)

	// Get all sessions
	socket.on('get-sessions', () => {
		const sessions = sessionManager.getAllSessions()
		socket.emit('all-sessions', sessions)
	})

	// Create new session
	socket.on('create-session', (sessionId: string) => {
		try {
			sessionManager.createSession(sessionId)
			const sessions = sessionManager.getAllSessions()
			io.emit('all-sessions', sessions)
			socket.emit('message', `Session ${sessionId} created`)
		} catch (error: any) {
			socket.emit('error', error.message)
		}
	})

	// Start session with QR
	socket.on('start-session-qr', async (sessionId: string) => {
		try {
			await sessionManager.startSession(sessionId, 'qr')
			socket.emit('message', `Starting session ${sessionId} with QR code`)
		} catch (error: any) {
			socket.emit('error', error.message)
		}
	})

	// Start session with pairing code
	socket.on('start-session-pairing', async (data: { sessionId: string, phoneNumber: string }) => {
		try {
			await sessionManager.startSession(data.sessionId, 'pairing', data.phoneNumber)
			socket.emit('message', `Starting session ${data.sessionId} with pairing code`)
		} catch (error: any) {
			socket.emit('error', error.message)
		}
	})

	// Logout session
	socket.on('logout', async (sessionId: string) => {
		try {
			await sessionManager.logout(sessionId)
			socket.emit('message', `Session ${sessionId} logged out successfully`)
		} catch (error: any) {
			socket.emit('error', error.message)
		}
	})

	// Delete session
	socket.on('delete-session', async (sessionId: string) => {
		try {
			await sessionManager.deleteSession(sessionId)
			const sessions = sessionManager.getAllSessions()
			io.emit('all-sessions', sessions)
			socket.emit('message', `Session ${sessionId} deleted`)
		} catch (error: any) {
			socket.emit('error', error.message)
		}
	})

	// Send message
	socket.on('send-message', async (data: { sessionId: string, phone: string, message: string, messageContent?: string, tempId?: string }) => {
		try {
			const jid = data.phone.includes('@s.whatsapp.net') ? data.phone : `${data.phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`
			
			// Detect all template codes in the message (pattern: #CODE where CODE is alphanumeric/underscore)
			const templatePattern = /#([A-Za-z0-9_]+)/g
			const foundCodes: string[] = []
			let match
			
			while ((match = templatePattern.exec(data.message)) !== null) {
				foundCodes.push(match[1].toUpperCase())
			}
			
			// Remove duplicates
			const uniqueCodes = [...new Set(foundCodes)]
			
			if (uniqueCodes.length > 0) {
				console.log(`📝 Template codes detected in message: ${uniqueCodes.join(', ')}`)
				
				// First, send the original message as-is
				const originalResult = await sessionManager.sendMessage(data.sessionId, data.phone, data.message)
				const originalMessageId = originalResult?.key?.id || `msg_${Date.now()}`
				
				// Save original message to database
				try {
					messageLogDb.insert({
						message_id: originalMessageId,
						session_id: data.sessionId,
						direction: 'outgoing',
						from_number: data.sessionId,
						to_number: jid,
						message_type: 'text',
						content: data.message,
						timestamp: new Date().toISOString(),
						status: 'sent',
						source: 'ui'
					})
					console.log('✅ Original message sent and saved:', originalMessageId)
				} catch (dbError) {
					console.error('⚠️ Failed to save original message:', dbError)
				}
				
				// Emit original message sent
				socket.emit('message-sent', { 
					success: true, 
					sessionId: data.sessionId,
					to: data.phone,
					messageContent: data.message,
					originalMessage: data.message,
					isTemplate: false,
					tempId: data.tempId,
					messageId: originalMessageId
				})
				
				// Now process each template code
				const notFoundCodes: string[] = []
				
				for (const code of uniqueCodes) {
					const template = chatTemplateDb.getByCode(code)
					
					if (template) {
						console.log(`✅ Template found: ${template.code} - "${template.title || 'No title'}"`)
						
						// Small delay between messages to maintain order
						await new Promise(resolve => setTimeout(resolve, 500))
						
						// Check if template has media
						if (template.media_data) {
							try {
								const mediaBuffer = Buffer.from(template.media_data, 'base64')
								const mimetype = template.media_mimetype || 'image/jpeg'
								
								console.log(`📷 Sending template ${code} with media...`)
								
								const mediaResult = await sessionManager.sendImage(
									data.sessionId,
									data.phone,
									mediaBuffer,
									template.content,
									mimetype,
									template.media_filename
								)
								
								const mediaMessageId = mediaResult?.key?.id || `media_${Date.now()}`
								
								// Save to database
								try {
									messageLogDb.insert({
										message_id: mediaMessageId,
										session_id: data.sessionId,
										direction: 'outgoing',
										from_number: data.sessionId,
										to_number: jid,
										message_type: 'image',
										content: template.content,
										timestamp: new Date().toISOString(),
										status: 'sent',
										source: 'template'
									})
									console.log(`✅ Template ${code} media sent:`, mediaMessageId)
								} catch (dbError) {
									console.error('⚠️ Failed to save template media:', dbError)
								}
								
								socket.emit('template-sent', {
									success: true,
									sessionId: data.sessionId,
									to: data.phone,
									templateCode: code,
									templateContent: template.content,
									hasMedia: true,
									messageId: mediaMessageId
								})
							} catch (mediaError: any) {
								console.error(`❌ Failed to send template ${code} media:`, mediaError)
							}
						} else {
							// Send text-only template
							const templateResult = await sessionManager.sendMessage(data.sessionId, data.phone, template.content)
							const templateMessageId = templateResult?.key?.id || `tmpl_${Date.now()}`
							
							// Save to database
							try {
								messageLogDb.insert({
									message_id: templateMessageId,
									session_id: data.sessionId,
									direction: 'outgoing',
									from_number: data.sessionId,
									to_number: jid,
									message_type: 'text',
									content: template.content,
									timestamp: new Date().toISOString(),
									status: 'sent',
									source: 'template'
								})
								console.log(`✅ Template ${code} text sent:`, templateMessageId)
							} catch (dbError) {
								console.error('⚠️ Failed to save template text:', dbError)
							}
							
							socket.emit('template-sent', {
								success: true,
								sessionId: data.sessionId,
								to: data.phone,
								templateCode: code,
								templateContent: template.content,
								hasMedia: false,
								messageId: templateMessageId
							})
						}
					} else {
						console.log(`❌ Template not found: ${code}`)
						notFoundCodes.push(code)
					}
				}
				
				// Notify about not found templates
				if (notFoundCodes.length > 0) {
					socket.emit('template-not-found', {
						phone: data.phone,
						codes: notFoundCodes,
						message: `Template tidak ditemukan: ${notFoundCodes.map(c => '#' + c).join(', ')}`
					})
				}
				
				return
			}
			
			// No template codes found - send as regular message
			const result = await sessionManager.sendMessage(data.sessionId, data.phone, data.message)
			const messageId = result?.key?.id || `msg_${Date.now()}`
			
			// Save text message to database
			try {
				messageLogDb.insert({
					message_id: messageId,
					session_id: data.sessionId,
					direction: 'outgoing',
					from_number: data.sessionId,
					to_number: jid,
					message_type: 'text',
					content: data.message,
					timestamp: new Date().toISOString(),
					status: 'sent',
					source: 'ui'
				})
				console.log('✅ Text message saved to database with messageId:', messageId)
			} catch (dbError) {
				console.error('⚠️ Failed to save text message to database:', dbError)
			}
			
			socket.emit('message-sent', { 
				success: true, 
				sessionId: data.sessionId,
				to: data.phone,
				messageContent: data.message,
				originalMessage: data.message,
				isTemplate: false,
				templateCode: null,
				tempId: data.tempId,
				messageId: messageId
			})
		} catch (error: any) {
			socket.emit('send-error', { 
				phone: data.phone, 
				tempId: data.tempId,
				error: error.message 
			})
		}
	})

	// Get chat history
	socket.on('get-chat-history', async (data: { sessionId: string, phone: string, limit?: number }) => {
		try {
			console.log(`📜 Fetching chat history for ${data.phone} in session ${data.sessionId}`)
			const history = await sessionManager.getChatHistory(data.sessionId, data.phone, data.limit || 50)
			socket.emit('chat-history', {
				sessionId: data.sessionId,
				phone: data.phone,
				messages: history
			})
		} catch (error: any) {
			console.error('❌ Error fetching chat history:', error)
			socket.emit('error', error.message)
		}
	})

	// Handle image/media sending
	socket.on('send-image', async (data: { sessionId: string, phone: string, base64?: string, image?: string, caption?: string, mimetype?: string, filename?: string, tempId?: string }) => {
		try {
			console.log('📸 Received send-image request for', data.phone)
			
			// Convert base64 to buffer (support both base64 and image params)
			const base64Data = data.base64 || data.image
			if (!base64Data) {
				throw new Error('No image data provided')
			}
			const imageBuffer = Buffer.from(base64Data, 'base64')
			
			const result = await sessionManager.sendImage(data.sessionId, data.phone, imageBuffer, data.caption || '', data.mimetype, data.filename)
			const messageId = result?.key?.id || `img_${Date.now()}`
			
			// Save media to database with base64 data
			const jid = data.phone.includes('@s.whatsapp.net') ? data.phone : `${data.phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`
			try {
				messageLogDb.insert({
					message_id: messageId,
					session_id: data.sessionId,
					direction: 'outgoing',
					from_number: data.sessionId,
					to_number: jid,
					message_type: 'image',
					content: data.caption || '',
					media_data: base64Data, // Store base64 for later rendering
					mimetype: data.mimetype || 'image/jpeg',
					filename: data.filename || 'image.jpg',
					file_size: imageBuffer.length,
					timestamp: new Date().toISOString(),
					status: 'sent',
					source: 'ui'
				})
				console.log('✅ Image saved to database with messageId:', messageId)
			} catch (dbError) {
				console.error('⚠️ Failed to save image to database:', dbError)
			}
			
			socket.emit('message-sent', { 
				success: true, 
				sessionId: data.sessionId,
				to: data.phone,
				caption: data.caption || '',
				filename: data.filename || '',
				tempId: data.tempId,
				messageId: messageId,
				mediaType: 'image',
				base64: base64Data
			})
		} catch (error: any) {
			console.error('❌ Error sending image:', error.message)
			socket.emit('send-error', { 
				phone: data.phone, 
				tempId: data.tempId,
				error: error.message 
			})
		}
	})

	// Handle video sending
	socket.on('send-video', async (data: { sessionId: string, phone: string, base64?: string, video?: string, caption?: string, mimetype?: string, filename?: string, tempId?: string }) => {
		try {
			console.log('🎥 Received send-video request for', data.phone)
			
			// Convert base64 to buffer (support both base64 and video params)
			const base64Data = data.base64 || data.video
			if (!base64Data) {
				throw new Error('No video data provided')
			}
			const videoBuffer = Buffer.from(base64Data, 'base64')
			
			const result = await sessionManager.sendVideo(data.sessionId, data.phone, videoBuffer, data.caption || '', data.mimetype, data.filename)
			const messageId = result?.key?.id || `vid_${Date.now()}`
			
			// Save video to database with base64 data
			const jid = data.phone.includes('@s.whatsapp.net') ? data.phone : `${data.phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`
			try {
				messageLogDb.insert({
					message_id: messageId,
					session_id: data.sessionId,
					direction: 'outgoing',
					from_number: data.sessionId,
					to_number: jid,
					message_type: 'video',
					content: data.caption || '',
					media_data: base64Data,
					mimetype: data.mimetype || 'video/mp4',
					filename: data.filename || 'video.mp4',
					file_size: videoBuffer.length,
					timestamp: new Date().toISOString(),
					status: 'sent',
					source: 'ui'
				})
				console.log('✅ Video saved to database with messageId:', messageId)
			} catch (dbError) {
				console.error('⚠️ Failed to save video to database:', dbError)
			}
			
			socket.emit('message-sent', { 
				success: true, 
				sessionId: data.sessionId,
				to: data.phone,
				caption: data.caption || '',
				filename: data.filename || '',
				tempId: data.tempId,
				messageId: messageId,
				mediaType: 'video',
				base64: base64Data
			})
		} catch (error: any) {
			console.error('❌ Error sending video:', error.message)
			socket.emit('send-error', { 
				phone: data.phone, 
				tempId: data.tempId,
				error: error.message 
			})
		}
	})

	// Handle document sending
	socket.on('send-document', async (data: { sessionId: string, phone: string, base64?: string, document?: string, mimetype?: string, filename?: string, tempId?: string }) => {
		try {
			console.log('📎 Received send-document request for', data.phone)
			
			// Convert base64 to buffer (support both base64 and document params)
			const base64Data = data.base64 || data.document
			if (!base64Data) {
				throw new Error('No document data provided')
			}
			const documentBuffer = Buffer.from(base64Data, 'base64')
			
			const result = await sessionManager.sendDocument(data.sessionId, data.phone, documentBuffer, data.mimetype, data.filename)
			const messageId = result?.key?.id || `doc_${Date.now()}`
			
			// Save document to database
			const jid = data.phone.includes('@s.whatsapp.net') ? data.phone : `${data.phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`
			try {
				messageLogDb.insert({
					message_id: messageId,
					session_id: data.sessionId,
					direction: 'outgoing',
					from_number: data.sessionId,
					to_number: jid,
					message_type: 'document',
					content: data.filename || 'Document',
					media_data: base64Data,
					mimetype: data.mimetype || 'application/octet-stream',
					filename: data.filename || 'document',
					file_size: documentBuffer.length,
					timestamp: new Date().toISOString(),
					status: 'sent',
					source: 'ui'
				})
				console.log('✅ Document saved to database with messageId:', messageId)
			} catch (dbError) {
				console.error('⚠️ Failed to save document to database:', dbError)
			}
			
			socket.emit('message-sent', { 
				success: true, 
				sessionId: data.sessionId,
				to: data.phone,
				filename: data.filename || '',
				tempId: data.tempId,
				messageId: messageId,
				mediaType: 'document'
			})
		} catch (error: any) {
			console.error('❌ Error sending document:', error.message)
			socket.emit('send-error', { 
				phone: data.phone, 
				tempId: data.tempId,
				error: error.message 
			})
		}
	})

	socket.on('disconnect', () => {
		console.log('Client disconnected:', socket.id)
	})
})

// ============================================
// Database Viewer API Endpoints
// ============================================

// Get database info (tables, size, etc.)
app.get('/api/database/info', (req, res) => {
	try {
		const dbPath = path.join(__dirname, 'data', 'whatsapp.db')
		
		// Get file size
		let size = 0
		if (fs.existsSync(dbPath)) {
			const stats = fs.statSync(dbPath)
			size = stats.size
		}
		
		// Get tables with row counts
		const tables = db.prepare(`
			SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
		`).all() as any[]
		
		const tablesWithCount = tables.map((t: any) => {
			const countResult = db.prepare(`SELECT COUNT(*) as count FROM ${t.name}`).get() as any
			return {
				name: t.name,
				rowCount: countResult?.count || 0
			}
		})
		
		res.json({
			success: true,
			tables: tablesWithCount,
			size: size,
			path: dbPath
		})
	} catch (error: any) {
		console.error('Error getting database info:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get table schema
app.get('/api/database/schema/:tableName', (req, res) => {
	try {
		const { tableName } = req.params
		
		// Validate table name to prevent SQL injection
		const validTables = db.prepare(`
			SELECT name FROM sqlite_master WHERE type='table' AND name = ?
		`).get(tableName)
		
		if (!validTables) {
			return res.status(404).json({ success: false, error: 'Table not found' })
		}
		
		const schema = db.prepare(`PRAGMA table_info(${tableName})`).all()
		
		res.json({
			success: true,
			schema: schema
		})
	} catch (error: any) {
		console.error('Error getting table schema:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Execute SQL query (read-only for safety)
app.post('/api/database/query', (req, res) => {
	try {
		const { query } = req.body
		
		if (!query) {
			return res.status(400).json({ success: false, error: 'Query is required' })
		}
		
		// Security: Only allow SELECT statements
		const trimmedQuery = query.trim().toLowerCase()
		if (!trimmedQuery.startsWith('select') && !trimmedQuery.startsWith('pragma')) {
			return res.status(403).json({ 
				success: false, 
				error: 'Only SELECT and PRAGMA queries are allowed for security' 
			})
		}
		
		// Execute query
		const stmt = db.prepare(query)
		const data = stmt.all()
		
		// Get column names from first row
		const columns = data.length > 0 ? Object.keys(data[0]) : []
		
		res.json({
			success: true,
			data: data,
			columns: columns,
			rowCount: data.length
		})
	} catch (error: any) {
		console.error('Error executing query:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Export database file
app.get('/api/database/export', (req, res) => {
	try {
		const dbPath = path.join(__dirname, 'data', 'whatsapp.db')
		
		if (!fs.existsSync(dbPath)) {
			return res.status(404).json({ success: false, error: 'Database file not found' })
		}
		
		res.setHeader('Content-Type', 'application/octet-stream')
		res.setHeader('Content-Disposition', `attachment; filename=whatsapp-db-${Date.now()}.db`)
		
		const fileStream = fs.createReadStream(dbPath)
		fileStream.pipe(res)
	} catch (error: any) {
		console.error('Error exporting database:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get table data directly
app.get('/api/database/table/:tableName', (req, res) => {
	try {
		const { tableName } = req.params
		const limit = parseInt(req.query.limit as string) || 100
		const offset = parseInt(req.query.offset as string) || 0
		const orderBy = req.query.orderBy as string || 'id'
		const orderDir = (req.query.orderDir as string)?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
		
		// Validate table name
		const validTables = db.prepare(`
			SELECT name FROM sqlite_master WHERE type='table' AND name = ?
		`).get(tableName)
		
		if (!validTables) {
			return res.status(404).json({ success: false, error: 'Table not found' })
		}
		
		// Get total count
		const countResult = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as any
		const total = countResult?.count || 0
		
		// Get data
		const data = db.prepare(`
			SELECT * FROM ${tableName} 
			ORDER BY ${orderBy} ${orderDir} 
			LIMIT ? OFFSET ?
		`).all(limit, offset)
		
		res.json({
			success: true,
			data: data,
			total: total,
			limit: limit,
			offset: offset
		})
	} catch (error: any) {
		console.error('Error getting table data:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Delete single record by ID
app.delete('/api/database/delete/:tableName/:id', (req, res) => {
	try {
		const { tableName, id } = req.params
		
		// Validate table name
		const validTables = ['message_logs', 'session_logs']
		if (!validTables.includes(tableName)) {
			return res.status(403).json({ success: false, error: 'Table not allowed for deletion' })
		}
		
		// Delete record
		const stmt = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`)
		const result = stmt.run(id)
		
		res.json({
			success: true,
			deleted: result.changes,
			message: `Deleted ${result.changes} record(s) from ${tableName}`
		})
	} catch (error: any) {
		console.error('Error deleting record:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Bulk delete records by IDs
app.post('/api/database/delete-bulk/:tableName', (req, res) => {
	try {
		const { tableName } = req.params
		const { ids } = req.body
		
		if (!ids || !Array.isArray(ids) || ids.length === 0) {
			return res.status(400).json({ success: false, error: 'IDs array is required' })
		}
		
		// Validate table name
		const validTables = ['message_logs', 'session_logs']
		if (!validTables.includes(tableName)) {
			return res.status(403).json({ success: false, error: 'Table not allowed for deletion' })
		}
		
		// Build placeholders for IN clause
		const placeholders = ids.map(() => '?').join(',')
		
		// Delete records
		const stmt = db.prepare(`DELETE FROM ${tableName} WHERE id IN (${placeholders})`)
		const result = stmt.run(...ids)
		
		res.json({
			success: true,
			deleted: result.changes,
			message: `Deleted ${result.changes} record(s) from ${tableName}`
		})
	} catch (error: any) {
		console.error('Error bulk deleting records:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Delete all records from table (truncate)
app.delete('/api/database/truncate/:tableName', (req, res) => {
	try {
		const { tableName } = req.params
		
		// Validate table name
		const validTables = ['message_logs', 'session_logs']
		if (!validTables.includes(tableName)) {
			return res.status(403).json({ success: false, error: 'Table not allowed for truncation' })
		}
		
		// Get count before delete
		const countBefore = (db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as any)?.count || 0
		
		// Delete all
		db.prepare(`DELETE FROM ${tableName}`).run()
		
		res.json({
			success: true,
			deleted: countBefore,
			message: `Deleted all ${countBefore} record(s) from ${tableName}`
		})
	} catch (error: any) {
		console.error('Error truncating table:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// ============================================
// Chat Templates API Endpoints
// ============================================

// Get all templates
app.get('/api/templates', (req, res) => {
	try {
		const activeOnly = req.query.activeOnly === 'true'
		const templates = chatTemplateDb.getAll({ activeOnly })
		const count = chatTemplateDb.getCount(activeOnly)
		
		res.json({
			success: true,
			templates: templates,
			count: count
		})
	} catch (error: any) {
		console.error('Error getting templates:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get single template by ID
app.get('/api/templates/:id', (req, res) => {
	try {
		const id = parseInt(req.params.id)
		const template = chatTemplateDb.getById(id)
		
		if (!template) {
			return res.status(404).json({ success: false, error: 'Template tidak ditemukan' })
		}
		
		res.json({ success: true, template })
	} catch (error: any) {
		console.error('Error getting template:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get template by code (for sending)
app.get('/api/templates/code/:code', (req, res) => {
	try {
		const code = req.params.code
		const template = chatTemplateDb.getByCode(code)
		
		if (!template) {
			return res.status(404).json({ 
				success: false, 
				error: `Template dengan kode "${code}" tidak ditemukan` 
			})
		}
		
		res.json({ success: true, template })
	} catch (error: any) {
		console.error('Error getting template by code:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Create new template
app.post('/api/templates', (req, res) => {
	try {
		const { code, title, content, description, is_active, media_data, media_mimetype, media_filename } = req.body
		
		// Validation
		if (!code || !code.trim()) {
			return res.status(400).json({ success: false, error: 'Kode template wajib diisi' })
		}
		
		if (!content || !content.trim()) {
			return res.status(400).json({ success: false, error: 'Konten template wajib diisi' })
		}
		
		// Check code format (alphanumeric and underscore only)
		if (!/^[A-Za-z0-9_]+$/.test(code.trim())) {
			return res.status(400).json({ 
				success: false, 
				error: 'Kode template hanya boleh mengandung huruf, angka, dan underscore' 
			})
		}
		
		// Check if code already exists
		if (chatTemplateDb.codeExists(code)) {
			return res.status(400).json({ 
				success: false, 
				error: 'Template dengan kode tersebut sudah ada' 
			})
		}
		
		const result = chatTemplateDb.create({
			code: code.trim(),
			title: title?.trim() || null,
			content: content.trim(),
			description: description?.trim() || null,
			is_active: is_active !== undefined ? (is_active ? 1 : 0) : 1,
			media_data: media_data || null,
			media_mimetype: media_mimetype || null,
			media_filename: media_filename || null
		})
		
		if (result.success) {
			const newTemplate = chatTemplateDb.getById(Number(result.id))
			res.json({ 
				success: true, 
				message: 'Template berhasil dibuat',
				template: newTemplate 
			})
		} else {
			res.status(400).json({ success: false, error: result.error })
		}
	} catch (error: any) {
		console.error('Error creating template:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Update template
app.put('/api/templates/:id', (req, res) => {
	try {
		const id = parseInt(req.params.id)
		const { code, title, content, description, is_active, media_data, media_mimetype, media_filename } = req.body
		
		// Check if template exists
		const existing = chatTemplateDb.getById(id)
		if (!existing) {
			return res.status(404).json({ success: false, error: 'Template tidak ditemukan' })
		}
		
		// Validation
		if (code !== undefined && !code.trim()) {
			return res.status(400).json({ success: false, error: 'Kode template wajib diisi' })
		}
		
		if (content !== undefined && !content.trim()) {
			return res.status(400).json({ success: false, error: 'Konten template wajib diisi' })
		}
		
		// Check code format
		if (code && !/^[A-Za-z0-9_]+$/.test(code.trim())) {
			return res.status(400).json({ 
				success: false, 
				error: 'Kode template hanya boleh mengandung huruf, angka, dan underscore' 
			})
		}
		
		// Check if new code already exists (excluding current template)
		if (code && chatTemplateDb.codeExists(code, id)) {
			return res.status(400).json({ 
				success: false, 
				error: 'Template dengan kode tersebut sudah ada' 
			})
		}
		
		const updateData: any = {}
		if (code !== undefined) updateData.code = code.trim()
		if (title !== undefined) updateData.title = title?.trim() || null
		if (content !== undefined) updateData.content = content.trim()
		if (description !== undefined) updateData.description = description?.trim() || null
		if (is_active !== undefined) updateData.is_active = is_active ? 1 : 0
		if (media_data !== undefined) updateData.media_data = media_data || null
		if (media_mimetype !== undefined) updateData.media_mimetype = media_mimetype || null
		if (media_filename !== undefined) updateData.media_filename = media_filename || null
		
		const result = chatTemplateDb.update(id, updateData)
		
		if (result.success) {
			const updatedTemplate = chatTemplateDb.getById(id)
			res.json({ 
				success: true, 
				message: 'Template berhasil diupdate',
				template: updatedTemplate 
			})
		} else {
			res.status(400).json({ success: false, error: result.error })
		}
	} catch (error: any) {
		console.error('Error updating template:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Delete template
app.delete('/api/templates/:id', (req, res) => {
	try {
		const id = parseInt(req.params.id)
		
		// Check if template exists
		const existing = chatTemplateDb.getById(id)
		if (!existing) {
			return res.status(404).json({ success: false, error: 'Template tidak ditemukan' })
		}
		
		const result = chatTemplateDb.delete(id)
		
		if (result.success) {
			res.json({ 
				success: true, 
				message: `Template "${existing.code}" berhasil dihapus` 
			})
		} else {
			res.status(400).json({ success: false, error: result.error })
		}
	} catch (error: any) {
		console.error('Error deleting template:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Toggle template active status
app.patch('/api/templates/:id/toggle', (req, res) => {
	try {
		const id = parseInt(req.params.id)
		
		const result = chatTemplateDb.toggleActive(id)
		
		if (result.success) {
			const template = chatTemplateDb.getById(id)
			res.json({ 
				success: true, 
				message: `Template ${result.isActive ? 'diaktifkan' : 'dinonaktifkan'}`,
				template: template
			})
		} else {
			res.status(400).json({ success: false, error: result.error })
		}
	} catch (error: any) {
		console.error('Error toggling template:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Search templates
app.get('/api/templates/search/:query', (req, res) => {
	try {
		const query = req.params.query
		const templates = chatTemplateDb.search(query)
		
		res.json({
			success: true,
			templates: templates,
			count: templates.length
		})
	} catch (error: any) {
		console.error('Error searching templates:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// ============================================
// API Endpoints for Group Management
// ============================================

// Get all groups
app.get('/api/groups/:sessionId', async (req, res) => {
	try {
		const { sessionId } = req.params
		const groups = await sessionManager.getAllGroups(sessionId)
		
		// Get user's JID for the session
		const sessionInfo = sessionManager.getSessionInfo(sessionId)
		const myJid = sessionInfo?.phoneNumber ? `${sessionInfo.phoneNumber}@s.whatsapp.net` : ''
		
		res.json({
			success: true,
			groups: groups,
			count: groups.length,
			myJid: myJid
		})
	} catch (error: any) {
		console.error('Error fetching groups:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get group metadata
app.get('/api/groups/:sessionId/:groupId/metadata', async (req, res) => {
	try {
		const { sessionId, groupId } = req.params
		const metadata = await sessionManager.getGroupMetadata(sessionId, groupId)
		
		res.json({
			success: true,
			group: metadata
		})
	} catch (error: any) {
		console.error('Error fetching group metadata:', error)
		
		// Check for rate limit error
		const errorMsg = error.message || ''
		if (errorMsg.includes('rate') || errorMsg.includes('overlimit') || errorMsg.includes('429')) {
			res.status(429).json({ 
				success: false, 
				error: 'Rate limit exceeded. Please wait a moment and try again.',
				isRateLimit: true
			})
		} else {
			res.status(500).json({ success: false, error: error.message })
		}
	}
})

// Get group invite code
app.get('/api/groups/:sessionId/:groupId/invite', async (req, res) => {
	try {
		const { sessionId, groupId } = req.params
		const code = await sessionManager.getGroupInviteCode(sessionId, groupId)
		
		res.json({
			success: true,
			inviteCode: code,
			inviteLink: `https://chat.whatsapp.com/${code}`
		})
	} catch (error: any) {
		console.error('Error getting invite code:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Revoke group invite code
app.post('/api/groups/:sessionId/:groupId/revoke-invite', async (req, res) => {
	try {
		const { sessionId, groupId } = req.params
		const newCode = await sessionManager.revokeGroupInvite(sessionId, groupId)
		
		res.json({
			success: true,
			inviteCode: newCode,
			inviteLink: `https://chat.whatsapp.com/${newCode}`
		})
	} catch (error: any) {
		console.error('Error revoking invite:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Join group by invite code
app.post('/api/groups/:sessionId/join', async (req, res) => {
	try {
		const { sessionId } = req.params
		const { inviteCode } = req.body
		
		if (!inviteCode) {
			return res.status(400).json({ success: false, error: 'Invite code is required' })
		}
		
		const groupId = await sessionManager.joinGroupByCode(sessionId, inviteCode)
		
		res.json({
			success: true,
			groupId: groupId,
			message: 'Berhasil bergabung ke grup'
		})
	} catch (error: any) {
		console.error('Error joining group:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Create new group
app.post('/api/groups/:sessionId/create', async (req, res) => {
	try {
		const { sessionId } = req.params
		const { subject, participants } = req.body
		
		if (!subject) {
			return res.status(400).json({ success: false, error: 'Group name is required' })
		}
		
		const group = await sessionManager.createGroup(sessionId, subject, participants || [])
		
		res.json({
			success: true,
			group: group,
			message: `Grup "${subject}" berhasil dibuat`
		})
	} catch (error: any) {
		console.error('Error creating group:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Leave group
app.post('/api/groups/:sessionId/:groupId/leave', async (req, res) => {
	try {
		const { sessionId, groupId } = req.params
		await sessionManager.leaveGroup(sessionId, groupId)
		
		res.json({
			success: true,
			message: 'Berhasil keluar dari grup'
		})
	} catch (error: any) {
		console.error('Error leaving group:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Update group subject
app.put('/api/groups/:sessionId/:groupId/subject', async (req, res) => {
	try {
		const { sessionId, groupId } = req.params
		const { subject } = req.body
		
		if (!subject) {
			return res.status(400).json({ success: false, error: 'Subject is required' })
		}
		
		await sessionManager.updateGroupSubject(sessionId, groupId, subject)
		
		res.json({
			success: true,
			message: 'Nama grup berhasil diubah'
		})
	} catch (error: any) {
		console.error('Error updating group subject:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Update group description
app.put('/api/groups/:sessionId/:groupId/description', async (req, res) => {
	try {
		const { sessionId, groupId } = req.params
		const { description } = req.body
		
		await sessionManager.updateGroupDescription(sessionId, groupId, description || '')
		
		res.json({
			success: true,
			message: 'Deskripsi grup berhasil diubah'
		})
	} catch (error: any) {
		console.error('Error updating group description:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Add participants to group
app.post('/api/groups/:sessionId/:groupId/participants/add', async (req, res) => {
	try {
		const { sessionId, groupId } = req.params
		const { participants } = req.body
		
		if (!participants || !Array.isArray(participants) || participants.length === 0) {
			return res.status(400).json({ success: false, error: 'Participants array is required' })
		}
		
		const result = await sessionManager.addGroupParticipants(sessionId, groupId, participants)
		
		res.json({
			success: true,
			result: result,
			message: `${participants.length} peserta berhasil ditambahkan`
		})
	} catch (error: any) {
		console.error('Error adding participants:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Remove participants from group
app.post('/api/groups/:sessionId/:groupId/participants/remove', async (req, res) => {
	try {
		const { sessionId, groupId } = req.params
		const { participants } = req.body
		
		if (!participants || !Array.isArray(participants) || participants.length === 0) {
			return res.status(400).json({ success: false, error: 'Participants array is required' })
		}
		
		const result = await sessionManager.removeGroupParticipants(sessionId, groupId, participants)
		
		res.json({
			success: true,
			result: result,
			message: `${participants.length} peserta berhasil dikeluarkan`
		})
	} catch (error: any) {
		console.error('Error removing participants:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Promote participants to admin
app.post('/api/groups/:sessionId/:groupId/participants/promote', async (req, res) => {
	try {
		const { sessionId, groupId } = req.params
		const { participants } = req.body
		
		if (!participants || !Array.isArray(participants) || participants.length === 0) {
			return res.status(400).json({ success: false, error: 'Participants array is required' })
		}
		
		const result = await sessionManager.promoteGroupParticipants(sessionId, groupId, participants)
		
		res.json({
			success: true,
			result: result,
			message: `${participants.length} peserta berhasil dijadikan admin`
		})
	} catch (error: any) {
		console.error('Error promoting participants:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Demote participants from admin
app.post('/api/groups/:sessionId/:groupId/participants/demote', async (req, res) => {
	try {
		const { sessionId, groupId } = req.params
		const { participants } = req.body
		
		if (!participants || !Array.isArray(participants) || participants.length === 0) {
			return res.status(400).json({ success: false, error: 'Participants array is required' })
		}
		
		const result = await sessionManager.demoteGroupParticipants(sessionId, groupId, participants)
		
		res.json({
			success: true,
			result: result,
			message: `${participants.length} peserta diturunkan dari admin`
		})
	} catch (error: any) {
		console.error('Error demoting participants:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Send message to group
app.post('/api/groups/:sessionId/:groupId/send', async (req, res) => {
	try {
		const { sessionId, groupId } = req.params
		const { message } = req.body
		
		if (!message) {
			return res.status(400).json({ success: false, error: 'Message is required' })
		}
		
		const result = await sessionManager.sendGroupMessage(sessionId, groupId, message)
		
		res.json({
			success: true,
			messageId: result?.key?.id,
			message: 'Pesan berhasil dikirim ke grup'
		})
	} catch (error: any) {
		console.error('Error sending group message:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Update group settings
app.put('/api/groups/:sessionId/:groupId/settings', async (req, res) => {
	try {
		const { sessionId, groupId } = req.params
		const { setting } = req.body
		
		if (!setting || !['announcement', 'not_announcement', 'locked', 'unlocked'].includes(setting)) {
			return res.status(400).json({ 
				success: false, 
				error: 'Valid setting is required (announcement, not_announcement, locked, unlocked)' 
			})
		}
		
		await sessionManager.updateGroupSettings(sessionId, groupId, setting)
		
		res.json({
			success: true,
			message: 'Pengaturan grup berhasil diubah'
		})
	} catch (error: any) {
		console.error('Error updating group settings:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get group profile picture
app.get('/api/groups/:sessionId/:groupId/picture', async (req, res) => {
	try {
		const { sessionId, groupId } = req.params
		const url = await sessionManager.getGroupProfilePicture(sessionId, groupId)
		
		res.json({
			success: true,
			pictureUrl: url
		})
	} catch (error: any) {
		console.error('Error getting group picture:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// ============================================
// Group Export API Endpoints
// ============================================

// Get all exports
app.get('/api/group-exports', (req, res) => {
	try {
		const sessionId = req.query.sessionId as string
		const limit = parseInt(req.query.limit as string) || undefined
		const offset = parseInt(req.query.offset as string) || undefined
		
		const exports = groupExportDb.getAll({ sessionId, limit, offset })
		const stats = groupExportDb.getStats()
		
		res.json({
			success: true,
			exports: exports,
			stats: stats,
			count: exports.length
		})
	} catch (error: any) {
		console.error('Error fetching group exports:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get single export by ID
app.get('/api/group-exports/:id', (req, res) => {
	try {
		const id = parseInt(req.params.id)
		const exportData = groupExportDb.getById(id)
		
		if (!exportData) {
			return res.status(404).json({ success: false, error: 'Export not found' })
		}
		
		res.json({
			success: true,
			export: exportData
		})
	} catch (error: any) {
		console.error('Error fetching export:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Create new export record
app.post('/api/group-exports', (req, res) => {
	try {
		const { sessionId, phoneNumber, fileName, totalGroups, totalMembers, phoneNumbers, lidCount, groupsData } = req.body
		
		if (!sessionId || !fileName) {
			return res.status(400).json({ success: false, error: 'Session ID and file name are required' })
		}
		
		// Create export record
		const result = groupExportDb.create({
			session_id: sessionId,
			phone_number: phoneNumber || null,
			file_name: fileName,
			file_path: path.join(exportsDir, fileName),
			total_groups: totalGroups || 0,
			total_members: totalMembers || 0,
			phone_numbers: phoneNumbers || 0,
			lid_count: lidCount || 0,
			groups_data: groupsData ? JSON.stringify(groupsData) : null,
			status: 'completed'
		})
		
		if (result.success) {
			res.json({
				success: true,
				id: result.id,
				message: 'Export record created successfully'
			})
		} else {
			res.status(400).json({ success: false, error: result.error })
		}
	} catch (error: any) {
		console.error('Error creating export record:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Upload export file
app.post('/api/group-exports/:id/upload', (req, res) => {
	try {
		const id = parseInt(req.params.id)
		const { fileData } = req.body
		
		const exportRecord = groupExportDb.getById(id)
		if (!exportRecord) {
			return res.status(404).json({ success: false, error: 'Export not found' })
		}
		
		if (fileData) {
			// Save file
			const buffer = Buffer.from(fileData, 'base64')
			const filePath = path.join(exportsDir, exportRecord.file_name)
			fs.writeFileSync(filePath, buffer)
			
			// Update record with file path and size
			groupExportDb.update(id, {
				file_path: filePath,
				file_size: buffer.length
			})
		}
		
		res.json({
			success: true,
			message: 'File uploaded successfully'
		})
	} catch (error: any) {
		console.error('Error uploading export file:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Download export file
app.get('/api/group-exports/:id/download', (req, res) => {
	try {
		const id = parseInt(req.params.id)
		const exportRecord = groupExportDb.getById(id)
		
		if (!exportRecord) {
			return res.status(404).json({ success: false, error: 'Export not found' })
		}
		
		const filePath = exportRecord.file_path || path.join(exportsDir, exportRecord.file_name)
		
		if (!fs.existsSync(filePath)) {
			return res.status(404).json({ success: false, error: 'File not found on server' })
		}
		
		res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
		res.setHeader('Content-Disposition', `attachment; filename="${exportRecord.file_name}"`)
		
		const fileStream = fs.createReadStream(filePath)
		fileStream.pipe(res)
	} catch (error: any) {
		console.error('Error downloading export:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Delete export
app.delete('/api/group-exports/:id', (req, res) => {
	try {
		const id = parseInt(req.params.id)
		
		// Get export record first
		const exportRecord = groupExportDb.getById(id)
		if (!exportRecord) {
			return res.status(404).json({ success: false, error: 'Export not found' })
		}
		
		// Delete file if exists
		if (exportRecord.file_path && fs.existsSync(exportRecord.file_path)) {
			fs.unlinkSync(exportRecord.file_path)
		}
		
		// Delete from database
		const result = groupExportDb.delete(id)
		
		if (result.success) {
			res.json({
				success: true,
				message: 'Export deleted successfully'
			})
		} else {
			res.status(400).json({ success: false, error: result.error })
		}
	} catch (error: any) {
		console.error('Error deleting export:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Bulk delete exports
app.post('/api/group-exports/bulk-delete', (req, res) => {
	try {
		const { ids } = req.body
		
		if (!ids || !Array.isArray(ids) || ids.length === 0) {
			return res.status(400).json({ success: false, error: 'IDs array is required' })
		}
		
		// Delete files
		for (const id of ids) {
			const exportRecord = groupExportDb.getById(id)
			if (exportRecord?.file_path && fs.existsSync(exportRecord.file_path)) {
				try {
					fs.unlinkSync(exportRecord.file_path)
				} catch (e) {
					console.warn(`Failed to delete file: ${exportRecord.file_path}`)
				}
			}
		}
		
		// Delete from database
		const result = groupExportDb.bulkDelete(ids)
		
		if (result.success) {
			res.json({
				success: true,
				deleted: result.deleted,
				message: `${result.deleted} export(s) deleted successfully`
			})
		} else {
			res.status(400).json({ success: false, error: result.error })
		}
	} catch (error: any) {
		console.error('Error bulk deleting exports:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get export statistics
app.get('/api/group-exports/statistics', (req, res) => {
	try {
		const stats = groupExportDb.getStats()
		res.json({
			success: true,
			stats: stats
		})
	} catch (error: any) {
		console.error('Error fetching export statistics:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// ============================================
// User Frontend API Endpoints
// ============================================

// Connect session (for user frontend)
app.post('/api/sessions/:sessionId/connect', async (req, res) => {
	try {
		const { sessionId } = req.params
		
		// Check if session already exists and connected
		const existingSession = sessionManager.getSessionInfo(sessionId)
		if (existingSession?.status === 'connected') {
			return res.json({ 
				success: false, 
				connected: true,
				message: 'Session already connected' 
			})
		}
		
		// Create or start session
		sessionManager.createSession(sessionId)
		await sessionManager.startSession(sessionId, 'qr')
		
		res.json({
			success: true,
			message: `Session ${sessionId} connecting...`,
			sessionId: sessionId
		})
	} catch (error: any) {
		console.error('Error connecting session:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get groups for session (for user frontend)
// Uses getAllGroups directly which already includes LID resolution
app.get('/api/sessions/:sessionId/groups', async (req, res) => {
	try {
		const { sessionId } = req.params
		
		// Check if session is connected
		const sessionInfo = sessionManager.getSessionInfo(sessionId)
		if (!sessionInfo || sessionInfo.status !== 'connected') {
			return res.status(400).json({ 
				success: false, 
				error: 'Session not connected' 
			})
		}
		
		console.log(`📋 Frontend requesting groups for session: ${sessionId}`)
		
		// Get all groups with full metadata (already includes LID resolution)
		const groups = await sessionManager.getAllGroups(sessionId)
		
		// Calculate stats - use same logic as group management
		let totalParticipants = 0
		let totalPhones = 0
		let totalLid = 0
		
		groups.forEach(group => {
			const participants = group.participants || []
			totalParticipants += participants.length
			
			participants.forEach((p: any) => {
				// Check if LID - same logic as group management
				// A participant is LID if:
				// 1. id contains @lid
				// 2. originalId contains @lid AND id equals originalId (not resolved)
				const isLid = p.id?.includes('@lid') || 
					(p.originalId?.includes('@lid') && p.id === p.originalId)
				
				if (isLid) {
					totalLid++
				} else if (p.id) {
					totalPhones++
				}
			})
		})
		
		console.log(`✅ Found ${groups.length} groups, ${totalParticipants} participants (${totalPhones} phones, ${totalLid} LIDs)`)
		
		res.json({
			success: true,
			groups: groups,
			count: groups.length,
			stats: {
				totalGroups: groups.length,
				totalParticipants,
				totalPhones,
				totalLid
			}
		})
	} catch (error: any) {
		console.error('Error fetching groups for session:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Export groups to Excel (for user frontend)
// Format: Nama Grup | ID Grup | Nomor HP (hanya nomor HP, bukan LID)
app.post('/api/exports', async (req, res) => {
	try {
		const { sessionId, groups, userName, phoneNumber: userPhone } = req.body
		
		if (!sessionId) {
			return res.status(400).json({ success: false, error: 'Session ID is required' })
		}
		
		// Get session info for phone number
		const sessionInfo = sessionManager.getSessionInfo(sessionId)
		const phoneNumber = userPhone || sessionInfo?.phoneNumber || null
		
		// Helper function to check if participant is LID
		const isParticipantLid = (p: any): boolean => {
			// A participant is LID if:
			// 1. id contains @lid
			// 2. originalId contains @lid AND id equals originalId (not resolved)
			return p.id?.includes('@lid') || 
				(p.originalId?.includes('@lid') && p.id === p.originalId)
		}
		
		// Calculate statistics
		let totalGroups = 0
		let totalParticipants = 0
		let totalPhoneNumbers = 0
		let totalLid = 0
		
		if (groups && Array.isArray(groups)) {
			totalGroups = groups.length
			groups.forEach(group => {
				const participants = group.participants || []
				totalParticipants += participants.length
				participants.forEach((p: any) => {
					if (isParticipantLid(p)) {
						totalLid++
					} else if (p.id) {
						totalPhoneNumbers++
					}
				})
			})
		}
		
		console.log(`📊 Creating export: ${totalGroups} groups, ${totalParticipants} participants (${totalPhoneNumbers} phones, ${totalLid} LIDs)`)
		
		// Generate filename
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
		const filename = `whatsapp_export_${sessionId}_${timestamp}.xlsx`
		const filePath = path.join(exportsDir, filename)
		
		// Create Excel file using XLSX
		const workbook = XLSX.utils.book_new()
		
		// ============================================
		// SHEET 1: DATA KONTAK (Main Data)
		// Format: No | Nama Grup | ID Grup | Nomor HP (hanya nomor HP valid, bukan LID)
		// ============================================
		const mainDataRows: any[][] = [
			['No', 'Nama Grup', 'ID Grup', 'Nomor HP']
		]
		
		let rowNumber = 1
		let actualPhoneCount = 0
		
		if (groups && Array.isArray(groups)) {
			groups.forEach(group => {
				const groupName = group.subject || group.name || 'Unknown Group'
				const groupId = group.id || ''
				const participants = group.participants || []
				
				participants.forEach((p: any) => {
					if (p.id) {
						// Only include phone numbers, NOT LIDs
						if (!isParticipantLid(p)) {
							// Extract phone number from ID
							const phoneNum = p.id.replace('@s.whatsapp.net', '').replace('@c.us', '')
							
							mainDataRows.push([
								rowNumber++,
								groupName,
								groupId,
								phoneNum
							])
							actualPhoneCount++
						}
					}
				})
			})
		}
		
		const mainDataSheet = XLSX.utils.aoa_to_sheet(mainDataRows)
		mainDataSheet['!cols'] = [
			{ wch: 8 },   // No
			{ wch: 40 },  // Nama Grup
			{ wch: 45 },  // ID Grup
			{ wch: 18 }   // Nomor HP
		]
		XLSX.utils.book_append_sheet(workbook, mainDataSheet, 'Data Kontak')
		
		// ============================================
		// SHEET 2: DAFTAR GRUP (Group Summary)
		// ============================================
		const groupsListData: any[][] = [
			['No', 'Nama Grup', 'ID Grup', 'Total Peserta', 'Nomor HP Valid', 'LID']
		]
		
		if (groups && Array.isArray(groups)) {
			groups.forEach((group, index) => {
				const participants = group.participants || []
				const phones = participants.filter((p: any) => !isParticipantLid(p) && p.id).length
				const lids = participants.filter((p: any) => isParticipantLid(p)).length
				
				groupsListData.push([
					index + 1,
					group.subject || group.name || 'Unknown',
					group.id || '',
					participants.length,
					phones,
					lids
				])
			})
		}
		
		const groupsSheet = XLSX.utils.aoa_to_sheet(groupsListData)
		groupsSheet['!cols'] = [
			{ wch: 6 },   // No
			{ wch: 40 },  // Nama Grup
			{ wch: 45 },  // ID Grup
			{ wch: 14 },  // Total Peserta
			{ wch: 15 },  // Nomor HP Valid
			{ wch: 8 }    // LID
		]
		XLSX.utils.book_append_sheet(workbook, groupsSheet, 'Daftar Grup')
		
		// ============================================
		// SHEET 3: RINGKASAN (Summary)
		// ============================================
		const summaryData = [
			['LAPORAN EXPORT DATA WHATSAPP'],
			[''],
			['Informasi User'],
			['Nama', userName || '-'],
			['Session ID', sessionId],
			['Nomor HP', phoneNumber || '-'],
			['Tanggal Export', new Date().toLocaleString('id-ID', { 
				weekday: 'long', 
				year: 'numeric', 
				month: 'long', 
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			})],
			[''],
			['Statistik Data'],
			['Total Grup', totalGroups],
			['Total Peserta', totalParticipants],
			['Nomor HP Valid (ter-export)', actualPhoneCount],
			['LID (tidak ter-export)', totalLid],
			[''],
			['Keterangan:'],
			['- Hanya nomor HP valid yang ter-export ke sheet Data Kontak'],
			['- LID (Linked ID) tidak di-export karena bukan nomor HP'],
			['- LID adalah ID internal WhatsApp yang belum ter-resolve']
		]
		
		const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
		summarySheet['!cols'] = [
			{ wch: 35 },
			{ wch: 50 }
		]
		XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ringkasan')
		
		// Write file
		XLSX.writeFile(workbook, filePath)
		
		// Get file size
		const stats = fs.statSync(filePath)
		const fileSize = stats.size
		
		// Save to database
		const result = groupExportDb.create({
			session_id: sessionId,
			phone_number: phoneNumber,
			file_name: filename,
			file_path: filePath,
			total_groups: totalGroups,
			total_members: totalParticipants,
			phone_numbers: totalPhoneNumbers,
			lid_count: totalLid,
			groups_data: groups ? JSON.stringify(groups) : null,
			file_size: fileSize,
			status: 'completed'
		})
		
		if (result.success) {
			const exportRecord = groupExportDb.getById(Number(result.id))
			
			res.json({
				success: true,
				export: {
					id: result.id,
					session_id: sessionId,
					phone_number: phoneNumber,
					filename: filename,
					file_path: filePath,
					total_groups: totalGroups,
					total_participants: totalParticipants,
					total_phone_numbers: totalPhoneNumbers,
					total_lid: totalLid,
					file_size: fileSize,
					created_at: exportRecord?.created_at || new Date().toISOString()
				},
				message: 'Export created successfully'
			})
		} else {
			res.status(400).json({ success: false, error: result.error })
		}
	} catch (error: any) {
		console.error('Error creating export:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get all exports (for user frontend) - alias to group-exports
app.get('/api/exports', (req, res) => {
	try {
		const limit = parseInt(req.query.limit as string) || undefined
		const exports = groupExportDb.getAll({ limit })
		
		res.json({
			success: true,
			exports: exports.map(exp => ({
				id: exp.id,
				session_id: exp.session_id,
				phone_number: exp.phone_number,
				filename: exp.file_name,
				file_path: exp.file_path,
				total_groups: exp.total_groups,
				total_participants: exp.total_members,
				total_phone_numbers: exp.phone_numbers,
				total_lid: exp.lid_count,
				groups_data: exp.groups_data,
				file_size: exp.file_size,
				created_at: exp.created_at
			}))
		})
	} catch (error: any) {
		console.error('Error fetching exports:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get single export (for user frontend)
app.get('/api/exports/:id', (req, res) => {
	try {
		const id = parseInt(req.params.id)
		const exportData = groupExportDb.getById(id)
		
		if (!exportData) {
			return res.status(404).json({ success: false, error: 'Export not found' })
		}
		
		res.json({
			success: true,
			export: {
				id: exportData.id,
				session_id: exportData.session_id,
				phone_number: exportData.phone_number,
				filename: exportData.file_name,
				file_path: exportData.file_path,
				total_groups: exportData.total_groups,
				total_participants: exportData.total_members,
				total_phone_numbers: exportData.phone_numbers,
				total_lid: exportData.lid_count,
				groups_data: exportData.groups_data,
				file_size: exportData.file_size,
				created_at: exportData.created_at
			}
		})
	} catch (error: any) {
		console.error('Error fetching export:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Download export (for user frontend)
app.get('/api/exports/:id/download', (req, res) => {
	try {
		const id = parseInt(req.params.id)
		const exportRecord = groupExportDb.getById(id)
		
		if (!exportRecord) {
			return res.status(404).json({ success: false, error: 'Export not found' })
		}
		
		const filePath = exportRecord.file_path || path.join(exportsDir, exportRecord.file_name)
		
		if (!fs.existsSync(filePath)) {
			return res.status(404).json({ success: false, error: 'File not found on server' })
		}
		
		res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
		res.setHeader('Content-Disposition', `attachment; filename="${exportRecord.file_name}"`)
		
		const fileStream = fs.createReadStream(filePath)
		fileStream.pipe(res)
	} catch (error: any) {
		console.error('Error downloading export:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Delete export (for user frontend)
app.delete('/api/exports/:id', (req, res) => {
	try {
		const id = parseInt(req.params.id)
		
		// Get export record first
		const exportRecord = groupExportDb.getById(id)
		if (!exportRecord) {
			return res.status(404).json({ success: false, error: 'Export not found' })
		}
		
		// Delete file if exists
		if (exportRecord.file_path && fs.existsSync(exportRecord.file_path)) {
			fs.unlinkSync(exportRecord.file_path)
		}
		
		// Delete from database
		const result = groupExportDb.delete(id)
		
		if (result.success) {
			res.json({
				success: true,
				message: 'Export deleted successfully'
			})
		} else {
			res.status(400).json({ success: false, error: result.error })
		}
	} catch (error: any) {
		console.error('Error deleting export:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Export groups to Excel with proper format (like group management page)
app.post('/api/export-groups-excel', async (req, res) => {
	try {
		const { sessionId, phoneNumber, groups, totalGroups, totalParticipants, totalPhoneNumbers, totalLid } = req.body
		
		if (!sessionId) {
			return res.status(400).json({ success: false, error: 'Session ID is required' })
		}
		
		if (!groups || !Array.isArray(groups) || groups.length === 0) {
			return res.status(400).json({ success: false, error: 'No groups data provided' })
		}
		
		// Generate filename
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
		const filename = `whatsapp_contacts_${sessionId}_${timestamp}.xlsx`
		const filePath = path.join(exportsDir, filename)
		
		// Create Excel workbook
		const workbook = XLSX.utils.book_new()
		
		// ============================================
		// SHEET 1: DATA NOMOR HP (Main Data)
		// Format: No | Nama Grup | ID Grup | Nomor HP | Role
		// ============================================
		const mainDataRows: any[][] = [
			['No', 'Nama Grup', 'ID Grup', 'Nomor HP', 'Role']
		]
		
		let rowNumber = 1
		let actualTotalPhones = 0
		let actualTotalLid = 0
		
		groups.forEach((group: any) => {
			const groupName = group.subject || group.name || 'Unknown Group'
			const groupId = group.id || ''
			const participants = group.participants || []
			
			participants.forEach((participant: any) => {
				const participantId = participant.id || ''
				const isLid = participantId.includes(':')
				
				// Extract phone number from ID
				let phoneNum = participantId.replace('@s.whatsapp.net', '').replace('@c.us', '')
				
				// For LID, mark it clearly
				if (isLid) {
					const lidParts = phoneNum.split(':')
					phoneNum = `LID:${lidParts[0] || phoneNum}`
					actualTotalLid++
				} else {
					actualTotalPhones++
				}
				
				// Determine role
				let role = 'Member'
				if (participant.admin === 'superadmin') {
					role = 'Owner'
				} else if (participant.admin) {
					role = 'Admin'
				}
				
				mainDataRows.push([
					rowNumber++,
					groupName,
					groupId,
					phoneNum,
					role
				])
			})
		})
		
		const mainDataSheet = XLSX.utils.aoa_to_sheet(mainDataRows)
		
		// Set column widths for main data sheet
		mainDataSheet['!cols'] = [
			{ wch: 6 },   // No
			{ wch: 35 },  // Nama Grup
			{ wch: 40 },  // ID Grup
			{ wch: 20 },  // Nomor HP
			{ wch: 10 }   // Role
		]
		
		XLSX.utils.book_append_sheet(workbook, mainDataSheet, 'Data Nomor HP')
		
		// ============================================
		// SHEET 2: RINGKASAN (Summary)
		// ============================================
		const summaryData = [
			['LAPORAN EXPORT DATA WHATSAPP'],
			[''],
			['Informasi Session'],
			['Session ID', sessionId],
			['Nomor HP', phoneNumber || '-'],
			['Tanggal Export', new Date().toLocaleString('id-ID', { 
				weekday: 'long', 
				year: 'numeric', 
				month: 'long', 
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			})],
			[''],
			['Statistik Data'],
			['Total Grup', totalGroups || groups.length],
			['Total Kontak', rowNumber - 1],
			['Nomor HP Valid', actualTotalPhones],
			['LID (Linked ID)', actualTotalLid],
			[''],
			['Keterangan:'],
			['- Nomor HP Valid: Nomor yang sudah ter-resolve dan dapat dihubungi'],
			['- LID: Linked Identity, nomor yang belum ter-resolve karena privasi WhatsApp'],
			['- Untuk melihat nomor LID, Anda perlu berinteraksi langsung dengan kontak tersebut']
		]
		
		const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
		summarySheet['!cols'] = [
			{ wch: 25 },
			{ wch: 50 }
		]
		XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ringkasan')
		
		// ============================================
		// SHEET 3: DAFTAR GRUP (Group List)
		// ============================================
		const groupListData: any[][] = [
			['No', 'Nama Grup', 'ID Grup', 'Total Peserta', 'Nomor HP Valid', 'LID', 'Persentase Valid']
		]
		
		groups.forEach((group: any, index: number) => {
			const groupName = group.subject || group.name || 'Unknown Group'
			const groupId = group.id || ''
			const participants = group.participants || []
			
			const phones = participants.filter((p: any) => p.id && !p.id.includes(':')).length
			const lids = participants.filter((p: any) => p.id && p.id.includes(':')).length
			const total = participants.length
			const validPercent = total > 0 ? ((phones / total) * 100).toFixed(1) + '%' : '0%'
			
			groupListData.push([
				index + 1,
				groupName,
				groupId,
				total,
				phones,
				lids,
				validPercent
			])
		})
		
		const groupListSheet = XLSX.utils.aoa_to_sheet(groupListData)
		groupListSheet['!cols'] = [
			{ wch: 6 },   // No
			{ wch: 35 },  // Nama Grup
			{ wch: 40 },  // ID Grup
			{ wch: 12 },  // Total Peserta
			{ wch: 15 },  // Nomor HP Valid
			{ wch: 8 },   // LID
			{ wch: 15 }   // Persentase Valid
		]
		XLSX.utils.book_append_sheet(workbook, groupListSheet, 'Daftar Grup')
		
		// ============================================
		// SHEET 4+: Per Grup (Detail sheets)
		// ============================================
		groups.forEach((group: any, index: number) => {
			const groupName = (group.subject || group.name || 'Group').substring(0, 25)
			const safeSheetName = `${index + 1}. ${groupName}`.replace(/[\\/*?[\]:]/g, '')
			
			const groupDetailData: any[][] = [
				[`Detail Grup: ${group.subject || group.name || 'Unknown'}`],
				[`ID: ${group.id || '-'}`],
				[''],
				['No', 'Nomor HP', 'Tipe', 'Role']
			]
			
			const participants = group.participants || []
			participants.forEach((participant: any, pIndex: number) => {
				const participantId = participant.id || ''
				const isLid = participantId.includes(':')
				
				let phoneNum = participantId.replace('@s.whatsapp.net', '').replace('@c.us', '')
				if (isLid) {
					const lidParts = phoneNum.split(':')
					phoneNum = `LID:${lidParts[0] || phoneNum}`
				}
				
				const type = isLid ? 'LID' : 'Phone'
				let role = 'Member'
				if (participant.admin === 'superadmin') {
					role = 'Owner'
				} else if (participant.admin) {
					role = 'Admin'
				}
				
				groupDetailData.push([
					pIndex + 1,
					phoneNum,
					type,
					role
				])
			})
			
			const groupDetailSheet = XLSX.utils.aoa_to_sheet(groupDetailData)
			groupDetailSheet['!cols'] = [
				{ wch: 6 },
				{ wch: 25 },
				{ wch: 10 },
				{ wch: 10 }
			]
			
			// Limit sheet name to 31 characters (Excel limit)
			const finalSheetName = safeSheetName.substring(0, 31)
			XLSX.utils.book_append_sheet(workbook, groupDetailSheet, finalSheetName)
		})
		
		// Write Excel file
		XLSX.writeFile(workbook, filePath)
		
		// Get file size
		const stats = fs.statSync(filePath)
		const fileSize = stats.size
		
		// Save to database
		const result = groupExportDb.create({
			session_id: sessionId,
			phone_number: phoneNumber || null,
			file_name: filename,
			file_path: filePath,
			total_groups: groups.length,
			total_members: rowNumber - 1,
			phone_numbers: actualTotalPhones,
			lid_count: actualTotalLid,
			groups_data: JSON.stringify(groups),
			file_size: fileSize,
			status: 'completed'
		})
		
		if (result.success) {
			res.json({
				success: true,
				exportId: result.id,
				fileName: filename,
				filePath: filePath,
				fileSize: fileSize,
				stats: {
					totalGroups: groups.length,
					totalContacts: rowNumber - 1,
					phoneNumbers: actualTotalPhones,
					lid: actualTotalLid
				},
				message: 'Export berhasil dibuat dengan format lengkap'
			})
		} else {
			res.status(400).json({ success: false, error: result.error })
		}
	} catch (error: any) {
		console.error('Error creating Excel export:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

const PORT = process.env.PORT || 3000

server.listen(PORT, () => {
	console.log(`🚀 Server running on http://localhost:${PORT}`)
	console.log(`📱 Open browser and visit http://localhost:${PORT}`)
})
