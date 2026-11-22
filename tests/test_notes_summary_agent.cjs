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
const reply = (resumo, desenvolvida) => ({
  ok: true, json: async () => ({text: JSON.stringify({resumo, desenvolvida})})
});

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
    assert.equal(prompt.includes('300 caracteres'), prompt.includes('Faça a síntese final'));
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

test('developed notes target 300 characters and keep full sentences after at most one rewrite', async () => {
  const note = 'Contexto, exemplos e conclusão de uma anotação desenvolvida. '.repeat(12).trim();
  const target = 'Uma frase com várias ideias. '.repeat(10).trim();
  assert.ok(target.length >= 260 && target.length <= 340);
  for (const first of ['Uma só frase.', target, target + target]) {
    const prompts = [];
    const summarize = load(async (url, options) => {
      prompts.push(JSON.parse(options.body).prompt);
      return reply(prompts.length === 1 ? first : target, true);
    });
    assert.equal(await summarize(note), target);
    assert.equal(prompts.length, first === target ? 1 : 2);
    assert.ok(prompts.every(prompt => prompt.endsWith(note)));
  }
});

test('one-idea and repetitive notes are not padded out to 300 characters', async () => {
  const idea = 'A horta comunitária precisa de água nos períodos de seca.';
  for (const note of [idea, Array(80).fill(idea).join('\n')]) {
    let calls = 0;
    const summarize = load(async () => { calls++; return reply('A horta precisa de água durante a seca.', false); });
    assert.equal(await summarize(note), 'A horta precisa de água durante a seca.');
    assert.equal(calls, 1);
  }
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
