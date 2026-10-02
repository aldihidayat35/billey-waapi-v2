// Initialize Socket.IO
const socket = io()

let currentSessionId = new URLSearchParams(window.location.search).get('id')
let allSessions = []

// Helper function to load HTML and execute scripts
function loadHTMLWithScripts(containerId, html) {
    const container = document.getElementById(containerId)
    if (!container) return
    
    const temp = document.createElement('div')
    temp.innerHTML = html
    
    const scripts = temp.querySelectorAll('script')
    scripts.forEach(script => script.remove())
    container.innerHTML = temp.innerHTML
    
    scripts.forEach(oldScript => {
        const newScript = document.createElement('script')
        if (oldScript.src) {
            newScript.src = oldScript.src
        } else {
            newScript.textContent = oldScript.textContent
        }
        document.body.appendChild(newScript)
    })
}

// Load components
async function loadComponents() {
    try {
        const headerResponse = await fetch('components/header.html')
        const headerHTML = await headerResponse.text()
        loadHTMLWithScripts('header-container', headerHTML)
        
        const sidebarResponse = await fetch('components/sidebar.html')
        const sidebarHTML = await sidebarResponse.text()
        loadHTMLWithScripts('sidebar-container', sidebarHTML)
        
        const footerResponse = await fetch('components/footer.html')
        const footerHTML = await footerResponse.text()
        loadHTMLWithScripts('footer-container', footerHTML)
        
        console.log('✅ Components loaded')
        
        initializeComponents()
        
        if (typeof initializeHeader === 'function') {
            initializeHeader()
        }
    } catch (error) {
        console.error('❌ Error loading components:', error)
    }
}

function initializeComponents() {
    if (typeof KTMenu !== 'undefined') KTMenu.createInstances()
    if (typeof KTDrawer !== 'undefined') KTDrawer.createInstances()
    if (typeof KTScroll !== 'undefined') KTScroll.createInstances()
}

document.addEventListener('DOMContentLoaded', () => {
    if (!currentSessionId) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Session ID tidak ditemukan di URL'
        }).then(() => {
            window.location.href = 'manage-sessions.html'
        })
        return
    }

    document.getElementById('pageSessionId').textContent = currentSessionId

    loadComponents()

    // Toggle API key show/hide
    const btnToggleApiKey = document.getElementById('btnToggleApiKey')
    if (btnToggleApiKey) {
        btnToggleApiKey.addEventListener('click', function () {
            const input = document.getElementById('det-api-key')
            const icon  = document.getElementById('iconApiKey')
            if (input.type === 'password') {
                input.type = 'text'
                icon.className = 'bi bi-eye-slash fs-6'
            } else {
                input.type = 'password'
                icon.className = 'bi bi-eye fs-6'
            }
        })
    }

    // Initial fetch of API key and endpoints
    const baseUrl = window.location.origin
    document.getElementById('det-base-url').value  = baseUrl
    document.getElementById('det-endpoint').value   = `${baseUrl}/api/wa/send`

    const keyInput = document.getElementById('det-api-key')
    keyInput.value = 'Memuat...'
    keyInput.type  = 'password'
    document.getElementById('iconApiKey').className = 'bi bi-eye fs-6'

    fetch('/api/auth/me')
        .then(r => r.json())
        .then(data => {
            const token = data.user?.token || '(token tidak tersedia)'
            keyInput.value = token
            document.getElementById('det-curl-example').textContent = buildCurlExample(baseUrl, token, currentSessionId)
        })
        .catch(() => {
            keyInput.value = '(gagal mengambil token)'
            document.getElementById('det-curl-example').textContent = buildCurlExample(baseUrl, '<YOUR_API_KEY>', currentSessionId)
        })

    // Actions
    document.getElementById('detailBtnLogout').onclick    = () => { logoutSession(currentSessionId) }
    document.getElementById('detailBtnReconnect').onclick = () => { 
        const session = allSessions.find(s => s.id === currentSessionId)
        if(session) reconnectSession(currentSessionId, session.type, session.phoneNumber || '') 
    }
    document.getElementById('detailBtnDelete').onclick    = () => { deleteSession(currentSessionId) }

    // Start fetching sessions
    socket.emit('get-sessions')
})

socket.on('sessions', (sessions) => {
    allSessions = sessions
    renderSessionDetail()
})

socket.on('session-status', (data) => {
    if (data.sessionId === currentSessionId) {
        // Automatically fetch latest list
        socket.emit('get-sessions')
    }
})

