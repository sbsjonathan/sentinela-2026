'use strict';
/* A search surface sized to the visible viewport, including the iPhone keyboard. */
(() => {
  const defaultCategories = [
    ['all', 'Tudo'], ['verses', 'Versículos'], ['notes', 'Notas'],
    ['documents', 'Índices e artigos'], ['related', 'Relacionados']
  ];
  const kindNames = {verse:'Versículo', verses:'Versículo', note:'Nota', study:'Nota de estudo',
    footnote:'Nota de rodapé', document:'Texto de estudo', index:'Índice', topic:'Assunto',
    related:'Referência relacionada', reference:'Passagem', book:'Livro', outline:'Esboço'};
  const fold = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const node = (tag, cls, text) => {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (text != null) element.textContent = text;
    return element;
  };
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + name); svg.setAttribute('aria-hidden', 'true'); svg.append(use);
    return svg;
  }
  function appendHighlighted(element, text, terms) {
    text = String(text || '');
    const normalized = [], positions = [];
    let originalPosition = 0;
    for (const character of text) {
      const normalizedCharacter = fold(character);
      normalized.push(normalizedCharacter);
      for (let i = 0; i < normalizedCharacter.length; i++) positions.push([originalPosition, originalPosition + character.length]);
      originalPosition += character.length;
    }
    const candidates = [...new Set((terms || []).map(fold).map(term => term.trim()).filter(term => term.length > 1))]
      .sort((a, b) => b.length - a.length);
    if (!candidates.length) { element.textContent = text; return; }
    const expression = new RegExp('(^|[^\\p{L}\\p{N}])(' + candidates.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=$|[^\\p{L}\\p{N}])', 'gu');
    const searchable = normalized.join(''); let match, cursor = 0;
    while ((match = expression.exec(searchable))) {
      const start = positions[match.index + match[1].length]?.[0];
      const end = positions[match.index + match[0].length - 1]?.[1];
      if (start == null || end == null || start < cursor) continue;
      element.append(document.createTextNode(text.slice(cursor, start)), node('mark', '', text.slice(start, end)));
      cursor = end;
    }
    element.append(document.createTextNode(text.slice(cursor)));
  }

  window.initBibleSearch = function initBibleSearch({dialog, getPublication, search, onOpen, getSuggestions}) {
    if (!dialog || typeof search !== 'function') throw new Error('A busca não conseguiu iniciar.');
    const state = {publication:null, query:'', category:'all', items:[], counts:{}, total:0,
      hasMore:false, nextOffset:0, epoch:0, busy:false, responseTerms:[], trigger:null,
      savedScroll:0, savedPaddingBottom:0, resultScroll:0, restoreScroll:true, restoreFocus:true, viewportBase:0, viewportWidth:0};
    let debounceTimer, viewportFrame, viewportEvents;
    dialog.classList.add('bible-search-dialog');
    dialog.setAttribute('aria-labelledby', 'search-title');
    const surface = node('div', 'search-surface');
    const header = node('header', 'search-panel-header');
    const heading = node('h2', '', 'Buscar na Bíblia'); heading.id = 'search-title';
    const closeButton = node('button', 'search-close'); closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Fechar busca'); closeButton.append(icon('close')); header.append(heading, closeButton);
    const form = node('form', 'search-query-form'); form.id = 'search-form'; form.setAttribute('role', 'search');
    const label = node('label', '', 'Palavra, assunto ou passagem'); label.htmlFor = 'search-input';
    const field = node('div', 'search-query-field');
    const input = node('input'); input.id = 'search-input'; input.type = 'text'; input.setAttribute('role', 'searchbox');
    input.placeholder = 'Sangue, fé ou João 3:16'; input.autocomplete = 'off'; input.spellcheck = false; input.maxLength = 180;
    input.setAttribute('autocapitalize', 'none'); input.setAttribute('enterkeyhint', 'search'); input.setAttribute('aria-describedby', 'search-message');
    const clearButton = node('button', 'search-clear'); clearButton.type = 'button'; clearButton.hidden = true;
    clearButton.setAttribute('aria-label', 'Limpar pesquisa'); clearButton.append(icon('close'));
    const submitButton = node('button', 'search-submit'); submitButton.type = 'submit';
    submitButton.setAttribute('aria-label', 'Buscar'); submitButton.append(icon('search')); field.append(input, clearButton, submitButton); form.append(label, field);
    const categories = node('div', 'search-categories'); categories.setAttribute('role', 'tablist'); categories.setAttribute('aria-label', 'Tipos de resultado');
    const categoryButtons = new Map();
    const status = node('p', 'search-status'); status.id = 'search-message'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const statusText = node('span', 'search-status-text'); status.append(statusText);
    const resultsScroll = node('div', 'search-results-scroll'); resultsScroll.setAttribute('role', 'tabpanel'); resultsScroll.id = 'search-results-panel';
    const results = node('div', 'search-result-list'); results.id = 'search-results';
    const moreButton = node('button', 'search-load-more', 'Mostrar mais resultados'); moreButton.type = 'button'; moreButton.hidden = true;
    const footer = node('p', 'search-coverage', 'Versículos, notas, índices e apêndices desta Bíblia.');
    resultsScroll.append(results, moreButton, footer); surface.append(header, form, categories, status, resultsScroll); dialog.replaceChildren(surface);

    function addCategory(key, title) {
      const tab = node('button', 'search-category'); tab.type = 'button'; tab.id = 'search-category-' + key;
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', resultsScroll.id);
      const count = node('span', 'search-category-count'); tab.append(node('span', '', title), count);
      tab.onclick = () => { if (state.category !== key) { state.category = key; updateCategories(); runSearch(false); } };
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const visible = [...categoryButtons.values()].filter(item => !item.tab.hidden);
        const index = visible.findIndex(item => item.tab === tab);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length;
        visible[next].tab.focus({preventScroll:true}); visible[next].tab.click();
      });
      categories.append(tab); categoryButtons.set(key, {tab, count});
    }
    defaultCategories.forEach(([key, title]) => addCategory(key, title));
    function updateCategories() {
      for (const [key, {tab, count}] of categoryButtons) {
        const active = key === state.category; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
        const number = key === 'all' ? (state.counts.all ?? state.counts.total) : state.counts[key];
        count.textContent = Number.isFinite(number) ? Number(number).toLocaleString('pt-BR') : '';
        count.hidden = !Number.isFinite(number);
      }
      resultsScroll.setAttribute('aria-labelledby', 'search-category-' + state.category);
      const selected = categoryButtons.get(state.category)?.tab;
      if (selected) categories.scrollTo({left:Math.max(0, selected.offsetLeft - categories.offsetLeft - 16), behavior:'auto'});
    }
    function showMessage(message, error = false) { statusText.textContent = message; status.classList.toggle('is-error', error); }
    function updateBusy(busy) {
      state.busy = busy; resultsScroll.setAttribute('aria-busy', String(busy)); status.classList.toggle('is-loading', busy);
      moreButton.disabled = busy; moreButton.textContent = busy ? 'Buscando…' : 'Mostrar mais resultados';
    }
    async function selectResult(item) {
      close({restoreScroll:false, restoreFocus:false});
      try { await onOpen?.(item); }
      catch (error) { open(state.trigger, {focus:false}); showMessage(error?.message || 'Não foi possível abrir este resultado.', true); }
    }
    function renderItem(item) {
      const card = node('button', 'search-result'); card.type = 'button';
      const meta = node('span', 'search-result-meta');
      const kind = node('span', 'search-result-kind', kindNames[item.kind] || 'Texto');
      meta.append(kind);
      if (item.source) meta.append(node('span', 'search-result-source', item.source));
      const title = node('strong', 'search-result-title');
      const terms = item.terms || state.responseTerms;
      appendHighlighted(title, item.title || 'Abrir texto', terms);
      card.append(meta, title);
      if (item.snippet) { const snippet = node('span', 'search-result-snippet'); appendHighlighted(snippet, item.snippet, terms); card.append(snippet); }
      const reason = typeof item.related === 'string' ? item.related : item.related?.reason || item.reason;
      if (reason) card.append(node('span', 'search-result-reason', reason));
      card.onclick = () => selectResult(item); return card;
    }
    function renderItems() {
      const scroll = resultsScroll.scrollTop;
      results.replaceChildren(...state.items.map(renderItem)); moreButton.hidden = !state.hasMore;
      resultsScroll.scrollTop = scroll;
    }
    function renderSuggestions() {
      state.items = []; state.counts = {}; state.total = 0; state.hasMore = false; state.nextOffset = 0; state.responseTerms = []; state.resultScroll = 0;
      updateCategories(); updateBusy(false); results.replaceChildren(); moreButton.hidden = true;
      resultsScroll.scrollTop = 0;
      showMessage('Pesquise uma palavra ou abra uma passagem.');
      const examples = node('div', 'search-examples');
      for (const term of ['Sangue', 'Amor', 'Fé', 'João 3:16']) {
        const example = node('button', 'search-example', term); example.type = 'button';
        example.onclick = () => { input.value = term; inputChanged(true); }; examples.append(example);
      }
      results.append(examples);
      const suggestions = getSuggestions?.() || [];
      if (suggestions.length) { results.append(node('h3', 'search-suggestions-title', 'Livros da Bíblia')); results.append(...suggestions.map(renderItem)); }
    }
    async function runSearch(append = false) {
      clearTimeout(debounceTimer);
      const query = input.value.trim(); state.query = query; clearButton.hidden = !query;
      const epoch = ++state.epoch;
      if (!query) { renderSuggestions(); return; }
      if (!append) { state.items = []; state.counts = {}; state.hasMore = false; state.nextOffset = 0; state.resultScroll = 0; results.replaceChildren(); resultsScroll.scrollTop = 0; moreButton.hidden = true; updateCategories(); }
      updateBusy(true); showMessage(append ? 'Buscando mais resultados…' : 'Buscando em versículos, notas e índices…');
      try {
        const publication = getPublication?.();
        const response = await search({query, category:state.category, offset:append ? state.nextOffset : 0, limit:40,
          onProgress:message => { if (epoch === state.epoch && dialog.open) showMessage(typeof message === 'string' ? message : message?.message || 'Preparando a busca…'); }});
        if (epoch !== state.epoch || !dialog.open || publication !== getPublication?.()) return;
        state.responseTerms = response.queryTerms || response.terms || query.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
        const nextItems = Array.isArray(response.items) ? response.items : [];
        state.items = append ? state.items.concat(nextItems) : nextItems;
        state.counts = response.counts || {}; state.total = Number(response.total) || 0;
        state.nextOffset = Number.isFinite(response.nextOffset) ? response.nextOffset : (append ? state.nextOffset : 0) + nextItems.length;
        state.hasMore = response.hasMore == null ? state.nextOffset < state.total : Boolean(response.hasMore);
        renderItems(); updateCategories();
        if (state.total) showMessage(response.message || `${state.total.toLocaleString('pt-BR')} ${state.total === 1 ? 'resultado' : 'resultados'} para “${query}”.`);
        else {
          showMessage(response.message || `Nenhum resultado para “${query}”.`);
          const hint = node('p', 'search-empty', 'Tente outra palavra, uma expressão mais curta ou uma referência como João 3:16.'); results.append(hint);
        }
      } catch (error) {
        if (epoch !== state.epoch || !dialog.open) return;
        showMessage(error?.message || 'Não foi possível concluir a busca. Tente novamente.', true);
        if (!append) { const retry = node('button', 'search-retry', 'Tentar novamente'); retry.type = 'button'; retry.onclick = () => runSearch(false); results.replaceChildren(retry); }
      } finally { if (epoch === state.epoch) updateBusy(false); }
    }
    function inputChanged(immediate = false) {
      ++state.epoch; clearTimeout(debounceTimer); state.category = 'all'; clearButton.hidden = !input.value;
      if (immediate || !input.value.trim()) runSearch(false); else debounceTimer = setTimeout(() => runSearch(false), 220);
    }
    function measureViewport() {
      viewportFrame = 0; if (!dialog.open) return;
      const viewport = window.visualViewport;
      const height = Math.max(1, viewport?.height || innerHeight);
      const width = Math.max(1, viewport?.width || innerWidth);
      if (Math.abs(width - state.viewportWidth) > 80) { state.viewportBase = Math.max(height, innerHeight); state.viewportWidth = width; }
      state.viewportBase = Math.max(state.viewportBase, height);
      dialog.style.setProperty('--search-viewport-top', `${Math.max(0, viewport?.offsetTop || 0)}px`);
      dialog.style.setProperty('--search-viewport-left', `${Math.max(0, viewport?.offsetLeft || 0)}px`);
      dialog.style.setProperty('--search-viewport-height', `${height}px`);
      dialog.style.setProperty('--search-viewport-width', `${width}px`);
      dialog.classList.toggle('search-keyboard-open', state.viewportBase - height > 120);
    }
    function queueViewport() { if (!viewportFrame) viewportFrame = requestAnimationFrame(measureViewport); }
    function open(trigger, {focus = true} = {}) {
      const publication = getPublication?.();
      if (state.publication !== publication) { reset(); state.publication = publication; }
      if (dialog.open) { if (focus) input.focus({preventScroll:true}); return; }
      state.trigger = trigger || document.activeElement; state.savedScroll = window.scrollY;
      state.savedPaddingBottom = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
      state.restoreScroll = true; state.restoreFocus = true;
      state.viewportBase = Math.max(innerHeight, window.visualViewport?.height || 0); state.viewportWidth = window.visualViewport?.width || innerWidth;
      document.body.classList.add('sheet-open'); dialog.showModal(); measureViewport();
      viewportEvents?.abort(); viewportEvents = new AbortController();
      const options = {passive:true, signal:viewportEvents.signal};
      window.visualViewport?.addEventListener('resize', queueViewport, options);
      window.visualViewport?.addEventListener('scroll', queueViewport, options);
      addEventListener('resize', queueViewport, options); addEventListener('orientationchange', queueViewport, options);
      if (focus) input.focus({preventScroll:true}); else closeButton.focus({preventScroll:true});
      if (input.value.trim()) { if (!state.items.length || state.query !== input.value.trim()) runSearch(false); else { renderItems(); updateCategories(); resultsScroll.scrollTop = state.resultScroll; } }
      else renderSuggestions();
    }
    function close({restoreScroll = true, restoreFocus = true} = {}) {
      state.restoreScroll = restoreScroll; state.restoreFocus = restoreFocus;
      state.resultScroll = resultsScroll.scrollTop;
      if (dialog.contains(document.activeElement)) document.activeElement.blur();
      if (dialog.open) dialog.close();
    }
    function restoreReadingPosition() {
      // The shared menu restores its reserved space after focusout and two frames.
      // iOS also animates the keyboard: wait for that geometry before finishing.
      const epoch = state.epoch, top = state.savedScroll, deadline = performance.now() + 1200;
      const events = new AbortController();
      const cancel = () => events.abort();
      for (const type of ['pointerdown', 'touchstart', 'wheel'])
        document.addEventListener(type, cancel, {passive:true, signal:events.signal});
      const restore = () => {
        if (events.signal.aborted || dialog.open || epoch !== state.epoch) { cancel(); return; }
        window.scrollTo(0, top);
        const padding = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
        const keyboardClosed = !window.visualViewport || window.visualViewport.height >= state.viewportBase - 120;
        if (performance.now() >= deadline || keyboardClosed && padding >= state.savedPaddingBottom - 1 && Math.abs(window.scrollY - top) <= 1) cancel();
        else requestAnimationFrame(restore);
      };
      requestAnimationFrame(restore);
    }
    function reset() {
      ++state.epoch; clearTimeout(debounceTimer); state.query = ''; state.category = 'all'; state.items = []; state.responseTerms = [];
      input.value = ''; clearButton.hidden = true; renderSuggestions();
    }
    input.addEventListener('input', () => inputChanged());
    input.addEventListener('focus', queueViewport);
    form.addEventListener('submit', event => { event.preventDefault(); runSearch(false); });
    clearButton.onclick = () => { input.value = ''; inputChanged(true); input.focus({preventScroll:true}); };
    closeButton.onclick = () => close(); moreButton.onclick = () => { if (!state.busy) runSearch(true); };
    dialog.addEventListener('cancel', () => { state.resultScroll = resultsScroll.scrollTop; });
    dialog.addEventListener('close', () => {
      ++state.epoch; clearTimeout(debounceTimer); viewportEvents?.abort(); cancelAnimationFrame(viewportFrame); viewportFrame = 0; updateBusy(false);
      if (!document.querySelector('dialog[open]')) document.body.classList.remove('sheet-open');
      if (state.restoreScroll) restoreReadingPosition();
      if (state.restoreFocus && state.trigger?.isConnected) state.trigger.focus({preventScroll:true});
    });
    updateCategories();
    return {open, close, reset};
  };
})();
