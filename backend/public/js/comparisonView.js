import { fetchComparison } from './api.js';
import { escapeHtml } from './utils.js';
import { renderComparisonCharts } from './charts.js';

export async function loadComparisonTab() {
    const tbody = document.getElementById('comparison-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="11" class="text-muted" style="text-align:center;padding:2rem"><div class="spinner" style="margin:auto"></div></td></tr>';

    try {
        const data = await fetchComparison();
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-muted" style="text-align:center;padding:2rem">No conference data loaded yet. Upload your first dataset to get started.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map((c, index) => {
            const accRate = c.total_papers > 0 ? ((c.accepted_papers / c.total_papers) * 100).toFixed(1) : 'N/A';
            const uploadedAt = c.uploaded_at ? new Date(c.uploaded_at).toLocaleDateString() : '-';
            return `
                <tr>
                    <td><strong>${escapeHtml(c.name || '')}</strong>${c.short_name ? ` <span class="text-muted">(${escapeHtml(c.short_name)})</span>` : ''}</td>
                    <td>${c.year || '-'}</td>
                    <td>${c.total_papers ?? '-'}</td>
                    <td>${c.accepted_papers ?? '-'}</td>
                    <td>${accRate !== 'N/A' ? accRate + '%' : 'N/A'}</td>
                    <td>${c.total_reviewers ?? '-'}</td>
                    <td>${c.total_reviews ?? '-'}</td>
                    <td>${c.avg_review_score != null ? parseFloat(c.avg_review_score).toFixed(2) : '-'}</td>
                    <td>${c.avg_word_count != null ? Math.round(c.avg_word_count) : '-'}</td>
                    <td>${uploadedAt}</td>
                    <td>
                        <button class="btn btn-outline btn-sm" style="font-size:0.7rem;padding:2px 8px;" data-action="view" data-index="${index}">View</button>
                        <button class="btn btn-outline btn-sm" style="font-size:0.7rem;padding:2px 8px;color:var(--text-muted);" data-action="edit" data-index="${index}">Edit</button>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.onclick = event => {
            const button = event.target.closest('button[data-action][data-index]');
            if (!button || !tbody.contains(button)) return;
            const conference = data[Number(button.dataset.index)];
            if (!conference) return;
            if (button.dataset.action === 'view') window.selectConference(conference.id);
            if (button.dataset.action === 'edit') {
                window.openEditConferenceDrawer(conference.id, conference.name || '', conference.short_name || '', conference.year || '');
            }
        };

        // Render comparison charts
        renderComparisonCharts(data);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-danger" style="text-align:center;padding:2rem">Failed to load comparison data.</td></tr>`;
        console.error(e);
    }
};

window.loadComparisonTab = loadComparisonTab;
