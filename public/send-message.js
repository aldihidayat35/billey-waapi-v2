// Initialize Socket.IO
const socket = io()

// State
let currentSessionId = null
let allSessions = []
let currentMessageType = 'text-single'
let recipients = []
let isSending = false

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
    initializePage()
})

// DOM Elements
const sessionSelector = document.getElementById('session-selector')
const sessionUserName = document.getElementById('session-user-name')
const sessionUserNumber = document.getElementById('session-user-number')
const sendMessageBtn = document.getElementById('send-message-btn')
const statusAlert = document.getElementById('status-alert')

// Message Type Cards
const messageTypeCards = document.querySelectorAll('.message-type-card')

// Recipients Elements
const singleRecipientSection = document.getElementById('single-recipient-section')
const bulkRecipientSection = document.getElementById('bulk-recipient-section')
const singlePhoneInput = document.getElementById('single-phone')
const bulkPhoneInput = document.getElementById('bulk-phone-input')
const bulkPhonesTextarea = document.getElementById('bulk-phones-textarea')
const addPhoneBtn = document.getElementById('add-phone-btn')
const importPhonesBtn = document.getElementById('import-phones-btn')
const recipientsList = document.getElementById('recipients-list')
const recipientsCount = document.getElementById('recipients-count')
const clearRecipientsBtn = document.getElementById('clear-recipients-btn')

// Message Elements
const imageUploadSection = document.getElementById('image-upload-section')
const imageInput = document.getElementById('image-input')
const imagePreview = document.getElementById('image-preview')
const messageText = document.getElementById('message-text')
const captionLabel = document.getElementById('caption-label')
const delaySection = document.getElementById('delay-section')
const delayMin = document.getElementById('delay-min')
const delayMax = document.getElementById('delay-max')

// Progress Elements
const progressSection = document.getElementById('progress-section')
const progressBar = document.getElementById('progress-bar')
const progressText = document.getElementById('progress-text')
const progressLogs = document.getElementById('progress-logs')

// Initialize Page
function initializePage() {
    // Setup event listeners
    setupEventListeners()
    
    // Request sessions from server
    socket.emit('get-sessions')
}

// Setup Event Listeners
function setupEventListeners() {
    // Session selector
    sessionSelector.addEventListener('change', handleSessionChange)
    
    // Message type cards
    messageTypeCards.forEach(card => {
        card.addEventListener('click', function() {
            messageTypeCards.forEach(c => c.classList.remove('active'))
            this.classList.add('active')
            currentMessageType = this.dataset.type
            updateUIForMessageType()
        })
    })
    
    // Single phone input
    singlePhoneInput.addEventListener('input', validateSendButton)
    
    // Bulk recipients
    addPhoneBtn.addEventListener('click', addPhoneNumber)
    bulkPhoneInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault()
            addPhoneNumber()
        }
    })
    importPhonesBtn.addEventListener('click', importPhoneNumbers)
    clearRecipientsBtn.addEventListener('click', clearRecipients)
    
    // Image upload
    imageInput.addEventListener('change', handleImageUpload)
    
    // Message text
    messageText.addEventListener('input', validateSendButton)
    
    // Send button
    sendMessageBtn.addEventListener('click', handleSendMessage)
}

// Socket Event Handlers
socket.on('connect', () => {
    console.log('✅ Connected to server')
    socket.emit('get-sessions')
})

socket.on('all-sessions', (sessions) => {
    allSessions = sessions.filter(s => s.isConnected)
    updateSessionSelector()
})

socket.on('session-status', (data) => {
    const sessionIndex = allSessions.findIndex(s => s.id === data.sessionId)
    if (data.isConnected) {
        if (sessionIndex === -1) {
            allSessions.push({
                id: data.sessionId,
                isConnected: true,
                user: data.user
            })
        } else {
            allSessions[sessionIndex] = {
                id: data.sessionId,
                isConnected: true,
                user: data.user
            }
        }
    } else {
        if (sessionIndex !== -1) {
            allSessions.splice(sessionIndex, 1)
        }
    }
    updateSessionSelector()
})

socket.on('message-sent', (data) => {
    console.log('📨 Message sent event received:', data)
    addProgressLog(`✅ Message sent to ${data.to}`, 'success')
    updateProgress()
    
    // Auto-log to database
    if (data.messageContent) {
        logActivity('message', 'Pesan Text Terkirim', `Pesan terkirim ke ${data.to}`, {
            sessionId: data.sessionId,
            recipient: data.to,
            messageType: 'text',
            messageContent: data.messageContent,
            timestamp: new Date().toISOString()
        })
    }
})

