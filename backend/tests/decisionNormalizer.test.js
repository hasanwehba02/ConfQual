const test = require('node:test');
const assert = require('node:assert');
const { normalizeDecision } = require('../utils/decisionHelper');

test('should return accept for clear accepts', () => {
    assert.strictEqual(normalizeDecision('Accept'), 'accept');
    assert.strictEqual(normalizeDecision('Accept (Poster)'), 'accept');
    assert.strictEqual(normalizeDecision('Conditional Accept'), 'accept');
});

test('should return reject for clear rejects', () => {
    assert.strictEqual(normalizeDecision('Reject'), 'reject');
    assert.strictEqual(normalizeDecision('Strong Reject'), 'reject');
});

test('should return desk reject for desk rejects', () => {
    assert.strictEqual(normalizeDecision('Desk Reject: Out of scope'), 'desk reject');
    assert.strictEqual(normalizeDecision('desk reject'), 'desk reject');
});

test('should handle "reject but accept to forum" as reject', () => {
    assert.strictEqual(normalizeDecision('Reject but accept to Forum'), 'reject');
});

test('should return no decision for empty strings', () => {
    assert.strictEqual(normalizeDecision(''), 'no decision');
    assert.strictEqual(normalizeDecision(null), 'no decision');
});

test('should return withdrawn for withdrawn', () => {
    assert.strictEqual(normalizeDecision('Withdrawn'), 'withdrawn');
    assert.strictEqual(normalizeDecision('withdrawn by author'), 'withdrawn');
});
