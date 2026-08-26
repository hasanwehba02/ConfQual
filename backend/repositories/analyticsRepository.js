const {
    getConferenceHealth,
    getAcceptanceRate,
    getGeographicDiversity,
    getThematicCompetence,
    getSystemDistributions,
    getSessionClusters
} = require("./analytics/conferenceQueries");
const {
    getReviewerQuality,
    getReviewerStatsById,
    getTopReviewers,
    getReviewerDetails
} = require("./analytics/reviewerQueries");
const {
    getSubmissions,
    getPaperDebates,
    getPaperDetails,
    updatePaperDecision,
    getTopPapers
} = require("./analytics/paperQueries");
const {
    getExpertiseMismatches,
    getCOIViolations,
    getMissingMetareviews,
    getReviewersForPapers,
    getSentimentMismatches
} = require("./analytics/integrityQueries");
const { getAnonymizationSettings, maskNames } = require("./analytics/helpers");

module.exports = {
    getConferenceHealth,
    getReviewerQuality,
    getReviewerStatsById,
    getSubmissions,
    getPaperDebates,
    getExpertiseMismatches,
    getCOIViolations,
    getMissingMetareviews,
    getPaperDetails,
    getReviewerDetails,
    getAcceptanceRate,
    getGeographicDiversity,
    getThematicCompetence,
    getSystemDistributions,
    updatePaperDecision,
    getSessionClusters,
    getTopPapers,
    getTopReviewers,
    getSentimentMismatches,
    getReviewersForPapers,
    getAnonymizationSettings,
    maskNames
};
