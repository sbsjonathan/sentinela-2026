const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const tick = () => new Promise(setImmediate);
function base() {
    const data = new Map([['supabase_user', JSON.stringify({ id: 'test-user', loginId: 'one' })]]), handlers = new Map();
    const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key), key: i => [...data.keys()][i] ?? null, get length() { return data.size; } };
    const context = { console, URLSearchParams, Date, Math, JSON, Promise, setTimeout: () => 1, clearTimeout() {}, localStorage: storage, navigator: { onLine: true },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } } };
    const events = [];
    context.window = { addEventListener(name, fn) { const list = handlers.get(name) || []; list.push(fn); handlers.set(name, list); },
        dispatchEvent(event) { events.push(event); for (const fn of handlers.get(event.type) || []) fn(event); },
        location: { search: '' }, semanaAtual: '02-11', estudoId: '35', SupabaseSync: { isLoggedIn: () => !!storage.getItem('supabase_user') } };
    context.document = { readyState: 'loading', body: { dataset: {} }, activeElement: null, getElementById() { return null; }, querySelectorAll() { return []; }, addEventListener() {}, dispatchEvent() {} };
    vm.createContext(context);
    const run = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
    return { data, storage, context, events, run };
}
function article(remote = null) {
    const h = base(); let cloud = remote; const writes = [];
    const api = h.context.window.SupabaseSync;
    api.carregarSentinelaAnotacoes = async () => cloud;
    api.salvarSentinelaAnotacoes = async (week, study, value, options) => { writes.push({ value: { ...value }, options }); cloud = { ...value }; return { success: true }; };
    h.run('save/sentinela-sync.js'); const sync = h.context.window.sentinelaSync;
    sync.detectSemanaEEstudo(); sync.checkLoginStatus(); sync.initialLoadComplete = true;
    return { ...h, sync, api, writes, cloud: () => cloud };
}
function notes(initial = 'local', pending = true) {
    const h = base(); let content = initial, revision = 1, dirty = pending;
    const store = { ready: Promise.resolve(), semanaAtual: () => '02-11', snapshot: () => ({ key: content, revision, payload: { html: content, localRevision: String(revision) } }),
        flush() { return this.snapshot(); }, isStored: snapshot => snapshot.key === content, hasPending: () => dirty,
        acknowledge() { dirty = false; }, getConflict: () => null, contentKey: value => value.html, parse: raw => typeof raw === 'object' ? raw : JSON.parse(raw),
        applyContent(value) { content = value.html; revision++; dirty = false; return true; } };
    const api = h.context.window.SupabaseSync, writes = []; let remote = null;
    api.carregarRichtextAnotacoes = async () => remote;
    api.salvarRichtextAnotacoes = async (week, raw, options) => { writes.push({ raw, options }); remote = raw; return { success: true }; };
    h.context.window.cacheRichText = store;
    h.context.document.getElementById = id => id === 'editor' ? { get textContent() { return content; }, children: [] } : null;
    return { ...h, store, api, writes, dirty: () => dirty, value: () => content, remote: raw => remote = raw,
        edit(value) { content = value; revision++; dirty = true; h.context.window.dispatchEvent({ type: 'notes:stored', detail: store.snapshot() }); } };
}
let count = 0;
async function test(name, run) { await run(); count++; console.log('PASS', name); }
(async () => {
    await test('article collection only includes this study and all its comment kinds', async () => {
        const h = article(); for (const key of ['c-35-1', 'r-35-1', 'p-35-1-pg-0', 'c-rcp-1-35', 'obj-35', 'r-obj-35', 'r-sub-h1-35', 'r-sub-h2-2-35']) h.storage.setItem(key, key);
        h.storage.setItem('c-350-1', 'other'); h.storage.setItem('c-34-1', 'other');
        const values = h.sync.collectAnnotationsFromLocalStorage(); assert.equal(Object.keys(values).length, 8); assert.equal(values['c-34-1'], undefined);
    });
    await test('article grouped questions and their source marks belong to the cloud document', async () => {
        const h = article();
        for (const key of ['c-35-1-2', 'r-35-3–5', 'p-35-1-2-pg-0', 'p-35-1-2-pg-1', 'p-35-1-2-pg-extra-2', 'c-35-1 e 2']) {
            assert.equal(h.sync.validKey(key), true, key); h.storage.setItem(key, key);
        }
        assert.equal(h.sync.validKey('p-350-1-2-pg-0'), false);
        assert.equal((await h.sync.pushOverwrite()).success, true);
        assert.equal(Object.keys(h.cloud()).length, 6);
    });
    await test('local clear removes all article kinds, not another study, programme, login or preferences', async () => {
        const h = article();
        const deleted = ['c-35-1-2', 'r-35-1-2', 'p-35-1-2-pg-0', 'p-35-1-2-pg-1', 'c-35-3',
            'p-35-3-pg-0', 'c-rcp-1-35', 'r-obj-35', 'sub-h1-35', 'r-sub-h2-2-35', 'qa:obj:35',
            'qa:recap:35:p-rcp-1-35', 'qa:sub:sub-h2-2-35', 'paragrafo-geral-0',
            'sentinela_manual_test-user_02-11_35', 'sentinela_recovery_02-11_35_123_a',
            'cloud_conflict_notice_sentinela_test-user_02-11_35'];
        const kept = ['ass26:supabase_user', 'ass26:c-35-1-2', 'ass26:p-35-1-2-pg-0', 'ass26:richtext_cache_02-11',
            'assembleia-2026:c-35-1-2', 'assembleia-2026:p-35-1-2-pg-0', 'ass26-migration:localStorage:v1',
            'c-350-1-2', 'p-36-1-pg-0', 'qa:obj:350', 'ca-copgm27:note-1', 'richtext_cache_02-11', 'tema-interface'];
        h.context.document.querySelectorAll = () => [{id:'paragrafo-geral-0'}];
        for (const key of [...deleted, ...kept]) h.storage.setItem(key, 'saved');
        h.sync.clearLocal();
        for (const key of deleted) assert.equal(h.storage.getItem(key), null, key);
        for (const key of kept) assert.equal(h.storage.getItem(key), 'saved', key);
        assert.ok(h.storage.getItem('supabase_user'));
        assert.equal(h.sync.localClearInProgress, true);
    });
    await test('local clear survives cloud startup and new edits sync without restoring deleted fields', async () => {
        const remote = {'c-35-1-2':'old comment','p-35-1-2-pg-0':'old mark','p-35-3-pg-0':'old single mark'};
        const h = article(remote); for (const [key,value] of Object.entries(remote)) h.storage.setItem(key,value);
        h.sync.clearLocal();
        const sync = vm.runInContext('new SentinelaSync()',h.context);
        sync.detectSemanaEEstudo(); await sync.loadFromSupabase(); await sync.executeAutoSave();
        assert.equal(Object.keys(sync.collectAnnotationsFromLocalStorage()).length, 0); assert.equal(h.writes.length, 0);
        h.storage.setItem('c-35-7','new deliberate note'); await sync.executeAutoSave();
        assert.equal(h.cloud()['c-35-7'],'new deliberate note'); assert.equal(h.cloud()['p-35-3-pg-0'],'old single mark');
        assert.equal(h.storage.getItem('p-35-3-pg-0'), null); assert.equal(h.storage.getItem('c-35-7'),'new deliberate note');
        h.storage.setItem('c-35-1-2','new comment at cleared question'); await sync.executeAutoSave();
        assert.equal(h.cloud()['c-35-1-2'],'new comment at cleared question');
        assert.equal((await sync.pullMissing()).success,true); assert.equal(h.storage.getItem('p-35-3-pg-0'),'old single mark');
        assert.equal(sync.locallyCleared(),false);
    });
    await test('global local clear covers future article visits and explicit restore applies only to chosen article', async () => {
        const h = article(); h.storage.setItem('c-35-1','this'); h.storage.setItem('c-36-2','other'); h.storage.setItem('ca-copgm27:note-1','programme');
        const foreign = ['ass26:supabase_user', 'ass26:p-35-1-2-pg-0', 'assembleia-2026:p-35-1-2-pg-0', 'ass26-migration:localStorage:v1'];
        for (const key of foreign) h.storage.setItem(key, 'foreign app');
        h.sync.clearLocal(true); assert.equal(h.storage.getItem('c-36-2'),null);
        for (const key of foreign) assert.equal(h.storage.getItem(key), 'foreign app');
        const next = vm.runInContext('new SentinelaSync()',h.context);
        next.estudoId='36'; next.semanaAtual='09-11';
        h.api.carregarSentinelaAnotacoes=async()=>({'c-36-2':'cloud old'});
        await next.loadFromSupabase(); assert.equal(h.storage.getItem('c-36-2'),null);
        await next.pullOverwrite(); assert.equal(h.storage.getItem('c-36-2'),'cloud old'); assert.equal(next.locallyCleared(),false);
        const first = vm.runInContext('new SentinelaSync()',h.context);
        first.detectSemanaEEstudo(); assert.equal(first.locallyCleared(),true);
        h.storage.setItem('sentinela_restore_36', String(Date.now()+100));
        first.clearLocal(true); assert.equal(next.locallyCleared(),true);
        assert.equal(h.storage.getItem('ca-copgm27:note-1'),'programme');
    });
    await test('local clear stops in-flight download and unload upload from repopulating cache', async () => {
        const h=article({'c-35-1':'old cloud'}); let finish;
        h.storage.setItem('c-35-1','old local'); h.api.carregarSentinelaAnotacoes=()=>new Promise(resolve=>finish=resolve);
        const loading=h.sync.loadFromSupabase(); h.sync.clearLocal(); finish({'c-35-1':'old cloud'});
        assert.equal((await loading).success,false); assert.equal(h.storage.getItem('c-35-1'),null);
        h.sync.dirty=true; h.sync.flushPendingSave(); await tick(); assert.equal(h.writes.length,0);
    });
    await test('failed explicit restore leaves local deletion active', async () => {
        const h=article(); h.sync.clearLocal(); const sync=vm.runInContext('new SentinelaSync()',h.context);
        sync.detectSemanaEEstudo(); h.api.carregarSentinelaAnotacoes=async()=>{throw Error('offline');};
        assert.equal((await sync.pullOverwrite()).success,false); assert.equal(sync.locallyCleared(),true);
    });
    await test('article upload missing keeps existing remote; overwrite replaces it', async () => {
        const h = article({ 'c-35-1': 'cloud' }); h.storage.setItem('c-35-1', 'local'); h.storage.setItem('c-35-2', 'added');
        assert.equal((await h.sync.pushMissing()).success, true); assert.equal(h.cloud()['c-35-1'], 'cloud'); assert.equal(h.cloud()['c-35-2'], 'added');
        assert.equal((await h.sync.pushOverwrite()).success, true); assert.equal(h.cloud()['c-35-1'], 'local');
        assert.deepEqual(h.writes[0].options.expectedRemote, { 'c-35-1': 'cloud' });
    });
    await test('article missing download preserves local; overwrite removes only this study', async () => {
        const h = article({ 'c-35-1': 'cloud', 'c-35-3': 'remote only', 'c-34-1': 'foreign' });
        h.storage.setItem('c-35-1', 'local'); h.storage.setItem('c-35-2', 'local only'); h.storage.setItem('c-34-1', 'other study');
        assert.equal((await h.sync.pullMissing()).success, true); assert.equal(h.storage.getItem('c-35-1'), 'local'); assert.equal(h.storage.getItem('c-35-3'), 'remote only');
        assert.equal((await h.sync.pullOverwrite()).success, true); assert.equal(h.storage.getItem('c-35-1'), 'cloud'); assert.equal(h.storage.getItem('c-35-2'), null); assert.equal(h.storage.getItem('c-34-1'), 'other study');
    });
    await test('article download failure never changes local data or reports success', async () => {
        const h = article(); h.storage.setItem('c-35-1', 'local'); h.api.carregarSentinelaAnotacoes = async () => { throw Error('offline'); };
        assert.equal((await h.sync.pullOverwrite()).success, false); assert.equal((await h.sync.pushOverwrite()).success, false); assert.equal(h.writes.length, 0); assert.equal(h.storage.getItem('c-35-1'), 'local');
    });
    await test('manual progress and counts reflect work at the chosen destination', async () => {
        const h = article(), stages = [], progress = stage => stages.push(stage);
        assert.equal((await h.sync.deleteRemote(progress)).changed, 0);
        assert.equal((await h.sync.pushMissing(progress)).changed, 0);
        assert.equal((await h.sync.pullOverwrite(progress)).code, 'SYNC_EMPTY');
        assert.deepEqual(stages, ['reading', 'reading', 'reading']);
        assert.equal(h.writes.length, 0);
        h.storage.setItem('c-35-1', 'first');
        stages.length = 0;
        assert.equal((await h.sync.pushMissing(progress)).changed, 1);
        assert.equal((await h.sync.pushMissing(progress)).changed, 0);
        h.cloud()['c-35-2'] = 'second';
        assert.equal((await h.sync.pullMissing(progress)).changed, 1);
        assert.equal((await h.sync.pullMissing(progress)).changed, 0);
        assert.deepEqual(stages, ['reading', 'writing', 'reading', 'reading', 'applying', 'reading']);
        assert.equal(h.writes.length, 1);
    });
    await test('a confirmed cloud write with failed bookkeeping can retry without rewriting', async () => {
        const h = article(), set = h.storage.setItem;
        h.storage.setItem('c-35-1', 'local');
        h.storage.setItem = (key, value) => {
            if (key === h.sync.manualKey()) throw Error('quota');
            set(key, value);
        };
        const result = await h.sync.pushOverwrite();
        assert.equal(result.success, false); assert.equal(result.code, 'SYNC_PARTIAL');
        assert.equal(h.cloud()['c-35-1'], 'local');
        h.storage.setItem = set;
        assert.equal((await h.sync.pushOverwrite()).changed, 0);
        assert.equal(h.writes.length, 1);
    });
    await test('a local restore rolls back earlier removals and additions when storage fills', async () => {
        const h = article({'c-35-2': 'second', 'c-35-3': 'third'}), set = h.storage.setItem;
        h.storage.setItem('c-35-1', 'first');
        h.storage.setItem = (key, value) => {
            if (key === 'c-35-3') throw Object.assign(Error('quota'), {name: 'QuotaExceededError'});
            set(key, value);
        };
        const result = await h.sync.pullOverwrite();
        assert.equal(result.success, false); assert.match(result.error, /espaço/);
        assert.equal(h.storage.getItem('c-35-1'), 'first');
        assert.equal(h.storage.getItem('c-35-2'), null); assert.equal(h.storage.getItem('c-35-3'), null);
        h.storage.setItem = set;
        assert.equal((await h.sync.pullOverwrite()).changed, 3);
    });
    await test('manual upload retries a failed editor cache write before reading the draft', async () => {
        const h = article(), set = h.storage.setItem;
        h.storage.setItem('c-35-1', 'old');
        h.run('sentinela/clickable/cache.js');
        h.sync.interceptCacheSalvar();
        h.context.console = {...console, error() {}};
        h.storage.setItem = (key, value) => {
            if (key === 'c-35-1') throw Object.assign(Error('quota'), {name: 'QuotaExceededError'});
            set(key, value);
        };
        h.context.window.CacheAnotacao.salvar('c-35-1', 'last edit');
        assert.equal((await h.sync.pushOverwrite()).success, false); assert.equal(h.writes.length, 0);
        h.storage.setItem = set;
        assert.equal((await h.sync.pushOverwrite()).changed, 1);
        assert.equal(h.cloud()['c-35-1'], 'last edit');
    });
    await test('a pending editor write preserves another tab’s edit or deletion', async () => {
        for (const newer of ['other tab', null]) {
            const h = article(), key = 'c-35-1', set = h.storage.setItem;
            set(key, 'original');
            let writable = false;
            h.context.window.CacheAnotacao = {salvar(id, value) { if (writable) set(id, value); }};
            h.sync.interceptCacheSalvar();
            h.context.window.CacheAnotacao.salvar(key, 'pending');
            if (newer === null) h.storage.removeItem(key); else set(key, newer);
            const result = await h.sync.pushOverwrite();
            assert.equal(result.success, false); assert.match(result.error, /[Rr]evise/);
            assert.equal(h.storage.getItem(key), newer); assert.equal(h.writes.length, 0);
            writable = true;
            h.context.window.CacheAnotacao.salvar(key, 'reviewed');
            assert.equal((await h.sync.pushOverwrite()).changed, 1);
            assert.equal(h.cloud()[key], 'reviewed');
        }
    });
    await test('article mutation failure and unavailable recovery storage abort manual operations', async () => {
        const h = article({ 'c-35-1': 'remote' }); h.storage.setItem('c-35-1', 'local'); h.api.salvarSentinelaAnotacoes = async () => ({ success: false, error: 'denied' });
        assert.equal((await h.sync.pushOverwrite()).success, false);
        const set = h.storage.setItem; h.storage.setItem = (key, value) => { if (key.startsWith('sentinela_recovery_')) throw Error('quota'); set(key, value); };
        assert.equal((await h.sync.pullOverwrite()).success, false); assert.equal(h.storage.getItem('c-35-1'), 'local');
    });
    await test('article startup preserves typing during cloud fetch, without reload', async () => {
        const h = article(); let resolve; h.api.carregarSentinelaAnotacoes = () => new Promise(r => resolve = r);
        h.storage.setItem('c-35-1', 'old'); const loading = h.sync.loadFromSupabase(); h.storage.setItem('c-35-1', 'typed'); resolve({ 'c-35-1': 'remote' }); await loading;
        assert.equal(h.storage.getItem('c-35-1'), 'typed'); assert.ok([...h.data.keys()].some(key => key.startsWith('sentinela_recovery_')));
    });
    await test('article edit during upload is queued and delivered', async () => {
        const h = article(); let release; h.storage.setItem('c-35-1', 'first');
        h.api.salvarSentinelaAnotacoes = async (week, study, value) => { h.writes.push(value); if (h.writes.length === 1) await new Promise(r => release = r); return { success: true }; };
        const sending = h.sync.executeAutoSave(); await tick(); h.storage.setItem('c-35-1', 'second'); h.sync.scheduleAutoSave(); release(); await sending;
        assert.equal(h.writes.length, 2); assert.equal(h.writes[1]['c-35-1'], 'second');
    });
    await test('article cloud delete leaves local copy and does not immediately reupload', async () => {
        const h = article({ 'c-35-1': 'remote' }); h.storage.setItem('c-35-1', 'local');
        assert.equal((await h.sync.deleteRemote()).success, true); assert.equal(h.storage.getItem('c-35-1'), 'local'); await h.sync.executeAutoSave(); assert.equal(h.writes.length, 1);
    });
    await test('article manual delete and missing-only directions survive reload', async () => {
        const h = article({ 'c-35-1': 'remote' }); h.storage.setItem('c-35-1', 'local');
        await h.sync.deleteRemote(); h.sync.initialLoadComplete = false; h.sync.accountId = null; h.sync.checkLoginStatus();
        await h.sync.loadFromSupabase(); await h.sync.executeAutoSave(); assert.equal(h.writes.length, 1); assert.equal(h.storage.getItem('c-35-1'), 'local');
        const missing = article({ 'c-35-1': 'remote' }); missing.storage.setItem('c-35-1', 'local'); missing.storage.setItem('c-35-2', 'local only');
        await missing.sync.pullMissing(); missing.sync.initialLoadComplete = false; missing.sync.accountId = null; missing.sync.checkLoginStatus();
        await missing.sync.loadFromSupabase(); await missing.sync.executeAutoSave(); assert.equal(missing.writes.length, 0); assert.equal(missing.storage.getItem('c-35-1'), 'local');
    });
    await test('article manual difference survives remote additions and unrelated local edits after reload', async () => {
        const h = article({ 'c-35-1': 'remote' }); h.storage.setItem('c-35-1', 'local');
        await h.sync.pullMissing(); h.cloud()['c-35-3'] = 'added remotely';
        h.sync.accountId = null; h.sync.checkLoginStatus(); await h.sync.loadFromSupabase();
        assert.equal(h.storage.getItem('c-35-1'), 'local'); assert.equal(h.storage.getItem('c-35-3'), 'added remotely');
        h.storage.setItem('c-35-2', 'new local edit'); await h.sync.executeAutoSave();
        assert.equal(h.cloud()['c-35-1'], 'remote'); assert.equal(h.cloud()['c-35-2'], 'new local edit');
        assert.equal(h.storage.getItem('c-35-1'), 'local');
        h.storage.setItem('c-35-1', 'explicit edit of previously different note'); await h.sync.executeAutoSave();
        assert.equal(h.cloud()['c-35-1'], 'explicit edit of previously different note');
    });
    await test('article same-account relogin invalidates an old read', async () => {
        const h = article(); h.storage.setItem('c-35-1', 'local'); h.api.carregarSentinelaAnotacoes = async () => {
            h.storage.setItem('supabase_user', JSON.stringify({ id: 'test-user', loginId: 'two' })); return { 'c-35-1': 'remote' };
        };
        assert.equal((await h.sync.pushOverwrite()).success, false); assert.equal(h.writes.length, 0);
    });
    await test('v1 compatibility adapter rejects snapshots that were not persisted', async () => {
        const h = base(); const payload = { html: 'notes', localRevision: 'one' };
        h.context.window.cacheRichText = { semanaAtual: () => '02-11', parse: raw => JSON.parse(raw), contentKey: value => value.html };
        h.run('richtext/v1-cloud-bridge.js'); const store = h.context.window.cacheRichText, snapshot = { key: 'notes', payload };
        assert.equal(store.isStored(snapshot), false); h.storage.setItem('richtext_cache_02-11', JSON.stringify(payload)); assert.equal(store.isStored(snapshot), true);
        h.storage.setItem('richtext_cache_02-11', JSON.stringify({ ...payload, localRevision: 'other' })); assert.equal(store.isStored(snapshot), false);
    });
    await test('article account change during read aborts write and local replacement', async () => {
        const h = article(); h.storage.setItem('c-35-1', 'local'); h.api.carregarSentinelaAnotacoes = async () => { h.storage.setItem('supabase_user', JSON.stringify({ id: 'other' })); return { 'c-35-1': 'cloud' }; };
        assert.equal((await h.sync.pushOverwrite()).success, false); assert.equal(h.writes.length, 0); assert.equal(h.storage.getItem('c-35-1'), 'local');
    });
    await test('richtext remote read failure never uploads or acknowledges pending draft', async () => {
        const h = notes(); h.api.carregarRichtextAnotacoes = async () => { throw Error('offline'); }; h.run('save/auto-save.js'); await h.context.window.AutoSaveManager.ready; await tick();
        assert.equal(h.writes.length, 0); assert.equal(h.dirty(), true);
    });
    await test('richtext malformed save response is not acknowledged', async () => {
        const h = notes(); h.api.salvarRichtextAnotacoes = async () => ({}); h.run('save/auto-save.js'); await h.context.window.AutoSaveManager.ready; await tick(); assert.equal(h.dirty(), true); assert.ok(h.context.window.AutoSaveManager.pending);
    });
    await test('richtext offline draft preserves the competing cloud copy and syncs on reconnect', async () => {
        const h = notes('offline draft'), raw = JSON.stringify({ html: 'other device' });
        h.remote(raw); h.context.navigator.onLine = false;
        h.run('save/auto-save.js'); await h.context.window.AutoSaveManager.ready; await tick();
        assert.equal(h.writes.length, 0); assert.equal(h.dirty(), true);
        h.context.navigator.onLine = true; h.context.window.dispatchEvent({type:'online'}); await tick();
        assert.equal(h.writes.length, 1); assert.equal(h.writes[0].options.expectedRemote, raw);
        assert.equal(JSON.parse(h.writes[0].raw).html, 'offline draft'); assert.equal(h.dirty(), false);
        assert.ok([...h.data.values()].some(value => value.includes('notes-cloud-recovery') && value.includes('other device')));
    });
    await test('richtext existing empty cloud clears acknowledged local content rather than resurrecting it', async () => {
        const h = notes('old local', false); h.remote(''); h.run('save/auto-save.js'); await h.context.window.AutoSaveManager.ready; h.run('save/unified-load.js'); await h.context.window.UnifiedLoadManager.ready; await tick();
        assert.equal(h.value(), ''); assert.equal(h.writes.length, 0); assert.ok([...h.data.values()].some(value => value.includes('notes-cloud-recovery') && value.includes('old local')));
    });
    await test('richtext missing row uploads legacy local document without a pending revision', async () => {
        const h = notes('legacy local', false); h.run('save/auto-save.js'); await h.context.window.AutoSaveManager.ready; h.run('save/unified-load.js'); await h.context.window.UnifiedLoadManager.ready; await tick();
        assert.equal(h.writes.length, 1); assert.equal(JSON.parse(h.writes[0].raw).html, 'legacy local');
    });
    await test('richtext edit during initial download stays local and is subsequently uploaded', async () => {
        const h = notes('old local', false); let resolve; h.run('save/auto-save.js'); await h.context.window.AutoSaveManager.ready;
        h.api.carregarRichtextAnotacoes = () => new Promise(r => resolve = r); h.run('save/unified-load.js'); await h.context.window.UnifiedLoadManager.ready; await tick();
        h.context.window.AutoSaveManager.pauseAutoSave(); h.edit('typed'); resolve(JSON.stringify({ html: 'cloud' })); await tick();
        assert.equal(h.value(), 'typed'); assert.equal(h.writes.length, 0);
        h.api.carregarRichtextAnotacoes = async () => JSON.stringify({ html: 'cloud' }); await h.context.window.AutoSaveManager.resumeAutoSave();
        assert.equal(h.writes.length, 1); assert.equal(JSON.parse(h.writes[0].raw).html, 'typed');
        assert.equal(h.writes[0].options.expectedRemote, JSON.stringify({html:'cloud'}));
    });
    await test('richtext retries a compare-and-swap collision using the fresh remote document', async () => {
        const h = notes('draft'), winner = JSON.stringify({html:'competing write'}), attempted = [];
        const save = h.api.salvarRichtextAnotacoes;
        h.api.salvarRichtextAnotacoes = async (week, raw, options) => {
            attempted.push(options.expectedRemote);
            if (attempted.length > 1) return save(week, raw, options);
            h.remote(winner);
            return {success:false, code:'SYNC_CONFLICT'};
        };
        h.run('save/auto-save.js'); await h.context.window.AutoSaveManager.ready; await tick();
        assert.deepEqual(attempted, [null, winner]);
        assert.equal(h.writes.length, 1); assert.equal(h.value(), 'draft'); assert.equal(h.dirty(), false);
        assert.ok([...h.data.values()].some(value => value.includes('notes-cloud-recovery') && value.includes('competing write')));
    });
    await test('richtext keeps the draft pending when collisions repeat and retries on the next online event', async () => {
        const h = notes('draft'), save = h.api.salvarRichtextAnotacoes;
        let collisions = 0;
        h.api.salvarRichtextAnotacoes = async () => {
            assert.ok(++collisions < 20, 'retries must be bounded');
            h.remote(JSON.stringify({html:'cloud '+collisions}));
            return {success:false, code:'SYNC_CONFLICT'};
        };
        h.run('save/auto-save.js'); await h.context.window.AutoSaveManager.ready; await tick();
        assert.ok(collisions > 0 && collisions < 20);
        assert.equal(h.writes.length, 0); assert.equal(h.dirty(), true);
        h.api.salvarRichtextAnotacoes = save;
        h.context.window.dispatchEvent({type:'online'}); await tick();
        assert.equal(h.writes.length, 1); assert.equal(h.dirty(), false);
    });
    await test('richtext resolves an old comparison on reopen without adopting stale marker content', async () => {
        const h = notes('current saved draft');
        const prior = JSON.stringify({html:'old remote'}), latest = JSON.stringify({html:'current remote'});
        const marker = 'richtext_cloud_conflict_test-user_02-11', foreign = 'richtext_cloud_conflict_other_02-11';
        const oldConflict = JSON.stringify({account:'test-user', semana:'02-11', createdAt:123, local:{html:'old draft'},
            externalRaw:prior, external:JSON.parse(prior), saved:false});
        h.storage.setItem(marker, oldConflict); h.storage.setItem(foreign, 'other account recovery'); h.remote(latest);
        h.run('save/auto-save.js'); await h.context.window.AutoSaveManager.ready; await tick();
        assert.equal(h.writes.length, 1); assert.equal(JSON.parse(h.writes[0].raw).html, 'current saved draft');
        assert.equal(h.writes[0].options.expectedRemote, latest);
        assert.equal(h.storage.getItem(marker), null); assert.equal(h.storage.getItem(foreign), 'other account recovery');
        assert.ok([...h.data.values()].some(value => value.includes('notes-cloud-recovery') && value.includes('old draft') && value.includes('old remote')));
    });
    await test('richtext stores the acknowledged baseline and uploads an ordinary subsequent edit once', async () => {
        const h = notes('baseline', false); h.remote(JSON.stringify({ html: 'baseline' })); h.run('save/auto-save.js');
        const manager = h.context.window.AutoSaveManager; await manager.ready; manager.acknowledgeRemote(h.store.snapshot());
        h.edit('next edit'); await tick();
        assert.equal(h.writes.length, 1); assert.equal(h.dirty(), false);
        assert.ok([...h.data.keys()].some(key => key.includes('cloud_baseline')));
    });
    await test('richtext relogin during the cloud read never writes with the stale login', async () => {
        const h = notes('draft'), raw = JSON.stringify({html:'previous cloud'});
        h.api.carregarRichtextAnotacoes = async () => {
            h.storage.setItem('supabase_user', JSON.stringify({id:'test-user', loginId:'two'})); return raw;
        };
        h.run('save/auto-save.js'); await h.context.window.AutoSaveManager.ready; await tick();
        assert.equal(h.value(), 'draft'); assert.equal(h.writes.length, 0); assert.equal(h.dirty(), true);
    });
    await test('richtext changing accounts cannot seed a new account with the previous account’s note', async () => {
        const h = notes('old account note');
        h.run('save/auto-save.js'); await h.context.window.AutoSaveManager.ready; await tick();
        assert.equal(h.writes.length, 1);
        h.storage.setItem('supabase_user', JSON.stringify({id:'other', loginId:'new'})); h.remote(null);
        h.context.window.dispatchEvent({type:'supabaseSessionChanged'}); await tick();
        assert.equal(h.writes.length, 1);
        assert.ok([...h.data.values()].some(value => value.includes('notes-cloud-recovery') && value.includes('old account note')));
    });
    await test('richtext a fresh anonymous edit can upload on the first login', async () => {
        const h = notes('', false);
        h.storage.removeItem('supabase_user');
        h.run('save/auto-save.js'); await h.context.window.AutoSaveManager.ready;
        h.edit('first anonymous edit'); await tick();
        assert.equal(h.writes.length, 0);
        h.storage.setItem('supabase_user', JSON.stringify({id:'first-account', loginId:'one'}));
        h.context.window.dispatchEvent({type:'supabaseSessionChanged'}); await tick();
        assert.equal(h.writes.length, 1); assert.equal(JSON.parse(h.writes[0].raw).html, 'first anonymous edit');
        assert.equal(h.dirty(), false);
    });
    await test('richtext old account-scoped baselines protect pre-owner device caches on first launch', async () => {
        for (const dirty of [false,true]) {
            for (const remote of [null, JSON.stringify({html:'private to B'})]) {
                const old = dirty ? 'edited offline by A' : 'acknowledged by A';
                const h = notes(old, dirty);
                h.storage.setItem('supabase_user', JSON.stringify({id:'B', loginId:'two'}));
                h.storage.setItem('richtext_cloud_baseline_A_02-11', JSON.stringify({key:'acknowledged by A'}));
                h.remote(remote);
                h.run('save/auto-save.js'); await h.context.window.AutoSaveManager.ready;
                h.run('save/unified-load.js'); await h.context.window.UnifiedLoadManager.ready; await tick();
                assert.equal(h.writes.length, 0, 'must never upload the old device cache to B');
                assert.equal(h.value(), remote === null ? '' : 'private to B');
                assert.ok([...h.data.values()].some(value => value.includes('notes-cloud-recovery') && value.includes(old)));
                assert.ok(h.storage.getItem('richtext_cloud_baseline_A_02-11'));
            }
        }
    });
    await test('richtext an acknowledged note follows a removed cloud row without recreating it', async () => {
        const h = notes('previously acknowledged');
        h.run('save/auto-save.js'); await h.context.window.AutoSaveManager.ready; await tick();
        assert.equal(h.writes.length, 1); h.remote(null);
        h.context.window.dispatchEvent({type:'online'}); await tick();
        assert.equal(h.writes.length, 1); assert.equal(h.value(), '');
        h.edit('new deliberate content'); await tick();
        assert.equal(h.writes.length, 2); assert.equal(h.writes[1].options.expectedRemote, null);
    });
    await test('richtext newer typing supersedes the draft in a pending cloud read', async () => {
        const h = notes('first edit'), raw = JSON.stringify({html:'other device'});
        let finish, reads = 0;
        h.api.carregarRichtextAnotacoes = () => ++reads === 1 ? new Promise(resolve => {finish = resolve;}) : Promise.resolve(raw);
        h.run('save/auto-save.js'); await h.context.window.AutoSaveManager.ready; await tick();
        h.edit('latest typing'); finish(raw); await tick();
        assert.equal(h.value(), 'latest typing'); assert.equal(h.writes.length, 1);
        assert.equal(JSON.parse(h.writes[0].raw).html, 'latest typing'); assert.equal(h.writes[0].options.expectedRemote, raw);
    });
    await test('richtext cannot discard either version when saving a recovery copy fails', async () => {
        const h = notes('local draft'); h.remote(JSON.stringify({html:'remote draft'}));
        const set = h.storage.setItem;
        h.storage.setItem = (key, value) => {
            if (key.startsWith('richtext_recovery_')) throw new Error('QuotaExceededError');
            set(key, value);
        };
        h.run('save/auto-save.js'); await h.context.window.AutoSaveManager.ready; await tick();
        assert.equal(h.writes.length, 0); assert.equal(h.dirty(), true); assert.equal(h.value(), 'local draft');
        h.storage.setItem = set;
        await h.context.window.AutoSaveManager.forceAutoSave(); await tick();
        assert.equal(h.writes.length, 1); assert.equal(h.writes[0].options.expectedRemote, JSON.stringify({html:'remote draft'}));
    });
    console.log(`${count} article and notes sync cases passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
