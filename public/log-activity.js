// Initialize Socket.IO
const socket = io()

// State
let allMessageLogs = []
let filteredMessageLogs = []
let allSessionLogs = []
let currentFilter = 'all'
let searchQuery = ''
let sessionFilter = ''
let directionFilter = ''

// Statistics
let stats = {
    totalMessages: 0,
    incoming: 0,
    outgoing: 0,
    sessions: 0
}

// Load components function
async function loadComponents() {
    try {
        // Load Header
        const headerResponse = await fetch('components/header.html')
        const headerHTML = await headerResponse.text()
        document.getElementById('header-container').innerHTML = headerHTML
        
        // Load Sidebar
        const sidebarResponse = await fetch('components/sidebar.html')
        const sidebarHTML = await sidebarResponse.text()
        document.getElementById('sidebar-container').innerHTML = sidebarHTML
        
        // Load Footer
        const footerResponse = await fetch('components/footer.html')
        const footerHTML = await footerResponse.text()
        document.getElementById('footer-container').innerHTML = footerHTML
        
        console.log('✅ All components loaded successfully')
        
        // Initialize components after loading
        initializeComponents()
    } catch (error) {
        console.error('❌ Error loading components:', error)
    }
}

// Initialize components after they are loaded
function initializeComponents() {
    // Re-initialize Metronic components if needed
    if (typeof KTMenu !== 'undefined') {
        KTMenu.createInstances()
    }
    if (typeof KTDrawer !== 'undefined') {
        KTDrawer.createInstances()
    }
    if (typeof KTScroll !== 'undefined') {
        KTScroll.createInstances()
    }
}

// DOM Elements (will be set after components load)
let logContainer
let statMessages
let statSessions
let statErrors
let statTotal
let searchInput
let filterButtons
let statsCards
let exportLogsBtn
let clearLogsBtn
let logLimit
let sessionFilterSelect
let directionFilterSelect

// Call loadComponents when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    loadComponents().then(() => {
        // Set DOM elements after components are loaded
        logContainer = document.getElementById('log-container')
        statMessages = document.getElementById('stat-messages')
        statSessions = document.getElementById('stat-sessions')
        statErrors = document.getElementById('stat-errors')
        statTotal = document.getElementById('stat-total')
        searchInput = document.getElementById('search-input')
        filterButtons = document.querySelectorAll('.filter-btn')
        statsCards = document.querySelectorAll('.stats-card')
        exportLogsBtn = document.getElementById('export-logs-btn')
        clearLogsBtn = document.getElementById('clear-logs-btn')
        logLimit = document.getElementById('log-limit')
        sessionFilterSelect = document.getElementById('session-filter')
        directionFilterSelect = document.getElementById('direction-filter')
        
        // Now initialize
        initializePage()
    })
})

// Initialize Page
function initializePage() {
    setupEventListeners()
    loadSessions()  // Load session list for filter
    loadMessageLogs()
    loadSessionLogs()
    loadStatistics()
    
    // Refresh every 10 seconds
    setInterval(() => {
        loadMessageLogs()
        loadSessionLogs()
        loadStatistics()
    }, 10000)
}

// Load session list for filter dropdown
async function loadSessions() {
    try {
        const response = await fetch('/api/sessions/list')
        const result = await response.json()
        
        if (result.success && sessionFilterSelect) {
            sessionFilterSelect.innerHTML = '<option value="">Semua Session</option>'
            result.data.forEach(sessionId => {
                sessionFilterSelect.innerHTML += `<option value="${sessionId}">${sessionId}</option>`
            })
        }
    } catch (error) {
        console.error('Error loading sessions:', error)
    }
}

// Load Session Logs from API
async function loadSessionLogs() {
    try {
        const limit = logLimit?.value || 100
        const response = await fetch(`/api/logs/sessions?limit=${limit}`)
        const result = await response.json()
        
        if (result.success) {
            allSessionLogs = result.data
            displaySessionLogs(result.data)
        }
    } catch (error) {
        console.error('Error loading session logs:', error)
    }
}

