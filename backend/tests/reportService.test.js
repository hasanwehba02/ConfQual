const test = require('node:test');
const assert = require('node:assert');
const repo = require('../repositories/analyticsRepository');
const reportService = require('../services/reportService');

const sampleData = {
    reviewer: {
        id: 4,
        external_person_id: 'nom4',
        first_name: 'Nom',
        last_name: '4',
        role: 'Primary PC',
        email: 'nom4@example.com',
        assignments: [
            {
                external_submission_id: 61,
                title: 'A nice paper',
                given_score: '0.00',
                review_text: 'Good work.\nNice results.',
                bid_status: 'yes',
                peer_average: '-0.33',
                comments: ['Well written', null]
            },
            {
                external_submission_id: 113,
                title: '<script>alert(1)</script></td><td>',
                given_score: null,
                review_text: 'Raw HTML: <b>bold</b>',
                bid_status: null,
                peer_average: '0.33',
                comments: []
            }
        ],
        bids: [
            { external_submission_id: 72, title: 'Another paper', bid: 'maybe' }
        ]
    },
    stats: {
        total_reviews_completed: '4',
        avg_score_given: '0.00',
        reviewer_std: '2.45',
        peers_avg: '-0.50',
        calibration_index: '0.50',
        bidding_match_percentage: null,
        conf_mean: '-0.218',
        conf_std: '1.509'
    },
    biasLabel: 'calibrated'
};

test('buildReportHtml escapes user-supplied strings (FIRST)', () => {
    const html = reportService.buildReportHtml(sampleData, { includeReviewText: true });
    assert.ok(!html.includes('<script>alert(1)</script>'), 'raw script tag must not appear');
    assert.ok(html.includes('&lt;script&gt;'), 'script tag must be escaped');
    assert.ok(!html.includes('</td><td>'), 'raw table-breaking markup must not appear');
    assert.ok(html.includes('&lt;b&gt;bold&lt;/b&gt;'), 'review text HTML must be escaped');
});

test('buildReportHtml includes all report sections', () => {
    const html = reportService.buildReportHtml(sampleData, {});
    assert.ok(html.includes('Nom 4'), 'reviewer name present');
    assert.ok(html.includes('Primary PC'), 'role present');
    assert.ok(html.includes('nom4@example.com'), 'email present');
    assert.ok(html.includes('Reviews Completed'), 'stats row label present');
    assert.ok(html.includes('Calibration Index'), 'stats row label present');
    assert.ok(html.includes('SCORE GIVEN'), 'papers table header present');
    assert.ok(html.includes('PAPER AVG'), 'papers table header present');
    assert.ok(html.includes('calibrated'), 'bias badge label present');
    assert.ok(html.includes('Another paper'), 'bids section present');
});

test('buildReportHtml includes review text and comments only when toggled on', () => {
    const withText = reportService.buildReportHtml(sampleData, { includeReviewText: true });
    assert.ok(withText.includes('Good work'), 'review text present when toggled on');
    assert.ok(withText.includes('Well written'), 'comments present when toggled on');

    const withoutText = reportService.buildReportHtml(sampleData, { includeReviewText: false });
    assert.ok(!withoutText.includes('Good work'), 'review text absent when toggled off');
    assert.ok(!withoutText.includes('Well written'), 'comments absent when toggled off');

    const omitted = reportService.buildReportHtml(sampleData, {});
    assert.ok(!omitted.includes('Good work'), 'review text absent when option omitted');
});

test('buildReportHtml is null-safe', () => {
    const nullData = {
        reviewer: {
            id: 9,
            external_person_id: 'nom9',
            first_name: 'Nom',
            last_name: '9',
            role: null,
            email: null,
            assignments: [{
                external_submission_id: 7,
                title: 'Null fields paper',
                given_score: null,
                review_text: null,
                bid_status: null,
                peer_average: null,
                comments: []
            }],
            bids: []
        },
        stats: {
            total_reviews_completed: '0',
            avg_score_given: null,
            reviewer_std: null,
            peers_avg: null,
            calibration_index: null,
            bidding_match_percentage: null,
            conf_mean: null,
            conf_std: null
        },
        biasLabel: null
    };
    const html = reportService.buildReportHtml(nullData, {});
    assert.ok(html.includes('PENDING'), 'null given_score renders PENDING');
    assert.ok(html.includes('NO BID'), 'null bid_status renders NO BID');
    assert.ok(!html.includes('undefined'), 'no undefined leaks into output');
    assert.ok(!html.includes('null'), 'no literal null leaks into output');
    assert.ok(html.length > 0, 'produces a document even with empty data');
});

test('buildReportData merges details, stats, and derived biasLabel', async () => {
    const origDetails = repo.getReviewerDetails;
    const origStats = repo.getReviewerStatsById;
    repo.getReviewerDetails = async () => sampleData.reviewer;
    repo.getReviewerStatsById = async () => sampleData.stats;
    try {
        const data = await reportService.buildReportData(4);
        assert.strictEqual(data.reviewer.id, 4);
        assert.deepStrictEqual(data.stats, sampleData.stats);
        assert.strictEqual(data.biasLabel, 'calibrated');

        repo.getReviewerStatsById = async () => ({
            ...sampleData.stats,
            avg_score_given: '2.00',
            total_reviews_completed: '5'
        });
        const extreme = await reportService.buildReportData(4);
        assert.strictEqual(extreme.biasLabel, 'extreme');

        repo.getReviewerStatsById = async () => ({
            ...sampleData.stats,
            total_reviews_completed: '2'
        });
        const fewReviews = await reportService.buildReportData(4);
        assert.strictEqual(fewReviews.biasLabel, null);
    } finally {
        repo.getReviewerDetails = origDetails;
        repo.getReviewerStatsById = origStats;
    }
});

test('buildReportData returns null when reviewer not found', async () => {
    const origDetails = repo.getReviewerDetails;
    repo.getReviewerDetails = async () => null;
    try {
        const data = await reportService.buildReportData(999999);
        assert.strictEqual(data, null);
    } finally {
        repo.getReviewerDetails = origDetails;
    }
});

test('buildReportFilename creates sanitized filename from reviewer name (anonymized and regular)', () => {
    // Regular name
    assert.strictEqual(
        reportService.buildReportFilename({ first_name: 'Jane', last_name: 'Doe' }),
        'Jane_Doe_report.pdf'
    );
    // Anonymized name (with or without prefix)
    assert.strictEqual(
        reportService.buildReportFilename({ first_name: 'Reviewer_14', last_name: '' }),
        'Reviewer_14_report.pdf'
    );
    assert.strictEqual(
        reportService.buildReportFilename({ first_name: 'conf2024_Reviewer_14', last_name: '' }),
        'conf2024_Reviewer_14_report.pdf'
    );
    // Sub-reviewer anonymized name
    assert.strictEqual(
        reportService.buildReportFilename({ first_name: 'subnom42', last_name: 'cognom42' }),
        'subnom42_cognom42_report.pdf'
    );
    // Special characters / whitespace
    assert.strictEqual(
        reportService.buildReportFilename({ first_name: ' Jean-Luc / ', last_name: 'Picard ' }),
        'Jean-Luc_Picard_report.pdf'
    );
    // Fallback if empty names
    assert.strictEqual(
        reportService.buildReportFilename({ first_name: '', last_name: '', id: 8 }),
        'Reviewer_8_report.pdf'
    );
    assert.strictEqual(
        reportService.buildReportFilename(null, '99'),
        'Reviewer_99_report.pdf'
    );
});
