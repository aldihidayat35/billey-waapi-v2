const http = require('http');
const fs = require('fs');
const path = require('path');

const SESSION_TOKEN = 'dc64be93ed748e54aa777cf1b4904e054ae680e79ff30de9350b32aa00166678';
const API_KEY = 'ganti_dengan_api_key_rahasia_anda';

// Load the 90 documented endpoints
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin', 'api-docs.html'), 'utf8');
const epRegex = /<(span|div)[^>]*badge-(primary|success|warning|danger|info|secondary)[^>]*>\s*(GET|POST|PUT|DELETE|PATCH)\s*<\/(span|div)>[\s\S]*?<code>([^<]+)<\/code>/gi;
let m;
const documented = [];
while ((m = epRegex.exec(html)) !== null) {
    const item = { method: m[3].toUpperCase(), path: m[5].trim() };
    if (!documented.some(d => d.method === item.method && d.path === item.path)) {
        documented.push(item);
    }
}

function resolveTestPath(method, p) {
    // For DELETE, use non-destructive id 999999 so we don't wipe active seed data
    const idVal = method === 'DELETE' ? '999999' : '1';
    return p
        .replace(':id', idVal)
        .replace(':sessionId', 'test-session')
        .replace(':tableName', 'users')
        .replace(':date', '2026-10-02')
        .replace(':phone', '628123456789')
        .replace(':contactNumber', '628123456789')
        .replace(':query', 'halo')
        .replace(':code', 'WELCOME')
        .replace(':groupId', '12036304@g.us');
}

function sendRequest(method, urlPath, body = null) {
    return new Promise((resolve) => {
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: '127.0.0.1',
            port: 3000,
            path: urlPath,
            method: method,
            headers: {
                'Cookie': `wa_session=${SESSION_TOKEN}`,
                'X-Session-Token': SESSION_TOKEN,
                'X-Api-Key': API_KEY,
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            },
            timeout: 3000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    parsed = data.substring(0, 100);
                }
                resolve({
                    statusCode: res.statusCode,
                    data: parsed
                });
            });
        });

        req.on('error', (err) => {
            resolve({
                statusCode: 0,
                error: err.message
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({
                statusCode: 408,
                error: 'Timeout'
            });
        });

        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}

async function runTests() {
    console.log(`Starting live test of ${documented.length} documented endpoints on http://localhost:3000...\n`);
    
    const results = [];
    for (let i = 0; i < documented.length; i++) {
        const ep = documented[i];
        const testPath = resolveTestPath(ep.method, ep.path);
        
        let body = null;
        if (ep.method === 'POST' || ep.method === 'PUT' || ep.method === 'PATCH') {
            body = { dummy: true };
        }

        const res = await sendRequest(ep.method, testPath, body);
        
        let status = 'UNKNOWN';
        if (res.statusCode >= 200 && res.statusCode < 300) {
            status = 'OK_200';
        } else if (res.statusCode === 400 || res.statusCode === 422) {
            status = 'OK_PARAM_VALIDATION';
        } else if (res.statusCode === 404) {
            // Check if 404 is just "item not found" because of dummy ID (which means route exists and works!)
            const msg = typeof res.data === 'object' ? (res.data.error || '') : String(res.data);
            if (msg.includes('tidak ditemukan') || msg.includes('not found') || msg.includes('Not found')) {
                status = 'OK_NOT_FOUND_ITEM';
            } else {
                status = 'NOT_FOUND_404_ROUTE';
            }
        } else if (res.statusCode === 503) {
            status = 'OK_SERVICE_UNAVAILABLE'; // Session not connected
        } else if (res.statusCode === 500) {
            status = 'SERVER_ERROR_500';
        } else if (res.statusCode === 401 || res.statusCode === 403) {
            status = 'AUTH_RESTRICTED';
        } else {
            status = `HTTP_${res.statusCode}`;
        }

        const resSummary = typeof res.data === 'object' && res.data !== null
            ? (res.data.error || res.data.message || (res.data.success !== undefined ? `success:${res.data.success}` : JSON.stringify(res.data).substring(0, 50)))
            : String(res.data).substring(0, 50);

        results.push({
            index: i + 1,
            method: ep.method,
            docPath: ep.path,
            testPath,
            statusCode: res.statusCode,
            status,
            summary: resSummary
        });

        const icon = status.startsWith('OK') ? '✅' : (status === 'NOT_FOUND_404_ROUTE' ? '❌' : (status === 'SERVER_ERROR_500' ? '⚠️' : 'ℹ️'));
        console.log(`${icon} ${(i + 1).toString().padStart(2, ' ')}. ${ep.method.padEnd(7)} ${testPath.padEnd(45)} [${res.statusCode}] ${resSummary}`);
    }

    fs.writeFileSync(path.join(__dirname, 'endpoint-test-results.json'), JSON.stringify(results, null, 2));

    const total404Route = results.filter(r => r.status === 'NOT_FOUND_404_ROUTE').length;
    const total500 = results.filter(r => r.statusCode === 500).length;
    const totalOk = results.filter(r => r.status.startsWith('OK')).length;

    console.log('\n================ TEST SUMMARY ================');
    console.log(`Total Endpoints Tested:     ${results.length}`);
    console.log(`Working & Validated (OK):  ${totalOk}`);
    console.log(`Route Not Found (404):     ${total404Route}`);
    console.log(`Server Error (500):        ${total500}`);
    console.log(`Other:                      ${results.length - totalOk - total404Route - total500}`);
}

runTests();
