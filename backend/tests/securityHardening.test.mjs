import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import appModule from '../app.js';
import db from '../config/database.js';

const app = appModule.createApp({
    authMiddleware(req, _res, next) {
        req.user = { sub: 'security-test-user' };
        next();
    },
    workspaceMiddleware(req, _res, next) {
        req.workspaceId = '11111111-1111-4111-8111-111111111111';
        req.workspaceRole = 'admin';
        next();
    }
});

let server;
let baseUrl;

test.before(async () => {
    await new Promise((resolve) => {
        server = http.createServer(app).listen(0, '127.0.0.1', () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.end();
});

test('responses include baseline browser security headers', async () => {
    const response = await fetch(`${baseUrl}/api/auth/config`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.ok(response.headers.get('strict-transport-security'));
    assert.ok(response.headers.get('ratelimit-policy'));
    const csp = response.headers.get('content-security-policy');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
});

test('conference upload rejects non-xlsx files before import', async () => {
    const form = new FormData();
    form.append('excelFile', new Blob(['not a workbook'], { type: 'text/plain' }), 'conference.txt');
    form.append('conferenceName', 'Security Test');

    const response = await fetch(`${baseUrl}/api/analytics/process-conference`, {
        method: 'POST',
        body: form
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Only .xlsx conference files are accepted' });
});

test('oversized JSON bodies return a bounded public error', async () => {
    const response = await fetch(`${baseUrl}/api/analytics/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'x'.repeat(1024 * 1024 + 1) })
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'Request payload is too large' });
});

test('unknown API and browser routes return deliberate 404 responses', async () => {
    const apiResponse = await fetch(`${baseUrl}/api/does-not-exist`);
    assert.equal(apiResponse.status, 404);
    assert.deepEqual(await apiResponse.json(), { error: 'API endpoint not found' });

    const pageResponse = await fetch(`${baseUrl}/does-not-exist`);
    assert.equal(pageResponse.status, 404);
    assert.match(await pageResponse.text(), /Page not found/);
});

test('favicon is present and cacheable as an SVG', async () => {
    const response = await fetch(`${baseUrl}/favicon.svg`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /image\/svg\+xml/);
    assert.match(await response.text(), /<svg/);
});
