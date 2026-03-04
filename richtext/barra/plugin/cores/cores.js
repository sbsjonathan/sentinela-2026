// cores.js — Plugin "Cores" (slot 6) - VERSÃO COM RESET DE FUNDO CORRIGIDO
// - Usa a técnica de text-shadow para um contorno limpo e sólido.
// - Reset de background agora funciona corretamente

class CoresPlugin {
  constructor() {
    this.name = 'cores'; this.slotId = 5; this.editor = null; this.textInput = null; this.bgInput = null;
    this.resetBtn = null; this.textIndicator = null; this.resetIndicator = null; this.savedRange = null;
    this.selectionListener = null; this._retryMs = 100; 
    
    // === NOVO: Variáveis para lembrar das últimas cores aplicadas ===
    this.lastAppliedTextColor = '#111111';
    this.lastAppliedBgColor = null;
    
    this.autoRegister();
  }

  autoRegister() {
    const waitForToolbarObj = () => {
      if (window.toolbar) this.waitForSlotAndRegister(); else setTimeout(waitForToolbarObj, this._retryMs);
    };
    waitForToolbarObj();
  }

  waitForSlotAndRegister() {
    const slotEl = document.getElementById(`plugin-slot-${this.slotId}`);
    if (slotEl) this._attemptRegister(); else setTimeout(() => this.waitForSlotAndRegister(), this._retryMs);
  }

  _attemptRegister() {
    const pluginHTML = `
      <div class="cores-plugin" role="group" aria-label="Cores de texto e fundo">
        <input type="color" id="text-color-input" class="color-input-hidden" aria-hidden="true" tabindex="-1">
        <input type="color" id="bg-color-input"   class="color-input-hidden" aria-hidden="true" tabindex="-1">
        <label for="text-color-input" id="text-color-label" class="format-btn color-picker-label" title="Cor do texto" aria-label="Cor do texto">
          <span class="color-indicator text" data-role="text-indicator">A</span>
        </label>
        <label for="bg-color-input" id="bg-color-label" class="format-btn color-picker-label" title="Cor de fundo" aria-label="Cor de fundo">
          <span class="color-indicator bg" data-role="bg-indicator">A</span>
        </label>
        <button id="reset-color-btn" class="format-btn" title="Resetar Cores" aria-label="Resetar formatação de cores">
          <span id="reset-color-indicator" class="reset-indicator">
            A
            <svg id="reset-prohibition-icon" class="reset-prohibition-icon" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" fill="none" stroke="#ff0000" stroke-width="2" opacity="0.8"/>
              <line x1="6" y1="6" x2="18" y2="18" stroke="#ff0000" stroke-width="2" opacity="0.8"/>
            </svg>
          </span>
        </button>
      </div>
    `;
    const ok = window.toolbar.registerPlugin(this.name, this.slotId, this, pluginHTML);
    if (!ok) { setTimeout(() => this._attemptRegister(), this._retryMs); return; }
    this.cacheElements(); this.wireEvents(); this.waitForEditor();
  }

  waitForEditor() {
    const check = () => {
      if (window.editor && window.editor.editorElement) this.connectToEditor(); else setTimeout(check, this._retryMs);
    };
    check();
  }

  connectToEditor() {
    this.editor = window.editor; this.refreshIndicatorsFromSelection(); this.attachSelectionChange();
    console.log('🔗 Plugin de Cores conectado (com reset de fundo corrigido)');
  }
  
  cacheElements() {
    const container = document.getElementById(`plugin-slot-${this.slotId}`); if (!container) return;
    this.textInput = container.querySelector('#text-color-input'); this.bgInput = container.querySelector('#bg-color-input');
    this.textLabel = container.querySelector('#text-color-label'); this.bgLabel = container.querySelector('#bg-color-label');
    this.textIndicator = container.querySelector('[data-role="text-indicator"]'); this.bgIndicator = container.querySelector('[data-role="bg-indicator"]');
    this.resetBtn = container.querySelector('#reset-color-btn'); this.resetIndicator = container.querySelector('#reset-color-indicator');
  }

