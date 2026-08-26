// Thin entry point: wires all modules together.
import './state.js';
import './csvExport.js';
import './filters.js';
import './drawers.js';
import './tables.js';
import './papersView.js';
import './reviewersView.js';
import './submissionsView.js';
import './conferences.js';
import './comparisonView.js';
import './dashboardView.js';
import './projector.js';
import './tooltip.js';

import { wireDetailDrawerClose } from './drawers.js';
import { wireSavePresetPopover } from './papersView.js';
import { wireEditConferenceDrawer } from './conferences.js';
import { wireUploadView } from './uploadView.js';
import { wireSettingsView } from './settingsView.js';
import { wireProjectorModalClose } from './projector.js';
import { wireEvents } from './events.js';
import { checkExistingData } from './dashboardView.js';

window.onerror = function(message, source, lineno, colno, error) {
    fetch('/api/analytics/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'error', message, lineno, colno, stack: error ? error.stack : '' })
    });
};
window.addEventListener('unhandledrejection', function(event) {
    fetch('/api/analytics/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'unhandledrejection', message: event.reason ? event.reason.message : 'Unknown' })
    });
});

document.addEventListener('DOMContentLoaded', () => {
    wireEvents();
    wireUploadView();
    wireSettingsView();
    wireDetailDrawerClose();
    wireSavePresetPopover();
    wireEditConferenceDrawer();
    wireProjectorModalClose();

    checkExistingData();
});
