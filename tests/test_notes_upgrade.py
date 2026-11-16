"""Old Sentinela notes routes/preferences must open the current Assembly-style editor.

Use synthetic raw/local notes only; external requests and service workers are
blocked. The original snapshot remains available through an explicit recovery
request, while old bookmark URLs no longer silently keep the obsolete editor.
Set WEBKIT_EXECUTABLE to exercise WebKit in addition to Chromium.
"""
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PREFIX = '/sentinela-2026/'
WEEK = '02-11'
TREE = [
    {'type': 'paragraph', 'text': 'Nota preservada com destaque.',
     'html': 'Nota <strong>preservada</strong> com <mark style="background-color: #fff59d">destaque</mark>.'},
    {'type': 'toggle', 'text': 'Assunto recolhido', 'html': 'Assunto recolhido', 'open': False,
     'children': [{'type': 'text', 'text': 'Conteúdo interno intacto.',
                   'html': '<span style="color: rgb(96, 65, 132)">Conteúdo interno intacto.</span>'}]}
]
PAYLOAD = json.dumps({'formato': 'v23-tree', 'versao': '2.0', 'semana': WEEK, 'tree': TREE,
                      'timestamp': 1700000000000}, ensure_ascii=False)
LOGIN = json.dumps({'id': 'notes-upgrade-fixture', 'usuario': 'fixture',
                    'nome': 'Conta sintética', 'loginId': 'already-authenticated-fixture'})
FIXTURE = '''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/sentinela-2026/navbar/navbar-unified.css"></head><body><main>Entrada de teste</main>
<script>window.semanaAtual='02-11';</script><script src="/sentinela-2026/navbar/navbar-unified.js"></script>
</body></html>'''


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *args):
        pass

    def do_GET(self):
        if 'notes-upgrade-fixture' in self.path:
            data = FIXTURE.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if self.path.startswith(PREFIX):
            self.path = '/' + self.path[len(PREFIX):]
        try:
            super().do_GET()
        except (BrokenPipeError, ConnectionResetError):
            pass