// Load Message Logs from API
async function loadMessageLogs() {
    try {
        const limit = logLimit?.value || 100
        let url = `/api/logs/messages?limit=${limit}`
        
        if (sessionFilter) {
            url += `&sessionId=${encodeURIComponent(sessionFilter)}`
        }
        if (directionFilter) {
            url += `&direction=${encodeURIComponent(directionFilter)}`
        }
        
        console.log('📥 Loading message logs:', url)
        const response = await fetch(url)
        const result = await response.json()
        
        if (result.success) {
            allMessageLogs = result.data.map(log => ({
                ...log,
                // Normalize field names from database
                sessionId: log.session_id,
                from: log.from_number,
                to: log.to_number,
                messageType: log.message_type,
                mediaInfo: log.filename ? {
                    filename: log.filename,
                    mimetype: log.mimetype,
                    size: log.file_size,
                    url: log.media_url
                } : null
            }))
            console.log('✅ Loaded', allMessageLogs.length, 'message logs')
            applyFilters()
        }
    } catch (error) {
        console.error('❌ Error loading message logs:', error)
    }
}

// Load Statistics
async function loadStatistics() {
    try {
        let url = '/api/logs/statistics'
        if (sessionFilter) {
            url += `?sessionId=${encodeURIComponent(sessionFilter)}`
        }
        
        const response = await fetch(url)
        const result = await response.json()
        
        if (result.success) {
            stats = result.data
            updateStatistics(result.data)
        }
    } catch (error) {
        console.error('Error loading statistics:', error)
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Filter buttons
    if (filterButtons) {
        filterButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                filterButtons.forEach(b => b.classList.remove('active'))
                this.classList.add('active')
                currentFilter = this.dataset.filter
                applyFilters()
            })
        })
    }
    
    // Stats cards filter
    if (statsCards) {
        statsCards.forEach(card => {
            card.addEventListener('click', function() {
                const filter = this.dataset.filter
                if (filterButtons) {
                    filterButtons.forEach(btn => {
                        if (btn.dataset.filter === filter) {
                            btn.click()
                        }
                    })
                }
            })
        })
    }
    
    // Search input
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            searchQuery = this.value.toLowerCase()
            applyFilters()
        })
    }
    
    // Session filter
    if (sessionFilterSelect) {
        sessionFilterSelect.addEventListener('change', function() {
            sessionFilter = this.value
            loadMessageLogs()
            loadStatistics()
        })
    }
    
    // Direction filter
    if (directionFilterSelect) {
        directionFilterSelect.addEventListener('change', function() {
            directionFilter = this.value
            loadMessageLogs()
        })
    }
    
    // Export button
    if (exportLogsBtn) {
        exportLogsBtn.addEventListener('click', exportLogs)
    }
    
    // Clear button
    if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', clearAllLogs)
    }
    
    // Log limit
    if (logLimit) {
        logLimit.addEventListener('change', () => {
            loadSessionLogs()
            loadMessageLogs()
        })
    }
}

// Socket Event Handlers
socket.on('connect', () => {
    console.log('✅ Connected to server')
    showToast('success', 'Terhubung ke Server')
})

socket.on('disconnect', () => {
    console.log('❌ Disconnected from server')
    showToast('error', 'Terputus dari Server')
})

socket.on('all-sessions', (sessions) => {
    stats.sessions = sessions.filter(s => s.isConnected).length
    if (statSessions) {
        statSessions.textContent = stats.sessions
    }
})

socket.on('session-status', (data) => {
    // Reload session logs when status changes
    loadSessionLogs()
    loadStatistics()
})

socket.on('message-sent', (data) => {
    // Reload message logs when new message sent
    loadMessageLogs()
    loadStatistics()
})

socket.on('message-received', (data) => {
    // Reload message logs when new message received
    loadMessageLogs()
    loadStatistics()
})

socket.on('qr', (data) => {
    console.log('📱 QR Code generated for', data.sessionId)
})

socket.on('error', (error) => {
    console.error('❌ Socket error:', error)
    showToast('error', error)
})

// Apply Filters
function applyFilters() {
    console.log('🔍 Applying filters to', allMessageLogs.length, 'logs')
    
    filteredMessageLogs = allMessageLogs.filter(log => {
        // Filter by direction based on current filter
        if (currentFilter === 'incoming') {
            if (log.direction !== 'incoming') return false
        } else if (currentFilter === 'outgoing') {
            if (log.direction !== 'outgoing') return false
        } else if (currentFilter !== 'all' && currentFilter !== 'message') {
            return false
        }
        
        // Filter by search - search in all relevant fields
        if (searchQuery) {
            const searchText = `
                ${log.sessionId || ''} 
                ${log.from || ''} 
                ${log.to || ''} 
                ${log.messageType || ''} 
                ${log.content || ''}
            `.toLowerCase()
            
            if (!searchText.includes(searchQuery)) {
                return false
            }
        }
        
        return true
    })
    
    console.log('✅ Filtered to', filteredMessageLogs.length, 'logs')
    renderLogs()
}

