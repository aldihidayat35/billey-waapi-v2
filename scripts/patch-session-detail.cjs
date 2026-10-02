const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'public', 'admin', 'session-detail.js');
let content = fs.readFileSync(file, 'utf8');

// Fix logoutSession
content = content.replace("socket.emit('logout-session', sessionId)", "socket.emit('logout', sessionId)");

// Fix deleteSession URL
content = content.replace("window.location.href = 'manage-sessions.html'", "window.location.href = 'manage-sessions.html'"); // already correct

// Append socket events for QR and Pairing and standard messages
const appendCode = `

// Modal instances
let qrModalInst = null;
let pairingModalInst = null;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize modals if they exist in DOM
    const qEl = document.getElementById('qrModal');
    if(qEl) qrModalInst = new bootstrap.Modal(qEl, { backdrop: 'static', keyboard: false });
    
    const pEl = document.getElementById('pairingModal');
    if(pEl) pairingModalInst = new bootstrap.Modal(pEl, { backdrop: 'static', keyboard: false });
});

// Socket responses
socket.on('message', (msg) => {
    Swal.fire({
        icon: 'success',
        title: 'Berhasil',
        text: msg,
        timer: 3000,
        showConfirmButton: false
    });
});

socket.on('error', (err) => {
    Swal.fire({
        icon: 'error',
        title: 'Gagal',
        text: err
    });
});

socket.on('qr-code', (data) => {
    if (data.sessionId !== currentSessionId) return;
    
    Swal.close();
    if(pairingModalInst) pairingModalInst.hide();
    
    const container = document.getElementById('qr-code-container');
    if(container) {
        container.innerHTML = '';
        new QRCode(container, {
            text: data.qr,
            width: 256,
            height: 256,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
        if(qrModalInst) qrModalInst.show();
    }
});

socket.on('pairing-code', (data) => {
    if (data.sessionId !== currentSessionId) return;
    
    Swal.close();
    if(qrModalInst) qrModalInst.hide();
    
    const display = document.getElementById('pairing-code-display');
    if(display) {
        display.textContent = data.code;
        if(pairingModalInst) pairingModalInst.show();
    }
});

socket.on('session-connected', (data) => {
    if (data.sessionId !== currentSessionId) return;
    
    if(qrModalInst) qrModalInst.hide();
    if(pairingModalInst) pairingModalInst.hide();
    
    Swal.fire({
        icon: 'success',
        title: 'Terhubung!',
        text: \`Session \${data.sessionId} berhasil terhubung.\`,
        timer: 2000,
        showConfirmButton: false
    });
    
    socket.emit('get-sessions');
});
`;

if (!content.includes("socket.on('qr-code'")) {
    fs.writeFileSync(file, content + appendCode);
    console.log('Patched session-detail.js successfully');
} else {
    console.log('Already patched');
}
