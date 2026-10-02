// Check if user is logged in
async function checkAuth() {
    try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (res.ok) {
            const data = await res.json()
            if (data.success && data.user) return true
        }
    } catch (e) {}
    return false
}

// Load components
async function loadComponents() {
    try {
        const isLoggedIn = await checkAuth()

        if (isLoggedIn) {
            // Logged in: load full layout with sidebar & header
            const headerResponse = await fetch('components/header.html')
            const headerHTML = await headerResponse.text()
            document.getElementById('header-container').innerHTML = headerHTML

            const sidebarResponse = await fetch('components/sidebar.html')
            const sidebarHTML = await sidebarResponse.text()
            document.getElementById('sidebar-container').innerHTML = sidebarHTML

            const footerResponse = await fetch('components/footer.html')
            const footerHTML = await footerResponse.text()
            document.getElementById('footer-container').innerHTML = footerHTML
        } else {
            // Not logged in: hide sidebar & header, expand content full-width
            const body = document.getElementById('kt_app_body')
            if (body) {
                body.removeAttribute('data-kt-app-sidebar-enabled')
                body.removeAttribute('data-kt-app-sidebar-fixed')
                body.removeAttribute('data-kt-app-sidebar-hoverable')
                body.removeAttribute('data-kt-app-sidebar-push-header')
                body.removeAttribute('data-kt-app-sidebar-push-toolbar')
                body.removeAttribute('data-kt-app-sidebar-push-footer')
            }
            const headerEl = document.getElementById('header-container')
            if (headerEl) headerEl.remove()
            const sidebarEl = document.getElementById('sidebar-container')
            if (sidebarEl) sidebarEl.remove()
            const footerEl = document.getElementById('footer-container')
            if (footerEl) footerEl.remove()
        }

        console.log('✅ Components loaded')
        
        initializeComponents()
    } catch (error) {
        console.error('❌ Error loading components:', error)
    }
}

function initializeComponents() {
    if (typeof KTMenu !== 'undefined') KTMenu.createInstances()
    if (typeof KTDrawer !== 'undefined') KTDrawer.createInstances()
    if (typeof KTScroll !== 'undefined') KTScroll.createInstances()
    
    // Set active menu
    setActiveMenu()
}

function setActiveMenu() {
    const currentPage = window.location.pathname.split('/').pop()
    const menuLinks = document.querySelectorAll('.menu-link')
    
    menuLinks.forEach(link => {
        const href = link.getAttribute('href')
        if (href === currentPage) {
            link.classList.add('active')
            
            // Expand parent menu if exists
            const parentMenu = link.closest('.menu-sub')
            if (parentMenu) {
                parentMenu.classList.add('show')
                const parentItem = parentMenu.closest('.menu-item')
                if (parentItem) {
                    parentItem.classList.add('hover', 'show')
                }
            }
        }
    })
}

// Copy code to clipboard
function copyCode(button) {
    const codeBlock = button.closest('.code-toolbar').querySelector('code')
    const code = codeBlock.textContent
    
    navigator.clipboard.writeText(code).then(() => {
        const originalText = button.innerHTML
        button.innerHTML = '<i class="bi bi-check"></i> Copied!'
        button.classList.add('btn-success')
        button.classList.remove('btn-light')
        
        setTimeout(() => {
            button.innerHTML = originalText
            button.classList.remove('btn-success')
            button.classList.add('btn-light')
        }, 2000)
    }).catch(err => {
        console.error('Failed to copy:', err)
    })
}

// Add copy button to all code blocks
function addCopyButtons() {
    const codeBlocks = document.querySelectorAll('pre[class*="language-"]')
    
    codeBlocks.forEach(pre => {
        // Skip if already has toolbar
        if (pre.parentElement.classList.contains('code-toolbar')) {
            return
        }
        
        // Wrap in toolbar div
        const toolbar = document.createElement('div')
        toolbar.className = 'code-toolbar'
        pre.parentNode.insertBefore(toolbar, pre)
        toolbar.appendChild(pre)
        
        // Add copy button
        const copyButton = document.createElement('button')
        copyButton.className = 'btn btn-sm btn-light position-absolute top-0 end-0 m-3'
        copyButton.innerHTML = '<i class="bi bi-clipboard"></i> Copy'
        copyButton.onclick = function() { copyCode(this) }
        
        toolbar.style.position = 'relative'
        toolbar.appendChild(copyButton)
    })
}

// Scroll to top functionality
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    })
}

// Show scroll to top button
function handleScrollButton() {
    const scrollBtn = document.getElementById('kt_scrolltop')
    if (scrollBtn) {
        if (window.pageYOffset > 300) {
            scrollBtn.style.display = 'flex'
        } else {
            scrollBtn.style.display = 'none'
        }
    }
}

