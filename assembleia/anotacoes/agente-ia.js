(function () {
  const DEFAULT_CONFIG = {
    enabled: true,
    apiKey: 'AIzaSyD5kghG7a9NrzvNeeivyEgnvkjZqmF3whw',
    model: 'gemini-2.5-flash-lite',
    modelFallbacks: [
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-3.1-flash-lite-preview'
    ],
    endpointBase: 'https://generativelanguage.googleapis.com/v1beta/models',
    timeoutMs: 18000,
    thresholdChars: 10,
    maxSummaryChars: 600,
    maxInputChars: 5000,
    maxOutputTokens: 256,
    temperature: 0.28,
    topP: 0.8,
    topK: 24,
    cooldownKey: '__assembleia_ia_cooldown__',
    defaultCooldownMs: 30000
  };

  const userConfig = window.ASSEMBLEIA_IA_CONFIG || {};
  const CONFIG = Object.assign({}, DEFAULT_CONFIG, userConfig);
  const VERSION = 3;
  const dbg = window.ASMBDebug || { log(){}, warn(){}, error(){} };

  function createRecord() {
    return {
      version: VERSION,
      fullHtml: '',
      fullText: '',
      summaryText: '',
      hasSummary: false,
      status: 'idle',
      errorMessage: '',
      summaryModel: '',
      pendingToken: '',
      pendingStartedAt: 0,
      isVirgin: true,
      lastAgentText: '',
      updatedAt: 0
    };
  }

  function normalizeSpaces(text) {
    return String(text || '')
      .replace(/\u200B/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\t\f\v ]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function escapeHTML(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function textToHTML(text) {
    const clean = normalizeSpaces(String(text || '').replace(/\u00A0/g, ' '));
    if (!clean) return '';
    return escapeHTML(clean).replace(/\n/g, '<br>');
  }

  function htmlToText(html) {
    const markup = String(html || '').trim();
    if (!markup) return '';

    const root = document.createElement('div');
    root.innerHTML = markup;
    root.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));

    const blockSelector = [
      '.node-paragraph',
      '.node-text',
      '.node-toggle',
      '.toggle-title',
      '.toggle-children',
      '.toggle-child-slot',
      '.paragraph-content',
      '.text-content',
      'p',
      'li',
      'ul',
      'ol',
      'div'
    ].join(',');

    const blocks = Array.from(root.children);
    if (!blocks.length) return normalizeSpaces(root.textContent || '');

    const lines = [];
    const collectFromNode = (node) => {
      if (!(node instanceof Element)) {
        const raw = normalizeSpaces(node.textContent || '');
        if (raw) lines.push(raw);
        return;
      }

      if (node.matches('.node-toggle')) {
        const title = normalizeSpaces(node.querySelector('.toggle-title, .toggle-label, .toggle-header')?.textContent || '');
        const childTexts = Array.from(node.querySelectorAll('.toggle-children .node-paragraph, .toggle-children .node-text, .toggle-child-slot .node-paragraph, .toggle-child-slot .node-text'))
          .map((el) => normalizeSpaces(el.textContent || ''))
          .filter(Boolean);
        if (title) lines.push(title);
        childTexts.forEach((t) => lines.push(t));
        return;
      }

      if (node.matches(blockSelector)) {
        const raw = normalizeSpaces(node.textContent || '');
        if (raw) lines.push(raw);
        return;
      }

      const raw = normalizeSpaces(node.textContent || '');
      if (raw) lines.push(raw);
    };

    blocks.forEach(collectFromNode);
    return normalizeSpaces(lines.join('\n'));
  }

  function clampSummary(text) {
    const clean = normalizeSpaces(text);
    return clean.length > Number(CONFIG.maxSummaryChars || 600)
      ? clean.slice(0, Number(CONFIG.maxSummaryChars || 600)).trim()
      : clean;
  }

  function isRichMarkup(html) {
    return /class\s*=\s*["'][^"']*(node-paragraph|node-toggle|node-text)/i.test(String(html || ''));
  }

  function boundedLevenshtein(a, b, maxDistance) {
    const left = normalizeSpaces(a || '');
    const right = normalizeSpaces(b || '');
    if (left === right) return 0;
    const limit = Math.max(0, Number(maxDistance) || 0);
    let aText = left;
    let bText = right;
    let aLen = aText.length;
    let bLen = bText.length;
    if (Math.abs(aLen - bLen) > limit) return limit + 1;
    if (aLen > bLen) {
      [aText, bText] = [bText, aText];
      [aLen, bLen] = [bLen, aLen];
    }
    let prev = new Array(bLen + 1).fill(limit + 1);
    let curr = new Array(bLen + 1).fill(limit + 1);
    for (let j = 0; j <= Math.min(bLen, limit); j += 1) prev[j] = j;
    for (let i = 1; i <= aLen; i += 1) {
      curr.fill(limit + 1);
      const from = Math.max(1, i - limit);
      const to = Math.min(bLen, i + limit);
      if (from === 1) curr[0] = i;
      let rowMin = limit + 1;
      for (let j = from; j <= to; j += 1) {
        const cost = aText.charCodeAt(i - 1) === bText.charCodeAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1,
          curr[j - 1] + 1,
          prev[j - 1] + cost
        );
        if (curr[j] < rowMin) rowMin = curr[j];
      }
      if (rowMin > limit) return limit + 1;
      [prev, curr] = [curr, prev];
    }
    return prev[bLen];
  }

  function compareAgainstLastAgent(record) {
    const current = normalizeSpaces(record?.fullText || '');
    const baseline = normalizeSpaces(record?.lastAgentText || '');
    const threshold = Math.max(0, Number(CONFIG.thresholdChars || 10));
    if (!baseline) {
      return { hasBaseline: false, same: false, smallChange: false, distance: null, threshold };
    }
    const distance = boundedLevenshtein(current, baseline, threshold);
    return {
      hasBaseline: true,
      same: distance === 0,
      smallChange: distance <= threshold,
      distance,
      threshold
    };
  }

  function maybeMarkNotVirgin(record) {
    if (!record) return record;
    if (record.isVirgin === false) return record;
    if (isRichMarkup(record.fullHtml || '')) {
      record.isVirgin = false;
    }
    return record;
  }

  function isRecordMeaningfullyEmpty(record) {
    const text = normalizeSpaces(record?.fullText || '');
    const rich = isRichMarkup(record?.fullHtml || '');
    return !text && !rich;
  }

  function resetRecordToVirgin(record) {
    if (!record) return createRecord();
    record.fullHtml = '';
    record.fullText = '';
    record.summaryText = '';
    record.hasSummary = false;
    record.status = 'idle';
    record.errorMessage = '';
    record.summaryModel = '';
    record.pendingToken = '';
    record.pendingStartedAt = 0;
    record.isVirgin = true;
    record.lastAgentText = '';
    return record;
  }

  function isConfigured() {
    const key = String(CONFIG.apiKey || '').trim();
    return !!key && key !== 'COLE_SUA_CHAVE_AQUI';
  }

  function shouldSummarize(text) {
    const clean = normalizeSpaces(text);
    const result = clean.length > Number(CONFIG.thresholdChars || 10);
    dbg.log('ia:shouldSummarize', { length: clean.length, threshold: Number(CONFIG.thresholdChars || 10), result, preview: clean.slice(0, 160) });
    return result;
  }

  function prepareInputText(text) {
    const clean = normalizeSpaces(String(text || ''));
    const max = Math.max(100, Number(CONFIG.maxInputChars || 5000));
    const limited = clean.length > max ? clean.slice(0, max).trim() : clean;
    dbg.log('ia:prepareInputText', {
      originalLength: clean.length,
      sentLength: limited.length,
      truncated: limited.length < clean.length,
      maxInputChars: max,
      preview: limited.slice(0, 180)
    });
    return limited;
  }

  function sanitizeUrl(url) {
    try {
      const u = new URL(String(url), location.href);
      if (u.searchParams.has('key')) u.searchParams.set('key', '***');
      return u.toString();
    } catch {
      return String(url || '').replace(/([?&]key=)[^&]+/i, '$1***');
    }
  }

  function serializeError(error) {
    if (!error) return { message: 'Erro desconhecido' };
    return { name: error.name || 'Error', message: error.message || String(error), stack: error.stack || '' };
  }

  function normalizeSummaryOutput(text) {
    return clampSummary(String(text || '')
      .replace(/^Resumo:\s*/i, '')
      .replace(/^"|"$/g, '')
      .replace(/\.\.\.$/, '')
      .replace(/…$/, ''));
  }

  function getModelQueue() {
    const configuredList = Array.isArray(CONFIG.modelFallbacks) ? CONFIG.modelFallbacks : [];
    const rawList = [CONFIG.model, ...configuredList]
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    const unique = [];
    rawList.forEach((item) => {
      if (!unique.includes(item)) unique.push(item);
    });
    return unique;
  }

  function getCooldownStorageKey(modelName) {
    return `${String(CONFIG.cooldownKey || '__assembleia_ia_cooldown__')}:${String(modelName || 'global')}`;
  }

  function readCooldown(modelName) {
    try {
      const raw = localStorage.getItem(getCooldownStorageKey(modelName));
      if (!raw) return { until: 0, reason: '', model: String(modelName || '') };
      const parsed = JSON.parse(raw);
      return {
        until: Number(parsed?.until) || 0,
        reason: String(parsed?.reason || ''),
        model: String(parsed?.model || modelName || '')
      };
    } catch {
      return { until: 0, reason: '', model: String(modelName || '') };
    }
  }

  function writeCooldown(modelName, until, reason) {
    try {
      localStorage.setItem(getCooldownStorageKey(modelName), JSON.stringify({
        until: Number(until) || 0,
        reason: String(reason || ''),
        model: String(modelName || '')
      }));
      return true;
    } catch {
      return false;
    }
  }

  function clearCooldown(modelName) {
    try {
      localStorage.removeItem(getCooldownStorageKey(modelName));
      return true;
    } catch {
      return false;
    }
  }

  function getActiveCooldown(modelName) {
    const data = readCooldown(modelName);
    if (data.until > Date.now()) return data;
    if (data.until) clearCooldown(modelName);
    return { until: 0, reason: '', model: String(modelName || '') };
  }

  function extractRetryAfterMs(message, headers) {
    const retryHeader = headers?.get?.('retry-after');
    if (retryHeader) {
      const seconds = Number(retryHeader);
      if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1000);
      const parsedDate = Date.parse(retryHeader);
      if (Number.isFinite(parsedDate) && parsedDate > Date.now()) return parsedDate - Date.now();
    }
    const match = String(message || '').match(/retry in\s+([\d.]+)s/i);
    if (match) {
      const seconds = Number(match[1]);
      if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1000);
    }
    return Number(CONFIG.defaultCooldownMs || 30000);
  }

  function createApiError(message, meta) {
    const error = new Error(message || 'Erro na API');
    Object.assign(error, meta || {});
    return error;
  }

  async function requestGemini(text, modelName) {
    const cooldown = getActiveCooldown(modelName);
    if (cooldown.until) {
      const remainingMs = Math.max(0, cooldown.until - Date.now());
      dbg.warn('ia:cooldown:active', {
        model: modelName,
        remainingMs,
        reason: cooldown.reason || 'rate_limit'
      });
      throw createApiError(`Cooldown ativo para ${modelName}. Tente novamente em ${Math.ceil(remainingMs / 1000)}s.`, {
        code: 'COOLDOWN_ACTIVE',
        model: modelName,
        cooldownUntil: cooldown.until,
        cooldownRemainingMs: remainingMs,
        isRateLimit: true,
        canFallback: true
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
    const endpoint = `${String(CONFIG.endpointBase || '').replace(/\/$/, '')}/${encodeURIComponent(modelName)}:generateContent`;
    const preparedText = prepareInputText(text);
    const body = {
      systemInstruction: {
        parts: [{ text: `Você é um irmão cristão amoroso e equilibrado, mas muito sucinto. Resuma o texto recebido em português do Brasil, com no máximo ${CONFIG.maxSummaryChars} caracteres. Mantenha o tom natural, acolhedor e humano, sem ficar seco nem robótico. Seja fiel ao conteúdo, sem inventar, sem pregação, sem floreios, sem prefixos, sem aspas e sem reticências.` }]
      },
      contents: [{ role: 'user', parts: [{ text: preparedText }] }],
      generationConfig: {
        temperature: CONFIG.temperature,
        topP: CONFIG.topP,
        topK: CONFIG.topK,
        maxOutputTokens: CONFIG.maxOutputTokens
      }
    };

    const headers = {
      'Content-Type': 'application/json',
      'x-goog-api-key': String(CONFIG.apiKey || '').trim()
    };
    const startedAt = Date.now();
    dbg.log('ia:callGemini:attempt:start', {
      attempt: 1,
      model: modelName,
      authMode: 'header',
      endpoint: sanitizeUrl(endpoint),
      textLength: preparedText.length,
      preview: preparedText.slice(0, 180)
    });

    let rawText = '';
    let response = null;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: JSON.stringify(body)
      });
      rawText = await response.text();
      dbg.log('ia:callGemini:attempt:response', {
        attempt: 1,
        model: modelName,
        authMode: 'header',
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - startedAt,
        bodyPreview: rawText.slice(0, 320)
      });

      let data = {};
      if (rawText) {
        try { data = JSON.parse(rawText); }
        catch (error) {
          dbg.error('ia:callGemini:attempt:parse-error', {
            attempt: 1,
            model: modelName,
            authMode: 'header',
            status: response.status,
            error: serializeError(error),
            bodyPreview: rawText.slice(0, 320)
          });
          throw createApiError(`Resposta inválida da API (${response.status})`, {
            status: response.status,
            isParseError: true
          });
        }
      }

      if (!response.ok) {
        const message = data?.error?.message || `HTTP ${response.status}`;
        const status = Number(response.status) || 0;
        const isRateLimit = status === 429;
        const canFallback = isRateLimit || status === 500 || status === 503;
        if (isRateLimit) {
          const cooldownMs = extractRetryAfterMs(message, response.headers);
          const until = Date.now() + cooldownMs;
          writeCooldown(modelName, until, 'rate_limit');
          dbg.warn('ia:rate-limit', { model: modelName, cooldownMs, until, status, message });
        }
        throw createApiError(message, {
          model: modelName,
          status,
          isRateLimit,
          canFallback,
          cooldownMs: isRateLimit ? extractRetryAfterMs(message, response.headers) : 0,
          bodyPreview: rawText.slice(0, 320)
        });
      }

      clearCooldown(modelName);
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const merged = parts.map((part) => part?.text || '').join('\n').trim();
      if (!merged) throw createApiError('Resposta vazia da IA', {
        model: modelName,
        status: response.status || 200,
        bodyPreview: rawText.slice(0, 320)
      });

      dbg.log('ia:callGemini:summary-received', {
        attempt: 1,
        model: modelName,
        authMode: 'header',
        summaryLength: merged.length,
        summaryPreview: merged.slice(0, 240)
      });
      return normalizeSummaryOutput(merged);
    } catch (error) {
      dbg.error('ia:callGemini:attempt:error', {
        attempt: 1,
        model: modelName,
        authMode: 'header',
        endpoint: sanitizeUrl(endpoint),
        durationMs: Date.now() - startedAt,
        error: serializeError(error),
        bodyPreview: rawText.slice(0, 320)
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function callGemini(text) {
    const models = getModelQueue();
    let lastError = null;

    for (let index = 0; index < models.length; index += 1) {
      const modelName = models[index];
      dbg.log('ia:model:try', { order: index + 1, total: models.length, model: modelName });
      try {
        const summary = await requestGemini(text, modelName);
        dbg.log('ia:model:success', {
          order: index + 1,
          total: models.length,
          model: modelName,
          summaryLength: summary.length
        });
        return { summary, model: modelName };
      } catch (error) {
        lastError = error;
        const retryable = !!(error?.canFallback || error?.isRateLimit || error?.status === 429 || error?.status === 500 || error?.status === 503 || error?.code === 'COOLDOWN_ACTIVE');
        const hasNext = index < models.length - 1;
        dbg.warn('ia:model:failed', {
          order: index + 1,
          total: models.length,
          model: modelName,
          retryable,
          hasNext,
          error: serializeError(error)
        });
        if (retryable && hasNext) {
          dbg.warn('ia:model:fallback-next', {
            from: modelName,
            to: models[index + 1]
          });
          continue;
        }
        throw error;
      }
    }

    throw lastError || createApiError('Nenhum modelo disponível para resumir.');
  }

  function readRaw(id) {
    try { return localStorage.getItem(id); } catch { return null; }
  }

  function writeRaw(id, value) {
    try { localStorage.setItem(id, value); return true; } catch { return false; }
  }

  function legacyToRecord(value) {
    const record = createRecord();
    const html = String(value || '');
    record.fullHtml = html;
    record.fullText = htmlToText(html);
    record.updatedAt = Date.now();
    return record;
  }

  function coerceRecord(parsed) {
    if (!parsed || typeof parsed !== 'object') return createRecord();
    const fullHtml = typeof parsed.fullHtml === 'string' ? parsed.fullHtml : '';
    const fullText = typeof parsed.fullText === 'string' ? parsed.fullText : htmlToText(fullHtml || '');
    const summaryText = typeof parsed.summaryText === 'string' ? parsed.summaryText : '';
    const hasSummary = !!parsed.hasSummary && !!normalizeSpaces(summaryText || '');
    const inferredVirgin = typeof parsed.isVirgin === 'boolean'
      ? parsed.isVirgin
      : !(hasSummary || isRichMarkup(fullHtml));

    return {
      version: parsed.version || VERSION,
      fullHtml,
      fullText,
      summaryText,
      hasSummary,
      status: typeof parsed.status === 'string' ? parsed.status : (hasSummary ? 'summarized' : 'idle'),
      errorMessage: typeof parsed.errorMessage === 'string' ? parsed.errorMessage : '',
      summaryModel: typeof parsed.summaryModel === 'string' ? parsed.summaryModel : '',
      pendingToken: typeof parsed.pendingToken === 'string' ? parsed.pendingToken : '',
      pendingStartedAt: Number(parsed.pendingStartedAt) || 0,
      isVirgin: inferredVirgin,
      lastAgentText: typeof parsed.lastAgentText === 'string'
        ? parsed.lastAgentText
        : (hasSummary ? normalizeSpaces(fullText) : ''),
      updatedAt: Number(parsed.updatedAt) || 0
    };
  }

  function readRecord(id) {
    const raw = readRaw(id);
    if (!raw) return createRecord();

    try {
      const parsed = JSON.parse(raw);
      return coerceRecord(parsed);
    } catch {
      return legacyToRecord(raw);
    }
  }

  function writeRecord(id, nextRecord) {
    const record = coerceRecord(nextRecord);
    record.fullText = htmlToText(record.fullHtml || '');
    record.summaryText = clampSummary(record.summaryText || '');
    record.hasSummary = !!record.summaryText && !!record.hasSummary;
    if (record.hasSummary && record.status !== 'pending') record.status = 'summarized';
    if (!record.hasSummary && record.status === 'summarized') record.status = 'idle';
    if (record.status !== 'pending') record.pendingToken = '';
    if (record.status === 'pending' && !record.pendingStartedAt) record.pendingStartedAt = Date.now();
    record.isVirgin = !!record.isVirgin;
    record.updatedAt = Date.now();
    writeRaw(id, JSON.stringify(record));
    dbg.log('ia:writeRecord', {
      id,
      status: record.status,
      isVirgin: record.isVirgin,
      fullTextLength: record.fullText.length,
      summaryLength: record.summaryText.length,
      hasSummary: record.hasSummary,
      preview: record.summaryText || record.fullText.slice(0, 160)
    });
    return record;
  }

  function saveInlineDraft(id, inlineHtml) {
    const record = readRecord(id);
    record.fullHtml = String(inlineHtml || '').trim();
    record.fullText = htmlToText(record.fullHtml);
    if (isRecordMeaningfullyEmpty(record)) {
      return writeRecord(id, resetRecordToVirgin(record));
    }
    maybeMarkNotVirgin(record);
    record.summaryText = '';
    record.hasSummary = false;
    record.status = 'idle';
    record.errorMessage = '';
    record.summaryModel = '';
    return writeRecord(id, record);
  }

  function saveFullDraft(id, fullHtml) {
    const record = readRecord(id);
    record.fullHtml = String(fullHtml || '').trim();
    record.fullText = htmlToText(record.fullHtml);
    if (isRecordMeaningfullyEmpty(record)) {
      const written = writeRecord(id, resetRecordToVirgin(record));
      dbg.log('ia:saveFullDraft', { id, htmlLength: 0, textLength: 0, preview: '' });
      return written;
    }
    maybeMarkNotVirgin(record);
    if (record.status !== 'pending') {
      record.errorMessage = '';
      if (!record.hasSummary) record.summaryModel = '';
    }
    dbg.log('ia:saveFullDraft', { id, htmlLength: record.fullHtml.length, textLength: record.fullText.length, preview: record.fullText.slice(0, 160) });
    return writeRecord(id, record);
  }

  const inflightPending = new Map();

  function dispatchRecordChange(id, record) {
    try {
      window.dispatchEvent(new CustomEvent('assembleia:recordchange', {
        detail: { id, record: coerceRecord(record) }
      }));
    } catch {}
  }

  function classifySummaryError(error) {
    if (!navigator.onLine) return 'error_network';
    const status = Number(error?.status || 0);
    if (error?.name === 'AbortError') return 'error_network';
    if (status === 429 || status === 500 || status === 503 || error?.isRateLimit || error?.code === 'COOLDOWN_ACTIVE') return 'error_api';
    if (status >= 400) return 'error_api';
    return 'error_network';
  }

  async function finalizeFromFull(id, fullHtml) {
    const queued = queueSummaryFromFull(id, fullHtml);
    if (getRecordStatus(queued) !== 'pending') return queued;
    return processPendingSummary(id);
  }

  function queueSummaryFromFull(id, fullHtml) {
    const record = readRecord(id);
    record.fullHtml = String(fullHtml || '').trim();
    record.fullText = htmlToText(record.fullHtml);

    if (isRecordMeaningfullyEmpty(record)) {
      const written = writeRecord(id, resetRecordToVirgin(record));
      dispatchRecordChange(id, written);
      return written;
    }

    maybeMarkNotVirgin(record);

    if (!shouldSummarize(record.fullText)) {
      record.summaryText = '';
      record.hasSummary = false;
      record.status = 'idle';
      record.errorMessage = '';
      record.summaryModel = '';
      const written = writeRecord(id, record);
      dispatchRecordChange(id, written);
      return written;
    }

    const comparison = compareAgainstLastAgent(record);
    dbg.log('ia:compareText', {
      id,
      hasBaseline: comparison.hasBaseline,
      same: comparison.same,
      smallChange: comparison.smallChange,
      distance: comparison.distance,
      threshold: comparison.threshold
    });

    if (comparison.hasBaseline && comparison.smallChange) {
      record.status = record.hasSummary ? 'summarized' : 'idle';
      record.errorMessage = '';
      if (!record.hasSummary) record.summaryModel = '';
      const written = writeRecord(id, record);
      dispatchRecordChange(id, written);
      return written;
    }

    if (!CONFIG.enabled || !isConfigured()) {
      record.summaryText = '';
      record.hasSummary = false;
      record.status = 'idle';
      record.errorMessage = '';
      record.summaryModel = '';
      const written = writeRecord(id, record);
      dispatchRecordChange(id, written);
      return written;
    }

    record.summaryText = '';
    record.hasSummary = false;
    record.status = 'pending';
    record.errorMessage = '';
    record.summaryModel = '';
    record.pendingToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    record.pendingStartedAt = Date.now();
    const written = writeRecord(id, record);
    dispatchRecordChange(id, written);
    return written;
  }

  function getRecordStatus(idOrRecord) {
    const record = typeof idOrRecord === 'string' ? readRecord(idOrRecord) : coerceRecord(idOrRecord);
    if (record.status) return record.status;
    return record.hasSummary ? 'summarized' : 'idle';
  }

  async function processPendingSummary(id) {
    if (!id) return createRecord();
    if (inflightPending.has(id)) return inflightPending.get(id);

    const record = readRecord(id);
    if (getRecordStatus(record) !== 'pending' || !normalizeSpaces(record.fullText || '')) return record;
    const token = record.pendingToken || '';

    const job = (async () => {
      try {
        const result = await callGemini(record.fullText);
        const latest = readRecord(id);
        if (getRecordStatus(latest) !== 'pending' || latest.pendingToken !== token) return latest;
        latest.summaryText = clampSummary(result.summary);
        latest.hasSummary = !!latest.summaryText;
        latest.status = latest.hasSummary ? 'summarized' : 'idle';
        latest.errorMessage = '';
        latest.summaryModel = result.model || '';
        latest.lastAgentText = normalizeSpaces(latest.fullText || '');
        const written = writeRecord(id, latest);
        dispatchRecordChange(id, written);
        return written;
      } catch (error) {
        const latest = readRecord(id);
        if (getRecordStatus(latest) !== 'pending' || latest.pendingToken !== token) return latest;
        latest.summaryText = '';
        latest.hasSummary = false;
        latest.status = classifySummaryError(error);
        latest.errorMessage = String(error?.message || '').trim();
        latest.summaryModel = '';
        latest.lastAgentText = normalizeSpaces(latest.fullText || '');
        const written = writeRecord(id, latest);
        dispatchRecordChange(id, written);
        return written;
      } finally {
        inflightPending.delete(id);
      }
    })();

    inflightPending.set(id, job);
    return job;
  }

  function getInlineHTML(idOrRecord) {
    const record = typeof idOrRecord === 'string' ? readRecord(idOrRecord) : coerceRecord(idOrRecord);
    if (record.hasSummary) return textToHTML(record.summaryText);
    const rich = String(record.fullHtml || '').trim();
    if (rich) return rich;
    return textToHTML(record.fullText);
  }

  function getFullHTML(idOrRecord) {
    const record = typeof idOrRecord === 'string' ? readRecord(idOrRecord) : coerceRecord(idOrRecord);
    return String(record.fullHtml || '');
  }

  function isSummaryMode(idOrRecord) {
    const record = typeof idOrRecord === 'string' ? readRecord(idOrRecord) : coerceRecord(idOrRecord);
    return !!record.hasSummary && !!normalizeSpaces(record.summaryText || '');
  }

  function isVirginRecord(idOrRecord) {
    const record = typeof idOrRecord === 'string' ? readRecord(idOrRecord) : coerceRecord(idOrRecord);
    return !!record.isVirgin;
  }
  function clearRecord(id) {
    try { localStorage.removeItem(id); return true; } catch { return false; }
  }

  dbg.log('ia:init', {
    enabled: CONFIG.enabled,
    model: CONFIG.model,
    modelFallbacks: getModelQueue(),
    thresholdChars: CONFIG.thresholdChars,
    configured: isConfigured(),
    endpointBase: CONFIG.endpointBase,
    maxInputChars: CONFIG.maxInputChars,
    maxOutputTokens: CONFIG.maxOutputTokens
  });

  window.ASSEMBLEIA_IA_CONFIG = CONFIG;
  window.AssembleiaIA = {
    config: CONFIG,
    createRecord,
    readRecord,
    writeRecord,
    saveInlineDraft,
    saveFullDraft,
    finalizeFromFull,
    queueSummaryFromFull,
    processPendingSummary,
    getInlineHTML,
    getFullHTML,
    getRecordStatus,
    htmlToText,
    textToHTML,
    shouldSummarize,
    isSummaryMode,
    isVirginRecord,
    clearRecord,
    isConfigured,
    prepareInputText
  };
})();