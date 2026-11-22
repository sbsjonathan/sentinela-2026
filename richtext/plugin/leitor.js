document.addEventListener('DOMContentLoaded', () => {
  if (typeof M1_Config === 'undefined' || !M1_Config.editor || !M1_Config.toolbar) return;
  const editor = M1_Config.editor;
  const toolbar = M1_Config.toolbar;
  const leitorBtn = toolbar.querySelector('[aria-label="Modo Bíblia"]');
  if (!leitorBtn) return;

  const PERF_LOW = !!(window.EditorPerfProfile?.isLow?.() || document.documentElement.classList.contains('perf-low'));

  let isReadOnly = false, processedNodes = new WeakSet(), multiRefAuraEnabled = false, modeVersion = 0;
  const aliases = typeof ABREVIACOES === 'object' ? ABREVIACOES : (window.ABREVIACOES || {});

  const bindTapIntent = (el, handler, { delay = 240, slop = 10, preventFocus = true } = {}) => {
    if (!el || typeof handler !== 'function') return;
    let pointerId = null, startX = 0, startY = 0, moved = false, lastFire = 0;
    const canRun = () => {
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
      const now = Date.now();
      if (now - lastFire < delay) return false;
      lastFire = now;
      return true;
    };
    const begin = (x, y, id = null) => { pointerId = id; startX = x; startY = y; moved = false; };
    const track = (x, y) => { if (moved) return; if (Math.hypot(x - startX, y - startY) > slop) moved = true; };
    const reset = () => { pointerId = null; moved = false; };
    const finish = e => {
      const wasMoved = moved; reset();
      if (wasMoved || !canRun()) { if (e) { e.preventDefault(); e.stopPropagation(); } return; }
      handler(e);
    };
    el.addEventListener('pointerdown', e => { if (preventFocus) e.preventDefault(); begin(e.clientX, e.clientY, e.pointerId); });
    el.addEventListener('pointermove', e => { if (pointerId !== e.pointerId) return; track(e.clientX, e.clientY); });
    el.addEventListener('pointercancel', reset);
    el.addEventListener('pointerup', e => { if (pointerId !== e.pointerId) return; e.preventDefault(); finish(e); });
    el.addEventListener('touchstart', e => { if (preventFocus) e.preventDefault(); const t = e.changedTouches[0]; if (!t) return; begin(t.clientX, t.clientY, t.identifier); }, { passive: false });
    el.addEventListener('touchmove', e => { const t = Array.from(e.changedTouches).find(t => pointerId === null || t.identifier === pointerId); if (!t) return; track(t.clientX, t.clientY); if (moved) e.preventDefault(); }, { passive: false });
    el.addEventListener('touchcancel', reset, { passive: false });
    el.addEventListener('touchend', e => { const t = Array.from(e.changedTouches).find(t => pointerId === null || t.identifier === pointerId); if (!t) return; e.preventDefault(); finish(e); }, { passive: false });
    el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
  };

  const normalizeBookKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\.\s]/g, '').toLowerCase();
  const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const buildBibleRegex = () => {
    const rawKeys = Array.from(new Set(Object.keys(aliases))).filter(Boolean).sort((a, b) => b.length - a.length);
    const bookPattern = rawKeys.length ? rawKeys.map(key => escapeRegex(key).replace(/\s+/g, '\\s*')).join('|') : '[1-3]?\\s?[A-Za-zÀ-ÖØ-öø-ÿ.]+';
    const end = '(?:\\d{1,3}\\s*:\\s*)?\\d{1,3}';
    const range = `(?:\\s*[-–—]\\s*${end})?`;
    const verses = `\\d{1,3}${range}(?:\\s*[,;]\\s*${end}${range})*`;
    return new RegExp(`(^|[^A-Za-zÀ-ÖØ-öø-ÿ0-9])(${bookPattern})\\s*(\\d{1,3})\\s*([:;])\\s*(${verses})(?!\\d)`, 'gi');
  };

  const REGEX_BBL = buildBibleRegex();
  const ABREV_NORMALIZED_KEYS = new Set(Object.keys(aliases).map(normalizeBookKey));
  const waitForBible = (cb, version) => {
    const check = () => {
      if (!isReadOnly || version !== modeVersion) return;
      if (window.setupBblLinkListeners) cb(); else setTimeout(check, 150);
    };
    check();
  };
  const allEditables = () => Array.from(editor.querySelectorAll('.paragraph-content, .toggle-title, .text-content'));
  const getToolbarControls = () => Array.from(toolbar.querySelectorAll('button, input, select, textarea')).filter(el => el !== leitorBtn);

  const setToolbarLocked = locked => {
    toolbar.classList.toggle('leitor-toolbar-locked', !!locked);
    getToolbarControls().forEach(el => {
      if (locked) {
        if (!el.hasAttribute('data-leitor-prev-disabled')) el.setAttribute('data-leitor-prev-disabled', el.disabled ? '1' : '0');
        if (!el.hasAttribute('data-leitor-prev-tabindex') && el.hasAttribute('tabindex')) el.setAttribute('data-leitor-prev-tabindex', el.getAttribute('tabindex') || '');
        if ('disabled' in el) el.disabled = true;
        el.setAttribute('aria-disabled', 'true');
        el.setAttribute('tabindex', '-1');
      } else {
        const wasDisabled = el.getAttribute('data-leitor-prev-disabled') === '1';
        if ('disabled' in el) el.disabled = wasDisabled;
        if (el.hasAttribute('data-leitor-prev-tabindex')) {
          const prevTabIndex = el.getAttribute('data-leitor-prev-tabindex') || '';
          if (prevTabIndex === '') el.removeAttribute('tabindex'); else el.setAttribute('tabindex', prevTabIndex);
          el.removeAttribute('data-leitor-prev-tabindex');
        } else { el.removeAttribute('tabindex'); }
        el.removeAttribute('aria-disabled');
        el.removeAttribute('data-leitor-prev-disabled');
      }
    });
  };

  function createLeitorBorderFx(anchorEl) {
    const root = document.documentElement;
    const statusbarMask = document.querySelector('.statusbar-mask');
    const host = document.createElement('div');
    host.className = 'leitor-fx';
    host.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    canvas.className = 'leitor-fx__glow';
    canvas.width = canvas.height = 192;
    const ink = canvas.getContext('2d');
    if (!ink || !(CSS.supports('mask-image', 'url("#mask")') || CSS.supports('-webkit-mask-image', 'url("#mask")'))) return null;
    host.append(canvas);
    document.body.append(host);

    const turn = 2 * Math.PI;
    const cycleMs = 12400;
    const frameMs = 1000 / 30;
    let enabled = false;
    let frame = 0;
    let startedAt = 0;
    let elapsed = 0;
    let lastPaint = 0;
    let lastShape = '';
    let transition = null;
    let exitTimer = 0;

    // Each stop is a position clockwise from twelve o’clock and a color of the glass.
    const spectrum = [
      [0, '#926bff'], [.105, '#bf6df6'], [.173, '#e58ce7'],
      [.245, '#ffac46'], [.29, '#ffb15d'], [.344, '#d68fe8'],
      [.405, '#9261ff'], [.505, '#c379fa'], [.616, '#ff94b7'],
      [.705, '#ff467d'], [.764, '#f143a2'], [.818, '#a375f4'],
      [.905, '#429aff'], [.952, '#558dff'], [1, '#926bff']
    ];

    function updateContour() {
      if (!enabled) return;
      // Preserve the Notes surface when the keyboard pans the visual viewport.
      const {width, height} = window.NotesViewport?.enabled
        ? window.NotesViewport.measure() : host.getBoundingClientRect();
      if (!width || !height) return;
      // With a native status band, the web surface starts at its straight lower
      // edge. Under the clock, use the same rounded outline as the glass.
      const reservedTop = window.NotesViewport?.enabled && height > width &&
        statusbarMask?.offsetHeight === 0 && screen.height - height > 1;
      const key = [width, height, root.dataset.theme, reservedTop].join('/');
      if (key === lastShape) return;
      lastShape = key;

      const radius = Math.min(62, width * .137, height * .137);
      // Continuous-looking corners meet each straight edge with a gentle tangent.
      const shoulder = .36;
      const bend = radius * shoulder;
      const topRadius = reservedTop ? 0 : radius;
      const topBend = topRadius * shoulder;
      const outline = [
        'M', topRadius, 0, 'H', width - topRadius, 'C', width - topBend, 0, width, topBend, width, topRadius,
        'V', height - radius, 'C', width, height - bend, width - bend, height, width - radius, height,
        'H', radius, 'C', bend, height, 0, height - bend, 0, height - radius,
        'V', topRadius, 'C', 0, topBend, topBend, 0, topRadius, 0, 'Z'
      ].join(' ');

      // Rasterize the optical falloff only on resize or an appearance change.
      // The thin saturated lip and diffuse inner reflection share one silhouette.
      const dark = root.dataset.theme === 'dark';
      const layers = dark
        ? [[57, 9, .10], [29, 5.5, .23], [13, 3.2, .54], [5.2, 1.2, .88], [1.7, .35, .97]]
        : [[53, 8, .12], [28, 5.1, .32], [14, 3.1, .66], [6, 1.15, .94], [2, .4, 1]];
      const filters = layers.map(([, blur], i) =>
        '<filter id="b' + i + '" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="' + blur + '"/></filter>'
      ).join('');
      const strokes = layers.map(([weight, , opacity], i) =>
        '<use href="#rim" xlink:href="#rim" stroke-width="' + weight + '" opacity="' + opacity + '" filter="url(#b' + i + ')"/>'
      ).join('');
      // Give the top a little more depth under the translucent status bar.
      // Fade into the existing reflection inside the same curved glass silhouette.
      const topGradient = '<linearGradient id="top-light" x2="0" y2="1">' +
        '<stop stop-color="white" stop-opacity=".7"/><stop offset=".4" stop-color="white" stop-opacity=".50"/>' +
        '<stop offset=".72" stop-color="white" stop-opacity=".15"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>';
      const topLight = '<rect width="' + width + '" height="19" fill="url(#top-light)" stroke="none"/>';
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + width + ' ' + height + '">' +
        '<defs><path id="rim" d="' + outline + '"/><clipPath id="glass"><path d="' + outline + '"/></clipPath>' + filters + topGradient + '</defs>' +
        '<g clip-path="url(#glass)" stroke="white" stroke-linejoin="round" fill="none">' + strokes + topLight + '</g></svg>';
      canvas.style.setProperty('--edge-mask', 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")');
    }

    function draw(now) {
      const angle = turn * ((elapsed + now - startedAt) % cycleMs) / cycleMs;
      const center = canvas.width / 2;
      // The color map stretches with the viewport. Painting it at low resolution
      // keeps the animation cheap while the independent mask stays full resolution.
      const cx = center * (1 + .11 * Math.sin(angle * 2));
      const cy = center * (1 + .09 * Math.sin(angle * 3));
      const drift = angle + .38 * Math.sin(angle * 2) + .16 * Math.sin(angle * 3);
      const gradient = ink.createConicGradient(drift - Math.PI / 2, cx, cy);
      for (const [position, color] of spectrum) {
        // Pin the seam but let neighboring pools expand and contract independently.
        const offset = position + .034 * Math.sin(Math.PI * position) * Math.sin(turn * position * 2 - angle * 2);
        gradient.addColorStop(offset, color);
      }
      ink.fillStyle = gradient;
      ink.fillRect(0, 0, canvas.width, canvas.height);
    }

    function tick(now) {
      if (now - lastPaint >= frameMs - 1) {
        draw(now);
        lastPaint = now;
      }
      frame = requestAnimationFrame(tick);
    }

    function pause() {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
      elapsed = (elapsed + performance.now() - startedAt) % cycleMs;
    }

    function resume() {
      if (!enabled || frame || document.hidden) return;
      updateContour();
      // Some older engines support CSS conic gradients before canvas gradients.
      if (typeof ink.createConicGradient !== 'function') {
        canvas.style.backgroundImage = 'conic-gradient(' + spectrum.map(([position, color]) => color + ' ' + position * 100 + '%').join(',') + ')';
        return;
      }
      startedAt = lastPaint = performance.now();
      draw(startedAt);
      frame = requestAnimationFrame(tick);
    }

    function onVisibilityChange() {
      if (document.hidden) pause(); else resume();
    }

    function forceOff() {
      enabled = false;
      pause();
      elapsed = 0;
      clearTimeout(exitTimer);
      transition?.cancel();
      transition = null;
      host.classList.remove('is-mounted');
      root.classList.remove('leitor-glow-active');
      resizeObserver?.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('resize', updateContour);
      document.removeEventListener('notes:surface-resize', updateContour);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', forceOff);
    }

    function setEnabled(next) {
      if (enabled === next) return;
      enabled = next;
      clearTimeout(exitTimer);
      transition?.cancel();
      transition = null;
      if (next) {
        host.classList.add('is-mounted');
        root.classList.add('leitor-glow-active');
        resizeObserver?.observe(host);
        if (statusbarMask) resizeObserver?.observe(statusbarMask);
        themeObserver.observe(root, {attributes:true, attributeFilter:['data-theme']});
        window.addEventListener('resize', updateContour, {passive:true});
        document.addEventListener('notes:surface-resize', updateContour);
        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('pagehide', forceOff);
        resume();
      }
      // The book button is the origin of the existing entry/exit interaction.
      if (!host.animate || document.hidden) {
        if (!next) forceOff();
        return;
      }
      const box = host.getBoundingClientRect();
      const button = anchorEl.getBoundingClientRect();
      const x = button.left + button.width / 2 - box.left;
      const y = button.top + button.height / 2 - box.top;
      const radius = Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y));
      const circle = r => `circle(${r}px at ${x}px ${y}px)`;
      const duration = next ? 350 : 300;
      transition = host.animate([
        {clipPath:circle(0), opacity:0},
        {clipPath:circle(radius), opacity:1}
      ], {duration, direction:next ? 'normal' : 'reverse', easing:'ease-out'});
      // A rapid mode toggle can cancel the previous WebKit animation before it
      // sends a finish event. Always restore the dock at the end of this exit.
      if (!next) exitTimer = setTimeout(forceOff, duration);
    }

    const resizeObserver = window.ResizeObserver ? new ResizeObserver(updateContour) : null;
    const themeObserver = new MutationObserver(updateContour);
    return {setEnabled, forceOff, destroy() { forceOff(); host.remove(); }};
  }

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let leitorFx = null;
  function syncReaderGlow() {
    if (reducedMotion.matches || !(window.EditorPerfProfile?.allowsReaderGlow?.() ?? !PERF_LOW)) {
      leitorFx?.destroy();
      leitorFx = null;
    } else if (isReadOnly) {
      if (!leitorFx) leitorFx = createLeitorBorderFx(leitorBtn);
      leitorFx?.setEnabled(true);
    }
  }
  reducedMotion.addEventListener('change', syncReaderGlow);
  window.addEventListener('editorperfchange', syncReaderGlow);

  const enableReadOnly = ({ toastMessage = null, autoOpenRef = null, enableAura = false } = {}) => {
    const version = ++modeVersion;
    editor.setAttribute('contenteditable', 'false'); editor.classList.add('is-read-only');
    document.body.classList.add('leitor-keep-toolbar');
    M4_Caret.updateFocus();
    M11_Layout.revalidateViewport?.();
    if (window.M12_History) window.M12_History._leitorPaused = true;
    leitorBtn.classList.add('is-active'); leitorBtn.setAttribute('aria-pressed', 'true');
    setToolbarLocked(true); syncReaderGlow(); multiRefAuraEnabled = !PERF_LOW && !!enableAura;
    waitForBible(async () => {
      await processAllContent(version);
      if (!isReadOnly || version !== modeVersion || !autoOpenRef?.editable?.isConnected) return;
      const targetSpan = Array.from(autoOpenRef.editable.querySelectorAll('.bbl')).find(span => {
        const range = document.createRange(); range.selectNodeContents(autoOpenRef.editable); range.setEndBefore(span);
        return range.toString().length === autoOpenRef.index;
      });
      if (targetSpan) window.abrirModalBibl?.(targetSpan.dataset.ref, targetSpan);
    }, version);
    if (toastMessage) showToast(toastMessage);
  };

  const disableReadOnly = ({ reference = null } = {}) => {
    if (!isReadOnly) return reference;
    ++modeVersion; isReadOnly = false;
    // Blur before restoring contenteditable so iOS does not reopen the keyboard.
    // A transcription places its own caret in the verse it inserts.
    if (!reference) {
      const active = document.activeElement;
      if (editor.contains(active) || toolbar.contains(active)) active.blur();
      const selection = window.getSelection();
      if (editor.contains(selection?.anchorNode) || editor.contains(selection?.focusNode)) selection.removeAllRanges();
    }
    const replacement = removeAllLinks(reference); leitorFx?.setEnabled(false);
    editor.setAttribute('contenteditable', 'true'); editor.classList.remove('is-read-only');
    document.body.classList.remove('leitor-keep-toolbar');
    M11_Layout.revalidateViewport?.();
    if (window.M12_History) window.M12_History._leitorPaused = false;
    leitorBtn.classList.remove('is-active'); leitorBtn.setAttribute('aria-pressed', 'false');
    setToolbarLocked(false); M4_Caret.updateFocus();
    processedNodes = new WeakSet(); multiRefAuraEnabled = false;
    return replacement;
  };

  const scanTextForRefs = text => {
    const source = String(text || ''), refs = []; REGEX_BBL.lastIndex = 0; let match;
    while ((match = REGEX_BBL.exec(source)) !== null) {
      const prefix = match[1] || '', book = match[2] || '', chapter = match[3] || '', sep = match[4] || ':', verses = match[5] || '', refText = `${book} ${chapter}${sep}${verses}`.replace(/\s+/g, ' ').trim();
      if (!book || !chapter || !verses) continue;
      if (ABREV_NORMALIZED_KEYS.size) { const bookKey = normalizeBookKey(book); if (!ABREV_NORMALIZED_KEYS.has(bookKey)) continue; }
      refs.push({ index: match.index + prefix.length, length: match[0].length - prefix.length, text: refText });
    }
    return refs;
  };

  const scanEditorReferences = () => allEditables().flatMap(editable =>
    scanTextForRefs(editable.textContent || '').map(ref => ({...ref, editable})));

  const referenceAtCaret = refs => {
    const live = M2_Query.curRange();
    const range = live && editor.contains(live.startContainer) ? live : M1_Config.state.lastR;
    if (!range || !editor.contains(range.startContainer)) return refs.length === 1 ? refs[0] : null;
    const editable = M2_Query.closest(range.startContainer, '.editable');
    if (!editable) return null;
    const before = range.cloneRange(); before.selectNodeContents(editable); before.setEnd(range.startContainer, range.startOffset);
    const offset = before.toString().length;
    const editables = allEditables(), index = editables.indexOf(editable);
    return refs.filter(ref => ref.editable === editable ? ref.index <= offset : editables.indexOf(ref.editable) < index).at(-1) || null;
  };
  const toggle = () => {
    if (isReadOnly) { disableReadOnly(); return; }
    const refs = scanEditorReferences();
    if (!refs.length) { showToast('Não há versículos bíblicos'); return; }
    const target = referenceAtCaret(refs);
    isReadOnly = true;
    enableReadOnly({autoOpenRef: target, toastMessage: target ? null : 'Modo Bíblia', enableAura: !PERF_LOW});
  };

  const processAllContent = version => new Promise(resolve => {
    const editables = allEditables(); let index = 0;
    const pump = () => {
      if (!isReadOnly || version !== modeVersion) { resolve(); return; }
      const end = Math.min(index + (PERF_LOW ? 4 : 20), editables.length);
      for (; index < end; index++) processEditable(editables[index]);
      if (index < editables.length) setTimeout(pump, 0); else resolve();
    };
    pump();
  });

  const processEditable = el => {
    if (!el || processedNodes.has(el)) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode(node) { if (node.parentElement?.classList.contains('bbl')) return NodeFilter.FILTER_REJECT; if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT; return NodeFilter.FILTER_ACCEPT; } });
    const toProcess = []; let node; while ((node = walker.nextNode())) toProcess.push(node);
    toProcess.forEach(n => processTextNode(n)); processedNodes.add(el);
  };

  const processTextNode = textNode => {
    const text = textNode.textContent, matches = scanTextForRefs(text); if (!matches.length) return;
    const frag = document.createDocumentFragment(); let last = 0;
    matches.forEach(({ index, length, text: ref }) => {
      if (index > last) frag.appendChild(document.createTextNode(text.slice(last, index)));
      const span = document.createElement('span'); span.className = 'bbl'; if (multiRefAuraEnabled) span.classList.add('bbl--aura');
      span.textContent = text.slice(index, index + length); span.setAttribute('data-ref', ref);
      if (window.setupBblLinkListeners) window.setupBblLinkListeners(span);
      frag.appendChild(span); last = index + length;
    });
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.parentNode.replaceChild(frag, textNode);
  };

  const removeAllLinks = reference => {
    let replacement = reference;
    const targetEditable = reference?.closest?.('.editable');
    editor.querySelectorAll('.bbl').forEach(span => {
      const text = document.createTextNode(span.textContent);
      if (span === reference) replacement = text;
      span.replaceWith(text);
    });
    // Preserve this exact text node until the transcription wraps it in a
    // persistent source. Normalizing it now could merge it with another ref.
    allEditables().filter(el => el !== targetEditable).forEach(el => el.normalize());
    return replacement;
  };

  const showToast = msg => {
    let toast = document.getElementById('leitor-toast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'leitor-toast'; toast.className = 'leitor-toast'; document.body.appendChild(toast); }
    toast.textContent = msg; toast.classList.remove('leitor-toast--out'); toast.classList.add('leitor-toast--in');
    clearTimeout(toast._timer); toast._timer = setTimeout(() => { toast.classList.remove('leitor-toast--in'); toast.classList.add('leitor-toast--out'); }, 1400);
  };

  const patchHistory = () => {
    if (!window.M12_History) { setTimeout(patchHistory, 50); return; }
    const origCommit = window.M12_History.commit.bind(window.M12_History), origSchedule = window.M12_History.schedule.bind(window.M12_History);
    window.M12_History.commit = function (...args) { if (this._leitorPaused) return; return origCommit(...args); };
    window.M12_History.schedule = function (...args) { if (this._leitorPaused) return; return origSchedule(...args); };
  };

  const resetArtifacts = () => {
    leitorFx?.forceOff(); editor.setAttribute('contenteditable', 'true'); editor.classList.remove('is-read-only'); document.body.classList.remove('leitor-keep-toolbar');
    M11_Layout.revalidateViewport?.();
    leitorBtn.classList.remove('is-active'); leitorBtn.setAttribute('aria-pressed', 'false'); setToolbarLocked(false);
    if (window.M12_History) window.M12_History._leitorPaused = false; M4_Caret.updateFocus();
    editor.querySelectorAll('.bbl').forEach(s => s.replaceWith(document.createTextNode(s.textContent))); allEditables().forEach(el => el.normalize());
    processedNodes = new WeakSet(); multiRefAuraEnabled = false;
  };

  const forceEdit = () => { if (isReadOnly) disableReadOnly(); };
  window.LeitorMode = {ativar: () => { if (!isReadOnly) toggle(); }, desativar: disableReadOnly, isActive: () => isReadOnly};
  window.addEventListener('notes:restored', () => { if (isReadOnly) disableReadOnly(); });

  window.addEventListener('pagehide', forceEdit); window.addEventListener('beforeunload', forceEdit); window.addEventListener('pageshow', () => { if (!isReadOnly) resetArtifacts(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !isReadOnly) resetArtifacts(); });

  bindTapIntent(leitorBtn, e => { if (e) e.preventDefault(); toggle(); }, { delay: 300, slop: 10, preventFocus: true });
  patchHistory(); leitorBtn.setAttribute('aria-pressed', 'false');
});
