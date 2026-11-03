(function (scope) {
  'use strict';

  // Shared by the navigation worker and the first-load fallback page. Older
  // downloads keep their original cache name and URL, so no download is lost.
  const CACHE_NAME = 'artigo-offline-v1';
  const PROXY_URL = 'https://hope2.momentaneo2021.workers.dev/';
  const pad = value => String(value).padStart(2, '0');
  const iso = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  function calendarDate(year, month, day) {
    const date = new Date(year, month - 1, day, 12);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }

  function resolveDate(url, now = new Date()) {
    const params = new URL(String(url), 'https://sentinela.invalid/').searchParams;
    const requested = /^(\d{4})-(\d{2})-(\d{2})$/.exec(params.get('d') || '');
    if (requested) {
      const date = calendarDate(Number(requested[1]), Number(requested[2]), Number(requested[3]));
      if (date) return iso(date);
    }
    const week = /^(\d{1,2})-(\d{1,2})$/.exec(params.get('semana') || '');
    if (week) {
      const candidates = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]
        .map(year => calendarDate(year, Number(week[2]), Number(week[1])))
        .filter(Boolean)
        .sort((a, b) => Math.abs(a - now) - Math.abs(b - now));
      if (candidates.length) return iso(candidates[0]);
    }
    return iso(now);
  }

  function cacheKey(date) {
    return `${PROXY_URL}?semana=${encodeURIComponent(date)}`;
  }

  function isArticle(html) {
    if (typeof html !== 'string' || !/^\s*<!doctype\s+html\b/i.test(html)) return false;
    // A generic HTML error/challenge page must never replace a downloaded study.
    return /<body\b[^>]*\bdata-estudo\s*=/i.test(html) ||
      (/<(?:main|article)\b/i.test(html) && /\b(?:class|id)\s*=\s*["'][^"']*\b(?:paragrafo|barra-estudo|secao-cantico)\b/i.test(html));
  }

  function escapeAttribute(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function prepareHTML(html, { date, rootURL }) {
    if (!isArticle(html)) throw new Error('O conteúdo recebido não é um estudo.');
    const root = new URL('./', rootURL).href;
    const scriptURL = new URL('sentinela/artigos/reading-position.js', root).href;
    const script = /\bid\s*=\s*["']sentinela-reading-position["']/i.test(html) ? '' : `<script id="sentinela-reading-position" src="${escapeAttribute(scriptURL)}" data-study-date="${escapeAttribute(date)}" data-project-root="${escapeAttribute(root)}"></script>`;
    const typography = (/\bid\s*=\s*["']sentinela-typography-script["']/i.test(html) ? '' : `<script id="sentinela-typography-script" src="${escapeAttribute(new URL('shared/typography.js', root).href)}"></script>`) +
      (/\bid\s*=\s*["']sentinela-typography-style["']/i.test(html) ? '' : `<link id="sentinela-typography-style" rel="stylesheet" href="${escapeAttribute(new URL('shared/typography.css', root).href)}">`);
    // Run before styles, external scripts and article content. The document URL
    // stays estudo.html, preserving every existing relative asset and link.
    if (/<head\b[^>]*>/i.test(html)) {
      const prepared = html.replace(/<head\b[^>]*>/i, match => match + '\n' + script);
      // Run after legacy font bootstraps/styles, before the article can paint.
      return /<\/head\s*>/i.test(prepared) ? prepared.replace(/<\/head\s*>/i, typography + '\n</head>') : prepared.replace(/<head\b[^>]*>/i, match => match + typography);
    }
    if (/<html\b[^>]*>/i.test(html)) return html.replace(/<html\b[^>]*>/i, match => match + '<head>' + script + typography + '</head>');
    return html.replace(/<!doctype[^>]*>/i, match => match + '<head>' + script + typography + '</head>');
  }

  scope.SentinelaArticleRuntime = Object.freeze({ CACHE_NAME, PROXY_URL, resolveDate, cacheKey, isArticle, prepareHTML });
})(typeof self === 'object' ? self : globalThis);
