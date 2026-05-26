// clickable/clickable.js (VERSÃO COMPLETA COM OBJETIVO + SUBTÍTULOS)

function initClickable() {
  const estudoId = window.estudoId || "0";
  const triggers = document.querySelectorAll("p.pergunta, .lista-recapitulacao li");

  function createIAResponseBlock({ idRespostaIA, buttonTitle, placeholderHTML }) {
    const anotacaoContainer = document.createElement("div");
    anotacaoContainer.className = "anotacao";
    anotacaoContainer.hidden = true;

    const iaWrapper = document.createElement("div");
    iaWrapper.className = "ia-wrapper";

    const respostaIADiv = document.createElement("div");
    respostaIADiv.className = "clickable";
    respostaIADiv.id = idRespostaIA;
    respostaIADiv.contentEditable = "false";
    respostaIADiv.innerHTML = placeholderHTML;

    const btnGerarIA = document.createElement("button");
    btnGerarIA.textContent = "✨";
    btnGerarIA.title = buttonTitle;
    btnGerarIA.className = "btn-gerar-ia";

    iaWrapper.appendChild(respostaIADiv);
    iaWrapper.appendChild(btnGerarIA);
    anotacaoContainer.appendChild(iaWrapper);

    return { anotacaoContainer, iaWrapper, respostaIADiv, btnGerarIA };
  }

  triggers.forEach((triggerElement) => {
    const isRecapQuestion = triggerElement.tagName === 'LI';

    if (isRecapQuestion) {
      const recapIndex = Array.from(triggerElement.parentElement.children).indexOf(triggerElement) + 1;
      const idPergunta = `p-rcp-${recapIndex}-${estudoId}`;
      const idRespostaIA = `r-rcp-${recapIndex}-${estudoId}`;
      const idComentario = `c-rcp-${recapIndex}-${estudoId}`;
      triggerElement.id = idPergunta;

      const { anotacaoContainer, iaWrapper, respostaIADiv, btnGerarIA } = createIAResponseBlock({
        idRespostaIA,
        buttonTitle: 'Gerar Resposta com IA (Análise Global)',
        placeholderHTML: '<span style="color: #9ca3af;">Clique no ícone ✨ para gerar uma resposta.</span>'
      });

      const comentariosDiv = document.createElement("div");
      comentariosDiv.className = "comentarios";
      comentariosDiv.contentEditable = "true";
      comentariosDiv.id = idComentario;

      triggerElement.appendChild(anotacaoContainer);
      triggerElement.appendChild(comentariosDiv);

      if (window.CacheAnotacao) {
        comentariosDiv.innerHTML = window.CacheAnotacao.carregar(idComentario);
        respostaIADiv.innerHTML = window.CacheAnotacao.carregar(idRespostaIA) || '<span style="color: #9ca3af;">Clique no ícone ✨ para gerar uma resposta.</span>';
        comentariosDiv.addEventListener('input', () => {
          window.CacheAnotacao.salvar(idComentario, comentariosDiv.innerHTML);
        });
      }

      btnGerarIA.onclick = () => gerarRespostaIA_Recap(idPergunta, iaWrapper, idRespostaIA);

      triggerElement.style.cursor = "pointer";
      const toggleAIView = (e) => {
        if (e.target.closest('.btn-gerar-ia, .comentarios, a')) return;
        const abrir = !anotacaoContainer.classList.contains("ativa");
        anotacaoContainer.classList.toggle("ativa", abrir);
        anotacaoContainer.hidden = !abrir;
        e.preventDefault();
      };
      triggerElement.addEventListener('click', toggleAIView);

    } else {
      const spanNumero = triggerElement.querySelector("span");
      if (!spanNumero) return;

      const numeroParagrafo = spanNumero.textContent.trim().replace('.', '');
      const idPergunta = `p-${estudoId}-${numeroParagrafo}`;
      const idContainerIA = `ia-${estudoId}-${numeroParagrafo}`;
      const idComentario = `c-${estudoId}-${numeroParagrafo}`;
      const idRespostaIA = `r-${estudoId}-${numeroParagrafo}`;

      triggerElement.id = idPergunta;

      const paragrafosAssociados = [];
      let elementoAtual = triggerElement.parentElement.nextElementSibling;
      while (elementoAtual && (elementoAtual.classList.contains('paragrafo') || elementoAtual.matches('[class^="imagem"]'))) {
        if (elementoAtual.classList.contains('paragrafo')) {
          paragrafosAssociados.push(elementoAtual);
          elementoAtual.setAttribute('data-question-id', idPergunta);
        }
        elementoAtual = elementoAtual.nextElementSibling;
      }

      paragrafosAssociados.forEach((p, index) => {
        p.id = `${idPergunta}-pg-${index}`;
      });

      const { anotacaoContainer, iaWrapper, respostaIADiv, btnGerarIA } = createIAResponseBlock({
        idRespostaIA,
        buttonTitle: 'Gerar Resposta com IA',
        placeholderHTML: '<span style="color: #9ca3af;">Clique no ícone ✨ para gerar uma resposta.</span>'
      });

      const comentariosDiv = document.createElement("div");
      comentariosDiv.className = "comentarios";
      comentariosDiv.contentEditable = "true";
      comentariosDiv.id = idComentario;

      const iaContainer = document.createElement('div');
      iaContainer.id = idContainerIA;

      const parentOfQuestion = triggerElement.parentElement;
      parentOfQuestion.parentNode.insertBefore(iaContainer, parentOfQuestion);

      iaContainer.appendChild(parentOfQuestion);
      iaContainer.appendChild(anotacaoContainer);
      iaContainer.appendChild(comentariosDiv);

      let elementoParaMover = iaContainer.nextElementSibling;
      while (elementoParaMover && (paragrafosAssociados.includes(elementoParaMover) || elementoParaMover.matches('[class^="imagem"]'))) {
        const proximo = elementoParaMover.nextElementSibling;
        iaContainer.appendChild(elementoParaMover);
        elementoParaMover = proximo;
      }

      btnGerarIA.onclick = () => gerarRespostaIA(idPergunta, iaWrapper, idRespostaIA);

      if (window.CacheAnotacao) {
        comentariosDiv.innerHTML = window.CacheAnotacao.carregar(idComentario);
        respostaIADiv.innerHTML = window.CacheAnotacao.carregar(idRespostaIA) || '<span style="color: #9ca3af;">Clique no ícone ✨ para gerar uma resposta.</span>';
        comentariosDiv.addEventListener('input', () => {
          window.CacheAnotacao.salvar(idComentario, comentariosDiv.innerHTML);
        });
      }

      triggerElement.style.cursor = "pointer";
      const toggleAIView = (e) => {
        if (!e.target.closest('.bbl, a')) {
          const abrir = !anotacaoContainer.classList.contains("ativa");
          anotacaoContainer.classList.toggle("ativa", abrir);
          anotacaoContainer.hidden = !abrir;
          e.preventDefault();
        }
      };
      triggerElement.addEventListener('click', toggleAIView);
    }
  });

  const objetivoElement = document.querySelector('.objetivo');
  if (objetivoElement && !objetivoElement.dataset.iaObjetivoReady) {
    objetivoElement.dataset.iaObjetivoReady = '1';

    const idObjetivo = `obj-${estudoId}`;
    const idRespostaObjetivo = `r-obj-${estudoId}`;

    objetivoElement.id = idObjetivo;

    const { anotacaoContainer, iaWrapper, respostaIADiv, btnGerarIA } = createIAResponseBlock({
      idRespostaIA: idRespostaObjetivo,
      buttonTitle: 'Gerar Visão Geral do Artigo',
      placeholderHTML: '<span style="color: #9ca3af;">Clique no ícone ✨ para gerar uma visão geral completa do artigo.</span>'
    });

    respostaIADiv.style.minHeight = '120px';
    respostaIADiv.style.maxHeight = '400px';
    respostaIADiv.style.overflowY = 'auto';

    objetivoElement.parentNode.insertBefore(anotacaoContainer, objetivoElement.nextSibling);

    if (window.CacheAnotacao) {
      respostaIADiv.innerHTML = window.CacheAnotacao.carregar(idRespostaObjetivo) || '<span style="color: #9ca3af;">Clique no ícone ✨ para gerar uma visão geral completa do artigo.</span>' ;
    }

    btnGerarIA.onclick = () => gerarRespostaIA_Objetivo(idObjetivo, iaWrapper, idRespostaObjetivo);

    objetivoElement.style.cursor = 'pointer';
    objetivoElement.addEventListener('click', (e) => {
      if (!e.target.closest('.btn-gerar-ia, a')) {
        const abrir = !anotacaoContainer.classList.contains('ativa');
        anotacaoContainer.classList.toggle('ativa', abrir);
        anotacaoContainer.hidden = !abrir;
        e.preventDefault();
      }
    });
  }

  const subtituloTriggers = [];
  const estudoTitulo = document.querySelector('h1.estudo-titulo');
  if (estudoTitulo) subtituloTriggers.push({ element: estudoTitulo, tipo: 'h1', index: 0 });
  document.querySelectorAll('h2.subtitulo').forEach((element, index) => {
    subtituloTriggers.push({ element, tipo: 'h2', index: index + 1 });
  });

  subtituloTriggers.forEach(({ element, tipo, index }) => {
    if (!element || element.dataset.iaSubReady) return;
    element.dataset.iaSubReady = '1';

    const idTrigger = tipo === 'h1' ? `sub-h1-${estudoId}` : `sub-h2-${index}-${estudoId}`;
    const idRespostaIA = `r-${idTrigger}`;
    const placeholderHTML = '<span style="color: #9ca3af;">Clique no ícone ✨ para gerar uma visão geral desta seção.</span>' ;

    element.id = idTrigger;
    element.classList.add('subtitulo-ia-trigger');
    if (tipo === 'h1') element.classList.add('estudo-titulo-ia-trigger');

    const { anotacaoContainer, iaWrapper, respostaIADiv, btnGerarIA } = createIAResponseBlock({
      idRespostaIA,
      buttonTitle: 'Gerar Visão Geral desta Seção',
      placeholderHTML
    });

    respostaIADiv.classList.add('clickable-sub');

    const cachedHTML = window.AgenteSubResumo?.getCachedHTML?.(idTrigger);
    if (cachedHTML) {
      respostaIADiv.innerHTML = cachedHTML;
    }

    element.parentNode.insertBefore(anotacaoContainer, element.nextSibling);

    btnGerarIA.onclick = () => gerarRespostaIA_Subtitulo(idTrigger, iaWrapper, idRespostaIA);

    element.style.cursor = 'pointer';
    element.addEventListener('click', (e) => {
      if (!e.target.closest('.btn-gerar-ia, a')) {
        const abrir = !anotacaoContainer.classList.contains('ativa');
        anotacaoContainer.classList.toggle('ativa', abrir);
        anotacaoContainer.hidden = !abrir;
        e.preventDefault();
      }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initClickable);
} else {
  initClickable();
}
