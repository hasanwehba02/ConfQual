import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import appModule from '../app.js';

test('API gates privileged workspaces at AAL1 while leaving enrollment routing available', async () => {
    const app = appModule.createApp({
        authMiddleware(req, _res, next) {
            req.user = { sub: 'synthetic-user', aal: req.get('x-test-aal') || 'aal1' };
            next();
        },
        workspaceMiddleware(req, _res, next) {
            req.workspaceId = '11111111-1111-4111-8111-111111111111';
            req.workspaceRole = req.get('x-test-role') || 'admin';
            next();
        }
    });
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const identity = await fetch(`${base}/api/auth/me`, { headers: { 'x-test-role': 'admin' } });
        assert.equal(identity.status, 200);
        assert.deepEqual(await identity.json(), { id: 'synthetic-user', email: null, role: 'admin', aal: 'aal1' });

        const admin = await fetch(`${base}/api/analytics/log`, { method: 'POST', headers: { 'x-test-role': 'admin' } });
        assert.equal(admin.status, 403);
        assert.equal((await admin.json()).code, 'mfa_required');

        const chair = await fetch(`${base}/api/settings`, { headers: { 'x-test-role': 'chair' } });
        assert.equal(chair.status, 403);
        assert.equal((await chair.json()).code, 'mfa_required');

        const viewer = await fetch(`${base}/api/analytics/log`, { method: 'POST', headers: { 'x-test-role': 'viewer' } });
        assert.equal(viewer.status, 200);
        const verified = await fetch(`${base}/api/analytics/log`, { method: 'POST', headers: { 'x-test-role': 'admin', 'x-test-aal': 'aal2' } });
        assert.equal(verified.status, 200);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
