"""Exercise the installed Notes gesture and summarization on disposable notes only."""
import os
import re
from http.server import ThreadingHTTPServer
from threading import Thread

from playwright.sync_api import expect, sync_playwright

from test_notes_upgrade import Handler, PREFIX, ROOT


def check_summary(page, panel):
    generate = panel.locator('[data-summary-generate]')
    status = panel.locator('[data-summary-status]')
    result = panel.locator('[data-summary-result]')
    # Delay the model itself. Local inputs, serialization and user interactions
    # still pass through the same editor and compartment as on an installed PWA.
    page.evaluate("""() => {
        window.testSummaryRequests = [];
        window.NotesSummaryAgent = {summarize: (outline, {signal}) =>
            new Promise((resolve, reject) => testSummaryRequests.push({outline, signal, resolve, reject}))};
    }""")

    def restore(tree):
        assert page.evaluate('tree => cacheRichText.applyContent({tree})', tree)

    def start():
        count = page.evaluate('testSummaryRequests.length')
        generate.tap()
        page.wait_for_function('count => testSummaryRequests.length === count + 1', arg=count)
        return count

    expect(generate).to_be_disabled()
    expect(status).to_contain_text('50')
    restore([{'type': 'paragraph', 'text': 'a' * 49}])
    assert page.evaluate('NotesSummarySource.read().characters') == 49
    expect(generate).to_be_disabled()
    assert page.evaluate('testSummaryRequests.length') == 0
    restore([{'type': 'paragraph', 'text': 'a' * 50}])
    assert page.evaluate('NotesSummarySource.read().characters') == 50
    expect(generate).to_be_enabled()
    page.context.set_offline(True)
    expect(generate).to_be_disabled()
    expect(status).to_contain_text('internet')
    page.context.set_offline(False)
    expect(generate).to_be_enabled()
    first = start()
    assert 'a' * 50 in page.evaluate('testSummaryRequests[0].outline')
    expect(status).to_contain_text('Resumindo')
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
    retry = start()
    page.evaluate("i => testSummaryRequests[i].resolve('Uma síntese de teste.')", retry)
    expect(result).to_contain_text('Uma síntese de teste.')

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
    before = page.evaluate('cacheRichText.snapshot().key')
    pending = start()
    outline = page.evaluate('i => testSummaryRequests[i].outline', pending)
    for phrase in ['Discurso sobre perseverança.', 'Pequenos passos', 'Aplicação',
                   'Começar durante a semana.', 'Definir a meta.', 'Rever o progresso.']:
        assert phrase in outline, (phrase, outline)
    assert '<strong>' not in outline and '<li>' not in outline
    page.evaluate("i => testSummaryRequests[i].resolve('A perseverança cresce com metas pequenas e revisões regulares.')", pending)
    expect(result).to_contain_text('A perseverança cresce')
    assert page.locator('#editor .node-toggle[data-open=false]').count() == 2
    assert page.evaluate('cacheRichText.snapshot().key') == before

    # A changed editor and a dismissed compartment must ignore even a provider
    # that resolves after receiving the cancellation signal.
    restore([{'type': 'paragraph', 'text': 'Outro discurso de teste sobre a importância da leitura diária.'}])
    obsolete = start()
    restore([{'type': 'paragraph', 'text': 'Nova versão: a leitura regular permite descobrir ideias importantes.'}])
    page.wait_for_function('i => testSummaryRequests[i].signal.aborted', arg=obsolete)
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
    dismissed = start()
    panel.get_by_role('button', name='Ocultar compartimento de IA').tap()
    expect(panel).to_have_count(0)
    assert page.evaluate('i => testSummaryRequests[i].signal.aborted', dismissed)
    page.evaluate("i => testSummaryRequests[i].resolve('Resposta já descartada')", dismissed)
    expect(page.locator('body')).not_to_contain_text('Resposta já descartada')


def check(engine, executable, origin):
    browser = engine.launch(executable_path=executable, headless=True,
                            args=['--no-sandbox'] if engine.name == 'chromium' else [])
    for installed in (False, True):
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True,
                                      has_touch=True, service_workers='block')
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
        if installed:
            context.add_init_script("Object.defineProperty(navigator, 'standalone', {get: () => true})")
        page = context.new_page()
        page.goto(origin + PREFIX + 'richtext/container.html?versao=2&semana=16-11')
        page.wait_for_function('window.cacheRichText && window.NotesMenu')
        page.evaluate('cacheRichText.ready')

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
        expect(ring.locator('.notes-compartment-fill')).to_have_css('animation-duration', '2s')
        page.wait_for_function("""() => {
            const circle = document.querySelector('#notes-compartment-progress .notes-compartment-fill');
            const remaining = circle && parseFloat(getComputedStyle(circle).strokeDashoffset);
            return remaining > 0 && remaining < 90;
        }""")
        expect(panel).to_have_count(0)
        expect(panel).to_be_visible(timeout=3000)
        elapsed = page.evaluate('testHold.end - testHold.start')
        assert 1950 <= elapsed < 3300, elapsed
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
        check_summary(page, panel)
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
    print(f'PASS {engine.name}: PWA-only two-second pull, 49/50 boundary, nested notes, retries and cancellation', flush=True)


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as playwright:
            check(playwright.chromium, os.getenv('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), origin)
            if os.getenv('WEBKIT_EXECUTABLE'):
                check(playwright.webkit, os.environ['WEBKIT_EXECUTABLE'], origin)
    finally:
        server.shutdown()
