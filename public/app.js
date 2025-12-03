// Initialize Socket.IO
const socket = io()

// State
let currentSessionId = null
let allSessions = []

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

// Call loadComponents when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    loadComponents()
})

// DOM Elements
const statusIndicator = document.getElementById('status-indicator')
const statusText = document.getElementById('status-text')
const qrPlaceholder = document.getElementById('qr-placeholder')
const qrCodeDiv = document.getElementById('qr-code')
const connectionPanel = document.getElementById('connection-panel')
const userInfo = document.getElementById('user-info')
const activityLog = document.getElementById('activity-log')
const messageStatus = document.getElementById('message-status')

// Session Manager Elements
const newSessionIdInput = document.getElementById('new-session-id')
const btnCreateSession = document.getElementById('btn-create-session')
const sessionsList = document.getElementById('sessions-list')
const sessionSelector = document.getElementById('session-selector')
const sendSessionSelector = document.getElementById('send-session-selector')

// Buttons
const btnQr = document.getElementById('btn-qr')
const btnPairing = document.getElementById('btn-pairing')
const btnLogout = document.getElementById('btn-logout')
const btnSend = document.getElementById('btn-send')

// Inputs
const phoneNumberInput = document.getElementById('phone-number')
const recipientPhoneInput = document.getElementById('recipient-phone')
const messageTextInput = document.getElementById('message-text')
const pairingCodeDisplay = document.getElementById('pairing-code-display')
const pairingCodeElement = document.getElementById('pairing-code')

// Tab functionality
const tabButtons = document.querySelectorAll('.tab-btn')
const tabContents = document.querySelectorAll('.tab-content')

tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab
        
        // Remove active class from all tabs
        tabButtons.forEach(b => b.classList.remove('active'))
        tabContents.forEach(c => c.classList.remove('active'))
        
        // Add active class to clicked tab
        btn.classList.add('active')
        document.getElementById(`${tabName}-tab`).classList.add('active')
        
        // Hide pairing code display when switching tabs
        pairingCodeDisplay.style.display = 'none'
    })
})

// Event Listeners
btnCreateSession.addEventListener('click', () => {
    const sessionId = newSessionIdInput.value.trim()
    
    if (!sessionId) {
        alert('Please enter a session ID')
        return
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
        alert('Session ID can only contain letters, numbers, hyphens, and underscores')
        return
    }
    
    addLog(`Creating session: ${sessionId}`, 'info')
    socket.emit('create-session', sessionId)
    newSessionIdInput.value = ''
})

sessionSelector.addEventListener('change', (e) => {
    currentSessionId = e.target.value
    updateCurrentSessionUI()
})

btnQr.addEventListener('click', () => {
    if (!currentSessionId) {
        alert('Please select a session first')
        return
    }
    
    addLog(`Requesting QR Code for session: ${currentSessionId}`, 'info')
    socket.emit('start-session-qr', currentSessionId)
    btnQr.disabled = true
    btnQr.innerHTML = '<span>⏳ Generating QR Code...</span>'
})

btnPairing.addEventListener('click', () => {
    if (!currentSessionId) {
        alert('Please select a session first')
        return
    }
    
    const phoneNumber = phoneNumberInput.value.trim()
    
    if (!phoneNumber) {
        alert('Please enter a phone number')
        return
    }
    
    if (!/^[0-9]+$/.test(phoneNumber)) {
        alert('Phone number should only contain numbers')
        return
    }
    
    addLog(`Requesting pairing code for session ${currentSessionId}: ${phoneNumber}`, 'info')
    socket.emit('start-session-pairing', { sessionId: currentSessionId, phoneNumber })
    btnPairing.disabled = true
    btnPairing.innerHTML = '<span>⏳ Getting Code...</span>'
})

btnLogout.addEventListener('click', () => {
    if (!currentSessionId) {
        alert('Please select a session first')
        return
    }
    
    if (confirm(`Are you sure you want to logout session "${currentSessionId}"?`)) {
        addLog(`Logging out session: ${currentSessionId}`, 'warning')
        socket.emit('logout', currentSessionId)
    }
})

btnSend.addEventListener('click', async () => {
    const sendSessionId = sendSessionSelector.value
    const recipientPhone = recipientPhoneInput.value.trim()
    const messageText = messageTextInput.value.trim()
    
    if (!sendSessionId) {
        showMessageStatus('Please select a session', 'error')
        return
    }
    
    if (!recipientPhone || !messageText) {
        showMessageStatus('Please fill in all fields', 'error')
        return
    }
    
    btnSend.disabled = true
    btnSend.innerHTML = '<span>⏳ Sending...</span>'
    
    socket.emit('send-message', {
        sessionId: sendSessionId,
        phone: recipientPhone,
        message: messageText
    })
})

