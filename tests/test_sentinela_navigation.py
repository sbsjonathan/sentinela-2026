"""Sentinela keeps its carousel, selected week, original identity and downloads.

Exercises production navbar, Notes, Bible reference return, article loader and
article menu on the GitHub Pages subpath. All content and account data are
synthetic; external requests are blocked. Set WEBKIT_EXECUTABLE for WebKit.
"""
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from urllib.parse import parse_qs, urlencode, urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PREFIX = '/sentinela-2026/'
ICON_REVISION = '2026.11.02.12'
FIXTURE = '''<!doctype html><html lang="pt-BR"><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/sentinela-2026/navbar/navbar-unified.css">
</head><body><main><p>Isolated navigation fixture</p></main>
<script src="/sentinela-2026/sentinela/artigos/article-runtime.js"></script>
<script src="/sentinela-2026/navbar/navbar-unified.js"></script></body></html>'''
CACHED_ARTICLE = '''<!doctype html><html lang="pt-BR"><head>
<title>A Sentinela</title><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="../../navbar/navbar-unified.css">
<link rel="stylesheet" href="../menu/menu.css">
<style>body{margin:0;--cor-principal-estudo:#604184}main{padding:20px}.paragrafo{min-height:180px}</style>
</head><body data-estudo="02-11"><header class="barra-estudo">Estudo preservado</header>
<main><p class="paragrafo" id="saved-study"><span>1</span> Download anterior preservado.</p>
<p class="paragrafo" id="p2"><span>2</span> Segundo parágrafo sintético.</p>
<p class="paragrafo"><span>3</span> Terceiro parágrafo sintético.</p></main>
<script>window.semanaAtual='02-11';</script>
<script src="../menu/menu.js"></script>
<script src="../../navbar/navbar-unified.js"></script></body></html>'''
NOTE = 'Nota antiga da semana escolhida, preservada com a chave original.'
NOTE_PAYLOAD = json.dumps({
    'formato': 'legacy-html',
    'html': '<div class="node-paragraph"><div class="row"><div class="paragraph-content editable" '
            'contenteditable="true">' + NOTE + '</div></div></div>',
}, ensure_ascii=False)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *args):
        pass

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path.startswith(PREFIX) and 'qa_nav' in parse_qs(url.query):
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
    profiles, errors, remote = [], [], []
    base = origin + PREFIX

    def new_context(real_article=False):
        options = dict(viewport={'width': 430, 'height': 873}, timezone_id='UTC',
                       service_workers='block')
        if engine.name == 'webkit' and real_article:
            # WPE ephemeral profiles lose CacheStorage across navigation. An
            # installed PWA, like this fixture, uses persistent storage.
            profile = TemporaryDirectory(prefix='sentinela-navigation-')
            profiles.append(profile)
            context = engine.launch_persistent_context(profile.name, executable_path=executable,
                                                       headless=True, **options)
        else:
            context = browser.new_context(**options)
        context.add_init_script('''(() => {
          const NativeDate = Date;
          window.Date = class extends NativeDate {
            constructor(...args) { super(...(args.length ? args : ['2026-11-13T12:00:00Z'])); }
            static now() { return NativeDate.parse('2026-11-13T12:00:00Z'); }
          };
        })();''')

        def route(request):
            if request.request.url.startswith(origin + '/'):
                request.continue_()
            else:
                remote.append(request.request.url)
                request.abort()

        context.route('**/*', route)
        if not real_article:
            context.route('**/sentinela/artigos/estudo.html?d=*',
                          lambda route: route.fulfill(status=200, content_type='text/html', body=FIXTURE))
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        return context, page

    def open_fixture(page, route='index.html'):
        separator = '&' if '?' in route else '?'
        page.goto(base + route + separator + 'qa_nav=1')
        page.wait_for_function('window.UnifiedNavbar?.get()')

    def watchtower(page):
        return page.locator('.bottom-navbar [data-page="watchtower"]')

    def assert_identity(page):
        assert page.evaluate('typeof AssemblyScope') == 'undefined'
        assert page.evaluate('typeof AssemblyCurrentStudy') == 'undefined'
        assert page.locator('script[src*="app-scope.js"]').count() == 0
        for rel, name in [('icon', 'favicon-32.png'), ('apple-touch-icon', 'apple-touch-icon.png')]:
            assert page.locator(f'link[rel="{rel}"]').evaluate('(el) => el.href') == (
                base + f'assets/icons/{name}?v={ICON_REVISION}')

    # The repository's own name contains "sentinela". It must not make Save
    # appear as an article or give Home the article's scroll behavior.
    context, page = new_context()
    for path, expected in [('index.html', 'home'), ('', 'home'),
                           ('save/auth-supabase.html', 'save'), ('richtext/container.html', 'notes'),
                           ('biblia/biblia.html', 'bible')]:
        open_fixture(page, path)
        assert page.evaluate('window.UnifiedNavbar.get().currentPage') == expected, path
        assert page.locator('.bottom-navbar .active').get_attribute('data-page') == expected
        if expected in ['home', 'save']:
            assert page.evaluate('window.UnifiedNavbar.get().canAutoHide()') is False
        assert_identity(page)

    open_fixture(page)
    page.evaluate('''() => {
      window.semanaAtual = '09-11';
      window.carousel = {getVisibleWeek: () => '02-11', indiceCentral:3, currentSlide:1,
        goToSlide: (...args) => window.qaCarouselArgs=args};
      localStorage.setItem('supabase_user', JSON.stringify({id:'raw-sentinela-user'}));
      localStorage.setItem('ass26:supabase_user', JSON.stringify({id:'other-assembly-user'}));
      window.UnifiedNavbar.get().updateSaveButtonVisual();
    }''')
    assert page.locator('[data-page="save"]').evaluate('(el) => el.classList.contains("logged-in")')
    page.locator('.bottom-navbar [data-page="home"]').click()
    assert page.evaluate('qaCarouselArgs') == [3, True]
    assert page.evaluate('buildIndexEmBreveURL("02-11")') == base + 'index.html?semana=02-11&estado=em-breve'
    watchtower(page).click()
    page.wait_for_url(base + 'sentinela/artigos/estudo.html?d=2026-11-02')
    assert page.evaluate('JSON.parse(localStorage.getItem("supabase_user")).id') == 'raw-sentinela-user'
    assert page.evaluate('JSON.parse(localStorage.getItem("ass26:supabase_user")).id') == 'other-assembly-user'

    # Legacy document buttons still request their explicit week, not today's.
    open_fixture(page, 'save/auth-supabase.html')
    page.evaluate("irParaSentinelaAcao('02-11')")
    page.wait_for_url(base + 'sentinela/artigos/estudo.html?d=2026-11-02')
    context.close()

    # Restore actual raw notes from before the shared-UI upgrade. Their week
    # remains the Watchtower destination even though the clock is a week later.
    context, page = new_context()
    open_fixture(page)
    page.evaluate('''payload => {
      localStorage.setItem('richtext_cache_02-11', payload);
      localStorage.setItem('ass26:richtext_cache_02-11', 'Assembly note sentinel');
    }''', NOTE_PAYLOAD)
    page.goto(base + 'richtext/container.html?semana=02-11&versao=2')
    page.wait_for_function('window.cacheRichText && window.NotesMenu && window.UnifiedNavbar?.get()')
    page.evaluate('window.cacheRichText.ready')
    assert NOTE in page.locator('#editor').inner_text()
    assert page.evaluate('window.cacheRichText.semanaAtual()') == '02-11'
    assert page.evaluate('NotesVersions.ready.then(() => NotesVersions.getBackup()).then(b => b.raw)') == NOTE_PAYLOAD
    assert_identity(page)
    assert page.evaluate('localStorage.getItem("ass26:richtext_cache_02-11")') == 'Assembly note sentinel'
    # The backup is in the pre-existing, unprefixed IndexedDB identity too.
    assert page.evaluate('''() => new Promise((resolve, reject) => {
      const request=indexedDB.open('sentinela-notes-versions', 1);
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result;
        const read=db.transaction('before-v2').objectStore('before-v2').get('02-11');
        read.onsuccess=()=>{db.close();resolve(read.result.raw);};read.onerror=()=>reject(read.error);};
    })''') == NOTE_PAYLOAD
    watchtower(page).click()
    page.wait_for_url(base + 'sentinela/artigos/estudo.html?d=2026-11-02')
    context.close()

    # Use the production Bible route parser/return handler. The active article
    # icon must dispatch the return event and open the precise source/hash.
    context, page = new_context()
    parameters = urlencode({'studyView':'reference', 'from':'article', 'book':48,
                            'chapter':5, 'studyVerse':1,
                            'returnTo':'estudo.html?d=2026-11-02#p2', 'returnTitle':'Estudo anterior'})
    page.goto(base + 'biblia/biblia.html?' + parameters)
    page.wait_for_function('document.body.dataset.studyReferenceContext === "article" && window.UnifiedNavbar?.get()')
    page.evaluate('''() => {
      window.semanaAtual='09-11';
      document.addEventListener('sentinela:return-to-article', () => sessionStorage.setItem('qa-return-event', 'yes'));
    }''')
    assert page.locator('.bottom-navbar .active').get_attribute('data-page') == 'watchtower'
    watchtower(page).click()
    page.wait_for_url(base + 'sentinela/artigos/estudo.html?d=2026-11-02#p2')
    assert page.evaluate('sessionStorage.getItem("qa-return-event")') == 'yes'
    context.close()

    # Open a real old download through the real loader, without proxy requests.
    context, page = new_context(real_article=True)
    open_fixture(page)
    context.add_init_script("Object.defineProperty(Navigator.prototype, 'onLine', {get: () => false});")
    page.evaluate('''async html => {
      const runtime=SentinelaArticleRuntime;
      if(runtime.CACHE_NAME!=='artigo-offline-v1')throw new Error('Original download cache renamed');
      const cache=await caches.open('artigo-offline-v1');
      await cache.put(runtime.cacheKey('2026-11-02'),new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}}));
      window.carousel={getVisibleWeek:()=> '02-11'};
    }''', CACHED_ARTICLE)
    before = len(remote)
    watchtower(page).click()
    page.wait_for_selector('#saved-study')
    page.wait_for_function('window.SentinelaArticleMenu && window.UnifiedNavbar?.get()')
    assert page.url == base + 'sentinela/artigos/estudo.html?d=2026-11-02'
    assert 'Download anterior preservado' in page.locator('#saved-study').inner_text()
    assert not any('workers.dev' in url for url in remote[before:]), remote[before:]
    assert_identity(page)
    page.evaluate("window.qaDocumentMarker='same document'")
    watchtower(page).click()
    page.wait_for_selector('#sentinela-article-menu:not([hidden])')
    assert page.locator('.article-menu__card').count() == 2
    assert page.locator('.article-menu__paragraph').all_text_contents() == ['1', '2', '3']
    assert page.evaluate('qaDocumentMarker') == 'same document'
    assert page.url == base + 'sentinela/artigos/estudo.html?d=2026-11-02'
    watchtower(page).click()
    page.wait_for_selector('#sentinela-article-menu', state='hidden')
    assert page.evaluate('qaDocumentMarker') == 'same document'
    context.close()
    browser.close()
    for profile in profiles:
        profile.cleanup()
    assert not errors, errors
    return {'engine':engine.name, 'subpath_contexts':True, 'carousel_week':True,
            'legacy_week_shortcut':True, 'raw_notes_and_backup_identity':True,
            'bible_source_return':True, 'original_download_cache':True,
            'article_retap_menu':True, 'original_icons':True}


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as playwright:
            results = [check(playwright.chromium, os.getenv('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), origin)]
            if os.getenv('WEBKIT_EXECUTABLE'):
                results.append(check(playwright.webkit, os.environ['WEBKIT_EXECUTABLE'], origin))
            print(json.dumps(results, ensure_ascii=False, indent=2))
    finally:
        server.shutdown()
