(() => {
  'use strict';

  const editor = M1_Config.editor;
  const blockSelector = '.node-paragraph, .node-toggle, .node-text';

  function currentRange() {
    const live = M2_Query.curRange();
    return live && editor.contains(live.commonAncestorContainer) ? live : M1_Config.state.lastR;
  }

  function rememberEnd(editable) {
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    M1_Config.state.lastR = range;
    return range;
  }

  function selectedBlock(range = currentRange()) {
    if (!range || !editor.contains(range.commonAncestorContainer)) return null;
    const container = range.startContainer;
    if (container === editor || container.matches?.('.children')) {
      const selected = container.childNodes[range.startOffset];
      return container === range.endContainer && range.endOffset === range.startOffset + 1 &&
        selected?.matches?.(blockSelector) && !selected.closest('.children[hidden]') ? selected : null;
    }
    const block = M2_Query.closest(container, blockSelector);
    return block?.contains(range.endContainer) && !block.closest('.children[hidden]') ? block : null;
  }

  function canClear() {
    const first = editor.firstElementChild;
    if (!first) return false;
    if (first.nextElementSibling || !first.matches('.node-paragraph') || first.matches('.font-h1, .font-h2, .font-h3')) return true;
    const field = M2_Query.getParC(first);
    return !!field && (field.textContent.replace(/[\u200B\uFEFF]/gu, '').length > 0 ||
      !!field.querySelector('ul, ol, br ~ br') || M4A_Placeholder.hasContent());
  }

  function state(range) {
    const writable = editor.isContentEditable;
    const block = writable && selectedBlock(range);
    return {
      canMoveUp: !!block && !!block.previousElementSibling?.matches(blockSelector),
      canMoveDown: !!block && !!block.nextElementSibling?.matches(blockSelector),
      canExpand: writable && !!editor.querySelector('.node-toggle[data-open="false"]'),
      canCollapse: writable && !!editor.querySelector('.node-toggle[data-open="true"]'),
      canClear: writable && canClear()
    };
  }

  function commitChange() {
    M3_TextModel.syncAll();
    M4A_Placeholder.sync();
    window.M12_History.commit();
    window.cacheRichText?.flush();
    return true;
  }

  function move(direction, range = currentRange()) {
    if (!editor.isContentEditable || !['up', 'down'].includes(direction)) return false;
    const block = selectedBlock(range);
    const sibling = direction === 'up' ? block?.previousElementSibling : block?.nextElementSibling;
    if (!sibling?.matches(blockSelector)) return false;
    const selectedWholeBlock = range.startContainer === block.parentElement;
    window.M12_History.beforeChange();
    // Relocating the sibling leaves ranges inside the selected block attached.
    if (direction === 'up') block.after(sibling);
    else block.before(sibling);
    if (selectedWholeBlock) range.selectNode(block);
    return commitChange();
  }

  function setAllOpen(open) {
    if (!editor.isContentEditable || typeof open !== 'boolean') return false;
    const toggles = editor.querySelectorAll(`.node-toggle[data-open="${!open}"]`);
    if (!toggles.length) return false;
    window.M12_History.beforeChange();
    toggles.forEach(toggle => M6_Tree.setOpen(toggle, open));
    if (!open) {
      // Commands from the menu must not later restore a caret in hidden text.
      const range = currentRange();
      const hidden = M2_Query.closest(range?.startContainer, '.children[hidden]') ||
        M2_Query.closest(range?.endContainer, '.children[hidden]');
      if (hidden && editor.contains(hidden)) {
        const root = M2_Query.rootNode(hidden.closest('.node-toggle'));
        const visible = rememberEnd(M2_Query.getTit(root));
        if (range === M2_Query.curRange()) {
          const selection = window.getSelection();
          const editing = document.activeElement === editor;
          selection.removeAllRanges();
          if (editing) selection.addRange(visible);
        }
      }
    }
    return commitChange();
  }

  function clear() {
    if (!editor.isContentEditable || !canClear()) return false;
    window.M12_History.beforeChange();
    const selection = window.getSelection();
    if (editor.contains(selection?.anchorNode) || editor.contains(selection?.focusNode)) selection.removeAllRanges();
    if (editor.contains(document.activeElement)) document.activeElement.blur();
    const paragraph = M5_Factory.para();
    editor.replaceChildren(paragraph);
    rememberEnd(M2_Query.getParC(paragraph));
    return commitChange();
  }

  window.NotesBlockActions = { state, move, setAllOpen, clear };
})();
