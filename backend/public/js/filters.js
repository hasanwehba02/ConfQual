import { state } from './state.js';

export function switchToTab(targetId) {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.add('hidden'));
    const targetBtn = document.querySelector(`[data-target='${targetId}']`);
    if (targetBtn) targetBtn.classList.add('active');
    const targetDiv = document.getElementById(targetId);
    if (targetDiv) targetDiv.classList.remove('hidden');
}

export function applyFilterAndNavigate(targetTabId, filterKey, idsJson, customTitle) {
    const ids = JSON.parse(idsJson).map(id => parseInt(id, 10));

    switchToTab(targetTabId);

    if (filterKey === 'paper') {
        state.activePaperFilter = ids;
        window.renderPapersTable(state.allPapers);
        const banner = document.getElementById('paper-filter-banner');
        if (banner) {
            banner.classList.remove('hidden');
            document.getElementById('paper-filter-count').textContent = ids.length;
        }
        if (customTitle) {
            const titleEl = document.querySelector('#tab-papers h2');
            if (titleEl) titleEl.textContent = customTitle;
        }
    } else if (filterKey === 'reviewer') {
        state.activeReviewerFilter = ids;
        window.renderReviewersTable(state.allReviewers);
        const banner = document.getElementById('reviewer-filter-banner');
        if (banner) {
            banner.classList.remove('hidden');
            document.getElementById('reviewer-filter-count').textContent = ids.length;
        }
        if (customTitle) {
            const titleEl = document.querySelector('#tab-reviewers h2');
            if (titleEl) titleEl.textContent = customTitle;
        }
    }
};

export function clearFilters(type) {
    if (type === 'paper') {
        state.activePaperFilter = null;
        window.renderPapersTable(state.allPapers);
        const banner = document.getElementById('paper-filter-banner');
        if (banner) banner.classList.add('hidden');
        const titleEl = document.querySelector('#tab-papers h2');
        if (titleEl) titleEl.textContent = 'Paper Explorer';
    } else if (type === 'reviewer') {
        state.activeReviewerFilter = null;
        window.renderReviewersTable(state.allReviewers);
        const banner = document.getElementById('reviewer-filter-banner');
        if (banner) banner.classList.add('hidden');
        const titleEl = document.querySelector('#tab-reviewers h2');
        if (titleEl) titleEl.textContent = 'Reviewer Explorer';
    }
}

// Generated onclick strings in rendered tables dispatch via window
window.applyFilterAndNavigate = applyFilterAndNavigate;
window.clearFilters = clearFilters;
