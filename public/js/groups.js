// Groups Management JavaScript

let allGroups = [];
let currentGroupId = null;
let currentGroupData = null;
let exportProgressModal = null;
let exportCompleteModal = null;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
	loadComponents();
	loadSessions();
	
	// Initialize export modals
	const progressModalEl = document.getElementById('exportProgressModal');
	const completeModalEl = document.getElementById('exportCompleteModal');
	if (progressModalEl) exportProgressModal = new bootstrap.Modal(progressModalEl);
	if (completeModalEl) exportCompleteModal = new bootstrap.Modal(completeModalEl);
	
	// Configure Toastr
	if (typeof toastr !== 'undefined') {
		toastr.options = {
			closeButton: true,
			progressBar: true,
			positionClass: 'toastr-bottom-right',
			timeOut: 3000
		};
	}
});

// Load header, sidebar, and footer components
function loadComponents() {
	['header', 'sidebar', 'footer'].forEach(comp => {
		fetch(`components/${comp}.html`)
			.then(r => r.text())
			.then(html => {
				const el = document.getElementById(`${comp}-container`);
				if (el) el.innerHTML = html;
				if (comp === 'sidebar') {
					setTimeout(() => {
						const link = document.querySelector('a[href="groups.html"]');
						if (link) link.classList.add('active');
					}, 100);
				}
			})
			.catch(() => {});
	});
}

// Show toast notification using Toastr
function showToast(title, message, type = 'info') {
	if (typeof toastr !== 'undefined') {
		toastr[type](message, title);
	} else {
		// Fallback to alert if toastr not available
		alert(`${title}: ${message}`);
	}
}

// Load available sessions
async function loadSessions() {
	try {
		const response = await fetch('/api/sessions');
		const data = await response.json();
		
		const select = document.getElementById('sessionSelect');
		select.innerHTML = '<option value="">-- Pilih Session --</option>';
		
		if (data.sessions) {
			data.sessions.forEach(session => {
				if (session.status === 'connected') {
					const option = document.createElement('option');
					option.value = session.id;
					option.textContent = `${session.id} (${session.status})`;
					select.appendChild(option);
				}
			});
		}
		
		// Auto-select if only one connected session
		const connectedSessions = data.sessions?.filter(s => s.status === 'connected') || [];
		if (connectedSessions.length === 1) {
			select.value = connectedSessions[0].id;
			loadGroups();
		}
	} catch (error) {
		console.error('Error loading sessions:', error);
		showToast('Error', 'Gagal memuat daftar session', 'error');
	}
}

// Load groups for selected session
async function loadGroups() {
	const sessionId = document.getElementById('sessionSelect').value;
	const container = document.getElementById('groupsContainer');
	const statsRow = document.getElementById('statsRow');
	
	if (!sessionId) {
		container.innerHTML = `
			<div class="card">
				<div class="card-body">
					<div class="empty-state">
						<i class="bi bi-people"></i>
						<h5 class="text-gray-600 mb-2">Pilih session untuk melihat grup</h5>
						<p class="text-gray-500 fs-7">Pilih session WhatsApp yang terhubung untuk menampilkan daftar grup</p>
					</div>
				</div>
			</div>
		`;
		statsRow.style.display = 'none';
		return;
	}
	
	container.innerHTML = `
		<div class="card">
			<div class="card-body text-center py-10">
				<div class="spinner-border text-success" role="status"></div>
				<p class="mt-4 text-gray-600 fs-6">Memuat daftar grup...</p>
			</div>
		</div>
	`;
	
	try {
		const response = await fetch(`/api/groups/${sessionId}`);
		const data = await response.json();
		
		if (!data.success) {
			throw new Error(data.error || 'Failed to load groups');
		}
		
		// Process groups to determine if user is admin
		allGroups = (data.groups || []).map(group => {
			// Check if current user is admin in this group
			const myJid = data.myJid || '';
			const myPhone = myJid.replace('@s.whatsapp.net', '');
			
			// Find user's participant entry
			const myParticipant = group.participants?.find(p => {
				const pPhone = p.id.replace('@s.whatsapp.net', '').replace('@lid', '');
				return pPhone === myPhone || p.id === myJid;
			});
			
			const isAdmin = myParticipant?.admin === 'admin' || myParticipant?.admin === 'superadmin';
			const isOwner = myParticipant?.admin === 'superadmin';
			
			return {
				...group,
				isAdmin,
				isOwner,
				participantCount: group.participantCount || group.participants?.length || group.size || 0,
				adminCount: group.adminCount || 0
			};
		});
		
		// Update stats
		updateStats();
		statsRow.style.display = 'flex';
		
		// Render groups
		renderGroups(allGroups);
		
	} catch (error) {
		console.error('Error loading groups:', error);
		container.innerHTML = `
			<div class="card">
				<div class="card-body">
					<div class="alert alert-danger mb-0">
						<i class="bi bi-exclamation-triangle me-2"></i>
						Gagal memuat grup: ${error.message}
					</div>
				</div>
			</div>
		`;
		statsRow.style.display = 'none';
	}
}

// Update statistics
function updateStats() {
	document.getElementById('totalGroups').textContent = allGroups.length;
	
	let adminCount = 0;
	let totalParticipants = 0;
	
	allGroups.forEach(group => {
		if (group.isAdmin) adminCount++;
		totalParticipants += group.participantCount || 0;
	});
	
	document.getElementById('adminGroups').textContent = adminCount;
	document.getElementById('totalParticipants').textContent = totalParticipants;
	document.getElementById('avgMembers').textContent = allGroups.length > 0 
		? Math.round(totalParticipants / allGroups.length) 
		: 0;
}

