/* One reading-size preference for every page, including restored/offline articles. */
(function initSharedTypography() {
    'use strict';
    if (window.GlobalFontScale?.version === 1 && window.GlobalFontScale.documentRoot === document.documentElement) {
        window.GlobalFontScale.refresh();
        return;
    }

    const STORAGE_KEY = 'tamanho-fonte-global';
    const DEFAULT_SIZE = 16;
    const MIN_SIZE = 16;
    const MAX_SIZE = 30;
    const root = document.documentElement;
    let currentSize = DEFAULT_SIZE;

    function validNumber(value) {
        if (value == null || String(value).trim() === '') return null;
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : null;
    }

    function clamp(value) {
        const number = validNumber(value);
        return number === null ? DEFAULT_SIZE : Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(number)));
    }

    function readPreference(migrateLegacy) {
        try {
            const saved = validNumber(localStorage.getItem(STORAGE_KEY));
            if (saved !== null) return clamp(saved);
            // Only migrate on startup. Removing the global preference resets its size.
            if (migrateLegacy) {
                const legacy = validNumber(localStorage.getItem('jwpub-font'));
                if (legacy !== null) return clamp(legacy);
            }
            return DEFAULT_SIZE;
        } catch (error) {
            return currentSize;
        }
    }

    function persist(size) {
        try {
            if (localStorage.getItem(STORAGE_KEY) !== String(size)) {
                localStorage.setItem(STORAGE_KEY, String(size));
            }
        } catch (error) { /* The control still works for this page if storage is unavailable. */ }
    }

    function apply(size, announce = true) {
        const nextSize = clamp(size);
        const changed = nextSize !== currentSize;
        currentSize = nextSize;
        const properties = {
            '--tamanho-fonte': `${nextSize}px`,
            '--font-base-default': String(DEFAULT_SIZE),
            '--font-base-global': `${nextSize}px`,
            '--font-scale-global': String(nextSize / DEFAULT_SIZE),
            '--read-size': `${nextSize}px`
        };
        Object.entries(properties).forEach(([name, value]) => {
            if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
        });
        root.dataset.fontSizeGlobal = String(nextSize);
        root.classList.toggle('large-reading-text', nextSize >= 25);
        if (announce) window.dispatchEvent(new CustomEvent('globalfont:changed', {
            detail: { size: nextSize, scale: nextSize / DEFAULT_SIZE }
        }));
        // Existing navigation and reader overlays measure their position on resize.
        if (changed) requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        return nextSize;
    }

    window.GlobalFontScale = {
        version: 1,
        documentRoot: root,
        storageKey: STORAGE_KEY,
        defaultSize: DEFAULT_SIZE,
        minSize: MIN_SIZE,
        maxSize: MAX_SIZE,
        clamp,
        getSize: () => currentSize,
        setSize(size) {
            const nextSize = clamp(size);
            persist(nextSize);
            return apply(nextSize);
        },
        reset() { return this.setSize(DEFAULT_SIZE); },
        refresh() { return apply(readPreference(false)); }
    };

    const initialSize = readPreference(true);
    persist(initialSize);
    apply(initialSize, false);
    window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY || event.key === null) apply(readPreference(false));
    });
    window.addEventListener('pageshow', () => window.GlobalFontScale.refresh());
    document.addEventListener('DOMContentLoaded', () => window.GlobalFontScale.refresh(), { once: true });
})();