socket.on('image-sent', (data) => {
    console.log('📸 Image sent event received:', data)
    addProgressLog(`✅ Image sent to ${data.to}`, 'success')
    updateProgress()
    
    // Auto-log to database
    logActivity('message', 'Gambar Terkirim', `Gambar terkirim ke ${data.to}`, {
        sessionId: data.sessionId,
        recipient: data.to,
        messageType: 'image',
        caption: data.caption || '',
        filename: data.filename || '',
        timestamp: new Date().toISOString()
    })
})

socket.on('media-sent', (data) => {
    console.log('🖼️ Media sent event received:', data)
    addProgressLog(`✅ Media sent to ${data.to}`, 'success')
    updateProgress()
})

socket.on('error', (error) => {
    console.error('❌ Socket error:', error)
    addProgressLog(`❌ Error: ${error}`, 'error')
    showStatus(`Error: ${error}`, 'danger')
    
    // Auto-log error to database
    logActivity('error', 'Error Pengiriman Pesan', `Error: ${error}`, {
        sessionId: currentSessionId,
        errorMessage: error,
        timestamp: new Date().toISOString()
    })
})

socket.on('send-error', (data) => {
    console.error('❌ Send error:', data)
    addProgressLog(`❌ Failed to send to ${data.phone}: ${data.error}`, 'error')
    showStatus(`Send failed: ${data.error}`, 'danger')
    
    // Auto-log error to database
    logActivity('error', 'Gagal Mengirim Pesan', `Gagal mengirim ke ${data.phone}: ${data.error}`, {
        sessionId: currentSessionId,
        recipient: data.phone,
        errorMessage: data.error,
        timestamp: new Date().toISOString()
    })
})

// Update Session Selector
function updateSessionSelector() {
    if (allSessions.length === 0) {
        sessionSelector.innerHTML = '<option value="">No connected sessions available</option>'
        sessionSelector.disabled = true
        sendMessageBtn.disabled = true
        return
    }
    
    sessionSelector.innerHTML = '<option value="">Select a session...</option>' + 
        allSessions.map(s => 
            `<option value="${s.id}">${s.id} - ${s.user?.name || s.user?.id.split(':')[0] || 'Unknown'}</option>`
        ).join('')
    sessionSelector.disabled = false
    
    // Auto-select if only one session
    if (allSessions.length === 1) {
        sessionSelector.value = allSessions[0].id
        handleSessionChange()
    }
}

// Handle Session Change
function handleSessionChange() {
    currentSessionId = sessionSelector.value
    
    if (currentSessionId) {
        const session = allSessions.find(s => s.id === currentSessionId)
        if (session && session.user) {
            sessionUserName.textContent = session.user.name || session.user.verifiedName || 'User'
            sessionUserNumber.textContent = session.user.id.split(':')[0] || currentSessionId
        }
    } else {
        sessionUserName.textContent = '-'
        sessionUserNumber.textContent = 'Select a session'
    }
    
    validateSendButton()
}

// Update UI for Message Type
function updateUIForMessageType() {
    const isBulk = currentMessageType.includes('bulk')
    const isImage = currentMessageType.includes('image')
    
    // Show/hide recipient sections
    singleRecipientSection.style.display = isBulk ? 'none' : 'block'
    bulkRecipientSection.style.display = isBulk ? 'block' : 'none'
    
    // Show/hide image section
    imageUploadSection.style.display = isImage ? 'block' : 'none'
    captionLabel.style.display = isImage ? 'inline' : 'none'
    
    // Show/hide delay section
    delaySection.style.display = isBulk ? 'block' : 'none'
    
    // Clear recipients when switching
    if (!isBulk) {
        recipients = []
    }
    
    validateSendButton()
}

// Add Phone Number
function addPhoneNumber() {
    const phone = bulkPhoneInput.value.trim()
    
    if (!phone) {
        showStatus('Please enter a phone number', 'warning')
        return
    }
    
    if (!/^[0-9]+$/.test(phone)) {
        showStatus('Phone number should only contain numbers', 'warning')
        return
    }
    
    if (recipients.includes(phone)) {
        showStatus('Phone number already added', 'warning')
        return
    }
    
    recipients.push(phone)
    bulkPhoneInput.value = ''
    updateRecipientsList()
    validateSendButton()
}

