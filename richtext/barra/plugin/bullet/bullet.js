// bullet.js - Plugin para criar listas de bullet points (sub-slot esquerdo)

class BulletPlugin {
  constructor() {
    this.name = 'bullet';
    this.slotId = '3-left'; // NOVO: Usa sub-slot esquerdo

    this.editor = null;
    this.bulletBtn = null;
    this._retryMs = 100;

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
      <div class="bullet-plugin">
        <button class="bullet-btn" id="bullet-plugin-btn" title="Lista" aria-label="Criar Lista">
          <svg class="bullet-icon" viewBox="0 0 24 24">
            <path d="M4 18h16v-2H4v2zm0-5h16v-2H4v2zm0-7v2h16V6H4z"/>
          </svg>
        </button>
      </div>
    `;

    const success = window.toolbar.registerPlugin(this.name, this.slotId, this, pluginHTML);
    if (!success) {
      setTimeout(() => this.register(), this._retryMs);
      return;
    }

    this.bulletBtn = document.getElementById('bullet-plugin-btn');
    
    // Usamos 'mousedown' para prevenir a perda de foco do editor, assim como no negrita.js
    this.bulletBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.handleToolbarClick();
    });

    this.waitForDependency('editor', () => this.connectToEditor());
  }

  // === Conexão com o Editor ===
  connectToEditor() {
    this.editor = window.editor;
    const editorEl = this.editor.editorElement;

    // Listeners para atualizar o estado do botão (ativo/inativo)
    document.addEventListener('selectionchange', () => this.updateButtonState());
    editorEl.addEventListener('keyup', () => this.updateButtonState()); // Keyup é bom para backspace/enter
    editorEl.addEventListener('focus', () => this.updateButtonState(), true); // Captura para pegar focus em toggles
    editorEl.addEventListener('blur', () => this.updateButtonState(true), true); // Passa true para forçar desativação
    
    // Listener específico para cliques em toggles
    editorEl.addEventListener('click', () => {
      setTimeout(() => this.updateButtonState(), 10);
    });

    this.updateButtonState();
    console.log('🔗 Plugin de Bullet List conectado no sub-slot esquerdo');
  }

  // === Lógica Principal ===
  handleToolbarClick() {
    if (!this.editor) return;

    // BLOQUEIO: Não executa se estiver dentro de um toggle
    if (this.isInsideToggle()) {
      console.log('🚫 Bullet bloqueado dentro de toggle');
      return;
    }

    // O comando 'insertUnorderedList' é um toggle:
    // - Se não há lista, ele cria uma.
    // - Se já há uma lista, ele a remove.
    document.execCommand('insertUnorderedList', false, null);

    // IMPORTANTE: Atualiza o placeholder após criar/remover lista
    setTimeout(() => {
      if (this.editor && this.editor.updatePlaceholder) {
        this.editor.updatePlaceholder();
      }
      this.updateButtonState();
    }, 10);
    
    // Garante que o editor mantenha o foco
    this.editor.focus();
  }

  updateButtonState(forceInactive = false) {
    if (!this.bulletBtn) return;

    // BLOQUEIO: Desabilita visualmente se estiver dentro de toggle
    if (this.isInsideToggle()) {
      this.bulletBtn.classList.remove('active');
      this.bulletBtn.classList.add('blocked');
      this.bulletBtn.setAttribute('disabled', 'true');
      return;
    } else {
      this.bulletBtn.classList.remove('blocked');
      this.bulletBtn.removeAttribute('disabled');
    }

    if (forceInactive) {
        this.bulletBtn.classList.remove('active');
        return;
    }
    
    // Usamos queryCommandState para verificar se a seleção atual está dentro de uma lista
    try {
      const isList = document.queryCommandState('insertUnorderedList');
      this.bulletBtn.classList.toggle('active', isList);
      
      // Atualiza placeholder sempre que o estado mudar
      if (this.editor && this.editor.updatePlaceholder) {
        this.editor.updatePlaceholder();
      }
    } catch (e) {
      this.bulletBtn.classList.remove('active');
    }
  }

  // === Método auxiliar para detectar se está dentro de toggle ===
  isInsideToggle() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;
    
    const range = selection.getRangeAt(0);
    let node = range.commonAncestorContainer;
    
    // Se for texto, pega o elemento pai
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }
    
    // Verifica se algum ancestral é um toggle
    while (node && node !== document.body) {
      if (node.classList && node.classList.contains('toggle')) {
        return true;
      }
      // Também verifica se está em elementos específicos do toggle
      if (node.classList && 
          (node.classList.contains('toggle-title') || 
           node.classList.contains('content-invisible') ||
           node.classList.contains('toggle-content'))) {
        return true;
      }
      node = node.parentElement;
    }
    
    return false;
  }

  destroy() {
    // Limpeza de eventos se necessário no futuro
  }
}

// Auto-inicialização do plugin
const bulletPlugin = new BulletPlugin();