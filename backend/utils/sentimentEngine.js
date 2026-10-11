const fs = require('fs');
const path = require('path');
const { pipeline, env } = require('@xenova/transformers');

const MODEL_ID = 'philschmid/MiniLM-L6-H384-uncased-sst2';
const LOCAL_MODEL_ROOT = path.resolve(__dirname, '..', 'models');
const REQUIRED_MODEL_FILES = Object.freeze([
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    path.join('onnx', 'model_quantized.onnx'),
]);

// Remote models stay disabled because conference information must remain private.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = `${LOCAL_MODEL_ROOT}${path.sep}`;
env.useFSCache = false;
if (env.backends.onnx?.wasm) {
    env.backends.onnx.wasm.wasmPaths = `${path.resolve(
        path.dirname(require.resolve('@xenova/transformers')),
        '..',
        'dist'
    )}${path.sep}`;
}

let classifierPromise = null;

function isModelDisabled() {
    return process.env.SENTIMENT_ANALYSIS_MODE === 'rules';
}

function assertLocalModelPresent() {
    const modelDir = path.join(LOCAL_MODEL_ROOT, MODEL_ID);
    const missing = REQUIRED_MODEL_FILES.filter(file => !fs.existsSync(path.join(modelDir, file)));
    if (missing.length > 0) {
        throw new Error(`Local sentiment model is incomplete; missing ${missing.length} required file(s).`);
    }
}

async function createLocalClassifier() {
    assertLocalModelPresent();
    return pipeline('sentiment-analysis', MODEL_ID, {
        quantized: true,
        local_files_only: true,
    });
}

let classifierFactory = createLocalClassifier;

async function getClassifier() {
    if (isModelDisabled()) {
        throw new Error('Transformer sentiment model is disabled');
    }
    if (!classifierPromise) {
        classifierPromise = Promise.resolve()
            .then(() => classifierFactory())
            .catch(err => {
                classifierPromise = null;
                throw err;
            });
    }
    return classifierPromise;
}

function setClassifierFactoryForTests(factory) {
    classifierFactory = factory || createLocalClassifier;
    classifierPromise = null;
}

function getSentimentModelId() {
    return MODEL_ID;
}

/**
 * Extracts the evaluation and critique section of an academic review,
 * bypassing the introductory neutral/positive paper summary.
 * @param {string} text
 * @returns {string}
 */
function extractEvaluationText(text) {
    if (!text || typeof text !== 'string') return '';
    const evalMatch = text.match(/\((?:OVERALL EVALUATION|EVALUATION|DETAILED COMMENTS|COMMENTS TO AUTHORS|COMMENTS|MAIN REVIEW|STRENGTHS AND WEAKNESSES)\)([\s\S]*)/i);
    if (evalMatch && evalMatch[1].trim().length > 20) {
        return evalMatch[1].trim();
    }
    return text.trim();
}

/**
 * Basic fast rule-based fallback for synchronous calls or offline cold starts.
 */
function analyzeReviewSentimentSync(text) {
    const targetText = extractEvaluationText(text);
    if (!targetText || typeof targetText !== 'string' || targetText.length === 0) return 0;
    const clean = targetText.toLowerCase();
    const pos = ['excellent', 'groundbreaking', 'solid', 'strong', 'clear', 'novel', 'insightful', 'rigorous', 'well written', 'great', 'valuable', 'thorough', 'accept', 'good'];
    const neg = ['flawed', 'weak', 'poor', 'incorrect', 'lack', 'rejection', 'reject', 'marginal', 'unclear', 'invalid', 'shallow', 'insufficient', 'confusing', 'limited'];

    let score = 0;
    for (const w of pos) {
        if (clean.includes(w)) score += 2.0;
    }
    for (const w of neg) {
        if (clean.includes(w)) score -= 2.0;
    }
    return Math.max(-10, Math.min(10, parseFloat(score.toFixed(2))));
}

/**
 * Analyzes review sentiment using local deep learning ONNX model.
 * Sentiment is a heuristic signal, not a definitive assessment of review quality or recommendation.
 * Returns a normalized score from -10.00 (strong negative) to +10.00 (strong positive).
 * @param {string} text
 * @returns {Promise<number>}
 */
async function analyzeReviewSentimentAsync(text) {
    const targetText = extractEvaluationText(text);
    if (!targetText || typeof targetText !== 'string' || targetText.length === 0) {
        return 0;
    }
    if (isModelDisabled()) return analyzeReviewSentimentSync(targetText);

    try {
        const classifier = await getClassifier();
        // Truncate to 128 tokens for fast, robust evaluation inference
        const results = await classifier(targetText.slice(0, 500), { truncation: true, max_length: 128 });
        if (!results || results.length === 0) return 0;

        const { label, score } = results[0];
        const scaled = (score || 0) * 10;
        const normalized = label === 'POSITIVE' ? scaled : -scaled;
        return parseFloat(normalized.toFixed(2));
    } catch {
        console.warn('Local Transformers.js analysis unavailable; using local rule-based sentiment.');
        return analyzeReviewSentimentSync(targetText);
    }
}

/**
 * Batch analyzes review sentiment for multiple reviews.
 * @param {string[]} texts
 * @returns {Promise<number[]>}
 */
async function batchAnalyzeReviewSentiment(texts) {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    if (isModelDisabled()) return texts.map(text => analyzeReviewSentimentSync(text));
    
    try {
        const classifier = await getClassifier();
        const results = new Array(texts.length).fill(0);
        
        // Find indices of valid non-empty evaluation texts
        const validItems = [];
        for (let i = 0; i < texts.length; i++) {
            const extracted = extractEvaluationText(texts[i]);
            if (extracted && extracted.length > 0) {
                validItems.push({ index: i, text: extracted.slice(0, 500) });
            }
        }

        const batchSize = 64;
        for (let i = 0; i < validItems.length; i += batchSize) {
            const slice = validItems.slice(i, i + batchSize);
            const batchTexts = slice.map(item => item.text);
            const batchOutputs = await classifier(batchTexts, { truncation: true, max_length: 128 });
            
            for (let j = 0; j < slice.length; j++) {
                const out = batchOutputs[j];
                if (out) {
                    const scaled = (out.score || 0) * 10;
                    const norm = out.label === 'POSITIVE' ? scaled : -scaled;
                    results[slice[j].index] = parseFloat(norm.toFixed(2));
                }
            }
        }
        return results;
    } catch {
        console.warn('Local Transformers.js batch analysis unavailable; using local rule-based sentiment.');
        return texts.map(t => analyzeReviewSentimentSync(t));
    }
}

module.exports = {
    getClassifier,
    getSentimentModelId,
    isModelDisabled,
    setClassifierFactoryForTests,
    extractEvaluationText,
    analyzeReviewSentimentAsync,
    analyzeReviewSentimentSync,
    batchAnalyzeReviewSentiment,
};
