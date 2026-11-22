"""Find and paste in a synthetic note, with real DOM ranges and both clipboard paths."""
import os
from http.server import ThreadingHTTPServer
from threading import Thread

from playwright.sync_api import sync_playwright

from test_notes_upgrade import Handler, PREFIX


def check(engine, executable, origin):
    browser = engine.launch(executable_path=executable, headless=True,
                            args=['--no-sandbox'] if engine.name == 'chromium' else [])
    context = browser.new_context(viewport={'width':430, 'height':873}, is_mobile=True,
                                  has_touch=True, service_workers='block')
    context.route('**/*', lambda r: r.continue_() if r.request.url.startswith(origin + '/') else r.abort())
    page = context.new_page()
    page.goto(origin + PREFIX + 'richtext/container.html?semana=02-11&versao=2')
    page.wait_for_function('window.cacheRichText && window.NotesTextTools')
    page.evaluate('cacheRichText.ready')
    tree = [
        {'type': 'paragraph', 'html': 'Início Gê<strong>ne</strong>sis 1:1 último'},
        *[{'type': 'paragraph', 'text': 'outra linha'} for _ in range(45)],
        {'type': 'paragraph', 'html': '<ul><li>Item</li><li>separado</li></ul>'},
        {'type': 'toggle', 'text': 'Recolhido', 'open': False, 'children': [
            {'type': 'toggle', 'text': 'Filho', 'open': False, 'children': [
                {'type':'text', 'html': 'Outra referência Ge&#770;nesis 2:4'},
            ]},
        ]},
    ]
    page.evaluate('tree => cacheRichText.applyContent({tree})', tree)
    page.evaluate('M12_History.beforeChange();cacheRichText.flush()')
    before = page.evaluate('[cacheRichText.snapshot().key, M12_History.stack.length]')
    first = page.evaluate('NotesTextTools.search("genesis")')
    assert first == {'index':1, 'total':2}
    if page.evaluate('!!CSS.highlights'):
        assert page.evaluate("Array.from(CSS.highlights.get('notes-search-current'))[0].toString()") == 'Gênesis'
    result = page.evaluate('NotesTextTools.search("genesis", -1)')
    assert result == {'index':2, 'total':2}
    field = page.locator('#editor .text-content').last
    assert field.is_visible()
    assert page.locator('#editor .node-toggle[data-open=false]').count() == 2
    assert page.locator('#editorScroll').evaluate('el => el.scrollTop') > 500
    assert page.evaluate('NotesTextTools.search("genesis",1).index') == 1
    assert page.evaluate('NotesTextTools.search("Itemseparado").total') == 0
    page.evaluate('NotesTextTools.clearSearch(); cacheRichText.flush()')
    assert field.is_hidden()
    assert page.evaluate('[cacheRichText.snapshot().key, M12_History.stack.length]') == before

    def select_word(word):
        page.evaluate("""word => {
          const field = document.querySelector('#editor .paragraph-content');
          const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
          let node; while (node=walker.nextNode()) {
            const pos=node.data.indexOf(word); if(pos<0) continue;
            const r=new Range(); r.setStart(node,pos); r.setEnd(node,pos+word.length);
            window.destination=NotesTextTools.pasteTarget(r); return;
          }
          throw new Error('Missing test text');
        }""", word)

    # Both sources must use text/plain and leave the note alone if there is
    # nothing to paste, permission is denied or the menu closes mid-request.
    select_word('último')
    page.evaluate("""() => Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
        readText: async () => { throw new DOMException('Sem permissão','NotAllowedError'); }
    }})""")
    assert page.evaluate('NotesTextTools.paste(destination)') == 'manual'
    assert page.evaluate('NotesTextTools.insertPlain(destination,"")') == 'empty'
    assert page.evaluate('cacheRichText.snapshot().key') == before[0]
    assert page.evaluate(r'NotesTextTools.insertPlain(destination,"<b>literal</b>\r\nOutra linha")') == 'inserted'
    para = page.locator('#editor > .node-paragraph .paragraph-content')
    assert para.nth(0).inner_text() == 'Início Gênesis 1:1 <b>literal</b>'
    assert para.nth(0).locator('b').count() == 0
    assert para.nth(1).inner_text() == 'Outra linha'
    assert page.evaluate('M12_History.stack.length') == before[1]+1
    page.evaluate('M12_History.undo()')
    page.wait_for_timeout(100)
    assert page.evaluate('cacheRichText.snapshot().key') == before[0]
    select_word('último')
    page.evaluate("""Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:
        () => new Promise(resolve => { window.finishRead = resolve; })}})""")
    page.evaluate('window.reading = NotesTextTools.paste(destination); void 0')
    page.evaluate('destination.cancel(); finishRead("Texto tardio");')
    assert page.evaluate('reading') == 'unavailable'
    assert page.evaluate('cacheRichText.snapshot().key') == before[0]
    select_word('último')
    page.evaluate('window.reading = NotesTextTools.paste(destination); void 0')
    page.evaluate('tree => cacheRichText.applyContent({tree});', tree)
    page.evaluate('finishRead("Mudou em outro aparelho")')
    assert page.evaluate('reading') == 'unavailable'
    select_word('último')
    page.evaluate('window.reading = NotesTextTools.paste(destination); void 0')
    page.evaluate('finishRead("feito")')
    assert page.evaluate('reading') == 'inserted'
    assert para.nth(0).inner_text() == 'Início Gênesis 1:1 feito'
    browser.close()
    print(f'PASS {engine.name}: folded inline search, hidden toggles, navigation, clipboard, undo and stale destinations', flush=True)


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as pw:
            origin = f'http://127.0.0.1:{server.server_port}'
            check(pw.chromium, os.getenv('CHROMIUM_EXECUTABLE','/usr/bin/chromium'), origin)
            if os.getenv('WEBKIT_EXECUTABLE'):
                check(pw.webkit, os.environ['WEBKIT_EXECUTABLE'], origin)
    finally:
        server.shutdown()
