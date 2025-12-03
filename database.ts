import Database from 'better-sqlite3'
import * as path from 'path'
import { fileURLToPath } from 'url'

// Get __dirname equivalent in ES module
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Database file path
const DB_PATH = path.join(__dirname, 'data', 'whatsapp.db')

// Ensure data directory exists
import * as fs from 'fs'
const dataDir = path.join(__dirname, 'data')
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
}

// Initialize database
const db = new Database(DB_PATH)

// Enable foreign keys and WAL mode for better performance
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Create tables
db.exec(`
    -- Message Logs Table
    CREATE TABLE IF NOT EXISTS message_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT UNIQUE,
        session_id TEXT NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('incoming', 'outgoing')),
        from_number TEXT NOT NULL,
        to_number TEXT NOT NULL,
        message_type TEXT NOT NULL DEFAULT 'text',
        content TEXT,
        media_url TEXT,
        media_data TEXT,
        filename TEXT,
        file_size INTEGER,
        mimetype TEXT,
        timestamp DATETIME NOT NULL,
        status TEXT DEFAULT 'received',
        source TEXT DEFAULT 'contact',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Session Logs Table
    CREATE TABLE IF NOT EXISTS session_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        user_id TEXT,
        user_name TEXT,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Chat Templates Table
    CREATE TABLE IF NOT EXISTS chat_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE COLLATE NOCASE,
        title TEXT,
        content TEXT NOT NULL,
        description TEXT,
        media_data TEXT,
        media_mimetype TEXT,
        media_filename TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Group Exports Table
    CREATE TABLE IF NOT EXISTS group_exports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        phone_number TEXT,
        file_name TEXT NOT NULL,
        file_path TEXT,
        file_size INTEGER,
        total_groups INTEGER DEFAULT 0,
        total_members INTEGER DEFAULT 0,
        phone_numbers INTEGER DEFAULT 0,
        lid_count INTEGER DEFAULT 0,
        groups_data TEXT,
        status TEXT DEFAULT 'completed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_message_logs_session ON message_logs(session_id);
    CREATE INDEX IF NOT EXISTS idx_message_logs_timestamp ON message_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_message_logs_direction ON message_logs(direction);
    CREATE INDEX IF NOT EXISTS idx_message_logs_from ON message_logs(from_number);
    CREATE INDEX IF NOT EXISTS idx_message_logs_to ON message_logs(to_number);
    CREATE INDEX IF NOT EXISTS idx_session_logs_session ON session_logs(session_id);
    CREATE INDEX IF NOT EXISTS idx_session_logs_timestamp ON session_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_chat_templates_code ON chat_templates(code);
    CREATE INDEX IF NOT EXISTS idx_group_exports_session ON group_exports(session_id);
    CREATE INDEX IF NOT EXISTS idx_group_exports_created ON group_exports(created_at);
`)

// Migration: Add media columns to chat_templates if they don't exist
try {
    // Check if media_data column exists
    const tableInfo = db.prepare("PRAGMA table_info(chat_templates)").all() as any[]
    const columnNames = tableInfo.map(col => col.name)
    
    if (!columnNames.includes('media_data')) {
        console.log('🔄 Migrating chat_templates: Adding media_data column...')
        db.exec('ALTER TABLE chat_templates ADD COLUMN media_data TEXT')
    }
    if (!columnNames.includes('media_mimetype')) {
        console.log('🔄 Migrating chat_templates: Adding media_mimetype column...')
        db.exec('ALTER TABLE chat_templates ADD COLUMN media_mimetype TEXT')
    }
    if (!columnNames.includes('media_filename')) {
        console.log('🔄 Migrating chat_templates: Adding media_filename column...')
        db.exec('ALTER TABLE chat_templates ADD COLUMN media_filename TEXT')
    }
    console.log('✅ chat_templates table migration complete')
} catch (migrationError) {
    console.error('⚠️ Migration error (may be safe to ignore):', migrationError)
}

