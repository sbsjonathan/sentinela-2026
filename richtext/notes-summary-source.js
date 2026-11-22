(() => {
  'use strict';

  const segmenter = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('pt-BR', {granularity: 'grapheme'}) : null;
  const blockSelector = '.node-paragraph,.node-text,.node-toggle';
  const skipSelector = 'script,style,template,button,input,textarea,select,svg,[aria-hidden="true"],.toggle-spacer';

  function characterCount(text) {
    if (/^[\x20-\xff]*$/u.test(text)) return text.length;
    let count = 0;
    for (const _ of segmenter ? segmenter.segment(text) : text) count++;
    return count;
  }

  function read() {
    const lines = [];
    let characters = 0;

    // Read live fields rather than innerText or cached HTML. A collapsed
    // toggle still owns its children, and the latest edit may not be saved.
    function readFlow(nodes, depth = 0, prefix = '', listDepth = depth) {
      let buffer = '';
      let firstLine = true;
      function flush() {
        for (const raw of buffer.split(/\r\n?|\n/u)) {
          const text = raw.replace(/[\u200b\ufeff]/gu, '').replace(/\s+/gu, ' ').trim().normalize('NFC');
          if (!text) continue;
          const indent = depth + (prefix && !firstLine ? 1 : 0);
          lines.push('  '.repeat(indent) + (firstLine ? prefix : '') + text);
          characters += characterCount(text);
          firstLine = false;
        }
        buffer = '';
      }
      function visit(node) {
        if (node.nodeType === Node.TEXT_NODE) { buffer += node.data; return; }
        if (node.nodeType !== Node.ELEMENT_NODE || node.matches(skipSelector)) return;
        if (node.matches(blockSelector)) {
          flush();
          const isToggle = node.classList.contains('node-toggle');
          const heading = node.className.match(/\bfont-h([1-3])\b/u);
          const label = isToggle ? '▸ ' : heading ? '#'.repeat(Number(heading[1])) + ' ' : '';
          const field = M2_Query.getEdFor(node);
          if (field) readFlow(field.childNodes, depth, label);
          const children = isToggle && M2_Query.getChil(node);
          if (children) readFlow(children.childNodes, depth + 1);
        } else if (node.tagName === 'DETAILS') {
          flush();
          const title = node.querySelector(':scope > summary');
          if (title) readFlow(title.childNodes, depth, '▸ ');
          readFlow([...node.childNodes].filter(child => child !== title), depth + 1);
        } else if (node.matches('ol,ul')) {
          flush();
          const ordered = node.tagName === 'OL';
          const step = node.reversed ? -1 : 1;
          let number = node.hasAttribute('start') ? node.start : step < 0 ? node.querySelectorAll(':scope > li').length : 1;
          for (const item of node.childNodes) {
            // Native contenteditable and older HTML can nest a list directly
            // under another list instead of wrapping it in an LI.
            if (item.nodeName !== 'LI') { readFlow([item], listDepth + 1); continue; }
            if (item.hasAttribute('value')) number = item.value;
            readFlow(item.childNodes, listDepth, ordered ? number + '. ' : '- ', listDepth + 1);
            number += step;
          }
        } else if (node.matches('br,hr')) {
          flush();
        } else if (node.matches('h1,h2,h3,h4,h5,h6')) {
          flush();
          readFlow(node.childNodes, depth, '#'.repeat(Number(node.tagName[1])) + ' ');
        } else {
          const block = node.matches('div,p,blockquote,pre,li,tr,th,td,section,article,dt,dd');
          if (block) flush();
          for (const child of node.childNodes) visit(child);
          if (block) flush();
        }
      }
      for (const child of nodes) visit(child);
      flush();
    }

    const editor = document.getElementById('editor');
    if (editor) readFlow(editor.childNodes);
    return {outline: lines.join('\n'), characters};
  }

  window.NotesSummarySource = {read};
})();
