import { escapeHtml } from './utils.js';
import { state } from './state.js';
import { buildEmailDraft } from './emailDrafts.mjs';

export function draftFieldsHtml(draft) {
    const to = draft.to || '';
    const subject = draft.subject || '';
    const body = draft.body || '';
    const longBody = body.length > 1800;
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}`
        + (longBody ? '' : `&body=${encodeURIComponent(body)}`);
    return `
        <label style="display:block;font-size:12px;margin-bottom:4px;">To</label>
        <input id="email-draft-to" value="${escapeHtml(to)}" style="width:100%;padding:6px;margin-bottom:10px;">
        <label style="display:block;font-size:12px;margin-bottom:4px;">Subject</label>
        <input id="email-draft-subject" value="${escapeHtml(subject)}" style="width:100%;padding:6px;margin-bottom:10px;">
        <label style="display:block;font-size:12px;margin-bottom:4px;">Body</label>
        <textarea id="email-draft-body" rows="14" style="width:100%;padding:8px;font-family:inherit;">${escapeHtml(body)}</textarea>
        ${longBody ? '<p class="text-muted" style="font-size:12px;">Body exceeds mailto length limits — "Open in Mail" prefills To/Subject only; paste the body from your clipboard.</p>' : ''}
        <div style="display:flex;gap:8px;margin-top:12px;">
            <button type="button" id="email-copy-btn" class="btn btn-outline" style="flex:1;">Copy to Clipboard</button>
            <a id="email-mail-btn" href="${mailto}" class="btn btn-outline" style="flex:1;text-align:center;text-decoration:none;">Open in Mail <i class="ph ph-arrow-up-right"></i></a>
        </div>`;
}

export function bindDraftCopyHandler() {
    function updateMailto() {
        const to = document.getElementById('email-draft-to')?.value || '';
        const subject = document.getElementById('email-draft-subject')?.value || '';
        const body = document.getElementById('email-draft-body')?.value || '';
        const mailBtn = document.getElementById('email-mail-btn');
        if (mailBtn) {
            const longBody = body.length > 1800;
            mailBtn.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}`
                + (longBody ? '' : `&body=${encodeURIComponent(body)}`);
        }
    }

    document.getElementById('email-draft-to')?.addEventListener('input', updateMailto);
    document.getElementById('email-draft-subject')?.addEventListener('input', updateMailto);
    document.getElementById('email-draft-body')?.addEventListener('input', updateMailto);

    document.getElementById('email-copy-btn')?.addEventListener('click', async (e) => {
        const subject = document.getElementById('email-draft-subject')?.value || '';
        const body = document.getElementById('email-draft-body')?.value || '';
        const text = subject ? (subject + '\n\n' + body) : body;
        const btn = e.currentTarget;
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const ta = document.getElementById('email-draft-body');
            if (ta) {
                ta.select();
                document.execCommand('copy');
            }
        }
        btn.textContent = 'Copied ✓';
        setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 1500);
    });
}

function currentConferenceLabel() {
    const c = state.loadedConferences.find(x => x.id == state.activeConferenceId);
    return c ? [c.short_name || c.name, c.year].filter(Boolean).join(" '") : '';
}

