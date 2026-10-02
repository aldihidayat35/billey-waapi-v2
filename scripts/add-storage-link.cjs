const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'public', 'admin', 'components', 'sidebar.html');
let content = fs.readFileSync(file, 'utf8');

const regex = /(<a class="sb-item" href="\/app-settings\.html" data-page="app-settings">.*?<\/a>)/s;

const replacement = `$1
                        <a class="sb-item" href="/manage-storage.html" data-page="manage-storage">
                            <span class="sb-icon"><i class="bi bi-hdd-network"></i></span>
                            <span class="sb-label">Storage Media</span>
                        </a>`;

if(regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync(file, content);
    console.log("Success: sidebar updated via Regex");
} else {
    console.log("Could not find target in sidebar.html via Regex");
}
