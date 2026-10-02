const fs = require('fs')

let html = fs.readFileSync('public/admin/session-detail.html', 'utf8')

// Replace manage-sessions.js with session-detail.js
html = html.replace(/manage-sessions\.js/g, 'session-detail.js')

// Extract the modal content and place it in the container
const modalStart = '<div class="modal-header border-0 py-5 px-7"'
const modalEnd = '<!-- /Body -->'

const startIdx = html.indexOf(modalStart)
const endIdx = html.indexOf(modalEnd) + modalEnd.length

if (startIdx !== -1 && endIdx !== -1) {
    let detailContent = html.substring(startIdx, endIdx)
    
    // Replace the page title
    html = html.replace('Kelola Sessions', 'Detail Session')
    html = html.replace('<h1 class="page-heading d-flex text-dark fw-bold fs-3 flex-column justify-content-center my-0">Kelola Sessions</h1>', 
                        '<h1 class="page-heading d-flex text-dark fw-bold fs-3 flex-column justify-content-center my-0">Detail Session <span id="pageSessionId" class="text-muted fs-7 mt-1"></span></h1>')
    
    // Replace the main content container contents with the detailContent
    const containerStart = '<div id="kt_app_content_container" class="app-container container-xxl">'
    const containerStartIdx = html.indexOf(containerStart)
    
    if (containerStartIdx !== -1) {
        // Find where the container ends or the next script block
        const scriptStart = '<!-- ══ SESSION TREND CHART SCRIPT ══════════════════════ -->'
        const scriptStartIdx = html.indexOf(scriptStart)
        
        const beforeContainer = html.substring(0, containerStartIdx + containerStart.length)
        const afterContainer = html.substring(scriptStartIdx)
        
        html = beforeContainer + '\n<div class="card shadow-sm"><div class="card-body">\n' + detailContent + '\n</div></div>\n' + afterContainer
    }
    
    // Remove the modal code from the bottom
    const modalSectionStart = '<!-- ============================================================'
    const modalSectionEnd = '<!-- /Session Detail Modal -->'
    const mStartIdx = html.indexOf(modalSectionStart)
    const mEndIdx = html.indexOf(modalSectionEnd) + modalSectionEnd.length
    
    if (mStartIdx !== -1 && mEndIdx !== -1) {
        html = html.substring(0, mStartIdx) + html.substring(mEndIdx)
    }
}

fs.writeFileSync('public/admin/session-detail.html', html)
console.log('session-detail.html created successfully.')