def check(engine, executable, origin):
    browser = engine.launch(executable_path=executable, headless=True,
                            args=['--no-sandbox'] if engine.name == 'chromium' else [])
    base = origin + PREFIX
    errors = []
    routes = ['navbar',
              f'richtext/container.html?semana={WEEK}',
              f'richtext/container.html?semana={WEEK}&versao=1#saved-place',
              f'richtext/container-v1.html?semana={WEEK}',
              f'richtext/container-v1.html?semana={WEEK}&versao=1#saved-place']

    def assert_preserved(page):
        page.evaluate('cacheRichText.ready')
        assert page.evaluate('window.cacheRichText.semanaAtual()') == WEEK
        assert page.locator('#editor strong').inner_text() == 'preservada'
        assert page.locator('#editor mark').inner_text() == 'destaque'
        assert page.locator('#editor .node-toggle').get_attribute('data-open') == 'false'
        assert 'Conteúdo interno intacto.' in page.locator('#editor').text_content()
        assert page.evaluate('cacheRichText.snapshot().payload.tree') == TREE
        assert page.evaluate("JSON.parse(localStorage.getItem('supabase_user')).id") == 'notes-upgrade-fixture'
        assert page.evaluate("localStorage.getItem('richtext_cache_09-11')") == 'another-week-preserved'
        assert page.evaluate("localStorage.getItem('ass26:richtext_cache_02-11')") == 'assembly-notes-preserved'
        assert page.evaluate("localStorage.getItem('ass26:supabase_user')") == 'assembly-login-preserved'
        assert page.evaluate('NotesVersions.getBackup().then(b => b.raw)') == PAYLOAD
        assert page.evaluate('typeof AssemblyScope') == 'undefined'

    for route in routes:
        context = browser.new_context(viewport={'width': 430, 'height': 873}, has_touch=True,
                                      is_mobile=True, service_workers='block')
        context.add_init_script("Object.defineProperty(Navigator.prototype, 'onLine', {get: () => false});")
        context.route('**/*', lambda r: r.continue_() if r.request.url.startswith(origin + '/') else r.abort())
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base + 'notes-upgrade-fixture.html')
        page.wait_for_function('window.UnifiedNavbar?.get()')
        page.evaluate('''seed => {
          localStorage.setItem('sentinela-notes-version', '1');
          localStorage.setItem('sentinela-notes-version-choice', '1');
          localStorage.setItem('richtext_cache_02-11', seed.payload);
          localStorage.setItem('richtext_cache_09-11', 'another-week-preserved');
          localStorage.setItem('supabase_user', seed.login);
          localStorage.setItem('ass26:richtext_cache_02-11', 'assembly-notes-preserved');
          localStorage.setItem('ass26:supabase_user', 'assembly-login-preserved');
        }''', {'payload': PAYLOAD, 'login': LOGIN})
        if route == 'navbar':
            page.locator('.bottom-navbar [data-page="notes"]').click()
        else:
            page.goto(base + route)
        page.wait_for_function('window.cacheRichText && window.NotesVersions')
        assert page.evaluate('document.documentElement.dataset.notesVersion') == '2', (route, page.url)
        assert urlsplit(page.url).path == PREFIX + 'richtext/container.html', page.url
        assert parse_qs(urlsplit(page.url).query)['semana'] == [WEEK]
        if route.endswith('#saved-place'):
            assert urlsplit(page.url).fragment == 'saved-place'
        page.wait_for_function('window.NotesMenu && window.NotesEditorActions')
        assert page.locator('script[src*="richtext-v1"]').count() == 0
        assert_preserved(page)

        # Real active-navbar tap opens the compact tools, not the old versions dialog.
        page.locator('.bottom-navbar [data-page="notes"]').tap()
        page.wait_for_function('NotesMenu.isOpen')
        assert page.locator('#notes-tools [data-notes-action]').count() == 12
        assert page.locator('#notes-tools [data-notes-action="orderedList"]').count() == 1
        assert page.locator('#notes-tools [data-notes-action="toggle"]').text_content().strip() == 'Toggle'
        assert page.locator('#notes-versions:not([hidden])').count() == 0
        page.locator('#notes-tools-close').tap()
        page.reload()
        page.wait_for_function('window.NotesMenu && window.cacheRichText')
        assert page.evaluate('document.documentElement.dataset.notesVersion') == '2'
        assert_preserved(page)

        if route == 'navbar':
            # A new explicit technical choice remains available for recovery.
            # Unlike old versao=1 bookmarks, it is unambiguous and intentional.
            page.evaluate("void NotesVersions.switchTo('1')")
            page.wait_for_url('**/container-v1.html?*')
            page.wait_for_function('window.NotesVersions?.current === "1" && window.cacheRichText')
            assert parse_qs(urlsplit(page.url).query).get('legado') == ['1']
            page.evaluate('cacheRichText.ready')
            assert 'preservada' in page.locator('#editor').text_content()
            page.evaluate("void NotesVersions.switchTo('2')")
            page.wait_for_function('window.NotesVersions?.current === "2" && window.NotesMenu')
            assert 'legado' not in parse_qs(urlsplit(page.url).query)
            assert_preserved(page)
        context.close()
    browser.close()
    assert not errors, errors
    return {'engine': engine.name, 'oldEntrypoints': len(routes), 'treeAndBackupPreserved': True,
            'rawLoginAndOtherAppPreserved': True, 'currentCompactMenu': True, 'explicitRecovery': True}


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as playwright:
            result = [check(playwright.chromium, os.getenv('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), origin)]
            if os.getenv('WEBKIT_EXECUTABLE'):
                result.append(check(playwright.webkit, os.environ['WEBKIT_EXECUTABLE'], origin))
            print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        server.shutdown()
