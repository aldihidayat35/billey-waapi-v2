/**
 * WhatsApp Gateway - Frontend JavaScript
 * Login & Home User Application
 */

// Socket.IO connection
let socket = null;

// Global state
const FrontendState = {
    currentStep: 1,
    sessionId: null,
    userName: null,
    phoneNumber: null,
    isConnected: false,
    groupsData: [],
    exportData: null
};

// Initialize Socket
function initSocket() {
    if (!socket) {
        socket = io();
        
        socket.on('connect', () => {
            console.log('Socket connected');
        });
        
        socket.on('disconnect', () => {
            console.log('Socket disconnected');
        });
        
        // QR Code received
        socket.on('qr', (data) => {
            console.log('QR received for:', data.sessionId);
            if (data.sessionId === FrontendState.sessionId) {
                displayQRCode(data.qr);
            }
        });
        
        // Session status update (this is what server actually sends)
        socket.on('session-status', (data) => {
            console.log('Session status:', data);
            if (data.sessionId === FrontendState.sessionId) {
                if (data.status === 'connected' && data.isConnected) {
                    handleConnectionSuccess(data);
                } else if (data.status === 'disconnected') {
                    showNotification('Koneksi terputus', 'error');
                } else if (data.status === 'reconnecting') {
                    showNotification('Mencoba menghubungkan ulang...', 'warning');
                }
            }
        });
        
        // Legacy support - connection-open (if any code still uses it)
        socket.on('connection-open', (data) => {
            console.log('Connection open:', data);
            if (data.sessionId === FrontendState.sessionId) {
                handleConnectionSuccess(data);
            }
        });
        
        // Connection closed
        socket.on('connection-close', (data) => {
            if (data.sessionId === FrontendState.sessionId) {
                showNotification('Koneksi terputus', 'error');
            }
        });
    }
}

/**
 * LOGIN PAGE FUNCTIONS
 */

// Initialize login page
function initLoginPage() {
    initSocket();
    updateLoginSteps(1);
    loadExistingSessions();
}

// Load existing sessions for select
async function loadExistingSessions() {
    try {
        const response = await fetch('/api/sessions');
        const data = await response.json();
        
        const select = document.getElementById('session-select');
        if (select && data.sessions) {
            // Keep placeholder and "new" option
            const existingOptions = select.querySelectorAll('option[data-session]');
            existingOptions.forEach(opt => opt.remove());
            
            data.sessions.forEach(session => {
                const option = document.createElement('option');
                option.value = session.id;
                option.textContent = `${session.id} ${session.status === 'connected' ? '(Terhubung)' : ''}`;
                option.dataset.session = 'true';
                select.insertBefore(option, select.lastElementChild);
            });
        }
    } catch (error) {
        console.error('Error loading sessions:', error);
    }
}

// Update login steps indicator
function updateLoginSteps(step) {
    FrontendState.currentStep = step;
    
    const steps = document.querySelectorAll('.login-step');
    steps.forEach((stepEl, index) => {
        stepEl.classList.remove('active', 'completed');
        
        if (index + 1 < step) {
            stepEl.classList.add('completed');
        } else if (index + 1 === step) {
            stepEl.classList.add('active');
        }
    });
    
    // Show/hide form sections
    document.querySelectorAll('.form-section').forEach(section => {
        section.classList.remove('active');
    });
    
    const activeSection = document.getElementById(`step-${step}-section`);
    if (activeSection) {
        activeSection.classList.add('active');
    }
    
    // Toggle QR area and features visibility
    const qrArea = document.getElementById('qr-area');
    const featuresArea = document.getElementById('features-area');
    
    if (qrArea && featuresArea) {
        if (step === 2) {
            // Show QR, hide features
            qrArea.style.display = 'flex';
            featuresArea.style.display = 'none';
        } else {
            // Hide QR, show features
            qrArea.style.display = 'none';
            featuresArea.style.display = 'block';
        }
    }
}

