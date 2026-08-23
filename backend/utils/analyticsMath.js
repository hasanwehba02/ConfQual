const {
    analyzeReviewSentimentAsync,
    analyzeReviewSentimentSync,
    batchAnalyzeReviewSentiment,
} = require('./sentimentEngine');

/**
 * Analyzes the sentiment of a given text synchronously.
 * @param {string} reviewText 
 * @returns {number} Normalized sentiment score (-10 to +10)
 */
function analyzeReviewSentiment(reviewText) {
    return analyzeReviewSentimentSync(reviewText);
}

/**
 * Calculates reviewer calibration index
 * @param {number} givenScore 
 * @param {number} peersAverage 
 * @returns {number|null}
 */
function calculateCalibration(givenScore, peersAverage) {
    if (givenScore == null || peersAverage == null) return null;
    return parseFloat((givenScore - peersAverage).toFixed(2));
}

/**
 * Flags if the numerical score strongly mismatches the text sentiment
 * @param {number} numericalScore (Assume -3 to +3 scale or <= 1)
 * @param {number} sentimentScore (-10 to +10 scale)
 * @returns {boolean}
 */
function isSentimentMismatch(numericalScore, sentimentScore) {
    if (numericalScore == null || sentimentScore == null) return false;
    
    // Low numerical score (<= 1 or < 0) but strong positive sentiment
    if (numericalScore <= 1 && sentimentScore >= 6.0) return true;
    
    // High numerical score (>= 2 or > 0) but strong negative sentiment
    if (numericalScore >= 2 && sentimentScore <= -6.0) return true;
    
    return false;
}

module.exports = {
    analyzeReviewSentiment,
    analyzeReviewSentimentAsync,
    batchAnalyzeReviewSentiment,
    calculateCalibration,
    isSentimentMismatch
};
