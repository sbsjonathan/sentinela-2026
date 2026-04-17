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
        this.observer = null;
        this.isApplyingRemote = false;
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
        this.setupStructureObserver();
        this.monitorLoginChanges();
        this.restoreLocalContent();
        this.lastSavedContent = this.serializeForRemote();
    }

    waitForEditor() {
        return new Promise((resolve) => {
            const tryFind = () => {
                const el = document.getElementById('editor');
                const ready =
                    el &&
                    typeof M6_Tree !== 'undefined' &&
                    typeof M5_Factory !== 'undefined' &&
                    typeof M3_TextModel !== 'undefined';

                if (ready) {
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

    serializeForRemote() {
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
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        } catch (e) {}

        return { html: trimmed, formato: 'legacy-html' };
    }

    looksLikeV23Markup(html) {
        return /class\s*=\s*["'][^"']*(node-paragraph|node-toggle|node-text)/i.test(html || '');
    }

    ensureRoot() {
        if (!this.editor) return;
        if (this.editor.children.length) return;
        const bloco = typeof M5_Factory !== 'undefined' ? M5_Factory.para('') : null;
        if (bloco) this.editor.appendChild(bloco);
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

    applySavedContent(raw) {
        const parsed = typeof raw === 'string' ? this.parseSavedContent(raw) : raw;
        if (!parsed) return false;

        this.isApplyingRemote = true;
        try {
            if (Array.isArray(parsed.tree) && parsed.tree.length) {
                return this.applyTree(parsed.tree);
            }
            if (typeof parsed.html === 'string') {
                return this.applyHTML(parsed.html);
            }
            return false;
        } finally {
            this.isApplyingRemote = false;
        }
    }

    setupAutoSave() {
        if (!this.editor) return;
        const onChange = () => this.onContentChange();
        const onBlur = () => this.onFocusLost();

        this.editor.addEventListener('input', onChange);
        this.editor.addEventListener('keyup', onChange);
        this.editor.addEventListener('paste', onChange);
        this.editor.addEventListener('cut', onChange);
        this.editor.addEventListener('blur', onBlur, true);

        window.addEventListener('beforeunload', () => this.onPageUnload());
        window.addEventListener('blur', () => this.onPageUnload());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.onPageUnload();
        });
    }

    setupStructureObserver() {
        if (!this.editor || this.observer) return;

        this.observer = new MutationObserver(() => {
            if (this.isPaused || this.isApplyingRemote) return;
            this.onContentChange();
        });

        this.observer.observe(this.editor, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['data-open', 'class', 'hidden', 'aria-expanded']
        });
    }

    restoreLocalContent() {
        try {
            if (!this.editor) return;
            const key = `richtext_cache_${this.currentSemana || 'semana'}`;
            const local = localStorage.getItem(key);
            if (!local) return;

            const currentPayload = this.serializePayload();
            const currentHasContent =
                (Array.isArray(currentPayload.tree) && currentPayload.tree.length > 1) ||
                ((currentPayload.html || '').replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/gi, '').trim().length > 0);

            if (currentHasContent) return;

            if (this.applySavedContent(local)) {
                this.lastSavedContent = this.serializeForRemote();
                this.showLocalSaveFeedback();
            }
        } catch (e) {}
    }

    onContentChange() {
        if (this.isPaused || this.isApplyingRemote) return;
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            this.executeAutoSave('input');
        }, this.SAVE_DELAY);
    }

    onFocusLost() {
        if (this.isPaused || this.isApplyingRemote) return;
        clearTimeout(this.autoSaveTimeout);
        setTimeout(() => {
            this.executeAutoSave('blur');
        }, 500);
    }

    onPageUnload() {
        if (this.isPaused || this.isApplyingRemote) return;
        this.executeAutoSave('unload', true);
    }

    async executeAutoSave(trigger = 'auto', isSync = false) {
        if (this.saveInProgress) return;
        if (!this.editor || !this.currentSemana) return;

        const payload = this.serializePayload();
        const remoteContent = JSON.stringify(payload);
        const meaningfulHTML = (payload.html || '').replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/gi, '').trim();
        const hasTree = Array.isArray(payload.tree) && payload.tree.length > 0;

        if (!hasTree && meaningfulHTML.length < this.MIN_CONTENT_LENGTH) return;
        if (remoteContent === this.lastSavedContent && trigger !== 'unload') return;

        this.saveInProgress = true;
        try {
            this.saveToLocal(payload);

            if (this.isLoggedIn) {
                this.showSavingFeedback();
                await this.saveToSupabase(remoteContent, trigger, isSync);
                this.lastSavedContent = remoteContent;
                this.showSavedFeedback();
            } else {
                this.lastSavedContent = remoteContent;
                this.showLocalSaveFeedback();
            }
        } catch (e) {
            this.showErrorFeedback();
        } finally {
            this.saveInProgress = false;
        }
    }

    saveToLocal(payload) {
        try {
            const key = `richtext_cache_${this.currentSemana || 'semana'}`;
            localStorage.setItem(key, JSON.stringify(payload));
            if (typeof window.cacheRichText !== 'undefined' && typeof window.cacheRichText.salvarCache === 'function') {
                window.cacheRichText.salvarCache(payload.html || '');
            }
        } catch (e) {}
    }

    async saveToSupabase(content, trigger, isSync) {
        if (typeof window.SupabaseSync === 'undefined' || !window.SupabaseSync) return;
        if (typeof window.SupabaseSync.salvarRichtextAnotacoes !== 'function') return;
        await window.SupabaseSync.salvarRichtextAnotacoes(this.currentSemana, content);
    }

    triggerFeedbackEvent(message, type, duration = null) {
        const event = new CustomEvent('editor:save-status', {
            detail: { message, type, duration }
        });
        window.dispatchEvent(event);
    }

    showSavingFeedback() {
        this.triggerFeedbackEvent('☁️ Salvando...', 'saving');
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
            delay: this.SAVE_DELAY,
            roots: this.obterRaizesEditor().length
        };
    }
}

window.AutoSaveManager = new AutoSaveManager();
window.forceAutoSave = () => window.AutoSaveManager.forceAutoSave();
window.pauseAutoSave = () => window.AutoSaveManager.pauseAutoSave();
window.resumeAutoSave = () => window.AutoSaveManager.resumeAutoSave();
window.autoSaveStatus = () => window.AutoSaveManager.getStatus();
window.debugAutoSave = () => window.AutoSaveManager.debug();
