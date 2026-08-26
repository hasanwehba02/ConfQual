const { analyticsRepository } = require("./common");

// 1. System Health
async function getConferenceHealth(conferenceId = null) {
    const health = await analyticsRepository.getConferenceHealth(conferenceId);
    if (!health) return null;
    return {
        conferenceId: health.conferenceId,
        conference_name: health.conference_name,
        conference_year: health.conference_year,
        total_papers: parseInt(health.total_papers) || 0,
        total_reviewers: parseInt(health.total_reviewers) || 0,
        total_reviews: parseInt(health.total_reviews) || 0,
        total_assignments: parseInt(health.total_assignments) || 0,
        total_sub_reviewers: parseInt(health.total_sub_reviewers) || 0,
        average_score: health.average_score ? parseFloat(health.average_score) : 0,
        system_status: (health.total_papers > 0 && health.total_reviews > 0) ? "NORMAL" : "PENDING_DATA"
    };
}

module.exports = { getConferenceHealth };
