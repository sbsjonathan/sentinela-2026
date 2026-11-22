"""The article's personal comments keep a full line even with empty saved markup."""
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def check(engine, executable):
    browser = engine.launch(executable_path=executable)
    page = browser.new_page(viewport={'width': 430, 'height': 932}, is_mobile=True, has_touch=True)
    page.set_content("""<!doctype html><html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      </head><body><main>
      <div><p class="pergunta"><span>10-11.</span> O que você aprendeu?</p></div>
      <p class="paragrafo"><span>10</span> Um exemplo.</p>
      <ul class="lista-recapitulacao"><li>Para recapitular</li></ul>
      </main></body></html>""")
    page.add_style_tag(path=ROOT / 'sentinela/style.css')
    page.add_style_tag(path=ROOT / 'sentinela/clickable/clickable.css')
    page.evaluate("""() => {
      window.CacheAnotacao = {carregar: key => key.startsWith('c-') ? '<div></div>' : '', salvar() {}};
    }""")
    page.add_script_tag(path=ROOT / 'sentinela/clickable/clickable.js')
    for selector in ['.pergunta', '.lista-recapitulacao li']:
        page.locator(selector).click()
    fields = page.locator('.comentarios')
    assert fields.count() == 2
    for field in fields.all():
        assert field.inner_html() == '<div></div>'
        empty_height = field.bounding_box()['height']
        assert empty_height >= 44, (field.get_attribute('id'), empty_height)
        assert field.evaluate('el => getComputedStyle(el).color') == 'rgb(98, 98, 98)'
        field.fill('Um comentário')
        assert abs(field.bounding_box()['height'] - empty_height) < 1
        field.fill('Linha\n' * 4 + 'Última linha')
        assert field.bounding_box()['height'] > empty_height
        field.fill('')
        field.blur()
        assert abs(field.bounding_box()['height'] - empty_height) < 1
    page.evaluate("""() => {
      document.documentElement.dataset.theme = 'dark';
      document.documentElement.style.setProperty('--font-scale-global', '1.875');
    }""")
    page.wait_for_function("""() => getComputedStyle(document.querySelector('.comentarios')).color === 'rgb(152, 152, 157)'""")
    assert fields.first.bounding_box()['height'] >= 66
    browser.close()
    print(f'PASS {engine.name} empty, edited, restored, recap and scaled comment fields')


if __name__ == '__main__':
    with sync_playwright() as playwright:
        check(playwright.chromium, os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'))
        if os.environ.get('WEBKIT_EXECUTABLE'):
            check(playwright.webkit, os.environ['WEBKIT_EXECUTABLE'])
