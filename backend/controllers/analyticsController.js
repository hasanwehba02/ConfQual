const analyticsService = require("../services/analyticsService");
const reportService = require("../services/reportService");
const { renderPdf, PdfTimeoutError } = require("../utils/pdfRenderer");

async function getConferenceHealth(req, res) {
    try {
        const data = await analyticsService.getConferenceHealth(req.query.conferenceId);
        res.json(data);
    } catch (error) {
        console.error("Error getting conference health:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getReviewerQuality(req, res) {
    try {
        const data = await analyticsService.getReviewerQuality(req.query);
        res.json(data);
    } catch (error) {
        console.error("Error getting reviewer quality:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getPaperDebates(req, res) {
    try {
        const data = await analyticsService.getPaperDebates(req.query);
        res.json(data);
    } catch (error) {
        console.error("Error getting paper debates:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getExpertiseMismatches(req, res) {
    try {
        const data = await analyticsService.getExpertiseMismatches(req.query.conferenceId);
        res.json(data);
    } catch (error) {
        console.error("Error getting expertise mismatches:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getAlerts(req, res) {
    try {
        const data = await analyticsService.getAlerts(null, req.query.conferenceId);
        res.json(data);
    } catch (error) {
        console.error("Error getting alerts:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getPapers(req, res) {
    try {
        const data = await analyticsService.getPapers(req.query);
        res.json(data);
    } catch (error) {
        console.error("Error getting papers:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getLateSubmissions(req, res) {
    try {
        const data = await analyticsService.getLateSubmissions(req.query.conferenceId);
        res.json(data);
    } catch (error) {
        console.error("Error getting late submissions:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getReviewers(req, res) {
    try {
        const data = await analyticsService.getReviewers(req.query);
        res.json(data);
    } catch (error) {
        console.error("Error getting reviewers:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getSubmissions(req, res) {
    try {
        const data = await analyticsService.getSubmissions(req.query);
        res.json(data);
    } catch (error) {
        console.error("Error getting submissions:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getSystemAnalytics(req, res) {
    try {
        const data = await analyticsService.getSystemAnalytics();
        res.json(data);
    } catch (error) {
        console.error("Error getting system analytics:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getPaperDetails(req, res) {
    try {
        const data = await analyticsService.getPaperDetails(req.params.id, req.query.conferenceId);
        if (!data) return res.status(404).json({ error: "Paper not found" });
        res.json(data);
    } catch (error) {
        console.error("Error getting paper details:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getReviewerDetails(req, res) {
    try {
        const data = await analyticsService.getReviewerDetails(req.params.id);
        if (!data) return res.status(404).json({ error: "Reviewer not found" });
        res.json(data);
    } catch (error) {
        console.error("Error getting reviewer details:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getReviewerReport(req, res) {
    try {
        const rawInclude = String(req.query.includeReviewText || '').toLowerCase();
        const includeReviewText = rawInclude === '1' || rawInclude === 'true';

        const data = await reportService.buildReportData(req.params.id);
        if (!data) {
            return res.status(404).json({ error: "Reviewer not found" });
        }

        const html = reportService.buildReportHtml(data, { includeReviewText });
        const pdfBuffer = await renderPdf(html);

        const filename = reportService.buildReportFilename(data.reviewer, req.params.id);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(pdfBuffer);
    } catch (error) {
        if (error instanceof PdfTimeoutError || error.name === 'PdfTimeoutError') {
            return res.status(503).json({ error: "PDF generation timed out" });
        }
        console.error("Error generating reviewer report:", error);
        res.status(500).json({ error: "Failed to generate PDF" });
    }
}

async function updatePaperDecision(req, res) {
    try {
        const { id } = req.params;
        const { decision } = req.body;
        const updated = await analyticsService.updatePaperDecision(id, decision);
        res.json(updated);
    } catch (error) {
        if (error.status === 403) {
            return res.status(403).json({ error: error.message });
        }
        console.error("Error updating paper decision:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

const runImporter = require("../importer/runImporter");
const resetDatabase = require("../utils/resetDatabase");

async function processUpload(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        
        console.log(`Processing uploaded file: ${req.file.path}`);
        
        // User-supplied conference metadata (overrides auto-detection)
        const meta = {
            name: req.body.conferenceName || null,
            shortName: req.body.conferenceShortName || null,
            year: req.body.conferenceYear ? parseInt(req.body.conferenceYear) : null
        };

        try {
            await runImporter(req.file.path, meta);
            res.json({ message: "Conference processed successfully!" });
        } catch (importError) {
            console.error("Error during import:", importError);
            res.status(500).json({ error: "Failed to process conference data." });
        }
    } catch (error) {
        console.error("Error processing upload:", error);
        res.status(500).json({ error: "Failed to process conference data" });
    }
}

const conferenceRepository = require("../repositories/conferenceRepository");

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
    getPaperDetails,
    getReviewerDetails,
    getReviewerReport,
    updatePaperDecision,
    processUpload,
    getDashboard: async (req, res) => {
        try {
            const data = await analyticsService.getDashboardData(req.query.conferenceId);
            res.json(data);
        } catch (error) {
            console.error("Error fetching dashboard data:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    },
    getQualityProfile: async (req, res) => {
        try {
            const profile = await analyticsService.getAcademicQualityProfile(null, req.query.conferenceId);
            res.json(profile);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: "Failed to get quality profile" });
        }
    },
    resetDb: async (req, res) => {
        try {
            await resetDatabase();
            res.json({ message: "Database reset successfully" });
        } catch (error) {
            console.error("Error resetting database:", error);
            res.status(500).json({ error: "Failed to reset database" });
        }
    },
    // Conference management
    listConferences: async (req, res) => {
        try {
            const data = await conferenceRepository.listConferences();
            res.json(data);
        } catch (error) {
            console.error("Error listing conferences:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },
    getComparison: async (req, res) => {
        try {
            const data = await conferenceRepository.getComparisonMetrics();
            res.json(data);
        } catch (error) {
            console.error("Error getting comparison metrics:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },
    deleteConference: async (req, res) => {
        try {
            await conferenceRepository.deleteConference(req.params.id);
            res.json({ message: "Conference deleted successfully" });
        } catch (error) {
            console.error("Error deleting conference:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },
    updateConference: async (req, res) => {
        try {
            const data = await conferenceRepository.updateConference(req.params.id, req.body);
            res.json(data);
        } catch (error) {
            console.error("Error updating conference:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }
};
