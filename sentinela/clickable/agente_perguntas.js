(function () {
  const scriptURL = document.currentScript?.src || new URL('../clickable/agente_perguntas.js', location.href).href;
  let highlightsModule;
  const loadHighlights = () => highlightsModule || (highlightsModule = import(new URL('perguntas-highlights.js', scriptURL).href).catch(error => {
    highlightsModule = null;
    throw error;
  }));
  function restoreArticleBoxes() {
    const article = document.querySelector('main,article');
    if (article?.querySelector('.quadro1')) loadHighlights().then(api => api.restoreBoxMarks(article)).catch(() => {});
  }
  document.addEventListener('cacheRestored', restoreArticleBoxes);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restoreArticleBoxes, {once:true});
  else restoreArticleBoxes();

  const pendingQuestions = new Map();
  // Literal selection remains independent of explanatory prose.
  const HIGHLIGHT_CONFIG = {
    model: 'gemini-3.5-flash-lite',
    maxAttempts: 2,
    maxInputChars: 24000,
    maxOutputTokens: 1536
  };
  const DEFAULT_CONFIG = {
    enabled: true,
    workerUrl: 'https://gem.jonjonathan2-0.workers.dev',
    modelFallbacks: [
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite'
    ],
    timeoutMs: 22000,
    maxInputChars: 12000,
    maxOutputTokens: 2500,
    temperature: 0.15,
    topP: 0.85,
    topK: 24,
    cooldownKey: '__sentinela_perguntas_cooldown__',
    defaultCooldownMs: 30000
  };

  const userConfig = window.SENTINELA_PERGUNTAS_CONFIG || {};
  const CONFIG = Object.assign({}, DEFAULT_CONFIG, userConfig);

  const bibleCache = {};

  function injectStyles() {
    if (document.getElementById('sentinela-perguntas-style')) return;
    const style = document.createElement('style');
    style.id = 'sentinela-perguntas-style';
    style.textContent = `
      .anotacao.ativa { max-height: 1500px !important; }
      .ia-tabs-container { display: flex; flex-direction: column; gap: 12px; }
      .ia-tabs-header { display: flex; gap: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 4px; }
      .ia-tab-btn { background: none; border: none; padding: 6px 12px; cursor: pointer; font-size: 0.85rem; font-weight: 600; color: #9ca3af; border-radius: 4px; transition: all 0.2s ease; }
      .ia-tab-btn:hover { color: #4b5563; background: #f9fafb; }
      .ia-tab-btn.active { background: #f3f4f6; color: #375255; }
      .ia-tab-content { display: none; animation: fadeInTab 0.3s ease; }
      .ia-tab-content.active { display: block; }
      @keyframes fadeInTab { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
      .ia-answer-main { color: #374151; line-height: 1.6; font-size: 0.95rem; }
      .ia-answer-part { border-left: 4px solid transparent; padding-left: 10px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 6px; }
      .ia-answer-part[data-part="a"] { border-left-color: rgba(234,179,8,.65); }
      .ia-answer-part[data-part="b"] { border-left-color: rgba(34,197,94,.55); }
      .ia-answer-part[data-part="c"] { border-left-color: rgba(59,130,246,.50); }
      .ia-answer-part-title { font-size: .75rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: #6b7280; }
      .ia-answer-part-text { color: #4b5563; line-height: 1.6; background: #f9fafb; padding: 8px 12px; border-radius: 6px; font-style: italic; font-size: 0.95rem; }
      .ia-inline-note { font-size: .78rem; color: #6b7280; }
      .ia-status-error { color: #b91c1c; }
      .ia-status-ok { color: #166534; }
    `;
    document.head.appendChild(style);
  }
  injectStyles();

  function normalizeSpaces(text) {
    return String(text || '').replace(/\u200B/g, '').replace(/\r\n?/g, '\n').replace(/[\t\f\v ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  function escapeHTML(text) {
    return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function textToHTML(text) {
    let html = escapeHTML(normalizeSpaces(text));
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function safeJSONParse(text) {
    if (typeof text !== 'string' || !text.trim()) return null;
    const cleaned = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    // A valid top-level array must not be sliced into its first/last objects.
    try { return JSON.parse(cleaned); } catch (_) {}
    const start = cleaned.search(/[\[{]/);
    const end = cleaned.lastIndexOf(cleaned[start] === '[' ? ']' : '}');
    if (start >= 0 && end >= start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) {}
    }
    return null;
  }

  function parseQuestionPayload(text, extractive) {
    const parsed = safeJSONParse(text);
    const parts = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.sub_questions) ? parsed.sub_questions :
      parsed && typeof parsed === 'object' && (extractive ? Array.isArray(parsed.highlights) : typeof parsed.natural_answer === 'string') ? [parsed] : null;
    if (!parts?.length || parts.length > 12 || parts.some(part => {
      if (!part || typeof part !== 'object' || Array.isArray(part) || typeof part.question !== 'string') return true;
      if (!extractive) return typeof part.natural_answer !== 'string' || !part.natural_answer.trim() || typeof part.literal_smooth !== 'string';
      return !Array.isArray(part.highlights) || part.highlights.some(highlight => {
        if (!highlight || typeof highlight.literal_text !== 'string' || !highlight.literal_text.trim()) return true;
        if ('source_id' in highlight) return 'paragraph_number' in highlight || !/^quadro-\d+-\d+$/.test(highlight.source_id);
        return !Number.isInteger(Number(highlight.paragraph_number)) || Number(highlight.paragraph_number) < 1;
      });
    })) throw new Error('A IA devolveu uma resposta incompleta.');
    return {sub_questions: parts};
  }

  function isConfigured() {
    const url = String(CONFIG.workerUrl || '').trim();
    return !!url && url !== 'COLE_A_URL_DO_SEU_WORKER_AQUI';
  }

  function getCooldownKey(modelName) {
    return `${String(CONFIG.cooldownKey || '__sentinela_perguntas_cooldown__')}:${String(modelName || 'global')}`;
  }

  function getActiveCooldown(modelName) {
    try {
      const raw = localStorage.getItem(getCooldownKey(modelName));
      if (!raw) return { until: 0, reason: '' };
      const parsed = JSON.parse(raw);
      const until = Number(parsed?.until || 0);
      if (!until || until <= Date.now()) {
        localStorage.removeItem(getCooldownKey(modelName));
        return { until: 0, reason: '' };
      }
      return { until, reason: String(parsed?.reason || '') };
    } catch (_) {
      return { until: 0, reason: '' };
    }
  }

  function setCooldown(modelName, ms, reason) {
    try {
      localStorage.setItem(getCooldownKey(modelName), JSON.stringify({
        until: Date.now() + Math.max(1000, Number(ms) || Number(CONFIG.defaultCooldownMs) || 30000),
        reason: String(reason || 'rate_limit')
      }));
    } catch (_) {}
  }

  function extractRetryAfterMs(message, headers) {
    const retryAfterHeader = headers?.get?.('retry-after');
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
    const match = String(message || '').match(/retry after\s*(\d+(?:\.\d+)?)s/i);
    if (match) return Math.ceil(Number(match[1]) * 1000);
    return Number(CONFIG.defaultCooldownMs) || 30000;
  }

  function ensureResponseDiv(idRespostaIA) {
    return document.getElementById(idRespostaIA);
  }

  function findAssociatedImage(bundle) {
    const pNums = bundle.paragraphs.map(p => p.number).filter(n => n);
    if (!pNums.length) return null;

    const figures = document.querySelectorAll('figure');
    for (let fig of figures) {
      const caption = fig.querySelector('figcaption');
      if (!caption) continue;
      const text = caption.textContent || '';
      const match = text.match(/parágrafo[s]?\s*(\d+)(?:[-–—](\d+))?/i);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : start;
        for (let n of pNums) {
          if (n >= start && n <= end) {
            const img = fig.querySelector('img');
            if (img && img.src) return { src: img.src, caption: text.trim() };
          }
        }
      }
    }

    const mentionsImage = /imagem|foto|ilustra|gravura/i.test(bundle.questionText) || 
                          bundle.paragraphs.some(p => /imagem|foto|ilustra|gravura/i.test(p.text));
                          
    if (mentionsImage && bundle.paragraphs.length > 0) {
      const lastParagraph = bundle.paragraphs[bundle.paragraphs.length - 1].element;
      const allElements = Array.from(document.querySelectorAll('.paragrafo, figure, [class^="imagem"]'));
      const lastParIndex = allElements.indexOf(lastParagraph);
      
      if (lastParIndex !== -1 && lastParIndex + 1 < allElements.length) {
        const nextEl = allElements[lastParIndex + 1];
        if (nextEl.tagName === 'FIGURE' || nextEl.matches('[class^="imagem"]')) {
          const img = nextEl.querySelector('img');
          if (img && img.src) {
            const captionEl = nextEl.querySelector('figcaption');
            const captionText = captionEl ? captionEl.textContent.trim() : 'Detalhes visuais associados ao parágrafo.';
            return { src: img.src, caption: captionText };
          }
        }
      }
    }
    return null;
  }

  function findBibleLinks(bundle) {
    const links = [];
    bundle.paragraphs.forEach(p => {
      const bbls = p.element.querySelectorAll('a.bbl');
      bbls.forEach(a => {
        const txt = normalizeSpaces(a.textContent || '');
        if (txt) links.push(txt);
      });
    });
    return [...new Set(links)];
  }

  async function getBase64Image(url) {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        const mime = blob.type || 'image/jpeg';
        resolve({ base64, mime });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function getBibleText(refString) {
    if (typeof ABREVIACOES === 'undefined') return null;

    let referencias = [];
    if (refString.includes(';')) {
      referencias = refString.split(';').map(ref => ref.trim()).filter(ref => ref.length > 0);
    } else {
      referencias = [refString];
    }

    let output = [];

    for (let i = 0; i < referencias.length; i++) {
      let refAtual = referencias[i];
      
      if (i > 0 && /^\d+:[\d,\s-–—]+$/.test(refAtual)) {
        const primeiraRef = referencias[0];
        const matchPrimeiraRef = primeiraRef.match(/^([1-3]?\s?[A-Za-zêÊãÃíÍóÓâÂéÉôÔúÚçÇáÁ.]+)\s/);
        if (matchPrimeiraRef) {
          refAtual = matchPrimeiraRef[1] + ' ' + refAtual;
        }
      }

      let multiCapMatch = refAtual.match(/^([1-3]?\s?[A-Za-zêÊãÃíÍóÓâÂéÉôÔúÚçÇáÁ.]+)\s?(\d{1,3}):(\d{1,3})\s*[-–—]\s*(\d{1,3}):(\d{1,3})$/);
      let singleCapMatch = refAtual.match(/^([1-3]?\s?[A-Za-zêÊãÃíÍóÓâÂéÉôÔúÚçÇáÁ.]+)\s?(\d{1,3}):([\d,\s-–—]+)/);

      if (!multiCapMatch && !singleCapMatch) continue;

      const isMultiCap = !!multiCapMatch;
      const match = isMultiCap ? multiCapMatch : singleCapMatch;
      let nomeAbreviado = match[1].replace(/[\.\s]/g, '').trim();

      const mapeamentosEspeciais = {
        'Deut': 'deuteronomio',
        'Gál': 'galatas'
      };

      const nomeLivro = mapeamentosEspeciais[nomeAbreviado] || ABREVIACOES[nomeAbreviado] || nomeAbreviado.toLowerCase().replace(/\s/g, '');

      if (!bibleCache[nomeLivro]) {
        try {
          const resp = await fetch(`../biblia/data/${nomeLivro}.json`);
          if (resp.ok) bibleCache[nomeLivro] = await resp.json();
          else bibleCache[nomeLivro] = null;
        } catch (e) {
          bibleCache[nomeLivro] = null;
        }
      }

      const dados = bibleCache[nomeLivro];
      if (!dados) continue;

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
        if (!capObj) continue;
        
        match[3].split(',').forEach(item => {
          if (item.includes('-') || item.includes('–') || item.includes('—')) {
            const sep = item.includes('-') ? '-' : (item.includes('–') ? '–' : '—');
            const [ini, fim] = item.split(sep).map(Number);
            versosColetados.push(...capObj.versiculos.filter(v => v.verso >= ini && v.verso <= fim));
          } else {
            const verso = capObj.versiculos.find(v => v.verso === Number(item));
            if (verso) versosColetados.push(verso);
          }
        });
      }

      if (versosColetados.length > 0) {
        let textSnippets = versosColetados.map(v => `(v. ${v.verso}) ${v.texto}`);
        output.push(`[${refAtual.trim()}]\n${textSnippets.join(' ')}`);
      }
    }

    return output.join('\n\n');
  }

  function renderResponseHTML(parsed) {
    const lines = [];
    lines.push('<div class="ia-tabs-container">');
    lines.push('<div class="ia-tabs-header">');
    lines.push(`<button class="ia-tab-btn active" onclick="const c = this.closest('.ia-tabs-container'); c.querySelectorAll('.ia-tab-content').forEach(e=>e.classList.remove('active')); c.querySelector('.ia-tab-natural').classList.add('active'); c.querySelectorAll('.ia-tab-btn').forEach(e=>e.classList.remove('active')); this.classList.add('active');">Resposta</button>`);
    lines.push(`<button class="ia-tab-btn" onclick="const c = this.closest('.ia-tabs-container'); c.querySelectorAll('.ia-tab-content').forEach(e=>e.classList.remove('active')); c.querySelector('.ia-tab-literal').classList.add('active'); c.querySelectorAll('.ia-tab-btn').forEach(e=>e.classList.remove('active')); this.classList.add('active');">Trecho Exato</button>`);
    
    if (parsed.has_bible) {
      lines.push(`<button class="ia-tab-btn" onclick="const c = this.closest('.ia-tabs-container'); c.querySelectorAll('.ia-tab-content').forEach(e=>e.classList.remove('active')); c.querySelector('.ia-tab-bible').classList.add('active'); c.querySelectorAll('.ia-tab-btn').forEach(e=>e.classList.remove('active')); this.classList.add('active');">R. Bíblia</button>`);
    }
    if (parsed.has_image) {
      lines.push(`<button class="ia-tab-btn" onclick="const c = this.closest('.ia-tabs-container'); c.querySelectorAll('.ia-tab-content').forEach(e=>e.classList.remove('active')); c.querySelector('.ia-tab-image').classList.add('active'); c.querySelectorAll('.ia-tab-btn').forEach(e=>e.classList.remove('active')); this.classList.add('active');">Imagem</button>`);
    }
    lines.push('</div>');

    lines.push('<div class="ia-tab-content ia-tab-natural active">');
    const parts = Array.isArray(parsed.parts) ? parsed.parts : [];
    parts.forEach((part) => {
      lines.push(`<div class="ia-answer-part" data-part="${escapeHTML(part.hexKey)}">`);
      if (parts.length > 1) lines.push(`<div class="ia-answer-part-title">${escapeHTML(part.title)}</div>`);
      lines.push(`<div class="ia-answer-main">${textToHTML(part.natural_answer)}</div>`);
      lines.push('</div>');
    });
    lines.push('</div>');

    lines.push('<div class="ia-tab-content ia-tab-literal">');
    if (parsed.exactEvidence) {
      for (const quote of parsed.exactEvidence) {
        lines.push(`<div class="ia-answer-part" data-part="${escapeHTML(quote.part)}"><div class="ia-answer-part-title">${escapeHTML(quote.source)}</div><div class="ia-answer-part-text">“${escapeHTML(quote.text)}”</div></div>`);
      }
      if (!parsed.exactEvidence.length) lines.push(`<div class="ia-inline-note">${parsed.highlightWarning ? 'Nenhum trecho confirmado nesta tentativa.' : 'Conferindo os trechos…'}</div>`);
    } else parts.forEach((part) => {
      lines.push(`<div class="ia-answer-part" data-part="${escapeHTML(part.hexKey)}">`);
      if (parts.length > 1) lines.push(`<div class="ia-answer-part-title">${escapeHTML(part.title)}</div>`);
      if (part.literal_smooth) {
        lines.push(`<div class="ia-answer-part-text">"${textToHTML(part.literal_smooth)}"</div>`);
      } else {
        lines.push(`<div class="ia-answer-part-text" style="color:#9ca3af; font-style:normal;">Nenhum trecho destacado.</div>`);
      }
      lines.push('</div>');
    });
    lines.push('</div>');

    if (parsed.has_bible) {
      lines.push('<div class="ia-tab-content ia-tab-bible">');
      if (parsed.bible_analysis) {
        lines.push(`<div class="ia-answer-main">${textToHTML(parsed.bible_analysis)}</div>`);
      } else {
        lines.push('<div class="ia-inline-note">Cruzando textos bíblicos lidos...</div>');
      }
      lines.push('</div>');
    }

    if (parsed.has_image) {
      lines.push('<div class="ia-tab-content ia-tab-image">');
      if (parsed.image_analysis) {
        lines.push(`<div class="ia-answer-main">${textToHTML(parsed.image_analysis)}</div>`);
      } else {
        lines.push('<div class="ia-inline-note">Analisando os detalhes da imagem...</div>');
      }
      lines.push('</div>');
    }

    if (parsed.highlightWarning) lines.push(`<div class="ia-inline-note" role="status">${escapeHTML(parsed.highlightWarning)}</div>`);

    if (parsed.model && typeof window.DEBUG_G !== 'undefined') {
      lines.push(`<div class="ia-inline-note ia-status-ok" style="margin-top: 4px;">Modelo: ${escapeHTML(parsed.model)}</div>`);
    }
    
    lines.push('</div>');
    return lines.join('');
  }

  function boxContext(bundle) {
    return 'QUADROS CITADOS: ' + JSON.stringify(bundle.boxSources.map(({title, source_id, text}) => ({title, source_id, text})));
  }

  function articleContext(bundle) {
    return [
      'PERGUNTA: ' + JSON.stringify(bundle.questionText),
      'PARÁGRAFOS: ' + JSON.stringify(bundle.paragraphs.map(p => ({n: p.number, text: p.text})))
    ].join('\n');
  }

  function buildPrompt(bundle) {
    // Complete source evidence, independent of written answers and model reasoning.
    return [
      "Extraia somente os trechos literais que, juntos, respondem à pergunta por completo. Retorne JSON, sem resumo ou comentários.",
      "Formato: {\"sub_questions\":[{\"question\":\"pergunta original ou cláusula independente literal\",\"highlights\":[{\"paragraph_number\":1,\"literal_text\":\"cópia contínua exata da fonte\"}]}]}.",
      "Uma pergunta pode ter vários fatos e parágrafos. Vírgulas, enumerações e perguntas no corpo do texto não criam sub_questions. Separe apenas solicitações independentes ou partes (a)/(b)/(c).",
      bundle.accounts.length
        ? "Selecione a narrativa contínua de cada experiência pedida desde a apresentação da pessoa e da situação até o resultado. Inclua a sequência de ações e os diálogos. A pergunta editorial anterior e a aplicação geral posterior ficam fora da narrativa."
        : "Leia todos os parágrafos antes de selecionar. Em uma sequência de acontecimentos, mantenha a decisão que inicia a sequência, cada ação e a explicação que acrescenta agente, motivo, alvo ou desfecho. Um anúncio e uma explicação complementar não são duplicatas.",
      "Inclua o nome do acontecimento e sua ação completa, com complementos e resultados coordenados necessários. Não corte a explicação após metade da ação. Copie a oração completa quando toda ela responde, incluindo suas ligações curtas. Separe trechos distantes, sem paráfrase, reticências ou referências de apoio.",
      "Texto entre aspas pode ser a própria resposta; não o descarte por ser citação. Exclua introduções vagas, perguntas retóricas, indicação bibliográfica, exemplos dispensáveis e roteiro repetitivo.",
      "Exemplo de cobertura: pergunta \"Que acontecimentos são esperados?\"; fonte \"Haverá mudanças. A prefeitura autorizará a entrada. Os bombeiros entrarão na área. O relatório explica: ‘Por causa da fumaça, eles retirarão as famílias e os animais.’ Por fim, virá a reconstrução. Equipes removerão os escombros e reconstruirão as casas.\"; selecione \"A prefeitura autorizará a entrada.\", \"Os bombeiros entrarão na área.\", \"Por causa da fumaça, eles retirarão as famílias e os animais.\" e \"Por fim, virá a reconstrução. Equipes removerão os escombros e reconstruirão as casas.\". A retirada acrescenta causa e alvo; a entrada não a substitui.",
      "Para \"O que estudaremos?\", selecione o assunto e todos os temas propostos, mesmo em forma de perguntas. Exemplo: \"Estudaremos X e suas aplicações hoje e no futuro. Mas antes, faremos uma visão geral de X.\" → somente \"Estudaremos X e suas aplicações hoje e no futuro.\". A última frase apenas repete o roteiro.",
      "Confira se cada informação pedida aparece nos trechos selecionados e se nenhum desfecho foi cortado. Se não houver resposta na fonte, retorne highlights: [].",
      ...(bundle.boxSources.length ? [
        'Selecione pelo menos um trecho de cada quadro citado e inclua os parágrafos que sustentam outras partes da pergunta. Para um quadro use {"source_id":"ID do bloco","literal_text":"cópia exata"} em vez de paragraph_number. Copie cada trecho de um só bloco.',
        boxContext(bundle)
      ] : []),
      articleContext(bundle)
    ].join('\n');
  }

  function buildRelevanceReview(bundle, candidates) {
    const instructions = [
      'Revise a pertinência dos destaques para esta pergunta de estudo. Faça uma nova leitura do artigo e do quadro. Decida primeiro o que as fontes ensinam sobre cada parte pedida. Depois confronte as sugestões com essa leitura. Elas podem estar literalmente corretas e ainda assim não responder.',
      'Quando a pergunta pede o que se aprende com experiências identificadas, copie um trecho CONTÍNUO por relato, do começo da situação ao seu desfecho. Quem lê somente as marcas deve poder acompanhar quem estava envolvido, o que aconteceu passo a passo, a ajuda concreta dada ou recebida e seu efeito. Preserve dentro da história os encontros, ferramentas, falas e reações. Se a ajuda e seu resultado estiverem em frases diferentes, copie o intervalo entre elas, inclusive no quadro. Duas frases de resultado podem omitir como algo aconteceu.',
      'Deixe de fora a pergunta introdutória do autor e a aplicação geral depois do relato. Um detalhe de cenário ou uma lição genérica de outro parágrafo, sozinhos, não contam a experiência. Para perguntas sobre um fato específico selecione apenas o trecho que comprova aquele fato.',
      'Devolva a seleção COMPLETA final, corrigindo ou ampliando sugestões incompletas. Preserve pontuação, grafia e fonte ao transcrever. Separe as passagens por fonte, mantendo as partes consecutivas de uma mesma narrativa juntas. Se não houver sustentação suficiente, devolva highlights vazio.',
      'Formato JSON: {"sub_questions":[{"question":"pergunta ou parte literal","highlights":[{"paragraph_number":1,"literal_text":"texto do parágrafo"},{"source_id":"ID do bloco","literal_text":"texto do quadro"}]}]}.',
      ...bundle.accounts.map(({name, number}) => `O relato de ${name} foi identificado no parágrafo ${number}. Selecione a experiência nesse parágrafo.`),
      articleContext(bundle), boxContext(bundle)
    ].join('\n');
    // Source text has priority over the suggestions if a model echoes a whole article.
    const proposed = '\nSUGESTÕES A CONFERIR: ' + JSON.stringify(candidates);
    return candidates.length && instructions.length + proposed.length <= HIGHLIGHT_CONFIG.maxInputChars ?
      instructions + proposed : instructions;
  }

  async function selectReviewedHighlights(bundle) {
    // A joint question gets one draft and one independent editorial pass.
    // No draft, including one with exact source matches, can reach the DOM.
    const model = HIGHLIGHT_CONFIG.model;
    const extract = async prompt => {
      if (prompt.length > HIGHLIGHT_CONFIG.maxInputChars) throw new Error('Fontes muito extensas para a extração literal.');
      const text = await requestGemini(prompt, model, null, true, true);
      return parseQuestionPayload(text, true);
    };
    let candidates = [];
    try {
      const draft = await extract(buildPrompt(bundle));
      candidates = draft.sub_questions.flatMap(part => part.highlights.map(({literal_text, paragraph_number, source_id}) =>
        source_id ? {source_id, literal_text} : {paragraph_number, literal_text}));
    } catch (error) {
      if ((error.status >= 400 && error.status < 500) || getActiveCooldown(model).until) throw error;
      // A malformed or missing draft leaves the reviewer the original sources.
    }
    if (window.sentinelaSync?.localClearInProgress) return null;
    return {payload: await extract(buildRelevanceReview(bundle, candidates)), model};
  }

  function buildNaturalPrompt(bundle) {
    // Keep the pre-existing conversational and literal reading tabs. They no
    // longer ask for redundant marker quotes/anchors or control source colors.
    return [
      'Responda à pergunta do artigo usando APENAS o contexto fornecido. Retorne exclusivamente JSON válido.',
      'Separe as partes (a)/(b)/(c) ou solicitações independentes em sub_questions. Uma pergunta simples tem só um item. question é a cláusula literal da pergunta.',
      'natural_answer: A resposta conversacional em pt-BR.',
      'literal_smooth: O trecho literal do artigo adaptado muito sutilmente no início para ter fluidez na leitura (sem usar frases formais como "O artigo diz que"). Ex: se o texto original for "pois eles oravam", ajuste para "Sabe-se que eles oravam". Mantenha 95% do texto exato.',
      'Nunca cite nada fora do contexto.',
      'Formato: {"sub_questions":[{"id":"1","title":"Resposta","question":"pergunta literal","natural_answer":"resposta humana natural","literal_smooth":"trecho fluido"}]}',
      'Pergunta: ' + bundle.questionText,
      'Contexto:',
      ...(bundle.boxSources.length ? ['Responda a cada parte da pergunta usando também o quadro citado. Ao comentar experiências, atribua os fatos a quem os viveu.', boxContext(bundle)] : []),
      bundle.paragraphs.map(p => `PARÁGRAFO ${p.number}: ${p.text}`).join('\n\n')
    ].join('\n');
  }

  function buildImagePrompt(bundle, caption) {
    const context = bundle.paragraphs.map((p) => `PARÁGRAFO ${p.number}: ${p.text}`).join('\n\n');
    return [
      'Você é um observador detalhista.',
      'Analise a imagem fornecida.',
      `Legenda da imagem: "${caption}"`,
      `Contexto do(s) parágrafo(s): "${context}"`,
      'Descreva a cena minuciosamente (expressões, objetos, detalhes) e explique de forma natural como esses detalhes visuais se conectam com a lição ensinada.',
      'Retorne apenas o texto da análise em português, sem formatação markdown.'
    ].join('\n');
  }

  function buildBiblePrompt(bundle, bibleTexts) {
    const context = bundle.paragraphs.map((p) => `PARÁGRAFO ${p.number}: ${p.text}`).join('\n\n');
    return [
      'Você é um irmão cristão experiente ajudando no estudo da Sentinela.',
      'Sua tarefa é mostrar a ligação entre os textos bíblicos fornecidos e o que o parágrafo ensina.',
      '',
      'REGRAS OBRIGATÓRIAS DE FORMATAÇÃO E COMPORTAMENTO:',
      '1) NUNCA cumprimente (ex: "Olá", "Queridos irmãos"). Vá direto ao ponto.',
      '2) VOCÊ DEVE TRANSCREVER literalmente a parte principal do versículo que se aplica ao parágrafo antes de explicá-lo. Coloque a citação exata entre aspas.',
      '   Exemplo do formato exigido: Em Atos 3:15, Pedro diz "arrependam-se e batizem-se", o que nos mostra que devemos nos batizar por um ato de obediência.',
      '3) Não resuma o versículo nas suas próprias palavras ao apresentá-lo. Cite o que está no texto fornecido.',
      '4) Fale sempre na primeira pessoa do plural ("nós", "nosso").',
      '5) Se houver mais de um texto bíblico, crie um parágrafo novo para cada um.',
      '6) Não use formatação markdown (asteriscos, negritos, etc), apenas texto limpo dividido em parágrafos.',
      '',
      '=== PARÁGRAFO DO ESTUDO ===',
      context,
      '',
      '=== TEXTOS BÍBLICOS LIDOS DO BANCO DE DADOS ===',
      bibleTexts
    ].join('\n');
  }

  async function requestGemini(prompt, modelName, imagePart = null, isJson = true, extractive = false) {
    const cooldown = getActiveCooldown(modelName);
    if (cooldown.until) throw new Error(`Modelo em cooldown (${Math.ceil((Math.max(0, cooldown.until - Date.now())) / 1000)}s).`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), Number(CONFIG.timeoutMs) || 22000);

    try {
      const url = String(CONFIG.workerUrl || '').trim();
      const body = {
        prompt: extractive ? prompt : prompt.slice(0, Number(CONFIG.maxInputChars) || 12000),
        modelName: modelName,
        imagePart: imagePart,
        isJson: isJson,
        generationConfig: extractive ? {
          maxOutputTokens: HIGHLIGHT_CONFIG.maxOutputTokens,
          thinkingConfig: {thinkingLevel: 'minimal'}
        } : {
          temperature: Number(CONFIG.temperature) || 0.15,
          topP: Number(CONFIG.topP) || 0.85,
          topK: Number(CONFIG.topK) || 24,
          maxOutputTokens: Number(CONFIG.maxOutputTokens) || 2500,
          ...(/^gemini-3\.[15]-flash-lite$/.test(modelName) ? {thinkingConfig: {thinkingLevel: 'minimal'}} : {})
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        const message = data?.error || `Erro ${response.status}`;
        if (response.status === 429 || /quota|rate/i.test(message)) setCooldown(modelName, extractRetryAfterMs(message, response.headers), 'rate_limit');
        throw Object.assign(new Error(message), {status: response.status});
      }

      if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('A IA não retornou conteúdo utilizável.');
      return data.text;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function requestWithFallback(prompt, imagePart = null, isJson = true, extractive = false, verify = null) {
    if (extractive && prompt.length > HIGHLIGHT_CONFIG.maxInputChars) throw new Error('Este trecho é grande demais para uma marcação segura. Abra uma pergunta menor.');
    // Keep extraction on the model validated for source coverage. A transient
    // failure may retry once; do not silently switch to a different selector.
    const models = extractive ? Array(HIGHLIGHT_CONFIG.maxAttempts).fill(HIGHLIGHT_CONFIG.model) : Array.isArray(CONFIG.modelFallbacks) && CONFIG.modelFallbacks.length ? CONFIG.modelFallbacks.slice() : DEFAULT_CONFIG.modelFallbacks.slice();
    let lastError = null;
    let unverified = null;
    for (const model of models) {
      try {
        const text = await requestGemini(prompt, model, imagePart, isJson, extractive);
        // HTTP 200 is not sufficient: truncated/malformed output must use the
        // fallback before any response or source marks are replaced.
        const payload = isJson ? parseQuestionPayload(text, extractive) : null;
        const checked = verify?.(payload, model);
        const result = {text, model, payload, checked};
        if (!checked?.highlightWarning) return result;
        unverified = result;
        const correction = '\nRevise os trechos. Copie palavras contínuas da fonte indicada, usando paragraph_number para o artigo e source_id para o quadro. Inclua os trechos que sustentam cada parte pedida na pergunta.';
        if (prompt.length + correction.length > HIGHLIGHT_CONFIG.maxInputChars) return result;
        prompt += correction;
      } catch (error) {
        lastError = error;
        if (extractive && ((error.status >= 400 && error.status < 500) || getActiveCooldown(model).until)) break;
      }
    }
    if (unverified) return unverified;
    throw lastError || new Error('Falha ao consultar a IA.');
  }

  function setLoading(wrapper, button, responseDiv, message) {
    if (wrapper) wrapper.classList.add('ia-loading');
    if (button) button.disabled = true;
    if (responseDiv) responseDiv.innerHTML = `<div class="ia-inline-note">${escapeHTML(message || 'Consultando a IA...')}</div>`;
  }

  function clearLoading(wrapper, button) {
    if (wrapper) wrapper.classList.remove('ia-loading');
    if (button) button.disabled = false;
  }

  function gerarRespostaIA(idPergunta, iaWrapper, idRespostaIA) {
    if (pendingQuestions.has(idPergunta)) return pendingQuestions.get(idPergunta);
    const task = generateQuestion(idPergunta, iaWrapper, idRespostaIA)
      .finally(() => pendingQuestions.delete(idPergunta));
    pendingQuestions.set(idPergunta, task);
    return task;
  }

  async function generateQuestion(idPergunta, iaWrapper, idRespostaIA) {
    const responseDiv = ensureResponseDiv(idRespostaIA);
    const button = iaWrapper?.querySelector?.('.btn-gerar-ia');

    if (!responseDiv) return;
    if (!CONFIG.enabled) { responseDiv.innerHTML = '<div class="ia-inline-note ia-status-error">Agente desativado.</div>'; return; }
    if (!isConfigured()) { responseDiv.innerHTML = '<div class="ia-inline-note ia-status-error">Configure a URL do seu Worker no arquivo.</div>'; return; }

    let highlighter, bundle;
    try {
      highlighter = await loadHighlights();
      bundle = highlighter.buildSource(idPergunta);
    } catch (_) {
      responseDiv.innerHTML = '<div class="ia-inline-note ia-status-error">Não foi possível carregar o marcador. Atualize a página e tente novamente.</div>';
      return;
    }
    if (!bundle || !bundle.paragraphs.length) { responseDiv.innerHTML = '<div class="ia-inline-note ia-status-error">Parágrafos não encontrados.</div>'; return; }

    const imageInfo = findAssociatedImage(bundle);
    const bibleLinks = findBibleLinks(bundle);

    const previousResponse = responseDiv.querySelector('.ia-tabs-container') ? responseDiv.innerHTML : '';
    setLoading(iaWrapper, button, responseDiv, 'Analisando o artigo para gerar a resposta...');

    let textParsed = null;
    let highlightResult = null;
    let lastRenderedHTML = '';
    const renderCurrentResponse = () => {
      if (!textParsed || window.sentinelaSync?.localClearInProgress) return;
      textParsed.highlightWarning = highlightResult?.highlightWarning || '';
      if (bundle.boxSources.length) {
        textParsed.exactEvidence = highlightResult?.appliedCount ? highlightResult.parts.flatMap(part =>
          part.highlights.map(quote => ({
            part: part.hexKey,
            source: quote.source_id ? bundle.boxSources.find(box => box.source_id === quote.source_id).title : `Parágrafo ${quote.paragraph_number}`,
            text: quote.literal_text
          }))) : [];
      }
      const html = renderResponseHTML(textParsed);
      if (html === lastRenderedHTML) return;
      const tabs = [...responseDiv.querySelectorAll('.ia-tab-content')];
      const selectedTab = tabs.findIndex(tab => tab.classList.contains('active'));
      const scrollTop = responseDiv.scrollTop;
      responseDiv.innerHTML = html;
      if (selectedTab > 0 && responseDiv.querySelectorAll('.ia-tab-content')[selectedTab]) {
        responseDiv.querySelectorAll('.ia-tab-content').forEach((tab, index) => tab.classList.toggle('active', index === selectedTab));
        responseDiv.querySelectorAll('.ia-tab-btn').forEach((tab, index) => tab.classList.toggle('active', index === selectedTab));
      }
      responseDiv.scrollTop = scrollTop;
      lastRenderedHTML = html;
      if (!bundle.boxSources.length || highlightResult) window.CacheAnotacao?.salvar(idRespostaIA, html);
    };
    // Apply source marks as soon as the small extraction request finishes,
    // independently of the natural answer, Bible or image requests.
    const highlightJob = (async () => {
      try {
        const apply = (payload, model) => window.sentinelaSync?.localClearInProgress ? null :
          highlighter.applyHighlights(idPergunta, {parts: payload.sub_questions, model}, bundle, {reviewed: bundle.includesArticle});
        const verify = bundle.boxSources.length && !bundle.includesArticle ? apply : null;
        const result = bundle.includesArticle ? await selectReviewedHighlights(bundle) :
          await requestWithFallback(buildPrompt(bundle), null, true, true, verify);
        if (!result || window.sentinelaSync?.localClearInProgress) return;
        highlightResult = verify ? result.checked : apply(result.payload, result.model);
      } catch (_) {
        highlightResult = {highlightWarning: 'Não foi possível atualizar os destaques. As marcações anteriores foram mantidas.'};
      }
      renderCurrentResponse();
    })();
    try {
      const result = await requestWithFallback(buildNaturalPrompt(bundle), null, true);
      if (window.sentinelaSync?.localClearInProgress) return;
      textParsed = highlighter.validateQuestionParts(result.payload.sub_questions, bundle.questionText);
      textParsed.model = result.model;
      textParsed.has_image = !!imageInfo;
      textParsed.has_bible = bibleLinks.length > 0;
      renderCurrentResponse();
    } catch (error) {
      await highlightJob;
      const markStatus = highlightResult?.appliedCount ? '<div class="ia-inline-note">Os destaques foram atualizados.</div>' : '';
      responseDiv.innerHTML = previousResponse + markStatus + '<div class="ia-inline-note ia-status-error">Não foi possível gerar a resposta escrita. Tente novamente.</div>';
      clearLoading(iaWrapper, button);
      return;
    }

    const extraPromises = [highlightJob];

    if (imageInfo) {
      extraPromises.push((async () => {
        try {
          const { base64, mime } = await getBase64Image(imageInfo.src);
          const imagePart = { inlineData: { mimeType: mime, data: base64 } };
          const imgPrompt = buildImagePrompt(bundle, imageInfo.caption);
          const imgResult = await requestWithFallback(imgPrompt, imagePart, false);
          textParsed.image_analysis = imgResult.text;
        } catch (err) {
          textParsed.image_analysis = "A imagem não pôde ser analisada corretamente ou foi bloqueada.";
        }
        renderCurrentResponse();
      })());
    }

    if (bibleLinks.length > 0) {
      extraPromises.push((async () => {
        try {
          let fetchedTexts = [];
          for (let bbl of bibleLinks) {
            let txt = await getBibleText(bbl);
            if (txt) fetchedTexts.push(txt);
          }
          if (fetchedTexts.length > 0) {
            const biblePrompt = buildBiblePrompt(bundle, fetchedTexts.join('\n\n'));
            const bibleResult = await requestWithFallback(biblePrompt, null, false);
            textParsed.bible_analysis = bibleResult.text;
          } else {
            textParsed.bible_analysis = "O sistema não conseguiu extrair os textos do banco de dados (abreviação não suportada ou JSON ausente).";
          }
        } catch (err) {
          textParsed.bible_analysis = "Erro ao cruzar os textos bíblicos.";
        }
        renderCurrentResponse();
      })());
    }

    await Promise.all(extraPromises).finally(() => {
      clearLoading(iaWrapper, button);
    });
  }

  function unavailableMessage(kind, responseDiv) {
    if (!responseDiv) return;
    responseDiv.innerHTML = `<div class="ia-inline-note">O agente de ${escapeHTML(kind)} não está disponível neste pacote.</div>`;
  }

  window.gerarRespostaIA = gerarRespostaIA;
  if (typeof window.gerarRespostaIA_Recap !== 'function') {
    window.gerarRespostaIA_Recap = function(idPergunta, iaWrapper, idRespostaIA) { unavailableMessage('recapitulação', document.getElementById(idRespostaIA)); };
  }
  if (typeof window.gerarRespostaIA_Objetivo !== 'function') {
    window.gerarRespostaIA_Objetivo = function(idObjetivo, iaWrapper, idRespostaIA) { unavailableMessage('objetivo', document.getElementById(idRespostaIA)); };
  }
})();
