/**
 * Authentication Middleware
 * Handles session validation and role-based access control
 */

import { Request, Response, NextFunction } from 'express'
import { validateSession, User, UserRole, userOwnsSession } from './auth.js'

// Extend Express Request to include user
declare global {
    namespace Express {
        interface Request {
            user?: User
            sessionToken?: string
        }
    }
}

// Cookie name for session
export const SESSION_COOKIE_NAME = 'wa_session'

// ============================================
// Authentication Middleware
// ============================================

/**
 * Middleware to check if user is authenticated
 * Redirects to login page if not authenticated
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Get session token from cookie or header
    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME] || 
                        req.headers['x-session-token'] as string ||
                        req.headers.authorization?.replace('Bearer ', '')

    if (!sessionToken) {
        return handleUnauthorized(req, res, 'Silakan login terlebih dahulu')
    }

    // Validate session
    const user = validateSession(sessionToken)
    
    if (!user) {
        // Clear invalid cookie
        res.clearCookie(SESSION_COOKIE_NAME)
        return handleUnauthorized(req, res, 'Sesi telah berakhir. Silakan login kembali')
    }

    // Attach user and session token to request
    req.user = user
    req.sessionToken = sessionToken

    next()
}

/**
 * Middleware to check if user is admin
 * Must be used after authMiddleware
 */
export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
        return handleUnauthorized(req, res, 'Silakan login terlebih dahulu')
    }

    if (req.user.role !== 'adminwa') {
        return handleForbidden(req, res, 'Akses ditolak. Hanya admin yang bisa mengakses halaman ini')
    }

    next()
}

/**
 * Middleware to check if user is member
 * Must be used after authMiddleware
 */
export function memberMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
        return handleUnauthorized(req, res, 'Silakan login terlebih dahulu')
    }

    if (req.user.role !== 'memberwa') {
        return handleForbidden(req, res, 'Akses ditolak. Halaman ini khusus untuk member')
    }

    next()
}

/**
 * Middleware to verify user token (for API access)
 */
export function tokenMiddleware(req: Request, res: Response, next: NextFunction): void {
    const token = req.headers['x-api-token'] as string || req.query.token as string

    if (!token) {
        res.status(401).json({ 
            success: false, 
            error: 'API token diperlukan' 
        })
        return
    }

    // Import here to avoid circular dependency
    import('./auth.js').then(({ userDb }) => {
        const user = userDb.getByToken(token)
        
        if (!user) {
            res.status(401).json({ 
                success: false, 
                error: 'API token tidak valid' 
            })
            return
        }

        if (user.status !== 'aktif') {
            res.status(403).json({ 
                success: false, 
                error: 'Akun tidak aktif' 
            })
            return
        }

        req.user = user
        next()
    })
}

/**
 * Middleware to check session ownership
 * Ensures user can only access their own WhatsApp sessions
 */
export function sessionOwnerMiddleware(sessionIdParam: string = 'sessionId') {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            return handleUnauthorized(req, res, 'Silakan login terlebih dahulu')
        }

        const sessionId = req.params[sessionIdParam] || req.body.sessionId || req.query.sessionId as string

        if (!sessionId) {
            // No session ID in request, let the handler deal with it
            return next()
        }

        // Check if user owns the session
        if (!userOwnsSession(req.user.id, sessionId, req.user.role)) {
            return handleForbidden(req, res, 'Anda tidak memiliki akses ke session ini')
        }

        next()
    }
}

/**
 * API Key middleware — validates X-Api-Key header or ?api_key query param.
 * Key is checked against the WA_API_KEY environment variable.
 * If WA_API_KEY is not set, this middleware falls back to the user token check
 * (x-api-token header) so existing integrations keep working.
 */
