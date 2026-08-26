import { state } from './state.js';
import { renderPapersTable, renderReviewersTable, renderSubmissionsTable,
         renderQualityProfile, renderAlerts, renderStatsAndScorecard,
         renderAwardsTab } from './tables.js';
import { renderAnalyticsCharts } from './charts.js';
import { renderPresetChips, applyHashToControls } from './papersView.js';
import { PAPERS_DEFAULT } from './viewState.mjs';
import { loadConferences } from './conferences.js';

window.updatePaperDecision = async function(internalId, newDecision) {
    try {
        const res = await fetch(`/api/analytics/papers/${internalId}/decision`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision: newDecision })
        });
        if (res.ok) {
            // Instantly refresh everything
            await loadDashboardData();
        } else {
            console.error("Failed to update decision");
            alert("Failed to update decision. Check console for errors.");
        }
    } catch (err) {
        console.error("Error updating decision", err);
    }
};

export async function loadDashboardData() {
    try {
        document.getElementById('loading-indicator')?.classList.remove('hidden');
        document.getElementById('dashboard-content').classList.add('hidden');

        // Clear any active filters so they don't carry over between conferences
        state.activePaperFilter = null;
        state.activeReviewerFilter = null;
        const pb = document.getElementById('paper-filter-banner');
        if (pb) pb.classList.add('hidden');
        const pt = document.querySelector('#tab-papers h2');
        if (pt) pt.textContent = 'Paper Explorer';
        const rb = document.getElementById('reviewer-filter-banner');
        if (rb) rb.classList.add('hidden');
        const rt = document.querySelector('#tab-reviewers h2');
        if (rt) rt.textContent = 'Reviewer Explorer';

        // Visually clear alerts so the user knows it's updating
        const alertsList = document.getElementById('alerts-list');
        if (alertsList) {
            alertsList.innerHTML = '<div class="text-muted" style="padding: 1rem; text-align: center;"><i class="ph ph-spinner ph-spin"></i> Loading...</div>';
        }

        const qs = state.activeConferenceId ? `?conferenceId=${state.activeConferenceId}` : '';
        const res = await fetch(`/api/analytics/dashboard${qs}`);
        const data = await res.json();

        state.isCurrentAnonymized = !!data.is_anonymized;
        renderAlerts(data.alerts, state.isCurrentAnonymized);

        state.allPapers = data.papers.items || data.papers;
        renderPapersTable(state.allPapers);

        state.allReviewers = data.reviewers.items || data.reviewers;
        renderReviewersTable(state.allReviewers);

        renderStatsAndScorecard(data.systemAnalytics);
        renderAnalyticsCharts(data.systemAnalytics);
        renderQualityProfile(data.qualityProfile);

        const submissions = data.submissions.items || data.submissions;
        renderSubmissionsTable(submissions);

        renderAwardsTab(data.systemAnalytics);

        renderPresetChips();
    } catch (error) {
        console.error("Error loading dashboard data:", error);
    } finally {
        document.getElementById('loading-indicator')?.classList.add('hidden');
        document.getElementById('dashboard-content')?.classList.remove('hidden');
    }
}

window.loadDashboardData = loadDashboardData;

export function activateTabViaClasses(targetId) {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-target') === targetId));
    tabContents.forEach(c => c.classList.toggle('hidden', c.id !== targetId));
}

export async function checkExistingData() {
    const dashboardContent = document.getElementById('dashboard-content');
    const triageSidebar = document.getElementById('triage-sidebar');
    const emptyState = document.getElementById('empty-state');
    try {
        const res = await fetch('/api/analytics/conference-health');
        const health = await res.json();
        if (health && parseInt(health.total_papers) > 0) {
            emptyState.classList.add('hidden');
            dashboardContent.classList.remove('hidden');
            triageSidebar.classList.remove('hidden');
            await loadConferences();
            const restored = applyHashToControls();
            await loadDashboardData();
            if (restored && (restored.filterMode !== PAPERS_DEFAULT.filterMode
                || restored.sortBy !== PAPERS_DEFAULT.sortBy
                || restored.sortOrder !== PAPERS_DEFAULT.sortOrder
                || restored.searchText)) {
                activateTabViaClasses('tab-papers');
                await window.fetchPapers();
            }
        }
    } catch {
        console.log("No existing data found or server offline");
    }
}
