const db = require('../config/database');

async function resolveWorkspace(user) {
    if (!user?.sub) {
        throw new Error('Authenticated user id required');
    }

    return db.withTransaction(async (client) => {
        await client.query(
            'SELECT pg_advisory_xact_lock(hashtext($1))',
            [user.sub]
        );
        const existing = await client.query(
            `SELECT wm.workspace_id, wm.role
             FROM workspace_member wm
             WHERE wm.user_id = $1
             ORDER BY wm.created_at ASC
             LIMIT 1`,
            [user.sub]
        );

        if (existing.rows[0]) {
            return {
                workspaceId: existing.rows[0].workspace_id,
                role: existing.rows[0].role
            };
        }

        const legacy = await client.query(
            `SELECT w.id
             FROM workspace w
             WHERE w.is_legacy = true
               AND NOT EXISTS (
                   SELECT 1 FROM workspace_member wm WHERE wm.workspace_id = w.id
               )
             ORDER BY w.created_at ASC
             LIMIT 1
             FOR UPDATE`,
            []
        );

        let workspaceId = legacy.rows[0]?.id;
        if (workspaceId) {
            await client.query(
                `UPDATE workspace
                 SET owner_user_id = $1, name = $2, is_legacy = false
                 WHERE id = $3`,
                [user.sub, workspaceName(user), workspaceId]
            );
        } else {
            const created = await client.query(
                `INSERT INTO workspace (owner_user_id, name)
                 VALUES ($1, $2)
                 RETURNING id`,
                [user.sub, workspaceName(user)]
            );
            workspaceId = created.rows[0].id;
        }

        await client.query(
            `INSERT INTO workspace_member (workspace_id, user_id, role)
             VALUES ($1, $2, 'admin')
             ON CONFLICT (workspace_id, user_id) DO NOTHING`,
            [workspaceId, user.sub]
        );

        return { workspaceId, role: 'admin' };
    });
}

function workspaceName(user) {
    const email = typeof user.email === 'string' ? user.email.trim() : '';
    return email ? `${email}'s workspace` : 'My workspace';
}

module.exports = { resolveWorkspace };
