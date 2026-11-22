"""Exercise the installed Notes pull-and-hold gesture and its browser boundary."""
import os
from http.server import ThreadingHTTPServer
from threading import Thread

from playwright.sync_api import expect, sync_playwright

from test_notes_upgrade import Handler, PREFIX


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

        pull()
        expect(ring).to_be_visible()
        page.wait_for_timeout(4500)
        expect(ring).to_be_visible()
        remaining = ring.locator('.notes-compartment-fill').evaluate("el => parseFloat(getComputedStyle(el).strokeDashoffset)")
        assert 0 < remaining < 40, remaining
        expect(panel).to_have_count(0)
        expect(panel).to_be_visible(timeout=1500)
        expect(ring).to_have_count(0)
        expect(panel.get_by_role('img', name='IA')).to_be_visible()
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
    print(f'PASS {engine.name}: PWA-only pull, cancellation, five-second hold, hide and repeat', flush=True)


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
