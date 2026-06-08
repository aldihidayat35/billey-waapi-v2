import express from 'express'
import { createServer } from 'http'
import { Server as SocketIO } from 'socket.io'
import { SessionManager } from './session-manager'
import { logger as activityLogger } from './logger'
import { messageLogDb, messageMutationDb, sessionLogDb, chatTemplateDb, groupExportDb, autoReplyDb, autoReplyLogDb, autoReplyCooldownDb, autoForwardConfigDb, autoForwardTokenDb, autoForwardLogDb, db, dbMaintenance, memberSessionDb, startMediaAutoCleanup, fcmTokenDb, notificationDb, appSettingDb } from './database.js'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as XLSX from 'xlsx'
import cookieParser from 'cookie-parser'
import { 
	login, logout, validateSession, userDb, sessionDb, 
	linkWaSessionToUser, unlinkWaSessionFromUser, getWaSessionsForUser, userOwnsSession,
	User, UserRole, generateToken, hashPassword, workerAssignmentDb, assignmentLogDb, hiddenMessageDb
} from './auth.js'
import { 
	authMiddleware, adminMiddleware, adminOrApiKeyMiddleware, optionalAuthMiddleware, 
	sessionOwnerMiddleware, tokenMiddleware, apiKeyMiddleware, SESSION_COOKIE_NAME,
	getUserSessionIds, getSessionFilter, getUserFilter
} from './middleware.js'
import multer from 'multer'
import { NotificationService, registerUserSocket, unregisterUserSocket, registerAdminSocket, unregisterAdminSocket, isUserOnline, getOnlineUserCount } from './notification.js'
import { saveMedia, saveMediaBase64, getMediaDir, getMediaPath, cleanupOldMedia, migrateMediaFromDb } from './media-storage.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const publicDir = path.join(__dirname, 'public')
const adminPublicDir = path.join(publicDir, 'admin')

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
	},
	maxHttpBufferSize: 50 * 1024 * 1024 // 50 MB – match express.json limit
})

const sessionManager = new SessionManager(io)
const notificationService = new NotificationService(io)
sessionManager.setNotificationService(notificationService)

// Parse cookies and JSON body FIRST
app.use(cookieParser()) // Parse cookies for session management
app.use(express.json({ limit: '50mb' })) // Increase limit for media uploads

// ============================================
// Authentication Middleware for Static Files
// ============================================

// Middleware to protect HTML pages (except login and public assets)
const protectStaticFiles = (req: any, res: any, next: any) => {
	const path = req.path.toLowerCase()
	
	// Allow these paths without authentication
	const publicPaths = [
		'/auth/login',
		'/auth/login.html',
		'/api-docs.html',
		'/api-docs',
		'/assets/',
		'/js/',
		'/css/',
		'/fonts/',
		'/media/',
		'/plugins/',
		'/uploads/',
		'.css',
		'.js',
		'.png',
		'.jpg',
		'.jpeg',
		'.gif',
		'.svg',
		'.ico',
		'.woff',
		'.woff2',
		'.ttf',
		'.eot'
	]
	
	// Check if path is public
	const isPublic = publicPaths.some(p => path.includes(p) || path.endsWith(p))
	
	if (isPublic) {
		return next()
	}

	// API routes have their own auth middleware — never apply HTML redirect
	if (path.startsWith('/api/')) {
		return next()
	}

	// Check if it's an HTML file or a page route (no extension)
	const isHtmlOrPage = path.endsWith('.html') || 
						 (!path.includes('.') && path !== '/') ||
						 path === '/'
	
	if (isHtmlOrPage) {
		// Check authentication
		const sessionToken = req.cookies?.[SESSION_COOKIE_NAME]
		
		if (!sessionToken) {
			return res.redirect('/auth/login')
		}
		
		const user = validateSession(sessionToken)
		if (!user) {
			res.clearCookie(SESSION_COOKIE_NAME)
			return res.redirect('/auth/login')
		}
		
		// User is authenticated, attach to request
		req.user = user
	}
	
	next()
}

// Apply protection middleware BEFORE static files
app.use(protectStaticFiles)

