(function () {
  const DIAS = ['sex', 'sab', 'dom'];
  const ROTULOS = {
    sex: 'Sexta-feira',
    sab: 'Sábado',
    dom: 'Domingo'
  };
  const IMG_VERSION = 'asmb-2026';

  function diaAutomatico() {
    const hoje = new Date().getDay();
    if (hoje === 6) return 'sab';
    if (hoje === 0) return 'dom';
    return 'sex';
  }

  function diaDaHash() {
    const raw = (location.hash || '').replace('#', '').trim().toLowerCase();
    return DIAS.includes(raw) ? raw : null;
  }

  function atualizarCabecalho(dia) {
    const el = document.getElementById('programacao-dia');
    if (el) el.textContent = ROTULOS[dia] || ROTULOS.sex;
    document.documentElement.dataset.programDay = dia;
  }

  function atualizarImagemTopo(dia) {
    const slot = document.getElementById('img-topo');
    if (!slot) return;

    const src = `programacao/imagens/${dia}.jpeg?v=${IMG_VERSION}`;
    const label = ROTULOS[dia] || ROTULOS.sex;
    const img = new Image();

    img.onload = () => {
      slot.innerHTML = '';
      img.alt = `Imagem da programação de ${label}`;
      img.decoding = 'async';
      img.loading = 'eager';
      slot.appendChild(img);
      slot.style.display = 'block';
    };

    img.onerror = () => {
      slot.innerHTML = '';
      slot.style.display = 'none';
    };

    img.src = src;
  }

  function navButton(label, dir, enabled, target) {
    const arrow = dir === 'prev'
      ? '<span class="nav-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4 7 12l8 8"/></svg></span>'
      : '<span class="nav-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 4 8 8-8 8"/></svg></span>';
    const text = `<span class="nav-label">${label}</span>`;
    if (!enabled) {
      return `<button class="program-nav-btn is-disabled" type="button" disabled>${dir === 'prev' ? arrow + text : text + arrow}</button>`;
    }
    return `<button class="program-nav-btn" type="button" data-go-day="${target}">${dir === 'prev' ? arrow + text : text + arrow}</button>`;
  }

  function renderNav(dia) {
    const idx = DIAS.indexOf(dia);
    return `
      <div class="program-nav" data-program-nav>
        ${navButton('Anterior', 'prev', idx > 0, DIAS[idx - 1])}
        ${navButton('Próximo', 'next', idx < DIAS.length - 1, DIAS[idx + 1])}
      </div>
    `;
  }

  async function carregarDia(dia, pushHash = true) {
    const container = document.getElementById('programacao-container');
    if (!container) return;
    atualizarCabecalho(dia);
    atualizarImagemTopo(dia);
    container.innerHTML = '<p>Carregando...</p>';
    try {
      const res = await fetch(`programacao/${dia}.html?v=asmb-2026`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      container.innerHTML = html + renderNav(dia);
      if (window.ProgramacaoBbl?.normalizeBbl) window.ProgramacaoBbl.normalizeBbl(container);
      if (window.AssembleiaClickables?.init) window.AssembleiaClickables.init(container);
      if (pushHash) history.replaceState(null, '', `#${dia}`);
      bindNav(container);
      window.dispatchEvent(new CustomEvent('programacao:daychange', { detail: { dia, isUserNavigation: true } }));
    } catch (err) {
      container.innerHTML = '<p>Não foi possível carregar a programação.</p>';
    }
  }

  function bindNav(scope) {
    scope.querySelectorAll('[data-go-day]').forEach((btn) => {
      if (btn.dataset.boundNav === 'true') return;
      btn.dataset.boundNav = 'true';
      btn.addEventListener('click', () => carregarDia(btn.dataset.goDay, true));
    });
  }

  function init() {
    carregarDia(diaDaHash() || diaAutomatico(), false);
    window.addEventListener('hashchange', () => {
      const dia = diaDaHash();
      if (dia) carregarDia(dia, false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();