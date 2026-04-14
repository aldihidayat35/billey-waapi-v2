// ════════════════════════════════════════════════════════════════
//  Dashboard JS — Admin Dashboard with ApexCharts infographics
// ════════════════════════════════════════════════════════════════

// ── Socket.IO ────────────────────────────────────────────────────
const socket = io()

// ── State ─────────────────────────────────────────────────────────
let allSessions = []
let chartDaily   = null   // ApexCharts instance for daily messages
let chartPeak    = null   // ApexCharts instance for peak hours

// ── ApexCharts global defaults (Metronic palette) ─────────────────
const CHART_COLORS = {
    incoming : '#009ef7',   // blue
    outgoing : '#50CD89',   // green
    peak     : '#7239EA',   // purple
    grid     : '#f5f8fa',
    text     : '#7e8299',
    labelFg  : '#3f4254',
}

// ══════════════════════════════════════════════════════════════════
//  Component loader
// ══════════════════════════════════════════════════════════════════
async function loadComponents() {
    try {
        const [headerHTML, sidebarHTML, footerHTML] = await Promise.all([
            fetch('components/header.html').then(r => r.text()),
            fetch('components/sidebar.html').then(r => r.text()),
            fetch('components/footer.html').then(r => r.text()),
        ])
        loadHTMLWithScripts('header-container',  headerHTML)
        loadHTMLWithScripts('sidebar-container', sidebarHTML)
        loadHTMLWithScripts('footer-container',  footerHTML)
        initializeComponents()
        if (typeof initializeHeader === 'function') initializeHeader()
    } catch (err) {
        console.error('❌ Error loading components:', err)
    }
}

function loadHTMLWithScripts(containerId, html) {
    const container = document.getElementById(containerId)
    if (!container) return
    const temp = document.createElement('div')
    temp.innerHTML = html
    const scripts = temp.querySelectorAll('script')
    scripts.forEach(s => s.remove())
    container.innerHTML = temp.innerHTML
    scripts.forEach(old => {
        const s = document.createElement('script')
        if (old.src) s.src = old.src; else s.textContent = old.textContent
        document.body.appendChild(s)
    })
}

function initializeComponents() {
    try { if (typeof KTMenu   !== 'undefined') { KTMenu.init(); KTMenu.createInstances() } } catch {}
    try { if (typeof KTDrawer !== 'undefined') KTDrawer.createInstances() } catch {}
    try { if (typeof KTScroll !== 'undefined') KTScroll.createInstances() } catch {}
}

// ══════════════════════════════════════════════════════════════════
//  Socket events
// ══════════════════════════════════════════════════════════════════
socket.on('connect', () => {
    console.log('🔌 Connected to server')
    socket.emit('get-sessions')
})

socket.on('all-sessions', (sessions) => {
    allSessions = sessions
    updateStatSessionCards()
    renderActiveSessions()
})

socket.on('session-status', () => { socket.emit('get-sessions') })

// ══════════════════════════════════════════════════════════════════
//  Stat cards top row
// ══════════════════════════════════════════════════════════════════
function updateStatSessionCards() {
    const total     = allSessions.length
    const connected = allSessions.filter(s => s.isConnected).length
    document.getElementById('stat-total-sessions').textContent     = total
    document.getElementById('stat-connected-sessions').textContent = connected
}

async function updateMessageStats() {
    try {
        // Total messages
        const logRes  = await fetch('/api/logs/statistics')
        const logData = await logRes.json()
        if (logData.success) {
            document.getElementById('stat-messages-sent').textContent = logData.data.totalMessages || 0
        }

        // Incoming today
        const dailyRes  = await fetch('/api/stats/messages/daily?days=1')
        const dailyData = await dailyRes.json()
        if (dailyData.success && dailyData.data.length > 0) {
            const today = dailyData.data[dailyData.data.length - 1]
            document.getElementById('stat-incoming-today').textContent = today.incoming || 0
        }
    } catch (e) {
        console.error('Error updating message stats:', e)
    }
}

