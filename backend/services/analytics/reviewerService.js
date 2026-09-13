const { analyticsRepository } = require("./common");
const { deriveBiasLabel } = require("../../utils/scoreNormalization");

// 2. Reviewer Bias & Normalization
function enrichReviewerBias(reviewers) {
    reviewers.forEach(reviewer => {
        const hasCalibration = reviewer.calibration_index !== null && reviewer.calibration_index !== undefined;
        const calibration = hasCalibration ? parseFloat(reviewer.calibration_index) : null;
        const totalReviews = parseInt(reviewer.total_reviews_completed) || 0;

        let biasCategory = totalReviews < 3 ? "Insufficient Data" : "Standard";
        let isReliable = true;

        if (calibration !== null && totalReviews >= 3) {
            if (calibration > 1.5) {
                biasCategory = "Severe Positive (Easy)";
            } else if (calibration > 0.8) {
                biasCategory = "Mild Positive (Generous)";
            } else if (calibration < -1.5) {
                biasCategory = "Severe Negative (Harsh)";
            } else if (calibration < -0.8) {
                biasCategory = "Mild Negative (Critical)";
            }
        }

        // Reliability check: Low word count + extreme scores (threshold matches alert low-word)
        const avgWords = reviewer.avg_word_count !== null && reviewer.avg_word_count !== undefined ? parseInt(reviewer.avg_word_count) : null;
        const avgScore = reviewer.avg_score_given !== null ? parseFloat(reviewer.avg_score_given) : 0;
        if (avgWords !== null && avgWords < 60 && (avgScore >= 2 || avgScore <= -2)) {
            isReliable = false;
        }

        reviewer.bias_category = biasCategory;
        reviewer.is_reliable = isReliable;

        // Canonical bias label shared with the PDF report vocabulary:
        // 'calibrated' | 'lenient' | 'strict' | 'extreme' | null (< 3 reviews)
        const avgScoreGiven = reviewer.avg_score_given !== null && reviewer.avg_score_given !== undefined
            ? parseFloat(reviewer.avg_score_given)
            : null;
        const peersAvg = reviewer.conf_mean !== null && reviewer.conf_mean !== undefined
            ? parseFloat(reviewer.conf_mean)
            : null;
        reviewer.bias_label = deriveBiasLabel(avgScoreGiven, peersAvg, totalReviews);
    });

    return reviewers;
}

async function getReviewerQuality(options = {}) {
    const reviewers = await analyticsRepository.getReviewerQuality(options);
    return enrichReviewerBias(reviewers);
}

async function getReviewerDetails(id, conferenceId = null) {
    return await analyticsRepository.getReviewerDetails(id, conferenceId);
}

module.exports = { enrichReviewerBias, getReviewerQuality, getReviewerDetails };
