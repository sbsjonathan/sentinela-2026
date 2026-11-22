"""Automatic local resolution in two real editor tabs sharing one week's cache."""
import json
import os
from pathlib import Path
from http.server import ThreadingHTTPServer
from threading import Thread

from playwright.sync_api import sync_playwright
from test_notes_upgrade import Handler, PREFIX, WEEK


def check(engine, executable, origin):
    browser = engine.launch(executable_path=executable, headless=True,
                            args=['--no-sandbox'] if engine.name == 'chromium' else [])
    context = browser.new_context(service_workers='block')
    context.add_init_script("Object.defineProperty(navigator, 'onLine', {value:false})")
    context.route('**/*', lambda r: r.continue_() if r.request.url.startswith(origin + '/') else r.abort())
    url = origin + PREFIX + 'richtext/container.html?semana=' + WEEK
    a, b = context.new_page(), context.new_page()
    errors = []
    for page in (a, b):
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url)
        page.wait_for_function('window.cacheRichText && window.AutoSaveManager')
        page.evaluate('window.cacheRichText.ready')
        page.evaluate('''() => {
          window.cacheRichText.setDelay(60000);
          window.edit = (text, save) => {
            const box = document.querySelector('#editor .paragraph-content');
            box.textContent = text;
            box.dispatchEvent(new Event('input', {bubbles:true}));
            if (save) window.cacheRichText.flush();
          };
        }''')

    a.evaluate("edit('Original', true)")
    b.wait_for_function("document.querySelector('#editor').textContent === 'Original'")
    a.evaluate("edit('Edição nesta aba', false)")
    b.evaluate("edit('Edição na segunda aba', true)")
    b.wait_for_function("document.querySelector('#editor').textContent === 'Edição nesta aba'")
    copies = a.evaluate('window.cacheRichText.listRecovery()')
    assert any(c['external']['tree'][0]['text'] == 'Edição na segunda aba'
               and c['local']['tree'][0]['text'] == 'Edição nesta aba' for c in copies)
    assert a.evaluate('window.cacheRichText.getConflict() === null && window.cacheRichText.isStored(window.cacheRichText.snapshot())')
    for page in (a, b):
        assert page.locator('#notes-save-status:visible').count() == 0
    a.reload()
    a.wait_for_function("window.cacheRichText && document.querySelector('#editor').textContent === 'Edição nesta aba'")
    assert len(a.evaluate('window.cacheRichText.listRecovery()')) == len(copies)

    # A failed recovery write must leave the other copy in place and keep the
    # live draft exportable. Retry uses both of those same versions.
    b.evaluate('''() => {
      const set = Storage.prototype.setItem;
      window.denyRecovery = true;
      Storage.prototype.setItem = function(key, value) {
        if (window.denyRecovery && key.startsWith('richtext_recovery_'))
          throw new DOMException('Sem espaço', 'QuotaExceededError');
        return set.call(this, key, value);
      };
      edit('Rascunho com armazenamento cheio', false);
    }''')
    a.evaluate('''() => {
      const box = document.querySelector('#editor .paragraph-content');
      box.textContent = 'Outra edição guardada';
      box.dispatchEvent(new Event('input', {bubbles:true}));
      window.cacheRichText.flush();
    }''')
    b.locator('#notes-save-status[data-type=error]').wait_for(state='visible')
    assert b.evaluate("window.cacheRichText.getConflict().external.tree[0].text") == 'Outra edição guardada'
    assert b.evaluate("JSON.parse(localStorage.getItem('richtext_cache_02-11')).tree[0].text") == 'Outra edição guardada'
    assert b.locator('#notes-save-status details').count() == 0
    with b.expect_download() as download:
        b.get_by_role('button', name='Baixar cópia').click()
    recovery = json.loads(Path(download.value.path()).read_text())
    assert recovery['local']['tree'][0]['text'] == 'Rascunho com armazenamento cheio'
    assert recovery['external']['tree'][0]['text'] == 'Outra edição guardada'
    b.evaluate('window.denyRecovery = false')
    b.get_by_role('button', name='Tentar novamente').click()
    b.locator('#notes-save-status').wait_for(state='hidden')
    a.wait_for_function("document.querySelector('#editor').textContent === 'Rascunho com armazenamento cheio'")
    assert b.evaluate('window.cacheRichText.getConflict()') is None

    # Both writers can commit before either storage event reaches the other
    # page. A sibling revision gets archived before this clean tab adopts it.
    b.evaluate('''() => {
      const key = 'richtext_cache_02-11';
      const sibling = JSON.parse(localStorage.getItem(key));
      sibling.writerSession = 'second-writer';
      sibling.localRevision = 'sibling';
      sibling.tree[0].text = sibling.tree[0].html = 'Último commit de outra aba';
      localStorage.setItem(key, JSON.stringify(sibling));
      window.cacheRichText.flush();
    }''')
    for page in (a, b):
        page.wait_for_function("document.querySelector('#editor').textContent === 'Último commit de outra aba'")
        assert page.locator('#notes-save-status:visible').count() == 0
    assert any(c['local']['tree'][0]['text'] == 'Rascunho com armazenamento cheio'
               and c['external']['localRevision'] == 'sibling' for c in b.evaluate('window.cacheRichText.listRecovery()'))
    # The explicit recovery editor also exports the live draft on quota errors.
    b.goto(origin + PREFIX + 'richtext/container-v1.html?semana=' + WEEK + '&versao=1&legado=1')
    b.wait_for_function("window.NotesVersions?.current === '1' && window.cacheRichText")
    b.evaluate('window.cacheRichText.ready')
    b.evaluate("""() => {
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
            if (key === 'richtext_cache_02-11') throw new DOMException('Sem espaço','QuotaExceededError');
            return set.call(this, key, value);
        };
        const box = document.querySelector('#editor .paragraph-content');
        box.textContent = 'Versão local a exportar';
        box.dispatchEvent(new Event('input', {bubbles:true}));
        window.cacheRichText.flush();
    }""")
    with b.expect_download() as legacy_download:
        b.get_by_role('button', name='Baixar cópia').click()
    assert json.loads(Path(legacy_download.value.path()).read_text())['tree'][0]['text'] == 'Versão local a exportar'
    assert b.locator('#notes-save-status').is_visible()
    assert not errors, errors
    browser.close()
    print(f'{engine.name}: two-tab convergence, recovery after reload, quota error and retry passed', flush=True)


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as pw:
            check(pw.chromium, os.getenv('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), origin)
            if os.getenv('WEBKIT_EXECUTABLE'):
                check(pw.webkit, os.environ['WEBKIT_EXECUTABLE'], origin)
    finally:
        server.shutdown()
