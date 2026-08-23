const path = require('path');
const { pipeline, env } = require('@xenova/transformers');

// Ensure models are cached locally inside the project directory
env.cacheDir = path.join(__dirname, '..', '.cache');

let classifierPromise = null;

async function getClassifier() {
    if (!classifierPromise) {
        classifierPromise = pipeline(
            'sentiment-analysis',
            'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
            { quantized: true }
        ).catch(err => {
            console.error('Failed to initialize Transformers.js sentiment pipeline:', err);
            classifierPromise = null;
            throw err;
        });
    }
    return classifierPromise;
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
    const pos = ['excellent', 'groundbreaking', 'solid', 'strong', 'clear', 'novel', 'insightful', 'rigorous', 'well written', 'great', 'valuable', 'thorough'];
    const neg = ['flawed', 'weak', 'poor', 'incorrect', 'lacks', 'rejection', 'marginal', 'unclear', 'invalid', 'shallow', 'insufficient', 'confusing'];

    let score = 0;
    for (const w of pos) {
        if (clean.includes(w)) score += 1.5;
    }
    for (const w of neg) {
        if (clean.includes(w)) score -= 1.5;
    }
    return Math.max(-10, Math.min(10, parseFloat(score.toFixed(2))));
}

/**
 * Analyzes review sentiment using local deep learning ONNX model.
 * Returns a normalized score from -10.00 (strong negative) to +10.00 (strong positive).
 * @param {string} text
 * @returns {Promise<number>}
 */
async function analyzeReviewSentimentAsync(text) {
    const targetText = extractEvaluationText(text);
    if (!targetText || typeof targetText !== 'string' || targetText.length === 0) {
        return 0;
    }

    try {
        const classifier = await getClassifier();
        // Truncate to 512 tokens to prevent model overflows
        const results = await classifier(targetText.slice(0, 2000), { truncation: true, max_length: 512 });
        if (!results || results.length === 0) return 0;

        const { label, score } = results[0];
        const scaled = (score || 0) * 10;
        const normalized = label === 'POSITIVE' ? scaled : -scaled;
        return parseFloat(normalized.toFixed(2));
    } catch (err) {
        console.warn('Transformers.js analysis failed, falling back to sync analyzer:', err.message);
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
    
    try {
        const classifier = await getClassifier();
        const results = new Array(texts.length).fill(0);
        
        // Find indices of valid non-empty evaluation texts
        const validItems = [];
        for (let i = 0; i < texts.length; i++) {
            const extracted = extractEvaluationText(texts[i]);
            if (extracted && extracted.length > 0) {
                validItems.push({ index: i, text: extracted.slice(0, 2000) });
            }
        }

        const batchSize = 16;
        for (let i = 0; i < validItems.length; i += batchSize) {
            const slice = validItems.slice(i, i + batchSize);
            const batchTexts = slice.map(item => item.text);
            const batchOutputs = await classifier(batchTexts, { truncation: true, max_length: 512 });
            
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
    } catch (err) {
        console.warn('Batch Transformers.js analysis failed, falling back:', err.message);
        return texts.map(t => analyzeReviewSentimentSync(t));
    }
}

module.exports = {
    getClassifier,
    extractEvaluationText,
    analyzeReviewSentimentAsync,
    analyzeReviewSentimentSync,
    batchAnalyzeReviewSentiment,
};
