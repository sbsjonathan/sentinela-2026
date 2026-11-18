(() => {
  const KEY = 'editor-performance-mode';
  const VALID = new Set(['normal', 'low']);
  const root = document.documentElement;

  function readPreference() {
    try {
      const fromUrl = new URLSearchParams(location.search).get('perf');
      if (VALID.has(fromUrl)) return fromUrl;
    } catch (_) {}

    try {
      const stored = localStorage.getItem(KEY);
      if (VALID.has(stored)) return stored;
    } catch (_) {}

    return null;
  }

  let preference = readPreference();
  let mode = preference || window.__EDITOR_PERF_BOOT__ || 'low';

  function apply(nextMode) {
    mode = VALID.has(nextMode) ? nextMode : 'low';
    root.dataset.performanceMode = mode;
    root.classList.toggle('perf-low', mode === 'low');
    root.classList.toggle('perf-normal', mode !== 'low');
    if (document.body) {
      document.body.classList.toggle('perf-low', mode === 'low');
      document.body.classList.toggle('perf-normal', mode !== 'low');
    }
  }

  apply(mode);
  document.addEventListener('DOMContentLoaded', () => apply(mode), { once: true });

  window.EditorPerfProfile = {
    getMode() {
      return mode;
    },
    isLow() {
      return mode === 'low';
    },
    allowsReaderGlow() {
      // Keep the editor's economical defaults and honor an explicit Low choice.
      return preference !== 'low';
    },
    setMode(nextMode, options = {}) {
      const finalMode = VALID.has(nextMode) ? nextMode : 'low';
      preference = finalMode;
      try { localStorage.setItem(KEY, finalMode); } catch (_) {}
      apply(finalMode);
      window.dispatchEvent(new CustomEvent('editorperfchange', { detail: { mode: finalMode } }));
      if (options.reload !== false) {
        try { location.reload(); } catch (_) {}
      }
    }
  };
})();