function renderSessionDetail() {
    const session = allSessions.find(s => s.id === currentSessionId)
    if (!session) return

    const isConnected  = session.isConnected
    const userName     = session.user?.name || session.user?.id?.split(':')[0] || 'Unknown'
    const phoneNumber  = session.user?.id?.split(':')[0] || '-'
    const jid          = session.user?.id || '-'
    const typeLabel    = session.type === 'qr' ? '📱 QR Code' : '🔢 Pairing Code'
    const createdAt    = session.createdAt ? new Date(session.createdAt).toLocaleString('id-ID') : '-'
    const lastOn       = session.lastConnected
        ? new Date(session.lastConnected).toLocaleString('id-ID')
        : (isConnected ? 'Saat ini' : '-')

    // — Identity
    document.getElementById('det-session-id').textContent  = session.id
    document.getElementById('det-name').textContent         = userName
    document.getElementById('det-phone').textContent        = phoneNumber
    document.getElementById('det-jid').textContent          = jid

    // — Connection info
    document.getElementById('det-type').textContent           = typeLabel
    document.getElementById('det-created').textContent        = createdAt
    document.getElementById('det-last-connected').textContent = lastOn
    document.getElementById('det-paired-phone').textContent   = session.phoneNumber || '-'

    // — Status banner
    const dot  = document.getElementById('detailStatusDot')
    const desc = document.getElementById('detailStatusDesc')
    if (isConnected) {
        dot.className   = 'badge badge-light-success fs-7 px-4 py-2'
        dot.innerHTML   = '<span class="status-dot-connected me-2"></span>Terhubung'
        desc.textContent = `Session aktif dan siap menerima / mengirim pesan`
    } else {
        dot.className   = 'badge badge-light-danger fs-7 px-4 py-2'
        dot.innerHTML   = '<span class="status-dot-disconnected me-2"></span>Terputus'
        desc.textContent = 'Session tidak aktif. Lakukan Reconnect untuk menggunakannya kembali.'
    }

    // — Header
    document.getElementById('detailModalTitle').textContent    = `Detail — ${session.id}`
    document.getElementById('detailModalSubtitle').textContent = isConnected
        ? `✅ Aktif · ${userName}`
        : `❌ Offline · ${session.id}`
    document.getElementById('detailModalHeader').style.background = isConnected
        ? 'linear-gradient(135deg,#50cd89 0%,#1bc5bd 100%)'
        : 'linear-gradient(135deg,#f1416c 0%,#d9214e 100%)'

    // — Raw JSON
    document.getElementById('det-raw-json').textContent = JSON.stringify(session, null, 2)

    // — Buttons
    document.getElementById('detailBtnLogout').classList.toggle('d-none', !isConnected)
    document.getElementById('detailBtnReconnect').classList.toggle('d-none', isConnected)
}

function buildCurlExample(baseUrl, token, sessionId) {
    return `curl -X POST ${baseUrl}/api/wa/send \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: ${token}" \\
  -d '{
    "to": "628123456789",
    "message": "Halo dari Billey WA API!",
    "session_id": "${sessionId}"
  }'`
}

window.copyDetailField = function (id, label) {
    const el   = document.getElementById(id)
    const text = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
        ? el.value
        : el.textContent

    const doToast = () => Swal.fire({
        icon: 'success',
        title: `${label} disalin!`,
        timer: 1400,
        showConfirmButton: false,
        toast: true,
        position: 'top-end',
        customClass: { popup: 'p-3' }
    })

    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(doToast)
    } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        doToast()
    }
}

// Implement action functions (logoutSession, deleteSession, reconnectSession)
function logoutSession(sessionId) {
    Swal.fire({
        title: 'Logout Session?',
        text: "Anda harus melakukan scan ulang untuk terhubung kembali",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f1416c',
        cancelButtonColor: '#b5b5c3',
        confirmButtonText: 'Ya, Logout',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            Swal.fire({
                title: 'Melogout session...',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading() }
            })
            socket.emit('logout-session', sessionId)
            setTimeout(() => { socket.emit('get-sessions') }, 1500)
        }
    })
}

function deleteSession(sessionId) {
    Swal.fire({
        title: 'Hapus Session?',
        text: "Semua data terkait session ini akan dihapus permanen",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f1416c',
        cancelButtonColor: '#b5b5c3',
        confirmButtonText: 'Ya, Hapus',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            Swal.fire({
                title: 'Menghapus session...',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading() }
            })
            socket.emit('delete-session', sessionId)
            setTimeout(() => { 
                Swal.fire('Terhapus!', 'Session berhasil dihapus.', 'success').then(() => {
                    window.location.href = 'manage-sessions.html'
                })
            }, 1500)
        }
    })
}

function reconnectSession(sessionId, type, phoneNumber) {
    if (type === 'pairing' && phoneNumber) {
        socket.emit('start-session-pairing', {
            sessionId: sessionId,
            phoneNumber: phoneNumber
        })
    } else {
        socket.emit('start-session-qr', sessionId)
    }
    
    Swal.fire({
        title: 'Menghubungkan kembali...',
        text: 'Menghubungkan kembali session',
        allowOutsideClick: false,
        timer: 2000,
        didOpen: () => { Swal.showLoading() }
    })
    
    setTimeout(() => { socket.emit('get-sessions') }, 2000)
}
