const test = require('node:test');
const assert = require('node:assert');
const { computeReviewerStats, applyNormalization, deriveBiasLabel } = require('../utils/scoreNormalization');

test('computeReviewerStats returns mean/std/count per eligible reviewer', () => {
    const reviews = [
        { reviewerId: 1, totalScore: 1 },
        { reviewerId: 1, totalScore: 2 },
        { reviewerId: 1, totalScore: 3 },
        { reviewerId: 2, totalScore: -1 },
        { reviewerId: 2, totalScore: 1 }
    ];
    const stats = computeReviewerStats(reviews);
    assert.deepStrictEqual(stats.get(1), { mean: 2, std: 1, count: 3 });
    assert.strictEqual(stats.has(2), false); // only 2 reviews -> ineligible
});

test('computeReviewerStats excludes reviewers with fewer than 3 reviews', () => {
    const reviews = [
        { reviewerId: 1, totalScore: 1 },
        { reviewerId: 1, totalScore: 2 }
    ];
    const stats = computeReviewerStats(reviews);
    assert.strictEqual(stats.size, 0);
});

test('applyNormalization rescales a known z-score to the conference scale', () => {
    const reviews = [
        { reviewerId: 1, totalScore: 1 },
        { reviewerId: 1, totalScore: 2 },
        { reviewerId: 1, totalScore: 3 }
    ];
    const stats = computeReviewerStats(reviews); // {1: {mean:2, std:1, count:3}}
    const confStats = { mean: 0, std: 2 };
    const adjusted = applyNormalization(reviews, stats, confStats);
    // z = (1-2)/1 = -1 -> 0 + (-1)*2 = -2
    // z = (2-2)/1 = 0  -> 0 + 0*2   = 0
    // z = (3-2)/1 = 1  -> 0 + 1*2   = 2
    assert.deepStrictEqual(adjusted, [-2, 0, 2]);
});

test('applyNormalization passes raw scores through for ineligible reviewers', () => {
    const reviews = [
        { reviewerId: 1, totalScore: 2 },
        { reviewerId: 1, totalScore: 4 },
        { reviewerId: 2, totalScore: 3 }
    ];
    const stats = computeReviewerStats(reviews); // no reviewer has >= 3 reviews
    const adjusted = applyNormalization(reviews, stats, { mean: 0, std: 1 });
    assert.deepStrictEqual(adjusted, [2, 4, 3]);
});

test('applyNormalization passes raw score through when reviewer std is zero', () => {
    const reviews = [
        { reviewerId: 1, totalScore: 3 },
        { reviewerId: 1, totalScore: 3 },
        { reviewerId: 1, totalScore: 3 },
        { reviewerId: 2, totalScore: -2 }
    ];
    const stats = computeReviewerStats(reviews); // reviewer 1: std=0 -> still eligible but std=0
    const adjusted = applyNormalization(reviews, stats, { mean: 0, std: 1 });
    assert.strictEqual(adjusted[0], 3); // raw fallback
    assert.strictEqual(adjusted[1], 3);
    assert.strictEqual(adjusted[2], 3);
    assert.strictEqual(adjusted[3], -2); // reviewer 2 ineligible -> raw
});

test('applyNormalization handles negative scores correctly', () => {
    const reviews = [
        { reviewerId: 1, totalScore: -3 },
        { reviewerId: 1, totalScore: -2 },
        { reviewerId: 1, totalScore: -1 }
    ];
    const stats = computeReviewerStats(reviews); // mean=-2, std=1
    const adjusted = applyNormalization(reviews, stats, { mean: 1, std: 1 });
    // z = (-3-(-2))/1 = -1 -> 1 + (-1)*1 = 0
    // z = (-2-(-2))/1 = 0  -> 1 + 0*1   = 1
    // z = (-1-(-2))/1 = 1  -> 1 + 1*1   = 2
    assert.deepStrictEqual(adjusted, [0, 1, 2]);
});

test('applyNormalization passes null scores through as null', () => {
    const reviews = [
        { reviewerId: 1, totalScore: 1 },
        { reviewerId: 1, totalScore: 2 },
        { reviewerId: 1, totalScore: 3 },
        { reviewerId: 1, totalScore: null }
    ];
    const stats = computeReviewerStats(reviews);
    const adjusted = applyNormalization(reviews, stats, { mean: 0, std: 2 });
    assert.deepStrictEqual(adjusted, [-2, 0, 2, null]);
});

test('applyNormalization yields conf_mean for all when conf_std is zero (no NaN/Infinity)', () => {
    const reviews = [
        { reviewerId: 1, totalScore: 1 },
        { reviewerId: 1, totalScore: 2 },
        { reviewerId: 1, totalScore: 3 }
    ];
    const stats = computeReviewerStats(reviews);
    const adjusted = applyNormalization(reviews, stats, { mean: 0, std: 0 });
    assert.deepStrictEqual(adjusted, [0, 0, 0]);
    adjusted.forEach(a => assert.ok(Number.isFinite(a)));
});

test('deriveBiasLabel returns calibrated for near-zero bias', () => {
    assert.strictEqual(deriveBiasLabel(0.3, 0.0, 5), 'calibrated');
    assert.strictEqual(deriveBiasLabel(-0.4, 0.0, 5), 'calibrated');
});

test('deriveBiasLabel returns lenient/strict for moderate bias', () => {
    assert.strictEqual(deriveBiasLabel(0.8, 0.0, 5), 'lenient');
    assert.strictEqual(deriveBiasLabel(-1.2, 0.0, 5), 'strict');
});

test('deriveBiasLabel returns extreme for strong bias', () => {
    assert.strictEqual(deriveBiasLabel(1.6, 0.0, 5), 'extreme');
    assert.strictEqual(deriveBiasLabel(-2.0, 0.0, 5), 'extreme');
});

test('deriveBiasLabel returns null for fewer than 3 reviews or missing stats', () => {
    assert.strictEqual(deriveBiasLabel(0.8, 0.0, 2), null);
    assert.strictEqual(deriveBiasLabel(null, 0.0, 5), null);
    assert.strictEqual(deriveBiasLabel(0.8, null, 5), null);
});
