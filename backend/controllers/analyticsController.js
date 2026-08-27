const analyticsService = require("../services/analyticsService");
const reportService = require("../services/reportService");
const { renderPdf } = require("../utils/pdfRenderer");
const { NotFoundError, ServiceUnavailableError, ForbiddenError, ValidationError } = require("../utils/appError");
const { asyncHandler } = require("../middleware/errorHandler");

const getConferenceHealth = asyncHandler(async (req, res) => {
    res.json(await analyticsService.getConferenceHealth(req.query.conferenceId));
});

const getReviewerQuality = asyncHandler(async (req, res) => {
    res.json(await analyticsService.getReviewerQuality(req.query));
});

const getPaperDebates = asyncHandler(async (req, res) => {
    res.json(await analyticsService.getPaperDebates(req.query));
});

const getExpertiseMismatches = asyncHandler(async (req, res) => {
    res.json(await analyticsService.getExpertiseMismatches(req.query.conferenceId));
});

const getAlerts = asyncHandler(async (req, res) => {
    res.json(await analyticsService.getAlerts(null, req.query.conferenceId));
});

const getPapers = asyncHandler(async (req, res) => {
    res.json(await analyticsService.getPapers(req.query));
});

const getLateSubmissions = asyncHandler(async (req, res) => {
    res.json(await analyticsService.getLateSubmissions(req.query.conferenceId));
});

const getReviewers = asyncHandler(async (req, res) => {
    res.json(await analyticsService.getReviewers(req.query));
});

const getSubmissions = asyncHandler(async (req, res) => {
    res.json(await analyticsService.getSubmissions(req.query));
});

const getSystemAnalytics = asyncHandler(async (req, res) => {
    res.json(await analyticsService.getSystemAnalytics());
});

const getDashboard = asyncHandler(async (req, res) => {
    res.json(await analyticsService.getDashboardData(req.query.conferenceId));
});

const getQualityProfile = asyncHandler(async (req, res) => {
    res.json(await analyticsService.getAcademicQualityProfile(null, req.query.conferenceId));
});

const getPaperDetails = asyncHandler(async (req, res) => {
    const data = await analyticsService.getPaperDetails(req.params.id, req.query.conferenceId);
    if (!data) throw new NotFoundError("Paper not found");
    res.json(data);
});

const getReviewerDetails = asyncHandler(async (req, res) => {
    const data = await analyticsService.getReviewerDetails(req.params.id);
    if (!data) throw new NotFoundError("Reviewer not found");
    res.json(data);
});

const getReviewerReport = asyncHandler(async (req, res) => {
    const rawInclude = String(req.query.includeReviewText || '').toLowerCase();
    const includeReviewText = rawInclude === '1' || rawInclude === 'true';

    const data = await reportService.buildReportData(req.params.id);
    if (!data) throw new NotFoundError("Reviewer not found");

    const html = reportService.buildReportHtml(data, { includeReviewText });
    let pdfBuffer;
    try {
        pdfBuffer = await renderPdf(html);
    } catch (error) {
        if (error instanceof Error && error.name === 'PdfTimeoutError') {
            throw new ServiceUnavailableError("PDF generation timed out");
        }
        throw error;
    }

    const filename = reportService.buildReportFilename(data.reviewer, req.params.id);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.send(pdfBuffer);
});

const updatePaperDecision = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { decision } = req.body;
    if (decision === undefined) throw new ValidationError("Decision is required");
    try {
        const updated = await analyticsService.updatePaperDecision(id, decision);
        res.json(updated);
    } catch (error) {
        if (error && error.status === 403) throw new ForbiddenError(error.message);
        throw error;
    }
});

const runImporter = require("../importer/runImporter");

const processUpload = asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError("No file uploaded");

    console.log(`Processing uploaded file: ${req.file.path}`);

    // User-supplied conference metadata (overrides auto-detection)
    const meta = {
        name: req.body.conferenceName || null,
        shortName: req.body.conferenceShortName || null,
        year: req.body.conferenceYear ? parseInt(req.body.conferenceYear) : null
    };

    try {
        await runImporter(req.file.path, meta);
    } catch (error) {
        console.error("Error during import:", error);
        throw Object.assign(new Error("Failed to process conference data."), { statusCode: 500 });
    }
    res.json({ message: "Conference processed successfully!" });
});

const resetDatabase = require("../utils/resetDatabase");
const conferenceRepository = require("../repositories/conferenceRepository");

const resetDb = asyncHandler(async (req, res) => {
    await resetDatabase();
    res.json({ message: "Database reset successfully" });
});

const listConferences = asyncHandler(async (req, res) => {
    res.json(await conferenceRepository.listConferences());
});

const getComparison = asyncHandler(async (req, res) => {
    res.json(await conferenceRepository.getComparisonMetrics());
});

const deleteConference = asyncHandler(async (req, res) => {
    await conferenceRepository.deleteConference(req.params.id);
    res.json({ message: "Conference deleted successfully" });
});

const updateConference = asyncHandler(async (req, res) => {
    res.json(await conferenceRepository.updateConference(req.params.id, req.body));
});

const { getAlertRules: fetchRules, ensureAlertRulesForConference, assertSafeNumber } = require("../repositories/analytics/helpers");
const alertDefaults = require("../config/alertRuleDefaults");
const db = require("../config/database");

const getAlertRules = asyncHandler(async (req, res) => {
    const rules = await fetchRules(req.query.conferenceId);
    const out = Object.entries(alertDefaults).map(([key, def]) => ({
        key, label: def.label, domain: def.domain, default: def.default,
        value: rules[key]?.value ?? def.default, enabled: rules[key]?.enabled ?? true
    }));
    res.json(out);
});

const updateAlertRules = asyncHandler(async (req, res) => {
    const cid = parseInt(req.query.conferenceId || req.body.conferenceId);
    if (!cid) throw new ValidationError('conferenceId required');
    const items = req.body.rules || req.body;
    if (!Array.isArray(items)) throw new ValidationError('rules array required');
    await ensureAlertRulesForConference(cid);
    await db.withTransaction(async (client) => {
        for (const r of items) {
            if (!alertDefaults[r.key]) throw new ValidationError(`Unknown rule: ${r.key}`);
            const v = assertSafeNumber(r.value, r.key);
            const enabled = r.enabled !== undefined ? !!r.enabled : true;
            await client.query(
                'INSERT INTO alert_rule (conference_id, rule_key, threshold_value, is_enabled) VALUES ($1,$2,$3,$4) ON CONFLICT (conference_id, rule_key) DO UPDATE SET threshold_value = EXCLUDED.threshold_value, is_enabled = EXCLUDED.is_enabled',
                [cid, r.key, v, enabled]
            );
        }
    });
    res.json({ ok: true });
});

module.exports = {
    getConferenceHealth,
    getReviewerQuality,
    getPaperDebates,
    getExpertiseMismatches,
    getAlerts,
    getPapers,
    getLateSubmissions,
    getReviewers,
    getSubmissions,
    getSystemAnalytics,
    getDashboard,
    getQualityProfile,
    getPaperDetails,
    getReviewerDetails,
    getReviewerReport,
    updatePaperDecision,
    processUpload,
    resetDb,
    listConferences,
    getComparison,
    deleteConference,
    updateConference,
    getAlertRules,
    updateAlertRules
};
