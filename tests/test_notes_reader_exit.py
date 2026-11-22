"""Exit the Notes Bible reader by touch in an installed-app viewport.

The native keyboard is unavailable in headless browsers. The test changes the
visual viewport height independently of the layout viewport, as on iPhone.
"""
import os
import re
from http.server import ThreadingHTTPServer
from threading import Thread

from playwright.sync_api import expect, sync_playwright

from test_notes_upgrade import Handler, PREFIX


def check(engine, executable, origin):
    browser = engine.launch(executable_path=executable, headless=True,
                            args=['--no-sandbox'] if engine.name == 'chromium' else [])
    context = browser.new_context(
        viewport={'width': 430, 'height': 873}, is_mobile=True, has_touch=True,
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        service_workers='block',
    )
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
    context.add_init_script("""
        Object.defineProperty(navigator, 'standalone', {get: () => true});
        window.setKeyboardInset = inset => {
            Object.defineProperty(visualViewport, 'height', {configurable:true, get: () => innerHeight - inset});
            visualViewport.dispatchEvent(new Event('resize'));
        };
    """)
    page = context.new_page()
    page.goto(origin + PREFIX + 'index.html')
    nav_notes = page.locator('.bottom-navbar [data-page="notes"]')
    nav_notes.tap()
    page.wait_for_function('window.cacheRichText && window.LeitorMode && window.NotesViewport?.enabled')
    page.evaluate('cacheRichText.ready')

    tree = [{'type': 'toggle', 'text': 'Estudo', 'open': True, 'children': [
        {'type': 'toggle', 'text': 'Leitura', 'open': True, 'children': [
            {'type': 'text', 'text': 'Gênesis 1:1 e João 3:16'},
        ]},
    ]}]
    page.evaluate("tree => cacheRichText.applyContent({formato:'v23-tree', tree})", tree)
    title = page.locator('#editor .toggle-title').first
    reference = page.locator('#editor .bbl').first
    toolbar = page.locator('#kbdToolbar')
    book = toolbar.locator('button[aria-label="Modo Bíblia"]')
    close_verse = page.locator('#modal-biblia-fechar')
    nav = page.locator('.bottom-navbar')
    hidden_class = re.compile(r'\bhidden\b')

    def touch_title():
        title.tap(position={'x': 10, 'y': 12})
        page.wait_for_function("""() => document.activeElement.id === 'editor'
            && document.querySelector('#editor .toggle-title').contains(getSelection().anchorNode)""")

    for open_verse in (False, True):
        touch_title()
        page.evaluate('setKeyboardInset(360)')
        page.wait_for_function('M11_Layout.viewportState().keyboardOpen')
        book.tap()
        expect(book).to_have_attribute('aria-pressed', 'true')
        page.evaluate('setKeyboardInset(0)')
        expect(reference).to_be_visible()
        expect(close_verse).to_be_hidden()
        if open_verse:
            reference.tap()
            expect(close_verse).to_be_visible()
            close_verse.tap()
            expect(close_verse).to_be_hidden()
        expect(nav).to_have_class(hidden_class)
        # Space two intentional taps beyond the reader's double-tap guard.
        page.wait_for_timeout(310)
        book.tap()
        expect(book).to_have_attribute('aria-pressed', 'false')
        # No outside tap, keyboard dismissal or manual clearing of selection.
        expect(nav).not_to_have_class(hidden_class, timeout=600)
        expect(toolbar).to_be_hidden(timeout=1200)
        assert page.evaluate("""() => {
            const editor = document.querySelector('#editor');
            return !editor.contains(document.activeElement) && !editor.contains(getSelection().anchorNode)
                && !M11_Layout.viewportState().keyboardOpen;
        }""")
        nav_notes.tap(timeout=1200)
        expect(nav_notes).to_have_attribute('aria-expanded', 'true')
        page.locator('#notes-tools-close').tap()
        expect(nav_notes).to_have_attribute('aria-expanded', 'false')
        expect(page.locator('#notes-tools')).to_be_hidden()
        assert title.inner_text() == 'Estudo'
        assert page.locator('#editor .text-content').inner_text() == 'Gênesis 1:1 e João 3:16'
    touch_title()
    page.keyboard.insert_text('novo')
    expect(title).to_contain_text('novo')
    assert title.inner_text().replace('novo', '') == 'Estudo'
    expect(toolbar).to_be_visible()

    # Transcribing from the preview is an intentional return to writing.
    book.tap()
    reference.tap()
    page.locator('#modal-biblia-transcrever').tap()
    expect(book).to_have_attribute('aria-pressed', 'false')
    verse = page.locator('#editor .versiculo-transc')
    expect(verse).to_contain_text('No princípio')
    page.keyboard.insert_text(' anotado')
    expect(page.locator('#editor .text-content')).to_contain_text('anotado')
    expect(toolbar).to_be_visible()
    browser.close()
    print(f'PASS {engine.name}: exit by book, with and without verse preview, immediate navigation and fresh editing', flush=True)


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
