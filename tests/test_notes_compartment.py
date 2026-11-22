"""Exercise the installed Notes gesture and summarization on disposable notes only."""
import os
import re
from http.server import ThreadingHTTPServer
from threading import Thread

from playwright.sync_api import expect, sync_playwright

from test_notes_upgrade import Handler, PREFIX, ROOT


class SummaryHandler(Handler):
    def do_GET(self):
        if self.server.unavailable:
            self.send_response(503)
            self.end_headers()
            return
        super().do_GET()


def check_summary(page, panel, open_panel, offline_reload):
    generate = panel.locator('[data-summary-generate]')
    regenerate = panel.locator('button[data-summary-regenerate]')
    status = panel.locator('[data-summary-status]')
    result = panel.locator('[data-summary-result]')
    def restore(tree):
        assert page.evaluate('tree => cacheRichText.applyContent({tree})', tree)

    def start(control=generate):
        count = page.evaluate('testSummaryRequests.length')
        control.tap()
        page.wait_for_function('count => testSummaryRequests.length === count + 1', arg=count)
        return count

    # Model output may quote a number. Only the panel's own controls and hints
    # should omit any visible character total or numeric minimum.
    def expect_no_count():
        expect(panel.locator('[data-summary-count]')).to_be_hidden()
        for chrome in [panel.locator('header'), status, panel.locator('footer')]:
            expect(chrome).not_to_contain_text(re.compile(r'\d|caracter(?:e|es)\b', re.I), use_inner_text=True)

    expect(generate).to_be_disabled()
    expect(status).not_to_have_text('')
    expect_no_count()
    restore([{'type': 'paragraph', 'text': 'a' * 49}])
    assert page.evaluate('NotesSummarySource.read().characters') == 49
    expect(generate).to_be_disabled()
    expect_no_count()
    assert page.evaluate('testSummaryRequests.length') == 0
    restore([{'type': 'paragraph', 'text': 'a' * 50}])
    assert page.evaluate('NotesSummarySource.read().characters') == 50
    expect(generate).to_be_enabled()
    expect_no_count()
    page.context.set_offline(True)
    expect(generate).to_be_disabled()
    expect(status).to_contain_text('internet')
    expect_no_count()
    page.context.set_offline(False)
    expect(generate).to_be_enabled()
    first = start()
    assert 'a' * 50 in page.evaluate('testSummaryRequests[0].outline')
    expect(status).to_contain_text('Resumindo')
    expect_no_count()
    spinner = panel.locator('.notes-summary-spinner svg')
    expect(spinner).to_be_visible()
    article = (ROOT / 'sentinela/clickable/clickable.js').read_text()
    article_path = re.search(r'<svg class="ia-sparkle"[^>]*>\s*<path d="([^"]+)"', article)
    assert article_path
    assert spinner.locator('path').get_attribute('d') == article_path.group(1)
    center_offset = spinner.evaluate("""svg => {
        const shape = svg.getBoundingClientRect(), panel = svg.closest('aside').getBoundingClientRect();
        return shape.x + shape.width / 2 - (panel.x + panel.width / 2);
    }""")
    assert abs(center_offset) <= 2, center_offset
    page.emulate_media(reduced_motion='no-preference')
    expect(spinner).to_have_css('animation-iteration-count', 'infinite')
    assert spinner.evaluate("svg => svg.getAnimations().some(a => a.effect.getKeyframes().some(k => k.transform?.includes('rotate')))"), 'Star should rotate while summarizing'
    page.emulate_media(reduced_motion='reduce')
    expect(spinner).to_have_css('animation-name', 'none')
    page.emulate_media(reduced_motion='no-preference')
    page.evaluate("i => testSummaryRequests[i].reject(new Error('Falha de rede simulada'))", first)
    expect(generate).to_be_enabled()
    expect(status).to_contain_text('Tente novamente')
    expect_no_count()
    retry = start()
    page.evaluate("i => testSummaryRequests[i].resolve('A leitura citada foi Gênesis 1:1.')", retry)
    expect(result).to_contain_text('A leitura citada foi Gênesis 1:1.')
    expect_no_count()
    expect(panel.locator('footer')).to_be_hidden()
    expect(regenerate).to_have_accessible_name('Resumir novamente')
    expect(regenerate).to_be_enabled()
    refresh_star = regenerate.locator('svg')
    expect(refresh_star).to_be_visible()
    assert refresh_star.locator('path').get_attribute('d') == article_path.group(1)
    assert regenerate.bounding_box()['x'] < panel.get_by_role('heading').bounding_box()['x']
    expect(refresh_star).to_have_css('animation-name', 'none')
    replacement = start(regenerate)
    expect(result).to_be_visible()
    expect(result).to_have_text('A leitura citada foi Gênesis 1:1.')
    expect(spinner).to_be_hidden()
    expect(panel.locator('footer')).to_be_hidden()
    expect(refresh_star).to_have_css('animation-iteration-count', 'infinite')
    assert refresh_star.evaluate("svg => svg.getAnimations().some(a => a.effect.getKeyframes().some(k => k.transform?.includes('rotate')))")
    assert panel.locator('svg:visible').evaluate_all("""svgs => svgs.filter(svg =>
        svg.getAnimations().length > 0).length""") == 1
    position = regenerate.bounding_box()
    page.touchscreen.tap(position['x'] + position['width'] / 2, position['y'] + position['height'] / 2)
    assert page.evaluate('testSummaryRequests.length') == replacement + 1
    page.emulate_media(reduced_motion='reduce')
    expect(refresh_star).to_have_css('animation-name', 'none')
    page.emulate_media(reduced_motion='no-preference')
    page.evaluate("i => testSummaryRequests[i].reject(new Error('Interrompido'))", replacement)
    expect(regenerate).to_be_enabled()
    expect(refresh_star).to_have_css('animation-name', 'none')
    expect(result).to_have_text('A leitura citada foi Gênesis 1:1.')
    expect(status).to_contain_text(re.compile(r'não foi possível|tente novamente', re.I))
    expect(panel.locator('footer')).to_be_hidden()
    replacement = start(regenerate)
    page.evaluate("i => testSummaryRequests[i].resolve('Nova síntese com outra redação.')", replacement)
    expect(result).to_have_text('Nova síntese com outra redação.')
    expect(regenerate).to_be_enabled()
    expect(refresh_star).to_have_css('animation-name', 'none')
    expect(generate).to_be_hidden()

    tree = [
        {'type': 'paragraph', 'text': 'Discurso sobre perseverança.'},
        {'type': 'toggle', 'text': 'Pequenos passos', 'open': False, 'children': [
            {'type': 'toggle', 'text': 'Aplicação', 'open': False, 'children': [
                {'type': 'text', 'html': '<strong>Começar</strong> durante a semana.'},
            ]},
        ]},
        {'type': 'paragraph', 'html': '<ol><li>Definir a meta.</li><li>Rever o progresso.</li></ol>'},
    ]
    restore(tree)
    def editor_content():
        return page.evaluate('''() => {
            const {tree, html} = cacheRichText.snapshot().payload;
            return {tree, html};
        }''')

    before = editor_content()
    pending = start()
    outline = page.evaluate('i => testSummaryRequests[i].outline', pending)
    for phrase in ['Discurso sobre perseverança.', 'Pequenos passos', 'Aplicação',
                   'Começar durante a semana.', 'Definir a meta.', 'Rever o progresso.']:
        assert phrase in outline, (phrase, outline)
    assert '<strong>' not in outline and '<li>' not in outline
    page.evaluate("i => testSummaryRequests[i].resolve('A perseverança cresce com metas pequenas e revisões regulares.')", pending)
    expect(result).to_contain_text('A perseverança cresce')
    assert page.locator('#editor .node-toggle[data-open=false]').count() == 2
    assert editor_content() == before
    # Toggle expansion and emphasis alter the document tree or HTML but leave
    # the outline sent to the model unchanged.
    page.locator('#editor .toggle-arrow').first.tap()
    expect(page.locator('#editor .toggle-arrow').first).to_have_attribute('aria-expanded', 'true')
    field = page.locator('#editor .paragraph-content').first
    before_format = field.inner_html()
    field.tap()
    assert field.evaluate("""field => {
        const range = document.createRange();
        range.selectNodeContents(field);
        const selection = window.getSelection();
        selection.removeAllRanges(); selection.addRange(range);
        return document.execCommand('bold');
    }""")
    page.evaluate('document.activeElement.blur(); getSelection().removeAllRanges()')
    assert field.inner_html() != before_format
    assert page.evaluate('NotesSummarySource.read().outline') == outline
    panel.get_by_role('button', name='Ocultar compartimento de IA').tap()
    open_panel()
    expect(result).to_contain_text('A perseverança cresce')
    assert page.evaluate('testSummaryRequests.length') == pending + 1

    # A changed editor and a dismissed compartment must ignore even a provider
    # that resolves after receiving the cancellation signal.
    obsolete = start(regenerate)
    restore([{'type': 'paragraph', 'text': 'Nova versão: a leitura regular permite descobrir ideias importantes.'}])
    page.wait_for_function('i => testSummaryRequests[i].signal.aborted', arg=obsolete)
    expect(result).to_be_hidden()
    page.evaluate("i => testSummaryRequests[i].resolve('Resposta obsoleta')", obsolete)
    expect(panel).not_to_contain_text('Resposta obsoleta')
    edited = start()
    field = page.locator('#editor .paragraph-content').first
    field.tap()
    field.press('End')
    page.keyboard.insert_text(' E praticar o que se aprende.')
    page.wait_for_function('i => testSummaryRequests[i].signal.aborted', arg=edited)
    page.evaluate("i => testSummaryRequests[i].resolve('Texto anterior à edição')", edited)
    expect(panel).not_to_contain_text('Texto anterior à edição')
    page.evaluate('document.activeElement.blur(); getSelection().removeAllRanges()')
    latest = start()
    page.evaluate("i => testSummaryRequests[i].resolve('Resumo da última edição.')", latest)
    expect(result).to_have_text('Resumo da última edição.')
    dismissed = start(regenerate)
    panel.get_by_role('button', name='Ocultar compartimento de IA').tap()
    expect(panel).to_have_count(0)
    assert page.evaluate('i => testSummaryRequests[i].signal.aborted', dismissed)
    page.evaluate("i => testSummaryRequests[i].resolve('Resposta já descartada')", dismissed)
    expect(page.locator('body')).not_to_contain_text('Resposta já descartada')

    open_panel()
    expect(result).to_have_text('Resumo da última edição.')
    assert page.evaluate('testSummaryRequests.length') == dismissed + 1
    updated = start(regenerate)
    page.evaluate("i => testSummaryRequests[i].resolve('Nova síntese para a mesma semana.')", updated)
    expect(result).to_have_text('Nova síntese para a mesma semana.')
    saved_note = editor_content()
    offline_reload()
    open_panel()
    expect(result).to_have_text('Nova síntese para a mesma semana.')
    expect(regenerate).to_be_disabled()
    assert page.evaluate('testSummaryRequests.length') == 0
    assert editor_content() == saved_note
    page.context.set_offline(False)
    original_url = page.url
    page.goto(original_url.replace('semana=16-11', 'semana=23-11'))
    page.evaluate('cacheRichText.ready')
    restore(saved_note['tree'])
    open_panel()
    expect(result).to_be_hidden()
    expect(generate).to_be_enabled()
    assert page.evaluate('testSummaryRequests.length') == 0
    page.goto(original_url)
    page.evaluate('cacheRichText.ready')
    open_panel()
    expect(result).to_have_text('Nova síntese para a mesma semana.')
    assert page.evaluate('testSummaryRequests.length') == 0
    panel.get_by_role('button', name='Ocultar compartimento de IA').tap()