window.openPaperModal = async function(externalId) {
    const detailDrawer = document.getElementById('detail-drawer');
    const isAnonymizedCheckbox = document.getElementById('isAnonymized');
    detailDrawer.classList.add('open');
    detailDrawer.classList.remove('closed');

    const drawerTitle = document.getElementById('detail-drawer-title');
    const drawerBody = document.getElementById('detail-drawer-body');

    drawerTitle.textContent = `PAPER #${externalId}`;
    drawerBody.innerHTML = '<div class="spinner"></div>';

    try {
        const qs = state.activeConferenceId ? `?conferenceId=${state.activeConferenceId}` : '';
        const res = await fetch(`/api/analytics/papers/${externalId}${qs}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const paper = await res.json();

        let mismatchCount = 0;
        if (paper.reviews && paper.reviews.length > 0) {
            const stopWords = new Set(['and', 'the', 'for', 'with', 'from', 'based', 'system', 'systems', 'science', 'engineering']);
            const extractWords = (str) => {
                if (!str) return [];
                return str.toLowerCase()
                          .replace(/[^a-z0-9]/g, ' ')
                          .split(/\s+/)
                          .filter(w => w.length > 2 && !stopWords.has(w));
            };

            const checkMismatch = (pTopics, rTopics) => {
                if (!pTopics || !rTopics) return false;
                const pArr = pTopics.split(', ').map(t => t.trim().toLowerCase());
                const rArr = rTopics.split(', ').map(t => t.trim().toLowerCase());
                if (pArr.some(pt => rArr.includes(pt))) return false;

                const pWords = extractWords(pTopics);
                const rWords = extractWords(rTopics);
                return !pWords.some(pw => rWords.includes(pw));
            };

            paper.reviews.forEach(r => {
                r.isMismatch = checkMismatch(paper.topics, r.topics);
                if (r.isMismatch) mismatchCount++;
            });

            paper.reviews.sort((a, b) => {
                if (a.isMismatch && !b.isMismatch) return -1;
                if (!a.isMismatch && b.isMismatch) return 1;
                return 0;
            });
        }

        const mismatchBadgeHtml = mismatchCount > 0
            ? `<span style="background: #e63946; color: white; font-size: 0.75rem; padding: 4px 8px; border-radius: 4px; font-weight: bold;">${mismatchCount} MISMATCHED REVIEW(S)</span>`
            : '';

        const submittedReviewers = (paper.reviews || []).filter(r => r.reviewer_id && (r.first_name || r.last_name));
        const showDraftPaperBtn = !state.isCurrentAnonymized && !(isAnonymizedCheckbox && isAnonymizedCheckbox.checked) && submittedReviewers.length > 0;
        const draftPaperBtnHtml = showDraftPaperBtn ? `
            <button id="paper-draft-email-btn" class="btn btn-outline btn-sm" style="display: flex; align-items: center; gap: 0.35rem;">
                <i class="ph ph-envelope-simple"></i> Draft Email
            </button>
        ` : '';

        let html = `
            <h3 style="font-family: 'Inter', sans-serif; display: flex; align-items: center; justify-content: space-between;">
                <span>${escapeHtml(paper.title)}</span>
                ${mismatchBadgeHtml}
            </h3>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.75rem;">
                <p style="font-family: 'Roboto Mono', monospace; font-size: 0.85rem; margin: 0; color: var(--text-muted);">
                    <strong>PAPER TOPICS:</strong> ${escapeHtml(paper.topics) || 'None'}
                </p>
                ${draftPaperBtnHtml}
            </div>

            <h3>REVIEWS (${paper.reviews ? paper.reviews.length : 0})</h3>
            <div class="detail-list">
        `;

        if (paper.reviews && paper.reviews.length > 0) {
            paper.reviews.forEach(r => {
                const mismatchBadge = r.isMismatch
                    ? `<span style="background: #e63946; color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 8px;">MISMATCH</span>`
                    : '';

                html += `
                    <div class="detail-item" style="${r.isMismatch ? 'border-left: 3px solid #e63946;' : ''}">
                        <div class="detail-item-header">
                            <span>${escapeHtml(r.first_name) || ''} ${escapeHtml(r.last_name) || r.id} ${mismatchBadge}</span>
                            <span>SCORE: ${r.total_score}</span>
                        </div>
                        <div class="detail-text" style="font-family: 'Roboto Mono', monospace; font-size: 0.75rem; margin-bottom: 0.5rem;">
                            <strong>REVIEWER EXPERTISE:</strong> ${escapeHtml(r.topics) || 'None'}
                        </div>
                        <div class="detail-text">${escapeHtml(r.review_text) || 'No review text'}</div>
                    </div>
                `;
            });
        } else {
            html += '<p class="text-muted">No reviews found.</p>';
        }

        html += `</div><h3>COMMENTS (${paper.comments ? paper.comments.length : 0})</h3><div class="detail-list">`;

        if (paper.comments && paper.comments.length > 0) {
            paper.comments.forEach(c => {
                html += `
                    <div class="detail-item">
                        <div class="detail-item-header">${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</div>
                        <div class="detail-text">${escapeHtml(c.comment_text)}</div>
                    </div>
                `;
            });
        } else {
            html += '<p class="text-muted">No comments found.</p>';
        }

        html += '</div>';
        drawerBody.innerHTML = html;

        const paperDraftBtn = drawerBody.querySelector('#paper-draft-email-btn');
        if (paperDraftBtn) {
            paperDraftBtn.addEventListener('click', () => {
                const reviews = paper.reviews || [];
                const scores = reviews.map(r => r.total_score).filter(s => s != null && !isNaN(s));
                const scoreSpread = scores.length > 1 ? (Math.max(...scores) - Math.min(...scores)) : 0;
                const commentsCount = (paper.comments || []).length;
                const hasMetaReview = Boolean(paper.has_metareview);

                let initialReason = 'expertise_mismatch';
                if (scoreSpread > 2 && commentsCount === 0) {
                    initialReason = 'silent_debate';
                } else if (!hasMetaReview) {
                    initialReason = 'missing_metareview';
                } else if (scoreSpread > 2 && reviews.some(r => r.total_score <= 1)) {
                    initialReason = 'sentiment_mismatch';
                }

                function renderPaperDraftView(reason, recipientIdx) {
                    const r = submittedReviewers[recipientIdx] || submittedReviewers[0];
                    const rEmail = r.email || (r.first_name ? `${r.first_name.toLowerCase()}.${(r.last_name || '').toLowerCase()}@example.com` : '');
                    const base = {
                        recipientName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Reviewer',
                        recipientEmail: rEmail,
                        paperId: paper.external_submission_id || paper.id,
                        paperTitle: paper.title,
                        conferenceLabel: currentConferenceLabel(),
                    };
                    let draftCtx = base;
                    if (reason === 'silent_debate') draftCtx = { ...base, spread: scoreSpread };
                    else if (reason === 'missing_metareview') draftCtx = { ...base, scoreSpread };
                    else if (reason === 'expertise_mismatch') draftCtx = { ...base, paperTopics: paper.topics, reviewerTopics: r.topics };
                    else if (reason === 'sentiment_mismatch') draftCtx = { ...base, totalScore: r.total_score, sentimentScore: null };
                    else if (reason === 'custom') draftCtx = base;

                    const draft = buildEmailDraft(reason, draftCtx);

                    const reasonOptions = `
                        <option value="silent_debate" ${reason === 'silent_debate' ? 'selected' : ''}>Discussion needed (silent debate)</option>
                        <option value="missing_metareview" ${reason === 'missing_metareview' ? 'selected' : ''}>Metareview needed</option>
                        <option value="sentiment_mismatch" ${reason === 'sentiment_mismatch' ? 'selected' : ''}>Review calibration check</option>
                        <option value="expertise_mismatch" ${reason === 'expertise_mismatch' ? 'selected' : ''}>Topic alignment check</option>
                        <option value="custom" ${reason === 'custom' ? 'selected' : ''}>Custom message</option>
                    `;

                    const recipientOptions = submittedReviewers.map((rec, i) =>
                        `<option value="${i}" ${i === recipientIdx ? 'selected' : ''}>${escapeHtml(rec.first_name)} ${escapeHtml(rec.last_name)}${rec.email ? ` (${escapeHtml(rec.email)})` : ''}</option>`
                    ).join('');

                    drawerBody.innerHTML = `
                        <div style="margin-bottom: 14px;">
                            <button type="button" id="draft-back-to-paper-btn" class="btn btn-outline btn-sm">
                                <i class="ph ph-arrow-left"></i> Back to Paper
                            </button>
                        </div>
                        <label style="display:block;font-size:12px;margin-bottom:4px;">Reason</label>
                        <select id="drawer-draft-reason-select" style="width:100%;padding:6px;margin-bottom:12px;">${reasonOptions}</select>
                        <label style="display:block;font-size:12px;margin-bottom:4px;">Recipient</label>
                        <select id="drawer-draft-recipient-select" style="width:100%;padding:6px;margin-bottom:12px;">${recipientOptions}</select>
                        <div id="drawer-draft-fields-container">
                            ${draftFieldsHtml(draft)}
                        </div>
                    `;

                    bindDraftCopyHandler();

                    document.getElementById('draft-back-to-paper-btn')?.addEventListener('click', () => {
                        window.openPaperModal(externalId);
                    });

                    document.getElementById('drawer-draft-reason-select')?.addEventListener('change', (e) => {
                        const curRec = parseInt(document.getElementById('drawer-draft-recipient-select')?.value || '0', 10);
                        renderPaperDraftView(e.target.value, curRec);
                    });

                    document.getElementById('drawer-draft-recipient-select')?.addEventListener('change', (e) => {
                        const curReason = document.getElementById('drawer-draft-reason-select')?.value || initialReason;
                        renderPaperDraftView(curReason, parseInt(e.target.value, 10));
                    });
                }

                renderPaperDraftView(initialReason, 0);
            });
        }
    } catch {
        drawerBody.innerHTML = '<p class="text-danger">Failed to load paper details.</p>';
    }
};

window.openReviewerModal = async function(reviewerId, name) {
    const detailDrawer = document.getElementById('detail-drawer');
    const isAnonymizedCheckbox = document.getElementById('isAnonymized');
    detailDrawer.classList.add('open');
    detailDrawer.classList.remove('closed');

    const drawerTitle = document.getElementById('detail-drawer-title');
    const drawerBody = document.getElementById('detail-drawer-body');

    drawerTitle.textContent = `REVIEWER: ${name}`;
    drawerBody.innerHTML = '<div class="spinner"></div>';

    try {
        const res = await fetch(`/api/analytics/reviewers/${reviewerId}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const rev = await res.json();

        let html = `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-light); flex-wrap: wrap; gap: 0.75rem;">
                <div>
                    <p style="font-family: 'Roboto Mono', monospace; font-size: 0.85rem; margin-bottom: 0.25rem;"><strong>ROLE:</strong> ${escapeHtml(rev.role)}</p>
                    <p style="font-family: 'Roboto Mono', monospace; font-size: 0.85rem; margin: 0;"><strong>EMAIL:</strong> ${escapeHtml(rev.email) || 'N/A'}</p>
                </div>
                <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                    <label style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; cursor: pointer; user-select: none; color: var(--text-muted);">
                        <input type="checkbox" id="report-include-text" style="cursor: pointer;">
                        <span>Include review text</span>
                    </label>
                    <button id="export-pdf-btn" class="btn btn-outline btn-sm" style="display: flex; align-items: center; gap: 0.35rem;">
                        <i class="ph ph-file-pdf"></i> Export Reviewer Card
                    </button>
                    ${!state.isCurrentAnonymized && !(isAnonymizedCheckbox && isAnonymizedCheckbox.checked) ? `<button id="reviewer-draft-email-btn" class="btn btn-outline btn-sm" style="display: flex; align-items: center; gap: 0.35rem;"><i class="ph ph-envelope-simple"></i> Draft Email</button>` : ''}
                </div>
            </div>

            <h3>PAPER ASSIGNMENTS (${rev.assignments ? rev.assignments.length : 0})</h3>
            <div class="detail-list">
        `;

        if (rev.assignments && rev.assignments.length > 0) {
            rev.assignments.forEach(a => {
                let commentsHtml = '';
                if (a.comments && a.comments.length > 0) {
                    let validComments = a.comments.filter(c => c !== null && c.trim() !== '');
                    if (validComments.length > 0) {
                        commentsHtml = `<div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed var(--border-light);">`;
                        validComments.forEach(c => {
                            commentsHtml += `<div class="detail-text" style="font-size: 0.8rem; font-style: italic; color: var(--text-muted); margin-bottom: 0.25rem;">💬 "${escapeHtml(c)}"</div>`;
                        });
                        commentsHtml += `</div>`;
                    } else if (a.comments.includes(null)) {
                        commentsHtml = `<div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed var(--border-light);">`;
                        commentsHtml += `<div class="detail-text" style="font-size: 0.8rem; font-style: italic; color: var(--text-muted); margin-bottom: 0.25rem;">💬 <em>[Comment text redacted in dataset]</em></div>`;
                        commentsHtml += `</div>`;
                    }
                }

                html += `
                    <div class="detail-item">
                        <div class="detail-item-header">
                            <span>#${a.external_submission_id}</span>
                            <span>GIVEN: ${a.given_score ?? 'PENDING'} | PAPER AVG: ${a.peer_average ? parseFloat(a.peer_average).toFixed(2) : '-'}</span>
                        </div>
                        <div class="detail-text" style="margin-bottom: 0.5rem;">${escapeHtml(a.title)}</div>
                        <div class="detail-text" style="font-family: 'Roboto Mono', monospace; font-size: 0.75rem;">
                            <strong>BID STATUS:</strong> ${a.bid_status ?? 'NO BID'}
                        </div>
                        ${a.review_text ? `<div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border-light); font-size: 0.85rem;"><strong>Review:</strong><br/>${escapeHtml(a.review_text).replace(/\n/g, '<br/>')}</div>` : ''}
                        ${commentsHtml}
                    </div>
                `;
            });
        } else {
            html += '<p class="text-muted">No assignments found.</p>';
        }

        html += `</div>`;

        html += `<h3>SUBMITTED BIDS (${rev.bids ? rev.bids.length : 0})</h3>`;
        html += `<div class="detail-list" style="margin-top: 1rem;">`;

        if (rev.bids && rev.bids.length > 0) {
            // Highlight 'yes' or 'maybe' bids differently from 'no' or 'conflict'
            rev.bids.sort((a, b) => {
                const order = { 'yes': 1, 'maybe': 2, 'no': 3, 'conflict': 4 };
                return (order[a.bid.toLowerCase()] || 5) - (order[b.bid.toLowerCase()] || 5);
            });

            rev.bids.forEach(b => {
                let bidColor = 'var(--text-muted)';
                if (b.bid.toLowerCase() === 'yes') bidColor = '#4caf50';
                if (b.bid.toLowerCase() === 'maybe') bidColor = '#ff9800';
                if (b.bid.toLowerCase() === 'no') bidColor = '#e63946';

                html += `
                    <div class="detail-item" style="padding: 0.75rem;">
                        <div class="detail-item-header" style="margin-bottom: 0.25rem;">
                            <span>#${b.external_submission_id}</span>
                            <span style="color: ${bidColor}; font-weight: bold; text-transform: uppercase;">${b.bid}</span>
                        </div>
                        <div class="detail-text" style="font-size: 0.8rem;">${escapeHtml(b.title)}</div>
                    </div>
                `;
            });
        } else {
            html += '<p class="text-muted" style="margin-bottom: 2rem;">No bids recorded for this reviewer.</p>';
        }
        html += '</div>';
        drawerBody.innerHTML = html;

        const exportBtn = drawerBody.querySelector('#export-pdf-btn');
        const includeTextCb = drawerBody.querySelector('#report-include-text');
        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                exportBtn.disabled = true;
                const origHtml = exportBtn.innerHTML;
                exportBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Exporting...';
                try {
                    const inc = includeTextCb && includeTextCb.checked ? '1' : '';
                    const a = document.createElement('a');
                    a.href = `/api/analytics/reviewers/${reviewerId}/report?includeReviewText=${inc}`;
                    a.download = '';
                    a.rel = 'noopener';
                    a.target = '_blank';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                } catch (err) {
                    console.error('Error exporting PDF report:', err);
                    alert('Failed to export PDF report. Please try again.');
                } finally {
                    exportBtn.disabled = false;
                    exportBtn.innerHTML = origHtml;
                }
            });
        }

        const reviewerDraftBtn = drawerBody.querySelector('#reviewer-draft-email-btn');
        if (reviewerDraftBtn) {
            reviewerDraftBtn.addEventListener('click', () => {
                const kind = (rev.avg_word_count != null && rev.avg_word_count < 60) ? 'low_effort' : 'reviewer_followup';
                const reviewerFullName = `${rev.first_name || ''} ${rev.last_name || ''}`.trim() || name || 'Reviewer';
                const draft = buildEmailDraft(kind, {
                    recipientName: reviewerFullName,
                    recipientEmail: rev.email || '',
                    avgWordCount: rev.avg_word_count,
                    conferenceLabel: currentConferenceLabel(),
                });

                drawerBody.innerHTML = `
                    <div style="margin-bottom: 14px;">
                        <button type="button" id="draft-back-to-reviewer-btn" class="btn btn-outline btn-sm">
                            <i class="ph ph-arrow-left"></i> Back to Reviewer
                        </button>
                    </div>
                    ${draftFieldsHtml(draft)}
                `;
                bindDraftCopyHandler();
                document.getElementById('draft-back-to-reviewer-btn')?.addEventListener('click', () => {
                    window.openReviewerModal(reviewerId, name);
                });
            });
        }
    } catch {
        drawerBody.innerHTML = '<p class="text-danger">Failed to load reviewer details.</p>';
    }
};

export function closeDetailDrawer() {
    const detailDrawer = document.getElementById('detail-drawer');
    detailDrawer.classList.remove('open');
    detailDrawer.classList.add('closed');
}

export function wireDetailDrawerClose() {
    document.getElementById('close-detail-drawer').addEventListener('click', closeDetailDrawer);
}

function renderEmailDraftInDrawer(alert, recipientIndex) {
    const ctx = alert.emailContext;
    const r = ctx.recipients[recipientIndex];
    const draft = buildEmailDraft(ctx.kind, {
        recipientName: r.name,
        recipientEmail: r.email,
        paperId: ctx.paperIds ? ctx.paperIds[0] : undefined,
        paperTitle: ctx.paperTitle,
        avgWordCount: ctx.avgWordCount,
        conferenceLabel: currentConferenceLabel(),
    });

    const drawerBody = document.getElementById('detail-drawer-body');
    const options = ctx.recipients.map((rec, i) =>
        `<option value="${i}" ${i === recipientIndex ? 'selected' : ''}>${escapeHtml(rec.name)}</option>`).join('');
    const omitted = ctx.omittedCount ? `<option disabled>… +${ctx.omittedCount} more not shown</option>` : '';

    drawerBody.innerHTML = `
        ${ctx.recipients.length > 1 || ctx.omittedCount ? `<label style="display:block;font-size:12px;margin-bottom:4px;">Recipient</label>
        <select id="email-recipient-select" style="width:100%;padding:6px;margin-bottom:12px;">${options}${omitted}</select>` : ''}
        ${draftFieldsHtml(draft)}`;

    bindDraftCopyHandler();

    document.getElementById('email-recipient-select')?.addEventListener('change', (e) => {
        renderEmailDraftInDrawer(alert, parseInt(e.target.value, 10));
    });
}

function paperKeyedDraftContext(kind, paper, r) {
    const base = {
        recipientName: r.name,
        recipientEmail: r.email,
        paperId: paper.id,
        paperTitle: paper.title,
        conferenceLabel: currentConferenceLabel(),
    };
    if (kind === 'silent_debate') return { ...base, spread: paper.spread };
    if (kind === 'missing_metareview') return { ...base, scoreSpread: paper.scoreSpread };
    if (kind === 'expertise_mismatch') return { ...base, paperTopics: r.paperTopics, reviewerTopics: r.reviewerTopics };
    if (kind === 'sentiment_mismatch') return { ...base, totalScore: r.totalScore, sentimentScore: r.sentimentScore };
    return base;
}

function renderPaperKeyedDraftInDrawer(alert, paperIndex, recipientIndex) {
    const ctx = alert.emailContext;
    const paper = ctx.papers[paperIndex];
    if (!paper || paper.recipients.length === 0) return;
    const rIdx = Math.min(recipientIndex, paper.recipients.length - 1);
    const r = paper.recipients[rIdx];
    const draft = buildEmailDraft(ctx.kind, paperKeyedDraftContext(ctx.kind, paper, r));

    const drawerBody = document.getElementById('detail-drawer-body');
    const paperOptions = ctx.papers.map((p, i) =>
        `<option value="${i}" ${i === paperIndex ? 'selected' : ''}>#${p.id} — ${escapeHtml(p.title)}</option>`).join('');
    const papersNote = ctx.omittedPaperCount ? `<option disabled>… +${ctx.omittedPaperCount} more not shown</option>` : '';
    const recOptions = paper.recipients.map((rec, i) =>
        `<option value="${i}" ${i === rIdx ? 'selected' : ''}>${escapeHtml(rec.name)}</option>`).join('');

    drawerBody.innerHTML = `
        ${ctx.papers.length > 1 || ctx.omittedPaperCount ? `<label style="display:block;font-size:12px;margin-bottom:4px;">Paper</label>
        <select id="email-paper-select" style="width:100%;padding:6px;margin-bottom:12px;">${paperOptions}${papersNote}</select>` : ''}
        ${paper.recipients.length > 1 ? `<label style="display:block;font-size:12px;margin-bottom:4px;">Recipient</label>
        <select id="email-recipient-select" style="width:100%;padding:6px;margin-bottom:12px;">${recOptions}</select>` : ''}
        ${draftFieldsHtml(draft)}`;

    bindDraftCopyHandler();

    document.getElementById('email-paper-select')?.addEventListener('change', (e) => {
        renderPaperKeyedDraftInDrawer(alert, parseInt(e.target.value, 10), 0);
    });
    document.getElementById('email-recipient-select')?.addEventListener('change', (e) => {
        renderPaperKeyedDraftInDrawer(alert, paperIndex, parseInt(e.target.value, 10));
    });
}

window.openEmailDraftDrawer = function(alert) {
    const detailDrawer = document.getElementById('detail-drawer');
    detailDrawer.classList.add('open');
    detailDrawer.classList.remove('closed');
    document.getElementById('detail-drawer-title').textContent = `DRAFT EMAIL — ${alert.title.toUpperCase()}`;
    if (Array.isArray(alert.emailContext.papers)) {
        renderPaperKeyedDraftInDrawer(alert, 0, 0);
    } else {
        renderEmailDraftInDrawer(alert, 0);
    }
};
