import {buildContext, PRIVATE_CONTENT as PRIVATE} from './agente-modal/agente-contexto.js';
import {namedBoxSources, restoreBoxMarks, saveBoxMarks} from './fontes-quadros.js';
export {restoreBoxMarks};
const NOTE_PIN = 'a.footnote-link,a.footnote-ref,.simbolo-rodape,sup';
const COLORS = ['yellow', 'green', 'blue'];
const activeSweeps = new Map();
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
let sweepObserver;
const prose = value => String(value ?? '').replace(/\u200B/g, '').replace(/\r\n?/g, '\n').replace(/[\t\f\v ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
const clean = value => String(value ?? '').replace(/[\u200B\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
const canonical = value => clean(value).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—−]/g, '-');
const clause = value => canonical(value).replace(/^\([a-z]\)\s*/i, '').replace(/^(?:e|ou)\s+/i, '').replace(/[?!.;:]+$/, '').trim();
const questionWord = /\b(?:por\s+qu[eê]|como|o\s+que|que|qual|quais|quem|quando|onde|aonde|quanto|quantos|quantas)\b/i;

function cancelSweep(mark) {
  const animation = activeSweeps.get(mark);
  if (!animation) return;
  activeSweeps.delete(mark);
  animation.cancel();
  if (!activeSweeps.size) sweepObserver?.disconnect();
}

function ensureHighlightPaint() {
  if (document.getElementById('ia-extractive-highlight-paint')) return;
  const style = document.createElement('style');
  style.id = 'ia-extractive-highlight-paint';
  // mark.js intentionally disables animations on manually colored marks.
  // Override its solid background only on marks still owned by this agent.
  // The steady state is already fully painted, including cached HTML; only
  // Web Animations supplies the temporary reveal, never persisted attributes.
  const selector = 'mark[data-ia-owner][data-ia-mode="owned"]';
  style.textContent = `
    ${selector}.hl-color-yellow { --ia-sweep-color: #FFEC0D66; }
    ${selector}.hl-color-green { --ia-sweep-color: #B7E49266; }
    ${selector}.hl-color-blue { --ia-sweep-color: #98D8FF66; }
    ${selector}:is(.ia-highlight,.ia-highlight-b) {
      background-color: transparent !important;
      background-image: linear-gradient(to right, var(--ia-sweep-color), var(--ia-sweep-color));
      background-repeat: no-repeat;
      background-position: left center;
      background-size: 100% 100%;
      box-decoration-break: slice;
      -webkit-box-decoration-break: slice;
      animation: none !important;
    }
  `;
  document.head.append(style);
  reducedMotion?.addEventListener('change', event => {
    if (event.matches) [...activeSweeps.keys()].forEach(cancelSweep);
  });
}

function revealHighlights(marks) {
  if (reducedMotion?.matches || !Element.prototype.animate || !marks.length) return;
  const ordered = marks.filter(mark => mark.isConnected).sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  const weights = ordered.map(mark => Math.max(5, mark.textContent.length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const duration = Math.max(900, Math.min(2200, total * 2.4));
  let delay = 100;
  sweepObserver ||= new MutationObserver(() => {
    // Recoloring is a user's manual decision. Stop the reveal immediately;
    // mark.js then owns the new solid color and the marker is no longer ours.
    [...activeSweeps.keys()].forEach(mark => {
      if (!mark.isConnected || !mark.dataset.iaOwner || !ownedMark(mark, mark.dataset.iaOwner)) cancelSweep(mark);
    });
  });
  ordered.forEach((mark, i) => {
    const partDuration = duration * weights[i] / total;
    const animation = mark.animate([{backgroundSize: '0% 100%'}, {backgroundSize: '100% 100%'}],
      {duration: partDuration, delay, easing: 'linear', fill: 'backwards'});
    activeSweeps.set(mark, animation);
    animation.onfinish = animation.oncancel = () => {
      if (activeSweeps.get(mark) === animation) activeSweeps.delete(mark);
      if (!activeSweeps.size) sweepObserver.disconnect();
    };
    sweepObserver.observe(mark, {attributes: true, attributeFilter: ['class', 'data-ia-owner', 'data-ia-mode']});
    delay += partDuration;
  });
}

function hasWholeWordBoundaries(text, start, end) {
  const left = /[\p{L}\p{N}\p{M}]$/u;
  const right = /^[\p{L}\p{N}\p{M}]/u;
  return !(left.test(text.slice(0, start)) && right.test(text.slice(start))) &&
    !(left.test(text.slice(0, end)) && right.test(text.slice(end)));
}

function uniqueQuoteStart(text, quote, reviewed) {
  if (!quote) return -1;
  const variants = new Set([quote]);
  if (reviewed) {
    // The reviewer may capitalize a clause copied from mid-sentence. Only its
    // first letter can vary, and the combined search must still be unambiguous.
    const first = String.fromCodePoint(quote.codePointAt(0));
    for (const initial of [first.toLocaleLowerCase('pt-BR'), first.toLocaleUpperCase('pt-BR')]) {
      if (initial.length === first.length) variants.add(initial + quote.slice(first.length));
    }
  }
  let start = -1;
  for (const variant of variants) {
    const index = text.indexOf(variant);
    if (index < 0) continue;
    if (start >= 0 || text.indexOf(variant, index + 1) >= 0) return -1;
    start = index;
  }
  return start;
}

// Mask quoted examples and parenthetical asides before interpreting punctuation.
// The returned text keeps exactly the original UTF-16 offsets.
function structuralText(text) {
  let quote = '', depth = 0, result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === quote || (quote === '”' && char === '”') || (quote === '’' && char === '’')) quote = '';
      result += ' '; continue;
    }
    if (char === '“' || char === '"' || char === '‘' || (char === "'" && !/[\p{L}\p{N}]/u.test(text[i - 1] || ''))) {
      quote = char === '“' ? '”' : char === '‘' ? '’' : char;
      result += ' '; continue;
    }
    if (char === '(') depth++;
    result += depth ? ' ' : char;
    if (char === ')' && depth) depth--;
  }
  return result;
}

export function analyzeQuestion(questionText) {
  const text = clean(questionText);
  const labels = [...text.matchAll(/\(([a-z])\)\s*/gi)];
  if (labels.length > 1 && labels.every((entry, i) => entry[1].toLowerCase() === String.fromCharCode(97 + i))) {
    const parts = labels.map((entry, i) => text.slice(entry.index + entry[0].length, labels[i + 1]?.index ?? text.length).trim()).filter(Boolean);
    if (parts.length > 1) return {parts, count: parts.length, explicit: true};
  }
  const masked = structuralText(text);
  const boundaries = new Set([0]);
  for (const match of masked.matchAll(/\?\s*/g)) {
    const next = match.index + match[0].length;
    if (questionWord.test(masked.slice(next))) boundaries.add(next);
  }
  for (const match of masked.matchAll(/\s+(?:e|ou)\s+(?=(?:por\s+qu[eê]|como|o\s+que|qual|quais|quem|quando|onde|aonde|quanto|quantos|quantas)\b)/gi)) boundaries.add(match.index + match[0].length);
  const starts = [...boundaries].sort((a, b) => a - b);
  const parts = starts.map((start, i) => text.slice(start, starts[i + 1] ?? text.length).replace(/\s+(?:e|ou)\s*$/i, '').trim()).filter(Boolean);
  return {parts: parts.length ? parts : [text], count: Math.max(1, parts.length), explicit: false};
}

function normalizedPart(part, index) {
  return {...part, id: String(index + 1), title: clean(part?.title || 'Resposta'), question: clean(part?.question),
    natural_answer: prose(part?.natural_answer), literal_smooth: prose(part?.literal_smooth),
    highlights: Array.isArray(part?.highlights) ? part.highlights.filter(item => item && typeof item.literal_text === 'string').map(item => (typeof item.source_id === 'string' ? {source_id: item.source_id, literal_text: clean(item.literal_text)} :
      {paragraph_number: Number(item.paragraph_number), literal_text: clean(item.literal_text)})) : [],
    hexKey: 'a', partIndex: 0};
}

/** Colors describe authored questions, never the count/order of paragraphs. */
export function validateQuestionParts(modelParts, questionText) {
  if (!Array.isArray(modelParts) || !modelParts.length || modelParts.some(part => !part || typeof part !== 'object' || Array.isArray(part))) throw new Error('A resposta do destaque veio incompleta. Tente novamente.');
  const parts = modelParts.slice(0, 12).map(normalizedPart);
  const analysis = analyzeQuestion(questionText);
  const text = canonical(questionText).toLocaleLowerCase('pt-BR'), masked = structuralText(text);
  const candidates = parts.map(part => {
    const fragment = clause(part.question).toLocaleLowerCase('pt-BR');
    const start = fragment ? text.indexOf(fragment) : -1;
    if (start < 0 || text.indexOf(fragment, start + 1) !== -1) return null;
    const authoredIndex = analysis.parts.findIndex(authored => clause(authored).toLocaleLowerCase('pt-BR') === fragment);
    if (analysis.explicit && authoredIndex >= 0) return {start, end: start + fragment.length, index: authoredIndex};
    const shape = structuralText(fragment);
    if (!questionWord.test(shape)) return null;
    const interrogative = questionWord.exec(shape);
    if (!questionWord.test(masked.slice(start, start + fragment.length))) return null;
    // A later part needs a real clause boundary, not an embedded 'que/como'.
    if (start > 0 && interrogative.index === 0) {
      const before = masked.slice(0, start).trimEnd();
      if (questionWord.test(before) && !/(?:[?,;]|\b(?:e|ou))$/i.test(before)) return null;
    }
    return {start, end: start + fragment.length, index: authoredIndex};
  });
  const unique = [...new Map(candidates.filter(Boolean).map(item => [`${item.start}:${item.end}`, item])).values()].sort((a, b) => a.start - b.start);
  const disjoint = unique.every((item, i) => !i || unique[i - 1].end <= item.start);
  const complete = candidates.every(Boolean);
  // Fragments must cover whole authored clauses. Arbitrary word groups such
  // as 'Que qualidades' + 'como bondade, paciência e amor' omit the predicate
  // and cannot turn a list of examples into two independent questions.
  const onlyJoiner = gap => !structuralText(gap).replace(/\b(?:e|ou)\b/gi, '').replace(/\([a-z]\)/gi, '').match(/[\p{L}\p{N}]/u);
  const covered = unique.length && unique.every((item, i) => !i || onlyJoiner(text.slice(unique[i - 1].end, item.start))) && onlyJoiner(text.slice(unique.at(-1).end));
  if (complete && covered && disjoint && unique.length > 1 && unique.length <= 3) {
    candidates.forEach((candidate, i) => {
      const partIndex = unique.findIndex(item => item.start === candidate.start && item.end === candidate.end);
      parts[i].partIndex = partIndex; parts[i].hexKey = 'abc'[partIndex]; parts[i].id = String(partIndex + 1);
      if (!modelParts[i].title) parts[i].title = `Parte ${'ABC'[partIndex]}`;
    });
    return {parts, questionCount: unique.length};
  }
  // No reliable distinction: keep every source selection in the same color.
  // Natural answers are preserved rather than rewritten to manufacture parts.
  return {parts, questionCount: 1};
}

const nameWords = value => ' ' + (value.normalize('NFC').match(/[\p{L}\p{M}'’-]+/gu) || []).join(' ') + ' ';

function delimitedAccount(text, name) {
  // Some accounts have explicit editorial boundaries: an invitation naming
  // the subject, then the subject's closing testimony before a general lesson.
  const invitations = [...text.matchAll(/(?:^|[.!?]\s+)((?:Veja(?:mos)?|Considere(?:mos)?|Conheça(?:mos)?|Observe(?:mos)?)\s+[^.!?]+[.!?])/giu)]
    .filter(match => nameWords(match[1]).includes(nameWords(name)));
  if (invitations.length !== 1) return '';
  const opening = invitations[0];
  const start = opening.index + opening[0].indexOf(opening[1]);
  const speech = new RegExp('(?:^|[.!?][”"]?\\s+)' + name + '\\s+[^.!?:“”"]{1,80}:\\s*(?:“[^”]+”|"[^"]+")', 'gu');
  const finalSpeech = [...text.matchAll(speech)].at(-1);
  if (!finalSpeech || finalSpeech.index < start) return '';
  const end = finalSpeech.index + finalSpeech[0].length;
  const tail = text.slice(end).replace(/^[.!?]?\s*/, '');
  if (tail && !/^(?:É\s|Isso\s|Assim[,\s]|Portanto[,\s]|O que\s)/u.test(tail)) return '';
  return text.slice(start, end);
}

function namedAccounts(question, paragraphs) {
  // Only an explicitly named account whose name occurs in exactly one
  // numbered paragraph identifies a source. A quotation there can use pronouns.
  const text = structuralText(question), accounts = new Map();
  const nameAtStart = /^\p{Lu}[\p{L}\p{M}'’-]*(?:\s+(?:(?:d[aeo]s?)\s+)?\p{Lu}[\p{L}\p{M}'’-]*)*/u;
  const sources = paragraphs.map(({number, text}) => ({number, text, words: nameWords(text)}));
  for (const intro of text.matchAll(/\b(?:experiências?|histórias?|relatos?)\s+(?:de|d[oa]s?)\s+/giu)) {
    let remainder = text.slice(intro.index + intro[0].length);
    let name;
    while ((name = nameAtStart.exec(remainder)?.[0])) {
      const matches = sources.filter(source => source.words.includes(nameWords(name)));
      if (matches.length !== 1) return [];
      const {number, text: original} = matches[0];
      accounts.set(name, {name, number, passage: delimitedAccount(original, name)});
      remainder = remainder.slice(name.length);
      const joiner = /^(?:\s*,\s*|\s+e\s+)(?:(?:de|d[oa]s?)\s+)?/iu.exec(remainder);
      if (!joiner) break;
      remainder = remainder.slice(joiner[0].length);
    }
  }
  return [...accounts.values()];
}

export function buildSource(idPergunta) {
  const questionElement = document.getElementById(idPergunta);
  const context = buildContext(questionElement);
  if (!context.ready) return null;
  const root = questionElement.closest('main,article');
  const ordered = [...root.querySelectorAll('.pergunta,.paragrafo')].filter(node => !node.closest(PRIVATE));
  const start = ordered.indexOf(questionElement);
  const end = ordered.findIndex((node, i) => i > start && node.matches('.pergunta'));
  const interval = ordered.slice(start + 1, end < 0 ? undefined : end);
  const paragraphs = context.paragraphs.map(source => {
    const element = interval.find(node => node.matches('.paragrafo') && Number(clean(node.firstElementChild?.textContent)) === source.number);
    if (!element) return null;
    if (!element.id) element.id = `${idPergunta}-pg-extra-${source.number}`;
    return {number: source.number, text: source.text, element, id: element.id};
  });
  if (paragraphs.some(paragraph => !paragraph)) return null;
  const boxSources = namedBoxSources(root, context.question);
  if (boxSources.length) restoreBoxMarks(root);
  // A question solely about a sidebar can be answered there. Require article
  // evidence as well when the author explicitly coordinates another source.
  const includesArticle = boxSources.length > 0 && (/\bparágrafos?\s+\d+/iu.test(context.question) ||
    /\be\s+(?:com\s+|n[oa]\s+|d[oa]\s+)?(?:[oa]\s+)?(?:(?:história|experiência|exemplo|relato)\s+do\s+)?quadro\s+[“"‘']/iu.test(context.question));
  return {idPergunta, questionElement, questionText: context.question, paragraphs, boxSources, includesArticle,
    accounts: includesArticle ? namedAccounts(context.question, paragraphs) : []};
}

function indexParagraph(element, numbered = true) {
  const raw = [];
  const first = element.firstElementChild;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches(PRIVATE) || (numbered && node === first && node.matches('span') && /^\s*\d+\s*$/.test(node.textContent))) return NodeFilter.FILTER_REJECT;
        return node.tagName === 'BR' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.ELEMENT_NODE) {raw.push({node: null, offset: 0, char: ' '}); continue;}
    for (let offset = 0; offset < node.nodeValue.length; offset++) raw.push({node, offset, char: node.nodeValue[offset]});
  }
  let text = '', map = [];
  for (const item of raw) {
    if (/[\u200B\uFEFF]/.test(item.char)) continue;
    const char = item.char.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—−]/g, '-');
    if (/\s/.test(char)) {
      if (!text || text.endsWith(' ')) continue;
      text += ' '; map.push(item);
    } else {text += char; map.push(item);}
  }
  if (text.endsWith(' ')) {text = text.slice(0, -1); map.pop();}
  const links = new Map();
  map.forEach((item, i) => {
    if (!item.node) return;
    item.protected = Boolean(item.node.parentElement?.closest(NOTE_PIN));
    const link = item.node.parentElement?.closest('a.bbl');
    if (!link) return;
    const span = links.get(link) || {start: i, end: i + 1};
    span.end = i + 1; links.set(link, span);
  });
  links.forEach(({start, end}) => {
    const before = text.slice(0, start);
    let depth = 0, opening = -1;
    for (let i = 0; i < before.length; i++) {
      if (before[i] === '(') {depth++; opening = i;}
      if (before[i] === ')') depth = Math.max(0, depth - 1);
    }
    const parenthetical = depth > 0;
    const trailingCitation = /-\s*$/.test(before) && /^[\s.,;!?)]*$/.test(text.slice(end));
    if (!parenthetical && !trailingCitation) return;
    for (let i = start; i < end; i++) map[i].protected = true;
    if (parenthetical) {
      const closing = text.indexOf(')', end);
      if (opening >= 0) map[opening].protected = true;
      if (closing >= 0) map[closing].protected = true;
    }
  });
  return {text, map};
}

