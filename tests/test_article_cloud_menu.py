"""Exercise the article's live cloud buttons with a delayed, per-call fake sync."""
import os
import re
from http.server import ThreadingHTTPServer
from io import BytesIO
from threading import Thread

from PIL import Image
from playwright.sync_api import expect, sync_playwright

from test_article_navigation_menu import Handler

CLOUD = '''() => {
  window.qaCalls = [];
  window.qaResolved = 0;
  window.addEventListener('sentinela:cloudresolved', () => qaResolved++);
  window.sentinelaSync = Object.fromEntries(
    ['pushMissing', 'pushOverwrite', 'pullMissing', 'pullOverwrite', 'deleteRemote'].map(
      method => [method, progress => new Promise(resolve => {
        qaCalls.push({method, resolve, progress});
        progress?.('reading');
        if (window.qaInstant) resolve(window.qaInstant);
      })]
    )
  );
}'''


def check_contrast(button):
    # Sample the actual primary fill. The original white-on-white bug was caused
    # by a missing inherited variable outside the menu's CSS subtree.
    pixels = Image.open(BytesIO(button.screenshot(animations='disabled'))).convert('RGB')
    ink = button.evaluate('''el => {
      const canvas = document.createElement('canvas').getContext('2d');
      canvas.fillStyle = getComputedStyle(el).color;
      canvas.fillRect(0,0,1,1);
      return Array.from(canvas.getImageData(0,0,1,1).data).slice(0,3);
    }''')

    def luminance(channels):
        values = [channel / 255 for channel in channels]
        linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values]
        return sum(a * b for a, b in zip(linear, [.2126, .7152, .0722]))

    for y in (.35, .5, .65):
        fill = pixels.getpixel((10, round(pixels.height * y)))
        dark, light = sorted([luminance(ink), luminance(fill)])
        ratio = (light + .05) / (dark + .05)
        assert ratio >= 4.5, (ink, fill, ratio)
    assert button.bounding_box()['height'] >= 44


