import test from 'node:test';
import assert from 'node:assert/strict';
import appModule from '../app.js';

test('proxy headers are trusted only when explicitly configured for loopback', () => {
    const original = process.env.CONFQUAL_TRUST_PROXY;
    const originalDyno = process.env.DYNO;
    try {
        delete process.env.CONFQUAL_TRUST_PROXY;
        delete process.env.DYNO;
        assert.equal(appModule.createApp().get('trust proxy'), false);
        process.env.CONFQUAL_TRUST_PROXY = 'loopback';
        assert.equal(appModule.createApp().get('trust proxy'), 'loopback');
        process.env.CONFQUAL_TRUST_PROXY = 'true';
        assert.equal(appModule.createApp().get('trust proxy'), false);
        process.env.DYNO = 'web.1';
        assert.equal(appModule.createApp().get('trust proxy'), 1);
    } finally {
        if (original === undefined) delete process.env.CONFQUAL_TRUST_PROXY;
        else process.env.CONFQUAL_TRUST_PROXY = original;
        if (originalDyno === undefined) delete process.env.DYNO;
        else process.env.DYNO = originalDyno;
    }
});
