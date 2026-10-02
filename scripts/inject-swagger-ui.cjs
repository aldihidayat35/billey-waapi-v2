const fs = require('fs');
const path = require('path');

const specPath = path.join(__dirname, 'swagger-spec.json');
const endpoints = JSON.parse(fs.readFileSync(specPath, 'utf8'));

console.log(`Loaded ${endpoints.length} endpoints from spec.`);

// Category metadata
const categories = [
    { id: 'api-auth', title: '🔐 Authentication API', icon: 'bi-shield-lock', color: 'primary', desc: 'Endpoint untuk autentikasi user, login, logout, dan manajemen sesi pengguna.' },
    { id: 'api-users', title: '👥 User Management API', icon: 'bi-people', color: 'info', desc: 'Endpoint CRUD user, pembuatan akun member/admin, reset password, dan status user.' },
    { id: 'api-sessions', title: '📱 WhatsApp Sessions API', icon: 'bi-whatsapp', color: 'success', desc: 'Endpoint manajemen koneksi WhatsApp multi-session, QR code, pairing code, dan detail device.' },
    { id: 'api-messages', title: '💬 Messages & WhatsApp Send API', icon: 'bi-chat-dots', color: 'warning', desc: 'Endpoint pengiriman pesan teks, gambar, dokumen, tombol, dan broadcast WhatsApp.' },
    { id: 'api-logs', title: '📊 Message Logs API', icon: 'bi-journal-text', color: 'danger', desc: 'Endpoint audit histori pengiriman pesan WhatsApp, status terkirim, gagal, dan statistik.' },
    { id: 'api-database', title: '🗄️ Database Management API', icon: 'bi-database', color: 'dark', desc: 'Endpoint manajemen database SQLite, tabel, skema, query SELECT, dan download backup DB.' },
    { id: 'api-templates', title: '📝 Message Templates API', icon: 'bi-file-earmark-text', color: 'primary', desc: 'Endpoint pengelolaan template pesan WhatsApp dengan placeholder variabel otomatis.' },
    { id: 'api-autoreply', title: '🤖 Auto Reply & AI API', icon: 'bi-robot', color: 'info', desc: 'Endpoint bot balasan otomatis berbasis keyword trigger, fallback, dan webhook AI/OpenAI.' },
    { id: 'api-groups', title: '👥 WhatsApp Groups API', icon: 'bi-collection', color: 'success', desc: 'Endpoint pengelolaan grup WhatsApp: ambil daftar grup, peserta, invite code, promote/demote admin.' },
    { id: 'api-exports', title: '📤 Exports & Reports API', icon: 'bi-file-earmark-spreadsheet', color: 'warning', desc: 'Endpoint rekapitulasi data kontak grup WhatsApp, download Excel/CSV, dan statistik export.' },
    { id: 'api-health', title: '❤️ Health Check API', icon: 'bi-heart-pulse', color: 'danger', desc: 'Endpoint pemantauan kesehatan server, uptime, alokasi memori RAM, dan status Baileys.' }
];

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getMethodClass(method) {
    switch (method.toUpperCase()) {
        case 'GET': return 'primary';
        case 'POST': return 'success';
        case 'PUT': return 'warning';
        case 'DELETE': return 'danger';
        case 'PATCH': return 'info';
        default: return 'secondary';
    }
}

function getAuthBadge(authType, authDesc) {
    switch (authType) {
        case 'none':
            return `<span class="badge badge-light-success fs-8 fw-semibold"><i class="bi bi-unlock text-success me-1"></i>Publik</span>`;
        case 'session':
            return `<span class="badge badge-light-primary fs-8 fw-semibold"><i class="bi bi-shield-lock text-primary me-1"></i>Session Cookie</span>`;
        case 'apiKey':
            return `<span class="badge badge-light-warning fs-8 fw-semibold"><i class="bi bi-key text-warning me-1"></i>X-Api-Key</span>`;
        case 'bearer':
            return `<span class="badge badge-light-info fs-8 fw-semibold"><i class="bi bi-person-badge text-info me-1"></i>Bearer Token</span>`;
        default:
            return `<span class="badge badge-light-dark fs-8 fw-semibold"><i class="bi bi-shield text-gray-600 me-1"></i>${escapeHtml(authDesc || 'Auth')}</span>`;
    }
}

// Generate cURL command string
function generateCurl(endpoint) {
    const method = endpoint.method.toUpperCase();
    const p = endpoint.path;
    let authHeader = '';
    if (endpoint.authType === 'apiKey') {
        authHeader = ' \\\n  -H "X-Api-Key: WATOKEN-YOUR-API-KEY"';
    } else if (endpoint.authType === 'bearer') {
        authHeader = ' \\\n  -H "Authorization: Bearer YOUR_TOKEN"';
    } else if (endpoint.authType === 'session') {
        authHeader = ' \\\n  -H "Cookie: wa_session=YOUR_SESSION_COOKIE"';
    }

    let bodyStr = '';
    if (endpoint.body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        bodyStr = ` \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(endpoint.body)}'`;
    }

    return `curl -X ${method} "http://localhost:3000${p}" \\\n  -H "Accept: application/json"${authHeader}${bodyStr}`;
}

