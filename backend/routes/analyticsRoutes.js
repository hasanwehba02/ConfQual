const express = require("express");
const analyticsController = require("../controllers/analyticsController");

const router = express.Router();

const multer = require("multer");
const os = require("os");

const upload = multer({ dest: os.tmpdir() });

router.get("/conference-health", analyticsController.getConferenceHealth);
router.get("/reviewer-quality", analyticsController.getReviewerQuality);
router.get("/paper-debates", analyticsController.getPaperDebates);
router.get("/expertise-match", analyticsController.getExpertiseMismatches);

// New Investigative Endpoints
router.get("/dashboard", analyticsController.getDashboard);
router.get("/alerts", analyticsController.getAlerts);
router.get("/papers", analyticsController.getPapers);
router.get("/reviewers", analyticsController.getReviewers);
router.get("/submissions", analyticsController.getSubmissions);
router.get("/system-analytics", analyticsController.getSystemAnalytics);
router.get("/quality-profile", analyticsController.getQualityProfile);
router.get("/late-submissions", analyticsController.getLateSubmissions);

// Deep Drill-Down Endpoints
router.get("/papers/:id", analyticsController.getPaperDetails);
router.put("/papers/:id/decision", analyticsController.updatePaperDecision);
router.get("/reviewers/:id", analyticsController.getReviewerDetails);
router.get("/reviewers/:id/report", analyticsController.getReviewerReport);
router.post("/reset", analyticsController.resetDb);

router.post("/process-conference", upload.single('excelFile'), analyticsController.processUpload);

// Multi-conference management
router.get("/conferences", analyticsController.listConferences);
router.get("/comparison", analyticsController.getComparison);
router.put("/conferences/:id", analyticsController.updateConference);
router.delete("/conferences/:id", analyticsController.deleteConference);

const logRateLimiter = new Map();
router.post("/log", (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = logRateLimiter.get(ip) || { count: 0, last: now };
    if (now - entry.last > 60000) {
        entry.count = 1;
        entry.last = now;
    } else {
        entry.count++;
        if (entry.count > 20) {
            return res.status(429).json({ error: "Too many requests" });
        }
    }
    logRateLimiter.set(ip, entry);
    console.log("FRONTEND LOG:", req.body);
    res.sendStatus(200); 
});
module.exports = router;
