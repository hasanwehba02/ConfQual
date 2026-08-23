import test from 'node:test';
import assert from 'node:assert/strict';
import {
    analyzeReviewSentimentAsync,
    analyzeReviewSentimentSync,
    batchAnalyzeReviewSentiment,
} from '../utils/sentimentEngine.js';
import { isSentimentMismatch, calculateCalibration } from '../utils/analyticsMath.js';

test('analyzeReviewSentimentSync handles basic positive/negative strings', () => {
    const pos = analyzeReviewSentimentSync('This is an excellent and groundbreaking contribution.');
    assert.ok(pos > 0, `Expected positive score, got ${pos}`);

    const neg = analyzeReviewSentimentSync('The methodology is severely flawed and poor.');
    assert.ok(neg < 0, `Expected negative score, got ${neg}`);

    assert.equal(analyzeReviewSentimentSync(''), 0);
    assert.equal(analyzeReviewSentimentSync(null), 0);
    assert.equal(analyzeReviewSentimentSync(undefined), 0);
});

test('analyzeReviewSentimentAsync classifies positive and polite rejection text using Transformers.js', async () => {
    const pos = await analyzeReviewSentimentAsync('Outstanding work with thorough theoretical and empirical evaluation.');
    assert.ok(pos > 0, `Expected positive score, got ${pos}`);

    const politeRejection = await analyzeReviewSentimentAsync(
        'The paper is well written and easy to read. However, the evaluation is completely flawed and the claims lack any validation.'
    );
    assert.ok(politeRejection < 0, `Expected negative score for polite rejection, got ${politeRejection}`);

    const empty = await analyzeReviewSentimentAsync('');
    assert.equal(empty, 0);
});

test('batchAnalyzeReviewSentiment handles multiple reviews in parallel', async () => {
    const reviews = [
        'A truly fantastic and solid paper.',
        'Extremely weak presentation with numerous technical errors.',
        '',
    ];
    const results = await batchAnalyzeReviewSentiment(reviews);
    assert.equal(results.length, 3);
    assert.ok(results[0] > 0, 'First review should be positive');
    assert.ok(results[1] < 0, 'Second review should be negative');
    assert.equal(results[2], 0, 'Empty review should be 0');
});

test('isSentimentMismatch correctly flags discrepancies', () => {
    // Low numerical score (<= 1) but high positive sentiment (>= 6)
    assert.equal(isSentimentMismatch(-1, 8.5), true);
    assert.equal(isSentimentMismatch(1, 9.2), true);
    assert.equal(isSentimentMismatch(1, 2.0), false);

    // High numerical score (>= 2) but high negative sentiment (<= -6)
    assert.equal(isSentimentMismatch(3, -8.0), true);
    assert.equal(isSentimentMismatch(2, -7.5), true);
    assert.equal(isSentimentMismatch(2, -2.0), false);

    // Null safety
    assert.equal(isSentimentMismatch(null, 5.0), false);
    assert.equal(isSentimentMismatch(1, null), false);
});

test('calculateCalibration computes difference from peer average', () => {
    assert.equal(calculateCalibration(2.5, 1.0), 1.5);
    assert.equal(calculateCalibration(0.5, 1.5), -1.0);
    assert.equal(calculateCalibration(null, 1.5), null);
    assert.equal(calculateCalibration(2.0, null), null);
});
