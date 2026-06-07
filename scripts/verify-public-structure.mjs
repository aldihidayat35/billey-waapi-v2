import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const projectRoot = process.cwd()
const publicDir = path.join(projectRoot, 'public')
const adminDir = path.join(publicDir, 'admin')
const serverSourcePath = path.join(projectRoot, 'web-server.ts')

const requiredAdminFiles = [
	'index.html',
	'dashboard.js',
	'app.js',
	'components/header.html',
	'components/sidebar.html',
	'components/footer.html'
]

const requiredPublicEntrypoints = [
	'manifest.json',
	'firebase-messaging-sw.js',
	'auth/login.html',
	'member/dashboard.html',
	'frontend/index.html',
	'frontend/home.html'
]

const requiredServerSnippets = [
	"const publicDir = path.join(__dirname, 'public')",
	"const adminPublicDir = path.join(publicDir, 'admin')",
	'app.use(express.static(publicDir))',
	'app.use(express.static(adminPublicDir))'
]

const missing = []

for (const file of requiredAdminFiles) {
	if (!fs.existsSync(path.join(adminDir, file))) {
		missing.push(`public/admin/${file}`)
	}
}

for (const file of requiredPublicEntrypoints) {
	if (!fs.existsSync(path.join(publicDir, file))) {
		missing.push(`public/${file}`)
	}
}

const serverSource = fs.existsSync(serverSourcePath) ? fs.readFileSync(serverSourcePath, 'utf8') : ''
for (const snippet of requiredServerSnippets) {
	if (!serverSource.includes(snippet)) {
		missing.push(`web-server.ts snippet: ${snippet}`)
	}
}

if (missing.length > 0) {
	console.error('Public structure verification failed.')
	for (const item of missing) {
		console.error(`- Missing ${item}`)
	}
	process.exit(1)
}

console.log('Public structure verification passed.')
