/* Pull past the edge of the installed Notes editor and hold to reveal the compartment. */
(() => {
  'use strict';
  const scroller = document.getElementById('editorScroll');
  if (!scroller || document.documentElement.dataset.notesVersion !== '2') return;

  const standalone = matchMedia('(display-mode: standalone)');
  const holdTime = 5000;
  const pullDistance = 56;
  let listeners = null, touch = null, timer = 0, progress = null, compartment = null;

  function cancel() {
    clearTimeout(timer);
    timer = 0;
    touch = null;
    progress?.remove();
    progress = null;
  }

  function hide() {
    cancel();
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
    compartment.setAttribute('aria-label', 'Compartimento de IA');
    compartment.innerHTML = '<span class="notes-compartment-star" role="img" aria-label="IA">✦</span>' +
      '<button type="button" aria-label="Ocultar compartimento de IA">×</button>';
    compartment.querySelector('button').addEventListener('click', hide);
    scroller.prepend(compartment);
    scroller.scrollTop = 0;
  }

  function startProgress() {
    progress = document.createElement('div');
    progress.id = 'notes-compartment-progress';
    progress.setAttribute('role', 'status');
    progress.setAttribute('aria-label', 'Mantenha o gesto para abrir');
    progress.style.setProperty('--hold-time', holdTime + 'ms');
    progress.innerHTML = '<svg aria-hidden="true" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14"/>' +
      '<circle class="notes-compartment-fill" cx="18" cy="18" r="14" pathLength="100"/></svg>';
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
