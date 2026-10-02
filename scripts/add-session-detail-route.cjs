const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'web-server.ts');
let content = fs.readFileSync(file, 'utf8');

const targetAnchor = "// Get session info (for inbox page)";

const newRoute = `// Get comprehensive session detail (for session-detail.html)
app.get('/api/sessions/:sessionId/detail', optionalAuthMiddleware, async (req, res) => {
\ttry {
\t\tconst rawId = req.params.sessionId
\t\tconst session = sessionManager.getSession(rawId)
\t\t
\t\tconst sessionBaseDir = process.env.SESSION_DIR || './sessions'
\t\tlet existsOnDisk = false
\t\tlet credsUser: any = null
\t\tlet diskSessionId = rawId

\t\tif (!session && fs.existsSync(sessionBaseDir)) {
\t\t\tconst entries = fs.readdirSync(sessionBaseDir)
\t\t\tconst norm = (s: string) => s.toLowerCase().replace(/[\\s_-]+/g, '_')
\t\t\tconst matchedDir = entries.find(e => norm(e) === norm(rawId) || e === rawId)
\t\t\tif (matchedDir) {
\t\t\t\texistsOnDisk = true
\t\t\t\tdiskSessionId = matchedDir
\t\t\t\tconst credsPath = path.join(sessionBaseDir, matchedDir, 'creds.json')
\t\t\t\tif (fs.existsSync(credsPath)) {
\t\t\t\t\ttry {
\t\t\t\t\t\tconst credsData = JSON.parse(fs.readFileSync(credsPath, 'utf-8'))
\t\t\t\t\t\tcredsUser = credsData.me || null
\t\t\t\t\t} catch {}
\t\t\t\t}
\t\t\t}
\t\t}

\t\tif (!session && !existsOnDisk) {
\t\t\treturn res.status(404).json({ success: false, error: 'Session tidak ditemukan' })
\t\t}

\t\tconst canonicalId = session?.id || diskSessionId
\t\t
\t\t// Message stats from database
\t\tlet stats = { total: 0, incoming: 0, outgoing: 0, lastActivity: null }
\t\ttry {
\t\t\tconst rowStats = db.prepare(\`
\t\t\t\tSELECT 
\t\t\t\t\tCOUNT(*) as total,
\t\t\t\t\tSUM(CASE WHEN direction = 'incoming' THEN 1 ELSE 0 END) as incoming,
\t\t\t\t\tSUM(CASE WHEN direction = 'outgoing' THEN 1 ELSE 0 END) as outgoing,
\t\t\t\t\tMAX(timestamp) as lastActivity
\t\t\t\tFROM message_logs 
\t\t\t\tWHERE session_id = ? OR session_id = ?
\t\t\t\`).get(canonicalId, rawId) as any
\t\t\tif (rowStats) {
\t\t\t\tstats = {
\t\t\t\t\ttotal: rowStats.total || 0,
\t\t\t\t\tincoming: rowStats.incoming || 0,
\t\t\t\t\toutgoing: rowStats.outgoing || 0,
\t\t\t\t\tlastActivity: rowStats.lastActivity || null
\t\t\t\t}
\t\t\t}
\t\t} catch (e) {}

\t\t// Check guest session token
\t\tlet guestToken = null
\t\ttry {
\t\t\tconst guestRow = db.prepare('SELECT api_token FROM guest_sessions WHERE session_id = ? OR session_id = ?').get(canonicalId, rawId) as any
\t\t\tif (guestRow) guestToken = guestRow.api_token
\t\t} catch (e) {}

\t\tres.json({
\t\t\tsuccess: true,
\t\t\tsession: {
\t\t\t\tid: canonicalId,
\t\t\t\tisConnected: !!session?.isConnected,
\t\t\t\tuser: session?.user || (credsUser ? { id: credsUser.id, name: credsUser.name } : null),
\t\t\t\ttype: session?.type || 'qr',
\t\t\t\tphoneNumber: session?.phoneNumber || session?.user?.id?.replace(/:.+/, '') || (credsUser?.id ? credsUser.id.replace(/:.+/, '') : null),
\t\t\t\tcreatedAt: session?.createdAt || null,
\t\t\t\tlastConnected: session?.lastConnected || null,
\t\t\t\tguestToken
\t\t\t},
\t\t\tstats
\t\t})
\t} catch (error: any) {
\t\tconsole.error('Error fetching session detail:', error)
\t\tres.status(500).json({ success: false, error: error.message })
\t}
})

`;

if (!content.includes('/api/sessions/:sessionId/detail')) {
    if (content.includes(targetAnchor)) {
        content = content.replace(targetAnchor, newRoute + targetAnchor);
        fs.writeFileSync(file, content, 'utf8');
        console.log('✅ Added /api/sessions/:sessionId/detail route successfully');
    } else {
        console.error('❌ Could not find target anchor in web-server.ts');
    }
} else {
    console.log('ℹ️ Route already exists');
}
