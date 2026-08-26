const { analyticsRepository } = require("./common");
const { getPaperDebates } = require("./paperService");
const { getReviewerQuality } = require("./reviewerService");

// 6. Paginated & Filtered Queries
async function getPapers(options = {}) {
    const papers = await getPaperDebates(options);
    const totalCount = papers.length > 0 ? parseInt(papers[0].full_count) || papers.length : papers.length;
    return { items: papers, totalCount };
}

async function getReviewers(options = {}) {
    const reviewers = await getReviewerQuality(options);
    const totalCount = reviewers.length > 0 ? parseInt(reviewers[0].full_count) || reviewers.length : reviewers.length;
    return { items: reviewers, totalCount };
}

async function getSubmissions(options = {}) {
    const submissions = await analyticsRepository.getSubmissions(options);
    const totalCount = submissions.length > 0 ? parseInt(submissions[0].full_count) || submissions.length : submissions.length;
    return { items: submissions, totalCount };
}

async function getLateSubmissions() {
    return [];
}

module.exports = { getPapers, getReviewers, getSubmissions, getLateSubmissions };
