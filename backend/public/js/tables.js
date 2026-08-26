import { escapeHtml } from './utils.js';
import { getBiasBadgeClass } from './renderers.js';
import { state } from './state.js';

window.renderPapersTable = renderPapersTable;
window.renderReviewersTable = renderReviewersTable;
window.renderSubmissionsTable = renderSubmissionsTable;

function formatAdjScoreCell(p) {
    const avg = parseFloat(p.average_score);
    const adj = p.adjusted_score !== null && p.adjusted_score !== undefined ? parseFloat(p.adjusted_score) : null;
    if (adj === null) return '<span class="text-muted">-</span>';
    if (!isNaN(avg) && Math.abs(adj - avg) >= 0.5) {
        return `<strong style="color: #f59e0b;" title="Bias-corrected average (z-score normalized per reviewer)">${adj.toFixed(2)}</strong>`;
    }
    return adj.toFixed(2);
}

function formatBiasCell(r) {
    if (!r.bias_label) return '<span class="text-muted">-</span>';
    return `<span class="badge ${getBiasBadgeClass(r.bias_label)}">${r.bias_label}</span>`;
}

export async function renderPapersTable(papers) {
    const tbody = document.getElementById('papers-table-body');
    tbody.innerHTML = '';

    let dataToRender = state.activePaperFilter ? papers.filter(p => state.activePaperFilter.includes(parseInt(p.external_submission_id, 10))) : papers;

    const searchInput = document.getElementById('paper-search');
    if (searchInput && searchInput.value) {
        const query = searchInput.value.toLowerCase();
        dataToRender = dataToRender.filter(p =>
            (p.title && p.title.toLowerCase().includes(query)) ||
            (p.external_submission_id && p.external_submission_id.toString().includes(query))
        );
    }

    const response = await fetch('/api/settings');
    let settings = {};
    if (response.ok) {
        settings = await response.json();
    }
    const selectDisabled = settings.decision_editing_enabled ? '' : 'disabled';

    // Find max spread to scale sparkline
    let maxSpread = 0;
    dataToRender.forEach(p => {
        const val = parseFloat(p.score_spread || 0);
        if (val > maxSpread) maxSpread = val;
    });

    dataToRender.forEach(p => {
        const sprVal = parseFloat(p.score_spread || 0);
        const sprWidth = maxSpread > 0 ? (sprVal / maxSpread) * 100 : 0;
        const sparkClass = sprVal > 2.0 ? 'danger' : (sprVal > 1.0 ? 'warning' : '');

        const currentDec = p.decision_category || 'no decision';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-family: 'Roboto Mono', monospace; display: flex; align-items: center;">
                ${escapeHtml(p.external_submission_id)}
                ${p.total_reviews < 3 ? '<span style="color: red; margin-left: 6px; font-size: 0.9em;">⚠️ Less than 3 reviews</span>' : ''}
            </td>
            <td>${escapeHtml(p.title)}</td>
            <td>
                <select class="form-select" style="padding: 2px 5px; border-radius: 4px; font-size: 0.75rem; border: 1px solid #ccc;" ${selectDisabled}>
                    <option value="Accept" ${currentDec === 'accept' ? 'selected' : ''}>Accept</option>
                    <option value="Reject" ${currentDec === 'reject' ? 'selected' : ''}>Reject</option>
                    <option value="Desk Reject" ${currentDec === 'desk reject' ? 'selected' : ''}>Desk Reject</option>
                    <option value="No Decision" ${currentDec === 'no decision' || currentDec === 'withdrawn' ? 'selected' : ''}>No Decision/Withdrawn</option>
                </select>
            </td>
            <td style="font-family: 'Roboto Mono', monospace;">${escapeHtml(p.total_reviews)}</td>
            <td style="font-family: 'Roboto Mono', monospace;">${escapeHtml(p.average_score) || '-'}</td>
            <td>
                <div class="sparkline-container">
                    <span style="font-family: 'Roboto Mono', monospace; width: 40px;">${parseFloat(p.score_spread || 0).toFixed(2)}</span>
                    <div style="flex: 1; background: #eee;">
                        <div class="sparkline-bar ${sparkClass}" style="width: ${sprWidth}%"></div>
                    </div>
                </div>
            </td>
            <td style="font-family: 'Roboto Mono', monospace;">${formatAdjScoreCell(p)}</td>
            <td style="font-family: 'Roboto Mono', monospace;">${escapeHtml(p.total_comments) || '0'}</td>
        `;
        const select = tr.querySelector('select');
        select.addEventListener('click', (event) => event.stopPropagation());
        select.addEventListener('change', function() { window.updatePaperDecision(p.id, this.value); });
        tr.addEventListener('click', () => window.openPaperModal(p.external_submission_id));
        tbody.appendChild(tr);
    });
}

export function renderReviewersTable(reviewers) {
    const tbody = document.getElementById('reviewers-table-body');
    tbody.innerHTML = '';

    let dataToRender = state.activeReviewerFilter ? reviewers.filter(r => state.activeReviewerFilter.includes(parseInt(r.id, 10))) : reviewers;

    const searchInput = document.getElementById('reviewer-search');
    if (searchInput && searchInput.value) {
        const query = searchInput.value.toLowerCase();
        dataToRender = dataToRender.filter(r =>
            (r.first_name && r.first_name.toLowerCase().includes(query)) ||
            (r.last_name && r.last_name.toLowerCase().includes(query)) ||
            (r.reviewer_id && r.reviewer_id.toString().includes(query))
        );
    }

    // Find max abs calibration for scaling
    let maxCal = 0;
    dataToRender.forEach(r => {
        const cal = Math.abs(parseFloat(r.calibration_index || 0));
        if (cal > maxCal) maxCal = cal;
    });

    dataToRender.forEach(r => {
        const calVal = parseFloat(r.calibration_index || 0);
        const calAbs = Math.abs(calVal);
        const calWidth = maxCal > 0 ? (calAbs / maxCal) * 100 : 0;

        let calClass = '';
        let textDisplay = calVal > 0 ? `+${calVal.toFixed(2)}` : calVal.toFixed(2);

        if (calVal <= -1.0) {
            calClass = 'danger';
        } else if (calVal >= 1.0) {
            calClass = 'warning';
        }

        const bm = parseFloat(r.bidding_match_percentage);
        const bmHtml = bm < 50 ? `<strong class="text-danger">${bm}%</strong>` : `${bm}%`;

        const warningHtml = parseInt(r.total_reviews_completed) === 0 ? '<span style="color: red; margin-left: 6px; font-size: 0.9em;">⚠️ 0 reviews completed</span>' : '';

        const tr = document.createElement('tr');
        tr.addEventListener('click', () => window.openReviewerModal(r.id, `${r.first_name} ${r.last_name}`));
        tr.innerHTML = `
            <td style="font-family: 'Roboto Mono', monospace;">${escapeHtml(r.reviewer_id) || '-'} ${warningHtml}</td>
            <td style="font-weight: bold;">${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</td>
            <td><span class="badge bg-neutral">${escapeHtml(r.role)}</span></td>
            <td style="font-family: 'Roboto Mono', monospace;">${escapeHtml(r.total_reviews_completed)}</td>
            <td style="font-family: 'Roboto Mono', monospace;">${escapeHtml(r.avg_word_count) || '0'}</td>
            <td style="font-family: 'Roboto Mono', monospace;">${escapeHtml(r.avg_score_given) || '-'}</td>
            <td style="font-family: 'Roboto Mono', monospace;">${bmHtml}</td>
            <td>
                <div class="sparkline-container">
                    <span style="font-family: 'Roboto Mono', monospace; width: 45px; display: inline-block;">${textDisplay}</span>
                    <div style="flex: 1; background: #eee;">
                        <div class="sparkline-bar ${calClass}" style="width: ${calWidth}%"></div>
                    </div>
                </div>
            </td>
            <td class="text-center">${formatBiasCell(r)}</td>
            <td style="font-family: 'Roboto Mono', monospace;">${escapeHtml(r.total_comments) || '0'}</td>
        `;
        tbody.appendChild(tr);
    });
}

export function renderSubmissionsTable(submissions) {
    const tbody = document.getElementById('submissions-table-body');
    tbody.innerHTML = '';
    if (!submissions || submissions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No submissions found.</td></tr>';
        return;
    }

    submissions.forEach(sub => {
        const tr = document.createElement('tr');

        const dateStr = sub.review_date ? new Date(sub.review_date).toLocaleDateString() : '-';
        const timeStr = sub.review_time ? sub.review_time : '-';

        tr.innerHTML = `
            <td style="font-family: 'Roboto Mono', monospace;">#${escapeHtml(sub.id)}</td>
            <td style="font-weight: bold;">${escapeHtml(sub.first_name)} ${escapeHtml(sub.last_name)}</td>
            <td style="font-family: 'Roboto Mono', monospace;">#${escapeHtml(sub.external_submission_id)}</td>
            <td style="font-family: 'Roboto Mono', monospace;">${escapeHtml(sub.total_score)}</td>
            <td style="font-family: 'Roboto Mono', monospace;">${dateStr}</td>
            <td style="font-family: 'Roboto Mono', monospace;">${timeStr}</td>
        `;
        tbody.appendChild(tr);
    });
}

export function renderQualityProfile(profile) {
    document.getElementById('compatibility-statement').textContent = profile.compatibilityStatement;
    document.getElementById('stat-acceptance-rate').textContent = `${profile.selectivity.acceptanceRate}%`;
    document.getElementById('stat-selectivity-rank').textContent = profile.selectivity.rank;
    document.getElementById('stat-avg-reviews').textContent = profile.rigor.avgReviewsPerPaper;
    document.getElementById('stat-international-pc').textContent = `${profile.internationalization.internationalPercentage}%`;

    const thematicBody = document.getElementById('thematic-competence-body');
    thematicBody.innerHTML = '';
    profile.thematicCompetence.forEach(topic => {
        const tr = document.createElement('tr');
        const isGap = profile.gapTopics.some(g => g.topic_name === topic.topic_name);
        const expertHtml = isGap
            ? `<span class="text-danger" title="Expertise Gap"><strong>${topic.available_experts} <i class="ph-fill ph-warning"></i></strong></span>`
            : `<span>${topic.available_experts}</span>`;

        tr.innerHTML = `
            <td style="font-family: 'Roboto Mono', monospace;">${topic.topic_name}</td>
            <td style="font-family: 'Roboto Mono', monospace;">${topic.submitted_papers}</td>
            <td style="font-family: 'Roboto Mono', monospace;">${expertHtml}</td>
        `;
        thematicBody.appendChild(tr);
    });

    document.getElementById('international-percentage').textContent = `${profile.internationalization.internationalPercentage}%`;

    let geoBreakdown = `TOTAL PC: ${profile.internationalization.domesticCount + profile.internationalization.internationalCount} | COUNTRIES: ${profile.internationalization.totalCountries}<br>`;
    if (profile.internationalization.domesticCountry !== 'Unknown') {
        geoBreakdown += `DOMESTIC (${profile.internationalization.domesticCountry}): ${profile.internationalization.domesticCount} | INTL: ${profile.internationalization.internationalCount}`;
    }
    document.getElementById('geographic-breakdown').innerHTML = geoBreakdown;
}

export function renderAlerts(alerts, isAnonymized = false) {
    const container = document.getElementById('alerts-list');
    container.innerHTML = '';

    if (alerts.length === 0) {
        container.innerHTML = '<div class="empty-alerts text-muted">No actions required.</div>';
        return;
    }

    alerts.forEach(alert => {
        const card = document.createElement('div');
        card.className = `alert-card ${alert.type}`;
        card.innerHTML = `
            <div class="alert-content">
                <h3 style="font-family: 'Roboto Mono', monospace;">${escapeHtml(alert.title)}</h3>
                <p>${escapeHtml(alert.message)}</p>
            </div>
            <div class="alert-actions">
                <button class="btn btn-outline btn-sm w-full">${escapeHtml(alert.action)}</button>
            </div>
        `;
        const btn = card.querySelector('button');
        btn.addEventListener('click', () => {
            window.applyFilterAndNavigate(alert.target, alert.filterKey, alert.affectedIds ? JSON.stringify(alert.affectedIds) : "[]", alert.title);
        });

        if (alert.emailContext && alert.emailContext.kind === 'coi' && !isAnonymized) {
            const mailBtn = document.createElement('button');
            mailBtn.className = 'btn btn-outline btn-sm w-full';
            mailBtn.innerHTML = '<i class="ph ph-envelope-simple"></i> Draft Email';
            mailBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.openEmailDraftDrawer(alert);
            });
            card.querySelector('.alert-actions').appendChild(mailBtn);
        }

        container.appendChild(card);
    });
}

export function renderStatsAndScorecard(analytics) {
    document.getElementById('stat-papers').textContent = analytics.health.total_papers;
    document.getElementById('stat-reviewers').textContent = analytics.health.total_reviewers;
    document.getElementById('stat-reviews').textContent = analytics.health.total_reviews;
    document.getElementById('stat-mismatches').textContent = analytics.mismatches.totalMismatches;

    if (analytics.scorecard) {
        const scorecardContainer = document.getElementById('quality-scorecard');
        scorecardContainer.innerHTML = '';

        const dimensions = [
            { key: 'coverage', label: 'Review Coverage' },
            { key: 'integrity', label: 'Conflict Integrity' },
            { key: 'satisfaction', label: 'Bidding Satisfaction' },
            { key: 'discussion', label: 'Discussion Health' }
        ];

        dimensions.forEach(dim => {
            const data = analytics.scorecard[dim.key];
            let cssClass = 'danger';
            if (data.score === 100) cssClass = 'perfect';
            else if (data.score >= 80) cssClass = 'good';
            else if (data.score >= 60) cssClass = 'warning';

            const card = document.createElement('div');
            card.className = `scorecard-card ${cssClass}`;
            card.innerHTML = `
                <div class="scorecard-header">
                    <span class="scorecard-title">${escapeHtml(dim.label)}</span>
                    <span class="scorecard-score ${cssClass}">${escapeHtml(data.score)}</span>
                </div>
                <div class="scorecard-deductions">
                    <ul style="list-style-type: none; padding-left: 0;"></ul>
                </div>
            `;
            const ul = card.querySelector('ul');
            if (data.deductions.length > 0) {
                data.deductions.forEach(d => {
                    const li = document.createElement('li');
                    if (typeof d === 'string') {
                        li.textContent = d;
                    } else {
                        li.style.marginBottom = '0.5rem';
                        const a = document.createElement('a');
                        a.href = '#';
                        a.className = 'deduction-link';
                        a.style.color = 'inherit';
                        a.style.textDecoration = 'underline';
                        a.textContent = d.text;
                        a.addEventListener('click', (e) => {
                            e.preventDefault();
                            const idsJson = d.affectedIds ? JSON.stringify(d.affectedIds) : "[]";
                            window.applyFilterAndNavigate(d.target, d.filterKey, idsJson, d.customTitle || '');
                        });
                        li.appendChild(a);
                    }
                    ul.appendChild(li);
                });
            }
            scorecardContainer.appendChild(card);
        });
    }
}

export function renderAwardsTab(data) {
    if (!data) return;

    // TOP 5 REVIEWERS
    const revBody = document.getElementById('top-reviewers-body');
    if (revBody) {
        if (data.topReviewers && data.topReviewers.length > 0) {
            revBody.innerHTML = data.topReviewers.map(r => `
                <tr onclick="openReviewerModal('${r.id}', '${r.first_name} ${r.last_name}')" style="cursor:pointer;">
                    <td style="font-weight: bold;">${r.first_name} ${r.last_name}</td>
                    <td style="font-family: 'Roboto Mono', monospace;">${r.reviews_done}</td>
                    <td style="font-family: 'Roboto Mono', monospace;">${r.avg_word_count}</td>
                    <td style="font-family: 'Roboto Mono', monospace;">${parseFloat(r.calibration_index||0).toFixed(2)}</td>
                </tr>
            `).join('');
        } else {
            revBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No candidate reviewers found</td></tr>';
        }
    }

    // TOP 5 PAPERS
    const papBody = document.getElementById('top-papers-body');
    if (papBody) {
        if (data.topPapers && data.topPapers.length > 0) {
            papBody.innerHTML = data.topPapers.map(p => `
                <tr onclick="openPaperModal('${p.id}')" style="cursor:pointer;">
                    <td style="font-family: 'Roboto Mono', monospace;">${p.id}</td>
                    <td style="font-weight: bold;">${p.title}</td>
                    <td style="font-family: 'Roboto Mono', monospace;">${parseFloat(p.avg_score||0).toFixed(2)}</td>
                    <td style="font-family: 'Roboto Mono', monospace;">${parseFloat(p.spread||0).toFixed(2)}</td>
                </tr>
            `).join('');
        } else {
            papBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No candidate papers found</td></tr>';
        }
    }

    // SESSION CLUSTERS
    const clustersContainer = document.getElementById('session-clusters-container');
    if (clustersContainer) {
        clustersContainer.innerHTML = '';
        if (data.sessionClusters && Object.keys(data.sessionClusters).length > 0) {
            for (const [topic, papers] of Object.entries(data.sessionClusters)) {
                const card = document.createElement('div');
                card.style = 'background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);';

                let paperListHtml = papers.map(p => `
                    <div style="font-size: 0.85rem; padding: 6px 0; border-bottom: 1px solid #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${p.title}">
                        <span style="font-family: 'Roboto Mono', monospace; color: var(--primary); margin-right: 5px;">#${p.id}</span>
                        ${p.title}
                    </div>
                `).join('');

                card.innerHTML = `
                    <h4 style="margin-top: 0; margin-bottom: 10px; color: var(--text-main); font-size: 1rem;">${topic} <span class="badge bg-neutral" style="float: right;">${papers.length}</span></h4>
                    <div style="max-height: 150px; overflow-y: auto;">
                        ${paperListHtml}
                    </div>
                `;
                clustersContainer.appendChild(card);
            }
        } else {
            clustersContainer.innerHTML = '<div class="text-muted" style="grid-column: 1 / -1;">No accepted papers with topics found. Try accepting some papers.</div>';
        }
    }
}
