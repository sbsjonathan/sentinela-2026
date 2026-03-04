// scriptbbl-container.js - Versão final que une a robustez do container com as animações e bloqueio de seleção do scriptbbl.js

(function() {
  // Evita que o script seja inicializado mais de uma vez
  if (window.bibleSystemInitialized) return;
  window.bibleSystemInitialized = true;

  let isModalOpen = false;

  // --- LÓGICA DE BLOQUEIO DE SELEÇÃO (do scriptbbl.js) ---
  function blockTextSelection() {
    document.body.classList.add('no-select-global');
  }

  function unblockTextSelection() {
    document.body.classList.remove('no-select-global');
  }
  // --- FIM DO BLOQUEIO ---

  // Garante que o HTML do modal exista no DOM
  function ensureModalExists() {
    if (document.getElementById('modal-biblia')) return;
    
    const modalHTML = `
      <div id="modal-biblia" style="display: none;">
        <div class="modal-biblia-content">
          <span id="modal-biblia-fechar">&times;</span>
          <div id="modal-biblia-corpo"></div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    setupModalListeners();
  }

  // Configura os eventos do modal (fechar, etc.)
  function setupModalListeners() {
    const modal = document.getElementById('modal-biblia');
    const btnFechar = document.getElementById('modal-biblia-fechar');
    const content = modal.querySelector('.modal-biblia-content');

    if (btnFechar) btnFechar.addEventListener('click', fecharModal);
    if (modal) modal.addEventListener('click', fecharModal);
    if (content) {
        content.addEventListener('click', e => e.stopPropagation());
        content.addEventListener('touchstart', e => e.stopPropagation());
    }
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && isModalOpen) fecharModal(); });
  }

  function fecharModal() {
    const modal = document.getElementById('modal-biblia');
    if (modal) modal.style.display = 'none';
    
    document.body.style.overflow = "";
    isModalOpen = false;
    // Delay para garantir que o clique que fechou o modal não reabra outro
    setTimeout(unblockTextSelection, 100);
  }
  
  // Abre o modal com o conteúdo da referência
  async function abrirModalBibl(referencia) {
    if (typeof ABREVIACOES === 'undefined') {
      console.error("ERRO CRÍTICO: abrev.js não foi carregado.");
      return;
    }
    
    isModalOpen = true;
    blockTextSelection();
    
    ensureModalExists();
    const modal = document.getElementById('modal-biblia');
    const corpo = document.getElementById('modal-biblia-corpo');
    
    modal.style.display = 'flex';
    document.body.style.overflow = "hidden";
    corpo.innerHTML = '<h3>Carregando...</h3>';
    
    try {
      const resultado = await buscarVersiculo(referencia);
      corpo.innerHTML = `<h3>${resultado.titulo}</h3><div>${resultado.texto}</div>`;
    } catch (error) {
      console.error('Erro ao buscar versículo:', error);
      corpo.innerHTML = '<h3>Erro</h3><div>Não foi possível carregar a referência.</div>';
    }
  }

  // --- LÓGICA DE ANIMAÇÃO E EVENTOS (do scriptbbl.js) ---
  // Esta função é chamada pelo leitor.js para cada link criado
  function setupBblLinkListeners(linkEl) {
    linkEl.style.cursor = 'pointer';
    let pressTimer = null;
    let moveTooMuch = false;
    let startX = 0, startY = 0;

    const touchStartHandler = (e) => {
      if (e.touches.length > 1) return; // Ignora gestos com múltiplos dedos
      
      moveTooMuch = false;
      blockTextSelection(); // Bloqueia a seleção assim que o toque começa
      
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      
      linkEl.classList.add('pressionando'); // Ativa a primeira animação (feedback imediato)
      
      pressTimer = setTimeout(() => {
        if (!moveTooMuch) {
          linkEl.classList.remove('pressionando');
          linkEl.classList.add('ref-aberta'); // Ativa a segunda animação (abertura)
          
          if (navigator.vibrate) navigator.vibrate(50); // Vibração para feedback tátil

          // Abre o modal após a animação
          abrirModalBibl(linkEl.textContent.trim());
          
          // Limpa a classe de animação depois de um tempo
          setTimeout(() => linkEl.classList.remove('ref-aberta'), 200);
        }
      }, 350); // Tempo para considerar um "long press"
    };

    const touchMoveHandler = (e) => {
      // Se o dedo se mover demais, cancela o long press
      const touch = e.touches[0];
      if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) {
        moveTooMuch = true;
        clearTimeout(pressTimer);
        linkEl.classList.remove('pressionando');
      }
    };

    const touchEndHandler = () => {
      clearTimeout(pressTimer);
      linkEl.classList.remove('pressionando', 'ref-aberta');
      
      // Só desbloqueia a seleção se o modal não estiver aberto
      if (!isModalOpen) {
        setTimeout(unblockTextSelection, 50);
      }
    };

    linkEl.addEventListener('touchstart', touchStartHandler, { passive: true });
    linkEl.addEventListener('touchmove', touchMoveHandler, { passive: true });
    linkEl.addEventListener('touchend', touchEndHandler);
    linkEl.addEventListener('touchcancel', touchEndHandler);
    linkEl.addEventListener('contextmenu', e => e.preventDefault());
  }
  // --- FIM DA LÓGICA DE ANIMAÇÃO ---

  // --- LÓGICA AVANÇADA DE BUSCA DE VERSÍCULOS (do scriptbbl.js) ---
  // Esta versão é mais completa e lida melhor com múltiplos parágrafos.
  async function buscarVersiculo(refString) {
      if (refString.includes(';')) {
        // A lógica para múltiplas referências já estava boa e foi mantida.
        const refs = refString.split(';').map(r => r.trim());
        const results = await Promise.all(refs.map(r => buscarVersiculo(r)));
        
        const successfulResults = results.filter(r => r.texto && !r.texto.includes("não encontrado"));
        if (successfulResults.length === 0) return { titulo: "Referências não encontradas", texto: "" };
        
        const combinedTitle = successfulResults.map(r => r.titulo).join('; ');
        const combinedText = successfulResults.map(r => `<div><h4>${r.titulo}</h4>${r.texto}</div>`).join('<hr style="border:0; border-top:1px solid #ddd; margin: 1em 0;">');
        
        return { titulo: combinedTitle, texto: combinedText };
      }

      const match = refString.match(/^([1-3]?\s?[A-Za-zêÊãÃíÍóÓâÂéÉôÔúÚçÇáÁ.]+)\s?(\d{1,3}):([\d,\s-–—]+)/);

      if (!match) return { titulo: "Referência Inválida", texto: `Formato não reconhecido: "${refString}"` };
      
      const [, nomeAbreviado, capituloNumStr, versosStr] = match;
      // CORREÇÃO: Remove pontos, espaços extras e normaliza
      const nomeLivroKey = nomeAbreviado.replace(/[\.\s]/g, '').trim();
      const nomeArquivo = ABREVIACOES[nomeLivroKey];
      
      if (!nomeArquivo) return { titulo: "Livro não encontrado", texto: `Abreviação não reconhecida: "${nomeLivroKey}"` };

      let dados;
      try {
        const response = await fetch(`biblia/data/${nomeArquivo}.json`);
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        dados = await response.json();
      } catch (e) {
        console.error(`Erro ao carregar biblia/data/${nomeArquivo}.json:`, e);
        return { titulo: "Erro de Carregamento", texto: `Não foi possível carregar dados para "${nomeLivroKey}".` };
      }

      const capituloNum = parseInt(capituloNumStr, 10);
      const capObj = dados.capitulos.find(c => c.capitulo === capituloNum);

      if (!capObj) return { titulo: "Capítulo não encontrado", texto: `Capítulo ${capituloNum} de ${dados.nome_do_livro} não encontrado.` };

      const versosParaBuscar = new Set();
      versosStr.split(',').forEach(part => {
        part = part.trim();
        if (part.includes('-') || part.includes('–')) {
          const [start, end] = part.split(/[-–]/).map(Number);
          for (let i = start; i <= end; i++) versosParaBuscar.add(i);
        } else if (part) {
          versosParaBuscar.add(Number(part));
        }
      });
      
      let textoHtml = "";
      let paragrafoAtual = "";
      
      capObj.versiculos.forEach(verso => {
        if (versosParaBuscar.has(verso.verso)) {
          if (verso.novo_paragrafo && paragrafoAtual) {
            textoHtml += `<p>${paragrafoAtual.trim()}</p>`;
            paragrafoAtual = "";
          }
          paragrafoAtual += ` <strong>${verso.verso}</strong> ${verso.texto}`;
        }
      });

      if (paragrafoAtual) textoHtml += `<p>${paragrafoAtual.trim()}</p>`;
      
      if (!textoHtml) return { titulo: "Versículos não encontrados", texto: `Nenhum dos versículos em "${versosStr}" foi encontrado.` };
      
      return {
        titulo: `${dados.nome_do_livro} ${capituloNum}:${versosStr}`,
        texto: textoHtml
      };
  }

  // Inicializa o sistema
  document.addEventListener('DOMContentLoaded', () => {
    ensureModalExists();
    console.log('✅ Sistema bíblico (Container Edition) carregado com animações.');
  });
  
  // Expõe as funções que o leitor.js precisa
  window.abrirModalBibl = abrirModalBibl;
  window.setupBblLinkListeners = setupBblLinkListeners;

})();