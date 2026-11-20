import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../config/database.js';
import cache from '../utils/dashboardCache.js';

test('dashboard cache and in-flight work are isolated by workspace', async () => {
    cache.del();
    await db.withWorkspace('alice', async () => {
        cache.set(null, false, { private: 'alice' });
        await db.withWorkspace('bob', async () => {
            assert.equal(cache.get(null, false), null);
            assert.equal(await cache.coalesce(null, false, async () => 'bob'), 'bob');
        });
        assert.deepEqual(cache.get(null, false), { private: 'alice' });
        let release;
        const pending = cache.coalesce(null, false, () => new Promise(resolve => { release = resolve; }));
        await Promise.resolve();
        const other = await db.withWorkspace('bob', () => cache.coalesce(null, false, async () => 'bob'));
        assert.equal(other, 'bob');
        release('alice');
        assert.equal(await pending, 'alice');
    });
    cache.del();
    cache.set(null, false, { private: 'unscoped' });
    assert.equal(cache.get(null, false), null);
    assert.equal(await cache.coalesce(null, false, async () => 'uncached'), 'uncached');
});
