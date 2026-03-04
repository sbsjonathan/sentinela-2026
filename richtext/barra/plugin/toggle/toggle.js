// toggle.js - Plugin Toggle Resiliente (sub-slot direito)

class TogglePlugin {
  constructor() {
    this.name = 'toggle';
    this.slotId = '3-right';
    this.MAX_LEVEL = 3;
    this.editor = null;
    this.toggleBtn = null;
    this._retryMs = 100;
    this.isReadingMode = false; // NOVO: Monitora modo leitura
    this.autoRegister();
  }

  autoRegister() {
    this.waitForDependency('toolbar', () => this.waitForSlotAndRegister());
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

  waitForSlotAndRegister() {
    const slotEl = document.getElementById(`plugin-slot-${this.slotId}`);
    if (slotEl) {
      this.register();
    } else {
      setTimeout(() => this.waitForSlotAndRegister(), this._retryMs);
    }
  }

  register() {
    const pluginHTML = `
      <div class="toggle-plugin">
        <button class="toggle-btn" id="toggle-plugin-btn" title="Bloco de Toggle" aria-label="Inserir Bloco de Toggle">
          <svg class="toggle-icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="4,9 10,12 4,15" fill="currentColor" stroke-width="0"/>
            <line x1="12" y1="12" x2="20" y2="12" fill="none"/>
            <line x1="12" y1="16" x2="17" y2="16" fill="none"/>
          </svg>
        </button>
      </div>
    `;

    const success = window.toolbar.registerPlugin(this.name, this.slotId, this, pluginHTML);
    if (!success) {
      setTimeout(() => this.register(), this._retryMs);
      return;
    }

    this.toggleBtn = document.getElementById('toggle-plugin-btn');
    this.toggleBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.handleToolbarClick();
    });