  wireEvents() {
    const saveSel = () => this.saveSelection();
    ['pointerdown','mousedown','touchstart'].forEach(ev => {
      this.textLabel?.addEventListener(ev, saveSel, { passive: true }); this.bgLabel?.addEventListener(ev, saveSel, { passive: true });
    });
    
    this.textInput?.addEventListener('input', (e) => { 
      const color = e.target.value; 
      this.applyColor('foreColor', color); 
      this.updateTextIndicator(color);
      // === NOVO: Lembra da cor aplicada ===
      this.lastAppliedTextColor = color;
    });
    
    this.bgInput?.addEventListener('input', (e) => { 
      const color = e.target.value; 
      const ok = this.applyColor('hiliteColor', color); 
      if (!ok) this.applyColor('backColor', color);
      // === NOVO: Lembra da cor aplicada ===
      this.lastAppliedBgColor = color;
    });
    
    this.resetBtn?.addEventListener('mousedown', (e) => { e.preventDefault(); this.resetFormatting(); });
  }
  
  resetFormatting() {
    if (!this.editor || !this.editor.editorElement) return;
    this.saveSelection(); this.editor.editorElement.focus(); this.restoreSelection();

    // === CORREÇÃO PRINCIPAL: Reset mais efetivo ===
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      
      // Se há seleção, limpa apenas a seleção
      if (!range.collapsed) {
        // Remove formatação da seleção
        document.execCommand('removeFormat', false, null);
        document.execCommand('foreColor', false, '#111111');
        
        // Limpa background de múltiplas formas
        document.execCommand('hiliteColor', false, 'transparent');
        document.execCommand('backColor', false, 'transparent');
        
        // Força limpeza via CSS inline também
        this.removeBackgroundFromSelection(range);
      } else {
        // Se não há seleção, limpa o elemento atual
        const currentElement = this.getCurrentElement();
        if (currentElement) {
          this.removeBackgroundFromElement(currentElement);
        }
      }
    }

    // Aplica cor de texto padrão
    document.execCommand('foreColor', false, '#111111');

    // === NOVO: Reseta as cores lembradas ===
    this.lastAppliedTextColor = '#111111';
    this.lastAppliedBgColor = null;