def check(engine, executable, origin, server):
    browser = engine.launch(executable_path=executable, headless=True,
                            args=['--no-sandbox'] if engine.name == 'chromium' else [])
    for installed in (False, True):
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True,
                                      has_touch=True, service_workers='allow' if installed else 'block')
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
        if installed:
            context.add_init_script("Object.defineProperty(navigator, 'standalone', {get: () => true})")
            # Delay the model only. The editor, storage and offline shell are real.
            context.add_init_script("""document.addEventListener('DOMContentLoaded', () => {
                window.testSummaryRequests = [];
                window.NotesSummaryAgent = {summarize: (outline, {signal}) => new Promise((resolve, reject) =>
                    testSummaryRequests.push({outline, signal, resolve, reject}))};
            });""")
        page = context.new_page()
        page.goto(origin + PREFIX + 'richtext/container.html?versao=2&semana=16-11')
        page.wait_for_function('window.cacheRichText && window.NotesMenu')
        page.evaluate('cacheRichText.ready')
        if installed:
            page.wait_for_function("navigator.serviceWorker.controller?.state === 'activated'", timeout=90000)

        # Chromium supports native touch drags through CDP. On WebKit drive the
        # same TouchEvent sequence directly because Playwright exposes taps only.
        session = context.new_cdp_session(page) if engine.name == 'chromium' else None

        def touch(kind, y):
            if session:
                points = [] if kind in ('end', 'cancel') else [{'x': 175, 'y': y, 'id': 1}]
                session.send('Input.dispatchTouchEvent', {'type': 'touch' + kind.title(), 'touchPoints': points})
            else:
                page.evaluate("""([kind, y]) => {
                    const target = document.querySelector('#editorScroll');
                    const touch = {clientX: 175, clientY: y, identifier: 1};
                    const touches = ['end','cancel'].includes(kind) ? [] : [touch];
                    const event = new Event('touch' + kind, {bubbles: true, cancelable: true});
                    Object.assign(event, {touches, changedTouches: [touch]});
                    target.dispatchEvent(event);
                }""", [kind, y])

        def pull():
            touch('start', 240)
            for y in (252, 264, 285, 310):
                touch('move', y)

        ring = page.locator('#notes-compartment-progress')
        panel = page.locator('#notes-compartment')

        def open_panel():
            pull()
            expect(panel).to_be_visible(timeout=3300)
            touch('end', 310)

        def offline_reload():
            # WebKit's automation offline flag rejects top-level navigation even
            # with an active worker. Make the origin unavailable to both engines.
            server.unavailable = True
            try:
                context.set_offline(engine.name == 'chromium')
                response = page.reload(wait_until='domcontentloaded')
                assert response.status == 200 and response.headers.get('x-sentinela-app-version'), response.headers
                page.evaluate('cacheRichText.ready')
                if page.evaluate('navigator.onLine'):
                    context.set_offline(False)
                context.set_offline(True)
                page.wait_for_function('!navigator.onLine')
            finally:
                server.unavailable = False
        pull()
        if not installed:
            expect(ring).to_have_count(0)
            expect(panel).to_have_count(0)
            touch('end', 310)
            context.close()
            continue

        expect(ring).to_be_visible()
        touch('end', 310)
        expect(ring).to_have_count(0)
        expect(panel).to_have_count(0)
        pull()
        expect(ring).to_be_visible()
        touch('cancel', 310)
        expect(ring).to_have_count(0)
        touch('start', 300)
        touch('move', 220)
        expect(ring).to_have_count(0)
        touch('end', 220)

        page.locator('.bottom-navbar [data-page="notes"]').tap()
        page.locator('#notes-tools [data-notes-action="search"]').tap()
        page.locator('#notes-search-input').press('Enter')
        page.wait_for_function("document.activeElement.id !== 'notes-search-input'")
        page.locator('#editorScroll').evaluate('scroll => { scroll.scrollTop = 0 }')
        pull()
        expect(ring).to_have_count(0)
        touch('end', 310)
        page.locator('#notes-tools-close').press('Enter')
        expect(page.locator('#notes-tools')).to_be_hidden()
        page.wait_for_function("document.querySelector('#editorScroll').scrollTop <= 1")

        page.evaluate("""() => {
            window.testHold = {};
            const watch = new MutationObserver(entries => {
                for (const e of entries) for (const node of e.addedNodes) {
                    if (node.id === 'notes-compartment-progress') testHold.start = performance.now();
                    if (node.id === 'notes-compartment') { testHold.end = performance.now(); watch.disconnect(); }
                }
            });
            watch.observe(document.body, {childList: true, subtree: true});
        }""")
        pull()
        expect(ring).to_be_visible()
        expect(ring.locator('.notes-compartment-fill')).to_have_css('animation-duration', '1.2s')
        page.wait_for_function("""() => {
            const circle = document.querySelector('#notes-compartment-progress .notes-compartment-fill');
            const remaining = circle && parseFloat(getComputedStyle(circle).strokeDashoffset);
            return remaining > 0 && remaining < 90;
        }""")
        expect(panel).to_have_count(0)
        expect(panel).to_be_visible(timeout=3000)
        elapsed = page.evaluate('testHold.end - testHold.start')
        assert 1150 <= elapsed < 1900, elapsed
        expect(ring).to_have_count(0)
        expect(panel.locator('[data-summary-generate]')).to_be_visible()
        expect(panel).to_be_in_viewport(ratio=1)
        touch('end', 310)
        panel.get_by_role('button', name='Ocultar compartimento de IA').tap()
        expect(panel).to_have_count(0)
        pull()
        expect(ring).to_be_visible()
        touch('end', 310)
        expect(page.locator('#notes-week-placeholder')).to_be_visible()
        editor = page.locator('#editor')
        expect(editor).not_to_be_focused()
        pull()
        expect(panel).to_be_visible(timeout=3300)
        touch('end', 310)
        check_summary(page, panel, open_panel, offline_reload)
        editor.locator('.paragraph-content').first.tap()
        pull()
        expect(ring).to_have_count(0)
        touch('end', 310)
        page.evaluate("""() => {
            const tree = Array.from({length: 120}, (_, i) => ({type: 'paragraph', text: 'Linha ' + i}));
            cacheRichText.applyContent({tree});
            document.activeElement.blur(); getSelection().removeAllRanges();
            document.querySelector('#editorScroll').scrollTop = 800;
        }""")
        pull()
        expect(ring).to_have_count(0)
        touch('end', 310)
        assert page.locator('#editorScroll').evaluate('e => e.scrollTop') > 0
        context.close()
    browser.close()
    print(f'PASS {engine.name}: 1.2-second PWA gesture, 49/50 threshold, nested notes, regeneration, offline restore and weekly isolation', flush=True)


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), SummaryHandler)
    server.unavailable = False
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as playwright:
            check(playwright.chromium, os.getenv('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), origin, server)
            if os.getenv('WEBKIT_EXECUTABLE'):
                check(playwright.webkit, os.environ['WEBKIT_EXECUTABLE'], origin, server)
    finally:
        server.shutdown()