// Dynamic PWA manifest — must be before express.static to override public/manifest.json
app.get('/manifest.json', (req, res) => {
	try {
		const s = appSettingDb.get()
		const faviconUrl = s.favicon ? `/uploads/settings/${path.basename(s.favicon)}` : '/assets/media/logos/favicon.ico'
		// For PWA, use the custom favicon for all icon sizes
		// The browser will resize as needed; using PNG favicon gives best results
		const pwaIconUrl = s.favicon ? `/uploads/settings/${path.basename(s.favicon)}` : '/assets/media/logos/pwa-192.png'
		const pwaIcon512Url = s.favicon ? `/uploads/settings/${path.basename(s.favicon)}` : '/assets/media/logos/pwa-512.png'
		const manifest = {
			name: s.app_name || 'Billey WA - WhatsApp Multi Session',
			short_name: s.app_name || 'Billey WA',
			description: s.app_tagline || 'WhatsApp Multi Session Manager & Chat Portal',
			start_url: '/member/dashboard.html',
			scope: '/',
			display: 'standalone',
			orientation: 'portrait',
			theme_color: '#008069',
			background_color: '#ffffff',
			icons: [
				{ src: faviconUrl, sizes: '64x64', type: 'image/png' },
				{ src: pwaIconUrl, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
				{ src: pwaIcon512Url, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
			]
		}
		res.setHeader('Content-Type', 'application/manifest+json')
		res.json(manifest)
	} catch {
		res.sendFile(path.join(publicDir, 'manifest.json'))
	}
})

// Serve static files (now protected by middleware above)
app.use(express.static(publicDir))
app.use(express.static(adminPublicDir))
app.use('/api', express.static('api')) // Serve API folder
app.use('/media', express.static(getMediaDir(), {
	maxAge: '1d',
	immutable: true,
	fallthrough: true
}))

// ============================================
// Authentication Routes
// ============================================

// Auth page routes
app.get('/auth/login', (req, res) => {
	res.sendFile(path.join(publicDir, 'auth', 'login.html'))
})

app.get('/auth/logout', (req, res) => {
	const sessionToken = req.cookies?.[SESSION_COOKIE_NAME]
	if (sessionToken) {
		logout(sessionToken)
		res.clearCookie(SESSION_COOKIE_NAME)
	}
	res.redirect('/auth/login')
})

// API: Login
app.post('/api/auth/login', (req, res) => {
	try {
		const { email, password } = req.body

		if (!email || !password) {
			return res.status(400).json({ 
				success: false, 
				error: 'Email dan password wajib diisi' 
			})
		}

		const result = login(
			email, 
			password, 
			req.ip, 
			req.headers['user-agent']
		)

		if (!result.success) {
			return res.status(401).json(result)
		}

		// Persistent login: 30 days for member/worker, 24h for admin
		const isMember = result.user?.role === 'memberwa' || result.user?.role === 'worker'
		const maxAge = isMember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000

		// Set session cookie
		res.cookie(SESSION_COOKIE_NAME, result.sessionToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			maxAge,
			sameSite: 'lax'
		})

		res.json({
			success: true,
			message: 'Login berhasil',
			user: result.user
		})
	} catch (error: any) {
		console.error('Login error:', error)
		res.status(500).json({ success: false, error: 'Terjadi kesalahan server' })
	}
})

// API: Logout
app.post('/api/auth/logout', (req, res) => {
	const sessionToken = req.cookies?.[SESSION_COOKIE_NAME]
	if (sessionToken) {
		logout(sessionToken)
		res.clearCookie(SESSION_COOKIE_NAME)
	}
	res.json({ success: true, message: 'Logout berhasil' })
})

// API: Get current user
app.get('/api/auth/me', authMiddleware, (req, res) => {
	res.json({
		success: true,
		user: {
			id: req.user!.id,
			name: req.user!.name,
			email: req.user!.email,
			role: req.user!.role,
			token: req.user!.token,
			status: req.user!.status
		}
	})
})

// API: Change own password
app.post('/api/auth/change-password', authMiddleware, (req, res) => {
	try {
		const { currentPassword, newPassword, confirmPassword } = req.body

		if (!currentPassword || !newPassword || !confirmPassword) {
			return res.status(400).json({ 
				success: false, 
				error: 'Semua field wajib diisi' 
			})
		}

		if (newPassword !== confirmPassword) {
			return res.status(400).json({ 
				success: false, 
				error: 'Password baru tidak cocok' 
			})
		}

		if (newPassword.length < 6) {
			return res.status(400).json({ 
				success: false, 
				error: 'Password minimal 6 karakter' 
			})
		}

		// Verify current password
		const user = userDb.getById(req.user!.id)
		if (!user) {
			return res.status(404).json({ success: false, error: 'User tidak ditemukan' })
		}

		import('./auth.js').then(({ verifyPassword }) => {
			if (!verifyPassword(currentPassword, user.password)) {
				return res.status(400).json({ 
					success: false, 
					error: 'Password saat ini salah' 
				})
			}

			const result = userDb.changePassword(req.user!.id, newPassword)
			res.json(result)
		})
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// ============================================
// User Management API (Admin Only)
// ============================================

// Get all users
app.get('/api/users', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const { page, limit, role, status, search } = req.query
		const result = userDb.getAll({
			page: page ? parseInt(page as string) : 1,
			limit: limit ? parseInt(limit as string) : 20,
			role: role as UserRole,
			status: status as 'aktif' | 'non-aktif',
			search: search as string
		})
		res.json({ success: true, ...result })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get user stats
app.get('/api/users/stats', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const stats = userDb.getCountByRole()
		res.json({ success: true, stats })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get single user
app.get('/api/users/:id', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const id = parseInt(req.params.id)
		const user = userDb.getById(id)
		if (!user) {
			return res.status(404).json({ success: false, error: 'User tidak ditemukan' })
		}
		res.json({ 
			success: true, 
			user: { ...user, password: '***' }
		})
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Create user
app.post('/api/users', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const { name, email, password, role, status, phone_visible, whatsapp_number } = req.body

		if (!name || !email || !password) {
			return res.status(400).json({ 
				success: false, 
				error: 'Nama, email, dan password wajib diisi' 
			})
		}

		if (password.length < 6) {
			return res.status(400).json({ 
				success: false, 
				error: 'Password minimal 6 karakter' 
			})
		}

		const result = userDb.create({ name, email, password, role, status, phone_visible: phone_visible !== undefined ? Number(phone_visible) : 1, whatsapp_number: whatsapp_number || undefined })
		
		if (result.success) {
			const newUser = userDb.getById(result.id!)

			// Notify CRM about worker changes
			if (newUser && (role === 'worker' || newUser.role === 'worker')) {
				import('./crm-sync.js').then(({ notifyWorkerChanged }) => {
					notifyWorkerChanged('created', {
						id: newUser.id!, name: newUser.name, email: newUser.email,
						role: newUser.role, status: newUser.status,
					}).catch(() => {})
				}).catch(() => {})
			}

			res.json({ 
				success: true, 
				message: 'User berhasil dibuat',
				user: newUser ? { ...newUser, password: '***' } : null
			})
		} else {
			res.status(400).json(result)
		}
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Update user
app.put('/api/users/:id', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const id = parseInt(req.params.id)
		const { name, email, role, status, phone_visible, whatsapp_number } = req.body

		const result = userDb.update(id, { name, email, role, status, phone_visible: phone_visible !== undefined ? Number(phone_visible) : undefined, whatsapp_number: whatsapp_number || undefined })
		
		if (result.success) {
			const updatedUser = userDb.getById(id)

			// Notify CRM about worker changes
			if (updatedUser && updatedUser.role === 'worker') {
				import('./crm-sync.js').then(({ notifyWorkerChanged }) => {
					notifyWorkerChanged('updated', {
						id: updatedUser.id!, name: updatedUser.name, email: updatedUser.email,
						role: updatedUser.role, status: updatedUser.status,
					}).catch(() => {})
				}).catch(() => {})
			}

			res.json({ 
				success: true, 
				message: 'User berhasil diupdate',
				user: updatedUser ? { ...updatedUser, password: '***' } : null
			})
		} else {
			res.status(400).json(result)
		}
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Delete user
app.delete('/api/users/:id', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const id = parseInt(req.params.id)
		
		// Prevent self-deletion
		if (id === req.user!.id) {
			return res.status(400).json({ 
				success: false, 
				error: 'Tidak bisa menghapus akun sendiri' 
			})
		}

		const result = userDb.delete(id)
		res.json(result.success ? { success: true, message: 'User berhasil dihapus' } : result)
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Reset user password (admin)
app.post('/api/users/:id/reset-password', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const id = parseInt(req.params.id)
		const { newPassword } = req.body

		if (!newPassword || newPassword.length < 6) {
			return res.status(400).json({ 
				success: false, 
				error: 'Password minimal 6 karakter' 
			})
		}

		const result = userDb.changePassword(id, newPassword)
		res.json(result.success ? { success: true, message: 'Password berhasil direset' } : result)
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Regenerate user token
app.post('/api/users/:id/regenerate-token', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const id = parseInt(req.params.id)
		const result = userDb.regenerateToken(id)
		
		if (result.success) {
			res.json({ 
				success: true, 
				message: 'Token berhasil digenerate ulang',
				token: result.token
			})
		} else {
			res.status(400).json(result)
		}
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Link WhatsApp session to user
app.post('/api/users/:id/link-session', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const userId = parseInt(req.params.id)
		const { sessionId } = req.body

		if (!sessionId) {
			return res.status(400).json({ 
				success: false, 
				error: 'Session ID wajib diisi' 
			})
		}

		linkWaSessionToUser(sessionId, userId)
		res.json({ 
			success: true, 
			message: `Session ${sessionId} berhasil ditautkan ke user`
		})
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get sessions owned by user
app.get('/api/users/:id/sessions', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const userId = parseInt(req.params.id)
		const user = userDb.getById(userId)
		
		if (!user) {
			return res.status(404).json({ success: false, error: 'User tidak ditemukan' })
		}

		const sessions = getWaSessionsForUser(userId, user.role)
		res.json({ success: true, sessions })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Unlink WhatsApp session from user
app.post('/api/users/:id/unlink-session', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const userId = parseInt(req.params.id)
		const { sessionId } = req.body
		if (!sessionId) {
			return res.status(400).json({ success: false, error: 'Session ID wajib diisi' })
		}
		unlinkWaSessionFromUser(sessionId, userId)
		res.json({ success: true, message: `Session ${sessionId} berhasil dilepas dari user` })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Bulk set sessions for a member — replaces all existing assignments
app.put('/api/users/:id/sessions', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const userId = parseInt(req.params.id)
		const { sessionIds } = req.body // string[]
		if (!Array.isArray(sessionIds)) {
			return res.status(400).json({ success: false, error: 'sessionIds harus berupa array' })
		}
		const result = memberSessionDb.replaceForUser(userId, sessionIds, req.user!.id)
		res.json({ success: result.success, message: 'Session assignment berhasil diperbarui' })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// ============================================
// Worker Assignment API Endpoints (Admin Only)
// ============================================

// Get all workers with their assignment counts
app.get('/api/workers', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const workers = db.prepare(`
			SELECT u.id, u.name, u.email, u.status, u.created_at,
				(SELECT COUNT(*) FROM worker_assignments wa WHERE wa.worker_id = u.id) as assignment_count
			FROM users u WHERE u.role = 'worker'
			ORDER BY u.name ASC
		`).all() as any[]
		res.json({ success: true, workers })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get assignments for a specific worker
app.get('/api/workers/:id/assignments', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const workerId = parseInt(req.params.id)
		const worker = userDb.getById(workerId)
		if (!worker || worker.role !== 'worker') {
			return res.status(404).json({ success: false, error: 'Worker tidak ditemukan' })
		}
		const assignments = workerAssignmentDb.getForWorker(workerId)
		res.json({ success: true, assignments, worker: { id: worker.id, name: worker.name, email: worker.email } })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Save assignments for a worker (replace all)
app.put('/api/workers/:id/assignments', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const workerId = parseInt(req.params.id)
		const worker = userDb.getById(workerId)
		if (!worker || worker.role !== 'worker') {
			return res.status(404).json({ success: false, error: 'Worker tidak ditemukan' })
		}
		const { assignments } = req.body // assignments: [{session_id, contact, notes?, priority?, start_datetime?, end_datetime?, visibility_start?, visibility_end?}]
		if (!Array.isArray(assignments)) {
			return res.status(400).json({ success: false, error: 'Format assignments tidak valid' })
		}
		// Sanitize per-contact fields
		const enriched = assignments.map((a: any) => ({
			session_id: a.session_id,
			contact: a.contact,
			notes: a.notes || '',
			priority: ['low', 'medium', 'critical'].includes(a.priority) ? a.priority : 'low',
			start_datetime: a.start_datetime || null,
			end_datetime: a.end_datetime || null,
			visibility_start: a.visibility_start || null,
			visibility_end: a.visibility_end || null,
		}))
		const result = workerAssignmentDb.replaceForWorker(workerId, enriched, req.user!.id)
		if (result.success) {
			// Log the assignment
			try {
				assignmentLogDb.logAssignment(workerId, worker.name, enriched, req.user!.id, req.user!.name)
			} catch (logErr) { console.error('⚠️ Failed to log assignment:', logErr) }
			res.json({ success: true, message: 'Penugasan berhasil disimpan' })
		} else {
			res.status(400).json(result)
		}
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get assignment logs (admin only)
app.get('/api/assignment-logs', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const page = parseInt(req.query.page as string) || 1
		const limit = parseInt(req.query.limit as string) || 50
		const priority = req.query.priority as string || undefined
		const workerId = req.query.workerId ? parseInt(req.query.workerId as string) : undefined
		const dateFrom = req.query.dateFrom as string || undefined
		const dateTo = req.query.dateTo as string || undefined
		const result = assignmentLogDb.getLogs({ page, limit, priority, workerId, dateFrom, dateTo })
		res.json({ success: true, ...result })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get all contacts for a session (for assignment picker)
app.get('/api/sessions/:sessionId/contacts', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const { sessionId } = req.params
		const rows = db.prepare(`
			SELECT DISTINCT 
				CASE WHEN direction = 'incoming' THEN from_number ELSE to_number END as contact,
				MAX(timestamp) as last_time,
				COUNT(*) as message_count
			FROM message_logs
			WHERE session_id = ?
			  AND CASE WHEN direction = 'incoming' THEN from_number ELSE to_number END NOT LIKE '%@broadcast'
			  AND CASE WHEN direction = 'incoming' THEN from_number ELSE to_number END NOT LIKE '%@newsletter'
			GROUP BY contact
			ORDER BY last_time DESC
		`).all(sessionId) as any[]
		res.json({ success: true, contacts: rows })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// ============================================
// Member Portal API Endpoints
// ============================================

// Get member's assigned sessions with live status
app.get('/api/member/sessions', authMiddleware, (req, res) => {
	try {
		const user = req.user!
		const assignedIds = getWaSessionsForUser(user.id, user.role)
		const allLive = sessionManager.getAllSessions()
		let sessions = assignedIds.map(id => {
			const live = allLive.find(s => s.id === id)
			return {
				id,
				isConnected: live?.isConnected ?? false,
				phone: live?.user?.id?.split(':')[0] || null,
				name: live?.user?.name || id,
				phoneVisible: user.phone_visible !== 0,
			}
		})

		// Admin: only return sessions that are actually connected (active)
		// Worker/Member: return all assigned sessions regardless of connection state
		if (user.role === 'adminwa' || user.role === 'admin') {
			sessions = sessions.filter(s => s.isConnected)
		}

		res.json({ success: true, sessions })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get assignment notes for the logged-in worker/member
app.get('/api/member/assignment-notes', authMiddleware, (req, res) => {
	try {
		const user = req.user!
		if (user.role === 'worker') {
			const notes = workerAssignmentDb.getNotesForWorker(user.id)
			return res.json({ success: true, notes })
		}
		// Members don't have per-contact assignments, return empty
		res.json({ success: true, notes: [] })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get conversations for member/worker (scoped to their sessions)
app.get('/api/member/conversations', authMiddleware, (req, res) => {
	try {
		const user = req.user!
		const assignedIds = getWaSessionsForUser(user.id, user.role)
		if (assignedIds.length === 0) {
			return res.json({ success: true, conversations: [] })
		}
		const placeholders = assignedIds.map(() => '?').join(',')
		const rows = db.prepare(`
			SELECT session_id, 
				CASE WHEN direction = 'incoming' THEN from_number ELSE to_number END as contact,
				MAX(timestamp) as last_time,
				COUNT(*) as total_messages,
				SUM(CASE WHEN direction = 'incoming' AND status = 'received' THEN 1 ELSE 0 END) as unread
			FROM message_logs
			WHERE session_id IN (${placeholders})
			  AND CASE WHEN direction = 'incoming' THEN from_number ELSE to_number END NOT LIKE '%@broadcast'
			  AND CASE WHEN direction = 'incoming' THEN from_number ELSE to_number END NOT LIKE '%@newsletter'
			GROUP BY session_id, contact
			ORDER BY last_time DESC
			LIMIT 200
		`).all(...assignedIds) as any[]

		// Worker: filter to only active assigned contacts (excludes expired assignments)
		let filteredRows = rows
		if (user.role === 'worker') {
			const assignments = workerAssignmentDb.getActiveForWorker(user.id)
			const assignedContacts = new Set(assignments.map(a => `${a.session_id}:${a.contact}`))
			filteredRows = rows.filter(r => assignedContacts.has(`${r.session_id}:${r.contact}`))
		}

		// Get latest message per conversation
		const conversations = filteredRows.map(r => {
			const lastMsg = db.prepare(`
				SELECT content, caption, message_type, direction, timestamp, is_deleted, is_edited
				FROM message_logs
				WHERE session_id = ? AND (from_number = ? OR to_number = ?)
				ORDER BY timestamp DESC LIMIT 1
			`).get(r.session_id, r.contact, r.contact) as any
			const mediaStats = db.prepare(`
				SELECT COUNT(*) as total FROM message_logs
				WHERE session_id = ? AND (from_number = ? OR to_number = ?)
				  AND (message_type IN ('image', 'video', 'document', 'audio', 'voice', 'ptt', 'sticker')
				       OR (media_url IS NOT NULL AND media_url != '')
				       OR (media_data IS NOT NULL AND media_data != ''))
			`).get(r.session_id, r.contact, r.contact) as any
			const assignedWorkers = db.prepare(`
				SELECT u.name
				FROM worker_assignments wa
				JOIN users u ON u.id = wa.worker_id
				WHERE wa.session_id = ? AND wa.contact = ?
				  AND (wa.end_datetime IS NULL OR wa.end_datetime >= datetime('now', 'localtime'))
				  AND (wa.start_datetime IS NULL OR wa.start_datetime <= datetime('now', 'localtime'))
				ORDER BY u.name ASC
			`).all(r.session_id, r.contact).map((row: any) => row.name).filter(Boolean)
			const contactNameRow = db.prepare(`
				SELECT sender_name
				FROM auto_forward_tokens
				WHERE session_id = ? AND sender_number = ? AND sender_name IS NOT NULL AND sender_name != ''
				ORDER BY updated_at DESC
				LIMIT 1
			`).get(r.session_id, r.contact) as any
			return {
				sessionId: r.session_id,
				contact: r.contact,
				displayName: contactNameRow?.sender_name || '',
				lastMessage: lastMsg?.is_deleted ? 'Pesan ini telah dihapus' : (lastMsg?.caption || lastMsg?.content || ''),
				lastMessageType: lastMsg?.message_type || 'text',
				lastDirection: lastMsg?.direction || 'incoming',
				lastTime: r.last_time,
				totalMessages: r.total_messages,
				unread: r.unread,
				isGroup: String(r.contact).includes('@g.us'),
				hasMedia: (mediaStats?.total || 0) > 0,
				mediaCount: mediaStats?.total || 0,
				isEdited: !!lastMsg?.is_edited,
				isDeleted: !!lastMsg?.is_deleted,
				assignedWorkers,
			}
		})
		res.json({ success: true, conversations })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get chat messages for a specific contact (member/worker-scoped)
app.get('/api/member/messages/:sessionId/:contact', authMiddleware, (req, res) => {
	try {
		const user = req.user!
		const { sessionId, contact } = req.params
		const limit = parseInt(req.query.limit as string) || 100

		// Check session access
		if (!userOwnsSession(user.id, sessionId, user.role)) {
			return res.status(403).json({ success: false, error: 'Anda tidak memiliki akses ke session ini' })
		}

		// Worker: check contact-level access (also enforces time range)
		if (user.role === 'worker' && !workerAssignmentDb.hasAccess(user.id, sessionId, contact)) {
			return res.status(403).json({ success: false, error: 'Anda tidak memiliki akses ke kontak ini' })
		}

		let messages = db.prepare(`
			SELECT * FROM (
				SELECT id, message_id, session_id, direction, from_number, to_number,
					message_type, content, caption, media_url, filename, file_size, mimetype,
					timestamp, status, source, created_at, updated_at,
					remote_jid, participant, is_deleted, deleted_at, deleted_by,
					is_edited, edited_at, original_message, edited_message, reaction_json,
					CASE WHEN (media_url IS NOT NULL AND media_url != '') 
					     OR (media_data IS NOT NULL AND media_data != '') THEN 1 ELSE 0 END AS has_media
				FROM message_logs
				WHERE session_id = ? AND (from_number = ? OR to_number = ?)
				ORDER BY timestamp DESC
				LIMIT ?
			) sub ORDER BY sub.timestamp ASC
		`).all(sessionId, contact, contact, limit) as any[]

		// Get hidden message IDs for this session+contact
		const hiddenIds = hiddenMessageDb.getHiddenForContact(sessionId, contact)

		if (user.role === 'worker') {
			// Worker: get visibility settings from assignment
			const assignment = workerAssignmentDb.getAssignment(user.id, sessionId, contact)
			const visStart = assignment?.visibility_start || null
			const visEnd = assignment?.visibility_end || null

			// Filter by visibility time window (based on message timestamp)
			if (visStart && visEnd) {
				messages = messages.filter((m: any) => {
					const msgDate = new Date(m.timestamp)
					const hh = msgDate.getHours().toString().padStart(2, '0')
					const mm = msgDate.getMinutes().toString().padStart(2, '0')
					const hhmm = `${hh}:${mm}`
					return hhmm >= visStart && hhmm <= visEnd
				})
			}

			// Exclude hidden messages for workers
			messages = messages.filter((m: any) => !hiddenIds.has(m.message_id))

			// Add assignment info for header display
			const assignmentInfo = assignment ? {
				start_datetime: assignment.start_datetime,
				end_datetime: assignment.end_datetime,
				visibility_start: assignment.visibility_start,
				visibility_end: assignment.visibility_end,
			} : null

			return res.json({ success: true, messages, assignment: assignmentInfo })
		}

		// Admin/Member: include all messages, but mark hidden ones
		messages = messages.map((m: any) => ({
			...m,
			is_hidden: hiddenIds.has(m.message_id)
		}))

		res.json({ success: true, messages })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// GET /api/member/media/:messageId — serve media data on demand (binary)
app.get('/api/member/media/:messageId', authMiddleware, (req, res) => {
	try {
		const user = req.user!
		const { messageId } = req.params

		const row = db.prepare(`
			SELECT session_id, from_number, to_number, media_url, media_data, mimetype, filename
			FROM message_logs WHERE message_id = ?
		`).get(messageId) as any

		if (!row) {
			return res.status(404).json({ success: false, error: 'Message not found' })
		}

		// Verify user has access to this session
		if (!userOwnsSession(user.id, row.session_id, user.role)) {
			return res.status(403).json({ success: false, error: 'Access denied' })
		}

		// Worker: check contact-level access
		const contact = row.from_number === row.session_id ? row.to_number : row.from_number
		if (user.role === 'worker' && !workerAssignmentDb.hasAccess(user.id, row.session_id, contact)) {
			return res.status(403).json({ success: false, error: 'Access denied' })
		}

		// Priority 1: serve from file system via media_url
		if (row.media_url) {
			const filePath = getMediaPath(row.media_url)
			if (filePath) {
				const mime = row.mimetype || 'application/octet-stream'
				res.set('Content-Type', mime)
				if (row.filename) {
					res.set('Content-Disposition', `inline; filename="${row.filename}"`)
				}
				return res.sendFile(filePath)
			}
		}

		// Priority 2: serve from database blob (legacy)
		if (row.media_data) {
			const buffer = Buffer.from(row.media_data, 'base64')
			const mime = row.mimetype || 'application/octet-stream'
			res.set('Content-Type', mime)
			res.set('Content-Length', String(buffer.length))
			if (row.filename) {
				res.set('Content-Disposition', `inline; filename="${row.filename}"`)
			}
			return res.send(buffer)
		}

		return res.status(404).json({ success: false, error: 'Media sudah dihapus' })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get unread count for member/worker (all assigned sessions)
app.get('/api/member/unread', authMiddleware, (req, res) => {
	try {
		const user = req.user!
		const assignedIds = getWaSessionsForUser(user.id, user.role)
		if (assignedIds.length === 0) {
			return res.json({ success: true, total: 0, perSession: {} })
		}
		const placeholders = assignedIds.map(() => '?').join(',')

		let rows: any[]
		if (user.role === 'worker') {
			// Worker: only count unread for assigned contacts
			const assignments = workerAssignmentDb.getForWorker(user.id)
			if (assignments.length === 0) {
				return res.json({ success: true, total: 0, perSession: {} })
			}
			// Build query with contact filter per session
			const contactConditions = assignments.map(() => '(session_id = ? AND from_number = ?)').join(' OR ')
			const contactParams = assignments.flatMap(a => [a.session_id, a.contact])
			rows = db.prepare(`
				SELECT session_id, COUNT(*) as cnt FROM message_logs
				WHERE (${contactConditions}) AND direction = 'incoming' AND status = 'received'
				GROUP BY session_id
			`).all(...contactParams) as any[]
		} else {
			rows = db.prepare(`
				SELECT session_id, COUNT(*) as cnt FROM message_logs
				WHERE session_id IN (${placeholders}) AND direction = 'incoming' AND status = 'received'
				GROUP BY session_id
			`).all(...assignedIds) as any[]
		}

		const perSession: Record<string, number> = {}
		let total = 0
		for (const r of rows) {
			perSession[r.session_id] = r.cnt
			total += r.cnt
		}
		res.json({ success: true, total, perSession })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Mark messages as read when a conversation is opened
app.post('/api/member/messages/:sessionId/:contact/read', authMiddleware, (req, res) => {
	try {
		const user = req.user!
		const { sessionId, contact } = req.params
		if (!userOwnsSession(user.id, sessionId, user.role)) {
			return res.status(403).json({ success: false, error: 'Akses ditolak' })
		}
		// Worker: check contact-level access
		if (user.role === 'worker' && !workerAssignmentDb.hasAccess(user.id, sessionId, contact)) {
			return res.status(403).json({ success: false, error: 'Akses ditolak' })
		}
		const result = db.prepare(`
			UPDATE message_logs SET status = 'read'
			WHERE session_id = ? AND from_number = ? AND direction = 'incoming' AND status = 'received'
		`).run(sessionId, contact)
		res.json({ success: true, updated: result.changes })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Bulk mark ALL conversations as read for this member/worker
app.post('/api/member/read-all', authMiddleware, (req, res) => {
	try {
		const user = req.user!
		const assignedIds = getWaSessionsForUser(user.id, user.role)
		if (assignedIds.length === 0) return res.json({ success: true, updated: 0 })

		let updated = 0
		if (user.role === 'worker') {
			const assignments = workerAssignmentDb.getForWorker(user.id)
			for (const a of assignments) {
				const r = db.prepare(`
					UPDATE message_logs SET status = 'read'
					WHERE session_id = ? AND from_number = ? AND direction = 'incoming' AND status = 'received'
				`).run(a.session_id, a.contact)
				updated += r.changes
			}
		} else {
			const placeholders = assignedIds.map(() => '?').join(',')
			const r = db.prepare(`
				UPDATE message_logs SET status = 'read'
				WHERE session_id IN (${placeholders}) AND direction = 'incoming' AND status = 'received'
			`).run(...assignedIds)
			updated = r.changes
		}
		res.json({ success: true, updated })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// ============================================
// Get contact detail with message/media counts
// ============================================
app.get('/api/member/contact-detail/:sessionId/:contact', authMiddleware, (req, res) => {
	try {
		const user = req.user!
		const { sessionId, contact } = req.params
		if (!userOwnsSession(user.id, sessionId, user.role)) {
			return res.status(403).json({ success: false, error: 'Anda tidak memiliki akses ke session ini' })
		}
		if (user.role === 'worker' && !workerAssignmentDb.hasAccess(user.id, sessionId, contact)) {
			return res.status(403).json({ success: false, error: 'Anda tidak memiliki akses ke kontak ini' })
		}
		const cleanJid = contact

		// Count total messages in this conversation
		const totalMsg = db.prepare(`
			SELECT COUNT(*) as total FROM message_logs
			WHERE session_id = ? AND (from_number = ? OR to_number = ?)
		`).get(sessionId, cleanJid, cleanJid) as any

		const mediaItems = db.prepare(`
			SELECT message_id, message_type, content, caption, media_url, filename, file_size, mimetype, timestamp
			FROM (
				SELECT message_id, message_type, content, caption, media_url, filename, file_size, mimetype, timestamp
				FROM message_logs
				WHERE session_id = ? AND (from_number = ? OR to_number = ?)
				  AND is_deleted != 1
				  AND (message_type IN ('image', 'video', 'document', 'audio', 'voice', 'ptt', 'sticker')
				       OR (media_url IS NOT NULL AND media_url != '')
				       OR (media_data IS NOT NULL AND media_data != ''))
				UNION ALL
				SELECT message_id, 'link' as message_type, content, caption, media_url, filename, file_size, mimetype, timestamp
				FROM message_logs
				WHERE session_id = ? AND (from_number = ? OR to_number = ?)
				  AND is_deleted != 1
				  AND ((content LIKE '%http://%' OR content LIKE '%https://%')
				       OR (caption LIKE '%http://%' OR caption LIKE '%https://%'))
			)
			ORDER BY timestamp DESC
			LIMIT 12
		`).all(sessionId, cleanJid, cleanJid, sessionId, cleanJid, cleanJid) as any[]

		const assignedWorkers = db.prepare(`
			SELECT u.name
			FROM worker_assignments wa
			JOIN users u ON u.id = wa.worker_id
			WHERE wa.session_id = ? AND wa.contact = ?
			  AND (wa.end_datetime IS NULL OR wa.end_datetime >= datetime('now', 'localtime'))
			  AND (wa.start_datetime IS NULL OR wa.start_datetime <= datetime('now', 'localtime'))
			ORDER BY u.name ASC
		`).all(sessionId, cleanJid).map((row: any) => row.name).filter(Boolean)

		const contactNameRow = db.prepare(`
			SELECT sender_name
			FROM auto_forward_tokens
			WHERE session_id = ? AND sender_number = ? AND sender_name IS NOT NULL AND sender_name != ''
			ORDER BY updated_at DESC
			LIMIT 1
		`).get(sessionId, cleanJid) as any

		const activity = db.prepare(`
			SELECT message_type, direction, status, timestamp, is_deleted, is_edited
			FROM message_logs
			WHERE session_id = ? AND (from_number = ? OR to_number = ?)
			ORDER BY timestamp DESC
			LIMIT 8
		`).all(sessionId, cleanJid, cleanJid) as any[]

		// Count media messages (has media_url or media_data)
		const mediaCount = db.prepare(`
			SELECT COUNT(*) as total FROM message_logs
			WHERE session_id = ? AND (from_number = ? OR to_number = ?)
			  AND is_deleted != 1
			  AND (message_type IN ('image', 'video', 'document', 'audio', 'voice', 'ptt', 'sticker')
			       OR (media_url IS NOT NULL AND media_url != '')
			       OR (media_data IS NOT NULL AND media_data != '')
			       OR ((content LIKE '%http://%' OR content LIKE '%https://%')
			           OR (caption LIKE '%http://%' OR caption LIKE '%https://%')))
		`).get(sessionId, cleanJid, cleanJid) as any

		// Count document messages
		const docCount = db.prepare(`
			SELECT COUNT(*) as total FROM message_logs
			WHERE session_id = ? AND (from_number = ? OR to_number = ?)
			  AND is_deleted != 1
			  AND message_type = 'document'
		`).get(sessionId, cleanJid, cleanJid) as any

		// Get latest message timestamp
		const latest = db.prepare(`
			SELECT timestamp FROM message_logs
			WHERE session_id = ? AND (from_number = ? OR to_number = ?)
			ORDER BY timestamp DESC LIMIT 1
		`).get(sessionId, cleanJid, cleanJid) as any

		// Get assignment notes if any
		const notes = workerAssignmentDb.getByContact(contact)

		res.json({
			success: true,
			contact,
			totalMessages: totalMsg?.total || 0,
			mediaCount: mediaCount?.total || 0,
			docCount: docCount?.total || 0,
			lastSeen: latest?.timestamp || null,
			notes: notes?.notes || '',
			priority: notes?.priority || null,
			isGroup: contact.includes('@g.us'),
			displayName: contactNameRow?.sender_name || (contact.includes('@g.us') ? contact.replace('@g.us', '') : ''),
			phone: contact,
			assignedWorkers,
			mediaItems,
			activity,
		})
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Forward a message from member dashboard with worker assignment validation
app.post('/api/member/forward-message', authMiddleware, async (req, res) => {
	try {
		const user = req.user!
		const { sessionId, contact, messageId, to } = req.body || {}
		if (!sessionId || !contact || !messageId || !to) {
			return res.status(400).json({ success: false, error: 'sessionId, contact, messageId, dan tujuan wajib diisi' })
		}
		if (!userOwnsSession(user.id, sessionId, user.role)) {
			return res.status(403).json({ success: false, error: 'Anda tidak memiliki akses ke session ini' })
		}
		if (user.role === 'worker' && !workerAssignmentDb.hasAccess(user.id, sessionId, contact)) {
			return res.status(403).json({ success: false, error: 'Worker hanya bisa forward pesan dari client yang ditugaskan' })
		}

		const row = db.prepare(`
			SELECT *
			FROM message_logs
			WHERE session_id = ? AND message_id = ? AND (from_number = ? OR to_number = ?)
			LIMIT 1
		`).get(sessionId, messageId, contact, contact) as any
		if (!row) {
			return res.status(404).json({ success: false, error: 'Pesan tidak ditemukan atau bukan bagian dari chat ini' })
		}
		if (row.is_deleted) {
			return res.status(400).json({ success: false, error: 'Pesan yang sudah dihapus tidak bisa diforward' })
		}

		const text = row.caption || row.content || ''
		let result: any
		let forwardedType = row.message_type || 'text'
		let mediaBuffer: Buffer | null = null
		if (row.media_data) {
			mediaBuffer = Buffer.from(row.media_data, 'base64')
		} else if (row.media_url) {
			const mediaPath = getMediaPath(row.media_url)
			if (mediaPath) mediaBuffer = fs.readFileSync(mediaPath)
		}

		if (mediaBuffer && row.message_type === 'image') {
			result = await sessionManager.sendImage(sessionId, to, mediaBuffer, text || undefined, row.mimetype || undefined, row.filename || undefined)
			forwardedType = 'image'
		} else if (mediaBuffer && row.message_type === 'video') {
			result = await sessionManager.sendVideo(sessionId, to, mediaBuffer, text || undefined, row.mimetype || undefined, row.filename || undefined)
			forwardedType = 'video'
		} else if (mediaBuffer && row.message_type !== 'text') {
			result = await sessionManager.sendDocument(sessionId, to, mediaBuffer, row.mimetype || 'application/octet-stream', row.filename || 'forwarded-file', text || undefined)
			forwardedType = row.message_type || 'document'
		} else if (text) {
			result = await sessionManager.sendMessage(sessionId, to, text)
			forwardedType = 'text'
		} else {
			return res.status(400).json({ success: false, error: 'Konten pesan tidak tersedia untuk diforward' })
		}

		const targetJid = String(to).includes('@') ? String(to) : `${String(to).replace(/[^0-9]/g, '')}@s.whatsapp.net`
		const forwardedMessageId = result?.key?.id || `fwd_${Date.now()}`
		let forwardedMediaUrl: string | undefined
		if (mediaBuffer) {
			try {
				forwardedMediaUrl = saveMedia(sessionId, forwardedMessageId, mediaBuffer, row.mimetype || undefined, row.filename || undefined)
			} catch (saveErr) {
				console.error('⚠️ Forward media save failed:', saveErr)
			}
		}
		try {
			messageLogDb.insert({
				message_id: forwardedMessageId,
				session_id: sessionId,
				direction: 'outgoing',
				from_number: sessionId,
				to_number: targetJid,
				remote_jid: targetJid,
				message_type: forwardedType,
				content: forwardedType === 'text' ? text : '',
				caption: forwardedType !== 'text' ? text : '',
				media_url: forwardedMediaUrl,
				mimetype: row.mimetype || undefined,
				filename: row.filename || undefined,
				file_size: mediaBuffer?.length || undefined,
				timestamp: new Date().toISOString(),
				status: 'sent',
				source: 'ui'
			})
		} catch (dbErr) {
			console.error('⚠️ Forward member log failed:', dbErr)
		}

		io.emit('message-sent', {
			success: true,
			sessionId,
			to: targetJid,
			messageContent: forwardedType === 'text' ? text : '',
			caption: forwardedType !== 'text' ? text : '',
			filename: row.filename || '',
			messageId: forwardedMessageId,
			mediaType: forwardedType,
			mediaUrl: forwardedMediaUrl || null
		})

		res.json({ success: true, messageId: forwardedMessageId, to: targetJid, type: forwardedType })
	} catch (error: any) {
		console.error('[/api/member/forward-message]', error.message)
		res.status(500).json({ success: false, error: error.message })
	}
})

// ============================================
// Chat Hide/Unhide API Endpoints (Admin & Member)
// ============================================

// Hide messages (admin & member only)
app.post('/api/chat/hide', authMiddleware, (req, res) => {
	try {
		const user = req.user!
		if (user.role === 'worker') {
			return res.status(403).json({ success: false, error: 'Worker tidak bisa menyembunyikan chat' })
		}
		const { message_ids, session_id } = req.body
		if (!Array.isArray(message_ids) || !session_id) {
			return res.status(400).json({ success: false, error: 'message_ids (array) dan session_id wajib diisi' })
		}
		if (message_ids.length === 0) {
			return res.status(400).json({ success: false, error: 'Tidak ada pesan yang dipilih' })
		}
		if (message_ids.length > 500) {
			return res.status(400).json({ success: false, error: 'Maksimal 500 pesan per request' })
		}
		hiddenMessageDb.bulkHide(message_ids, session_id, user.id)
		res.json({ success: true, message: `${message_ids.length} pesan berhasil disembunyikan` })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Unhide messages (admin & member only)
app.post('/api/chat/unhide', authMiddleware, (req, res) => {
	try {
		const user = req.user!
		if (user.role === 'worker') {
			return res.status(403).json({ success: false, error: 'Worker tidak bisa menampilkan kembali chat' })
		}
		const { message_ids } = req.body
		if (!Array.isArray(message_ids) || message_ids.length === 0) {
			return res.status(400).json({ success: false, error: 'message_ids (array) wajib diisi' })
		}
		hiddenMessageDb.bulkUnhide(message_ids)
		res.json({ success: true, message: `${message_ids.length} pesan berhasil ditampilkan kembali` })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// ============================================
// Member Templates API (Instant Chat / Template Picker)
// ============================================

app.get('/api/member/templates', authMiddleware, (req, res) => {
	try {
		const templates = chatTemplateDb.getAll({ activeOnly: true })
		// Strip media_data from list response to keep it lightweight
		const lightweight = templates.map((t: any) => ({
			id: t.id,
			code: t.code,
			title: t.title,
			content: t.content,
			description: t.description,
			has_media: !!t.media_data,
			media_mimetype: t.media_mimetype || null,
		}))
		res.json({ success: true, templates: lightweight })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// ============================================
// User Frontend Routes
// ============================================

// Main route - Check authentication first
app.get('/', (req, res) => {
	const sessionToken = req.cookies?.[SESSION_COOKIE_NAME]
	if (sessionToken) {
		const user = validateSession(sessionToken)
		if (user) {
			// Redirect based on role
			if (user.role === 'adminwa') {
				return res.redirect('/index.html')
			} else {
				return res.redirect('/member/dashboard.html')
			}
		}
	}
	// Not logged in, redirect to login page
	res.redirect('/auth/login')
})

// User frontend routes
app.get('/user/', (req, res) => {
	res.sendFile(path.join(publicDir, 'user', 'index.html'))
})

app.get('/user/connect', (req, res) => {
	res.sendFile(path.join(publicDir, 'user', 'connect.html'))
})

app.get('/user/exports', (req, res) => {
	res.sendFile(path.join(publicDir, 'user', 'exports.html'))
})

app.get('/user/export/:id', (req, res) => {
	res.sendFile(path.join(publicDir, 'user', 'export-detail.html'))
})

// Serve user static assets
app.use('/user/assets', express.static(path.join(publicDir, 'user', 'assets')))

// ============================================
// Member Portal Routes
// ============================================
app.get('/member/dashboard.html', authMiddleware, (req, res) => {
	res.sendFile(path.join(publicDir, 'member', 'dashboard.html'))
})
app.get('/member/dashboard', (req, res) => res.redirect('/member/dashboard.html'))
app.use('/member/assets', express.static(path.join(publicDir, 'member', 'assets')))

// ============================================
// NEW Frontend Routes (public/frontend)
// ============================================

// Frontend login page
app.get('/frontend/', (req, res) => {
	res.sendFile(path.join(publicDir, 'frontend', 'index.html'))
})

app.get('/frontend/index.html', (req, res) => {
	res.sendFile(path.join(publicDir, 'frontend', 'index.html'))
})

// Frontend home page (after login)
app.get('/frontend/home', (req, res) => {
	res.sendFile(path.join(publicDir, 'frontend', 'home.html'))
})

app.get('/frontend/home.html', (req, res) => {
	res.sendFile(path.join(publicDir, 'frontend', 'home.html'))
})

// Serve frontend static assets
app.use('/frontend/assets', express.static(path.join(publicDir, 'frontend', 'assets')))

// Dashboard route - Admin Dashboard
app.get('/dashboard', (req, res) => {
	res.sendFile(path.join(adminPublicDir, 'index.html'))
})

// ============================================
// External WA API — Protected by API Key
// ============================================
//
// Gunakan header: X-Api-Key: <nilai WA_API_KEY di .env>
// Atau query:     ?api_key=<nilai>
//
// Jika WA_API_KEY belum di-set, gunakan X-Api-Token (user token)

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

/**
 * Helper: pilih session yang aktif.
 * Jika sessionId diberikan, pakai itu.
 * Jika tidak, pilih sesi pertama yang terkoneksi.
 */
function resolveSession(sessionId?: string): string | null {
	if (sessionId) return sessionId
	const all = sessionManager.getAllSessions()
	const connected = all.find(s => s.isConnected)
	return connected?.id ?? null
}

// ════════════════════════════════════════════════════════════════
//  WEBHOOK: Order Status from Jokiin CRM
// ════════════════════════════════════════════════════════════════
app.post('/api/webhook/order-status', apiKeyMiddleware, async (req, res) => {
	try {
		const { order_id, status, nomor_client } = req.body
		if (!order_id || !status || !nomor_client) {
			return res.status(400).json({ success: false, error: 'order_id, status, nomor_client wajib diisi.' })
		}

		const { handleOrderStatusWebhook } = await import('./crm-sync.js')
		const result = handleOrderStatusWebhook({ order_id, status, nomor_client })

		// Auto-send WA message to client
		if (result.sendMessage) {
			const sessionId = resolveSession(req.body.session_id)
			if (sessionId) {
				const phone = result.sendMessage.to.replace(/[^0-9]/g, '')
				const jid = `${phone}@s.whatsapp.net`
				try {
					await sessionManager.sendMessage(sessionId, jid, result.sendMessage.message)
				} catch (sendErr: any) {
					console.error('⚠️ Failed to send order status WA:', sendErr.message)
				}
			}
		}

		res.json({ success: true, message: 'Order status processed' })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// POST /api/wa/send — kirim pesan teks
// Body (JSON): { to, message, session_id? }
app.post('/api/wa/send', apiKeyMiddleware, async (req, res) => {
	try {
		const { to, message, session_id } = req.body
		if (!to || !message) {
			return res.status(400).json({ success: false, error: 'Field "to" dan "message" wajib diisi.' })
		}
		const sid = resolveSession(session_id)
		if (!sid) {
			return res.status(503).json({ success: false, error: 'Tidak ada sesi WhatsApp yang terhubung.' })
		}
		const result = await sessionManager.sendMessage(sid, to, message)
		res.json({ success: true, message: 'Pesan berhasil dikirim.', data: { to, session_id: sid, msg_id: result?.key?.id } })
	} catch (error: any) {
		console.error('[/api/wa/send]', error.message)
		res.status(500).json({ success: false, error: error.message })
	}
})

// POST /api/wa/send-image — kirim gambar
// Multipart form-data: to, caption?(opsional), session_id?(opsional), file
app.post('/api/wa/send-image', apiKeyMiddleware, upload.single('file'), async (req: any, res) => {
	try {
		const { to, caption, session_id } = req.body
		const file = req.file
		if (!to || !file) {
			return res.status(400).json({ success: false, error: 'Field "to" dan "file" (gambar) wajib diisi.' })
		}
		const sid = resolveSession(session_id)
		if (!sid) {
			return res.status(503).json({ success: false, error: 'Tidak ada sesi WhatsApp yang terhubung.' })
		}
		const result = await sessionManager.sendImage(sid, to, file.buffer, caption || undefined, file.mimetype, file.originalname)
		res.json({ success: true, message: 'Gambar berhasil dikirim.', data: { to, session_id: sid, filename: file.originalname, msg_id: result?.key?.id } })
	} catch (error: any) {
		console.error('[/api/wa/send-image]', error.message)
		res.status(500).json({ success: false, error: error.message })
	}
})

// POST /api/wa/send-document — kirim dokumen (PDF, DOC, dll)
// Multipart form-data: to, filename?(opsional), caption?(opsional), session_id?(opsional), file
app.post('/api/wa/send-document', apiKeyMiddleware, upload.single('file'), async (req: any, res) => {
	try {
		const { to, filename, caption, session_id } = req.body
		const file = req.file
		if (!to || !file) {
			return res.status(400).json({ success: false, error: 'Field "to" dan "file" wajib diisi.' })
		}
		const sid = resolveSession(session_id)
		if (!sid) {
			return res.status(503).json({ success: false, error: 'Tidak ada sesi WhatsApp yang terhubung.' })
		}
		const displayName = filename || file.originalname || 'dokumen'
		const result = await sessionManager.sendDocument(sid, to, file.buffer, file.mimetype, displayName, caption || undefined)
		res.json({ success: true, message: 'Dokumen berhasil dikirim.', data: { to, session_id: sid, filename: displayName, caption: caption || '', msg_id: result?.key?.id } })
	} catch (error: any) {
		console.error('[/api/wa/send-document]', error.message)
		res.status(500).json({ success: false, error: error.message })
	}
})

// POST /api/wa/forward — teruskan pesan teks + opsional file ke nomor tujuan
// Supports 3 file modes:
//   1. Multipart form-data with 'file' field (multer upload)
//   2. JSON body with 'file_base64', 'mimetype', 'filename'
//   3. JSON body with 'file_url' (server downloads the file first)
app.post('/api/wa/forward', apiKeyMiddleware, upload.single('file'), async (req: any, res) => {
	try {
		const { to, message, caption, session_id, file_base64, file_url, mimetype: bodyMimetype, filename: bodyFilename } = req.body
		let file = req.file // multer file
		if (!to) {
			return res.status(400).json({ success: false, error: 'Field "to" wajib diisi.' })
		}

		// --- Resolve file buffer from alternative sources ---
		let fileBuffer: Buffer | null = null
		let fileMimetype: string = bodyMimetype || 'application/octet-stream'
		let fileFilename: string = bodyFilename || 'file'

		if (file) {
			// Mode 1: multer file upload
			fileBuffer = file.buffer
			fileMimetype = file.mimetype
			fileFilename = file.originalname
		} else if (file_base64) {
			// Mode 2: base64 string in JSON body
			try {
				// Strip data-url prefix if present, e.g. "data:image/png;base64,..."
				const raw = file_base64.includes(',') ? file_base64.split(',')[1] : file_base64
				fileBuffer = Buffer.from(raw, 'base64')
				// Try to infer mimetype from data-url prefix
				if (!bodyMimetype && file_base64.startsWith('data:')) {
					const match = file_base64.match(/^data:([^;]+);/)
					if (match) fileMimetype = match[1]
				}
			} catch (e: any) {
				return res.status(400).json({ success: false, error: 'file_base64 tidak valid: ' + e.message })
			}
		} else if (file_url) {
			// Mode 3: download from URL
			try {
				const response = await fetch(file_url, { signal: AbortSignal.timeout(30000) })
				if (!response.ok) throw new Error(`HTTP ${response.status}`)
				const arrayBuf = await response.arrayBuffer()
				fileBuffer = Buffer.from(arrayBuf)
				// Infer mimetype from response header
				const ct = response.headers.get('content-type')
				if (ct && !bodyMimetype) fileMimetype = ct.split(';')[0].trim()
				// Infer filename from URL
				if (!bodyFilename) {
					const urlPath = new URL(file_url).pathname
					fileFilename = urlPath.split('/').pop() || 'file'
				}
			} catch (e: any) {
				return res.status(400).json({ success: false, error: 'Gagal mengunduh file_url: ' + e.message })
			}
		}

		if (!message && !fileBuffer) {
			return res.status(400).json({ success: false, error: 'Wajib menyertakan "message", "file", "file_base64", atau "file_url".' })
		}
		const sid = resolveSession(session_id)
		if (!sid) {
			return res.status(503).json({ success: false, error: 'Tidak ada sesi WhatsApp yang terhubung.' })
		}
		const results: any[] = []
		if (message) {
			const r = await sessionManager.sendMessage(sid, to, message)
			results.push({ type: 'text', msg_id: r?.key?.id })
		}
		if (fileBuffer) {
			const isImage = fileMimetype.startsWith('image/')
			const isVideo = fileMimetype.startsWith('video/')
			let r
			if (isImage) {
				r = await sessionManager.sendImage(sid, to, fileBuffer, caption || undefined, fileMimetype, fileFilename)
			} else if (isVideo) {
				r = await sessionManager.sendVideo(sid, to, fileBuffer, caption || undefined, fileMimetype, fileFilename)
			} else {
				r = await sessionManager.sendDocument(sid, to, fileBuffer, fileMimetype, fileFilename)
			}
			results.push({ type: isImage ? 'image' : isVideo ? 'video' : 'document', filename: fileFilename, msg_id: r?.key?.id })

			// Save media to file system and log to database
			try {
				const msgId = r?.key?.id || `fwd_${Date.now()}`
				const jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`
				let fwdMediaUrl: string | undefined
				try {
					fwdMediaUrl = saveMediaBase64(sid, msgId, fileBuffer.toString('base64'), fileMimetype, fileFilename)
				} catch (_) { /* ignore file save error */ }
				messageLogDb.insert({
					message_id: msgId,
					session_id: sid,
					direction: 'outgoing',
					from_number: sid,
					to_number: jid,
					remote_jid: jid,
					message_type: isImage ? 'image' : isVideo ? 'video' : 'document',
					content: (!isImage && !isVideo) ? (message || '') : '',
					caption: (isImage || isVideo) ? (caption || '') : undefined,
					media_url: fwdMediaUrl,
					mimetype: fileMimetype,
					filename: fileFilename,
					file_size: fileBuffer.length,
					timestamp: new Date().toISOString(),
					status: 'sent',
					source: 'api-forward'
				})
			} catch (dbErr) {
				console.error('⚠️ Forward db log failed:', dbErr)
			}
		}
		res.json({ success: true, message: 'Pesan diteruskan.', data: { to, session_id: sid, results } })
	} catch (error: any) {
		console.error('[/api/wa/forward]', error.message)
		res.status(500).json({ success: false, error: error.message })
	}
})

// GET /api/wa/status — cek status koneksi (untuk validasi dari Jokiin)
app.get('/api/wa/status', apiKeyMiddleware, (req, res) => {
	try {
		const all = sessionManager.getAllSessions()
		const connected = all.filter(s => s.isConnected)
		res.json({
			success: true,
			connected: connected.length > 0,
			sessions: connected.map(s => ({
				id: s.id,
				phone: s.phoneNumber || (s.user?.id ? s.user.id.split(':')[0] : null),
				name: s.user?.name || s.id,
			})),
		})
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
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

// ── NEW: Daily message stats (Line Chart) ─────────────────────────────────
// GET /api/stats/messages/daily?days=30&sessionId=
app.get('/api/stats/messages/daily', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const days = parseInt(req.query.days as string) || 30
		const sessionId = req.query.sessionId as string | undefined
		const data = messageLogDb.getDailyStats(days, sessionId)
		res.json({ success: true, data })
	} catch (error: any) {
		console.error('Error fetching daily stats:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// ── NEW: Peak hours stats (Bar Chart) ─────────────────────────────────────
// GET /api/stats/messages/peak-hours?days=7&sessionId=
app.get('/api/stats/messages/peak-hours', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const days = parseInt(req.query.days as string) || 7
		const sessionId = req.query.sessionId as string | undefined
		const data = messageLogDb.getPeakHours(days, sessionId)
		res.json({ success: true, data })
	} catch (error: any) {
		console.error('Error fetching peak hours:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// ── NEW: Worker performance stats (Bar + Line Chart) ──────────────────────
// GET /api/stats/workers/performance?range=weekly|monthly|yearly
app.get('/api/stats/workers/performance', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const range = (req.query.range as string) || 'monthly'
		let dateFilter: string
		if (range === 'weekly')       dateFilter = "datetime('now', '-7 days')"
		else if (range === 'yearly')  dateFilter = "datetime('now', '-1 year')"
		else                          dateFilter = "datetime('now', '-1 month')"  // monthly

		const workers = db.prepare(`
			SELECT
				u.id       as worker_id,
				u.name     as worker_name,
				u.email    as worker_email,
				COUNT(DISTINCT wa.contact || '_' || wa.session_id) as active_contacts,
				COUNT(al.id) as log_count,
				COUNT(DISTINCT CASE WHEN al.created_at >= ${dateFilter} THEN al.id END) as period_actions,
				MAX(al.created_at) as last_activity
			FROM users u
			LEFT JOIN worker_assignments wa ON wa.worker_id = u.id
			LEFT JOIN assignment_logs al ON al.worker_id = u.id
			WHERE u.role = 'worker'
			GROUP BY u.id, u.name, u.email
			ORDER BY period_actions DESC, u.name ASC
		`).all() as any[]

		// Also get trend: assignments per day for period
		const trend = db.prepare(`
			SELECT
				al.worker_id,
				u.name as worker_name,
				DATE(al.created_at) as date,
				COUNT(*) as actions
			FROM assignment_logs al
			JOIN users u ON u.id = al.worker_id
			WHERE al.created_at >= ${dateFilter}
			GROUP BY al.worker_id, DATE(al.created_at)
			ORDER BY date ASC, al.worker_id ASC
		`).all() as any[]

		res.json({ success: true, workers, trend, range })
	} catch (error: any) {
		console.error('Error fetching worker performance:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// ── NEW: Per-session daily trend (manage-sessions chart) ──────────────────────
// GET /api/stats/messages/by-session?sessionId=X&days=30
app.get('/api/stats/messages/by-session', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const sessionId = (req.query.sessionId as string) || ''
		const days = parseInt(req.query.days as string) || 30
		if (!sessionId) {
			return res.status(400).json({ success: false, error: 'sessionId diperlukan' })
		}
		const data = messageLogDb.getDailyStats(days, sessionId)
		// Also include total stats for this session
		const stats = messageLogDb.getStatistics(sessionId)
		res.json({ success: true, data, stats, sessionId })
	} catch (error: any) {
		console.error('Error fetching session trend:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// ── NEW: Activity log daily trend (log-activity chart) ────────────────────────
// GET /api/stats/activity/daily?days=30&sessionId=
// Reuses getDailyStats but returns all sessions grouped + top type breakdown
app.get('/api/stats/activity/daily', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const days = parseInt(req.query.days as string) || 30
		const sessionId = req.query.sessionId as string | undefined

		const daily = messageLogDb.getDailyStats(days, sessionId)

		// Per-session breakdown for this period
		const params: any[] = [`-${days} days`]
		let sessionFilter = ''
		if (sessionId) { sessionFilter = 'AND session_id = ?'; params.push(sessionId) }

		const bySessions = db.prepare(`
			SELECT
				session_id,
				SUM(CASE WHEN direction='incoming' THEN 1 ELSE 0 END) as incoming,
				SUM(CASE WHEN direction='outgoing' THEN 1 ELSE 0 END) as outgoing,
				COUNT(*) as total
			FROM message_logs
			WHERE timestamp >= DATE('now', ?)
			${sessionFilter}
			GROUP BY session_id
			ORDER BY total DESC
		`).all(...params) as any[]

		const byType = messageLogDb.getTypeStatistics(sessionId)

		res.json({ success: true, daily, bySessions, byType })
	} catch (error: any) {
		console.error('Error fetching activity daily:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// POST /api/chat/send-media — Send media via multipart upload (cookie auth, supports XHR progress)
app.post('/api/chat/send-media', authMiddleware, upload.single('file'), async (req: any, res) => {
	try {
		const { sessionId, phone, caption, tempId } = req.body
		const file = req.file
		if (!sessionId || !phone || !file) {
			return res.status(400).json({ success: false, error: 'sessionId, phone, dan file wajib diisi.' })
		}
		const sid = resolveSession(sessionId)
		if (!sid) {
			return res.status(503).json({ success: false, error: 'Tidak ada sesi WhatsApp yang terhubung.' })
		}

		const isImage = file.mimetype.startsWith('image/')
		const isVideo = file.mimetype.startsWith('video/')
		const mediaType = isImage ? 'image' : isVideo ? 'video' : 'document'

		let result: any
		if (isImage) {
			result = await sessionManager.sendImage(sid, phone, file.buffer, caption || '', file.mimetype, file.originalname)
		} else if (isVideo) {
			result = await sessionManager.sendVideo(sid, phone, file.buffer, caption || '', file.mimetype, file.originalname)
		} else {
			result = await sessionManager.sendDocument(sid, phone, file.buffer, file.mimetype, file.originalname, caption || undefined)
		}

		const messageId = result?.key?.id || `${mediaType}_${Date.now()}`
		const jid = phone.includes('@') ? phone : `${phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`

		// Save media to file system
		let mediaUrl: string | null = null
		try {
			mediaUrl = saveMedia(sid, messageId, file.buffer, file.mimetype, file.originalname)
		} catch (saveErr) {
			console.error('⚠️ Failed to save media file:', saveErr)
		}

		// Log to database
		try {
			messageLogDb.insert({
				message_id: messageId,
				session_id: sid,
				direction: 'outgoing',
				from_number: sid,
				to_number: jid,
				remote_jid: jid,
				message_type: mediaType,
				content: '',
				caption: caption || '',
				media_url: mediaUrl || undefined,
				mimetype: file.mimetype,
				filename: file.originalname,
				file_size: file.buffer.length,
				timestamp: new Date().toISOString(),
				status: 'sent',
				source: 'ui'
			})
		} catch (dbError) {
			console.error('⚠️ Failed to save media to database:', dbError)
		}

		// Broadcast to all sockets so other tabs/users see the message
		io.emit('message-sent', {
			success: true,
			sessionId: sid,
			to: phone,
			caption: caption || '',
			filename: file.originalname || '',
			tempId: tempId || null,
			messageId,
			mediaType,
			mediaUrl: mediaUrl || null
		})

		res.json({ success: true, messageId, mediaType, mediaUrl, tempId })
	} catch (error: any) {
		console.error('[/api/chat/send-media]', error.message)
		res.status(500).json({ success: false, error: error.message, tempId: req.body?.tempId })
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
app.get('/api/sessions/list', optionalAuthMiddleware, (req, res) => {
	try {
		let sessions = activityLogger.getSessions()
		const userSessions = getUserSessionIds(req.user)
		
		// Filter sessions based on user ownership
		if (userSessions !== null) {
			sessions = sessions.filter((s: any) => userSessions.includes(s.session_id || s))
		}
		
		res.json({ success: true, data: sessions })
	} catch (error: any) {
		console.error('Error fetching sessions:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get active sessions (for inbox page dropdown)
app.get('/api/sessions', optionalAuthMiddleware, (req, res) => {
	try {
		const allSessions = sessionManager.getAllSessions()
		const userSessions = getUserSessionIds(req.user)
		
		// Filter sessions based on user ownership
		const sessions = allSessions
			.filter(s => {
				// If userSessions is null (admin), show all
				if (userSessions === null) return true
				// Otherwise, filter by user's sessions
				return userSessions.includes(s.id)
			})
			.map(s => ({
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

// Get conversations for a session (for inbox page — admin only)
app.get('/api/messages/conversations/:sessionId', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const { sessionId } = req.params
		const conversations = activityLogger.getConversations(sessionId)
		res.json({ success: true, conversations })
	} catch (error: any) {
		console.error('Error fetching conversations:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get messages for a specific chat (for inbox page — admin only)
app.get('/api/messages/chat/:sessionId/:phone', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const { sessionId, phone } = req.params
		const messages = activityLogger.getChatMessages(sessionId, phone)

		// Mark hidden messages for admin/member UI
		const hiddenIds = hiddenMessageDb.getHiddenForContact(sessionId, phone)
		const enriched = messages.map((m: any) => ({
			...m,
			is_hidden: hiddenIds.has(m.message_id)
		}))

		res.json({ success: true, messages: enriched })
	} catch (error: any) {
		console.error('Error fetching chat messages:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get contacts for a session (admin only)
app.get('/api/contacts/:sessionId', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const { sessionId } = req.params
		const contacts = activityLogger.getContacts(sessionId)
		res.json({ success: true, data: contacts })
	} catch (error: any) {
		console.error('Error fetching contacts:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get logs by date (admin only)
app.get('/api/logs/date/:date', adminOrApiKeyMiddleware, (req, res) => {
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

// Clear old logs (admin only)
app.delete('/api/logs/clear', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const days = parseInt(req.query.days as string) || 30
		const deletedCount = activityLogger.clearOldLogs(days)
		res.json({ success: true, message: `Deleted ${deletedCount} old logs` })
	} catch (error: any) {
		console.error('Error clearing logs:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// ============================================
// Notification API Endpoints
// ============================================

// Register FCM token (member/worker)
app.post('/api/notifications/fcm-token', authMiddleware, (req, res) => {
	try {
		const user = (req as any).user as User
		if (user.role !== 'memberwa' && user.role !== 'worker') {
			return res.status(403).json({ success: false, error: 'Hanya member dan worker yang bisa menerima notifikasi' })
		}

		const { token, platform, browser } = req.body
		if (!token || typeof token !== 'string') {
			return res.status(400).json({ success: false, error: 'Token FCM diperlukan' })
		}

		fcmTokenDb.upsert(user.id, token, platform, browser)
		res.json({ success: true, message: 'FCM token registered' })
	} catch (error: any) {
		console.error('Error registering FCM token:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Remove FCM token
app.delete('/api/notifications/fcm-token', authMiddleware, (req, res) => {
	try {
		const { token } = req.body
		if (!token) {
			return res.status(400).json({ success: false, error: 'Token diperlukan' })
		}
		fcmTokenDb.remove(token)
		res.json({ success: true, message: 'FCM token removed' })
	} catch (error: any) {
		console.error('Error removing FCM token:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get notifications inbox (member/worker)
app.get('/api/notifications', authMiddleware, (req, res) => {
	try {
		const user = (req as any).user as User
		const limit = parseInt(req.query.limit as string) || 50
		const offset = parseInt(req.query.offset as string) || 0

		const notifications = notificationDb.getForUser(user.id, limit, offset)
		const unreadCount = notificationDb.getUnreadCount(user.id)

		res.json({ success: true, notifications, unreadCount })
	} catch (error: any) {
		console.error('Error fetching notifications:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get unread count
app.get('/api/notifications/unread-count', authMiddleware, (req, res) => {
	try {
		const user = (req as any).user as User
		const count = notificationDb.getUnreadCount(user.id)
		res.json({ success: true, count })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Mark notification as read
app.put('/api/notifications/:id/read', authMiddleware, (req, res) => {
	try {
		const user = (req as any).user as User
		const notifId = parseInt(req.params.id)
		notificationDb.markAsRead(notifId, user.id)
		res.json({ success: true })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Mark all notifications as read
app.put('/api/notifications/read-all', authMiddleware, (req, res) => {
	try {
		const user = (req as any).user as User
		notificationDb.markAllAsRead(user.id)
		res.json({ success: true })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Admin: send notification to specific user (testing/manual)
app.post('/api/notifications/send', adminOrApiKeyMiddleware, async (req, res) => {
	try {
		const { userId, title, body, type } = req.body
		if (!userId || !title) {
			return res.status(400).json({ success: false, error: 'userId dan title diperlukan' })
		}
		const result = await notificationService.sendToUser(userId, {
			type: type || 'system',
			title,
			body: body || '',
			data: { url: '/member/dashboard.html' }
		})
		res.json({ success: true, result })
	} catch (error: any) {
		console.error('Error sending notification:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Admin: get notification stats
app.get('/api/notifications/stats', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const onlineCount = getOnlineUserCount()
		const totalTokens = (db.prepare('SELECT COUNT(*) as count FROM fcm_tokens').get() as any)?.count || 0
		const totalNotifs = (db.prepare('SELECT COUNT(*) as count FROM notifications').get() as any)?.count || 0
		const unreadNotifs = (db.prepare('SELECT COUNT(*) as count FROM notifications WHERE read_at IS NULL').get() as any)?.count || 0
		res.json({
			success: true,
			stats: {
				onlineUsers: onlineCount,
				registeredDevices: totalTokens,
				totalNotifications: totalNotifs,
				unreadNotifications: unreadNotifs
			}
		})
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Socket.IO connection
io.on('connection', (socket) => {
	console.log('Client connected:', socket.id)

	// ============================================
	// Auto-register user from httpOnly cookie
	// ============================================
	const cookieHeader = socket.handshake.headers.cookie || ''
	const cookieMatch = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`))
	const autoToken = cookieMatch ? cookieMatch[1] : null
	if (autoToken) {
		const user = validateSession(autoToken)
		if (user) {
			if (user.role === 'adminwa') {
				registerAdminSocket(socket.id)
			} else {
				registerUserSocket(user.id, user.role, socket.id)
				socket.emit('user-registered', { userId: user.id, role: user.role })
				const unreadCount = notificationDb.getUnreadCount(user.id)
				socket.emit('unread-count', { count: unreadCount })
			}
		}
	}

	// ============================================
	// User Presence Tracking for Notifications (fallback manual registration)
	// ============================================
	socket.on('register-user', (data: { sessionToken: string }) => {
		if (!data?.sessionToken) return
		const user = validateSession(data.sessionToken)
		if (user && (user.role === 'memberwa' || user.role === 'worker')) {
			registerUserSocket(user.id, user.role, socket.id)
			socket.emit('user-registered', { userId: user.id, role: user.role })

			// Send unread notification count
			const unreadCount = notificationDb.getUnreadCount(user.id)
			socket.emit('unread-count', { count: unreadCount })
		}
	})

	socket.on('disconnect', () => {
		unregisterUserSocket(socket.id)
		unregisterAdminSocket(socket.id)
		console.log('Client disconnected:', socket.id)
	})

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
			console.log(`📝 Creating session: ${sessionId}`)
			sessionManager.createSession(sessionId)
			const sessions = sessionManager.getAllSessions()
			io.emit('all-sessions', sessions)
			socket.emit('message', `Session ${sessionId} created`)
			console.log(`✅ Session ${sessionId} created successfully`)
		} catch (error: any) {
			console.error(`❌ Error creating session ${sessionId}:`, error.message)
			socket.emit('error', error.message)
		}
	})

	// Start session with QR
	socket.on('start-session-qr', async (sessionId: string) => {
		try {
			console.log(`🔄 Starting session with QR: ${sessionId}`)
			await sessionManager.startSession(sessionId, 'qr')
			socket.emit('message', `Starting session ${sessionId} with QR code`)
			console.log(`✅ Session ${sessionId} started, waiting for QR...`)
		} catch (error: any) {
			console.error(`❌ Error starting session ${sessionId}:`, error.message)
			socket.emit('error', error.message)
		}
	})

	// Start session with pairing code
	socket.on('start-session-pairing', async (data: { sessionId: string, phoneNumber: string }) => {
		try {
			console.log(`🔄 Starting session with pairing: ${data.sessionId}`)
			await sessionManager.startSession(data.sessionId, 'pairing', data.phoneNumber)
			socket.emit('message', `Starting session ${data.sessionId} with pairing code`)
			console.log(`✅ Session ${data.sessionId} started, waiting for pairing code...`)
		} catch (error: any) {
			console.error(`❌ Error starting session ${data.sessionId}:`, error.message)
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
			const jid = data.phone.includes('@') ? data.phone : `${data.phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`
			
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
						remote_jid: jid,
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
										remote_jid: jid,
										message_type: 'image',
										content: '',
										caption: template.content,
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
									remote_jid: jid,
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
					remote_jid: jid,
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

	socket.on('send-reaction', async (data: { sessionId: string, remoteJid: string, messageId: string, fromMe?: boolean, participant?: string | null, emoji: string }) => {
		try {
			if (!data.sessionId || !data.remoteJid || !data.messageId) {
				throw new Error('sessionId, remoteJid, dan messageId wajib diisi')
			}
			const key = {
				remoteJid: data.remoteJid,
				id: data.messageId,
				fromMe: !!data.fromMe,
				participant: data.participant || undefined
			}
			await sessionManager.sendReaction(data.sessionId, data.remoteJid, key, data.emoji || '')
			const updated = messageMutationDb.updateReaction(
				data.sessionId,
				data.remoteJid,
				data.messageId,
				{
					emoji: data.emoji || '',
					fromMe: true,
					sender: data.sessionId,
					participant: data.participant || null,
					timestamp: new Date().toISOString()
				},
				data.fromMe,
				data.participant || null
			)
			const payload = {
				sessionId: data.sessionId,
				remoteJid: data.remoteJid,
				messageId: data.messageId,
				reaction: updated?.reaction_json ? JSON.parse(updated.reaction_json) : [],
				updatedMessage: updated
			}
			socket.emit('message.reaction.updated', payload)
			const authorizedSockets = getAuthorizedSocketIds(data.sessionId, data.remoteJid)
			for (const sid of authorizedSockets) io.to(sid).emit('message.reaction.updated', payload)
		} catch (error: any) {
			socket.emit('send-error', { messageId: data.messageId, error: error.message })
		}
	})

	socket.on('edit-message', async (data: { sessionId: string, remoteJid: string, messageId: string, fromMe?: boolean, participant?: string | null, text: string }) => {
		try {
			if (!data.sessionId || !data.remoteJid || !data.messageId || !data.text?.trim()) {
				throw new Error('sessionId, remoteJid, messageId, dan text wajib diisi')
			}
			const key = {
				remoteJid: data.remoteJid,
				id: data.messageId,
				fromMe: data.fromMe !== false,
				participant: data.participant || undefined
			}
			await sessionManager.editMessage(data.sessionId, data.remoteJid, key, data.text.trim())
			const updated = messageMutationDb.markEdited(data.sessionId, data.remoteJid, data.messageId, data.text.trim(), data.fromMe, data.participant || null)
			const payload = {
				sessionId: data.sessionId,
				remoteJid: data.remoteJid,
				messageId: data.messageId,
				isEdited: true,
				updatedText: data.text.trim(),
				updatedMessage: updated
			}
			socket.emit('message.edited', payload)
			const authorizedSockets = getAuthorizedSocketIds(data.sessionId, data.remoteJid)
			for (const sid of authorizedSockets) io.to(sid).emit('message.edited', payload)
		} catch (error: any) {
			socket.emit('send-error', { messageId: data.messageId, error: error.message })
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
			
			// Save media to file system
			const jid = data.phone.includes('@s.whatsapp.net') ? data.phone : `${data.phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`
			let mediaUrl: string | null = null
			try {
				mediaUrl = saveMediaBase64(data.sessionId, messageId, base64Data, data.mimetype || 'image/jpeg', data.filename || 'image.jpg')
			} catch (saveErr) {
				console.error('⚠️ Failed to save media file:', saveErr)
			}

			try {
				messageLogDb.insert({
					message_id: messageId,
					session_id: data.sessionId,
					direction: 'outgoing',
					from_number: data.sessionId,
					to_number: jid,
					remote_jid: jid,
					message_type: 'image',
					content: '',
					caption: data.caption || '',
					media_url: mediaUrl || undefined,
					media_data: mediaUrl ? undefined : base64Data,
					mimetype: data.mimetype || 'image/jpeg',
					filename: data.filename || 'image.jpg',
					file_size: imageBuffer.length,
					timestamp: new Date().toISOString(),
					status: 'sent',
					source: 'ui'
				})
				console.log('✅ Image saved with messageId:', messageId)
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
				mediaUrl: mediaUrl || null
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
			
			const base64Data = data.base64 || data.video
			if (!base64Data) {
				throw new Error('No video data provided')
			}
			const videoBuffer = Buffer.from(base64Data, 'base64')
			
			const result = await sessionManager.sendVideo(data.sessionId, data.phone, videoBuffer, data.caption || '', data.mimetype, data.filename)
			const messageId = result?.key?.id || `vid_${Date.now()}`
			
			const jid = data.phone.includes('@s.whatsapp.net') ? data.phone : `${data.phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`
			let mediaUrl: string | null = null
			try {
				mediaUrl = saveMediaBase64(data.sessionId, messageId, base64Data, data.mimetype || 'video/mp4', data.filename || 'video.mp4')
			} catch (saveErr) {
				console.error('⚠️ Failed to save video file:', saveErr)
			}

			try {
				messageLogDb.insert({
					message_id: messageId,
					session_id: data.sessionId,
					direction: 'outgoing',
					from_number: data.sessionId,
					to_number: jid,
					remote_jid: jid,
					message_type: 'video',
					content: '',
					caption: data.caption || '',
					media_url: mediaUrl || undefined,
					media_data: mediaUrl ? undefined : base64Data,
					mimetype: data.mimetype || 'video/mp4',
					filename: data.filename || 'video.mp4',
					file_size: videoBuffer.length,
					timestamp: new Date().toISOString(),
					status: 'sent',
					source: 'ui'
				})
				console.log('✅ Video saved with messageId:', messageId)
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
				mediaUrl: mediaUrl || null
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
	socket.on('send-document', async (data: { sessionId: string, phone: string, base64?: string, document?: string, caption?: string, mimetype?: string, filename?: string, tempId?: string }) => {
		try {
			console.log('📎 Received send-document request for', data.phone)
			
			const base64Data = data.base64 || data.document
			if (!base64Data) {
				throw new Error('No document data provided')
			}
			const documentBuffer = Buffer.from(base64Data, 'base64')
			
			const result = await sessionManager.sendDocument(data.sessionId, data.phone, documentBuffer, data.mimetype, data.filename, data.caption)
			const messageId = result?.key?.id || `doc_${Date.now()}`
			
			const jid = data.phone.includes('@s.whatsapp.net') ? data.phone : `${data.phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`
			let mediaUrl: string | null = null
			try {
				mediaUrl = saveMediaBase64(data.sessionId, messageId, base64Data, data.mimetype || 'application/octet-stream', data.filename || 'document')
			} catch (saveErr) {
				console.error('⚠️ Failed to save document file:', saveErr)
			}

			try {
				messageLogDb.insert({
					message_id: messageId,
					session_id: data.sessionId,
					direction: 'outgoing',
					from_number: data.sessionId,
					to_number: jid,
					remote_jid: jid,
					message_type: 'document',
					content: '',
					caption: data.caption || '',
					media_url: mediaUrl || undefined,
					media_data: mediaUrl ? undefined : base64Data,
					mimetype: data.mimetype || 'application/octet-stream',
					filename: data.filename || 'document',
					file_size: documentBuffer.length,
					timestamp: new Date().toISOString(),
					status: 'sent',
					source: 'ui'
				})
				console.log('✅ Document saved with messageId:', messageId)
			} catch (dbError) {
				console.error('⚠️ Failed to save document to database:', dbError)
			}
			
			socket.emit('message-sent', { 
				success: true, 
				sessionId: data.sessionId,
				to: data.phone,
				caption: data.caption || '',
				filename: data.filename || '',
				tempId: data.tempId,
				messageId: messageId,
				mediaType: 'document',
				mediaUrl: mediaUrl || null
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
// Database Maintenance API Endpoints
// ============================================

// Get database statistics
app.get('/api/database/stats', (req, res) => {
	try {
		const sizeInfo = dbMaintenance.getSize()
		const tableStats = dbMaintenance.getTableStats()
		const mediaSize = dbMaintenance.getMediaSize()
		
		res.json({
			success: true,
			size: {
				bytes: sizeInfo.size,
				mb: (sizeInfo.size / 1024 / 1024).toFixed(2),
				pageCount: sizeInfo.pageCount,
				pageSize: sizeInfo.pageSize
			},
			tables: tableStats,
			mediaSize: {
				totalSize: mediaSize.totalSize,
				count: mediaSize.count
			}
		})
	} catch (error: any) {
		console.error('Error getting database stats:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Clean old logs
app.post('/api/database/cleanup', (req, res) => {
	try {
		const { 
			messageDays = 30, 
			sessionDays = 30, 
			autoReplyDays = 7,
			clearAllMedia = false,
			truncateMode = false
		} = req.body
		
		const result = dbMaintenance.fullCleanup(messageDays, sessionDays, autoReplyDays, clearAllMedia, truncateMode)
		
		res.json({
			success: true,
			message: truncateMode ? 'Database truncated successfully' : 'Database cleanup completed',
			result: {
				messagesDeleted: result.messagesDeleted,
				sessionLogsDeleted: result.sessionLogsDeleted,
				autoReplyLogsDeleted: result.autoReplyLogsDeleted,
				cooldownsDeleted: result.cooldownsDeleted,
				mediaCleared: result.mediaCleared,
				sizeBefore: {
					bytes: result.sizeBefore,
					mb: (result.sizeBefore / 1024 / 1024).toFixed(2)
				},
				sizeAfter: {
					bytes: result.sizeAfter,
					mb: (result.sizeAfter / 1024 / 1024).toFixed(2)
				},
				spaceSaved: {
					bytes: result.sizeBefore - result.sizeAfter,
					mb: ((result.sizeBefore - result.sizeAfter) / 1024 / 1024).toFixed(2)
				}
			}
		})
	} catch (error: any) {
		console.error('Error during database cleanup:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Vacuum database
app.post('/api/database/vacuum', (req, res) => {
	try {
		const sizeBefore = dbMaintenance.getSize().size
		dbMaintenance.vacuum()
		dbMaintenance.optimize()
		const sizeAfter = dbMaintenance.getSize().size
		
		res.json({
			success: true,
			message: 'Database vacuumed and optimized',
			sizeBefore: {
				bytes: sizeBefore,
				mb: (sizeBefore / 1024 / 1024).toFixed(2)
			},
			sizeAfter: {
				bytes: sizeAfter,
				mb: (sizeAfter / 1024 / 1024).toFixed(2)
			},
			spaceSaved: {
				bytes: sizeBefore - sizeAfter,
				mb: ((sizeBefore - sizeAfter) / 1024 / 1024).toFixed(2)
			}
		})
	} catch (error: any) {
		console.error('Error during vacuum:', error)
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
// API Endpoints for Auto Reply Rules
// ============================================

// Helper: normalize trigger_value to JSON array string (supports multi-trigger)
function normalizeTriggerValue(triggerValue: any): string {
	if (Array.isArray(triggerValue)) {
		const values = triggerValue.map((v: string) => String(v).trim()).filter((v: string) => v)
		return JSON.stringify(values)
	}
	try {
		const parsed = JSON.parse(triggerValue)
		if (Array.isArray(parsed)) {
			const values = parsed.map((v: string) => String(v).trim()).filter((v: string) => v)
			return JSON.stringify(values)
		}
	} catch {}
	// Plain string - wrap in array
	return JSON.stringify([String(triggerValue).trim()])
}

// Helper: check if trigger_value (array or string) has at least one non-empty entry
function isTriggerValueEmpty(triggerValue: any): boolean {
	if (Array.isArray(triggerValue)) {
		return triggerValue.filter((v: string) => String(v).trim()).length === 0
	}
	try {
		const parsed = JSON.parse(triggerValue)
		if (Array.isArray(parsed)) {
			return parsed.filter((v: string) => String(v).trim()).length === 0
		}
	} catch {}
	return !triggerValue || !String(triggerValue).trim()
}

// Get all auto reply rules
app.get('/api/auto-reply', (req, res) => {
	try {
		const { sessionId, enabledOnly, limit, offset } = req.query
		
		const rules = autoReplyDb.getAll({
			sessionId: sessionId as string,
			enabledOnly: enabledOnly === 'true',
			limit: limit ? parseInt(limit as string) : undefined,
			offset: offset ? parseInt(offset as string) : undefined
		})
		
		const count = autoReplyDb.getCount({
			sessionId: sessionId as string,
			enabledOnly: enabledOnly === 'true'
		})
		
		res.json({
			success: true,
			rules: rules,
			count: count
		})
	} catch (error: any) {
		console.error('Error fetching auto reply rules:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get single auto reply rule by ID
app.get('/api/auto-reply/:id', (req, res) => {
	try {
		const id = parseInt(req.params.id)
		const rule = autoReplyDb.getById(id)
		
		if (!rule) {
			return res.status(404).json({ success: false, error: 'Rule tidak ditemukan' })
		}
		
		res.json({ success: true, rule })
	} catch (error: any) {
		console.error('Error getting auto reply rule:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Create new auto reply rule
app.post('/api/auto-reply', (req, res) => {
	try {
		const { 
			session_id, name, trigger_type, trigger_value, match_case,
			response_type, response_content, response_media_url, response_media_data,
			response_media_filename, response_media_mimetype,
			scope, chat_type, enabled, priority, cooldown_seconds 
		} = req.body
		
		// Normalize scope: accept both 'scope' and 'chat_type' from UI
		// Map 'both' to 'all' for database compatibility
		let normalizedScope = scope || chat_type || 'all'
		if (normalizedScope === 'both') normalizedScope = 'all'
		
		// Validation
		if (!name || !name.trim()) {
			return res.status(400).json({ success: false, error: 'Nama rule wajib diisi' })
		}
		
		if (!trigger_type) {
			return res.status(400).json({ success: false, error: 'Tipe trigger wajib dipilih' })
		}
		
		const validTriggerTypes = ['exact', 'contains', 'starts_with', 'ends_with', 'regex']
		if (!validTriggerTypes.includes(trigger_type)) {
			return res.status(400).json({ success: false, error: 'Tipe trigger tidak valid' })
		}
		
		if (isTriggerValueEmpty(trigger_value)) {
			return res.status(400).json({ success: false, error: 'Nilai trigger wajib diisi' })
		}
		
		if (!response_content || !response_content.trim()) {
			return res.status(400).json({ success: false, error: 'Konten response wajib diisi' })
		}
		
		// Normalize trigger_value to JSON array string (supports multi-trigger)
		const normalizedTriggerValue = normalizeTriggerValue(trigger_value)
		
		// Validate regex if trigger_type is regex
		if (trigger_type === 'regex') {
			try {
				const vals = JSON.parse(normalizedTriggerValue) as string[]
				for (const v of vals) { new RegExp(v) }
			} catch (e) {
				return res.status(400).json({ success: false, error: 'Regex pattern tidak valid' })
			}
		}
		
		const result = autoReplyDb.create({
			session_id: session_id || null,
			name: name.trim(),
			trigger_type,
			trigger_value: normalizedTriggerValue,
			match_case: match_case ? 1 : 0,
			response_type: response_type || 'text',
			response_content: response_content.trim(),
			response_media_url: response_media_url || null,
			response_media_data: response_media_data || null,
			response_media_filename: response_media_filename || null,
			response_media_mimetype: response_media_mimetype || null,
			scope: normalizedScope,
			enabled: enabled !== undefined ? (enabled ? 1 : 0) : 1,
			priority: priority || 0,
			cooldown_seconds: cooldown_seconds || 0
		})
		
		if (result.success) {
			const newRule = autoReplyDb.getById(Number(result.id))
			res.json({ 
				success: true, 
				message: 'Rule auto reply berhasil dibuat',
				rule: newRule 
			})
		} else {
			res.status(400).json({ success: false, error: result.error })
		}
	} catch (error: any) {
		console.error('Error creating auto reply rule:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Update auto reply rule
app.put('/api/auto-reply/:id', (req, res) => {
	try {
		const id = parseInt(req.params.id)
		const { 
			session_id, name, trigger_type, trigger_value, match_case,
			response_type, response_content, response_media_url, response_media_data,
			response_media_filename, response_media_mimetype,
			scope, chat_type, enabled, priority, cooldown_seconds 
		} = req.body
		
		// Normalize scope: accept both 'scope' and 'chat_type' from UI
		// Map 'both' to 'all' for database compatibility
		let normalizedScope = scope !== undefined ? scope : (chat_type !== undefined ? chat_type : undefined)
		if (normalizedScope === 'both') normalizedScope = 'all'
		
		// Check if rule exists
		const existing = autoReplyDb.getById(id)
		if (!existing) {
			return res.status(404).json({ success: false, error: 'Rule tidak ditemukan' })
		}
		
		// Validation
		if (name !== undefined && !name.trim()) {
			return res.status(400).json({ success: false, error: 'Nama rule wajib diisi' })
		}
		
		if (trigger_type !== undefined) {
			const validTriggerTypes = ['exact', 'contains', 'starts_with', 'ends_with', 'regex']
			if (!validTriggerTypes.includes(trigger_type)) {
				return res.status(400).json({ success: false, error: 'Tipe trigger tidak valid' })
			}
		}
		
		if (trigger_value !== undefined && isTriggerValueEmpty(trigger_value)) {
			return res.status(400).json({ success: false, error: 'Nilai trigger wajib diisi' })
		}
		
		if (response_content !== undefined && !response_content.trim()) {
			return res.status(400).json({ success: false, error: 'Konten response wajib diisi' })
		}
		
		// Normalize trigger_value to JSON array string (supports multi-trigger)
		const normalizedTriggerValue = trigger_value !== undefined ? normalizeTriggerValue(trigger_value) : undefined
		
		// Validate regex if trigger_type is regex
		const checkType = trigger_type || existing.trigger_type
		const checkValue = normalizedTriggerValue || existing.trigger_value
		if (checkType === 'regex') {
			try {
				let vals: string[]
				try { vals = JSON.parse(checkValue) } catch { vals = [checkValue] }
				for (const v of vals) { new RegExp(v) }
			} catch (e) {
				return res.status(400).json({ success: false, error: 'Regex pattern tidak valid' })
			}
		}
		
		const updateData: any = {}
		if (session_id !== undefined) updateData.session_id = session_id || null
		if (name !== undefined) updateData.name = name.trim()
		if (trigger_type !== undefined) updateData.trigger_type = trigger_type
		if (normalizedTriggerValue !== undefined) updateData.trigger_value = normalizedTriggerValue
		if (match_case !== undefined) updateData.match_case = match_case ? 1 : 0
		if (response_type !== undefined) updateData.response_type = response_type
		if (response_content !== undefined) updateData.response_content = response_content.trim()
		if (response_media_url !== undefined) updateData.response_media_url = response_media_url || null
		if (response_media_data !== undefined) updateData.response_media_data = response_media_data || null
		if (response_media_filename !== undefined) updateData.response_media_filename = response_media_filename || null
		if (response_media_mimetype !== undefined) updateData.response_media_mimetype = response_media_mimetype || null
		if (normalizedScope !== undefined) updateData.scope = normalizedScope
		if (enabled !== undefined) updateData.enabled = enabled ? 1 : 0
		if (priority !== undefined) updateData.priority = priority
		if (cooldown_seconds !== undefined) updateData.cooldown_seconds = cooldown_seconds
		
		const result = autoReplyDb.update(id, updateData)
		
		if (result.success) {
			const updatedRule = autoReplyDb.getById(id)
			res.json({ 
				success: true, 
				message: 'Rule auto reply berhasil diupdate',
				rule: updatedRule 
			})
		} else {
			res.status(400).json({ success: false, error: result.error })
		}
	} catch (error: any) {
		console.error('Error updating auto reply rule:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Delete auto reply rule
app.delete('/api/auto-reply/:id', (req, res) => {
	try {
		const id = parseInt(req.params.id)
		
		// Check if rule exists
		const existing = autoReplyDb.getById(id)
		if (!existing) {
			return res.status(404).json({ success: false, error: 'Rule tidak ditemukan' })
		}
		
		const result = autoReplyDb.delete(id)
		
		if (result.success) {
			res.json({ 
				success: true, 
				message: `Rule "${existing.name}" berhasil dihapus` 
			})
		} else {
			res.status(400).json({ success: false, error: result.error })
		}
	} catch (error: any) {
		console.error('Error deleting auto reply rule:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Bulk delete auto reply rules
app.post('/api/auto-reply/bulk-delete', (req, res) => {
	try {
		const { ids } = req.body
		
		if (!ids || !Array.isArray(ids) || ids.length === 0) {
			return res.status(400).json({ success: false, error: 'ID rule tidak valid' })
		}
		
		const result = autoReplyDb.bulkDelete(ids)
		
		if (result.success) {
			res.json({ 
				success: true, 
				message: `${result.deleted} rule berhasil dihapus`,
				deleted: result.deleted
			})
		} else {
			res.status(400).json({ success: false, error: result.error })
		}
	} catch (error: any) {
		console.error('Error bulk deleting auto reply rules:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Toggle auto reply rule enabled status
app.patch('/api/auto-reply/:id/toggle', (req, res) => {
	try {
		const id = parseInt(req.params.id)
		
		const result = autoReplyDb.toggleEnabled(id)
		
		if (result.success) {
			const rule = autoReplyDb.getById(id)
			res.json({ 
				success: true, 
				message: `Rule ${result.enabled ? 'diaktifkan' : 'dinonaktifkan'}`,
				rule: rule
			})
		} else {
			res.status(400).json({ success: false, error: result.error })
		}
	} catch (error: any) {
		console.error('Error toggling auto reply rule:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Test auto reply rule (test matching)
app.post('/api/auto-reply/:id/test', (req, res) => {
	try {
		const id = parseInt(req.params.id)
		const { message, isGroup } = req.body
		
		const rule = autoReplyDb.getById(id)
		if (!rule) {
			return res.status(404).json({ success: false, error: 'Rule tidak ditemukan' })
		}
		
		if (!message) {
			return res.status(400).json({ success: false, error: 'Pesan test wajib diisi' })
		}
		
		// Check scope
		const isGroupChat = isGroup === true
		if (rule.scope === 'private' && isGroupChat) {
			return res.json({ 
				success: true, 
				matched: false, 
				reason: 'Rule hanya untuk chat pribadi, bukan grup'
			})
		}
		if (rule.scope === 'group' && !isGroupChat) {
			return res.json({ 
				success: true, 
				matched: false, 
				reason: 'Rule hanya untuk grup, bukan chat pribadi'
			})
		}
		
		// Test matching
		const text = rule.match_case ? message : message.toLowerCase()
		const triggerVal = rule.match_case ? rule.trigger_value : rule.trigger_value.toLowerCase()
		
		let matched = false
		
		switch (rule.trigger_type) {
			case 'exact':
				matched = text === triggerVal
				break
			case 'contains':
				matched = text.includes(triggerVal)
				break
			case 'starts_with':
				matched = text.startsWith(triggerVal)
				break
			case 'ends_with':
				matched = text.endsWith(triggerVal)
				break
			case 'regex':
				try {
					const regex = new RegExp(rule.trigger_value, rule.match_case ? '' : 'i')
					matched = regex.test(message)
				} catch (e) {
					return res.json({ 
						success: true, 
						matched: false, 
						reason: 'Regex pattern tidak valid'
					})
				}
				break
		}
		
		res.json({ 
			success: true, 
			matched: matched,
			rule: rule,
			response: matched ? rule.response_content : null,
			reason: matched ? 'Pesan cocok dengan trigger' : 'Pesan tidak cocok dengan trigger'
		})
	} catch (error: any) {
		console.error('Error testing auto reply rule:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// ============================================
// API Endpoints for Auto Reply Logs
// ============================================

// Get all auto reply logs
app.get('/api/auto-reply-logs', (req, res) => {
	try {
		const { sessionId, ruleId, status, limit, offset, startDate, endDate } = req.query
		
		const logs = autoReplyLogDb.getAll({
			sessionId: sessionId as string,
			ruleId: ruleId ? parseInt(ruleId as string) : undefined,
			status: status as string,
			limit: limit ? parseInt(limit as string) : 100,
			offset: offset ? parseInt(offset as string) : undefined,
			startDate: startDate as string,
			endDate: endDate as string
		})
		
		const count = autoReplyLogDb.getCount({
			sessionId: sessionId as string,
			ruleId: ruleId ? parseInt(ruleId as string) : undefined
		})
		
		res.json({
			success: true,
			logs: logs,
			count: count
		})
	} catch (error: any) {
		console.error('Error fetching auto reply logs:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get auto reply statistics
app.get('/api/auto-reply-stats', (req, res) => {
	try {
		const { sessionId } = req.query
		
		const stats = autoReplyLogDb.getStatistics(sessionId as string)
		const ruleCount = autoReplyDb.getCount({
			sessionId: sessionId as string,
			enabledOnly: false
		})
		const activeRuleCount = autoReplyDb.getCount({
			sessionId: sessionId as string,
			enabledOnly: true
		})
		
		res.json({
			success: true,
			stats: {
				...stats,
				total_rules: ruleCount,
				active_rules: activeRuleCount
			}
		})
	} catch (error: any) {
		console.error('Error fetching auto reply stats:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Delete old auto reply logs
app.delete('/api/auto-reply-logs/cleanup', (req, res) => {
	try {
		const { days } = req.query
		const daysToKeep = days ? parseInt(days as string) : 30
		
		const deleted = autoReplyLogDb.deleteOlderThan(daysToKeep)
		
		res.json({
			success: true,
			message: `${deleted} log berhasil dihapus`,
			deleted: deleted
		})
	} catch (error: any) {
		console.error('Error cleaning up auto reply logs:', error)
		res.status(500).json({ success: false, error: error.message })
	}
})

// Seed default auto reply rules
app.post('/api/auto-reply/seed-defaults', (req, res) => {
	try {
		const defaultRules = [
			{
				name: 'Greeting Hallo',
				trigger_type: 'contains' as const,
				trigger_value: 'hallo',
				response_type: 'text' as const,
				response_content: 'Hallo kak, ada yang bisa kami bantu? 😊',
				scope: 'all' as const,
				priority: 10,
				cooldown_seconds: 60
			},
			{
				name: 'Greeting Assalamualaikum',
				trigger_type: 'contains' as const,
				trigger_value: 'assalamualaikum',
				response_type: 'text' as const,
				response_content: "Wa'alaikumsalam warahmatullahi wabarakatuh 🙏",
				scope: 'all' as const,
				priority: 10,
				cooldown_seconds: 60
			},
			{
				name: 'Greeting Selamat Pagi',
				trigger_type: 'contains' as const,
				trigger_value: 'selamat pagi',
				response_type: 'text' as const,
				response_content: 'Selamat pagi juga kak! 🌅 Ada yang bisa kami bantu?',
				scope: 'all' as const,
				priority: 8,
				cooldown_seconds: 60
			},
			{
				name: 'Tanya Harga',
				trigger_type: 'contains' as const,
				trigger_value: 'harga',
				response_type: 'text' as const,
				response_content: 'Untuk informasi harga, silakan hubungi admin kami atau kunjungi website resmi kami. Terima kasih! 💰',
				scope: 'private' as const,
				priority: 5,
				cooldown_seconds: 120
			},
			{
				name: 'Terima Kasih',
				trigger_type: 'contains' as const,
				trigger_value: 'terima kasih',
				response_type: 'text' as const,
				response_content: 'Sama-sama kak! Senang bisa membantu. 🙏✨',
				scope: 'all' as const,
				priority: 3,
				cooldown_seconds: 60
			}
		]
		
		let created = 0
		let skipped = 0
		
		for (const rule of defaultRules) {
			// Check if similar rule exists
			const existingRules = autoReplyDb.getAll({ enabledOnly: false })
			const exists = existingRules.some(r => 
				r.trigger_value.toLowerCase() === rule.trigger_value.toLowerCase() &&
				r.trigger_type === rule.trigger_type
			)
			
			if (!exists) {
				autoReplyDb.create(rule)
				created++
			} else {
				skipped++
			}
		}
		
		res.json({
			success: true,
			message: `${created} rule default berhasil dibuat, ${skipped} sudah ada`,
			created,
			skipped
		})
	} catch (error: any) {
		console.error('Error seeding default rules:', error)
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
			groups_data: groupsData ? JSON.stringify(groupsData) : undefined,
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
		console.log(`🔄 API: Connecting session ${sessionId}`)
		
		// Check if session already exists and connected
		const existingSession = sessionManager.getSessionInfo(sessionId)
		if (existingSession?.status === 'connected') {
			console.log(`✅ Session ${sessionId} already connected`)
			return res.json({ 
				success: false, 
				connected: true,
				message: 'Session already connected' 
			})
		}
		
		// Create or start session
		console.log(`📝 Creating session ${sessionId}...`)
		sessionManager.createSession(sessionId)
		console.log(`🔄 Starting session ${sessionId} with QR...`)
		await sessionManager.startSession(sessionId, 'qr')
		console.log(`✅ Session ${sessionId} started, waiting for QR code`)
		
		res.json({
			success: true,
			message: `Session ${sessionId} connecting...`,
			sessionId: sessionId
		})
	} catch (error: any) {
		console.error('❌ Error connecting session:', error.message)
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
			groups_data: groups ? JSON.stringify(groups) : undefined,
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

// ============================================
// Auto Forward API Endpoints
// ============================================

// Get config for a session
app.get('/api/auto-forward/config', (req, res) => {
	try {
		const { sessionId } = req.query
		if (sessionId) {
			const config = autoForwardConfigDb.get(sessionId as string)
			res.json({ success: true, config })
		} else {
			const configs = autoForwardConfigDb.getAll()
			res.json({ success: true, configs })
		}
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Save / update config
app.post('/api/auto-forward/config', (req, res) => {
	try {
		const { session_id, admin_number, enabled, token_prefix, forward_media, forward_groups } = req.body
		if (!session_id) return res.status(400).json({ success: false, error: 'session_id wajib diisi' })
		if (!admin_number || !admin_number.trim()) return res.status(400).json({ success: false, error: 'Nomor admin wajib diisi' })

		// Normalize admin number to JID format
		let adminJid = admin_number.replace(/[^0-9]/g, '')
		if (!adminJid.includes('@')) adminJid = adminJid + '@s.whatsapp.net'

		const result = autoForwardConfigDb.upsert({
			session_id,
			admin_number: adminJid,
			enabled: enabled !== undefined ? (enabled ? 1 : 0) : 1,
			token_prefix: (token_prefix || 'CT').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 5),
			forward_media: forward_media !== undefined ? (forward_media ? 1 : 0) : 1,
			forward_groups: forward_groups !== undefined ? (forward_groups ? 1 : 0) : 0
		})

		if (result.success) {
			const config = autoForwardConfigDb.get(session_id)
			res.json({ success: true, message: 'Konfigurasi auto-forward berhasil disimpan', config })
		} else {
			res.status(400).json({ success: false, error: result.error })
		}
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Toggle auto-forward on/off
app.patch('/api/auto-forward/config/toggle', (req, res) => {
	try {
		const { session_id, enabled } = req.body
		if (!session_id) return res.status(400).json({ success: false, error: 'session_id wajib' })
		const result = autoForwardConfigDb.toggle(session_id, !!enabled)
		res.json({ success: result.success, message: enabled ? 'Auto-forward diaktifkan' : 'Auto-forward dinonaktifkan' })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Delete config
app.delete('/api/auto-forward/config/:sessionId', (req, res) => {
	try {
		autoForwardConfigDb.delete(req.params.sessionId)
		autoForwardTokenDb.clearAll(req.params.sessionId)
		res.json({ success: true, message: 'Konfigurasi auto-forward dihapus' })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get tokens for a session
app.get('/api/auto-forward/tokens', (req, res) => {
	try {
		const { sessionId, search, limit, offset } = req.query
		if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId wajib' })
		const tokens = autoForwardTokenDb.getAll(sessionId as string, {
			search: search as string,
			limit: limit ? parseInt(limit as string) : 50,
			offset: offset ? parseInt(offset as string) : 0
		})
		const count = autoForwardTokenDb.getCount(sessionId as string)
		res.json({ success: true, tokens, count })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Delete a single token
app.delete('/api/auto-forward/tokens/:id', (req, res) => {
	try {
		autoForwardTokenDb.delete(parseInt(req.params.id))
		res.json({ success: true, message: 'Token dihapus' })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Clear all tokens for a session
app.delete('/api/auto-forward/tokens/clear/:sessionId', (req, res) => {
	try {
		const result = autoForwardTokenDb.clearAll(req.params.sessionId)
		res.json({ success: true, message: `${result.deleted} token dihapus` })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get forward logs
app.get('/api/auto-forward/logs', (req, res) => {
	try {
		const { sessionId, direction, limit, offset } = req.query
		const logs = autoForwardLogDb.getAll({
			sessionId: sessionId as string,
			direction: direction as string,
			limit: limit ? parseInt(limit as string) : 50,
			offset: offset ? parseInt(offset as string) : 0
		})
		const count = autoForwardLogDb.getCount({
			sessionId: sessionId as string,
			direction: direction as string
		})
		res.json({ success: true, logs, count })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Get stats
app.get('/api/auto-forward/stats', (req, res) => {
	try {
		const { sessionId } = req.query
		const stats = autoForwardLogDb.getStats(sessionId as string)
		const tokenCount = sessionId ? autoForwardTokenDb.getCount(sessionId as string) : 0
		res.json({ success: true, stats: { ...stats, tokens: tokenCount } })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// Cleanup logs
app.delete('/api/auto-forward/logs/cleanup', (req, res) => {
	try {
		const days = parseInt(req.query.days as string) || 30
		const deleted = autoForwardLogDb.cleanup(days)
		res.json({ success: true, deleted, message: `${deleted} log dihapus` })
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// ============================================
// Health Check Endpoint (untuk Docker)
// ============================================
const startTime = Date.now()

app.get('/api/health', (req, res) => {
	const uptime = Math.floor((Date.now() - startTime) / 1000)
	const sessions = sessionManager.getAllSessions()
	const connectedSessions = sessions.filter(s => s.isConnected).length
	
	res.json({
		status: 'ok',
		uptime: uptime,
		uptimeFormatted: formatUptime(uptime),
		sessions: {
			total: sessions.length,
			connected: connectedSessions
		},
		memory: {
			used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
			total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
			unit: 'MB'
		},
		timestamp: new Date().toISOString()
	})
})

// ============================================
// App Settings API
// ============================================

// Multer storage for settings uploads (logo, favicon)
const settingsUploadDir = path.join(publicDir, 'uploads', 'settings')
if (!fs.existsSync(settingsUploadDir)) fs.mkdirSync(settingsUploadDir, { recursive: true })

const settingsStorage = multer.diskStorage({
	destination: (_req, _file, cb) => cb(null, settingsUploadDir),
	filename: (_req, file, cb) => {
		const ext = path.extname(file.originalname).toLowerCase()
		cb(null, `${file.fieldname}-${Date.now()}${ext}`)
	}
})

const settingsUpload = multer({
	storage: settingsStorage,
	limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
	fileFilter: (_req, file, cb) => {
		const allowed = ['.png', '.jpg', '.jpeg', '.svg', '.ico', '.gif', '.webp']
		const ext = path.extname(file.originalname).toLowerCase()
		if (allowed.includes(ext)) cb(null, true)
		else cb(new Error('Format file tidak didukung. Gunakan PNG, JPG, SVG, ICO.'))
	}
})

// GET /api/settings/public — No auth required (used by all pages for branding)
app.get('/api/settings/public', (req, res) => {
	try {
		const s = appSettingDb.get()
		const baseUrl = `${req.protocol}://${req.get('host')}`
		res.json({
			success: true,
			settings: {
				app_name: s.app_name || 'Billey WA',
				app_tagline: s.app_tagline || 'WhatsApp Multi Session',
				logo_url: s.logo ? `/uploads/settings/${path.basename(s.logo)}` : null,
				logo_small_url: s.logo_small ? `/uploads/settings/${path.basename(s.logo_small)}` : null,
				favicon_url: s.favicon ? `/uploads/settings/${path.basename(s.favicon)}` : null,
				admin_phone: (s as any).admin_phone || ''
			}
		})
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// GET /api/settings — Admin only, returns raw paths too
app.get('/api/settings', adminOrApiKeyMiddleware, (req, res) => {
	try {
		const s = appSettingDb.get()
		res.json({
			success: true,
			settings: {
				...s,
				logo_url: s.logo ? `/uploads/settings/${path.basename(s.logo)}` : null,
				logo_small_url: s.logo_small ? `/uploads/settings/${path.basename(s.logo_small)}` : null,
				favicon_url: s.favicon ? `/uploads/settings/${path.basename(s.favicon)}` : null
			}
		})
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message })
	}
})

// POST /api/settings — Admin only, handles multipart upload
app.post('/api/settings', adminOrApiKeyMiddleware,
	(req: any, res: any, next: any) => {
		// Wrap multer so upload errors return JSON (not Express HTML error page)
		settingsUpload.fields([
			{ name: 'logo', maxCount: 1 },
			{ name: 'logo_small', maxCount: 1 },
			{ name: 'favicon', maxCount: 1 }
		])(req, res, (uploadErr: any) => {
			if (uploadErr) return res.status(400).json({ success: false, error: uploadErr.message || 'Upload gagal' })
			next()
		})
	},
	(req: any, res: any) => {
		try {
			const files = req.files as Record<string, Express.Multer.File[]> | undefined
			const current = appSettingDb.get()

			const updateData: any = {}

			if (req.body.app_name?.trim()) updateData.app_name = req.body.app_name.trim()
			if (req.body.app_tagline !== undefined) updateData.app_tagline = req.body.app_tagline.trim()
			if (req.body.admin_phone !== undefined) updateData.admin_phone = req.body.admin_phone.trim()

			// Handle logo upload — delete old file if replaced
			if (files?.['logo']?.[0]) {
				if (current.logo && fs.existsSync(current.logo)) fs.unlinkSync(current.logo)
				updateData.logo = files['logo'][0].path
			}
			if (files?.['logo_small']?.[0]) {
				if (current.logo_small && fs.existsSync(current.logo_small)) fs.unlinkSync(current.logo_small)
				updateData.logo_small = files['logo_small'][0].path
			}
			if (files?.['favicon']?.[0]) {
				if (current.favicon && fs.existsSync(current.favicon)) fs.unlinkSync(current.favicon)
				updateData.favicon = files['favicon'][0].path
			}

			// Delete logo if remove flag sent
			if (req.body.remove_logo === '1') {
				if (current.logo && fs.existsSync(current.logo)) fs.unlinkSync(current.logo)
				updateData.logo = null
			}
			if (req.body.remove_logo_small === '1') {
				if (current.logo_small && fs.existsSync(current.logo_small)) fs.unlinkSync(current.logo_small)
				updateData.logo_small = null
			}
			if (req.body.remove_favicon === '1') {
				if (current.favicon && fs.existsSync(current.favicon)) fs.unlinkSync(current.favicon)
				updateData.favicon = null
			}

			appSettingDb.update(updateData)

			const updated = appSettingDb.get()
			res.json({
				success: true,
				message: 'Pengaturan berhasil disimpan',
				settings: {
					...updated,
					logo_url: updated.logo ? `/uploads/settings/${path.basename(updated.logo)}` : null,
					logo_small_url: updated.logo_small ? `/uploads/settings/${path.basename(updated.logo_small)}` : null,
					favicon_url: updated.favicon ? `/uploads/settings/${path.basename(updated.favicon)}` : null
				}
			})
		} catch (error: any) {
			console.error('Settings update error:', error)
			res.status(500).json({ success: false, error: error.message })
		}
	}
)

function formatUptime(seconds: number): string {
	const days = Math.floor(seconds / 86400)
	const hours = Math.floor((seconds % 86400) / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const secs = seconds % 60
	
	const parts = []
	if (days > 0) parts.push(`${days}d`)
	if (hours > 0) parts.push(`${hours}h`)
	if (minutes > 0) parts.push(`${minutes}m`)
	parts.push(`${secs}s`)
	
	return parts.join(' ')
}

const PORT = process.env.PORT || 8080

server.on('error', (err: NodeJS.ErrnoException) => {
	if (err.code === 'EADDRINUSE') {
		console.error(`❌ Port ${PORT} is already in use. Please stop the other process first.`)
		console.error(`   Run: npx kill-port ${PORT}   or find and stop the process using port ${PORT}.`)
		process.exit(1)
	} else {
		throw err
	}
})

server.listen(PORT, async () => {
	console.log(`🚀 Server running on http://localhost:${PORT}`)
	console.log(`📱 Open browser and visit http://localhost:${PORT}`)
	
	// Migrate existing base64 media from database to file system
	try {
		migrateMediaFromDb(db)
	} catch (err) {
		console.error('⚠️ Media migration error:', err)
	}

	// Start cleanup: delete media files older than 7 days (check every 6 hours)
	startMediaAutoCleanup(3, 6) // DB blob cleanup
	setInterval(() => {
		try {
			const deleted = cleanupOldMedia(7)
			if (deleted > 0) {
				console.log(`🗑️ Auto-deleted ${deleted} media files older than 7 days`)
				// Mark DB rows where file was deleted
				db.prepare(`
					UPDATE message_logs 
					SET media_url = NULL 
					WHERE media_url IS NOT NULL AND media_url != ''
					AND datetime(timestamp) < datetime('now', '-7 days')
				`).run()
			}
		} catch (err) {
			console.error('⚠️ Media cleanup error:', err)
		}
	}, 6 * 60 * 60 * 1000) // Every 6 hours
	
	// Run once at startup too
	setTimeout(() => {
		try {
			const deleted = cleanupOldMedia(7)
			if (deleted > 0) {
				console.log(`🗑️ Startup cleanup: deleted ${deleted} media files older than 7 days`)
				db.prepare(`
					UPDATE message_logs 
					SET media_url = NULL 
					WHERE media_url IS NOT NULL AND media_url != ''
					AND datetime(timestamp) < datetime('now', '-7 days')
				`).run()
			}
		} catch (_) {}
	}, 5000)
	
	// Auto-reconnect all saved sessions after server starts
	console.log('⏳ Waiting 3 seconds before auto-reconnecting sessions...')
	setTimeout(async () => {
		try {
			await sessionManager.autoReconnectAllSessions()
		} catch (error) {
			console.error('❌ Error during auto-reconnect:', error)
		}
	}, 3000)
})
