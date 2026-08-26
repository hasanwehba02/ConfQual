import { state } from './state.js';
import { loadDashboardData } from './dashboardView.js';

export function wireSettingsView() {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsDrawer = document.getElementById('settings-drawer');
    const closeSettingsDrawer = document.getElementById('close-settings-drawer');
    const settingsForm = document.getElementById('settings-form');
    const isAnonymizedCheckbox = document.getElementById('isAnonymized');
    const decisionEditingEnabledCheckbox = document.getElementById('decisionEditingEnabled');

    if (settingsBtn) {
        settingsBtn.addEventListener('click', async () => {
            // Fetch current settings
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
            settingsDrawer.classList.add('open');
            settingsDrawer.classList.remove('closed');
        });
    }

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
