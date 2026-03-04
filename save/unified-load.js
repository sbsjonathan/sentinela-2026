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
        this.isLoggedIn = !!localStorage.getItem('supabase_user');
    }

    waitForEditor() {
        return new Promise((resolve) => {
            const check = () => {
                const editorElement = document.getElementById('text-editor');
                if (editorElement) {
                    this.editor = editorElement;
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    loadInitialContentFromCache() {
        try {
            const key = `richtext_cache_${this.currentSemana}`;
            const local = localStorage.getItem(key);
            if (local) {
                const parsed = JSON.parse(local);
                if (parsed.html && parsed.html.trim()) {
                    this.applyContentToEditor(parsed.html);
                }
            } else if (window.cacheRichText) {
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

            const currentEditorContent = this.editor.innerHTML;

            if (supabaseContent !== currentEditorContent) {
                this.applyContentToEditor(supabaseContent);

                const key = `richtext_cache_${this.currentSemana}`;
                const dados = {
                    html: supabaseContent,
                    timestamp: new Date().getTime(),
                    versao: '1.0'
                };
                localStorage.setItem(key, JSON.stringify(dados));

                if (window.cacheRichText && typeof window.cacheRichText.salvarCache === 'function') {
                    window.cacheRichText.salvarCache(supabaseContent);
                }

                if (window.AutoSaveManager) {
                    window.AutoSaveManager.lastSavedContent = supabaseContent;
                }

                this.showFeedback('✅ Sincronizado', 'success');
            } else {
                this.showFeedback('✅ Sincronizado', 'success');
            }
        } catch (e) {
            this.showFeedback('❌ Erro de Sincronização', 'error');
        }
    }
    
    applyContentToEditor(content) {
        if (!this.editor) return;
        this.editor.innerHTML = content;
        this.editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
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
        }
    }
}

window.UnifiedLoadManager = new UnifiedLoadManager();
