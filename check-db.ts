import { db } from './database.js';

const phone = '6289529537100';
const sessionId = 'joki-2';

console.log('\n=== Database Check ===\n');

// Check all session IDs
const sessions = db.prepare(`
  SELECT session_id, COUNT(*) as count 
  FROM message_logs 
  GROUP BY session_id
`).all();

console.log('Session IDs in database:');
sessions.forEach((s: any) => {
  console.log(`  - "${s.session_id}": ${s.count} messages`);
});
console.log('');

// Check image messages specifically
console.log('=== Image Messages ===\n');
const imageRows = db.prepare(`
  SELECT 
    message_id,
    session_id,
    direction, 
    message_type,
    mimetype,
    LENGTH(media_data) as media_length,
    timestamp
  FROM message_logs 
  WHERE message_type = 'image'
  ORDER BY timestamp DESC 
  LIMIT 10
`).all();

console.log('Recent image messages:');
imageRows.forEach((row: any, i: number) => {
  console.log(`${i + 1}. [${row.session_id}] ${row.direction}`);
  console.log(`   ID: ${row.message_id}`);
  console.log(`   media_data: ${row.media_length ? row.media_length + ' chars' : 'EMPTY'}`);
  console.log(`   mimetype: ${row.mimetype || 'null'}`);
  console.log(`   timestamp: ${row.timestamp}`);
  console.log('');
});

// Test getChatHistory query exactly as API does
console.log('\n=== getChatHistory Simulation ===\n');

const pattern = `%${phone.replace(/[^0-9]/g, '')}%`;
const historyRows = db.prepare(`
  SELECT * FROM message_logs 
  WHERE session_id = ? 
  AND (from_number LIKE ? OR to_number LIKE ?)
  ORDER BY timestamp ASC
  LIMIT 100
`).all(sessionId, pattern, pattern);

console.log(`Session: "${sessionId}", Pattern: "${pattern}"`);
console.log('Total:', historyRows.length);
console.log('');

// Show last 5 messages from history
console.log('Last 5 messages returned by getChatHistory:');
const last5 = historyRows.slice(-5);
last5.forEach((row: any, i: number) => {
  const mediaLen = row.media_data ? row.media_data.length : 0;
  console.log(`${i + 1}. [${row.direction}] ${row.message_type}`);
  console.log(`   message_id: ${row.message_id}`);
  console.log(`   content: "${(row.content || '').substring(0, 50)}"`);
  console.log(`   media_data: ${mediaLen > 0 ? mediaLen + ' chars' : 'EMPTY'}`);
  console.log(`   mimetype: ${row.mimetype || 'null'}`);
  console.log('');
});