// Tab navigation via URL hash
function handleTabNavigation() {
    const hash = window.location.hash
    if (hash) {
        const tabTrigger = document.querySelector(`a[href="${hash}"]`)
        if (tabTrigger) {
            const tab = new bootstrap.Tab(tabTrigger)
            tab.show()
        }
    }
    
    // Update URL when tab changes
    const tabLinks = document.querySelectorAll('a[data-bs-toggle="tab"]')
    tabLinks.forEach(link => {
        link.addEventListener('shown.bs.tab', (event) => {
            const hash = event.target.getAttribute('href')
            history.pushState(null, null, hash)
        })
    })
}

// Search functionality in documentation
function initSearch() {
    const searchInput = document.getElementById('doc-search')
    if (!searchInput) return
    
    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase()
        const tabPanes = document.querySelectorAll('.tab-pane')
        
        tabPanes.forEach(pane => {
            const content = pane.textContent.toLowerCase()
            const tabId = pane.getAttribute('id')
            const tabLink = document.querySelector(`a[href="#${tabId}"]`)
            
            if (content.includes(searchTerm)) {
                tabLink.parentElement.style.display = 'block'
            } else {
                tabLink.parentElement.style.display = searchTerm ? 'none' : 'block'
            }
        })
    })
}

// Highlight active endpoint in table
function highlightEndpoint() {
    const rows = document.querySelectorAll('.table tbody tr')
    
    rows.forEach(row => {
        row.addEventListener('click', function() {
            rows.forEach(r => r.classList.remove('table-active'))
            this.classList.add('table-active')
        })
    })
}

// Print documentation
function printDocumentation() {
    window.print()
}

// Export as PDF (using browser print to PDF)
function exportToPDF() {
    window.print()
}

// Initialize tooltips
function initTooltips() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    })
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadComponents()
    
    // Wait for Prism to load
    setTimeout(() => {
        if (typeof Prism !== 'undefined') {
            Prism.highlightAll()
            addCopyButtons()
        }
    }, 500)
    
    handleTabNavigation()
    initSearch()
    highlightEndpoint()
    initTooltips()
})

// Scroll event listener
window.addEventListener('scroll', handleScrollButton)

console.log('✅ API Documentation initialized')

// ========================================================
// SWAGGER INTERACTIVE ACCORDION & CONSOLE LOGIC
// ========================================================

window.currentSwaggerMethod = 'ALL';

// Toggle individual Swagger card
window.toggleSwaggerCard = function(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    const details = card.querySelector('.swagger-details');
    if (!details) return;

    const isVisible = (details.style.display !== 'none');
    if (isVisible) {
        details.style.display = 'none';
        card.classList.remove('is-open');
    } else {
        details.style.display = 'block';
        card.classList.add('is-open');
    }
};

// Global Event Delegation for clicking anywhere on .swagger-summary
document.addEventListener('click', function(e) {
    const summary = e.target.closest('.swagger-summary');
    if (summary) {
        // Do not toggle if user clicked on button, input or link
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) {
            return;
        }
        const card = summary.closest('.swagger-opblock');
        if (card) {
            const details = card.querySelector('.swagger-details');
            if (details) {
                const isVisible = (details.style.display !== 'none');
                if (isVisible) {
                    details.style.display = 'none';
                    card.classList.remove('is-open');
                } else {
                    details.style.display = 'block';
                    card.classList.add('is-open');
                }
            }
        }
    }
});

// Expand all Swagger cards
window.expandAllSwagger = function() {
    document.querySelectorAll('.swagger-opblock').forEach(card => {
        if (card.style.display !== 'none') {
            const details = card.querySelector('.swagger-details');
            if (details) {
                details.style.display = 'block';
                card.classList.add('is-open');
            }
        }
    });
};

// Collapse all Swagger cards
window.collapseAllSwagger = function() {
    document.querySelectorAll('.swagger-opblock').forEach(card => {
        const details = card.querySelector('.swagger-details');
        if (details) {
            details.style.display = 'none';
            card.classList.remove('is-open');
        }
    });
};

// Active method filter handler
window.setSwaggerMethodFilter = function(method, btn) {
    window.currentSwaggerMethod = method;
    document.querySelectorAll('.swagger-filter-btn').forEach(b => {
        b.classList.remove('active');
        b.classList.add('btn-light-' + (b.getAttribute('data-filter') === 'POST' ? 'success' : b.getAttribute('data-filter') === 'PUT' ? 'warning' : b.getAttribute('data-filter') === 'DELETE' ? 'danger' : 'primary'));
    });
    if (btn) {
        btn.classList.add('active');
        btn.classList.remove('btn-light-primary', 'btn-light-success', 'btn-light-warning', 'btn-light-danger');
        btn.classList.add(btn.getAttribute('data-filter') === 'POST' ? 'btn-success' : btn.getAttribute('data-filter') === 'PUT' ? 'btn-warning' : btn.getAttribute('data-filter') === 'DELETE' ? 'btn-danger' : 'btn-primary');
    }
    window.filterSwaggerEndpoints();
};

