// Reusable header-sort wiring. Clicking a <th data-sort-key> cycles:
//   inert -> ASC -> DESC -> reset-to-default(refresh current fetch)
// and keeps the paired <select> (if present) in sync.

const DEFAULTS = {
    'tab-papers': { sortBy: 'external_submission_id', sortOrder: 'DESC' },
    'tab-reviewers': { sortBy: 'reviewer_id', sortOrder: 'DESC' },
    'tab-submissions': { sortBy: 'review_date', sortOrder: 'DESC' }
};

function getDefault(tabId) {
    return DEFAULTS[tabId] || { sortBy: null, sortOrder: null };
}

function parseSelectValue(select) {
    const v = select?.value || '';
    const li = v.lastIndexOf('_');
    if (li === -1) return { sortBy: v, sortOrder: 'ASC' };
    return { sortBy: v.substring(0, li), sortOrder: v.substring(li + 1).toUpperCase() };
}

function applySelectValue(select, sortBy, sortOrder) {
    const desired = `${sortBy}_${sortOrder.toLowerCase()}`;
    const exists = Array.from(select.options).some(o => o.value === desired);
    if (exists) select.value = desired;
}

function setAria(th, sortBy, sortOrder, isActive) {
    if (!isActive) th.removeAttribute('aria-sort');
    else th.setAttribute('aria-sort', sortOrder === 'ASC' ? 'ascending' : 'descending');
}

function renderIndicators(table, activeKey, activeOrder) {
    table.querySelectorAll('th[data-sort-key]').forEach(th => {
        const key = th.getAttribute('data-sort-key');
        const base = th.getAttribute('data-label') || th.textContent.replace(/[\u25B2\u25BC\u25B4\u25BE]+/g, '').trim();
        if (!th.hasAttribute('data-label')) th.setAttribute('data-label', base);
        const isActive = key === activeKey && activeOrder;
        const arrow = isActive ? (activeOrder === 'ASC' ? ' \u25B2' : ' \u25BC') : '';
        // preserve data-tip and other attrs; just update visible label
        th.childNodes.forEach(() => {}); // no-op, we replace textContent's label part
        // Rebuild: keep data-tip etc, update text
        th.textContent = base + arrow;
        if (isActive) th.classList.add('sort-active');
        else th.classList.remove('sort-active');
        setAria(th, key, activeOrder, isActive);
    });
}

export function attachSortHeaders({ tableSelector, selectId, tabId, fetchFn, defaultSort }) {
    const table = document.querySelector(tableSelector);
    const select = document.getElementById(selectId);
    if (!table) return;

    const defSort = defaultSort || getDefault(tabId);

    function currentSort() {
        if (select) return parseSelectValue(select);
        return { ...defSort };
    }

    function syncIndicators() {
        const cur = currentSort();
        renderIndicators(table, cur.sortBy, cur.sortOrder);
    }

    // keep indicators in sync when select changes externally (presets, hash restore)
    select?.addEventListener('change', syncIndicators);

    table.querySelectorAll('th[data-sort-key]').forEach(th => {
        th.style.cursor = 'pointer';
        th.title = th.getAttribute('data-tip') || th.title || '';
        th.addEventListener('click', () => {
            const key = th.getAttribute('data-sort-key');
            const cur = currentSort();
            let nextBy, nextOrder;

            if (cur.sortBy !== key) {
                nextBy = key;
                nextOrder = 'ASC';
            } else if (cur.sortOrder === 'ASC') {
                nextBy = key;
                nextOrder = 'DESC';
            } else {
                // reset to default
                nextBy = defSort.sortBy;
                nextOrder = defSort.sortOrder;
            }

            if (select) applySelectValue(select, nextBy, nextOrder);
            // for reviewer/submission views where sort state isn't only in papers hash,
            // we still drive via the select's change handler + direct fetch
            renderIndicators(table, nextBy, nextOrder);
            if (typeof fetchFn === 'function') fetchFn();
            else select?.dispatchEvent(new Event('change', { bubbles: true }));
        });
    });

    // initial render
    syncIndicators();
}
