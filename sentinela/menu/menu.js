document.addEventListener("DOMContentLoaded", () => {
  const FONTE_STORAGE_KEY = "tamanho-fonte-global";
  const FONTE_PADRAO = 16;
  const FONTE_MIN = FONTE_PADRAO;
  const FONTE_MAX = FONTE_PADRAO + 10;
  const barraEstudo = document.querySelector(".barra-estudo");
  const mainContent = document.querySelector("main");

  if (!barraEstudo || !mainContent) return;

  const menuContainer = document.createElement("div");
  menuContainer.className = "menu-barra";
  menuContainer.innerHTML = `
    <div class="controle-grupo controle-grupo-fonte">
      <label for="range-tamanho-fonte">Tamanho do Texto</label>
      <div class="controle-fonte">
        <div class="controle-fonte-topo" aria-hidden="true">
          <span class="fonte-preview fonte-preview-menor">A</span>
          <span class="fonte-preview fonte-preview-maior">A</span>
        </div>
        <div class="range-shell">
          <span class="range-linha" aria-hidden="true"></span>
          <span class="range-ticks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
          <input type="range" id="range-tamanho-fonte" min="16" max="26" step="1" value="16" aria-label="Ajustar tamanho global do texto">
        </div>
      </div>
    </div>
    <div class="controle-grupo">
      <label>Aparência</label>
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
    <div class="controle-grupo">
      <label>Ações</label>
      <div class="controle-acoes">
        <button id="btn-carregar-nuvem" class="btn-acao btn-nuvem">📥 Carregar Anotações da Nuvem</button>
        <button id="btn-limpar-cache" class="btn-acao btn-apagar">Apagar Anotações da Sentinela</button>
      </div>
    </div>
  `;

  mainContent.prepend(menuContainer);

  const rangeTamanhoFonte = menuContainer.querySelector("#range-tamanho-fonte");
  const themeRadios = menuContainer.querySelectorAll('input[name="tema"]');
  const btnCarregarNuvem = menuContainer.querySelector("#btn-carregar-nuvem");
  const btnLimparCache = menuContainer.querySelector("#btn-limpar-cache");

  barraEstudo.style.cursor = "pointer";
  barraEstudo.addEventListener("click", () => {
    menuContainer.classList.toggle("ativa");
  });

  function atualizarRangeVisual(valorAtual) {
    const percentual = ((valorAtual - FONTE_MIN) / (FONTE_MAX - FONTE_MIN)) * 100;
    rangeTamanhoFonte.style.setProperty("--range-progress", `${percentual}%`);
    rangeTamanhoFonte.closest(".range-shell")?.style.setProperty("--range-progress", `${percentual}%`);
  }

  function aplicarTamanhoFonte(novoTamanho) {
    const tamanhoSeguro = Math.min(FONTE_MAX, Math.max(FONTE_MIN, parseInt(novoTamanho, 10) || FONTE_PADRAO));
    if (window.GlobalFontScale?.setSize) {
      window.GlobalFontScale.setSize(tamanhoSeguro);
    } else {
      document.documentElement.style.setProperty("--tamanho-fonte", `${tamanhoSeguro}px`);
      document.documentElement.style.setProperty("--font-base-global", `${tamanhoSeguro}px`);
      document.documentElement.style.setProperty("--font-scale-global", String(tamanhoSeguro / FONTE_PADRAO));
      localStorage.setItem(FONTE_STORAGE_KEY, tamanhoSeguro);
    }
    rangeTamanhoFonte.value = String(tamanhoSeguro);
    atualizarRangeVisual(tamanhoSeguro);
  }

  const fonteInicial = Math.min(FONTE_MAX, Math.max(FONTE_MIN, parseInt(localStorage.getItem(FONTE_STORAGE_KEY) || FONTE_PADRAO, 10) || FONTE_PADRAO));
  rangeTamanhoFonte.value = String(fonteInicial);
  atualizarRangeVisual(fonteInicial);
  rangeTamanhoFonte.addEventListener("input", (event) => aplicarTamanhoFonte(event.target.value));['change', 'touchend', 'pointerup', 'mouseup'].forEach((nomeEvento) => {
    rangeTamanhoFonte.addEventListener(nomeEvento, () => {
      const valorMagnetico = Math.round(parseFloat(rangeTamanhoFonte.value) || FONTE_PADRAO);
      if (String(valorMagnetico) !== rangeTamanhoFonte.value) {
        rangeTamanhoFonte.value = String(valorMagnetico);
      }
      aplicarTamanhoFonte(valorMagnetico);
    });
  });

  window.addEventListener("globalfont:changed", (event) => {
    const tamanho = event?.detail?.size;
    if (!tamanho) return;
    rangeTamanhoFonte.value = String(tamanho);
    atualizarRangeVisual(tamanho);
  });

  const prefersDarkMedia = window.matchMedia('(prefers-color-scheme: dark)');

  function applyThemeToDOM(themeVal) {
    let isDark = false;
    if (themeVal === 'dark') {
      isDark = true;
    } else if (themeVal === 'system' && prefersDarkMedia.matches) {
      isDark = true;
    }
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.documentElement.dataset.themeChoice = themeVal;
  }

  function initTheme() {
    const savedTheme = localStorage.getItem('tema-interface') || 'system';
    const radio = document.querySelector(`input[name="tema"][value="${savedTheme}"]`);
    if (radio) radio.checked = true;
    applyThemeToDOM(savedTheme);
  }

  prefersDarkMedia.addEventListener('change', () => {
    const currentTheme = localStorage.getItem('tema-interface') || 'system';
    if (currentTheme === 'system') {
      applyThemeToDOM('system');
    }
  });

  themeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const selectedTheme = e.target.value;
      localStorage.setItem('tema-interface', selectedTheme);
      applyThemeToDOM(selectedTheme);
    });
  });

  initTheme();

  btnCarregarNuvem.addEventListener("click", async () => {
    const isLoggedIn = !!localStorage.getItem('supabase_user');
    if (!isLoggedIn) {
      alert("Você precisa fazer login primeiro para carregar da nuvem.");
      return;
    }

    btnCarregarNuvem.disabled = true;
    const textoOriginal = btnCarregarNuvem.innerHTML;
    btnCarregarNuvem.innerHTML = '⏳ Carregando...';

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const semanaAtual = window.semanaAtual || urlParams.get('semana');
      const estudoId = window.estudoId || document.body.dataset.estudo;

      if (!semanaAtual || !estudoId) throw new Error('Semana ou estudo não detectados');

      let attempts = 0;
      while (!window.SupabaseSync && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!window.SupabaseSync) throw new Error('Sistema de sincronização não disponível');

      const loadFlag = `sentinela_loaded_${semanaAtual}_${estudoId}`;
      sessionStorage.removeItem(loadFlag);

      const anotacoes = await window.SupabaseSync.carregarSentinelaAnotacoes(semanaAtual, estudoId);

      if (anotacoes && Object.keys(anotacoes).length > 0) {
        let hasChanges = false;
        for (const [key, value] of Object.entries(anotacoes)) {
          if (localStorage.getItem(key) !== value) {
            localStorage.setItem(key, value);
            hasChanges = true;
          }
        }

        if (hasChanges) {
          sessionStorage.setItem(loadFlag, 'true');
          btnCarregarNuvem.innerHTML = '✅ Carregado!';
          alert("Anotações carregadas da nuvem! A página será recarregada.");
          setTimeout(() => location.reload(), 1000);
        } else {
          btnCarregarNuvem.innerHTML = '✅ Já sincronizado';
          setTimeout(() => {
            btnCarregarNuvem.innerHTML = textoOriginal;
            btnCarregarNuvem.disabled = false;
          }, 2000);
        }
      } else {
        btnCarregarNuvem.innerHTML = '📭 Nada na nuvem';
        setTimeout(() => {
          btnCarregarNuvem.innerHTML = textoOriginal;
          btnCarregarNuvem.disabled = false;
        }, 2000);
      }
    } catch (error) {
      alert(`Erro ao carregar da nuvem: ${error.message}`);
      btnCarregarNuvem.innerHTML = '❌ Erro';
      setTimeout(() => {
        btnCarregarNuvem.innerHTML = textoOriginal;
        btnCarregarNuvem.disabled = false;
      }, 2000);
    }
  });

  btnLimparCache.addEventListener("click", () => {
    let totalBytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key) || '';
      totalBytes += (key.length + value.length) * 2;
    }
    const quotaBytes = 5 * 1024 * 1024;
    const percentualUso = (totalBytes / quotaBytes) * 100;

    const urlParams = new URLSearchParams(window.location.search);
    const estudoAtual = String(window.estudoId || document.body?.dataset?.estudo || '').trim();
    const semanaAtual = String(window.semanaAtual || urlParams.get('semana') || document.body?.dataset?.estudo || '').trim();
    const loadFlagAtual = `sentinela_loaded_${semanaAtual}_${estudoAtual}`;

    const chavePertenceAoEstudoAtual = (key) => {
      if (!key) return false;
      if (key === loadFlagAtual) return true;
      if (!(/^(c-|r-|obj-|paragrafo-|qa:)/.test(key) || /-pg-/.test(key) || key.startsWith('sentinela_loaded_'))) {
        return false;
      }

      const normalizada = String(key);
      if (estudoAtual && normalizada.includes(estudoAtual)) return true;
      if (semanaAtual && normalizada.includes(semanaAtual)) return true;
      return false;
    };

    const mensagemConfirmacao =
      `Isso apagará apenas as anotações, marcações e respostas de IA deste estudo da Sentinela neste dispositivo.

` +
      `Uso atual do cache: ${percentualUso.toFixed(2)}% de 5 MB.

` +
      `Deseja continuar?`;

    if (confirm(mensagemConfirmacao)) {
      let removidos = 0;
      Object.keys(localStorage).forEach(key => {
        if (chavePertenceAoEstudoAtual(key)) {
          localStorage.removeItem(key);
          removidos += 1;
        }
      });
      alert(`As referências deste estudo foram limpas! (${removidos} item(ns)) A página será recarregada.`);
      location.reload();
    }
  });
});
