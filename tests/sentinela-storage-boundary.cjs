/* Sentinela shares a Pages origin with Assembly. Exercise real menu helpers
 * with synthetic raw storage only; no user notes, browser or backend access. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../sentinela/menu/menu.js'), 'utf8');

function functionSource(name) {
    const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
    assert.ok(match, `menu must define ${name}`);
    const open = source.indexOf('{', match.index);
    let depth = 0, quote = null, escape = false, comment = null;
    for (let i = open; i < source.length; i++) {
        const ch = source[i];
        if (comment === 'line') { if (ch === '\n') comment = null; continue; }
        if (comment === 'block') { if (ch === '*' && source[i + 1] === '/') { comment = null; i++; } continue; }
        if (quote) {
            if (escape) escape = false;
            else if (ch === '\\') escape = true;
            else if (ch === quote) quote = null;
            continue;
        }
        if (ch === '/' && source[i + 1] === '/') { comment = 'line'; i++; continue; }
        if (ch === '/' && source[i + 1] === '*') { comment = 'block'; i++; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
        if (ch === '{') depth++;
        else if (ch === '}' && --depth === 0) return source.slice(match.index, i + 1);
    }
    throw Error(`unterminated function ${name}`);
}
function storage(entries = {}) {
    const values = new Map(Object.entries(entries));
    return {
        values, get length() { return values.size; },
        key(index) { return [...values.keys()][index] ?? null; },
        getItem(key) { return values.get(key) ?? null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); },
        clear() { values.clear(); }
    };
}
function harness(initial = {}) {
    const localStorage = storage(initial), context = vm.createContext({localStorage});
    for (const name of ['isSentinelaKey', 'getLocalExportPayload', 'importBinFile', 'clearSentinelaStorage']) {
        vm.runInContext(functionSource(name), context);
    }
    return { localStorage, context };
}
const foreign = {
    'ass26:supabase_user': '{"id":"assembly-account"}',
    'ass26:p-35-1-2-pg-0': 'assembly highlights',
    'ass26:richtext_cache_02-11': 'assembly notes',
    'ass26:tema-interface': 'dark',
    'assembleia-2026:p-35-1-2-pg-0': 'legacy assembly highlights',
    'assembleia-2026:supabase_user': '{"id":"legacy-assembly-account"}',
    'ass26-migration:localStorage:v1': 'assembly migration receipt',
    'ass26-migration:sessionStorage:v1': 'assembly session migration receipt'
};
const local = {
    'supabase_user': '{"id":"sentinela-account"}',
    'p-35-1-2-pg-0': 'sentinela highlights',
    'c-35-1-2': 'sentinela answer',
    'richtext_cache_02-11': 'sentinela notes',
    'tema-interface': 'system',
    'tamanho-fonte-global': '20',
    'editor-performance-mode': 'low'
};
let count = 0;
async function test(name, run) { await run(); count++; console.log('PASS', name); }
(async () => {
    await test('export includes Sentinela annotations while excluding Assembly and credentials', () => {
        const h = harness({...foreign, ...local});
        const before = [...h.localStorage.values];
        const payload = JSON.parse(JSON.stringify(h.context.getLocalExportPayload()));
        assert.equal(payload.format, 'sentinela-bin-v1');
        assert.deepEqual(payload.annotations, {'p-35-1-2-pg-0': local['p-35-1-2-pg-0'], 'c-35-1-2': local['c-35-1-2']});
        assert.deepEqual(payload.preferences, {'tema-interface':'system','tamanho-fonte-global':'20','editor-performance-mode':'low'});
        assert.deepEqual([...h.localStorage.values], before);
        for (const key of Object.keys(foreign)) assert.equal(h.context.isSentinelaKey(key), false, key);
    });
    await test('import cannot overwrite Assembly stores, migration receipts or either login', async () => {
        const h = harness({...foreign, ...local});
        const preferences = {...Object.fromEntries(Object.keys(foreign).map(key => [key, 'unexpected'])), supabase_user: 'unexpected', 'tema-interface': 'dark'};
        const annotations = {...preferences, 'p-35-1-2-pg-0': 'imported marks', 'c-35-1-2': 'imported answer'};
        const file = {text: async () => JSON.stringify({format:'sentinela-bin-v1', preferences, annotations})};
        await h.context.importBinFile(file);
        for (const [key, value] of Object.entries(foreign)) assert.equal(h.localStorage.getItem(key), value, key);
        assert.equal(h.localStorage.getItem('supabase_user'), local.supabase_user);
        assert.equal(h.localStorage.getItem('tema-interface'), 'dark');
        assert.equal(h.localStorage.getItem('p-35-1-2-pg-0'), 'imported marks');
        assert.equal(h.localStorage.getItem('c-35-1-2'), 'imported answer');
        assert.equal(h.localStorage.getItem('richtext_cache_02-11'), local['richtext_cache_02-11']);
    });
    await test('wrong backup format fails without changing local data', async () => {
        const h = harness({...foreign, ...local}), before = [...h.localStorage.values];
        await assert.rejects(() => h.context.importBinFile({text: async () => JSON.stringify({format:'ass26-bin-v1', annotations:{'p-35-1-2-pg-0':'wrong app'}})}));
        assert.deepEqual([...h.localStorage.values], before);
    });
    await test('nuclear reset clears only raw Sentinela keys in local and session storage', () => {
        const h = harness();
        for (const area of [storage({...foreign,...local}), storage({...foreign,'sentinela_loaded_35':'1',supabase_user:'legacy session'})]) {
            h.context.clearSentinelaStorage(area);
            assert.deepEqual(Object.fromEntries(area.values), foreign);
        }
    });
    console.log(`${count} Sentinela/Assembly storage boundary checks passed`);
})().catch(error => {console.error(error); process.exitCode = 1;});