// Render groups list
function renderGroups(groups) {
	const container = document.getElementById('groupsContainer');
	
	if (groups.length === 0) {
		container.innerHTML = `
			<div class="card">
				<div class="card-body">
					<div class="empty-state">
						<i class="bi bi-people"></i>
						<h5 class="text-gray-600 mb-2">Tidak ada grup ditemukan</h5>
						<p class="text-gray-500 fs-7">Buat grup baru atau ubah filter pencarian</p>
					</div>
				</div>
			</div>
		`;
		return;
	}
	
	let html = '<div class="row g-4">';
	
	groups.forEach(group => {
		const initial = group.subject ? group.subject.charAt(0).toUpperCase() : 'G';
		const roleClass = group.isAdmin ? 'owner-badge' : 'participant-badge';
		const roleText = group.isAdmin ? 'Admin' : 'Member';
		const roleIcon = group.isAdmin ? 'bi-shield-check' : 'bi-person';
		
		html += `
			<div class="col-12">
				<div class="card group-card" onclick="openGroupDetail('${group.id}')">
					<div class="card-body py-4">
						<div class="d-flex align-items-center gap-3">
							<div class="group-avatar">
								${group.profilePicture 
									? `<img src="${group.profilePicture}" alt="${group.subject}" onerror="this.parentElement.innerHTML='${initial}'">` 
									: initial}
							</div>
							<div class="flex-grow-1 min-w-0">
								<h6 class="mb-1 fw-bold text-gray-800 text-truncate">${escapeHtml(group.subject || 'Unnamed Group')}</h6>
								<div class="group-stats">
									<span class="stat-item">
										<i class="bi bi-people-fill"></i>${group.participantCount || 0} peserta
									</span>
									<span class="stat-item ${roleClass}">
										<i class="bi ${roleIcon}"></i>${roleText}
									</span>
								</div>
							</div>
							<div class="action-buttons d-flex gap-2">
								<button class="btn btn-icon btn-sm btn-light-primary" onclick="event.stopPropagation(); openGroupDetail('${group.id}')" title="Detail">
									<i class="bi bi-eye fs-5"></i>
								</button>
								<button class="btn btn-icon btn-sm btn-light-success" onclick="event.stopPropagation(); quickSendMessage('${group.id}', '${escapeHtml(group.subject)}')" title="Kirim Pesan">
									<i class="bi bi-chat-dots fs-5"></i>
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		`;
	});
	
	html += '</div>';
	container.innerHTML = html;
}

// Filter groups
function filterGroups() {
	const searchTerm = document.getElementById('searchInput').value.toLowerCase();
	const filterType = document.getElementById('filterSelect').value;
	
	let filtered = allGroups.filter(group => {
		const matchesSearch = !searchTerm || 
			(group.subject && group.subject.toLowerCase().includes(searchTerm));
		
		let matchesFilter = true;
		if (filterType === 'admin') {
			matchesFilter = group.isAdmin;
		} else if (filterType === 'member') {
			matchesFilter = !group.isAdmin;
		}
		
		return matchesSearch && matchesFilter;
	});
	
	renderGroups(filtered);
}

// Open group detail modal
async function openGroupDetail(groupId) {
	currentGroupId = groupId;
	const sessionId = document.getElementById('sessionSelect').value;
	
	// Show modal with loading
	const modal = new bootstrap.Modal(document.getElementById('groupDetailModal'));
	modal.show();
	
	document.getElementById('modalGroupName').textContent = 'Loading...';
	document.getElementById('participantsList').innerHTML = `
		<div class="text-center py-4">
			<div class="spinner-border spinner-border-sm text-primary"></div>
			<span class="ms-2">Memuat data...</span>
		</div>
	`;
	
	try {
		const response = await fetch(`/api/groups/${sessionId}/${groupId}/metadata`);
		const data = await response.json();
		
		if (!data.success) {
			throw new Error(data.error || 'Failed to load group data');
		}
		
		currentGroupData = data.group;
		populateGroupModal(data.group);
		
	} catch (error) {
		console.error('Error loading group detail:', error);
		showToast('Error', 'Gagal memuat detail grup: ' + error.message, 'error');
	}
}

// Populate group modal with data
function populateGroupModal(group) {
	// Header
	const initial = group.subject ? group.subject.charAt(0).toUpperCase() : 'G';
	document.getElementById('modalGroupAvatar').innerHTML = initial;
	document.getElementById('modalGroupName').textContent = group.subject || 'Unnamed Group';
	document.getElementById('modalGroupId').textContent = group.id;
	
	// Info tab
	document.getElementById('editGroupSubject').value = group.subject || '';
	document.getElementById('editGroupDesc').value = group.desc || '';
	document.getElementById('groupOwner').textContent = group.owner ? group.owner.replace('@s.whatsapp.net', '') : '-';
	document.getElementById('groupCreated').textContent = group.creation 
		? new Date(group.creation * 1000).toLocaleString('id-ID') 
		: '-';
	
	// Participants
	const participants = group.participants || [];
	document.getElementById('participantCount').textContent = participants.length;
	renderParticipants(participants);
	
	// Settings buttons state
	updateSettingsButtons(group);
}

