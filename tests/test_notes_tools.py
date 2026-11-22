"""Touch interactions in the Notes panel, on disposable local notes only."""
import json
import os
import re
from io import BytesIO
from http.server import ThreadingHTTPServer
from threading import Thread

from PIL import Image, ImageChops
from playwright.sync_api import expect, sync_playwright

from test_notes_upgrade import Handler, PREFIX


def check(engine, executable, origin):
    browser = engine.launch(executable_path=executable, headless=True,
                            args=['--no-sandbox'] if engine.name == 'chromium' else [])
    context = browser.new_context(viewport={'width': 430, 'height': 873},
                                  is_mobile=True, has_touch=True, service_workers='block')
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
    # Test both clipboard permission outcomes without touching the machine's clipboard.
    context.add_init_script("""Object.defineProperty(navigator, 'clipboard', {value: {
        readText: async () => {
            if (window.testPasteText == null) throw new DOMException('User denied clipboard', 'NotAllowedError');
            return window.testPasteText;
        }
    }})""")
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(origin + PREFIX + 'index.html')
    navbar = page.locator('.bottom-navbar [data-page="notes"]')
    navbar.tap()
    page.wait_for_function('window.NotesMenu && window.cacheRichText && window.NotesTextTools && window.NotesSettings')
    page.evaluate('cacheRichText.ready')

    editor = page.locator('#editor')
    panel = page.locator('#notes-tools')
    fixture = [
        {'type': 'paragraph', 'text': 'Uma referência antes.'},
        {'type': 'toggle', 'text': 'Leitura', 'open': False, 'children': [
            {'type': 'toggle', 'text': 'Caderno', 'open': False, 'children': [
                {'type': 'text', 'text': 'Análise do estudo. ' * 270},
                {'type': 'text', 'text': 'Outra referência interna.'},
            ]},
        ]},
        {'type': 'paragraph', 'text': 'Fim da semana.'},
    ]
    alternate = '08-01' if page.evaluate('window.cacheRichText.semanaAtual()') == '01-01' else '01-01'
    other_week = f'richtext_cache_{alternate}'
    other_value = json.dumps({'tree': [{'type': 'paragraph', 'text': 'Outra semana intacta'}]})
    page.evaluate('([k,v]) => localStorage.setItem(k,v)', [other_week, other_value])

    def action(name):
        return panel.locator(f'[data-notes-action="{name}"]')

    def open_panel():
        if not page.evaluate('NotesMenu.isOpen'):
            # Stand in for the native keyboard Done button when the editor has focus.
            page.evaluate("""() => {
                if (!editor.contains(document.activeElement) && !editor.contains(getSelection().anchorNode)) return;
                M4_Caret.saveR();
                document.activeElement.blur();
                getSelection().removeAllRanges();
                M4_Caret.updateFocus();
            }""")
            navbar.tap()
        expect(panel).to_be_visible()

    def tab(section):
        open_panel()
        panel.locator(f'button[data-notes-tab="{section}"]').tap()
        expect(panel.locator(f'[data-notes-page="{section}"]')).to_be_visible()

    def restore():
        page.evaluate("""tree => {
            cacheRichText.applyContent({tree}); cacheRichText.flush();
        }""", fixture)
        expect(editor.locator('.toggle-title').first).to_have_text('Leitura')

    def saved_tree():
        return page.evaluate('cacheRichText.flush().payload.tree')

    restore()
    original = saved_tree()
    open_panel()
    main = panel.locator('.notes-menu-main')
    shortcuts = main.locator('[data-notes-action]')
    expect(shortcuts).to_have_count(6)
    assert set(shortcuts.evaluate_all('items => items.map(el => el.dataset.notesAction)')) == {
        'search', 'paste', 'reader', 'cloud', 'performance', 'clear',
    }
    positions = shortcuts.evaluate_all('items => items.map(el => {const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y)];})')
    assert len({x for x, _ in positions}) == 3 and len({y for _, y in positions}) == 2, positions
    for key in ['cloud', 'performance', 'clear']:
        expect(action(key)).to_be_in_viewport()
    expect(panel.locator('.notes-menu-tools [role=tab]')).to_have_count(2)
    scrim_alpha = panel.evaluate('''el => {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.fillStyle = getComputedStyle(el).backgroundColor;
        ctx.fillRect(0, 0, 1, 1);
        return ctx.getImageData(0, 0, 1, 1).data[3];
    }''')
    assert 0 < scrim_alpha < 255, 'The menu should dim the underlying note'

    # #notes-tools is the backdrop. Tap an uncovered part of it, leaving the
    # actual note and its retained selection alone.
    point = panel.evaluate('''el => {
        const r = el.getBoundingClientRect();
        for (const x of [r.left + 3, r.right - 3, r.left + r.width / 2]) {
            for (const y of [r.top + 4, r.top + r.height / 2, r.bottom - 4]) {
                const hit = document.elementFromPoint(x, y);
                if (hit && el.contains(hit) && !hit.closest('.notes-menu-main,.notes-menu-tools')) return [x, y];
            }
        }
        return null;
    }''')
    assert point, 'No exposed backdrop to dismiss the tools'
    page.touchscreen.tap(*point)
    expect(panel).to_be_hidden()
    assert saved_tree() == original
    # The shared navbar deliberately ignores a second touch within 300 ms.
    for state in ('visible', 'hidden', 'visible'):
        page.wait_for_timeout(320)
        navbar.tap()
        panel.wait_for(state=state)
    expect(main).to_be_visible()
    action('search').tap()
    # A shorter viewport leaves room comparable to an open phone keyboard.
    page.set_viewport_size({'width': 430, 'height': 540})
    search = panel.locator('#notes-search-input')
    counter = panel.locator('#notes-search-count')
    search.fill('REFERENCIA')
    expect(counter).to_have_text(re.compile(r'1\D+2'))
    panel.locator('#notes-search-next').tap()
    expect(counter).to_have_text(re.compile(r'2\D+2'))
    found = editor.get_by_text('Outra referência interna.', exact=True)
    expect(found).to_be_in_viewport()
    expect(panel.locator('#notes-search-prev')).to_be_in_viewport()
    # Check the painted passage as well as hit testing. A translucent or
    # blurred backdrop can hide the letters even with pointer-events:none.
    clip = found.evaluate('''el => {
        const range = new Range();
        range.selectNodeContents(el);
        const rect = range.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        if (!el.contains(hit)) return null;
        return {x: Math.floor(rect.left), y: Math.floor(rect.top),
                width: Math.ceil(rect.width), height: Math.ceil(rect.height)};
    }''')
    assert clip, 'An overlay intercepts a tap on the active search result'
    def capture_passage():
        image = page.screenshot(clip=clip, animations='disabled', caret='hide')
        return Image.open(BytesIO(image)).convert('RGB')
    initial_theme = page.locator('html').get_attribute('data-theme')
    for theme in ('light', 'dark'):
        page.evaluate('theme => document.documentElement.dataset.theme = theme', theme)
        painted = capture_passage()
        mask_off = page.add_style_tag(content='#notes-tools {visibility:hidden!important}')
        try:
            delta = ImageChops.difference(painted, capture_passage()).convert('L')
        finally:
            mask_off.evaluate('style => style.remove()')
        changed = sum(delta.histogram()[16:])
        assert changed < clip['width'] * clip['height'] * .02, f'The search overlay obscured the passage in {theme}'
    page.evaluate('theme => {if (theme) document.documentElement.dataset.theme=theme; else document.documentElement.removeAttribute("data-theme");}', initial_theme)
    assert saved_tree() == original
    panel.locator('#notes-search-prev').tap()
    expect(counter).to_have_text(re.compile(r'1\D+2'))
    search.fill('nenhum resultado possível')
    expect(counter).to_have_text(re.compile(r'0|nenhum|nenhuma', re.I))
    panel.locator('#notes-tools-back').tap()
    page.set_viewport_size({'width': 430, 'height': 873})
    assert found.inner_html() == 'Outra referência interna.'

    tab('organize')
    picker = panel.locator('#notes-move-target')
    nested_choice = picker.locator('option').filter(has_text='Caderno')
    expect(action('collapseAll')).to_be_disabled()
    expect(nested_choice).to_have_count(0)
    action('expandAll').tap()
    expect(found).to_be_visible()
    expect(nested_choice).to_have_count(1)
    expect(action('expandAll')).to_be_disabled()
    action('collapseAll').tap()
    expect(found).to_be_hidden()
    expect(nested_choice).to_have_count(0)
    expect(action('collapseAll')).to_be_disabled()
    group = picker.locator('option').filter(has_text='Leitura')
    picker.select_option(value=group.get_attribute('value'))
    action('moveUp').tap()
    expect(editor.locator(':scope > .node-toggle').first).to_have_text(re.compile(r'Leitura.*Caderno.*Outra referência', re.S))
    assert saved_tree()[0]['children'][0]['children'][-1]['text'] == 'Outra referência interna.'
    expect(action('moveUp')).to_be_disabled()
    action('moveDown').tap()
    action('moveDown').tap()
    expect(action('moveDown')).to_be_disabled()
    assert saved_tree()[-1]['text'] == 'Leitura'
    tab('edit')
    action('undo').tap()
    assert saved_tree()[1]['text'] == 'Leitura'

    # Select only one word and dismiss the keyboard as on the phone. The
    # following menu interactions must still write at that original selection.
    def select_word():
        if page.evaluate('NotesMenu.isOpen'):
            panel.locator('#notes-tools-close').tap()
            expect(panel).to_be_hidden()
        first = editor.locator('.paragraph-content').first
        first.tap()
        first.evaluate("""el => {
            const node = el.firstChild;
            const word = 'referência', start = node.data.indexOf(word);
            const range = new Range();
            range.setStart(node, start); range.setEnd(node, start + word.length);
            getSelection().removeAllRanges(); getSelection().addRange(range);
            M4_Caret.saveR();
        }""")
        open_panel()

    restore()
    select_word()
    page.evaluate("window.testPasteText = '<b>texto</b>\\nsegunda'")
    action('paste').tap()
    expect(editor).to_contain_text('Uma <b>texto</b>')
    expect(editor).to_contain_text('segunda antes.')
    assert editor.locator('b').count() == 0

    restore()
    select_word()
    page.evaluate('window.testPasteText = null')
    action('paste').tap()
    manual = panel.locator('#notes-paste-text')
    expect(manual).to_be_visible()
    manual.fill('não inserir')
    panel.locator('#notes-paste-cancel').tap()
    assert saved_tree()[0]['text'] == 'Uma referência antes.'
    select_word()
    action('paste').tap()
    manual.fill('palavra nova')
    panel.locator('#notes-paste-insert').tap()
    expect(editor.locator('.paragraph-content').first).to_have_text('Uma palavra nova antes.')

    open_panel()
    action('cloud').tap()
    expect(panel.locator('[data-notes-sign-in]')).to_be_visible()
    expect(panel.locator('[data-notes-sync]')).to_be_disabled()
    context.set_offline(True)
    expect(panel.locator('[data-notes-sync]')).to_be_disabled()
    expect(panel.locator('[data-notes-cloud-status]')).to_contain_text('Sem conexão')
    context.set_offline(False)
    panel.locator('#notes-tools-back').tap()
    action('performance').tap()
    for mode in ('auto', 'low', 'normal'):
        expect(panel.locator(f'[data-notes-perf="{mode}"]')).to_be_visible()
    expect(panel.locator('[data-notes-perf="auto"]')).to_have_attribute('aria-pressed', 'true')
    panel.locator('#notes-tools-back').tap()

    before = saved_tree()
    action('clear').tap()
    panel.locator('#notes-clear-cancel').tap()
    assert saved_tree() == before

    # A confirmation belongs to the note version the user saw. Replacing that
    # version while confirmation is on screen must never clear the new one.
    confirm = panel.locator('#notes-clear-confirm')
    action('clear').tap()
    page.evaluate("cacheRichText.applyContent({tree:[{type:'paragraph',text:'Atualizada em outro aparelho'}]},{remote:true})")
    expect(confirm).to_be_hidden()
    expect(editor).to_have_text('Atualizada em outro aparelho')
    action('clear').tap()
    editor.locator('.paragraph-content').evaluate('''el => {
        el.append(' com alteração');
        el.dispatchEvent(new InputEvent('input',{bubbles:true}));
    }''')
    confirm.tap()
    expect(confirm).to_be_hidden()
    expect(editor).to_have_text('Atualizada em outro aparelho com alteração')
    page.evaluate('tree => cacheRichText.applyContent({tree})', before)
    action('clear').tap()
    confirm.tap()
    expect(page.locator('#notes-week-placeholder')).to_be_visible()
    assert not editor.inner_text().strip()
    assert page.evaluate('(k) => localStorage.getItem(k)', other_week) == other_value
    tab('edit')
    action('undo').tap()
    assert saved_tree() == before
    page.reload()
    page.wait_for_function('window.cacheRichText')
    page.evaluate('cacheRichText.ready')
    assert saved_tree() == before
    assert page.evaluate('(k) => localStorage.getItem(k)', other_week) == other_value
    assert not errors, errors
    context.close()
    browser.close()
    print(f'PASS {engine.name}: search, toggles, move, paste, note settings and reversible clear', flush=True)


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
