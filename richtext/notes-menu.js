/* Both navbar menus use the same shell. Notes keeps its own editor and commands. */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const editor = document.getElementById('editor');
  const scroller = document.getElementById('editorScroll');
  const toolbar = document.getElementById('kbdToolbar');
  const trigger = document.querySelector('.bottom-navbar [data-page="notes"]');
  if (!editor || !scroller || !toolbar || !trigger) return;

  const icons = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    reader: '<path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    back: '<path d="m14 5-7 7 7 7"/>',
    undo: '<path d="m8 5-5 5 5 5M3 10h10a7 7 0 0 1 7 7v1"/>',
    redo: '<path d="m16 5 5 5-5 5m5-5H11a7 7 0 0 0-7 7v1"/>',
    paste: '<path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3"/><rect x="9" y="3" width="6" height="4" rx="1.5"/><path d="M8 12h8m-8 4h5"/>',
    bold: '<path d="M6.5 4.5h6a3.8 3.8 0 0 1 0 7.5h-6Zm0 7.5h7a3.8 3.8 0 0 1 0 7.5h-7Z" stroke-width="2.5"/>',
    italic: '<path d="M11 4h7M6 20h7m2-16L9 20"/>',
    font: '<path d="m2.5 18 5-13 5 13m-8-4h6m3-3c3-3 7-2 7 1v6m0-5.5c-6-2-9 5.5-3.5 5.5 1.5 0 2.8-.9 3.5-2"/>',
    textColor: '<path d="m6 16 5.8-12L18 16m-9.8-4h7.6"/><path class="notes-color-line" d="M4 20h16" stroke-width="3"/>',
    backgroundColor: '<path d="m13 5 6 6m-1-8 3 3a2 2 0 0 1 0 3l-8.5 8.5-5-5L16 4a2 2 0 0 1 2-1ZM8 13l-3 4 2 2 4-3"/><path class="notes-color-line" d="M3 21h12" stroke-width="2.5"/>',
    reset: '<path d="m5 12 8-8a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3l-8 8H9l-4-4a2 2 0 0 1 0-3Zm3-3 7 7m-2 3h7"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M3 6h.1M3 12h.1M3 18h.1" stroke-width="3"/>',
    orderedList: '<path d="M10 6h11M10 12h11M10 18h11M3 4h1v4M3 8h2M2.5 12c0-1.5 3-1.5 3 0 0 1.2-2.5 2-2.5 3h2.5M2.5 18.2h2.7l-1.5 1.3c2.2.1 2 2.2-1 1.6" />',
    toggle: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="m7 9 3 3-3 3m6-3h4"/>',
    moveUp: '<path d="m6 12 6-6 6 6m-6-6v14"/>',
    moveDown: '<path d="m6 12 6 6 6-6m-6 6V4"/>',
    collapseAll: '<path d="m7 4 5 5 5-5M5 12h14m-12 8 5-5 5 5"/>',
    expandAll: '<path d="m7 8 5-5 5 5M5 12h14m-12 4 5 5 5-5"/>',
    cloud: '<path d="M6.5 18.5a5 5 0 0 1-.6-10A7 7 0 0 1 19 7.8a5.4 5.4 0 0 1-2 10.7Z"/>',
    performance: '<rect x="2" y="6.5" width="17" height="11" rx="2.5"/><path d="M22 10v4M5 10h10v4H5z"/>',
    clear: '<path d="M3.5 6h17M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6m-9.5 0 .8 13a2 2 0 0 0 2 2h7.4a2 2 0 0 0 2-2l.8-13M10 10v7m4-7v7"/>',
    next: '<path d="m9 6 6 6-6 6"/>'
  };
  const labels = {
    search: 'Buscar na anotação', reader: 'Modo Bíblia', undo: 'Desfazer', redo: 'Refazer', paste: 'Colar sem formatação',
    bold: 'Negrito', italic: 'Itálico', font: 'Estilos e tamanho', textColor: 'Cor do texto', backgroundColor: 'Destaque', reset: 'Limpar formato',
    list: 'Marcadores', orderedList: 'Numerada', toggle: 'Toggle', moveUp: 'Mover acima', moveDown: 'Mover abaixo',
    collapseAll: 'Recolher todos', expandAll: 'Expandir todos', cloud: 'Dados na nuvem', performance: 'Desempenho', clear: 'Apagar conteúdo'
  };
  const svg = key => `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${icons[key]}</svg>`;
  const shortcutLabels = {search:'Buscar', paste:'Colar texto', reader:'Modo Bíblia', cloud:'Nuvem', performance:'Desempenho', clear:'Apagar'};
  function shortcut(key) {
    const tone = {cloud:'action-card--cloud', performance:'action-card--perf is-normal', clear:'action-card--danger'}[key] || '';
    return `<button type="button" class="action-card ${tone}" data-notes-action="${key}" aria-label="${labels[key]}">
      <span class="action-card__icon">${svg(key)}</span><span class="action-card__label">${shortcutLabels[key]}</span></button>`;
  }
  function tool(key, variant = 'tile') {
    return `<button type="button" class="app-menu__item notes-tool notes-tool--${variant}" data-notes-action="${key}" aria-label="${labels[key]}">${svg(key)}<span>${labels[key]}</span></button>`;
  }
  const tabs = [['edit','Editar'], ['organize','Organizar']];
  const panel = document.createElement('section');
  panel.id = 'notes-tools';
  panel.className = 'app-menu';
  panel.setAttribute('aria-label', 'Menu de Anotações');
  panel.setAttribute('aria-hidden', 'true');
  panel.hidden = panel.inert = true;
  panel.innerHTML = `<div class="app-menu__scroll notes-tools-scroll" role="dialog" aria-labelledby="notes-tools-heading">
    <section class="app-menu__card notes-menu-main">
      <header class="app-menu__heading">
        <button type="button" id="notes-tools-back" class="app-menu__close" aria-label="Voltar às ferramentas" hidden>${svg('back')}</button>
        <h2 id="notes-tools-heading">Anotações</h2>
        <button type="button" id="notes-tools-close" class="app-menu__close" aria-label="Fechar menu">${svg('close')}</button>
      </header>
      <div class="app-menu__controls" id="notes-tools-shortcuts"><div class="acoes-grid">${Object.keys(shortcutLabels).map(shortcut).join('')}</div></div>
    <form role="search" id="notes-search" data-notes-detail="search" hidden>
      <label class="notes-sr-only" for="notes-search-input">Buscar na anotação</label>
      <div class="notes-search-bar"><input type="search" class="notes-input" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search" id="notes-search-input" placeholder="Palavra ou referência">
        <button type="button" class="notes-icon-button" id="notes-search-prev" aria-label="Resultado anterior">${svg('moveUp')}</button>
        <button type="button" class="notes-icon-button" id="notes-search-next" aria-label="Próximo resultado">${svg('moveDown')}</button>
      </div><p id="notes-search-count" class="notes-status" role="status"></p>
    </form>
    <div data-notes-detail="paste" hidden>
      <p class="notes-status" id="notes-paste-status" role="status"></p>
      <div id="notes-paste-manual" hidden><label class="notes-field-label" for="notes-paste-text">Cole o texto aqui</label>
        <textarea id="notes-paste-text" class="notes-input" rows="3"></textarea></div>
      <div class="notes-dialog-actions"><button class="notes-action-secondary" id="notes-paste-cancel" type="button">Cancelar</button><button type="button" id="notes-paste-insert" class="notes-action-primary" disabled hidden>Inserir</button></div>
    </div>
    <div data-notes-detail="clear" hidden>
      <p id="notes-clear-question" class="notes-confirm-question"></p>
      <p class="notes-setting-description">Os textos e tópicos desta anotação serão apagados. Você poderá usar Desfazer.</p>
      <div class="notes-dialog-actions"><button type="button" id="notes-clear-cancel" class="notes-action-secondary">Cancelar</button><button type="button" id="notes-clear-confirm" class="notes-action-danger">Apagar conteúdo</button></div>
    </div>
    <div id="notes-settings" hidden></div>
    </section>
    <section class="app-menu__card notes-menu-tools" aria-labelledby="notes-tools-subheading">
      <div class="app-menu__heading"><h2 id="notes-tools-subheading">Ferramentas</h2></div>
      <div class="notes-tools-tabs" role="tablist" aria-label="Ferramentas da anotação">
        ${tabs.map(([key,label]) => `<button type="button" role="tab" id="notes-tab-${key}" data-notes-tab="${key}" aria-controls="notes-page-${key}" aria-selected="${key === 'edit'}" tabindex="${key === 'edit' ? 0 : -1}">${label}</button>`).join('')}
      </div>
      <div role="tabpanel" id="notes-page-edit" data-notes-page="edit" aria-labelledby="notes-tab-edit">
        <div class="notes-tools-grid">${['undo','redo','bold','italic','font','textColor','backgroundColor','reset'].map(key=>tool(key)).join('')}</div>
        <div id="notes-tools-font" hidden>
          <div class="notes-block-styles" role="group" aria-label="Estilo do parágrafo">
            ${[['normal','Normal'],['h1','Título'],['h2','Subtítulo'],['h3','Seção']].map(([key,label])=>`<button type="button" class="app-menu__item" data-notes-style="${key}">${label}</button>`).join('')}
          </div>
          <div class="notes-size-control"><label for="notes-tools-font-level">Tamanho da fonte global</label>
            <input id="notes-tools-font-level" type="range" min="1" max="11" step="1" value="3">
          </div>
        </div>
      </div>
      <div role="tabpanel" id="notes-page-organize" data-notes-page="organize" aria-labelledby="notes-tab-organize" hidden>
        <div class="notes-tools-grid notes-tools-grid--three">${['list','orderedList','toggle'].map(key=>tool(key)).join('')}</div>
        <label class="notes-field-label" for="notes-move-target">Tópico para mover</label>
        <select class="notes-input" id="notes-move-target"></select>
        <div class="notes-tools-pairs">${['moveUp','moveDown','collapseAll','expandAll'].map(key=>tool(key,'pair')).join('')}</div>
      </div>
      <p id="notes-tools-message" class="notes-status" role="status"></p>
    </section>
  </div>`;
  document.body.append(panel);
  const searchSpace = document.createElement('div');
  searchSpace.setAttribute('aria-hidden','true');
  searchSpace.hidden = true;
  scroller.prepend(searchSpace);

  const get = selector => panel.querySelector(selector);
  const buttons = Object.fromEntries(Array.from(panel.querySelectorAll('[data-notes-action]'), b=>[b.dataset.notesAction,b]));
  const pages = Array.from(panel.querySelectorAll('[data-notes-page]'));
  const tabButtons = Array.from(panel.querySelectorAll('[data-notes-tab]'));
  const slider = get('#notes-tools-font-level'), fontArea = get('#notes-tools-font');
  const moveSelect = get('#notes-move-target'), searchInput = get('#notes-search-input');
  const pasteInput = get('#notes-paste-text'), message = get('#notes-tools-message');
  const textColor = toolbar.querySelector('.color-indicator.text'), backgroundColor = toolbar.querySelector('.color-indicator.bg');
  const markSources = {bold: toolbar.querySelector('[aria-label="Negrito"]'), italic: toolbar.querySelector('[aria-label="Itálico"]')};
  buttons.font.setAttribute('aria-controls', fontArea.id);
  buttons.font.setAttribute('aria-expanded', 'false');
  let open = false, frame = 0, activeTab = 'edit', detail = '';
  let moveFields = [], chosenField = null, moveChoicesDirty = true, pasteTarget = null, clearContext = null;

  function saveSelection() { M4_Caret.saveR(); }
  function selectionRange() {
    const live = window.getSelection();
    const range = live?.rangeCount && editor.contains(live.anchorNode) ? live.getRangeAt(0) : M1_Config.state.lastR;
    return range && editor.contains(range.startContainer) && editor.contains(range.endContainer) ? range : null;
  }
  function rangeAt(field) {
    const range = document.createRange();
    range.selectNodeContents(field); range.collapse(false);
    return range;
  }
  function restoreSelection() {
    const current = selectionRange() || (editor.querySelector('.editable') && rangeAt(editor.querySelector('.editable')));
    if (!current) return false;
    M1_Config.state.lastR = current.cloneRange();
    M4_Caret.restR();
    return true;
  }
  function focusMenuButton(button) {
    if (!open || detail || !button || button.disabled) return;
    // Formatting and paste use the live editing host. Park the new selection
    // before returning focus to the overlay so iOS can dismiss the keyboard.
    saveSelection();
    button.focus({preventScroll:true});
  }
  function moveRange() {
    return chosenField && editor.contains(chosenField) ? rangeAt(chosenField) : selectionRange();
  }
  function syncMoveChoices() {
    if (moveChoicesDirty) {
      moveChoicesDirty = false;
      moveFields = Array.from(editor.querySelectorAll('.row > .editable')).filter(field => !field.closest('.children[hidden]'));
      if (chosenField && !moveFields.includes(chosenField)) chosenField = null;
      const options = [new Option('Escolher tópico…', '')];
      for (const [i, field] of moveFields.entries()) {
        const text = field.textContent.replace(/[\s\u200b\ufeff]+/gu,' ').trim();
        const label = text || (field.classList.contains('toggle-title') ? 'Toggle vazio' : 'Bloco vazio');
        const depth = M2_Query.getLvl(field.closest('[data-level]'));
        options.push(new Option(`${i + 1}. ${'› '.repeat(depth)}${label.slice(0,80)}`, String(i)));
      }
      moveSelect.replaceChildren(...options);
    }
    const field = M2_Query.closest(moveRange()?.startContainer, '.editable');
    const selected = moveFields.indexOf(field);
    moveSelect.value = selected < 0 ? '' : String(selected);
  }
  function sync() {
    frame = 0;
    if (!open) return;
    const current = selectionRange();
    const field = M2_Query.closest(current?.startContainer, '.editable');
    const paragraph = field?.closest('.node-paragraph');
    const reading = !!window.LeitorMode?.isActive();
    const listType = window.NotesEditorActions?.getListType?.();
    const inOrganize = activeTab === 'organize' && !detail;
    if (inOrganize) syncMoveChoices();
    const blocks = window.NotesBlockActions?.state(inOrganize ? moveRange() : current);
    const disabled = {
      undo: !window.M12_History?.canUndo(), redo: !window.M12_History?.canRedo(),
      list: field?.classList.contains('toggle-title'), orderedList: field?.classList.contains('toggle-title'),
      moveUp: !blocks?.canMoveUp, moveDown: !blocks?.canMoveDown, collapseAll: !blocks?.canCollapse,
      expandAll: !blocks?.canExpand, clear: !blocks?.canClear
    };
    const pressed = {bold: markSources.bold?.classList.contains('is-active'), italic: markSources.italic?.classList.contains('is-active'),
      reader: reading, list: listType === 'unordered', orderedList: listType === 'ordered'};
    for (const [key, button] of Object.entries(buttons)) {
      button.disabled = !!disabled[key] || (reading && !['reader','font','search','cloud','performance'].includes(key));
      if (key in pressed) button.setAttribute('aria-pressed', String(!!pressed[key]));
    }
    const economical = window.EditorPerfProfile?.getPreference() === 'low';
    buttons.performance.classList.toggle('is-normal', !economical);
    buttons.performance.classList.toggle('is-low', economical);
    moveSelect.disabled = reading;
    const style = ['h1','h2','h3'].find(key => paragraph?.classList.contains('font-' + key)) || 'normal';
    panel.querySelectorAll('[data-notes-style]').forEach(b => {
      b.disabled = reading || (!!field && !paragraph);
      b.setAttribute('aria-pressed', String(style === b.dataset.notesStyle));
    });
    const level = window.GlobalFontScale?.getLevel() || 3;
    slider.value = String(level);
    slider.setAttribute('aria-valuetext', `Nível ${level} de 11${level === 3 ? ', padrão' : ''}`);
    buttons.textColor.style.setProperty('--notes-ink',textColor?.style.color || 'currentColor');
    buttons.backgroundColor.style.setProperty('--notes-ink',backgroundColor?.style.backgroundColor === 'transparent' ? 'currentColor' : backgroundColor?.style.backgroundColor || 'currentColor');
  }
  function queueSync() { if (open && !frame) frame = requestAnimationFrame(sync); }
  function showPage() {
    for (const page of pages) page.hidden = !!detail || page.dataset.notesPage !== activeTab;
    for (const tab of tabButtons) {
      const active = tab.dataset.notesTab === activeTab;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    }
    get('.notes-menu-tools').hidden = !!detail;
    get('#notes-tools-shortcuts').hidden = !!detail;
    get('#notes-tools-back').hidden = !detail;
    get('#notes-tools-heading').textContent = detail ? labels[detail] : 'Anotações';
    for (const content of panel.querySelectorAll('[data-notes-detail]')) content.hidden = content.dataset.notesDetail !== detail;
    get('#notes-settings').hidden = detail !== 'cloud' && detail !== 'performance';
    panel.classList.toggle('is-detail', !!detail);
    panel.classList.toggle('is-searching', detail === 'search');
    // While searching, leave the note interactive beneath the compact search bar.
    get('.notes-tools-scroll').setAttribute('role', detail === 'search' ? 'region' : 'dialog');
    syncSearchSpace();
    queueSync();
  }
  function syncSearchSpace() {
    const height = detail === 'search' && open ? panel.offsetHeight : 0;
    const before = searchSpace.offsetHeight, position = scroller.scrollTop;
    if (before === height) return;
    searchSpace.hidden = !height;
    searchSpace.style.height = height + 'px';
    if (position > 0) scroller.scrollTop = Math.max(0, position + height - before);
  }
  new ResizeObserver(syncSearchSpace).observe(panel);
  function sizeDetailSheet() {
    if (!open || !window.visualViewport) return;
    panel.style.setProperty('--notes-panel-viewport', visualViewport.height + 'px');
    panel.style.setProperty('--notes-panel-top', visualViewport.offsetTop + 'px');
  }
  window.visualViewport?.addEventListener('resize', sizeDetailSheet, {passive:true});
  window.visualViewport?.addEventListener('scroll', sizeDetailSheet, {passive:true});
  function currentClearContext() {
    const note = window.cacheRichText?.snapshot();
    return note && {key: note.key, week: note.payload.semana, account: window.AutoSaveManager?.accountId};
  }
  function cancelClear() {
    if (detail !== 'clear') return;
    back(); message.textContent = 'A anotação ou a conta mudou. Confira o conteúdo antes de apagar.';
  }
  function leaveDetail() {
    clearContext = null;
    if (detail === 'search') {
      searchInput.blur(); searchInput.value = ''; window.NotesTextTools?.clearSearch(); showResults({index:0,total:0});
    }
    if (detail === 'paste') {
      pasteTarget?.cancel(); pasteTarget = null; pasteInput.value = '';
    }
    if (detail === 'cloud' || detail === 'performance') window.NotesSettings?.close();
    detail = '';
  }
  function back(focus = true) {
    const previous = detail;
    leaveDetail(); showPage(); message.textContent = '';
    get('.notes-tools-scroll').scrollTop = 0;
    if (focus) buttons[previous]?.focus({preventScroll:true});
  }
  function openDetail(key) {
    leaveDetail();
    detail = key; message.textContent = ''; sizeDetailSheet(); showPage(); get('.notes-tools-scroll').scrollTop = 0;
    if (key === 'search') searchInput.focus({preventScroll:true});
    if (key === 'clear') {
      clearContext = currentClearContext();
      const week = document.getElementById('notes-week-placeholder').textContent.trim().toLocaleLowerCase('pt-BR');
      get('#notes-clear-question').textContent = `Apagar a anotação da ${week}?`;
      get('#notes-clear-cancel').focus({preventScroll:true});
    }
    if (key === 'cloud' || key === 'performance') {
      window.NotesSettings.open(key, get('#notes-settings'));
      get('#notes-tools-back').focus({preventScroll:true});
    }
  }
  function selectTab(tab) {
    activeTab = tab;
    message.textContent = ''; showPage(); sync();
  }
  function close(restoreFocus = true) {
    const returnFocus = panel.contains(document.activeElement);
    leaveDetail(); open = false; showPage();
    panel.classList.remove('is-open'); panel.hidden = panel.inert = true; panel.setAttribute('aria-hidden', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) {
      const selection = window.getSelection();
      if (editor.contains(selection?.anchorNode)) { saveSelection(); selection.removeAllRanges(); }
      if (returnFocus || editor.contains(document.activeElement)) trigger.focus({preventScroll:true});
    }
  }
  function toggle(event) {
    event?.preventDefault();
    if (open) { close(); return; }
    saveSelection(); open = true; chosenField = null; moveChoicesDirty = true;
    panel.hidden = panel.inert = false; panel.setAttribute('aria-hidden', 'false'); panel.classList.add('is-open');
    message.textContent = ''; showPage(); sync();
    trigger.setAttribute('aria-expanded', 'true'); get('.notes-tools-scroll').scrollTop = 0;
    get('#notes-tools-close').focus({preventScroll:true});
  }
  function showResults({index,total}) {
    get('#notes-search-count').textContent = searchInput.value.trim() ? (total ? `${index} de ${total}` : 'Nenhum resultado') : '';
    get('#notes-search-prev').disabled = get('#notes-search-next').disabled = total < 2;
  }
  function search(step = 0) { showResults(window.NotesTextTools.search(searchInput.value, step)); }
  async function paste() {
    const target = window.NotesTextTools.pasteTarget(selectionRange());
    openDetail('paste'); pasteTarget = target;
    const status = get('#notes-paste-status');
    get('#notes-paste-manual').hidden = true; get('#notes-paste-insert').hidden = true;
    get('#notes-paste-insert').disabled = true;
    status.textContent = 'Lendo a área de transferência…';
    const result = await window.NotesTextTools.paste(target);
    if (!open || detail !== 'paste' || pasteTarget !== target) return;
    if (result === 'manual' || result === 'empty') {
      status.textContent = result === 'empty' ? 'A área de transferência está vazia.' : '';
      get('#notes-paste-manual').hidden = false; get('#notes-paste-insert').hidden = false;
      pasteInput.focus({preventScroll:true});
    } else {
      back(false); focusMenuButton(buttons.paste);
      message.textContent = result === 'inserted' ? 'Texto inserido.' : 'Escolha novamente onde deseja colar.';
    }
  }

  trigger.addEventListener('pointerdown', saveSelection);
  panel.addEventListener('pointerdown', e => {
    saveSelection();
    if (e.pointerType === 'mouse' && e.target.closest('[data-notes-action], [data-notes-style]')) e.preventDefault();
  });
  panel.addEventListener('click', e => {
    if (e.target === panel && detail !== 'search') { close(); return; }
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.notesTab) { selectTab(b.dataset.notesTab); return; }
    if (b.dataset.notesStyle) {
      if (restoreSelection()) window.NotesEditorActions.blockStyle(b.dataset.notesStyle);
      focusMenuButton(b); queueSync(); return;
    }
    const key = b.dataset.notesAction;
    if (!key) return;
    message.textContent = '';
    switch (key) {
      case 'search': case 'cloud': case 'performance': case 'clear': openDetail(key); break;
      case 'paste': paste(); break;
      case 'font': fontArea.hidden = !fontArea.hidden; buttons.font.setAttribute('aria-expanded', String(!fontArea.hidden)); break;
      case 'reader':
        if (window.LeitorMode?.isActive()) window.LeitorMode.desativar();
        else { window.LeitorMode?.ativar(); if (window.LeitorMode?.isActive()) close(false); }
        break;
      case 'undo': case 'redo': window.M12_History?.[key](); focusMenuButton(b); break;
      case 'moveUp': case 'moveDown':
        if (window.NotesBlockActions.move(key === 'moveUp' ? 'up' : 'down', moveRange())) {
          moveChoicesDirty = true; message.textContent = key === 'moveUp' ? 'Tópico movido para cima.' : 'Tópico movido para baixo.';
        }
        break;
      case 'expandAll': case 'collapseAll': window.NotesBlockActions.setAllOpen(key === 'expandAll'); break;
      default:
        if (!restoreSelection()) break;
        if (key === 'toggle') { window.M12_History?.beforeChange(); M7_Actions.newRootToggle(); window.M12_History?.afterChange(2); }
        else window.NotesEditorActions?.[key]?.();
        if (key !== 'textColor' && key !== 'backgroundColor') focusMenuButton(b);
    }
    queueSync();
  });
  moveSelect.addEventListener('change', () => {
    chosenField = moveSelect.value === '' ? null : moveFields[Number(moveSelect.value)];
    message.textContent = ''; sync();
  });
  editor.addEventListener('pointerdown', () => { chosenField = null; });
  get('#notes-search-prev').onclick = () => search(-1);
  get('#notes-search-next').onclick = () => search(1);
  get('#notes-search').onsubmit = e => { e.preventDefault(); search(1); searchInput.blur(); };
  searchInput.addEventListener('input', () => search());
  editor.addEventListener('notes:search-results', e => { if (detail === 'search') showResults(e.detail); });
  pasteInput.addEventListener('input', () => { get('#notes-paste-insert').disabled = !pasteInput.value; });
  get('#notes-paste-insert').onclick = () => {
    const result = window.NotesTextTools.insertPlain(pasteTarget, pasteInput.value);
    back(false); focusMenuButton(buttons.paste); message.textContent = result === 'inserted' ? 'Texto inserido.' : 'Escolha novamente onde deseja colar.';
  };
  get('#notes-clear-confirm').onclick = () => {
    const current = currentClearContext();
    if (!clearContext || !current || clearContext.week !== current.week || clearContext.key !== current.key || clearContext.account !== current.account) {
      cancelClear(); return;
    }
    const cleared = window.NotesBlockActions.clear();
    back(false);
    if (cleared) { selectTab('edit'); message.textContent = 'Conteúdo apagado.'; buttons.undo.focus({preventScroll:true}); }
  };
  for (const id of ['notes-tools-back','notes-clear-cancel','notes-paste-cancel']) get('#' + id).onclick = () => back();
  get('#notes-tools-close').onclick = close;
  slider.oninput = () => window.GlobalFontScale?.setLevel(Number(slider.value));
  panel.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); detail ? back() : close(); return; }
    const i = tabButtons.indexOf(e.target);
    if (i < 0 || !['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length-1 : (i + (e.key==='ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    selectTab(tabs[next][0]); tabButtons[next].focus();
  });
  const picker = document.getElementById('color-picker-overlay');
  let pickerOpener = null;
  for (const key of ['textColor','backgroundColor']) buttons[key].addEventListener('click', () => { pickerOpener = buttons[key]; });
  if (picker) new MutationObserver(() => {
    if (pickerOpener && !picker.classList.contains('open')) {
      focusMenuButton(pickerOpener); pickerOpener = null;
    }
  }).observe(picker, {attributes:true, attributeFilter:['class']});
  new MutationObserver(queueSync).observe(toolbar, {subtree:true, childList:true, attributes:true, attributeFilter:['class','style','disabled','aria-pressed']});
  new MutationObserver(() => { moveChoicesDirty = true; queueSync(); }).observe(editor, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['hidden']});
  document.addEventListener('selectionchange', queueSync);
  document.addEventListener('history:statechange', queueSync);
  window.addEventListener('globalfont:changed', queueSync);
  window.addEventListener('notes:restored', () => {
    if (detail === 'clear') cancelClear();
    if (detail === 'paste') back(false);
    chosenField = null; moveChoicesDirty = true; queueSync();
  });
  for (const event of ['notes:external-updated','supabaseSessionChanged','supabaseLogout']) window.addEventListener(event, cancelClear);
  window.addEventListener('storage', e => { if (e.key === 'supabase_user' || e.key === null) cancelClear(); });
  window.NotesMenu = {toggle, close, get isOpen() { return open; }};
  showResults({index:0,total:0});
});
