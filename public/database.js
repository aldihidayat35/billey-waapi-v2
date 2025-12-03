/**
 * Database Viewer - SQLite UI
 * View and manage WhatsApp database
 */

// ============================================
// STATE
// ============================================
const DBState = {
    tables: [],
    currentTable: null,
    currentData: [],
    currentColumns: [],
    queryHistory: JSON.parse(localStorage.getItem('queryHistory') || '[]'),
    selectedIds: new Set(),
    cellModal: null,
    historyModal: null
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🗄️ Database Viewer initialized');
    
    loadComponents();
    initModals();
    loadDatabaseInfo();
    setupKeyboardShortcuts();
});

function loadComponents() {
    ['header', 'sidebar', 'footer'].forEach(comp => {
        fetch(`components/${comp}.html`)
            .then(r => r.text())
            .then(html => {
                const el = document.getElementById(`${comp}-container`);
                if (el) el.innerHTML = html;
                if (comp === 'sidebar') {
                    setTimeout(() => {
                        const link = document.querySelector('a[href="database.html"]');
                        if (link) link.classList.add('active');
                    }, 100);
                }
            })
            .catch(() => {});
    });
}

function initModals() {
    DBState.cellModal = new bootstrap.Modal(document.getElementById('cellModal'));
    DBState.historyModal = new bootstrap.Modal(document.getElementById('historyModal'));
}

function setupKeyboardShortcuts() {
    document.getElementById('sql-input')?.addEventListener('keydown', (e) => {
        // Ctrl+Enter to execute
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            executeQuery();
        }
    });
}

// ============================================
// LOAD DATABASE INFO
// ============================================
async function loadDatabaseInfo() {
    try {
        const response = await fetch('/api/database/info');
        const data = await response.json();
        
        if (data.success) {
            // Update stats
            document.getElementById('stat-tables').textContent = data.tables?.length || 0;
            document.getElementById('stat-size').textContent = formatBytes(data.size || 0);
            
            // Store tables
            DBState.tables = data.tables || [];
            
            // Render tables list
            renderTablesList(data.tables || []);
            
            // Load additional stats
            loadMessageStats();
        }
    } catch (error) {
        console.error('Failed to load database info:', error);
        showToast('error', 'Gagal memuat informasi database');
    }
}