// Message Log Interface
export interface MessageLogEntry {
    id?: number
    message_id?: string
    session_id: string
    direction: 'incoming' | 'outgoing'
    from_number: string
    to_number: string
    message_type: string
    content?: string
    media_url?: string
    media_data?: string
    filename?: string
    file_size?: number
    mimetype?: string
    timestamp: string
    status?: string
    source?: string
}

// Session Log Interface
export interface SessionLogEntry {
    id?: number
    session_id: string
    action: string
    status: string
    user_id?: string
    user_name?: string
    details?: string
    timestamp?: string
}

// Chat Template Interface
export interface ChatTemplateEntry {
    id?: number
    code: string
    title?: string
    content: string
    description?: string
    media_data?: string
    media_mimetype?: string
    media_filename?: string
    is_active?: number
    created_at?: string
    updated_at?: string
}

// Message Log Functions
export const messageLogDb = {
    // Insert new message log
    insert: (log: MessageLogEntry): number | bigint => {
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO message_logs (
                message_id, session_id, direction, from_number, to_number,
                message_type, content, media_url, media_data, filename,
                file_size, mimetype, timestamp, status, source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        
        const result = stmt.run(
            log.message_id || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            log.session_id,
            log.direction,
            log.from_number,
            log.to_number,
            log.message_type || 'text',
            log.content || '',
            log.media_url || null,
            log.media_data || null,
            log.filename || null,
            log.file_size || null,
            log.mimetype || null,
            log.timestamp,
            log.status || (log.direction === 'incoming' ? 'received' : 'sent'),
            log.source || 'contact'
        )
        
        return result.lastInsertRowid
    },

    // Get all message logs with filters
    getAll: (options: {
        sessionId?: string
        contactNumber?: string
        direction?: string
        startDate?: string
        endDate?: string
        limit?: number
        offset?: number
    } = {}): MessageLogEntry[] => {
        let query = 'SELECT * FROM message_logs WHERE 1=1'
        const params: any[] = []

        if (options.sessionId) {
            query += ' AND session_id = ?'
            params.push(options.sessionId)
        }

        if (options.contactNumber) {
            query += ' AND (from_number LIKE ? OR to_number LIKE ?)'
            params.push(`%${options.contactNumber}%`, `%${options.contactNumber}%`)
        }

        if (options.direction) {
            query += ' AND direction = ?'
            params.push(options.direction)
        }

        if (options.startDate) {
            query += ' AND timestamp >= ?'
            params.push(options.startDate)
        }

        if (options.endDate) {
            query += ' AND timestamp <= ?'
            params.push(options.endDate)
        }

        query += ' ORDER BY timestamp DESC'

        if (options.limit) {
            query += ' LIMIT ?'
            params.push(options.limit)
        }

        if (options.offset) {
            query += ' OFFSET ?'
            params.push(options.offset)
        }

        const stmt = db.prepare(query)
        return stmt.all(...params) as MessageLogEntry[]
    },

    // Get chat history between session and contact
    getChatHistory: (sessionId: string, contactNumber: string, limit: number = 100): MessageLogEntry[] => {
        const stmt = db.prepare(`
            SELECT * FROM message_logs 
            WHERE session_id = ? 
            AND (from_number LIKE ? OR to_number LIKE ?)
            ORDER BY timestamp ASC
            LIMIT ?
        `)
        const pattern = `%${contactNumber.replace(/[^0-9]/g, '')}%`
        return stmt.all(sessionId, pattern, pattern, limit) as MessageLogEntry[]
    },

    // Get statistics
    getStatistics: (sessionId?: string): any => {
        let query = `
            SELECT 
                COUNT(*) as total_messages,
                SUM(CASE WHEN direction = 'incoming' THEN 1 ELSE 0 END) as incoming,
                SUM(CASE WHEN direction = 'outgoing' THEN 1 ELSE 0 END) as outgoing,
                COUNT(DISTINCT session_id) as sessions,
                COUNT(DISTINCT from_number) + COUNT(DISTINCT to_number) as contacts
            FROM message_logs
        `
        
        if (sessionId) {
            query += ' WHERE session_id = ?'
            const stmt = db.prepare(query)
            return stmt.get(sessionId)
        }
        
        const stmt = db.prepare(query)
        return stmt.get()
    },

    // Get message type statistics
    getTypeStatistics: (sessionId?: string): any[] => {
        let query = `
            SELECT message_type, COUNT(*) as count
            FROM message_logs
        `
        
        if (sessionId) {
            query += ' WHERE session_id = ?'
            query += ' GROUP BY message_type ORDER BY count DESC'
            const stmt = db.prepare(query)
            return stmt.all(sessionId) as any[]
        }
        
        query += ' GROUP BY message_type ORDER BY count DESC'
        const stmt = db.prepare(query)
        return stmt.all() as any[]
    },

    // Check if message exists (prevent duplicates)
    exists: (messageId: string): boolean => {
        const stmt = db.prepare('SELECT 1 FROM message_logs WHERE message_id = ?')
        return stmt.get(messageId) !== undefined
    },

    // Delete old messages
    deleteOlderThan: (days: number): number => {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - days)
        
        const stmt = db.prepare('DELETE FROM message_logs WHERE timestamp < ?')
        const result = stmt.run(cutoffDate.toISOString())
        return result.changes
    },

    // Get conversations (grouped by contact) for inbox page
    getConversations: (sessionId: string): any[] => {
        const stmt = db.prepare(`
            SELECT 
                CASE 
                    WHEN direction = 'incoming' THEN from_number 
                    ELSE to_number 
                END as phone,
                MAX(timestamp) as lastMessageTime,
                (SELECT content FROM message_logs m2 
                 WHERE m2.session_id = ? 
                 AND (m2.from_number = CASE WHEN message_logs.direction = 'incoming' THEN message_logs.from_number ELSE message_logs.to_number END
                      OR m2.to_number = CASE WHEN message_logs.direction = 'incoming' THEN message_logs.from_number ELSE message_logs.to_number END)
                 ORDER BY m2.timestamp DESC LIMIT 1
                ) as lastMessage,
                (SELECT message_type FROM message_logs m3 
                 WHERE m3.session_id = ? 
                 AND (m3.from_number = CASE WHEN message_logs.direction = 'incoming' THEN message_logs.from_number ELSE message_logs.to_number END
                      OR m3.to_number = CASE WHEN message_logs.direction = 'incoming' THEN message_logs.from_number ELSE message_logs.to_number END)
                 ORDER BY m3.timestamp DESC LIMIT 1
                ) as lastMessageType,
                COUNT(CASE WHEN direction = 'incoming' AND status = 'received' THEN 1 END) as unreadCount
            FROM message_logs
            WHERE session_id = ?
            GROUP BY phone
            ORDER BY lastMessageTime DESC
        `)
        return stmt.all(sessionId, sessionId, sessionId) as any[]
    },

    // Get unique sessions
    getSessions: (): string[] => {
        const stmt = db.prepare('SELECT DISTINCT session_id FROM message_logs ORDER BY session_id')
        return stmt.all().map((row: any) => row.session_id)
    },

    // Get contacts for a session
    getContacts: (sessionId: string): string[] => {
        const stmt = db.prepare(`
            SELECT DISTINCT 
                CASE WHEN direction = 'incoming' THEN from_number ELSE to_number END as contact
            FROM message_logs 
            WHERE session_id = ?
            ORDER BY contact
        `)
        return stmt.all(sessionId).map((row: any) => row.contact)
    }
}