export function apiKeyMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Accept key from header (preferred) or query string
    const provided = req.headers['x-api-key'] as string ||
                     req.query.api_key as string

    const envKey = process.env.WA_API_KEY

    if (envKey) {
        // Strict static-key check
        if (!provided) {
            res.status(401).json({
                success: false,
                error: 'API Key diperlukan. Sertakan header X-Api-Key.',
            })
            return
        }
        if (provided !== envKey) {
            res.status(401).json({
                success: false,
                error: 'API Key tidak valid.',
            })
            return
        }
        return next()
    }

    // Fallback: validate against per-user tokens (x-api-token) when WA_API_KEY not set
    const userToken = req.headers['x-api-token'] as string || req.query.token as string
    if (!userToken) {
        res.status(401).json({
            success: false,
            error: 'Autentikasi diperlukan. Gunakan header X-Api-Key atau X-Api-Token.',
        })
        return
    }

    import('./auth.js').then(({ userDb }) => {
        const user = userDb.getByToken(userToken)
        if (!user) {
            res.status(401).json({ success: false, error: 'Token tidak valid.' })
            return
        }
        if (user.status !== 'aktif') {
            res.status(403).json({ success: false, error: 'Akun tidak aktif.' })
            return
        }
        req.user = user
        next()
    }).catch(() => {
        res.status(500).json({ success: false, error: 'Kesalahan validasi autentikasi.' })
    })
}

/**
 * Optional auth middleware - doesn't fail if not authenticated
 * Just attaches user to request if valid session exists
 */
export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME] || 
                        req.headers['x-session-token'] as string

    if (sessionToken) {
        const user = validateSession(sessionToken)
        if (user) {
            req.user = user
            req.sessionToken = sessionToken
        }
    }

    next()
}

// ============================================
// Helper Functions
// ============================================

function handleUnauthorized(req: Request, res: Response, message: string): void {
    // Check if it's an API request
    if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
        res.status(401).json({ 
            success: false, 
            error: message,
            redirect: '/auth/login'
        })
    } else {
        // Redirect to login for web pages
        res.redirect('/auth/login?error=' + encodeURIComponent(message))
    }
}

function handleForbidden(req: Request, res: Response, message: string): void {
    if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
        res.status(403).json({ 
            success: false, 
            error: message 
        })
    } else {
        // Show error page or redirect
        res.status(403).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Akses Ditolak</title>
                <link href="/assets/css/style.bundle.css" rel="stylesheet" type="text/css"/>
            </head>
            <body class="bg-light d-flex align-items-center justify-content-center" style="min-height: 100vh;">
                <div class="text-center">
                    <h1 class="display-1 text-danger">403</h1>
                    <h3 class="mb-4">${message}</h3>
                    <a href="/" class="btn btn-primary">Kembali ke Dashboard</a>
                </div>
            </body>
            </html>
        `)
    }
}

// ============================================
// Role-based Query Helpers
// ============================================

/**
 * Get filter condition for user-based queries
 * Returns empty string for admin, or 'AND user_id = ?' for members
 */
export function getUserFilter(user: User | undefined): { condition: string; params: any[] } {
    if (!user || user.role === 'adminwa') {
        return { condition: '', params: [] }
    }
    return { condition: 'AND user_id = ?', params: [user.id] }
}

/**
 * Get session IDs owned by user (synchronous)
 */
export function getUserSessionIds(user: User | undefined): string[] | null {
    if (!user) return null // null means all sessions (for optional auth)
    if (user.role === 'adminwa') return null // null means all sessions
    
    // Import synchronously from auth
    const { getWaSessionsForUser } = require('./auth.js')
    return getWaSessionsForUser(user.id, user.role)
}

/**
 * Get session filter based on user role
 */
export function getSessionFilter(user: User | undefined, sessionIdColumn: string = 'session_id'): { condition: string; params: any[] } {
    if (!user || user.role === 'adminwa') {
        return { condition: '', params: [] }
    }
    
    // Get sessions owned by user
    const sessions = getUserSessionIds(user)
    if (!sessions || sessions.length === 0) {
        return { condition: 'AND 1=0', params: [] } // No access
    }
    const placeholders = sessions.map(() => '?').join(',')
    return { condition: `AND ${sessionIdColumn} IN (${placeholders})`, params: sessions }
}
