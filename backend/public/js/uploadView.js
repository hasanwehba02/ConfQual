import { loadConferences } from './conferences.js';
import { loadDashboardData } from './dashboardView.js';

function updateDropZoneText() {
    const fileInput = document.getElementById('excelFile');
    const dropZone = document.getElementById('drop-zone');
    if (fileInput.files.length > 0) {
        const fileName = fileInput.files[0].name;
        dropZone.querySelector('p').textContent = `SELECTED: ${fileName}`;
    }
}

export function wireUploadView() {
    const uploadDrawer = document.getElementById('upload-drawer');
    const uploadForm = document.getElementById('upload-form');
    const fileInput = document.getElementById('excelFile');
    const dropZone = document.getElementById('drop-zone');
    const loadingState = document.getElementById('loading-state');
    const submitBtn = document.getElementById('submit-upload');

    // Global Drag and Drop Auto-import
    let dragCounter = 0;
    const globalDragOverlay = document.getElementById('global-drag-overlay');

    document.body.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        if (globalDragOverlay) globalDragOverlay.classList.remove('hidden');
    });

    document.body.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    document.body.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            if (globalDragOverlay) globalDragOverlay.classList.add('hidden');
        }
    });

    document.body.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        if (globalDragOverlay) globalDragOverlay.classList.add('hidden');

        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            updateDropZoneText();
            // Open the upload drawer so the user can name the conference
            setTimeout(() => {
                console.log("Opening upload drawer from drop event...");
                uploadDrawer.classList.remove('closed');
                uploadDrawer.classList.add('open');
            }, 50);
        }
    });

    document.getElementById('browse-btn')?.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', updateDropZoneText);

    // Upload Submission
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (fileInput.files.length === 0) return;

        const confName = document.getElementById('conf-name')?.value.trim();
        const confShortName = document.getElementById('conf-short-name')?.value.trim();
        const confYear = document.getElementById('conf-year')?.value.trim();

        if (!confName) {
            document.getElementById('conf-name')?.focus();
            return;
        }

        const formData = new FormData();
        formData.append('excelFile', fileInput.files[0]);
        if (confName) formData.append('conferenceName', confName);
        if (confShortName) formData.append('conferenceShortName', confShortName);
        if (confYear) formData.append('conferenceYear', confYear);

        submitBtn.classList.add('hidden');
        dropZone.classList.add('hidden');
        loadingState.classList.remove('hidden');
        const globalLoadingOverlay = document.getElementById('global-loading-overlay');
        if (globalLoadingOverlay) globalLoadingOverlay.classList.remove('hidden');

        try {
            const response = await fetch('/api/analytics/process-conference', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || 'Upload failed');
            }

            uploadDrawer.classList.remove('open');
            uploadDrawer.classList.add('closed');
            document.getElementById('empty-state').classList.add('hidden');
            document.getElementById('dashboard-content').classList.remove('hidden');
            document.getElementById('triage-sidebar').classList.remove('hidden');

            // Refresh conference list and reload with newest conference
            await loadConferences();
            await loadDashboardData();

        } catch (error) {
            alert(error.message || "An error occurred during processing. Please try again.");
            console.error(error);
        } finally {
            submitBtn.classList.remove('hidden');
            dropZone.classList.remove('hidden');
            loadingState.classList.add('hidden');
            const globalLoadingOverlay = document.getElementById('global-loading-overlay');
            if (globalLoadingOverlay) globalLoadingOverlay.classList.add('hidden');
            uploadForm.reset();
            dropZone.querySelector('p').textContent = 'DRAG & DROP .XLSX HERE';
            // Clear conference metadata fields
            const confNameEl = document.getElementById('conf-name');
            const confShortEl = document.getElementById('conf-short-name');
            const confYearEl = document.getElementById('conf-year');
            if (confNameEl) confNameEl.value = '';
            if (confShortEl) confShortEl.value = '';
            if (confYearEl) confYearEl.value = '';
        }
    });
}
