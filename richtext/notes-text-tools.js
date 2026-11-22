// Search is a view of the note. Neither highlighting nor revealing a closed
// branch should create an edit, an undo step or a new cloud revision.
(() => {
  'use strict';
  const { editor, scroll } = M1_Config;
  const highlightName = 'notes-search-current';
  const fold = text => text.normalize('NFD').replace(/[\p{M}\u200B\uFEFF]/gu, '').toLowerCase().replace(/\s/gu, ' ');
  let query = '', matches = [], current = 0, activeRange = null;
  let previewStyle = null, overlay = null;
  const hasHighlight = !!(window.CSS?.highlights && window.Highlight);

  function findMatches(needle) {
    const found = [];
    for (const editable of editor.querySelectorAll('.editable')) {
      // Preserve matches across inline formatting, but not across separate rows
      // in a list, or across a BR where there was no space in the source text.
      const walker = document.createTreeWalker(editable, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode: n => n.nodeType === 1 && n.matches('script,style,template,[contenteditable="false"]')
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
      });
      let nodes = [], block = null;
      function collect() {
        if (!nodes.length) return;
        const raw = nodes.map(node => node.data).join('');
        const value = fold(raw);
        let at = value.indexOf(needle);
        if (at >= 0) {
          // Map folded UTF-16 offsets back to actual DOM text, including
          // decomposed accents, emoji and text split by <b> or <span>.
          const offsets = [];
          let rawOffset = 0;
          for (const character of raw) {
            for (let i = 0, count = fold(character).length; i < count; i++) offsets.push(rawOffset);
            rawOffset += character.length;
          }
          offsets.push(raw.length);
          while (at >= 0) {
            found.push({nodes, start: offsets[at], end: offsets[at + needle.length]});
            at = value.indexOf(needle, at + needle.length);
          }
        }
        nodes = [];
      }
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeType === 1) {
          if (node.matches('br,hr')) collect();
          continue;
        }
        const parentBlock = node.parentElement.closest('li,div,p,blockquote,h1,h2,h3,h4,h5,h6,td,th,pre');
        if (parentBlock !== block) { collect(); block = parentBlock; }
        nodes.push(node);
      }
      collect();
    }
    return found;
  }

  function matchRange(match) {
    const range = document.createRange();
    let pos = 0;
    for (const node of match.nodes) {
      const next = pos + node.length;
      if (match.start >= pos && match.start < next) range.setStart(node, match.start - pos);
      if (match.end > pos && match.end <= next) {
        range.setEnd(node, match.end - pos);
        break;
      }
      pos = next;
    }
    return range;
  }

  function revealBranch(field) {
    // Apply a view-only override outside #editor; hidden/data-open are part of
    // the existing note format and must retain the user's saved state.
    const path = [];
    let node = field;
    while (node && node !== editor) {
      const parent = node.parentElement;
      path.unshift({index: Array.prototype.indexOf.call(parent.children, node) + 1, hidden: node.matches('.children[hidden]')});
      node = parent;
    }
    let selector = '#editor', rules = '';
    for (const step of path) {
      if (step.hidden) {
        rules += selector + ' > .children[hidden]{display:block!important}';
        rules += selector + ' > .row > .toggle-arrow .triangle{transform:rotate(90deg)}';
      }
      selector += ' > :nth-child(' + step.index + ')';
    }
    if (rules && !previewStyle) {
      previewStyle = document.createElement('style');
      document.head.append(previewStyle);
    }
    if (previewStyle) previewStyle.textContent = rules;
  }

  // Older WebKit builds lack CSS Custom Highlight. Paint the range outside
  // contenteditable in that case, keeping clipboard and serialized HTML clean.
  function drawOverlay() {
    if (!overlay || !activeRange) return;
    const clip = scroll.getBoundingClientRect();
    overlay.replaceChildren();
    for (const rect of activeRange.getClientRects()) {
      const top = Math.max(rect.top, clip.top), bottom = Math.min(rect.bottom, clip.bottom);
      const left = Math.max(rect.left, clip.left), right = Math.min(rect.right, clip.right);
      if (bottom <= top || right <= left) continue;
      const mark = document.createElement('span');
      Object.assign(mark.style, {
        position: 'fixed', top: top + 'px', left: left + 'px', width: (right-left) + 'px',
        height: (bottom-top) + 'px', background: 'rgba(255, 183, 38, .46)', borderRadius: '2px',
        pointerEvents: 'none', zIndex: '1'
      });
      overlay.append(mark);
    }
  }

  function clearPaint() {
    if (hasHighlight) CSS.highlights.delete(highlightName);
    activeRange = null;
    previewStyle?.remove(); previewStyle = null;
    overlay?.remove(); overlay = null;
    scroll.removeEventListener('scroll', drawOverlay);
    window.removeEventListener('resize', drawOverlay);
    window.visualViewport?.removeEventListener('resize', drawOverlay);
  }

  function paint(move) {
    if (!matches.length) { clearPaint(); return; }
    activeRange = matchRange(matches[current]);
    revealBranch(activeRange.startContainer.parentElement);
    if (move) {
      const rect = activeRange.getBoundingClientRect();
      const viewport = scroll.getBoundingClientRect();
      const panel = document.getElementById('notes-tools');
      const controlsHeight = panel?.classList.contains('is-searching') ? panel.offsetHeight : 0;
      const top = Math.max(viewport.top, window.visualViewport?.offsetTop || 0) + controlsHeight;
      const bottom = Math.min(viewport.bottom, window.visualViewport ? visualViewport.offsetTop + visualViewport.height : innerHeight);
      scroll.scrollTop += rect.top - top - Math.max(0, (bottom - top - rect.height) * 0.5);
    }
    if (hasHighlight) {
      CSS.highlights.set(highlightName, new Highlight(activeRange));
    } else {
      if (!overlay) {
        overlay = document.createElement('div'); overlay.setAttribute('aria-hidden', 'true');
        document.body.append(overlay);
        scroll.addEventListener('scroll', drawOverlay, {passive: true});
        window.addEventListener('resize', drawOverlay);
        window.visualViewport?.addEventListener('resize', drawOverlay);
      }
      drawOverlay();
    }
  }

  function result() { return {index: matches.length ? current + 1 : 0, total: matches.length}; }
  const observer = new MutationObserver(() => {
    if (!query) return;
    matches = findMatches(query);
    current = Math.max(0, Math.min(current, matches.length - 1));
    paint(false);
    editor.dispatchEvent(new CustomEvent('notes:search-results', {bubbles: true, detail: result()}));
  });

  function clearSearch() {
    observer.disconnect();
    query = ''; matches = []; current = 0;
    clearPaint();
  }

  function search(text, step = 0) {
    const next = fold(String(text || '').trim());
    if (!next) { clearSearch(); return result(); }
    if (next !== query || observer.takeRecords().length) {
      matches = findMatches(next);
      current = next !== query ? 0 : Math.max(0, Math.min(current, matches.length - 1));
      query = next;
      observer.observe(editor, {subtree: true, childList: true, characterData: true});
    }
    if (matches.length && step) current = (current + Math.sign(step) + matches.length) % matches.length;
    paint(true);
    return result();
  }

  function pasteTarget(range) {
    if (!editor.isContentEditable) return null;
    if (!range) {
      const first = M2_Query.visibles()[0];
      if (!first) return null;
      range = document.createRange();
      range.selectNodeContents(first); range.collapse(false);
    }
    if (!editor.contains(range.commonAncestorContainer)) return null;
    // A Range can silently retarget itself to the editor root on a remote
    // restore while iOS is asking permission to read the clipboard.
    const start = range.startContainer, end = range.endContainer;
    const startOffset = range.startOffset, endOffset = range.endOffset, text = range.toString();
    const copy = range.cloneRange();
    const field = M2_Query.closest(start, '.editable');
    return {
      range: copy,
      cancel() { this.cancelled = true; },
      valid() {
        return !this.cancelled && editor.isContentEditable && (!field || field.getClientRects().length > 0)
          && editor.contains(start) && editor.contains(end)
          && copy.startContainer === start && copy.endContainer === end && copy.startOffset === startOffset
          && copy.endOffset === endOffset && copy.toString() === text;
      }
    };
  }

  function insertPlain(target, text) {
    if (!target?.valid()) return 'unavailable';
    if (typeof text !== 'string' || !text.length) return 'empty';
    const selection = window.getSelection();
    editor.focus({preventScroll: true});
    selection.removeAllRanges(); selection.addRange(target.range.cloneRange());
    window.M12_History?.beforeChange();
    if (!M10_EditorEvents.insertPlainText(text.replace(/\r\n?/g, '\n'))) return 'unavailable';
    target.cancel();
    M3_TextModel.syncAll();
    editor.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertFromPaste'}));
    window.M12_History?.commit();
    return 'inserted';
  }

  async function paste(target) {
    if (!target?.valid()) return 'unavailable';
    if (!navigator.clipboard?.readText) return 'manual';
    let text;
    try { text = await navigator.clipboard.readText(); }
    catch { return target.valid() ? 'manual' : 'unavailable'; }
    return insertPlain(target, text);
  }

  window.NotesTextTools = {search, clearSearch, pasteTarget, insertPlain, paste};
})();
