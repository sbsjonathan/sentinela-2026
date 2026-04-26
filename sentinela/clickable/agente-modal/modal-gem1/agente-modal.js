(function () {
  const CONFIG = {
    workerUrl: 'https://gem.momentaneo2021.workers.dev',
    modelFallbacks:[
      'gemini-3.1-flash-lite-preview',
      'gemini-3-flash-preview',
      'gemini-2.5-flash'
    ],
    timeoutMs: 40000,
    maxOutputTokens: 2000,
    temperature: 0.65,
    topP: 0.95,
    topK: 40,
    cooldownKey: '__sentinela_modal_cooldown__',
    defaultCooldownMs: 30000
  };

  let globalChatHistory = [];
  let globalTurnCount = 0;
  const MAX_TURNS = 5;

  function escapeHTML(text) {
    return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function textToHTML(text) {
    let html = escapeHTML(text);
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br>');
    return html;
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
    } catch (_) { return { until: 0 }; }
  }

  function setCooldown(modelName, ms) {
    try {
      localStorage.setItem(`${CONFIG.cooldownKey}:${modelName}`, JSON.stringify({ until: Date.now() + Math.max(1000, Number(ms) || CONFIG.defaultCooldownMs) }));
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

  function getWorkerUrl() {
    return String(CONFIG.workerUrl || '').trim();
  }

  function isConfigured() {
    return /^https?:\/\//i.test(getWorkerUrl());
  }

  function sanitizeErrorMessage(message) {
    const raw = String(message || '').trim();
    if (!raw) return 'Falha ao consultar a IA.';
    if (/timeout/i.test(raw)) return 'A IA demorou demais para responder.';
    if (/cooldown/i.test(raw)) return 'Modelo em espera. Tente novamente já já.';
    if (/permission denied|api[_ -]?key|suspended|invalid/i.test(raw)) return 'Chave do Worker recusada ou suspensa.';
    if (/quota|rate limit|resource exhausted|too many/i.test(raw)) return 'Limite de requisições atingido. Aguarde.';
    if (/failed to fetch|networkerror|load failed/i.test(raw)) return 'Falha de conexão com o Worker.';
    return raw.replace(/AIza[0-9A-Za-z_\-]+/g, '[oculto]');
  }

  async function requestWorker(payload, modelName) {
    if (!isConfigured()) throw new Error('Worker não configurado.');
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(new Error('timeout')), CONFIG.timeoutMs);

    try {
      const response = await fetch(getWorkerUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        const msg = String(data?.error || data?.message || `Erro ${response.status}`).trim();
        if (response.status === 429 || /quota|rate/i.test(msg)) {
          setCooldown(modelName, extractRetryAfterMs(msg, response.headers));
        }
        throw new Error(msg || 'Falha ao consultar a IA.');
      }
      const text = String(data?.text || '').trim();
      if (!text) throw new Error('Retorno vazio da IA.');
      return { text, model: String(data?.model || modelName || '') };
    } finally {
      clearTimeout(tid);
    }
  }

  function resetChatUI() {
    globalChatHistory = [];
    globalTurnCount = 0;
    const chatFeed = document.getElementById('agente-chat-feed');
    const areaQ = document.getElementById('agente-pergunta');
    const btnSend = document.getElementById('agente-enviar');
    const btnReset = document.getElementById('agente-reset');
    const counterUI = document.getElementById('agente-turn-counter');
    const status = document.getElementById('agente-status');

    if (chatFeed) chatFeed.innerHTML = '';
    if (areaQ) {
      areaQ.value = '';
      areaQ.disabled = false;
      areaQ.placeholder = "Pergunte, cruze informações, analise imagens...";
    }
    if (btnSend) {
      btnSend.disabled = false;
      btnSend.innerHTML = '<span class="agente-btn-icon">✨</span><span>Pesquisar</span>';
    }
    if (btnReset) {
      btnReset.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>';
    }
    if (counterUI) {
      counterUI.textContent = '';
      counterUI.style.display = 'none';
    }
    if (status) {
      status.textContent = '';
      status.classList.remove('show');
    }
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
          <div id="agente-chat-feed" class="agente-chat-feed"></div>
          <div class="agente-status" id="agente-status"></div>
        </div>
        <div class="agente-footer-area">
          <div class="agente-turn-counter" id="agente-turn-counter" style="display:none;"></div>
          <textarea id="agente-pergunta" placeholder="Pergunte, cruze informações, analise imagens..." autocomplete="off" autocorrect="on" autocapitalize="sentences" spellcheck="true"></textarea>
          <div class="agente-controles">
            <button id="agente-reset" class="agente-btn" title="Novo Assunto">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
            <button id="agente-enviar" class="agente-btn agente-btn--primario">
              <span class="agente-btn-icon">✨</span><span>Pesquisar</span>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const fechar = () => { overlay.style.display = 'none'; document.activeElement?.blur(); };
    overlay.querySelector('#agente-fechar').addEventListener('click', fechar);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.style.display === 'block') fechar(); });

    const btnSend = overlay.querySelector('#agente-enviar');
    const btnReset = overlay.querySelector('#agente-reset');
    const areaQ = overlay.querySelector('#agente-pergunta');
    const chatFeed = overlay.querySelector('#agente-chat-feed');
    const status = overlay.querySelector('#agente-status');
    const counterUI = overlay.querySelector('#agente-turn-counter');

    let isDragging = false;
    let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;
    const dragHandle = overlay.querySelector('#agente-drag');

    function onDragStart(e) {
      isDragging = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      startX = clientX; startY = clientY;
      initialLeft = overlay.offsetLeft; initialTop = overlay.offsetTop;
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
      overlay.style.left = `${initialLeft + (clientX - startX)}px`;
      overlay.style.top = `${initialTop + (clientY - startY)}px`;
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

    const enviar = async () => {
      if (globalTurnCount >= MAX_TURNS) return;
      const pergunta = (areaQ.value || '').trim();
      if (!pergunta) { areaQ.focus(); return; }

      const ctxName = overlay.dataset.contexto || 'o artigo em geral';
      
      let textoCompleto = '';
      if (globalTurnCount === 0) {
        document.querySelectorAll('.paragrafo').forEach(p => {
          const clone = p.cloneNode(true);
          const spanNum = clone.querySelector('span');
          let numLabel = spanNum ? `[PARÁGRAFO ${spanNum.textContent.replace(/\.$/,'').trim()}] ` : '';
          clone.querySelectorAll('.anotacao, .comentarios, .btn-gerar-ia, span').forEach(el => el.remove());
          clone.querySelectorAll('a.bbl').forEach(ref => { ref.outerHTML = `[${ref.textContent.trim()}] `; });
          let texto = clone.textContent.replace(/\s+/g, ' ').trim();
          if (texto.length > 10) textoCompleto += `${numLabel}${texto}\n\n`;
        });
      }

      const systemPrompt = globalTurnCount === 0 ? [
        'Você é um tutor bíblico experiente, amoroso e profundo.',
        'Sua prioridade é manter a linha de raciocínio e responder com base no contexto do artigo fornecido.',
        `IMPORTANTE: O foco inicial do usuário é: ${ctxName}.`,
        'Responda em português de forma clara.',
        '=== ARTIGO ===',
        textoCompleto.trim() || '[vazio]',
        '=== FIM DO ARTIGO ==='
      ].join('\n') : "";

      areaQ.value = '';
      btnSend.disabled = true; btnReset.disabled = true; areaQ.disabled = true;
      
      const userBubble = document.createElement('div');
      userBubble.className = 'chat-bubble bubble-user';
      userBubble.textContent = pergunta;
      chatFeed.appendChild(userBubble);
      chatFeed.scrollTop = chatFeed.scrollHeight;

      status.textContent = 'Analisando'; status.classList.add('show');

      let imagePart = null;
      if (globalTurnCount === 0 && /(imagem|foto|ilustração|desenho|figura|quadro)/i.test(pergunta)) {
        status.textContent = 'Processando imagem';
        const img = document.querySelector('figure img');
        if (img && img.src) {
          try {
            const res = await fetch(img.src);
            const blob = await res.blob();
            const base64 = await new Promise(resolve => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result.split(',')[1]);
              reader.readAsDataURL(blob);
            });
            imagePart = { inlineData: { mimeType: blob.type || 'image/jpeg', data: base64 } };
          } catch(e) {}
        }
      }

      try {
        let finalResult = null;
        let lastError = null;
        for (const model of CONFIG.modelFallbacks) {
          try {
            const cd = getActiveCooldown(model);
            if (cd.until) throw new Error('Cooldown');

            const reqBody = {
              prompt: pergunta,
              systemPrompt: systemPrompt,
              history: globalChatHistory,
              modelName: model,
              isJson: false,
              imagePart: imagePart,
              generationConfig: {
                temperature: CONFIG.temperature,
                topP: CONFIG.topP,
                topK: CONFIG.topK,
                maxOutputTokens: CONFIG.maxOutputTokens
              }
            };

            finalResult = await requestWorker(reqBody, model);
            if (finalResult?.text) break;
          } catch (err) {
            lastError = err;
          }
        }

        if (!finalResult) throw lastError || new Error('Falha ao consultar a IA.');

        globalChatHistory.push({ role: "user", parts: [{ text: pergunta }] });
        globalChatHistory.push({ role: "model", parts: [{ text: finalResult.text }] });
        globalTurnCount++;

        const aiBubble = document.createElement('div');
        aiBubble.className = 'chat-bubble bubble-ai';
        aiBubble.innerHTML = textToHTML(finalResult.text);
        if (typeof window.DEBUG_G !== 'undefined') {
          aiBubble.innerHTML += `<div class="bubble-meta">✓ Via ${escapeHTML(finalResult.model)}</div>`;
        }
        chatFeed.appendChild(aiBubble);

      } catch (err) {
        const errorBubble = document.createElement('div');
        errorBubble.className = 'chat-bubble bubble-ai bubble-error';
        errorBubble.textContent = `Erro: ${sanitizeErrorMessage(err?.message)}`;
        chatFeed.appendChild(errorBubble);
        areaQ.value = pergunta; 
      } finally {
        status.textContent = ''; status.classList.remove('show');
        chatFeed.scrollTop = chatFeed.scrollHeight;
        
        btnReset.disabled = false;
        if (globalTurnCount >= MAX_TURNS) {
          areaQ.disabled = true;
          areaQ.placeholder = "Ciclo de raciocínio concluído.";
          btnSend.disabled = true;
          btnSend.innerHTML = '<span class="agente-btn-icon">🔄</span><span>Limite Atingido</span>';
          counterUI.textContent = `💬 Limite de ${MAX_TURNS} interações atingido`;
          btnReset.innerHTML = '<span>🗑️ Novo Assunto</span>';
          btnReset.style.width = '100%';
          btnSend.style.display = 'none';
        } else if (globalTurnCount > 0) {
          areaQ.disabled = false;
          btnSend.disabled = false;
          btnSend.innerHTML = '<span class="agente-btn-icon">💬</span><span>Continuar</span>';
          btnReset.innerHTML = '<span>🗑️ Novo Assunto</span>';
          counterUI.style.display = 'block';
          counterUI.textContent = `💬 Interação ${globalTurnCount} de ${MAX_TURNS}`;
          setTimeout(() => areaQ.focus(), 100);
        } else {
          areaQ.disabled = false;
          btnSend.disabled = false;
        }
      }
    };

    btnSend.addEventListener('click', enviar);
    btnReset.addEventListener('click', () => { 
      resetChatUI(); 
      btnSend.style.display = 'flex';
      btnReset.style.width = 'auto';
      areaQ.focus(); 
    });
    areaQ.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } });
  }

  function openModal(contextoTitulo) {
    ensureModal();
    const overlay = document.getElementById('modal-agente');
    resetChatUI();
    const btnSend = document.getElementById('agente-enviar');
    const btnReset = document.getElementById('agente-reset');
    if(btnSend) btnSend.style.display = 'flex';
    if(btnReset) btnReset.style.width = 'auto';

    overlay.dataset.contexto = contextoTitulo;
    overlay.querySelector('#agente-titulo').textContent = contextoTitulo ? `Tutor IA — ${contextoTitulo}` : 'Tutor IA';
    
    const topPos = window.scrollY + (window.innerHeight / 2);
    overlay.style.top = `${topPos}px`;
    overlay.style.left = `50%`;
    overlay.style.display = 'block';
    
    setTimeout(() => {
      const textarea = overlay.querySelector('#agente-pergunta');
      if (textarea) textarea.focus();
    }, 100);
  }

  let pressTimer = null;
  let isPressing = false;
  let startX = 0, startY = 0;
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
        setTimeout(() => { if (activeSpan) activeSpan.classList.remove('agente-activated'); }, 300);
      }
    }, 1000);
  }

  function handleMove(e) {
    if (!isPressing || !activeSpan) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    if (Math.abs(clientX - startX) > 10 || Math.abs(clientY - startY) > 10) cancelPress();
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