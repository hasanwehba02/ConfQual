import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dbPath = require.resolve('../config/database.js');
require(dbPath);
const db = {};
require.cache[dbPath].exports = db;
const service = require('../services/workspaceService.js');

test('new user gets a new workspace without claiming legacy data', async () => {
    const original = db.withTransaction;
    const statements = [];
    db.withTransaction = async (fn) => fn({ query: async (sql) => {
        statements.push(sql);
        if (sql.includes('FROM workspace_member')) return { rows: [] };
        if (sql.includes('INSERT INTO workspace (')) return { rows: [{ id: 'new-workspace' }] };
        return { rows: [] };
    } });
    try {
        assert.deepEqual(await service.resolveWorkspace({ sub: 'new-user' }), { workspaceId: 'new-workspace', role: 'admin' });
        assert.equal(statements.some((sql) => sql.includes('is_legacy')), false);
    } finally {
        db.withTransaction = original;
    }
});
