const { getConferenceHealth } = require("./analytics/healthService");
const { enrichReviewerBias, getReviewerQuality, getReviewerDetails } = require("./analytics/reviewerService");
const { getPaperDebates, getPaperDetails, updatePaperDecision } = require("./analytics/paperService");
const { getExpertiseMismatches } = require("./analytics/expertiseService");
const { getAlerts } = require("./analytics/alertService");
const { getPapers, getReviewers, getSubmissions, getLateSubmissions } = require("./analytics/reportSupport");
const { getSystemAnalytics, getQualityScorecard } = require("./analytics/scorecardService");
const { getAcademicQualityProfile } = require("./analytics/profileService");
const { getDashboardData } = require("./analytics/dashboardService");

module.exports = {
    getConferenceHealth,
    getReviewerQuality,
    enrichReviewerBias,
    getPaperDebates,
    getExpertiseMismatches,
    getAlerts,
    getPapers,
    getReviewers,
    getSubmissions,
    getSystemAnalytics,
    getQualityScorecard,
    getPaperDetails,
    getReviewerDetails,
    getAcademicQualityProfile,
    getLateSubmissions,
    updatePaperDecision,
    getDashboardData
};
