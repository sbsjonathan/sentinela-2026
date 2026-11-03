// Resolve from this script so the reader works under any application base path.
const BIBLE_HOLD_MS = 150;
const BIBLE_OPEN_DELAY_MS = 100;
const articleBibleDataRoot = new URL('data/', document.currentScript.src);
let articleBibleSession = null;
const articleBibleReaderRoutes = import(new URL('../../biblia/legacy-routes.js', document.currentScript.src).href).catch(() => null);

// scriptbbl.js - Versão final com "Robô 2.0" E suporte a referências complexas.

document.addEventListener('cacheRestored', () => {
  const modal = document.getElementById('modal-biblia');
  const modalCorpo = document.getElementById('modal-biblia-corpo');
  const botaoFechar = document.getElementById('modal-biblia-fechar');
  const modalContent = modal?.querySelector('.modal-biblia-content');
  if (!modal || !modalCorpo || !botaoFechar || !modalContent || typeof ABREVIACOES === 'undefined') return;
  if (articleBibleSession?.modal === modal) {
    articleBibleSession.bind(document);
    return;
  }
  articleBibleSession?.controller.abort();
  const controller = new AbortController(), cleanupTimers = [];
  const listen = (target, type, handler) => target.addEventListener(type, handler, {signal:controller.signal});
  articleBibleSession = {modal, controller, bind:bindReferences};
  console.log('🟢 scriptbbl.js ouviu o sinal. Iniciando...');

  // Old cached articles may contain .no-wrap spans. Let references wrap
  // normally without rewriting paragraph HTML or replacing existing links.
  let wrapStyle = document.getElementById('style-no-wrap');
  if (!wrapStyle) {
    wrapStyle = document.createElement('style');
    wrapStyle.id = 'style-no-wrap';
    document.head.appendChild(wrapStyle);
  }
  wrapStyle.textContent = '.no-wrap { white-space: normal; }';

  let isModalOpen = false, modalEpoch = 0;
  const boundReferences = new WeakSet(), bookRequests = new Map();

  function blockTextSelection() {
    document.body.classList.add('no-select-global');
  }

  function unblockTextSelection() {
    document.body.classList.remove('no-select-global');
  }

  const isStudyLabel = el => /^notas?\s+de\s+estudo$/i.test(el.textContent.trim().replace(/\s+/g, ' '));
  const studySource = el => ({href:el.getAttribute('href') || '', targetVerses:el.getAttribute('data-targetverses') || ''});
  function bindReferences(container) {
    container.querySelectorAll('.bbl').forEach(bindReference);
    for (const el of container.querySelectorAll('a[href], a[data-targetverses]')) {
      if (!isStudyLabel(el) || boundReferences.has(el)) continue;
      articleBibleReaderRoutes.then(routes => {
        if (!controller.signal.aborted && el.isConnected && routes?.bibleStudyURL(studySource(el), ABREVIACOES)) {
          el.classList.add('bbl');
          bindReference(el);
        }
      });
    }
  }
  function resolveStudyLink(el, routes) {
    const source = studySource(el);
    if (source.href || source.targetVerses) return routes.bibleStudyURL(source, ABREVIACOES);
    // Old downloaded articles lost the source URL. Only an unambiguous verse
    // immediately preceding this label in the same paragraph can restore it.
    const paragraph = el.closest('p');
    const preceding = [...paragraph?.querySelectorAll('.bbl') || []].filter(link => link !== el && link.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    for (const link of preceding.reverse()) {
      if (routes.parseBibleReferences(link.textContent, ABREVIACOES).length) return routes.bibleStudyURL({reference:link.textContent}, ABREVIACOES);
    }
    return null;
  }

  // Questions and article paragraphs open on a tap; other contexts keep the hold.
  function bindReference(el) {
    if (boundReferences.has(el)) return;
    boundReferences.add(el);
    el.dataset.processado = 'true';
    el.style.cursor = 'pointer';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    let pressTimer = null, openTimer = null, suppressClickUntil = 0;
    let moveTooMuch = false, tapPending = false, startX = 0, startY = 0;
    cleanupTimers.push(() => {
      clearTimeout(pressTimer); clearTimeout(openTimer);
      el.classList.remove('pressionando', 'ref-aberta');
    });

    function resetAppearance() {
      clearTimeout(pressTimer);
      el.classList.remove('pressionando', 'ref-aberta');
      if (!isModalOpen) setTimeout(() => { if (!isModalOpen && !controller.signal.aborted) unblockTextSelection(); }, 50);
    }
    function cancelPress() {
      moveTooMuch = true;
      tapPending = false;
      clearTimeout(openTimer);
      resetAppearance();
    }
    listen(el, 'touchstart', e => {
      clearTimeout(pressTimer); clearTimeout(openTimer);
      tapPending = false;
      suppressClickUntil = performance.now() + 1200;
      if (e.touches.length !== 1) { cancelPress(); return; }
      moveTooMuch = false;
      const touch = e.touches[0];
      startX = touch.clientX; startY = touch.clientY;
      el.classList.add('pressionando');
      if (el.closest('.pergunta, .paragrafo')) {
        tapPending = true;
        return;
      }
      blockTextSelection();
      pressTimer = setTimeout(() => {
        if (moveTooMuch) return;
        el.classList.remove('pressionando'); el.classList.add('ref-aberta');
        openTimer = setTimeout(() => {
          abrirModalSeForRef(el);
          el.classList.remove('ref-aberta');
        }, BIBLE_OPEN_DELAY_MS);
      }, BIBLE_HOLD_MS);
    });
    listen(el, 'touchmove', e => {
      const touch = e.touches[0];
      if (!touch || e.touches.length !== 1 || Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) cancelPress();
    });
    listen(el, 'touchend', e => {
      suppressClickUntil = performance.now() + 800;
      const openOnTap = tapPending && !moveTooMuch && e.touches.length === 0;
      tapPending = false;
      // Once the hold is accepted, releasing during its feedback may still open.
      resetAppearance();
      if (openOnTap) abrirModalSeForRef(el);
    });
    listen(el, 'touchcancel', cancelPress);
    listen(el, 'click', e => {
      e.preventDefault();
      // Ignore the synthesized click after touch: avoid duplicate opens or bypassing a hold.
      if (performance.now() < suppressClickUntil) return;
      abrirModalSeForRef(el);
    });
    listen(el, 'keydown', e => {
      if (!['Enter', ' '].includes(e.key) || e.repeat) return;
      e.preventDefault();
      abrirModalSeForRef(el);
    });
    listen(el, 'contextmenu', e => e.preventDefault());
  }
  bindReferences(document);

  async function abrirModalBibl(referencia, references) {
    const epoch = ++modalEpoch;
    isModalOpen = true;
    document.dispatchEvent(new CustomEvent('sentinela:bible-preview-open', {detail:{reference:referencia}}));
    blockTextSelection();
    modal.style.display = 'flex';
    document.body.style.overflow = "hidden";
    modalCorpo.dataset.reference = referencia;
    modalCorpo.innerHTML = '<h3>Carregando...</h3>';
    const resultado = await buscarReferencias(references);
    if (!isModalOpen || epoch !== modalEpoch || controller.signal.aborted) return;
    modalCorpo.innerHTML = `<h3>${resultado.titulo}</h3><div>${resultado.texto}</div>`;
    modalCorpo.scrollTop = 0;
    if (resultado.valid) {
      const routes = await articleBibleReaderRoutes;
      if (routes && isModalOpen && epoch === modalEpoch && !controller.signal.aborted) routes.appendBibleChapterLink(modalCorpo, referencia, ABREVIACOES);
    }
  }

  async function abrirModalSeForRef(el) {
    const ref = el.textContent.trim();
    const routes = await articleBibleReaderRoutes;
    if (controller.signal.aborted) return;
    if (routes && isStudyLabel(el)) {
      const url = resolveStudyLink(el, routes);
      if (url) location.assign(url.href);
      else if (!isModalOpen) unblockTextSelection();
      return;
    }
    const references = routes?.parseBibleReferences(ref, ABREVIACOES) || [];
    if (references.length) abrirModalBibl(ref, references);
    else if (!isModalOpen) unblockTextSelection();
  }

  function fecharModal() {
    ++modalEpoch;
    modal.style.display = 'none';
    document.body.style.overflow = "";
    isModalOpen = false;
    setTimeout(() => { if (!isModalOpen && !controller.signal.aborted) unblockTextSelection(); }, 100);
  }

  listen(botaoFechar, 'click', fecharModal);
  listen(modal, 'click', fecharModal);
  listen(modalContent, 'click', e => e.stopPropagation());
  listen(modalContent, 'touchstart', e => e.stopPropagation());
  listen(window, 'keydown', e => { if (e.key === 'Escape') fecharModal(); });

  controller.signal.addEventListener('abort', () => {
    ++modalEpoch; isModalOpen = false;
    cleanupTimers.forEach(cleanup => cleanup());
    modal.style.display = 'none';
    document.body.style.overflow = '';
    unblockTextSelection();
  }, {once:true});

  function loadBook(slug) {
    if (!bookRequests.has(slug)) {
      const request = fetch(new URL(slug + '.json', articleBibleDataRoot)).then(async response => {
        if (!response.ok) throw new Error('Livro indisponível.');
        const data = await response.json();
        if (!Array.isArray(data.capitulos)) throw new Error('Livro indisponível.');
        return data;
      }).catch(error => { bookRequests.delete(slug); throw error; });
      bookRequests.set(slug, request);
    }
    return bookRequests.get(slug);
  }

  function renderVerses(verses) {
    const severalChapters = new Set(verses.map(verse => verse.capitulo)).size > 1;
    let html = '', paragraph = '', chapter = null;
    const flush = () => { if (paragraph) html += `<p>${paragraph}</p>`; paragraph = ''; };
    for (const verse of verses) {
      if (severalChapters && chapter !== verse.capitulo) {
        flush();
        if (chapter !== null) html += '<div style="margin:20px 0 15px;border-top:2px solid #ddd;padding-top:15px"></div>';
        html += `<div style="margin-bottom:12px"><strong style="font-style:italic;color:#666">Capítulo ${verse.capitulo}</strong></div>`;
      }
      chapter = verse.capitulo;
      if (verse.novo_paragrafo) flush();
      paragraph += `${paragraph ? ' ' : ''}<strong>${verse.verso}</strong> ${verse.texto}`;
    }
    flush();
    return html;
  }

  async function buscarReferencias(references) {
    const results = [];
    try {
      for (const reference of references) {
        const data = await loadBook(reference.slug), verses = [], seen = new Set();
        const add = (verse, chapter) => {
          const key = chapter + ':' + verse.verso;
          if (!seen.has(key)) { seen.add(key); verses.push({...verse, capitulo:chapter}); }
        };
        if (reference.chapterOnly) {
          const chapter = data.capitulos.find(item => Number(item.capitulo) === reference.chapter);
          for (const verse of chapter?.versiculos || []) add(verse, reference.chapter);
        } else {
          for (const range of reference.ranges) {
            const first = data.capitulos.find(item => Number(item.capitulo) === range.chapter);
            const last = data.capitulos.find(item => Number(item.capitulo) === range.endChapter);
            if (!first?.versiculos?.some(verse => Number(verse.verso) === range.verse) || !last?.versiculos?.some(verse => Number(verse.verso) === range.endVerse)) {
              return {titulo:'Não encontrado', texto:'Esta passagem não está disponível nesta Bíblia.', valid:false};
            }
            for (let chapter = range.chapter; chapter <= range.endChapter; chapter++) {
              const item = data.capitulos.find(value => Number(value.capitulo) === chapter);
              const start = chapter === range.chapter ? range.verse : 1;
              const end = chapter === range.endChapter ? range.endVerse : Infinity;
              for (const verse of item?.versiculos || []) if (verse.verso >= start && verse.verso <= end) add(verse, chapter);
            }
          }
        }
        if (!verses.length) return {titulo:'Não encontrado', texto:'Esta passagem não está disponível nesta Bíblia.', valid:false};
        const name = data.nome_do_livro || reference.slug;
        results.push({titulo:`${name} ${reference.chapter}${reference.chapterOnly ? '' : ':' + reference.verseSpec}`, texto:renderVerses(verses)});
      }
      return {titulo:results.map(result => result.titulo).join('; '), texto:results.map(result => result.texto).join('<div style="margin-top:15px"></div>'), valid:results.length > 0};
    } catch {
      return {titulo:'Não foi possível abrir a passagem', texto:'Confira sua conexão ou tente novamente. As passagens já baixadas continuam disponíveis.', valid:false};
    }
  }

  window.ativarLinksBiblicos = articleBibleSession.bind;
});