// Socket event handlers
socket.on('connect', () => {
    addLog('Connected to server', 'success')
    socket.emit('get-sessions')
})

socket.on('all-sessions', (sessions) => {
    console.log('All sessions received:', sessions)
    allSessions = sessions
    renderSessionsList()
    updateSessionSelectors()
})

socket.on('session-status', (data) => {
    console.log('Session status update:', data)
    addLog(`Session ${data.sessionId}: ${data.status}`, 'info')
    
    // Update session in list
    const sessionIndex = allSessions.findIndex(s => s.id === data.sessionId)
    if (sessionIndex !== -1) {
        allSessions[sessionIndex].isConnected = data.isConnected
        allSessions[sessionIndex].user = data.user
        renderSessionsList()
        updateSessionSelectors()
    }
    
    // Update UI if it's the current session
    if (data.sessionId === currentSessionId) {
        updateStatus(data.isConnected, data.user)
    }
})

socket.on('qr', (data) => {
    console.log('QR event received for session:', data.sessionId)
    
    if (data.sessionId === currentSessionId) {
        addLog(`QR Code received for session ${data.sessionId}`, 'success')
        displayQRCode(data.qr)
    }
})

socket.on('pairing-code', (data) => {
    if (data.sessionId === currentSessionId) {
        addLog(`Pairing code for session ${data.sessionId}: ${data.code}`, 'success')
        pairingCodeElement.textContent = data.code
        pairingCodeDisplay.style.display = 'block'
        btnPairing.disabled = false
        btnPairing.innerHTML = '<span>🔗 Get Pairing Code</span>'
    }
})

socket.on('message', (msg) => {
    addLog(msg, 'info')
})

socket.on('error', (error) => {
    addLog(`Error: ${error}`, 'error')
    btnQr.disabled = false
    btnQr.innerHTML = '<span>📷 Connect with QR Code</span>'
    btnPairing.disabled = false
    btnPairing.innerHTML = '<span>🔗 Get Pairing Code</span>'
})

socket.on('message-sent', (data) => {
    addLog(`Message sent from session ${data.sessionId} to ${data.to}`, 'success')
    showMessageStatus(`Message sent successfully to ${data.to}`, 'success')
    messageTextInput.value = ''
    btnSend.disabled = false
    btnSend.innerHTML = '<span>📤 Send Message</span>'
})

socket.on('message-received', (data) => {
    addLog(`New message in session ${data.sessionId} from ${data.from}`, 'info')
})

socket.on('disconnect', () => {
    addLog('Disconnected from server', 'error')
})

// Helper functions
function renderSessionsList() {
    if (allSessions.length === 0) {
        sessionsList.innerHTML = '<p class="empty-state">No sessions yet. Create one above.</p>'
        return
    }
    
    sessionsList.innerHTML = allSessions.map(session => {
        const isActive = session.id === currentSessionId
        const statusBadge = session.isConnected 
            ? '<span class="session-badge connected">🟢 Connected</span>'
            : '<span class="session-badge disconnected">🔴 Disconnected</span>'
        
        const userInfo = session.user 
            ? `<div class="session-info"><span class="session-user">${session.user.name || session.user.verifiedName || 'User'}</span> (${session.user.id.split(':')[0]})</div>`
            : ''
        
        return `
            <div class="session-item ${isActive ? 'active' : ''}" data-session-id="${session.id}">
                <div class="session-header">
                    <div class="session-title">
                        <span class="session-id">${session.id}</span>
                        ${statusBadge}
                    </div>
                </div>
                ${userInfo}
                <div class="session-actions">
                    ${!session.isConnected ? `
                        <button class="btn btn-primary btn-sm" onclick="selectAndConnectSession('${session.id}')">
                            <span>🔌 Connect</span>
                        </button>
                    ` : `
                        <button class="btn btn-success btn-sm" onclick="selectSession('${session.id}')">
                            <span>✅ Select</span>
                        </button>
                    `}
                    <button class="btn btn-danger btn-sm" onclick="deleteSessionConfirm('${session.id}')">
                        <span>🗑️ Delete</span>
                    </button>
                </div>
            </div>
        `
    }).join('')
}