def check(engine, executable, origin):
    browser = engine.launch(executable_path=executable, headless=True,
                            args=['--no-sandbox'] if engine.name == 'chromium' else [])
    context = browser.new_context(viewport={'width': 430, 'height': 873}, has_touch=True,
                                  is_mobile=True, service_workers='block', reduced_motion='reduce')
    context.route('**/*', lambda r: r.continue_() if r.request.url.startswith(origin + '/') else r.abort())
    page = context.new_page()
    errors, alerts = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def handle_alert(dialog):
        alerts.append(dialog.message)
        dialog.dismiss()

    page.on('dialog', handle_alert)
    page.set_default_timeout(6000)
    page.goto(origin + '/qa-article-navigation.html')
    page.wait_for_function('window.SentinelaArticleMenu')
    page.evaluate(CLOUD)
    page.locator('#nav-sentinela').tap()
    open_cloud = page.locator('#btn-abrir-sync')
    sheet = page.locator('#sentinelaSyncOverlay')
    feedback = sheet.locator('#sentinelaSyncFeedback')
    run = sheet.locator('#sentinelaSyncRun')
    cancel = sheet.locator('#sentinelaSyncCancel')
    close = sheet.locator('#sentinelaSyncClose')
    confirm = sheet.locator('#sentinelaSyncConfirm')

    def state(expected):
        expect(sheet).to_be_visible()
        expect(sheet).to_have_attribute('data-state', expected)

    def select(tab, value='merge'):
        sheet.locator(f'[data-sync-tab="{tab}"]').tap()
        panel = sheet.locator(f'[data-sync-panel="{tab}"]')
        expect(panel).to_be_visible()
        opt = panel.locator(f'input[value="{value}"]')
        panel.locator(f'label:has(input[value="{value}"])').tap()
        expect(opt).to_be_checked()

    def finish(result):
        page.evaluate('result => qaCalls.at(-1).resolve(result)', result)

    def calls():
        return page.evaluate('qaCalls.map(c => c.method)')

    open_cloud.tap()
    state('idle')
    expect(run).to_have_text(re.compile('Enviar', re.I))
    check_contrast(run)
    page.evaluate("document.documentElement.dataset.theme='dark'")
    check_contrast(run)
    page.evaluate("document.documentElement.dataset.theme='light'")
    expect(feedback).to_have_attribute('role', 'status')
    page.keyboard.press('Escape')
    expect(sheet).to_be_hidden()

    # Each of the five actions routes to its own method exactly once. The three
    # destructive choices can be cancelled without losing their selection.
    for tab, choice, method, verb in [
        ('enviar', 'merge', 'pushMissing', 'Enviando'),
        ('baixar', 'merge', 'pullMissing', 'Baixando'),
        ('enviar', 'overwrite', 'pushOverwrite', 'Enviando'),
        ('baixar', 'overwrite', 'pullOverwrite', 'Baixando'),
        ('apagar', 'day', 'deleteRemote', 'Apagando'),
    ]:
        old = calls()
        open_cloud.tap()
        select(tab, choice)
        destructive = choice != 'merge'
        run.tap()
        if destructive:
            state('confirm')
            assert calls() == old
            expect(confirm).to_be_visible()
            if tab == 'enviar':
                page.keyboard.press('Escape')
            else:
                cancel.tap()
            state('idle')
            expect(sheet.locator(f'input[name="sync-{tab}"]:checked')).to_have_value(choice)
            run.tap()
            state('confirm')
            confirm.tap()
        state('busy')
        assert calls() == old + [method]
        expect(feedback).to_contain_text('Consultando')
        page.evaluate("phase => qaCalls.at(-1).progress(phase)", 'applying' if tab == 'baixar' else 'writing')
        expect(feedback).to_contain_text('Salvando' if tab == 'baixar' else 'Aguardando')
        expect(sheet.locator('[data-sync-tab="apagar"]')).to_be_disabled()
        expect(run).to_be_disabled()
        expect(run).to_contain_text(re.compile(verb, re.I))
        # Deliver already queued synthetic clicks, even past the native disabled
        # guard, to exercise the handler's protection against a second dispatch.
        run.dispatch_event('click')
        if destructive:
            confirm.dispatch_event('click')
        assert calls() == old + [method]

        if tab == 'enviar' and choice == 'merge':
            cancel.tap()
            expect(sheet).to_be_hidden()
            open_cloud.tap()
            state('busy')
            assert calls() == old + [method]
        if tab == 'baixar' and choice == 'merge':
            close.tap()
            expect(sheet).to_be_hidden()
        finish({'success': True, 'changed': 2})
        if tab == 'baixar' and choice == 'merge':
            open_cloud.tap()
        state('success')
        expect(feedback).to_contain_text('2 alterações')
        expect(run).to_have_text('Concluir')
        run.press('Enter')
        expect(sheet).to_be_hidden()
    assert page.evaluate('qaResolved') == 5

    # A failed destructive attempt must go back through confirmation on retry.
    open_cloud.tap()
    select('apagar', 'day')
    run.tap()
    confirm.tap()
    finish({'success': False, 'error': 'Servidor indisponível por instantes.'})
    state('error')
    expect(run).to_have_text('Tentar novamente')
    count = len(calls())
    run.press('Enter')
    state('confirm')
    assert len(calls()) == count
    confirm.tap()
    assert calls()[count:] == ['deleteRemote']
    finish({'success': True, 'changed': 0})
    state('success')
    expect(feedback).to_contain_text(re.compile(r'nenhum|nenhuma|já|vazi|nada', re.I))
    run.press('Enter')

    for code, expected in [('SYNC_PARTIAL', 'partial'), ('SYNC_EMPTY', 'empty')]:
        open_cloud.tap()
        select('baixar')
        run.tap()
        prior = page.evaluate('qaResolved')
        finish({'success': False, 'code': code, 'error': 'Resultado de teste.'})
        state(expected)
        expect(feedback).not_to_be_empty()
        assert page.evaluate('qaResolved') == prior
        close.tap()

    # WPE's offline emulation is a transport setting and may leave onLine true.
    # Override only the browser connectivity signal. Every network operation in
    # the fixture already goes through the deferred in-memory fake.
    open_cloud.tap()
    previous = calls()
    page.evaluate("Object.defineProperty(navigator, 'onLine', {configurable:true, get:()=>false})")
    run.tap()
    state('error')
    expect(feedback).to_contain_text('internet')
    assert calls() == previous
    page.evaluate('delete navigator.onLine')
    run.press('Enter')
    state('busy')
    assert calls() == previous + ['pushMissing']
    finish({'success': True, 'changed': 1})
    state('success')
    expect(feedback).to_contain_text('1 alteração')
    run.press('Enter')

    # A second physical tap can land on the same button after an instant
    # response replaced its label with Concluir or Tentar novamente.
    page.evaluate('''() => {
      document.addEventListener('click', e => {
        if (window.qaTapTargets) qaTapTargets.push([e.target.id, e.isTrusted, e.clientX, e.clientY]);
      }, true);
    }''')
    for outcome, expected in [({'success': True, 'changed': 1}, 'success'),
                              ({'success': False, 'error': 'Falha imediata.'}, 'error')]:
        open_cloud.tap()
        state('idle')
        prior = calls()
        page.evaluate('result => window.qaInstant = result', outcome)
        box = run.bounding_box()
        x, y = round(box['x'] + box['width'] * .8), round(box['y'] + box['height'] / 2)
        page.evaluate('window.qaTapTargets = []')
        page.touchscreen.tap(x, y)
        page.touchscreen.tap(x, y)
        taps = page.evaluate('qaTapTargets')
        assert len(taps) == 2 and taps[0] == taps[1], taps
        assert taps[0][:2] == ['sentinelaSyncRun', True], taps
        state(expected)
        assert calls() == prior + ['pushMissing']
        if expected == 'error':
            page.evaluate('window.qaInstant = {success:true, changed:1}')
            # An intentional tap on another part of Retry is immediately usable.
            run.tap(position={'x': 18, 'y': 22})
            state('success')
            assert calls() == prior + ['pushMissing', 'pushMissing']
        run.press('Enter')
        expect(sheet).to_be_hidden()
    page.evaluate('delete window.qaInstant')

    # Confirmations are bound to both account ID and login instance.
    for tab, choice, account in [
        ('enviar', 'overwrite', {'id': 'synthetic', 'loginId': 'new-login'}),
        ('apagar', 'day', {'id': 'other', 'loginId': 'new-login'}),
    ]:
        page.evaluate("localStorage.setItem('supabase_user', JSON.stringify({id:'synthetic',loginId:'original'}))")
        open_cloud.tap()
        select(tab, choice)
        run.tap()
        state('confirm')
        prior = calls()
        page.evaluate("a => localStorage.setItem('supabase_user', JSON.stringify(a))", account)
        confirm.tap()
        state('account')
        assert calls() == prior
        close.tap()

    page.evaluate("localStorage.removeItem('supabase_user')")
    open_cloud.tap()
    state('account')
    expect(feedback).to_contain_text(re.compile('conta|login|entrar', re.I))
    assert not alerts, alerts
    assert not errors, errors
    browser.close()
    print(f'PASS {engine.name}: five cloud actions, rendered CTA, busy/double tap, persistent results, '
          'destructive confirmations, retry, partial, empty and session changes', flush=True)


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        origin = f'http://127.0.0.1:{server.server_port}'
        with sync_playwright() as playwright:
            check(playwright.chromium, os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), origin)
            if os.environ.get('WEBKIT_EXECUTABLE'):
                check(playwright.webkit, os.environ['WEBKIT_EXECUTABLE'], origin)
    finally:
        server.shutdown()
