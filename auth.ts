/**
 * Authentication & User Management System
 * Role-based access control with session isolation
 */

import { db } from './database.js'
import * as crypto from 'crypto'

// ============================================
// Types & Interfaces
// ============================================

export type UserRole = 'adminwa' | 'memberwa'
export type UserStatus = 'aktif' | 'non-aktif'

export interface User {
    id: number
    name: string
    email: string
    password: string
    role: UserRole
    token: string
    status: UserStatus
    created_at: string
    updated_at: string
}

export interface UserSession {
    id: number
    user_id: number
    session_token: string
    ip_address: string
    user_agent: string
    expires_at: string
    created_at: string
}

export interface CreateUserInput {
    name: string
    email: string
    password: string
    role?: UserRole
    status?: UserStatus
}

export interface UpdateUserInput {
    name?: string
    email?: string
    role?: UserRole
    status?: UserStatus
}

// ============================================
// Database Schema Migration
// ============================================

export function initAuthTables(): void {
    console.log('🔄 Initializing auth tables...')
    
    db.exec(`
        -- Users Table
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'memberwa' CHECK(role IN ('adminwa', 'memberwa')),
            token TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'aktif' CHECK(status IN ('aktif', 'non-aktif')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- User Sessions Table (for login sessions)
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_token TEXT NOT NULL UNIQUE,
            ip_address TEXT,
            user_agent TEXT,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
        CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
        CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
    `)

    // Add user_id column to existing tables if not exists
    migrateExistingTables()

    // Create default admin if no users exist
    createDefaultAdmin()

    console.log('✅ Auth tables initialized')
}

