import { state } from './state.js';
import { getSelectedFilters } from './filterMenu.js';

function filterParams() {
    const modes = getSelectedFilters('submission-filter');
    return modes.length > 0
        ? modes.map(m => `&filterMode=${encodeURIComponent(m)}`).join('')
        : '&filterMode=all';
}

window.fetchSubmissions = async function() {
    const sortVal = document.getElementById('submission-sort')?.value || 'review_date_desc';
    const lastUnderscore = sortVal.lastIndexOf('_');
    const sortBy = sortVal.substring(0, lastUnderscore);
    const sortOrder = sortVal.substring(lastUnderscore + 1).toUpperCase();
    const cidParam = state.activeConferenceId ? `&conferenceId=${state.activeConferenceId}` : '';
    try {
        const res = await fetch(`/api/analytics/submissions?sortBy=${sortBy}&sortOrder=${sortOrder}${filterParams()}&limit=2000${cidParam}`);
        const data = await res.json();
        const submissions = data.items || data;
        window.renderSubmissionsTable(submissions);
    } catch (e) {
        console.error(e);
    }
};
