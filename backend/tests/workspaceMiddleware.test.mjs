import test from 'node:test';
import assert from 'node:assert/strict';
import workspaceModule from '../middleware/workspace.js';
import db from '../config/database.js';
import authModule from '../middleware/auth.js';

const { createWorkspaceMiddleware } = workspaceModule;
const { requireRole } = authModule;

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

test('workspace middleware resolves user membership and runs request inside workspace context', async () => {
    const req = { user: { sub: 'user-alice', email: 'alice@example.com' } };
    const res = response();
    const middleware = createWorkspaceMiddleware(async (user) => {
        assert.equal(user.sub, 'user-alice');
        return { workspaceId: '11111111-1111-4111-8111-111111111111', role: 'admin' };
    });

    let contextWorkspaceId;
    await middleware(req, res, () => {
        contextWorkspaceId = db.getWorkspaceId();
    });

    assert.equal(req.workspaceId, '11111111-1111-4111-8111-111111111111');
    assert.equal(req.workspaceRole, 'admin');
    assert.equal(contextWorkspaceId, req.workspaceId);
});

test('workspace role overrides global token role', () => {
    const req = {
        user: { sub: 'user-alice', app_metadata: { role: 'admin' } },
        workspaceRole: 'viewer'
    };
    const res = response();
    let nextCalled = false;

    requireRole('admin')(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
});
