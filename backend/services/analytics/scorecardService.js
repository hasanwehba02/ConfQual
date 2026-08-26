const { analyticsRepository } = require("./common");
const { getConferenceHealth } = require("./healthService");
const { getPaperDebates } = require("./paperService");
const { enrichReviewerBias, getReviewerQuality } = require("./reviewerService");
const { getExpertiseMismatches } = require("./expertiseService");

async function getQualityScorecard(health, prefetched = null, conferenceId = null) {
    let cid = conferenceId;
    if (typeof health === 'number' || typeof health === 'string') {
        cid = health;
        health = await getConferenceHealth(cid);
    } else if (!health || typeof health !== 'object') {
        health = await getConferenceHealth(cid);
        cid = health?.conferenceId || cid;
    } else {
        cid = health.conferenceId || cid;
    }

    const papers = prefetched?.papers || await getPaperDebates({ conferenceId: cid });
    const reviewers = prefetched?.reviewers || await getReviewerQuality({ conferenceId: cid });
    const mismatches = prefetched?.mismatches || await getExpertiseMismatches(cid);
    const coiViolations = prefetched?.coiViolations || await analyticsRepository.getCOIViolations(cid);
    const missingMetareviews = prefetched?.missingMetareviews || await analyticsRepository.getMissingMetareviews(cid);

    const totalReviewers = parseInt(health?.total_reviewers) || 1;
    const totalAssignments = parseInt(health?.total_assignments) || 1;
    const totalReviews = parseInt(health?.total_reviews) || 1;

    let scorecard = {
        coverage: { score: 100, deductions: [] },
        integrity: { score: 100, deductions: [] },
        satisfaction: { score: 100, deductions: [] },
        discussion: { score: 100, deductions: [] }
    };

    // Coverage: Percentage of valid papers with < 3 reviews
    const validPapers = papers.filter(p => p.decision_category !== 'desk reject');
    const totalValidPapers = validPapers.length > 0 ? validPapers.length : 1;
    const missingReviews = validPapers.filter(p => p.total_reviews < 3);
    if (missingReviews.length > 0) {
        const deduction = Math.round((missingReviews.length / totalValidPapers) * 100);
        scorecard.coverage.score -= deduction;
        scorecard.coverage.deductions.push({
            text: `-${deduction}%: ${missingReviews.length} out of ${totalValidPapers} valid papers have fewer than 3 reviews.`,
            affectedIds: missingReviews.map(p => p.external_submission_id),
            target: 'tab-papers',
            filterKey: 'paper',
            customTitle: 'Papers Missing Reviews'
        });
    }

    // Integrity: COIs and Mismatches (capped at 100%)
    let integrityDeduction = 0;
    if (coiViolations.length > 0) {
        let coiPenalty = Math.round(((coiViolations.length * 3) / totalAssignments) * 100);
        coiPenalty = Math.min(coiPenalty, 100);
        integrityDeduction += coiPenalty;
        scorecard.integrity.deductions.push({
            text: `-${coiPenalty}%: ${coiViolations.length} Conflict of Interest assignments detected (weighted 3x penalty).`,
            affectedIds: [...new Set(coiViolations.map(c => c.external_submission_id))],
            target: 'tab-papers',
            filterKey: 'paper',
            customTitle: 'COI Violations'
        });
    }
    if (mismatches.totalMismatches > 0) {
        let mismatchPenalty = Math.round((mismatches.totalMismatches / totalReviews) * 100);
        // Ensure total integrity deduction doesn't exceed 100%
        if (integrityDeduction + mismatchPenalty > 100) {
            mismatchPenalty = 100 - integrityDeduction;
        }
        if (mismatchPenalty > 0) {
            integrityDeduction += mismatchPenalty;
            scorecard.integrity.deductions.push({
                text: `-${mismatchPenalty}%: ${mismatches.totalMismatches} reviews assigned with zero topic overlap.`,
                affectedIds: [...new Set(mismatches.details.map(m => m.external_submission_id))],
                target: 'tab-papers',
                filterKey: 'paper',
                customTitle: 'Expertise Mismatches'
            });
        }
    }
    scorecard.integrity.score -= integrityDeduction;

    // Satisfaction: Percentage of unhappy reviewers
    const unhappyReviewers = reviewers.filter(r => r.bidding_match_percentage !== null && parseFloat(r.bidding_match_percentage) <= 50);
    if (unhappyReviewers.length > 0) {
        const deduction = Math.round((unhappyReviewers.length / totalReviewers) * 100);
        scorecard.satisfaction.score -= deduction;
        scorecard.satisfaction.deductions.push({
            text: `-${deduction}%: ${unhappyReviewers.length} out of ${totalReviewers} reviewers have low bidding satisfaction (<=50%).`,
            affectedIds: unhappyReviewers.map(r => r.id),
            target: 'tab-reviewers',
            filterKey: 'reviewer',
            customTitle: 'Low Bidding Satisfaction'
        });
    }

    // Discussion: Percentage of debated papers that are poorly handled
    const concerningDebates = papers.filter(p => parseFloat(p.score_variance) > 1.0);
    const totalDebated = concerningDebates.length;
    
    if (totalDebated > 0) {
        const badDebates = concerningDebates.filter(p => parseInt(p.total_comments) === 0);
        const badDebateCount = badDebates.length;
        const missingMetaCount = missingMetareviews.length; // From all debated papers > 1.0 variance

        let discussionDeduction = 0;
        
        if (missingMetaCount > 0) {
            const metaPenalty = Math.round((missingMetaCount / totalDebated) * 100);
            discussionDeduction += metaPenalty;
            scorecard.discussion.deductions.push({
                text: `-${metaPenalty}%: ${missingMetaCount} out of ${totalDebated} heavily debated papers are missing metareviews.`,
                affectedIds: missingMetareviews.map(m => m.external_submission_id),
                target: 'tab-papers',
                filterKey: 'paper',
                customTitle: 'Missing Metareviews'
            });
        }
        if (badDebateCount > 0) {
            const commentsPenalty = Math.round((badDebateCount / totalDebated) * 100);
            discussionDeduction += commentsPenalty;
            scorecard.discussion.deductions.push({
                text: `-${commentsPenalty}%: ${badDebateCount} out of ${totalDebated} debated papers have zero comments.`,
                affectedIds: badDebates.map(p => p.external_submission_id),
                target: 'tab-papers',
                filterKey: 'paper',
                customTitle: 'Unresolved Debates'
            });
        }
        scorecard.discussion.score -= discussionDeduction;
    }

    // Floor scores at 0
    Object.keys(scorecard).forEach(k => {
        if (scorecard[k].score < 0) scorecard[k].score = 0;
        if (scorecard[k].deductions.length === 0) {
            scorecard[k].deductions.push("Perfect score! No issues detected.");
        }
    });

    return scorecard;
}

async function getSystemAnalytics(prefetched = null, conferenceId = null) {
    const cid = conferenceId;
    const health = prefetched?.health || await getConferenceHealth(cid);
    
    // Pass prefetched data into the scorecard generator
    const scorecard = await getQualityScorecard(health, prefetched, cid);
    
    // Top Reviewers
    const topReviewers = prefetched?.topReviewers || await analyticsRepository.getTopReviewers(cid);
    
    // System Distributions
    const distributions = prefetched?.distributions || await analyticsRepository.getSystemDistributions(cid);
    
    const topPapers = await analyticsRepository.getTopPapers(cid);
    const sessionClusters = await analyticsRepository.getSessionClusters(cid);
    
    return {
        health,
        mismatches: prefetched?.mismatches || await getExpertiseMismatches(cid),
        debates: prefetched?.papers || await getPaperDebates({ conferenceId: cid }),
        reviewers: enrichReviewerBias(prefetched?.reviewers || await getReviewerQuality({ conferenceId: cid })),
        coiViolations: prefetched?.coiViolations || await analyticsRepository.getCOIViolations(cid),
        scorecard,
        distributions,
        topPapers,
        topReviewers,
        sessionClusters
    };
}

module.exports = { getQualityScorecard, getSystemAnalytics };
