const { createHash, randomBytes } = require('node:crypto');
const db = require('../config/database');

const SCOPES = new Set(['analytics:read', 'settings:read']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function validGrantInput(input) {
    return input && UUID.test(input.supportUserId) &&
        Number.isInteger(input.expiresInMinutes) &&
        input.expiresInMinutes >= 1 && input.expiresInMinutes <= 60 &&
        Array.isArray(input.scopes) && input.scopes.length >= 1 &&
        input.scopes.length <= 2 &&
        new Set(input.scopes).size === input.scopes.length &&
        input.scopes.every((scope) => SCOPES.has(scope));
}

async function createGrant({ workspaceId, actorUserId, input }, database = db) {
    if (!validGrantInput(input)) return null;
    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest();
    const grant = await database.withTransaction(async (client) => {
        const result = await client.query(
            `INSERT INTO support_grant
                (workspace_id, support_user_id, created_by_user_id, token_hash, scopes, expires_at)
             VALUES ($1, $2, $3, $4, $5, now() + $6::integer * INTERVAL '1 minute')
             RETURNING id, workspace_id, support_user_id, created_by_user_id, scopes, created_at, expires_at`,
            [workspaceId, input.supportUserId, actorUserId, hash, input.scopes, input.expiresInMinutes]
        );
        const row = result.rows[0];
        await client.query(
            `INSERT INTO support_access_audit
                (grant_id, workspace_id, actor_user_id, event)
             VALUES ($1, $2, $3, 'grant')`,
            [row.id, workspaceId, actorUserId]
        );
        return row;
    });
    return { ...grant, token };
}

async function listGrants(workspaceId, database = db) {
    const result = await database.query(
        `SELECT id, workspace_id, support_user_id, created_by_user_id,
                scopes, created_at, expires_at, revoked_at
         FROM support_grant WHERE workspace_id = $1
         ORDER BY created_at DESC`,
        [workspaceId]
    );
    return result.rows;
}

async function listAudit(workspaceId, database = db) {
    const result = await database.query(
        `SELECT grant_id, actor_user_id, event, scope, method, path, occurred_at
         FROM support_access_audit WHERE workspace_id = $1
         ORDER BY occurred_at DESC LIMIT 200`,
        [workspaceId]
    );
    return result.rows;
}

async function revokeGrant({ workspaceId, grantId, actorUserId }, database = db) {
    if (!UUID.test(grantId)) return false;
    return database.withTransaction(async (client) => {
        const result = await client.query(
            `UPDATE support_grant SET revoked_at = now()
             WHERE id = $1 AND workspace_id = $2 AND revoked_at IS NULL
             RETURNING id`,
            [grantId, workspaceId]
        );
        if (!result.rows[0]) return false;
        await client.query(
            `INSERT INTO support_access_audit
                (grant_id, workspace_id, actor_user_id, event)
             VALUES ($1, $2, $3, 'revoke')`,
            [grantId, workspaceId, actorUserId]
        );
        return true;
    });
}

async function authorizeRequest({ token, actorUserId, scope, method, path }, database = db) {
    if (!TOKEN.test(token || '') || !UUID.test(actorUserId || '') ||
        !SCOPES.has(scope) || !['GET', 'HEAD'].includes(method)) return null;
    const hash = createHash('sha256').update(token).digest();
    return database.withTransaction(async (client) => {
        const result = await client.query(
            `SELECT id, workspace_id, support_user_id, scopes
             FROM support_grant
             WHERE token_hash = $1 AND support_user_id = $2
               AND revoked_at IS NULL AND expires_at > now()
             FOR UPDATE`,
            [hash, actorUserId]
        );
        const grant = result.rows[0];
        if (!grant?.scopes.includes(scope)) return null;
        await client.query(
            `INSERT INTO support_access_audit
                (grant_id, workspace_id, actor_user_id, event, scope, method, path)
             VALUES ($1, $2, $3, 'access', $4, $5, $6)`,
            [grant.id, grant.workspace_id, actorUserId, scope, method, path]
        );
        return { grantId: grant.id, workspaceId: grant.workspace_id };
    });
}

module.exports = { createGrant, listGrants, listAudit, revokeGrant, authorizeRequest, validGrantInput };
