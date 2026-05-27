(function() {
  if (window.bibleSystemInitialized) return;
  window.bibleSystemInitialized = true;

  let isModalOpen = false;
  let lastClickedBbl = null; // Memória de qual span abriu o modal

  function blockTextSelection() {
    document.body.classList.add('no-select-global');
  }

  function unblockTextSelection() {
    document.body.classList.remove('no-select-global');
  }

  function ensureModalExists() {
    if (document.getElementById('modal-biblia')) return;
    
    const modalHTML = `
      <div id="modal-biblia" style="display: none;">
        <div class="modal-biblia-content">
          <span id="modal-biblia-transcrever" title="Transcrever versículo">T</span>
          <span id="modal-biblia-fechar">&times;</span>
          <div id="modal-biblia-corpo"></div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    setupModalListeners();
  }

  function setupModalListeners() {
    const modal = document.getElementById('modal-biblia');
    const btnFechar = document.getElementById('modal-biblia-fechar');
    const btnTranscrever = document.getElementById('modal-biblia-transcrever');
    const content = modal.querySelector('.modal-biblia-content');

    if (btnFechar) btnFechar.addEventListener('click', fecharModal);
    if (btnTranscrever) btnTranscrever.addEventListener('click', transcreverVersiculo);
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
    setTimeout(unblockTextSelection, 100);
  }
  
  async function abrirModalBibl(referencia, triggerElement = null) {
    if (typeof ABREVIACOES === 'undefined') return;
    
    lastClickedBbl = triggerElement; // Guarda a referência do elemento clicado
    isModalOpen = true;
    blockTextSelection();
    
    ensureModalExists();
    const modal = document.getElementById('modal-biblia');
    const corpo = document.getElementById('modal-biblia-corpo');
    const btnTranscrever = document.getElementById('modal-biblia-transcrever');
    
    // Mostra o botão "T" apenas se estivermos num ambiente de edição (RichText / Fullsc)
    if (btnTranscrever) {
      if (typeof M5_Factory !== 'undefined' && typeof M2_Query !== 'undefined') {
        btnTranscrever.style.display = 'flex';
      } else {
        btnTranscrever.style.display = 'none';
      }
    }
    
    modal.style.display = 'flex';
    document.body.style.overflow = "hidden";
    corpo.innerHTML = '<h3>Carregando...</h3>';
    
    try {
      const resultado = await buscarVersiculo(referencia);
      corpo.innerHTML = `<h3>${resultado.titulo}</h3><div>${resultado.texto}</div>`;
    } catch (error) {
      corpo.innerHTML = '<h3>Erro</h3><div>Não foi possível carregar a referência.</div>';
    }
  }

  // --- LÓGICA DE TRANSCRIÇÃO PARA O EDITOR ---
  function transcreverVersiculo() {
    if (!lastClickedBbl || typeof M3_TextModel === 'undefined' || typeof M2_Query === 'undefined') return;

    const corpo = document.getElementById('modal-biblia-corpo');
    const paragrafos = corpo.querySelectorAll('p');

    if (paragrafos.length === 0) return;

    // 1. Coleta o HTML dos parágrafos, removendo as tags <br> para fluir naturalmente com o texto.
    let versosHtml = [];
    paragrafos.forEach(p => versosHtml.push(p.innerHTML.trim()));
    let textoLimpo = versosHtml.join(' ').replace(/<br\s*\/?>/gi, ' ');

    // 2. Monta o texto no formato desejado: "— texto_em_itálico"
    let htmlToInject = ` <i>— ${textoLimpo}</i>`;

    // 3. Acha a caixa de texto onde o link clicado está
    const editable = lastClickedBbl.closest('.editable');
    if (!editable) return;

    // 4. Salva o estado no histórico para o botão Desfazer funcionar
    if (window.M12_History && window.M12_History.beforeChange) window.M12_History.beforeChange();

    // 5. Injeta o texto LOGO APÓS o link clicado (na mesma estrutura/parágrafo)
    lastClickedBbl.insertAdjacentHTML('afterend', htmlToInject);

    // 6. Sincroniza o modelo de texto com a nova inserção
    if (typeof M3_TextModel !== 'undefined') {
        M3_TextModel.sync(editable);
        M3_TextModel.syncAll();
    }
    
    // 7. Atualiza o histórico
    if (window.M12_History && window.M12_History.afterChange) window.M12_History.afterChange(2);

    // 8. Dispara o evento de 'input' para forçar o Auto-Save
    const editor = document.getElementById('editor');
    if (editor) {
        editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // 9. Fecha o modal para o usuário continuar a leitura/edição
    fecharModal();
  }

  function setupBblLinkListeners(linkEl) {
    linkEl.style.cursor = 'pointer';

    const FEEDBACK_DELAY = 75;
    const LONG_PRESS_MS = 150;
    const SLOP_FEEDBACK = 6;
    const SLOP_OPEN = 12;

    let pressTimer = null;
    let feedbackTimer = null;
    let moveTooMuch = false;
    let startX = 0, startY = 0;

    const clearTimers = () => {
      if (pressTimer) clearTimeout(pressTimer);
      if (feedbackTimer) clearTimeout(feedbackTimer);
      pressTimer = null;
      feedbackTimer = null;
    };

    const cancelGesture = () => {
      moveTooMuch = true;
      clearTimers();
      linkEl.classList.remove('pressionando', 'ref-aberta');
    };

    const touchStartHandler = (e) => {
      if (e.touches.length > 1) return;
      moveTooMuch = false;
      blockTextSelection();

      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;

      feedbackTimer = setTimeout(() => {
        if (!moveTooMuch) linkEl.classList.add('pressionando');
      }, FEEDBACK_DELAY);

      pressTimer = setTimeout(() => {
        if (!moveTooMuch) {
          linkEl.classList.remove('pressionando');
          linkEl.classList.add('ref-aberta');

          if (navigator.vibrate) navigator.vibrate(50);
          
          // Passamos o próprio elemento linkEl como segundo parâmetro
          abrirModalBibl(linkEl.textContent.trim(), linkEl);
          
          setTimeout(() => linkEl.classList.remove('ref-aberta'), 200);
        }
      }, LONG_PRESS_MS);
    };

    const touchMoveHandler = (e) => {
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);

      if (ay > ax && ay > SLOP_FEEDBACK) {
        cancelGesture();
        return;
      }

      if (ax > SLOP_OPEN || ay > SLOP_OPEN) {
        cancelGesture();
        return;
      }

      if (ax > SLOP_FEEDBACK || ay > SLOP_FEEDBACK) {
        clearTimeout(feedbackTimer);
        feedbackTimer = null;
        linkEl.classList.remove('pressionando');
      }
    };

    const touchEndHandler = () => {
      clearTimers();
      linkEl.classList.remove('pressionando', 'ref-aberta');

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

  async function processarMultiplasReferencias(refString) {
    const referencias = refString.split(';').map(ref => ref.trim()).filter(ref => ref.length > 0);
    
    let resultadosCompletos =[];
    let nomeLivroBase = '';
    let titulosParaMostrar =[];
    
    let ultimoLivro = '';
    let ultimoCapitulo = '';

    for (let i = 0; i < referencias.length; i++) {
        let refAtual = referencias[i].trim();
        
        let matchCompleto = refAtual.match(/^([1-3]?\s?[A-Za-zêÊãÃíÍóÓâÂéÉôÔúÚçÇáÁ.]+)\s+(\d{1,3}):/);
        if (matchCompleto) {
            ultimoLivro = matchCompleto[1].trim();
            const capMatches =[...refAtual.matchAll(/(\d{1,3}):/g)];
            if (capMatches.length > 0) {
                ultimoCapitulo = capMatches[capMatches.length - 1][1];
            }
        } else {
            if (/^(\d{1,3}):/.test(refAtual)) {
                refAtual = ultimoLivro + ' ' + refAtual;
                const capMatches =[...refAtual.matchAll(/(\d{1,3}):/g)];
                if (capMatches.length > 0) {
                    ultimoCapitulo = capMatches[capMatches.length - 1][1];
                }
            } else if (/^[\d,\s-–—]+$/.test(refAtual)) {
                refAtual = ultimoLivro + ' ' + ultimoCapitulo + ':' + refAtual;
            }
        }

        const resultado = await buscarVersiculoCore(refAtual);
        
        if (resultado.titulo !== "Referência Inválida" && resultado.titulo !== "Não Encontrado" && resultado.titulo !== "Livro não encontrado") {
            resultadosCompletos.push(resultado);
            if (nomeLivroBase === '') {
                const livroMatch = resultado.titulo.match(/^([^0-9]+)/);
                if (livroMatch) nomeLivroBase = livroMatch[1].trim();
            }
            titulosParaMostrar.push(resultado.titulo.replace(nomeLivroBase, '').trim());
        }
    }

    if (resultadosCompletos.length === 0) {
      return { titulo: "Referências Inválidas", texto: "Nenhuma das referências pôde ser encontrada." };
    }
    
    const capitulosUnicos = new Set(resultadosCompletos.map(r => r.titulo.match(/(\d+):/)?.[1]).filter(Boolean));
    const temMultiplosCapitulos = capitulosUnicos.size > 1;

    const tituloFinal = nomeLivroBase + ' ' + titulosParaMostrar.join('; ');
    let textoFinal = '';
    let capitulosJaMostrados = new Set();
    
    resultadosCompletos.forEach((resultado, index) => {
        const numeroCapitulo = resultado.titulo.match(/(\d+):/)?.[1];
        
        if (temMultiplosCapitulos && numeroCapitulo && !capitulosJaMostrados.has(numeroCapitulo)) {
            if (index > 0) {
                textoFinal += '<div style="margin: 20px 0 15px 0; border-top: 2px solid #ddd; padding-top: 15px;"></div>';
            }
            textoFinal += `<div style="margin-bottom: 12px;"><strong style="font-style: italic; color: #666; font-size: 1.1em;">Capítulo ${numeroCapitulo}</strong></div>`;
            capitulosJaMostrados.add(numeroCapitulo);
        } else if (index > 0) {
            textoFinal += '<div style="margin-top: 15px;"></div>';
        }
        
        textoFinal += resultado.texto;
    });

    return { titulo: tituloFinal, texto: textoFinal };
  }

  async function buscarVersiculoCore(refString) {
    let multiCapMatch = refString.match(/^([1-3]?\s?[A-Za-zêÊãÃíÍóÓâÂéÉôÔúÚçÇáÁ.]+)\s?(\d{1,3}):(\d{1,3})\s*[-–—]\s*(\d{1,3}):(\d{1,3})$/);
    let singleCapMatch = refString.match(/^([1-3]?\s?[A-Za-zêÊãÃíÍóÓâÂéÉôÔúÚçÇáÁ.]+)\s?(\d{1,3}):([\d,\s-–—]+)/);

    if (!multiCapMatch && !singleCapMatch) {
      return { titulo: "Referência Inválida", texto: "Formato não reconhecido." };
    }
    
    const isMultiCap = !!multiCapMatch;
    const match = isMultiCap ? multiCapMatch : singleCapMatch;
    let nomeAbreviado = match[1].replace(/[\.\s]/g, '').trim();
    
    const mapeamentosEspeciais = {
      'Deut': 'deuteronomio',
      'Gál': 'galatas'
    };
    
    const nomeLivro = mapeamentosEspeciais[nomeAbreviado] || ABREVIACOES[nomeAbreviado] || nomeAbreviado.toLowerCase().replace(/\s/g, '');

    let dados;
    try {
      dados = await fetchBookData(nomeLivro);
    } catch (e) {
      return { titulo: "Livro não encontrado", texto: `O livro "${nomeLivro}" não foi encontrado.` };
    }

    let textoHtml = "";
    let versosColetados =[];

    if (isMultiCap) {
      let capIni = parseInt(match[2]), versIni = parseInt(match[3]);
      let capFim = parseInt(match[4]), versFim = parseInt(match[5]);

      for (let c = capIni; c <= capFim; c++) {
        const capObj = dados.capitulos.find(chap => chap.capitulo === c);
        if (!capObj) continue;

        let versiculosDoCapitulo =[];
        if (c === capIni && c === capFim) versiculosDoCapitulo = capObj.versiculos.filter(v => v.verso >= versIni && v.verso <= versFim);
        else if (c === capIni) versiculosDoCapitulo = capObj.versiculos.filter(v => v.verso >= versIni);
        else if (c === capFim) versiculosDoCapitulo = capObj.versiculos.filter(v => v.verso <= versFim);
        else versiculosDoCapitulo = capObj.versiculos;
        
        versosColetados.push(...versiculosDoCapitulo.map(v => ({...v, capitulo: c}) ));
      }
    } else {
      const capituloNum = parseInt(match[2]);
      const capObj = dados.capitulos.find(c => c.capitulo === capituloNum);
      if (!capObj) return { titulo: "Não Encontrado", texto: `Capítulo ${capituloNum} não encontrado.` };
      
      match[3].split(',').forEach(item => {
        if (item.includes('-') || item.includes('–') || item.includes('—')) {
          const limites = item.split(/[-–—]/).map(Number);
          const ini = limites[0];
          const fim = limites[1];
          versosColetados.push(...capObj.versiculos.filter(v => v.verso >= ini && v.verso <= fim));
        } else {
          const numStr = item.replace(/\D/g, '');
          if (numStr) {
            const verso = capObj.versiculos.find(v => v.verso === Number(numStr));
            if (verso) versosColetados.push(verso);
          }
        }
      });
    }

    if (versosColetados.length > 0) {
      const temMultiplosCapitulos = new Set(versosColetados.map(v => v.capitulo)).size > 1;
      
      textoHtml = "";
      let capituloAtual = null;
      let paragrafoAtual = "";
      
      versosColetados.forEach((verso) => {
        const numeroCapitulo = verso.capitulo || parseInt(match[2]);
        
        if (temMultiplosCapitulos && numeroCapitulo !== capituloAtual) {
          if (paragrafoAtual) textoHtml += `<p>${paragrafoAtual}</p>`;
          paragrafoAtual = "";
          if (capituloAtual !== null) textoHtml += '<div style="margin: 20px 0 15px 0; border-top: 2px solid #ddd; padding-top: 15px;"></div>';
          textoHtml += `<div style="margin-bottom: 12px;"><strong style="font-style: italic; color: #666; font-size: 1.1em;">Capítulo ${numeroCapitulo}</strong></div>`;
          capituloAtual = numeroCapitulo;
        }
        
        if (verso.novo_paragrafo && paragrafoAtual) {
          textoHtml += `<p>${paragrafoAtual}</p>`;
          paragrafoAtual = `<strong>${verso.verso}</strong> ${verso.texto}`;
        } else {
          paragrafoAtual += (paragrafoAtual ? ` <strong>${verso.verso}</strong> ` : `<strong>${verso.verso}</strong> `) + verso.texto;
        }
      });
      if (paragrafoAtual) textoHtml += `<p>${paragrafoAtual}</p>`;
    }

    const nomeLivroFormatado = dados.nome_do_livro || nomeLivro.charAt(0).toUpperCase() + nomeLivro.slice(1);
    const tituloRef = isMultiCap ? `${nomeLivroFormatado} ${multiCapMatch[2]}:${multiCapMatch[3]}-${multiCapMatch[4]}:${multiCapMatch[5]}` : `${nomeLivroFormatado} ${singleCapMatch[2]}:${singleCapMatch[3]}`;
    
    return {
      titulo: tituloRef,
      texto: textoHtml || "Versículo(s) não encontrado(s)."
    };
  }

  async function buscarVersiculo(refString) {
    if (refString.includes(';')) {
      return await processarMultiplasReferencias(refString);
    }
    return await buscarVersiculoCore(refString);
  }

  async function fetchBookData(nomeArquivo) {
    // CORREÇÃO: Caminhos expandidos para alcançar a pasta correta partindo de qualquer arquivo
    const paths =[
      `../../../sentinela/biblia/data/${nomeArquivo}.json`, // Para fullsc.html
      `../../sentinela/biblia/data/${nomeArquivo}.json`,     
      `../sentinela/biblia/data/${nomeArquivo}.json`,        // Para container.html
      `./sentinela/biblia/data/${nomeArquivo}.json`,
      `sentinela/biblia/data/${nomeArquivo}.json`
    ];
    let lastError = null;
    for (const path of paths) {
      try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        return await response.json();
      } catch (e) { lastError = e; }
    }
    throw lastError || new Error('Arquivo bíblico não encontrado');
  }

  function normalizeBblLinks(root = document) {
    root.querySelectorAll('.bbl').forEach((link) => {
      if (link.dataset.bblBound === 'true') return;
      link.dataset.bblBound = 'true';
      setupBblLinkListeners(link);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureModalExists();
    normalizeBblLinks(document);
  });
  
  window.abrirModalBibl = abrirModalBibl;
  window.setupBblLinkListeners = setupBblLinkListeners;
  window.normalizeBblLinks = normalizeBblLinks;

})();