(function () {
  const CONFIG = {
    workerUrl: 'https://gem.momentaneo2021.workers.dev',
    modelFallbacks: [
      'gemini-3.1-flash-lite-preview',
      'gemini-3-flash-preview',
      'gemini-2.5-flash'
    ],
    timeoutMs: 40000,
    maxInputChars: 50000,
    maxOutputTokens: 2000,
    temperature: 0.65,
    topP: 0.95,
    topK: 40,
    cooldownKey: '__sentinela_modal_cooldown__',
    defaultCooldownMs: 30000,
    maxHistoryPairs: 4,
    maxHistoryChars: 12000
  };

  const threadStore = new Map();
  let cachedArticleText = null;

  function escapeHTML(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function textToHTML(text) {
    let html = escapeHTML(text);
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function normalizeSpaces(text) {
    return String(text || '').replace(/\u200B/g, '').replace(/\r\n?/g, '\n').replace(/[\t\f\v ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  function sanitizeErrorMessage(message) {
    const raw = String(message || '').trim();
    if (!raw) return 'Falha ao consultar a IA.';
    if (/load failed|failed to fetch|networkerror|network error/i.test(raw)) {
      return 'Falha de comunicação com o Worker.';
    }
    return raw
      .replace(/AIza[0-9A-Za-z_\-]+/g, '[oculto]')
      .replace(/AQ\.[A-Za-z0-9_\-.]+/g, '[oculto]');
  }

  function isConfigured() {
    return /^https?:\/\//i.test(String(CONFIG.workerUrl || '').trim());
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
      localStorage.setItem(
        `${CONFIG.cooldownKey}:${modelName}`,
        JSON.stringify({ until: Date.now() + Math.max(1000, Number(ms) || CONFIG.defaultCooldownMs) })
      );
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

  function getSessionKey(contextTitle) {
    return String(contextTitle || 'artigo').trim() || 'artigo';
  }

  function getSession(contextTitle) {
    const key = getSessionKey(contextTitle);
    if (!threadStore.has(key)) {
      threadStore.set(key, {
        mode: 'continue',
        messages: []
      });
    }
    return threadStore.get(key);
  }

  function buildArticleText() {
    if (cachedArticleText) return cachedArticleText;

    let textoCompleto = '';
    document.querySelectorAll('.paragrafo').forEach((p) => {
      const clone = p.cloneNode(true);
      const spanNum = clone.querySelector('span');
      let numLabel = '';
      if (spanNum) numLabel = `[PARÁGRAFO ${spanNum.textContent.replace(/\.$/, '').trim()}] `;
      clone.querySelectorAll('.anotacao, .comentarios, .btn-gerar-ia, span').forEach((el) => el.remove());
      clone.querySelectorAll('a.bbl').forEach((ref) => {
        ref.outerHTML = `[${ref.textContent.trim()}] `;
      });
      const texto = clone.textContent.replace(/\s+/g, ' ').trim();
      if (texto.length > 10) textoCompleto += `${numLabel}${texto}\n\n`;
    });

    cachedArticleText = textoCompleto.trim() || '[vazio]';
    return cachedArticleText;
  }

  function serializeHistory(messages) {
    const usable = Array.isArray(messages) ? messages.slice(-CONFIG.maxHistoryPairs * 2) : [];
    let history = '';
    for (const msg of usable) {
      const role = msg.role === 'assistant' ? 'ASSISTENTE' : 'USUÁRIO';
      history += `${role}: ${normalizeSpaces(msg.text)}\n\n`;
    }
    history = history.trim();
    if (history.length > CONFIG.maxHistoryChars) {
      history = history.slice(history.length - CONFIG.maxHistoryChars);
    }
    return history;
  }

  function buildPrompt({ question, contextTitle, articleText, historyText, continueThread }) {
    const blocks = [
      'Você é um tutor bíblico experiente, amoroso e profundo.',
      'Sua prioridade é responder com base no contexto do artigo fornecido, cruzando informações dos parágrafos se necessário.',
      `IMPORTANTE: O usuário abriu este assistente clicando especificamente no ${contextTitle}. Se a pergunta dele usar palavras como "este parágrafo", "aqui", "isso", "o que significa", ou parecer incompleta, assuma que ele está se referindo ao ${contextTitle}.`,
      'Se a resposta não estiver no artigo (como o significado de uma palavra, evento histórico ou um link fornecido), use seu conhecimento geral ou pesquisa, mas deixe claro que é uma informação externa.',
      'Responda em português de forma clara, educativa e direta.',
      '',
      '=== ARTIGO ===',
      articleText,
      '=== FIM DO ARTIGO ==='
    ];

    if (continueThread && historyText) {
      blocks.push(
        '',
        '=== HISTÓRICO RECENTE DA CONVERSA ===',
        historyText,
        '=== FIM DO HISTÓRICO ===',
        'A nova resposta deve continuar a linha de raciocínio acima, sem repetir desnecessariamente tudo do zero.'
      );
    }

    blocks.push('', `PERGUNTA DO USUÁRIO: ${question}`);
    return blocks.join('\n');
  }

  async function collectImageParts(question) {
    if (!/(imagem|foto|ilustraç(?:ão|oes)|ilustração|desenho|figura|quadro)/i.test(question)) {
      return [];
    }

    const imageParts = [];
    const imgs = Array.from(document.querySelectorAll('figure img'));
    for (const img of imgs) {
      if (!img.src) continue;
      try {
        const res = await fetch(img.src);
        const blob = await res.blob();
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || '').split(',')[1] || '');
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        if (base64) {
          imageParts.push({
            inlineData: {
              mimeType: blob.type || 'image/jpeg',
              data: base64
            }
          });
        }
      } catch (_) {}
    }
    return imageParts;
  }

  async function requestWorker({ prompt, parts }) {
    let finalResult = null;
    let lastError = null;

    for (const model of CONFIG.modelFallbacks) {
      try {
        const cd = getActiveCooldown(model);
        if (cd.until) throw new Error('Cooldown');

        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(new Error('timeout')), CONFIG.timeoutMs);
        const response = await fetch(String(CONFIG.workerUrl || '').trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            parts,
            modelName: model,
            isJson: false,
            generationConfig: {
              temperature: CONFIG.temperature,
              topP: CONFIG.topP,
              topK: CONFIG.topK,
              maxOutputTokens: CONFIG.maxOutputTokens
            },
            tools: [{ googleSearch: {} }]
          }),
          signal: controller.signal
        });
        clearTimeout(tid);

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.error) {
          const msg = data?.error || data?.message || 'Erro ao consultar a IA.';
          if (response.status === 429 || /quota|rate/i.test(msg)) {
            setCooldown(model, extractRetryAfterMs(msg, response.headers));
          }
          throw new Error(msg);
        }

        const text = normalizeSpaces(data?.text || '');
        if (!text) throw new Error('A IA não retornou conteúdo utilizável.');
        finalResult = { text, model: data?.model || model };
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!finalResult) throw lastError || new Error('Falha ao consultar a IA.');
    return finalResult;
  }

  function updatePlaceholder(overlay, session) {
    const areaQ = overlay.querySelector('#agente-pergunta');
    const hasThread = Array.isArray(session?.messages) && session.messages.length >= 2;
    if (!areaQ) return;
    if (hasThread && session.mode === 'continue') {
      areaQ.placeholder = 'Continue a conversa com base na resposta anterior...';
      return;
    }
    areaQ.placeholder = 'Faça uma nova pergunta sobre este trecho, artigo ou imagem...';
  }

  function setMode(overlay, mode) {
    const contextTitle = overlay.dataset.contexto || 'o artigo em geral';
    const session = getSession(contextTitle);
    session.mode = mode === 'new' ? 'new' : 'continue';

    const btnNew = overlay.querySelector('#agente-modo-novo');
    const btnContinue = overlay.querySelector('#agente-modo-continuar');
    const hint = overlay.querySelector('#agente-modo-hint');

    btnNew?.classList.toggle('is-active', session.mode === 'new');
    btnContinue?.classList.toggle('is-active', session.mode === 'continue');

    if (hint) {
      hint.textContent = session.mode === 'continue'
        ? 'A próxima pergunta vai considerar a conversa acima.'
        : 'A próxima pergunta vai começar uma nova linha de raciocínio.';
    }

    updatePlaceholder(overlay, session);
  }

  function renderThread(overlay) {
    const contextTitle = overlay.dataset.contexto || 'o artigo em geral';
    const session = getSession(contextTitle);
    const threadEl = overlay.querySelector('#agente-thread');
    const modeWrap = overlay.querySelector('#agente-modo-wrap');

    if (!threadEl || !modeWrap) return;

    const messages = Array.isArray(session.messages) ? session.messages : [];
    if (!messages.length) {
      threadEl.innerHTML = `
        <div class="agente-thread-empty">
          <strong>Conversa contextual</strong>
          <span>Você pode fazer uma pergunta isolada ou continuar a linha de raciocínio depois da primeira resposta.</span>
        </div>
      `;
      modeWrap.hidden = true;
      setMode(overlay, 'continue');
      return;
    }

    threadEl.innerHTML = messages.map((msg) => {
      const roleLabel = msg.role === 'assistant' ? 'Tutor IA' : 'Você';
      const bubbleClass = msg.role === 'assistant' ? 'agente-bubble agente-bubble--assistant' : 'agente-bubble agente-bubble--user';
      const meta = msg.role === 'assistant' && msg.model
        ? `<div class="agente-bubble-meta">${escapeHTML(roleLabel)} · ${escapeHTML(msg.model)}</div>`
        : `<div class="agente-bubble-meta">${escapeHTML(roleLabel)}</div>`;
      return `
        <article class="${bubbleClass}">
          ${meta}
          <div class="agente-bubble-texto">${textToHTML(msg.text)}</div>
        </article>
      `;
    }).join('');

    modeWrap.hidden = messages.length < 2;
    setMode(overlay, session.mode || 'continue');
    threadEl.scrollTop = threadEl.scrollHeight;
  }

  function ensureModal() {
    if (document.getElementById('modal-agente')) return;

    const overlay = document.createElement('div');
    overlay.id = 'modal-agente';
    overlay.innerHTML = `
      <div class="modal-agente-content" role="dialog" aria-modal="true">
        <div class="modal-agente-header">
          <div class="modal-agente-drag" id="agente-drag">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"></path></svg>
          </div>
          <h3 class="agente-modal-titulo" id="agente-titulo">Tutor IA</h3>
          <div class="modal-agente-fechar" id="agente-fechar">×</div>
        </div>
        <div class="agente-modal-body">
          <div id="agente-thread" class="agente-thread" aria-live="polite"></div>
          <div id="agente-modo-wrap" class="agente-modo-wrap" hidden>
            <div class="agente-modo-topo">
              <span class="agente-modo-titulo">Próxima pergunta</span>
              <span id="agente-modo-hint" class="agente-modo-hint"></span>
            </div>
            <div class="agente-modo-toggle" role="group" aria-label="Modo da próxima pergunta">
              <button type="button" id="agente-modo-novo" class="agente-modo-btn">Nova pergunta</button>
              <button type="button" id="agente-modo-continuar" class="agente-modo-btn">Continuar raciocínio</button>
            </div>
          </div>
          <textarea id="agente-pergunta" placeholder="Faça uma nova pergunta sobre este trecho, artigo ou imagem..." autocomplete="off" autocorrect="on" autocapitalize="sentences" spellcheck="true"></textarea>
          <div class="agente-controles">
            <button id="agente-reset" class="agente-btn" title="Limpar conversa atual">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
            <button id="agente-enviar" class="agente-btn agente-btn--primario">
              <span class="agente-btn-icon">✨</span><span>Perguntar</span>
            </button>
          </div>
          <div class="agente-status" id="agente-status"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const btnSend = overlay.querySelector('#agente-enviar');
    const btnReset = overlay.querySelector('#agente-reset');
    const areaQ = overlay.querySelector('#agente-pergunta');
    const status = overlay.querySelector('#agente-status');
    const btnNew = overlay.querySelector('#agente-modo-novo');
    const btnContinue = overlay.querySelector('#agente-modo-continuar');

    const fechar = () => {
      overlay.style.display = 'none';
      document.activeElement?.blur();
      status.textContent = '';
      status.classList.remove('show', 'agente-status--erro');
    };

    overlay.querySelector('#agente-fechar').addEventListener('click', fechar);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.style.display === 'block') fechar();
    });

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    const dragHandle = overlay.querySelector('#agente-drag');

    function onDragStart(e) {
      isDragging = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      startX = clientX;
      startY = clientY;
      initialLeft = overlay.offsetLeft;
      initialTop = overlay.offsetTop;
      if (e.type === 'touchstart') {
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('touchend', onDragEnd);
      } else {
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
      }
      e.preventDefault();
    }

    function onDragMove(e) {
      if (!isDragging) return;
      e.preventDefault();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = clientX - startX;
      const dy = clientY - startY;
      overlay.style.left = `${initialLeft + dx}px`;
      overlay.style.top = `${initialTop + dy}px`;
    }

    function onDragEnd() {
      isDragging = false;
      document.removeEventListener('touchmove', onDragMove);
      document.removeEventListener('touchend', onDragEnd);
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
    }

    dragHandle.addEventListener('mousedown', onDragStart);
    dragHandle.addEventListener('touchstart', onDragStart, { passive: false });

    btnNew.addEventListener('click', () => setMode(overlay, 'new'));
    btnContinue.addEventListener('click', () => setMode(overlay, 'continue'));

    btnReset.addEventListener('click', () => {
      const contextTitle = overlay.dataset.contexto || 'o artigo em geral';
      const session = getSession(contextTitle);
      session.messages = [];
      session.mode = 'continue';
      areaQ.value = '';
      status.textContent = '';
      status.classList.remove('show', 'agente-status--erro');
      renderThread(overlay);
      areaQ.focus();
    });

    const enviar = async () => {
      const pergunta = normalizeSpaces(areaQ.value || '');
      if (!pergunta) {
        areaQ.focus();
        return;
      }
      if (!isConfigured()) {
        status.textContent = 'Configure a URL do Worker.';
        status.classList.add('show', 'agente-status--erro');
        return;
      }

      const contextTitle = overlay.dataset.contexto || 'o artigo em geral';
      const session = getSession(contextTitle);
      const continueThread = session.mode === 'continue' && session.messages.length >= 2;
      const priorMessages = continueThread ? session.messages.slice() : [];

      if (!continueThread) {
        session.messages = [];
      }

      const userMessage = { role: 'user', text: pergunta };
      session.messages.push(userMessage);
      renderThread(overlay);

      btnSend.disabled = true;
      btnReset.disabled = true;
      btnNew.disabled = true;
      btnContinue.disabled = true;
      areaQ.disabled = true;
      status.textContent = 'Analisando';
      status.classList.remove('agente-status--erro');
      status.classList.add('show');

      try {
        const articleText = buildArticleText();
        const historyText = serializeHistory(priorMessages);
        const prompt = buildPrompt({
          question: pergunta,
          contextTitle,
          articleText,
          historyText,
          continueThread
        });

        const partsPayload = [{ text: prompt.slice(0, CONFIG.maxInputChars) }];
        const imageParts = await collectImageParts(pergunta);
        if (imageParts.length) {
          status.textContent = 'Processando imagens';
          partsPayload.push(...imageParts);
        }

        const finalResult = await requestWorker({
          prompt,
          parts: partsPayload
        });

        session.messages.push({
          role: 'assistant',
          text: finalResult.text,
          model: finalResult.model
        });

        areaQ.value = '';
        status.textContent = '';
        status.classList.remove('show', 'agente-status--erro');
        renderThread(overlay);
      } catch (err) {
        session.messages = session.messages.filter((msg) => msg !== userMessage);
        renderThread(overlay);
        status.textContent = `Erro: ${sanitizeErrorMessage(err?.message || err)}`;
        status.classList.add('show', 'agente-status--erro');
      } finally {
        btnSend.disabled = false;
        btnReset.disabled = false;
        btnNew.disabled = false;
        btnContinue.disabled = false;
        areaQ.disabled = false;
        updatePlaceholder(overlay, session);
        areaQ.focus();
      }
    };

    btnSend.addEventListener('click', enviar);
    areaQ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        enviar();
      }
    });
  }

  function openModal(contextoTitulo) {
    ensureModal();
    const overlay = document.getElementById('modal-agente');
    overlay.dataset.contexto = contextoTitulo;
    overlay.querySelector('#agente-titulo').textContent = contextoTitulo ? `Tutor IA — ${contextoTitulo}` : 'Tutor IA';

    const topPos = window.scrollY + (window.innerHeight / 2);
    overlay.style.top = `${topPos}px`;
    overlay.style.left = '50%';
    overlay.style.display = 'block';

    renderThread(overlay);

    setTimeout(() => {
      const textarea = overlay.querySelector('#agente-pergunta');
      textarea?.focus();
    }, 100);
  }

  let pressTimer = null;
  let isPressing = false;
  let startX = 0;
  let startY = 0;
  let activeSpan = null;

  function handleStart(e) {
    const target = e.target.closest('.pergunta span');
    if (!target) return;
    if (e.touches && e.touches.length > 1) return;

    isPressing = true;
    activeSpan = target;
    startX = e.touches ? e.touches[0].clientX : e.clientX;
    startY = e.touches ? e.touches[0].clientY : e.clientY;

    window.getSelection().removeAllRanges();
    activeSpan.classList.add('agente-pressing');

    pressTimer = setTimeout(() => {
      if (isPressing && activeSpan) {
        isPressing = false;
        activeSpan.classList.remove('agente-pressing');
        activeSpan.classList.add('agente-activated');
        if (navigator.vibrate) navigator.vibrate(50);
        const num = activeSpan.textContent.trim().replace(/\.$/, '');
        openModal(`Parágrafo ${num}`);
        setTimeout(() => {
          if (activeSpan) activeSpan.classList.remove('agente-activated');
        }, 300);
      }
    }, 1000);
  }

  function handleMove(e) {
    if (!isPressing || !activeSpan) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    if (Math.abs(clientX - startX) > 10 || Math.abs(clientY - startY) > 10) {
      cancelPress();
    }
  }

  function cancelPress() {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
    isPressing = false;
    if (activeSpan) {
      activeSpan.classList.remove('agente-pressing', 'agente-activated');
      activeSpan = null;
    }
  }

  document.addEventListener('touchstart', handleStart, { passive: true });
  document.addEventListener('touchmove', handleMove, { passive: true });
  document.addEventListener('touchend', cancelPress, { passive: true });
  document.addEventListener('touchcancel', cancelPress, { passive: true });
  document.addEventListener('mousedown', handleStart);
  document.addEventListener('mousemove', handleMove);
  document.addEventListener('mouseup', cancelPress);
  document.addEventListener('scroll', cancelPress, { passive: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureModal);
  } else {
    ensureModal();
  }
})();