// Live search and method filtering
window.filterSwaggerEndpoints = function() {
    const searchInput = document.getElementById('swagger-search-input');
    const query = (searchInput ? searchInput.value.toLowerCase().trim() : '');
    const currentMethod = window.currentSwaggerMethod || 'ALL';

    let totalVisible = 0;
    const categories = document.querySelectorAll('.swagger-category-section');

    categories.forEach(cat => {
        let catVisibleCount = 0;
        const cards = cat.querySelectorAll('.swagger-opblock');

        cards.forEach(card => {
            const cardMethod = (card.getAttribute('data-method') || '').toUpperCase();
            const searchData = (card.getAttribute('data-search') || '').toLowerCase();

            const matchesMethod = (currentMethod === 'ALL' || cardMethod === currentMethod);
            const matchesQuery = (!query || searchData.includes(query));

            if (matchesMethod && matchesQuery) {
                card.style.display = '';
                catVisibleCount++;
                totalVisible++;
            } else {
                card.style.display = 'none';
            }
        });

        // Hide entire category block if no endpoints match
        cat.style.display = (catVisibleCount === 0) ? 'none' : '';
    });

    const counter = document.getElementById('swagger-match-counter');
    if (counter) {
        counter.textContent = 'Menampilkan ' + totalVisible + ' dari 97 endpoint';
    }
};

// Copy code with feedback & fallback
window.copySwaggerCode = function(btn, codeText) {
    if (!codeText) return;
    const originalHtml = btn.innerHTML;

    function showSuccess() {
        btn.innerHTML = '<i class="bi bi-check2 text-success me-1"></i>Tersalin!';
        btn.classList.add('btn-light-success');
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.classList.remove('btn-light-success');
        }, 2000);
    }

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(codeText).then(showSuccess).catch(() => {
            fallbackCopy(codeText, showSuccess);
        });
    } else {
        fallbackCopy(codeText, showSuccess);
    }
};

function fallbackCopy(text, callback) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        if (callback) callback();
    } catch (err) {
        console.error('Fallback copy error:', err);
    }
    document.body.removeChild(textArea);
}

// Toggle Try It Out panel
window.toggleSwaggerTryOut = function(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    const panel = card.querySelector('.swagger-tryout-panel');
    if (!panel) return;

    if (panel.style.display === 'none' || !panel.style.display) {
        panel.style.display = 'block';
    } else {
        panel.style.display = 'none';
    }
};

// Execute live API request from Try It Out console
window.executeSwaggerApi = async function(cardId, method, pathPattern) {
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

    let actualPath = pathPattern;
    const pathInputs = card.querySelectorAll('.swagger-try-path-param');
    pathInputs.forEach(input => {
        const paramName = input.getAttribute('data-param');
        const val = encodeURIComponent(input.value.trim());
        actualPath = actualPath.replace(':' + paramName, val || (':' + paramName));
    });

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

    const headers = { 'Accept': 'application/json' };
    const apiKeyInput = card.querySelector('.swagger-try-apikey');
    if (apiKeyInput && apiKeyInput.value.trim()) {
        headers['X-Api-Key'] = apiKeyInput.value.trim();
    }

    const fetchOptions = {
        method: method.toUpperCase(),
        headers: headers,
        credentials: 'include'
    };

    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
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
            resultStatus.textContent = 'Failed';
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
};

window.copySwaggerResult = function(btn) {
    const card = btn.closest('.swagger-opblock');
    if (!card) return;
    const bodyCode = card.querySelector('.swagger-result-body');
    if (!bodyCode) return;
    window.copySwaggerCode(btn, bodyCode.textContent);
};

// Auto update URL origins on load
document.addEventListener('DOMContentLoaded', function() {
    const origin = window.location.origin;
    if (origin && !origin.includes('null')) {
        document.querySelectorAll('.swagger-live-url').forEach(function(el) {
            const p = el.getAttribute('data-path') || el.textContent;
            el.textContent = origin + (p.startsWith('/') ? p : '/' + p);
        });
        document.querySelectorAll('.swagger-curl-text').forEach(function(el) {
            el.textContent = el.textContent.replaceAll('http://localhost:3000', origin);
        });
    }
});
