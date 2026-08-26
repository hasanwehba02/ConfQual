const test = require('node:test');
const assert = require('node:assert/strict');
const analyticsService = require('../services/analyticsService');

function makeReviewer(overrides = {}) {
    return {
        calibration_index: 0,
        total_reviews_completed: 5,
        avg_word_count: 200,
        avg_score_given: 3,
        conf_mean: 3,
        ...overrides
    };
}

test('enrichReviewerBias assigns calibrated label near conference mean', () => {
    const [r] = analyticsService.enrichReviewerBias([makeReviewer({ avg_score_given: 3.2, conf_mean: 3 })]);
    assert.equal(r.bias_label, 'calibrated');
});

test('enrichReviewerBias labels lenient and strict reviewers', () => {
    const reviewers = analyticsService.enrichReviewerBias([
        makeReviewer({ avg_score_given: 4, conf_mean: 3 }),
        makeReviewer({ avg_score_given: 2, conf_mean: 3 })
    ]);
    assert.equal(reviewers[0].bias_label, 'lenient');
    assert.equal(reviewers[1].bias_label, 'strict');
});

test('enrichReviewerBias labels extreme reviewers beyond 1.5 points', () => {
    const [r] = analyticsService.enrichReviewerBias([makeReviewer({ avg_score_given: 6, conf_mean: 3 })]);
    assert.equal(r.bias_label, 'extreme');
});

test('enrichReviewerBias returns null bias_label with fewer than 3 reviews', () => {
    const [r] = analyticsService.enrichReviewerBias([makeReviewer({ total_reviews_completed: 2, avg_score_given: 7 })]);
    assert.equal(r.bias_label, null);
    assert.equal(r.bias_category, 'Standard');
});

test('enrichReviewerBias handles missing scores without throwing', () => {
    const [r] = analyticsService.enrichReviewerBias([makeReviewer({ avg_score_given: null, conf_mean: null })]);
    assert.equal(r.bias_label, null);
    assert.equal(r.bias_category, 'Standard');
});
