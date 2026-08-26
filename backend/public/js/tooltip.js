// Fast custom tooltip: shows after a short delay on any element with [data-tip].
// Native title="" tooltips take ~1s to appear; this is near-instant.
const SHOW_DELAY_MS = 120;

let tipEl = null;
let showTimer = null;
let currentTarget = null;

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
    if (text !== undefined && el.textContent !== text) {
        el.textContent = text;
        // Measure after content set; temporarily invisible only when content changed
        const prevOpacity = el.style.opacity;
        el.style.opacity = '0';
        placeAt(el, x, y);
        el.style.opacity = prevOpacity;
    } else {
        placeAt(el, x, y);
    }
}

function placeAt(el, x, y) {
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

function hideTip() {
    clearTimeout(showTimer);
    currentTarget = null;
    if (tipEl) tipEl.style.opacity = '0';
}

document.addEventListener('mouseover', (e) => {
    const target = findTipTarget(e.target);
    if (!target) return;
    // Same target already pending/visible: don't restart the delay
    if (target === currentTarget) return;
    clearTimeout(showTimer);
    const text = target.getAttribute('data-tip');
    if (!text) return;
    currentTarget = target;
    showTimer = setTimeout(() => {
        positionTip(e.clientX, e.clientY, text);
        ensureTip().style.opacity = '1';
    }, SHOW_DELAY_MS);
});

document.addEventListener('mouseout', (e) => {
    const target = findTipTarget(e.target);
    if (!target) return;
    // Ignore micro mouseouts that stay inside the same data-tip element
    if (e.relatedTarget && target.contains(e.relatedTarget)) return;
    if (findTipTarget(e.relatedTarget) === target) return;
    hideTip();
});

document.addEventListener('mousemove', (e) => {
    const el = tipEl;
    if (el && el.style.opacity === '1') {
        positionTip(e.clientX, e.clientY, el.textContent);
    }
}, { passive: true });
