const analyticsRepository = require("../repositories/analyticsRepository");
const analyticsMath = require("../utils/analyticsMath");
const topicMatcher = require("../utils/topicMatcher");

async function getConferenceHealth(conferenceId = null) {
    return await analyticsRepository.getConferenceHealth(conferenceId);
}

async function getReviewerQuality(options = {}) {
    return await analyticsRepository.getReviewerQuality(options);
}

async function getPaperDebates(options = {}) {
    const papers = await analyticsRepository.getPaperDebates(options);
    for (const paper of papers) {
        if (paper.reviews && Array.isArray(paper.reviews)) {
            for (const review of paper.reviews) {
                review.isMismatch = topicMatcher.checkMismatch(paper.topics, review.reviewer_topics);
            }
        }
    }
    return papers;
}

async function getExpertiseMismatches(conferenceId = null) {
    const allReviewsWithTopics = await analyticsRepository.getExpertiseMismatches(conferenceId);
    const mismatches = allReviewsWithTopics.filter(r => {
        return topicMatcher.checkMismatch(r.paper_topics, r.reviewer_topics);
    });
    
    return {
        totalMismatches: mismatches.length,
        details: mismatches
    };
}

// 1. Alerts (Action Center)
async function getAlerts(prefetched = null, conferenceId = null) {
    const cid = conferenceId;
    const alerts = [];
    const papers = prefetched?.papers || await getPaperDebates({ conferenceId: cid });
    const reviewers = prefetched?.reviewers || await getReviewerQuality({ conferenceId: cid });
    const mismatches = prefetched?.mismatches || await getExpertiseMismatches(cid);
    const coiViolations = prefetched?.coiViolations || await analyticsRepository.getCOIViolations(cid);
    const missingMetareviews = prefetched?.missingMetareviews || await analyticsRepository.getMissingMetareviews(cid);
    const sentimentMismatches = prefetched?.sentimentMismatches || await analyticsRepository.getSentimentMismatches(cid);
    
    // Alert: Sentiment Mismatches
    if (sentimentMismatches.length > 0) {
        alerts.push({
            type: 'warning',
            title: 'Sentiment Mismatches',
            message: `${sentimentMismatches.length} positive reviews were given low scores (<= 1).`,
            action: 'Audit Reviews',
            target: 'tab-papers',
            filterKey: 'paper',
            affectedIds: [...new Set(sentimentMismatches.map(s => s.external_submission_id))]
        });
    }
    // Alert: COI Violations
    if (coiViolations.length > 0) {
        alerts.push({
            type: 'danger',
            title: 'Conflict of Interest Violations',
            message: `${coiViolations.length} assignments were given to PC members who declared a conflict with the paper.`,
            action: 'Audit Assignments',
            target: 'tab-papers',
            filterKey: 'paper',
            affectedIds: [...new Set(coiViolations.map(c => c.external_submission_id))]
        });
    }

    // Alert: Missing Metareviews
    if (missingMetareviews.length > 0) {
        alerts.push({
            type: 'danger',
            title: 'Missing Metareviews',
            message: `${missingMetareviews.length} highly debated papers (variance > 1.0) are missing a final metareview.`,
            action: 'Assign Metareviewer',
            target: 'tab-papers',
            filterKey: 'paper',
            affectedIds: missingMetareviews.map(m => m.external_submission_id)
        });
    }

    // Alert: Missing Reviews (Less than 3)
    const alertMissingReviews = papers.filter(p => p.total_reviews < 3 && p.decision_category !== 'desk reject');
    if (alertMissingReviews.length > 0) {
        alerts.push({
            type: 'warning',
            title: 'Missing Reviews',
            message: `${alertMissingReviews.length} papers have fewer than 3 completed reviews.`,
            action: 'View Papers',
            target: 'tab-papers',
            filterKey: 'paper',
            affectedIds: alertMissingReviews.map(p => p.external_submission_id)
        });
    }
    
    // Alert: High Variance, Low Discussion
    const concerningDebates = papers.filter(p => parseFloat(p.score_spread) > 1.0 && parseInt(p.total_comments) === 0);
    if (concerningDebates.length > 0) {
        alerts.push({
            type: 'danger',
            title: 'Unresolved Debates',
            message: `${concerningDebates.length} papers have high score variance (>1.0) but ZERO comments.`,
            action: 'Investigate',
            target: 'tab-papers',
            filterKey: 'paper',
            affectedIds: concerningDebates.map(p => p.external_submission_id)
        });
    }
    
    // Alert: Severe Mismatches
    if (mismatches.totalMismatches > 0) {
        alerts.push({
            type: 'danger',
            title: 'Expertise Mismatches',
            message: `${mismatches.totalMismatches} reviews were assigned to PC members with zero overlapping topics.`,
            action: 'Review Assignments',
            target: 'tab-papers',
            filterKey: 'paper',
            affectedIds: [...new Set(mismatches.details.map(m => m.external_submission_id))]
        });
    }

    // Alert: Low Bidding Satisfaction
    const unhappyReviewers = reviewers.filter(r => r.bidding_match_percentage !== null && parseFloat(r.bidding_match_percentage) <= 50);
    if (unhappyReviewers.length > 0) {
        alerts.push({
            type: 'warning',
            title: 'Low Bidding Satisfaction',
            message: `${unhappyReviewers.length} reviewers were assigned a workload where 50% or less matched their bids.`,
            action: 'Check Reviewers',
            target: 'tab-reviewers',
            filterKey: 'reviewer',
            affectedIds: unhappyReviewers.map(r => r.id)
        });
    }
    
    // Alert: Low Effort Reviewers
    const lowEffort = reviewers.filter(r => r.avg_word_count && parseFloat(r.avg_word_count) < 50);
    if (lowEffort.length > 0) {
        alerts.push({
            type: 'warning',
            title: 'Low Effort Reviewers',
            message: `${lowEffort.length} reviewers have an average word count below 50 words.`,
            action: 'Audit Reviewers',
            target: 'tab-reviewers',
            filterKey: 'reviewer',
            affectedIds: lowEffort.map(r => r.id)
        });
    }
    
    return alerts;
}

