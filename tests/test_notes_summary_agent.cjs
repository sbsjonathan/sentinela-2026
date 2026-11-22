const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {test} = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../richtext/notes-summary-agent.js'), 'utf8');
function load(fetch) {
  const context = {window: {}, fetch, AbortController, DOMException, setTimeout, clearTimeout};
  vm.runInNewContext(source, context);
  return context.window.NotesSummaryAgent.summarize;
}
const reply = resumo => ({ok: true, json: async () => ({text: JSON.stringify({resumo})})});

test('short notes stay on device; the 50th character enables a plain summary', async () => {
  const requests = [];
  const summarize = load(async (url, options) => {
    requests.push(options);
    return reply('Abrir a reunião com uma pergunta.');
  });
  await assert.rejects(summarize('A'.repeat(49)), /50/);
  assert.equal(requests.length, 0);
  assert.equal(await summarize('A'.repeat(50)), 'Abrir a reunião com uma pergunta.');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].credentials, 'omit');
  assert.ok(JSON.parse(requests[0].body).prompt.endsWith('A'.repeat(50)));
});

test('large outlines retain every block and word, including the final child', async () => {
  const sources = [];
  const summarize = load(async (url, options) => {
    const {prompt} = JSON.parse(options.body);
    sources.push(prompt.split('\n\nConteúdo para resumir:\n')[1]);
    return reply('Síntese ' + sources.length);
  });
  const outline = '1. Introdução\n' + '  - Um subtópico fechado.\n'.repeat(444) +
    'Exemplo: ' + '📝'.repeat(10003) + '\n    - Conclusão do último subtópico.';
  const summary = await summarize(outline);
  const finalInput = sources.pop();
  assert.equal(sources.join(''), outline);
  assert.ok(sources.length > 2);
  assert.equal(finalInput, sources.map((_, index) => 'Síntese ' + (index + 1)).join('\n'));
  assert.equal(summary, 'Síntese ' + (sources.length + 1));
  for (const part of sources) assert.equal(part, Buffer.from(part).toString());
});

test('cancellation aborts the active step and stops all remaining requests', async () => {
  const controller = new AbortController();
  let calls = 0;
  const summarize = load((url, {signal}) => new Promise((resolve, reject) => {
    calls++;
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  const pending = summarize('Texto longo. '.repeat(3000), {signal: controller.signal});
  controller.abort();
  await assert.rejects(pending, {name: 'AbortError'});
  await assert.rejects(summarize('A'.repeat(60), {signal: controller.signal}), {name: 'AbortError'});
  assert.equal(calls, 1);
});

test('incomplete or rate-limited responses fail without promoting partial text', async () => {
  const invalid = load(async () => ({ok: true, json: async () => ({text: '{"resumo":"Truncado'})}));
  await assert.rejects(invalid('A'.repeat(50)), /incompleto/);
  let attempts = 0;
  const limited = load(async () => { attempts++; return {ok: false, status: 429}; });
  await assert.rejects(limited('A'.repeat(11000)), /ocupada/);
  assert.equal(attempts, 1);
});
