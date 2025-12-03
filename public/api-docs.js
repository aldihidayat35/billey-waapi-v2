// Load components
async function loadComponents() {
    try {
        const headerResponse = await fetch('components/header.html')
        const headerHTML = await headerResponse.text()
        document.getElementById('header-container').innerHTML = headerHTML
        
        const sidebarResponse = await fetch('components/sidebar.html')
        const sidebarHTML = await sidebarResponse.text()
        document.getElementById('sidebar-container').innerHTML = sidebarHTML
        
        const footerResponse = await fetch('components/footer.html')
        const footerHTML = await footerResponse.text()
        document.getElementById('footer-container').innerHTML = footerHTML
        
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
