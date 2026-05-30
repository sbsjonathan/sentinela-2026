class UnifiedLoadManager {
    constructor() {
        this.editor = null;
        this.currentSemana = null;
        this.isLoggedIn = false;
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            setTimeout(() => this.setup(), 100);
        }
    }

    async setup() {
        this.detectSemana();
        this.checkLoginStatus();
        await this.waitForEditor();
        this.loadInitialContentFromCache();
        if (this.isLoggedIn) {
            this.syncWithSupabase();
        }
        this.setupListeners();
    }

    detectSemana() {
        if (window.semanaAtual) {
            this.currentSemana = window.semanaAtual;
        } else {
            const urlParams = new URLSearchParams(window.location.search);
            const semanaURL = urlParams.get('semana');
            if (semanaURL) {
                this.currentSemana = semanaURL;
            } else {
                const d = new Date();
                const diaDaSemana = d.getDay();
                const diasParaSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
                const segundaFeira = new Date(d);
                segundaFeira.setDate(d.getDate() + diasParaSegunda);
                const day = String(segundaFeira.getDate()).padStart(2, '0');
                const month = String(segundaFeira.getMonth() + 1).padStart(2, '0');
                this.currentSemana = `${day}-${month}`;
            }
        }
        window.semanaAtual = this.currentSemana;
        this.updateSemanaIndicator();
    }

    checkLoginStatus() {
        if (window.SupabaseSync && typeof window.SupabaseSync.isLoggedIn === 'function') {
            this.isLoggedIn = window.SupabaseSync.isLoggedIn();
        } else {
            this.isLoggedIn = !!localStorage.getItem('supabase_user');
        }
    }

    waitForEditor() {
        return new Promise((resolve) => {
            const check = () => {
                const editorElement = document.getElementById('editor');
                const ready =
                    editorElement &&
                    typeof M6_Tree !== 'undefined' &&
                    typeof M5_Factory !== 'undefined' &&
                    typeof M3_TextModel !== 'undefined';

                if (ready) {
                    this.editor = editorElement;
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    obterRaizesEditor() {
        if (!this.editor) return [];
        return Array.from(this.editor.children).filter((node) =>
            node.classList?.contains('node-paragraph') ||
            node.classList?.contains('node-text') ||
            node.classList?.contains('node-toggle')
        );
    }

    exportTree() {
        if (!this.editor || typeof M6_Tree === 'undefined') return [];
        return this.obterRaizesEditor().map((node) => M6_Tree.toTree(node)).filter(Boolean);
    }

    exportHTML() {
        return this.editor ? this.editor.innerHTML : '';
    }

    serializePayload() {
        return {
            formato: 'v23-tree',
            versao: '2.0',
            semana: this.currentSemana,
            timestamp: Date.now(),
            tree: this.exportTree(),
            html: this.exportHTML()
        };
    }

    serializeForCompare() {
        try {
            return JSON.stringify(this.serializePayload());
        } catch (e) {
            return this.exportHTML().trim();
        }
    }

    parseSavedContent(raw) {
        if (!raw || typeof raw !== 'string') return null;
        const trimmed = raw.trim();
        if (!trimmed) return null;

        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (e) {}

        return { html: trimmed, formato: 'legacy-html' };
    }

    looksLikeV23Markup(html) {
        return /class\s*=\s*["'][^"']*(node-paragraph|node-toggle|node-text)/i.test(html || '');
    }

    ensureRoot() {
        if (!this.editor) return;
        if (this.editor.children.length) return;
        if (typeof M5_Factory !== 'undefined') {
            this.editor.appendChild(M5_Factory.para(''));
        }
        if (typeof M3_TextModel !== 'undefined') M3_TextModel.syncAll();
        if (typeof M11_Layout !== 'undefined') M11_Layout.schedule(2);
    }

    applyTree(tree) {
        if (!Array.isArray(tree) || !this.editor || typeof M6_Tree === 'undefined') return false;

        this.editor.innerHTML = '';
        tree.forEach((item) => {
            const bloco = M6_Tree.fromTree(item, null, false);
            if (bloco) this.editor.appendChild(bloco);
        });

        this.ensureRoot();
        if (typeof M3_TextModel !== 'undefined') M3_TextModel.syncAll();
        if (typeof M11_Layout !== 'undefined') M11_Layout.schedule(2);
        return true;
    }

    applyHTML(html) {
        if (typeof html !== 'string' || !this.editor) return false;

        const trimmed = html.trim();
        this.editor.innerHTML = '';

        if (!trimmed) {
            this.ensureRoot();
            return true;
        }

        if (this.looksLikeV23Markup(trimmed)) {
            this.editor.innerHTML = trimmed;
        } else if (typeof M5_Factory !== 'undefined' && typeof M2_Query !== 'undefined') {
            const bloco = M5_Factory.para('');
            const editable = M2_Query.getParC(bloco);
            if (editable) editable.innerHTML = trimmed;
            this.editor.appendChild(bloco);
        } else {
            this.editor.innerHTML = trimmed;
        }

        this.ensureRoot();
        if (typeof M3_TextModel !== 'undefined') M3_TextModel.syncAll();
        if (typeof M11_Layout !== 'undefined') M11_Layout.schedule(2);
        return true;
    }

    applyContentToEditor(content) {
        if (!this.editor || !content) return false;
        const parsed = typeof content === 'string' ? this.parseSavedContent(content) : content;
        if (!parsed) return false;

        let ok = false;
        if (Array.isArray(parsed.tree) && parsed.tree.length) {
            ok = this.applyTree(parsed.tree);
        } else if (typeof parsed.html === 'string') {
            ok = this.applyHTML(parsed.html);
        }

        if (ok) {
            this.editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }

        return ok;
    }

    loadInitialContentFromCache() {
        try {
            const key = `richtext_cache_${this.currentSemana}`;
            const local = localStorage.getItem(key);
            if (local) {
                this.applyContentToEditor(local);
            } else if (window.cacheRichText && typeof window.cacheRichText.carregarDados === 'function') {
                const cachedData = window.cacheRichText.carregarDados();
                if (cachedData) {
                    this.applyContentToEditor(cachedData);
                }
            } else if (window.cacheRichText && typeof window.cacheRichText.carregar === 'function') {
                const cachedContent = window.cacheRichText.carregar();
                if (cachedContent && cachedContent.trim()) {
                    this.applyContentToEditor(cachedContent);
                }
            }
        } catch (e) {}
    }

    async syncWithSupabase() {
        this.showFeedback('Sincronizando...', 'saving');

        if (!window.SupabaseSync || typeof window.SupabaseSync.carregarRichtextAnotacoes !== 'function') {
            setTimeout(() => this.syncWithSupabase(), 1000);
            return;
        }

        try {
            const supabaseContent = await window.SupabaseSync.carregarRichtextAnotacoes(this.currentSemana);

            if (!supabaseContent || !supabaseContent.trim()) {
                this.showFeedback('Salvo localmente', 'local');
                return;
            }

            const currentEditorContent = this.serializeForCompare();

            if (supabaseContent !== currentEditorContent) {
                const applied = this.applyContentToEditor(supabaseContent);

                if (applied) {
                    const parsed = this.parseSavedContent(supabaseContent);
                    const cachePayload = parsed && typeof parsed === 'object'
                        ? {
                            formato: parsed.formato || 'v23-tree',
                            versao: parsed.versao || '2.0',
                            semana: this.currentSemana,
                            timestamp: Date.now(),
                            tree: Array.isArray(parsed.tree) ? parsed.tree : this.exportTree(),
                            html: typeof parsed.html === 'string' ? parsed.html : this.exportHTML()
                        }
                        : this.serializePayload();

                    const key = `richtext_cache_${this.currentSemana}`;
                    localStorage.setItem(key, JSON.stringify(cachePayload));

                    if (window.cacheRichText && typeof window.cacheRichText.salvarCache === 'function') {
                        window.cacheRichText.salvarCache(cachePayload.html || '');
                    }

                    if (window.AutoSaveManager) {
                        window.AutoSaveManager.lastSavedContent = supabaseContent;
                    }
                }

                this.showFeedback('✅ Sincronizado', 'success');
            } else {
                this.showFeedback('✅ Sincronizado', 'success');
            }
        } catch (e) {
            this.showFeedback('❌ Erro de Sincronização', 'error');
        }
    }

    setupListeners() {
        window.addEventListener('storage', (e) => {
            if (e.key === 'supabase_user') {
                const wasLoggedIn = this.isLoggedIn;
                this.checkLoginStatus();
                if (!wasLoggedIn && this.isLoggedIn) {
                    this.syncWithSupabase();
                }
            }
        });
    }

    updateSemanaIndicator() {
        const indicator = document.getElementById('semana-indicator');
        if (indicator) indicator.textContent = `Semana: ${this.currentSemana}`;
    }

    showFeedback(message, type) {
        const statusDiv = document.getElementById('save-status');
        if (statusDiv) {
            statusDiv.textContent = message;
            statusDiv.className = `save-status show ${type}`;
            setTimeout(() => statusDiv.classList.remove('show'), 3000);
            return;
        }

        const event = new CustomEvent('editor:save-status', {
            detail: { message, type, duration: 3000 }
        });
        window.dispatchEvent(event);
    }
}

window.UnifiedLoadManager = new UnifiedLoadManager();
