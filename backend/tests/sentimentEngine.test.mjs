import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
    analyzeReviewSentimentAsync,
    analyzeReviewSentimentSync,
    batchAnalyzeReviewSentiment,
    getClassifier,
    getSentimentModelId,
    isModelDisabled,
    setClassifierFactoryForTests,
} from '../utils/sentimentEngine.js';
import { isSentimentMismatch, calculateCalibration } from '../utils/analyticsMath.js';

const require = createRequire(import.meta.url);
const { env } = require('@xenova/transformers');
const EXPECTED_MODEL_ID = 'philschmid/MiniLM-L6-H384-uncased-sst2';

test('Transformers.js permits only local model and runtime resources', () => {
    assert.equal(getSentimentModelId(), EXPECTED_MODEL_ID);
    assert.equal(env.allowRemoteModels, false);
    assert.equal(env.allowLocalModels, true);
    assert.equal(path.isAbsolute(env.localModelPath), true);
    assert.match(env.localModelPath, /backend[/\\]models[/\\]$/);
    assert.equal(path.isAbsolute(env.backends.onnx.wasm.wasmPaths), true);
});

test('getClassifier lazy-loads one shared local classifier', async () => {
    const classifier = async () => [{ label: 'POSITIVE', score: 0.9 }];
    let initializationCount = 0;
    setClassifierFactoryForTests(async () => {
        initializationCount++;
        return classifier;
    });

    try {
        const [first, second] = await Promise.all([getClassifier(), getClassifier()]);
        assert.equal(first, classifier);
        assert.equal(second, classifier);
        assert.equal(initializationCount, 1);
    } finally {
        setClassifierFactoryForTests();
    }
});

test('local Transformer initializes and infers with outbound networking blocked', {
    skip: !fs.existsSync(path.join(env.localModelPath, getSentimentModelId(), 'onnx', 'model_quantized.onnx')),
}, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
        throw new Error('Outbound network attempted during local inference');
    };
    setClassifierFactoryForTests();

    try {
        const classifier = await getClassifier();
        const result = await classifier('I love this.', { truncation: true, max_length: 128 });
        assert.equal(result[0].label, 'POSITIVE');
        assert.ok(result[0].score > 0.9);
    } finally {
        setClassifierFactoryForTests();
        globalThis.fetch = originalFetch;
    }
});

test('analyzeReviewSentimentSync handles basic positive/negative strings', () => {
    const pos = analyzeReviewSentimentSync('This is an excellent and groundbreaking contribution.');
    assert.ok(pos > 0, `Expected positive score, got ${pos}`);

    const neg = analyzeReviewSentimentSync('The methodology is severely flawed and poor.');
    assert.ok(neg < 0, `Expected negative score, got ${neg}`);

    assert.equal(analyzeReviewSentimentSync(''), 0);
    assert.equal(analyzeReviewSentimentSync(null), 0);
    assert.equal(analyzeReviewSentimentSync(undefined), 0);
});

test('rule-based mode avoids loading the Transformers.js model', async () => {
    const previousMode = process.env.SENTIMENT_ANALYSIS_MODE;
    process.env.SENTIMENT_ANALYSIS_MODE = 'rules';
    try {
        assert.equal(isModelDisabled(), true);
        const result = await analyzeReviewSentimentAsync('The methodology is flawed and poor.');
        assert.ok(result < 0, `Expected fallback negative score, got ${result}`);
    } finally {
        if (previousMode === undefined) {
            delete process.env.SENTIMENT_ANALYSIS_MODE;
        } else {
            process.env.SENTIMENT_ANALYSIS_MODE = previousMode;
        }
    }
});

test('analyzeReviewSentimentAsync classifies positive and polite rejection text', async () => {
    setClassifierFactoryForTests(async () => async text => [{
        label: text.includes('flawed') ? 'NEGATIVE' : 'POSITIVE',
        score: 0.9,
    }]);
    try {
        const pos = await analyzeReviewSentimentAsync('Outstanding work with thorough theoretical and empirical evaluation.');
        assert.equal(pos, 9);

        const politeRejection = await analyzeReviewSentimentAsync(
            'The paper is well written and easy to read. However, the evaluation is completely flawed and the claims lack any validation.'
        );
        assert.equal(politeRejection, -9);

        const empty = await analyzeReviewSentimentAsync('');
        assert.equal(empty, 0);
    } finally {
        setClassifierFactoryForTests();
    }
});

test('batchAnalyzeReviewSentiment handles multiple reviews in parallel', async () => {
    const reviews = [
        'A truly fantastic and solid paper.',
        'Extremely weak presentation with numerous technical errors.',
        '',
    ];
    setClassifierFactoryForTests(async () => async texts => texts.map(text => ({
        label: text.includes('weak') ? 'NEGATIVE' : 'POSITIVE',
        score: 0.8,
    })));
    try {
        const results = await batchAnalyzeReviewSentiment(reviews);
        assert.deepEqual(results, [8, -8, 0]);
    } finally {
        setClassifierFactoryForTests();
    }
});

test('model failure stays local, falls back, and never logs review text', async () => {
    const reviewText = 'PRIVATE_REVIEW_TEXT methodology is flawed and poor';
    const originalFetch = globalThis.fetch;
    const originalWarn = console.warn;
    const warnings = [];
    let networkAttempted = false;
    globalThis.fetch = async () => {
        networkAttempted = true;
        throw new Error('Outbound network blocked by test');
    };
    console.warn = (...args) => warnings.push(args.join(' '));
    setClassifierFactoryForTests(async () => {
        throw new Error(`Failed while handling ${reviewText}`);
    });

    try {
        const result = await analyzeReviewSentimentAsync(reviewText);
        assert.ok(result < 0);
        assert.equal(networkAttempted, false);
        assert.equal(warnings.some(message => message.includes(reviewText)), false);
        assert.match(warnings[0], /local rule-based sentiment/i);
    } finally {
        setClassifierFactoryForTests();
        console.warn = originalWarn;
        globalThis.fetch = originalFetch;
    }
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
