const Sentiment = require('sentiment');
const sentimentAnalyzer = new Sentiment();

/**
 * Analyzes the sentiment of a given text.
 * @param {string} reviewText 
 * @returns {number} Normalized comparative score
 */
function analyzeReviewSentiment(reviewText) {
    if (!reviewText || typeof reviewText !== 'string') return 0;
    const result = sentimentAnalyzer.analyze(reviewText);
    return result.comparative;
}

/**
 * Calculates reviewer calibration index
 * @param {number} givenScore 
 * @param {number} peersAverage 
 * @returns {number}
 */
function calculateCalibration(givenScore, peersAverage) {
    if (givenScore == null || peersAverage == null) return null;
    return parseFloat((givenScore - peersAverage).toFixed(2));
}

/**
 * Flags if the numerical score strongly mismatches the text sentiment
 * @param {number} numericalScore (Assume -3 to +3 scale)
 * @param {number} sentimentScore (Comparative score)
 * @returns {boolean}
 */
function isSentimentMismatch(numericalScore, sentimentScore) {
    if (numericalScore == null || sentimentScore == null) return false;
    
    // High positive sentiment but low numerical score
    if (numericalScore < 0 && sentimentScore > 1.5) return true;
    
    // High negative sentiment but high numerical score
    if (numericalScore > 0 && sentimentScore < -1.5) return true;
    
    return false;
}

module.exports = {
    analyzeReviewSentiment,
    calculateCalibration,
    isSentimentMismatch
};
