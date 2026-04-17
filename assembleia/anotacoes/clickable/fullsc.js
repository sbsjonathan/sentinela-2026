(function () {
  let editorRef = null;
  let leaving = false;

  function isPerfLow() {
    return !!(window.EditorPerfProfile?.isLow?.() || document.documentElement.classList.contains('perf-low'));
  }

  function applyGlobalFontScale() {
    const STORAGE_KEY = 'tamanho-fonte-global';
    const DEFAULT_SIZE = 16;
    const MIN_SIZE = DEFAULT_SIZE;
    const MAX_SIZE = DEFAULT_SIZE + 10;

    const raw = parseInt(localStorage.getItem(STORAGE_KEY) || DEFAULT_SIZE, 10);
    const size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Number.isFinite(raw) ? raw : DEFAULT_SIZE));
    const scale = size / DEFAULT_SIZE;
    const root = document.documentElement;
    root.style.setProperty('--tamanho-fonte', `${size}px`);
    root.style.setProperty('--font-base-default', String(DEFAULT_SIZE));
    root.style.setProperty('--font-base-global', `${size}px`);
    root.style.setProperty('--font-scale-global', String(scale));
    root.dataset.fontSizeGlobal = String(size);
  }

  applyGlobalFontScale();

  // ── COR GLOBAL + CONTRASTE ──────────────────────────────────────────────
  function applyCorGlobal() {
    const params = new URLSearchParams(location.search);
    const cor = (params.get('cor') || '').trim();
    if (!cor) return;

    document.documentElement.style.setProperty('--cor-global', cor);

    // Converte a cor para RGB via canvas (aceita hex, rgb, hsl, named colors...)
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillStyle = cor;
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;

    // Luminância relativa WCAG 2.1
    function linearize(c) {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    }
    const L = 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);

    // Qual contraste é maior — texto branco ou texto preto?
    const contrasteComBranco = 1.05 / (L + 0.05);
    const contrasteComPreto  = (L + 0.05) / 0.05;

    const textoClaro  = '#ffffff';
    const textoEscuro = '#1a1a1a';
    const texto = contrasteComBranco >= contrasteComPreto ? textoClaro : textoEscuro;

    // Opacidade para elementos secundários (kicker, status)
    const textoParcial = texto === textoClaro
      ? 'rgba(255,255,255,0.55)'
      : 'rgba(0,0,0,0.42)';

    const backBg = texto === textoClaro
      ? 'rgba(255,255,255,0.14)'
      : 'rgba(0,0,0,0.10)';

    document.documentElement.style.setProperty('--fullsc-topbar-text', texto);
    document.documentElement.style.setProperty('--fullsc-topbar-text-muted', textoParcial);
    document.documentElement.style.setProperty('--fullsc-back-bg', backBg);
  }

  applyCorGlobal();
  // ────────────────────────────────────────────────────────────────────────

  function qs(name) {
    return new URLSearchParams(location.search).get(name) || '';
  }

  function decode(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value || '';
    }
  }

  function getStorageKey() {
    return qs('id') || 'asmb-fullsc-temp';
  }

  function stripTrailingScriptureRefs(title) {
    const raw = String(title || '').trim();
    if (!raw) return raw;

    const match = raw.match(/\s*\(([^()]*)\)\s*$/);
    if (!match) return raw;

    const refs = (match[1] || '').trim();
    const looksLikeBibleRefs =
      /\d/.test(refs) &&
      /[:;,-–—]/.test(refs) &&
      /[A-Za-zÀ-ÿ]/.test(refs);

    if (!looksLikeBibleRefs) return raw;
    return raw.slice(0, match.index).trim();
  }

  function titleFromId(id) {
    return String(id || '')
      .replace(/^asmb-/, '')
      .replace(/-/g, ' ')
      .trim() || 'Anotação';
  }

  function getAgent() {
    return window.AssembleiaIA || null;
  }

  function waitForEditor() {
    return new Promise((resolve) => {
      const check = () => {
        const editor = document.getElementById('editor');
        const ready = editor && typeof M6_Tree !== 'undefined' && typeof M5_Factory !== 'undefined' && typeof M3_TextModel !== 'undefined';
        if (ready) resolve(editor);
        else setTimeout(check, 80);
      };
      check();
    });
  }

  function looksLikeV23Markup(html) {
    return /class\s*=\s*["'][^"']*(node-paragraph|node-toggle|node-text)/i.test(html || '');
  }

  function ensureRoot(editor) {
    if (!editor) return;
    if (editor.children.length) return;
    const bloco = typeof M5_Factory !== 'undefined' ? M5_Factory.para('') : null;
    if (bloco) editor.appendChild(bloco);
    if (typeof M3_TextModel !== 'undefined') M3_TextModel.syncAll();
    if (typeof M11_Layout !== 'undefined') M11_Layout.schedule(2);
  }

  function applyHTML(editor, html) {
    const trimmed = (html || '').trim();
    editor.innerHTML = '';
    if (!trimmed) {
      ensureRoot(editor);
      return;
    }

    if (looksLikeV23Markup(trimmed)) {
      editor.innerHTML = trimmed;
    } else if (typeof M5_Factory !== 'undefined' && typeof M2_Query !== 'undefined') {
      const bloco = M5_Factory.para('');
      const editable = M2_Query.getParC(bloco);
      if (editable) editable.innerHTML = trimmed;
      editor.appendChild(bloco);
    } else {
      editor.innerHTML = trimmed;
    }

    ensureRoot(editor);
    if (typeof M3_TextModel !== 'undefined') M3_TextModel.syncAll();
    if (typeof M11_Layout !== 'undefined') M11_Layout.schedule(2);
  }

  function exportHTML(editor) {
    return editor ? editor.innerHTML : '';
  }

  function goBack() {
    const from = qs('from');
    leaving = true;
    if (history.length > 1) {
      history.back();
      return;
    }
    location.href = decode(from) || '../../../index.html';
  }

  function queueSummaryAndLeave() {
    if (leaving || !editorRef) return;
    leaving = true;
    const key = getStorageKey();
    const agent = getAgent();
    const html = exportHTML(editorRef);

    try {
      if (agent?.queueSummaryFromFull) {
        agent.queueSummaryFromFull(key, html);
      } else if (agent?.saveFullDraft) {
        agent.saveFullDraft(key, html);
      }
    } catch {}

    goBack();
  }

  function setupBack() {
    const btn = document.getElementById('fullscBack');
    if (!btn) return;
    btn.addEventListener('click', () => {
      queueSummaryAndLeave();
    });
  }

  function setupTitle() {
    const titleEl = document.getElementById('fullscTitle');
    const kickerEl = document.querySelector('.fullsc-kicker');
    if (!titleEl) return;

    const rawTitle = decode(qs('title')) || titleFromId(getStorageKey());
    const title = stripTrailingScriptureRefs(rawTitle);
    const isSymposium = qs('isSymposium') === '1';
    const symposiumTitle = decode(qs('symposiumTitle'));

    titleEl.textContent = title;

    if (kickerEl) {
      if (isSymposium && symposiumTitle) {
        kickerEl.textContent = symposiumTitle;
        kickerEl.hidden = false;
        kickerEl.classList.remove('is-hidden');
      } else {
        kickerEl.textContent = '';
        kickerEl.hidden = true;
        kickerEl.classList.add('is-hidden');
      }
    }

    document.title = title + ' — Full Screen';
  }

  function bootAnim() {
    if (isPerfLow()) {
      document.body.classList.remove('fullsc-boot');
      document.body.classList.add('fullsc-ready');
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.classList.remove('fullsc-boot');
        document.body.classList.add('fullsc-ready');
      });
    });
  }

  function syncToolbarFocusState(editor) {
    if (!editor || !document.body) return;

    const sel = window.getSelection?.();
    const selectionInside = !!(sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode));
    const activeInside = document.activeElement === editor || editor.contains(document.activeElement);
    const keepVisible = document.body.classList.contains('leitor-keep-toolbar') || document.body.classList.contains('zombie-toolbar-active');

    if (selectionInside || activeInside || keepVisible) {
      document.body.classList.add('editor-has-focus');
    } else {
      document.body.classList.remove('editor-has-focus');
    }
  }

  function bindToolbarSafety(editor) {
    if (!editor) return;

    const refresh = () => {
      requestAnimationFrame(() => syncToolbarFocusState(editor));
    };

    editor.addEventListener('focus', refresh);
    editor.addEventListener('pointerdown', refresh, true);
    editor.addEventListener('touchstart', refresh, { passive: true });
    editor.addEventListener('click', refresh, true);
    document.addEventListener('selectionchange', refresh);
    window.addEventListener('pageshow', refresh);

    setTimeout(refresh, 0);
    requestAnimationFrame(refresh);
  }

  async function init() {
    setupBack();
    setupTitle();
    bootAnim();

    const key = getStorageKey();
    const editor = await waitForEditor();
    editorRef = editor;

    const agent = getAgent();
    const fullHtml = agent?.getFullHTML ? agent.getFullHTML(key) : '';
    applyHTML(editor, fullHtml);
    bindToolbarSafety(editor);
    syncToolbarFocusState(editor);
    if (typeof M4_Caret !== 'undefined' && typeof M4_Caret.updateFocus === 'function') {
      requestAnimationFrame(() => {
        try { M4_Caret.updateFocus(true); } catch (_) {}
        syncToolbarFocusState(editor);
      });
    }

    let saveTimer = null;
    const queueSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const html = exportHTML(editor);
        agent?.saveFullDraft?.(key, html);
      }, 180);
    };

    editor.addEventListener('input', queueSave);
    if (!isPerfLow()) {
      editor.addEventListener('keyup', queueSave);
    }
    editor.addEventListener('paste', queueSave);
    editor.addEventListener('cut', queueSave);
    editor.addEventListener('blur', () => {
      const html = exportHTML(editor);
      agent?.saveFullDraft?.(key, html);
    }, true);
    window.addEventListener('beforeunload', () => {
      const html = exportHTML(editor);
      agent?.saveFullDraft?.(key, html);
    });
    window.addEventListener('pagehide', () => {
      const html = exportHTML(editor);
      agent?.saveFullDraft?.(key, html);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();