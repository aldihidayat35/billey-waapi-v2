/**
 * Components Loader - Shared utility for loading HTML components with script execution
 * Include this file before any page-specific JavaScript
 */

// Helper function to load HTML and execute scripts
function loadHTMLWithScripts(containerId, html) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Create a temporary div to parse HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Extract scripts
    const scripts = temp.querySelectorAll('script');
    
    // Remove scripts from temp and add HTML to container
    scripts.forEach(script => script.remove());
    container.innerHTML = temp.innerHTML;
    
    // Execute scripts
    scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        if (oldScript.src) {
            newScript.src = oldScript.src;
        } else {
            newScript.textContent = oldScript.textContent;
        }
        document.body.appendChild(newScript);
    });
}

// Standard component loading function
async function loadStandardComponents() {
    try {
        // Load header
        const headerResponse = await fetch('/components/header.html');
        const headerHTML = await headerResponse.text();
        loadHTMLWithScripts('header-container', headerHTML);
        
        // Load sidebar
        const sidebarResponse = await fetch('/components/sidebar.html');
        const sidebarHTML = await sidebarResponse.text();
        loadHTMLWithScripts('sidebar-container', sidebarHTML);
        
        // Load footer
        const footerResponse = await fetch('/components/footer.html');
        const footerHTML = await footerResponse.text();
        loadHTMLWithScripts('footer-container', footerHTML);
        
        console.log('✅ Components loaded with scripts');
        
        // Initialize Metronic components
        initializeMetronicComponents();
        
        // Initialize header functionality
        if (typeof initializeHeader === 'function') {
            initializeHeader();
        }
        
        return true;
    } catch (error) {
        console.error('❌ Error loading components:', error);
        return false;
    }
}

// Initialize Metronic JS components
function initializeMetronicComponents() {
    if (typeof KTMenu !== 'undefined') KTMenu.createInstances();
    if (typeof KTDrawer !== 'undefined') KTDrawer.createInstances();
    if (typeof KTScroll !== 'undefined') KTScroll.createInstances();
}
