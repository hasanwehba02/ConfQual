// Multi-select filter menus: a toggle button plus checkbox list.
// Replaces the former single-select dropdowns so several criteria can be combined.

function getMenu(id) {
    return document.getElementById(id);
}

export function getSelectedFilters(menuId) {
    const menu = getMenu(menuId);
    if (!menu) return [];
    return Array.from(menu.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
}

export function setSelectedFilters(menuId, values) {
    const menu = getMenu(menuId);
    if (!menu) return;
    const wanted = Array.isArray(values) ? values : String(values || '').split(',').filter(Boolean);
    menu.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = wanted.includes(cb.value);
    });
    updateLabel(menuId);
}

function updateLabel(menuId) {
    const menu = getMenu(menuId);
    if (!menu) return;
    const btn = menu.querySelector('.multiselect-toggle');
    if (!btn) return;
    const selected = getSelectedFilters(menuId);
    if (selected.length === 0) {
        btn.textContent = btn.dataset.allLabel || 'Filter: All';
        btn.classList.remove('active-filter');
    } else if (selected.length === 1) {
        const cb = menu.querySelector(`input[value="${selected[0]}"]`);
        const label = cb ? cb.parentElement.textContent.trim() : selected[0];
        btn.textContent = label;
        btn.classList.add('active-filter');
    } else {
        btn.textContent = `Filter: ${selected.length} criteria`;
        btn.classList.add('active-filter');
    }
}

export function wireFilterMenu(menuId, onChange) {
    const menu = getMenu(menuId);
    if (!menu) return;
    const btn = menu.querySelector('.multiselect-toggle');
    const list = menu.querySelector('.multiselect-list');

    // "Clear all" action row at the top of the list
    if (list && !list.querySelector('.multiselect-clear')) {
        const clearRow = document.createElement('div');
        clearRow.className = 'multiselect-clear';
        clearRow.textContent = '✕ Clear all';
        clearRow.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
            updateLabel(menuId);
            if (typeof onChange === 'function') onChange(getSelectedFilters(menuId));
        });
        list.prepend(clearRow);
    }

    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.multiselect-list').forEach(el => {
            if (el !== list) el.classList.add('hidden');
        });
        const willOpen = list.classList.contains('hidden');
        list.classList.toggle('hidden');
        if (willOpen) refreshFilterLabels();
    });

    menu.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            updateLabel(menuId);
            if (typeof onChange === 'function') onChange(getSelectedFilters(menuId));
        });
    });

    updateLabel(menuId);
}

export function closeAllFilterMenus(exceptMenuId = null) {
    document.querySelectorAll('.multiselect-list').forEach(el => {
        const menu = el.closest('.multiselect');
        if (!exceptMenuId || !menu || menu.id !== exceptMenuId) el.classList.add('hidden');
    });
}

document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    if (!e.target.closest('.multiselect')) closeAllFilterMenus();
});

// Live threshold labels: fetch alert rules and rewrite filter labels with current values.
// Until loaded, labels stay generic (no numbers).
import { state } from './state.js';

const ruleLabelMap = {
    'paper-filter': {
        high_variance: { key: 'paper.high_spread_min', fmt: v => `High Spread (> ${v})` },
        unanimous_reject: { key: 'paper.unanimous_reject_avg', fmt: v => `Unanimous Rejects (Avg <= ${v})` },
        unanimous_accept: { key: 'paper.unanimous_accept_avg', fmt: v => `Unanimous Accepts (Avg >= ${v})` },
        borderline: { keys: ['paper.borderline_low', 'paper.borderline_high'], fmt: (a, b) => `Borderline (${a} to ${b})` },
        to_discuss: null, // composite, skip
    },
    'reviewer-filter': {
        high_variance: { key: 'reviewer.high_calibration_abs', fmt: v => `High Calibration Variance (|deviation| > ${v})` },
    }
};

const labelCache = new Map();

export async function refreshFilterLabels(conferenceId) {
    const cid = conferenceId ?? state.activeConferenceId;
    if (!cid) return;
    if (labelCache.get(cid)) return; // already populated for this conference
    try {
        const res = await fetch(`/api/analytics/alert-rules?conferenceId=${cid}`);
        if (!res.ok) return;
        const rules = await res.json();
        const byKey = Object.fromEntries(rules.map(r => [r.key, r.value]));
        for (const [menuId, map] of Object.entries(ruleLabelMap)) {
            const menu = getMenu(menuId);
            if (!menu) continue;
            for (const [filterVal, cfg] of Object.entries(map)) {
                if (!cfg) continue;
                const cb = menu.querySelector(`input[value="${filterVal}"]`);
                if (!cb) continue;
                const labelEl = cb.parentElement;
                if (cfg.keys) {
                    const a = byKey[cfg.keys[0]], b = byKey[cfg.keys[1]];
                    if (a !== undefined && b !== undefined) labelEl.lastChild.textContent = ' ' + cfg.fmt(a, b);
                } else if (byKey[cfg.key] !== undefined) {
                    labelEl.lastChild.textContent = ' ' + cfg.fmt(byKey[cfg.key]);
                }
            }
        }
        labelCache.set(cid, true);
    } catch { /* keep generic labels */ }
}

export function invalidateFilterLabels() { labelCache.clear(); }