function ownedMark(mark, ownerId) {
  return mark.dataset.iaOwner === ownerId && mark.dataset.iaMode === 'owned' &&
    (mark.classList.contains('ia-highlight') || mark.classList.contains('ia-highlight-b'));
}
function unwrap(mark) {
  const parent = mark.parentNode;
  mark.replaceWith(...mark.childNodes);
  parent?.normalize();
}
// Dotted recap and colored answers are independent layers. A recap-only mark
// does not reserve the background; every existing colored/manual mark still
// owns its color and must not be replaced by another question.
function hasProtectedColorAncestor(node, ownerId) {
  let parent = node.parentElement;
  while (parent) {
    if (parent.tagName === 'MARK') {
      const recapOnly = parent.classList.contains('ia-underline-recap') &&
        ![...parent.classList].some(name => name.startsWith('hl-color-') || name === 'ia-highlight' || name === 'ia-highlight-b');
      if (!recapOnly && !ownedMark(parent, ownerId)) return true;
    }
    parent = parent.parentElement;
  }
  return false;
}
function canReplaceColor(item, ownerId) {
  if (!item?.node?.parentElement || !/\S/.test(item.char) || (item.protected || item.node.parentElement.closest(PRIVATE))) return false;
  return !hasProtectedColorAncestor(item.node, ownerId);
}

