"""Read the current Notes editor through the same source used by the summary."""
import os
from http.server import ThreadingHTTPServer
from threading import Thread

from playwright.sync_api import sync_playwright

from test_notes_upgrade import Handler, PREFIX


def check(engine, executable, origin):
    browser = engine.launch(executable_path=executable, headless=True,
                            args=['--no-sandbox'] if engine.name == 'chromium' else [])
    context = browser.new_context(service_workers='block')
    context.route('**/*', lambda r: r.continue_() if r.request.url.startswith(origin + '/') else r.abort())
    page = context.new_page()
    page.goto(origin + PREFIX + 'richtext/container.html?versao=2&semana=02-11')
    page.wait_for_function('window.cacheRichText && window.NotesSummarySource')
    page.evaluate('cacheRichText.ready')

    def apply(payload):
        assert page.evaluate('note => cacheRichText.applyContent(note)', payload)

    def read():
        return page.evaluate('NotesSummarySource.read()')

    assert read() == {'outline': '', 'characters': 0}
    tree = [
        {'type': 'paragraph', 'text': 'Esperança', 'fontClass': 'font-h2'},
        {'type': 'toggle', 'html': 'Esc<b>uta</b> &amp; cuidado', 'open': False, 'children': [
            {'type': 'text', 'html': '<ol start="3"><li>Durante a <em>visita</em><ul><li>Ouvir</li>'
                                     '<li>Consolar</li></ul></li><li value="7">Voltar</li></ol>'},
            {'type': 'toggle', 'text': 'Exemplo', 'open': False,
             'children': [{'type': 'text', 'html': 'Paciência<br><b>Gênesis 1:1</b>'}]},
        ]},
        {'type': 'toggle', 'text': '', 'children': [{'type': 'text', 'text': ''}]},
    ]
    apply({'tree': tree})
    expected = '\n'.join(['## Esperança', '▸ Escuta & cuidado', '  3. Durante a visita',
                          '    - Ouvir', '    - Consolar', '  7. Voltar', '  ▸ Exemplo',
                          '    Paciência', '    Gênesis 1:1'])
    actual_text = ('Esperança' 'Escuta & cuidado' 'Durante a visita' 'Ouvir' 'Consolar'
                   'Voltar' 'Exemplo' 'Paciência' 'Gênesis 1:1')
    editor = page.locator('#editor')
    original = editor.inner_html()
    assert read() == {'outline': expected, 'characters': len(actual_text)}
    assert editor.inner_html() == original
    assert editor.locator('.node-toggle[data-open="false"]').count() == 3

    # Legacy HTML is restored into a real editor field and retains its original
    # line boundaries. The weekly placeholder and formatting alone count as zero.
    apply({'html': '<h3>Antes</h3><p>Co<strong>meço</strong></p><ol reversed><li>Um</li><li>Dois</li></ol>'})
    assert read() == {'outline': '### Antes\nComeço\n2. Um\n1. Dois', 'characters': len('AntesComeçoUmDois')}
    apply({'html': '<details><summary>Plano</summary><ul><li>Hoje</li><ol><li>Amanhã</li></ol></ul></details>'})
    assert read() == {'outline': '▸ Plano\n  - Hoje\n    1. Amanhã', 'characters': len('PlanoHojeAmanhã')}
    apply({'html': '<ul><li><br></li></ul><p> &nbsp; &#8203; \ufeff </p>'})
    assert read() == {'outline': '', 'characters': 0}
    apply({'tree': [{'type': 'paragraph', 'text': 'A' * 47}, {'type': 'toggle', 'text': '👨‍👧', 'children': [
        {'type': 'text', 'html': 'e&#769;'},
    ]}]})
    assert read()['characters'] == 49
    # Check a just-typed change in the same turn, ahead of debounced persistence.
    count = page.evaluate("""() => {
      document.querySelector('#editor .paragraph-content').append('z');
      return NotesSummarySource.read().characters;
    }""")
    assert count == 50
    browser.close()
    print(f'PASS {engine.name}: live structured note, hidden children, nested lists, legacy HTML, 49/50 graphemes')


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as pw:
            origin = f'http://127.0.0.1:{server.server_port}'
            check(pw.chromium, os.getenv('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), origin)
            if os.getenv('WEBKIT_EXECUTABLE'):
                check(pw.webkit, os.environ['WEBKIT_EXECUTABLE'], origin)
    finally:
        server.shutdown()
