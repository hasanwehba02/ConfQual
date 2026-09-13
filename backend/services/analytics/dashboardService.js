const { analyticsRepository } = require("./common");
const { getConferenceHealth } = require("./healthService");
const { getPaperDebates } = require("./paperService");
const { enrichReviewerBias, getReviewerQuality } = require("./reviewerService");
const { getExpertiseMismatches } = require("./expertiseService");
const { getAlerts } = require("./alertService");
const { getSystemAnalytics } = require("./scorecardService");
const { getAcademicQualityProfile } = require("./profileService");

const dashboardCache = require("../../utils/dashboardCache");
const { resolveEditionId } = require("../../repositories/analytics/helpers");

async function getDashboardData(conferenceId = null) {
    const cid = conferenceId;
    const settings = await analyticsRepository.getAnonymizationSettings(cid);
    const eid = await resolveEditionId(cid);
    const cached = dashboardCache.get(eid, !!settings.is_anonymized);
    if (cached) return cached;
    return dashboardCache.coalesce(eid, !!settings.is_anonymized, async () => {
    const health = await getConferenceHealth(cid);
    // Fetch independent datasets in parallel to reduce latency
    const [papers, reviewersRaw, mismatches, coiViolations, missingMetareviews, topReviewers, distributions, diversity, submissions, sentimentMismatches] = await Promise.all([
        getPaperDebates({ conferenceId: cid }),
        getReviewerQuality({ conferenceId: cid, settings }),
        getExpertiseMismatches(cid, settings),
        analyticsRepository.getCOIViolations(cid, settings),
        analyticsRepository.getMissingMetareviews(cid, settings),
        analyticsRepository.getTopReviewers(cid),
        analyticsRepository.getSystemDistributions(cid),
        analyticsRepository.getGeographicDiversity(cid),
        analyticsRepository.getSubmissions({ conferenceId: cid }),
        analyticsRepository.getSentimentMismatches(cid, settings),
    ]);
    const reviewers = enrichReviewerBias(reviewersRaw);

    const prefetched = {
        health, papers, reviewers, mismatches, coiViolations, 
        missingMetareviews, topReviewers, 
        distributions, diversity, submissions, sentimentMismatches
    };

    const alerts = await getAlerts(prefetched, cid, settings);
    const systemAnalytics = await getSystemAnalytics(prefetched, cid);
    const qualityProfile = await getAcademicQualityProfile(prefetched, cid);

    const result = {
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
    dashboardCache.set(eid, !!settings.is_anonymized, result);
    return result;
    });
}

module.exports = { getDashboardData };
