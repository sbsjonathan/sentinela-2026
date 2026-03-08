// cores.js — Plugin "Cores" integrado com Color Picker customizado
// Sem inputs nativos. Modal próprio com Grade, Espectro e Controles RGB.

class CoresPlugin {
  constructor() {
    this.name    = 'cores';
    this.slotId  = 5;
    this.editor  = null;
    this._retryMs = 100;

    // Referências dos botões na toolbar
    this.textBtn       = null;
    this.bgBtn         = null;
    this.resetBtn      = null;
    this.textIndicator = null;
    this.bgIndicator   = null;
    this.resetIndicator = null;

    // Modo atual do picker: 'text' | 'bg'
    this.pickerMode = 'text';

    // Range salvo antes de abrir o picker
    this.savedRange = null;

    // Cores lembradas para atualizar indicadores
    this.lastTextColor = '#111111';
    this.lastBgColor   = null;

    // ── Estado interno do picker ──
    this.pickerR = 255;
    this.pickerG = 59;
    this.pickerB = 48;
    this.spectrumDrawn = false;
    this.specDragging  = false;
    this.selectedCell  = null;
    this.selectedSwatch = null;
    this.thumbStyleEl  = null;

    // Elementos do modal (resolvidos depois do DOM)
    this.overlay    = null;
    this.previewEl  = null;
    this.dotEl      = null;
    this.specCanvas = null;
    this.specCtx    = null;
    this.modeBadge  = null;

    // Sliders / inputs de controle
    this.sliderR = null; this.numR = null; this.bgR = null;
    this.sliderG = null; this.numG = null; this.bgG = null;
    this.sliderB = null; this.numB = null; this.bgB = null;
    this.hexInputEl = null;

    this.autoRegister();
  }

  // ════════════════════════════════════════════
  //  BOOT — espera toolbar → slot → editor
  // ════════════════════════════════════════════
  autoRegister() {
    const wait = () => {
      if (window.toolbar) this._waitSlot();
      else setTimeout(wait, this._retryMs);
    };
    wait();
  }

  _waitSlot() {
    if (document.getElementById(`plugin-slot-${this.slotId}`)) this._register();
    else setTimeout(() => this._waitSlot(), this._retryMs);
  }

  _register() {
    const pluginHTML = `
      <div class="cores-plugin" role="group" aria-label="Cores de texto e fundo">
        <button id="text-color-btn" class="format-btn color-picker-label" title="Cor do texto" aria-label="Cor do texto">
          <span class="color-indicator text" data-role="text-indicator">A</span>
        </button>
        <button id="bg-color-btn" class="format-btn color-picker-label" title="Cor de fundo" aria-label="Cor de fundo">
          <span class="color-indicator bg" data-role="bg-indicator">A</span>
        </button>
        <button id="reset-color-btn" class="format-btn" title="Resetar Cores" aria-label="Resetar cores">
          <span id="reset-color-indicator" class="reset-indicator">
            A
            <svg class="reset-prohibition-icon" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" fill="none" stroke="#ff0000" stroke-width="2" opacity="0.8"/>
              <line x1="6" y1="6" x2="18" y2="18" stroke="#ff0000" stroke-width="2" opacity="0.8"/>
            </svg>
          </span>
        </button>
      </div>
    `;

    const ok = window.toolbar.registerPlugin(this.name, this.slotId, this, pluginHTML);
    if (!ok) { setTimeout(() => this._register(), this._retryMs); return; }

    this._cacheToolbarElements();
    this._wireToolbarEvents();
    this._initPicker();
    this._waitEditor();
  }

  // ════════════════════════════════════════════
  //  ELEMENTOS DA TOOLBAR
  // ════════════════════════════════════════════
  _cacheToolbarElements() {
    const slot = document.getElementById(`plugin-slot-${this.slotId}`);
    this.textBtn        = slot.querySelector('#text-color-btn');
    this.bgBtn          = slot.querySelector('#bg-color-btn');
    this.resetBtn       = slot.querySelector('#reset-color-btn');
    this.textIndicator  = slot.querySelector('[data-role="text-indicator"]');
    this.bgIndicator    = slot.querySelector('[data-role="bg-indicator"]');
    this.resetIndicator = slot.querySelector('#reset-color-indicator');
  }

