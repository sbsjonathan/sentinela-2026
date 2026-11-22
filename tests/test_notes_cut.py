"""Cut and paste against the native clipboard in the real Notes editor."""
import os
from io import BytesIO
from http.server import ThreadingHTTPServer
from threading import Thread
from urllib.parse import parse_qs, urlsplit

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

from test_notes_upgrade import Handler, PREFIX


def check(engine, executable, origin):
    browser = engine.launch(executable_path=executable, headless=True,
                            args=['--no-sandbox'] if engine.name == 'chromium' else [])
    context = browser.new_context(viewport={'width': 430, 'height': 873}, is_mobile=True,
                                  has_touch=True, service_workers='block')
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
    context.add_init_script("Object.defineProperty(navigator, 'standalone', {get: () => true})")
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(origin + PREFIX + 'index.html')
    page.locator('.bottom-navbar [data-page="notes"]').tap()
    page.wait_for_function('window.cacheRichText && window.M12_History')
    page.evaluate('cacheRichText.ready')
    editor = page.locator('#editor')
    paragraph = editor.locator('.paragraph-content')
    day, month = map(int, parse_qs(urlsplit(page.url).query)['semana'][0].split('-'))
    months = 'janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro'.split()
    week = f'Semana de {day} de {months[month - 1]}'
    label = page.locator('#notes-week-placeholder')

    def assert_painted_hint(selector):
        # Computed styles alone passed when the hint was outside the scrollport.
        scroller = page.locator('#editorScroll').bounding_box()
        clip = {'x': scroller['x'] + 8, 'y': scroller['y'], 'width': 350, 'height': 95}
        def sample():
            shot = page.screenshot(clip=clip, animations='disabled', caret='hide')
            return Image.open(BytesIO(shot)).convert('RGB')
        painted = sample()
        override = page.add_style_tag(content=selector + ' {visibility:hidden!important}')
        try:
            delta = ImageChops.difference(painted, sample()).convert('L')
            assert sum(delta.histogram()[12:]) > 100, f'No visible hint at the top of Notes: {selector}'
        finally:
            override.evaluate('n => n.remove()')

    def assert_visible_hint():
        assert label.is_visible() and label.text_content() == week
        assert week not in editor.text_content()
        assert_painted_hint('#notes-week-placeholder')

    def assert_empty():
        assert editor.locator('.editable').count() == 1
        assert paragraph.count() == 1 and paragraph.is_visible()
        assert paragraph.get_attribute('data-empty') == 'true'
        assert label.is_visible() and label.text_content() == week
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
    assert_visible_hint()
    # The first empty toggle owns its hint even when the whole note has no text.
    # Exercise the editing toolbar that is visible while typing on the phone.
    paragraph.tap()
    page.locator('#addToggleBtn').tap()
    root = editor.locator(':scope > .node-toggle')
    title = root.locator(':scope > .row > .toggle-title')
    arrow = root.locator(':scope > .row > .toggle-arrow')
    assert root.count() == 1 and paragraph.count() == 0
    assert title.text_content() == '' and title.get_attribute('data-placeholder') == 'Toggle'
    assert label.is_hidden()
    assert editor.get_attribute('aria-placeholder') == 'Toggle'
    assert_painted_hint('.toggle-title::before')
    editor.evaluate("el => el.dispatchEvent(new InputEvent('input', {bubbles: true}))")
    assert root.count() == 1 and label.is_hidden()
    page.evaluate('cacheRichText.flush()')
    saved = page.evaluate('cacheRichText.carregarDados()')
    assert saved['tree'] == [{'type': 'toggle', 'text': '', 'html': '', 'open': False, 'children': []}]
    assert week not in saved['html']
    page.reload()
    page.wait_for_function('window.cacheRichText && window.M12_History')
    page.evaluate('cacheRichText.ready')
    assert label.is_hidden()
    assert_painted_hint('.toggle-title::before')

    arrow.tap()
    child = root.locator('.text-content')
    assert child.is_visible() and child.get_attribute('data-placeholder') == 'Escreva ou aperte +'
    assert label.is_hidden()
    arrow.tap()
    assert child.is_hidden() and label.is_hidden()
    arrow.tap()
    child.tap()
    root.locator('.text-plus').tap()
    nested = root.locator('.children .toggle-title')
    assert nested.get_attribute('data-placeholder') == 'Toggle'
    page.keyboard.insert_text('Título interno')
    assert nested.text_content() == 'Título interno'
    arrow.tap()
    assert nested.is_hidden() and title.text_content() == '' and label.is_hidden()
    page.evaluate('cacheRichText.flush()')
    saved_root, = page.evaluate('cacheRichText.carregarDados().tree')
    assert saved_root['text'] == '' and saved_root['children'][0]['text'] == 'Título interno'
    select_root()
    cut()
    assert_empty()
    assert_visible_hint()

    paragraph.tap()
    page.locator('#addToggleBtn').tap()
    page.keyboard.press('Backspace')
    assert_empty()
    assert editor.get_attribute('aria-placeholder') == week
    assert_visible_hint()

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
    assert label.is_hidden()

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

    # Select only the visible words, like iOS selection handles. Soft breaks
    # on the following line lie outside the selection and survive the real cut.
    apply([{'type': 'paragraph', 'text': 'Últimas palavras'}])
    page.keyboard.press('End')
    page.keyboard.press('Enter')
    page.keyboard.press('Shift+Enter')
    page.keyboard.press('Shift+Enter')
    paragraph.first.evaluate("""el => {
        const range = new Range();
        range.selectNodeContents(el);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    }""")
    cut()
    assert_visible_hint()
    assert pasted_text() == 'Últimas palavras'
    page.evaluate('cacheRichText.flush()')
    assert week not in page.evaluate("JSON.stringify(cacheRichText.snapshot().payload.tree)")
    page.reload()
    page.wait_for_function('window.cacheRichText && window.M12_History')
    page.evaluate('cacheRichText.ready')
    assert_visible_hint()

    # The next tap and keystroke in a visually empty note enter the same editor.
    box = label.bounding_box()
    page.touchscreen.tap(box['x'] + 5, box['y'] + 5)
    page.keyboard.insert_text('Continuei aqui')
    assert 'Continuei aqui' in editor.inner_text()
    assert label.is_hidden()

    # Saved notes can already contain empty list markup from prior versions.
    # Hidden children, however, are part of a note even when its title is empty.
    apply([{'type': 'paragraph', 'html': '<ol><li><br></li></ol>'}])
    assert_visible_hint()
    page.evaluate("cacheRichText.applyContent({tree:[{type:'toggle',text:'',open:false,children:[{type:'text',text:'Texto recolhido'}]}]})")
    assert label.is_hidden()
    assert editor.locator('.text-content').text_content() == 'Texto recolhido'

    # After cutting a note from the bottom on a short screen the hint must
    # physically return into view. Repeat in the dark, normal-performance theme.
    page.evaluate("""() => {
        localStorage.setItem('tema-interface','dark');
        localStorage.setItem('editor-performance-mode','normal');
    }""")
    page.reload()
    page.wait_for_function('window.cacheRichText && window.M12_History')
    page.evaluate('cacheRichText.ready')
    page.set_viewport_size({'width':430,'height':500})
    page.evaluate("""() => cacheRichText.applyContent({tree:Array.from({length:80},
        (_,i)=>({type:'paragraph',text:'Linha ' + i}))})""")
    editor.locator('.editable').last.click()
    page.keyboard.press('End')
    assert page.locator('#editorScroll').evaluate('el=>el.scrollTop') > 500
    select_root()
    cut()
    assert_visible_hint()

    # Native editing commands can leave browser-owned markup and report only
    # a generic input event. The next keystroke still needs a real, saved block.
    page.keyboard.insert_text('Texto antes do corte')
    editor.evaluate("""host => {
        host.innerHTML = '<div><br></div>';
        const target = host.firstChild;
        const range = new Range(); range.selectNodeContents(target); range.collapse(true);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        host.dispatchEvent(new InputEvent('input', {bubbles:true}));
    }""")
    page.wait_for_function("document.querySelector('#notes-week-placeholder')?.getClientRects().length")
    assert_visible_hint()
    page.keyboard.insert_text('Texto após corte nativo')
    assert 'Texto após corte nativo' in editor.inner_text()
    assert label.is_hidden()
    page.evaluate('cacheRichText.flush()')
    page.reload()
    page.wait_for_function('window.cacheRichText')
    page.evaluate('cacheRichText.ready')
    assert 'Texto após corte nativo' in editor.inner_text()
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
