const analyticsService = require("../services/analyticsService");

async function getConferenceHealth(req, res) {
    try {
        const data = await analyticsService.getConferenceHealth();
        res.json(data);
    } catch (error) {
        console.error("Error getting conference health:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getReviewerQuality(req, res) {
    try {
        const data = await analyticsService.getReviewerQuality();
        res.json(data);
    } catch (error) {
        console.error("Error getting reviewer quality:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getPaperDebates(req, res) {
    try {
        const data = await analyticsService.getPaperDebates();
        res.json(data);
    } catch (error) {
        console.error("Error getting paper debates:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getExpertiseMismatches(req, res) {
    try {
        const data = await analyticsService.getExpertiseMismatches();
        res.json(data);
    } catch (error) {
        console.error("Error getting expertise mismatches:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getAlerts(req, res) {
    try {
        const data = await analyticsService.getAlerts();
        res.json(data);
    } catch (error) {
        console.error("Error getting alerts:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getPapers(req, res) {
    try {
        const data = await analyticsService.getPapers();
        res.json(data);
    } catch (error) {
        console.error("Error getting papers:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getReviewers(req, res) {
    try {
        const data = await analyticsService.getReviewers();
        res.json(data);
    } catch (error) {
        console.error("Error getting reviewers:", error);
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
        const data = await analyticsService.getPaperDetails(req.params.id);
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

const runImporter = require("../importer/runImporter");
const resetDatabase = require("../utils/resetDatabase");

async function processUpload(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        
        console.log(`Processing uploaded file: ${req.file.path}`);
        
        const client = require("../config/database");
        await client.query("BEGIN");
        
        try {
            // 1. Reset Database
            await resetDatabase();
            
            // 2. Run Importer with new file
            await runImporter(req.file.path);
            
            await client.query("COMMIT");
            res.json({ message: "Conference processed successfully!" });
        } catch (importError) {
            await client.query("ROLLBACK");
            console.error("Error during import, rolled back:", importError);
            res.status(500).json({ error: "Failed to process conference data. Database state rolled back." });
        }
    } catch (error) {
        console.error("Error processing upload:", error);
        res.status(500).json({ error: "Failed to process conference data" });
    }
}

module.exports = {
    getConferenceHealth,
    getReviewerQuality,
    getPaperDebates,
    getExpertiseMismatches,
    getAlerts,
    getPapers,
    getReviewers,
    getSystemAnalytics,
    getPaperDetails,
    getReviewerDetails,
    processUpload,
    getQualityProfile: async (req, res) => {
        try {
            const profile = await analyticsService.getAcademicQualityProfile();
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
    }
};
