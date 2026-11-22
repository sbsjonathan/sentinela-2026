// The editor persists locally first. Downloads and uploads share a single queue
// so a stale read cannot replace typing or undo a newer upload.
class AutoSaveManager {
    constructor() {
        this.editor = null; this.currentSemana = null; this.isLoggedIn = false;
        this.lastSavedContent = ''; this.lastCloudKey = null; this.lastAckLocalKey = null;
        this.saveInProgress = false; this.isPaused = false; this.SAVE_DELAY = 350;
        this.pending = null; this.sending = null; this.accountId = null;
        this.retryDelay = 2000; this.retryTimer = null;
        this.ready = this.setup();
    }
    async setup() {
        if (!window.cacheRichText) return;
        this.store = window.cacheRichText;
        await this.store.ready;
        this.editor = document.getElementById('editor');
        this.currentSemana = this.store.semanaAtual();
        this.checkLoginStatus();
        const initial = this.store.snapshot();
        // Keep the editor's owner across auth changes, including while there
        // is typing in the DOM waiting for the local debounce to fire.
        try {
            this.editorAccount = this.storedOwner(initial);
            if (this.editorAccount === undefined) this.editorAccount = this.previousOwner(initial) ?? this.accountId;
        } catch (_) { this.editorAccount = false; }
        this.lastSavedContent = JSON.stringify(initial.payload);
        window.addEventListener('notes:stored', event => this.acceptSnapshot(event.detail));
        window.addEventListener('notes:external-updated', () => this.syncCurrent());
        window.addEventListener('online', () => this.syncCurrent());
        window.addEventListener('pageshow', () => this.syncCurrent());
        window.addEventListener('supabaseSessionChanged', () => this.syncCurrent());
        window.addEventListener('supabaseLogout', () => this.checkLoginStatus());
        window.addEventListener('storage', event => { if (event.key === 'supabase_user') this.syncCurrent(); });
        for (const name of ['pagehide', 'beforeunload', 'blur']) window.addEventListener(name, () => this.onPageUnload());
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.onPageUnload(); });
        if (this.store.hasPending(initial)) this.acceptSnapshot(initial);
    }
    checkLoginStatus() {
        let account = null;
        try {
            if (window.SupabaseSync?.isLoggedIn?.() !== false) account = JSON.parse(localStorage.getItem('supabase_user'))?.id || null;
        } catch (_) {}
        if (account !== this.accountId) {
            this.pending = null;
            this.lastCloudKey = null; this.lastAckLocalKey = null;
            this.lastRecovery = null;
            this.accountId = account;
            if (account) {
                try {
                    const saved = JSON.parse(localStorage.getItem(this.cloudStateKey('baseline')));
                    this.lastCloudKey = saved?.key ?? null;
                    this.lastAckLocalKey = saved?.localKey ?? this.lastCloudKey;
                } catch (_) {}
            }
        }
        this.isLoggedIn = !!account;
        return this.isLoggedIn;
    }
    cloudStateKey(kind) { return `richtext_cloud_${kind}_${encodeURIComponent(this.accountId)}_${this.currentSemana}`; }
    storedOwner(snapshot) {
        const token = snapshot.payload.localRevision;
        const owner = JSON.parse(localStorage.getItem('richtext_cloud_owner_' + this.currentSemana));
        if (owner && (token ? owner.token === token : owner.legacyKey === snapshot.key)) return owner.account;
    }
    previousOwner(snapshot) {
        // Older installations stored baselines per account, but just one
        // device draft per week. Never seed a different account from it.
        const prefix = 'richtext_cloud_baseline_', suffix = '_' + this.currentSemana;
        const accounts = [], matching = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith(prefix) || !key.endsWith(suffix)) continue;
            const account = decodeURIComponent(key.slice(prefix.length, -suffix.length));
            accounts.push(account);
            const baseline = JSON.parse(localStorage.getItem(key));
            if ([baseline?.key, baseline?.localKey].includes(snapshot.key)) matching.push(account);
        }
        const candidates = matching.length ? matching : accounts;
        // false marks an ambiguous old draft. Preserve it locally on restore.
        return candidates.length > 1 ? false : candidates[0];
    }
    rememberOwner(snapshot, account) {
        const token = snapshot.payload.localRevision;
        const owner = token ? { token, account } : { legacyKey: snapshot.key, account };
        localStorage.setItem('richtext_cloud_owner_' + this.currentSemana, JSON.stringify(owner));
    }
    draftOwner(snapshot, claim = false) {
        const stored = this.storedOwner(snapshot);
        const owner = stored ?? this.editorAccount ?? this.accountId;
        if (claim && (stored === undefined || stored !== owner)) this.rememberOwner(snapshot, owner);
        this.editorAccount = owner;
        return owner;
    }
    parseRemote(raw) {
        if (raw === null) return null;
        if (typeof raw !== 'string') throw new Error('A anotação da nuvem está inválida.');
        const value = raw.trim() ? this.store.parse(raw) : { html: '', formato: 'legacy-html' };
        if (!value || (typeof value.html !== 'string' && !(Array.isArray(value.tree) && value.tree.length))) throw new Error('A anotação da nuvem está inválida.');
        return value;
    }
    preserveCopy(local, external, reason) {
        const copy = { type: 'notes-cloud-recovery', account: this.accountId, semana: this.currentSemana, local, external, reason };
        const pair = JSON.stringify(copy);
        if (this.lastRecovery?.pair === pair && localStorage.getItem(this.lastRecovery.id)) return;
        const id = `richtext_recovery_${this.currentSemana}_${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem(id, JSON.stringify({ ...copy, createdAt: Date.now() }));
        this.lastRecovery = { id, pair };
    }
    archivePreviousComparison() {
        const marker = this.cloudStateKey('conflict');
        const raw = localStorage.getItem(marker);
        if (raw === null) return;
        // Older versions could write a comparison before there was room for
        // its recovery copy. Keep the exact original, including both revisions.
        const id = `richtext_recovery_${this.currentSemana}_${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        let data;
        try { data = JSON.parse(raw); } catch (_) { data = { original: raw }; }
        localStorage.setItem(id, JSON.stringify({ ...data, type: 'notes-cloud-recovery', createdAt: Date.now() }));
        localStorage.removeItem(marker);
    }
    acknowledgeRemote(snapshot, remoteKey = snapshot?.key) {
        if (!snapshot || !this.store.isStored(snapshot)) return;
        this.rememberOwner(snapshot, this.accountId);
        this.editorAccount = this.accountId;
        const baseline = snapshot.key === remoteKey ? { key: remoteKey } : { key: remoteKey, localKey: snapshot.key };
        localStorage.setItem(this.cloudStateKey('baseline'), JSON.stringify(baseline));
        this.lastCloudKey = remoteKey;
        this.lastAckLocalKey = snapshot.key;
        this.lastSavedContent = JSON.stringify(snapshot.payload);
        this.store.acknowledge(snapshot);
    }
    acceptSnapshot(snapshot) {
        if (!snapshot || !this.store.isStored(snapshot) || !this.store.hasPending(snapshot)) return;
        this.lastSavedContent = JSON.stringify(snapshot.payload);
        this.checkLoginStatus();
        try { this.draftOwner(snapshot, true); } catch (_) { /* Recheck before any upload. */ }
        this.pending = snapshot;
        return this.drain();
    }
    syncCurrent() {
        if (!this.store || !this.editor || !this.checkLoginStatus()) return;
        const snapshot = this.store.flush();
        if (!snapshot) return;
        this.pending = snapshot;
        return this.drain();
    }
    async reconcile(snapshot, session) {
        const api = window.SupabaseSync;
        const sessionMatches = () => session === localStorage.getItem('supabase_user');
        if (!sessionMatches() || this.isPaused || this.store.getConflict?.()) return;
        this.archivePreviousComparison();
        for (let attempt = 0; attempt < 3; attempt++) {
            if (!sessionMatches() || this.isPaused) return;
            const raw = await api.carregarRichtextAnotacoes(this.currentSemana);
            if (!sessionMatches() || this.isPaused) return;
            const latest = this.store.flush();
            if (!latest || this.store.getConflict?.()) return;
            if (latest.key !== snapshot.key || latest.revision !== snapshot.revision) {
                this.pending = latest;
                return;
            }
            const remote = this.parseRemote(raw);
            const remoteKey = remote === null ? null : this.store.contentKey(remote);
            if (remoteKey === snapshot.key) {
                this.acknowledgeRemote(snapshot, remoteKey);
                return;
            }

            const dirty = this.store.hasPending(snapshot);
            const owner = this.draftOwner(snapshot, dirty);
            const foreign = owner != null && owner !== this.accountId;
            // Legacy HTML can render as an equivalent structured editor tree
            // with a different key. Leave an already imported document in place.
            if (!foreign && !dirty && remoteKey === this.lastCloudKey && snapshot.key === this.lastAckLocalKey) return;
            const seedMissing = raw === null && this.lastCloudKey === null && this.editor.textContent.trim();
            if (!foreign && (dirty || seedMissing)) {
                if (!this.store.isStored(snapshot)) return;
                if (remoteKey !== this.lastCloudKey) {
                    this.preserveCopy(snapshot.payload, remote || { html: '' }, 'Antes de sincronizar edições de aparelhos diferentes');
                }
                const result = await api.salvarRichtextAnotacoes(this.currentSemana, JSON.stringify(snapshot.payload), { expectedRemote: raw });
                if (!sessionMatches()) return;
                if (result?.code === 'SYNC_CONFLICT') continue;
                if (result?.success !== true) throw new Error(result?.error || 'Falha na sincronização.');
                // A successful write is the baseline for typing that took place
                // while awaiting its response, even if that new edit is pending.
                this.lastCloudKey = snapshot.key;
                this.acknowledgeRemote(snapshot);
                return;
            }
            if (raw === null && this.lastCloudKey === null && !foreign) return;
            const incoming = remote || { html: '', formato: 'legacy-html' };
            this.preserveCopy(snapshot.payload, incoming, 'Antes de restaurar a nuvem');
            if (!this.store.applyContent(incoming, { remote: true })) throw new Error('Falha ao restaurar a nota.');
            const applied = this.store.snapshot();
            if (!this.store.isStored(applied)) throw new Error('Falha ao guardar a nota.');
            this.acknowledgeRemote(applied, remoteKey);
            return;
        }
        throw new Error('A anotação mudou durante a sincronização.');
    }
    async drain() {
        if (this.sending || this.isPaused || navigator.onLine === false || !this.checkLoginStatus() ||
            !this.pending || this.store.getConflict?.() || !window.SupabaseSync?.salvarRichtextAnotacoes ||
            !window.SupabaseSync?.carregarRichtextAnotacoes) return this.sending;
        clearTimeout(this.retryTimer);
        this.saveInProgress = true;
        let failed = false;
        this.sending = Promise.resolve().then(async () => {
            while (this.pending && !this.isPaused && navigator.onLine !== false && this.checkLoginStatus()) {
                const next = this.pending; this.pending = null;
                const session = localStorage.getItem('supabase_user');
                const run = () => this.reconcile(next, session);
                try {
                    if (navigator.locks?.request) await navigator.locks.request('notes-cloud-' + this.currentSemana, run);
                    else await run();
                    this.retryDelay = 2000;
                } catch (_) {
                    if (session === localStorage.getItem('supabase_user')) {
                        this.pending ??= next;
                        failed = true;
                        this.retryTimer = setTimeout(() => this.drain(), this.retryDelay);
                        this.retryDelay = Math.min(this.retryDelay * 2, 60000);
                    }
                    break;
                }
            }
        });
        try { await this.sending; }
        finally {
            this.sending = null; this.saveInProgress = false;
            if (this.pending && !failed) this.drain();
        }
    }
    executeAutoSave() {
        if (!this.store || !this.editor) return;
        const snapshot = this.store.flush();
        if (snapshot && this.store.hasPending(snapshot)) this.acceptSnapshot(snapshot);
        return this.drain();
    }
    obterRaizesEditor() { return Array.from(this.editor?.children || []).filter(node => node.matches('.node-paragraph,.node-text,.node-toggle')); }
    exportTree() { return this.store?.snapshot()?.payload.tree || []; }
    exportHTML() { return this.store?.snapshot()?.payload.html || ''; }
    serializePayload() { return this.store?.snapshot()?.payload || null; }
    serializeForRemote() { return JSON.stringify(this.serializePayload()); }
    parseSavedContent(raw) { return this.store?.parse(raw); }
    applySavedContent(raw) { return this.store?.applyContent(raw, { remote: true }); }
    uploadCurrent() { return this.syncCurrent(); }
    onContentChange() { return this.executeAutoSave(); }
    onFocusLost() { return this.executeAutoSave(); }
    onPageUnload() { return this.executeAutoSave(); }
    saveToLocal() { return this.store?.flush(); }
    async saveToSupabase(content) {
        const snapshot = this.store?.flush();
        if (!snapshot || content !== JSON.stringify(snapshot.payload)) throw new Error('O conteúdo mudou. Salve a versão atual do editor.');
        return this.uploadCurrent();
    }
    forceAutoSave() { return this.executeAutoSave(); }
    pauseAutoSave() { this.isPaused = true; }
    resumeAutoSave() { this.isPaused = false; return this.executeAutoSave(); }
    setDelay(ms) {
        const value = Number(ms); if (!Number.isFinite(value) || value < 0) return;
        this.SAVE_DELAY = Math.floor(value); this.store?.setDelay(this.SAVE_DELAY);
    }
    getStatus() { return { semana: this.currentSemana, loggedIn: this.isLoggedIn, paused: this.isPaused, saveInProgress: this.saveInProgress, delay: this.SAVE_DELAY }; }
    debug() { return { ...this.getStatus(), editorFound: !!this.editor, lastSavedLength: this.lastSavedContent.length, roots: this.obterRaizesEditor().length, local: this.store?.stats() }; }
}
window.AutoSaveManager = new AutoSaveManager();
window.forceAutoSave = () => window.AutoSaveManager.forceAutoSave();
window.pauseAutoSave = () => window.AutoSaveManager.pauseAutoSave();
window.resumeAutoSave = () => window.AutoSaveManager.resumeAutoSave();
window.autoSaveStatus = () => window.AutoSaveManager.getStatus();
window.debugAutoSave = () => window.AutoSaveManager.debug();
