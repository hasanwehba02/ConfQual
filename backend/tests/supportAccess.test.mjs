import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import db from '../config/database.js';
import supportModule from '../services/supportAccessService.js';
import middlewareModule from '../middleware/supportWorkspace.js';

const { createSupportWorkspaceMiddleware } = middlewareModule;
const { createGrant, revokeGrant, authorizeRequest, validGrantInput } = supportModule;
const workspaceId = '11111111-1111-4111-8111-111111111111';
const supportUserId = '22222222-2222-4222-8222-222222222222';
const adminUserId = '33333333-3333-4333-8333-333333333333';
const grantId = '44444444-4444-4444-8444-444444444444';

function response() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

test('grant validation restricts support identity, lifetime, and read scopes', () => {
    const valid = { supportUserId, expiresInMinutes: 30, scopes: ['analytics:read'] };
    assert.equal(validGrantInput(valid), true);
    assert.equal(validGrantInput({ ...valid, expiresInMinutes: 61 }), false);
    assert.equal(validGrantInput({ ...valid, supportUserId: 'not-uuid' }), false);
    assert.equal(validGrantInput({ ...valid, scopes: ['analytics:write'] }), false);
    assert.equal(validGrantInput({ ...valid, scopes: ['analytics:read', 'analytics:read'] }), false);
});
test('support middleware denies writes and out-of-scope access before workspace switch', async () => {
    let calls = 0;
    const workspaceMiddleware = () => { throw new Error('must not fall back'); };
    const middleware = createSupportWorkspaceMiddleware(workspaceMiddleware, async ({ scope, path }) => {
        calls++;
        assert.equal(path, '/api/analytics');
        return scope === 'analytics:read' ? { workspaceId, grantId } : null;
    });
    const makeReq = (method) => ({
        method,
        user: { sub: supportUserId, aal: 'aal2', amr: [{ method: 'totp' }] },
        baseUrl: '/api/analytics',
        path: '/papers/secret',
        get: () => 'support-token'
    });
    const writeRes = response();
    await middleware('analytics:read')(makeReq('POST'), writeRes, () => { throw new Error('write allowed'); });
    assert.equal(writeRes.statusCode, 403);
    assert.equal(calls, 0);

    const lowAssuranceRes = response();
    const lowAssuranceReq = makeReq('GET');
    lowAssuranceReq.user.aal = 'aal1';
    await middleware('analytics:read')(lowAssuranceReq, lowAssuranceRes, () => { throw new Error('AAL1 support allowed'); });
    assert.equal(lowAssuranceRes.statusCode, 403);
    assert.equal(lowAssuranceRes.body.code, 'mfa_required');
    assert.equal(calls, 0);

    const otherFactorReq = makeReq('GET');
    otherFactorReq.user.amr = [{ method: 'phone' }];
    const otherFactorRes = response();
    await middleware('analytics:read')(otherFactorReq, otherFactorRes, () => { throw new Error('non-TOTP support allowed'); });
    assert.equal(otherFactorRes.statusCode, 403);
    assert.equal(otherFactorRes.body.code, 'mfa_required');
    assert.equal(calls, 0);

    const wrongScopeRes = response();
    await middleware('settings:read')(makeReq('GET'), wrongScopeRes, () => { throw new Error('wrong scope allowed'); });
    assert.equal(wrongScopeRes.statusCode, 403);

    const readRes = response();
    let observed;
    await middleware('analytics:read')(makeReq('GET'), readRes, () => {
        observed = db.getWorkspaceId();
    });
    assert.equal(observed, workspaceId);
});