// Handle form submission - Step 1 (User Info)
function submitUserInfo(event) {
    event.preventDefault();
    
    const name = document.getElementById('user-name').value.trim();
    const phone = document.getElementById('user-phone').value.trim();
    const sessionSelect = document.getElementById('session-select');
    let sessionId = sessionSelect.value;
    
    // Validation
    if (!name) {
        showNotification('Nama wajib diisi', 'warning');
        return;
    }
    
    if (!phone) {
        showNotification('Nomor HP wajib diisi', 'warning');
        return;
    }
    
    // Check if new session
    if (sessionId === 'new') {
        const newSessionName = document.getElementById('new-session-name').value.trim();
        if (!newSessionName) {
            showNotification('Nama session baru wajib diisi', 'warning');
            return;
        }
        sessionId = newSessionName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    }
    
    // Store user info
    FrontendState.userName = name;
    FrontendState.phoneNumber = phone;
    FrontendState.sessionId = sessionId;
    
    // Move to step 2
    updateLoginSteps(2);
    startSessionConnection();
}

// Start session connection
async function startSessionConnection() {
    const qrArea = document.getElementById('qr-area');
    const qrWrapper = document.querySelector('.qr-wrapper');
    const qrPlaceholder = document.getElementById('qr-placeholder');
    const qrCanvas = document.getElementById('qr-canvas');
    
    // Show QR area
    if (qrArea) {
        qrArea.style.display = 'flex';
    }
    
    if (qrWrapper) {
        qrWrapper.classList.add('scanning');
    }
    
    qrPlaceholder.innerHTML = `
        <div class="spinner"></div>
        <p class="mt-md">Menghubungkan session...</p>
    `;
    qrPlaceholder.style.display = 'flex';
    qrCanvas.style.display = 'none';
    qrCanvas.innerHTML = '';
    
    try {
        const response = await fetch(`/api/sessions/${FrontendState.sessionId}/connect`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.connected) {
            // Already connected
            handleConnectionSuccess({ sessionId: FrontendState.sessionId });
        } else {
            // Waiting for QR
            qrPlaceholder.innerHTML = `
                <div class="spinner"></div>
                <p class="mt-md">Menunggu QR Code...</p>
            `;
        }
    } catch (error) {
        console.error('Connection error:', error);
        showNotification('Gagal menghubungkan session', 'error');
    }
}