// Session Log Functions
export const sessionLogDb = {
    // Insert session log
    insert: (log: SessionLogEntry): number | bigint => {
        const stmt = db.prepare(`
            INSERT INTO session_logs (
                session_id, action, status, user_id, user_name, details, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        
        const result = stmt.run(
            log.session_id,
            log.action,
            log.status,
            log.user_id || null,
            log.user_name || null,
            log.details ? JSON.stringify(log.details) : null,
            log.timestamp || new Date().toISOString()
        )
        
        return result.lastInsertRowid
    },

    // Get session logs
    getAll: (limit: number = 100): SessionLogEntry[] => {
        const stmt = db.prepare(`
            SELECT * FROM session_logs 
            ORDER BY timestamp DESC 
            LIMIT ?
        `)
        return stmt.all(limit) as SessionLogEntry[]
    },

    // Get logs by session
    getBySession: (sessionId: string, limit: number = 100): SessionLogEntry[] => {
        const stmt = db.prepare(`
            SELECT * FROM session_logs 
            WHERE session_id = ? 
            ORDER BY timestamp DESC 
            LIMIT ?
        `)
        return stmt.all(sessionId, limit) as SessionLogEntry[]
    }
}

// Chat Template Functions
export const chatTemplateDb = {
    // Create new template
    create: (template: ChatTemplateEntry): { success: boolean; id?: number | bigint; error?: string } => {
        try {
            const stmt = db.prepare(`
                INSERT INTO chat_templates (code, title, content, description, media_data, media_mimetype, media_filename, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `)
            
            const result = stmt.run(
                template.code.toUpperCase().trim(),
                template.title || null,
                template.content,
                template.description || null,
                template.media_data || null,
                template.media_mimetype || null,
                template.media_filename || null,
                template.is_active !== undefined ? template.is_active : 1
            )
            
            return { success: true, id: result.lastInsertRowid }
        } catch (error: any) {
            if (error.message.includes('UNIQUE constraint failed')) {
                return { success: false, error: 'Template dengan kode tersebut sudah ada' }
            }
            return { success: false, error: error.message }
        }
    },

    // Get all templates
    getAll: (options: { activeOnly?: boolean; limit?: number; offset?: number } = {}): ChatTemplateEntry[] => {
        let query = 'SELECT * FROM chat_templates'
        const params: any[] = []

        if (options.activeOnly) {
            query += ' WHERE is_active = 1'
        }

        query += ' ORDER BY code ASC'

        if (options.limit) {
            query += ' LIMIT ?'
            params.push(options.limit)
        }

        if (options.offset) {
            query += ' OFFSET ?'
            params.push(options.offset)
        }

        const stmt = db.prepare(query)
        return stmt.all(...params) as ChatTemplateEntry[]
    },

    // Get template by ID
    getById: (id: number): ChatTemplateEntry | undefined => {
        const stmt = db.prepare('SELECT * FROM chat_templates WHERE id = ?')
        return stmt.get(id) as ChatTemplateEntry | undefined
    },

    // Get template by code (case-insensitive)
    getByCode: (code: string): ChatTemplateEntry | undefined => {
        const stmt = db.prepare('SELECT * FROM chat_templates WHERE code = ? COLLATE NOCASE AND is_active = 1')
        return stmt.get(code.toUpperCase().trim()) as ChatTemplateEntry | undefined
    },

    // Update template
    update: (id: number, template: Partial<ChatTemplateEntry>): { success: boolean; changes?: number; error?: string } => {
        try {
            const updates: string[] = []
            const params: any[] = []

            if (template.code !== undefined) {
                updates.push('code = ?')
                params.push(template.code.toUpperCase().trim())
            }
            if (template.title !== undefined) {
                updates.push('title = ?')
                params.push(template.title)
            }
            if (template.content !== undefined) {
                updates.push('content = ?')
                params.push(template.content)
            }
            if (template.description !== undefined) {
                updates.push('description = ?')
                params.push(template.description)
            }
            if (template.is_active !== undefined) {
                updates.push('is_active = ?')
                params.push(template.is_active)
            }
            if (template.media_data !== undefined) {
                updates.push('media_data = ?')
                params.push(template.media_data)
            }
            if (template.media_mimetype !== undefined) {
                updates.push('media_mimetype = ?')
                params.push(template.media_mimetype)
            }
            if (template.media_filename !== undefined) {
                updates.push('media_filename = ?')
                params.push(template.media_filename)
            }

            if (updates.length === 0) {
                return { success: false, error: 'No fields to update' }
            }

            updates.push("updated_at = datetime('now')")
            params.push(id)

            const stmt = db.prepare(`
                UPDATE chat_templates SET ${updates.join(', ')} WHERE id = ?
            `)
            
            const result = stmt.run(...params)
            return { success: true, changes: result.changes }
        } catch (error: any) {
            if (error.message.includes('UNIQUE constraint failed')) {
                return { success: false, error: 'Template dengan kode tersebut sudah ada' }
            }
            return { success: false, error: error.message }
        }
    },

    // Delete template
    delete: (id: number): { success: boolean; changes?: number; error?: string } => {
        try {
            const stmt = db.prepare('DELETE FROM chat_templates WHERE id = ?')
            const result = stmt.run(id)
            return { success: true, changes: result.changes }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },

    // Toggle template active status
    toggleActive: (id: number): { success: boolean; isActive?: boolean; error?: string } => {
        try {
            const current = db.prepare('SELECT is_active FROM chat_templates WHERE id = ?').get(id) as any
            if (!current) {
                return { success: false, error: 'Template tidak ditemukan' }
            }
            
            const newStatus = current.is_active === 1 ? 0 : 1
            const stmt = db.prepare("UPDATE chat_templates SET is_active = ?, updated_at = datetime('now') WHERE id = ?")
            stmt.run(newStatus, id)
            
            return { success: true, isActive: newStatus === 1 }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },

    // Search templates
    search: (query: string): ChatTemplateEntry[] => {
        const stmt = db.prepare(`
            SELECT * FROM chat_templates 
            WHERE (code LIKE ? OR title LIKE ? OR content LIKE ? OR description LIKE ?)
            AND is_active = 1
            ORDER BY code ASC
        `)
        const pattern = `%${query}%`
        return stmt.all(pattern, pattern, pattern, pattern) as ChatTemplateEntry[]
    },

    // Get count
    getCount: (activeOnly: boolean = false): number => {
        let query = 'SELECT COUNT(*) as count FROM chat_templates'
        if (activeOnly) query += ' WHERE is_active = 1'
        const result = db.prepare(query).get() as any
        return result?.count || 0
    },

    // Check if code exists
    codeExists: (code: string, excludeId?: number): boolean => {
        let query = 'SELECT 1 FROM chat_templates WHERE code = ? COLLATE NOCASE'
        const params: any[] = [code.toUpperCase().trim()]
        
        if (excludeId) {
            query += ' AND id != ?'
            params.push(excludeId)
        }
        
        const stmt = db.prepare(query)
        return stmt.get(...params) !== undefined
    }
}

// Group Export Interface
export interface GroupExportEntry {
    id?: number
    session_id: string
    phone_number?: string
    file_name: string
    file_path?: string
    file_size?: number
    total_groups?: number
    total_members?: number
    phone_numbers?: number
    lid_count?: number
    groups_data?: string
    status?: string
    created_at?: string
    updated_at?: string
}

// Group Export Functions
export const groupExportDb = {
    // Create new export record
    create: (data: GroupExportEntry): { success: boolean; id?: number | bigint; error?: string } => {
        try {
            const stmt = db.prepare(`
                INSERT INTO group_exports (
                    session_id, phone_number, file_name, file_path, file_size,
                    total_groups, total_members, phone_numbers, lid_count,
                    groups_data, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `)
            
            const result = stmt.run(
                data.session_id,
                data.phone_number || null,
                data.file_name,
                data.file_path || null,
                data.file_size || null,
                data.total_groups || 0,
                data.total_members || 0,
                data.phone_numbers || 0,
                data.lid_count || 0,
                data.groups_data || null,
                data.status || 'completed'
            )
            
            return { success: true, id: result.lastInsertRowid }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },

    // Get all exports
    getAll: (options: { sessionId?: string; limit?: number; offset?: number } = {}): GroupExportEntry[] => {
        let query = 'SELECT * FROM group_exports WHERE 1=1'
        const params: any[] = []

        if (options.sessionId) {
            query += ' AND session_id = ?'
            params.push(options.sessionId)
        }

        query += ' ORDER BY created_at DESC'

        if (options.limit) {
            query += ' LIMIT ?'
            params.push(options.limit)
        }

        if (options.offset) {
            query += ' OFFSET ?'
            params.push(options.offset)
        }

        const stmt = db.prepare(query)
        return stmt.all(...params) as GroupExportEntry[]
    },

    // Get export by ID
    getById: (id: number): GroupExportEntry | undefined => {
        const stmt = db.prepare('SELECT * FROM group_exports WHERE id = ?')
        return stmt.get(id) as GroupExportEntry | undefined
    },

    // Get exports by session
    getBySession: (sessionId: string): GroupExportEntry[] => {
        const stmt = db.prepare('SELECT * FROM group_exports WHERE session_id = ? ORDER BY created_at DESC')
        return stmt.all(sessionId) as GroupExportEntry[]
    },

    // Update export
    update: (id: number, data: Partial<GroupExportEntry>): { success: boolean; changes?: number; error?: string } => {
        try {
            const updates: string[] = []
            const params: any[] = []

            if (data.file_name !== undefined) {
                updates.push('file_name = ?')
                params.push(data.file_name)
            }
            if (data.file_path !== undefined) {
                updates.push('file_path = ?')
                params.push(data.file_path)
            }
            if (data.file_size !== undefined) {
                updates.push('file_size = ?')
                params.push(data.file_size)
            }
            if (data.total_groups !== undefined) {
                updates.push('total_groups = ?')
                params.push(data.total_groups)
            }
            if (data.total_members !== undefined) {
                updates.push('total_members = ?')
                params.push(data.total_members)
            }
            if (data.phone_numbers !== undefined) {
                updates.push('phone_numbers = ?')
                params.push(data.phone_numbers)
            }
            if (data.lid_count !== undefined) {
                updates.push('lid_count = ?')
                params.push(data.lid_count)
            }
            if (data.groups_data !== undefined) {
                updates.push('groups_data = ?')
                params.push(data.groups_data)
            }
            if (data.status !== undefined) {
                updates.push('status = ?')
                params.push(data.status)
            }

            if (updates.length === 0) {
                return { success: false, error: 'No fields to update' }
            }

            updates.push("updated_at = datetime('now')")
            params.push(id)

            const stmt = db.prepare(`UPDATE group_exports SET ${updates.join(', ')} WHERE id = ?`)
            const result = stmt.run(...params)
            return { success: true, changes: result.changes }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },

    // Delete export
    delete: (id: number): { success: boolean; changes?: number; error?: string } => {
        try {
            const stmt = db.prepare('DELETE FROM group_exports WHERE id = ?')
            const result = stmt.run(id)
            return { success: true, changes: result.changes }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },

    // Bulk delete
    bulkDelete: (ids: number[]): { success: boolean; deleted?: number; error?: string } => {
        try {
            const placeholders = ids.map(() => '?').join(',')
            const stmt = db.prepare(`DELETE FROM group_exports WHERE id IN (${placeholders})`)
            const result = stmt.run(...ids)
            return { success: true, deleted: result.changes }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },

    // Get statistics
    getStats: (): any => {
        const stmt = db.prepare(`
            SELECT 
                COUNT(*) as total_exports,
                COUNT(DISTINCT session_id) as total_sessions,
                SUM(total_groups) as total_groups,
                SUM(total_members) as total_members
            FROM group_exports
        `)
        return stmt.get()
    },

    // Get count
    getCount: (sessionId?: string): number => {
        let query = 'SELECT COUNT(*) as count FROM group_exports'
        const params: any[] = []
        
        if (sessionId) {
            query += ' WHERE session_id = ?'
            params.push(sessionId)
        }
        
        const result = db.prepare(query).get(...params) as any
        return result?.count || 0
    }
}

// Export database instance for direct queries if needed
export { db }

console.log('✅ Database initialized at:', DB_PATH)