function updateSessionSelectors() {
    // Update connection session selector
    if (allSessions.length === 0) {
        sessionSelector.innerHTML = '<option value="">No sessions available</option>'
        sessionSelector.disabled = true
    } else {
        sessionSelector.innerHTML = allSessions.map(s => 
            `<option value="${s.id}" ${s.id === currentSessionId ? 'selected' : ''}>${s.id} ${s.isConnected ? '(Connected)' : ''}</option>`
        ).join('')
        sessionSelector.disabled = false
    }
    
    // Update send message session selector
    const connectedSessions = allSessions.filter(s => s.isConnected)
    if (connectedSessions.length === 0) {
        sendSessionSelector.innerHTML = '<option value="">No connected sessions</option>'
        sendSessionSelector.disabled = true
        btnSend.disabled = true
    } else {
        sendSessionSelector.innerHTML = connectedSessions.map(s => 
            `<option value="${s.id}">${s.id} - ${s.user?.name || s.user?.id.split(':')[0] || 'Unknown'}</option>`
        ).join('')
        sendSessionSelector.disabled = false
        btnSend.disabled = false
    }
}

function updateCurrentSessionUI() {
    const session = allSessions.find(s => s.id === currentSessionId)
    if (session) {
        updateStatus(session.isConnected, session.user)
        renderSessionsList()
    }
}

function selectSession(sessionId) {
    currentSessionId = sessionId
    sessionSelector.value = sessionId
    updateCurrentSessionUI()
    addLog(`Selected session: ${sessionId}`, 'info')
}

function selectAndConnectSession(sessionId) {
    selectSession(sessionId)
}

function deleteSessionConfirm(sessionId) {
    if (confirm(`Are you sure you want to delete session "${sessionId}"?`)) {
        socket.emit('delete-session', sessionId)
        if (currentSessionId === sessionId) {
            currentSessionId = null
        }
    }
}

function updateStatus(isConnected, user = null) {
    if (isConnected) {
        statusIndicator.className = 'status-badge connected'
        statusText.textContent = 'Connected'
        connectionPanel.style.display = 'none'
        userInfo.style.display = 'flex'
        
        if (user) {
            const userName = user.name || user.verifiedName || 'User'
            const userNumber = user.id.split(':')[0] || 'Unknown'
            
            document.getElementById('user-name').textContent = userName
            document.getElementById('user-number').textContent = userNumber
            document.getElementById('user-initial').textContent = userName.charAt(0).toUpperCase()
        }
    } else {
        statusIndicator.className = 'status-badge disconnected'
        statusText.textContent = 'Disconnected'
        connectionPanel.style.display = 'block'
        userInfo.style.display = 'none'
        qrPlaceholder.style.display = 'block'
        qrCodeDiv.style.display = 'none'
        qrCodeDiv.innerHTML = ''
        pairingCodeDisplay.style.display = 'none'
    }
}

function displayQRCode(qrData) {
    console.log('Displaying QR Code:', qrData.substring(0, 50) + '...')
    qrPlaceholder.style.display = 'none'
    qrCodeDiv.style.display = 'block'
    qrCodeDiv.innerHTML = ''
    
    // Try using QRCode library if available
    if (typeof QRCode !== 'undefined' && QRCode.toCanvas) {
        QRCode.toCanvas(qrData, {
            width: 280,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        }, (error, canvas) => {
            if (error) {
                console.error('QRCode.toCanvas error:', error)
                // Fallback to image API
                displayQRCodeFallback(qrData)
                return
            }
            qrCodeDiv.appendChild(canvas)
            addLog('QR Code displayed successfully', 'success')
        })
    } else {
        // Fallback to image API
        displayQRCodeFallback(qrData)
    }
}

function displayQRCodeFallback(qrData) {
    console.log('Using fallback QR code display')
    const img = document.createElement('img')
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qrData)}`
    img.alt = 'QR Code'
    img.style.maxWidth = '100%'
    img.style.height = 'auto'
    img.onerror = () => {
        addLog('Failed to load QR code image', 'error')
        qrCodeDiv.innerHTML = '<p style="color: red;">Failed to generate QR code. Please try again.</p>'
    }
    img.onload = () => {
        addLog('QR Code displayed successfully (fallback)', 'success')
    }
    qrCodeDiv.appendChild(img)
}

function addLog(message, type = 'info') {
    const logItem = document.createElement('div')
    logItem.className = `log-item ${type}`
    
    const time = new Date().toLocaleTimeString()
    
    logItem.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-message">${message}</span>
    `
    
    activityLog.insertBefore(logItem, activityLog.firstChild)
    
    // Keep only last 50 log items
    while (activityLog.children.length > 50) {
        activityLog.removeChild(activityLog.lastChild)
    }
}

function showMessageStatus(message, type) {
    messageStatus.textContent = message
    messageStatus.className = `message-status ${type}`
    
    setTimeout(() => {
        messageStatus.style.display = 'none'
    }, 5000)
}

// Initial log
addLog('Application started. Please connect to WhatsApp.', 'info')
