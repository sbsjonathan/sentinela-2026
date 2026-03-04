class AutoSaveManager {
    constructor() {
        this.editor = null;
        this.currentSemana = null;
        this.isLoggedIn = false;
        this.autoSaveTimeout = null;
        this.lastSavedContent = '';
        this.saveInProgress = false;
        this.isPaused = false;
        this.SAVE_DELAY = 350;
        this.MIN_CONTENT_LENGTH = 0;
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            setTimeout(() => this.setup(), 0);
        }
    }

    async setup() {
        await this.waitForEditor();
        this.detectSemana();
        this.checkLoginStatus();
        this.setupAutoSave();
        this.monitorLoginChanges();
        this.restoreLocalContent();
    }

    waitForEditor() {
        return new Promise((resolve) => {
            const tryFind = () => {
                const el = document.getElementById('text-editor');
                if (el) {
                    this.editor = el;
                    resolve();
                } else {
                    setTimeout(tryFind, 100);
                }
            };
            tryFind();
        });
    }

    detectSemana() {
        try {
            if (window.semanaAtual) {
                this.currentSemana = window.semanaAtual;
                return;
            }
            const urlParams = new URLSearchParams(window.location.search);
            const semanaURL = urlParams.get('semana');
            if (semanaURL) {
                this.currentSemana = semanaURL;
                window.semanaAtual = semanaURL;
                return;
            }
            this.currentSemana = this.getFallbackWeek();
            window.semanaAtual = this.currentSemana;
        } catch (e) {
            this.currentSemana = this.getFallbackWeek();
        }
    }

    getFallbackWeek() {
        const d = new Date();
        const diaDaSemana = d.getDay();
        const diasParaSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
        const segundaFeira = new Date(d);
        segundaFeira.setDate(d.getDate() + diasParaSegunda);
        const day = String(segundaFeira.getDate()).padStart(2, '0');
        const month = String(segundaFeira.getMonth() + 1).padStart(2, '0');
        return `${day}-${month}`;
    }

    checkLoginStatus() {
        try {
            if (window.SupabaseSync && typeof window.SupabaseSync.isLoggedIn === 'function') {
                this.isLoggedIn = window.SupabaseSync.isLoggedIn();
            } else {
                this.isLoggedIn = !!localStorage.getItem('supabase_user');
            }
        } catch (e) {
            this.isLoggedIn = false;
        }
    }

    monitorLoginChanges() {
        setInterval(() => this.checkLoginStatus(), 2000);
    }

    setupAutoSave() {
        if (!this.editor) return;
        const onChange = () => this.onContentChange();
        const onBlur = () => this.onFocusLost();

        this.editor.addEventListener('input', onChange);
        this.editor.addEventListener('keyup', onChange);
        this.editor.addEventListener('paste', onChange);
        this.editor.addEventListener('cut', onChange);
        this.editor.addEventListener('blur', onBlur);

        window.addEventListener('beforeunload', () => this.onPageUnload());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.onPageUnload();
        });
    }

    restoreLocalContent() {
        try {
            if (!this.editor) return;
            const key = `richtext_cache_${this.currentSemana || 'semana'}`;
            const local = localStorage.getItem(key);
            if (!local) return;

            const current = (this.editor.innerHTML || '').trim();
            if (current.length > 0) return;

            try {
                const parsed = JSON.parse(local);
                if (parsed.html) {
                    this.editor.innerHTML = parsed.html;
                    this.lastSavedContent = parsed.html;
                    this.showLocalSaveFeedback();
                }
            } catch (e) {
                this.editor.innerHTML = local;
                this.lastSavedContent = local;
            }
        } catch (e) {}
    }

    onContentChange() {
        if (this.isPaused) return;
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            this.executeAutoSave('input');
        }, this.SAVE_DELAY);
    }

    onFocusLost() {
        if (this.isPaused) return;
        clearTimeout(this.autoSaveTimeout);
        setTimeout(() => {
            this.executeAutoSave('blur');
        }, 500);
    }

    onPageUnload() {
        if (this.isPaused) return;
        this.executeAutoSave('unload', true);
    }

    async executeAutoSave(trigger = 'auto', isSync = false) {
        if (this.saveInProgress) return;
        if (!this.editor || !this.currentSemana) return;

        const content = (this.editor.innerHTML || '').trim();
        if (content.length < this.MIN_CONTENT_LENGTH) return;
        if (content === this.lastSavedContent && trigger !== 'unload') return;

        this.saveInProgress = true;
        try {
            this.saveToLocal(content);
            
            if (this.isLoggedIn) {
                this.showSavingFeedback();
                await this.saveToSupabase(content, trigger, isSync);
                this.lastSavedContent = content;
                this.showSavedFeedback();
            } else {
                this.lastSavedContent = content;
                this.showLocalSaveFeedback();
            }
        } catch (e) {
            this.showErrorFeedback();
        } finally {
            this.saveInProgress = false;
        }
    }

    saveToLocal(content) {
        try {
            const key = `richtext_cache_${this.currentSemana || 'semana'}`;
            const dados = {
                html: content,
                timestamp: new Date().getTime(),
                versao: '1.0'
            };
            localStorage.setItem(key, JSON.stringify(dados));
            if (typeof window.cacheRichText !== 'undefined' && typeof window.cacheRichText.salvarCache === 'function') {
                window.cacheRichText.salvarCache(content);
            }
        } catch (e) {}
    }

    async saveToSupabase(content, trigger, isSync) {
        if (typeof window.SupabaseSync === 'undefined' || !window.SupabaseSync) return;
        if (typeof window.SupabaseSync.salvarRichtextAnotacoes !== 'function') return;
        await window.SupabaseSync.salvarRichtextAnotacoes(this.currentSemana, content);
    }

    // === NOVA LÓGICA DE FEEDBACK DESACOPLADA ===
    // Agora o sistema apenas dispara eventos na janela do navegador

    triggerFeedbackEvent(message, type, duration = null) {
        const event = new CustomEvent('editor:save-status', {
            detail: { message, type, duration }
        });
        window.dispatchEvent(event);
    }

    showSavingFeedback() {
        this.triggerFeedbackEvent('☁️ Salvando...', 'saving'); // Sem duração = fica na tela
    }

    showSavedFeedback() {
        this.triggerFeedbackEvent('✅ Salvo na nuvem', 'success', 3000);
    }

    showLocalSaveFeedback() {
        this.triggerFeedbackEvent('💾 Salvo localmente', 'local', 2000);
    }

    showErrorFeedback() {
        this.triggerFeedbackEvent('❌ Erro ao salvar', 'error', 4000);
    }

    forceAutoSave() {
        clearTimeout(this.autoSaveTimeout);
        return this.executeAutoSave('force');
    }

    pauseAutoSave() {
        this.isPaused = true;
        clearTimeout(this.autoSaveTimeout);
        this.triggerFeedbackEvent('⏸️ Auto-save pausado', 'local', 2000);
    }

    resumeAutoSave() {
        this.isPaused = false;
        this.triggerFeedbackEvent('▶️ Auto-save ativo', 'success', 1500);
    }

    setDelay(ms) {
        const n = Number(ms);
        if (!Number.isFinite(n) || n < 0) return;
        this.SAVE_DELAY = Math.floor(n);
    }

    getStatus() {
        return {
            semana: this.currentSemana,
            loggedIn: this.isLoggedIn,
            paused: this.isPaused,
            saveInProgress: this.saveInProgress,
            delay: this.SAVE_DELAY
        };
    }

    debug() {
        return {
            editorFound: !!this.editor,
            semana: this.currentSemana,
            loggedIn: this.isLoggedIn,
            paused: this.isPaused,
            lastSavedLength: (this.lastSavedContent || '').length,
            saveInProgress: this.saveInProgress,
            delay: this.SAVE_DELAY
        };
    }
}

window.AutoSaveManager = new AutoSaveManager();
window.forceAutoSave = () => window.AutoSaveManager.forceAutoSave();
window.pauseAutoSave = () => window.AutoSaveManager.pauseAutoSave();
window.resumeAutoSave = () => window.AutoSaveManager.resumeAutoSave();
window.autoSaveStatus = () => window.AutoSaveManager.getStatus();
window.debugAutoSave = () => window.AutoSaveManager.debug();