test('a support grant stores only a hash and records its creation', async () => {
    const queries = [];
    const fakeDb = { withTransaction: async (callback) => callback({
        query: async (sql, params) => {
            queries.push({ sql, params });
            return { rows: [{ id: grantId, workspace_id: workspaceId }] };
        }
    }) };
    const grant = await createGrant({
            workspaceId,
            actorUserId: adminUserId,
            input: { supportUserId, expiresInMinutes: 15, scopes: ['analytics:read'] }
    }, fakeDb);
    assert.match(grant.token, /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(queries[0].params[3], createHash('sha256').update(grant.token).digest());
    assert.equal(queries[0].params.includes(grant.token), false);
    assert.match(queries[1].sql, /support_access_audit/);
    assert.equal(JSON.stringify(queries).includes(grant.token), false);
});

test('access requires matching actor, active grant, and scope and writes an audit row', async () => {
    const token = 'a'.repeat(43);
    const queries = [];
    const fakeDb = { withTransaction: async (callback) => callback({
        query: async (sql, params) => {
            queries.push({ sql, params });
            return { rows: [{ id: grantId, workspace_id: workspaceId, scopes: ['analytics:read'] }] };
        }
    }) };
    assert.equal(await authorizeRequest({ token, actorUserId: supportUserId, scope: 'settings:read', method: 'GET', path: '/api/settings' }, fakeDb), null);
        assert.equal(queries.length, 1);
        const access = await authorizeRequest({ token, actorUserId: supportUserId, scope: 'analytics:read', method: 'GET', path: '/api/analytics' }, fakeDb);
        assert.deepEqual(access, { grantId, workspaceId });
        assert.match(queries[0].sql, /support_user_id = \$2/);
        assert.match(queries[0].sql, /revoked_at IS NULL AND expires_at > now\(\)/);
        assert.match(queries[2].sql, /support_access_audit/);
        assert.equal(queries[2].params[5], '/api/analytics');
        assert.equal(JSON.stringify(queries).includes(token), false);
        assert.equal(await authorizeRequest({ token, actorUserId: supportUserId, scope: 'analytics:read', method: 'POST', path: '/api/analytics' }, fakeDb), null);
        assert.equal(queries.length, 3);
});

test('revocation is scoped to the customer workspace and audited', async () => {
    const queries = [];
    const fakeDb = { withTransaction: async (callback) => callback({
        query: async (sql, params) => {
            queries.push({ sql, params });
            return { rows: [{ id: grantId }] };
        }
    }) };
    assert.equal(await revokeGrant({ workspaceId, grantId, actorUserId: adminUserId }, fakeDb), true);
        assert.match(queries[0].sql, /workspace_id = \$2 AND revoked_at IS NULL/);
        assert.deepEqual(queries[0].params, [grantId, workspaceId]);
        assert.match(queries[1].sql, /support_access_audit/);
});

test('expired, revoked, or differently attributed grants deny access', async () => {
    const token = 'a'.repeat(43);
    for (const state of ['expired', 'revoked', 'other-user']) {
        let auditCount = 0;
        const fakeDb = { withTransaction: async (callback) => callback({
            query: async (sql, params) => {
                if (sql.includes('FROM support_grant')) {
                    assert.match(sql, /support_user_id = \$2/);
                    assert.match(sql, /revoked_at IS NULL AND expires_at > now\(\)/);
                    assert.equal(params[1], supportUserId);
                    return { rows: [] };
                }
                auditCount++;
                return { rows: [] };
            }
        }) };
        const access = await authorizeRequest({
            token, actorUserId: supportUserId, scope: 'analytics:read',
            method: 'GET', path: '/api/analytics'
        }, fakeDb);
        assert.equal(access, null, state);
        assert.equal(auditCount, 0, state);
    }
});

test('audit failure prevents a support request from entering the customer workspace', async () => {
    const token = 'a'.repeat(43);
    const fakeDb = { withTransaction: async (callback) => callback({
        query: async (sql) => {
            if (sql.includes('FROM support_grant')) {
                return { rows: [{ id: grantId, workspace_id: workspaceId, scopes: ['analytics:read'] }] };
            }
            throw new Error('audit unavailable');
        }
    }) };
    await assert.rejects(authorizeRequest({
        token, actorUserId: supportUserId, scope: 'analytics:read',
        method: 'GET', path: '/api/analytics'
    }, fakeDb), /audit unavailable/);
});
