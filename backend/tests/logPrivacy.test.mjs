import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { errorHandler } = require('../middleware/errorHandler');
const router = require('../routes/analyticsRoutes');
const db = require('../config/database');

test('server errors do not log URLs, error messages, or records', () => {
    const original = console.error;
    const logged = [];
    console.error = (...args) => logged.push(args);
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    try {
        errorHandler(new Error('private record'), { method: 'GET', originalUrl: '/?token=secret' }, res, () => {});
    } finally {
        console.error = original;
    }
    assert.deepEqual(logged, [['Request failed: GET 500']]);
    assert.deepEqual(res.body, { error: 'Internal server error' });
});

test('legacy browser logging endpoint does not write submitted content', () => {
    const layer = router.stack.find((entry) => entry.route?.path === '/log');
    const handler = layer.route.stack[0].handle;
    const original = console.log;
    const logged = [];
    console.log = (...args) => logged.push(args);
    let status;
    try {
        handler({ ip: 'test', body: { token: 'secret', record: 'private' } }, { sendStatus(value) { status = value; } });
    } finally {
        console.log = original;
    }
    assert.equal(status, 200);
    assert.deepEqual(logged, []);
});

test('idle database errors do not log connection details or records', () => {
    const original = console.error;
    const logged = [];
    console.error = (...args) => logged.push(args);
    try {
        db.emit('error', new Error('private connection string and record'));
    } finally {
        console.error = original;
    }
    assert.deepEqual(logged, [['Unexpected error on idle PostgreSQL client']]);
});