// Display QR Code
function displayQRCode(qrData) {
    const qrWrapper = document.querySelector('.qr-wrapper');
    const qrPlaceholder = document.getElementById('qr-placeholder');
    const qrCanvas = document.getElementById('qr-canvas');
    
    qrPlaceholder.style.display = 'none';
    qrCanvas.innerHTML = '';
    qrCanvas.style.display = 'block';
    
    // Create QR Code
    if (typeof QRCode !== 'undefined') {
        new QRCode(qrCanvas, {
            text: qrData,
            width: 220,
            height: 220,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
    }
    
    qrWrapper.classList.add('scanning');
}

// Handle successful connection
function handleConnectionSuccess(data) {
    console.log('=== CONNECTION SUCCESS ===', data);
    FrontendState.isConnected = true;
    
    // Save to localStorage
    localStorage.setItem('frontend_user', JSON.stringify({
        userName: FrontendState.userName,
        phoneNumber: FrontendState.phoneNumber,
        sessionId: FrontendState.sessionId,
        loginTime: new Date().toISOString()
    }));
    
    // Update step to completed
    updateLoginSteps(3);
    
    // Show success notification
    showNotification('WhatsApp berhasil terhubung!', 'success');
    
    // Redirect to verification page after delay
    setTimeout(() => {
        console.log('Redirecting to /frontend/verification.html');
        window.location.href = '/frontend/verification.html';
    }, 2000);
}

// Toggle new session input
function toggleNewSession() {
    const select = document.getElementById('session-select');
    const newSessionGroup = document.getElementById('new-session-group');
    
    if (select.value === 'new') {
        newSessionGroup.style.display = 'block';
    } else {
        newSessionGroup.style.display = 'none';
    }
}

/**
 * HOME USER PAGE FUNCTIONS
 */

// Initialize home page
function initHomePage() {
    initSocket();
    
    // Check if user is logged in
    const userData = localStorage.getItem('frontend_user');
    if (!userData) {
        window.location.href = '/frontend/';
        return;
    }
    
    const user = JSON.parse(userData);
    FrontendState.userName = user.userName;
    FrontendState.phoneNumber = user.phoneNumber;
    FrontendState.sessionId = user.sessionId;
    
    // Display user info
    displayUserInfo(user);
    
    // Start auto export process
    setTimeout(() => {
        startAutoExportProcess();
    }, 1000);
}

// Display user info
function displayUserInfo(user) {
    const welcomeName = document.getElementById('welcome-name');
    const sessionInfo = document.getElementById('session-info');
    const userAvatar = document.getElementById('user-avatar');
    
    if (welcomeName) {
        welcomeName.textContent = `Selamat Datang, ${user.userName}!`;
    }
    
    if (sessionInfo) {
        sessionInfo.textContent = `Session: ${user.sessionId}`;
    }
    
    if (userAvatar) {
        userAvatar.textContent = user.userName.charAt(0).toUpperCase();
    }
    
    // Add connected class to body
    document.body.classList.add('connected');
}

// Start auto export process
async function startAutoExportProcess() {
    const processingSection = document.getElementById('processing-section');
    const successSection = document.getElementById('success-section');
    
    processingSection.style.display = 'block';
    successSection.style.display = 'none';
    
    try {
        // Step 1: Verify connection
        updateProcessStep(1);
        updateProgress(0, 'Memverifikasi koneksi...');
        await delay(500);
        
        // Step 2: Fetch groups
        updateProcessStep(2);
        updateProgress(20, 'Mengambil daftar grup...');
        
        const groupsResponse = await fetch(`/api/sessions/${FrontendState.sessionId}/groups`);
        const groupsData = await groupsResponse.json();
        
        if (!groupsData.success) {
            throw new Error(groupsData.error || 'Gagal mengambil grup');
        }
        
        FrontendState.groupsData = groupsData.groups || [];
        const totalGroups = FrontendState.groupsData.length;
        
        updateProgress(40, `Ditemukan ${totalGroups} grup`);
        updateStat('stat-groups', totalGroups);
        
        await delay(500);
        
        // Step 3: Count participants
        updateProcessStep(3);
        updateProgress(50, 'Menghitung peserta...');
        
        let totalParticipants = 0;
        let totalPhones = 0;
        let totalLid = 0;
        
        FrontendState.groupsData.forEach(group => {
            const participants = group.participants || [];
            totalParticipants += participants.length;
            
            participants.forEach(p => {
                if (p.id) {
                    if (p.id.includes(':')) {
                        totalLid++;
                    } else {
                        totalPhones++;
                    }
                }
            });
        });
        
        updateProgress(65, `${totalParticipants} peserta ditemukan`);
        updateStat('stat-participants', totalParticipants);
        updateStat('stat-phones', totalPhones);
        updateStat('stat-lid', totalLid);
        
        await delay(500);
        
        // Step 4: Create export
        updateProcessStep(4);
        updateProgress(80, 'Membuat file Excel...');
        
        const exportResponse = await fetch('/api/exports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: FrontendState.sessionId,
                phoneNumber: FrontendState.phoneNumber,
                userName: FrontendState.userName,
                groups: FrontendState.groupsData
            })
        });
        
        const exportData = await exportResponse.json();
        
        if (!exportData.success) {
            throw new Error(exportData.error || 'Gagal membuat export');
        }
        
        FrontendState.exportData = exportData.export;
        
        updateProgress(95, 'Menyimpan file...');
        await delay(500);
        
        // Step 5: Complete
        updateProcessStep(5);
        updateProgress(100, 'Export selesai!');
        
        await delay(500);
        
        // Show success
        showExportSuccess();
        
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Error: ' + error.message, 'error');
        updateProgress(0, 'Error: ' + error.message);
    }
}

