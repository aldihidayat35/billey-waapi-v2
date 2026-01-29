// Initialize Socket.IO
const socket = io()

// State
let allSessions = []
let qrModal, pairingModal

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

// Initialize modals
function initializeModals() {
    const qrModalEl = document.getElementById('qrModal')
    const pairingModalEl = document.getElementById('pairingModal')
    
    if (qrModalEl) {
        qrModal = new bootstrap.Modal(qrModalEl)
        console.log('✅ QR Modal initialized')
    } else {
        console.error('❌ QR Modal element not found!')
    }
    
    if (pairingModalEl) {
        pairingModal = new bootstrap.Modal(pairingModalEl)
        console.log('✅ Pairing Modal initialized')
    } else {
        console.error('❌ Pairing Modal element not found!')
    }
}

// DOM Elements
const newSessionIdInput = document.getElementById('new-session-id')
const connectionMethodSelect = document.getElementById('connection-method')
const phoneNumberSection = document.getElementById('phone-number-section')
const pairingPhoneNumberInput = document.getElementById('pairing-phone-number')
const btnCreateSession = document.getElementById('btn-create-session')
const sessionsContainer = document.getElementById('sessions-container')

// Event Listeners
connectionMethodSelect.addEventListener('change', () => {
    if (connectionMethodSelect.value === 'pairing') {
        phoneNumberSection.style.display = 'block'
    } else {
        phoneNumberSection.style.display = 'none'
    }
})

btnCreateSession.addEventListener('click', createSession)

// Socket Events
socket.on('connect', () => {
    console.log('🔌 Connected to server')
    socket.emit('get-sessions')
})

socket.on('error', (errorMessage) => {
    console.error('❌ Socket error:', errorMessage)
    Swal.fire({
        icon: 'error',
        title: 'Error',
        text: errorMessage
    })
})

socket.on('message', (message) => {
    console.log('📨 Server message:', message)
})

socket.on('all-sessions', (sessions) => {
    console.log('📋 Received sessions:', sessions)
    allSessions = sessions
    renderSessions()
})

socket.on('qr', (data) => {
    console.log('📱 QR Code received for:', data.sessionId)
    console.log('📱 QR data length:', data.qr?.length)
    Swal.close() // Close loading dialog
    displayQRCode(data.qr)
})

socket.on('pairing-code', (data) => {
    console.log('🔢 Pairing code received:', data.code)
    Swal.close() // Close loading dialog
    displayPairingCode(data.code)
})

socket.on('session-status', (data) => {
    console.log('🔄 Session status update:', data)
    
    if (data.status === 'connected') {
        Swal.fire({
            icon: 'success',
            title: 'Session Connected!',
            text: `Session ${data.sessionId} berhasil terhubung`,
            timer: 3000
        })
        
        // Close modals
        if (qrModal) qrModal.hide()
        if (pairingModal) pairingModal.hide()
    }
    
    // Refresh sessions list
    socket.emit('get-sessions')
})

// Create Session
async function createSession() {
    const sessionId = newSessionIdInput.value.trim()
    const method = connectionMethodSelect.value
    
    if (!sessionId) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Session ID tidak boleh kosong!'
        })
        return
    }
    
    if (method === 'pairing') {
        const phoneNumber = pairingPhoneNumberInput.value.trim()
        if (!phoneNumber) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Nomor WhatsApp tidak boleh kosong untuk pairing method!'
            })
            return
        }
        
        // Create session with pairing
        socket.emit('create-session', sessionId)
        
        setTimeout(() => {
            socket.emit('start-session-pairing', {
                sessionId: sessionId,
                phoneNumber: phoneNumber
            })
        }, 1000)
        
    } else {
        // Create session with QR
        socket.emit('create-session', sessionId)
        
        setTimeout(() => {
            socket.emit('start-session-qr', sessionId)
        }, 1000)
    }
    
    // Clear form
    newSessionIdInput.value = ''
    pairingPhoneNumberInput.value = ''
    
    // Show loading
    Swal.fire({
        title: 'Membuat session...',
        text: 'Tunggu sebentar',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading()
        }
    })
    
    setTimeout(() => {
        Swal.close()
    }, 2000)
}

// Display QR Code (sama seperti app.js)
function displayQRCode(qrData) {
    console.log('🖼️ displayQRCode called, data length:', qrData?.length)
    
    if (!qrData) {
        console.error('❌ No QR data received')
        return
    }
    
    const qrContainer = document.getElementById('qr-code-container')
    if (!qrContainer) {
        console.error('❌ QR container element not found!')
        return
    }
    
    qrContainer.innerHTML = ''
    
    // Try using QRCode library if available
    if (typeof QRCode !== 'undefined' && QRCode.toCanvas) {
        console.log('📦 Using QRCode.toCanvas')
        QRCode.toCanvas(qrData, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        }, (error, canvas) => {
            if (error) {
                console.error('QRCode.toCanvas error:', error)
                // Fallback to image API
                displayQRCodeFallback(qrData, qrContainer)
                return
            }
            qrContainer.appendChild(canvas)
            console.log('✅ QR Code displayed successfully')
        })
    } else {
        console.log('📦 QRCode library not found, using fallback')
        // Fallback to image API
        displayQRCodeFallback(qrData, qrContainer)
    }
    
    // Show modal
    if (qrModal) {
        console.log('🔲 Showing QR Modal')
        qrModal.show()
    } else {
        console.error('❌ QR Modal not initialized! Trying to initialize...')
        const qrModalEl = document.getElementById('qrModal')
        if (qrModalEl) {
            qrModal = new bootstrap.Modal(qrModalEl)
            qrModal.show()
        }
    }
}

