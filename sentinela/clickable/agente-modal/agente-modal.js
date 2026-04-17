(function () {
  const CONFIG = {
    apiKey: 'AIzaSyDk0f5zUqAnU7V6f7ZGUwVoZJbKpsg09DM',
    modelFallbacks:[
      'gemini-3.1-flash-lite-preview',
      'gemini-3-flash-preview',
      'gemini-2.5-flash'
    ],
    endpointBase: 'https://generativelanguage.googleapis.com/v1beta/models',
    timeoutMs: 40000,
    maxInputChars: 50000,
    maxOutputTokens: 2000,
    temperature: 0.65,
    topP: 0.95,
    topK: 40,
    cooldownKey: '__sentinela_modal_cooldown__',
    defaultCooldownMs: 30000
  };

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
          <textarea id="agente-pergunta" placeholder="Pergunte, cruze informações, analise links ou imagens..." autocomplete="off" autocorrect="on" autocapitalize="sentences" spellcheck="true"></textarea>
          <div class="agente-controles">
            <button id="agente-reset" class="agente-btn" title="Limpar">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
            <button id="agente-enviar" class="agente-btn agente-btn--primario">
              <span class="agente-btn-icon">✨</span><span>Pesquisar</span>
            </button>
          </div>
          <div class="agente-status" id="agente-status"></div>
          <div id="agente-resposta" aria-live="polite"></div>
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
    const areaR = overlay.querySelector('#agente-resposta');
    const status = overlay.querySelector('#agente-status');

    let isDragging = false;
    let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;
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

    const enviar = async () => {
      const pergunta = (areaQ.value || '').trim();
      if (!pergunta) { areaQ.focus(); return; }

      const ctxName = overlay.dataset.contexto || 'o artigo em geral';

      let textoCompleto = '';
      document.querySelectorAll('.paragrafo').forEach(p => {
        const clone = p.cloneNode(true);
        const spanNum = clone.querySelector('span');
        let numLabel = '';
        if (spanNum) numLabel = `[PARÁGRAFO ${spanNum.textContent.replace(/\.$/,'').trim()}] `;
        clone.querySelectorAll('.anotacao, .comentarios, .btn-gerar-ia, span').forEach(el => el.remove());
        clone.querySelectorAll('a.bbl').forEach(ref => { ref.outerHTML = `[${ref.textContent.trim()}] `; });
        let texto = clone.textContent.replace(/\s+/g, ' ').trim();
        if (texto.length > 10) textoCompleto += `${numLabel}${texto}\n\n`;
      });

      const prompt =[
        'Você é um tutor bíblico experiente, amoroso e profundo.',
        'Sua prioridade é responder com base no contexto do artigo fornecido, cruzando informações dos parágrafos se necessário.',
        `IMPORTANTE: O usuário abriu este assistente clicando especificamente no ${ctxName}. Se a pergunta dele usar palavras como "este parágrafo", "aqui", "isso", "o que significa", ou parecer incompleta, assuma que ele está se referindo ao ${ctxName}.`,
        'Se a resposta não estiver no artigo (como o significado de uma palavra, evento histórico ou um link fornecido), use seu conhecimento geral ou pesquisa, mas deixe claro que é uma informação externa.',
        'Responda em português de forma clara e educativa.',
        '',
        '=== ARTIGO ===',
        textoCompleto.trim() || '[vazio]',
        '=== FIM DO ARTIGO ===',
        '',
        `PERGUNTA DO USUÁRIO: ${pergunta}`
      ].join('\n');

      btnSend.disabled = true; btnReset.disabled = true; areaQ.disabled = true;
      status.textContent = 'Analisando'; status.classList.add('show');
      areaR.innerHTML = ''; areaR.classList.remove('show', 'agente-resposta--erro');

      const partsPayload =[{ text: prompt.slice(0, CONFIG.maxInputChars) }];
      
      if (/(imagem|foto|ilustração|desenho|figura|quadro)/i.test(pergunta)) {
        status.textContent = 'Processando imagens';
        const imgs = Array.from(document.querySelectorAll('figure img'));
        for (const img of imgs) {
          if (!img.src) continue;
          try {
            const res = await fetch(img.src);
            const blob = await res.blob();
            const base64 = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result.split(',')[1]);
              reader.readAsDataURL(blob);
            });
            partsPayload.push({ inlineData: { mimeType: blob.type || 'image/jpeg', data: base64 } });
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
            
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(new Error('timeout')), CONFIG.timeoutMs);
            const url = `${CONFIG.endpointBase}/${encodeURIComponent(model)}:generateContent`;
            
            const reqBody = {
              contents:[{ role: 'user', parts: partsPayload }],
              generationConfig: { temperature: CONFIG.temperature, topP: CONFIG.topP, topK: CONFIG.topK, maxOutputTokens: CONFIG.maxOutputTokens },
              tools: [{ googleSearch: {} }] 
            };
            
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': CONFIG.apiKey },
              body: JSON.stringify(reqBody),
              signal: controller.signal
            });
            clearTimeout(tid);
            
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              const msg = data?.error?.message || 'Erro';
              if (response.status === 429 || /quota|rate/i.test(msg)) setCooldown(model, extractRetryAfterMs(msg, response.headers));
              throw new Error(msg);
            }
            
            let textOutput = '';
            const candidates = Array.isArray(data?.candidates) ? data.candidates :[];
            candidates.forEach(c => {
              const parts = c?.content?.parts ||[];
              parts.forEach(p => { if (typeof p?.text === 'string') textOutput += p.text + '\n'; });
            });
            
            if (textOutput.trim()) {
              finalResult = { text: textOutput.trim(), model: model };
              break;
            }
          } catch (err) {
            lastError = err;
          }
        }
        
        if (!finalResult) throw lastError || new Error('Falha ao consultar a IA.');

        areaR.classList.add('show');
        areaR.innerHTML = textToHTML(finalResult.text);
        if (typeof window.DEBUG_G !== 'undefined') {
          areaR.innerHTML += `<div style="margin-top: 16px; padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.06); font-size: 0.75rem; color: #166534; font-weight: 600;">✓ Via ${escapeHTML(finalResult.model)}</div>`;
        }

      } catch (err) {
        areaR.classList.add('show', 'agente-resposta--erro');
        areaR.textContent = `Erro: ${err.message}`;
      } finally {
        btnSend.disabled = false; btnReset.disabled = false; areaQ.disabled = false;
        status.textContent = ''; status.classList.remove('show');
      }
    };

    btnSend.addEventListener('click', enviar);
    btnReset.addEventListener('click', () => { areaQ.value = ''; areaR.innerHTML = ''; areaR.classList.remove('show', 'agente-resposta--erro'); areaQ.focus(); });
    areaQ.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } });
  }

  function openModal(contextoTitulo) {
    ensureModal();
    const overlay = document.getElementById('modal-agente');
    overlay.dataset.contexto = contextoTitulo;
    overlay.querySelector('#agente-titulo').textContent = contextoTitulo ? `Tutor IA — ${contextoTitulo}` : 'Tutor IA';
    
    const topPos = window.scrollY + (window.innerHeight / 2);
    overlay.style.top = `${topPos}px`;
    overlay.style.left = `50%`;
    
    overlay.style.display = 'block';
    
    setTimeout(() => {
      const textarea = overlay.querySelector('#agente-pergunta');
      if (textarea) { textarea.focus(); }
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