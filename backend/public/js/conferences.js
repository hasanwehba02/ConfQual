import { fetchConferences, deleteConference, updateConference } from './api.js';
import { state } from './state.js';
import { switchToTab } from './filters.js';

const ACTIVE_CONF_STORAGE_KEY = 'confqual.activeConferenceId';

export function currentConferenceLabel() {
    const c = state.loadedConferences.find(x => x.id == state.activeConferenceId);
    return c ? [c.short_name || c.name, c.year].filter(Boolean).join(" '") : '';
}

export async function loadConferences() {
    try {
        const conferences = await fetchConferences();
        state.loadedConferences = conferences;
        const nameSpan = document.getElementById('conference-active-name');
        const wrapper = document.getElementById('conference-selector-wrapper');
        if (!nameSpan || !wrapper) return;

        if (conferences.length === 0) {
            wrapper.style.display = 'none';
            state.activeConferenceId = null;
            return;
        }

        // Restore last selection from a previous session, else default to most recent
        if (!state.activeConferenceId) {
            const stored = window.localStorage.getItem(ACTIVE_CONF_STORAGE_KEY);
            if (stored && conferences.find(c => c.id == stored)) {
                state.activeConferenceId = isNaN(Number(stored)) ? stored : Number(stored);
            }
        }

        if (!state.activeConferenceId || !conferences.find(c => c.id == state.activeConferenceId)) {
            state.activeConferenceId = conferences[0].id;
        }
        window.localStorage.setItem(ACTIVE_CONF_STORAGE_KEY, String(state.activeConferenceId));

        const activeConf = conferences.find(c => c.id == state.activeConferenceId);
        if (activeConf) {
            const label = [activeConf.short_name || activeConf.name, activeConf.year].filter(Boolean).join(' \'');
            nameSpan.textContent = label;
            wrapper.style.display = 'flex';
        }
    } catch (e) {
        console.error('Failed to load conferences:', e);
    }
}

window.selectConference = async function(id) {
    state.activeConferenceId = id;
    window.localStorage.setItem(ACTIVE_CONF_STORAGE_KEY, String(id));
    await loadConferences(); // Refresh the top bar label
    // Switch to analytics view
    switchToTab('tab-analytics');
    await window.loadDashboardData();
};

// --- Edit Conference Drawer ---
const editConferenceDrawer = document.getElementById('edit-conference-drawer');

window.openEditConferenceDrawer = function(id, name, shortName, year) {
    document.getElementById('edit-conf-id').value = id;
    document.getElementById('edit-conf-name').value = name;
    document.getElementById('edit-conf-short-name').value = shortName;
    document.getElementById('edit-conf-year').value = year;
    editConferenceDrawer.classList.remove('closed');
    editConferenceDrawer.classList.add('open');
};

window.closeEditConferenceDrawer = function() {
    editConferenceDrawer.classList.remove('open');
    editConferenceDrawer.classList.add('closed');
};

export function wireEditConferenceDrawer() {
    const closeEditDrawerBtn = document.getElementById('close-edit-drawer');
    const editConferenceForm = document.getElementById('edit-conference-form');
    const deleteConferenceBtn = document.getElementById('delete-conference-btn');

    closeEditDrawerBtn?.addEventListener('click', window.closeEditConferenceDrawer);

    editConferenceForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-conf-id').value;
        const name = document.getElementById('edit-conf-name').value.trim();
        const shortName = document.getElementById('edit-conf-short-name').value.trim();
        const year = document.getElementById('edit-conf-year').value.trim();

        try {
            await updateConference(id, { name, shortName, year });
            window.closeEditConferenceDrawer();
            await loadConferences();
            await window.loadDashboardData();
            window.loadComparisonTab();
        } catch (error) {
            console.error('Error updating conference:', error);
            alert('Failed to update conference.');
        }
    });

    deleteConferenceBtn?.addEventListener('click', async () => {
        const id = document.getElementById('edit-conf-id').value;
        if (!confirm('Delete this conference and all its data? This cannot be undone.')) return;
        try {
            await deleteConference(id);
            window.closeEditConferenceDrawer();
            await loadConferences();
            if (String(state.activeConferenceId) === String(id)) {
                state.activeConferenceId = null;
                window.localStorage.removeItem(ACTIVE_CONF_STORAGE_KEY);
            }
            await window.loadDashboardData();
            window.loadComparisonTab();
        } catch (error) {
            console.error('Error deleting conference:', error);
            alert('Failed to delete conference.');
        }
    });
}
