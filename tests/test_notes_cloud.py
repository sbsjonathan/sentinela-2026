"""Real v1/v2 editor persistence with synthetic cloud and blocked external network."""
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def log_message(self, *args):
        pass

def check(engine, executable, origin):
    browser = engine.launch(executable_path=executable, headless=True, args=['--no-sandbox'] if engine.name == 'chromium' else [])
    for version in [1, 2]:
        context = browser.new_context(service_workers='block', viewport={'width': 430, 'height': 873})
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
        context.add_init_script('''
            localStorage.setItem('supabase_user', JSON.stringify({id:'synthetic',loginId:'one'}));
            window.fakeCloud = JSON.parse(sessionStorage.getItem('qa-cloud') || 'null') || { raw: null, writes: [], fail: false };
            window.qaHasSaveBubble = false;
            new MutationObserver(() => {
                if (document.querySelector('#notes-save-status:not([hidden])')) window.qaHasSaveBubble = true;
            }).observe(document, {subtree:true, childList:true, attributes:true, attributeFilter:['hidden','data-type']});
            window.SupabaseSync = {
                isLoggedIn: () => !!localStorage.getItem('supabase_user'),
                carregarRichtextAnotacoes: async () => fakeCloud.raw,
                salvarRichtextAnotacoes: async (week, raw, options) => {
                    if (fakeCloud.fail) return {success:false,error:'synthetic failure'};
                    if (fakeCloud.race) {
                        fakeCloud.race=false;
                        fakeCloud.raw=JSON.stringify({html:'<div class="node-paragraph"><div class="row"><div class="paragraph-content editable" contenteditable="true">Versão do outro aparelho</div></div></div>',formato:'legacy-html'});
                        return {success:false,code:'SYNC_CONFLICT',error:'Outro aparelho gravou primeiro'};
                    }
                    if (options.expectedRemote !== fakeCloud.raw) return {success:false,code:'SYNC_CONFLICT',error:'conflict'};
                    fakeCloud.writes.push(raw); fakeCloud.raw = raw; return {success:true};
                }
            };
        ''')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        entry = 'container-v1.html' if version == 1 else 'container.html'
        recovery = '&legado=1' if version == 1 else ''
        page.goto(f'{origin}/richtext/{entry}?semana=02-11&versao={version}{recovery}')
        page.wait_for_function('window.AutoSaveManager && window.UnifiedLoadManager && window.cacheRichText')
        assert page.evaluate('NotesVersions.current') == str(version)
        page.evaluate('Promise.all([window.AutoSaveManager.ready, window.UnifiedLoadManager.ready, window.cacheRichText.ready])')
        page.evaluate('window.fakeCloud.fail = true')
        editor = page.locator('#editor .paragraph-content').first
        editor.fill('Documento sintético preservado numa falha de nuvem.')
        page.evaluate('window.cacheRichText.flush()')
        page.wait_for_function('window.cacheRichText.hasPending(window.cacheRichText.snapshot()) && !window.AutoSaveManager.sending')
        assert page.evaluate('fakeCloud.writes.length') == 0
        assert 'Documento sintético' in page.evaluate("localStorage.getItem('richtext_cache_02-11')")
        page.evaluate('window.fakeCloud.fail=false; window.AutoSaveManager.forceAutoSave()')
        page.wait_for_function('!window.cacheRichText.hasPending(window.cacheRichText.snapshot()) && fakeCloud.writes.length === 1')
        assert page.evaluate('window.cacheRichText.isStored(window.cacheRichText.snapshot())')
        page.evaluate("window.fakeCloud.raw=''; window.UnifiedLoadManager.syncWithSupabase()")
        page.wait_for_function("!document.getElementById('editor').textContent.trim() && !window.UnifiedLoadManager.syncing")
        assert page.evaluate('fakeCloud.writes.length') == 1
        assert page.evaluate("Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).some(k=>k.startsWith('richtext_recovery_02-11_'))")
        # A server-side compare-and-swap collision is retried after reading the
        # competing write. The editor keeps the active paragraph and its caret.
        page.evaluate('fakeCloud.race = true')
        editor = page.locator('#editor .paragraph-content').first
        editor.fill('Minha edição durante a disputa')
        editor.focus()
        page.evaluate("window.qaFocused = document.activeElement; window.qaSelection = {node:getSelection().anchorNode,offset:getSelection().anchorOffset}")
        page.evaluate('window.cacheRichText.flush(); window.AutoSaveManager.forceAutoSave()')
        page.wait_for_function('fakeCloud.writes.length === 2 && !window.AutoSaveManager.sending')
        assert page.evaluate("document.activeElement === qaFocused && getSelection().anchorNode === qaSelection.node && getSelection().anchorOffset === qaSelection.offset")
        assert 'Minha edição durante a disputa' in page.locator('#editor').inner_text()
        assert 'Minha edição durante a disputa' in page.evaluate('fakeCloud.raw')
        assert page.evaluate("""Array.from({length:localStorage.length},(_,i)=>localStorage.key(i))
            .filter(k=>k.startsWith('richtext_recovery_02-11_'))
            .some(k=>localStorage.getItem(k).includes('Versão do outro aparelho'))""")
        assert not page.evaluate('qaHasSaveBubble')
        # Launch with a pending edit and a real previous-version comparison
        # marker. The server changes once more before the editor reopens.
        page.evaluate("fakeCloud.fail = true")
        editor.fill('Rascunho pendente antes da atualização')
        page.evaluate('cacheRichText.flush(); window.AutoSaveManager.forceAutoSave()')
        page.wait_for_function('cacheRichText.hasPending(cacheRichText.snapshot()) && !window.AutoSaveManager.sending')
        page.evaluate("""() => {
            const old = {html:'Versão antiga da nuvem',formato:'legacy-html'};
            const marker = {account:'synthetic', semana:'02-11', createdAt:123, local:cacheRichText.snapshot().payload,
                externalRaw:JSON.stringify(old), external:old, saved:false};
            localStorage.setItem('richtext_cloud_conflict_synthetic_02-11',JSON.stringify(marker));
            sessionStorage.setItem('qa-cloud',JSON.stringify({...fakeCloud, fail:false,
                raw:JSON.stringify({html:'Última mudança externa',formato:'legacy-html'})}));
        }""")
        page.reload()
        page.wait_for_function('window.cacheRichText && window.AutoSaveManager && fakeCloud.writes.length === 3 && !window.AutoSaveManager.sending')
        assert 'Rascunho pendente antes da atualização' in page.locator('#editor').inner_text()
        assert 'Rascunho pendente antes da atualização' in page.evaluate('fakeCloud.raw')
        assert page.evaluate("localStorage.getItem('richtext_cloud_conflict_synthetic_02-11')") is None
        # Previous versions delayed the popup until a pause in typing.
        page.wait_for_timeout(800)
        assert not page.evaluate('qaHasSaveBubble')
        assert not page.get_by_text('Comparar versões', exact=True).is_visible()
        # Switch login synchronously after input, before the cache's debounce
        # can issue a notes:stored event for the new private text.
        page.evaluate("""() => {
            const field = document.querySelector('#editor .paragraph-content');
            field.textContent = 'Edição privada de A antes de trocar de conta';
            field.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText'}));
            fakeCloud.raw = JSON.stringify({html:'Nota privada da conta B',formato:'legacy-html'});
            localStorage.setItem('supabase_user',JSON.stringify({id:'account-B',loginId:'two'}));
            window.dispatchEvent(new Event('supabaseSessionChanged'));
        }""")
        page.wait_for_function("document.getElementById('editor').textContent.includes('Nota privada da conta B') && !window.AutoSaveManager.sending")
        assert page.evaluate('fakeCloud.writes.length') == 3
        assert page.evaluate("""Array.from({length:localStorage.length},(_,i)=>localStorage.key(i))
            .filter(k=>k.startsWith('richtext_recovery_02-11_'))
            .some(k=>localStorage.getItem(k).includes('Edição privada de A antes de trocar de conta'))""")
        assert not page.evaluate('qaHasSaveBubble')
        assert not errors, errors
        print(json.dumps({'engine': engine.name, 'version': version, 'local_failure_and_retry': 'passed',
                          'empty_cloud_and_recovery': 'passed', 'silent_conflict_and_upgrade': 'passed',
                          'conflict_preserves_focus': 'passed'}), flush=True)
        context.close()
    browser.close()

if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            check(p.chromium, os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), f'http://127.0.0.1:{server.server_port}')
            if os.environ.get('WEBKIT_EXECUTABLE'):
                check(p.webkit, os.environ['WEBKIT_EXECUTABLE'], f'http://127.0.0.1:{server.server_port}')
    finally:
        server.shutdown()