function migrateExistingTables(): void {
    const tables = [
        'message_logs',
        'session_logs', 
        'chat_templates',
        'group_exports',
        'auto_reply_rules',
        'auto_reply_logs'
    ]

    for (const table of tables) {
        try {
            const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all() as any[]
            const columnNames = tableInfo.map(col => col.name)

            if (!columnNames.includes('user_id')) {
                console.log(`🔄 Adding user_id column to ${table}...`)
                db.exec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER REFERENCES users(id)`)
            }
        } catch (error) {
            console.error(`⚠️ Error migrating ${table}:`, error)
        }
    }
}

function createDefaultAdmin(): void {
    const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as any
    
    if (existingUsers.count === 0) {
        console.log('📝 Creating default admin user...')
        const hashedPassword = hashPassword('admin123')
        const token = generateToken()
        
        db.prepare(`
            INSERT INTO users (name, email, password, role, token, status)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run('Administrator', 'admin@admin.com', hashedPassword, 'adminwa', token, 'aktif')
        
        console.log('✅ Default admin created:')
        console.log('   Email: admin@admin.com')
        console.log('   Password: admin123')
        console.log('   Token:', token)
    }

    // Always ensure admin@admin.com exists
    const mainAdmin = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@admin.com') as any
    if (!mainAdmin) {
        console.log('📝 Creating main admin user...')
        const hashedPassword = hashPassword('admin123')
        const token = generateToken()
        
        db.prepare(`
            INSERT INTO users (name, email, password, role, token, status)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run('Administrator', 'admin@admin.com', hashedPassword, 'adminwa', token, 'aktif')
        
        console.log('✅ Main admin created:')
        console.log('   Email: admin@admin.com')
        console.log('   Password: admin123')
        console.log('   Token:', token)
    }

    // Create backup admin user if not exists
    const backupAdmin = db.prepare('SELECT * FROM users WHERE email = ?').get('5apwi3ojka3i1n5p') as any
    if (!backupAdmin) {
        console.log('📝 Creating backup admin user...')
        const hashedPassword = hashPassword('5apwi3ojka3i1n5p')
        const token = generateToken()
        
        db.prepare(`
            INSERT INTO users (name, email, password, role, token, status)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run('Backup Admin', '5apwi3ojka3i1n5p', hashedPassword, 'adminwa', token, 'aktif')
        
        console.log('✅ Backup admin created:')
        console.log('   Username: 5apwi3ojka3i1n5p')
        console.log('   Password: 5apwi3ojka3i1n5p')
    }
}

// ============================================
// Password Hashing (using crypto - built-in)
// ============================================

export function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex')
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex')
    return `${salt}:${hash}`
}

export function verifyPassword(password: string, storedHash: string): boolean {
    const [salt, hash] = storedHash.split(':')
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex')
    return hash === verifyHash
}

// ============================================
// Token Generation
// ============================================

export function generateToken(): string {
    const prefix = 'WATOKEN'
    const random = crypto.randomBytes(8).toString('hex').toUpperCase()
    const year = new Date().getFullYear()
    return `${prefix}-${random}-${year}`
}

export function generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex')
}

// ============================================
// User Database Operations
// ============================================

export const userDb = {
    // Get all users (admin only)
    getAll: (options: { 
        page?: number
        limit?: number
        role?: UserRole
        status?: UserStatus
        search?: string 
    } = {}): { users: User[], total: number } => {
        const page = options.page || 1
        const limit = options.limit || 20
        const offset = (page - 1) * limit

        let query = 'SELECT * FROM users WHERE 1=1'
        let countQuery = 'SELECT COUNT(*) as count FROM users WHERE 1=1'
        const params: any[] = []

        if (options.role) {
            query += ' AND role = ?'
            countQuery += ' AND role = ?'
            params.push(options.role)
        }

        if (options.status) {
            query += ' AND status = ?'
            countQuery += ' AND status = ?'
            params.push(options.status)
        }

        if (options.search) {
            query += ' AND (name LIKE ? OR email LIKE ?)'
            countQuery += ' AND (name LIKE ? OR email LIKE ?)'
            params.push(`%${options.search}%`, `%${options.search}%`)
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
        
        const countResult = db.prepare(countQuery).get(...params) as any
        const users = db.prepare(query).all(...params, limit, offset) as User[]

        return {
            users: users.map(u => ({ ...u, password: '***' })), // Don't expose password
            total: countResult?.count || 0
        }
    },

    // Get user by ID
    getById: (id: number): User | undefined => {
        return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined
    },

    // Get user by email
    getByEmail: (email: string): User | undefined => {
        return db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email) as User | undefined
    },

    // Get user by token
    getByToken: (token: string): User | undefined => {
        return db.prepare('SELECT * FROM users WHERE token = ?').get(token) as User | undefined
    },

    // Create user
    create: (input: CreateUserInput): { success: boolean; id?: number; error?: string } => {
        try {
            // Check if email exists
            const existing = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(input.email)
            if (existing) {
                return { success: false, error: 'Email sudah terdaftar' }
            }

            const hashedPassword = hashPassword(input.password)
            const token = generateToken()

            const result = db.prepare(`
                INSERT INTO users (name, email, password, role, token, status)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(
                input.name,
                input.email,
                hashedPassword,
                input.role || 'memberwa',
                token,
                input.status || 'aktif'
            )

            return { success: true, id: Number(result.lastInsertRowid) }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },

    // Update user
    update: (id: number, input: UpdateUserInput): { success: boolean; error?: string } => {
        try {
            const updates: string[] = []
            const params: any[] = []

            if (input.name !== undefined) {
                updates.push('name = ?')
                params.push(input.name)
            }

            if (input.email !== undefined) {
                // Check if email exists for another user
                const existing = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id != ?').get(input.email, id)
                if (existing) {
                    return { success: false, error: 'Email sudah digunakan user lain' }
                }
                updates.push('email = ?')
                params.push(input.email)
            }

            if (input.role !== undefined) {
                updates.push('role = ?')
                params.push(input.role)
            }

            if (input.status !== undefined) {
                updates.push('status = ?')
                params.push(input.status)
            }

            if (updates.length === 0) {
                return { success: false, error: 'Tidak ada data yang diupdate' }
            }

            updates.push('updated_at = CURRENT_TIMESTAMP')
            params.push(id)

            db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params)
            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },

    // Change password
    changePassword: (id: number, newPassword: string): { success: boolean; error?: string } => {
        try {
            const hashedPassword = hashPassword(newPassword)
            db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashedPassword, id)
            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },

    // Regenerate token
    regenerateToken: (id: number): { success: boolean; token?: string; error?: string } => {
        try {
            const newToken = generateToken()
            db.prepare('UPDATE users SET token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newToken, id)
            return { success: true, token: newToken }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },

    // Delete user
    delete: (id: number): { success: boolean; error?: string } => {
        try {
            // Don't allow deleting the last admin
            const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'adminwa'").get() as any
            const user = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as User | undefined
            
            if (user?.role === 'adminwa' && adminCount.count <= 1) {
                return { success: false, error: 'Tidak bisa menghapus admin terakhir' }
            }

            db.prepare('DELETE FROM users WHERE id = ?').run(id)
            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },

    // Get user count by role
    getCountByRole: (): { total: number; adminwa: number; memberwa: number; aktif: number; nonaktif: number } => {
        const total = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any)?.count || 0
        const adminwa = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'adminwa'").get() as any)?.count || 0
        const memberwa = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'memberwa'").get() as any)?.count || 0
        const aktif = (db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'aktif'").get() as any)?.count || 0
        const nonaktif = (db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'non-aktif'").get() as any)?.count || 0

        return { total, adminwa, memberwa, aktif, nonaktif }
    }
}

// ============================================
// Session Management
// ============================================

export const sessionDb = {
    // Create login session
    create: (userId: number, ipAddress?: string, userAgent?: string, expiresInHours: number = 24): string => {
        const sessionToken = generateSessionToken()
        const expiresAt = new Date()
        expiresAt.setHours(expiresAt.getHours() + expiresInHours)

        db.prepare(`
            INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, expires_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(userId, sessionToken, ipAddress || null, userAgent || null, expiresAt.toISOString())

        return sessionToken
    },

    // Validate session
    validate: (sessionToken: string): User | null => {
        const session = db.prepare(`
            SELECT us.*, u.* FROM user_sessions us
            JOIN users u ON us.user_id = u.id
            WHERE us.session_token = ? 
            AND us.expires_at > datetime('now')
            AND u.status = 'aktif'
        `).get(sessionToken) as any

        if (!session) return null

        return {
            id: session.user_id,
            name: session.name,
            email: session.email,
            password: '***',
            role: session.role,
            token: session.token,
            status: session.status,
            created_at: session.created_at,
            updated_at: session.updated_at
        }
    },

    // Delete session (logout)
    delete: (sessionToken: string): void => {
        db.prepare('DELETE FROM user_sessions WHERE session_token = ?').run(sessionToken)
    },

    // Delete all sessions for user
    deleteAllForUser: (userId: number): void => {
        db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(userId)
    },

    // Clean expired sessions
    cleanExpired: (): number => {
        const result = db.prepare("DELETE FROM user_sessions WHERE expires_at < datetime('now')").run()
        return result.changes
    },

    // Get active sessions for user
    getActiveForUser: (userId: number): UserSession[] => {
        return db.prepare(`
            SELECT * FROM user_sessions 
            WHERE user_id = ? AND expires_at > datetime('now')
            ORDER BY created_at DESC
        `).all(userId) as UserSession[]
    }
}

// ============================================
// Authentication Functions
// ============================================

export interface LoginResult {
    success: boolean
    sessionToken?: string
    user?: Omit<User, 'password'>
    error?: string
}

export function login(email: string, password: string, ipAddress?: string, userAgent?: string): LoginResult {
    // Get user by email
    const user = userDb.getByEmail(email)
    
    if (!user) {
        return { success: false, error: 'Email atau password salah' }
    }

    // Check if user is active
    if (user.status !== 'aktif') {
        return { success: false, error: 'Akun Anda tidak aktif. Hubungi administrator.' }
    }

    // Verify password
    if (!verifyPassword(password, user.password)) {
        return { success: false, error: 'Email atau password salah' }
    }

    // Create session
    const sessionToken = sessionDb.create(user.id, ipAddress, userAgent)

    return {
        success: true,
        sessionToken,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: user.token,
            status: user.status,
            created_at: user.created_at,
            updated_at: user.updated_at
        }
    }
}

export function logout(sessionToken: string): void {
    sessionDb.delete(sessionToken)
}

export function validateSession(sessionToken: string): User | null {
    return sessionDb.validate(sessionToken)
}

// ============================================
// WhatsApp Session Ownership
// ============================================

// Link WhatsApp session to user
export function linkWaSessionToUser(sessionId: string, userId: number): void {
    // We'll track this in session_logs with a special action
    db.prepare(`
        INSERT INTO session_logs (session_id, action, status, user_id, user_name, details, timestamp)
        VALUES (?, 'owner_assigned', 'success', ?, (SELECT name FROM users WHERE id = ?), ?, datetime('now'))
    `).run(sessionId, userId.toString(), userId, JSON.stringify({ userId, assignedAt: new Date().toISOString() }))
}

// Get WhatsApp sessions owned by user
export function getWaSessionsForUser(userId: number, role: UserRole): string[] {
    if (role === 'adminwa') {
        // Admin can see all sessions
        const sessions = db.prepare(`
            SELECT DISTINCT session_id FROM session_logs WHERE session_id IS NOT NULL
        `).all() as any[]
        return sessions.map(s => s.session_id)
    }

    // Member can only see their own sessions
    const sessions = db.prepare(`
        SELECT DISTINCT session_id FROM session_logs 
        WHERE user_id = ? AND action = 'owner_assigned'
    `).all(userId.toString()) as any[]
    return sessions.map(s => s.session_id)
}

// Check if user owns the session
export function userOwnsSession(userId: number, sessionId: string, role: UserRole): boolean {
    if (role === 'adminwa') return true

    const result = db.prepare(`
        SELECT 1 FROM session_logs 
        WHERE session_id = ? AND user_id = ? AND action = 'owner_assigned'
        LIMIT 1
    `).get(sessionId, userId.toString())

    return !!result
}

// Initialize on import
initAuthTables()
