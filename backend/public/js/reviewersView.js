import { state } from './state.js';

window.handleReviewerSearch = function() {
    if (state.allReviewers) window.renderReviewersTable(state.allReviewers);
};

window.fetchReviewers = async function() {
    const sortVal = document.getElementById('reviewer-sort')?.value || 'avg_word_count_desc';
    const lastUnderscore = sortVal.lastIndexOf('_');
    const sortBy = sortVal.substring(0, lastUnderscore);
    const sortOrder = sortVal.substring(lastUnderscore + 1).toUpperCase();
    const filterMode = document.getElementById('reviewer-filter')?.value || 'all';
    const cidParam = state.activeConferenceId ? `&conferenceId=${state.activeConferenceId}` : '';
    try {
        const res = await fetch(`/api/analytics/reviewers?sortBy=${sortBy}&sortOrder=${sortOrder}&filterMode=${filterMode}&limit=2000${cidParam}`);
        const data = await res.json();
        state.allReviewers = data.items || data;
        window.renderReviewersTable(state.allReviewers);
    } catch (e) {
        console.error(e);
    }
};
