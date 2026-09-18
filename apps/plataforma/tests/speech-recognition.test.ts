import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceInput, getBrowserRecognitionFactory, type RecognitionEngine, type RecognitionErrorEvent, type RecognitionResultEvent } from '../lib/speech-recognition';

class Engine implements RecognitionEngine {
  lang = ''; continuous = false; interimResults = false; maxAlternatives = 0;
  onstart: (() => void) | null = null;
  onresult: ((event: RecognitionResultEvent) => void) | null = null;
  onerror: ((event: RecognitionErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  starts = 0; stops = 0; aborts = 0;
  start() { this.starts++; this.onstart?.(); }
  stop() { this.stops++; }
  abort() { this.aborts++; }
  results(rows: [string, boolean][], resultIndex = 0) { this.onresult?.(results(rows, resultIndex)); }
}
function results(rows: [string, boolean][], resultIndex = 0): RecognitionResultEvent {
  return { resultIndex, results: rows.map(([transcript, isFinal]) => ({ isFinal, length: 1, 0: { transcript } })) };
}
function setup() {
  const engines: Engine[] = [];
  const input = new VoiceInput(() => { const engine = new Engine(); engines.push(engine); return engine; });
  return { input, engines };
}

test('voice input does no microphone work until start and uses Brazilian Portuguese', () => {
  const { input, engines } = setup();
  assert.equal(engines.length, 0); assert.equal(input.getSnapshot().status, 'idle');
  assert.equal(input.start(), true);
  assert.equal(engines.length, 1); assert.equal(engines[0].starts, 1);
  assert.equal(engines[0].lang, 'pt-BR'); assert.equal(engines[0].interimResults, true); assert.equal(engines[0].continuous, true);
  assert.equal(engines[0].maxAlternatives, 1);
  input.abort();
});

test('native interim replacements and incremental final results never duplicate words', () => {
  const { input, engines } = setup(); input.start(); const engine = engines[0];
  engine.results([['O que é', false]]);
  assert.equal(input.getSnapshot().interim, 'O que é'); assert.equal(input.getSnapshot().transcript, '');
  engine.results([['O que é uma', true], ['rí', false]]);
  assert.equal(input.getSnapshot().transcript, 'O que é uma'); assert.equal(input.getSnapshot().interim, 'rí');
  engine.results([['O que é uma', true], ['rima?', true]], 1);
  assert.equal(input.getSnapshot().transcript, 'O que é uma rima?'); assert.equal(input.getSnapshot().interim, '');
  engine.results([['O que é uma', true], ['rima?', true]], 1);
  assert.equal(input.getSnapshot().transcript, 'O que é uma rima?');
  engine.onend?.(); assert.equal(input.getSnapshot().status, 'idle'); assert.equal(input.getSnapshot().transcript, 'O que é uma rima?');
  assert.equal(engine.onresult, null);
});

test('stop permits a final result; abort discards it and ignores every saved late callback', () => {
  const { input, engines } = setup(); input.start(); const engine = engines[0];
  engine.results([['Minha', false]]); input.stop();
  assert.equal(input.getSnapshot().status, 'processing'); assert.equal(engine.stops, 1);
  engine.results([['Minha dúvida.', true]]); engine.onend?.();
  assert.equal(input.getSnapshot().transcript, 'Minha dúvida.'); assert.equal(input.getSnapshot().status, 'idle');
  input.start(); const next = engines[1];
  const lateResult = next.onresult, lateError = next.onerror, lateStart = next.onstart, lateEnd = next.onend;
  input.abort();
  lateResult?.(results([['Texto antigo', true]])); lateError?.({ error: 'network' }); lateStart?.(); lateEnd?.();
  assert.deepEqual(input.getSnapshot(), { status: 'idle', transcript: '', interim: '', error: '' });
  assert.equal(next.aborts, 1);
});

test('starting a new session isolates it from the previous native recognizer', () => {
  const { input, engines } = setup(); input.start();
  const oldResult = engines[0].onresult, oldEnd = engines[0].onend;
  engines[0].results([['Primeira', true]]); input.start();
  assert.equal(engines[0].aborts, 1);
  engines[1].results([['Nova pergunta', true]]);
  oldResult?.(results([['Primeira atrasada', true]])); oldEnd?.();
  assert.equal(input.getSnapshot().status, 'listening'); assert.equal(input.getSnapshot().transcript, 'Nova pergunta');
  input.abort();
});

test('permission, missing microphone and network errors are understandable and release recognition', () => {
  for (const [code, expected] of [['not-allowed', /não foi autorizado/], ['audio-capture', /microfone disponível/], ['network', /conexão/], ['language-not-supported', /português não está disponível/]] as const) {
    const { input, engines } = setup(); input.start(); engines[0].onerror?.({ error: code });
    assert.equal(input.getSnapshot().status, 'error'); assert.match(input.getSnapshot().error, expected as RegExp);
    assert.equal(engines[0].aborts, 1); assert.equal(engines[0].onresult, null);
    input.abort();
  }
});

test('no speech or unsupported recognition keeps typed questions available', () => {
  const unsupported = new VoiceInput();
  assert.equal(unsupported.start(), false); assert.match(unsupported.getSnapshot().error, /escrever/);
  const { input, engines } = setup(); input.start(); engines[0].onend?.();
  assert.equal(input.getSnapshot().status, 'error'); assert.match(input.getSnapshot().error, /Não consegui ouvir/);
  input.abort();
});

test('the 500-character limit bounds final and interim text and requests recognition stop', () => {
  const { input, engines } = setup(); input.start();
  engines[0].results([['A'.repeat(490), true], ['B'.repeat(40), false]]);
  assert.equal(input.getSnapshot().transcript.length + input.getSnapshot().interim.length, 500);
  assert.equal(input.getSnapshot().status, 'processing'); assert.equal(engines[0].stops, 1);
  engines[0].results([['A'.repeat(490), true], ['B'.repeat(40), true]], 1);
  assert.equal(input.getSnapshot().transcript.length, 500); assert.equal(input.getSnapshot().interim, '');
  engines[0].onend?.(); assert.equal(input.getSnapshot().status, 'idle');
});

test('sessions stop after 30 seconds and release even when the native end event never arrives', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { input, engines } = setup(); input.start(); engines[0].results([['Uma pergunta', true]]);
  t.mock.timers.tick(29999); assert.equal(engines[0].stops, 0);
  t.mock.timers.tick(1); assert.equal(input.getSnapshot().status, 'processing'); assert.equal(engines[0].stops, 1);
  t.mock.timers.tick(2000); assert.equal(engines[0].aborts, 1); assert.equal(input.getSnapshot().status, 'idle');
  assert.equal(input.getSnapshot().transcript, 'Uma pergunta');
  input.abort(); t.mock.timers.tick(60000); assert.equal(input.getSnapshot().status, 'idle');
});

test('start exceptions clean up callbacks and a later attempt can succeed', () => {
  const engine = new Engine(); const normalStart = engine.start.bind(engine);
  engine.start = () => { throw new DOMException('denied', 'NotAllowedError'); };
  const input = new VoiceInput(() => engine);
  assert.equal(input.start(), false); assert.match(input.getSnapshot().error, /autorizado/); assert.equal(engine.onresult, null);
  engine.start = normalStart;
  assert.equal(input.start(), true); assert.equal(input.getSnapshot().error, ''); input.abort();
});

test('subscribers can unsubscribe without changing the recognizer lifecycle', () => {
  const { input, engines } = setup(); let updates = 0;
  const unsubscribe = input.subscribe(() => updates++); input.start(); assert.ok(updates > 0);
  unsubscribe(); const previous = updates; engines[0].results([['Olá', true]]); assert.equal(updates, previous); input.abort();
});

test('feature detection is safe during server rendering and constructs native instances only on demand', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: undefined });
    assert.equal(getBrowserRecognitionFactory(), undefined);
    let constructed = 0;
    class Native extends Engine { constructor() { super(); constructed++; } }
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { webkitSpeechRecognition: Native } });
    const factory = getBrowserRecognitionFactory(); assert.ok(factory); assert.equal(constructed, 0);
    assert.ok(factory() instanceof Native); assert.equal(constructed, 1);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});