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
        list.classList.toggle('hidden');
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
