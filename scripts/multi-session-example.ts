/**
 * Multi-Session WhatsApp Example
 * 
 * Contoh penggunaan multi-session via API
 */

import { io, Socket } from 'socket.io-client'

const SERVER_URL = 'http://localhost:3000'

// Connect to server
const socket: Socket = io(SERVER_URL)

socket.on('connect', () => {
    console.log('✅ Connected to server')
    
    // Buat beberapa session
    createMultipleSessions()
})

function createMultipleSessions() {
    const sessions = ['session1', 'session2', 'session3']
    
    sessions.forEach((sessionId, index) => {
        setTimeout(() => {
            console.log(`📝 Creating session: ${sessionId}`)
            socket.emit('create-session', sessionId)
        }, index * 1000) // Delay 1 detik antara setiap session
    })
}

// Listen for session updates
socket.on('all-sessions', (sessions) => {
    console.log('📋 All sessions:', sessions.map(s => ({
        id: s.id,
        isConnected: s.isConnected,
        user: s.user?.name || 'Not connected'
    })))
})

socket.on('session-status', (data) => {
    console.log(`📊 Session ${data.sessionId} status: ${data.status}`)
    
    if (data.isConnected) {
        console.log(`✅ Session ${data.sessionId} connected as:`, data.user?.name || data.user?.id)
    }
})

socket.on('qr', (data) => {
    console.log(`📱 QR Code received for session: ${data.sessionId}`)
    console.log('Scan this QR code with WhatsApp')
    // QR code akan ditampilkan di terminal jika printQRInTerminal: true
})

socket.on('pairing-code', (data) => {
    console.log(`🔑 Pairing code for session ${data.sessionId}: ${data.code}`)
})

socket.on('message-sent', (data) => {
    console.log(`✉️ Message sent from session ${data.sessionId} to ${data.to}`)
})

socket.on('message-received', (data) => {
    console.log(`📥 Message received in session ${data.sessionId} from ${data.from}`)
})

socket.on('message', (msg) => {
    console.log('ℹ️', msg)
})

socket.on('error', (error) => {
    console.error('❌ Error:', error)
})

// Example: Connect session dengan QR
setTimeout(() => {
    console.log('🔌 Starting session1 with QR code...')
    socket.emit('start-session-qr', 'session1')
}, 5000)

// Example: Connect session dengan pairing code
// setTimeout(() => {
//     console.log('🔌 Starting session2 with pairing code...')
//     socket.emit('start-session-pairing', {
//         sessionId: 'session2',
//         phoneNumber: '628123456789' // Ganti dengan nomor Anda
//     })
// }, 7000)

// Example: Kirim pesan setelah connected
socket.on('session-status', (data) => {
    if (data.isConnected && data.sessionId === 'session1') {
        // Tunggu 5 detik setelah connected, lalu kirim pesan
        setTimeout(() => {
            console.log('📤 Sending test message...')
            socket.emit('send-message', {
                sessionId: 'session1',
                phone: '628123456789', // Ganti dengan nomor tujuan
                message: 'Hello from multi-session! This is from session1 🚀'
            })
        }, 5000)
    }
})

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Disconnecting...')
    socket.disconnect()
    process.exit(0)
})

console.log('🚀 Multi-session example started')
console.log('📝 Creating sessions...')
console.log('⏳ Waiting for connection...')
