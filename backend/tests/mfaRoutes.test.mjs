import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import appModule from '../app.js';

test('API gates privileged workspaces at AAL1 while leaving enrollment routing available', async () => {
    const app = appModule.createApp({
        privilegedMfaMiddleware(req, res, next) {
            if (!req.supportAccess && ['admin', 'chair'].includes(req.workspaceRole)) {
                const expected = req.authUser?.app_metadata?.confqual_approved_totp_factor_id;
                if (req.user?.aal !== 'aal2' || !req.user.amr?.some(method => method.method === 'totp') ||
                    expected !== (req.get('x-test-factor') || 'synthetic-factor')) {
                    return res.status(403).json({ error: 'Multi-factor authentication required', code: 'mfa_required' });
                }
            }
            next();
        },
        authMiddleware(req, _res, next) {
            req.user = {
                sub: 'synthetic-user',
                aal: req.get('x-test-aal') || 'aal1',
                amr: req.get('x-test-aal') === 'aal2' && req.get('x-test-totp') !== 'false' ? [{ method: 'totp' }] : [],
                app_metadata: { confqual_access_approved: false }
            };
            req.authUser = {
                id: 'synthetic-user',
                app_metadata: {
                    confqual_access_approved: req.get('x-test-approved') === 'true',
                    confqual_mfa_setup_authorized: req.get('x-test-setup') === 'true',
                    confqual_approved_totp_factor_id: req.get('x-test-approved') === 'true' ? 'synthetic-factor' : null
                }
            };
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
        assert.deepEqual(await identity.json(), { id: 'synthetic-user', email: null, role: 'admin', aal: 'aal1', totpVerified: false, trustedSetupApproved: false, mfaSetupAuthorized: false, approvedTotpFactorId: null });

        const admin = await fetch(`${base}/api/analytics/log`, { method: 'POST', headers: { 'x-test-role': 'admin' } });
        assert.equal(admin.status, 403);
        assert.equal((await admin.json()).code, 'access_pending');

        const pendingSupport = await fetch(`${base}/api/analytics/log`, {
            headers: { 'x-support-token': 'synthetic-support-token' }
        });
        assert.equal(pendingSupport.status, 403);
        assert.equal((await pendingSupport.json()).code, 'access_pending');

        const approvedAdmin = await fetch(`${base}/api/analytics/log`, { method: 'POST', headers: { 'x-test-role': 'admin', 'x-test-approved': 'true' } });
        assert.equal(approvedAdmin.status, 403);
        assert.equal((await approvedAdmin.json()).code, 'mfa_required');

        const chair = await fetch(`${base}/api/settings`, { headers: { 'x-test-role': 'chair', 'x-test-approved': 'true' } });
        assert.equal(chair.status, 403);
        assert.equal((await chair.json()).code, 'mfa_required');

        const nonTotpSupport = await fetch(`${base}/api/analytics/log`, {
            headers: { 'x-test-approved': 'true', 'x-test-aal': 'aal2', 'x-test-totp': 'false', 'x-support-token': 'synthetic-support-token' }
        });
        assert.equal(nonTotpSupport.status, 403);
        assert.equal((await nonTotpSupport.json()).code, 'mfa_required');

        const viewer = await fetch(`${base}/api/analytics/log`, { method: 'POST', headers: { 'x-test-role': 'viewer', 'x-test-approved': 'true' } });
        assert.equal(viewer.status, 200);
        const verified = await fetch(`${base}/api/analytics/log`, { method: 'POST', headers: { 'x-test-role': 'admin', 'x-test-aal': 'aal2', 'x-test-approved': 'true' } });
        assert.equal(verified.status, 200);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
