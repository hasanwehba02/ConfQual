import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import appModule from '../app.js';
import db from '../config/database.js';

test('direct IDs and reports stay inside the requested workspace and edition', {
    skip: process.env.CONFQUAL_DIRECT_ID_TEST_DB !== 'true' && 'Requires a disposable migrated test database'
}, async () => {
    const target = new URL(process.env.DATABASE_URL);
    const localTrial = target.hostname === '127.0.0.1' && target.port === '55439' && target.pathname === '/confqual_support_trial';
    const ciTrial = process.env.GITHUB_ACTIONS === 'true' && target.hostname === 'localhost' && target.port === '5432' && target.pathname === '/confqual_test';
    assert.ok(localTrial || ciTrial, 'Integration test requires the designated disposable database');

    const workspaces = [randomUUID(), randomUUID()];
    const records = [];
    let server;
    try {
        for (const [index, workspaceId] of workspaces.entries()) {
            await db.query('INSERT INTO workspace (id, name) VALUES ($1, $2)', [workspaceId, `Synthetic direct ID ${index}`]);
            const record = await db.withWorkspace(workspaceId, async () => {
                const series = await db.query('INSERT INTO conference_series (name) VALUES ($1) RETURNING id', [`Synthetic series ${randomUUID()}`]);
                const edition = await db.query('INSERT INTO edition (conference_id, year) VALUES ($1, 2026) RETURNING id', [series.rows[0].id]);
                const researcher = await db.query("INSERT INTO researcher (first_name, last_name) VALUES ('Synthetic', 'Reviewer') RETURNING id");
                const participant = await db.query('INSERT INTO participant (researcher_id, edition_id) VALUES ($1, $2) RETURNING id', [researcher.rows[0].id, edition.rows[0].id]);
                const paper = await db.query('INSERT INTO paper (edition_id, external_submission_id, title) VALUES ($1, $2, $3) RETURNING id', [edition.rows[0].id, 900000 + index, `Private paper ${index}`]);
                if (index === 0) await db.query('INSERT INTO settings (decision_editing_enabled) VALUES (true)');
                return { editionId: edition.rows[0].id, reviewerId: participant.rows[0].id, paperId: paper.rows[0].id, submissionId: 900000 + index };
            });
            records.push(record);
        }

        const app = appModule.createApp({
            privilegedMfaMiddleware(_req, _res, next) { next(); },
            authMiddleware(req, _res, next) {
                req.user = {
                    sub: req.get('x-test-actor') === 'bob' ? 'bob' : 'alice',
                    aal: 'aal2',
                    amr: [{ method: 'totp' }],
                    app_metadata: { confqual_access_approved: true }
                };
                req.authUser = { id: req.user.sub, app_metadata: { confqual_access_approved: true } };
                next();
            },
            workspaceMiddleware(req, _res, next) {
                req.workspaceId = workspaces[req.user.sub === 'bob' ? 1 : 0];
                req.workspaceRole = 'admin';
                db.withWorkspace(req.workspaceId, () => next());
            }
        });
        server = http.createServer(app);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const base = `http://127.0.0.1:${server.address().port}/api/analytics`;
        const [alice, bob] = records;

        const ownReviewer = await fetch(`${base}/reviewers/${alice.reviewerId}`, { headers: { 'x-test-actor': 'alice' } });
        assert.equal(ownReviewer.status, 200);
        assert.equal((await ownReviewer.json()).id, alice.reviewerId);

        for (const path of [
            `/reviewers/${bob.reviewerId}`,
            `/reviewers/${bob.reviewerId}/report`,
            `/papers/${bob.submissionId}?conferenceId=${bob.editionId}`,
            `/reviewers/${alice.reviewerId}?conferenceId=${bob.editionId}`,
            `/reviewers/${alice.reviewerId}/report?conferenceId=${bob.editionId}`
        ]) {
            const response = await fetch(`${base}${path}`, { headers: { 'x-test-actor': 'alice' } });
            assert.equal(response.status, 404, path);
        }

        const foreignDecision = await fetch(`${base}/papers/${bob.paperId}/decision`, {
            method: 'PUT', headers: { 'x-test-actor': 'alice', 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'accept' })
        });
        assert.equal(foreignDecision.status, 404);

        const foreignUpdate = await fetch(`${base}/conferences/${bob.editionId}`, {
            method: 'PUT', headers: { 'x-test-actor': 'alice', 'content-type': 'application/json' }, body: JSON.stringify({ year: 2027 })
        });
        assert.equal(foreignUpdate.status, 404);

        const foreignDelete = await fetch(`${base}/conferences/${bob.editionId}`, {
            method: 'DELETE', headers: { 'x-test-actor': 'alice' }
        });
        assert.equal(foreignDelete.status, 404);
        const stillThere = await db.withWorkspace(workspaces[1], () => db.query('SELECT id FROM edition WHERE id = $1', [bob.editionId]));
        assert.equal(stillThere.rows[0]?.id, bob.editionId);
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await db.query('DELETE FROM workspace WHERE id = ANY($1::uuid[])', [workspaces]);
        await db.end();
    }
});
