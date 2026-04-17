(function () {
  const CONFIG = {
    apiKey: 'AIzaSyDk0f5zUqAnU7V6f7ZGUwVoZJbKpsg09DM',
    modelFallbacks:[
      'gemini-3.1-flash-lite-preview',
      'gemini-3-flash-preview',
      'gemini-2.5-flash'
    ],
    endpointBase: 'https://generativelanguage.googleapis.com/v1beta/models',
    timeoutMs: 30000,
    maxInputChars: 40000,
    maxOutputTokens: 2500,
    temperature: 0.6,
    topP: 0.9,
    topK: 40,
    cooldownKey: '__sentinela_objetivo_cooldown__',
    defaultCooldownMs: 30000
  };

  function injectStyles() {
    if (document.getElementById('sentinela-objetivo-style')) return;
    const style = document.createElement('style');
    style.id = 'sentinela-objetivo-style';
    style.textContent = `
      .ia-tabs-container { display: flex; flex-direction: column; gap: 12px; position: relative; padding-bottom: 24px; }
      .ia-tabs-header { 
        display: flex; gap: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 4px;
      }
      .ia-tab-btn {
        background: none; border: none; padding: 6px 12px; cursor: pointer;
        font-size: 0.85rem; font-weight: 600; color: #9ca3af; border-radius: 4px;
        transition: all 0.2s ease;
      }
      .ia-tab-btn:hover { color: #4b5563; background: #f9fafb; }
      .ia-tab-btn.active { background: #f3f4f6; color: #375255; }
      .ia-tab-content { display: none; animation: fadeInTab 0.3s ease; }
      .ia-tab-content.active { display: block; }
      @keyframes fadeInTab { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
      .ia-obj-text { color: #374151; line-height: 1.6; font-size: 0.95rem; margin-bottom: 12px; text-align: justify; }
      .ia-inline-note { font-size: .78rem; color: #6b7280; }
      .ia-status-error { color: #b91c1c; }
      .ia-status-ok { color: #166534; }
      html[data-theme="dark"] .ia-tabs-header { border-bottom-color: #5a5a5c; }
      html[data-theme="dark"] .ia-tab-btn { color: #b3b3bb; }
      html[data-theme="dark"] .ia-tab-btn:hover { color: #f2f2f7; background: #3a3a3c; }
      html[data-theme="dark"] .ia-tab-btn.active { background: #f2f2f7; color: #375255; }
      html[data-theme="dark"] .ia-obj-text { color: #f2f2f7; }
      html[data-theme="dark"] .ia-inline-note { color: #a1a1aa; }
      html[data-theme="dark"] .ia-status-ok { color: #86efac; }
      html[data-theme="dark"] .ia-status-error { color: #fda4af; }
      html[data-theme="dark"] .ia-btn-info-obj { color: #b3b3bb !important; border-color: #5a5a5c !important; }
      @media (prefers-color-scheme: dark) {
        html:not([data-theme="light"]) .ia-tabs-header { border-bottom-color: #5a5a5c; }
        html:not([data-theme="light"]) .ia-tab-btn { color: #b3b3bb; }
        html:not([data-theme="light"]) .ia-tab-btn:hover { color: #f2f2f7; background: #3a3a3c; }
        html:not([data-theme="light"]) .ia-tab-btn.active { background: #f2f2f7; color: #375255; }
        html:not([data-theme="light"]) .ia-obj-text { color: #f2f2f7; }
        html:not([data-theme="light"]) .ia-inline-note { color: #a1a1aa; }
        html:not([data-theme="light"]) .ia-status-ok { color: #86efac; }
        html:not([data-theme="light"]) .ia-status-error { color: #fda4af; }
        html:not([data-theme="light"]) .ia-btn-info-obj { color: #b3b3bb !important; border-color: #5a5a5c !important; }
      }
      .ia-btn-info-obj {
        position: absolute;
        bottom: -4px;
        right: 0px;
        background: transparent;
        color: #9ca3af;
        border: 1px solid #e5e7eb;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.65rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
        opacity: 0.7;
      }
      .ia-btn-info-obj:hover { opacity: 1; color: #6b7280; }
    `;
    document.head.appendChild(style);
  }
  injectStyles();

  function escapeHTML(text) {
    return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function textToHTML(text) {
    return escapeHTML(text).replace(/\n/g, '<br>');
  }

  function safeJSONParse(text) {
    if (!text) return null;
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end >= start) {
      let jsonStr = cleaned.slice(start, end + 1);
      jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
      try {
        return JSON.parse(jsonStr);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function getActiveCooldown(modelName) {
    try {
      const raw = localStorage.getItem(`${CONFIG.cooldownKey}:${modelName}`);
      if (!raw) return { until: 0 };
      const parsed = JSON.parse(raw);
      const until = Number(parsed?.until || 0);
      if (!until || until <= Date.now()) {
        localStorage.removeItem(`${CONFIG.cooldownKey}:${modelName}`);
        return { until: 0 };
      }
      return { until };
    } catch (_) {
      return { until: 0 };
    }
  }

  function setCooldown(modelName, ms) {
    try {
      localStorage.setItem(`${CONFIG.cooldownKey}:${modelName}`, JSON.stringify({
        until: Date.now() + Math.max(1000, Number(ms) || CONFIG.defaultCooldownMs)
      }));
    } catch (_) {}
  }

  function extractRetryAfterMs(message, headers) {
    const retryAfterHeader = headers?.get?.('retry-after');
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
    const match = String(message || '').match(/retry after\s*(\d+(?:\.\d+)?)s/i);
    if (match) return Math.ceil(Number(match[1]) * 1000);
    return CONFIG.defaultCooldownMs;
  }

  function extrairBundleArtigo() {
    let textoCompleto = '';
    
    const titulo = document.querySelector('.estudo-titulo')?.textContent?.trim() || '';
    if (titulo) textoCompleto += `TÍTULO DO ESTUDO: ${titulo}\n\n`;
    
    const objetivo = document.querySelector('.objetivo-texto')?.textContent?.trim() || '';
    if (objetivo) textoCompleto += `OBJETIVO DECLARADO: ${objetivo}\n\n`;
    
    const textoBase = document.querySelector('.citacao')?.textContent?.trim() || '';
    if (textoBase) textoCompleto += `TEXTO BÍBLICO BASE: ${textoBase}\n\n`;
    
    const paragrafos = document.querySelectorAll('.paragrafo');
    paragrafos.forEach(p => {
      const clone = p.cloneNode(true);
      const spanNum = clone.querySelector('span');
      let num = '';
      if (spanNum) num = `PARÁGRAFO ${spanNum.textContent.trim()}: `;
      
      clone.querySelectorAll('a.bbl').forEach(ref => {
        ref.outerHTML = ` [${ref.textContent.trim()}] `;
      });
      
      let texto = clone.textContent.replace(/\s+/g, ' ').trim();
      if (texto && texto.length > 10) textoCompleto += `${num}${texto}\n\n`;
    });

    const hashLength = textoCompleto.length;
    const snapshot = `obj:${titulo.slice(0,10)}:${hashLength}`;

    return { titulo, objetivo, textoBase, textoCompleto, snapshot };
  }

  function renderResponseHTML(parsed) {
    const lines =[];
    lines.push('<div class="ia-tabs-container">');
    lines.push('<div class="ia-tabs-header">');
    lines.push(`<button class="ia-tab-btn active" onclick="const c = this.closest('.ia-tabs-container'); c.querySelectorAll('.ia-tab-content').forEach(e=>e.classList.remove('active')); c.querySelector('.ia-tab-visao').classList.add('active'); c.querySelectorAll('.ia-tab-btn').forEach(e=>e.classList.remove('active')); this.classList.add('active');">Visão Geral</button>`);
    lines.push(`<button class="ia-tab-btn" onclick="const c = this.closest('.ia-tabs-container'); c.querySelectorAll('.ia-tab-content').forEach(e=>e.classList.remove('active')); c.querySelector('.ia-tab-aplicacao').classList.add('active'); c.querySelectorAll('.ia-tab-btn').forEach(e=>e.classList.remove('active')); this.classList.add('active');">Aplicação Prática</button>`);
    lines.push('</div>');

    lines.push('<div class="ia-tab-content ia-tab-visao active">');
    if (Array.isArray(parsed.visao_geral)) {
      parsed.visao_geral.forEach(p => lines.push(`<p class="ia-obj-text">${textToHTML(p)}</p>`));
    } else {
      lines.push(`<p class="ia-obj-text">${textToHTML(String(parsed.visao_geral))}</p>`);
    }
    lines.push('</div>');

    lines.push('<div class="ia-tab-content ia-tab-aplicacao">');
    if (Array.isArray(parsed.aplicacao_pratica)) {
      parsed.aplicacao_pratica.forEach(p => lines.push(`<p class="ia-obj-text">${textToHTML(p)}</p>`));
    } else {
      lines.push(`<p class="ia-obj-text">${textToHTML(String(parsed.aplicacao_pratica))}</p>`);
    }
    lines.push('</div>');

    lines.push(`<button class="ia-btn-info-obj" onclick="alert('Esta análise foi preparada com base na leitura completa do artigo, considerando o contexto bíblico e as aplicações práticas mencionadas.')" title="Análise baseada no artigo completo">ℹ️</button>`);

    if (parsed.model && typeof window.DEBUG_G !== 'undefined') {
      lines.push(`<div class="ia-inline-note ia-status-ok" style="margin-top: 4px;">Modelo: ${escapeHTML(parsed.model)}</div>`);
    }

    lines.push('</div>');
    return lines.join('');
  }

  function buildPrompt(bundle) {
    return[
      'Você é um irmão cristão maduro e amoroso, como um representante experiente de Betel das Testemunhas de Jeová.',
      'Sua tarefa é fazer um resumo profundo, respeitoso e edificante deste artigo de estudo de A Sentinela.',
      '',
      'REGRAS DE PERSONALIDADE:',
      '1) Fale SEMPRE na primeira pessoa do plural ("nós", "nosso"), incluindo-se na fraternidade cristã. Exemplo: "Nós devemos obedecer a Jeová...", "Este estudo nos ensina...".',
      '2) Nunca fale "As Testemunhas de Jeová devem", pois você faz parte delas. Fale "Nós, como servos de Jeová, devemos...".',
      '3) Use linguagem natural, amorosa, clara, reverente e edificante.',
      '',
      'REGRAS DE FORMATO:',
      'RETORNE EXCLUSIVAMENTE UM JSON VÁLIDO. NÃO USE MARKDOWN (```json). ESCAPE ASPAS DUPLAS CORRETAMENTE COM \\".',
      'O JSON deve conter DUAS chaves, com arrays de strings (cada string é um parágrafo):',
      '- "visao_geral": 3 a 5 parágrafos resumindo o contexto bíblico, os personagens e o tema central do artigo.',
      '- "aplicacao_pratica": 3 a 4 parágrafos focados em como NÓS podemos aplicar essas lições hoje (na congregação, pregação ou vida pessoal).',
      '',
      `TÍTULO: ${bundle.titulo}`,
      `OBJETIVO: ${bundle.objetivo}`,
      `TEXTO BASE: ${bundle.textoBase}`,
      '',
      'TEXTO COMPLETO DO ARTIGO:',
      bundle.textoCompleto,
      '',
      'JSON ESPERADO OBRIGATÓRIO:',
      JSON.stringify({
        "visao_geral":["paragrafo 1", "paragrafo 2"],
        "aplicacao_pratica":["paragrafo 1", "paragrafo 2"]
      }, null, 2)
    ].join('\n');
  }

  function extractTextFromResponse(data) {
    const candidates = Array.isArray(data?.candidates) ? data.candidates :[];
    let text = '';
    candidates.forEach(c => {
      const parts = c?.content?.parts ||[];
      parts.forEach(p => { if (typeof p?.text === 'string') text += p.text + '\n'; });
    });
    return text.trim();
  }

  async function requestGemini(prompt, modelName) {
    const cooldown = getActiveCooldown(modelName);
    if (cooldown.until) throw new Error(`Modelo em cooldown.`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), CONFIG.timeoutMs);
    try {
      const url = `${CONFIG.endpointBase}/${encodeURIComponent(modelName)}:generateContent`;
      const body = {
        contents:[{ role: 'user', parts:[{ text: prompt.slice(0, CONFIG.maxInputChars) }] }],
        generationConfig: {
          temperature: CONFIG.temperature, topP: CONFIG.topP, topK: CONFIG.topK, maxOutputTokens: CONFIG.maxOutputTokens
        }
      };
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': CONFIG.apiKey },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = data?.error?.message || `Erro ${response.status}`;
        if (response.status === 429 || /quota|rate/i.test(msg)) setCooldown(modelName, extractRetryAfterMs(msg, response.headers));
        throw new Error(msg);
      }
      const text = extractTextFromResponse(data);
      if (!text) throw new Error('Retorno vazio.');
      return text;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function requestWithFallback(prompt) {
    let lastError = null;
    for (const model of CONFIG.modelFallbacks) {
      try {
        const text = await requestGemini(prompt, model);
        return { text, model };
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('Falha ao consultar a IA.');
  }

  function setLoading(wrapper, responseDiv, message) {
    if (wrapper) wrapper.classList.add('ia-loading');
    if (responseDiv) responseDiv.innerHTML = `<div class="ia-inline-note">${escapeHTML(message)}</div>`;
  }

  function clearLoading(wrapper) {
    if (wrapper) wrapper.classList.remove('ia-loading');
  }

  window.gerarRespostaIA_Objetivo = async function(idObjetivo, wrapperElement, idRespostaIA) {
    const respostaDiv = document.getElementById(idRespostaIA);
    if (!respostaDiv) return;

    wrapperElement.querySelector('.ia-btn-objetivo')?.remove();
    const bundle = extrairBundleArtigo();

    if (!bundle.textoCompleto || bundle.textoCompleto.length < 50) {
      respostaDiv.innerHTML = '<div class="ia-inline-note ia-status-error">Não foi possível extrair o texto do artigo.</div>';
      return;
    }

    const cacheKey = `qa:obj:${window.estudoId || 'default'}`;
    try {
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cachedData = JSON.parse(cachedRaw);
        if (cachedData.snapshot === bundle.snapshot && cachedData.html) {
          respostaDiv.innerHTML = cachedData.html;
          return;
        }
      }
    } catch (_) {}

    setLoading(wrapperElement, respostaDiv, '✨ Lendo o artigo completo e preparando a visão geral...');

    try {
      const prompt = buildPrompt(bundle);
      const result = await requestWithFallback(prompt);
      const parsed = safeJSONParse(result.text);
      
      let visaoGeral = parsed ? (parsed.visao_geral || parsed.visaoGeral || parsed.VisaoGeral) : null;
      let aplicacao = parsed ? (parsed.aplicacao_pratica || parsed.aplicacaoPratica || parsed.AplicacaoPratica) : null;
      
      if (!visaoGeral || !aplicacao) throw new Error('Formato de resposta inválido.');
      
      parsed.visao_geral = visaoGeral;
      parsed.aplicacao_pratica = aplicacao;
      parsed.model = result.model;
      
      const html = renderResponseHTML(parsed);
      respostaDiv.innerHTML = html;

      try {
        localStorage.setItem(cacheKey, JSON.stringify({ snapshot: bundle.snapshot, html: html }));
        if (window.CacheAnotacao) window.CacheAnotacao.salvar(idRespostaIA, html);
      } catch (_) {}

    } catch (error) {
      respostaDiv.innerHTML = `<div class="ia-inline-note ia-status-error">Falha ao analisar o objetivo: ${escapeHTML(error.message)}</div>`;
    } finally {
      clearLoading(wrapperElement);
    }
  };
})();