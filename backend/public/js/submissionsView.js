import { state } from './state.js';

window.fetchSubmissions = async function() {
    const sortVal = document.getElementById('submission-sort')?.value || 'review_date_desc';
    const lastUnderscore = sortVal.lastIndexOf('_');
    const sortBy = sortVal.substring(0, lastUnderscore);
    const sortOrder = sortVal.substring(lastUnderscore + 1).toUpperCase();
    const filterMode = document.getElementById('submission-filter')?.value || 'all';
    const cidParam = state.activeConferenceId ? `&conferenceId=${state.activeConferenceId}` : '';
    try {
        const res = await fetch(`/api/analytics/submissions?sortBy=${sortBy}&sortOrder=${sortOrder}&filterMode=${filterMode}&limit=2000${cidParam}`);
        const data = await res.json();
        const submissions = data.items || data;
        window.renderSubmissionsTable(submissions);
    } catch (e) {
        console.error(e);
    }
};
