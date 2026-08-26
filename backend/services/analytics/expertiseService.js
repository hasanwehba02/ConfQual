const { analyticsRepository } = require("./common");

// 4. Topic & Expertise Alignment
async function getExpertiseMismatches(conferenceId = null, settingsArg = null) {
    const rows = await analyticsRepository.getExpertiseMismatches(conferenceId, settingsArg);

    const mismatches = [];

    rows.forEach(row => {
        const paperTopics = row.paper_topics ? row.paper_topics.split(", ") : [];
        const reviewerTopics = row.reviewer_topics ? row.reviewer_topics.split(", ") : [];

        // Check intersection of topics
        const intersection = paperTopics.filter(t => reviewerTopics.includes(t));

        if (intersection.length === 0 && paperTopics.length > 0) {
            mismatches.push({
                review_id: row.review_id,
                external_submission_id: row.external_submission_id,
                paper_title: row.paper_title,
                reviewer_id: row.reviewer_id,
                reviewer_name: `${row.reviewer_first_name} ${row.reviewer_last_name}`,
                reviewer_email: row.reviewer_email,
                score: row.total_score,
                paper_topics: row.paper_topics,
                reviewer_topics: row.reviewer_topics,
                reason: "Zero topic overlap between paper and reviewer expertise"
            });
        }
    });

    return {
        totalMismatches: mismatches.length,
        details: mismatches
    };
}

module.exports = { getExpertiseMismatches };