async function loadMessageStats() {
    try {
        // Get message count
        const msgRes = await fetch('/api/database/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'SELECT COUNT(*) as count FROM message_logs' })
        });
        const msgData = await msgRes.json();
        if (msgData.success && msgData.data?.[0]) {
            document.getElementById('stat-messages').textContent = formatNumber(msgData.data[0].count);
        }
        
        // Get session count
        const sesRes = await fetch('/api/database/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'SELECT COUNT(*) as count FROM session_logs' })
        });
        const sesData = await sesRes.json();
        if (sesData.success && sesData.data?.[0]) {
            document.getElementById('stat-sessions').textContent = formatNumber(sesData.data[0].count);
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

function renderTablesList(tables) {
    const container = document.getElementById('tables-list');
    
    if (!tables || tables.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No tables found</p>';
        return;
    }
    
    let html = '';
    tables.forEach(table => {
        const isActive = DBState.currentTable === table.name;
        html += `
            <div class="table-list-item ${isActive ? 'active' : ''}" onclick="selectTable('${table.name}')">
                <span class="table-name">
                    <i class="bi bi-table me-2"></i>${table.name}
                </span>
                <span class="row-count">${formatNumber(table.rowCount || 0)}</span>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ============================================
// TABLE OPERATIONS
// ============================================
async function selectTable(tableName) {
    DBState.currentTable = tableName;
    DBState.selectedIds.clear();
    updateSelectedCount();
    
    // Update UI
    document.querySelectorAll('.table-list-item').forEach(el => {
        el.classList.toggle('active', el.textContent.includes(tableName));
    });
    
    // Show/hide clear table button
    const clearBtn = document.getElementById('clear-table-btn');
    if (clearBtn) {
        if (['message_logs', 'session_logs'].includes(tableName)) {
            clearBtn.classList.remove('d-none');
        } else {
            clearBtn.classList.add('d-none');
        }
    }
    
    // Load schema
    await loadTableSchema(tableName);
    
    // Set query and execute
    const query = `SELECT * FROM ${tableName} ORDER BY ${tableName === 'message_logs' ? 'timestamp' : 'id'} DESC LIMIT 100`;
    document.getElementById('sql-input').value = query;
    executeQuery();
}

async function loadTableSchema(tableName) {
    try {
        const response = await fetch('/api/database/schema/' + tableName);
        const data = await response.json();
        
        if (data.success && data.schema) {
            renderSchema(data.schema);
            document.getElementById('schema-card').classList.remove('d-none');
        }
    } catch (error) {
        console.error('Failed to load schema:', error);
    }
}

function renderSchema(columns) {
    const container = document.getElementById('schema-content');
    
    let html = '';
    columns.forEach(col => {
        html += `
            <div class="schema-col">
                <span class="col-name">${col.name}</span>
                <span class="col-type">${col.type || 'TEXT'}</span>
                ${col.pk ? '<span class="col-pk">PK</span>' : ''}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ============================================
// QUERY EXECUTION
// ============================================
async function executeQuery() {
    const input = document.getElementById('sql-input');
    const query = input.value.trim();
    
    if (!query) {
        showToast('warning', 'Masukkan query SQL');
        return;
    }
    
    // Show loading
    const container = document.getElementById('results-container');
    container.innerHTML = `
        <div class="text-center py-10">
            <div class="spinner-border text-primary"></div>
            <p class="text-muted mt-3">Executing query...</p>
        </div>
    `;
    
    document.getElementById('query-status').innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Executing...';
    
    const startTime = Date.now();
    
    try {
        const response = await fetch('/api/database/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        
        const data = await response.json();
        const duration = Date.now() - startTime;
        
        if (data.success) {
            DBState.currentData = data.data || [];
            DBState.currentColumns = data.columns || [];
            
            // Add to history
            addToHistory(query);
            
            // Render results
            renderResults(data.data, data.columns);
            
            // Update status
            const rowCount = data.data?.length || 0;
            document.getElementById('query-status').innerHTML = 
                `<i class="bi bi-check-circle text-success me-1"></i>${rowCount} rows in ${duration}ms`;
            document.getElementById('result-info').textContent = `${rowCount} rows returned`;
            
            // Show export button
            if (rowCount > 0) {
                document.getElementById('export-results-btn').classList.remove('d-none');
            }
        } else {
            container.innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    <strong>Error:</strong> ${data.error || 'Unknown error'}
                </div>
            `;
            document.getElementById('query-status').innerHTML = 
                `<i class="bi bi-x-circle text-danger me-1"></i>Error`;
        }
    } catch (error) {
        container.innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle me-2"></i>
                <strong>Error:</strong> ${error.message}
            </div>
        `;
        document.getElementById('query-status').innerHTML = 
            `<i class="bi bi-x-circle text-danger me-1"></i>Error`;
    }
}

function renderResults(data, columns) {
    const container = document.getElementById('results-container');
    
    // Clear selected IDs
    DBState.selectedIds.clear();
    updateSelectedCount();
    
    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 text-muted">
                <i class="bi bi-inbox fs-1 d-block mb-3"></i>
                <p>No data returned</p>
            </div>
        `;
        document.getElementById('export-results-btn').classList.add('d-none');
        document.getElementById('delete-selected-btn').classList.add('d-none');
        return;
    }
    
    // Get columns from first row if not provided
    if (!columns || columns.length === 0) {
        columns = Object.keys(data[0]);
    }
    
    // Check if data has 'id' column for deletion
    const hasId = columns.includes('id');
    const canDelete = hasId && DBState.currentTable && ['message_logs', 'session_logs'].includes(DBState.currentTable);
    
    // Build table
    let html = '<table class="table table-hover db-table mb-0">';
    
    // Header
    html += '<thead><tr>';
    if (canDelete) {
        html += `<th class="checkbox-col">
                    <input type="checkbox" class="form-check-input row-checkbox" id="select-all" onchange="toggleSelectAll(this)">
                 </th>`;
    }
    html += '<th>#</th>';
    columns.forEach(col => {
        html += `<th>${escapeHtml(col)}</th>`;
    });
    if (canDelete) {
        html += '<th class="text-center">Actions</th>';
    }
    html += '</tr></thead>';
    
    // Body
    html += '<tbody>';
    data.forEach((row, idx) => {
        const rowId = row.id;
        const isSelected = DBState.selectedIds.has(rowId);
        
        html += `<tr data-id="${rowId}" class="${isSelected ? 'selected' : ''}">`;
        if (canDelete) {
            html += `<td class="checkbox-col">
                        <input type="checkbox" class="form-check-input row-checkbox" 
                               ${isSelected ? 'checked' : ''} 
                               onchange="toggleRowSelect(${rowId}, this)">
                     </td>`;
        }
        html += `<td class="text-muted">${idx + 1}</td>`;
        columns.forEach(col => {
            const value = row[col];
            const displayValue = formatCellValue(value, col);
            const isExpandable = value && String(value).length > 50;
            
            html += `<td class="${isExpandable ? 'expandable' : ''}" 
                         onclick="showCellDetail('${escapeHtml(col)}', ${idx})"
                         title="${isExpandable ? 'Click to expand' : ''}">
                         ${displayValue}
                     </td>`;
        });
        if (canDelete) {
            html += `<td class="row-actions text-center">
                        <button class="btn btn-sm btn-light-danger delete-btn" onclick="deleteSingleRow(${rowId}, event)" title="Delete">
                            <i class="bi bi-trash"></i>
                        </button>
                     </td>`;
        }
        html += '</tr>';
    });
    html += '</tbody></table>';
    
    container.innerHTML = html;
}

function formatCellValue(value, column) {
    if (value === null || value === undefined) {
        return '<span class="text-muted">NULL</span>';
    }
    
    // Handle media_data column - show preview thumbnail
    if (column === 'media_data' && value && value.length > 0) {
        const dataLength = value.length;
        return `<span class="badge bg-light-primary text-primary">
                    <i class="bi bi-image me-1"></i>${formatBytes(dataLength)}
                </span>`;
    }
    
    // Handle timestamp
    if (column === 'timestamp' && typeof value === 'number') {
        const date = new Date(value);
        return `<span class="text-nowrap">${date.toLocaleString('id-ID')}</span>`;
    }
    
    // Handle direction with badge
    if (column === 'direction') {
        const color = value === 'incoming' ? 'success' : 'primary';
        const icon = value === 'incoming' ? 'bi-arrow-down-left' : 'bi-arrow-up-right';
        return `<span class="badge bg-light-${color} text-${color}">
                    <i class="bi ${icon} me-1"></i>${value}
                </span>`;
    }
    
    // Handle message_type with badge
    if (column === 'message_type') {
        const colors = {
            text: 'primary',
            image: 'success',
            video: 'info',
            document: 'warning',
            audio: 'secondary',
            voice: 'secondary',
            sticker: 'pink'
        };
        const color = colors[value] || 'secondary';
        return `<span class="badge bg-light-${color} text-${color}">${value}</span>`;
    }
    
    // Handle action with badge
    if (column === 'action') {
        const colors = {
            login: 'success',
            logout: 'danger',
            created: 'info',
            deleted: 'warning'
        };
        const color = colors[value] || 'secondary';
        return `<span class="badge bg-light-${color} text-${color}">${value}</span>`;
    }
    
    // Truncate long strings
    const str = String(value);
    if (str.length > 50) {
        return escapeHtml(str.substring(0, 50)) + '...';
    }
    
    return escapeHtml(str);
}

function showCellDetail(column, rowIndex) {
    const row = DBState.currentData[rowIndex];
    if (!row) return;
    
    const value = row[column];
    
    document.getElementById('cell-column').textContent = column;
    
    // Format value for display
    let displayValue = '';
    if (value === null || value === undefined) {
        displayValue = 'NULL';
    } else if (column === 'timestamp' && typeof value === 'number') {
        displayValue = new Date(value).toLocaleString('id-ID');
    } else if (typeof value === 'object') {
        displayValue = JSON.stringify(value, null, 2);
    } else {
        displayValue = String(value);
    }
    
    document.getElementById('cell-value').textContent = displayValue;
    
    // Show media preview if it's media_data
    const mediaContainer = document.getElementById('media-preview-container');
    const mediaContent = document.getElementById('media-preview-content');
    
    if (column === 'media_data' && value && value.length > 0) {
        mediaContainer.classList.remove('d-none');
        
        // Try to detect type from mimetype or row data
        const mimetype = row.mimetype || '';
        const messageType = row.message_type || '';
        
        if (mimetype.startsWith('image/') || messageType === 'image') {
            mediaContent.innerHTML = `<img src="data:${mimetype || 'image/jpeg'};base64,${value}" 
                                          class="img-fluid rounded" style="max-height: 300px;">`;
        } else if (mimetype.startsWith('video/') || messageType === 'video') {
            mediaContent.innerHTML = `<video controls class="w-100" style="max-height: 300px;">
                                          <source src="data:${mimetype || 'video/mp4'};base64,${value}">
                                      </video>`;
        } else {
            mediaContent.innerHTML = `<p class="text-muted">Binary data (${formatBytes(value.length)})</p>`;
        }
    } else {
        mediaContainer.classList.add('d-none');
    }
    
    DBState.cellModal.show();
}

function copyToClipboard() {
    const value = document.getElementById('cell-value').textContent;
    navigator.clipboard.writeText(value).then(() => {
        showToast('success', 'Copied to clipboard');
    }).catch(() => {
        showToast('error', 'Failed to copy');
    });
}

// ============================================
// QUERY HELPERS
// ============================================
function setQuery(query) {
    document.getElementById('sql-input').value = query;
}

function addToHistory(query) {
    // Remove duplicate
    DBState.queryHistory = DBState.queryHistory.filter(q => q.query !== query);
    
    // Add to beginning
    DBState.queryHistory.unshift({
        query: query,
        time: new Date().toISOString()
    });
    
    // Keep only last 20
    DBState.queryHistory = DBState.queryHistory.slice(0, 20);
    
    // Save
    localStorage.setItem('queryHistory', JSON.stringify(DBState.queryHistory));
}

function showQueryHistory() {
    const container = document.getElementById('query-history-list');
    
    if (DBState.queryHistory.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No query history</p>';
    } else {
        let html = '';
        DBState.queryHistory.forEach((item, idx) => {
            const time = new Date(item.time).toLocaleString('id-ID');
            html += `
                <div class="query-history-item" onclick="loadHistoryQuery(${idx})">
                    <div class="query-text">${escapeHtml(item.query)}</div>
                    <div class="query-time">${time}</div>
                </div>
            `;
        });
        container.innerHTML = html;
    }
    
    DBState.historyModal.show();
}

function loadHistoryQuery(index) {
    const item = DBState.queryHistory[index];
    if (item) {
        document.getElementById('sql-input').value = item.query;
        DBState.historyModal.hide();
    }
}

function clearHistory() {
    DBState.queryHistory = [];
    localStorage.removeItem('queryHistory');
    document.getElementById('query-history-list').innerHTML = '<p class="text-muted text-center">No query history</p>';
    showToast('success', 'History cleared');
}

// ============================================
// EXPORT FUNCTIONS
// ============================================
function exportResults() {
    if (!DBState.currentData || DBState.currentData.length === 0) {
        showToast('warning', 'No data to export');
        return;
    }
    
    const columns = DBState.currentColumns.length > 0 
        ? DBState.currentColumns 
        : Object.keys(DBState.currentData[0]);
    
    // Build CSV
    let csv = columns.join(',') + '\n';
    
    DBState.currentData.forEach(row => {
        const values = columns.map(col => {
            let val = row[col];
            if (val === null || val === undefined) return '';
            
            // Skip media_data in export (too large)
            if (col === 'media_data') return '[BINARY DATA]';
            
            val = String(val);
            // Escape quotes and wrap in quotes if contains comma
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                val = '"' + val.replace(/"/g, '""') + '"';
            }
            return val;
        });
        csv += values.join(',') + '\n';
    });
    
    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `database-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('success', 'Data exported successfully');
}

async function exportDatabase() {
    showToast('info', 'Preparing database export...');
    
    try {
        const response = await fetch('/api/database/export');
        
        if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `whatsapp-db-${Date.now()}.db`;
            a.click();
            URL.revokeObjectURL(url);
            
            showToast('success', 'Database exported successfully');
        } else {
            showToast('error', 'Failed to export database');
        }
    } catch (error) {
        showToast('error', 'Export error: ' + error.message);
    }
}

// ============================================
// UTILITIES
// ============================================
function refreshAll() {
    loadDatabaseInfo();
    showToast('success', 'Database refreshed');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatNumber(num) {
    return new Intl.NumberFormat('id-ID').format(num || 0);
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function showToast(type, message) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'success',
            title: message,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000
        });
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

// ============================================
// DELETE FUNCTIONS
// ============================================

// Toggle select all checkboxes
function toggleSelectAll(checkbox) {
    const isChecked = checkbox.checked;
    const rows = document.querySelectorAll('.db-table tbody tr');
    
    DBState.selectedIds.clear();
    
    rows.forEach(row => {
        const rowId = parseInt(row.dataset.id);
        const rowCheckbox = row.querySelector('.row-checkbox');
        
        if (isChecked && rowId) {
            DBState.selectedIds.add(rowId);
            row.classList.add('selected');
            if (rowCheckbox) rowCheckbox.checked = true;
        } else {
            row.classList.remove('selected');
            if (rowCheckbox) rowCheckbox.checked = false;
        }
    });
    
    updateSelectedCount();
}

// Toggle single row selection
function toggleRowSelect(id, checkbox) {
    const row = document.querySelector(`tr[data-id="${id}"]`);
    
    if (checkbox.checked) {
        DBState.selectedIds.add(id);
        row?.classList.add('selected');
    } else {
        DBState.selectedIds.delete(id);
        row?.classList.remove('selected');
    }
    
    // Update select-all checkbox state
    const selectAll = document.getElementById('select-all');
    const allCheckboxes = document.querySelectorAll('.db-table tbody .row-checkbox');
    const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
    const someChecked = Array.from(allCheckboxes).some(cb => cb.checked);
    
    if (selectAll) {
        selectAll.checked = allChecked;
        selectAll.indeterminate = someChecked && !allChecked;
    }
    
    updateSelectedCount();
}

// Update selected count display
function updateSelectedCount() {
    const count = DBState.selectedIds.size;
    const countEl = document.getElementById('selected-count');
    const btn = document.getElementById('delete-selected-btn');
    
    if (countEl) countEl.textContent = count;
    
    if (btn) {
        if (count > 0) {
            btn.classList.remove('d-none');
        } else {
            btn.classList.add('d-none');
        }
    }
}

// Delete single row
async function deleteSingleRow(id, event) {
    event?.stopPropagation();
    
    if (!DBState.currentTable) {
        showToast('error', 'No table selected');
        return;
    }
    
    // Confirmation
    const result = await Swal.fire({
        title: 'Delete Record?',
        text: `Are you sure you want to delete record ID: ${id}?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f1416c',
        confirmButtonText: 'Yes, delete it!',
        cancelButtonText: 'Cancel'
    });
    
    if (!result.isConfirmed) return;
    
    try {
        const response = await fetch(`/api/database/delete/${DBState.currentTable}/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('success', data.message);
            
            // Remove row from UI
            const row = document.querySelector(`tr[data-id="${id}"]`);
            if (row) {
                row.style.transition = 'all 0.3s';
                row.style.opacity = '0';
                row.style.transform = 'translateX(-20px)';
                setTimeout(() => {
                    row.remove();
                    // Update row numbers
                    updateRowNumbers();
                }, 300);
            }
            
            // Remove from selected
            DBState.selectedIds.delete(id);
            updateSelectedCount();
            
            // Refresh stats
            loadMessageStats();
        } else {
            showToast('error', data.error || 'Failed to delete');
        }
    } catch (error) {
        showToast('error', 'Delete error: ' + error.message);
    }
}

// Delete selected rows (bulk delete)
async function deleteSelected() {
    if (DBState.selectedIds.size === 0) {
        showToast('warning', 'No rows selected');
        return;
    }
    
    if (!DBState.currentTable) {
        showToast('error', 'No table selected');
        return;
    }
    
    // Confirmation
    const result = await Swal.fire({
        title: 'Delete Selected Records?',
        html: `Are you sure you want to delete <b>${DBState.selectedIds.size}</b> selected record(s)?<br><br>
               <span class="text-danger"><i class="bi bi-exclamation-triangle me-1"></i>This action cannot be undone!</span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f1416c',
        confirmButtonText: `Yes, delete ${DBState.selectedIds.size} records!`,
        cancelButtonText: 'Cancel'
    });
    
    if (!result.isConfirmed) return;
    
    // Show loading
    Swal.fire({
        title: 'Deleting...',
        html: 'Please wait while records are being deleted.',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });
    
    try {
        const ids = Array.from(DBState.selectedIds);
        
        const response = await fetch(`/api/database/delete-bulk/${DBState.currentTable}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        });
        
        const data = await response.json();
        
        if (data.success) {
            Swal.fire({
                icon: 'success',
                title: 'Deleted!',
                text: data.message,
                timer: 2000,
                showConfirmButton: false
            });
            
            // Remove rows from UI
            ids.forEach(id => {
                const row = document.querySelector(`tr[data-id="${id}"]`);
                row?.remove();
            });
            
            // Clear selection
            DBState.selectedIds.clear();
            updateSelectedCount();
            
            // Update select-all checkbox
            const selectAll = document.getElementById('select-all');
            if (selectAll) {
                selectAll.checked = false;
                selectAll.indeterminate = false;
            }
            
            // Update row numbers
            updateRowNumbers();
            
            // Refresh stats
            loadMessageStats();
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: data.error || 'Failed to delete'
            });
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Delete error: ' + error.message
        });
    }
}

// Truncate table (delete all)
async function truncateTable(tableName) {
    if (!tableName) {
        tableName = DBState.currentTable;
    }
    
    if (!tableName) {
        showToast('error', 'No table selected');
        return;
    }
    
    // Double confirmation for truncate
    const result = await Swal.fire({
        title: 'Delete ALL Records?',
        html: `<div class="text-danger mb-3">
                   <i class="bi bi-exclamation-triangle fs-1 d-block mb-2"></i>
                   <strong>WARNING!</strong>
               </div>
               <p>You are about to delete <b>ALL</b> records from table <b>${tableName}</b>.</p>
               <p class="text-danger">This action cannot be undone!</p>
               <p>Type <b>"DELETE"</b> to confirm:</p>
               <input type="text" id="confirm-input" class="form-control" placeholder="Type DELETE">`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f1416c',
        confirmButtonText: 'Delete All',
        cancelButtonText: 'Cancel',
        preConfirm: () => {
            const input = document.getElementById('confirm-input').value;
            if (input !== 'DELETE') {
                Swal.showValidationMessage('Please type DELETE to confirm');
                return false;
            }
            return true;
        }
    });
    
    if (!result.isConfirmed) return;
    
    // Show loading
    Swal.fire({
        title: 'Deleting all records...',
        html: 'Please wait.',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });
    
    try {
        const response = await fetch(`/api/database/truncate/${tableName}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            Swal.fire({
                icon: 'success',
                title: 'Table Cleared!',
                text: data.message,
                timer: 2000,
                showConfirmButton: false
            });
            
            // Refresh data
            loadDatabaseInfo();
            
            // Clear results
            document.getElementById('results-container').innerHTML = `
                <div class="text-center py-10 text-muted">
                    <i class="bi bi-inbox fs-1 d-block mb-3"></i>
                    <p>Table is now empty</p>
                </div>
            `;
            
            // Hide buttons
            document.getElementById('export-results-btn')?.classList.add('d-none');
            document.getElementById('delete-selected-btn')?.classList.add('d-none');
            
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: data.error || 'Failed to truncate table'
            });
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Truncate error: ' + error.message
        });
    }
}

// Update row numbers after deletion
function updateRowNumbers() {
    const rows = document.querySelectorAll('.db-table tbody tr');
    rows.forEach((row, idx) => {
        // Find the row number cell (second cell if there's checkbox, first otherwise)
        const cells = row.querySelectorAll('td');
        const hasCheckbox = row.querySelector('.checkbox-col');
        const numCell = hasCheckbox ? cells[1] : cells[0];
        if (numCell && numCell.classList.contains('text-muted')) {
            numCell.textContent = idx + 1;
        }
    });
}