    this.waitForDependency('editor', () => this.connectToEditor());
  }

  connectToEditor() {
    this.editor = window.editor;
    this.setupEventDelegation();
    this.setupReadingModeListener(); // NOVO
    console.log('🔗 Plugin Toggle Resiliente conectado no sub-slot direito');
  }

  // NOVO: Escuta mudanças do modo leitura
  setupReadingModeListener() {
    // Escuta quando leitor entra em modo leitura
    document.addEventListener('leitor-mode-enter', () => {
      this.isReadingMode = true;
      console.log('🔒 Toggle: Modo leitura ativado, pausando interações');
    });

    // Escuta quando leitor sai do modo leitura
    document.addEventListener('leitor-mode-exit', () => {
      this.isReadingMode = false;
      console.log('🔓 Toggle: Modo leitura desativado, reativando interações');
      // Re-aplica event listeners após mudanças do DOM
      setTimeout(() => this.refreshEventListeners(), 50);
    });
  }

  // NOVO: Re-aplica event listeners após mudanças no DOM
  refreshEventListeners() {
    // Remove listeners antigos
    this.editor.editorElement.removeEventListener('click', this.clickHandler);
    this.editor.editorElement.removeEventListener('mousedown', this.mousedownHandler);
    this.editor.editorElement.removeEventListener('touchstart', this.touchstartHandler);
    
    // Re-aplica setup
    this.setupEventDelegation();
    console.log('🔄 Toggle: Event listeners atualizados');
  }

  handleToolbarClick() {
    // NOVO: Não funciona em modo leitura
    if (this.isReadingMode) {
      console.log('⚠️ Toggle desabilitado durante modo leitura');
      return;
    }

    const activeElement = document.activeElement;
    const currentToggle = activeElement?.closest('.toggle');
    if (currentToggle) {
      this.escapeToggleToText(currentToggle);
    } else {
      const newToggle = this.createToggle(0);
      this.editor.insertElement(newToggle);
    }
  }

  createToggle(level, titleText = '') {
    const wrapper = document.createElement('div');
    wrapper.className = 'toggle';
    wrapper.setAttribute('data-level', level);
    const canAddChild = level < this.MAX_LEVEL;
    wrapper.innerHTML = `
      <div class="toggle-header">
        <div class="arrow-wrapper"><div class="arrow"></div></div>
        <div class="toggle-title" contenteditable="true" data-placeholder="Digite o título..." autocapitalize="sentences">${titleText}</div>
      </div>
      <div class="toggle-content">
        <div class="content-wrapper">
          <div class="content-invisible" contenteditable="true" data-placeholder="Digite aqui seu texto..."></div>
          <button class="add-child-btn"${canAddChild ? '' : ' disabled'}>+</button>
        </div>
      </div>`;
    return wrapper;
  }

  createContentWrapper() {
    const wrapper = document.createElement('div');
    wrapper.className = 'content-wrapper';
    wrapper.innerHTML = `
      <div class="content-invisible" contenteditable="true" data-placeholder="Digite aqui seu texto..."></div>
      <button class="add-child-btn">+</button>
    `;
    return wrapper;
  }

  setupEventDelegation() {
    const editorEl = this.editor.editorElement;

    // NOVO: Armazena referências para poder remover depois
    this.clickHandler = (e) => {
      // NOVO: Não funciona em modo leitura
      if (this.isReadingMode) return;
      
      const arrowWrapper = e.target.closest('.arrow-wrapper');
      if (arrowWrapper) {
        const toggle = arrowWrapper.closest('.toggle');
        this.toggleExpansion(toggle);
      }
    };

    this.mousedownHandler = (e) => {
      // NOVO: Não funciona em modo leitura
      if (this.isReadingMode) return;
      
      if (e.target.classList.contains('add-child-btn')) {
        e.preventDefault();
        e.stopPropagation();
        this.handleAddChild(e.target);
      }
    };

    this.touchstartHandler = (e) => {
      // NOVO: Não funciona em modo leitura
      if (this.isReadingMode) return;
      
      if (e.target.classList.contains('add-child-btn')) {
        e.preventDefault();
        e.stopPropagation();
        this.handleAddChild(e.target);
      }
    };

    editorEl.addEventListener('click', this.clickHandler);
    editorEl.addEventListener('mousedown', this.mousedownHandler, { passive: false });
    editorEl.addEventListener('touchstart', this.touchstartHandler, { passive: false });
    
    editorEl.addEventListener('focusin', (e) => this.handleFocusIn(e));
    editorEl.addEventListener('input', (e) => this.handleInput(e));
    editorEl.addEventListener('blur', (e) => this.handleBlur(e), true);
    editorEl.addEventListener('keydown', (e) => this.handleKeydown(e));
  }

  toggleExpansion(toggle) {
    toggle.querySelector('.arrow').classList.toggle('expanded');
    toggle.querySelector('.toggle-content').classList.toggle('visible');
  }

  handleAddChild(button) {
    const parentToggle = button.closest('.toggle');
    const level = parseInt(parentToggle.getAttribute('data-level'), 10);
    
    if (level >= this.MAX_LEVEL) {
      return;
    }

    const contentWrapper = button.parentElement;
    const contentField = contentWrapper.querySelector('.content-invisible');
    const textContent = contentField.innerText.trim();
    
    if (textContent.includes('\n')) {
      this.showError(contentWrapper);
      return;
    }

    const title = textContent ? this.capitalize(textContent) : '';
    const childToggle = this.createToggle(level + 1, title);
    
    const parentContent = parentToggle.querySelector('.toggle-content');
    parentContent.replaceChildren(childToggle);
    
    const newTitle = childToggle.querySelector('.toggle-title');
    
    if (!newTitle) {
      return;
    }
    
    newTitle.focus();
    
    if (document.activeElement !== newTitle) {
      setTimeout(() => {
        newTitle.focus();
        
        if (title) {
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(newTitle);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        
        if (document.activeElement !== newTitle) {
          this.simulateTouch(newTitle);
        }
      }, 0);
    } else {
      if (title) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(newTitle);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }
  
  simulateTouch(element) {
    try {
      const touchEvent = new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        view: window,
        touches: [new Touch({
          identifier: Date.now(),
          target: element,
          clientX: 0,
          clientY: 0
        })]
      });
      
      element.dispatchEvent(touchEvent);
      element.focus();
    } catch (e) {
      element.click();
      element.focus();
    }
  }

  handleFocusIn(e) {
    // NOVO: Não funciona em modo leitura
    if (this.isReadingMode) return;
    
    document.querySelectorAll('.add-child-btn.visible').forEach(b => b.classList.remove('visible'));
    if (e.target.classList.contains('content-invisible')) {
      const btn = e.target.parentElement.querySelector('.add-child-btn');
      if (btn && !btn.disabled) btn.classList.add('visible');
    }
  }

  handleInput(e) {
    // NOVO: Não funciona em modo leitura
    if (this.isReadingMode) return;
    
    const target = e.target;
    if (target.classList.contains('toggle-title') || target.classList.contains('content-invisible')) {
      this.cleanEmpty(target);
      if (target.classList.contains('toggle-title')) this.autoCapitalize(target);
    }
  }

  handleBlur(e) {
    if (e.target.classList.contains('content-invisible') || e.target.classList.contains('toggle-title')) {
      this.cleanEmpty(e.target);
    }
  }

  handleKeydown(e) {
    // NOVO: Não funciona em modo leitura
    if (this.isReadingMode) return;
    
    const target = e.target;
    const toggle = target.closest('.toggle');
    if (!toggle) return;
    if (target.classList.contains('content-invisible')) this.handleContentKeydown(e, target, toggle);
    else if (target.classList.contains('toggle-title')) this.handleTitleKeydown(e, target, toggle);
  }

  handleContentKeydown(e, target, toggle) {
    const isEmpty = !target.textContent.trim();
    if (e.key === 'Backspace' && isEmpty) {
      e.preventDefault();
      this.focusElement(toggle.querySelector('.toggle-title'));
    } else if (e.key === 'Enter' && isEmpty) {
      e.preventDefault();
      this.exitToggle(toggle);
    }
  }

  handleTitleKeydown(e, title, toggle) {
    if (e.key === 'Backspace' && !title.textContent.trim()) {
      e.preventDefault();
      this.handleTitleBackspace(toggle);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.handleTitleEnter(title, toggle);
    }
  }

  handleTitleBackspace(toggle) {
    const level = parseInt(toggle.getAttribute('data-level'), 10);
    const parent = toggle.parentElement;
    if (level > 0 && parent.classList.contains('toggle-content')) {
      const siblings = parent.querySelectorAll(':scope > .toggle');
      if (siblings.length === 1) {
        const parentToggle = parent.closest('.toggle');
        const newContent = this.createContentWrapper();
        parent.innerHTML = '';
        parent.appendChild(newContent);
        this.focusElement(newContent.querySelector('.content-invisible'));
      } else {
        toggle.remove();
      }
    } else {
      this.removeFocusPrevious(toggle);
    }
  }

  handleTitleEnter(title, toggle) {
    if (title.textContent.trim()) {
      const level = parseInt(toggle.getAttribute('data-level'), 10);
      const sibling = this.createToggle(level);
      toggle.after(sibling);
      this.focusElement(sibling.querySelector('.toggle-title'));
    } else {
      this.handleEmptyTitleEnter(toggle);
    }
  }

  handleEmptyTitleEnter(toggle) {
    const level = parseInt(toggle.getAttribute('data-level'), 10);
    if (level > 0) {
      toggle.setAttribute('data-level', level - 1);
      const parentToggle = toggle.parentElement.closest('.toggle');
      if (parentToggle) {
        parentToggle.after(toggle);
        this.focusElement(toggle.querySelector('.toggle-title'));
      }
    } else {
      this.editor.createTextBlockAfterElement(toggle);
      toggle.remove();
      this.editor.updatePlaceholder();
    }
  }

  escapeToggleToText(currentToggle) {
    let rootToggle = currentToggle;
    while (rootToggle && parseInt(rootToggle.getAttribute('data-level'), 10) > 0) {
      rootToggle = rootToggle.parentElement.closest('.toggle');
    }
    const next = rootToggle.nextElementSibling;
    if (next?.classList.contains('text-block')) this.focusElement(next);
    else this.editor.createTextBlockAfterElement(rootToggle);
  }

  exitToggle(toggle) {
    const next = toggle.nextElementSibling;
    if (next?.classList.contains('text-block')) this.focusElement(next);
    else this.editor.createTextBlockAfterElement(toggle);
  }

  removeFocusPrevious(toggle) {
    const prev = toggle.previousElementSibling;
    toggle.remove();
    if (prev) {
      if (prev.classList.contains('toggle')) this.focusElement(prev.querySelector('.toggle-title'));
      else if (prev.classList.contains('text-block')) this.focusElement(prev);
    } else {
      const newBlock = this.editor.createTextBlock();
      this.editor.editorElement.appendChild(newBlock);
      this.editor.currentTextBlock = newBlock;
      this.focusElement(newBlock);
    }
    this.editor.updatePlaceholder();
  }

  focusElement(element) {
    if (!element) return;
    
    setTimeout(() => {
      element.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(element);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }, 0);
  }

  cleanEmpty(el) {
    const text = el.innerText.replace(/\uFEFF/g, '').trim();
    if (!text) el.innerHTML = '';
  }

  capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
  }

  autoCapitalize(element) {
    const text = element.textContent;
    if (text.length === 1 && text === text.toLowerCase()) {
      element.textContent = text.toUpperCase();
      this.focusElement(element);
    }
  }

  showError(element) {
    element.classList.add('shake');
    setTimeout(() => element.classList.remove('shake'), 500);
  }

  destroy() {}
}

const togglePlugin = new TogglePlugin();