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
router.get("/alerts", analyticsController.getAlerts);
router.get("/papers", analyticsController.getPapers);
router.get("/reviewers", analyticsController.getReviewers);
router.get("/system-analytics", analyticsController.getSystemAnalytics);
router.get("/quality-profile", analyticsController.getQualityProfile);

// Deep Drill-Down Endpoints
router.get("/papers/:id", analyticsController.getPaperDetails);
router.get("/reviewers/:id", analyticsController.getReviewerDetails);
router.post("/reset", analyticsController.resetDb);

router.post("/process-conference", upload.single('excelFile'), analyticsController.processUpload);

module.exports = router;
