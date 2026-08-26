import { escapeHtml } from './utils.js';
import { state } from './state.js';
import { createPreset, createPresetStore, encodePapersHash, parsePapersHash,
         resolveActiveConferenceId, sanitizePapersState } from './viewState.mjs';
import { getSelectedFilters, setSelectedFilters } from './filterMenu.js';

const presetStore = createPresetStore(window.localStorage);

function getPaperFilterModes() {
    const selected = getSelectedFilters('paper-filter');
    return selected.length > 0 ? selected : ['all'];
}

export function readPaperControls() {
    const sortVal = document.getElementById('paper-sort')?.value || 'external_submission_id_desc';
    const li = sortVal.lastIndexOf('_');
    return {
        sortBy: sortVal.substring(0, li),
        sortOrder: sortVal.substring(li + 1).toUpperCase(),
        filterMode: getPaperFilterModes().join(','),
        searchText: document.getElementById('paper-search')?.value || '',
        conferenceId: state.activeConferenceId,
    };
}

function writePapersHash() {
    history.replaceState(null, '', encodePapersHash(readPaperControls()));
}

export function applyHashToControls() {
    const raw = parsePapersHash(location.hash);
    if (!raw) return null;
    const sortSelect = document.getElementById('paper-sort');
    const restored = sanitizePapersState(raw, {
        filterModes: Array.from(document.querySelectorAll('#paper-filter input[type="checkbox"]')).map(cb => cb.value),
        sortFields: Array.from(sortSelect.options)
            .map(o => o.value.substring(0, o.value.lastIndexOf('_'))),
        conferenceIds: state.loadedConferences.map(c => c.id),
    });
    // Note: conferenceId is intentionally NOT restored from the hash —
    // the persisted selection (localStorage) is authoritative across reloads,
    // otherwise a stale hash silently switches back to an old conference.
    const combined = `${restored.sortBy}_${restored.sortOrder.toLowerCase()}`;
    if (Array.from(sortSelect.options).some(o => o.value === combined)) sortSelect.value = combined;
    setSelectedFilters('paper-filter', restored.filterMode === 'all' ? [] : restored.filterMode.split(','));
    const searchInput = document.getElementById('paper-search');
    if (searchInput) searchInput.value = restored.searchText;
    return restored;
}

export function renderPresetChips() {
    const row = document.getElementById('paper-presets-row');
    const saveBtn = document.getElementById('save-preset-btn');
    if (!row || !saveBtn) return;
    const confId = resolveActiveConferenceId(state.loadedConferences, state.activeConferenceId);
    const presets = confId == null ? [] : presetStore.getPresets(confId);
    saveBtn.disabled = confId == null;
    row.innerHTML = '';
    row.classList.toggle('hidden', presets.length === 0);
    presets.forEach(p => {
        const chip = document.createElement('span');
        chip.className = 'preset-chip';
        chip.innerHTML = `<span class="preset-name" title="Click to apply, double-click to rename">${escapeHtml(p.name)}</span><button type="button" class="preset-delete" title="Delete view">&times;</button>`;
        const nameEl = chip.querySelector('.preset-name');
        nameEl.addEventListener('click', () => applyPreset(p));
        nameEl.addEventListener('dblclick', () => startRenamePreset(chip, p, nameEl, confId));
        chip.querySelector('.preset-delete').addEventListener('click', () => {
            presetStore.deletePreset(confId, p.id);
            renderPresetChips();
        });
        row.appendChild(chip);
    });
}

function applyPreset(p) {
    const sortSelect = document.getElementById('paper-sort');
    const combined = `${p.sortBy}_${p.sortOrder.toLowerCase()}`;
    if (Array.from(sortSelect.options).some(o => o.value === combined)) sortSelect.value = combined;
    setSelectedFilters('paper-filter', p.filterMode);
    state.activePaperFilter = null;
    document.getElementById('paper-filter-banner')?.classList.add('hidden');
    const titleEl = document.querySelector('#tab-papers h2');
    if (titleEl) titleEl.textContent = 'Paper Explorer';
    window.fetchPapers();
}

function startRenamePreset(chip, preset, nameEl, confId) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'preset-rename';
    input.maxLength = 60;
    input.value = preset.name;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const commit = (save) => {
        if (done) return;
        done = true;
        if (save && input.value.trim()) presetStore.renamePreset(confId, preset.id, input.value.trim());
        renderPresetChips();
    };
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit(true);
        else if (e.key === 'Escape') commit(false);
    });
    input.addEventListener('blur', () => commit(true));
}

function closeSavePopover() {
    const savePopover = document.getElementById('save-preset-popover');
    const presetNameInput = document.getElementById('preset-name-input');
    savePopover?.classList.add('hidden');
    if (presetNameInput) presetNameInput.value = '';
}

export function wireSavePresetPopover() {
    const savePresetBtn = document.getElementById('save-preset-btn');
    const savePopover = document.getElementById('save-preset-popover');
    const presetNameInput = document.getElementById('preset-name-input');

    if (!(savePresetBtn && savePopover && presetNameInput)) return;

    savePresetBtn.addEventListener('click', () => {
        savePopover.classList.toggle('hidden');
        if (!savePopover.classList.contains('hidden')) presetNameInput.focus();
    });
    const confirmSave = () => {
        const name = presetNameInput.value.trim();
        if (!name) { presetNameInput.focus(); return; }
        const confId = resolveActiveConferenceId(state.loadedConferences, state.activeConferenceId);
        if (confId == null) { closeSavePopover(); return; }
        const { filterMode, sortBy, sortOrder } = readPaperControls();
        const preset = createPreset({ name, filterMode, sortBy, sortOrder });
        try {
            presetStore.savePreset(confId, preset);
            closeSavePopover();
            renderPresetChips();
        } catch (e) {
            console.warn('Could not save preset (storage unavailable?):', e);
            alert('Could not save this view — browser storage is full or blocked.');
        }
    };
    document.getElementById('preset-save-confirm')?.addEventListener('click', confirmSave);
    document.getElementById('preset-cancel')?.addEventListener('click', closeSavePopover);
    presetNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmSave();
        else if (e.key === 'Escape') closeSavePopover();
    });
    document.addEventListener('click', (e) => {
        if (!savePopover.classList.contains('hidden')
            && !savePopover.contains(e.target) && e.target !== savePresetBtn
            && !savePresetBtn.contains(e.target)) closeSavePopover();
    });
}

let paperSearchDebounce;
window.handlePaperSearch = function() {
    if (state.allPapers) window.renderPapersTable(state.allPapers);
    clearTimeout(paperSearchDebounce);
    paperSearchDebounce = setTimeout(writePapersHash, 300);
};

window.fetchPapers = async function() {
    const { sortBy, sortOrder, filterMode, searchText, conferenceId } = readPaperControls();
    history.replaceState(null, '', encodePapersHash({ sortBy, sortOrder, filterMode, searchText, conferenceId }));
    const cidParam = conferenceId ? `&conferenceId=${conferenceId}` : '';
    const filterParams = filterMode.split(',').filter(Boolean)
        .map(m => `&filterMode=${encodeURIComponent(m)}`).join('');
    try {
        const res = await fetch(`/api/analytics/papers?sortBy=${sortBy}&sortOrder=${sortOrder}${filterParams}&limit=2000${cidParam}`);
        const data = await res.json();
        state.allPapers = data.items || data;
        window.renderPapersTable(state.allPapers);
    } catch (e) {
        console.error(e);
    }
};