    if (this.resetIndicator) { this.resetIndicator.classList.add('shake'); setTimeout(() => this.resetIndicator.classList.remove('shake'), 500); }
    this.refreshIndicatorsFromSelection();
  }

  // === NOVOS MÉTODOS PARA LIMPEZA FORÇADA ===
  removeBackgroundFromSelection(range) {
    const contents = range.extractContents();
    const walker = document.createTreeWalker(
      contents,
      NodeFilter.SHOW_ELEMENT,
      null,
      false
    );
    
    let node;
    const elementsToClean = [];
    
    // Coleta todos os elementos
    while (node = walker.nextNode()) {
      elementsToClean.push(node);
    }
    
    // Limpa background de todos os elementos
    elementsToClean.forEach(el => {
      el.style.backgroundColor = '';
      el.style.background = '';
      if (el.style.length === 0) {
        el.removeAttribute('style');
      }
    });
    
    // Reinsere o conteúdo limpo
    range.insertNode(contents);
  }

  removeBackgroundFromElement(element) {
    // Limpa o elemento atual e seus filhos
    element.style.backgroundColor = '';
    element.style.background = '';
    
    // Limpa elementos filhos também
    const childElements = element.querySelectorAll('*');
    childElements.forEach(child => {
      child.style.backgroundColor = '';
      child.style.background = '';
      if (child.style.length === 0) {
        child.removeAttribute('style');
      }
    });
    
    if (element.style.length === 0) {
      element.removeAttribute('style');
    }
  }

  getCurrentElement() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;
    
    const range = selection.getRangeAt(0);
    let element = range.startContainer;
    
    if (element.nodeType === Node.TEXT_NODE) {
      element = element.parentElement;
    }
    
    return element;
  }

  attachSelectionChange() {
    const handler = () => this.refreshIndicatorsFromSelection(); document.addEventListener('selectionchange', handler); this.selectionListener = handler;
  }
  
  applyColor(command, color) {
    if (!this.editor || !this.editor.editorElement) return false;
    this.editor.editorElement.focus(); this.restoreSelection();
    try { return document.execCommand(command, false, color) !== false; } catch (_) { return false; }
  }

  updateTextIndicator(color) {
    if (!this.textIndicator) return;
    const safeColor = color || '#111111';
    this.textIndicator.style.color = safeColor;
    if (this.isLightColor(safeColor)) {
      const outlineColor = 'rgba(0, 0, 0, 0.5)';
      this.textIndicator.style.textShadow = `-0.5px -0.5px 0 ${outlineColor}, 0.5px -0.5px 0 ${outlineColor}, -0.5px 0.5px 0 ${outlineColor}, 0.5px 0.5px 0 ${outlineColor}`;
    } else {
      this.textIndicator.style.textShadow = 'none';
    }
  }
  
  refreshIndicatorsFromSelection() {
    const info = this.getColorsAtCaret();
    
    // === CORREÇÃO: Usa cor lembrada se não detectar cor VÁLIDA ===
    const finalTextColor = info.text || this.lastAppliedTextColor;
    
    // Para background, só usa info.bg se for uma cor válida (não transparent/null/vazio)
    const finalBgColor = this.isValidBackgroundColor(info.bg) ? info.bg : this.lastAppliedBgColor;
    
    this.updateTextIndicator(finalTextColor);
    
    if (this.bgIndicator) { 
      if (finalBgColor) {
        this.bgIndicator.style.backgroundColor = finalBgColor; 
        this.bgIndicator.style.color = this.contrastColor(finalBgColor);
      } else {
        // Se não há cor de background, deixa transparente
        this.bgIndicator.style.backgroundColor = 'transparent';
        this.bgIndicator.style.color = '#111111';
      }
    }
    
    if (this.resetIndicator) { 
      this.resetIndicator.style.color = finalTextColor || '#111111'; 
      
      if (finalBgColor) { 
        this.resetIndicator.style.backgroundColor = finalBgColor; 
      } else { 
        this.resetIndicator.style.backgroundColor = 'transparent'; 
      } 
    }
  }

  // === NOVO MÉTODO: Verifica se é uma cor de background válida ===
  isValidBackgroundColor(color) {
    if (!color) return false;
    if (color === 'transparent') return false;
    if (color === 'rgba(0, 0, 0, 0)') return false;
    if (color === '#ffffff') return false; // Branco também considera como "sem cor"
    if (color.includes('rgba(0, 0, 0, 0)')) return false;
    return true;
  }

  getColorsAtCaret() {
    const out = { text: null, bg: null }; 
    const sel = window.getSelection(); 
    if (!sel || sel.rangeCount === 0) return out; 
    
    const range = sel.getRangeAt(0); 
    const root = this.editor?.editorElement; 
    if (!root || !root.contains(range.commonAncestorContainer)) return out; 
    
    try { 
      const fore = document.queryCommandValue('foreColor'); 
      const back = (document.queryCommandValue('hiliteColor') || document.queryCommandValue('backColor')); 
      if (fore) out.text = this.rgbToHex(fore) || fore; 
      if (back && back !== 'transparent' && back !== 'rgba(0, 0, 0, 0)') out.bg = this.rgbToHex(back) || back; 
    } catch (_) { /* continua */ } 
    
    const node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement; 
    if (node) { 
      const cs = getComputedStyle(node); 
      if (!out.text && cs.color) out.text = this.rgbToHex(cs.color) || cs.color; 
      if (!out.bg && cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') { 
        out.bg = this.rgbToHex(cs.backgroundColor) || cs.backgroundColor; 
      } 
    } 
    
    return out;
  }

  hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return null; const m = hex.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i); if (!m) return null; let h = m[1]; if (h.length === 3) h = h.split('').map(c => c + c).join(''); const int = parseInt(h, 16); return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  }

  isLightColor(hex) {
    const rgb = this.hexToRgb(hex); if (!rgb) return false; const luma = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000; return luma > 180;
  }

  contrastColor(hex) {
    const rgb = this.hexToRgb(hex); if (!rgb) return '#111111'; const luma = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000; return luma > 128 ? '#111111' : '#FFFFFF';
  }

  detachSelectionChange() { if (this.selectionListener) { document.removeEventListener('selectionchange', this.selectionListener); this.selectionListener = null; }}
  saveSelection() { const sel = window.getSelection(); if (!sel || sel.rangeCount === 0) return; const range = sel.getRangeAt(0); if (this.editor && this.editor.editorElement && this.editor.editorElement.contains(range.commonAncestorContainer)) { this.savedRange = range.cloneRange(); }}
  restoreSelection() { if (!this.savedRange) return false; const sel = window.getSelection(); if (!sel) return false; sel.removeAllRanges(); sel.addRange(this.savedRange); this.savedRange = null; return true;}
  rgbToHex(rgb) { if (!rgb) return null; const m = rgb.replace(/\s+/g,'').match(/^rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/i); if (!m) return null; return '#' + [1, 2, 3].map(i => parseInt(m[i]).toString(16).padStart(2, '0')).join('');}
  destroy() { this.detachSelectionChange(); }
}

const coresPlugin = new CoresPlugin();