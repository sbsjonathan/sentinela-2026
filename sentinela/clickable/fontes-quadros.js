// Only editorial sidebar prose may be used as evidence. IDs describe a block
// in this edition, independently of which question asked about it.
import {PRIVATE_CONTENT, sourceText} from './agente-modal/agente-contexto.js';
const titleKey = value => value.trim().replace(/\s+/g, ' ').normalize('NFC').toLocaleLowerCase('pt-BR');
const restored = new WeakMap();

function boxesIn(root) {
  const boxes = [...root.querySelectorAll('.quadro1')].filter(box => !box.closest(PRIVATE_CONTENT));
  return boxes.map((box, i) => {
    const heading = box.querySelector(':scope > .quadro1-titulo');
    const body = box.querySelector(':scope > .quadro1-corpo');
    const title = heading ? sourceText(heading) : '';
    const blocks = title && body ? [...body.querySelectorAll('p,li')].filter(el =>
      !el.closest(PRIVATE_CONTENT) && !el.querySelector('p,li') && el.closest('.quadro1') === box) : [];
    return {title, blocks: blocks.map((element, j) => ({element, title, source_id: `quadro-${i + 1}-${j + 1}`}))};
  });
}

function citedTitles(question) {
  return [...question.matchAll(/\bquadro\s+[“"‘']\s*([^”"’']+?)\s*[”"’']/giu)].map(match => titleKey(match[1]));
}

function citedBlocks(root, titles) {
  if (!titles.size) return [];
  const boxes = boxesIn(root);
  return [...titles].flatMap(title => {
    const matches = boxes.filter(box => titleKey(box.title) === title);
    return matches.length === 1 ? matches[0].blocks : [];
  });
}

export function namedBoxSources(root, question) {
  return citedBlocks(root, new Set(citedTitles(question)))
    .map(block => ({...block, text: sourceText(block.element)})).filter(block => block.text);
}

// Persist mark ranges only. Keep the article's original elements and handlers,
// and never replay a stored markup string as source text on this device.
function textNodes(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) if (!node.parentElement.closest(PRIVATE_CONTENT)) nodes.push(node);
  return nodes;
}

export function saveBoxMarks(element) {
  if (!element.dataset.iaBoxKey || !window.CacheAnotacao) return;
  let text = '';
  const marks = [];
  for (const node of textNodes(element)) {
    const start = text.length;
    text += node.data;
    const mark = node.parentElement.closest('mark[data-hl-id]');
    const color = mark && [...mark.classList].find(name => /^hl-color-(yellow|green|blue|purple|pink|orange)$/.test(name));
    if (!color || !element.contains(mark)) continue;
    marks.push({start, end: text.length, color, id: mark.dataset.hlId, owner: mark.dataset.iaOwner, part: mark.dataset.iaPart});
  }
  const raw = JSON.stringify({title: element.dataset.iaBoxTitle, text, marks});
  window.CacheAnotacao.salvar(element.dataset.iaBoxKey, raw);
  restored.set(element, raw);
}

function restoreBlock(block, study) {
  const el = block.element;
  const key = `p-${study}-${block.source_id}`;
  el.dataset.iaBoxKey = key;
  el.dataset.iaBoxTitle = block.title;
  const raw = window.CacheAnotacao?.carregar?.(key) || '';
  if ((restored.get(el) || '') === raw) return;
  let saved;
  if (raw) {
    try { saved = JSON.parse(raw); } catch (_) { return; }
    if (saved?.title !== block.title || !Array.isArray(saved.marks) ||
        textNodes(el).map(node => node.data).join('') !== saved.text) return;
    let previousEnd = 0;
    for (const m of saved.marks) {
      if (!m || !Number.isInteger(m.start) || !Number.isInteger(m.end) || m.start < previousEnd || m.end <= m.start ||
          m.end > saved.text.length || !/^hl-color-(yellow|green|blue|purple|pink|orange)$/.test(m.color) ||
          typeof m.id !== 'string' || !/^[\w ,–—-]+$/u.test(m.id) ||
          (m.owner && (typeof m.owner !== 'string' || !/^[\w ,–—-]+$/u.test(m.owner) || !/^[abc]$/.test(m.part)))) return;
      previousEnd = m.end;
    }
  }
  restored.set(el, raw);
  el.querySelectorAll('mark[data-hl-id]').forEach(mark => {
    if (mark.closest(PRIVATE_CONTENT)) return;
    mark.replaceWith(...mark.childNodes);
  });
  el.normalize();
  if (!saved?.marks.length) return;
  let offset = 0;
  for (const node of textNodes(el)) {
    const from = offset;
    offset += node.length;
    // Splitting from the end keeps offsets stable across multiple marks.
    for (const m of saved.marks.filter(m => m.start < offset && m.end > from).reverse()) {
      const start = Math.max(0, m.start - from), end = Math.min(node.length, m.end - from);
      if (end < node.length) node.splitText(end);
      const selected = start ? node.splitText(start) : node;
      const mark = document.createElement('mark');
      mark.className = m.color;
      mark.dataset.hlId = m.id;
      if (m.owner) {
        mark.classList.add(m.part === 'a' ? 'ia-highlight' : 'ia-highlight-b');
        Object.assign(mark.dataset, {iaOwner:m.owner, iaMode:'owned', iaGroup:m.id, iaPart:m.part});
      }
      selected.replaceWith(mark);
      mark.append(selected);
    }
  }
}

export function restoreBoxMarks(root) {
  const study = window.estudoId;
  if (!study || !root) return;
  const titles = new Set();
  for (const question of root.querySelectorAll('.pergunta')) {
    if (!question.closest(PRIVATE_CONTENT)) citedTitles(sourceText(question, true)).forEach(title => titles.add(title));
  }
  for (const block of citedBlocks(root, titles)) restoreBlock(block, study);
}

document.addEventListener('sentinela:save-box-marks', event => saveBoxMarks(event.target));
