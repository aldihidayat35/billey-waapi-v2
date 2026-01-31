/**
 * Header Component JavaScript
 * Handles user info display, logout, and change password functionality
 */

// Load and display current user info
async function loadCurrentUser() {
    try {
        const response = await fetch('/api/auth/me', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            // Not authenticated, redirect to login
            if (response.status === 401) {
                window.location.href = '/auth/login';
                return;
            }
            throw new Error('Failed to get user info');
        }
        
        const data = await response.json();
        
        if (data.success && data.user) {
            const user = data.user;
            
            // Get initials from name
            const initials = user.name
                ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
                : '?';
            
            // Update avatar
            const avatarEl = document.getElementById('header-user-avatar');
            const menuAvatarEl = document.getElementById('header-menu-avatar');
            if (avatarEl) avatarEl.textContent = initials;
            if (menuAvatarEl) menuAvatarEl.textContent = initials;
            
            // Update name and email
            const nameEl = document.getElementById('header-menu-name');
            const emailEl = document.getElementById('header-menu-email');
            if (nameEl) {
                nameEl.innerHTML = user.name || 'User';
                
                // Add role badge if admin
                if (user.role === 'adminwa') {
                    const badge = document.createElement('span');
                    badge.className = 'badge badge-light-success fw-bold fs-8 px-2 py-1 ms-2';
                    badge.textContent = 'Admin';
                    nameEl.appendChild(badge);
                    
                    // Show admin-only menu items
                    document.querySelectorAll('.admin-only-header-menu').forEach(el => {
                        el.style.display = '';
                    });
                }
            }
            if (emailEl) emailEl.textContent = user.email || '';
            
            // Store user in localStorage for other components
            localStorage.setItem('wa_user', JSON.stringify(user));
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

// Initialize header functionality
function initializeHeader() {
    console.log('🔧 Initializing header...');
    
    // Load current user info
    loadCurrentUser();
    
    // Handle logout
    const logoutLink = document.getElementById('header-logout-link');
    if (logoutLink) {
        console.log('✅ Logout link found, attaching event listener');
        logoutLink.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (confirm('Apakah Anda yakin ingin keluar?')) {
                try {
                    // Clear localStorage first
                    localStorage.removeItem('wa_user');
                    
                    // Call logout API
                    await fetch('/api/auth/logout', {
                        method: 'POST',
                        credentials: 'include'
                    });
                } catch (error) {
                    console.error('Logout error:', error);
                } finally {
                    // Always redirect to login
                    window.location.href = '/auth/login';
                }
            }
        });
    } else {
        console.warn('⚠️ Logout link not found');
    }
    
    // Handle change password
    const btnSavePassword = document.getElementById('btnSavePassword');
    if (btnSavePassword) {
        console.log('✅ Change password button found');
        btnSavePassword.addEventListener('click', async () => {
            const form = document.getElementById('changePasswordForm');
            if (!form) return;
            
            const currentPassword = form.querySelector('[name="currentPassword"]')?.value;
            const newPassword = form.querySelector('[name="newPassword"]')?.value;
            const confirmPassword = form.querySelector('[name="confirmPassword"]')?.value;
            
            // Validate
            if (!currentPassword || !newPassword || !confirmPassword) {
                alert('Semua field wajib diisi');
                return;
            }
            
            if (newPassword.length < 6) {
                alert('Password baru minimal 6 karakter');
                return;
            }
            
            if (newPassword !== confirmPassword) {
                alert('Password baru tidak cocok');
                return;
            }
            
            try {
                btnSavePassword.disabled = true;
                btnSavePassword.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Menyimpan...';
                
                const response = await fetch('/api/auth/change-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        currentPassword,
                        newPassword,
                        confirmPassword
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    alert('Password berhasil diubah');
                    form.reset();
                    // Close modal
                    const modal = bootstrap.Modal.getInstance(document.getElementById('changePasswordModal'));
                    if (modal) modal.hide();
                } else {
                    alert(data.error || 'Gagal mengubah password');
                }
            } catch (error) {
                console.error('Change password error:', error);
                alert('Terjadi kesalahan saat mengubah password');
            } finally {
                btnSavePassword.disabled = false;
                btnSavePassword.innerHTML = 'Simpan';
            }
        });
    }
    
    console.log('✅ Header initialized');
}

// Export for use in other files
if (typeof window !== 'undefined') {
    window.initializeHeader = initializeHeader;
    window.loadCurrentUser = loadCurrentUser;
}
