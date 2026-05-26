class AssembleiaSync {
    constructor() {
        this.ano = null;
        this.isLoggedIn = false;
        this.isSyncing = false;
        this.autoSaveTimeout = null;
        this.lastSavedDataJSON = '{}';
        this.SAVE_DELAY = 2500;
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            setTimeout(() => this.setup(), 200);
        }
    }

    setup() {
        this.detectAno();
        this.checkLoginStatus();

        if (this.isLoggedIn) {
            this.loadFromSupabase();
        }

        window.addEventListener('assembleia:recordchange', () => {
            this.scheduleAutoSave();
        });

        document.addEventListener('input', (e) => {
            if (e.target.closest('.clickable-asmb') || e.target.closest('.editor')) {
                this.scheduleAutoSave();
            }
        });

        document.addEventListener('focusout', (e) => {
            if (e.target.closest('.clickable-asmb') || e.target.closest('.editor')) {
                this.scheduleAutoSave();
            }
        });

        setTimeout(() => this.scheduleAutoSave(), 3000);
    }

    detectAno() {
        this.ano = document.documentElement.dataset.programYear || '2026';
    }

    checkLoginStatus() {
        this.isLoggedIn = !!localStorage.getItem('supabase_user');
    }

    scheduleAutoSave() {
        if (!this.isLoggedIn) return;
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            this.executeAutoSave();
        }, this.SAVE_DELAY);
    }

    collectAnnotationsFromLocalStorage() {
        const anotacoes = {};
        const prefixo = `${this.ano}-`;
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(prefixo)) {
                anotacoes[key] = localStorage.getItem(key);
            }
        }
        return anotacoes;
    }

    async executeAutoSave() {
        if (!window.SupabaseSync || typeof window.SupabaseSync.salvarAssembleiaAnotacoes !== 'function') {
            this.scheduleAutoSave();
            return;
        }

        if (this.isSyncing || !this.isLoggedIn) return;

        this.isSyncing = true;

        try {
            const anotacoes = this.collectAnnotationsFromLocalStorage();
            const anotacoesJSON = JSON.stringify(anotacoes);

            if (anotacoesJSON === this.lastSavedDataJSON) {
                this.isSyncing = false;
                return;
            }

            const result = await window.SupabaseSync.salvarAssembleiaAnotacoes(this.ano, anotacoes);

            if (result.success) {
                this.lastSavedDataJSON = anotacoesJSON;
            }
        } catch (error) {
        } finally {
            this.isSyncing = false;
        }
    }

    async loadFromSupabase(force = false) {
        if (!window.SupabaseSync || typeof window.SupabaseSync.carregarAssembleiaAnotacoes !== 'function') {
            setTimeout(() => this.loadFromSupabase(force), 500);
            return;
        }

        const loadFlag = `asmb_loaded_${this.ano}`;
        if (!force && sessionStorage.getItem(loadFlag)) return;

        try {
            const anotacoes = await window.SupabaseSync.carregarAssembleiaAnotacoes(this.ano);

            if (anotacoes && Object.keys(anotacoes).length > 0) {
                let localChangesExist = false;
                
                for (const [key, value] of Object.entries(anotacoes)) {
                    if (localStorage.getItem(key) !== value) {
                        localStorage.setItem(key, value);
                        localChangesExist = true;
                    }
                }

                if (localChangesExist || force) {
                    sessionStorage.setItem(loadFlag, 'true');
                    if (window.AssembleiaClickables && typeof window.AssembleiaClickables.refresh === 'function') {
                        window.AssembleiaClickables.refresh();
                    } else {
                        location.reload();
                    }
                }
            } else if (force) {
                if (window.AssembleiaClickables && typeof window.AssembleiaClickables.refresh === 'function') {
                    window.AssembleiaClickables.refresh();
                }
            }
        } catch (error) {
        }
    }
}

window.assembleiaSync = new AssembleiaSync();