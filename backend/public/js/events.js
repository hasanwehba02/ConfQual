import { clearFilters } from './filters.js';
import { loadComparisonTab } from './comparisonView.js';

export function wireEvents() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const uploadBtn = document.getElementById('upload-btn');
    const uploadDrawer = document.getElementById('upload-drawer');
    const closeUploadDrawer = document.getElementById('close-upload-drawer');
    const resetBtn = document.getElementById('reset-btn');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.add('hidden'));

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.remove('hidden');

            if (targetId === 'tab-papers') {
                window.clearFilters('paper');
            } else if (targetId === 'tab-reviewers') {
                window.clearFilters('reviewer');
            } else if (targetId === 'tab-comparison') {
                loadComparisonTab();
            }
        });
    });

    uploadBtn.addEventListener('click', () => {
        uploadDrawer.classList.add('open');
        uploadDrawer.classList.remove('closed');
    });

    closeUploadDrawer.addEventListener('click', () => {
        uploadDrawer.classList.remove('open');
        uploadDrawer.classList.add('closed');
    });

    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            if (confirm("Are you sure you want to clear all conference data? This cannot be undone.")) {
                try {
                    const res = await fetch('/api/analytics/reset', { method: 'POST' });
                    if (res.ok) {
                        window.location.reload();
                    } else {
                        alert("Failed to reset data.");
                    }
                } catch {
                    alert("Error resetting data.");
                }
            }
        });
    }

    document.getElementById('papers-export-btn')?.addEventListener('click', () => window.exportTableToCSV('papers-table-body', 'papers_export.csv'));
    document.getElementById('reviewers-export-btn')?.addEventListener('click', () => window.exportTableToCSV('reviewers-table-body', 'reviewers_export.csv'));
    document.getElementById('submissions-export-btn')?.addEventListener('click', () => window.exportTableToCSV('submissions-table-body', 'submissions_export.csv'));
    document.getElementById('analytics-export-btn')?.addEventListener('click', () => window.exportAnalyticsSummary());

    document.getElementById('paper-search')?.addEventListener('keyup', () => window.handlePaperSearch());
    document.getElementById('paper-sort')?.addEventListener('change', () => window.fetchPapers());
    document.getElementById('paper-filter')?.addEventListener('change', () => window.fetchPapers());
    document.getElementById('paper-clear-filter')?.addEventListener('click', () => window.clearFilters('paper'));

    document.getElementById('reviewer-search')?.addEventListener('keyup', () => window.handleReviewerSearch());
    document.getElementById('reviewer-sort')?.addEventListener('change', () => window.fetchReviewers());
    document.getElementById('reviewer-filter')?.addEventListener('change', () => window.fetchReviewers());
    document.getElementById('reviewer-clear-filter')?.addEventListener('click', () => window.clearFilters('reviewer'));

    document.getElementById('submission-sort')?.addEventListener('change', () => window.fetchSubmissions());
    document.getElementById('submission-filter')?.addEventListener('change', () => window.fetchSubmissions());
}

// Re-exported so main.js can reference the shared helper without duplicating imports.
export { clearFilters };