// Update Statistics
function updateStatistics(data) {
    console.log('📊 Statistics:', data)
    if (statTotal) statTotal.textContent = data.totalMessages || 0
    if (statMessages) statMessages.textContent = data.outgoing || 0  // Pesan terkirim
    if (statSessions) statSessions.textContent = data.sessions || 0  // Session aktif
    if (statErrors) statErrors.textContent = data.incoming || 0  // Pesan masuk (temporarily using errors card)
}

// Display Session Logs
function displaySessionLogs(logs) {
    const sessionSection = document.getElementById('session-logs-section')
    if (!sessionSection) return
    
    if (!logs || logs.length === 0) {
        sessionSection.innerHTML = '<p class="text-muted">Belum ada log session</p>'
        return
    }
    
    const html = logs.map(log => {
        const time = formatFullDateTime(log.timestamp)
        const statusColor = log.status === 'connected' ? 'success' : 
                          log.status === 'disconnected' ? 'danger' : 'warning'
        const actionIcon = log.action === 'login' ? 'bi-box-arrow-in-right' :
                          log.action === 'logout' ? 'bi-box-arrow-left' : 'bi-arrow-repeat'
        
        return `
            <div class="log-item mb-3 p-4 bg-light rounded">
                <div class="d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center">
                        <span class="badge badge-light-${statusColor} me-3">
                            <i class="bi ${actionIcon} me-1"></i>${log.action?.toUpperCase() || 'ACTION'}
                        </span>
                        <div>
                            <div class="fw-bold">${log.session_id || log.sessionId}</div>
                            ${log.user_name ? `<small class="text-muted">${log.user_name} (${log.user_id})</small>` : ''}
                        </div>
                    </div>
                    <div class="text-end">
                        <div class="badge badge-${statusColor}">${log.status}</div>
                        <div class="text-muted small mt-1">${time}</div>
                    </div>
                </div>
            </div>
        `
    }).join('')
    
    sessionSection.innerHTML = html
}

// Render Logs (Message Logs)
function renderLogs() {
    console.log('🎨 Rendering logs...', 'Container:', !!logContainer, 'Filtered logs:', filteredMessageLogs.length)
    
    if (!logContainer) {
        console.error('❌ logContainer is null!')
        return
    }
    
    if (filteredMessageLogs.length === 0) {
        console.log('⚠️ No filtered logs to display')
        logContainer.innerHTML = `
            <div class="text-center py-10">
                <span class="svg-icon svg-icon-5tx svg-icon-muted mb-5">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path opacity="0.3" d="M19 22H5C4.4 22 4 21.6 4 21V3C4 2.4 4.4 2 5 2H14L20 8V21C20 21.6 19.6 22 19 22Z" fill="currentColor"/>
                        <path d="M15 8H20L14 2V7C14 7.6 14.4 8 15 8Z" fill="currentColor"/>
                    </svg>
                </span>
                <p class="text-muted fw-semibold fs-5">Tidak ada log yang sesuai dengan filter</p>
            </div>
        `
        return
    }
    
    const limit = logLimit?.value || 100
    const logsToRender = filteredMessageLogs.slice(0, parseInt(limit))
    
    const html = logsToRender.map(log => {
        const time = formatFullDateTime(log.timestamp)
        const directionIcon = log.direction === 'incoming' ? '📨' : '📤'
        const directionLabel = log.direction === 'incoming' ? 'MASUK' : 'KELUAR'
        const typeIcon = getMessageTypeIcon(log.messageType)
        const statusColor = log.direction === 'outgoing' ? 'success' : 'primary'
        const sourceTag = log.source === 'mobile' ? '<span class="badge badge-light-warning ms-2">Mobile</span>' : 
                         log.source === 'ui' ? '<span class="badge badge-light-info ms-2">UI</span>' : ''
        
        return `
            <div class="log-item mb-3 p-4 bg-light rounded">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <div class="d-flex align-items-center mb-2">
                            <span class="me-2">${directionIcon}</span>
                            <span class="badge badge-light-${statusColor} me-2">${directionLabel}</span>
                            <span class="badge badge-secondary me-2">${typeIcon} ${log.messageType || 'text'}</span>
                            <span class="text-muted small">${log.sessionId}</span>
                            ${sourceTag}
                        </div>
                        <div class="mb-2">
                            <strong>From:</strong> <code>${log.from || '-'}</code>
                            <i class="bi bi-arrow-right mx-2"></i>
                            <strong>To:</strong> <code>${log.to || '-'}</code>
                        </div>
                        ${log.content ? `
                            <div class="message-content p-2 bg-white rounded">
                                <small>${escapeHtml(log.content)}</small>
                            </div>
                        ` : ''}
                        ${log.mediaInfo ? `
                            <div class="mt-2">
                                <small class="text-muted">
                                    📎 ${log.mediaInfo.filename || 'media'} 
                                    (${formatBytes(log.mediaInfo.size || 0)})
                                </small>
                            </div>
                        ` : ''}
                    </div>
                    <div class="text-end ms-3">
                        <div class="badge badge-${statusColor}">${log.status || 'sent'}</div>
                        <div class="text-muted small mt-1">${time}</div>
                    </div>
                </div>
            </div>
        `
    }).join('')
    
    console.log('✅ Rendering', logsToRender.length, 'logs to DOM')
    logContainer.innerHTML = html
}

