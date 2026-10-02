import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../config/database.js';
import conferenceRepository from '../repositories/conferenceRepository.js';
import resetWorkspaceData from '../utils/resetDatabase.js';
import workspaceService from '../services/workspaceService.js';

test('repository reads and deletes stay inside active workspace', async (t) => {
    let migrationReady;
    try {
        const check = await db.query(`
            SELECT to_regclass('public.workspace') IS NOT NULL AS has_workspace,
                   EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'confqual_app') AS has_role
        `);
        migrationReady = check.rows[0]?.has_workspace && check.rows[0]?.has_role;
    } catch {
        t.skip('Database unavailable');
        return;
    }

    if (!migrationReady) {
        t.skip('Workspace migration not applied');
        return;
    }

    const marker = `isolation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const created = await db.query(
        `INSERT INTO workspace (name)
         VALUES ($1), ($2)
         RETURNING id, name`,
        [`${marker}-alice`, `${marker}-bob`]
    );
    const aliceId = created.rows.find((row) => row.name.endsWith('-alice')).id;
    const bobId = created.rows.find((row) => row.name.endsWith('-bob')).id;

    try {
        let aliceEditionId;
        let bobEditionId;

        await db.withWorkspace(aliceId, async () => {
            const series = await db.query(
                'INSERT INTO conference_series (name, acronym) VALUES ($1, $2) RETURNING id',
                [`${marker}-conference`, 'A']
            );
            const edition = await db.query(
                'INSERT INTO edition (conference_id, year) VALUES ($1, 2026) RETURNING id',
                [series.rows[0].id]
            );
            aliceEditionId = edition.rows[0].id;
        });

        await db.withWorkspace(bobId, async () => {
            const series = await db.query(
                'INSERT INTO conference_series (name, acronym) VALUES ($1, $2) RETURNING id',
                [`${marker}-conference`, 'B']
            );
            const edition = await db.query(
                'INSERT INTO edition (conference_id, year) VALUES ($1, 2026) RETURNING id',
                [series.rows[0].id]
            );
            bobEditionId = edition.rows[0].id;
        });

        const aliceRows = await db.withWorkspace(
            aliceId,
            () => conferenceRepository.listConferences()
        );
        const bobRows = await db.withWorkspace(
            bobId,
            () => conferenceRepository.listConferences()
        );

        assert.ok(aliceRows.some((row) => row.id === aliceEditionId));
        assert.ok(!aliceRows.some((row) => row.id === bobEditionId));
        assert.ok(bobRows.some((row) => row.id === bobEditionId));
        assert.ok(!bobRows.some((row) => row.id === aliceEditionId));

        await assert.rejects(
            db.withWorkspace(
                aliceId,
                () => db.query(
                    'INSERT INTO paper (edition_id, title) VALUES ($1, $2)',
                    [bobEditionId, `${marker}-cross-workspace-paper`]
                )
            ),
            /workspace boundary/
        );

        const crossDelete = await db.withWorkspace(
            aliceId,
            () => conferenceRepository.deleteConference(bobEditionId)
        );
        assert.equal(crossDelete, false);

        await db.withWorkspace(aliceId, () => resetWorkspaceData());
        const aliceAfterReset = await db.withWorkspace(
            aliceId,
            () => conferenceRepository.listConferences()
        );
        const bobAfterAliceReset = await db.withWorkspace(
            bobId,
            () => conferenceRepository.listConferences()
        );
        assert.equal(aliceAfterReset.length, 0);
        assert.ok(bobAfterAliceReset.some((row) => row.id === bobEditionId));
    } finally {
        await db.query('DELETE FROM workspace WHERE id = ANY($1::uuid[])', [[aliceId, bobId]]);
    }
});

test('first user claims legacy workspace and next user receives private workspace', async (t) => {
    if (process.env.CONFQUAL_RUN_DESTRUCTIVE_DB_TESTS !== 'true') {
        t.skip('Runs only against disposable database');
        return;
    }

    try {
        const check = await db.query(`SELECT to_regclass('public.workspace') IS NOT NULL AS ready`);
        if (!check.rows[0]?.ready) {
            t.skip('Workspace migration not applied');
            return;
        }
    } catch {
        t.skip('Database unavailable');
        return;
    }

    const marker = `bootstrap-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const legacy = await db.query(
        `SELECT w.id
         FROM workspace w
         WHERE w.is_legacy = true
           AND NOT EXISTS (
               SELECT 1 FROM workspace_member wm WHERE wm.workspace_id = w.id
           )
         ORDER BY w.created_at ASC
         LIMIT 1`
    );
    if (!legacy.rows[0]) {
        t.skip('No unclaimed legacy workspace');
        return;
    }
    const legacyId = legacy.rows[0].id;
    const aliceUserId = '11111111-1111-4111-8111-111111111111';
    const bobUserId = '22222222-2222-4222-8222-222222222222';
    let bobWorkspaceId;

    try {
        const alice = await workspaceService.resolveWorkspace({
            sub: aliceUserId,
            email: `${marker}-alice@example.com`
        });
        const bob = await workspaceService.resolveWorkspace({
            sub: bobUserId,
            email: `${marker}-bob@example.com`
        });
        bobWorkspaceId = bob.workspaceId;

        assert.equal(alice.workspaceId, legacyId);
        assert.equal(alice.role, 'admin');
        assert.notEqual(bob.workspaceId, alice.workspaceId);
        assert.equal(bob.role, 'admin');
    } finally {
        await db.query(
            'DELETE FROM workspace WHERE id = ANY($1::uuid[])',
            [[legacyId, bobWorkspaceId].filter(Boolean)]
        );
    }
});