/** Validate first; invalid model text never erases previously saved markings. */
export function applyHighlights(ownerId, parsed, bundle, {reviewed = false} = {}) {
  const classified = validateQuestionParts(parsed?.parts, bundle.questionText);
  const parts = classified.parts;
  const plans = [];
  const boxes = bundle.boxSources || [];
  const accounts = bundle.accounts || [];
  const namedPassages = reviewed ? accounts.filter(account => account.passage) : [];
  const sources = [...bundle.paragraphs, ...boxes];
  let invalid = false;
  parts.forEach((part, partNumber) => part.highlights.forEach(highlight => {
    const paragraph = highlight.source_id ? boxes.find(item => item.source_id === highlight.source_id) :
      bundle.paragraphs.find(item => item.number === highlight.paragraph_number);
    if (!paragraph || !highlight.literal_text) {invalid = true; return;}
    const index = indexParagraph(paragraph.element, !paragraph.source_id);
    const quote = canonical(highlight.literal_text);
    let start = uniqueQuoteStart(index.text, quote, reviewed);
    if (start < 0 || !hasWholeWordBoundaries(index.text, start, start + quote.length)) {invalid = true; return;}
    let end = start + quote.length;
    if (namedPassages.length && paragraph.number) {
      const sameParagraph = accounts.filter(account => account.number === paragraph.number);
      // A generalization in a different paragraph cannot replace either story.
      if (!sameParagraph.length && classified.questionCount === 1 &&
          !/(?:\bparágrafos?\s+|§+\s*)\d+/iu.test(bundle.questionText)) return;
      if (sameParagraph.length === 1 && sameParagraph[0].passage) {
        const passage = canonical(sameParagraph[0].passage);
        const opening = uniqueQuoteStart(index.text, passage, false);
        if (opening < 0) {invalid = true; return;}
        if (end <= opening || start >= opening + passage.length) return;
        start = opening; end = opening + passage.length;
      }
    }
    const excerpt = index.map.slice(start, end);
    const needsPaint = excerpt.some(item => canReplaceColor(item, ownerId));
    if (!needsPaint) {
      // A reviewed quotation may already be entirely highlighted by the reader.
      // Its color does not provide evidence; it only governs who can paint it.
      const alreadyMarked = reviewed && excerpt.every(item => {
        if (!/\S/.test(item.char)) return true;
        const mark = item.node?.parentElement?.closest('mark[data-hl-id][class*="hl-color-"]');
        return !item.protected && mark && !mark.dataset.iaOwner;
      });
      if (!alreadyMarked) {invalid = true; return;}
    }
    // Keep the original punctuation for the reader after matching typography.
    const text = clean(excerpt.map(item => item.char).join(''));
    plans.push({paragraph, start, end, partNumber, highlight: {...highlight, literal_text: text}, color: COLORS[part.partIndex], needsPaint});
  }));
  // When the author explicitly asks about the sidebar as well, accepting the
  // numbered text alone would silently omit one of the requested accounts.
  const requiredBoxes = [...new Set(boxes.map(source => source.title))];
  const incomplete = boxes.length && ((bundle.includesArticle && !plans.some(plan => !plan.paragraph.source_id)) ||
    accounts.some(account => !plans.some(plan => plan.paragraph.number === account.number)) ||
    requiredBoxes.some(title => !plans.some(plan => plan.paragraph.title === title)));
  if (invalid || !plans.length || incomplete) return {...parsed, parts, questionCount: classified.questionCount, appliedCount: 0,
    highlightWarning: 'Não foi possível confirmar todos os trechos exatos. Os destaques anteriores foram mantidos.'};

  // Deduplicate or reject overlaps before splitting text nodes. The same source
  // words are never nested under multiple colors or expanded by fuzzy matching.
  const selected = [];
  plans.sort((a, b) => parts[a.partNumber].partIndex - parts[b.partNumber].partIndex || a.start - b.start || a.end - b.end).forEach(plan => {
    if (selected.some(other => other.paragraph === plan.paragraph && plan.start < other.end && other.start < plan.end)) return;
    selected.push(plan);
  });
  const touched = new Set();
  const createdMarks = [];
  ensureHighlightPaint();
  sources.forEach(paragraph => {
    paragraph.element.querySelectorAll('mark').forEach(mark => {
      if (!ownedMark(mark, ownerId)) return;
      cancelSweep(mark);
      if (mark.classList.contains('ia-underline-recap')) {
        // Older saved markup combined both effects in one element. Keep its
        // dotted layer, whose original recap ownership cannot be recovered.
        [...mark.classList].filter(name => name.startsWith('hl-color-') || name === 'ia-highlight' || name === 'ia-highlight-b')
          .forEach(name => mark.classList.remove(name));
        ['iaOwner', 'iaGroup', 'iaPart', 'iaMode'].forEach(key => { delete mark.dataset[key]; });
      } else unwrap(mark);
      touched.add(paragraph);
    });
  });
  const nodePlans = new Map();
  const applied = new Set(selected.filter(plan => !plan.needsPaint));
  selected.forEach((plan, selection) => {
    if (!plan.needsPaint) return;
    const index = indexParagraph(plan.paragraph.element, !plan.paragraph.source_id);
    let segment = null;
    const group = `${ownerId}-${parts[plan.partNumber].hexKey}-${selection}-${Date.now().toString(36)}`;
    const flush = () => {
      if (!segment) return;
      if (!nodePlans.has(segment.node)) nodePlans.set(segment.node, []);
      nodePlans.get(segment.node).push({...segment, plan, group}); segment = null;
    };
    for (let offset = plan.start; offset < plan.end; offset++) {
      const item = index.map[offset];
      if (!item || !item.node || item.protected || item.node.parentElement?.closest(PRIVATE) || hasProtectedColorAncestor(item.node, ownerId)) {flush(); continue;}
      if (segment && (segment.node !== item.node || segment.end !== item.offset)) flush();
      if (!segment) segment = {node: item.node, start: item.offset, end: item.offset + 1};
      else segment.end = item.offset + 1;
    }
    flush();
  });
  for (const [node, ranges] of nodePlans) {
    ranges.sort((a, b) => b.start - a.start).forEach(range => {
      const original = node.nodeValue.slice(range.start, range.end);
      const leading = original.match(/^\s*/)[0].length, trailing = original.match(/\s*$/)[0].length;
      const start = range.start + leading, end = range.end - trailing;
      if (start >= end) return;
      if (end < node.nodeValue.length) node.splitText(end);
      const selectedNode = start ? node.splitText(start) : node;
      const mark = document.createElement('mark');
      mark.className = `hl-color-${range.plan.color} ${range.plan.color === 'yellow' ? 'ia-highlight' : 'ia-highlight-b'}`;
      Object.assign(mark.dataset, {hlId: range.group, iaOwner: ownerId, iaGroup: range.group, iaPart: parts[range.plan.partNumber].hexKey, iaMode: 'owned'});
      selectedNode.replaceWith(mark); mark.append(selectedNode);
      createdMarks.push(mark);
      touched.add(range.plan.paragraph); applied.add(range.plan);
    });
  }
  touched.forEach(paragraph => {
    if (paragraph.source_id) saveBoxMarks(paragraph.element);
    else window.CacheAnotacao?.salvar(paragraph.id, paragraph.element.innerHTML);
  });
  revealHighlights(createdMarks);
  const resultParts = parts.map((part, i) => ({...part, highlights: selected.filter(plan => plan.partNumber === i && applied.has(plan)).map(plan => ({...plan.highlight, appliedParagraph: plan.paragraph.number, appliedMode: 'exact'}))}));
  return {...parsed, parts: resultParts, questionCount: classified.questionCount, appliedCount: applied.size,
    highlightWarning: ''};
}
