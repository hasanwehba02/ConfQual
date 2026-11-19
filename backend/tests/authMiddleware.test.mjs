import test from 'node:test';
import assert from 'node:assert/strict';
import authModule from '../middleware/auth.js';

const { createAuthMiddleware, requireRole, requirePrivilegedMfa } = authModule;

function request({ authorization, user } = {}) {
    return {
        user,
        get(name) {
            return name.toLowerCase() === 'authorization' ? authorization : undefined;
        }
    };
}

function response() {
    return {
        statusCode: 200,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}

test('requireAuth rejects requests without bearer token', async () => {
    const middleware = createAuthMiddleware(async () => {
        throw new Error('verifier must not run');
    });
    const res = response();
    let nextCalled = false;

    await middleware(request(), res, () => { nextCalled = true; });

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Authentication required' });
    assert.equal(nextCalled, false);
});

test('requireAuth rejects invalid tokens', async () => {
    const middleware = createAuthMiddleware(async () => ({
        data: null,
        error: new Error('invalid')
    }));
    const res = response();

    await middleware(request({ authorization: 'Bearer invalid-token' }), res, () => {});

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Invalid or expired session' });
});

test('requireAuth attaches verified claims', async () => {
    const claims = {
        sub: 'user-123',
        session_id: '11111111-1111-4111-8111-111111111111',
        email: 'chair@example.com',
        app_metadata: { role: 'chair' }
    };
    const middleware = createAuthMiddleware(async (token) => {
        assert.equal(token, 'valid-token');
        return { data: { claims }, error: null };
    }, async () => ({ data: { user: { id: 'user-123' } }, error: null }));
    const req = request({ authorization: 'Bearer valid-token' });
    const res = response();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.deepEqual(req.user, claims);
    assert.equal(nextCalled, true);
});

test('requireAuth rejects a revoked session even when claims are valid', async () => {
    const middleware = createAuthMiddleware(
        async () => ({ data: { claims: { sub: 'user-123', session_id: '11111111-1111-4111-8111-111111111111' } }, error: null }),
        async () => ({ data: { user: null }, error: new Error('session revoked') })
    );
    const res = response();
    let nextCalled = false;
    await middleware(request({ authorization: 'Bearer revoked-token' }), res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
});

test('requireAuth rejects a provider user that does not match verified claims', async () => {
    const middleware = createAuthMiddleware(
        async () => ({ data: { claims: { sub: 'user-123', session_id: '11111111-1111-4111-8111-111111111111' } }, error: null }),
        async () => ({ data: { user: { id: 'different-user' } }, error: null })
    );
    const res = response();
    await middleware(request({ authorization: 'Bearer token' }), res, () => {});
    assert.equal(res.statusCode, 401);
});

test('requireAuth rejects a missing or nil session identifier before contacting the user endpoint', async () => {
    for (const session_id of [undefined, '00000000-0000-0000-0000-000000000000']) {
        let called = false;
        const middleware = createAuthMiddleware(
            async () => ({ data: { claims: { sub: 'user-123', session_id } }, error: null }),
            async () => { called = true; }
        );
        const res = response();
        await middleware(request({ authorization: 'Bearer token' }), res, () => {});
        assert.equal(res.statusCode, 401);
        assert.equal(called, false);
    }
});

test('requireRole permits matching role and rejects other roles', () => {
    const middleware = requireRole('admin', 'chair');
    let nextCalled = false;

    middleware(
        request({ user: { sub: 'chair', app_metadata: { role: 'chair' } } }),
        response(),
        () => { nextCalled = true; }
    );
    assert.equal(nextCalled, true);

    const res = response();
    middleware(
        request({ user: { sub: 'viewer', app_metadata: { role: 'viewer' } } }),
        res,
        () => {}
    );
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'Forbidden' });
});

test('privileged workspace roles and support access require verified AAL2', () => {
    const cases = [
        { role: 'admin', aal: 'aal1', allowed: false },
        { role: 'chair', aal: undefined, allowed: false },
        { role: 'admin', aal: 'aal2', allowed: true },
        { role: 'viewer', aal: 'aal1', allowed: true },
        { role: undefined, aal: 'aal2', allowed: false },
        { role: 'viewer', aal: 'aal1', supportAccess: { grantId: 'grant' }, allowed: false },
        { role: 'viewer', aal: 'aal2', supportAccess: { grantId: 'grant' }, allowed: true }
    ];
    for (const { role, aal, supportAccess, allowed } of cases) {
        const req = { user: { sub: 'user', aal }, workspaceRole: role, supportAccess };
        const res = response();
        let nextCalled = false;
        requirePrivilegedMfa(req, res, () => { nextCalled = true; });
        assert.equal(nextCalled, allowed, `${role}/${aal}/${Boolean(supportAccess)}`);
        if (!allowed) {
            assert.equal(res.statusCode, 403);
            if (role) assert.equal(res.body.code, 'mfa_required');
        }
    }
});
