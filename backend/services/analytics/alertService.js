const { analyticsRepository } = require("./common");
const { getPaperDebates } = require("./paperService");
const { getExpertiseMismatches } = require("./expertiseService");
const { getReviewerQuality } = require("./reviewerService");

// 5. Intelligent Action Alerts
async function getAlerts(prefetched = null, conferenceId = null, settingsArg = null) {
    const alerts = [];
    const cid = conferenceId;
    const MAX_EMAIL_PAPERS = 10;
    const settings = settingsArg || await analyticsRepository.getAnonymizationSettings(cid);

    // 1. Conflict of Interest Violations
    const coiViolations = prefetched?.coiViolations || await analyticsRepository.getCOIViolations(cid, settings);
    coiViolations.forEach(coi => {
        alerts.push({
            severity: "CRITICAL",
            category: "INTEGRITY",
            title: `COI Violation: Paper #${coi.external_submission_id}`,
            message: `Reviewer ${coi.reviewer_first_name} ${coi.reviewer_last_name} is assigned to Paper #${coi.external_submission_id} despite having a recorded Conflict of Interest.`,
            action: "Reassign paper immediately.",
            affectedIds: [coi.external_submission_id],
            target: "tab-papers",
            filterKey: "paper",
            customTitle: "COI Violations",
            emailContext: {
                kind: 'coi',
                recipients: [{
                    id: coi.reviewer_id,
                    name: `${coi.reviewer_first_name} ${coi.reviewer_last_name}`.trim(),
                    email: coi.reviewer_email,
                }],
                paperIds: [coi.external_submission_id],
                paperTitle: coi.paper_title,
            }
        });
    });

    // 2. High Variance Debates with 0 Discussion
    const papers = prefetched?.papers || await getPaperDebates({ conferenceId: cid });
    const silentDebates = papers.filter(p => p.score_spread > 2.0 && parseInt(p.total_comments) === 0);
    if (silentDebates.length > 0) {
        let debateContext = null;
        const debateSlice = silentDebates.slice(0, MAX_EMAIL_PAPERS);
        const spreadByPaper = new Map(silentDebates.map(p => [p.external_submission_id, Number(p.score_spread)]));
        const reviewerRows = await analyticsRepository.getReviewersForPapers(
            debateSlice.map(p => p.external_submission_id), cid, settings
        );
        const debateMap = new Map();
        reviewerRows.forEach(r => {
            if (!debateMap.has(r.external_submission_id)) {
                debateMap.set(r.external_submission_id, {
                    id: r.external_submission_id,
                    title: r.title,
                    spread: spreadByPaper.get(r.external_submission_id),
                    recipients: [],
                });
            }
            const paper = debateMap.get(r.external_submission_id);
            if (!paper.recipients.some(x => x.id === r.reviewer_id)) {
                paper.recipients.push({
                    id: r.reviewer_id,
                    name: `${r.first_name} ${r.last_name}`.trim(),
                    email: r.email,
                });
            }
        });
        const debatePapers = debateSlice
            .filter(p => debateMap.has(p.external_submission_id))
            .map(p => debateMap.get(p.external_submission_id));
        if (debatePapers.length > 0) {
            debateContext = {
                kind: 'silent_debate',
                papers: debatePapers,
                omittedPaperCount: Math.max(0, silentDebates.length - MAX_EMAIL_PAPERS),
            };
        }
        alerts.push({
            severity: "HIGH",
            category: "DISCUSSION",
            title: `${silentDebates.length} Heavily Debated Papers Have Zero Discussion`,
            message: `Papers with extreme score divergence (>2.0 spread) currently have 0 PC comments.`,
            action: "Open discussion threads or assign a metareviewer.",
            affectedIds: silentDebates.map(p => p.external_submission_id),
            target: "tab-papers",
            filterKey: "paper",
            customTitle: "Debated Papers with Zero Comments",
            emailContext: debateContext
        });
    }

    // 3. Expertise Mismatches
    const mismatches = prefetched?.mismatches || await getExpertiseMismatches(cid);
    if (mismatches.totalMismatches > 0) {
        let expertiseContext = null;
        const expertiseMap = new Map();
        mismatches.details.forEach(m => {
            if (!expertiseMap.has(m.external_submission_id)) {
                expertiseMap.set(m.external_submission_id, {
                    id: m.external_submission_id,
                    title: m.paper_title,
                    recipients: [],
                });
            }
            const paper = expertiseMap.get(m.external_submission_id);
            if (!paper.recipients.some(r => r.id === m.reviewer_id)) {
                paper.recipients.push({
                    id: m.reviewer_id,
                    name: (m.reviewer_name || '').trim(),
                    email: m.reviewer_email,
                    paperTopics: m.paper_topics,
                    reviewerTopics: m.reviewer_topics,
                });
            }
        });
        const expertisePapers = [...expertiseMap.values()].slice(0, MAX_EMAIL_PAPERS);
        if (expertisePapers.length > 0) {
            expertiseContext = {
                kind: 'expertise_mismatch',
                papers: expertisePapers,
                omittedPaperCount: Math.max(0, expertiseMap.size - MAX_EMAIL_PAPERS),
            };
        }
        alerts.push({
            severity: "MEDIUM",
            category: "EXPERTISE",
            title: `${mismatches.totalMismatches} Potential Expertise Mismatches`,
            message: `Found reviews where reviewer profile topics have zero overlap with submission topics.`,
            action: "Review assignments for domain-specific accuracy.",
            affectedIds: [...new Set(mismatches.details.map(m => m.external_submission_id))],
            target: "tab-papers",
            filterKey: "paper",
            customTitle: "Expertise Mismatches",
            emailContext: expertiseContext
        });
    }

    // 4. Missing Metareviews
    const missingMetas = prefetched?.missingMetareviews || await analyticsRepository.getMissingMetareviews(cid, settings);
    if (missingMetas.length > 0) {
        let metareviewContext = null;
        const metaPapers = missingMetas.slice(0, MAX_EMAIL_PAPERS).map(m => ({
            id: m.external_submission_id,
            title: m.title,
            scoreSpread: Number(m.score_spread),
            recipients: (m.reviewers || []).map(rv => ({
                id: rv.id,
                name: `${rv.first_name} ${rv.last_name}`.trim(),
                email: rv.email,
            })),
        }));
        if (metaPapers.length > 0) {
            metareviewContext = {
                kind: 'missing_metareview',
                papers: metaPapers,
                omittedPaperCount: Math.max(0, missingMetas.length - MAX_EMAIL_PAPERS),
            };
        }
        alerts.push({
            severity: "MEDIUM",
            category: "PROCESS",
            title: `${missingMetas.length} Papers Missing Metareviews`,
            message: `Completed papers ready for decision have no meta-review recorded.`,
            action: "Prompt senior PC/Area Chairs to draft summary evaluations.",
            affectedIds: missingMetas.map(m => m.external_submission_id),
            target: "tab-papers",
            filterKey: "paper",
            customTitle: "Missing Metareviews",
            emailContext: metareviewContext
        });
    }

    // 5. Short / Low Effort Reviews
    const reviewers = prefetched?.reviewers || await getReviewerQuality({ conferenceId: cid, settings });
    const lowEffortReviewers = reviewers.filter(r => parseInt(r.avg_word_count) < 60 && parseInt(r.total_reviews_completed) > 0);
    if (lowEffortReviewers.length > 0) {
        const MAX_EMAIL_RECIPIENTS = 10;
        const recipients = lowEffortReviewers.slice(0, MAX_EMAIL_RECIPIENTS).map(r => ({
            id: r.id,
            name: `${r.first_name} ${r.last_name}`.trim(),
            email: r.email,
        }));
        alerts.push({
            severity: "LOW",
            category: "QUALITY",
            title: `${lowEffortReviewers.length} Reviewers with Low Feedback Volume`,
            message: `Reviewers with average review length under 60 words detected.`,
            action: "Flag for quality check prior to author notification.",
            affectedIds: lowEffortReviewers.map(r => r.id),
            target: "tab-reviewers",
            filterKey: "reviewer",
            customTitle: "Low Feedback Volume Reviewers",
            emailContext: {
                kind: 'low_effort',
                recipients,
                omittedCount: Math.max(0, lowEffortReviewers.length - MAX_EMAIL_RECIPIENTS),
            }
        });
    }

    // 6. Sentiment Mismatches
    const sentimentMismatches = prefetched?.sentimentMismatches || await analyticsRepository.getSentimentMismatches(cid);
    if (sentimentMismatches.length > 0) {
        let sentimentContext = null;
        const sentimentMap = new Map();
        sentimentMismatches.forEach(m => {
            if (!sentimentMap.has(m.external_submission_id)) {
                sentimentMap.set(m.external_submission_id, {
                    id: m.external_submission_id,
                    title: m.paper_title,
                    recipients: [],
                });
            }
            const paper = sentimentMap.get(m.external_submission_id);
            if (!paper.recipients.some(r => r.id === m.reviewer_id)) {
                paper.recipients.push({
                    id: m.reviewer_id,
                    name: (m.reviewer_name || '').trim(),
                    email: m.reviewer_email,
                    totalScore: Number(m.total_score),
                    sentimentScore: Number(m.sentiment_score),
                });
            }
        });
        const sentimentPapers = [...sentimentMap.values()].slice(0, MAX_EMAIL_PAPERS);
        if (sentimentPapers.length > 0) {
            sentimentContext = {
                kind: 'sentiment_mismatch',
                papers: sentimentPapers,
                omittedPaperCount: Math.max(0, sentimentMap.size - MAX_EMAIL_PAPERS),
            };
        }
        alerts.push({
            severity: "HIGH",
            category: "INTEGRITY",
            title: `${sentimentMismatches.length} Sentiment/Score Mismatches Detected`,
            message: `Found reviews where the numerical score contradicts the review text sentiment (e.g. rejection with positive praise or strong accept with critical evaluation).`,
            action: "Check for miscalibrated scoring or sarcastic review text.",
            affectedIds: [...new Set(sentimentMismatches.map(m => m.external_submission_id))],
            target: "tab-papers",
            filterKey: "paper",
            customTitle: "Sentiment Mismatches",
            emailContext: sentimentContext
        });
    }

    return alerts;
}

module.exports = { getAlerts };
