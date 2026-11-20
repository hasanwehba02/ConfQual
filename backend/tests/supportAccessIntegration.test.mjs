import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import db from '../config/database.js';
import support from '../services/supportAccessService.js';

test('support grants enforce identity, scope, revocation and database read-only access', {
    skip: process.env.CONFQUAL_SUPPORT_TEST_DB !== 'true' && 'Requires a disposable migrated test database'
}, async () => {
    const target = new URL(process.env.DATABASE_URL);
    const localTrial = target.hostname === '127.0.0.1' && target.port === '55439' &&
        ['/confqual_support_trial', '/confqual_audit_trial'].includes(target.pathname);
    const ciTrial = process.env.GITHUB_ACTIONS === 'true' && target.hostname === 'localhost' && target.port === '5432' && target.pathname === '/confqual_test';
    assert.ok(localTrial || ciTrial, 'Integration test requires the designated disposable database');
    const workspaceId = randomUUID();
    const adminUserId = randomUUID();
    const supportUserId = randomUUID();
    await db.query('INSERT INTO workspace (id, name) VALUES ($1, $2)', [workspaceId, 'Synthetic support test']);
    try {
        const grant = await db.withWorkspace(workspaceId, () => support.createGrant({
            workspaceId, actorUserId: adminUserId,
            input: { supportUserId, expiresInMinutes: 15, scopes: ['analytics:read'] }
        }));
        const request = { token: grant.token, actorUserId: supportUserId, scope: 'analytics:read', method: 'GET', path: '/api/analytics' };
        assert.equal(await support.authorizeRequest({ ...request, actorUserId: randomUUID() }), null);
        assert.equal(await support.authorizeRequest({ ...request, scope: 'settings:read' }), null);
        assert.equal((await support.authorizeRequest(request)).workspaceId, workspaceId);
        await assert.rejects(db.withReadOnlyWorkspace(workspaceId, () => db.query(
            'INSERT INTO conference_series (name, acronym) VALUES ($1, $2)', ['denied', 'D']
        )), /read-only/i);
        assert.equal(await db.withWorkspace(workspaceId, () => support.revokeGrant({ workspaceId, grantId: grant.id, actorUserId: adminUserId })), true);
        assert.equal(await support.authorizeRequest(request), null);
        const audit = await db.query('SELECT event FROM support_access_audit WHERE grant_id = $1 ORDER BY id', [grant.id]);
        assert.deepEqual(audit.rows.map(row => row.event), ['grant', 'access', 'revoke']);
        const expired = await db.withWorkspace(workspaceId, () => support.createGrant({
            workspaceId, actorUserId: adminUserId,
            input: { supportUserId, expiresInMinutes: 15, scopes: ['analytics:read'] }
        }));
        await db.query("UPDATE support_grant SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' WHERE id = $1", [expired.id]);
        assert.equal(await support.authorizeRequest({ ...request, token: expired.token }), null);

        await db.query('DELETE FROM support_grant WHERE id = $1', [grant.id]);
        const afterGrantDelete = await db.query('SELECT event FROM support_access_audit WHERE grant_id = $1 ORDER BY id', [grant.id]);
        assert.deepEqual(afterGrantDelete.rows.map(row => row.event), ['grant', 'access', 'revoke']);

        await db.query('DELETE FROM workspace WHERE id = $1', [workspaceId]);
        const afterWorkspaceDelete = await db.query('SELECT event FROM support_access_audit WHERE grant_id = $1 ORDER BY id', [grant.id]);
        assert.deepEqual(afterWorkspaceDelete.rows.map(row => row.event), ['grant', 'access', 'revoke']);
        const retainedInScope = await db.withWorkspace(workspaceId, () =>
            db.query('SELECT event FROM support_access_audit WHERE grant_id = $1 ORDER BY id', [grant.id]));
        assert.deepEqual(retainedInScope.rows.map(row => row.event), ['grant', 'access', 'revoke']);
        const hiddenFromOtherScope = await db.withWorkspace(randomUUID(), () =>
            db.query('SELECT id FROM support_access_audit WHERE grant_id = $1', [grant.id]));
        assert.equal(hiddenFromOtherScope.rows.length, 0);
    } finally {
        await db.query('DELETE FROM workspace WHERE id = $1', [workspaceId]);
        await db.query('DELETE FROM support_access_audit WHERE workspace_id = $1', [workspaceId]);
        await db.end();
    }
});
