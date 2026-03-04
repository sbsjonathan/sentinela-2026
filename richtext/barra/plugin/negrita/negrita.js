// negrita.js - Plugin com correção de foco para manter o cursor no editor

class BoldItalicPlugin {
  constructor() {
    this.name = 'bold-italic';
    this.slotId = 2;

    this.editor = null;
    this.boldBtn = null;
    this.italicBtn = null;

    this._retryMs = 100;
    this.autoRegister();
  }

  // === Boot ===
  autoRegister() {
    const waitForToolbarObj = () => {
      if (window.toolbar) {
        this.waitForSlotAndRegister();
      } else {
        setTimeout(waitForToolbarObj, this._retryMs);
      }
    };
    waitForToolbarObj();
  }

  waitForSlotAndRegister() {
    const slotEl = document.getElementById(`plugin-slot-${this.slotId}`);
    if (slotEl) {
      this._attemptRegister();
    } else {
      setTimeout(() => this.waitForSlotAndRegister(), this._retryMs);
    }
  }

  _attemptRegister() {
    const pluginHTML = `
      <div class="bold-italic-plugin">
        <button class="format-btn bold-btn" id="bold-btn" title="Negrito" aria-label="Negrito">
          <svg class="format-icon" viewBox="0 0 24 24">
            <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/>
          </svg>
        </button>
        <button class="format-btn italic-btn" id="italic-btn" title="Itálico" aria-label="Itálico">
          <svg class="format-icon" viewBox="0 0 24 24">
            <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/>
          </svg>
        </button>
      </div>
    `;

    const ok = window.toolbar.registerPlugin(this.name, this.slotId, this, pluginHTML);
    if (!ok) {
      setTimeout(() => this._attemptRegister(), this._retryMs);
      return;
    }

    this.boldBtn = document.getElementById('bold-btn');
    this.italicBtn = document.getElementById('italic-btn');

    // ===== INÍCIO DA CORREÇÃO DE FOCO =====
    // Usar 'mousedown' em vez de 'click'. Ele dispara antes que o foco seja perdido.
    // O e.preventDefault() impede o comportamento padrão do navegador de focar no botão.
    this.boldBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.toggleBold();
    });

    this.italicBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.toggleItalic();
    });
    // ===== FIM DA CORREÇÃO DE FOCO =====

    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey) {
        const k = e.key.toLowerCase();
        if (k === 'b') {
          e.preventDefault();
          this.toggleBold();
        } else if (k === 'i') {
          e.preventDefault();
          this.toggleItalic();
        }
      }
    });

    this.waitForEditor();
  }

  waitForEditor() {
    const check = () => {
      if (window.editor && window.editor.editorElement) {
        this.connectToEditor();
      } else {
        setTimeout(check, this._retryMs);
      }
    };
    check();
  }

  connectToEditor() {
    this.editor = window.editor;
    const el = this.editor.editorElement;

    document.addEventListener('selectionchange', () => {
      this.updateButtonStates();
    });

    el.addEventListener('focus', () => this.updateButtonStates());
    el.addEventListener('blur', () => setTimeout(() => this.updateButtonStates(), 100));
    el.addEventListener('input', () => this.updateButtonStates());

    this.updateButtonStates();
    console.log('🔗 Negrito/Itálico conectado');
  }

  // === Ações de formatação ===
  toggleBold() {
    if (!this.editor || !this.editor.editorElement) return;
    // Como o foco não é perdido, não precisamos chamar .focus() novamente.
    document.execCommand('bold', false, null);
    this.updateButtonStates();
  }

  toggleItalic() {
    if (!this.editor || !this.editor.editorElement) return;
    document.execCommand('italic', false, null);
    this.updateButtonStates();
  }

  // === Detecção de estado ===
  updateButtonStates() {
    if (!this.boldBtn || !this.italicBtn) return;

    // Lógica aprimorada para verificar se a seleção está DENTRO do editor
    const selection = window.getSelection();
    const editorHasFocusAndSelection = this.editor && 
                                      this.editor.editorElement &&
                                      selection.anchorNode &&
                                      this.editor.editorElement.contains(selection.anchorNode);

    if (editorHasFocusAndSelection) {
      const isBold = this.queryCommandState('bold');
      const isItalic = this.queryCommandState('italic');

      this.boldBtn.classList.toggle('active', isBold);
      this.italicBtn.classList.toggle('active', isItalic);
      this.boldBtn.setAttribute('aria-pressed', isBold);
      this.italicBtn.setAttribute('aria-pressed', isItalic);
    } else {
      this.boldBtn.classList.remove('active');
      this.italicBtn.classList.remove('active');
      this.boldBtn.setAttribute('aria-pressed', 'false');
      this.italicBtn.setAttribute('aria-pressed', 'false');
    }
  }

  queryCommandState(command) {
    try {
      return document.queryCommandState(command);
    } catch (e) {
      return false;
    }
  }

  destroy() {
    console.log('🗑️ Plugin Negrito/Itálico destruído');
  }
}

// Auto-start
const boldItalicPlugin = new BoldItalicPlugin();