  _wireToolbarEvents() {
    // Salva a seleção ANTES de qualquer blur (mousedown / touchstart)
    const openText = (e) => { e.preventDefault(); this._saveSelection(); this._openPicker('text'); };
    const openBg   = (e) => { e.preventDefault(); this._saveSelection(); this._openPicker('bg');   };
    const doReset  = (e) => { e.preventDefault(); this._saveSelection(); this._resetFormatting(); };

    ['mousedown', 'touchstart'].forEach(ev => {
      this.textBtn.addEventListener(ev, openText, { passive: false });
      this.bgBtn.addEventListener(ev, openBg, { passive: false });
      this.resetBtn.addEventListener(ev, doReset, { passive: false });
    });
  }

  // ════════════════════════════════════════════
  //  EDITOR
  // ════════════════════════════════════════════
  _waitEditor() {
    const check = () => {
      if (window.editor && window.editor.editorElement) {
        this.editor = window.editor;
        this._refreshIndicators();
        document.addEventListener('selectionchange', () => this._refreshIndicators());
        console.log('🎨 CoresPlugin conectado ao editor');
      } else {
        setTimeout(check, this._retryMs);
      }
    };
    check();
  }

  // ════════════════════════════════════════════
  //  SELEÇÃO
  // ════════════════════════════════════════════
  _saveSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { this.savedRange = null; return; }
    const range = sel.getRangeAt(0);
    // Só salva se estiver dentro do editor
    if (this.editor && this.editor.editorElement && this.editor.editorElement.contains(range.commonAncestorContainer)) {
      this.savedRange = range.cloneRange();
    } else {
      this.savedRange = null;
    }
  }

  _restoreSelection() {
    if (!this.savedRange) return false;
    if (this.editor && this.editor.editorElement) {
      this.editor.editorElement.focus();
    }
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(this.savedRange);
    return true;
  }

  // ════════════════════════════════════════════
  //  APLICAR COR E FECHAR
  // ════════════════════════════════════════════
  _applyColorAndClose() {
    const hex = '#' + this._toHex2(this.pickerR) + this._toHex2(this.pickerG) + this._toHex2(this.pickerB);

    // Fecha o modal
    this.overlay.classList.remove('open');

    // Restaura a seleção e aplica
    const restored = this._restoreSelection();
    if (restored) {
      if (this.pickerMode === 'text') {
        document.execCommand('foreColor', false, hex);
        this.lastTextColor = hex;
        this._updateTextIndicator(hex);
      } else {
        const ok = document.execCommand('hiliteColor', false, hex);
        if (!ok) document.execCommand('backColor', false, hex);
        this.lastBgColor = hex;
        this._updateBgIndicator(hex);
      }
      this._refreshIndicators();
    }

    this.savedRange = null;
  }

  // ════════════════════════════════════════════
  //  RESET
  // ════════════════════════════════════════════
  _resetFormatting() {
    if (!this.editor || !this.editor.editorElement) return;

    // Restaura a seleção salva no mousedown (antes do blur)
    const restored = this._restoreSelection();
    if (!restored) {
      this.editor.editorElement.focus();
    }

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);

      if (!range.collapsed) {
        // ── Tem texto selecionado: limpa a seleção ──
        document.execCommand('removeFormat', false, null);
        document.execCommand('foreColor', false, '#111111');
        document.execCommand('hiliteColor', false, 'transparent');
        document.execCommand('backColor', false, 'transparent');
        this._clearBgFromSelection(range);
      } else {
        // ── Só caret: sobe pelo DOM limpando cor e fundo ──
        let node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;

        while (node && node !== this.editor.editorElement) {
          node.style.removeProperty('color');
          node.style.removeProperty('background-color');
          node.style.removeProperty('background');
          // Se o elemento ficou sem style, remove o atributo
          if (node.getAttribute('style') === '' || node.style.length === 0) {
            node.removeAttribute('style');
          }
          // Se for um <span> vazio de formatação, desempacota o conteúdo
          if (node.tagName === 'SPAN' && node.style.length === 0 && !node.className) {
            const parent = node.parentNode;
            while (node.firstChild) parent.insertBefore(node.firstChild, node);
            parent.removeChild(node);
            break;
          }
          node = node.parentElement;
        }
      }
    }

    // Garante cor padrão no contexto atual
    document.execCommand('foreColor', false, '#111111');
    this.lastTextColor = '#111111';
    this.lastBgColor   = null;

    if (this.resetIndicator) {
      this.resetIndicator.classList.add('shake');
      setTimeout(() => this.resetIndicator.classList.remove('shake'), 500);
    }
    this._refreshIndicators();
  }

  _clearBgFromSelection(range) {
    const contents = range.extractContents();
    const walker = document.createTreeWalker(contents, NodeFilter.SHOW_ELEMENT, null, false);
    const els = [];
    let node;
    while ((node = walker.nextNode())) els.push(node);
    els.forEach(el => {
      el.style.backgroundColor = '';
      el.style.background = '';
      if (el.style.length === 0) el.removeAttribute('style');
    });
    range.insertNode(contents);
  }

  // ════════════════════════════════════════════
  //  INDICADORES NA TOOLBAR
  // ════════════════════════════════════════════
  _refreshIndicators() {
    const info = this._detectColors();
    const textColor = info.text || this.lastTextColor;
    const bgColor   = this._isValidBg(info.bg) ? info.bg : this.lastBgColor;

    this._updateTextIndicator(textColor);
    this._updateBgIndicator(bgColor);

    if (this.resetIndicator) {
      this.resetIndicator.style.color = textColor || '#111111';
      this.resetIndicator.style.backgroundColor = bgColor || 'transparent';
    }
  }

  _updateTextIndicator(color) {
    if (!this.textIndicator) return;
    const c = color || '#111111';
    this.textIndicator.style.color = c;
    this.textIndicator.style.textShadow = this._isLight(c)
      ? '-0.5px -0.5px 0 rgba(0,0,0,0.5), 0.5px -0.5px 0 rgba(0,0,0,0.5), -0.5px 0.5px 0 rgba(0,0,0,0.5), 0.5px 0.5px 0 rgba(0,0,0,0.5)'
      : 'none';
  }

  _updateBgIndicator(color) {
    if (!this.bgIndicator) return;
    if (color) {
      this.bgIndicator.style.backgroundColor = color;
      this.bgIndicator.style.color = this._contrast(color);
    } else {
      this.bgIndicator.style.backgroundColor = 'transparent';
      this.bgIndicator.style.color = '#111111';
    }
  }

  _detectColors() {
    const out = { text: null, bg: null };
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return out;
    const range = sel.getRangeAt(0);
    if (!this.editor || !this.editor.editorElement.contains(range.commonAncestorContainer)) return out;

    try {
      const fore = document.queryCommandValue('foreColor');
      const back = document.queryCommandValue('hiliteColor') || document.queryCommandValue('backColor');
      if (fore) out.text = this._rgbToHex(fore) || fore;
      if (back && back !== 'transparent' && back !== 'rgba(0, 0, 0, 0)') out.bg = this._rgbToHex(back) || back;
    } catch (_) {}

    const node = range.startContainer.nodeType === 1
      ? range.startContainer
      : range.startContainer.parentElement;
    if (node) {
      const cs = getComputedStyle(node);
      if (!out.text && cs.color) out.text = this._rgbToHex(cs.color) || cs.color;
      if (!out.bg && cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        out.bg = this._rgbToHex(cs.backgroundColor) || cs.backgroundColor;
      }
    }
    return out;
  }

  // ════════════════════════════════════════════
  //  PICKER — INICIALIZAÇÃO DO MODAL
  // ════════════════════════════════════════════
  _initPicker() {
    // O modal já deve existir no container.html
    this.overlay = document.getElementById('color-picker-overlay');
    if (!this.overlay) {
      console.error('❌ #color-picker-overlay não encontrado no HTML');
      return;
    }

    this.previewEl  = this.overlay.querySelector('#picker-preview');
    this.dotEl      = this.overlay.querySelector('#picker-dot');
    this.specCanvas = this.overlay.querySelector('#picker-spec-canvas');
    if (this.specCanvas) this.specCtx = this.specCanvas.getContext('2d', { alpha: false });

    // Sliders / inputs
    this.sliderR   = this.overlay.querySelector('#picker-slider-r');
    this.numR      = this.overlay.querySelector('#picker-num-r');
    this.bgR       = this.overlay.querySelector('#picker-bg-r');
    this.sliderG   = this.overlay.querySelector('#picker-slider-g');
    this.numG      = this.overlay.querySelector('#picker-num-g');
    this.bgG       = this.overlay.querySelector('#picker-bg-g');
    this.sliderB   = this.overlay.querySelector('#picker-slider-b');
    this.numB      = this.overlay.querySelector('#picker-num-b');
    this.bgB       = this.overlay.querySelector('#picker-bg-b');
    this.hexInputEl = this.overlay.querySelector('#picker-hex-input');

    // Thumb style dinâmico
    this.thumbStyleEl = document.createElement('style');
    document.head.appendChild(this.thumbStyleEl);

    this._buildGrid();
    this._buildSwatches();
    this._wirePickerEvents();

    // Estado inicial
    this._setColor(255, 59, 48, 'init');
  }

  _openPicker(mode) {
    this.pickerMode = mode;
    // Fecha o teclado virtual antes de abrir o modal
    if (this.editor && this.editor.editorElement) {
      this.editor.editorElement.blur();
    }
    document.activeElement?.blur();

    this.overlay.classList.add('open');

    // Desenha espectro na primeira abertura
    requestAnimationFrame(() => {
      if (!this.spectrumDrawn) { this._drawSpectrum(); this.spectrumDrawn = true; }
      this._syncSpectrum();
    });
  }

  // ════════════════════════════════════════════
  //  PICKER — EVENTOS DO MODAL
  // ════════════════════════════════════════════
  _wirePickerEvents() {
    // Fechar pelo X
    const closeBtn = this.overlay.querySelector('#picker-close');
    if (closeBtn) {
      closeBtn.addEventListener('touchend', (e) => { e.preventDefault(); this._applyColorAndClose(); }, { passive: false });
      closeBtn.addEventListener('click', () => this._applyColorAndClose());
    }

    // Fechar tocando no fundo escuro
    this.overlay.addEventListener('touchend', (e) => {
      if (e.target === this.overlay) { e.preventDefault(); this._applyColorAndClose(); }
    }, { passive: false });
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this._applyColorAndClose();
    });

    // Abas
    this.overlay.querySelectorAll('.picker-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.overlay.querySelectorAll('.picker-tab').forEach(t => t.classList.remove('active'));
        this.overlay.querySelectorAll('.picker-view').forEach(v => v.classList.remove('active'));
        tab.classList.add('active');
        const view = this.overlay.querySelector('#' + tab.dataset.target);
        if (view) view.classList.add('active');
        if (tab.dataset.target === 'picker-view-spectrum') {
          if (!this.spectrumDrawn) { this._drawSpectrum(); this.spectrumDrawn = true; }
          this._syncSpectrum();
        }
      });
    });

    // Espectro
    const specBox = this.overlay.querySelector('#picker-view-spectrum');
    if (specBox) {
      let tStartX = 0, tStartY = 0, tMoved = false;

      specBox.addEventListener('mousedown', (e) => { this.specDragging = true; this._handleSpectrum(e); });
      window.addEventListener('mousemove', (e) => { if (this.specDragging) this._handleSpectrum(e); });
      window.addEventListener('mouseup', () => { this.specDragging = false; });

      specBox.addEventListener('touchstart', (e) => {
        e.preventDefault(); this.specDragging = true; tMoved = false;
        tStartX = e.touches[0].clientX; tStartY = e.touches[0].clientY;
        this._handleSpectrum(e);
      }, { passive: false });

      window.addEventListener('touchmove', (e) => {
        if (!this.specDragging) return;
        e.preventDefault();
        const dx = e.touches[0].clientX - tStartX;
        const dy = e.touches[0].clientY - tStartY;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) tMoved = true;
        this._handleSpectrum(e);
      }, { passive: false });

      window.addEventListener('touchend', () => {
        if (this.specDragging) {
          this.specDragging = false;
          // Deslize real no espectro → aplica e fecha
          if (tMoved && this.overlay.querySelector('#picker-view-spectrum')?.classList.contains('active')) {
            this._applyColorAndClose();
          }
          tMoved = false;
        }
      });
    }

    // Sliders RGB
    [this.sliderR, this.sliderG, this.sliderB].forEach(s => {
      s?.addEventListener('input', () => this._readSliders());
    });
    this.numR?.addEventListener('input', () => { if(this.sliderR) this.sliderR.value = this._clamp(parseInt(this.numR.value)||0); this._readSliders(); });
    this.numG?.addEventListener('input', () => { if(this.sliderG) this.sliderG.value = this._clamp(parseInt(this.numG.value)||0); this._readSliders(); });
    this.numB?.addEventListener('input', () => { if(this.sliderB) this.sliderB.value = this._clamp(parseInt(this.numB.value)||0); this._readSliders(); });

    this.hexInputEl?.addEventListener('input', () => {
      let raw = this.hexInputEl.value.replace(/[^0-9a-fA-F]/g,'').toUpperCase();
      this.hexInputEl.value = raw;
      if (raw.length === 6) {
        const r = parseInt(raw.substring(0,2),16);
        const g = parseInt(raw.substring(2,4),16);
        const b = parseInt(raw.substring(4,6),16);
        if(this.sliderR) this.sliderR.value = r;
        if(this.sliderG) this.sliderG.value = g;
        if(this.sliderB) this.sliderB.value = b;
        this._setColor(r, g, b, 'controls');
      }
    });
  }

  _readSliders() {
    const r = parseInt(this.sliderR?.value || 0);
    const g = parseInt(this.sliderG?.value || 0);
    const b = parseInt(this.sliderB?.value || 0);
    this._setColor(r, g, b, 'controls');
  }

  // ════════════════════════════════════════════
  //  PICKER — ESTADO GLOBAL DE COR
  // ════════════════════════════════════════════
  _setColor(r, g, b, source) {
    this.pickerR = this._clamp(r);
    this.pickerG = this._clamp(g);
    this.pickerB = this._clamp(b);

    if (source !== 'swatch' && source !== 'init' && this.selectedSwatch) {
      this.selectedSwatch.classList.remove('selected');
      this.selectedSwatch = null;
    }

    const rgb = `rgb(${this.pickerR},${this.pickerG},${this.pickerB})`;
    if (this.previewEl) this.previewEl.style.backgroundColor = rgb;

    if (this.thumbStyleEl) {
      this.thumbStyleEl.textContent = `
        #color-picker-overlay input[type="range"]::-webkit-slider-thumb { background: ${rgb} !important; }
        #color-picker-overlay input[type="range"]::-moz-range-thumb     { background: ${rgb} !important; }
      `;
    }

    if (this.bgR) this.bgR.style.background = `linear-gradient(to right, rgb(0,${this.pickerG},${this.pickerB}), rgb(255,${this.pickerG},${this.pickerB}))`;
    if (this.bgG) this.bgG.style.background = `linear-gradient(to right, rgb(${this.pickerR},0,${this.pickerB}), rgb(${this.pickerR},255,${this.pickerB}))`;
    if (this.bgB) this.bgB.style.background = `linear-gradient(to right, rgb(${this.pickerR},${this.pickerG},0), rgb(${this.pickerR},${this.pickerG},255))`;

    if (source !== 'grid')     this._syncGrid();
    if (source !== 'spectrum') this._syncSpectrum();
    this._syncControlsDisplay(source !== 'controls');
  }

  _syncControlsDisplay(includeSliders) {
    if (includeSliders) {
      if (this.sliderR) this.sliderR.value = this.pickerR;
      if (this.sliderG) this.sliderG.value = this.pickerG;
      if (this.sliderB) this.sliderB.value = this.pickerB;
    }
    if (this.numR) this.numR.value = this.pickerR;
    if (this.numG) this.numG.value = this.pickerG;
    if (this.numB) this.numB.value = this.pickerB;
    if (this.hexInputEl) this.hexInputEl.value = this._toHex2(this.pickerR) + this._toHex2(this.pickerG) + this._toHex2(this.pickerB);
  }

  // ════════════════════════════════════════════
  //  PICKER — GRADE
  // ════════════════════════════════════════════
  _buildGrid() {
    const gridEl = this.overlay?.querySelector('#picker-color-grid');
    if (!gridEl) return;

    const colorGrid = [
      ["#FFFFFF","#EBEBEB","#D6D6D6","#C2C2C2","#ADADAD","#999999","#858585","#707070","#5C5C5C","#474747","#333333","#000000"],
      ["#00374A","#011D57","#11053B","#2E063D","#3C071B","#5C0701","#5A1C00","#583300","#563D00","#666100","#4F5504","#263E0F"],
      ["#004D65","#012F7B","#1A0A52","#450D59","#551029","#831100","#7B2900","#7A4A00","#785800","#8D8602","#6F760A","#38571A"],
      ["#016E8F","#0042A9","#2C0977","#61187C","#791A3D","#B51A00","#AD3E00","#A96800","#A67B01","#C4BC00","#9BA50E","#4E7A27"],
      ["#008CB4","#0056D6","#371A94","#7A219E","#99244F","#E22400","#DA5100","#D38301","#D19D01","#F4EC00","#C3D017","#669D34"],
      ["#00A1D8","#0061FE","#4D22B2","#982ABC","#B92D5D","#FE4015","#FF6A00","#FEAB01","#FCC700","#FEFB41","#D8EC37","#76BB40"],
      ["#01C7FC","#3A87FE","#5E30EB","#BE38F3","#E63B7A","#FF6250","#FE8648","#FEB43F","#FDCB3E","#FFF76B","#E4EF65","#96D35F"],
      ["#52D6FC","#74A7FF","#864FFE","#D357FE","#EE719E","#FE8C82","#FEA57D","#FEC777","#FED877","#FFF994","#EAF28F","#B1DD8B"],
      ["#93E3FD","#A7C6FF","#B18CFE","#E292FE","#F4A4C0","#FFB5AF","#FFC5AB","#FED8A8","#FDE4A8","#FEFBB9","#F2F7B7","#CDE8B5"],
      ["#CBF0FE","#D3E2FF","#D9C9FD","#EFCAFF","#F8D3E0","#FFDBD8","#FEE2D6","#FEECD4","#FEF2D5","#FDFCDC","#F6F9DB","#DEEED4"],
    ];

    colorGrid.forEach((row, r) => {
      row.forEach((color, c) => {
        const btn = document.createElement('button');
        btn.className = 'color-cell';
        btn.style.backgroundColor = color;

        const isTop    = r === 0,  isBottom = r === colorGrid.length - 1;
        const isLeft   = c === 0,  isRight  = c === row.length - 1;
        if (isTop    && isLeft)  btn.style.borderRadius = '12px 0 0 0';
        if (isTop    && isRight) btn.style.borderRadius = '0 12px 0 0';
        if (isBottom && isLeft)  btn.style.borderRadius = '0 0 0 12px';
        if (isBottom && isRight) btn.style.borderRadius = '0 0 12px 0';

        btn.addEventListener('click', () => {
          if (this.selectedCell) this.selectedCell.classList.remove('selected');
          this.selectedCell = btn;
          btn.classList.add('selected');
          const [cr,cg,cb] = this._hexToRgb(color);
          this._setColor(cr, cg, cb, 'grid');
        });
        gridEl.appendChild(btn);
      });
    });
  }

  _syncGrid() {
    // Apenas atualiza a célula selecionada mais próxima — leve demais para omitir
    // Implementação simples: não força busca a cada mudança, só mantém estado visual
  }

  // ════════════════════════════════════════════
  //  PICKER — SWATCHES
  // ════════════════════════════════════════════
  _buildSwatches() {
    const swatchesEl = this.overlay?.querySelector('#picker-swatches');
    if (!swatchesEl) return;

    const colors = ['#FF3B30','#007AFF','#34C759','#FF9500','#AF52DE','#000000'];
    colors.forEach(color => {
      const btn = document.createElement('button');
      btn.className = 'picker-swatch';
      btn.style.background = color;

      const select = (e) => {
        e.preventDefault();
        if (this.selectedSwatch && this.selectedSwatch !== btn) {
          // Deseleciona anterior — volta ao shadow padrão
          this.selectedSwatch.classList.remove('selected');
          this.selectedSwatch.style.boxShadow = '0 1px 4px rgba(0,0,0,0.18)';
        }
        this.selectedSwatch = btn;
        btn.classList.add('selected');
        // Anel iOS: gap branco 3px + anel colorido 3px
        btn.style.boxShadow = `0 0 0 3px #f2f2f7, 0 0 0 6px ${color}`;
        const [r,g,b] = this._hexToRgb(color);
        this._setColor(r, g, b, 'swatch');
      };

      btn.addEventListener('touchstart', select, { passive: false });
      btn.addEventListener('click', select);
      swatchesEl.appendChild(btn);
    });
  }

  // ════════════════════════════════════════════
  //  PICKER — ESPECTRO
  // ════════════════════════════════════════════
  _drawSpectrum() {
    const box = this.overlay?.querySelector('#picker-view-spectrum');
    if (!box || !this.specCanvas || !this.specCtx) return;

    const w = this.specCanvas.width  = box.offsetWidth;
    const h = this.specCanvas.height = box.offsetHeight;

    const hCanvas = document.createElement('canvas');
    hCanvas.width = 1; hCanvas.height = h;
    const hCtx = hCanvas.getContext('2d');
    const grad = hCtx.createLinearGradient(0,0,0,h);
    grad.addColorStop(0.00,"#ff0000"); grad.addColorStop(0.12,"#ffff00");
    grad.addColorStop(0.18,"#ffff00"); grad.addColorStop(0.30,"#00ff00");
    grad.addColorStop(0.40,"#00ff00"); grad.addColorStop(0.52,"#00ffff");
    grad.addColorStop(0.60,"#00ffff"); grad.addColorStop(0.72,"#0000ff");
    grad.addColorStop(0.85,"#ff00ff"); grad.addColorStop(0.92,"#ff00ff");
    grad.addColorStop(1.00,"#ff0000");
    hCtx.fillStyle = grad; hCtx.fillRect(0,0,1,h);
    const hData = hCtx.getImageData(0,0,1,h).data;

    const img = this.specCtx.createImageData(w,h);
    const data = img.data;
    for (let y = 0; y < h; y++) {
      const rH = hData[y*4], gH = hData[y*4+1], bH = hData[y*4+2];
      for (let x = 0; x < w; x++) {
        const i = (y*w+x)*4, pct = x/w;
        const wA = pct < 0.4 ? Math.pow(1-(pct/0.4),2)*(3-2*(1-(pct/0.4))) : 0;
        const bA = pct > 0.6 ? Math.pow((pct-0.6)/0.4,2) : 0;
        data[i]   = (rH + (255-rH)*wA) * (1-bA);
        data[i+1] = (gH + (255-gH)*wA) * (1-bA);
        data[i+2] = (bH + (255-bH)*wA) * (1-bA);
        data[i+3] = 255;
      }
    }
    this.specCtx.putImageData(img, 0, 0);
  }

  _syncSpectrum() {
    if (!this.spectrumDrawn || !this.specCanvas || !this.specCtx || !this.dotEl) return;
    const w = this.specCanvas.width, h = this.specCanvas.height;
    if (!w || !h) return;
    const imageData = this.specCtx.getImageData(0,0,w,h).data;
    let bestX = w/2, bestY = h/2, bestDist = Infinity;
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const i = (y*w+x)*4;
        const d = (imageData[i]-this.pickerR)**2 + (imageData[i+1]-this.pickerG)**2 + (imageData[i+2]-this.pickerB)**2;
        if (d < bestDist) { bestDist = d; bestX = x; bestY = y; }
      }
    }
    this.dotEl.style.left = bestX + 'px';
    this.dotEl.style.top  = bestY + 'px';
    this.dotEl.style.background = `rgb(${this.pickerR},${this.pickerG},${this.pickerB})`;
  }

  _handleSpectrum(e) {
    if (!this.specCanvas || !this.specCtx || !this.dotEl) return;
    const rect = this.specCanvas.getBoundingClientRect();
    const ev   = e.touches ? e.touches[0] : e;
    const x = Math.max(0, Math.min(ev.clientX - rect.left,  rect.width  - 1));
    const y = Math.max(0, Math.min(ev.clientY - rect.top,   rect.height - 1));
    const px = Math.round(x * this.specCanvas.width  / rect.width);
    const py = Math.round(y * this.specCanvas.height / rect.height);
    const p  = this.specCtx.getImageData(px, py, 1, 1).data;
    this.dotEl.style.left = x + 'px';
    this.dotEl.style.top  = y + 'px';
    this.dotEl.style.background = `rgb(${p[0]},${p[1]},${p[2]})`;
    this._setColor(p[0], p[1], p[2], 'spectrum');
  }

  // ════════════════════════════════════════════
  //  UTILITÁRIOS
  // ════════════════════════════════════════════
  _clamp(v)       { return Math.max(0, Math.min(255, Math.round(v))); }
  _toHex2(n)      { return n.toString(16).padStart(2,'0').toUpperCase(); }
  _hexToRgb(hex)  {
    const h = hex.replace('#','');
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  _rgbToHex(rgb) {
    if (!rgb) return null;
    const m = rgb.replace(/\s+/g,'').match(/^rgba?\((\d+),(\d+),(\d+)/i);
    if (!m) return null;
    return '#' + [1,2,3].map(i => parseInt(m[i]).toString(16).padStart(2,'0')).join('');
  }
  _isLight(hex) {
    const h = hex.replace('#','');
    if (h.length < 6) return false;
    const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
    return (r*299 + g*587 + b*114) / 1000 > 180;
  }
  _contrast(hex) {
    const h = hex.replace('#','');
    if (h.length < 6) return '#111111';
    const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
    return (r*299 + g*587 + b*114) / 1000 > 128 ? '#111111' : '#FFFFFF';
  }
  _isValidBg(color) {
    if (!color) return false;
    if (color === 'transparent') return false;
    if (color === 'rgba(0, 0, 0, 0)') return false;
    if (color === '#ffffff' || color === '#FFFFFF') return false;
    return true;
  }

  destroy() {}
}

const coresPlugin = new CoresPlugin();