// Fallback QR Code display
function displayQRCodeFallback(qrData, container) {
    console.log('Using fallback QR code display')
    const img = document.createElement('img')
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`
    img.alt = 'QR Code'
    img.className = 'img-fluid'
    img.style.maxWidth = '100%'
    img.style.height = 'auto'
    img.onerror = () => {
        console.error('Failed to load QR code image')
        container.innerHTML = '<div class="alert alert-danger">Failed to generate QR code. Please try again.</div>'
    }
    img.onload = () => {
        console.log('✅ QR Code displayed successfully (fallback)')
    }
    container.appendChild(img)
}

// Display Pairing Code
function displayPairingCode(code) {
    document.getElementById('pairing-code-display').textContent = code
    pairingModal.show()
}

// Render Sessions
function renderSessions() {
    if (allSessions.length === 0) {
        sessionsContainer.innerHTML = `
            <div class="col-12">
                <div class="text-center py-20">
                    <div class="mb-5">
                        <i class="bi bi-inbox fs-5x text-muted"></i>
                    </div>
                    <h3 class="text-muted">Belum ada session</h3>
                    <p class="text-gray-600">Buat session baru untuk mulai menggunakan WhatsApp API</p>
                </div>
            </div>
        `
        return
    }
    
    sessionsContainer.innerHTML = allSessions.map(session => {
        const isConnected = session.isConnected
        const statusClass = isConnected ? 'connected' : 'disconnected'
        const statusDot = isConnected ? 'status-dot-connected' : 'status-dot-disconnected'
        const statusText = isConnected ? 'Terhubung' : 'Terputus'
        const statusBadge = isConnected ? 'badge-success' : 'badge-danger'
        
        const userName = session.user?.name || session.user?.id?.split(':')[0] || 'Unknown'
        const phoneNumber = session.user?.id?.split(':')[0] || '-'
        const createdAt = new Date(session.createdAt).toLocaleString('id-ID')
        const connectionType = session.type === 'qr' ? '📱 QR Code' : '🔢 Pairing Code'
        
        return `
            <div class="col-md-6 col-xl-4">
                <div class="card session-card ${statusClass} h-100">
                    <div class="card-header border-0 pt-9">
                        <div class="card-title m-0">
                            <div class="symbol symbol-50px w-50px bg-light">
                                <i class="bi bi-whatsapp fs-2x text-success"></i>
                            </div>
                        </div>
                        <div class="card-toolbar">
                            <span class="badge ${statusBadge}">
                                <span class="${statusDot}"></span>${statusText}
                            </span>
                        </div>
                    </div>
                    
                    <div class="card-body p-9">
                        <div class="fs-3 fw-bold text-dark mb-5">${session.id}</div>
                        
                        <div class="mb-7">
                            <div class="session-info-item">
                                <span class="session-info-label">👤 Nama:</span>
                                <span class="session-info-value">${userName}</span>
                            </div>
                            <div class="session-info-item">
                                <span class="session-info-label">📞 Nomor:</span>
                                <span class="session-info-value">${phoneNumber}</span>
                            </div>
                            <div class="session-info-item">
                                <span class="session-info-label">🔗 Koneksi:</span>
                                <span class="session-info-value">${connectionType}</span>
                            </div>
                            <div class="session-info-item">
                                <span class="session-info-label">📅 Dibuat:</span>
                                <span class="session-info-value">${createdAt}</span>
                            </div>
                        </div>
                        
                        <div class="d-flex flex-stack">
                            ${isConnected ? `
                                <button class="btn btn-sm btn-danger" onclick="logoutSession('${session.id}')">
                                    <i class="bi bi-power"></i> Logout
                                </button>
                            ` : `
                                <button class="btn btn-sm btn-primary" onclick="reconnectSession('${session.id}', '${session.type}', '${session.phoneNumber || ''}')">
                                    <i class="bi bi-arrow-repeat"></i> Reconnect
                                </button>
                            `}
                            <button class="btn btn-sm btn-light-danger" onclick="deleteSession('${session.id}')">
                                <i class="bi bi-trash"></i> Delete
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `
    }).join('')
}

// Session Actions
window.logoutSession = function(sessionId) {
    Swal.fire({
        title: 'Logout Session?',
        text: `Session ${sessionId} akan dilogout`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Ya, Logout',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            socket.emit('logout', sessionId)
            Swal.fire('Logout!', 'Session berhasil dilogout', 'success')
        }
    })
}

window.deleteSession = function(sessionId) {
    Swal.fire({
        title: 'Hapus Session?',
        text: `Session ${sessionId} akan dihapus permanen`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Ya, Hapus',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#f1416c'
    }).then((result) => {
        if (result.isConfirmed) {
            socket.emit('delete-session', sessionId)
            Swal.fire('Terhapus!', 'Session berhasil dihapus', 'success')
        }
    })
}

window.reconnectSession = function(sessionId, type, phoneNumber) {
    if (type === 'pairing' && phoneNumber) {
        socket.emit('start-session-pairing', {
            sessionId: sessionId,
            phoneNumber: phoneNumber
        })
    } else {
        socket.emit('start-session-qr', sessionId)
    }
    
    Swal.fire({
        title: 'Reconnecting...',
        text: 'Menghubungkan kembali session',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading()
        }
    })
    
    setTimeout(() => {
        Swal.close()
    }, 2000)
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadComponents()
    initializeModals()
})

console.log('✅ Manage Sessions page initialized')
