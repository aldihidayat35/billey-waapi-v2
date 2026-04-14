/**
 * App Init — Dynamic Branding
 * Loads app settings from /api/settings/public and applies:
 *   - Favicon
 *   - Page title suffix
 *   - Sidebar logo (default + minimize)
 *   - Mobile header logo
 *   - App name text elements
 *
 * Include this script in <head> or before </body> on every page.
 * Works even on login page (no auth required).
 */
(async function initAppBranding() {
    try {
        const res = await fetch('/api/settings/public');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;
        const s = data.settings;

        // Store globally for other scripts
        window.APP_SETTINGS = s;

        // 1. Update favicon
        if (s.favicon_url) {
            const links = document.querySelectorAll("link[rel~='icon'], link[rel='shortcut icon']");
            if (links.length) {
                links.forEach(l => { l.href = s.favicon_url; });
            } else {
                const link = document.createElement('link');
                link.rel = 'icon';
                link.href = s.favicon_url;
                document.head.appendChild(link);
            }
        }

        // 2. Update document title — replace suffix after last " - "
        if (s.app_name) {
            const t = document.title;
            const sep = t.lastIndexOf(' - ');
            if (sep !== -1) {
                document.title = t.substring(0, sep) + ' - ' + s.app_name;
            }
        }

        // 3. Update sidebar logos (set after DOM is ready / sidebar is loaded)
        function applyLogos() {
            const logoDefault  = document.getElementById('sidebar-logo-default');
            const logoMinimize = document.getElementById('sidebar-logo-minimize');
            const logoMobile   = document.getElementById('header-logo-mobile');
            const loginLogo    = document.getElementById('login-logo-img');
            const loginAppName = document.getElementById('login-app-name');
            const sidebarAppName = document.getElementById('sidebar-app-name');

            if (logoDefault && s.logo_url) {
                logoDefault.src = s.logo_url;
                // Remove the default-SVG filter so custom logos show original colors
                logoDefault.removeAttribute('data-is-default');
            }
            if (logoMinimize) {
                const smallUrl = s.logo_small_url || s.logo_url;
                if (smallUrl) {
                    logoMinimize.src = smallUrl;
                    logoMinimize.removeAttribute('data-is-default');
                }
            }
            if (logoMobile) logoMobile.src = s.logo_small_url || s.logo_url || logoMobile.src;

            if (loginLogo) {
                if (s.logo_url) {
                    loginLogo.src = s.logo_url;
                    loginLogo.style.display = '';
                    const iconEl = document.getElementById('login-logo-icon');
                    if (iconEl) iconEl.style.display = 'none';
                }
            }
            if (loginAppName)    loginAppName.textContent    = s.app_name;
            // Update sidebar app name text next to logo
            if (sidebarAppName && s.app_name) sidebarAppName.textContent = s.app_name;

            // Any element with data-app-name attribute
            document.querySelectorAll('[data-app-name]').forEach(el => {
                el.textContent = s.app_name;
            });
        }

        // Apply immediately (for elements already in DOM)
        applyLogos();

        // Re-apply after DOM fully loaded (for async-loaded components)
        if (document.readyState !== 'complete') {
            window.addEventListener('load', applyLogos);
        }

        // Re-apply when sidebar/header components finish loading (custom event)
        document.addEventListener('components-loaded', applyLogos);

    } catch (e) {
        // Non-critical — silently fail
    }
})();