// Render participants list
function renderParticipants(participants) {
	const container = document.getElementById('participantsList');
	
	if (participants.length === 0) {
		container.innerHTML = '<p class="text-muted">Tidak ada peserta</p>';
		return;
	}
	
	// Sort: owner first, then admins, then regular members
	participants.sort((a, b) => {
		if (a.admin === 'superadmin') return -1;
		if (b.admin === 'superadmin') return 1;
		if (a.admin === 'admin' && b.admin !== 'admin') return -1;
		if (b.admin === 'admin' && a.admin !== 'admin') return 1;
		return 0;
	});
	
	// Count resolved vs unresolved
	let resolvedCount = 0;
	let unresolvedCount = 0;
	
	participants.forEach(p => {
		if (p.id.includes('@lid') || (p.originalId?.includes('@lid') && p.id === p.originalId)) {
			unresolvedCount++;
		} else {
			resolvedCount++;
		}
	});
	
	let html = `
		<div class="mb-3 p-2 bg-light rounded">
			<small class="text-muted">
				<i class="bi bi-info-circle me-1"></i>
				<span class="text-success fw-medium">${resolvedCount}</span> nomor HP terdeteksi, 
				<span class="text-warning fw-medium">${unresolvedCount}</span> masih LID
			</small>
		</div>
	`;
	
	participants.forEach(p => {
		// Extract phone number, handling both @s.whatsapp.net and @lid formats
		let displayNumber = p.id || '';
		let fullNumber = displayNumber.replace('@s.whatsapp.net', '').replace('@lid', '');
		
		// Check if it's still a LID (unresolved)
		const isLid = p.id.includes('@lid') || (p.originalId?.includes('@lid') && p.id === p.originalId);
		
		// Format display
		if (isLid) {
			displayNumber = `LID: ${fullNumber.substring(0, 8)}...`;
		} else {
			displayNumber = fullNumber;
		}
		
		let badge = '';
		let badgeClass = '';
		
		if (p.admin === 'superadmin') {
			badge = 'Owner';
			badgeClass = 'owner-badge';
		} else if (p.admin === 'admin') {
			badge = 'Admin';
			badgeClass = 'admin-badge';
		} else {
			badge = 'Member';
			badgeClass = 'member-badge';
		}
		
		html += `
			<div class="participant-item d-flex align-items-center justify-content-between" data-number="${fullNumber}" data-is-lid="${isLid}">
				<div class="d-flex align-items-center gap-2">
					<input type="checkbox" class="form-check-input participant-checkbox" value="${p.id}" onchange="toggleBulkActions()">
					<div>
						<span class="fw-medium ${isLid ? 'text-muted' : 'text-dark'}">${displayNumber}</span>
						${isLid ? '<i class="bi bi-question-circle text-warning ms-1" title="LID belum terasosiasi dengan nomor HP"></i>' : '<i class="bi bi-check-circle text-success ms-1" title="Nomor HP terverifikasi"></i>'}
						<span class="participant-badge ${badgeClass} ms-2">${badge}</span>
					</div>
				</div>
				<div class="dropdown">
					<button class="btn btn-sm btn-light" data-bs-toggle="dropdown">
						<i class="bi bi-three-dots-vertical"></i>
					</button>
					<ul class="dropdown-menu dropdown-menu-end">
						${p.admin !== 'superadmin' ? `
							${p.admin === 'admin' 
								? `<li><a class="dropdown-item" href="#" onclick="demoteParticipant('${p.id}')"><i class="bi bi-arrow-down-circle me-2"></i>Hapus Admin</a></li>` 
								: `<li><a class="dropdown-item" href="#" onclick="promoteParticipant('${p.id}')"><i class="bi bi-arrow-up-circle me-2"></i>Jadikan Admin</a></li>`}
							<li><a class="dropdown-item text-danger" href="#" onclick="removeParticipant('${p.id}')"><i class="bi bi-person-dash me-2"></i>Keluarkan</a></li>
						` : ''}
					</ul>
				</div>
			</div>
		`;
	});
	
	container.innerHTML = html;
}

// Filter participants
function filterParticipants() {
	const searchTerm = document.getElementById('searchParticipant').value.toLowerCase();
	const items = document.querySelectorAll('.participant-item');
	
	items.forEach(item => {
		const number = item.dataset.number.toLowerCase();
		item.style.display = number.includes(searchTerm) ? 'flex' : 'none';
	});
}

// Toggle bulk actions visibility
function toggleBulkActions() {
	const checkboxes = document.querySelectorAll('.participant-checkbox:checked');
	const bulkActions = document.getElementById('bulkActions');
	bulkActions.style.display = checkboxes.length > 0 ? 'flex' : 'none';
}

// Get selected participants
function getSelectedParticipants() {
	const checkboxes = document.querySelectorAll('.participant-checkbox:checked');
	return Array.from(checkboxes).map(cb => cb.value);
}

// Update settings buttons state
function updateSettingsButtons(group) {
	// Announcement setting
	const btnAllCanSend = document.getElementById('btnAllCanSend');
	const btnAdminOnly = document.getElementById('btnAdminOnly');
	
	if (group.announce) {
		btnAdminOnly.classList.add('active', 'btn-primary');
		btnAdminOnly.classList.remove('btn-outline-primary');
		btnAllCanSend.classList.remove('active', 'btn-primary');
		btnAllCanSend.classList.add('btn-outline-primary');
	} else {
		btnAllCanSend.classList.add('active', 'btn-primary');
		btnAllCanSend.classList.remove('btn-outline-primary');
		btnAdminOnly.classList.remove('active', 'btn-primary');
		btnAdminOnly.classList.add('btn-outline-primary');
	}
	
	// Locked setting
	const btnAllCanEdit = document.getElementById('btnAllCanEdit');
	const btnAdminOnlyEdit = document.getElementById('btnAdminOnlyEdit');
	
	if (group.restrict) {
		btnAdminOnlyEdit.classList.add('active', 'btn-primary');
		btnAdminOnlyEdit.classList.remove('btn-outline-primary');
		btnAllCanEdit.classList.remove('active', 'btn-primary');
		btnAllCanEdit.classList.add('btn-outline-primary');
	} else {
		btnAllCanEdit.classList.add('active', 'btn-primary');
		btnAllCanEdit.classList.remove('btn-outline-primary');
		btnAdminOnlyEdit.classList.remove('active', 'btn-primary');
		btnAdminOnlyEdit.classList.add('btn-outline-primary');
	}
}

// API Functions
async function updateGroupSubject() {
	const sessionId = document.getElementById('sessionSelect').value;
	const subject = document.getElementById('editGroupSubject').value.trim();
	
	if (!subject) {
		showToast('Warning', 'Nama grup tidak boleh kosong', 'warning');
		return;
	}
	
	try {
		const response = await fetch(`/api/groups/${sessionId}/${currentGroupId}/subject`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ subject })
		});
		
		const data = await response.json();
		
		if (data.success) {
			showToast('Sukses', 'Nama grup berhasil diubah', 'success');
			document.getElementById('modalGroupName').textContent = subject;
			loadGroups(); // Refresh list
		} else {
			throw new Error(data.error);
		}
	} catch (error) {
		showToast('Error', 'Gagal mengubah nama grup: ' + error.message, 'error');
	}
}

