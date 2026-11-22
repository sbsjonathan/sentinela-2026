"""The article's personal comments keep a full line even with empty saved markup."""
import os
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def assert_centered_caret(page, field):
    # An empty contenteditable has no text Range rect. Measure the painted
    # native caret itself, including inside an empty block restored from cache.
    field.evaluate("""el => {
      el.blur();
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el.firstChild || el);
      range.collapse(true);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }""")
    for _ in range(8):
        pixels = Image.open(BytesIO(field.screenshot(caret='initial'))).convert('RGB')
        red, green, blue = pixels.split()
        caret = ImageChops.subtract(green, ImageChops.lighter(red, blue)).point(lambda x: 255 if x > 100 else 0).getbbox()
        if caret:
            offset = (caret[1] + caret[3] - pixels.height) / (2 * page.evaluate('devicePixelRatio'))
            assert abs(offset) <= 1.5, (field.get_attribute('id'), field.inner_html(), offset)
            return
        page.wait_for_timeout(120)  # Sample the visible phase of the native blink.
    raise AssertionError('Native caret did not paint in the article field')


def check(engine, executable):
    browser = engine.launch(executable_path=executable)
    page = browser.new_page(viewport={'width': 430, 'height': 932}, is_mobile=True, has_touch=True, device_scale_factor=2)
    page.set_content("""<!doctype html><html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      </head><body><main>
      <div><p class="pergunta"><span>10-11.</span> O que você aprendeu?</p></div>
      <p class="paragrafo"><span>10</span> Um exemplo.</p>
      <ul class="lista-recapitulacao"><li>Para recapitular</li></ul>
      </main></body></html>""")
    page.add_style_tag(path=ROOT / 'sentinela/style.css')
    page.add_style_tag(path=ROOT / 'sentinela/clickable/clickable.css')
    page.add_style_tag(content='.comentarios { caret-color: #00fa00; }')
    page.evaluate("""() => {
      window.CacheAnotacao = {carregar: key => key.startsWith('c-') ? '<div></div>' : '', salvar() {}};
    }""")
    page.add_script_tag(path=ROOT / 'sentinela/clickable/clickable.js')
    for selector in ['.pergunta', '.lista-recapitulacao li']:
        page.locator(selector).click()
    page.evaluate("document.documentElement.style.setProperty('--font-scale-global', '1')")
    fields = page.locator('.comentarios')
    assert fields.count() == 2
    for field in fields.all():
        assert field.inner_html() == '<div></div>'
        empty_height = field.bounding_box()['height']
        assert empty_height >= 44, (field.get_attribute('id'), empty_height)
        assert field.evaluate('el => getComputedStyle(el).color') == 'rgb(98, 98, 98)'
        assert_centered_caret(page, field)
        field.fill('Um comentário')
        assert_centered_caret(page, field)
        assert abs(field.bounding_box()['height'] - empty_height) < 1
        field.fill('Linha\n' * 4 + 'Última linha')
        assert field.bounding_box()['height'] > empty_height
        field.fill('')
        assert_centered_caret(page, field)
        field.blur()
        assert abs(field.bounding_box()['height'] - empty_height) < 1
    page.evaluate("""() => {
      document.documentElement.dataset.theme = 'dark';
      document.documentElement.style.setProperty('--font-scale-global', '1.875');
    }""")
    page.wait_for_function("""() => getComputedStyle(document.querySelector('.comentarios')).color === 'rgb(152, 152, 157)'""")
    assert fields.first.bounding_box()['height'] >= 66
    fields.first.fill('Fonte ampliada')
    assert_centered_caret(page, fields.first)
    browser.close()
    print(f'PASS {engine.name} centered native caret in empty, edited, restored, recap and scaled comment fields')


if __name__ == '__main__':
    with sync_playwright() as playwright:
        check(playwright.chromium, os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'))
        if os.environ.get('WEBKIT_EXECUTABLE'):
            check(playwright.webkit, os.environ['WEBKIT_EXECUTABLE'])
