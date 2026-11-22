"""Cut and paste against the native clipboard in the real Notes editor."""
import os
from http.server import ThreadingHTTPServer
from threading import Thread

from playwright.sync_api import sync_playwright

from test_notes_upgrade import Handler, PREFIX, WEEK


def check(engine, executable, origin):
    browser = engine.launch(executable_path=executable, headless=True,
                            args=['--no-sandbox'] if engine.name == 'chromium' else [])
    context = browser.new_context(viewport={'width': 430, 'height': 873}, is_mobile=True,
                                  has_touch=True, service_workers='block')
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(origin + PREFIX + 'richtext/container.html?semana=' + WEEK + '&versao=2')
    page.wait_for_function('window.cacheRichText && window.M12_History')
    page.evaluate('cacheRichText.ready')
    editor = page.locator('#editor')
    paragraph = editor.locator('.paragraph-content')
    week = 'Semana de 2 de novembro'

    def assert_empty():
        assert editor.locator('.editable').count() == 1
        assert paragraph.count() == 1 and paragraph.is_visible()
        assert paragraph.get_attribute('data-empty') == 'true'
        assert week in paragraph.evaluate("el => getComputedStyle(el,'::before').content")
        assert not editor.text_content().strip()
        assert editor.locator('li,.node-toggle,.node-text').count() == 0

    def pasted_text():
        # A plain field outside the Notes editor reads the actual clipboard and
        # cannot accidentally use the editor's in-memory rich clipboard copy.
        page.evaluate("""() => {
            const field = document.createElement('textarea');
            field.id = 'clipboard-test';
            document.body.append(field);
            field.focus();
        }""")
        page.keyboard.press('Control+v')
        field = page.locator('#clipboard-test')
        text = field.input_value().replace('\r\n', '\n')
        field.evaluate('el => el.remove()')
        return text

    def select_root():
        editor.evaluate('e => { e.focus(); getSelection().selectAllChildren(e); }')

    def apply(tree):
        page.evaluate("tree => cacheRichText.applyContent({formato:'v23-tree', tree})", tree)
        editor.locator('.editable').first.click()

    def cut():
        page.keyboard.press('Control+x')
        # The editor's history snapshots the post-cut document on animation frames.
        page.evaluate('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done))))')

    assert_empty()
    # Plain text with a genuine keyboard selection. Undo and redo must each
    # take one step, and typing at the new caret must enter the existing editor.
    paragraph.click()
    page.keyboard.insert_text('Nota simples')
    page.keyboard.press('Control+a')
    cut()
    assert_empty()
    page.keyboard.press('Control+z')
    assert paragraph.inner_text() == 'Nota simples'
    page.keyboard.press('Control+Shift+z')
    assert_empty()
    page.keyboard.insert_text('Nova nota')
    assert paragraph.inner_text() == 'Nova nota'
    assert pasted_text() == 'Nota simples'

    # A single empty <li> used to suppress the week's placeholder indefinitely.
    paragraph.click()
    page.evaluate('M4_Caret.saveR(); NotesEditorActions.orderedList()')
    assert editor.locator('ol li').text_content() == 'Nova nota'
    page.keyboard.press('Control+a')
    cut()
    assert_empty()
    page.keyboard.press('Control+z')
    assert editor.locator('ol li').text_content() == 'Nova nota'
    page.keyboard.press('Control+Shift+z')
    assert_empty()
    page.evaluate('cacheRichText.flush()')
    page.reload()
    page.wait_for_function('window.cacheRichText')
    page.evaluate('cacheRichText.ready')
    assert_empty()
    assert pasted_text() == 'Nova nota'

    # A root-bounded selection has an element as both Range endpoints, as a
    # native Select All command can do. The cut has to remove both blocks.
    rich_tree = [{'type': 'paragraph', 'text': 'Primeira', 'html': '<strong>Primeira</strong>'},
                 {'type': 'paragraph', 'text': 'Segunda', 'html': '<em>Segunda</em>'}]
    apply(rich_tree)
    select_root()
    cut()
    assert_empty()
    assert pasted_text() == 'Primeira\nSegunda'
    paragraph.click()
    page.keyboard.press('Control+v')
    assert paragraph.all_text_contents() == ['Primeira', 'Segunda']
    assert editor.locator('strong').inner_text() == 'Primeira'
    assert editor.locator('em').inner_text() == 'Segunda'

    # A selection that starts and ends mid-paragraph must neither remove nor
    # copy the text on either side, even when its endpoints are in different blocks.
    editor.evaluate("""el => {
        const [first, last] = el.querySelectorAll('.paragraph-content');
        const r = document.createRange();
        r.setStart(first.querySelector('strong').firstChild, 4);
        r.setEnd(last.querySelector('em').firstChild, 3);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
    }""")
    cut()
    assert paragraph.all_text_contents() == ['Primunda']
    assert pasted_text() == 'eira\nSeg'

    # Cutting just the title of a collapsed toggle must leave its hidden child.
    apply([{'type': 'toggle', 'text': 'Título', 'open': False,
            'children': [{'type': 'text', 'text': 'Filho preservado'}]}])
    editor.locator('.toggle-title').evaluate('el => getSelection().selectAllChildren(el)')
    cut()
    assert editor.locator('.node-toggle').count() == 1
    assert editor.locator('.toggle-title').text_content() == ''
    assert editor.locator('.text-content').text_content() == 'Filho preservado'
    assert pasted_text() == 'Título'

    # With both the title and its descendants selected, the complete subtree
    # survives a paste back into the editor and also has a usable text flavor.
    apply([{'type': 'toggle', 'text': 'Título', 'open': True,
            'children': [{'type': 'text', 'text': 'Filho selecionado'}]}])
    select_root()
    cut()
    assert_empty()
    assert pasted_text() == 'Título\nFilho selecionado'
    paragraph.click()
    page.keyboard.press('Control+v')
    assert editor.locator('.toggle-title').text_content() == 'Título'
    assert editor.locator('.text-content').text_content() == 'Filho selecionado'
    # If the system rejects a clipboard write, even a full selection stays in place.
    select_root()
    editor.evaluate("""e => {
        const event = new Event('cut', {bubbles:true, cancelable:true});
        Object.defineProperty(event, 'clipboardData', {value:{
            setData() { throw new DOMException('Clipboard unavailable', 'NotAllowedError'); }
        }});
        e.dispatchEvent(event);
    }""")
    assert editor.locator('.toggle-title').text_content() == 'Título'
    assert editor.locator('.text-content').text_content() == 'Filho selecionado'
    assert not errors, errors
    browser.close()
    print(f'PASS {engine.name} cut, clipboard, placeholder, undo/redo, reload and partial toggle', flush=True)


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