// 2. Paper Explorer
async function getPapers(options = {}) {
    let papers = await getPaperDebates(options);
    if (options.zeroActivity === 'true') {
        papers = papers.filter(p => parseInt(p.total_reviews) === 0 && parseInt(p.total_comments) === 0);
    }
    return papers;
}

// Late Submissions (After deadline)
async function getLateSubmissions() {
    const client = require("../config/database");
    
    const query = `
        SELECT 
            p.external_submission_id,
            p.title,
            p.submitted_at,
            c.submission_deadline
        FROM paper p
        CROSS JOIN conference c
        WHERE p.submitted_at > c.submission_deadline
        AND p.is_deleted = false
    `;
    const result = await client.query(query);
    return result.rows;
}

// 3. Reviewer Explorer
async function getReviewers(options) {
    return await getReviewerQuality(options);
}

// 5. Submissions Timeline
async function getSubmissions(options = {}) {
    return await analyticsRepository.getSubmissions(options);
}

// 4. System Analytics
async function getQualityScorecard(health, prefetched = null) {
    const papers = prefetched?.papers || await getPaperDebates();
    const reviewers = prefetched?.reviewers || await getReviewerQuality();
    const mismatches = prefetched?.mismatches || await getExpertiseMismatches();
    const coiViolations = prefetched?.coiViolations || await analyticsRepository.getCOIViolations();
    const missingMetareviews = prefetched?.missingMetareviews || await analyticsRepository.getMissingMetareviews();

    const totalPapers = parseInt(health.total_papers) || 1;
    const totalReviewers = parseInt(health.total_reviewers) || 1;
    const totalAssignments = parseInt(health.total_assignments) || 1;
    const totalReviews = parseInt(health.total_reviews) || 1;

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

async function getSystemAnalytics(prefetched = null) {
    const health = prefetched?.health || await getConferenceHealth();
    
    // Pass prefetched data into the scorecard generator
    const scorecard = await getQualityScorecard(health, prefetched);
    
    // Top Reviewers
    const topReviewers = prefetched?.topReviewers || await analyticsRepository.getTopReviewers();
    
    // System Distributions
    const distributions = prefetched?.distributions || await analyticsRepository.getSystemDistributions();
    
    const topPapers = await analyticsRepository.getTopPapers();
    const sessionClusters = await analyticsRepository.getSessionClusters();
    
    return {
        health,
        mismatches: prefetched?.mismatches || await getExpertiseMismatches(),
        debates: prefetched?.papers || await getPaperDebates(),
        reviewers: prefetched?.reviewers || await getReviewerQuality(),
        coiViolations: prefetched?.coiViolations || await analyticsRepository.getCOIViolations(),
        scorecard,
        distributions,
        topPapers,
        topReviewers,
        sessionClusters
    };
}

async function getPaperDetails(id) {
    return await analyticsRepository.getPaperDetails(id);
}

async function getReviewerDetails(id) {
    return await analyticsRepository.getReviewerDetails(id);
}

// 6. Academic Quality Profile (CORE / GII-GRIN-SCIE)
async function getAcademicQualityProfile(prefetched = null, conferenceId = null) {
    const cid = conferenceId;
    const health = prefetched?.health || await analyticsRepository.getConferenceHealth(cid);
    const acceptance = await analyticsRepository.getAcceptanceRate(cid);
    const diversity = prefetched?.diversity || await analyticsRepository.getGeographicDiversity(cid);
    const competence = await analyticsRepository.getThematicCompetence(cid);
    const papers = prefetched?.papers || await getPaperDebates({ conferenceId: cid });
    
    // A. Peer-Review Rigor & Selectivity
    const totalPapers = parseInt(acceptance.total_papers) || 1;
    const acceptedPapers = parseInt(acceptance.accepted_papers) || 0;
    const acceptanceRate = (acceptedPapers / totalPapers) * 100;
    
    let selectivityRank = "Unknown";
    if (acceptanceRate <= 25) selectivityRank = "CORE A/A* (Highly Selective)";
    else if (acceptanceRate <= 35) selectivityRank = "CORE B (Moderately Selective)";
    else selectivityRank = "Below CORE B (Low Selectivity)";

    // Review Density
    const totalReviews = parseInt(health.total_reviews) || 0;
    const avgReviewsPerPaper = (totalReviews / totalPapers).toFixed(2);
    
    const europeanBaselinePapers = papers.filter(p => parseInt(p.total_reviews) >= 3);
    const europeanBaselinePercentage = ((europeanBaselinePapers.length / totalPapers) * 100).toFixed(1);

    // B. PC Internationalization
    const totalCountries = diversity.length;
    let domesticCountry = "Unknown";
    let domesticCount = 0;
    let internationalCount = 0;
    
    if (diversity.length > 0) {
        // Assume the country with the most PC members is the "domestic" host
        domesticCountry = diversity[0].country;
        domesticCount = parseInt(diversity[0].member_count);
        
        // Sum the rest as international
        for (let i = 1; i < diversity.length; i++) {
            internationalCount += parseInt(diversity[i].member_count);
        }
    }
    
    const totalPCWithCountry = domesticCount + internationalCount;
    const internationalPercentage = totalPCWithCountry > 0 ? ((internationalCount / totalPCWithCountry) * 100).toFixed(1) : 0;

    // C. Expertise Alignment (Thematic Gap Analysis)
    const topTopics = competence.slice(0, 5); // Top 5 most submitted topics
    const gapTopics = topTopics.filter(t => parseInt(t.available_experts) < 3);

    // D. Standard Compatibility Statement
    let compatibilityStatement = `Based on an acceptance rate of ${acceptanceRate.toFixed(1)}% and an international PC representation spanning ${totalCountries} countries (${internationalPercentage}% international), this venue fits the operational standards of a ${selectivityRank} / GII-GRIN-SCIE Class ${internationalPercentage > 30 ? '1/2' : '3'} international conference.`;
    
    if (europeanBaselinePercentage >= 90) {
        compatibilityStatement += ` Furthermore, the review rigor is exceptional, with ${europeanBaselinePercentage}% of papers meeting the European baseline of 3+ independent external reviews.`;
    } else {
        compatibilityStatement += ` However, review density is a concern, as only ${europeanBaselinePercentage}% of papers met the European baseline of 3+ independent external reviews.`;
    }

    return {
        selectivity: {
            acceptanceRate: acceptanceRate.toFixed(1),
            acceptedPapers,
            totalPapers,
            rank: selectivityRank
        },
        rigor: {
            avgReviewsPerPaper,
            europeanBaselinePercentage
        },
        internationalization: {
            totalCountries,
            domesticCountry,
            domesticCount,
            internationalCount,
            internationalPercentage
        },
        thematicCompetence: topTopics,
        gapTopics,
        compatibilityStatement
    };
}

async function updatePaperDecision(id, decision) {
    const settings = await analyticsRepository.getAnonymizationSettings();
    if (!settings.decision_editing_enabled) {
        const error = new Error("Decision editing is disabled");
        error.status = 403;
        throw error;
    }
    return await analyticsRepository.updatePaperDecision(id, decision);
}

async function getDashboardData(conferenceId = null) {
    const cid = conferenceId;
    // 1. Fetch all base data ONCE
    const health = await getConferenceHealth(cid);
    const papers = await getPaperDebates({ conferenceId: cid });
    const reviewers = await getReviewerQuality({ conferenceId: cid });
    const mismatches = await getExpertiseMismatches(cid);
    const coiViolations = await analyticsRepository.getCOIViolations(cid);
    const missingMetareviews = await analyticsRepository.getMissingMetareviews(cid);
    const topReviewers = await analyticsRepository.getTopReviewers(cid);
    const distributions = await analyticsRepository.getSystemDistributions(cid);
    const diversity = await analyticsRepository.getGeographicDiversity(cid);
    const submissions = await analyticsRepository.getSubmissions({ conferenceId: cid });
    const sentimentMismatches = await analyticsRepository.getSentimentMismatches(cid);

    const prefetched = {
        health, papers, reviewers, mismatches, coiViolations, 
        missingMetareviews, topReviewers, 
        distributions, diversity, submissions, sentimentMismatches
    };

    const alerts = await getAlerts(prefetched, cid);
    const systemAnalytics = await getSystemAnalytics(prefetched);
    const qualityProfile = await getAcademicQualityProfile(prefetched, cid);

    return {
        conferenceId: health?.conferenceId,
        conferenceName: health?.conference_name,
        alerts,
        systemAnalytics,
        qualityProfile,
        papers: { items: papers, totalCount: papers.length },
        reviewers: { items: reviewers, totalCount: reviewers.length },
        submissions: { items: submissions, totalCount: submissions.length }
    };
}

module.exports = {
    getConferenceHealth,
    getReviewerQuality,
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
