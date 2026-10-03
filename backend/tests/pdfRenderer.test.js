const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getLaunchOptions, isBrowserConnected } = require('../utils/pdfRenderer');

test('uses Puppeteer defaults outside Heroku', () => {
    assert.deepEqual(getLaunchOptions({ PATH: process.env.PATH }), { headless: 'new' });
});

test('uses Chrome from PATH without a sandbox on Heroku', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'confqual-chrome-'));
    const executablePath = path.join(directory, 'chrome');
    fs.writeFileSync(executablePath, '');

    try {
        assert.deepEqual(getLaunchOptions({ DYNO: 'web.1', PATH: directory }), {
            headless: 'new',
            executablePath,
            args: ['--no-sandbox']
        });
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('detects Puppeteer 25 browser connection state', () => {
    assert.equal(isBrowserConnected({ connected: true }), true);
    assert.equal(isBrowserConnected({ connected: false }), false);
});

test('supports the legacy Puppeteer browser connection method', () => {
    assert.equal(isBrowserConnected({ isConnected: () => true }), true);
    assert.equal(isBrowserConnected({ isConnected: () => false }), false);
});