// Render single endpoint card
function renderEndpointCard(ep, index) {
    const method = ep.method.toUpperCase();
    const methodLower = method.toLowerCase();
    const methodClass = getMethodClass(method);
    const authBadgeHtml = getAuthBadge(ep.authType, ep.auth);
    const curlCommand = generateCurl(ep);
    const cardId = `opblock-${ep.cat}-${index}`;
    const searchTokens = `${method} ${ep.path} ${ep.summary} ${ep.cat} ${ep.auth}`.toLowerCase();

    // Parameters HTML
    let paramsHtml = '';
    if (ep.params && ep.params.length > 0) {
        let rows = ep.params.map(p => {
            const reqBadge = p.required
                ? `<span class="badge badge-light-danger fw-bold fs-9">wajib</span>`
                : `<span class="badge badge-light-secondary fs-9">opsional</span>`;
            const inBadge = `<span class="badge badge-light-dark fs-9">${escapeHtml(p.in || 'body')}</span>`;
            return `
                <tr>
                    <td class="fw-bold font-monospace text-dark fs-7">${escapeHtml(p.name)} ${reqBadge}</td>
                    <td>${inBadge}</td>
                    <td><code class="text-gray-700 fs-8">${escapeHtml(p.type || 'string')}</code></td>
                    <td class="text-gray-600 fs-7">${escapeHtml(p.desc || '-')}</td>
                </tr>
            `;
        }).join('');

        paramsHtml = `
            <div class="table-responsive border rounded-2 mb-4">
                <table class="table table-sm table-row-bordered table-striped align-middle mb-0 param-table">
                    <thead>
                        <tr class="fw-bold fs-8 text-gray-700 bg-light">
                            <th style="min-width: 160px;">Parameter</th>
                            <th style="width: 90px;">Lokasi</th>
                            <th style="width: 90px;">Tipe</th>
                            <th>Keterangan</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    } else {
        paramsHtml = `
            <div class="notice d-flex bg-light-secondary rounded p-3 mb-4">
                <i class="bi bi-info-circle text-muted fs-6 me-2 mt-1"></i>
                <div class="text-gray-600 fs-7">Endpoint ini tidak membutuhkan parameter path atau query tambahan.</div>
            </div>
        `;
    }

    // Request body HTML
    let requestBodyHtml = '';
    if (ep.body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        const bodyJson = JSON.stringify(ep.body, null, 2);
        requestBodyHtml = `
            <div class="mb-5">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="fw-bold text-gray-800 fs-7">
                        <i class="bi bi-file-earmark-code text-primary me-1"></i>Request Body 
                        <span class="badge badge-light-primary fs-9 ms-1 font-monospace">application/json</span>
                    </span>
                    <button type="button" class="btn btn-xs btn-light py-1 px-2 fs-8 copy-btn" onclick="copySwaggerCode(this, ${escapeAttr(JSON.stringify(bodyJson))})">
                        <i class="bi bi-clipboard me-1"></i>Salin JSON
                    </button>
                </div>
                <div class="swagger-code-box">
                    <pre class="bg-dark text-gray-200 p-3 rounded-2 fs-8 font-monospace mb-0 overflow-auto" style="max-height: 250px;"><code>${escapeHtml(bodyJson)}</code></pre>
                </div>
            </div>
        `;
    }

    // Responses HTML
    let responsesHtml = '';
    if (ep.responses) {
        const statusCards = Object.entries(ep.responses).map(([code, data]) => {
            const is2xx = code.startsWith('2');
            const is4xx = code.startsWith('4');
            const is5xx = code.startsWith('5');
            const badgeClass = is2xx ? 'badge-success' : is4xx ? 'badge-warning' : 'badge-danger';
            const statusLabel = is2xx ? 'OK / Berhasil' : is4xx ? 'Client Error' : 'Server Error';
            const respJson = JSON.stringify(data, null, 2);

            return `
                <div class="border rounded-2 p-3 mb-3 bg-light-subtle">
                    <div class="d-flex align-items-center justify-content-between mb-2">
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge ${badgeClass} fs-8 fw-bold">${code}</span>
                            <span class="text-gray-800 fw-semibold fs-7">${statusLabel}</span>
                        </div>
                        <button type="button" class="btn btn-xs btn-light py-1 px-2 fs-8 copy-btn" onclick="copySwaggerCode(this, ${escapeAttr(JSON.stringify(respJson))})">
                            <i class="bi bi-clipboard me-1"></i>Salin Respon
                        </button>
                    </div>
                    <pre class="bg-dark text-gray-200 p-3 rounded-2 fs-8 font-monospace mb-0 overflow-auto" style="max-height: 250px;"><code>${escapeHtml(respJson)}</code></pre>
                </div>
            `;
        }).join('');

        responsesHtml = `
            <div class="mb-5">
                <span class="fw-bold text-gray-800 fs-7 d-block mb-2">
                    <i class="bi bi-arrow-return-right text-success me-1"></i>Respon API
                </span>
                ${statusCards}
            </div>
        `;
    }

    // Try It Out form generation
    // Extract path params e.g. :sessionId, :id
    const pathParamMatches = (ep.path.match(/:[a-zA-Z0-9_]+/g) || []).map(p => p.substring(1));
    const queryParams = (ep.params || []).filter(p => p.in === 'query');
    const headerParams = (ep.params || []).filter(p => p.in === 'header');

    let tryOutInputsHtml = '';
    if (pathParamMatches.length > 0) {
        tryOutInputsHtml += `<div class="mb-3"><label class="form-label fw-bold fs-8 text-gray-700">Path Parameters:</label><div class="row g-2">`;
        pathParamMatches.forEach(pname => {
            let defaultVal = '';
            if (pname.includes('session') || pname.includes('Session')) defaultVal = 'gudangtoko-main';
            else if (pname.includes('group') || pname.includes('Group')) defaultVal = '120363041234567890@g.us';
            else if (pname === 'id') defaultVal = '1';
            tryOutInputsHtml += `
                <div class="col-md-6">
                    <div class="input-group input-group-sm">
                        <span class="input-group-text bg-light font-monospace fs-8">:${pname}</span>
                        <input type="text" class="form-control form-control-sm swagger-try-path-param" data-param="${pname}" value="${defaultVal}" placeholder="nilai :${pname}">
                    </div>
                </div>
            `;
        });
        tryOutInputsHtml += `</div></div>`;
    }

    if (queryParams.length > 0) {
        tryOutInputsHtml += `<div class="mb-3"><label class="form-label fw-bold fs-8 text-gray-700">Query Parameters:</label><div class="row g-2">`;
        queryParams.forEach(qp => {
            tryOutInputsHtml += `
                <div class="col-md-6">
                    <div class="input-group input-group-sm">
                        <span class="input-group-text bg-light font-monospace fs-8">${escapeHtml(qp.name)}</span>
                        <input type="text" class="form-control form-control-sm swagger-try-query-param" data-query="${escapeHtml(qp.name)}" value="" placeholder="opsional">
                    </div>
                </div>
            `;
        });
        tryOutInputsHtml += `</div></div>`;
    }

    // Auth Header input (optional custom key)
    let authInputHtml = '';
    if (ep.authType === 'apiKey') {
        authInputHtml = `
            <div class="mb-3">
                <label class="form-label fw-bold fs-8 text-gray-700">X-Api-Key Header:</label>
                <input type="text" class="form-control form-control-sm swagger-try-apikey font-monospace" placeholder="WATOKEN-..." value="">
                <div class="form-text fs-9 text-muted">Kosongkan jika ingin menggunakan cookie sesi login Anda saat ini secara otomatis.</div>
            </div>
        `;
    }

    // Body JSON textarea for POST/PUT/PATCH
    let bodyTextareaHtml = '';
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        const initialBody = ep.body ? JSON.stringify(ep.body, null, 2) : '{}';
        bodyTextareaHtml = `
            <div class="mb-3">
                <label class="form-label fw-bold fs-8 text-gray-700">Request Body (JSON):</label>
                <textarea class="form-control form-control-sm swagger-try-body font-monospace fs-8" rows="5" spellcheck="false">${escapeHtml(initialBody)}</textarea>
            </div>
        `;
    }

    return `
        <div class="swagger-opblock opblock-${methodLower} mb-3 border rounded-3 overflow-hidden shadow-xs" id="${cardId}" data-method="${method}" data-path="${escapeAttr(ep.path)}" data-search="${escapeAttr(searchTokens)}">
            <!-- Summary Header (Click to toggle) -->
            <div class="swagger-summary d-flex align-items-center justify-content-between p-3 cursor-pointer user-select-none" onclick="toggleSwaggerCard('${cardId}')">
                <div class="d-flex align-items-center flex-grow-1 flex-wrap gap-2 me-3">
                    <span class="swagger-method badge badge-${methodClass} fs-8 fw-bolder text-uppercase py-2 px-3" style="min-width: 75px; text-align: center;">${method}</span>
                    <code class="swagger-path fs-7 fw-bold text-dark px-2 py-1 rounded bg-light border">${escapeHtml(ep.path)}</code>
                    <span class="swagger-title text-gray-700 fw-semibold fs-7">${escapeHtml(ep.summary)}</span>
                </div>
                <div class="d-flex align-items-center gap-3 ms-auto">
                    ${authBadgeHtml}
                    <i class="bi bi-chevron-down swagger-arrow fs-5 text-gray-500"></i>
                </div>
            </div>

            <!-- Details Body (Expandable) -->
            <div class="swagger-details border-top" style="display: none;">
                <div class="p-5 bg-white">
                    <!-- Description & Full URL -->
                    <div class="mb-4 pb-3 border-bottom">
                        <p class="text-gray-700 fs-7 mb-2">${escapeHtml(ep.desc)}</p>
                        <div class="d-flex flex-wrap gap-3 align-items-center text-muted fs-8">
                            <div><i class="bi bi-shield-check text-primary me-1"></i>Otorisasi: <strong class="text-gray-800">${escapeHtml(ep.auth)}</strong></div>
                            <div><i class="bi bi-link-45deg text-success me-1"></i>URL Endpoint: <code class="swagger-live-url text-primary font-monospace fs-8">${escapeHtml(ep.path)}</code></div>
                        </div>
                    </div>

                    <!-- Parameters Section -->
                    <div class="mb-4">
                        <span class="fw-bold text-gray-800 fs-7 d-block mb-2"><i class="bi bi-sliders text-primary me-1"></i>Parameter</span>
                        ${paramsHtml}
                    </div>

                    <!-- Request Body (if any) -->
                    ${requestBodyHtml}

                    <!-- Responses Section -->
                    ${responsesHtml}

                    <!-- cURL Command -->
                    <div class="mb-4">
                        <div class="d-flex align-items-center justify-content-between mb-2">
                            <span class="fw-bold text-gray-800 fs-7">
                                <i class="bi bi-terminal text-warning me-1"></i>Contoh cURL
                            </span>
                            <button type="button" class="btn btn-xs btn-light-warning py-1 px-2 fs-8 copy-btn" onclick="copySwaggerCode(this, ${escapeAttr(JSON.stringify(curlCommand))})">
                                <i class="bi bi-clipboard me-1"></i>Salin cURL
                            </button>
                        </div>
                        <pre class="bg-dark text-warning p-3 rounded-2 fs-8 font-monospace mb-0 overflow-auto" style="max-height: 200px;"><code class="swagger-curl-text">${escapeHtml(curlCommand)}</code></pre>
                    </div>

                    <!-- Interactive Try It Out Console -->
                    <div class="card border border-dashed border-primary rounded-3 bg-light-primary bg-opacity-10 mt-5">
                        <div class="card-header border-0 py-2 px-4 d-flex align-items-center justify-content-between min-h-40px bg-light-primary">
                            <span class="fs-7 fw-bold text-primary mb-0">
                                <i class="bi bi-play-circle-fill text-primary me-1"></i>Try It Out (Uji Coba Langsung)
                            </span>
                            <button type="button" class="btn btn-xs btn-primary py-1 px-3 fw-bold" onclick="toggleSwaggerTryOut('${cardId}')">
                                <i class="bi bi-cpu me-1"></i>Buka Console
                            </button>
                        </div>
                        <div class="card-body p-4 swagger-tryout-panel" style="display: none;">
                            ${authInputHtml}
                            ${tryOutInputsHtml}
                            ${bodyTextareaHtml}

                            <div class="d-flex gap-2 mb-3">
                                <button type="button" class="btn btn-sm btn-primary fw-bold swagger-exec-btn" onclick="executeSwaggerApi('${cardId}', '${method}', '${escapeAttr(ep.path)}')">
                                    <i class="bi bi-send-fill me-1"></i>Kirim Request (Execute)
                                </button>
                                <button type="button" class="btn btn-sm btn-light" onclick="toggleSwaggerTryOut('${cardId}')">
                                    Tutup Console
                                </button>
                            </div>

                            <!-- Live Result Output -->
                            <div class="swagger-live-result rounded-2 p-3 bg-white border" style="display: none;">
                                <div class="d-flex align-items-center justify-content-between mb-2 pb-2 border-bottom">
                                    <div class="d-flex align-items-center gap-2">
                                        <span class="fw-bold fs-8 text-gray-700">Status:</span>
                                        <span class="swagger-result-status badge badge-success fs-8">200 OK</span>
                                        <span class="swagger-result-time badge badge-light fs-9 text-muted">0 ms</span>
                                    </div>
                                    <button type="button" class="btn btn-xs btn-light py-1 px-2 fs-8 copy-btn" onclick="copySwaggerResult(this)">
                                        <i class="bi bi-clipboard me-1"></i>Salin Output
                                    </button>
                                </div>
                                <div class="mb-2 text-muted fs-8">
                                    Request URL: <code class="swagger-result-url font-monospace text-dark fs-8"></code>
                                </div>
                                <pre class="bg-dark text-white p-3 rounded fs-8 font-monospace mb-0 overflow-auto" style="max-height: 300px;"><code class="swagger-result-body"></code></pre>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    `;
}

// Build the complete Swagger section
let fullHtml = `
<!-- ============================================ -->
<!-- INTERACTIVE SWAGGER-STYLE REST API REFERENCE -->
<!-- ============================================ -->

<!-- Global Search & Method Filters Toolbar -->
<div class="card bg-light-primary border border-primary border-dashed mb-8 shadow-xs">
    <div class="card-body p-5">
        <div class="row g-4 align-items-center">
            <div class="col-lg-5">
                <div class="position-relative">
                    <i class="bi bi-search position-absolute top-50 translate-middle-y ms-4 text-gray-500 fs-5"></i>
                    <input type="text" id="swagger-search-input" class="form-control form-control-solid ps-12 fs-7" placeholder="Cari endpoint, path, method, atau kata kunci..." oninput="filterSwaggerEndpoints()">
                </div>
            </div>
            <div class="col-lg-5">
                <div class="d-flex flex-wrap gap-1 align-items-center">
                    <button type="button" class="btn btn-sm btn-primary swagger-filter-btn active" data-filter="ALL" onclick="setSwaggerMethodFilter('ALL', this)">ALL <span class="badge badge-light-primary ms-1">97</span></button>
                    <button type="button" class="btn btn-sm btn-light-primary swagger-filter-btn" data-filter="GET" onclick="setSwaggerMethodFilter('GET', this)">GET <span class="badge badge-light-primary ms-1">32</span></button>
                    <button type="button" class="btn btn-sm btn-light-success swagger-filter-btn" data-filter="POST" onclick="setSwaggerMethodFilter('POST', this)">POST <span class="badge badge-light-success ms-1">45</span></button>
                    <button type="button" class="btn btn-sm btn-light-warning swagger-filter-btn" data-filter="PUT" onclick="setSwaggerMethodFilter('PUT', this)">PUT <span class="badge badge-light-warning ms-1">9</span></button>
                    <button type="button" class="btn btn-sm btn-light-danger swagger-filter-btn" data-filter="DELETE" onclick="setSwaggerMethodFilter('DELETE', this)">DELETE <span class="badge badge-light-danger ms-1">11</span></button>
                </div>
            </div>
            <div class="col-lg-2 text-lg-end">
                <button type="button" class="btn btn-sm btn-light me-1" onclick="expandAllSwagger()"><i class="bi bi-arrows-expand me-1"></i>Buka Semua</button>
                <button type="button" class="btn btn-sm btn-light" onclick="collapseAllSwagger()"><i class="bi bi-arrows-collapse me-1"></i>Tutup Semua</button>
            </div>
        </div>
        <div class="d-flex align-items-center justify-content-between mt-3 pt-3 border-top border-gray-300">
            <div class="text-muted fs-8">
                <i class="bi bi-info-circle me-1"></i>Klik pada setiap baris endpoint untuk membuka detail parameter, response, cURL, dan uji coba interaktif (Try it out).
            </div>
            <div class="badge badge-light-primary fs-8" id="swagger-match-counter">
                Menampilkan 97 dari 97 endpoint
            </div>
        </div>
    </div>
</div>
`;

// Render each category
categories.forEach(cat => {
    const catEndpoints = endpoints.filter(e => e.cat === cat.id);
    fullHtml += `
        <!-- ============================================ -->
        <!-- CATEGORY: ${cat.title} -->
        <!-- ============================================ -->
        <div class="swagger-category-section mb-10" id="${cat.id}">
            <div class="d-flex align-items-center justify-content-between pb-3 mb-4 border-bottom">
                <div class="d-flex align-items-center gap-3">
                    <span class="symbol symbol-40px">
                        <span class="symbol-label bg-light-${cat.color} text-${cat.color}">
                            <i class="bi ${cat.icon} fs-3"></i>
                        </span>
                    </span>
                    <div>
                        <h4 class="fw-bold mb-0 text-gray-900">${cat.title}</h4>
                        <div class="text-muted fs-7">${cat.desc}</div>
                    </div>
                </div>
                <span class="badge badge-light-${cat.color} fs-8 fw-bold">${catEndpoints.length} Endpoints</span>
            </div>
            <div class="swagger-category-endpoints">
    `;

    catEndpoints.forEach((ep, idx) => {
        fullHtml += renderEndpointCard(ep, idx);
    });

    fullHtml += `
            </div>
        </div>
    `;
});

// Swagger CSS to inject into <head><style>
const swaggerCss = `
        /* ========================================================
           SWAGGER INTERACTIVE ACCORDION & CONSOLE STYLES
           ======================================================== */
        .swagger-opblock {
            background: #ffffff;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
        .swagger-opblock:hover {
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
        }
        .swagger-opblock.opblock-get {
            border-color: #009EF7 !important;
        }
        .swagger-opblock.opblock-get .swagger-summary {
            background-color: rgba(0, 158, 247, 0.05);
        }
        .swagger-opblock.opblock-get .swagger-summary:hover {
            background-color: rgba(0, 158, 247, 0.1);
        }
        .swagger-opblock.opblock-get .swagger-method {
            background-color: #009EF7;
            color: #ffffff;
        }

        .swagger-opblock.opblock-post {
            border-color: #50cd89 !important;
        }
        .swagger-opblock.opblock-post .swagger-summary {
            background-color: rgba(80, 205, 137, 0.05);
        }
        .swagger-opblock.opblock-post .swagger-summary:hover {
            background-color: rgba(80, 205, 137, 0.1);
        }
        .swagger-opblock.opblock-post .swagger-method {
            background-color: #50cd89;
            color: #ffffff;
        }

        .swagger-opblock.opblock-put {
            border-color: #ffc700 !important;
        }
        .swagger-opblock.opblock-put .swagger-summary {
            background-color: rgba(255, 199, 0, 0.07);
        }
        .swagger-opblock.opblock-put .swagger-summary:hover {
            background-color: rgba(255, 199, 0, 0.12);
        }
        .swagger-opblock.opblock-put .swagger-method {
            background-color: #f1a80a;
            color: #ffffff;
        }

        .swagger-opblock.opblock-delete {
            border-color: #f1416c !important;
        }
        .swagger-opblock.opblock-delete .swagger-summary {
            background-color: rgba(241, 65, 108, 0.05);
        }
        .swagger-opblock.opblock-delete .swagger-summary:hover {
            background-color: rgba(241, 65, 108, 0.1);
        }
        .swagger-opblock.opblock-delete .swagger-method {
            background-color: #f1416c;
            color: #ffffff;
        }

        .swagger-opblock.opblock-patch {
            border-color: #7239ea !important;
        }
        .swagger-opblock.opblock-patch .swagger-summary {
            background-color: rgba(114, 57, 234, 0.05);
        }
        .swagger-opblock.opblock-patch .swagger-summary:hover {
            background-color: rgba(114, 57, 234, 0.1);
        }
        .swagger-opblock.opblock-patch .swagger-method {
            background-color: #7239ea;
            color: #ffffff;
        }

        .swagger-arrow {
            transition: transform 0.25s ease;
        }
        .swagger-opblock.is-open .swagger-arrow {
            transform: rotate(180deg);
        }

        .swagger-summary {
            border-radius: 0.5rem;
            transition: background-color 0.2s ease;
        }
        .swagger-opblock.is-open .swagger-summary {
            border-bottom-left-radius: 0 !important;
            border-bottom-right-radius: 0 !important;
        }

        .param-table th {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            background: #f8f9fa;
            color: #5e6278;
            padding: 8px 12px;
        }
        .param-table td {
            padding: 8px 12px;
            vertical-align: middle;
            font-size: 0.825rem;
        }

        .swagger-filter-btn.active {
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
        }
`;

// Swagger JS to inject before </body>
const swaggerJs = `
    <!-- Swagger Interactive Accordion & Try It Out Logic -->
    <script>
        // Toggle individual Swagger card
        function toggleSwaggerCard(cardId) {
            const card = document.getElementById(cardId);
            if (!card) return;
            const details = card.querySelector('.swagger-details');
            if (!details) return;
            
            const isOpen = card.classList.contains('is-open');
            if (isOpen) {
                details.style.display = 'none';
                card.classList.remove('is-open');
            } else {
                details.style.display = 'block';
                card.classList.add('is-open');
            }
        }

        // Expand all Swagger cards
        function expandAllSwagger() {
            document.querySelectorAll('.swagger-opblock').forEach(card => {
                if (card.style.display !== 'none') {
                    const details = card.querySelector('.swagger-details');
                    if (details) {
                        details.style.display = 'block';
                        card.classList.add('is-open');
                    }
                }
            });
        }

        // Collapse all Swagger cards
        function collapseAllSwagger() {
            document.querySelectorAll('.swagger-opblock').forEach(card => {
                const details = card.querySelector('.swagger-details');
                if (details) {
                    details.style.display = 'none';
                    card.classList.remove('is-open');
                }
            });
        }

        // Active method filter state
        let currentMethodFilter = 'ALL';

        function setSwaggerMethodFilter(method, btn) {
            currentMethodFilter = method;
            document.querySelectorAll('.swagger-filter-btn').forEach(b => b.classList.remove('active'));
            if (btn) btn.classList.add('active');
            filterSwaggerEndpoints();
        }

        // Live search and method filtering
        function filterSwaggerEndpoints() {
            const searchInput = document.getElementById('swagger-search-input');
            const query = (searchInput ? searchInput.value.toLowerCase().trim() : '');
            
            let totalVisible = 0;
            const categories = document.querySelectorAll('.swagger-category-section');

            categories.forEach(cat => {
                let catVisibleCount = 0;
                const cards = cat.querySelectorAll('.swagger-opblock');
                
                cards.forEach(card => {
                    const cardMethod = card.getAttribute('data-method') || '';
                    const searchData = card.getAttribute('data-search') || '';
                    
                    const matchesMethod = (currentMethodFilter === 'ALL' || cardMethod === currentMethodFilter);
                    const matchesQuery = (!query || searchData.includes(query));
                    
                    if (matchesMethod && matchesQuery) {
                        card.style.display = '';
                        catVisibleCount++;
                        totalVisible++;
                    } else {
                        card.style.display = 'none';
                    }
                });

                if (catVisibleCount === 0) {
                    cat.style.display = 'none';
                } else {
                    cat.style.display = '';
                }
            });

            const counter = document.getElementById('swagger-match-counter');
            if (counter) {
                counter.textContent = 'Menampilkan ' + totalVisible + ' dari 97 endpoint';
            }
        }

        // Copy code helper with visual feedback
        function copySwaggerCode(btn, codeText) {
            if (!codeText) return;
            navigator.clipboard.writeText(codeText).then(() => {
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<i class="bi bi-check2 text-success me-1"></i>Tersalin!';
                btn.classList.add('btn-light-success');
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                    btn.classList.remove('btn-light-success');
                }, 2000);
            }).catch(err => {
                console.error('Clipboard copy failed:', err);
            });
        }

        // Toggle Try It Out panel
        function toggleSwaggerTryOut(cardId) {
            const card = document.getElementById(cardId);
            if (!card) return;
            const panel = card.querySelector('.swagger-tryout-panel');
            if (!panel) return;
            
            if (panel.style.display === 'none' || !panel.style.display) {
                panel.style.display = 'block';
            } else {
                panel.style.display = 'none';
            }
        }

        // Execute live API request from Try It Out console
        async function executeSwaggerApi(cardId, method, pathPattern) {
            const card = document.getElementById(cardId);
            if (!card) return;

            const execBtn = card.querySelector('.swagger-exec-btn');
            const resultBox = card.querySelector('.swagger-live-result');
            const resultStatus = card.querySelector('.swagger-result-status');
            const resultTime = card.querySelector('.swagger-result-time');
            const resultUrl = card.querySelector('.swagger-result-url');
            const resultBody = card.querySelector('.swagger-result-body');

            if (execBtn) {
                execBtn.disabled = true;
                execBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Mengirim...';
            }

            // Build actual path by replacing path params
            let actualPath = pathPattern;
            const pathInputs = card.querySelectorAll('.swagger-try-path-param');
            pathInputs.forEach(input => {
                const paramName = input.getAttribute('data-param');
                const val = encodeURIComponent(input.value.trim());
                actualPath = actualPath.replace(':' + paramName, val || (':' + paramName));
            });

            // Append query params
            const queryInputs = card.querySelectorAll('.swagger-try-query-param');
            const queryParts = [];
            queryInputs.forEach(input => {
                const qName = input.getAttribute('data-query');
                const qVal = input.value.trim();
                if (qVal) {
                    queryParts.push(encodeURIComponent(qName) + '=' + encodeURIComponent(qVal));
                }
            });

            if (queryParts.length > 0) {
                actualPath += (actualPath.includes('?') ? '&' : '?') + queryParts.join('&');
            }

            const fullUrl = window.location.origin + actualPath;
            if (resultUrl) resultUrl.textContent = fullUrl;

            // Headers & options
            const headers = {
                'Accept': 'application/json'
            };

            const apiKeyInput = card.querySelector('.swagger-try-apikey');
            if (apiKeyInput && apiKeyInput.value.trim()) {
                headers['X-Api-Key'] = apiKeyInput.value.trim();
            }

            const fetchOptions = {
                method: method.toUpperCase(),
                headers: headers,
                credentials: 'include'
            };

            if (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT' || method.toUpperCase() === 'PATCH') {
                const bodyTextarea = card.querySelector('.swagger-try-body');
                if (bodyTextarea && bodyTextarea.value.trim()) {
                    try {
                        JSON.parse(bodyTextarea.value.trim());
                        headers['Content-Type'] = 'application/json';
                        fetchOptions.body = bodyTextarea.value.trim();
                    } catch (jsonErr) {
                        alert('Format JSON pada Request Body tidak valid: ' + jsonErr.message);
                        if (execBtn) {
                            execBtn.disabled = false;
                            execBtn.innerHTML = '<i class="bi bi-send-fill me-1"></i>Kirim Request (Execute)';
                        }
                        return;
                    }
                }
            }

            const startTime = performance.now();
            try {
                const response = await fetch(actualPath, fetchOptions);
                const duration = Math.round(performance.now() - startTime);

                const status = response.status;
                const statusText = response.statusText || '';
                let responseData = '';
                const contentType = response.headers.get('content-type') || '';

                if (contentType.includes('application/json')) {
                    const json = await response.json();
                    responseData = JSON.stringify(json, null, 2);
                } else {
                    responseData = await response.text();
                }

                if (resultStatus) {
                    resultStatus.textContent = status + ' ' + statusText;
                    resultStatus.className = 'swagger-result-status badge fs-8 ' + (response.ok ? 'badge-success' : (status < 500 ? 'badge-warning' : 'badge-danger'));
                }
                if (resultTime) resultTime.textContent = duration + ' ms';
                if (resultBody) resultBody.textContent = responseData;
                if (resultBox) resultBox.style.display = 'block';

            } catch (err) {
                const duration = Math.round(performance.now() - startTime);
                if (resultStatus) {
                    resultStatus.textContent = 'Error / Failed';
                    resultStatus.className = 'swagger-result-status badge badge-danger fs-8';
                }
                if (resultTime) resultTime.textContent = duration + ' ms';
                if (resultBody) resultBody.textContent = 'Network Error: ' + err.message;
                if (resultBox) resultBox.style.display = 'block';
            } finally {
                if (execBtn) {
                    execBtn.disabled = false;
                    execBtn.innerHTML = '<i class="bi bi-send-fill me-1"></i>Kirim Request (Execute)';
                }
            }
        }

        // Copy output result from Try It Out box
        function copySwaggerResult(btn) {
            const card = btn.closest('.swagger-opblock');
            if (!card) return;
            const bodyCode = card.querySelector('.swagger-result-body');
            if (!bodyCode) return;
            copySwaggerCode(btn, bodyCode.textContent);
        }

        // Update URLs and cURLs dynamically on load
        document.addEventListener('DOMContentLoaded', () => {
            const origin = window.location.origin;
            if (origin && !origin.includes('null')) {
                document.querySelectorAll('.swagger-live-url').forEach(el => {
                    const p = el.getAttribute('data-path') || el.textContent;
                    el.textContent = origin + (p.startsWith('/') ? p : '/' + p);
                });
                document.querySelectorAll('.swagger-curl-text').forEach(el => {
                    el.textContent = el.textContent.replaceAll('http://localhost:3000', origin);
                });
            }
        });
    </script>
`;

// Now let's inject this into public/admin/api-docs.html
const apiDocsPath = path.join(__dirname, '..', 'public', 'admin', 'api-docs.html');
let apiDocsContent = fs.readFileSync(apiDocsPath, 'utf8');

// Inject CSS inside <style>
if (!apiDocsContent.includes('SWAGGER INTERACTIVE ACCORDION')) {
    apiDocsContent = apiDocsContent.replace('</style>', `${swaggerCss}\n    </style>`);
}

// Find markers
const authMarker = '<!-- AUTHENTICATION API -->';
const socketMarker = '<!-- SOCKET.IO EVENTS -->';

const authIndex = apiDocsContent.indexOf(authMarker);
const socketIndex = apiDocsContent.indexOf(socketMarker);

if (authIndex === -1 || socketIndex === -1) {
    console.error('Could not find markers in api-docs.html!');
    console.log('authIndex:', authIndex, 'socketIndex:', socketIndex);
    process.exit(1);
}

// Find the line preceding authMarker
const beforeAuth = apiDocsContent.lastIndexOf('<!-- ============================================ -->', authIndex);
// Find the line before socketMarker
const beforeSocket = apiDocsContent.lastIndexOf('<!-- ============================================ -->', socketIndex);

const beforePart = apiDocsContent.substring(0, beforeAuth);
const afterPart = apiDocsContent.substring(beforeSocket);

let updatedContent = beforePart + fullHtml + afterPart;

// Inject JS before </body>
if (!updatedContent.includes('toggleSwaggerCard')) {
    updatedContent = updatedContent.replace('</body>', `${swaggerJs}\n</body>`);
}

fs.writeFileSync(apiDocsPath, updatedContent, 'utf8');
console.log('Successfully injected Swagger REST API UI, CSS, and JS into public/admin/api-docs.html!');

