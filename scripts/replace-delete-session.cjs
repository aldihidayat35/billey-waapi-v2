const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src', 'web-server.ts');
let content = fs.readFileSync(file, 'utf8');

const target = `\t// Delete session
\tsocket.on('delete-session', async (sessionId: string) => {
\t\ttry {
\t\t\tawait sessionManager.deleteSession(sessionId)
\t\t\tconst sessions = sessionManager.getAllSessions()
\t\t\tio.emit('all-sessions', sessions)
\t\t\tsocket.emit('message', \`Session \${sessionId} deleted\`)
\t\t} catch (error: any) {
\t\t\tsocket.emit('error', error.message)
\t\t}
\t})`;

const replacement = `\t// Delete session
\tsocket.on('delete-session', async (sessionId: string) => {
\t\ttry {
\t\t\tawait sessionManager.deleteSession(sessionId)
\t\t\ttry {
\t\t\t\tif (sessionId.startsWith('guest_')) {
\t\t\t\t\tdb.prepare('DELETE FROM guest_sessions WHERE session_id = ?').run(sessionId)
\t\t\t\t}
\t\t\t} catch (dbError) {
\t\t\t\tconsole.error('Error deleting from guest_sessions DB:', dbError)
\t\t\t}
\t\t\tconst sessions = sessionManager.getAllSessions()
\t\t\tio.emit('all-sessions', sessions)
\t\t\tsocket.emit('message', \`Session \${sessionId} deleted\`)
\t\t} catch (error: any) {
\t\t\tsocket.emit('error', error.message)
\t\t}
\t})`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(file, content);
    console.log("Replaced successfully!");
} else {
    console.log("Target not found!");
}
