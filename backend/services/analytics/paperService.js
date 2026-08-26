const { analyticsRepository } = require("./common");

// 3. Paper Explorer (Debates & Normalized Rankings)
async function getPaperDebates(options = {}) {
    const papers = await analyticsRepository.getPaperDebates(options);

    papers.forEach(paper => {
        const spread = paper.score_spread !== null ? parseFloat(paper.score_spread) : 0;
        const totalReviews = parseInt(paper.total_reviews) || 0;
        const totalComments = parseInt(paper.total_comments) || 0;
        const avgScore = paper.average_score !== null ? parseFloat(paper.average_score) : 0;
        const adjustedScore = paper.adjusted_score !== null ? parseFloat(paper.adjusted_score) : avgScore;

        let debateStatus = "Consensus";
        let isCritical = false;

        if (spread > 2.0 && totalReviews >= 2) {
            debateStatus = "High Variance";
            isCritical = true;
        } else if (spread === 0 && totalReviews >= 2) {
            debateStatus = "Unanimous";
        }

        // Check if borderline/controversial without committee discussion
        if (totalReviews >= 2 && Math.abs(avgScore) <= 0.5 && totalComments === 0) {
            debateStatus = "Unresolved Borderline";
            isCritical = true;
        }

        // Detect substantial shift between raw and normalized scores
        const scoreShift = Math.abs(adjustedScore - avgScore);
        if (scoreShift >= 0.75) {
            paper.significant_normalization_shift = true;
        }

        paper.debate_status = debateStatus;
        paper.is_critical = isCritical;
        paper.score_variance = spread.toFixed(2);
    });

    return papers;
}

async function getPaperDetails(id, conferenceId = null) {
    return await analyticsRepository.getPaperDetails(id, conferenceId);
}

async function updatePaperDecision(id, decision) {
    const settings = await analyticsRepository.getAnonymizationSettings();
    if (!settings.decision_editing_enabled) {
        const error = new Error("Decision editing is disabled");
        error.status = 403;
        throw error;
    }
    return await analyticsRepository.updatePaperDecision(id, decision);
}

module.exports = { getPaperDebates, getPaperDetails, updatePaperDecision };
