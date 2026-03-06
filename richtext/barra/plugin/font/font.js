// font.js - Plugin para ajustar tamanho de fonte usando formatBlock nativo

class FontPlugin {
  constructor() {
    this.name = 'font';
    this.slotId = 4;
    
    this.editor = null;
    this.fontBtn = null;
    this.dropdown = null;
    this._retryMs = 100;
    
    // Mapeamento para formatBlock
    this.fontSizes = {
      'h1': { label: 'Título', tag: 'h1' },
      'h2': { label: 'SubTítulo', tag: 'h2' },
      'h3': { label: 'Seção', tag: 'h3' },
      'normal': { label: 'Normal', tag: 'div' }
    };
    
    this.currentSize = 'normal';
    this.autoRegister();
  }

  // === Registro na Barra de Ferramentas ===
  autoRegister() {
    this.waitForDependency('toolbar', () => this.register());
  }

  waitForDependency(dependency, callback) {
    const check = () => {
      if (window[dependency]) {
        callback();
      } else {
        setTimeout(check, this._retryMs);
      }
    };
    check();
  }

  register() {
    const pluginHTML = `
      <div class="font-plugin">
        <button class="font-btn" id="font-plugin-btn" title="Tamanho da Fonte" aria-label="Ajustar Tamanho da Fonte">
          <span class="font-label">Aa</span>
          <svg class="font-arrow" viewBox="0 0 24 24" width="10" height="10">
            <path d="M7 10l5 5 5-5z" fill="currentColor"/>
          </svg>
        </button>
        <div class="font-dropdown" id="font-dropdown">
          <button class="font-option" data-size="h1">
            <span class="font-preview h1">Título</span>
          </button>
          <button class="font-option" data-size="h2">
            <span class="font-preview h2">SubTítulo</span>
          </button>
          <button class="font-option" data-size="h3">
            <span class="font-preview h3">Seção</span>
          </button>
          <button class="font-option" data-size="normal">
            <span class="font-preview normal">Normal</span>
          </button>
        </div>
      </div>
    `;

    const success = window.toolbar.registerPlugin(this.name, this.slotId, this, pluginHTML);
    if (!success) {
      setTimeout(() => this.register(), this._retryMs);
      return;
    }

    this.fontBtn = document.getElementById('font-plugin-btn');
    this.dropdown = document.getElementById('font-dropdown');
    
    // Event listeners
    this.fontBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleDropdown();
    });
    
    // Opções do dropdown
    const options = this.dropdown.querySelectorAll('.font-option');
    options.forEach(option => {
      option.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const size = option.getAttribute('data-size');
        this.applyFontSize(size);
        this.closeDropdown();
      });
    });
    
    // Fechar dropdown ao clicar fora
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.font-plugin')) {
        this.closeDropdown();
      }
    });

    this.waitForDependency('editor', () => this.connectToEditor());
  }

  // === Conexão com o Editor ===
  connectToEditor() {
    this.editor = window.editor;
    const editorEl = this.editor.editorElement;

    // Listeners para atualizar o estado
    document.addEventListener('selectionchange', () => this.updateButtonState());
    editorEl.addEventListener('focus', () => this.updateButtonState(), true);
    editorEl.addEventListener('click', () => this.updateButtonState());
    editorEl.addEventListener('keyup', () => this.updateButtonState());
    editorEl.addEventListener('keydown', (e) => this.handleEnterInHeading(e), true);

    this.updateButtonState();
    console.log('🔗 Plugin de Font conectado (modo nativo)');
  }

  // === Lógica do Dropdown ===
  toggleDropdown() {
    const isOpen = this.dropdown.classList.contains('open');
    if (isOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  openDropdown() {
    this.dropdown.classList.add('open');
    this.fontBtn.classList.add('active');
    this.updateDropdownSelection();
  }

  closeDropdown() {
    this.dropdown.classList.remove('open');
    this.fontBtn.classList.remove('active');
  }

  updateDropdownSelection() {
    const options = this.dropdown.querySelectorAll('.font-option');
    options.forEach(option => {
      const size = option.getAttribute('data-size');
      if (size === this.currentSize) {
        option.classList.add('selected');
      } else {
        option.classList.remove('selected');
      }
    });
  }

  // === SIMPLIFICADO: Usa formatBlock nativo ===
  applyFontSize(size) {
    // BLOQUEIO: Não executa se estiver dentro de um toggle
    if (this.isInsideToggle()) {
      console.log('🚫 Font bloqueado dentro de toggle');
      return;
    }

    const tag = this.fontSizes[size].tag;
    const targetBlock = this.getTargetBlock();

    if (!targetBlock) {
      console.warn('⚠️ Nenhum bloco disponível para aplicar fonte');
      return;
    }

    // Se o bloco estiver vazio (caso principal reportado), aplica direto no bloco atual.
    // Isso evita perder a formatação quando o botão do dropdown rouba o foco.
    const isEmptyBlock = !targetBlock.textContent.trim();
    const shouldApplyDirectly = isEmptyBlock || !this.isSelectionInsideEditor();

    if (shouldApplyDirectly) {
      const updatedBlock = this.replaceBlockTag(targetBlock, tag, size);
      this.editor.currentTextBlock = updatedBlock;
      this.editor.focusAtEnd(updatedBlock);
    } else {
      // Usa o comando nativo para casos com seleção ativa de texto
      document.execCommand('formatBlock', false, tag);

      const currentBlock = this.getCurrentBlock();
      if (currentBlock) {
        this.applyBlockClass(currentBlock, size);
      }
    }
    
    this.currentSize = size;
    this.updateButtonLabel();
    
    // Mantém o foco
    this.editor.focus();
    
    // Atualiza estatísticas
    if (this.editor.updateStats) {
      this.editor.updateStats();
    }
  }

  getTargetBlock() {
    const currentBlock = this.getCurrentBlock();
    if (currentBlock) return currentBlock;

    if (this.editor?.currentTextBlock) return this.editor.currentTextBlock;
    return this.editor?.editorElement?.querySelector('.text-block, h1, h2, h3') || null;
  }

  isSelectionInsideEditor() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;

    const editorElement = this.editor?.editorElement;
    if (!editorElement) return false;

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    return editorElement.contains(container);
  }

  replaceBlockTag(block, targetTag, size) {
    const currentTag = block.tagName?.toLowerCase() || 'div';

    if (currentTag === targetTag) {
      this.applyBlockClass(block, size);
      return block;
    }

    const replacement = document.createElement(targetTag);
    replacement.innerHTML = block.innerHTML;

    // Preserva atributos importantes
    Array.from(block.attributes).forEach(attr => {
      if (attr.name !== 'class') {
        replacement.setAttribute(attr.name, attr.value);
      }
    });

    replacement.contentEditable = 'true';
    this.applyBlockClass(replacement, size);

    block.replaceWith(replacement);
    return replacement;
  }

  applyBlockClass(block, size) {
    block.classList.remove('font-h1', 'font-h2', 'font-h3');
    block.classList.add('text-block');

    if (size !== 'normal') {
      block.classList.add(`font-${size}`);
    }
  }

  handleEnterInHeading(e) {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }

    const block = this.getCurrentBlock();
    if (!block || !block.tagName?.match(/^H[1-3]$/i)) {
      return;
    }

    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    if (!block.contains(range.startContainer)) return;

    e.preventDefault();

    const afterRange = range.cloneRange();
    afterRange.selectNodeContents(block);
    afterRange.setStart(range.endContainer, range.endOffset);

    const afterFragment = afterRange.extractContents();
    const nextBlock = document.createElement('div');
    nextBlock.className = 'text-block';
    nextBlock.contentEditable = 'true';
    nextBlock.setAttribute('spellcheck', 'true');
    nextBlock.setAttribute('autocapitalize', 'sentences');
    nextBlock.setAttribute('autocorrect', 'on');

    if (afterFragment.childNodes.length > 0) {
      nextBlock.appendChild(afterFragment);
    }

    block.after(nextBlock);

    this.editor.currentTextBlock = nextBlock;
    this.currentSize = 'normal';
    this.updateButtonLabel();
    this.updateDropdownSelection();

    this.placeCursorAtStart(nextBlock);
  }

  placeCursorAtStart(element) {
    const range = document.createRange();
    const selection = window.getSelection();

    if (element.firstChild) {
      range.setStart(element.firstChild, 0);
    } else {
      range.setStart(element, 0);
    }
    range.collapse(true);

    selection.removeAllRanges();
    selection.addRange(range);
    element.focus();
  }

  // === Utilitários ===
  getCurrentBlock() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;
    
    let node = selection.getRangeAt(0).commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }
    
    // Procura por heading ou text-block
    while (node && node !== this.editor.editorElement) {
      if (node.tagName?.match(/^H[1-3]$/i) || node.classList?.contains('text-block')) {
        return node;
      }
      node = node.parentElement;
    }
    
    return null;
  }

  updateButtonState() {
    // BLOQUEIO: Desabilita se estiver dentro de toggle
    if (this.isInsideToggle()) {
      this.fontBtn.classList.add('blocked');
      this.fontBtn.setAttribute('disabled', 'true');
      this.currentSize = 'normal';
      this.updateButtonLabel();
      return;
    } else {
      this.fontBtn.classList.remove('blocked');
      this.fontBtn.removeAttribute('disabled');
    }
    
    // Detecta o tamanho atual baseado na tag
    const block = this.getCurrentBlock();
    if (block) {
      const tagName = block.tagName?.toLowerCase();
      
      let detectedSize = 'normal';
      if (tagName === 'h1') detectedSize = 'h1';
      else if (tagName === 'h2') detectedSize = 'h2';
      else if (tagName === 'h3') detectedSize = 'h3';
      
      this.currentSize = detectedSize;
    } else {
      this.currentSize = 'normal';
    }
    
    this.updateButtonLabel();
    this.updateDropdownSelection();
  }

  updateButtonLabel() {
    const label = this.fontBtn.querySelector('.font-label');
    if (!label) return;
    
    switch(this.currentSize) {
      case 'h1':
        label.textContent = 'T1';
        break;
      case 'h2':
        label.textContent = 'T2';
        break;
      case 'h3':
        label.textContent = 'T3';
        break;
      default:
        label.textContent = 'Aa';
    }
  }

  isInsideToggle() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;
    
    const range = selection.getRangeAt(0);
    let node = range.commonAncestorContainer;
    
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }
    
    while (node && node !== document.body) {
      if (node.classList && node.classList.contains('toggle')) {
        return true;
      }
      node = node.parentElement;
    }
    
    return false;
  }

  destroy() {
    this.closeDropdown();
  }
}

// Auto-inicialização
const fontPlugin = new FontPlugin();
