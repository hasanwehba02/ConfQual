const test = require('node:test');
const assert = require('node:assert');
const { checkMismatch, extractWords } = require('../utils/topicMatcher');

test('extractWords should filter stop words and return lowercased tokens', () => {
    const words = extractWords('Machine Learning and Systems for Data');
    assert.deepStrictEqual(words, ['machine', 'learning', 'data']);
});

test('checkMismatch should return false for exact match', () => {
    const mismatch = checkMismatch('Machine Learning, AI', 'AI, Deep Learning');
    assert.strictEqual(mismatch, false);
});

test('checkMismatch should return false for fuzzy word match', () => {
    const mismatch = checkMismatch('Machine Learning', 'Deep Learning Systems');
    assert.strictEqual(mismatch, false); // Both have "learning"
});

test('checkMismatch should return true for complete mismatch', () => {
    const mismatch = checkMismatch('Quantum Computing', 'Biology and Life Sciences');
    assert.strictEqual(mismatch, true);
});

test('checkMismatch should handle null values', () => {
    assert.strictEqual(checkMismatch(null, 'AI'), false);
    assert.strictEqual(checkMismatch('AI', null), false);
});
