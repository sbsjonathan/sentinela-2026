document.addEventListener("DOMContentLoaded", () => {
    const barraEstudo = document.querySelector(".barra-estudo");
    const mainContent = document.querySelector("main");

    if (!barraEstudo || !mainContent || window.SentinelaArticleMenu) return;

    const FONTE_STORAGE_KEY = 'tamanho-fonte-global';
    const FONTE_PADRAO = 19.36;
    const NIVEL_PADRAO = 3;
    const NIVEL_MIN = 1;
    const NIVEL_MAX = 11;
    // Fallback for legacy cached articles whose shared module loads after this menu.
    const TAMANHOS_FONTE = Array.from({ length: NIVEL_MAX }, (_, index) =>
        Number((FONTE_PADRAO * Math.pow(30 / FONTE_PADRAO, (index + 1 - NIVEL_PADRAO) / 8)).toFixed(2))
    );
    const urlParams = new URLSearchParams(window.location.search);
    const semanaAtual = window.semanaAtual || urlParams.get('semana') || 'Atual';
    const estudoId = window.estudoId || document.body.dataset.estudo || '';

    function isPerfLowMode() {
        return document.documentElement.classList.contains('perf-low') || localStorage.getItem('editor-performance-mode') === 'low';
    }

    function aplicarGlowDaCorEstudo() {
        const corGlobal = getComputedStyle(document.body).getPropertyValue('--cor-principal-estudo').trim() || '#51919d';
        let glow = 'rgba(180,180,185,0.15)';
        if (corGlobal.startsWith('#')) {
            const bigint = parseInt(corGlobal.slice(1), 16);
            const r = (bigint >> 16) & 255;
            const g = (bigint >> 8) & 255;
            const b = bigint & 255;
            glow = `rgba(${r},${g},${b},0.18)`;
        } else if (corGlobal.startsWith('rgb')) {
            const [r, g, b] = corGlobal.replace(/[^\d,]/g, '').split(',').map((n) => n.trim());
            glow = `rgba(${r},${g},${b},0.18)`;
        }
        document.documentElement.style.setProperty('--cor-glow', glow);
    }

    function getStaticActionIcon(name) {
        switch (name) {
            case 'font': return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>`;
            case 'cloud': return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18a4 4 0 1 1 .5-7.97A5.5 5.5 0 0 1 18 11a3.5 3.5 0 1 1 0 7H7Z"></path><path d="M12 10v7"></path><path d="m9.5 14.5 2.5 2.5 2.5-2.5"></path></svg>`;
            case 'export': return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
            case 'trash': return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4.8A1.8 1.8 0 0 1 9.8 3h4.4A1.8 1.8 0 0 1 16 4.8V6"></path><path d="M6 6l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"></path><path d="M10 10.5v5.5"></path><path d="M14 10.5v5.5"></path></svg>`;
            default: return '';
        }
    }

    const menuHTML = `
      <div id="sentinela-controles" class="menu-barra" style="display: none;">
        <div class="controle-grupo controle-grupo-acoes">
          <div class="acoes-grid" role="group" aria-label="Ações principais">
            <button id="btn-fonte-toggle" class="action-card" type="button" aria-expanded="false">
              <span class="action-card__icon">${getStaticActionIcon('font')}</span>
              <span class="action-card__label">Fonte</span>
            </button>
            <button id="btn-tema-toggle" class="action-card" type="button" aria-expanded="false">
              <span class="action-card__icon"></span>
              <span class="action-card__label">Tema</span>
            </button>
            <button id="btn-exportar-bin" class="action-card action-card--export" type="button">
              <span class="action-card__icon">${getStaticActionIcon('export')}</span>
              <span class="action-card__label">Backup</span>
            </button>
            <button id="btn-abrir-sync" class="action-card action-card--cloud" type="button" aria-haspopup="dialog" aria-controls="sentinelaSyncOverlay">
              <span class="action-card__icon">${getStaticActionIcon('cloud')}</span>
              <span class="action-card__label">Nuvem</span>
            </button>
            <button id="btn-perf-toggle" class="action-card action-card--perf" type="button">
              <span class="action-card__icon"></span>
              <span class="action-card__label">Desempenho</span>
            </button>
            <button id="btn-limpar-cache" class="action-card action-card--danger" type="button">
              <span class="action-card__icon">${getStaticActionIcon('trash')}</span>
              <span class="action-card__label">Apagar Local</span>
            </button>
          </div>
          <div id="font-options-area" class="expandable-area" hidden>
            <div class="controle-fonte">
              <div class="controle-fonte-topo" aria-hidden="true">
                <span class="fonte-preview fonte-preview-menor">A</span>
                <span class="fonte-preview fonte-preview-maior">A</span>
              </div>
              <div class="range-shell">
                <span class="range-linha" aria-hidden="true"></span>
                <span class="range-ticks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
                <input type="range" id="range-tamanho-fonte" aria-label="Tamanho da fonte" min="${NIVEL_MIN}" max="${NIVEL_MAX}" step="1" value="${NIVEL_PADRAO}">
              </div>
            </div>
          </div>
          <div id="theme-options-area" class="expandable-area" hidden>
            <div class="segmented-control">
              <input type="radio" name="tema" id="theme-system" value="system" checked>
              <input type="radio" name="tema" id="theme-light" value="light">
              <input type="radio" name="tema" id="theme-dark" value="dark">
              <label for="theme-system">Sistema</label>
              <label for="theme-light">Claro</label>
              <label for="theme-dark">Escuro</label>
              <div class="segmented-slider"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    mainContent.insertAdjacentHTML('afterbegin', menuHTML);

    const sheetsHTML = `
      <div class="sync-sheet-overlay" id="sentinelaSyncOverlay" data-state="idle" aria-hidden="true">
        <div class="sync-sheet" role="dialog" aria-modal="true" aria-labelledby="sentinelaSyncTitle">
          <div class="sync-sheet__handle"></div>
          <div class="sync-sheet__inner">
            <div class="sync-sheet__topbar">
              <div class="sync-sheet__title" id="sentinelaSyncTitle">Nuvem da Sentinela</div>
              <button type="button" class="sync-sheet__close" id="sentinelaSyncClose" aria-label="Fechar Nuvem">×</button>
            </div>
            <div class="sync-sheet__tabs" role="group" aria-label="Ação na nuvem">
              <button type="button" class="sync-sheet__tab is-active" data-sync-tab="enviar">Enviar</button>
              <button type="button" class="sync-sheet__tab" data-sync-tab="baixar">Baixar</button>
              <button type="button" class="sync-sheet__tab" data-sync-tab="apagar">Apagar</button>
            </div>
            <section class="sync-sheet__panel" data-sync-panel="enviar">
              <div class="sync-card">
                <div class="sync-options">
                  <label class="sync-choice">
                    <input type="radio" name="sync-enviar" value="merge" data-method="pushMissing" checked>
                    <span class="sync-choice__body">
                      <span class="sync-choice__title">Enviar apenas o que falta</span>
                      <span class="sync-choice__desc">Adiciona as notas que ainda não estão na nuvem e mantém as que já existem lá.</span>
                    </span>
                  </label>
                  <label class="sync-choice">
                    <input type="radio" name="sync-enviar" value="overwrite" data-method="pushOverwrite">
                    <span class="sync-choice__body">
                      <span class="sync-choice__title">Substituir Nuvem</span>
                      <span class="sync-choice__desc">Apaga as anotações deste artigo na nuvem e guarda exatamente como este aparelho está agora.</span>
                    </span>
                  </label>
                </div>
              </div>
            </section>
            <section class="sync-sheet__panel" data-sync-panel="baixar" hidden>
              <div class="sync-card">
                <div class="sync-options">
                  <label class="sync-choice">
                    <input type="radio" name="sync-baixar" value="merge" data-method="pullMissing" checked>
                    <span class="sync-choice__body">
                      <span class="sync-choice__title">Baixar apenas o que falta</span>
                      <span class="sync-choice__desc">Baixa as notas que ainda não estão neste aparelho e mantém as notas locais.</span>
                    </span>
                  </label>
                  <label class="sync-choice">
                    <input type="radio" name="sync-baixar" value="overwrite" data-method="pullOverwrite">
                    <span class="sync-choice__body">
                      <span class="sync-choice__title">Restaurar Aparelho</span>
                      <span class="sync-choice__desc">Apaga as anotações deste aparelho e deixa idêntico ao que está salvo na nuvem.</span>
                    </span>
                  </label>
                </div>
              </div>
            </section>
            <section class="sync-sheet__panel" data-sync-panel="apagar" hidden>
              <div class="sync-card">
                <div class="sync-options">
                  <label class="sync-choice sync-choice--danger">
                    <input type="radio" name="sync-apagar" value="day" data-method="deleteRemote" checked>
                    <span class="sync-choice__body">
                      <span class="sync-choice__title">Apagar este artigo da Nuvem</span>
                      <span class="sync-choice__desc">Remove as anotações da semana ${semanaAtual} da nuvem. O resto continua a salvo.</span>
                    </span>
                  </label>
                </div>
              </div>
            </section>
            <div class="sync-feedback" hidden>
              <div id="sentinelaSyncFeedback" role="status" aria-live="polite" aria-atomic="true">
                <strong class="sync-feedback__title"></strong>
                <p class="sync-feedback__detail"></p>
              </div>
              <button type="button" class="sync-sheet__primary is-danger" id="sentinelaSyncConfirm" aria-describedby="sentinelaSyncFeedback" hidden></button>
            </div>
            <div class="sync-sheet__actions">
              <button type="button" class="sync-sheet__secondary" id="sentinelaSyncCancel" aria-describedby="sentinelaSyncFeedback">Cancelar</button>
              <button type="button" class="sync-sheet__primary" id="sentinelaSyncRun" aria-describedby="sentinelaSyncFeedback">Enviar para a nuvem</button>
            </div>
          </div>
        </div>
      </div>

      <div class="sync-sheet-overlay" id="sentinelaDeleteOverlay" aria-hidden="true">
        <div class="sync-sheet" role="dialog" aria-modal="true">
          <div class="sync-sheet__handle"></div>
          <div class="sync-sheet__inner">
            <div class="sync-sheet__topbar">
              <div class="sync-sheet__title">Limpeza Local</div>
              <button type="button" class="sync-sheet__close" id="sentinelaDeleteClose">×</button>
            </div>
            <div class="sync-card">
              <div class="sync-options">
                <label class="sync-choice sync-choice--danger">
                  <input type="radio" name="local-delete-opt" value="day" checked>
                  <span class="sync-choice__body">
                    <span class="sync-choice__title">Apagar anotações deste artigo</span>
                    <span class="sync-choice__desc">Remove respostas da IA, comentários e destaques deste estudo. A cópia da nuvem só volta ao baixar manualmente.</span>
                  </span>
                </label>
                <label class="sync-choice sync-choice--danger">
                  <input type="radio" name="local-delete-opt" value="all-notes">
                  <span class="sync-choice__body">
                    <span class="sync-choice__title">Apagar de TODAS as Sentinelas</span>
                    <span class="sync-choice__desc">Esvazia todos os artigos locais. As notas do editor e a nuvem são mantidas; baixar manualmente restaura as notas.</span>
                  </span>
                </label>
                <label class="sync-choice sync-choice--danger">
                  <input type="radio" name="local-delete-opt" value="nuclear">
                  <span class="sync-choice__body">
                    <span class="sync-choice__title">Formatar App Inteiro (Opção Nuclear)</span>
                    <span class="sync-choice__desc">Desloga a conta e apaga as anotações e preferências locais da Sentinela.</span>
                  </span>
                </label>
              </div>
            </div>
            <div class="sync-sheet__actions">
              <button type="button" class="sync-sheet__secondary" id="sentinelaDeleteCancel">Cancelar</button>
              <button type="button" class="sync-sheet__primary is-danger" id="sentinelaDeleteRun">Apagar Dados</button>
            </div>
          </div>
        </div>
      </div>

      <div class="sync-sheet-overlay" id="sentinelaExportOverlay" aria-hidden="true">
        <div class="sync-sheet" role="dialog" aria-modal="true">
          <div class="sync-sheet__handle"></div>
          <div class="sync-sheet__inner">
            <div class="sync-sheet__topbar">
              <div class="sync-sheet__title">Backup Local (Offline)</div>
              <button type="button" class="sync-sheet__close" id="sentinelaExportClose">×</button>
            </div>
            <div class="sync-sheet__tabs tabs-2">
              <button type="button" class="sync-sheet__tab is-active" data-exp-tab="exportar">Exportar</button>
              <button type="button" class="sync-sheet__tab" data-exp-tab="importar">Importar</button>
            </div>
            <section class="sync-sheet__panel" data-exp-panel="exportar">
              <div class="sync-card">
                <p class="sync-sheet__meta" style="margin:0;">O arquivo <strong>.bin</strong> contém todas as suas anotações da Sentinela e preferências de leitura salvas no aparelho. Útil para backup offline ou transferir para outro iPhone.</p>
              </div>
            </section>
            <section class="sync-sheet__panel" data-exp-panel="importar" hidden>
              <div class="sync-card">
                <div class="sync-sheet__file">
                  <input id="sentinelaImportFile" class="sync-sheet__file-input" type="file" accept=".bin,.json,application/octet-stream,application/json">
                  <label for="sentinelaImportFile" class="sync-sheet__file-label">Escolher Arquivo BIN</label>
                  <div class="sync-sheet__file-name" id="sentinelaImportFileName">Nenhum arquivo selecionado.</div>
                  <p class="sync-sheet__meta" style="margin:0; margin-top:8px;">Importar sobrescreverá as configurações e anotações locais com as do arquivo.</p>
                </div>
              </div>
            </section>
            <div class="sync-sheet__actions">
              <button type="button" class="sync-sheet__secondary" id="sentinelaExportCancel">Cancelar</button>
              <button type="button" class="sync-sheet__primary" id="sentinelaExportRun">Exportar BIN</button>
            </div>
          </div>
        </div>
      </div>

      <div class="sync-alert-overlay" id="sentinelaAlertOverlay" aria-hidden="true">
        <div class="sync-alert" role="alertdialog">
          <div class="sync-alert__content">
            <h3 class="sync-alert__title" id="sentinelaAlertTitle"></h3>
            <p class="sync-alert__text" id="sentinelaAlertText"></p>
          </div>
          <div class="sync-alert__actions">
            <button class="sync-alert__btn" id="sentinelaAlertBtnLeft"></button>
            <button class="sync-alert__btn sync-alert__btn--right" id="sentinelaAlertBtnRight"></button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', sheetsHTML);

    const menuControles = document.getElementById('sentinela-controles');
    const rangeTamanhoFonte = document.getElementById('range-tamanho-fonte');
    const themeRadios = document.querySelectorAll('input[name="tema"]');
    const btnTemaToggle = document.getElementById('btn-tema-toggle');
    const btnFonteToggle = document.getElementById('btn-fonte-toggle');
    const btnPerfToggle = document.getElementById('btn-perf-toggle');
    const btnLimparCache = document.getElementById('btn-limpar-cache');
    const btnExportarBin = document.getElementById('btn-exportar-bin');
    const btnAbrirSync = document.getElementById('btn-abrir-sync');
    const themeOptionsArea = document.getElementById('theme-options-area');
    const fontOptionsArea = document.getElementById('font-options-area');

    let menuVisivel = false;

    // Move the existing controls, rather than cloning them: backup, cloud,
    // preferences and deletion keep their original state and event handlers.
    const menuHome = document.createComment('sentinela-controls-home');
    menuControles.before(menuHome);
    const inlineSpace = document.createElement('div');
    inlineSpace.hidden = true;
    inlineSpace.setAttribute('aria-hidden', 'true');
    menuHome.after(inlineSpace);
    const articleMenu = document.createElement('div');
    articleMenu.id = 'sentinela-article-menu';
    articleMenu.className = 'sentinela-article-menu app-menu';
    articleMenu.hidden = true;
    articleMenu.innerHTML = `
      <div class="app-menu__scroll article-menu__scroll" role="dialog" aria-labelledby="article-menu-title">
        <section class="app-menu__card article-menu__card article-menu__settings">
          <div class="app-menu__heading article-menu__heading">
            <h2 id="article-menu-title">A Sentinela</h2>
            <button class="app-menu__close article-menu__close" type="button" aria-label="Fechar menu">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
            </button>
          </div>
          <div class="app-menu__controls article-menu__controls"></div>
        </section>
        <section class="app-menu__card article-menu__card article-menu__paragraphs" aria-labelledby="article-paragraphs-title">
          <div class="app-menu__heading article-menu__heading">
            <h2 id="article-paragraphs-title">Parágrafos</h2>
            <span class="app-menu__count article-menu__count"></span>
          </div>
          <nav class="app-menu__grid article-menu__grid" aria-label="Ir para o parágrafo"></nav>
          <p class="article-menu__empty" hidden>Nenhum parágrafo numerado neste artigo.</p>
        </section>
      </div>`;
    document.body.append(articleMenu);
    const menuScroll = articleMenu.querySelector('.article-menu__scroll');
    const paragraphGrid = articleMenu.querySelector('.article-menu__grid');
    const menuClose = articleMenu.querySelector('.article-menu__close');
    let menuOpener = null;
    let inlineMenuWasVisible = false;
    let mainWasInert = false;
    let finishNavigation = null;
    let highlightTimer = null;
    let highlightedParagraph = null;

    const emitMenuState = (open) => document.dispatchEvent(new CustomEvent('sentinela:article-menu-state', { bubbles: true, detail: { open } }));
    const emitNavigationState = (active) => document.dispatchEvent(new CustomEvent('sentinela:paragraph-navigation', { bubbles: true, detail: { active } }));

    function articleParagraphs() {
      const paragraphs = new Map();
      const excluded = '.anotacao, .comentarios, .ia-wrapper, .agente-overlay, .agente-modal, [data-tutor-generated], [contenteditable="true"], dialog, [role="dialog"], [hidden], [aria-hidden="true"]';
      mainContent.querySelectorAll('.paragrafo').forEach((paragraph) => {
        if (paragraph.closest(excluded) || paragraph.parentElement?.closest('.paragrafo')) return;
        const numberNode = paragraph.firstElementChild;
        if (!numberNode || numberNode.tagName !== 'SPAN') return;
        // Numbered source paragraphs begin with a standalone number span.
        // A citation or numbered question elsewhere in the text is not one.
        for (let node = paragraph.firstChild; node && node !== numberNode; node = node.nextSibling) {
          if (node.textContent.trim()) return;
        }
        const match = numberNode.textContent.trim().match(/^(\d{1,3})[.)]?$/);
        if (!match) return;
        const number = Number(match[1]);
        if (number > 0 && !paragraphs.has(number)) paragraphs.set(number, paragraph);
      });
      return paragraphs;
    }

    function headerClearance() {
      const headerStyle = getComputedStyle(barraEstudo);
      const headerHeight = /^(fixed|sticky)$/.test(headerStyle.position) ? barraEstudo.getBoundingClientRect().height : 0;
      return headerHeight + 12;
    }

    function highlightParagraph(paragraph) {
      clearTimeout(highlightTimer);
      highlightedParagraph?.classList.remove('article-paragraph-arrival');
      highlightedParagraph = paragraph;
      paragraph.classList.add('article-paragraph-arrival');
      highlightTimer = setTimeout(() => {
        paragraph.classList.remove('article-paragraph-arrival');
        highlightedParagraph = null;
      }, 1600);
    }

    function closeArticleMenu({ restoreFocus = true, restoreInline = true } = {}) {
      if (articleMenu.hidden) return;
      articleMenu.hidden = true;
      articleMenu.inert = false;
      menuHome.after(menuControles);
      menuVisivel = restoreInline && inlineMenuWasVisible;
      menuControles.style.display = menuVisivel ? 'block' : 'none';
      inlineSpace.hidden = true;
      mainContent.inert = mainWasInert;
      barraEstudo.setAttribute('aria-expanded', String(menuVisivel));
      if (!menuVisivel) document.documentElement.style.setProperty('--cor-glow', 'rgba(180,180,185,0.15)');
      emitMenuState(false);
      if (restoreFocus && menuOpener?.isConnected) menuOpener.focus({ preventScroll: true });
    }

    function goToParagraph(paragraph) {
      if (!paragraph.isConnected) return;
      finishNavigation?.();
      // Pause navbar direction tracking before the menu closes or scrolling starts.
      emitNavigationState(true);
      closeArticleMenu({ restoreFocus: false, restoreInline: false });
      const top = Math.max(0, Math.min(
        window.scrollY + paragraph.getBoundingClientRect().top - headerClearance(),
        document.documentElement.scrollHeight - window.innerHeight
      ));
      let settledTimer;
      let deadline;
      const hadTabIndex = paragraph.hasAttribute('tabindex');
      if (!hadTabIndex) {
        paragraph.setAttribute('tabindex', '-1');
        paragraph.addEventListener('blur', () => paragraph.removeAttribute('tabindex'), { once: true });
      }
      paragraph.focus({ preventScroll: true });
      const finish = () => {
        clearTimeout(settledTimer);
        clearTimeout(deadline);
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('scrollend', finish);
        window.removeEventListener('touchstart', finish);
        window.removeEventListener('wheel', finish);
        finishNavigation = null;
        highlightParagraph(paragraph);
        emitNavigationState(false);
      };
      const onScroll = () => {
        clearTimeout(settledTimer);
        settledTimer = setTimeout(finish, 180);
      };
      finishNavigation = finish;
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('scrollend', finish, { once: true });
      window.addEventListener('touchstart', finish, { once: true, passive: true });
      window.addEventListener('wheel', finish, { once: true, passive: true });
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const alreadyThere = Math.abs(window.scrollY - top) < 1;
      window.scrollTo({ top, behavior: reducedMotion ? 'instant' : 'smooth' });
      deadline = setTimeout(finish, 2400);
      // A zero-distance jump and browsers without scrollend still release tracking.
      if (reducedMotion || alreadyThere) settledTimer = setTimeout(finish, 0);
    }

    function buildParagraphGrid() {
      const paragraphs = articleParagraphs();
      paragraphGrid.replaceChildren();
      let currentNumber = null;
      for (const [number, paragraph] of paragraphs) {
        if (currentNumber === null || paragraph.getBoundingClientRect().top <= headerClearance()) currentNumber = number;
      }
      for (const [number, paragraph] of paragraphs) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'app-menu__item article-menu__paragraph';
        button.textContent = String(number);
        button.setAttribute('aria-label', `Parágrafo ${number}`);
        if (number === currentNumber) button.setAttribute('aria-current', 'location');
        // Keep the element reference: source IDs can be absent or duplicated.
        button.addEventListener('click', () => goToParagraph(paragraph));
        paragraphGrid.append(button);
      }
      articleMenu.querySelector('.article-menu__count').textContent = paragraphs.size ? `${paragraphs.size} no artigo` : '';
      articleMenu.querySelector('.article-menu__empty').hidden = paragraphs.size > 0;
    }

    function openArticleMenu() {
      if (!articleMenu.hidden) return;
      menuOpener = document.activeElement;
      // No body position/height lock or visualViewport reposition loop. The
      // overlay has its own native scroll area, leaving the article anchored.
      inlineMenuWasVisible = menuVisivel;
      if (inlineMenuWasVisible) {
        const style = getComputedStyle(menuControles);
        inlineSpace.style.height = `${menuControles.getBoundingClientRect().height}px`;
        inlineSpace.style.marginTop = style.marginTop;
        inlineSpace.style.marginBottom = style.marginBottom;
        inlineSpace.hidden = false;
      }
      menuVisivel = false;
      menuControles.style.display = 'none';
      articleMenu.querySelector('.article-menu__controls').append(menuControles);
      buildParagraphGrid();
      mainWasInert = mainContent.inert;
      mainContent.inert = true;
      menuControles.style.display = 'block';
      articleMenu.hidden = false;
      menuScroll.scrollTop = 0;
      barraEstudo.setAttribute('aria-expanded', 'true');
      aplicarGlowDaCorEstudo();
      emitMenuState(true);
      menuClose.focus({ preventScroll: true });
    }

    window.SentinelaArticleMenu = Object.freeze({
      open: openArticleMenu,
      close: closeArticleMenu,
      toggle: () => articleMenu.hidden ? openArticleMenu() : closeArticleMenu(),
      isOpen: () => !articleMenu.hidden
    });
    menuClose.addEventListener('click', () => closeArticleMenu());
    articleMenu.addEventListener('click', (event) => {
      if (event.target === articleMenu || event.target === menuScroll) closeArticleMenu();
    });
    const preventBackdropScroll = (event) => {
      if (!menuScroll.contains(event.target)) event.preventDefault();
    };
    articleMenu.addEventListener('touchmove', preventBackdropScroll, { passive: false });
    articleMenu.addEventListener('wheel', preventBackdropScroll, { passive: false });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !articleMenu.hidden && !document.querySelector('.sync-sheet-overlay.is-open, .sync-alert-overlay.is-open')) {
        event.preventDefault();
        closeArticleMenu();
      }
    });

    // Existing sheets remain siblings above both cards. Do not trap their
    // controls in the article dialog or close the cards when a sheet closes.
    const sheets = [...document.querySelectorAll('.sync-sheet-overlay, .sync-alert-overlay')];
    const updateSheetState = () => {
      let nestedOpen = false;
      sheets.forEach((sheet) => {
        const open = sheet.classList.contains('is-open');
        sheet.setAttribute('aria-hidden', String(!open));
        nestedOpen ||= open;
      });
      articleMenu.inert = !articleMenu.hidden && nestedOpen;
    };
    const sheetObserver = new MutationObserver(updateSheetState);
    sheets.forEach((sheet) => sheetObserver.observe(sheet, { attributes: true, attributeFilter: ['class'] }));

    barraEstudo.style.cursor = "pointer";
    barraEstudo.setAttribute('aria-controls', 'sentinela-controles');
    barraEstudo.setAttribute('aria-expanded', 'false');
    barraEstudo.addEventListener('click', () => {
        if (!articleMenu.hidden) { closeArticleMenu(); return; }
        menuVisivel = !menuVisivel;
        barraEstudo.setAttribute('aria-expanded', String(menuVisivel));
        menuControles.style.display = menuVisivel ? 'block' : 'none';
        if (menuVisivel) aplicarGlowDaCorEstudo();
        else document.documentElement.style.setProperty('--cor-glow', 'rgba(180,180,185,0.15)');
    });

    function showCustomAlert({ title, text, left, right, leftDanger, rightDanger, leftBold, rightBold }) {
      return new Promise((resolve) => {
        const overlay = document.getElementById('sentinelaAlertOverlay');
        const titleEl = document.getElementById('sentinelaAlertTitle');
        const textEl = document.getElementById('sentinelaAlertText');
        const btnLeft = document.getElementById('sentinelaAlertBtnLeft');
        const btnRight = document.getElementById('sentinelaAlertBtnRight');

        titleEl.textContent = title;
        textEl.textContent = text;
        
        btnLeft.textContent = left;
        btnLeft.className = 'sync-alert__btn';
        if (leftDanger) btnLeft.classList.add('is-danger');
        if (leftBold) btnLeft.classList.add('is-bold');

        btnRight.textContent = right;
        btnRight.className = 'sync-alert__btn sync-alert__btn--right';
        if (rightDanger) btnRight.classList.add('is-danger');
        if (rightBold) btnRight.classList.add('is-bold');

        const cleanup = () => {
          overlay.classList.remove('is-open');
          btnLeft.removeEventListener('click', onLeft);
          btnRight.removeEventListener('click', onRight);
        };

        const onLeft = () => { cleanup(); resolve('left'); };
        const onRight = () => { cleanup(); resolve('right'); };

        btnLeft.addEventListener('click', onLeft);
        btnRight.addEventListener('click', onRight);

        overlay.classList.add('is-open');
      });
    }

    function isSentinelaKey(key) {
      if (!key || /^(?:ass26:|ass26-migration:|assembleia-2026:)/.test(key)) return false;
      return /^(c-|r-|p-|obj-|qa:)/.test(key) || /-pg-/.test(key) || key.startsWith('sentinela_loaded_');
    }

    function clearSentinelaStorage(storage) {
      // The original app keeps its legacy raw keys. Other Pages variants have
      // explicit namespaces, including receipts that must survive a reset.
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
      keys.forEach((key) => {
        if (key && !/^(?:ass26:|ass26-migration:|assembleia-2026:)/.test(key)) storage.removeItem(key);
      });
    }

    function getLocalExportPayload() {
      const preferences = {};
      ['tema-interface', 'tamanho-fonte-global', 'editor-performance-mode'].forEach((key) => {
        const value = localStorage.getItem(key);
        if (value !== null) preferences[key] = value;
      });

      const annotations = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (isSentinelaKey(key)) {
          annotations[key] = localStorage.getItem(key);
        }
      }

      return {
        format: 'sentinela-bin-v1',
        exportedAt: new Date().toISOString(),
        preferences,
        annotations
      };
    }

    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
    }

    async function exportBinFile() {
      const payload = getLocalExportPayload();
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `Backup_Sentinela_${stamp}.bin`;
      
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/octet-stream' });
      const file = new File([blob], filename, { type: 'application/octet-stream' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
        } catch (err) {
          if (err.name !== 'AbortError') downloadBlob(blob, filename);
        }
      } else {
        downloadBlob(blob, filename);
      }
    }

    async function importBinFile(file) {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || parsed.format !== 'sentinela-bin-v1') {
        throw new Error('Arquivo BIN inválido ou corrompido.');
      }

      const preferences = parsed.preferences || {};
      const annotations = parsed.annotations || {};

      Object.entries(preferences).forEach(([key, value]) => {
        if (['tema-interface', 'tamanho-fonte-global', 'editor-performance-mode'].includes(key)) localStorage.setItem(key, String(value));
      });
      Object.entries(annotations).forEach(([key, value]) => {
        if (isSentinelaKey(key)) localStorage.setItem(key, String(value));
      });
    }

    // --- LOGIC: Export / Import BIN ---
    const expOverlay = document.getElementById('sentinelaExportOverlay');
    const expTabs = document.querySelectorAll('[data-exp-tab]');
    const expPanels = document.querySelectorAll('[data-exp-panel]');
    let activeExpTab = 'exportar';

    function setExpTab(tab) {
      activeExpTab = tab;
      expTabs.forEach(btn => btn.classList.toggle('is-active', btn.dataset.expTab === tab));
      expPanels.forEach(panel => panel.hidden = panel.dataset.expPanel !== tab);
      const runBtn = document.getElementById('sentinelaExportRun');
      runBtn.textContent = tab === 'exportar' ? 'Exportar BIN' : 'Importar BIN';
    }

    expTabs.forEach(btn => btn.addEventListener('click', () => setExpTab(btn.dataset.expTab)));
    document.getElementById('sentinelaExportClose').addEventListener('click', () => expOverlay.classList.remove('is-open'));
    document.getElementById('sentinelaExportCancel').addEventListener('click', () => expOverlay.classList.remove('is-open'));

    const importFileInput = document.getElementById('sentinelaImportFile');
    importFileInput.addEventListener('change', () => {
      const file = importFileInput.files?.[0];
      document.getElementById('sentinelaImportFileName').textContent = file ? file.name : 'Nenhum arquivo selecionado.';
    });

    btnExportarBin.addEventListener('click', () => {
      setExpTab('exportar');
      expOverlay.classList.add('is-open');
    });

    document.getElementById('sentinelaExportRun').addEventListener('click', async () => {
      const runBtn = document.getElementById('sentinelaExportRun');
      const originalText = runBtn.textContent;
      runBtn.disabled = true;
      runBtn.textContent = 'Aguarde...';

      try {
        if (activeExpTab === 'exportar') {
          await exportBinFile();
          expOverlay.classList.remove('is-open');
        } else {
          const file = importFileInput.files?.[0];
          if (!file) { alert('Selecione um arquivo.'); return; }
          const res = await showCustomAlert({
            title: "Sobrescrever anotações?",
            text: "A importação substituirá suas configurações e as anotações contidas no backup.",
            left: "Cancelar", right: "Importar", rightBold: true
          });
          if (res === 'right') {
            await importBinFile(file);
            expOverlay.classList.remove('is-open');
            location.reload();
          }
        }
      } catch (err) {
        alert(err.message || 'Erro inesperado.');
      } finally {
        runBtn.disabled = false;
        runBtn.textContent = originalText;
      }
    });

    // --- LOGIC: Nuvem Sync ---
    const syncOverlay = document.getElementById('sentinelaSyncOverlay');

    // Keep a cloud collision visible without taking focus away from the note.
    let cloudConflictNotice;
    const cloudNoticeKey = () => {
      try {
        const account = JSON.parse(localStorage.getItem('supabase_user'))?.id;
        return account == null ? null : `cloud_conflict_notice_sentinela_${encodeURIComponent(account)}_${semanaAtual}_${estudoId}`;
      } catch (_) { return null; }
    };
    function hideCloudConflictNotice(clear = false) {
      if (cloudConflictNotice) cloudConflictNotice.hidden = true;
      if (clear) { try { const key = cloudNoticeKey(); if (key) localStorage.removeItem(key); } catch (_) {} }
    }
    function showCloudConflictNotice() {
      if (!cloudConflictNotice) {
        const notice = document.createElement('aside'); notice.id = 'sentinela-cloud-conflict-notice';
        notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
        notice.style.cssText = 'position:fixed;z-index:12080;top:calc(var(--app-statusbar-height,env(safe-area-inset-top,0px)) + 8px);left:12px;right:12px;max-width:480px;margin:auto;padding:10px 12px;border:1px solid #b9a8c7;border-radius:10px;background:var(--bg-body,#fff);color:var(--text-primary,#39333e);box-shadow:0 3px 16px #00000014;font:13px/1.4 system-ui,-apple-system,sans-serif';
        const text = document.createElement('p'); text.style.margin = '0 0 7px';
        text.textContent = 'Outra versão está na nuvem. Sua edição está salva aqui. Abra Nuvem para escolher.';
        const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:8px';
        const addButton = (label, action) => {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
          button.style.cssText = 'border:0;border-radius:5px;padding:7px 10px;min-height:34px;background:#f2eef6;color:#604184;font:600 12px/1.4 system-ui';
          button.onclick = action; actions.append(button);
        };
        addButton('Abrir Nuvem', () => { hideCloudConflictNotice(); btnAbrirSync.click(); });
        addButton('Fechar aviso', () => hideCloudConflictNotice());
        notice.append(text, actions); document.body.append(notice); cloudConflictNotice = notice;
      }
      cloudConflictNotice.hidden = false;
    }
    function restoreCloudConflictNotice() {
      hideCloudConflictNotice();
      try { const key = cloudNoticeKey(); if (key && localStorage.getItem(key)) showCloudConflictNotice(); } catch (_) {}
    }
    window.addEventListener('sentinela:syncstatus', event => {
      const detail = event.detail || {};
      if (detail.code === 'SYNC_CONFLICT') {
        try { const key = cloudNoticeKey(); if (key) localStorage.setItem(key, '1'); } catch (_) {}
        showCloudConflictNotice();
      } else if (detail.status === 'saved') {
        const sync = window.sentinelaSync;
        if (typeof sync?.lastObservedLocalJSON === 'string' && sync.lastObservedLocalJSON === sync.lastSavedDataJSON) hideCloudConflictNotice(true);
      }
    });
    window.addEventListener('sentinela:cloudresolved', () => hideCloudConflictNotice(true));
    window.addEventListener('supabaseSessionChanged', restoreCloudConflictNotice);
    window.addEventListener('supabaseLogout', restoreCloudConflictNotice);
    restoreCloudConflictNotice();

    const syncTabs = syncOverlay.querySelectorAll('[data-sync-tab]');
    const syncPanels = syncOverlay.querySelectorAll('[data-sync-panel]');
    const syncOptions = syncOverlay.querySelectorAll('input[data-method]');
    const runButton = document.getElementById('sentinelaSyncRun');
    const confirmButton = document.getElementById('sentinelaSyncConfirm');
    const cancelButton = document.getElementById('sentinelaSyncCancel');
    const closeButton = document.getElementById('sentinelaSyncClose');
    const feedback = syncOverlay.querySelector('.sync-feedback');
    const feedbackTitle = feedback.querySelector('.sync-feedback__title');
    const feedbackDetail = feedback.querySelector('.sync-feedback__detail');
    const openerLabel = btnAbrirSync.querySelector('.action-card__label');
    const methods = {
      pushMissing: { label: 'Enviar para a nuvem', unchanged: 'Não há anotações novas deste artigo para enviar.' },
      pushOverwrite: { label: 'Substituir na nuvem', confirm: 'Substituir a cópia da nuvem?',
        warning: 'A nuvem ficará com as anotações deste aparelho. As anotações que só existem na nuvem serão apagadas.',
        unchanged: 'A cópia da nuvem corresponde às anotações deste aparelho.' },
      pullMissing: { label: 'Baixar anotações', unchanged: 'Este aparelho já tem as anotações disponíveis para baixar.' },
      pullOverwrite: { label: 'Restaurar neste aparelho', confirm: 'Restaurar as anotações neste aparelho?',
        warning: 'Este artigo ficará igual à cópia da nuvem. As anotações que só existem neste aparelho serão apagadas.',
        unchanged: 'As anotações deste aparelho já correspondem à cópia da nuvem.' },
      deleteRemote: { label: 'Apagar da nuvem', confirm: 'Apagar este artigo da nuvem?',
        warning: 'As anotações deste artigo serão apagadas da nuvem. Sua cópia neste aparelho será mantida.',
        unchanged: 'A nuvem já estava sem anotações deste artigo.' }
    };
    const tabLabels = {
      enviar: { busy: 'Enviando…', done: 'Envio concluído', destination: 'na nuvem' },
      baixar: { busy: 'Baixando…', done: 'Anotações baixadas', destination: 'neste aparelho' },
      apagar: { busy: 'Apagando…', done: 'Exclusão concluída', destination: 'na nuvem' }
    };
    let activeSyncTab = 'enviar';
    let openedSession = null;
    let keepSyncResult = false;
    let lastActionTap = null;

    function currentSession() {
      try {
        const raw = localStorage.getItem('supabase_user');
        return JSON.parse(raw)?.id && window.SupabaseSync?.isLoggedIn?.() !== false ? raw : null;
      } catch (_) { return null; }
    }
    function selectedMethod() {
      return syncOverlay.querySelector(`input[name="sync-${activeSyncTab}"]:checked`).dataset.method;
    }
    function setSyncState(state, title = '', detail = '') {
      const previousFocus = document.activeElement;
      const choice = methods[selectedMethod()];
      const busy = state === 'busy';
      const confirming = state === 'confirm';
      const finished = state === 'success' || state === 'empty' || state === 'account';
      const locked = confirming || busy || state === 'account';
      syncOverlay.dataset.state = state;
      for (const tab of syncTabs) {
        const active = tab.dataset.syncTab === activeSyncTab;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-pressed', String(active));
        tab.disabled = locked;
      }
      for (const panel of syncPanels) panel.hidden = panel.dataset.syncPanel !== activeSyncTab;
      for (const radio of syncOptions) radio.disabled = locked;
      feedback.hidden = state === 'idle';
      feedbackTitle.textContent = title;
      feedbackDetail.textContent = detail;
      confirmButton.hidden = !confirming;
      confirmButton.textContent = choice.label;
      const primaryLabels = {
        idle: choice.label, confirm: choice.label, busy: tabLabels[activeSyncTab].busy,
        success: 'Concluir', error: 'Tentar novamente', partial: 'Revisar opções', empty: 'Fechar', account: 'Fechar'
      };
      runButton.textContent = primaryLabels[state];
      runButton.hidden = confirming;
      runButton.disabled = busy;
      runButton.setAttribute('aria-busy', String(busy));
      runButton.classList.toggle('is-danger', Boolean(choice.confirm) && (state === 'idle' || state === 'error'));
      cancelButton.hidden = finished;
      cancelButton.textContent = busy ? 'Ocultar' : confirming ? 'Voltar' : 'Cancelar';
      closeButton.setAttribute('aria-label', busy ? 'Ocultar Nuvem' : 'Fechar Nuvem');
      if (!keepSyncResult) openerLabel.textContent = 'Nuvem';
      else openerLabel.textContent = busy ? tabLabels[activeSyncTab].busy : 'Ver resultado';
      if (finished && syncOverlay.classList.contains('is-open') &&
          (previousFocus === cancelButton || previousFocus === confirmButton)) runButton.focus({ preventScroll: true });
    }
    function verifySyncSession() {
      if (openedSession && openedSession === currentSession()) return true;
      const message = openedSession ? 'A conta mudou. Feche e abra a Nuvem novamente.' : 'Entre na sua conta pela aba Salvar e volte a este artigo.';
      setSyncState('account', openedSession ? 'Sessão alterada' : 'Entre na sua conta', message);
      return false;
    }
    function resetChoices() {
      for (const radio of syncOptions) radio.checked = radio.defaultChecked;
    }
    function closeCloud() {
      keepSyncResult = syncOverlay.dataset.state === 'busy';
      openerLabel.textContent = keepSyncResult ? tabLabels[activeSyncTab].busy : 'Nuvem';
      syncOverlay.classList.remove('is-open');
      updateSheetState();
      if (btnAbrirSync.getClientRects().length) btnAbrirSync.focus({ preventScroll: true });
      else if (barraEstudo.tabIndex >= 0) barraEstudo.focus({ preventScroll: true });
    }
    function backFromConfirmation() {
      lastActionTap = null;
      setSyncState('idle');
      runButton.focus({ preventScroll: true });
    }
    btnAbrirSync.addEventListener('click', () => {
      if (syncOverlay.classList.contains('is-open')) return;
      syncOverlay.classList.add('is-open');
      if (!keepSyncResult) {
        openedSession = currentSession();
        lastActionTap = null;
        activeSyncTab = 'enviar';
        resetChoices();
        setSyncState('idle');
      }
      // An in-flight request owns its slot until it settles, even after a logout.
      if (syncOverlay.dataset.state !== 'busy') verifySyncSession();
      updateSheetState();
      closeButton.focus({ preventScroll: true });
    });
    for (const tab of syncTabs) tab.addEventListener('click', () => {
      if (tab.disabled || !verifySyncSession()) return;
      keepSyncResult = false;
      activeSyncTab = tab.dataset.syncTab;
      setSyncState('idle');
    });
    for (const radio of syncOptions) radio.addEventListener('change', () => {
      if (!radio.disabled && verifySyncSession()) setSyncState('idle');
    });
    closeButton.addEventListener('click', closeCloud);
    cancelButton.addEventListener('click', () => {
      if (syncOverlay.dataset.state === 'confirm') backFromConfirmation();
      else closeCloud();
    });
    // On a fast response a second tap can land on a different action where
    // Send used to be. Only suppress a rapid repeat at that same spot.
    syncOverlay.addEventListener('click', event => {
      if (!event.detail) {
        lastActionTap = null; // Keyboard and assistive activation start a fresh gesture.
        return;
      }
      if (lastActionTap && performance.now() - lastActionTap.at < 450 &&
          Math.hypot(event.clientX - lastActionTap.x, event.clientY - lastActionTap.y) < 24) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const state = syncOverlay.dataset.state;
      if ((event.target === runButton && (state === 'idle' || state === 'error')) ||
          (event.target === confirmButton && state === 'confirm')) {
        lastActionTap = { at: performance.now(), x: event.clientX, y: event.clientY };
      } else {
        lastActionTap = null;
      }
    }, true);
    syncOverlay.addEventListener('click', event => {
      if (event.target !== syncOverlay) return;
      if (syncOverlay.dataset.state === 'confirm') backFromConfirmation();
      else closeCloud();
    });
    syncOverlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (syncOverlay.dataset.state === 'confirm') backFromConfirmation();
        else closeCloud();
      } else if (event.key === 'Tab') {
        const focusable = Array.from(syncOverlay.querySelectorAll('button:enabled, input:checked:enabled'))
          .filter(element => element.getClientRects().length);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });

    async function runCloudAction(method) {
      const phase = syncOverlay.dataset.state;
      if (phase !== 'idle' && phase !== 'error' && phase !== 'confirm') return;
      const choice = methods[method];
      if (!verifySyncSession() || (choice.confirm && phase !== 'confirm')) return;
      const labels = tabLabels[activeSyncTab];
      const reading = 'Consultando as anotações deste artigo na nuvem…';
      setSyncState('busy', labels.busy, reading);
      cancelButton.focus({ preventScroll: true });
      try {
        if (navigator.onLine === false) throw new Error('Conecte o aparelho à internet e tente novamente.');
        const sync = window.sentinelaSync;
        if (typeof sync?.[method] !== 'function') throw new Error('A sincronização ainda está iniciando. Tente novamente.');
        const result = await sync[method](stage => {
          if (stage === 'writing') feedbackDetail.textContent = 'Aguardando a confirmação da nuvem…';
          if (stage === 'applying') feedbackDetail.textContent = 'Salvando as alterações neste aparelho…';
        });
        if (!verifySyncSession()) return;
        if (result?.success !== true) {
          if (result?.code === 'SYNC_EMPTY') {
            setSyncState('empty', 'Sem cópia na nuvem', result.error);
            return;
          }
          if (result?.code === 'SYNC_PARTIAL') {
            setSyncState('partial', 'Confira as anotações', result.error);
            return;
          }
          throw new Error(result?.error || 'A nuvem não confirmou a operação. Tente novamente.');
        }
        let detail = method === 'deleteRemote' ? 'A cópia neste aparelho foi mantida.' : 'A operação deste artigo foi confirmada.';
        if (result.changed === 0) detail = choice.unchanged;
        else if (Number.isInteger(result.changed) && result.changed > 0) {
          const changes = result.changed === 1 ? '1 alteração aplicada' : `${result.changed} alterações aplicadas`;
          detail = changes + ' ' + labels.destination + '.';
        }
        setSyncState('success', result.changed === 0 ? 'Nenhuma anotação alterada' : labels.done, detail);
        window.dispatchEvent(new CustomEvent('sentinela:cloudresolved'));
      } catch (error) {
        if (!verifySyncSession()) return;
        let message = error?.message || 'Confira a conexão e tente novamente.';
        if (/failed to fetch|fetch failed|load failed|networkerror|network request failed/i.test(message)) {
          message = 'Não foi possível confirmar a operação. Confira a conexão e tente novamente.';
        }
        setSyncState('error', 'Não foi possível concluir', message);
      }
    }
    runButton.addEventListener('click', () => {
      if (!syncOverlay.classList.contains('is-open')) return;
      switch (syncOverlay.dataset.state) {
        case 'empty': case 'account': case 'success': closeCloud(); return;
        case 'partial': resetChoices(); setSyncState('idle'); return;
        case 'idle': case 'error': break;
        default: return;
      }
      if (!verifySyncSession()) return;
      const method = selectedMethod();
      const choice = methods[method];
      if (choice.confirm) {
        setSyncState('confirm', choice.confirm, choice.warning);
        cancelButton.focus({ preventScroll: true });
      } else runCloudAction(method);
    });
    confirmButton.addEventListener('click', () => {
      if (syncOverlay.classList.contains('is-open') && syncOverlay.dataset.state === 'confirm') runCloudAction(selectedMethod());
    });

    // --- LOGIC: Limpeza Local ---
    const deleteOverlay = document.getElementById('sentinelaDeleteOverlay');
    document.getElementById('sentinelaDeleteClose').addEventListener('click', () => deleteOverlay.classList.remove('is-open'));
    document.getElementById('sentinelaDeleteCancel').addEventListener('click', () => deleteOverlay.classList.remove('is-open'));

    btnLimparCache.addEventListener('click', () => {
      deleteOverlay.classList.add('is-open');
    });

    document.getElementById('sentinelaDeleteRun').addEventListener('click', async () => {
      deleteOverlay.classList.remove('is-open');
      const opt = document.querySelector('input[name="local-delete-opt"]:checked').value;

      let msg = "";
      if (opt === 'day') {
        msg = "Apagar as anotações APENAS deste artigo da Sentinela?";
      } else if (opt === 'all-notes') {
        msg = "Apagar TODAS as anotações de todos os artigos locais da Sentinela?";
      } else if (opt === 'nuclear') {
        msg = "ALERTA MÁXIMO!\nIsso vai deslogar sua conta e formatar o cache interno de todo o aplicativo. Tem certeza?";
      }

      setTimeout(() => {
        if (window.confirm(msg)) {
          if (opt === 'day' || opt === 'all-notes') {
            try {
              if (!window.sentinelaSync?.clearLocal) throw new Error('A limpeza não está disponível. Atualize a página e tente novamente.');
              window.sentinelaSync.clearLocal(opt === 'all-notes');
              location.reload();
            } catch (error) { alert(error.message || 'Não foi possível apagar todas as anotações. Tente novamente.'); }
          } else if (opt === 'nuclear') {
            clearSentinelaStorage(localStorage);
            clearSentinelaStorage(sessionStorage);
            window.dispatchEvent(new Event('supabaseLogout'));
            location.reload();
          }
        }
      }, 100);
    });

    // --- LÓGICA DE UI E PREFERÊNCIAS ---
    function toggleExpandable(targetBtn, targetArea, otherBtn, otherArea) {
      const isHidden = targetArea.hidden;
      if (!otherArea.hidden) {
          otherArea.hidden = true;
          otherBtn.classList.remove('is-active');
          otherBtn.setAttribute('aria-expanded', 'false');
      }
      targetArea.hidden = !isHidden;
      targetBtn.classList.toggle('is-active', isHidden);
      targetBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    }

    if (btnTemaToggle && themeOptionsArea) {
      btnTemaToggle.addEventListener('click', () => toggleExpandable(btnTemaToggle, themeOptionsArea, btnFonteToggle, fontOptionsArea));
    }

    if (btnFonteToggle && fontOptionsArea) {
      btnFonteToggle.addEventListener('click', () => toggleExpandable(btnFonteToggle, fontOptionsArea, btnTemaToggle, themeOptionsArea));
    }

    if (btnPerfToggle) {
      btnPerfToggle.addEventListener('click', () => {
          const isLow = isPerfLowMode();
          const nextMode = isLow ? 'normal' : 'low';
          localStorage.setItem('editor-performance-mode', nextMode);
          document.documentElement.dataset.performanceMode = nextMode;
          document.documentElement.classList.toggle('perf-low', nextMode === 'low');
          document.documentElement.classList.toggle('perf-normal', nextMode !== 'low');
          updatePerfIcon();
      });
    }

    function updatePerfIcon() {
      if (!btnPerfToggle) return;
      const isLow = isPerfLowMode();
      const iconTarget = btnPerfToggle.querySelector('.action-card__icon');
      const labelTarget = btnPerfToggle.querySelector('.action-card__label');
      if (!iconTarget) return;

      if (isLow) {
          btnPerfToggle.classList.add('is-low');
          btnPerfToggle.classList.remove('is-normal');
          iconTarget.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="16" height="10" rx="2" ry="2"></rect><line x1="22" y1="11" x2="22" y2="13"></line><rect x="4" y="9" width="3" height="6" rx="1" fill="currentColor" stroke="none"></rect></svg>`;
          if (labelTarget) labelTarget.textContent = 'Modo Low';
      } else {
          btnPerfToggle.classList.add('is-normal');
          btnPerfToggle.classList.remove('is-low');
          iconTarget.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="16" height="10" rx="2" ry="2"></rect><line x1="22" y1="11" x2="22" y2="13"></line><rect x="4" y="9" width="12" height="6" rx="1" fill="currentColor" stroke="none"></rect></svg>`;
          if (labelTarget) labelTarget.textContent = 'Desempenho';
      }
    }

    function updateThemeIcon(isDark) {
      if (!btnTemaToggle) return;
      const iconTarget = btnTemaToggle.querySelector('.action-card__icon');
      if (iconTarget) {
          iconTarget.innerHTML = isDark ? 
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.75"></circle><line x1="12" y1="1.75" x2="12" y2="4"></line><line x1="12" y1="20" x2="12" y2="22.25"></line><line x1="4.22" y1="4.22" x2="5.82" y2="5.82"></line><line x1="18.18" y1="18.18" x2="19.78" y2="19.78"></line><line x1="1.75" y1="12" x2="4" y2="12"></line><line x1="20" y1="12" x2="22.25" y2="12"></line><line x1="4.22" y1="19.78" x2="5.82" y2="18.18"></line><line x1="18.18" y1="5.82" x2="19.78" y2="4.22"></line></svg>` : 
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.7 6.7 0 0 0 9.7 9.7Z"></path></svg>`;
      }
    }

    const prefersDarkMedia = window.matchMedia('(prefers-color-scheme: dark)');

    function applyThemeToDOM(themeVal) {
      const isDark = themeVal === 'dark' || (themeVal === 'system' && prefersDarkMedia.matches);
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
      document.documentElement.dataset.themeChoice = themeVal;
      updateThemeIcon(isDark);
    }

    function initTheme() {
      const savedTheme = localStorage.getItem('tema-interface') || 'system';
      const radio = document.querySelector(`input[name="tema"][value="${savedTheme}"]`);
      if (radio) radio.checked = true;
      applyThemeToDOM(savedTheme);
    }

    prefersDarkMedia.addEventListener('change', () => {
      if ((localStorage.getItem('tema-interface') || 'system') === 'system') applyThemeToDOM('system');
    });

    themeRadios.forEach((radio) => {
      radio.addEventListener('change', (e) => {
          localStorage.setItem('tema-interface', e.target.value);
          applyThemeToDOM(e.target.value);
      });
    });

    function nivelDoTamanho(tamanho) {
      if (window.GlobalFontScale?.levelForSize) return window.GlobalFontScale.levelForSize(tamanho);
      return TAMANHOS_FONTE.reduce((nearest, size, index) =>
          Math.abs(size - tamanho) < Math.abs(TAMANHOS_FONTE[nearest] - tamanho) ? index : nearest, 0) + 1;
    }

    function atualizarRangeVisual(nivel) {
      const percentual = ((nivel - NIVEL_MIN) / (NIVEL_MAX - NIVEL_MIN)) * 100;
      rangeTamanhoFonte.value = String(nivel);
      rangeTamanhoFonte.setAttribute('aria-valuetext', `Nível ${nivel} de ${NIVEL_MAX}${nivel === NIVEL_PADRAO ? ', padrão' : ''}`);
      rangeTamanhoFonte.style.setProperty('--range-progress', `${percentual}%`);
      rangeTamanhoFonte.closest('.range-shell')?.style.setProperty('--range-progress', `${percentual}%`);
    }

    function aplicarNivelFonte(novoNivel) {
      const nivel = Math.min(NIVEL_MAX, Math.max(NIVEL_MIN, Math.round(Number(novoNivel)) || NIVEL_PADRAO));
      const tamanhoSeguro = TAMANHOS_FONTE[nivel - 1];
      if (window.GlobalFontScale?.setLevel) {
          window.GlobalFontScale.setLevel(nivel);
      } else {
          document.documentElement.style.setProperty('--tamanho-fonte', `${tamanhoSeguro}px`);
          document.documentElement.style.setProperty('--font-base-global', `${tamanhoSeguro}px`);
          document.documentElement.style.setProperty('--font-scale-global', String(tamanhoSeguro / 16));
          document.documentElement.style.setProperty('--read-size', `${tamanhoSeguro}px`);
          document.documentElement.dataset.fontSizeGlobal = String(tamanhoSeguro);
          document.documentElement.dataset.fontLevelGlobal = String(nivel);
          try { localStorage.setItem(FONTE_STORAGE_KEY, tamanhoSeguro); } catch (error) {}
      }
      atualizarRangeVisual(nivel);
    }

    if (rangeTamanhoFonte) {
      rangeTamanhoFonte.addEventListener('input', (event) => aplicarNivelFonte(event.target.value));
      ['change', 'touchend', 'pointerup', 'mouseup'].forEach((nomeEvento) => {
          rangeTamanhoFonte.addEventListener(nomeEvento, () => {
              const valorMagnetico = Math.round(parseFloat(rangeTamanhoFonte.value) || NIVEL_PADRAO);
              if (String(valorMagnetico) !== rangeTamanhoFonte.value) rangeTamanhoFonte.value = String(valorMagnetico);
              aplicarNivelFonte(valorMagnetico);
          });
      });
    }

    window.addEventListener('globalfont:changed', (event) => {
      const tamanho = event?.detail?.size;
      if (!tamanho || !rangeTamanhoFonte) return;
      atualizarRangeVisual(nivelDoTamanho(tamanho));
    });

    initTheme();
    updatePerfIcon();
    const tamanhoFonteSalvo = window.GlobalFontScale?.getSize() || FONTE_PADRAO;
    if (rangeTamanhoFonte) {
      atualizarRangeVisual(nivelDoTamanho(tamanhoFonteSalvo));
    }
});
