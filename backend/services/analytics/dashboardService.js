const { analyticsRepository } = require("./common");
const { getConferenceHealth } = require("./healthService");
const { getPaperDebates } = require("./paperService");
const { enrichReviewerBias, getReviewerQuality } = require("./reviewerService");
const { getExpertiseMismatches } = require("./expertiseService");
const { getAlerts } = require("./alertService");
const { getSystemAnalytics } = require("./scorecardService");
const { getAcademicQualityProfile } = require("./profileService");

async function getDashboardData(conferenceId = null) {
    const cid = conferenceId;
    // 1. Fetch all base data ONCE
    const settings = await analyticsRepository.getAnonymizationSettings(cid);
    const health = await getConferenceHealth(cid);
    const papers = await getPaperDebates({ conferenceId: cid });
    const reviewers = await getReviewerQuality({ conferenceId: cid, settings });
    enrichReviewerBias(reviewers);
    const mismatches = await getExpertiseMismatches(cid, settings);
    const coiViolations = await analyticsRepository.getCOIViolations(cid, settings);
    const missingMetareviews = await analyticsRepository.getMissingMetareviews(cid, settings);
    const topReviewers = await analyticsRepository.getTopReviewers(cid);
    const distributions = await analyticsRepository.getSystemDistributions(cid);
    const diversity = await analyticsRepository.getGeographicDiversity(cid);
    const submissions = await analyticsRepository.getSubmissions({ conferenceId: cid });
    const sentimentMismatches = await analyticsRepository.getSentimentMismatches(cid, settings);

    const prefetched = {
        health, papers, reviewers, mismatches, coiViolations, 
        missingMetareviews, topReviewers, 
        distributions, diversity, submissions, sentimentMismatches
    };

    const alerts = await getAlerts(prefetched, cid, settings);
    const systemAnalytics = await getSystemAnalytics(prefetched, cid);
    const qualityProfile = await getAcademicQualityProfile(prefetched, cid);

    return {
        conferenceId: health?.conferenceId,
        conferenceName: health?.conference_name,
        is_anonymized: !!settings.is_anonymized,
        alerts,
        systemAnalytics,
        qualityProfile,
        papers: { items: papers, totalCount: papers.length },
        reviewers: { items: reviewers, totalCount: reviewers.length },
        submissions: { items: submissions, totalCount: submissions.length }
    };
}

module.exports = { getDashboardData };
