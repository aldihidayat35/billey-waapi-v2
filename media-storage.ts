import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Media storage directory
const MEDIA_DIR = path.join(__dirname, 'data', 'media')

// Ensure media directory exists at startup
if (!fs.existsSync(MEDIA_DIR)) {
	fs.mkdirSync(MEDIA_DIR, { recursive: true })
}

// Extension map from mimetype
const MIME_EXT: Record<string, string> = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/gif': '.gif',
	'image/webp': '.webp',
	'video/mp4': '.mp4',
	'video/3gpp': '.3gp',
	'audio/ogg': '.ogg',
	'audio/ogg; codecs=opus': '.ogg',
	'audio/mpeg': '.mp3',
	'audio/mp4': '.m4a',
	'application/pdf': '.pdf',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
	'application/vnd.ms-excel': '.xls',
	'application/msword': '.doc',
	'application/zip': '.zip',
	'text/plain': '.txt',
}

function getExtension(mimetype?: string, filename?: string): string {
	if (filename) {
		const ext = path.extname(filename)
		if (ext) return ext
	}
	if (mimetype) {
		const lower = mimetype.toLowerCase().split(';')[0].trim()
		if (MIME_EXT[lower]) return MIME_EXT[lower]
	}
	return '.bin'
}

function ensureSessionDir(sessionId: string): string {
	// Sanitize session ID for directory name
	const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')
	const dir = path.join(MEDIA_DIR, safe)
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true })
	}
	return dir
}

/**
 * Save media buffer to file system.
 * Returns the relative URL path for serving: /media/{sessionId}/{messageId}{ext}
 */
export function saveMedia(
	sessionId: string,
	messageId: string,
	buffer: Buffer,
	mimetype?: string,
	filename?: string
): string {
	const dir = ensureSessionDir(sessionId)
	const ext = getExtension(mimetype, filename)
	// Sanitize messageId for filename
	const safeId = messageId.replace(/[^a-zA-Z0-9_-]/g, '_')
	const fname = `${safeId}${ext}`
	const filePath = path.join(dir, fname)

	fs.writeFileSync(filePath, buffer)
	console.log(`💾 Media saved: ${filePath} (${buffer.length} bytes)`)

	const safeSession = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')
	return `/media/${safeSession}/${fname}`
}

/**
 * Save base64-encoded media to file system.
 * Returns the relative URL path.
 */
export function saveMediaBase64(
	sessionId: string,
	messageId: string,
	base64Data: string,
	mimetype?: string,
	filename?: string
): string {
	const buffer = Buffer.from(base64Data, 'base64')
	return saveMedia(sessionId, messageId, buffer, mimetype, filename)
}

/**
 * Get the absolute file path for a media URL.
 * Returns null if file doesn't exist.
 */
export function getMediaPath(mediaUrl: string): string | null {
	if (!mediaUrl || !mediaUrl.startsWith('/media/')) return null
	// Remove /media/ prefix to get relative path
	const relative = mediaUrl.replace(/^\/media\//, '')
	const filePath = path.join(MEDIA_DIR, relative)
	// Security: ensure the resolved path is within MEDIA_DIR
	const resolved = path.resolve(filePath)
	if (!resolved.startsWith(path.resolve(MEDIA_DIR))) return null
	if (!fs.existsSync(resolved)) return null
	return resolved
}

/**
 * Delete media file.
 * Returns true if deleted, false if not found.
 */
export function deleteMedia(mediaUrl: string): boolean {
	const filePath = getMediaPath(mediaUrl)
	if (!filePath) return false
	try {
		fs.unlinkSync(filePath)
		return true
	} catch {
		return false
	}
}

/**
 * Clean up media files older than specified days.
 * Returns the number of files deleted.
 */
export function cleanupOldMedia(maxAgeDays: number = 7): number {
	let deleted = 0
	const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000

	if (!fs.existsSync(MEDIA_DIR)) return 0

	const sessionDirs = fs.readdirSync(MEDIA_DIR, { withFileTypes: true })
	for (const entry of sessionDirs) {
		if (!entry.isDirectory()) continue
		const sessionDir = path.join(MEDIA_DIR, entry.name)
		const files = fs.readdirSync(sessionDir, { withFileTypes: true })
		for (const file of files) {
			if (!file.isFile()) continue
			const filePath = path.join(sessionDir, file.name)
			try {
				const stat = fs.statSync(filePath)
				if (stat.mtimeMs < cutoff) {
					fs.unlinkSync(filePath)
					deleted++
				}
			} catch {
				// Ignore errors on individual files
			}
		}
		// Remove empty session directories
		try {
			const remaining = fs.readdirSync(sessionDir)
			if (remaining.length === 0) {
				fs.rmdirSync(sessionDir)
			}
		} catch {
			// Ignore
		}
	}

	return deleted
}

/**
 * Get the MEDIA_DIR path for Express static serving.
 */
export function getMediaDir(): string {
	return MEDIA_DIR
}

/**
 * Migrate existing base64 media_data from database to file system.
 * Call this once during startup.
 */
export function migrateMediaFromDb(db: any): number {
	let migrated = 0
	try {
		const rows = db.prepare(`
			SELECT message_id, session_id, media_data, mimetype, filename
			FROM message_logs 
			WHERE media_data IS NOT NULL AND media_data != ''
			AND (media_url IS NULL OR media_url = '')
			LIMIT 100
		`).all() as any[]

		for (const row of rows) {
			try {
				const url = saveMediaBase64(
					row.session_id,
					row.message_id,
					row.media_data,
					row.mimetype,
					row.filename
				)
				db.prepare(`UPDATE message_logs SET media_url = ?, media_data = NULL WHERE message_id = ?`)
					.run(url, row.message_id)
				migrated++
			} catch (err) {
				console.error(`⚠️ Failed to migrate media for ${row.message_id}:`, err)
			}
		}

		if (migrated > 0) {
			console.log(`📦 Migrated ${migrated} media files from database to file system`)
		}

		// Check if there are more to migrate
		const remaining = db.prepare(`
			SELECT COUNT(*) as cnt FROM message_logs 
			WHERE media_data IS NOT NULL AND media_data != ''
			AND (media_url IS NULL OR media_url = '')
		`).get() as any
		if (remaining?.cnt > 0) {
			console.log(`📦 ${remaining.cnt} more media files pending migration (will be handled on next restart)`)
		}
	} catch (err) {
		console.error('⚠️ Media migration error:', err)
	}
	return migrated
}
