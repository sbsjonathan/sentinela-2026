"""Two isolated browsers using the app's Supabase adapter and a synthetic table."""
import os
from http.server import ThreadingHTTPServer
from threading import Thread

from playwright.sync_api import sync_playwright

from test_notes_cloud import Handler


def check(engine, executable, origin):
    rows = {}
    week = '16-11'
    account = 'test-summary-A'
    scope = (account, week, 'richtext')

    # Only PostgREST's row transport is substituted. Session checks, document
    # serialization, compare-and-swap, recovery and the retry queue run normally.
    def query(table, operation, filters, value):
        assert table == 'richtext_anotacoes', table
        identity = value if operation == 'upsert' else filters
        key = tuple(identity[k] for k in ('usuario_id', 'semana', 'tipo'))
        row = rows.get(key)
        if operation == 'upsert' and row:
            return {'data': None}
        if operation == 'update' and (not row or row['id'] != filters['id'] or row['xmin'] != filters['xmin']):
            return {'data': None}
        if operation != 'read':
            rows[key] = row = {
                'id': row['id'] if row else len(rows) + 1,
                'xmin': str(int(row['xmin']) + 1) if row else '1',
                'conteudo_html': value['conteudo_html'],
            }
        return {'data': row}

    browser = engine.launch(executable_path=executable, args=['--no-sandbox'] if engine.name == 'chromium' else [])

    def device():
        context = browser.new_context(service_workers='block')
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
        context.expose_function('testQuery', query)
        context.add_init_script("""(() => {
          if (!localStorage.getItem('supabase_user')) localStorage.setItem('supabase_user', JSON.stringify({id:'test-summary-A'}));
          window.supabase = {createClient: () => ({from: table => ({
            operation:'read', filters:{}, value:{},
            select() {return this}, eq(key,value) {this.filters[key]=value;return this},
            update(value) {this.value=value;this.operation='update';return this},
            upsert(value) {this.value=value;this.operation='upsert';return this},
            maybeSingle() {return window.testQuery(table,this.operation,this.filters,this.value)}
          })})};
        })()""")
        return context.new_page()

    def open_week(page, which):
        page.goto(f'{origin}/richtext/container.html?versao=2&semana={which}')
        page.wait_for_function('window.cacheRichText && window.AutoSaveManager && window.UnifiedLoadManager')
        page.evaluate('Promise.all([window.cacheRichText.ready, window.AutoSaveManager.ready, window.UnifiedLoadManager.ready])')
        page.evaluate('window.UnifiedLoadManager.syncWithSupabase()')

    def sync(page):
        page.wait_for_function("!window.cacheRichText.hasPending() && window.AutoSaveManager.getCloudStatus() === 'synced'")

    def write(page, text):
        page.locator('#editor .paragraph-content').first.fill(text)
        assert page.evaluate('!!window.cacheRichText.flush()')

    def save_summary(page, text):
        assert page.evaluate('t => window.cacheRichText.saveSummary(window.NotesSummarySource.read().outline,t)', text)

    def summary(page):
        return page.evaluate('window.cacheRichText.getSummary(window.NotesSummarySource.read().outline)')

    def format_text(page, tag):
        page.locator('#editor .paragraph-content').first.evaluate("""(field, tag) => {
            const span = document.createElement(tag);
            span.textContent = field.textContent;
            field.replaceChildren(span);
            field.dispatchEvent(new Event('input', {bubbles:true}));
        }""", tag)
        assert page.evaluate('!!window.cacheRichText.flush()')

    original = 'A anotação da reunião explica a proposta inicial de ouvir todos os presentes antes de tomar uma decisão.'
    new_text = 'A decisão final da reunião prioriza a visita na sexta-feira e o estudo da semana seguinte.'
    local_edit = 'A visita mudou para segunda-feira para incluir todas as pessoas que participaram do estudo.'
    first_summary = 'A proposta é ouvir todos antes da decisão.'
    a, b = device(), device()
    try:
        open_week(a, week)
        write(a, original)
        sync(a)
        previous = rows[scope]['conteudo_html']
        a.context.set_offline(True)
        save_summary(a, first_summary)
        assert a.evaluate("JSON.parse(localStorage['richtext_cache_16-11']).notesSummary.text") == first_summary
        assert rows[scope]['conteudo_html'] == previous
        a.context.set_offline(False)
        sync(a)
        assert first_summary in rows[scope]['conteudo_html']
        open_week(b, week)
        assert summary(b) == first_summary
        open_week(a, week)
        assert summary(a) == first_summary

        # Editing and undoing the text can leave a pending removal of a
        # summary. That must not restore the old body over B's actual edit.
        a.context.set_offline(True)
        write(a, 'Edição transitória do primeiro aparelho antes de desfazer.')
        write(a, original)
        assert not summary(a)
        intermediate = 'As famílias vão conversar juntas na próxima semana para definir como organizar a visita.'
        write(b, intermediate)
        sync(b)
        before_reconnect = rows[scope]['conteudo_html']
        a.context.set_offline(False)
        sync(a)
        assert a.locator('#editor').inner_text().strip() == intermediate
        assert rows[scope]['conteudo_html'] == before_reconnect

        # A generated a summary offline; B has edited the actual note.
        a.context.set_offline(True)
        save_summary(a, 'Outro resumo do documento antes da decisão.')
        write(b, new_text)
        sync(b)
        new_raw = rows[scope]['conteudo_html']
        a.context.set_offline(False)
        sync(a)
        assert a.locator('#editor').inner_text().strip() == new_text
        assert not summary(a)
        assert rows[scope]['conteudo_html'] == new_raw

        # The inverse race: a newly synced summary must not replace local typing.
        a.context.set_offline(True)
        write(a, local_edit)
        save_summary(b, 'A sexta-feira foi escolhida para a visita.')
        sync(b)
        a.context.set_offline(False)
        sync(a)
        assert local_edit in rows[scope]['conteudo_html']
        assert 'notesSummary' not in rows[scope]['conteudo_html']
        open_week(b, week)
        assert b.locator('#editor').inner_text().strip() == local_edit
        assert not summary(b)
        save_summary(b, 'A visita acontecerá na segunda-feira.')
        sync(b)
        open_week(a, week)

        # Regenerating an existing summary on one device and formatting the
        # same text on the other should preserve both edits, in either order.
        a.context.set_offline(True)
        format_text(a, 'strong')
        save_summary(b, 'A visita passou para segunda-feira.')
        sync(b)
        a.context.set_offline(False)
        sync(a)
        assert '<strong>' in rows[scope]['conteudo_html']
        assert summary(a) == 'A visita passou para segunda-feira.'
        open_week(b, week)
        a.context.set_offline(True)
        save_summary(a, 'A nova data da visita é segunda-feira.')
        format_text(b, 'em')
        sync(b)
        a.context.set_offline(False)
        sync(a)
        assert '<em>' in rows[scope]['conteudo_html']
        assert 'A nova data da visita é segunda-feira.' in rows[scope]['conteudo_html']
        open_week(b, '23-11')
        assert not summary(b)
        open_week(b, week)
        assert summary(b) == 'A nova data da visita é segunda-feira.'
        b.evaluate("""() => { localStorage.setItem('supabase_user',JSON.stringify({id:'test-summary-B'}));
            window.dispatchEvent(new Event('supabaseSessionChanged')); }""")
        b.wait_for_function("window.AutoSaveManager.accountId==='test-summary-B' && !window.AutoSaveManager.sending")
        assert not summary(b)
        assert list(rows) == [scope]
        assert 'A nova data da visita é segunda-feira.' in rows[scope]['conteudo_html']
    finally:
        browser.close()
    print(f'PASS {engine.name}: summary round trip, offline retry, both edit races and week/account isolation', flush=True)


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as browsers:
            origin = f'http://127.0.0.1:{server.server_port}'
            check(browsers.chromium, os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), origin)
            if os.environ.get('WEBKIT_EXECUTABLE'):
                check(browsers.webkit, os.environ['WEBKIT_EXECUTABLE'], origin)
    finally:
        server.shutdown()
