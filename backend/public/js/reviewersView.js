import { state } from './state.js';
import { getSelectedFilters } from './filterMenu.js';

function filterParams() {
    const modes = getSelectedFilters('reviewer-filter');
    return modes.length > 0
        ? modes.map(m => `&filterMode=${encodeURIComponent(m)}`).join('')
        : '&filterMode=all';
}

window.fetchReviewers = async function() {
    const sortVal = document.getElementById('reviewer-sort')?.value || 'avg_word_count_desc';
    const lastUnderscore = sortVal.lastIndexOf('_');
    const sortBy = sortVal.substring(0, lastUnderscore);
    const sortOrder = sortVal.substring(lastUnderscore + 1).toUpperCase();
    const cidParam = state.activeConferenceId ? `&conferenceId=${state.activeConferenceId}` : '';
    try {
        const res = await fetch(`/api/analytics/reviewers?sortBy=${sortBy}&sortOrder=${sortOrder}${filterParams()}&limit=2000${cidParam}`);
        const data = await res.json();
        const reviewers = data.items || data;
        window.renderReviewersTable(reviewers);
    } catch (e) {
        console.error(e);
    }
};