// Export Logs
function exportLogs() {
    const format = confirm('Export sebagai CSV?\n\nOK = CSV\nCancel = JSON') ? 'csv' : 'json'
    const logsToExport = filteredMessageLogs
    
    if (logsToExport.length === 0) {
        showToast('warning', 'Tidak ada log untuk diexport')
        return
    }
    
    if (format === 'csv') {
        // Export as CSV
        let csv = 'Session ID,Direction,From,To,Type,Content,Timestamp,Status,Source\n'
        logsToExport.forEach(log => {
            const row = [
                log.sessionId || '',
                log.direction || '',
                log.from || '',
                log.to || '',
                log.messageType || '',
                `"${(log.content || '').replace(/"/g, '""')}"`,
                formatFullDateTime(log.timestamp),
                log.status || '',
                log.source || ''
            ]
            csv += row.join(',') + '\n'
        })
        
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `message_logs_${formatDateForFilename()}.csv`
        a.click()
        URL.revokeObjectURL(url)
    } else {
        // Export as JSON
        const json = JSON.stringify(logsToExport, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `message_logs_${formatDateForFilename()}.json`
        a.click()
        URL.revokeObjectURL(url)
    }
    
    showToast('success', `${logsToExport.length} log berhasil diexport dalam format ${format.toUpperCase()}`)
}

// Clear All Logs
async function clearAllLogs() {
    const days = prompt('Hapus log yang lebih lama dari berapa hari?\n(Masukkan 0 untuk menghapus semua)', '30')
    
    if (days === null) return
    
    const daysNum = parseInt(days)
    if (isNaN(daysNum) || daysNum < 0) {
        showToast('error', 'Masukkan angka yang valid')
        return
    }
    
    if (!confirm(`Apakah Anda yakin ingin menghapus log yang lebih lama dari ${daysNum} hari?\n\nTindakan ini tidak dapat dibatalkan!`)) {
        return
    }
    
    try {
        const response = await fetch(`/api/logs/clear?days=${daysNum}`, { method: 'DELETE' })
        const result = await response.json()
        
        if (result.success) {
            showToast('success', result.message)
            loadMessageLogs()
            loadSessionLogs()
            loadStatistics()
        } else {
            showToast('error', result.error || 'Gagal menghapus log')
        }
    } catch (error) {
        console.error('Error clearing logs:', error)
        showToast('error', 'Gagal menghapus log')
    }
}

// Helper Functions

// Format timestamp to DD-MM-YYYY HH:mm:ss
function formatFullDateTime(timestamp) {
    if (!timestamp) return '-'
    
    let date
    if (typeof timestamp === 'number') {
        // If timestamp is in seconds (10 digits), convert to ms
        const ts = timestamp < 10000000000 ? timestamp * 1000 : timestamp
        date = new Date(ts)
    } else {
        date = new Date(timestamp)
    }
    
    if (isNaN(date.getTime())) {
        return '-'
    }
    
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    
    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`
}

// Format date for filename
function formatDateForFilename() {
    const now = new Date()
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
}

// Get message type icon
function getMessageTypeIcon(type) {
    const icons = {
        'text': '💬',
        'image': '📷',
        'video': '🎥',
        'gif': '🎞️',
        'sticker': '🎨',
        'document': '📎',
        'audio': '🎵',
        'voice': '🎤',
        'contact': '👤',
        'location': '📍',
        'reaction': '❤️'
    }
    return icons[type] || '📄'
}

// Format bytes to human readable
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

// Escape HTML
function escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}

// Show toast notification
function showToast(type, message) {
    // Check if Toastr is available
    if (typeof toastr !== 'undefined') {
        toastr[type](message)
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`)
    }
}

console.log('✅ Log Activity page initialized')