async function updateGroupDescription() {
	const sessionId = document.getElementById('sessionSelect').value;
	const description = document.getElementById('editGroupDesc').value;
	
	try {
		const response = await fetch(`/api/groups/${sessionId}/${currentGroupId}/description`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ description })
		});
		
		const data = await response.json();
		
		if (data.success) {
			showToast('Sukses', 'Deskripsi grup berhasil diubah', 'success');
		} else {
			throw new Error(data.error);
		}
	} catch (error) {
		showToast('Error', 'Gagal mengubah deskripsi: ' + error.message, 'error');
	}
}

async function sendGroupMessage() {
	const sessionId = document.getElementById('sessionSelect').value;
	const message = document.getElementById('groupMessage').value.trim();
	
	if (!message) {
		showToast('Warning', 'Pesan tidak boleh kosong', 'warning');
		return;
	}
	
	try {
		const response = await fetch(`/api/groups/${sessionId}/${currentGroupId}/send`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message })
		});
		
		const data = await response.json();
		
		if (data.success) {
			showToast('Sukses', 'Pesan berhasil dikirim', 'success');
			document.getElementById('groupMessage').value = '';
		} else {
			throw new Error(data.error);
		}
	} catch (error) {
		showToast('Error', 'Gagal mengirim pesan: ' + error.message, 'error');
	}
}

async function getInviteCode() {
	const sessionId = document.getElementById('sessionSelect').value;
	
	try {
		const response = await fetch(`/api/groups/${sessionId}/${currentGroupId}/invite`);
		const data = await response.json();
		
		if (data.success) {
			document.getElementById('inviteLink').value = data.inviteLink;
			showToast('Sukses', 'Link invite berhasil didapatkan', 'success');
		} else {
			throw new Error(data.error);
		}
	} catch (error) {
		showToast('Error', 'Gagal mendapatkan link invite: ' + error.message, 'error');
	}
}

async function revokeInviteCode() {
	if (!confirm('Yakin ingin mereset link invite? Link lama tidak akan bisa digunakan lagi.')) {
		return;
	}
	
	const sessionId = document.getElementById('sessionSelect').value;
	
	try {
		const response = await fetch(`/api/groups/${sessionId}/${currentGroupId}/revoke-invite`, {
			method: 'POST'
		});
		const data = await response.json();
		
		if (data.success) {
			document.getElementById('inviteLink').value = data.inviteLink;
			showToast('Sukses', 'Link invite berhasil direset', 'success');
		} else {
			throw new Error(data.error);
		}
	} catch (error) {
		showToast('Error', 'Gagal mereset link invite: ' + error.message, 'error');
	}
}

function copyInviteLink() {
	const input = document.getElementById('inviteLink');
	if (!input.value) {
		showToast('Warning', 'Klik "Dapatkan Link" terlebih dahulu', 'warning');
		return;
	}
	
	navigator.clipboard.writeText(input.value).then(() => {
		showToast('Sukses', 'Link berhasil disalin', 'success');
	});
}

async function addParticipants() {
	const sessionId = document.getElementById('sessionSelect').value;
	const input = document.getElementById('newParticipantNumber').value.trim();
	
	if (!input) {
		showToast('Warning', 'Masukkan nomor peserta', 'warning');
		return;
	}
	
	// Parse numbers
	const numbers = input.split(/[,\s]+/).filter(n => n).map(n => {
		n = n.replace(/[^0-9]/g, '');
		if (!n.includes('@')) n += '@s.whatsapp.net';
		return n;
	});
	
	try {
		const response = await fetch(`/api/groups/${sessionId}/${currentGroupId}/participants/add`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ participants: numbers })
		});
		
		const data = await response.json();
		
		if (data.success) {
			showToast('Sukses', 'Peserta berhasil ditambahkan', 'success');
			document.getElementById('newParticipantNumber').value = '';
			openGroupDetail(currentGroupId); // Refresh
		} else {
			throw new Error(data.error);
		}
	} catch (error) {
		showToast('Error', 'Gagal menambah peserta: ' + error.message, 'error');
	}
}

async function removeParticipant(participantId) {
	if (!confirm('Yakin ingin mengeluarkan peserta ini?')) return;
	
	const sessionId = document.getElementById('sessionSelect').value;
	
	try {
		const response = await fetch(`/api/groups/${sessionId}/${currentGroupId}/participants/remove`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ participants: [participantId] })
		});
		
		const data = await response.json();
		
		if (data.success) {
			showToast('Sukses', 'Peserta berhasil dikeluarkan', 'success');
			openGroupDetail(currentGroupId); // Refresh
		} else {
			throw new Error(data.error);
		}
	} catch (error) {
		showToast('Error', 'Gagal mengeluarkan peserta: ' + error.message, 'error');
	}
}

async function promoteParticipant(participantId) {
	const sessionId = document.getElementById('sessionSelect').value;
	
	try {
		const response = await fetch(`/api/groups/${sessionId}/${currentGroupId}/participants/promote`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ participants: [participantId] })
		});
		
		const data = await response.json();
		
		if (data.success) {
			showToast('Sukses', 'Peserta berhasil dijadikan admin', 'success');
			openGroupDetail(currentGroupId); // Refresh
		} else {
			throw new Error(data.error);
		}
	} catch (error) {
		showToast('Error', 'Gagal menjadikan admin: ' + error.message, 'error');
	}
}

async function demoteParticipant(participantId) {
	const sessionId = document.getElementById('sessionSelect').value;
	
	try {
		const response = await fetch(`/api/groups/${sessionId}/${currentGroupId}/participants/demote`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ participants: [participantId] })
		});
		
		const data = await response.json();
		
		if (data.success) {
			showToast('Sukses', 'Admin berhasil dihapus', 'success');
			openGroupDetail(currentGroupId); // Refresh
		} else {
			throw new Error(data.error);
		}
	} catch (error) {
		showToast('Error', 'Gagal menghapus admin: ' + error.message, 'error');
	}
}