// Import Phone Numbers
function importPhoneNumbers() {
    const phones = bulkPhonesTextarea.value
        .split('\n')
        .map(p => p.trim())
        .filter(p => p && /^[0-9]+$/.test(p))
    
    if (phones.length === 0) {
        showStatus('No valid phone numbers found', 'warning')
        return
    }
    
    phones.forEach(phone => {
        if (!recipients.includes(phone)) {
            recipients.push(phone)
        }
    })
    
    bulkPhonesTextarea.value = ''
    updateRecipientsList()
    validateSendButton()
    showStatus(`${phones.length} phone numbers imported`, 'success')
}

// Update Recipients List
function updateRecipientsList() {
    recipientsCount.textContent = recipients.length
    
    if (recipients.length === 0) {
        recipientsList.innerHTML = '<span class="text-muted fs-7">No recipients added yet</span>'
        return
    }
    
    recipientsList.innerHTML = recipients.map((phone, index) => 
        `<span class="contact-chip">
            ${phone}
            <span class="remove-chip" onclick="removeRecipient(${index})">×</span>
        </span>`
    ).join('')
}

// Remove Recipient
function removeRecipient(index) {
    recipients.splice(index, 1)
    updateRecipientsList()
    validateSendButton()
}

// Clear Recipients
function clearRecipients() {
    if (confirm('Clear all recipients?')) {
        recipients = []
        updateRecipientsList()
        validateSendButton()
    }
}

// Handle Image Upload
function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) {
        imagePreview.style.display = 'none'
        return
    }
    
    if (!file.type.startsWith('image/')) {
        showStatus('Please select a valid image file', 'warning')
        imageInput.value = ''
        return
    }
    
    // Show preview
    const reader = new FileReader()
    reader.onload = function(e) {
        imagePreview.src = e.target.result
        imagePreview.style.display = 'block'
    }
    reader.readAsDataURL(file)
    
    validateSendButton()
}

// Validate Send Button
function validateSendButton() {
    let isValid = true
    
    // Check session
    if (!currentSessionId) {
        isValid = false
    }
    
    // Check recipients
    if (currentMessageType.includes('single')) {
        if (!singlePhoneInput.value.trim()) {
            isValid = false
        }
    } else {
        if (recipients.length === 0) {
            isValid = false
        }
    }
    
    // Check message content
    const hasText = messageText.value.trim().length > 0
    const hasImage = currentMessageType.includes('image') && imageInput.files.length > 0
    
    if (!hasText && !hasImage) {
        isValid = false
    }
    
    sendMessageBtn.disabled = !isValid || isSending
}

// Handle Send Message
async function handleSendMessage() {
    if (isSending) return
    
    isSending = true
    sendMessageBtn.disabled = true
    statusAlert.style.display = 'none'
    
    const isBulk = currentMessageType.includes('bulk')
    const isImage = currentMessageType.includes('image')
    
    if (isBulk) {
        await sendBulkMessages(isImage)
    } else {
        await sendSingleMessage(isImage)
    }
}

// Send Single Message
async function sendSingleMessage(isImage) {
    const phone = singlePhoneInput.value.trim()
    const text = messageText.value.trim()
    
    console.log('📤 Sending single message:', { isImage, phone, hasText: !!text, hasImage: !!imageInput.files[0] })
    
    try {
        if (isImage && imageInput.files[0]) {
            console.log('📸 Sending image message...')
            await sendImageMessage(phone, text)
            console.log('✅ Image message sent successfully')
        } else {
            console.log('📝 Sending text message...')
            socket.emit('send-message', {
                sessionId: currentSessionId,
                phone: phone,
                message: text,
                messageContent: text // Pass message content for logging
            })
            console.log('✅ Text message emitted')
        }
        
        showStatus('Message sent successfully!', 'success')
        
        // Clear form
        messageText.value = ''
        singlePhoneInput.value = ''
        if (isImage) {
            imageInput.value = ''
            imagePreview.style.display = 'none'
        }
        
        } catch (error) {
        console.error('❌ Error sending message:', error)
        showStatus(`Error: ${error.message}`, 'danger')
    } finally {
        isSending = false
        validateSendButton()
    }
}

