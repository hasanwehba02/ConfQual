import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../app.js';
import db from '../config/database.js';

let server;
let baseUrl;
let dbAvailable = false;

test.before(async () => {
    try {
        const res = await db.query('SELECT 1');
        dbAvailable = !!res;
    } catch {
        dbAvailable = false;
    }

    await new Promise((resolve) => {
        server = http.createServer(app).listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });
});

test.after(async () => {
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
});

test('API Endpoints Integration Suite', async (t) => {
    await t.test('POST /api/analytics/log responds 200 without requiring database', async () => {
        const res = await fetch(`${baseUrl}/api/analytics/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: 'test_healthcheck' })
        });
        assert.equal(res.status, 200);
    });

    await t.test('GET /api/analytics/conferences returns 200 and array', async (st) => {
        if (!dbAvailable) {
            st.skip('Database unavailable in this environment');
            return;
        }
        const res = await fetch(`${baseUrl}/api/analytics/conferences`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(Array.isArray(data));
    });

    await t.test('GET /api/analytics/dashboard returns 200 with metrics & alerts', async (st) => {
        if (!dbAvailable) {
            st.skip('Database unavailable in this environment');
            return;
        }
        const res = await fetch(`${baseUrl}/api/analytics/dashboard?conferenceId=1`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(typeof data === 'object');
        assert.ok(data.systemAnalytics !== undefined);
        assert.ok(Array.isArray(data.alerts));
    });

    await t.test('GET /api/analytics/alerts returns 200 and alerts array', async (st) => {
        if (!dbAvailable) {
            st.skip('Database unavailable in this environment');
            return;
        }
        const res = await fetch(`${baseUrl}/api/analytics/alerts?conferenceId=1`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(Array.isArray(data));
    });

    await t.test('GET /api/analytics/papers returns 200 and paginated items object', async (st) => {
        if (!dbAvailable) {
            st.skip('Database unavailable in this environment');
            return;
        }
        const res = await fetch(`${baseUrl}/api/analytics/papers?conferenceId=1`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(Array.isArray(data.items));
        assert.ok(typeof data.totalCount === 'number');
    });

    await t.test('GET /api/analytics/reviewers returns 200 and paginated items with bias metrics', async (st) => {
        if (!dbAvailable) {
            st.skip('Database unavailable in this environment');
            return;
        }
        const res = await fetch(`${baseUrl}/api/analytics/reviewers?conferenceId=1`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(Array.isArray(data.items));
        assert.ok(typeof data.totalCount === 'number');
        if (data.items.length > 0) {
            assert.ok(data.items[0].id !== undefined);
            assert.ok(data.items[0].bias_category !== undefined);
            assert.ok(data.items[0].bias_label !== undefined, 'bias_label required by dashboard UI');
        }
    });

    await t.test('GET /api/analytics/reviewer-quality returns 200 and list', async (st) => {
        if (!dbAvailable) {
            st.skip('Database unavailable in this environment');
            return;
        }
        const res = await fetch(`${baseUrl}/api/analytics/reviewer-quality?conferenceId=1`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(Array.isArray(data));
    });

    await t.test('GET /api/analytics/paper-debates returns 200 and list', async (st) => {
        if (!dbAvailable) {
            st.skip('Database unavailable in this environment');
            return;
        }
        const res = await fetch(`${baseUrl}/api/analytics/paper-debates?conferenceId=1`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(Array.isArray(data));
    });

    await t.test('GET /api/analytics/expertise-match returns 200 with details array', async (st) => {
        if (!dbAvailable) {
            st.skip('Database unavailable in this environment');
            return;
        }
        const res = await fetch(`${baseUrl}/api/analytics/expertise-match?conferenceId=1`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(typeof data.totalMismatches === 'number');
        assert.ok(Array.isArray(data.details));
    });

    await t.test('GET /api/analytics/papers/:id returns 404 for nonexistent paper', async (st) => {
        if (!dbAvailable) {
            st.skip('Database unavailable in this environment');
            return;
        }
        const res = await fetch(`${baseUrl}/api/analytics/papers/9999999`);
        assert.equal(res.status, 404);
    });

    await t.test('GET /api/analytics/reviewers/:id returns 404 for nonexistent reviewer', async (st) => {
        if (!dbAvailable) {
            st.skip('Database unavailable in this environment');
            return;
        }
        const res = await fetch(`${baseUrl}/api/analytics/reviewers/9999999`);
        assert.equal(res.status, 404);
    });

    await t.test('GET /api/settings returns 200 and settings object', async (st) => {
        if (!dbAvailable) {
            st.skip('Database unavailable in this environment');
            return;
        }
        const res = await fetch(`${baseUrl}/api/settings`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(typeof data === 'object');
        assert.ok(typeof data.is_anonymized === 'boolean');
    });

    await t.test('Notes CRUD API endpoints (GET, POST, PUT, DELETE)', async (st) => {
        if (!dbAvailable) {
            st.skip('Database unavailable in this environment');
            return;
        }

        // 1. GET /api/analytics/notes
        const listRes = await fetch(`${baseUrl}/api/analytics/notes`);
        assert.equal(listRes.status, 200);
        const initialNotes = await listRes.json();
        assert.ok(Array.isArray(initialNotes));

        // 2. POST /api/analytics/notes (validation error on empty text)
        const emptyRes = await fetch(`${baseUrl}/api/analytics/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: '' })
        });
        assert.equal(emptyRes.status, 400);

        // 3. POST /api/analytics/notes (create valid note)
        const createRes = await fetch(`${baseUrl}/api/analytics/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'API Route Test Note' })
        });
        assert.equal(createRes.status, 200);
        const createdNote = await createRes.json();
        assert.ok(createdNote.id);
        assert.equal(createdNote.text, 'API Route Test Note');

        // 4. PUT /api/analytics/notes/:id (update note)
        const updateRes = await fetch(`${baseUrl}/api/analytics/notes/${createdNote.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'API Route Test Note Updated' })
        });
        assert.equal(updateRes.status, 200);
        const updatedNote = await updateRes.json();
        assert.equal(updatedNote.text, 'API Route Test Note Updated');

        // 5. DELETE /api/analytics/notes/:id
        const deleteRes = await fetch(`${baseUrl}/api/analytics/notes/${createdNote.id}`, {
            method: 'DELETE'
        });
        assert.equal(deleteRes.status, 200);
        const deleteResult = await deleteRes.json();
        assert.equal(deleteResult.ok, true);
    });
});
