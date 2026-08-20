/**
 * Computes per-reviewer mean, sample std, and count for reviewers with >= 3 reviews.
 * @param {Array<{reviewerId: number, totalScore: number}>} reviews
 * @returns {Map<number, {mean: number, std: number, count: number}>}
 */
function computeReviewerStats(reviews) {
    const grouped = new Map();
    for (const r of reviews) {
        if (r.totalScore == null) continue;
        if (!grouped.has(r.reviewerId)) {
            grouped.set(r.reviewerId, { sum: 0, sumSq: 0, count: 0 });
        }
        const g = grouped.get(r.reviewerId);
        g.sum += r.totalScore;
        g.sumSq += r.totalScore * r.totalScore;
        g.count += 1;
    }

    const stats = new Map();
    for (const [reviewerId, g] of grouped) {
        if (g.count < 3) continue;
        const mean = g.sum / g.count;
        const variance = g.count > 1
            ? (g.sumSq - (g.sum * g.sum) / g.count) / (g.count - 1)
            : 0;
        stats.set(reviewerId, {
            mean,
            std: Math.sqrt(Math.max(variance, 0)),
            count: g.count
        });
    }
    return stats;
}

/**
 * Maps each review to its bias-corrected score on the conference scale.
 * @param {Array<{reviewerId: number, totalScore: number}>} reviews
 * @param {Map<number, {mean: number, std: number, count: number}>} reviewerStats
 * @param {{mean: number, std: number}} confStats
 * @returns {number[]} one adjusted score per review (in input order)
 */
function applyNormalization(reviews, reviewerStats, confStats) {
    return reviews.map((r) => {
        if (r.totalScore == null) return null;
        const st = reviewerStats.get(r.reviewerId);
        if (st && st.std > 0) {
            const z = (r.totalScore - st.mean) / st.std;
            return confStats.mean + z * confStats.std;
        }
        return r.totalScore;
    });
}

/**
 * Classifies a reviewer's bias from their mean vs the conference mean.
 * @param {number|null} reviewerMean
 * @param {number|null} confMean
 * @param {number|null} reviewCount
 * @returns {string|null} 'calibrated' | 'lenient' | 'strict' | 'extreme' | null
 */
function deriveBiasLabel(reviewerMean, confMean, reviewCount) {
    if (reviewerMean == null || confMean == null || reviewCount == null || reviewCount < 3) return null;
    const diff = reviewerMean - confMean;
    const absDiff = Math.abs(diff);
    if (absDiff <= 0.5) return 'calibrated';
    if (absDiff <= 1.5) return diff > 0 ? 'lenient' : 'strict';
    return 'extreme';
}

module.exports = {
    computeReviewerStats,
    applyNormalization,
    deriveBiasLabel
};