// Send Bulk Messages
async function sendBulkMessages(isImage) {
    const text = messageText.value.trim()
    const minDelay = parseInt(delayMin.value) * 1000
    const maxDelay = parseInt(delayMax.value) * 1000
    
    progressSection.style.display = 'block'
    progressLogs.innerHTML = ''
    
    let sent = 0
    let failed = 0
    
    for (let i = 0; i < recipients.length; i++) {
        const phone = recipients[i]
        
        try {
            // Personalize message (replace {name} with phone number or name if available)
            const personalizedText = text.replace('{name}', phone)
            
            console.log(`📤 Sending bulk message ${i + 1}/${recipients.length} to ${phone}`)
            
            if (isImage && imageInput.files[0]) {
                console.log('📸 Sending image...')
                await sendImageMessage(phone, personalizedText)
                console.log('✅ Image sent')
            } else {
                console.log('📝 Sending text...')
                socket.emit('send-message', {
                    sessionId: currentSessionId,
                    phone: phone,
                    message: personalizedText,
                    messageContent: personalizedText // Pass for logging
                })
                console.log('✅ Text emitted')
            }
            
            sent++
            addProgressLog(`✅ Message sent to ${phone}`, 'success')
            
        } catch (error) {
            failed++
            addProgressLog(`❌ Failed to send to ${phone}: ${error.message}`, 'error')
        }
        
        // Update progress
        const progress = ((i + 1) / recipients.length) * 100
        progressBar.style.width = `${progress}%`
        progressText.textContent = `${i + 1} / ${recipients.length}`
        
        // Delay before next message (except for last one)
        if (i < recipients.length - 1) {
            const delay = Math.random() * (maxDelay - minDelay) + minDelay
            await sleep(delay)
        }
    }
    
    // Show final status
    showStatus(`Bulk send completed! Sent: ${sent}, Failed: ${failed}`, sent === recipients.length ? 'success' : 'warning')
    
    isSending = false
    validateSendButton()
}

// Send Image Message
async function sendImageMessage(phone, caption) {
    return new Promise((resolve, reject) => {
        const file = imageInput.files[0]
        
        if (!file) {
            reject(new Error('No image file selected'))
            return
        }
        
        console.log('📸 Preparing to send image:', file.name, 'Size:', file.size, 'Type:', file.type)
        
        const reader = new FileReader()
        
        reader.onload = function(e) {
            try {
                const imageData = e.target.result
                
                // Remove data URL prefix to get base64 only
                const base64Data = imageData.split(',')[1]
                
                console.log('📦 Image data prepared, size:', base64Data.length, 'bytes')
                console.log('🚀 Emitting send-image event...')
                
                // Emit with base64 data (without data URL prefix)
                socket.emit('send-image', {
                    sessionId: currentSessionId,
                    phone: phone,
                    image: base64Data,
                    caption: caption || '',
                    mimetype: file.type,
                    filename: file.name
                })
                
                console.log('✅ Image send event emitted')
                
                // Wait a bit for socket to process
                setTimeout(() => resolve(), 500)
                
            } catch (error) {
                console.error('❌ Error processing image:', error)
                reject(error)
            }
        }
        
        reader.onerror = function(error) {
            console.error('❌ Error reading image file:', error)
            reject(new Error('Failed to read image file: ' + error.message))
        }
        
        // Read as data URL (base64)
        reader.readAsDataURL(file)
    })
}

// Add Progress Log
function addProgressLog(message, type) {
    const logItem = document.createElement('div')
    logItem.className = `alert alert-${type === 'success' ? 'success' : 'danger'} p-2 mb-1`
    logItem.innerHTML = `<small>${message}</small>`
    progressLogs.insertBefore(logItem, progressLogs.firstChild)
}

// Update Progress
function updateProgress() {
    // This will be called by socket events
}

// Show Status Alert
function showStatus(message, type) {
    statusAlert.textContent = message
    statusAlert.className = `alert alert-${type}`
    statusAlert.style.display = 'block'
    
    setTimeout(() => {
        statusAlert.style.display = 'none'
    }, 5000)
}

// Sleep utility
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

// Log Activity (removed database functionality)
async function logActivity(type, title, description, metadata = {}) {
    console.log('📝 Activity:', title, '-', description)
    // Database logging removed
}

// Make removeRecipient available globally
window.removeRecipient = removeRecipient

console.log('✅ Send Message page initialized')
