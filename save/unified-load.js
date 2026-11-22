class UnifiedLoadManager {
    constructor() {
        this.editor = null; this.currentSemana = null; this.isLoggedIn = false;
        this.syncing = null; this.ready = this.setup();
    }
    async setup() {
        if (!window.cacheRichText) return;
        this.store = window.cacheRichText;
        await this.store.ready;
        // CacheRichText already restored the local document exactly once.
        this.editor = document.getElementById('editor');
        this.currentSemana = this.store.semanaAtual();
        this.updateSemanaIndicator();
        this.checkLoginStatus();
        if (this.isLoggedIn) this.syncWithSupabase();
    }
    checkLoginStatus() {
        try { this.isLoggedIn = typeof window.SupabaseSync?.isLoggedIn === 'function' ? window.SupabaseSync.isLoggedIn() : !!localStorage.getItem('supabase_user'); }
        catch (_) { this.isLoggedIn = false; }
    }
    exportTree() { return this.store?.snapshot()?.payload.tree || []; }
    exportHTML() { return this.store?.snapshot()?.payload.html || ''; }
    serializePayload() { return this.store?.snapshot()?.payload || null; }
    serializeForCompare() { return this.store?.snapshot()?.key || ''; }
    parseSavedContent(raw) { return this.store?.parse(raw); }
    applyContentToEditor(raw) { return this.store?.applyContent(raw, { remote: true }); }
    loadInitialContentFromCache() { return this.store?.ready; }
    async syncWithSupabase() {
        if (!this.store || this.syncing) return this.syncing;
        const manager = window.AutoSaveManager;
        if (!manager) return;
        this.syncing = manager.ready.then(() => manager.syncCurrent());
        try { await this.syncing; } finally { this.syncing = null; }
    }
    updateSemanaIndicator() {
        const node = document.getElementById('semana-indicator');
        if (node) node.textContent = `Semana: ${this.currentSemana}`;
    }
}
window.UnifiedLoadManager = new UnifiedLoadManager();
