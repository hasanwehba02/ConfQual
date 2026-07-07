const analyticsRepository = require("../repositories/analyticsRepository");

async function getConferenceHealth() {
    return await analyticsRepository.getConferenceHealth();
}

async function getReviewerQuality() {
    return await analyticsRepository.getReviewerQuality();
}

async function getPaperDebates() {
    return await analyticsRepository.getPaperDebates();
}

async function getExpertiseMismatches() {
    const allReviewsWithTopics = await analyticsRepository.getExpertiseMismatches();
    
    // Fuzzy matching logic: Stop words to ignore when comparing topics
    const stopWords = new Set(['and', 'the', 'for', 'with', 'from', 'based', 'system', 'systems', 'science', 'engineering']);
    
    const extractWords = (str) => {
        if (!str) return [];
        return str.toLowerCase()
                  .replace(/[^a-z0-9]/g, ' ')
                  .split(/\s+/)
                  .filter(w => w.length > 2 && !stopWords.has(w));
    };

    const mismatches = allReviewsWithTopics.filter(r => {
        // First check if they have an exact topic match
        if (r.paper_topics && r.reviewer_topics) {
            const pTopics = r.paper_topics.split(', ').map(t => t.trim().toLowerCase());
            const rTopics = r.reviewer_topics.split(', ').map(t => t.trim().toLowerCase());
            if (pTopics.some(pt => rTopics.includes(pt))) {
                return false; // Not a mismatch, they share an exact topic
            }
        }
        
        // If no exact match, check for fuzzy word overlap
        const paperWords = extractWords(r.paper_topics);
        const reviewerWords = extractWords(r.reviewer_topics);
        
        const hasOverlap = paperWords.some(pw => reviewerWords.includes(pw));
        
        // If there is ANY overlapping significant word, we accept it as related (not a mismatch)
        return !hasOverlap;
    });
    
    return {
        totalMismatches: mismatches.length,
        details: mismatches
    };
}

// 1. Alerts (Action Center)
async function getAlerts() {
    const alerts = [];
    const papers = await getPaperDebates();
    const reviewers = await getReviewerQuality();
    const mismatches = await getExpertiseMismatches();
    const coiViolations = await analyticsRepository.getCOIViolations();
    const missingMetareviews = await analyticsRepository.getMissingMetareviews();
    
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
    const alertMissingReviews = papers.filter(p => p.total_reviews < 3 && (!p.decision || !p.decision.toLowerCase().includes('desk reject')));
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
    const concerningDebates = papers.filter(p => parseFloat(p.score_variance) > 1.0 && parseInt(p.total_comments) === 0);
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
async function getPapers() {
    return await getPaperDebates();
}

// 3. Reviewer Explorer
async function getReviewers() {
    return await getReviewerQuality();
}

// 4. System Analytics
async function getQualityScorecard(health) {
    const papers = await getPaperDebates();
    const reviewers = await getReviewerQuality();
    const mismatches = await getExpertiseMismatches();
    const coiViolations = await analyticsRepository.getCOIViolations();
    const missingMetareviews = await analyticsRepository.getMissingMetareviews();

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
    const validPapers = papers.filter(p => !p.decision || !p.decision.toLowerCase().includes('desk reject'));
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

async function getSystemAnalytics() {
    const health = await getConferenceHealth();
    const mismatchesData = await getExpertiseMismatches();
    const debates = await getPaperDebates();
    const reviewers = await getReviewerQuality();
    const coiViolations = await analyticsRepository.getCOIViolations();
    const scorecard = await getQualityScorecard(health);
    
    return {
        health,
        mismatches: mismatchesData,
        debates,
        reviewers,
        coiViolations,
        scorecard
    };
}

async function getPaperDetails(id) {
    return await analyticsRepository.getPaperDetails(id);
}

async function getReviewerDetails(id) {
    return await analyticsRepository.getReviewerDetails(id);
}

// 6. Academic Quality Profile (CORE / GII-GRIN-SCIE)
async function getAcademicQualityProfile() {
    const health = await analyticsRepository.getConferenceHealth();
    const acceptance = await analyticsRepository.getAcceptanceRate();
    const diversity = await analyticsRepository.getGeographicDiversity();
    const competence = await analyticsRepository.getThematicCompetence();
    const papers = await getPaperDebates(); // To calculate review density
    
    // A. Peer-Review Rigor & Selectivity
    const totalPapers = parseInt(acceptance.total_papers) || 1;
    const acceptedPapers = parseInt(acceptance.accepted_papers) || 0;
    const acceptanceRate = (acceptedPapers / totalPapers) * 100;
    
    let selectivityRank = "Unknown";
    if (acceptanceRate <= 25) selectivityRank = "CORE A/A* (Highly Selective)";
    else if (acceptanceRate <= 35) selectivityRank = "CORE B (Moderately Selective)";
    else selectivityRank = "Below CORE B (Low Selectivity)";

    // Review Density
    const averageReviews = parseFloat(health.average_score) || 0; // Wait, health has total_reviews, total_papers
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

module.exports = {
    getConferenceHealth,
    getReviewerQuality,
    getPaperDebates,
    getExpertiseMismatches,
    getAlerts,
    getPapers,
    getReviewers,
    getSystemAnalytics,
    getQualityScorecard,
    getPaperDetails,
    getReviewerDetails,
    getAcademicQualityProfile
};
