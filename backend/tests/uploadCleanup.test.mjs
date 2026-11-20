import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, access, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { processUpload } = require('../controllers/analyticsController');

test('an accepted upload is removed when import setup fails', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'confqual-upload-test-'));
    const filePath = path.join(directory, 'workbook.xlsx');
    await writeFile(filePath, 'private workbook');
    const failure = new Error('setup failed');
    let forwarded;
    const req = {
        file: { path: filePath },
        body: { get conferenceName() { throw failure; } },
        workspaceId: 'test-workspace'
    };

    try {
        await processUpload(req, {}, (error) => { forwarded = error; });
        assert.equal(forwarded, failure);
        await assert.rejects(access(filePath), { code: 'ENOENT' });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
