const analyticsRepository = require("../repositories/analyticsRepository");

// 1. System Health
async function getConferenceHealth(conferenceId = null) {
    const health = await analyticsRepository.getConferenceHealth(conferenceId);
    if (!health) return null;
    return {
        conferenceId: health.conferenceId,
        conference_name: health.conference_name,
        conference_year: health.conference_year,
        total_papers: parseInt(health.total_papers) || 0,
        total_reviewers: parseInt(health.total_reviewers) || 0,
        total_reviews: parseInt(health.total_reviews) || 0,
        total_assignments: parseInt(health.total_assignments) || 0,
        total_sub_reviewers: parseInt(health.total_sub_reviewers) || 0,
        average_score: health.average_score ? parseFloat(health.average_score) : 0,
        system_status: (health.total_papers > 0 && health.total_reviews > 0) ? "NORMAL" : "PENDING_DATA"
    };
}

// 2. Reviewer Bias & Normalization
function enrichReviewerBias(reviewers) {
    reviewers.forEach(reviewer => {
        const calibration = reviewer.calibration_index !== null ? parseFloat(reviewer.calibration_index) : 0;
        const totalReviews = parseInt(reviewer.total_reviews_completed) || 0;

        let biasCategory = "Standard";
        let isReliable = true;

        if (totalReviews > 1) {
            if (calibration > 1.5) {
                biasCategory = "Severe Positive (Easy)";
            } else if (calibration > 0.8) {
                biasCategory = "Mild Positive (Generous)";
            } else if (calibration < -1.5) {
                biasCategory = "Severe Negative (Harsh)";
            } else if (calibration < -0.8) {
                biasCategory = "Mild Negative (Critical)";
            }
        }

        // Reliability check: Low word count + extreme scores
        const avgWords = parseInt(reviewer.avg_word_count) || 0;
        const avgScore = reviewer.avg_score_given !== null ? parseFloat(reviewer.avg_score_given) : 0;
        if (avgWords < 50 && (avgScore >= 2 || avgScore <= -2)) {
            isReliable = false;
        }

        reviewer.bias_category = biasCategory;
        reviewer.is_reliable = isReliable;
    });

    return reviewers;
}

async function getReviewerQuality(options = {}) {
    const reviewers = await analyticsRepository.getReviewerQuality(options);
    return enrichReviewerBias(reviewers);
}

// 3. Paper Explorer (Debates & Normalized Rankings)
async function getPaperDebates(options = {}) {
    const papers = await analyticsRepository.getPaperDebates(options);

    papers.forEach(paper => {
        const spread = paper.score_spread !== null ? parseFloat(paper.score_spread) : 0;
        const totalReviews = parseInt(paper.total_reviews) || 0;
        const totalComments = parseInt(paper.total_comments) || 0;
        const avgScore = paper.average_score !== null ? parseFloat(paper.average_score) : 0;
        const adjustedScore = paper.adjusted_score !== null ? parseFloat(paper.adjusted_score) : avgScore;

        let debateStatus = "Consensus";
        let isCritical = false;

        if (spread > 2.0 && totalReviews >= 2) {
            debateStatus = "High Variance";
            isCritical = true;
        } else if (spread === 0 && totalReviews >= 2) {
            debateStatus = "Unanimous";
        }

        // Check if borderline/controversial without committee discussion
        if (totalReviews >= 2 && Math.abs(avgScore) <= 0.5 && totalComments === 0) {
            debateStatus = "Unresolved Borderline";
            isCritical = true;
        }

        // Detect substantial shift between raw and normalized scores
        const scoreShift = Math.abs(adjustedScore - avgScore);
        if (scoreShift >= 0.75) {
            paper.significant_normalization_shift = true;
        }

        paper.debate_status = debateStatus;
        paper.is_critical = isCritical;
        paper.score_variance = spread.toFixed(2);
    });

    return papers;
}

// 4. Topic & Expertise Alignment
async function getExpertiseMismatches(conferenceId = null, settingsArg = null) {
    const rows = await analyticsRepository.getExpertiseMismatches(conferenceId, settingsArg);

    const mismatches = [];

    rows.forEach(row => {
        const paperTopics = row.paper_topics ? row.paper_topics.split(", ") : [];
        const reviewerTopics = row.reviewer_topics ? row.reviewer_topics.split(", ") : [];

        // Check intersection of topics
        const intersection = paperTopics.filter(t => reviewerTopics.includes(t));

        if (intersection.length === 0 && paperTopics.length > 0) {
            mismatches.push({
                review_id: row.review_id,
                external_submission_id: row.external_submission_id,
                paper_title: row.paper_title,
                reviewer_id: row.reviewer_id,
                reviewer_name: `${row.reviewer_first_name} ${row.reviewer_last_name}`,
                reviewer_email: row.reviewer_email,
                score: row.total_score,
                paper_topics: row.paper_topics,
                reviewer_topics: row.reviewer_topics,
                reason: "Zero topic overlap between paper and reviewer expertise"
            });
        }
    });

    return {
        totalMismatches: mismatches.length,
        details: mismatches
    };
}

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

