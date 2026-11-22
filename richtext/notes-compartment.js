/* Pull past the edge of the installed Notes editor and hold to reveal the compartment. */
(() => {
  'use strict';
  const scroller = document.getElementById('editorScroll');
  if (!scroller || document.documentElement.dataset.notesVersion !== '2') return;

  const standalone = matchMedia('(display-mode: standalone)');
  const holdTime = 2000;
  const pullDistance = 56;
  let listeners = null, touch = null, timer = 0, progress = null, compartment = null;
  let disposePanel = null;
  // Same four-point outline as the article's answer agent.
  const star = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3C12.8 8.2 15.8 11.2 21 12C15.8 12.8 12.8 15.8 12 21C11.2 15.8 8.2 12.8 3 12C8.2 11.2 11.2 8.2 12 3Z" fill="currentColor" fill-opacity=".07"/></svg>';

  function cancel() {
    clearTimeout(timer);
    timer = 0;
    touch = null;
    progress?.remove();
    progress = null;
  }

  function hide() {
    cancel();
    disposePanel?.();
    disposePanel = null;
    compartment?.remove();
    compartment = null;
  }

  function canPull() {
    if (document.hidden || scroller.scrollTop > 1 || window.NotesMenu?.isOpen || window.LeitorMode?.isActive()) return false;
    if (document.activeElement?.matches('input,textarea,[contenteditable="true"]') ||
        !window.getSelection().isCollapsed || (window.visualViewport?.scale || 1) !== 1) return false;
    return ![...document.querySelectorAll('dialog[open], [aria-modal="true"]')].some(dialog =>
      dialog.getClientRects().length && getComputedStyle(dialog).visibility === 'visible');
  }

  function reveal() {
    if (!touch || !canPull()) { cancel(); return; }
    cancel();
    compartment = document.createElement('aside');
    compartment.id = 'notes-compartment';
    compartment.setAttribute('aria-labelledby', 'notes-summary-title');
    disposePanel = mountSummary(compartment);
    scroller.prepend(compartment);
    scroller.scrollTop = 0;
  }

  function mountSummary(panel) {
    panel.innerHTML = `<header class="notes-summary-header">
        <span class="notes-summary-badge" role="img" aria-label="IA">${star}</span>
        <h2 id="notes-summary-title">Resumo do discurso</h2>
        <button type="button" class="notes-summary-close" aria-label="Ocultar compartimento de IA">×</button>
      </header>
      <div class="notes-summary-body">
        <span class="notes-summary-spinner" hidden>${star}</span>
        <p data-summary-status role="status" aria-live="polite"></p>
        <p data-summary-result hidden dir="auto"></p>
      </div>
      <footer><button type="button" data-summary-generate>Resumir</button></footer>`;
    const button = panel.querySelector('[data-summary-generate]');
    const result = panel.querySelector('[data-summary-result]');
    const status = panel.querySelector('[data-summary-status]');
    const spinner = panel.querySelector('.notes-summary-spinner');
    const footer = panel.querySelector('footer');
    const editor = document.getElementById('editor');
    const events = new AbortController();
    const minCharacters = 50;
    let source = window.NotesSummarySource.read();
    let request = null, error = '', changed = false, frame = 0;

    function render() {
      const busy = !!request;
      const enough = source.characters >= minCharacters;
      const offline = navigator.onLine === false;
      panel.classList.toggle('is-summarizing', busy);
      button.disabled = busy || !enough || offline;
      button.textContent = error ? 'Tentar novamente' : result.textContent ? 'Resumir novamente' : 'Resumir';
      spinner.hidden = !busy;
      footer.hidden = busy;
      result.hidden = !result.textContent;
      let hint = '';
      if (busy) hint = 'Resumindo…';
      else if (!enough) hint = 'Escreva um pouco mais para gerar o resumo.';
      else if (offline) hint = 'Conecte-se à internet para gerar o resumo.';
      else if (error) hint = error;
      else if (changed) hint = 'A anotação mudou. Você pode gerar um novo resumo.';
      else if (!result.textContent) hint = 'A IA lê a anotação inteira, inclusive os tópicos recolhidos.';
      else hint = 'Resumo pronto.';
      status.classList.toggle('notes-summary-sr-only', !!result.textContent && !offline && !error);
      if (status.textContent !== hint) status.textContent = hint;
    }

    function cancelRequest() {
      request?.abort();
      request = null;
    }

    function refreshSource() {
      const next = window.NotesSummarySource.read();
      if (next.outline !== source.outline) {
        changed = changed || !!request || !!result.textContent;
        cancelRequest();
        error = '';
        result.textContent = '';
      }
      source = next;
      render();
    }

    async function generate() {
      refreshSource();
      if (button.disabled) return;
      const current = new AbortController();
      request = current;
      changed = false;
      error = '';
      result.textContent = '';
      render();
      try {
        const summary = await window.NotesSummaryAgent.summarize(source.outline, {signal:current.signal});
        if (current.signal.aborted) return;
        refreshSource();
        if (current.signal.aborted) return;
        if (typeof summary !== 'string' || !summary.trim()) throw new Error('empty');
        result.textContent = summary.trim();
      } catch (_) {
        if (!current.signal.aborted) error = 'Não foi possível gerar o resumo. Tente novamente.';
      } finally {
        if (request === current) { request = null; render(); }
      }
    }

    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; refreshSource(); });
    });
    observer.observe(editor, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['class', 'start', 'reversed', 'value']});
    const on = {signal:events.signal};
    button.addEventListener('click', generate, on);
    panel.querySelector('.notes-summary-close').addEventListener('click', hide, on);
    window.addEventListener('online', render, on);
    window.addEventListener('offline', render, on);
    window.addEventListener('notes:restored', refreshSource, on);
    window.addEventListener('supabaseLogout', hide, on);
    render();
    return () => { cancelRequest(); events.abort(); observer.disconnect(); cancelAnimationFrame(frame); };
  }

  function startProgress() {
    progress = document.createElement('div');
    progress.id = 'notes-compartment-progress';
    progress.setAttribute('role', 'status');
    progress.setAttribute('aria-label', 'Mantenha o gesto para abrir');
    progress.style.setProperty('--hold-time', holdTime + 'ms');
    progress.innerHTML = '<svg class="notes-compartment-ring" aria-hidden="true" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15"/>' +
      '<circle class="notes-compartment-fill" cx="18" cy="18" r="15" pathLength="100"/></svg>' + star;
    document.body.append(progress);
    timer = setTimeout(reveal, holdTime);
  }

  function start(event) {
    cancel();
    if (compartment || event.touches.length !== 1 || event.target.closest('a,button,input,textarea,select,[role="button"]') || !canPull()) return;
    const finger = event.touches[0];
    touch = {id: finger.identifier, x: finger.clientX, y: finger.clientY};
  }

  function move(event) {
    if (!touch) return;
    const finger = event.touches[0];
    if (event.touches.length !== 1 || finger.identifier !== touch.id) { cancel(); return; }
    const dx = Math.abs(finger.clientX - touch.x), dy = finger.clientY - touch.y;
    if (dy < -8 || dx > Math.max(16, dy) || (progress && dy < pullDistance - 12)) { cancel(); return; }
    // Claim only an outward pull at the edge. Ordinary swipes scroll natively.
    if (dy > 4 && dy > dx && event.cancelable) event.preventDefault();
    if (dy >= pullDistance && !progress) startProgress();
  }

  function refresh() {
    const installed = navigator.standalone === true || standalone.matches;
    if (!installed) { hide(); listeners?.abort(); listeners = null; return; }
    if (listeners) return;
    listeners = new AbortController();
    const passive = {passive: true, signal: listeners.signal};
    scroller.addEventListener('touchstart', start, passive);
    scroller.addEventListener('touchmove', move, {passive: false, signal: listeners.signal});
    document.addEventListener('touchstart', e => { if (e.touches.length > 1) cancel(); }, passive);
    document.addEventListener('touchend', cancel, passive);
    document.addEventListener('touchcancel', cancel, passive);
    document.addEventListener('visibilitychange', cancel, passive);
    document.addEventListener('focusin', () => { if (touch && !canPull()) cancel(); }, passive);
    scroller.addEventListener('scroll', () => { if (touch && scroller.scrollTop > 1) cancel(); }, passive);
    window.addEventListener('blur', cancel, passive);
    window.addEventListener('orientationchange', cancel, passive);
    window.addEventListener('pagehide', hide, passive);
  }

  standalone.addEventListener('change', refresh);
  window.addEventListener('pageshow', refresh);
  refresh();
})();
