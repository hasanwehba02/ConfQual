import test from 'node:test';
import assert from 'node:assert/strict';
import authModule from '../middleware/auth.js';

const { createAuthMiddleware, requireRole } = authModule;

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
        email: 'chair@example.com',
        app_metadata: { role: 'chair' }
    };
    const middleware = createAuthMiddleware(async (token) => {
        assert.equal(token, 'valid-token');
        return { data: { claims }, error: null };
    });
    const req = request({ authorization: 'Bearer valid-token' });
    const res = response();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.deepEqual(req.user, claims);
    assert.equal(nextCalled, true);
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
