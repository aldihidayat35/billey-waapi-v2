// Initialize Socket.IO
const socket = io()

// State
let allSessions = []
let stats = {
    total: 0,
    connected: 0,
    messagesSent: 0,
    successRate: 0
}

// Load components
async function loadComponents() {
    try {
        const headerResponse = await fetch('components/header.html')
        const headerHTML = await headerResponse.text()
        document.getElementById('header-container').innerHTML = headerHTML
        
        const sidebarResponse = await fetch('components/sidebar.html')
        const sidebarHTML = await sidebarResponse.text()
        document.getElementById('sidebar-container').innerHTML = sidebarHTML
        
        const footerResponse = await fetch('components/footer.html')
        const footerHTML = await footerResponse.text()
        document.getElementById('footer-container').innerHTML = footerHTML
        
        console.log('✅ Components loaded')
        
        initializeComponents()
    } catch (error) {
        console.error('❌ Error loading components:', error)
    }
}

function initializeComponents() {
    if (typeof KTMenu !== 'undefined') KTMenu.createInstances()
    if (typeof KTDrawer !== 'undefined') KTDrawer.createInstances()
    if (typeof KTScroll !== 'undefined') KTScroll.createInstances()
}

// Socket Events
socket.on('connect', () => {
    console.log('🔌 Connected to server')
    socket.emit('get-sessions')
    loadActivityLogs()
})

socket.on('all-sessions', (sessions) => {
    console.log('📋 Received sessions:', sessions)
    allSessions = sessions
    updateStats()
    renderActiveSessions()
})

socket.on('session-status', (data) => {
    console.log('🔄 Session status update:', data)
    socket.emit('get-sessions')
})

// Update Statistics
function updateStats() {
    stats.total = allSessions.length
    stats.connected = allSessions.filter(s => s.isConnected).length
    
    // Update DOM
    document.getElementById('stat-total-sessions').textContent = stats.total
    document.getElementById('stat-connected-sessions').textContent = stats.connected
    document.getElementById('stat-messages-sent').textContent = stats.messagesSent
    document.getElementById('stat-success-rate').textContent = stats.successRate + '%'
}

// Render Active Sessions
function renderActiveSessions() {
    const container = document.getElementById('active-sessions-list')
    
    if (allSessions.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10">
                <i class="bi bi-inbox fs-5x text-muted mb-5"></i>
                <h3 class="text-muted">Belum ada session</h3>
                <p class="text-gray-600 mb-5">Buat session baru untuk memulai</p>
                <a href="manage-sessions.html" class="btn btn-primary">
                    <i class="bi bi-plus-circle"></i> Buat Session
                </a>
            </div>
        `
        return
    }
    
    container.innerHTML = allSessions.map(session => {
        const isConnected = session.isConnected
        const statusClass = isConnected ? 'success' : 'danger'
        const statusText = isConnected ? 'Connected' : 'Disconnected'
        const statusIcon = isConnected ? 'check-circle' : 'x-circle'
        const userName = session.user?.name || session.user?.id?.split(':')[0] || 'Unknown'
        const phoneNumber = session.user?.id?.split(':')[0] || '-'
        
        return `
            <div class="d-flex align-items-center bg-light-${statusClass} rounded p-5 mb-5">
                <div class="symbol symbol-50px me-5">
                    <span class="symbol-label bg-white">
                        <i class="bi bi-whatsapp fs-2x text-success"></i>
                    </span>
                </div>
                <div class="flex-grow-1">
                    <div class="fw-bold text-gray-800 fs-6">${session.id}</div>
                    <div class="text-muted fs-7">
                        ${isConnected ? `<i class="bi bi-person"></i> ${userName} • <i class="bi bi-telephone"></i> ${phoneNumber}` : 'Not connected'}
                    </div>
                </div>
                <div class="text-end">
                    <span class="badge badge-${statusClass} badge-lg">
                        <i class="bi bi-${statusIcon}"></i> ${statusText}
                    </span>
                </div>
            </div>
        `
    }).join('')
}

// Render Recent Activity
function renderRecentActivity(logs) {
    const container = document.getElementById('recent-activity-list')
    
    container.innerHTML = `
        <div class="text-center py-10">
            <i class="bi bi-clock-history fs-3x text-muted mb-3"></i>
            <p class="text-muted">Fitur activity log tidak tersedia (database dihapus)</p>
        </div>
    `
}

// Auto refresh every 30 seconds
setInterval(() => {
    socket.emit('get-sessions')
}, 30000)

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadComponents()
})

console.log('✅ Dashboard initialized')
