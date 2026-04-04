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
        caption TEXT,
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

    -- Auto Reply Rules Table
    CREATE TABLE IF NOT EXISTS auto_reply_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        name TEXT NOT NULL,
        trigger_type TEXT NOT NULL CHECK(trigger_type IN ('exact', 'contains', 'starts_with', 'ends_with', 'regex')),
        trigger_value TEXT NOT NULL,
        match_case INTEGER DEFAULT 0,
        response_type TEXT NOT NULL DEFAULT 'text' CHECK(response_type IN ('text', 'template', 'image', 'document', 'audio', 'video')),
        response_content TEXT NOT NULL,
        response_media_url TEXT,
        response_media_data TEXT,
        response_media_filename TEXT,
        response_media_mimetype TEXT,
        scope TEXT NOT NULL DEFAULT 'all' CHECK(scope IN ('all', 'private', 'group')),
        enabled INTEGER DEFAULT 1,
        priority INTEGER DEFAULT 0,
        cooldown_seconds INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Auto Reply Logs Table
    CREATE TABLE IF NOT EXISTS auto_reply_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_id INTEGER NOT NULL,
        rule_name TEXT,
        session_id TEXT NOT NULL,
        message_id TEXT,
        from_number TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        is_group INTEGER DEFAULT 0,
        matched_text TEXT,
        trigger_value TEXT,
        response_sent TEXT,
        status TEXT DEFAULT 'success' CHECK(status IN ('success', 'failed', 'cooldown')),
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (rule_id) REFERENCES auto_reply_rules(id) ON DELETE CASCADE
    );

    -- Auto Reply Cooldowns Table
    CREATE TABLE IF NOT EXISTS auto_reply_cooldowns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_id INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        sender_number TEXT NOT NULL,
        last_sent_at DATETIME NOT NULL,
        UNIQUE(rule_id, session_id, sender_number),
        FOREIGN KEY (rule_id) REFERENCES auto_reply_rules(id) ON DELETE CASCADE
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
    CREATE INDEX IF NOT EXISTS idx_auto_reply_rules_session ON auto_reply_rules(session_id);
    CREATE INDEX IF NOT EXISTS idx_auto_reply_rules_enabled ON auto_reply_rules(enabled);
    CREATE INDEX IF NOT EXISTS idx_auto_reply_logs_rule ON auto_reply_logs(rule_id);
    CREATE INDEX IF NOT EXISTS idx_auto_reply_logs_session ON auto_reply_logs(session_id);
    CREATE INDEX IF NOT EXISTS idx_auto_reply_logs_created ON auto_reply_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_auto_reply_cooldowns_rule ON auto_reply_cooldowns(rule_id);

    -- Auto Forward Config Table
    CREATE TABLE IF NOT EXISTS auto_forward_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        admin_number TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        token_prefix TEXT DEFAULT 'CT',
        forward_media INTEGER DEFAULT 1,
        forward_groups INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id)
    );

    -- Auto Forward Tokens Table
    CREATE TABLE IF NOT EXISTS auto_forward_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        token TEXT NOT NULL,
        sender_number TEXT NOT NULL,
        sender_name TEXT,
        last_message TEXT,
        message_count INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, token),
        UNIQUE(session_id, sender_number)
    );

    -- Auto Forward Logs Table
    CREATE TABLE IF NOT EXISTS auto_forward_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        token TEXT NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('user_to_admin', 'admin_to_user')),
        sender_number TEXT NOT NULL,
        message_content TEXT,
        message_type TEXT DEFAULT 'text',
        status TEXT DEFAULT 'success' CHECK(status IN ('success', 'failed')),
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_auto_forward_config_session ON auto_forward_config(session_id);
    CREATE INDEX IF NOT EXISTS idx_auto_forward_tokens_session ON auto_forward_tokens(session_id);
    CREATE INDEX IF NOT EXISTS idx_auto_forward_tokens_token ON auto_forward_tokens(session_id, token);
    CREATE INDEX IF NOT EXISTS idx_auto_forward_tokens_sender ON auto_forward_tokens(session_id, sender_number);
    CREATE INDEX IF NOT EXISTS idx_auto_forward_logs_session ON auto_forward_logs(session_id);
    CREATE INDEX IF NOT EXISTS idx_auto_forward_logs_created ON auto_forward_logs(created_at);

    -- Member ↔ WhatsApp Session assignment (many-to-many)
    CREATE TABLE IF NOT EXISTS member_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        assigned_by INTEGER,
        UNIQUE(user_id, session_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_member_sessions_user ON member_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_member_sessions_session ON member_sessions(session_id);
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

// Migration: Add user_id column for session isolation
try {
    // Add user_id to chat_templates
    const templateTableInfo = db.prepare("PRAGMA table_info(chat_templates)").all() as any[]
    const templateColumns = templateTableInfo.map(col => col.name)
    if (!templateColumns.includes('user_id')) {
        console.log('🔄 Migrating chat_templates: Adding user_id column for session isolation...')
        db.exec('ALTER TABLE chat_templates ADD COLUMN user_id INTEGER')
        db.exec('CREATE INDEX IF NOT EXISTS idx_chat_templates_user ON chat_templates(user_id)')
    }
    
    // Add user_id to auto_reply_rules
    const autoReplyTableInfo = db.prepare("PRAGMA table_info(auto_reply_rules)").all() as any[]
    const autoReplyColumns = autoReplyTableInfo.map(col => col.name)
    if (!autoReplyColumns.includes('user_id')) {
        console.log('🔄 Migrating auto_reply_rules: Adding user_id column for session isolation...')
        db.exec('ALTER TABLE auto_reply_rules ADD COLUMN user_id INTEGER')
        db.exec('CREATE INDEX IF NOT EXISTS idx_auto_reply_rules_user ON auto_reply_rules(user_id)')
    }
    
    // Add user_id to group_exports
    const exportTableInfo = db.prepare("PRAGMA table_info(group_exports)").all() as any[]
    const exportColumns = exportTableInfo.map(col => col.name)
    if (!exportColumns.includes('user_id')) {
        console.log('🔄 Migrating group_exports: Adding user_id column for session isolation...')
        db.exec('ALTER TABLE group_exports ADD COLUMN user_id INTEGER')
        db.exec('CREATE INDEX IF NOT EXISTS idx_group_exports_user ON group_exports(user_id)')
    }
    
    console.log('✅ User session isolation migration complete')
} catch (migrationError) {
    console.error('⚠️ User isolation migration error:', migrationError)
}

// Migration: Create notification tables
try {
    db.exec(`
        -- FCM Device Tokens (for push notifications when user is offline)
        CREATE TABLE IF NOT EXISTS fcm_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT NOT NULL UNIQUE,
            platform TEXT DEFAULT 'web',
            browser TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user ON fcm_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_fcm_tokens_token ON fcm_tokens(token);

        -- Notification history / inbox
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL DEFAULT 'incoming_message',
            title TEXT NOT NULL,
            body TEXT,
            data TEXT,
            channel TEXT CHECK(channel IN ('socket', 'fcm', 'both', 'none')),
            status TEXT DEFAULT 'sent' CHECK(status IN ('sent', 'delivered', 'read', 'failed')),
            read_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
        CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
        CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
    `)
    console.log('✅ Notification tables migration complete')

    // Migration: fix channel CHECK constraint to allow 'both' and 'none'
    // SQLite doesn't support ALTER CHECK, so recreate the table if constraint is wrong
    try {
        db.prepare(`INSERT INTO notifications (user_id, type, title, channel, status) VALUES (0, 'system', '_migration_test_', 'both', 'sent')`).run()
        db.prepare(`DELETE FROM notifications WHERE user_id = 0 AND title = '_migration_test_'`).run()
    } catch {
        // Old constraint rejects 'both' → recreate table
        db.exec(`
            ALTER TABLE notifications RENAME TO notifications_old;
            CREATE TABLE notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                type TEXT NOT NULL DEFAULT 'incoming_message',
                title TEXT NOT NULL,
                body TEXT,
                data TEXT,
                channel TEXT CHECK(channel IN ('socket', 'fcm', 'both', 'none')),
                status TEXT DEFAULT 'sent' CHECK(status IN ('sent', 'delivered', 'read', 'failed')),
                read_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            INSERT INTO notifications SELECT * FROM notifications_old;
            DROP TABLE notifications_old;
            CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
            CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
            CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
            CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
        `)
        console.log('✅ Notifications table constraint migrated (added both/none)')
    }
} catch (migrationError) {
    console.error('⚠️ Notification tables migration error:', migrationError)
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
    caption?: string
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
    // Insert new message log (uses REPLACE to update on duplicate message_id)
    insert: (log: MessageLogEntry): number | bigint => {
        const stmt = db.prepare(`
            INSERT INTO message_logs (
                message_id, session_id, direction, from_number, to_number,
                message_type, content, caption, media_url, media_data, filename,
                file_size, mimetype, timestamp, status, source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(message_id) DO UPDATE SET
                media_url = COALESCE(excluded.media_url, media_url),
                media_data = COALESCE(excluded.media_data, media_data),
                caption = COALESCE(NULLIF(excluded.caption, ''), caption),
                filename = COALESCE(excluded.filename, filename),
                file_size = COALESCE(excluded.file_size, file_size),
                mimetype = COALESCE(excluded.mimetype, mimetype),
                status = COALESCE(excluded.status, status),
                updated_at = CURRENT_TIMESTAMP
        `)
        
        const result = stmt.run(
            log.message_id || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            log.session_id,
            log.direction,
            log.from_number,
            log.to_number,
            log.message_type || 'text',
            log.content || '',
            log.caption || null,
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
    getChatHistory: (sessionId: string, contactNumber: string, limit: number = 100): any[] => {
        // Try exact match first (JID format), then digit-based LIKE
        const exactJid = contactNumber.includes('@') ? contactNumber : null
        const digits = contactNumber.replace(/[^0-9]/g, '')

        let stmt
        let result

        // Priority 1: exact JID match
        if (exactJid) {
            stmt = db.prepare(`
                SELECT id, message_id, session_id, direction, from_number, to_number,
                    message_type, content, caption, media_url, filename, file_size, mimetype,
                    timestamp, status, source, created_at, updated_at,
                    CASE WHEN (media_url IS NOT NULL AND media_url != '') 
                         OR (media_data IS NOT NULL AND media_data != '') THEN 1 ELSE 0 END AS has_media
                FROM message_logs 
                WHERE session_id = ? 
                AND (from_number = ? OR to_number = ?)
                ORDER BY timestamp ASC
                LIMIT ?
            `)
            result = stmt.all(sessionId, exactJid, exactJid, limit) as any[]
            if (result.length > 0) return result
        }
        
        // Priority 2: LIKE with digit pattern
        if (digits.length >= 8) {
            const pattern = `%${digits}%`
            stmt = db.prepare(`
                SELECT id, message_id, session_id, direction, from_number, to_number,
                    message_type, content, caption, media_url, filename, file_size, mimetype,
                    timestamp, status, source, created_at, updated_at,
                    CASE WHEN (media_url IS NOT NULL AND media_url != '') 
                         OR (media_data IS NOT NULL AND media_data != '') THEN 1 ELSE 0 END AS has_media
                FROM message_logs 
                WHERE session_id = ? 
                AND (from_number LIKE ? OR to_number LIKE ?)
                ORDER BY timestamp ASC
                LIMIT ?
            `)
            return stmt.all(sessionId, pattern, pattern, limit) as any[]
        }

        return []
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
                (SELECT COALESCE(NULLIF(m2.caption, ''), m2.content) FROM message_logs m2 
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

// Auto Reply Rule Interface
export interface AutoReplyRuleEntry {
    id?: number
    session_id?: string | null
    name: string
    trigger_type: 'exact' | 'contains' | 'starts_with' | 'ends_with' | 'regex'
    trigger_value: string
    match_case?: number
    response_type: 'text' | 'template' | 'image' | 'document' | 'audio' | 'video'
    response_content: string
    response_media_url?: string
    response_media_data?: string
    response_media_filename?: string
    response_media_mimetype?: string
    scope: 'all' | 'private' | 'group'
    enabled?: number
    priority?: number
    cooldown_seconds?: number
    created_at?: string
    updated_at?: string
}

// Auto Reply Log Interface
export interface AutoReplyLogEntry {
    id?: number
    rule_id: number
    rule_name?: string
    session_id: string
    message_id?: string
    from_number: string
    chat_id: string
    is_group?: number
    matched_text?: string
    trigger_value?: string
    response_sent?: string
    status?: 'success' | 'failed' | 'cooldown'
    error_message?: string
    created_at?: string
}

// Auto Reply Cooldown Interface
export interface AutoReplyCooldownEntry {
    id?: number
    rule_id: number
    session_id: string
    sender_number: string
    last_sent_at: string
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

// Auto Reply Rules Functions
export const autoReplyDb = {
    // Create new rule
    create: (rule: AutoReplyRuleEntry): { success: boolean; id?: number | bigint; error?: string } => {
        try {
            const stmt = db.prepare(`
                INSERT INTO auto_reply_rules (
                    session_id, name, trigger_type, trigger_value, match_case,
                    response_type, response_content, response_media_url, response_media_data,
                    response_media_filename, response_media_mimetype,
                    scope, enabled, priority, cooldown_seconds, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `)
            
            const result = stmt.run(
                rule.session_id || null,
                rule.name,
                rule.trigger_type,
                rule.trigger_value,
                rule.match_case || 0,
                rule.response_type || 'text',
                rule.response_content,
                rule.response_media_url || null,
                rule.response_media_data || null,
                rule.response_media_filename || null,
                rule.response_media_mimetype || null,
                rule.scope || 'all',
                rule.enabled !== undefined ? rule.enabled : 1,
                rule.priority || 0,
                rule.cooldown_seconds || 0
            )
            
            return { success: true, id: result.lastInsertRowid }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },

    // Get all rules
    getAll: (options: { sessionId?: string; enabledOnly?: boolean; limit?: number; offset?: number } = {}): AutoReplyRuleEntry[] => {
        let query = 'SELECT * FROM auto_reply_rules WHERE 1=1'
        const params: any[] = []

        if (options.sessionId) {
            query += ' AND (session_id = ? OR session_id IS NULL)'
            params.push(options.sessionId)
        }

        if (options.enabledOnly) {
            query += ' AND enabled = 1'
        }

        query += ' ORDER BY priority DESC, created_at DESC'

        if (options.limit) {
            query += ' LIMIT ?'
            params.push(options.limit)
        }

        if (options.offset) {
            query += ' OFFSET ?'
            params.push(options.offset)
        }

        const stmt = db.prepare(query)
        return stmt.all(...params) as AutoReplyRuleEntry[]
    },

    // Get rules for matching (active rules for a session)
    getRulesForMatching: (sessionId: string): AutoReplyRuleEntry[] => {
        const stmt = db.prepare(`
            SELECT * FROM auto_reply_rules 
            WHERE (session_id = ? OR session_id IS NULL) 
            AND enabled = 1
            ORDER BY priority DESC, id ASC
        `)
        return stmt.all(sessionId) as AutoReplyRuleEntry[]
    },

    // Get rule by ID
    getById: (id: number): AutoReplyRuleEntry | undefined => {
        const stmt = db.prepare('SELECT * FROM auto_reply_rules WHERE id = ?')
        return stmt.get(id) as AutoReplyRuleEntry | undefined
    },

    // Update rule
    update: (id: number, rule: Partial<AutoReplyRuleEntry>): { success: boolean; changes?: number; error?: string } => {
        try {
            const updates: string[] = []
            const params: any[] = []

            if (rule.session_id !== undefined) {
                updates.push('session_id = ?')
                params.push(rule.session_id)
            }
            if (rule.name !== undefined) {
                updates.push('name = ?')
                params.push(rule.name)
            }
            if (rule.trigger_type !== undefined) {
                updates.push('trigger_type = ?')
                params.push(rule.trigger_type)
            }
            if (rule.trigger_value !== undefined) {
                updates.push('trigger_value = ?')
                params.push(rule.trigger_value)
            }
            if (rule.match_case !== undefined) {
                updates.push('match_case = ?')
                params.push(rule.match_case)
            }
            if (rule.response_type !== undefined) {
                updates.push('response_type = ?')
                params.push(rule.response_type)
            }
            if (rule.response_content !== undefined) {
                updates.push('response_content = ?')
                params.push(rule.response_content)
            }
            if (rule.response_media_url !== undefined) {
                updates.push('response_media_url = ?')
                params.push(rule.response_media_url)
            }
            if (rule.response_media_data !== undefined) {
                updates.push('response_media_data = ?')
                params.push(rule.response_media_data)
            }
            if (rule.response_media_filename !== undefined) {
                updates.push('response_media_filename = ?')
                params.push(rule.response_media_filename)
            }
            if (rule.response_media_mimetype !== undefined) {
                updates.push('response_media_mimetype = ?')
                params.push(rule.response_media_mimetype)
            }
            if (rule.scope !== undefined) {
                updates.push('scope = ?')
                params.push(rule.scope)
            }
            if (rule.enabled !== undefined) {
                updates.push('enabled = ?')
                params.push(rule.enabled)
            }
            if (rule.priority !== undefined) {
                updates.push('priority = ?')
                params.push(rule.priority)
            }
            if (rule.cooldown_seconds !== undefined) {
                updates.push('cooldown_seconds = ?')
                params.push(rule.cooldown_seconds)
            }

            if (updates.length === 0) {
                return { success: false, error: 'No fields to update' }
            }

            updates.push("updated_at = datetime('now')")
            params.push(id)

            const stmt = db.prepare(`UPDATE auto_reply_rules SET ${updates.join(', ')} WHERE id = ?`)
            const result = stmt.run(...params)
            return { success: true, changes: result.changes }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },

    // Delete rule
    delete: (id: number): { success: boolean; changes?: number; error?: string } => {
        try {
            const stmt = db.prepare('DELETE FROM auto_reply_rules WHERE id = ?')
            const result = stmt.run(id)
            return { success: true, changes: result.changes }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },

    // Toggle enabled status
    toggleEnabled: (id: number): { success: boolean; enabled?: boolean; error?: string } => {
        try {
            const current = db.prepare('SELECT enabled FROM auto_reply_rules WHERE id = ?').get(id) as any
            if (!current) {
                return { success: false, error: 'Rule tidak ditemukan' }
            }
            
            const newStatus = current.enabled === 1 ? 0 : 1
            const stmt = db.prepare("UPDATE auto_reply_rules SET enabled = ?, updated_at = datetime('now') WHERE id = ?")
            stmt.run(newStatus, id)
            
            return { success: true, enabled: newStatus === 1 }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },

    // Bulk delete
    bulkDelete: (ids: number[]): { success: boolean; deleted?: number; error?: string } => {
        try {
            const placeholders = ids.map(() => '?').join(',')
            const stmt = db.prepare(`DELETE FROM auto_reply_rules WHERE id IN (${placeholders})`)
            const result = stmt.run(...ids)
            return { success: true, deleted: result.changes }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },

    // Get count
    getCount: (options: { sessionId?: string; enabledOnly?: boolean } = {}): number => {
        let query = 'SELECT COUNT(*) as count FROM auto_reply_rules WHERE 1=1'
        const params: any[] = []
        
        if (options.sessionId) {
            query += ' AND (session_id = ? OR session_id IS NULL)'
            params.push(options.sessionId)
        }
        
        if (options.enabledOnly) {
            query += ' AND enabled = 1'
        }
        
        const result = db.prepare(query).get(...params) as any
        return result?.count || 0
    },

    // Match message against rules
    matchMessage: (sessionId: string, messageText: string, isGroup: boolean): AutoReplyRuleEntry | null => {
        const rules = autoReplyDb.getRulesForMatching(sessionId)
        
        for (const rule of rules) {
            // Check scope
            if (rule.scope === 'private' && isGroup) continue
            if (rule.scope === 'group' && !isGroup) continue
            
            const text = rule.match_case ? messageText : messageText.toLowerCase()
            
            // Parse trigger values - support JSON array (multi-trigger) or plain string (backward compat)
            let triggerValues: string[] = []
            try {
                const parsed = JSON.parse(rule.trigger_value)
                if (Array.isArray(parsed)) {
                    triggerValues = parsed.filter((v: string) => v && v.trim())
                } else {
                    triggerValues = [rule.trigger_value]
                }
            } catch {
                triggerValues = [rule.trigger_value]
            }
            
            let matched = false
            
            // Check each trigger value (any match = rule fires)
            for (const rawVal of triggerValues) {
                if (!rawVal || !rawVal.trim()) continue
                const triggerVal = rule.match_case ? rawVal.trim() : rawVal.trim().toLowerCase()
                
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
                            const regex = new RegExp(rawVal.trim(), rule.match_case ? '' : 'i')
                            matched = regex.test(messageText)
                        } catch (e) {
                            // Invalid regex, skip this value
                        }
                        break
                }
                
                if (matched) break
            }
            
            if (matched) {
                return rule
            }
        }
        
        return null
    }
}

// Auto Reply Logs Functions
export const autoReplyLogDb = {
    // Insert log
    insert: (log: AutoReplyLogEntry): number | bigint => {
        const stmt = db.prepare(`
            INSERT INTO auto_reply_logs (
                rule_id, rule_name, session_id, message_id, from_number,
                chat_id, is_group, matched_text, trigger_value,
                response_sent, status, error_message, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `)
        
        const result = stmt.run(
            log.rule_id,
            log.rule_name || null,
            log.session_id,
            log.message_id || null,
            log.from_number,
            log.chat_id,
            log.is_group || 0,
            log.matched_text || null,
            log.trigger_value || null,
            log.response_sent || null,
            log.status || 'success',
            log.error_message || null
        )
        
        return result.lastInsertRowid
    },

    // Get all logs
    getAll: (options: { 
        sessionId?: string; 
        ruleId?: number;
        status?: string;
        limit?: number; 
        offset?: number;
        startDate?: string;
        endDate?: string;
    } = {}): AutoReplyLogEntry[] => {
        let query = 'SELECT * FROM auto_reply_logs WHERE 1=1'
        const params: any[] = []

        if (options.sessionId) {
            query += ' AND session_id = ?'
            params.push(options.sessionId)
        }

        if (options.ruleId) {
            query += ' AND rule_id = ?'
            params.push(options.ruleId)
        }

        if (options.status) {
            query += ' AND status = ?'
            params.push(options.status)
        }

        if (options.startDate) {
            query += ' AND created_at >= ?'
            params.push(options.startDate)
        }

        if (options.endDate) {
            query += ' AND created_at <= ?'
            params.push(options.endDate)
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
        return stmt.all(...params) as AutoReplyLogEntry[]
    },

    // Get statistics
    getStatistics: (sessionId?: string): any => {
        let query = `
            SELECT 
                COUNT(*) as total_replies,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'cooldown' THEN 1 ELSE 0 END) as cooldown,
                SUM(CASE WHEN is_group = 1 THEN 1 ELSE 0 END) as group_replies,
                SUM(CASE WHEN is_group = 0 THEN 1 ELSE 0 END) as private_replies
            FROM auto_reply_logs
        `
        
        if (sessionId) {
            query += ' WHERE session_id = ?'
            const stmt = db.prepare(query)
            return stmt.get(sessionId)
        }
        
        const stmt = db.prepare(query)
        return stmt.get()
    },

    // Get count
    getCount: (options: { sessionId?: string; ruleId?: number } = {}): number => {
        let query = 'SELECT COUNT(*) as count FROM auto_reply_logs WHERE 1=1'
        const params: any[] = []
        
        if (options.sessionId) {
            query += ' AND session_id = ?'
            params.push(options.sessionId)
        }
        
        if (options.ruleId) {
            query += ' AND rule_id = ?'
            params.push(options.ruleId)
        }
        
        const result = db.prepare(query).get(...params) as any
        return result?.count || 0
    },

    // Delete old logs
    deleteOlderThan: (days: number): number => {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - days)
        
        const stmt = db.prepare('DELETE FROM auto_reply_logs WHERE created_at < ?')
        const result = stmt.run(cutoffDate.toISOString())
        return result.changes
    }
}

// Auto Reply Cooldown Functions
export const autoReplyCooldownDb = {
    // Check if in cooldown
    isInCooldown: (ruleId: number, sessionId: string, senderNumber: string, cooldownSeconds: number): boolean => {
        if (cooldownSeconds <= 0) return false
        
        const stmt = db.prepare(`
            SELECT last_sent_at FROM auto_reply_cooldowns 
            WHERE rule_id = ? AND session_id = ? AND sender_number = ?
        `)
        const result = stmt.get(ruleId, sessionId, senderNumber) as AutoReplyCooldownEntry | undefined
        
        if (!result) return false
        
        const lastSent = new Date(result.last_sent_at)
        const now = new Date()
        const diffSeconds = (now.getTime() - lastSent.getTime()) / 1000
        
        return diffSeconds < cooldownSeconds
    },

    // Update cooldown timestamp
    updateCooldown: (ruleId: number, sessionId: string, senderNumber: string): void => {
        const stmt = db.prepare(`
            INSERT INTO auto_reply_cooldowns (rule_id, session_id, sender_number, last_sent_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(rule_id, session_id, sender_number) 
            DO UPDATE SET last_sent_at = datetime('now')
        `)
        stmt.run(ruleId, sessionId, senderNumber)
    },

    // Clean old cooldowns
    cleanOldCooldowns: (hours: number = 24): number => {
        const cutoffDate = new Date()
        cutoffDate.setHours(cutoffDate.getHours() - hours)
        
        const stmt = db.prepare('DELETE FROM auto_reply_cooldowns WHERE last_sent_at < ?')
        const result = stmt.run(cutoffDate.toISOString())
        return result.changes
    }
}

// Database maintenance functions
export const dbMaintenance = {
    // Vacuum database to reclaim space
    vacuum: (): void => {
        db.exec('VACUUM')
    },

    // Optimize database
    optimize: (): void => {
        db.pragma('optimize')
    },

    // Get database size info
    getSize: (): { size: number, pageCount: number, pageSize: number } => {
        const pageCount = db.pragma('page_count', { simple: true }) as number
        const pageSize = db.pragma('page_size', { simple: true }) as number
        return {
            size: pageCount * pageSize,
            pageCount,
            pageSize
        }
    },

    // Clean old message logs (keep last N days)
    cleanOldMessages: (days: number = 30): number => {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - days)
        
        const stmt = db.prepare('DELETE FROM message_logs WHERE timestamp < ?')
        const result = stmt.run(cutoffDate.toISOString())
        return result.changes
    },

    // Clean old session logs (keep last N days)
    cleanOldSessionLogs: (days: number = 30): number => {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - days)
        
        const stmt = db.prepare('DELETE FROM session_logs WHERE timestamp < ?')
        const result = stmt.run(cutoffDate.toISOString())
        return result.changes
    },

    // Clean old auto reply logs (keep last N days)
    cleanOldAutoReplyLogs: (days: number = 7): number => {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - days)
        
        const stmt = db.prepare('DELETE FROM auto_reply_logs WHERE created_at < ?')
        const result = stmt.run(cutoffDate.toISOString())
        return result.changes
    },

    // Full cleanup and optimize
    fullCleanup: (messageDays: number = 30, sessionDays: number = 30, autoReplyDays: number = 7, clearAllMedia: boolean = false, truncateMode: boolean = false): {
        messagesDeleted: number,
        sessionLogsDeleted: number,
        autoReplyLogsDeleted: number,
        cooldownsDeleted: number,
        mediaCleared: number,
        sizeBefore: number,
        sizeAfter: number
    } => {
        const sizeBefore = dbMaintenance.getSize().size
        
        let messagesDeleted = 0
        let sessionLogsDeleted = 0
        let autoReplyLogsDeleted = 0
        let cooldownsDeleted = 0
        let mediaCleared = 0

        if (truncateMode) {
            // TRUNCATE MODE: Delete all data from log tables
            console.log('🗑️ TRUNCATE MODE: Deleting ALL log data...')
            
            const msgResult = db.prepare('DELETE FROM message_logs').run()
            messagesDeleted = msgResult.changes
            
            const sessionResult = db.prepare('DELETE FROM session_logs').run()
            sessionLogsDeleted = sessionResult.changes
            
            const autoReplyResult = db.prepare('DELETE FROM auto_reply_logs').run()
            autoReplyLogsDeleted = autoReplyResult.changes
            
            const cooldownResult = db.prepare('DELETE FROM auto_reply_cooldowns').run()
            cooldownsDeleted = cooldownResult.changes
            
            console.log(`✅ Truncated: messages=${messagesDeleted}, sessions=${sessionLogsDeleted}, autoReply=${autoReplyLogsDeleted}, cooldowns=${cooldownsDeleted}`)
        } else {
            // Normal cleanup mode
            messagesDeleted = dbMaintenance.cleanOldMessages(messageDays)
            sessionLogsDeleted = dbMaintenance.cleanOldSessionLogs(sessionDays)
            autoReplyLogsDeleted = dbMaintenance.cleanOldAutoReplyLogs(autoReplyDays)
            cooldownsDeleted = autoReplyCooldownDb.cleanOldCooldowns(24)
        }

        // Clear media data
        if (clearAllMedia) {
            // Clear ALL media data regardless of age
            mediaCleared = dbMaintenance.clearAllMedia()
        } else if (!truncateMode) {
            // Clear only old media
            mediaCleared = dbMaintenance.clearOldMedia(messageDays)
        }

        // Vacuum to reclaim space
        dbMaintenance.vacuum()
        dbMaintenance.optimize()

        const sizeAfter = dbMaintenance.getSize().size
        
        console.log(`📊 Cleanup complete: Before=${(sizeBefore/1024/1024).toFixed(2)}MB, After=${(sizeAfter/1024/1024).toFixed(2)}MB, Saved=${((sizeBefore-sizeAfter)/1024/1024).toFixed(2)}MB`)

        return {
            messagesDeleted,
            sessionLogsDeleted,
            autoReplyLogsDeleted,
            cooldownsDeleted,
            mediaCleared,
            sizeBefore,
            sizeAfter
        }
    },

    // Clear old media data (keep message metadata)
    clearOldMedia: (days: number = 7): number => {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - days)
        
        const stmt = db.prepare('UPDATE message_logs SET media_data = NULL WHERE timestamp < ? AND media_data IS NOT NULL')
        const result = stmt.run(cutoffDate.toISOString())
        return result.changes
    },

    // Clear ALL media data (for aggressive cleanup)
    clearAllMedia: (): number => {
        console.log('🗑️ Clearing ALL media data from message_logs...')
        const stmt = db.prepare('UPDATE message_logs SET media_data = NULL WHERE media_data IS NOT NULL')
        const result = stmt.run()
        console.log(`✅ Cleared media from ${result.changes} messages`)
        return result.changes
    },

    // Get table sizes
    getTableStats: (): { table: string, rowCount: number }[] => {
        const tables = ['message_logs', 'session_logs', 'chat_templates', 'group_exports', 'auto_reply_rules', 'auto_reply_logs', 'auto_reply_cooldowns']
        return tables.map(table => {
            try {
                const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as any
                return { table, rowCount: result?.count || 0 }
            } catch {
                return { table, rowCount: 0 }
            }
        })
    },

    // Get media size in database
    getMediaSize: (): { totalSize: number, count: number } => {
        const result = db.prepare('SELECT SUM(LENGTH(media_data)) as total, COUNT(*) as count FROM message_logs WHERE media_data IS NOT NULL').get() as any
        return {
            totalSize: result?.total || 0,
            count: result?.count || 0
        }
    }
}

// ============================================
// Auto Forward Interfaces
// ============================================
export interface AutoForwardConfig {
    id?: number
    session_id: string
    admin_number: string
    enabled?: number
    token_prefix?: string
    forward_media?: number
    forward_groups?: number
    created_at?: string
    updated_at?: string
}

export interface AutoForwardToken {
    id?: number
    session_id: string
    token: string
    sender_number: string
    sender_name?: string
    last_message?: string
    message_count?: number
    created_at?: string
    updated_at?: string
}

export interface AutoForwardLogEntry {
    id?: number
    session_id: string
    token: string
    direction: 'user_to_admin' | 'admin_to_user'
    sender_number: string
    message_content?: string
    message_type?: string
    status?: 'success' | 'failed'
    error_message?: string
    created_at?: string
}

// ============================================
// Auto Forward Config Functions
// ============================================
export const autoForwardConfigDb = {
    get: (sessionId: string): AutoForwardConfig | null => {
        try {
            return db.prepare('SELECT * FROM auto_forward_config WHERE session_id = ?').get(sessionId) as AutoForwardConfig | null
        } catch { return null }
    },

    getAll: (): AutoForwardConfig[] => {
        try {
            return db.prepare('SELECT * FROM auto_forward_config ORDER BY created_at DESC').all() as AutoForwardConfig[]
        } catch { return [] }
    },

    upsert: (data: AutoForwardConfig): { success: boolean; error?: string } => {
        try {
            const existing = autoForwardConfigDb.get(data.session_id)
            if (existing) {
                db.prepare(`UPDATE auto_forward_config SET 
                    admin_number = ?, enabled = ?, token_prefix = ?, forward_media = ?, forward_groups = ?,
                    updated_at = datetime('now')
                    WHERE session_id = ?`).run(
                    data.admin_number, data.enabled ?? 1, data.token_prefix ?? 'CT',
                    data.forward_media ?? 1, data.forward_groups ?? 0, data.session_id
                )
            } else {
                db.prepare(`INSERT INTO auto_forward_config 
                    (session_id, admin_number, enabled, token_prefix, forward_media, forward_groups, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`).run(
                    data.session_id, data.admin_number, data.enabled ?? 1,
                    data.token_prefix ?? 'CT', data.forward_media ?? 1, data.forward_groups ?? 0
                )
            }
            return { success: true }
        } catch (e: any) { return { success: false, error: e.message } }
    },

    toggle: (sessionId: string, enabled: boolean): { success: boolean } => {
        try {
            db.prepare(`UPDATE auto_forward_config SET enabled = ?, updated_at = datetime('now') WHERE session_id = ?`)
                .run(enabled ? 1 : 0, sessionId)
            return { success: true }
        } catch { return { success: false } }
    },

    delete: (sessionId: string): { success: boolean } => {
        try {
            db.prepare('DELETE FROM auto_forward_config WHERE session_id = ?').run(sessionId)
            return { success: true }
        } catch { return { success: false } }
    }
}

// ============================================
// Auto Forward Token Functions
// ============================================
export const autoForwardTokenDb = {
    // Get or create token for a sender
    getOrCreate: (sessionId: string, senderNumber: string, senderName?: string): AutoForwardToken => {
        // Check for existing token
        const existing = db.prepare(
            'SELECT * FROM auto_forward_tokens WHERE session_id = ? AND sender_number = ?'
        ).get(sessionId, senderNumber) as AutoForwardToken | undefined
        
        if (existing) {
            // Update message count and timestamp
            db.prepare(`UPDATE auto_forward_tokens SET message_count = message_count + 1, 
                sender_name = COALESCE(?, sender_name), updated_at = datetime('now') 
                WHERE id = ?`).run(senderName || null, existing.id)
            existing.message_count = (existing.message_count || 0) + 1
            return existing
        }
        
        // Get config for prefix
        const config = autoForwardConfigDb.get(sessionId)
        const prefix = config?.token_prefix || 'CT'
        
        // Generate next token number
        const lastToken = db.prepare(
            `SELECT token FROM auto_forward_tokens WHERE session_id = ? AND token LIKE ? ORDER BY id DESC LIMIT 1`
        ).get(sessionId, `${prefix}%`) as { token: string } | undefined
        
        let nextNum = 1
        if (lastToken) {
            const numPart = lastToken.token.replace(prefix, '')
            nextNum = (parseInt(numPart) || 0) + 1
        }
        
        const token = `${prefix}${nextNum}`
        
        db.prepare(`INSERT INTO auto_forward_tokens 
            (session_id, token, sender_number, sender_name, message_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`
        ).run(sessionId, token, senderNumber, senderName || null)
        
        return { session_id: sessionId, token, sender_number: senderNumber, sender_name: senderName, message_count: 1 }
    },

    // Find sender by token
    getBySenderToken: (sessionId: string, token: string): AutoForwardToken | null => {
        try {
            return db.prepare(
                'SELECT * FROM auto_forward_tokens WHERE session_id = ? AND UPPER(token) = UPPER(?)'
            ).get(sessionId, token) as AutoForwardToken | null
        } catch { return null }
    },

    // Get all tokens for a session
    getAll: (sessionId: string, opts?: { limit?: number; offset?: number; search?: string }): AutoForwardToken[] => {
        try {
            let query = 'SELECT * FROM auto_forward_tokens WHERE session_id = ?'
            const params: any[] = [sessionId]
            if (opts?.search) {
                query += ' AND (token LIKE ? OR sender_number LIKE ? OR sender_name LIKE ?)'
                params.push(`%${opts.search}%`, `%${opts.search}%`, `%${opts.search}%`)
            }
            query += ' ORDER BY updated_at DESC'
            if (opts?.limit) { query += ' LIMIT ?'; params.push(opts.limit) }
            if (opts?.offset) { query += ' OFFSET ?'; params.push(opts.offset) }
            return db.prepare(query).all(...params) as AutoForwardToken[]
        } catch { return [] }
    },

    getCount: (sessionId: string): number => {
        try {
            const r = db.prepare('SELECT COUNT(*) as count FROM auto_forward_tokens WHERE session_id = ?').get(sessionId) as any
            return r?.count || 0
        } catch { return 0 }
    },

    // Update last message for a token
    updateLastMessage: (sessionId: string, token: string, message: string): void => {
        try {
            db.prepare(`UPDATE auto_forward_tokens SET last_message = ?, updated_at = datetime('now') 
                WHERE session_id = ? AND token = ?`).run(message.substring(0, 500), sessionId, token)
        } catch {}
    },

    // Delete a single token
    delete: (id: number): { success: boolean } => {
        try {
            db.prepare('DELETE FROM auto_forward_tokens WHERE id = ?').run(id)
            return { success: true }
        } catch { return { success: false } }
    },

    // Clear all tokens for a session
    clearAll: (sessionId: string): { success: boolean; deleted: number } => {
        try {
            const result = db.prepare('DELETE FROM auto_forward_tokens WHERE session_id = ?').run(sessionId)
            return { success: true, deleted: result.changes }
        } catch { return { success: false, deleted: 0 } }
    }
}

// ============================================
// Auto Forward Logs Functions
// ============================================
export const autoForwardLogDb = {
    insert: (log: AutoForwardLogEntry): void => {
        try {
            db.prepare(`INSERT INTO auto_forward_logs 
                (session_id, token, direction, sender_number, message_content, message_type, status, error_message, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
            ).run(
                log.session_id, log.token, log.direction, log.sender_number,
                (log.message_content || '').substring(0, 1000), log.message_type || 'text',
                log.status || 'success', log.error_message || null
            )
        } catch (e) { console.error('Auto-forward log insert error:', e) }
    },

    getAll: (opts: { sessionId?: string; direction?: string; limit?: number; offset?: number }): AutoForwardLogEntry[] => {
        try {
            let query = 'SELECT * FROM auto_forward_logs WHERE 1=1'
            const params: any[] = []
            if (opts.sessionId) { query += ' AND session_id = ?'; params.push(opts.sessionId) }
            if (opts.direction) { query += ' AND direction = ?'; params.push(opts.direction) }
            query += ' ORDER BY created_at DESC'
            if (opts.limit) { query += ' LIMIT ?'; params.push(opts.limit) }
            if (opts.offset) { query += ' OFFSET ?'; params.push(opts.offset) }
            return db.prepare(query).all(...params) as AutoForwardLogEntry[]
        } catch { return [] }
    },

    getCount: (opts: { sessionId?: string; direction?: string }): number => {
        try {
            let query = 'SELECT COUNT(*) as count FROM auto_forward_logs WHERE 1=1'
            const params: any[] = []
            if (opts.sessionId) { query += ' AND session_id = ?'; params.push(opts.sessionId) }
            if (opts.direction) { query += ' AND direction = ?'; params.push(opts.direction) }
            const r = db.prepare(query).get(...params) as any
            return r?.count || 0
        } catch { return 0 }
    },

    getStats: (sessionId?: string): { total: number; user_to_admin: number; admin_to_user: number; failed: number } => {
        try {
            let where = 'WHERE 1=1'
            const params: any[] = []
            if (sessionId) { where += ' AND session_id = ?'; params.push(sessionId) }
            const total = (db.prepare(`SELECT COUNT(*) as c FROM auto_forward_logs ${where}`).get(...params) as any)?.c || 0
            const u2a = (db.prepare(`SELECT COUNT(*) as c FROM auto_forward_logs ${where} AND direction='user_to_admin'`).get(...params) as any)?.c || 0
            const a2u = (db.prepare(`SELECT COUNT(*) as c FROM auto_forward_logs ${where} AND direction='admin_to_user'`).get(...params) as any)?.c || 0
            const failed = (db.prepare(`SELECT COUNT(*) as c FROM auto_forward_logs ${where} AND status='failed'`).get(...params) as any)?.c || 0
            return { total, user_to_admin: u2a, admin_to_user: a2u, failed }
        } catch { return { total: 0, user_to_admin: 0, admin_to_user: 0, failed: 0 } }
    },

    cleanup: (days: number = 30): number => {
        try {
            const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days)
            return db.prepare('DELETE FROM auto_forward_logs WHERE created_at < ?').run(cutoff.toISOString()).changes
        } catch { return 0 }
    }
}

// ============================================
// Member ↔ Session Assignment CRUD
// ============================================
export interface MemberSession {
    id: number
    user_id: number
    session_id: string
    assigned_at: string
    assigned_by: number | null
}

export const memberSessionDb = {
    /** Assign a WA session to a member (idempotent) */
    assign: (userId: number, sessionId: string, assignedBy?: number): { success: boolean; error?: string } => {
        try {
            db.prepare(
                `INSERT OR IGNORE INTO member_sessions (user_id, session_id, assigned_by) VALUES (?, ?, ?)`
            ).run(userId, sessionId, assignedBy ?? null)
            return { success: true }
        } catch (e: any) { return { success: false, error: e.message } }
    },

    /** Unassign a WA session from a member */
    unassign: (userId: number, sessionId: string): { success: boolean } => {
        try {
            db.prepare('DELETE FROM member_sessions WHERE user_id = ? AND session_id = ?').run(userId, sessionId)
            return { success: true }
        } catch { return { success: false } }
    },

    /** Get all session IDs assigned to a user */
    getSessionsForUser: (userId: number): string[] => {
        try {
            const rows = db.prepare('SELECT session_id FROM member_sessions WHERE user_id = ?').all(userId) as any[]
            return rows.map(r => r.session_id)
        } catch { return [] }
    },

    /** Get all user IDs assigned to a session */
    getUsersForSession: (sessionId: string): number[] => {
        try {
            const rows = db.prepare('SELECT user_id FROM member_sessions WHERE session_id = ?').all(sessionId) as any[]
            return rows.map(r => r.user_id)
        } catch { return [] }
    },

    /** Get full assignment list for a user (with metadata) */
    getFullForUser: (userId: number): MemberSession[] => {
        try {
            return db.prepare('SELECT * FROM member_sessions WHERE user_id = ? ORDER BY assigned_at DESC').all(userId) as MemberSession[]
        } catch { return [] }
    },

    /** Replace all session assignments for a user */
    replaceForUser: (userId: number, sessionIds: string[], assignedBy?: number): { success: boolean } => {
        try {
            const del = db.prepare('DELETE FROM member_sessions WHERE user_id = ?')
            const ins = db.prepare('INSERT INTO member_sessions (user_id, session_id, assigned_by) VALUES (?, ?, ?)')
            const tx = db.transaction(() => {
                del.run(userId)
                for (const sid of sessionIds) {
                    ins.run(userId, sid, assignedBy ?? null)
                }
            })
            tx()
            return { success: true }
        } catch { return { success: false } }
    },

    /** Delete all assignments for a session (when session is deleted) */
    clearSession: (sessionId: string): void => {
        try { db.prepare('DELETE FROM member_sessions WHERE session_id = ?').run(sessionId) } catch {}
    }
}

// ============================================
// Scheduled Media Cleanup (auto-delete media > N days)
// ============================================
let _mediaCleanupTimer: ReturnType<typeof setInterval> | null = null

export function startMediaAutoCleanup(days: number = 3, intervalHours: number = 6): void {
    // Run once immediately
    const cleaned = dbMaintenance.clearOldMedia(days)
    if (cleaned > 0) {
        console.log(`🧹 Auto media cleanup: cleared ${cleaned} media entries older than ${days} days`)
    }

    // Schedule recurring
    if (_mediaCleanupTimer) clearInterval(_mediaCleanupTimer)
    _mediaCleanupTimer = setInterval(() => {
        try {
            const n = dbMaintenance.clearOldMedia(days)
            if (n > 0) console.log(`🧹 Scheduled media cleanup: cleared ${n} media entries older than ${days} days`)
        } catch (e) { console.error('⚠️ Media cleanup error:', e) }
    }, intervalHours * 60 * 60 * 1000)

    console.log(`⏰ Media auto-cleanup scheduled: every ${intervalHours}h, delete media older than ${days} days`)
}

export function stopMediaAutoCleanup(): void {
    if (_mediaCleanupTimer) { clearInterval(_mediaCleanupTimer); _mediaCleanupTimer = null }
}

// ============================================
// FCM Token Functions
// ============================================
export interface FcmTokenEntry {
    id?: number
    user_id: number
    token: string
    platform?: string
    browser?: string
    created_at?: string
    updated_at?: string
}

export const fcmTokenDb = {
    // Save or update FCM token for a user
    upsert: (userId: number, token: string, platform?: string, browser?: string): void => {
        db.prepare(`
            INSERT INTO fcm_tokens (user_id, token, platform, browser, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(token) DO UPDATE SET
                user_id = excluded.user_id,
                platform = excluded.platform,
                browser = excluded.browser,
                updated_at = datetime('now')
        `).run(userId, token, platform || 'web', browser || null)
    },

    // Remove a specific token
    remove: (token: string): void => {
        db.prepare('DELETE FROM fcm_tokens WHERE token = ?').run(token)
    },

    // Remove all tokens for a user
    removeAllForUser: (userId: number): void => {
        db.prepare('DELETE FROM fcm_tokens WHERE user_id = ?').run(userId)
    },

    // Get all tokens for a user
    getForUser: (userId: number): FcmTokenEntry[] => {
        return db.prepare('SELECT * FROM fcm_tokens WHERE user_id = ?').all(userId) as FcmTokenEntry[]
    },

    // Get all tokens for multiple users
    getForUsers: (userIds: number[]): FcmTokenEntry[] => {
        if (userIds.length === 0) return []
        const placeholders = userIds.map(() => '?').join(',')
        return db.prepare(`SELECT * FROM fcm_tokens WHERE user_id IN (${placeholders})`).all(...userIds) as FcmTokenEntry[]
    }
}

// ============================================
// Notification History Functions
// ============================================
export interface NotificationEntry {
    id?: number
    user_id: number
    type: string
    title: string
    body?: string
    data?: string
    channel?: string
    status?: string
    read_at?: string
    created_at?: string
}

export const notificationDb = {
    // Insert a notification record
    insert: (entry: NotificationEntry): number | bigint => {
        const result = db.prepare(`
            INSERT INTO notifications (user_id, type, title, body, data, channel, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            entry.user_id,
            entry.type || 'incoming_message',
            entry.title,
            entry.body || null,
            entry.data || null,
            entry.channel || 'socket',
            entry.status || 'sent'
        )
        return result.lastInsertRowid
    },

    // Get notifications for a user (inbox)
    getForUser: (userId: number, limit: number = 50, offset: number = 0): NotificationEntry[] => {
        return db.prepare(`
            SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
        `).all(userId, limit, offset) as NotificationEntry[]
    },

    // Get unread count
    getUnreadCount: (userId: number): number => {
        const row = db.prepare(`
            SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_at IS NULL
        `).get(userId) as any
        return row?.count || 0
    },

    // Mark as read
    markAsRead: (notificationId: number, userId: number): void => {
        db.prepare(`
            UPDATE notifications SET read_at = datetime('now'), status = 'read' WHERE id = ? AND user_id = ?
        `).run(notificationId, userId)
    },

    // Mark all as read for user
    markAllAsRead: (userId: number): void => {
        db.prepare(`
            UPDATE notifications SET read_at = datetime('now'), status = 'read' WHERE user_id = ? AND read_at IS NULL
        `).run(userId)
    },

    // Delete old notifications (cleanup)
    deleteOlderThan: (days: number): number => {
        const result = db.prepare(`
            DELETE FROM notifications WHERE created_at < datetime('now', '-' || ? || ' days')
        `).run(days)
        return result.changes
    }
}

// Migration: Create app_settings table
try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_name TEXT NOT NULL DEFAULT 'Billey WA',
            app_tagline TEXT DEFAULT 'WhatsApp Multi Session',
            logo TEXT,
            logo_small TEXT,
            favicon TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `)
    // Seed default row if empty
    const existing = db.prepare('SELECT id FROM app_settings LIMIT 1').get()
    if (!existing) {
        db.prepare(`INSERT INTO app_settings (app_name, app_tagline) VALUES (?, ?)`).run('Billey WA', 'WhatsApp Multi Session')
    }
    console.log('✅ App settings migration complete')
} catch (migrationError) {
    console.error('⚠️ App settings migration error:', migrationError)
}

// App Settings Interface
export interface AppSettingEntry {
    id?: number
    app_name: string
    app_tagline?: string
    logo?: string | null
    logo_small?: string | null
    favicon?: string | null
    created_at?: string
    updated_at?: string
}

// App Settings DB Functions
export const appSettingDb = {
    get: (): AppSettingEntry => {
        const row = db.prepare('SELECT * FROM app_settings ORDER BY id ASC LIMIT 1').get() as AppSettingEntry | undefined
        return row ?? { app_name: 'Billey WA', app_tagline: 'WhatsApp Multi Session' }
    },

    update: (data: Partial<AppSettingEntry>): void => {
        const existing = db.prepare('SELECT id FROM app_settings LIMIT 1').get() as { id: number } | undefined
        if (existing) {
            const fields: string[] = []
            const params: any[] = []
            if (data.app_name !== undefined)  { fields.push('app_name = ?');   params.push(data.app_name) }
            if (data.app_tagline !== undefined){ fields.push('app_tagline = ?'); params.push(data.app_tagline) }
            if (data.logo !== undefined)       { fields.push('logo = ?');       params.push(data.logo) }
            if (data.logo_small !== undefined) { fields.push('logo_small = ?'); params.push(data.logo_small) }
            if (data.favicon !== undefined)    { fields.push('favicon = ?');    params.push(data.favicon) }
            if (fields.length === 0) return
            fields.push("updated_at = datetime('now')")
            params.push(existing.id)
            db.prepare(`UPDATE app_settings SET ${fields.join(', ')} WHERE id = ?`).run(...params)
        } else {
            db.prepare(`INSERT INTO app_settings (app_name, app_tagline, logo, logo_small, favicon) VALUES (?, ?, ?, ?, ?)`)
              .run(data.app_name ?? 'Billey WA', data.app_tagline ?? '', data.logo ?? null, data.logo_small ?? null, data.favicon ?? null)
        }
    }
}

// Migration: Add caption column to message_logs for proper media caption handling
try {
    const msgTableInfo = db.prepare("PRAGMA table_info(message_logs)").all() as any[]
    const msgColumnNames = msgTableInfo.map((col: any) => col.name)
    if (!msgColumnNames.includes('caption')) {
        console.log('🔄 Migrating message_logs: Adding caption column...')
        db.exec('ALTER TABLE message_logs ADD COLUMN caption TEXT')
        // Migrate existing data: for media messages, move caption from content to caption field
        db.exec(`
            UPDATE message_logs 
            SET caption = content, content = '' 
            WHERE message_type IN ('image', 'video', 'gif') 
            AND content IS NOT NULL AND content != ''
        `)
        // For documents: if content equals filename, it was stored as fallback — clear content, keep filename
        db.exec(`
            UPDATE message_logs 
            SET caption = CASE WHEN content != filename THEN content ELSE '' END,
                content = ''
            WHERE message_type = 'document'
            AND content IS NOT NULL AND content != ''
        `)
        console.log('✅ message_logs caption migration complete')
    }
} catch (migrationError) {
    console.error('⚠️ Caption migration error:', migrationError)
}

// Export database instance for direct queries if needed
export { db }

console.log('✅ Database initialized at:', DB_PATH)
