// Fast custom tooltip: shows after a short delay on any element with [data-tip].
// Native title="" tooltips take ~1s to appear; this is near-instant.
const SHOW_DELAY_MS = 120;

let tipEl = null;
let showTimer = null;

function ensureTip() {
    if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.id = 'app-tooltip';
        tipEl.style.cssText = [
            'position: fixed',
            'z-index: 9999',
            'max-width: 320px',
            'padding: 6px 10px',
            'background: #1e293b',
            'color: #f8fafc',
            'font-size: 0.78rem',
            'line-height: 1.35',
            'border-radius: 6px',
            'box-shadow: 0 4px 12px rgba(0,0,0,0.25)',
            'pointer-events: none',
            'opacity: 0',
            'transition: opacity 80ms ease-in',
            'white-space: pre-line'
        ].join(';');
        document.body.appendChild(tipEl);
    }
    return tipEl;
}

function positionTip(x, y, text) {
    const el = ensureTip();
    el.textContent = text;
    el.style.opacity = '0';
    // Measure after content set
    const pad = 12;
    let left = x + pad;
    let top = y + pad;
    const rect = el.getBoundingClientRect();
    if (left + rect.width > window.innerWidth - 8) left = x - rect.width - pad;
    if (top + rect.height > window.innerHeight - 8) top = y - rect.height - pad;
    el.style.left = `${Math.max(4, left)}px`;
    el.style.top = `${Math.max(4, top)}px`;
}

function findTipTarget(target) {
    return target instanceof Element ? target.closest('[data-tip]') : null;
}

document.addEventListener('mouseover', (e) => {
    const target = findTipTarget(e.target);
    if (!target) return;
    clearTimeout(showTimer);
    const text = target.getAttribute('data-tip');
    if (!text) return;
    showTimer = setTimeout(() => {
        positionTip(e.clientX, e.clientY, text);
        ensureTip().style.opacity = '1';
    }, SHOW_DELAY_MS);
});

document.addEventListener('mouseout', (e) => {
    if (findTipTarget(e.target)) {
        clearTimeout(showTimer);
        const el = ensureTip();
        el.style.opacity = '0';
    }
});

document.addEventListener('mousemove', (e) => {
    const el = tipEl;
    if (el && el.style.opacity === '1') {
        positionTip(e.clientX, e.clientY, el.textContent);
    }
}, { passive: true });
