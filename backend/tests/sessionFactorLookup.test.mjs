import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import db from '../config/database.js';

test('session factor lookup uses the base DB role while workspace scope is active', {
    skip: process.env.CONFQUAL_SUPPORT_TEST_DB !== 'true' && 'Requires a disposable local test database'
}, async () => {
    const target = new URL(process.env.DATABASE_URL);
    const localTrial = target.hostname === '127.0.0.1' && target.port === '55439' &&
        ['/confqual_support_trial', '/confqual_audit_trial'].includes(target.pathname);
    const ciTrial = process.env.GITHUB_ACTIONS === 'true' && target.hostname === 'localhost' &&
        target.port === '5432' && target.pathname === '/confqual_test';
    assert.ok(localTrial || ciTrial, 'Integration test requires the designated disposable database');

    await db.query('CREATE SCHEMA IF NOT EXISTS auth');
    await db.query(`CREATE TABLE IF NOT EXISTS auth.sessions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        factor_id uuid
    )`);
    const sessionId = randomUUID();
    const userId = randomUUID();
    const factorId = randomUUID();
    await db.query('INSERT INTO auth.sessions (id, user_id, factor_id) VALUES ($1, $2, $3)', [sessionId, userId, factorId]);
    try {
        const result = await db.withWorkspace(randomUUID(), () => db.getSessionFactorId(sessionId, userId));
        assert.equal(result, factorId);
        assert.equal(await db.getSessionFactorId(sessionId, randomUUID()), null);
    } finally {
        await db.query('DELETE FROM auth.sessions WHERE id = $1', [sessionId]);
    }
});
