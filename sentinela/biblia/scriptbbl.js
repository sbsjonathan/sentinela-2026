// scriptbbl.js - Versão final com "Robô 2.0" E suporte a referências complexas.

document.addEventListener('cacheRestored', () => {
  console.log('🟢 scriptbbl.js ouviu o sinal. Iniciando...');

  // --- O "ROBÔ" QUE AMARRA OS LINKS (VERSÃO 2.0 - MAIS INTELIGENTE) ---
  function wrapBblLinks() {
    console.log('   -> Robô 2.0 iniciando: procurando links para amarrar...');
    
    if (!document.querySelector('#style-no-wrap')) {
      const style = document.createElement('style');
      style.id = 'style-no-wrap';
      style.textContent = '.no-wrap { white-space: nowrap; }';
      document.head.appendChild(style);
    }

    const processedParents = new Set(); 

    document.querySelectorAll('a.bbl').forEach(linkEl => {
      const parent = linkEl.parentNode;
      if (!parent || processedParents.has(parent)) {
        return; 
      }
      
      const regex = /\(\s*(<a class="bbl"[^>]*>.*?<\/a>)\s*\)/g;
      const originalHTML = parent.innerHTML;
      const newHTML = originalHTML.replace(regex, '<span class="no-wrap">($1)</span>');
      
      if (originalHTML !== newHTML) {
        parent.innerHTML = newHTML;
      }

      processedParents.add(parent);
    });
    console.log('   -> Robô 2.0 terminou o trabalho de amarração.');
  }
  // --- FIM DO ROBÔ ---

  wrapBblLinks();
  
  if (typeof ABREVIACOES === 'undefined') {
    console.error("ERRO: O arquivo abrev.js não foi carregado ou não foi encontrado.");
    return;
  }
  
  let isModalOpen = false;

  function blockTextSelection() {
    document.body.classList.add('no-select-global');
  }

  function unblockTextSelection() {
    document.body.classList.remove('no-select-global');
  }

  // A lógica de adicionar os listeners foi mantida.
  document.querySelectorAll('.bbl').forEach(el => {
    el.style.cursor = 'pointer';
    let pressTimer = null;
    let moveTooMuch = false;
    let startX = 0, startY = 0;

    el.addEventListener('touchstart', function(e) {
      if (e.touches.length > 1) return;
      moveTooMuch = false;
      blockTextSelection();
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      el.classList.add('pressionando');
      pressTimer = setTimeout(() => {
        if (!moveTooMuch) {
          el.classList.remove('pressionando');
          el.classList.add('ref-aberta');
          setTimeout(() => {
            abrirModalSeForRef(el); // Esta função foi melhorada
            el.classList.remove('ref-aberta');
          }, 200);
        }
      }, 300);
    });

    el.addEventListener('touchmove', function(e) {
      const touch = e.touches[0];
      if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) {
        moveTooMuch = true;
        clearTimeout(pressTimer);
        el.classList.remove('pressionando');
      }
    });

    function resetAppearance() {
      clearTimeout(pressTimer);
      el.classList.remove('pressionando');
      el.classList.remove('ref-aberta');
      if (!isModalOpen) {
        setTimeout(() => { unblockTextSelection(); }, 50);
      }
    }

    el.addEventListener('touchend', resetAppearance);
    el.addEventListener('touchcancel', resetAppearance);
    el.addEventListener('contextmenu', e => e.preventDefault());
  });

  const modal = document.getElementById('modal-biblia');
  const modalCorpo = document.getElementById('modal-biblia-corpo');
  const botaoFechar = document.getElementById('modal-biblia-fechar');
  const modalContent = document.querySelector('.modal-biblia-content');

  async function abrirModalBibl(referencia) {
    isModalOpen = true;
    blockTextSelection();
    modal.style.display = 'flex';
    document.body.style.overflow = "hidden";
    modalCorpo.innerHTML = '<h3>Carregando...</h3>';
    const resultado = await buscarVersiculo(referencia);
    modalCorpo.innerHTML = `<h3>${resultado.titulo}</h3><div>${resultado.texto}</div>`;
  }

  // FUNÇÃO ATUALIZADA para detectar múltiplas referências com ";"
  function abrirModalSeForRef(el) {
    const ref = el.textContent.trim();
    
    // Se tiver ponto e vírgula, já sabemos que é complexa
    if (ref.includes(';')) {
      console.log('🎯 Detectadas múltiplas referências:', ref);
      abrirModalBibl(ref);
      return;
    }
    
    // CORREÇÃO: Adicionado áÁ no regex
    if (/^[1-3]?\s?[A-Za-zêÊãÃíÍóÓâÂéÉôÔúÚçÇáÁ.]+\s\d+:[\d,\s-–—]+$/.test(ref) || /^[1-3]?\s?[A-Za-zêÊãÃíÍóÓâÂéÉôÔúÚçÇáÁ.]+\s\d+:\d+\s*[\u2013\u2014-]\s*\d+:\d+$/.test(ref)) {
      abrirModalBibl(ref);
    }
  }

  function fecharModal() {
    modal.style.display = 'none';
    document.body.style.overflow = "";
    isModalOpen = false;
    setTimeout(() => { unblockTextSelection(); }, 100);
  }

  botaoFechar.addEventListener('click', fecharModal);
  modal.addEventListener('click', fecharModal);
  modalContent.addEventListener('click', e => e.stopPropagation());
  modalContent.addEventListener('touchstart', e => e.stopPropagation());
  window.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal(); });

  // FUNÇÕES ADICIONADAS para processar referências complexas
  async function processarMultiplasReferencias(refString) {
    const referencias = refString.split(';').map(ref => ref.trim()).filter(ref => ref.length > 0);
    
    let resultadosCompletos = [];
    let nomeLivroBase = '';
    let titulosParaMostrar = [];

    for (let i = 0; i < referencias.length; i++) {
        let refAtual = referencias[i].trim();
        
        if (i > 0 && /^\d+:[\d,\s-–—]+$/.test(refAtual)) {
            const primeiraRef = referencias[0];
            const matchPrimeiraRef = primeiraRef.match(/^([1-3]?\s?[A-Za-zêÊãÃíÍóÓâÂéÉôÔúÚçÇáÁ.]+)\s/);
            if (matchPrimeiraRef) {
                refAtual = matchPrimeiraRef[1] + ' ' + refAtual;
            }
        }

        const resultado = await buscarVersiculo(refAtual);
        
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

  // FUNÇÃO PRINCIPAL ATUALIZADA
  async function buscarVersiculo(refString) {
    if (refString.includes(';')) {
      return await processarMultiplasReferencias(refString);
    }
    
    // CORREÇÃO: Adicionado áÁ nos regex
    let multiCapMatch = refString.match(/^([1-3]?\s?[A-Za-zêÊãÃíÍóÓâÂéÉôÔúÚçÇáÁ.]+)\s?(\d{1,3}):(\d{1,3})\s*[-–—]\s*(\d{1,3}):(\d{1,3})$/);
    let singleCapMatch = refString.match(/^([1-3]?\s?[A-Za-zêÊãÃíÍóÓâÂéÉôÔúÚçÇáÁ.]+)\s?(\d{1,3}):([\d,\s-–—]+)/);

    if (!multiCapMatch && !singleCapMatch) {
      return { titulo: "Referência Inválida", texto: "Formato não reconhecido." };
    }
    
    const isMultiCap = !!multiCapMatch;
    const match = isMultiCap ? multiCapMatch : singleCapMatch;
    
    // CORREÇÃO: Melhorada a limpeza do nome
    let nomeAbreviado = match[1].replace(/[\.\s]/g, '').trim();
    
    const mapeamentosEspeciais = {
      'Deut': 'deuteronomio',
      'Gál': 'galatas'
    };
    
    const nomeLivro = mapeamentosEspeciais[nomeAbreviado] || ABREVIACOES[nomeAbreviado] || nomeAbreviado.toLowerCase().replace(/\s/g, '');

    let dados;
    try {
      const resp = await fetch(`../biblia/data/${nomeLivro}.json`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      dados = await resp.json();
    } catch (e) {
      console.error(`Erro ao buscar ../biblia/data/${nomeLivro}.json:`, e);
      return { titulo: "Livro não encontrado", texto: `O livro "${nomeLivro}" não foi encontrado.` };
    }

    let textoHtml = "";
    let versosColetados = [];

    if (isMultiCap) {
      let capIni = parseInt(match[2]), versIni = parseInt(match[3]);
      let capFim = parseInt(match[4]), versFim = parseInt(match[5]);

      for (let c = capIni; c <= capFim; c++) {
        const capObj = dados.capitulos.find(chap => chap.capitulo === c);
        if (!capObj) continue;

        let versiculosDoCapitulo = [];
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
        if (item.includes('-')) {
          const [ini, fim] = item.split('-').map(Number);
          versosColetados.push(...capObj.versiculos.filter(v => v.verso >= ini && v.verso <= fim));
        } else {
          const verso = capObj.versiculos.find(v => v.verso === Number(item));
          if (verso) versosColetados.push(verso);
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

  // PATCH 1: APENAS para ilustrações dinâmicas - função mínima
  window.ativarLinksBiblicos = function(container) {
    console.log('🎨 Processando ilustração:', container);
    
    // Aplica a MESMA lógica original apenas nos novos elementos
    container.querySelectorAll('.bbl:not([data-processado])').forEach(el => {
      el.dataset.processado = 'true';
      el.style.cursor = 'pointer';
      let pressTimer = null;
      let moveTooMuch = false;
      let startX = 0, startY = 0;

      el.addEventListener('touchstart', function(e) {
        if (e.touches.length > 1) return;
        moveTooMuch = false;
        blockTextSelection();
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        el.classList.add('pressionando');
        pressTimer = setTimeout(() => {
          if (!moveTooMuch) {
            el.classList.remove('pressionando');
            el.classList.add('ref-aberta');
            setTimeout(() => {
              abrirModalSeForRef(el);
              el.classList.remove('ref-aberta');
            }, 200);
          }
        }, 300);
      });

      el.addEventListener('touchmove', function(e) {
        const touch = e.touches[0];
        if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) {
          moveTooMuch = true;
          clearTimeout(pressTimer);
          el.classList.remove('pressionando');
        }
      });

      function resetAppearance() {
        clearTimeout(pressTimer);
        el.classList.remove('pressionando');
        el.classList.remove('ref-aberta');
        if (!isModalOpen) {
          setTimeout(() => { unblockTextSelection(); }, 50);
        }
      }

      el.addEventListener('touchend', resetAppearance);
      el.addEventListener('touchcancel', resetAppearance);
      el.addEventListener('contextmenu', e => e.preventDefault());
    });
  };

});