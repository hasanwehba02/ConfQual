import test from 'node:test';
import assert from 'node:assert/strict';
import statusModule from '../services/importStatusStore.js';

const { ImportStatusStore } = statusModule;

test('import status is visible only inside owning workspace', () => {
    const store = new ImportStatusStore();
    const importId = store.start('workspace-alice');

    assert.equal(store.get(importId, 'workspace-bob'), null);
    assert.equal(store.finish(importId, 'workspace-bob'), false);
    assert.equal(store.get(importId, 'workspace-alice').status, 'running');

    assert.equal(store.finish(importId, 'workspace-alice'), true);
    assert.equal(store.get(importId, 'workspace-alice').status, 'done');
    assert.equal('workspaceId' in store.get(importId, 'workspace-alice'), false);
});

test('import failures do not expose internal error details', () => {
    const store = new ImportStatusStore();
    const id = store.start('workspace-alice');
    store.fail(id, 'workspace-alice', new Error('secret record at /private/path'));
    assert.equal(store.get(id, 'workspace-alice').error, 'Import failed');
});
