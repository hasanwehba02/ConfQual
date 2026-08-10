const test = require('node:test');
const assert = require('node:assert');
const { normalizeDecision } = require('../utils/decisionNormalizer');

test('should return Accept for clear accepts', () => {
    assert.strictEqual(normalizeDecision('Accept'), 'Accept');
    assert.strictEqual(normalizeDecision('Accept (Poster)'), 'Accept');
    assert.strictEqual(normalizeDecision('Conditional Accept'), 'Accept');
});

test('should return Reject for clear rejects', () => {
    assert.strictEqual(normalizeDecision('Reject'), 'Reject');
    assert.strictEqual(normalizeDecision('Strong Reject'), 'Reject');
});

test('should return Desk Reject for desk rejects', () => {
    assert.strictEqual(normalizeDecision('Desk Reject: Out of scope'), 'Desk Reject');
    assert.strictEqual(normalizeDecision('desk reject'), 'Desk Reject');
});

test('should handle "reject but accept to forum" as reject', () => {
    assert.strictEqual(normalizeDecision('Reject but accept to Forum'), 'Reject');
});

test('should return No Decision for empty strings', () => {
    assert.strictEqual(normalizeDecision(''), 'No Decision');
    assert.strictEqual(normalizeDecision(null), 'No Decision');
});
