// undo.js - Plugin de Undo/Redo robusto (iPhone-first)

class UndoRedoPlugin {
  constructor() {
    this.name = 'undo-redo';
    this.slotId = 1; // slot desejado na barra

    this.undoStack = [];
    this.redoStack = [];
    this.maxStackSize = 50;

    this.isRecording = false;
    this.currentContent = '';

    this.editor = null;
    this.undoBtn = null;
    this.redoBtn = null;

    this._retryMs = 100;
    this._captureDebounceMs = 800;

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
      // Slots ainda não criados pela barra -> tenta de novo
      setTimeout(() => this.waitForSlotAndRegister(), this._retryMs);
    }
  }

  _attemptRegister() {
    const pluginHTML = `
      <div class="undo-plugin">
        <button class="undo-btn" id="undo-btn" title="Desfazer" aria-label="Desfazer">
          <svg class="undo-icon" viewBox="0 0 24 24">
            <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>
          </svg>
        </button>
        <button class="redo-btn" id="redo-btn" title="Refazer" aria-label="Refazer">
          <svg class="redo-icon" viewBox="0 0 24 24">
            <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/>
          </svg>
        </button>
      </div>
    `;

    const ok = window.toolbar.registerPlugin(this.name, this.slotId, this, pluginHTML);
    if (!ok) {
      // Ex.: slot ainda não marcado disponível, ou corrida residual -> re-tenta
      setTimeout(() => this._attemptRegister(), this._retryMs);
      return;
    }

    this.undoBtn = document.getElementById('undo-btn');
    this.redoBtn = document.getElementById('redo-btn');

    // Clique dos botões
    this.undoBtn.addEventListener('click', () => this.undo());
    this.redoBtn.addEventListener('click', () => this.redo());

    // Atalhos (se houver teclado)
    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey) {
        const k = e.key.toLowerCase();
        if (k === 'z') {
          e.preventDefault();
          if (e.shiftKey) this.redo(); else this.undo();
        } else if (k === 'y') {
          e.preventDefault();
          this.redo();
        }
      }
    });

    // Agora conecta no editor
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

    // baseline atual (sem empilhar nada ainda)
    this.currentContent = el.innerHTML;
    this.undoStack = [];
    this.redoStack = [];

    // Grava mudanças
    el.addEventListener('input', () => {
      if (this.isRecording) this._debouncedCapture();
    });

    // Começa a gravar
    this.isRecording = true;

    this.updateButtonStates();
    // console.log('🔗 Undo/Redo conectado');
  }

  // === Captura de estado ===
  _debouncedCapture() {
    clearTimeout(this._capTo);
    this._capTo = setTimeout(() => this.saveState(), this._captureDebounceMs);
  }

  saveState() {
    if (!this.editor) return;

    const newContent = this.editor.editorElement.innerHTML;
    if (newContent === this.currentContent) return;

    // Empilha o estado anterior para permitir desfazer
    this.undoStack.push({ content: this.currentContent, t: Date.now() });
    if (this.undoStack.length > this.maxStackSize) this.undoStack.shift();

    // limpar redo ao digitar
    this.redoStack = [];

    // Atualiza referência
    this.currentContent = newContent;

    this.updateButtonStates();
    // console.log(`💾 estados: undo=${this.undoStack.length} redo=${this.redoStack.length}`);
  }

  // === Ações ===
  undo() {
    if (!this.editor || this.undoStack.length === 0) return;

    this.isRecording = false;

    // guarda o atual para poder refazer
    this.redoStack.push({ content: this.currentContent, t: Date.now() });

    const prev = this.undoStack.pop();
    this._applyContent(prev.content);

    this._resumeRecording();
  }

  redo() {
    if (!this.editor || this.redoStack.length === 0) return;

    this.isRecording = false;

    // guarda o atual para permitir novo undo
    this.undoStack.push({ content: this.currentContent, t: Date.now() });

    const next = this.redoStack.pop();
    this._applyContent(next.content);

    this._resumeRecording();
  }

  _applyContent(html) {
    this.editor.editorElement.innerHTML = html;
    this.currentContent = html;

    if (this.editor.updateStats) this.editor.updateStats();

    // Ajuda no iOS a manter o teclado/caret
    if (this.editor.focus) this.editor.focus();

    this.updateButtonStates();
  }

  _resumeRecording() {
    setTimeout(() => {
      this.isRecording = true;
    }, 200);
  }

  updateButtonStates() {
    if (!this.undoBtn || !this.redoBtn) return;
    this.undoBtn.disabled = this.undoStack.length === 0;
    this.redoBtn.disabled = this.redoStack.length === 0;
  }

  destroy() {
    clearTimeout(this._capTo);
    this.isRecording = false;
  }
}

// Auto-start
const undoRedoPlugin = new UndoRedoPlugin();