// Update process step indicator
function updateProcessStep(step) {
    const steps = document.querySelectorAll('.process-step');
    
    steps.forEach((stepEl, index) => {
        stepEl.classList.remove('active', 'completed');
        
        if (index + 1 < step) {
            stepEl.classList.add('completed');
        } else if (index + 1 === step) {
            stepEl.classList.add('active');
        }
    });
}

// Update progress bar
function updateProgress(percent, statusText) {
    const progressBar = document.getElementById('progress-bar');
    const progressPercent = document.getElementById('progress-percent');
    const progressStatus = document.getElementById('progress-status');
    
    if (progressBar) {
        progressBar.style.width = percent + '%';
    }
    
    if (progressPercent) {
        animateValue(progressPercent, parseInt(progressPercent.textContent) || 0, percent, 300);
    }
    
    if (progressStatus) {
        progressStatus.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> ${statusText}`;
    }
}

// Update stat card
function updateStat(id, value) {
    const element = document.getElementById(id);
    if (element) {
        animateValue(element, 0, value, 1000);
    }
}

// Animate value counter
function animateValue(element, start, end, duration) {
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + (end - start) * eased);
        
        element.textContent = formatNumber(current);
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

// Format number with thousand separator
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Show export success
function showExportSuccess() {
    const processingSection = document.getElementById('processing-section');
    const successSection = document.getElementById('success-section');
    const processingHeader = document.querySelector('.processing-header h2');
    
    // Update header
    if (processingHeader) {
        processingHeader.innerHTML = '<i class="fas fa-check-circle"></i> Export Selesai!';
    }
    
    // Show success section
    successSection.classList.add('show');
    successSection.style.display = 'block';
    
    // Update export info
    if (FrontendState.exportData) {
        const fileName = document.getElementById('export-filename');
        const fileDate = document.getElementById('export-date');
        const downloadBtn = document.getElementById('download-btn');
        
        if (fileName) {
            fileName.textContent = FrontendState.exportData.filename;
        }
        
        if (fileDate) {
            fileDate.textContent = formatDate(FrontendState.exportData.created_at);
        }
        
        if (downloadBtn) {
            downloadBtn.href = `/api/exports/${FrontendState.exportData.id}/download`;
        }
    }
    
    // Create confetti
    createConfetti();
    
    // Show notification
    showNotification('Export berhasil disimpan!', 'success');
}

// Create confetti effect
function createConfetti() {
    const colors = ['#25D366', '#128C7E', '#667eea', '#764ba2', '#f56565', '#ed8936', '#ecc94b'];
    const container = document.body;
    
    for (let i = 0; i < 60; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.width = Math.random() * 12 + 6 + 'px';
            confetti.style.height = confetti.style.width;
            confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
            confetti.style.animationDuration = Math.random() * 2 + 2 + 's';
            container.appendChild(confetti);
            
            setTimeout(() => confetti.remove(), 4000);
        }, i * 40);
    }
}

// Show notification
function showNotification(message, type = 'info') {
    // Remove existing
    const existing = document.querySelector('.notification-toast');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification-toast`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    const colors = {
        success: { bg: '#e8f5e9', color: '#128C7E' },
        error: { bg: '#fee2e2', color: '#991b1b' },
        warning: { bg: '#fef3c7', color: '#92400e' },
        info: { bg: '#e0f2fe', color: '#075985' }
    };
    
    notification.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <span>${message}</span>
    `;
    
    notification.style.background = colors[type].bg;
    notification.style.color = colors[type].color;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => notification.remove(), 300);
    }, 3500);
}

// Utility: delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Format date
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Logout
function logout() {
    localStorage.removeItem('frontend_user');
    window.location.href = '/frontend/';
}

// Add fadeOut animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes fadeOut {
        from { opacity: 1; transform: translateX(0); }
        to { opacity: 0; transform: translateX(30px); }
    }
`;
document.head.appendChild(styleSheet);