// 6. Paginated & Filtered Queries
async function getPapers(options = {}) {
    const papers = await getPaperDebates(options);
    const totalCount = papers.length > 0 ? parseInt(papers[0].full_count) || papers.length : papers.length;
    return { items: papers, totalCount };
}

async function getReviewers(options = {}) {
    const reviewers = await getReviewerQuality(options);
    const totalCount = reviewers.length > 0 ? parseInt(reviewers[0].full_count) || reviewers.length : reviewers.length;
    return { items: reviewers, totalCount };
}

async function getSubmissions(options = {}) {
    const submissions = await analyticsRepository.getSubmissions(options);
    const totalCount = submissions.length > 0 ? parseInt(submissions[0].full_count) || submissions.length : submissions.length;
    return { items: submissions, totalCount };
}

// 4. System Analytics
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

async function getPaperDetails(id, conferenceId = null) {
    return await analyticsRepository.getPaperDetails(id, conferenceId);
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

    const totalPapers = parseInt(health?.total_papers) || 0;
    const acceptedPapers = parseInt(acceptance?.accepted_papers) || 0;
    const acceptanceRate = totalPapers > 0 ? ((acceptedPapers / totalPapers) * 100).toFixed(1) : 0;

    let rank = "Unranked / Regional";
    if (acceptanceRate > 0 && acceptanceRate <= 20) {
        rank = "A* / Top-Tier Elite";
    } else if (acceptanceRate > 20 && acceptanceRate <= 28) {
        rank = "A / Leading International";
    } else if (acceptanceRate > 28 && acceptanceRate <= 38) {
        rank = "B / Good International";
    } else if (acceptanceRate > 38) {
        rank = "C / Regional";
    }

    const totalReviews = parseInt(health?.total_reviews) || 0;
    const avgReviewsPerPaper = totalPapers > 0 ? (totalReviews / totalPapers).toFixed(1) : 0;

    let domesticCountry = "Unknown";
    let domesticCount = 0;
    let internationalCount = 0;
    const totalCountries = diversity ? diversity.length : 0;

    if (diversity && diversity.length > 0) {
        domesticCountry = diversity[0].country;
        domesticCount = parseInt(diversity[0].member_count) || 0;
        for (let i = 1; i < diversity.length; i++) {
            internationalCount += parseInt(diversity[i].member_count) || 0;
        }
    }

    const totalPC = domesticCount + internationalCount;
    const internationalPercentage = totalPC > 0 ? ((internationalCount / totalPC) * 100).toFixed(1) : 0;

    const gapTopics = competence ? competence.filter(c => parseInt(c.available_experts) === 0 && parseInt(c.submitted_papers) > 0) : [];

    let statement = `Conference demonstrates ${rank} selectivity characteristics with an acceptance rate of ${acceptanceRate}%. `;
    statement += `Peer review rigor is established with an average of ${avgReviewsPerPaper} reviews per submission. `;
    if (totalPC > 0) {
        statement += `The Program Committee includes members from ${totalCountries} countries (${internationalPercentage}% international diversity). `;
    }
    if (gapTopics.length > 0) {
        statement += `Identified ${gapTopics.length} topic areas with submissions but no matched PC expertise.`;
    }

    return {
        selectivity: {
            acceptanceRate,
            rank,
            acceptedPapers,
            totalPapers
        },
        rigor: {
            avgReviewsPerPaper,
            totalReviews
        },
        internationalization: {
            domesticCountry,
            domesticCount,
            internationalCount,
            totalCountries,
            internationalPercentage
        },
        thematicCompetence: competence || [],
        gapTopics,
        compatibilityStatement: statement
    };
}

async function getLateSubmissions() {
    return [];
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
    const settings = await analyticsRepository.getAnonymizationSettings(cid);
    const health = await getConferenceHealth(cid);
    const papers = await getPaperDebates({ conferenceId: cid });
    const reviewers = await getReviewerQuality({ conferenceId: cid, settings });
    enrichReviewerBias(reviewers);
    const mismatches = await getExpertiseMismatches(cid, settings);
    const coiViolations = await analyticsRepository.getCOIViolations(cid, settings);
    const missingMetareviews = await analyticsRepository.getMissingMetareviews(cid, settings);
    const topReviewers = await analyticsRepository.getTopReviewers(cid);
    const distributions = await analyticsRepository.getSystemDistributions(cid);
    const diversity = await analyticsRepository.getGeographicDiversity(cid);
    const submissions = await analyticsRepository.getSubmissions({ conferenceId: cid });
    const sentimentMismatches = await analyticsRepository.getSentimentMismatches(cid, settings);

    const prefetched = {
        health, papers, reviewers, mismatches, coiViolations, 
        missingMetareviews, topReviewers, 
        distributions, diversity, submissions, sentimentMismatches
    };

    const alerts = await getAlerts(prefetched, cid, settings);
    const systemAnalytics = await getSystemAnalytics(prefetched, cid);
    const qualityProfile = await getAcademicQualityProfile(prefetched, cid);

    return {
        conferenceId: health?.conferenceId,
        conferenceName: health?.conference_name,
        is_anonymized: !!settings.is_anonymized,
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
