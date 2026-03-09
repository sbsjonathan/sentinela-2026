class SelectAllPlugin {
  constructor() {
    this.name = 'selectall';
    this.slotId = 6;
    this.editor = null;
    this.button = null;
    this.longPressTimer = null;
    this.longPressTriggered = false;
    this._retryMs = 100;
    this.autoRegister();
  }

  autoRegister() {
    const wait = () => {
      if (window.toolbar) this.waitForSlot();
      else setTimeout(wait, this._retryMs);
    };
    wait();
  }

  waitForSlot() {
    const slotEl = document.getElementById(`plugin-slot-${this.slotId}`);
    if (!slotEl) {
      setTimeout(() => this.waitForSlot(), this._retryMs);
      return;
    }
    this.register();
  }

  register() {
    const html = `
      <div class="selectall-plugin">
        <button id="selectall-btn" class="selectall-btn" title="Selecionar tudo" aria-label="Selecionar tudo">
          <svg class="selectall-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 3H5a2 2 0 0 0-2 2v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M16 3h3a2 2 0 0 1 2 2v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M8 21H5a2 2 0 0 1-2-2v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M8 8h8v8H8z" fill="none" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
      </div>
    `;

    const ok = window.toolbar.registerPlugin(this.name, this.slotId, this, html);
    if (!ok) {
      setTimeout(() => this.register(), this._retryMs);
      return;
    }

    this.button = document.getElementById('selectall-btn');
    this.wireEvents();
    this.waitForEditor();
  }

  waitForEditor() {
    const check = () => {
      if (window.editor && window.editor.editorElement) {
        this.editor = window.editor;
      } else {
        setTimeout(check, this._retryMs);
      }
    };
    check();
  }

  wireEvents() {
    if (!this.button) return;

    const startPress = (e) => {
      e.preventDefault();
      this.longPressTriggered = false;
      this.longPressTimer = setTimeout(() => {
        this.longPressTriggered = true;
        this.copyAll();
      }, 550);
    };

    const endPress = (e) => {
      e.preventDefault();
      clearTimeout(this.longPressTimer);
      if (!this.longPressTriggered) {
        this.selectAll();
      }
    };

    const cancelPress = () => clearTimeout(this.longPressTimer);

    this.button.addEventListener('mousedown', startPress, { passive: false });
    this.button.addEventListener('mouseup', endPress, { passive: false });
    this.button.addEventListener('mouseleave', cancelPress, { passive: true });

    this.button.addEventListener('touchstart', startPress, { passive: false });
    this.button.addEventListener('touchend', endPress, { passive: false });
    this.button.addEventListener('touchcancel', cancelPress, { passive: true });
  }

  selectAll() {
    if (!this.editor?.editorElement) return;
    const root = this.editor.editorElement;
    root.focus();

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(root);
    selection.removeAllRanges();
    selection.addRange(range);

    this.flash('selected');
  }

  async copyAll() {
    if (!this.editor?.editorElement) return;

    const text = this.editor.editorElement.innerText?.trim() || '';
    if (!text) {
      this.flash('empty');
      return;
    }

    let copied = false;

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch (_) {}
    }

    if (!copied) {
      this.selectAll();
      copied = document.execCommand('copy');
    }

    this.flash(copied ? 'copied' : 'error');
  }

  flash(state) {
    if (!this.button) return;
    this.button.classList.remove('is-selected', 'is-copied', 'is-empty', 'is-error');

    const classByState = {
      selected: 'is-selected',
      copied: 'is-copied',
      empty: 'is-empty',
      error: 'is-error'
    };

    const stateClass = classByState[state];
    if (!stateClass) return;

    this.button.classList.add(stateClass);
    setTimeout(() => this.button?.classList.remove(stateClass), 600);
  }

  destroy() {
    clearTimeout(this.longPressTimer);
  }
}

const selectAllPlugin = new SelectAllPlugin();
