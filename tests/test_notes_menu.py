"""Shared Notes overlay, real selection, formatting, reading size, and persistence.

Run with WEBKIT_EXECUTABLE set to also exercise WebKit. These checks use real
notes pages and synthetic notes; they do not emulate the native iPhone keyboard.
"""
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
TEXT = 'Nota sintética preservada ao ajustar a fonte e alternar versões. Gênesis 1:1'


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *args):
        pass


def check(engine, executable, origin):
    browser = engine.launch(executable_path=executable, headless=True,
                            args=['--no-sandbox'] if engine.name == 'chromium' else [])
    context = browser.new_context(viewport={'width': 430, 'height': 873},
                                  is_mobile=True, has_touch=True, service_workers='block')
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(origin + '/richtext/container.html?semana=02-11&versao=2')
    page.wait_for_function('window.cacheRichText && window.GlobalFontScale && window.NotesMenu && window.NotesEditorActions')
    page.evaluate('cacheRichText.ready')
    navbar = page.locator('.bottom-navbar [data-page="notes"]')
    panel = page.locator('#notes-tools')
    editable = page.locator('#editor .paragraph-content').first
    menu_scroll = panel.locator('.app-menu__scroll')
    close = panel.locator('#notes-tools-close')
    assert page.locator('#notes-week-placeholder').text_content() == 'Semana de 2 de novembro'
    assert panel.get_attribute('aria-hidden') == 'true'
    assert panel.evaluate('(el) => el.inert')

    def tool(name):
        return panel.locator(f'[data-notes-action="{name}"]')

    def tab(name):
        panel.locator(f'[data-notes-tab="{name}"]').tap()
        panel.locator(f'[data-notes-page="{name}"]').wait_for(state='visible')

    def dismiss_keyboard():
        page.evaluate('document.activeElement.blur(); getSelection().removeAllRanges()')
        page.wait_for_timeout(420)

    def set_note(text=TEXT):
        editable.fill(text)
        page.evaluate('M12_History.flush(); cacheRichText.flush()')
        dismiss_keyboard()

    def select_word(word='sintética'):
        reopen = panel.is_visible()
        if reopen:
            close.tap()
        editable.scroll_into_view_if_needed()
        # Use glyph geometry for targeting, then let the browser select the word.
        x, y = editable.evaluate('''(field, word) => {
          const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
          for (let node; (node = walker.nextNode());) {
            const i = node.data.indexOf(word);
            if (i < 0) continue;
            const range = new Range();
            range.setStart(node, i); range.setEnd(node, i + 1);
            const r = range.getBoundingClientRect();
            return [r.x + r.width / 2, r.y + r.height / 2];
          }
          throw new Error('Missing test selection: ' + word);
        }''', word)
        page.mouse.dblclick(x, y)
        page.wait_for_function('w => getSelection().toString() === w && M1_Config.state.lastR?.toString() === w', arg=word)
        dismiss_keyboard()
        if reopen:
            open_panel()

    def open_panel():
        if not page.evaluate('NotesMenu.isOpen'):
            dismiss_keyboard()
            navbar.tap()
        page.wait_for_function('NotesMenu.isOpen')
        page.wait_for_timeout(320)

    set_note()
    initial_key = page.evaluate('cacheRichText.snapshot().key')
    before_top = page.locator('#editor').bounding_box()['y']
    navbar.tap()
    page.wait_for_timeout(350)
    after_top = page.locator('#editor').bounding_box()['y']
    assert abs(after_top - before_top) < 2, (before_top, after_top)
    assert panel.evaluate("el => el.parentNode === document.body && getComputedStyle(el).position === 'fixed'")
    assert panel.get_attribute('aria-hidden') == 'false' and not panel.evaluate('el => el.inert')
    assert panel.get_by_role('dialog', name='Anotações').is_visible()
    assert panel.locator('.notes-menu-main h2').inner_text() == 'Anotações'
    assert panel.locator('.notes-menu-tools h2').inner_text() == 'Ferramentas'
    actions = panel.locator('.notes-menu-main [data-notes-action]').evaluate_all('(els) => els.map(e => e.dataset.notesAction)')
    assert len(actions) == 6 and set(actions) == {'search', 'paste', 'reader', 'cloud', 'performance', 'clear'}
    assert panel.locator('[data-notes-tab]').evaluate_all('(els) => els.map(el => el.dataset.notesTab)') == ['edit', 'organize']
    assert page.locator('#notes-versions:not([hidden])').count() == 0
    assert navbar.evaluate('''el => {
        const r=el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x+r.width/2, r.y+r.height/2));
    }''')
    assert tool('bold').is_visible() and tool('paste').is_visible()
    tab('organize')
    assert tool('toggle').inner_text().strip() == 'Toggle'
    assert tool('list').inner_text().strip() == 'Marcadores'
    assert tool('orderedList').is_visible()
    tab('edit')
    assert page.locator('#kbdToolbar [data-notes-action="orderedList"]').count() == 0
    assert page.locator('#kbdToolbar .tool-btn').count() == 11
    assert page.locator('#notes-diagnose-navbar, #notes-navbar-diagnostic-script').count() == 0
    assert page.evaluate('cacheRichText.snapshot().key') == initial_key
    navbar.tap()
    page.wait_for_timeout(350)
    assert panel.get_attribute('aria-hidden') == 'true'
    assert abs(page.locator('#editor').bounding_box()['y'] - before_top) < 2

    open_panel()
    close.tap()
    panel.wait_for(state='hidden')
    open_panel()
    panel.tap(position={'x': 3, 'y': 4})
    panel.wait_for(state='hidden')

    # The navbar may take focus; a subsequent action still formats the saved
    # selection, not the entire paragraph or a caret moved to the note's end.
    select_word()
    open_panel()
    tool('bold').tap()
    page.wait_for_timeout(150)
    assert editable.locator('b, strong').inner_text() == 'sintética'
    assert editable.inner_text().rstrip('\n') == TEXT, (editable.inner_text(), editable.inner_html())
    select_word()
    tool('italic').tap()
    page.wait_for_timeout(150)
    assert editable.locator('i, em').inner_text() == 'sintética'
    assert editable.inner_text().rstrip('\n') == TEXT, (editable.inner_text(), editable.inner_html())
    dismiss_keyboard()
    tool('undo').tap()
    page.wait_for_timeout(160)
    assert editable.locator('i, em').count() == 0
    assert editable.locator('b, strong').inner_text() == 'sintética'
    dismiss_keyboard()
    tool('redo').tap()
    page.wait_for_timeout(160)
    assert editable.locator('i, em').inner_text() == 'sintética'

    select_word()
    tab('organize')
    tool('list').tap()
    page.wait_for_timeout(150)
    assert editable.locator('ul li').count() == 1
    select_word()
    tool('list').tap()
    page.wait_for_timeout(150)
    assert editable.locator('ul').count() == 0
    select_word()
    tool('orderedList').tap()
    page.wait_for_timeout(150)
    assert editable.locator('ol li').count() == 1
    assert tool('orderedList').get_attribute('aria-pressed') == 'true'
    assert tool('list').get_attribute('aria-pressed') == 'false'
    select_word()
    tool('orderedList').tap()
    page.wait_for_timeout(150)
    assert editable.locator('ol').count() == 0
    select_word()
    tab('edit')
    tool('font').tap()
    panel.locator('[data-notes-style="h1"]').tap()
    page.wait_for_timeout(150)
    assert page.locator('#editor .node-paragraph.font-h1').count() == 1
    dismiss_keyboard()
    panel.locator('[data-notes-style="normal"]').tap()
    page.wait_for_timeout(150)
    assert page.locator('#editor .node-paragraph.font-h1').count() == 0

    # Both color actions use the existing picker and preserve the selected word.
    for name, prop, expected in [('textColor', 'color', 'rgb(175, 82, 222)'),
                                  ('backgroundColor', 'backgroundColor', 'rgb(255, 149, 0)')]:
        select_word()
        tool(name).tap()
        page.locator('#color-picker-overlay.open').wait_for(state='visible')
        page.locator('.picker-swatch').nth(4 if name == 'textColor' else 3).tap()
        page.locator('#picker-close').tap()
        page.wait_for_timeout(180)
        result = page.evaluate('''prop => {
          const walker = document.createTreeWalker(document.querySelector('#editor'), NodeFilter.SHOW_TEXT);
          let node; while (node = walker.nextNode()) if (node.textContent.includes('sintética')) {
            let element = node.parentElement;
            while (element && element.id !== 'editor') {
              const value = getComputedStyle(element)[prop];
              if (prop !== 'backgroundColor' || value !== 'rgba(0, 0, 0, 0)') return value;
              element = element.parentElement;
            }
          }
        }''', prop)
        assert result == expected, (name, result)
        assert editable.inner_text().rstrip('\n') == TEXT, (editable.inner_text(), editable.inner_html())
    select_word()
    tool('reset').tap()
    page.wait_for_timeout(150)
    assert editable.inner_text().rstrip('\n') == TEXT, (editable.inner_text(), editable.inner_html())
    assert '#af52de' not in editable.inner_html().lower()
    assert 'rgb(175, 82, 222)' not in editable.inner_html()

    # Inline block insertion is undoable through the same history as the pill.
    select_word('versões')
    tab('organize')
    tool('toggle').tap()
    page.wait_for_timeout(150)
    assert page.locator('#editor .node-toggle').count() == 1
    dismiss_keyboard()
    tab('edit')
    tool('undo').tap()
    page.wait_for_timeout(180)
    assert page.locator('#editor .node-toggle').count() == 0
    assert editable.inner_text().rstrip('\n') == TEXT, (editable.inner_text(), editable.inner_html())

    # Reader mode remains the original mode, including its Bible preview.
    select_word('Gênesis')
    tool('reader').tap()
    page.wait_for_function('LeitorMode.isActive()')
    page.locator('#modal-biblia-fechar').wait_for(state='visible')
    page.locator('#modal-biblia-fechar').tap()
    page.wait_for_timeout(250)
    assert panel.is_hidden()
    assert page.locator('#kbdToolbar [aria-label="Negrito"]').is_disabled()
    # A first-time reader gets the glow even with the economical editor defaults.
    assert page.evaluate("localStorage.getItem('editor-performance-mode')") is None
    glow = page.locator('.leitor-fx__glow')
    assert glow.is_visible()
    assert page.locator('.leitor-fx').evaluate('el => getComputedStyle(el).pointerEvents') == 'none'
    page.locator('#kbdToolbar [aria-label="Modo Bíblia"]').tap()
    page.wait_for_function('!LeitorMode.isActive()')
    glow.wait_for(state='hidden')
    assert editable.inner_text().rstrip('\n') == TEXT, (editable.inner_text(), editable.inner_html())
    page.locator('#kbdToolbar').wait_for(state='hidden', timeout=1200)

    # The shared menu remains usable at the largest editor font size.
    open_panel()
    slider = page.locator('#notes-tools-font-level')
    if slider.is_hidden():
        tool('font').tap()
    before_key = page.evaluate('cacheRichText.snapshot().key')
    slider.press('End')
    page.wait_for_timeout(100)
    assert page.evaluate('GlobalFontScale.getSize()') == 30
    assert editable.evaluate('(el) => getComputedStyle(el).fontSize') == '30px'
    assert tool('bold').evaluate('el => el.scrollWidth <= el.clientWidth + 1 && el.offsetHeight >= 44')
    assert page.evaluate('cacheRichText.snapshot().key') == before_key
    page.evaluate('GlobalFontScale.setLevel(5)')
    page.wait_for_timeout(60)
    assert slider.input_value() == '5'
    slider.press('Escape')
    page.wait_for_timeout(300)
    assert panel.get_attribute('aria-hidden') == 'true'
    assert navbar.evaluate('(el) => el === document.activeElement')
    page.evaluate('GlobalFontScale.setLevel(7)')
    open_panel()
    tab('edit')
    assert slider.input_value() == '7'

    # Removing version/export controls must not affect automatic note saving.
    page.evaluate('cacheRichText.flush()')
    page.reload()
    page.wait_for_function('window.NotesMenu && window.cacheRichText')
    page.evaluate('cacheRichText.ready')
    assert TEXT in page.locator('#editor').inner_text()
    assert page.evaluate('GlobalFontScale.getLevel()') == 7
    assert panel.get_attribute('aria-hidden') == 'true'

    # Opening and closing the overlay must preserve the exact reading position.
    set_note('\n'.join(f'Linha {index}: anotação sintética preservada.' for index in range(45)))
    page.evaluate('editorScroll.scrollTop=700')
    page.wait_for_function('editorScroll.scrollTop > 500')
    reading_position = page.evaluate('editorScroll.scrollTop')
    open_panel()
    assert abs(page.evaluate('editorScroll.scrollTop') - reading_position) < 2
    close.tap()
    assert abs(page.evaluate('editorScroll.scrollTop') - reading_position) < 2

    # A short iPhone viewport scrolls the tools independently in either theme.
    page.set_viewport_size({'width': 320, 'height': 500})
    open_panel()
    tab('edit')
    page.evaluate('GlobalFontScale.setLevel(11)')
    if slider.is_hidden():
        tool('font').tap()
    for theme in ['light', 'dark']:
        page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
        page.wait_for_timeout(250)
        geometry = menu_scroll.evaluate('''el => {
            const r = el.getBoundingClientRect();
            return {left:r.left, right:r.right, clientWidth:el.clientWidth,
                    scrollWidth:el.scrollWidth, clientHeight:el.clientHeight, scrollHeight:el.scrollHeight};
        }''')
        assert geometry['left'] >= 0 and geometry['right'] <= 320, geometry
        assert geometry['scrollWidth'] <= geometry['clientWidth'] + 1, geometry
        assert geometry['scrollHeight'] > geometry['clientHeight'] + 20, geometry
        close.scroll_into_view_if_needed()
        at_top = menu_scroll.evaluate('el => el.scrollTop')
        note_position = page.evaluate('editorScroll.scrollTop')
        slider.scroll_into_view_if_needed()
        assert menu_scroll.evaluate('el => el.scrollTop') > at_top + 10
        assert abs(page.evaluate('editorScroll.scrollTop') - note_position) < 2

    # A trusted vertical gesture on a button scrolls the overlay without editing.
    if engine.name == 'chromium':
        first_shortcut = tool('search')
        first_shortcut.scroll_into_view_if_needed()
        initial_scroll = menu_scroll.evaluate('el => el.scrollTop')
        before_html = page.locator('#editor').inner_html()
        note_position = page.evaluate('editorScroll.scrollTop')
        bounds = first_shortcut.bounding_box()
        x, y = bounds['x'] + bounds['width'] / 2, bounds['y'] + bounds['height'] / 2
        session = context.new_cdp_session(page)
        session.send('Input.dispatchTouchEvent', {'type':'touchStart', 'touchPoints':[{'x':x, 'y':y, 'id':1}]})
        for step in range(1, 6):
            session.send('Input.dispatchTouchEvent', {'type':'touchMove', 'touchPoints':[{'x':x, 'y':y-step*12, 'id':1}]})
            page.wait_for_timeout(20)
        session.send('Input.dispatchTouchEvent', {'type':'touchEnd', 'touchPoints':[]})
        page.wait_for_timeout(250)
        assert menu_scroll.evaluate('el => el.scrollTop') > initial_scroll + 10
        assert page.locator('#notes-search-input').is_hidden()
        assert abs(page.evaluate('editorScroll.scrollTop') - note_position) < 2
        assert page.locator('#editor').inner_html() == before_html
        session.detach()

    page.locator('.bottom-navbar [data-page="home"]').tap()
    page.wait_for_url('**/index.html')
    assert not errors, errors
    context.close()
    browser.close()
    return {'browser': engine.name, 'shared_overlay': 'passed',
            'formatting_and_history': 'passed', 'color_and_reader': 'passed',
            'font_levels': 'passed', 'removed_options_and_persistence': 'passed',
            'small_screen_and_long_note': 'passed'}


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as playwright:
            engines = [(playwright.chromium, os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'))]
            if os.environ.get('WEBKIT_EXECUTABLE'):
                engines.append((playwright.webkit, os.environ['WEBKIT_EXECUTABLE']))
            for engine, executable in engines:
                print(json.dumps(check(engine, executable, origin)), flush=True)
    finally:
        server.shutdown()