// Bulk actions
async function removeSelectedParticipants() {
	const selected = getSelectedParticipants();
	if (selected.length === 0) return;
	
	if (!confirm(`Yakin ingin mengeluarkan ${selected.length} peserta?`)) return;
	
	const sessionId = document.getElementById('sessionSelect').value;
	
	try {
		const response = await fetch(`/api/groups/${sessionId}/${currentGroupId}/participants/remove`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ participants: selected })
		});
		
		const data = await response.json();
		
		if (data.success) {
			showToast('Sukses', `${selected.length} peserta berhasil dikeluarkan`, 'success');
			openGroupDetail(currentGroupId);
		} else {
			throw new Error(data.error);
		}
	} catch (error) {
		showToast('Error', 'Gagal mengeluarkan peserta: ' + error.message, 'error');
	}
}

async function promoteSelectedParticipants() {
	const selected = getSelectedParticipants();
	if (selected.length === 0) return;
	
	const sessionId = document.getElementById('sessionSelect').value;
	
	try {
		const response = await fetch(`/api/groups/${sessionId}/${currentGroupId}/participants/promote`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ participants: selected })
		});
		
		const data = await response.json();
		
		if (data.success) {
			showToast('Sukses', `${selected.length} peserta dijadikan admin`, 'success');
			openGroupDetail(currentGroupId);
		} else {
			throw new Error(data.error);
		}
	} catch (error) {
		showToast('Error', 'Gagal menjadikan admin: ' + error.message, 'error');
	}
}

async function demoteSelectedParticipants() {
	const selected = getSelectedParticipants();
	if (selected.length === 0) return;
	
	const sessionId = document.getElementById('sessionSelect').value;
	
	try {
		const response = await fetch(`/api/groups/${sessionId}/${currentGroupId}/participants/demote`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ participants: selected })
		});
		
		const data = await response.json();
		
		if (data.success) {
			showToast('Sukses', `${selected.length} admin dihapus`, 'success');
			openGroupDetail(currentGroupId);
		} else {
			throw new Error(data.error);
		}
	} catch (error) {
		showToast('Error', 'Gagal menghapus admin: ' + error.message, 'error');
	}
}

async function updateGroupSetting(setting) {
	const sessionId = document.getElementById('sessionSelect').value;
	
	try {
		const response = await fetch(`/api/groups/${sessionId}/${currentGroupId}/settings`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ setting })
		});
		
		const data = await response.json();
		
		if (data.success) {
			showToast('Sukses', 'Pengaturan grup berhasil diubah', 'success');
			openGroupDetail(currentGroupId); // Refresh
		} else {
			throw new Error(data.error);
		}
	} catch (error) {
		showToast('Error', 'Gagal mengubah pengaturan: ' + error.message, 'error');
	}
}

async function leaveGroup() {
	if (!confirm('Yakin ingin keluar dari grup ini? Tindakan ini tidak dapat dibatalkan.')) return;
	
	const sessionId = document.getElementById('sessionSelect').value;
	
	try {
		const response = await fetch(`/api/groups/${sessionId}/${currentGroupId}/leave`, {
			method: 'POST'
		});
		
		const data = await response.json();
		
		if (data.success) {
			showToast('Sukses', 'Berhasil keluar dari grup', 'success');
			bootstrap.Modal.getInstance(document.getElementById('groupDetailModal')).hide();
			loadGroups(); // Refresh list
		} else {
			throw new Error(data.error);
		}
	} catch (error) {
		showToast('Error', 'Gagal keluar dari grup: ' + error.message, 'error');
	}
}

// Create & Join Group Modals
function showCreateGroupModal() {
	const sessionId = document.getElementById('sessionSelect').value;
	if (!sessionId) {
		showToast('Warning', 'Pilih session terlebih dahulu', 'warning');
		return;
	}
	
	document.getElementById('newGroupName').value = '';
	document.getElementById('newGroupParticipants').value = '';
	new bootstrap.Modal(document.getElementById('createGroupModal')).show();
}

function showJoinGroupModal() {
	const sessionId = document.getElementById('sessionSelect').value;
	if (!sessionId) {
		showToast('Warning', 'Pilih session terlebih dahulu', 'warning');
		return;
	}
	
	document.getElementById('joinInviteCode').value = '';
	new bootstrap.Modal(document.getElementById('joinGroupModal')).show();
}

