import { state } from './state.js';
import { loadDashboardData } from './dashboardView.js';

export function wireSettingsView() {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsDrawer = document.getElementById('settings-drawer');
    const closeSettingsDrawer = document.getElementById('close-settings-drawer');
    const settingsForm = document.getElementById('settings-form');
    const isAnonymizedCheckbox = document.getElementById('isAnonymized');
    const decisionEditingEnabledCheckbox = document.getElementById('decisionEditingEnabled');

    async function loadThresholds() {
        const cid = state.activeConferenceId;
        const list = document.getElementById('alert-thresholds-list');
        if (!list) return;
        list.innerHTML = '<span class="text-muted">Loading…</span>';
        try {
            const qs = cid ? `?conferenceId=${cid}` : '';
            const res = await fetch(`/api/analytics/alert-rules${qs}`);
            if (!res.ok) throw new Error('Failed to load thresholds');
            const rules = await res.json();
            list.innerHTML = '';
            for (const r of rules) {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:8px;';
                row.innerHTML = `<label style="flex:1;font-size:0.85rem;" title="${r.key} (default ${r.default})">${r.label}</label>
                    <input type="number" step="0.1" data-key="${r.key}" value="${r.value}" style="width:90px;padding:4px;border:1px solid #ccc;border-radius:4px;">
                    <input type="checkbox" data-enabled="${r.key}" ${r.enabled ? 'checked' : ''} title="Enabled">`;
                list.appendChild(row);
            }
        } catch (e) {
            list.innerHTML = `<span class="text-danger">${e.message}</span>`;
        }
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', async () => {
            try {
                const response = await fetch('/api/settings');
                if (response.ok) {
                    const settings = await response.json();
                    isAnonymizedCheckbox.checked = settings.is_anonymized;
                    decisionEditingEnabledCheckbox.checked = settings.decision_editing_enabled;
                }
            } catch (e) {
                console.error("Error fetching settings:", e);
            }
            await loadThresholds();
            settingsDrawer.classList.add('open');
            settingsDrawer.classList.remove('closed');
        });
    }

    document.getElementById('save-thresholds')?.addEventListener('click', async () => {
        const cid = state.activeConferenceId;
        if (!cid) { alert('Select a conference first'); return; }
        const list = document.getElementById('alert-thresholds-list');
        const rules = Array.from(list.querySelectorAll('input[data-key]')).map(inp => ({
            key: inp.getAttribute('data-key'),
            value: inp.value,
            enabled: !!list.querySelector(`input[data-enabled="${inp.getAttribute('data-key')}"]`)?.checked
        }));
        const res = await fetch(`/api/analytics/alert-rules?conferenceId=${cid}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rules })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.error || 'Failed to save thresholds');
        } else {
            const { invalidateFilterLabels } = await import('./filterMenu.js');
            invalidateFilterLabels();
            await loadDashboardData();
        }
    });
    document.getElementById('reset-thresholds')?.addEventListener('click', async () => {
        const cid = state.activeConferenceId;
        if (!cid) return;
        const list = document.getElementById('alert-thresholds-list');
        for (const inp of list.querySelectorAll('input[data-key]')) {
            inp.value = inp.title ? inp.value : inp.value; // keep current; server reset via defaults fetch
        }
        // Re-fetch defaults by clearing and reloading with server defaults
        const res = await fetch(`/api/analytics/alert-rules?conferenceId=${cid}`);
        if (res.ok) {
            const rules = await res.json();
            for (const r of rules) {
                const inp = list.querySelector(`input[data-key="${r.key}"]`);
                if (inp) inp.value = r.default;
                const chk = list.querySelector(`input[data-enabled="${r.key}"]`);
                if (chk) chk.checked = true;
            }
        }
    });

    if (closeSettingsDrawer) {
        closeSettingsDrawer.addEventListener('click', () => {
            settingsDrawer.classList.remove('open');
            settingsDrawer.classList.add('closed');
        });
    }

    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitSettingsBtn = document.getElementById('submit-settings');
            submitSettingsBtn.textContent = 'SAVING...';
            submitSettingsBtn.disabled = true;

            try {
                const res = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        is_anonymized: isAnonymizedCheckbox.checked,

                        decision_editing_enabled: decisionEditingEnabledCheckbox.checked
                    })
                });

                if (res.ok) {
                    state.isCurrentAnonymized = isAnonymizedCheckbox.checked;
                    settingsDrawer.classList.remove('open');
                    settingsDrawer.classList.add('closed');
                    // Reload data to reflect new settings
                    await loadDashboardData();
                } else {
                    alert('Failed to save settings.');
                }
            } catch (error) {
                console.error(error);
                alert('An error occurred while saving settings.');
            } finally {
                submitSettingsBtn.textContent = 'SAVE SETTINGS';
                submitSettingsBtn.disabled = false;
            }
        });
    }
}
