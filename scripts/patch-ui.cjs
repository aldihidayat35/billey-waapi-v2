const fs = require('fs');
const path = require('path');

const manageSessionsHtml = path.join(process.cwd(), 'public', 'admin', 'manage-sessions.html');
const sessionDetailHtml = path.join(process.cwd(), 'public', 'admin', 'session-detail.html');

// 1. Remove Session Detail Modal from manage-sessions.html
let msHtml = fs.readFileSync(manageSessionsHtml, 'utf8');
const startTag = '<!-- Session Detail Modal — Metronic 8                            -->';
const endTag = '<!-- /Session Detail Modal -->';

const startIndex = msHtml.indexOf(startTag);
const endIndex = msHtml.indexOf(endTag);

if (startIndex !== -1 && endIndex !== -1) {
    const toRemove = msHtml.substring(startIndex, endIndex + endTag.length);
    msHtml = msHtml.replace(toRemove, '');
    fs.writeFileSync(manageSessionsHtml, msHtml);
    console.log('Removed Session Detail Modal from manage-sessions.html');
}

// 2. Extract QR Code and Pairing Modal from manage-sessions.html
const qrStart = '<!-- QR Code Modal -->';
const qrEnd = '<!-- Pairing Code Modal -->';
const pairingEnd = '<!-- Metronic 8 Global Javascript Bundle -->';

const qrStartIndex = msHtml.indexOf(qrStart);
const pairingEndIndex = msHtml.indexOf(pairingEnd);

if (qrStartIndex !== -1 && pairingEndIndex !== -1) {
    const modalsCode = msHtml.substring(qrStartIndex, pairingEndIndex).trim();
    
    // 3. Inject modalsCode and qrcode.min.js into session-detail.html
    let sdHtml = fs.readFileSync(sessionDetailHtml, 'utf8');
    if (!sdHtml.includes('<!-- QR Code Modal -->')) {
        const injectPoint = '<!-- Scripts -->';
        const qrcodeScript = '<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>\n    ';
        sdHtml = sdHtml.replace(injectPoint, modalsCode + '\n\n    ' + injectPoint + '\n    ' + qrcodeScript);
        fs.writeFileSync(sessionDetailHtml, sdHtml);
        console.log('Injected Modals into session-detail.html');
    }
}