// ══════════════════════════════════════════════════════════════════
//  Active Sessions list
// ══════════════════════════════════════════════════════════════════
function renderActiveSessions() {
    const container = document.getElementById('active-sessions-list')
    if (allSessions.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10">
                <i class="bi bi-inbox fs-5x text-muted mb-5 d-block"></i>
                <h3 class="text-muted">Belum ada session</h3>
                <p class="text-gray-600 mb-5">Buat session baru untuk memulai</p>
                <a href="manage-sessions.html" class="btn btn-primary">
                    <i class="bi bi-plus-circle"></i> Buat Session
                </a>
            </div>`
        return
    }
    container.innerHTML = allSessions.map(session => {
        const ok      = session.isConnected
        const cls     = ok ? 'success' : 'danger'
        const icon    = ok ? 'check-circle' : 'x-circle'
        const label   = ok ? 'Connected' : 'Disconnected'
        const user    = session.user?.name || session.user?.id?.split(':')[0] || 'Unknown'
        const phone   = session.user?.id?.split(':')[0] || '-'
        return `
        <div class="d-flex align-items-center bg-light-${cls} rounded p-4 mb-4">
            <div class="symbol symbol-45px me-4">
                <span class="symbol-label bg-white"><i class="bi bi-whatsapp fs-2x text-success"></i></span>
            </div>
            <div class="flex-grow-1">
                <div class="fw-bold text-gray-800 fs-6">${session.id}</div>
                <div class="text-muted fs-7">
                    ${ok ? `<i class="bi bi-person"></i> ${user} &bull; <i class="bi bi-telephone"></i> ${phone}` : 'Not connected'}
                </div>
            </div>
            <span class="badge badge-${cls}">
                <i class="bi bi-${icon}"></i> ${label}
            </span>
        </div>`
    }).join('')
}

// ══════════════════════════════════════════════════════════════════
//  CHART 1 — Area/Line Chart: Daily Messages
// ══════════════════════════════════════════════════════════════════
async function loadDailyChart(days = 7) {
    try {
        const res  = await fetch(`/api/stats/messages/daily?days=${days}`)
        const json = await res.json()
        if (!json.success) return

        const data     = json.data
        const dates    = data.map(d => d.date)
        const incoming = data.map(d => d.incoming)
        const outgoing = data.map(d => d.outgoing)

        const el = document.getElementById('chart-daily-messages')
        el.innerHTML = '' // clear skeleton

        const options = {
            series: [
                { name: 'Masuk',  data: incoming },
                { name: 'Keluar', data: outgoing  },
            ],
            chart: {
                type: 'area',
                height: 300,
                fontFamily: 'Inter, sans-serif',
                toolbar: { show: false },
                zoom: { enabled: false },
                sparkline: { enabled: false },
            },
            dataLabels: { enabled: false },
            stroke: { curve: 'smooth', width: 2 },
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.35,
                    opacityTo: 0.05,
                    stops: [0, 90, 100],
                },
            },
            colors: [CHART_COLORS.incoming, CHART_COLORS.outgoing],
            xaxis: {
                categories: dates,
                type: 'category',
                axisBorder: { show: false },
                axisTicks:  { show: false },
                labels: {
                    style: { colors: CHART_COLORS.text, fontSize: '11px' },
                    rotate: -30,
                    rotateAlways: false,
                },
            },
            yaxis: {
                labels: {
                    style: { colors: CHART_COLORS.text, fontSize: '11px' },
                    formatter: v => Math.round(v),
                },
                min: 0,
            },
            legend: {
                show: true,
                position: 'top',
                horizontalAlign: 'right',
                labels: { colors: CHART_COLORS.labelFg },
            },
            grid: {
                borderColor: '#f0f0f0',
                strokeDashArray: 4,
                padding: { top: 0, right: 10, bottom: 0, left: 0 },
            },
            tooltip: {
                shared: true,
                intersect: false,
                y: { formatter: v => v + ' pesan' },
            },
            markers: { size: 3, strokeWidth: 0, hover: { sizeOffset: 4 } },
        }

        if (chartDaily) { chartDaily.destroy() }
        chartDaily = new ApexCharts(el, options)
        chartDaily.render()

        // Update subtitle
        const total = data.reduce((s, d) => s + d.incoming + d.outgoing, 0)
        document.getElementById('chart-daily-subtitle').textContent =
            `${days} hari terakhir &bull; ${total.toLocaleString('id')} total pesan`

    } catch (e) {
        console.error('Error loading daily chart:', e)
    }
}

function switchDailyRange(btn, days) {
    document.querySelectorAll('[onclick^="switchDailyRange"]').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    document.getElementById('chart-daily-messages').innerHTML = '<div class="chart-skeleton"></div>'
    loadDailyChart(days)
}

// ══════════════════════════════════════════════════════════════════
//  CHART 2 — Horizontal Bar Chart: Peak Hours
// ══════════════════════════════════════════════════════════════════
async function loadPeakHoursChart(days = 7) {
    try {
        const res  = await fetch(`/api/stats/messages/peak-hours?days=${days}`)
        const json = await res.json()
        if (!json.success) return

        const data   = json.data  // 24 items, hour 0–23
        const labels = data.map(d => `${String(d.hour).padStart(2,'0')}:00`)
        const totals = data.map(d => d.total)

        // Find max for highlight
        const maxVal = Math.max(...totals)

        const el = document.getElementById('chart-peak-hours')
        el.innerHTML = ''

        const options = {
            series: [{ name: 'Pesan', data: totals }],
            chart: {
                type: 'bar',
                height: 300,
                fontFamily: 'Inter, sans-serif',
                toolbar: { show: false },
            },
            plotOptions: {
                bar: {
                    horizontal: true,
                    borderRadius: 4,
                    distributed: true,
                    barHeight: '70%',
                },
            },
            colors: totals.map(v => v === maxVal ? '#F1416C' : CHART_COLORS.peak),
            dataLabels: { enabled: false },
            xaxis: {
                labels: {
                    style: { colors: CHART_COLORS.text, fontSize: '10px' },
                    formatter: v => Math.round(v),
                },
            },
            yaxis: {
                labels: {
                    style: { colors: CHART_COLORS.text, fontSize: '10px' },
                },
                categories: labels,
            },
            legend: { show: false },
            grid: {
                borderColor: '#f0f0f0',
                strokeDashArray: 4,
                xaxis: { lines: { show: true } },
                yaxis: { lines: { show: false } },
            },
            tooltip: {
                y: { formatter: v => v + ' pesan' },
                x: { formatter: (_, { dataPointIndex }) => labels[dataPointIndex] },
            },
        }

        if (chartPeak) { chartPeak.destroy() }
        chartPeak = new ApexCharts(el, options)
        chartPeak.render()

        // Update labels
        const peakHour = data.find(d => d.total === maxVal)
        document.getElementById('chart-peak-subtitle').innerHTML =
            peakHour && maxVal > 0
                ? `Tersibuk jam <strong>${String(peakHour.hour).padStart(2,'0')}:00</strong> (${maxVal} pesan)`
                : 'Belum ada data'

    } catch (e) {
        console.error('Error loading peak hours chart:', e)
    }
}

function switchPeakRange(btn, days) {
    document.querySelectorAll('[onclick^="switchPeakRange"]').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    document.getElementById('chart-peak-hours').innerHTML = '<div class="chart-skeleton"></div>'
    loadPeakHoursChart(days)
}

// ══════════════════════════════════════════════════════════════════
//  Auto-refresh every 60 seconds
// ══════════════════════════════════════════════════════════════════
setInterval(() => {
    socket.emit('get-sessions')
    updateMessageStats()
}, 60000)

// ══════════════════════════════════════════════════════════════════
//  Init
// ══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    await loadComponents()
    updateMessageStats()
    loadDailyChart(7)
    loadPeakHoursChart(7)
})

console.log('✅ Dashboard initialized')
