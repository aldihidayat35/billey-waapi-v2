const fs = require('fs');
const content = fs.readFileSync('src/web-server.ts', 'utf8');
const search = `		'/guest-session.html',\r
		'/guest-session',`;

const replace = `		'/guest-session.html',\r
		'/guest-session',\r
		'/guest-integration.html',\r
		'/guest-integration',`;

fs.writeFileSync('src/web-server.ts', content.replace(search, replace).replace(search.replace(/\r/g, ''), replace.replace(/\r/g, '')));
