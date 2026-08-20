const analyticsRepository = require("../repositories/analyticsRepository");
const scoreNormalization = require("../utils/scoreNormalization");

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function fmt(value, fallback = '-') {
    return value === null || value === undefined ? fallback : escapeHtml(value);
}

function fmtNum(value, fallback = '-') {
    const n = parseFloat(value);
    return Number.isNaN(n) ? fallback : n.toFixed(2);
}

function buildReportFilename(reviewer, fallbackId = 'report') {
    if (!reviewer) return `Reviewer_${fallbackId}_report.pdf`;
    const nameParts = [reviewer.first_name, reviewer.last_name]
        .filter(Boolean)
        .map(s => String(s).trim())
        .filter(Boolean);
    const rawName = nameParts.length > 0 ? nameParts.join('_') : `Reviewer_${reviewer.id || fallbackId}`;
    const safeName = rawName
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .replace(/_+/g, '_');
    return `${safeName || `Reviewer_${fallbackId}`}_report.pdf`;
}

async function buildReportData(reviewerId) {
    const reviewer = await analyticsRepository.getReviewerDetails(reviewerId);
    if (!reviewer) return null;
    const stats = await analyticsRepository.getReviewerStatsById(reviewerId);
    const biasLabel = scoreNormalization.deriveBiasLabel(
        stats.avg_score_given,
        stats.conf_mean,
        stats.total_reviews_completed
    );
    return { reviewer, stats, biasLabel };
}

function buildReportHtml(data, { includeReviewText = false } = {}) {
    const { reviewer, stats, biasLabel } = data;
    const generated = new Date().toLocaleString();

    const statRows = [
        ['Reviews Completed', fmt(stats.total_reviews_completed, '0')],
        ['Avg Score Given', fmtNum(stats.avg_score_given)],
        ['Score Std Dev', fmtNum(stats.reviewer_std)],
        ['Calibration Index', fmtNum(stats.calibration_index)],
        ['Bid Match %', stats.bidding_match_percentage !== null && stats.bidding_match_percentage !== undefined ? `${escapeHtml(stats.bidding_match_percentage)}%` : '-'],
        ['Bias', biasLabel ? `<span class="badge badge-${biasLabel}">${escapeHtml(biasLabel)}</span>` : '-']
    ];

    const statsHtml = `
        <div class="stats-row">
            ${statRows.map(([label, value]) => `
                <div class="stat">
                    <div class="stat-value">${value}</div>
                    <div class="stat-label">${escapeHtml(label)}</div>
                </div>
            `).join('')}
        </div>
    `;

    let papersHtml;
    if (reviewer.assignments && reviewer.assignments.length > 0) {
        const rows = reviewer.assignments.map(a => {
            const reviewTextHtml = includeReviewText && a.review_text
                ? `<div class="review-text">${escapeHtml(a.review_text).replace(/\n/g, '<br/>')}</div>`
                : '';
            let commentsHtml = '';
            if (includeReviewText && a.comments && a.comments.length > 0) {
                const validComments = a.comments.filter(c => c !== null && c !== undefined && String(c).trim() !== '');
                if (validComments.length > 0) {
                    commentsHtml = `<div class="comments">${validComments.map(c => `<div class="comment">💬 "${escapeHtml(c)}"</div>`).join('')}</div>`;
                }
            }
            return `
                <tr>
                    <td class="mono">#${escapeHtml(a.external_submission_id)}</td>
                    <td>${escapeHtml(a.title)}
                        ${reviewTextHtml}
                        ${commentsHtml}
                    </td>
                    <td class="mono">${a.given_score !== null && a.given_score !== undefined ? escapeHtml(a.given_score) : 'PENDING'}</td>
                    <td class="mono">${fmtNum(a.peer_average)}</td>
                    <td class="mono">${a.bid_status !== null && a.bid_status !== undefined ? escapeHtml(a.bid_status) : 'NO BID'}</td>
                </tr>
            `;
        }).join('');
        papersHtml = `
            <h2>Assigned Papers (${reviewer.assignments.length})</h2>
            <table>
                <thead>
                    <tr>
                        <th>#ID</th>
                        <th>TITLE</th>
                        <th>SCORE GIVEN</th>
                        <th>PAPER AVG</th>
                        <th>BID</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    } else {
        papersHtml = '<h2>Assigned Papers</h2><p class="muted">No assignments found.</p>';
    }

    let bidsHtml;
    if (reviewer.bids && reviewer.bids.length > 0) {
        const bidRows = reviewer.bids.map(b => `
            <tr>
                <td class="mono">#${escapeHtml(b.external_submission_id)}</td>
                <td>${escapeHtml(b.title)}</td>
                <td class="mono">${escapeHtml(b.bid)}</td>
            </tr>
        `).join('');
        bidsHtml = `
            <h2>Submitted Bids (${reviewer.bids.length})</h2>
            <table>
                <thead>
                    <tr>
                        <th>#ID</th>
                        <th>TITLE</th>
                        <th>BID</th>
                    </tr>
                </thead>
                <tbody>${bidRows}</tbody>
            </table>
        `;
    } else {
        bidsHtml = '<h2>Submitted Bids</h2><p class="muted">No bids found.</p>';
    }

    const fullName = [reviewer.first_name, reviewer.last_name]
        .filter(Boolean)
        .map(s => String(s).trim())
        .filter(Boolean)
        .join(' ') || `Reviewer #${reviewer.id}`;

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Reviewer Report Card</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; margin: 32px; line-height: 1.5; }
        .mono { font-family: 'Roboto Mono', 'Courier New', monospace; }
        h1 { font-size: 20px; margin: 0 0 4px 0; }
        h2 { font-size: 14px; margin: 24px 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px; color: #4b5563; }
        .meta { color: #6b7280; font-size: 12px; margin-bottom: 16px; }
        .stats-row { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0 8px 0; }
        .stat { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; min-width: 110px; background: #f9fafb; }
        .stat-value { font-family: 'Roboto Mono', 'Courier New', monospace; font-size: 16px; font-weight: 600; }
        .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-top: 2px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
        .badge-calibrated { background: #e5e7eb; color: #4b5563; }
        .badge-lenient, .badge-strict { background: #fef3c7; color: #b45309; }
        .badge-extreme { background: #fee2e2; color: #b91c1c; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #e5e7eb; color: #4b5563; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
        td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
        .review-text { margin-top: 6px; padding-top: 6px; border-top: 1px dashed #e5e7eb; font-size: 11px; color: #374151; white-space: pre-wrap; }
        .comments { margin-top: 4px; }
        .comment { font-size: 11px; font-style: italic; color: #6b7280; }
        .muted { color: #6b7280; font-size: 12px; }
        .footer { margin-top: 32px; font-size: 10px; color: #9ca3af; }
    </style>
</head>
<body>
    <h1>${escapeHtml(fullName)}</h1>
    <div class="meta">
        ${fmt(reviewer.role)}${reviewer.email ? ` · ${escapeHtml(reviewer.email)}` : ''} · Generated ${escapeHtml(generated)}
    </div>
    ${statsHtml}
    ${papersHtml}
    ${bidsHtml}
    <div class="footer">Conference Quality Dashboard — Reviewer Report Card</div>
</body>
</html>`;
}

module.exports = {
    buildReportData,
    buildReportHtml,
    buildReportFilename,
    escapeHtml
};
