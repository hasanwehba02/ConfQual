// Chart.js instance builders/updaters. Chart.js is loaded via its global script tag.
let reviewerChartInstance = null;
let debatesChartInstance = null;
let decisionChartInstance = null;
let scoreChartInstance = null;
let comparisonAcceptanceChart = null;
let comparisonScoreChart = null;

export function renderAnalyticsCharts(analytics) {
    if (reviewerChartInstance) reviewerChartInstance.destroy();
    if (debatesChartInstance) debatesChartInstance.destroy();
    if (decisionChartInstance) decisionChartInstance.destroy();
    if (scoreChartInstance) scoreChartInstance.destroy();

    // Monochromatic Chart configurations (Tufte-inspired)
    Chart.defaults.font.family = "'Roboto Mono', monospace";
    Chart.defaults.color = '#000000';

    const ctxPie = document.getElementById('reviewerChart').getContext('2d');
    const mainReviewers = parseInt(analytics.health.total_reviewers) - parseInt(analytics.health.total_sub_reviewers);

    reviewerChartInstance = new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: ['Primary PC', 'Sub-reviewers'],
            datasets: [{
                data: [mainReviewers, parseInt(analytics.health.total_sub_reviewers)],
                backgroundColor: ['#000000', '#cccccc'],
                borderWidth: 1,
                borderColor: '#ffffff',
                hoverOffset: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            },
            cutout: '0%',
            layout: { padding: 10 },
            elements: { arc: { roundedCornersFor: 0 } }
        }
    });

    if (debatesChartInstance) debatesChartInstance.destroy();
    const ctxBar = document.getElementById('debatesChart').getContext('2d');
    const topDebates = analytics.debates.slice(0, 7);

    debatesChartInstance = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: topDebates.map(d => `#${d.external_submission_id}`),
            datasets: [{
                label: 'SPREAD',
                data: topDebates.map(d => parseFloat(d.score_spread)),
                backgroundColor: '#000000', // Solid black
                borderColor: '#000000',
                borderWidth: 0,
                borderRadius: 0, // No rounded corners
                barPercentage: 0.8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { display: false, drawBorder: true, borderColor: '#000' } // Tufte-style axes
                },
                x: {
                    grid: { display: false, drawBorder: true, borderColor: '#000' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });

    const ctxDecision = document.getElementById('decisionChart');
    if (ctxDecision) {
        let acceptCount = 0;
        let rejectCount = 0;
        let deskRejectCount = 0;
        let noDecisionCount = 0;

        if (analytics.distributions && analytics.distributions.decisions) {
            analytics.distributions.decisions.forEach(d => {
                const dec = d.decision ? d.decision.toLowerCase() : 'no decision';
                const count = parseInt(d.count, 10) || 0;
                if (dec === 'desk reject') { deskRejectCount += count; }
                else if (dec === 'accept') { acceptCount += count; }
                else if (dec === 'reject') { rejectCount += count; }
                else { noDecisionCount += count; }
            });
        }

        if (decisionChartInstance) decisionChartInstance.destroy();
        decisionChartInstance = new Chart(ctxDecision.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Accept', 'Reject', 'Desk Reject', 'No Decision/Withdrawn'],
                datasets: [{
                    data: [acceptCount, rejectCount, deskRejectCount, noDecisionCount],
                    backgroundColor: ['#2ecc71', '#e74c3c', '#c0392b', '#95a5a6'],
                    borderWidth: 1,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'right', labels: { font: { family: "'Roboto Mono', monospace" } } } },
                cutout: '50%'
            }
        });
    }

    const ctxScore = document.getElementById('scoreChart');
    if (ctxScore) {
        // Count distribution from -3 to 3
        const scoreCounts = { '-3': 0, '-2': 0, '-1': 0, '0': 0, '1': 0, '2': 0, '3': 0 };

        if (analytics.distributions && analytics.distributions.scores) {
            analytics.distributions.scores.forEach(s => {
                const scoreStr = s.rounded_score ? s.rounded_score.toString() : '';
                if (scoreCounts[scoreStr] !== undefined) {
                    scoreCounts[scoreStr] += (parseInt(s.count, 10) || 0);
                }
            });
        }

        if (scoreChartInstance) scoreChartInstance.destroy();
        scoreChartInstance = new Chart(ctxScore.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['-3', '-2', '-1', '0', '1', '2', '3'],
                datasets: [{
                    label: 'Papers count',
                    data: Object.values(scoreCounts),
                    backgroundColor: '#000000',
                    borderColor: '#000000',
                    borderWidth: 0,
                    borderRadius: 0,
                    barPercentage: 0.8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { display: false, drawBorder: true, borderColor: '#000' } },
                    x: { grid: { display: false, drawBorder: true, borderColor: '#000' } }
                }
            }
        });
    }
}

export function renderComparisonCharts(data) {
    const sorted = [...data].sort((a, b) => (a.year || 0) - (b.year || 0));
    const labels = sorted.map(c => c.short_name ? `${c.short_name} ${c.year || ''}`.trim() : (c.name || `ID:${c.id}`));
    const accRates = sorted.map(c => c.total_papers > 0 ? ((c.accepted_papers / c.total_papers) * 100).toFixed(1) : null);
    const avgScores = sorted.map(c => c.avg_review_score != null ? parseFloat(c.avg_review_score).toFixed(2) : null);

    if (comparisonAcceptanceChart) comparisonAcceptanceChart.destroy();
    if (comparisonScoreChart) comparisonScoreChart.destroy();

    const accCtx = document.getElementById('comparisonAcceptanceChart');
    if (accCtx) {
        comparisonAcceptanceChart = new Chart(accCtx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Acceptance Rate (%)', data: accRates, backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 4 }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
        });
    }
    const scoreCtx = document.getElementById('comparisonScoreChart');
    if (scoreCtx) {
        comparisonScoreChart = new Chart(scoreCtx, {
            type: 'line',
            data: {
                labels,
                datasets: [{ label: 'Avg Review Score', data: avgScores, borderColor: 'rgba(16,185,129,0.9)', backgroundColor: 'rgba(16,185,129,0.15)', tension: 0.3, fill: true, pointRadius: 5 }]
            },
            options: { responsive: true, plugins: { legend: { display: false } } }
        });
    }
}