async function createGroup() {
	const sessionId = document.getElementById('sessionSelect').value;
	const subject = document.getElementById('newGroupName').value.trim();
	const participantsText = document.getElementById('newGroupParticipants').value.trim();
	
	if (!subject) {
		showToast('Warning', 'Nama grup tidak boleh kosong', 'warning');
		return;
	}
	
	// Parse participants
	let participants = [];
	if (participantsText) {
		participants = participantsText.split(/[,\n]+/)
			.map(n => n.trim().replace(/[^0-9]/g, ''))
			.filter(n => n)
			.map(n => n + '@s.whatsapp.net');
	}
	
	try {
		const response = await fetch(`/api/groups/${sessionId}/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ subject, participants })
		});
		
		const data = await response.json();
		
		if (data.success) {
			showToast('Sukses', `Grup "${subject}" berhasil dibuat`, 'success');
			bootstrap.Modal.getInstance(document.getElementById('createGroupModal')).hide();
			loadGroups(); // Refresh
		} else {
			throw new Error(data.error);
		}
	} catch (error) {
		showToast('Error', 'Gagal membuat grup: ' + error.message, 'error');
	}
}

async function joinGroup() {
	const sessionId = document.getElementById('sessionSelect').value;
	let inviteCode = document.getElementById('joinInviteCode').value.trim();
	
	if (!inviteCode) {
		showToast('Warning', 'Masukkan link atau kode invite', 'warning');
		return;
	}
	
	// Extract code from link if needed
	if (inviteCode.includes('chat.whatsapp.com/')) {
		inviteCode = inviteCode.split('chat.whatsapp.com/')[1].split('?')[0];
	}
	
	try {
		const response = await fetch(`/api/groups/${sessionId}/join`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ inviteCode })
		});
		
		const data = await response.json();
		
		if (data.success) {
			showToast('Sukses', 'Berhasil bergabung ke grup', 'success');
			bootstrap.Modal.getInstance(document.getElementById('joinGroupModal')).hide();
			loadGroups(); // Refresh
		} else {
			throw new Error(data.error);
		}
	} catch (error) {
		showToast('Error', 'Gagal bergabung ke grup: ' + error.message, 'error');
	}
}

// Quick send message from list
function quickSendMessage(groupId, groupName) {
	const message = prompt(`Kirim pesan ke "${groupName}":`);
	if (!message) return;
	
	currentGroupId = groupId;
	document.getElementById('groupMessage').value = message;
	sendGroupMessage();
}

// ============================================
// EXPORT TO EXCEL FUNCTIONS
// ============================================

let exportModal = null;

// Show export modal
function showExportModal() {
	const sessionId = document.getElementById('sessionSelect').value;
	
	if (!sessionId) {
		showToast('Warning', 'Pilih session terlebih dahulu', 'warning');
		return;
	}
	
	if (allGroups.length === 0) {
		showToast('Warning', 'Tidak ada grup untuk diexport', 'warning');
		return;
	}
	
	// Populate group list
	populateExportGroupList();
	updateExportPreview();
	
	// Show modal
	if (!exportModal) {
		exportModal = new bootstrap.Modal(document.getElementById('exportModal'));
	}
	exportModal.show();
}

// Populate group list in export modal
function populateExportGroupList() {
	const container = document.getElementById('exportGroupList');
	
	let html = '';
	allGroups.forEach((group, index) => {
		html += `
			<div class="form-check mb-2">
				<input class="form-check-input export-group-checkbox" type="checkbox" 
					value="${group.id}" id="exportGroup${index}" 
					data-name="${escapeHtml(group.subject || 'Unnamed')}"
					data-count="${group.participantCount || 0}"
					onchange="updateExportPreview()">
				<label class="form-check-label d-flex justify-content-between w-100" for="exportGroup${index}">
					<span>${escapeHtml(group.subject || 'Unnamed Group')}</span>
					<span class="badge bg-light text-gray-600">${group.participantCount || 0} peserta</span>
				</label>
			</div>
		`;
	});
	
	container.innerHTML = html;
}

// Toggle group selection visibility
function toggleGroupSelection() {
	const exportType = document.querySelector('input[name="exportType"]:checked').value;
	const container = document.getElementById('groupSelectionContainer');
	
	if (exportType === 'selected') {
		container.style.display = 'block';
	} else {
		container.style.display = 'none';
	}
	
	updateExportPreview();
}

// Select all groups
function selectAllGroups() {
	document.querySelectorAll('.export-group-checkbox').forEach(cb => cb.checked = true);
	updateExportPreview();
}

// Deselect all groups
function deselectAllGroups() {
	document.querySelectorAll('.export-group-checkbox').forEach(cb => cb.checked = false);
	updateExportPreview();
}

// Update export preview stats
function updateExportPreview() {
	const exportType = document.querySelector('input[name="exportType"]:checked').value;
	let groupCount = 0;
	let participantCount = 0;
	
	if (exportType === 'all') {
		groupCount = allGroups.length;
		participantCount = allGroups.reduce((sum, g) => sum + (g.participantCount || 0), 0);
	} else {
		const checkedBoxes = document.querySelectorAll('.export-group-checkbox:checked');
		groupCount = checkedBoxes.length;
		checkedBoxes.forEach(cb => {
			participantCount += parseInt(cb.dataset.count) || 0;
		});
	}
	
	const statsEl = document.getElementById('exportStats');
	if (groupCount === 0) {
		statsEl.innerHTML = '<span class="text-warning">Pilih minimal 1 grup untuk export</span>';
	} else {
		statsEl.innerHTML = `Akan mengexport <strong>${participantCount}</strong> nomor HP dari <strong>${groupCount}</strong> grup`;
	}
}

// Execute export with options
async function executeExport() {
	const sessionId = document.getElementById('sessionSelect').value;
	const exportType = document.querySelector('input[name="exportType"]:checked').value;
	
	// Get selected groups
	let groupsToExport = [];
	if (exportType === 'all') {
		groupsToExport = allGroups.map(g => ({ id: g.id, name: g.subject || 'Unnamed Group' }));
	} else {
		document.querySelectorAll('.export-group-checkbox:checked').forEach(cb => {
			groupsToExport.push({ id: cb.value, name: cb.dataset.name || 'Unnamed Group' });
		});
	}
	
	if (groupsToExport.length === 0) {
		showToast('Warning', 'Pilih minimal 1 grup untuk export', 'warning');
		return;
	}
	
	// Get export options
	const options = {
		includeSummary: document.getElementById('exportSummary').checked,
		includeAllInOne: document.getElementById('exportAllInOne').checked,
		includePerGroup: document.getElementById('exportPerGroup').checked,
		filterOwner: document.getElementById('filterOwner').checked,
		filterAdmin: document.getElementById('filterAdmin').checked,
		filterMember: document.getElementById('filterMember').checked,
		excludeLid: document.getElementById('excludeLid').checked
	};
	
	// Close export options modal and show progress modal
	const totalGroups = groupsToExport.length;
	exportModal.hide();
	
	// Reset and show progress modal
	updateExportProgress(0, totalGroups, '-', 0, 0, 0);
	setTimeout(() => {
		exportProgressModal.show();
	}, 300);
	
	try {
		// Fetch detailed metadata for selected groups with delay to avoid rate limit
		const groupsWithParticipants = [];
		let totalParticipants = 0;
		let totalResolved = 0;
		let totalUnresolved = 0;
		let processedCount = 0;
		let errorCount = 0;
		
		// Helper function to delay
		const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
		
		// Helper function to fetch with retry
		const fetchWithRetry = async (url, maxRetries = 3) => {
			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					const response = await fetch(url);
					const data = await response.json();
					
					// Check for rate limit error (status 429 or error message)
					if (response.status === 429 || (data.isRateLimit) || 
						(data.error && (data.error.toLowerCase().includes('rate') || data.error.toLowerCase().includes('overlimit')))) {
						
						if (attempt < maxRetries) {
							const waitTime = attempt * 2000; // 2s, 4s, 6s
							console.log(`Rate limit hit, waiting ${waitTime/1000}s before retry ${attempt + 1}/${maxRetries}...`);
							// Update progress to show waiting
							document.getElementById('progressLabel').textContent = `Rate limit, menunggu ${waitTime/1000}s...`;
							await delay(waitTime);
							continue;
						}
					}
					
					return data;
				} catch (e) {
					if (attempt < maxRetries) {
						await delay(1000);
						continue;
					}
					throw e;
				}
			}
			return { success: false, error: 'Max retries exceeded' };
		};
		
		for (let i = 0; i < groupsToExport.length; i++) {
			const groupInfo = groupsToExport[i];
			const groupId = groupInfo.id;
			processedCount++;
			
			// Update progress bar
			updateExportProgress(processedCount, totalGroups, groupInfo.name, 
				groupsWithParticipants.length, totalResolved, totalUnresolved);
			
			try {
				const data = await fetchWithRetry(`/api/groups/${sessionId}/${groupId}/metadata`);
				
				if (data.success && data.group) {
					// Filter participants based on role
					let participants = data.group.participants || [];
					participants = participants.filter(p => {
						if (p.admin === 'superadmin' && !options.filterOwner) return false;
						if (p.admin === 'admin' && !options.filterAdmin) return false;
						if (!p.admin && !options.filterMember) return false;
						return true;
					});
					
					// Count resolved vs unresolved BEFORE filtering
					participants.forEach(p => {
						const isLid = p.id.includes('@lid') || (p.originalId?.includes('@lid') && p.id === p.originalId);
						if (isLid) {
							totalUnresolved++;
						} else {
							totalResolved++;
						}
					});
					
					// Filter out unresolved LIDs if option is checked
					if (options.excludeLid) {
						participants = participants.filter(p => {
							// Check if it's still a LID (not resolved)
							if (p.id.includes('@lid')) return false;
							// If originalId was LID but id is same, it means not resolved
							if (p.originalId?.includes('@lid') && p.id === p.originalId) return false;
							return true;
						});
					}
					
					totalParticipants += participants.length;
					
					groupsWithParticipants.push({
						name: data.group.subject || 'Unnamed Group',
						id: data.group.id,
						participantCount: participants.length,
						resolvedCount: data.group.resolvedCount || 0,
						unresolvedLidCount: data.group.unresolvedLidCount || 0,
						participants: participants
					});
				} else {
					throw new Error(data.error || 'Failed to fetch');
				}
			} catch (e) {
				console.log('Error fetching group:', groupId, e);
				errorCount++;
				// Use data from allGroups if metadata fetch fails
				const group = allGroups.find(g => g.id === groupId);
				if (group) {
					groupsWithParticipants.push({
						name: group.subject || 'Unnamed Group',
						id: group.id,
						participantCount: group.participantCount || 0,
						participants: group.participants || []
					});
				}
			}
			
			// Add delay between requests to avoid rate limit (500ms)
			if (processedCount < totalGroups) {
				await delay(500);
			}
		}
		
		// Update progress to 100%
		updateExportProgress(totalGroups, totalGroups, 'Selesai!', 
			groupsWithParticipants.length, totalResolved, totalUnresolved);
		
		// Short delay before generating Excel
		await delay(500);
		
		// Generate Excel content with options
		generateExcelWithOptions(groupsWithParticipants, options);
		
		// Hide progress modal and show complete modal
		exportProgressModal.hide();
		
		setTimeout(() => {
			// Update complete modal stats
			document.getElementById('finalGroups').textContent = groupsWithParticipants.length;
			document.getElementById('finalNumbers').textContent = totalResolved;
			document.getElementById('finalLid').textContent = totalUnresolved;
			
			let resultMsg = `${totalResolved + totalUnresolved} nomor dari ${groupsWithParticipants.length} grup berhasil diekspor`;
			if (errorCount > 0) {
				resultMsg += ` (${errorCount} grup error)`;
			}
			document.getElementById('exportResultMessage').textContent = resultMsg;
			
			exportCompleteModal.show();
		}, 300);
		
	} catch (error) {
		console.error('Export error:', error);
		exportProgressModal.hide();
		showToast('Error', 'Gagal export: ' + error.message, 'error');
	}
}

// Update export progress UI
function updateExportProgress(current, total, groupName, groupsDone, resolved, unresolved) {
	const percent = Math.round((current / total) * 100);
	
	// Update progress bar
	const progressBar = document.getElementById('exportProgressBar');
	if (progressBar) {
		progressBar.style.width = `${percent}%`;
		progressBar.setAttribute('aria-valuenow', percent);
	}
	
	// Update percent text
	const percentText = document.getElementById('progressPercent');
	if (percentText) percentText.textContent = `${percent}%`;
	
	// Update label
	const label = document.getElementById('progressLabel');
	if (label) label.textContent = `Memproses ${current} dari ${total} grup`;
	
	// Update subtitle
	const subtitle = document.getElementById('progressSubtitle');
	if (subtitle) subtitle.textContent = `${resolved + unresolved} nomor HP ditemukan`;
	
	// Update current group name
	const currentGroup = document.getElementById('currentGroupName');
	if (currentGroup) currentGroup.textContent = groupName;
	
	// Update stats
	const statGroups = document.getElementById('statGroups');
	if (statGroups) statGroups.textContent = groupsDone;
	
	const statNumbers = document.getElementById('statNumbers');
	if (statNumbers) statNumbers.textContent = resolved;
	
	const statLid = document.getElementById('statLid');
	if (statLid) statLid.textContent = unresolved;
}

// Generate Excel file with options
function generateExcelWithOptions(groups, options) {
	const wb = XLSX.utils.book_new();
	
	// ===== SHEET UTAMA: Data Nomor HP (3 kolom: Nama Grup, ID Grup, Nomor HP) =====
	// Format: Semua nomor dari grup 1 dulu, baru grup 2, dst
	const mainRows = [];
	let totalNumbers = 0;
	
	groups.forEach(group => {
		const participants = group.participants || [];
		
		if (participants.length > 0) {
			participants.forEach(p => {
				let phoneNumber = p.id || '';
				phoneNumber = phoneNumber.replace('@s.whatsapp.net', '').replace('@lid', '');
				
				// Skip jika excludeLid aktif dan ini adalah LID
				const isLid = p.id.includes('@lid') || (p.originalId?.includes('@lid') && p.id === p.originalId);
				if (options.excludeLid && isLid) return;
				
				mainRows.push({
					'Nama Grup': group.name,
					'ID Grup': group.id,
					'Nomor HP': phoneNumber
				});
				totalNumbers++;
			});
		}
	});
	
	// Buat sheet utama dengan data nomor HP
	const wsMain = XLSX.utils.json_to_sheet(mainRows);
	wsMain['!cols'] = [
		{ wch: 40 },  // Nama Grup
		{ wch: 35 },  // ID Grup
		{ wch: 20 }   // Nomor HP
	];
	XLSX.utils.book_append_sheet(wb, wsMain, 'Data Nomor HP');
	
	// ===== SHEET RINGKASAN (opsional) =====
	if (options.includeSummary) {
		const summaryRows = groups.map(group => ({
			'Nama Grup': group.name,
			'ID Grup': group.id,
			'Total Peserta': group.participantCount,
			'Nomor HP Resolved': group.resolvedCount || '-',
			'LID Unresolved': group.unresolvedLidCount || '-'
		}));
		
		// Add total row
		summaryRows.push({
			'Nama Grup': 'TOTAL',
			'ID Grup': '-',
			'Total Peserta': groups.reduce((sum, g) => sum + (g.participantCount || 0), 0),
			'Nomor HP Resolved': groups.reduce((sum, g) => sum + (g.resolvedCount || 0), 0),
			'LID Unresolved': groups.reduce((sum, g) => sum + (g.unresolvedLidCount || 0), 0)
		});
		
		const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
		wsSummary['!cols'] = [
			{ wch: 40 },
			{ wch: 35 },
			{ wch: 15 },
			{ wch: 18 },
			{ wch: 15 }
		];
		XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan Grup');
	}
	
	// ===== SHEET PER GRUP (opsional) =====
	if (options.includePerGroup) {
		groups.forEach(group => {
			const groupRows = [];
			const participants = group.participants || [];
			
			participants.forEach(p => {
				let phoneNumber = p.id || '';
				phoneNumber = phoneNumber.replace('@s.whatsapp.net', '').replace('@lid', '');
				
				const isLid = p.id.includes('@lid') || (p.originalId?.includes('@lid') && p.id === p.originalId);
				if (options.excludeLid && isLid) return;
				
				let role = 'Member';
				if (p.admin === 'superadmin') role = 'Owner';
				else if (p.admin === 'admin') role = 'Admin';
				
				groupRows.push({
					'Nomor HP': phoneNumber,
					'Status': role,
					'Tipe': isLid ? 'LID' : 'OK'
				});
			});
			
			if (groupRows.length > 0) {
				let sheetName = group.name
					.replace(/[\\/*?:[\]]/g, '')
					.substring(0, 28);
				
				let counter = 1;
				let finalName = sheetName;
				while (wb.SheetNames.includes(finalName)) {
					finalName = sheetName.substring(0, 25) + '_' + counter++;
				}
				
				const wsGroup = XLSX.utils.json_to_sheet(groupRows);
				wsGroup['!cols'] = [
					{ wch: 20 },
					{ wch: 10 },
					{ wch: 8 }
				];
				XLSX.utils.book_append_sheet(wb, wsGroup, finalName);
			}
		});
	}
	
	// Generate filename with timestamp
	const timestamp = new Date().toISOString().slice(0, 10);
	const filename = `WhatsApp_Groups_Export_${timestamp}.xlsx`;
	
	XLSX.writeFile(wb, filename);
	
	console.log(`✅ Exported ${totalNumbers} phone numbers from ${groups.length} groups`);
}

// Legacy export function (for backward compatibility)
async function exportToExcel() {
	showExportModal();
}

// Export only current group's participants
function exportCurrentGroupToExcel() {
	if (!currentGroupData) {
		showToast('Warning', 'Tidak ada data grup', 'warning');
		return;
	}
	
	const participants = currentGroupData.participants || [];
	if (participants.length === 0) {
		showToast('Warning', 'Tidak ada peserta untuk diexport', 'warning');
		return;
	}
	
	const rows = participants.map(p => {
		let phoneNumber = p.id || '';
		phoneNumber = phoneNumber.replace('@s.whatsapp.net', '').replace('@lid', '');
		
		let role = 'Member';
		if (p.admin === 'superadmin') role = 'Owner';
		else if (p.admin === 'admin') role = 'Admin';
		
		return {
			'Nomor HP': phoneNumber,
			'Status': role
		};
	});
	
	// Create workbook
	const wb = XLSX.utils.book_new();
	const ws = XLSX.utils.json_to_sheet(rows);
	ws['!cols'] = [
		{ wch: 20 }, // Nomor HP
		{ wch: 10 }  // Status
	];
	
	// Sanitize sheet name
	let sheetName = (currentGroupData.subject || 'Group')
		.replace(/[\\/*?:[\]]/g, '')
		.substring(0, 31);
	
	XLSX.utils.book_append_sheet(wb, ws, sheetName);
	
	// Generate filename
	const timestamp = new Date().toISOString().slice(0, 10);
	const filename = `${sheetName}_Peserta_${timestamp}.xlsx`;
	
	XLSX.writeFile(wb, filename);
	showToast('Sukses', 'Export berhasil!', 'success');
}

// Utility
function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}
