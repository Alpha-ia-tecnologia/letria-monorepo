import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechPlayer, type SpeechEnvironment } from '../lib/speech';
import type { PcmPlayback, PcmPlaybackEvents } from '../lib/pcm-stream';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const start = { type: 'start', sampleRate: 24000 };
const frame = { type: 'audio', data: Buffer.from([0, 16, 0, 240]).toString('base64') };
const end = { type: 'end' };
const line = (event: unknown) => new TextEncoder().encode(JSON.stringify(event) + '\n');
const response = (...events: unknown[]) => new Response(events.map(event => JSON.stringify(event)).join('\n'), { headers: { 'Content-Type': 'application/x-ndjson', 'X-Speech-Provider': 'qwen' } });
class FakePcm implements PcmPlayback {
  samples: Float32Array[] = [];
  finished = false; closed = false; resumes = 0; blocked = false;
  constructor(public events: PcmPlaybackEvents) {}
  append(samples: Float32Array, rate: number) { assert.equal(rate, 24000); this.samples.push(samples); if (this.blocked) this.events.blocked(); else this.events.playing(); }
  finish() { this.finished = true; }
  async resume() { this.resumes++; this.blocked = false; this.events.playing(); }
  close() { this.closed = true; }
  mouthLevel() { return .4; }
}
function setup({ fixedVoice = true, streaming = true, blocked = false } = {}) {
  const requests: { url: string; options?: RequestInit }[] = [];
  const sinks: FakePcm[] = [];
  const blobs: Blob[] = []; const revoked: string[] = [];
  let post: SpeechEnvironment['fetch'] = async () => response(start, frame, end);
  const environment: SpeechEnvironment = {
    utterance: text => ({ text } as SpeechSynthesisUtterance),
    audio: () => ({
      src: '', paused: true, ended: false,
      async play() {},
      pause() {}, removeAttribute() {}, load() {},
    } as unknown as HTMLAudioElement),
    pcmAudio: events => { const sink = new FakePcm(events); sink.blocked = blocked; sinks.push(sink); return sink; },
    fetch: async (url, options) => {
      requests.push({ url: String(url), options });
      if (options?.method === 'POST') return post(url, options);
      if (options?.method === 'DELETE') return Response.json({ ok: true });
      return Response.json({ mode: 'neural', provider: 'qwen', fixedVoice, streaming });
    },
    online: () => true,
    createURL: blob => { blobs.push(blob); return 'blob:prepared'; },
    revokeURL: url => { revoked.push(url); },
  };
  return { player: new SpeechPlayer(environment), environment, requests, sinks, blobs, revoked, setPost(handler: SpeechEnvironment['fetch']) { post = handler; } };
}

test('fixed Lumi sends complete text once and plays the first PCM before the response ends', async () => {
  const { player, setPost, requests, sinks } = setup();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  setPost(async () => new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } }));
  const text = 'Oi! Eu sou a Lumi. Vamos explorar a ilha das palavras e descobrir uma nova aventura juntos?';
  const playing = player.play('lumi', text, true, { requireNatural: true, profile: 'conversation', pace: 'calm' });
  await tick();
  const request = JSON.parse(String(requests.find(request => request.options?.method === 'POST')?.options?.body));
  assert.equal(request.text, text); assert.equal(request.stream, true); assert.equal(request.pace, 'calm');
  assert.match(request.requestId, /^[a-f0-9-]{36}$/);
  controller.enqueue(line(start)); controller.enqueue(line(frame)); await tick();
  assert.equal(sinks[0].samples.length, 1); assert.equal(player.getSnapshot().status, 'playing');
  assert.equal(player.getMouthLevel(), .4); assert.equal(sinks[0].finished, false);
  controller.enqueue(line(frame)); controller.enqueue(line(end)); controller.close(); await playing;
  assert.equal(sinks[0].samples.length, 2); assert.equal(sinks[0].finished, true);
  assert.equal(player.getSnapshot().status, 'playing');
  sinks[0].events.ended();
  assert.equal(player.getSnapshot().status, 'idle'); assert.equal(sinks[0].closed, true);
  assert.equal(requests.filter(request => request.options?.method === 'POST').length, 1);
  assert.equal(requests.filter(request => request.options?.method === 'DELETE').length, 0);
});

test('prepared PCM replay uses the same streaming player without whole-file blob URLs', async () => {
  const { player, sinks, requests, blobs } = setup();
  for (let i = 0; i < 2; i++) {
    await player.play('lumi', 'Vamos aprender?', true, { requireNatural: true, profile: 'reading' });
    assert.equal(sinks[i].finished, true); assert.equal(sinks[i].samples.length, 1);
    sinks[i].events.ended();
  }
  assert.equal(blobs.length, 0); assert.equal(requests.filter(request => request.options?.method === 'POST').length, 2);
  assert.ok(sinks.every(sink => sink.closed));
});

test('streaming autoplay offers a gesture and resumes the same bounded audio queue', async () => {
  const { player, sinks, requests } = setup({ blocked: true });
  await player.play('lumi', 'Oi!', true, { requireNatural: true });
  assert.equal(player.getSnapshot().status, 'ready');
  assert.match(player.getSnapshot().message, /Tocar áudio/); assert.equal(player.getMouthLevel(), 0);
  await player.resume('different-owner'); assert.equal(sinks[0].resumes, 0);
  await player.resume('lumi');
  assert.equal(player.getSnapshot().status, 'playing'); assert.equal(sinks[0].resumes, 1);
  assert.equal(requests.filter(request => request.options?.method === 'POST').length, 1);
  player.stop(); assert.equal(sinks[0].closed, true);
});

test('stop during PCM streaming cancels upstream once, closes audio and releases pending reads', async () => {
  const { player, sinks, setPost, requests } = setup();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(line(start)); controller.enqueue(line(frame)); }, cancel() { cancelled = true; } });
  setPost(async () => new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } }));
  const pending = player.play('lumi', 'Uma pista!', true, { requireNatural: true }); await tick();
  player.stop(); player.stop(); await pending;
  assert.equal(cancelled, true); assert.equal(sinks[0].closed, true);
  assert.equal(player.getSnapshot().status, 'idle'); assert.equal(player.getMouthLevel(), 0);
  const sent = requests.filter(request => request.options?.method === 'DELETE');
  assert.equal(sent.length, 1); assert.equal(sent[0].options?.keepalive, true);
  assert.equal(JSON.parse(String(sent[0].options?.body)).requestId, JSON.parse(String(requests.find(request => request.options?.method === 'POST')?.options?.body)).requestId);
});

test('a new utterance ignores old queued callbacks and aborts the previous stream', async () => {
  const { player, sinks, setPost } = setup();
  const oldBody = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(line(start)); controller.enqueue(line(frame)); } });
  setPost(async () => new Response(oldBody, { headers: { 'Content-Type': 'application/x-ndjson' } }));
  const old = player.play('old', 'Primeira fala', true, { requireNatural: true }); await tick();
  setPost(async () => response(start, frame, end));
  await player.play('new', 'Nova fala', true, { requireNatural: true }); await old;
  sinks[0].events.ended(); sinks[0].events.playing(); sinks[0].events.blocked();
  assert.equal(player.getSnapshot().owner, 'new'); assert.equal(player.getSnapshot().status, 'playing');
  assert.equal(sinks[0].closed, true); player.stop();
});

test('EOF or provider error after partial speech reports interruption instead of false completion', async () => {
  for (const last of [undefined, { type: 'error', code: 'SPEECH_TIMEOUT' }]) {
    const { player, sinks, setPost, requests } = setup();
    setPost(async () => response(start, frame, ...(last ? [last] : [])));
    await player.play('lumi', 'Uma pergunta', true, { requireNatural: true });
    assert.equal(sinks[0].finished, false); assert.equal(sinks[0].closed, true);
    assert.equal(player.getSnapshot().status, 'idle'); assert.match(player.getSnapshot().message, /interrompida antes de terminar/);
    assert.equal(requests.filter(request => request.options?.method === 'DELETE').length, 1);
  }
});

test('a streaming deadline cancels the job while waiting for the next audio frame', async t => {
  const deadline = new AbortController();
  t.mock.method(AbortSignal, 'timeout', (ms: number) => ms === 185000 ? deadline.signal : new AbortController().signal);
  const { player, sinks, setPost, requests } = setup();
  setPost(async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(line(start)); controller.enqueue(line(frame)); },
  }), { headers: { 'Content-Type': 'application/x-ndjson' } }));
  const pending = player.play('lumi', 'Uma pergunta', true, { requireNatural: true }); await tick();
  deadline.abort(new DOMException('Timeout', 'TimeoutError')); await pending;
  assert.equal(sinks[0].closed, true); assert.equal(player.getSnapshot().status, 'idle');
  assert.equal(requests.filter(request => request.options?.method === 'DELETE').length, 1);
});

test('streaming requires both health capabilities and Web Audio, preserving legacy WAV requests', async () => {
  for (const capabilities of [{ fixedVoice: false, streaming: true }, { fixedVoice: true, streaming: false }, { fixedVoice: true, streaming: true }]) {
    const { player, environment, sinks, setPost, requests, blobs } = setup(capabilities);
    if (capabilities.fixedVoice && capabilities.streaming) environment.pcmAudio = undefined;
    setPost(async () => new Response('wav', { headers: { 'Content-Type': 'audio/wav', 'X-Speech-Provider': 'qwen' } }));
    await player.play('lumi', 'Oi!', true, { requireNatural: true });
    assert.equal(JSON.parse(String(requests.find(request => request.options?.method === 'POST')?.options?.body)).stream, undefined);
    assert.equal(sinks.length, 0); assert.equal(blobs.length, 1); player.stop();
  }
});

test('streaming authorization and rate errors remain actionable without another voice', async () => {
  for (const [status, expected] of [[401, /sessão expirou/], [429, /várias tentativas/]] as const) {
    const { player, setPost, sinks } = setup();
    setPost(async () => Response.json({ code: 'ERROR' }, { status }));
    await player.play('lumi', 'Oi!', true, { requireNatural: true });
    assert.equal(sinks.length, 0); assert.equal(player.getSnapshot().status, 'idle');
    assert.match(player.getSnapshot().message, expected);
  }
});

test('voice capabilities are exposed after health and cleared after a failed refresh', async () => {
  const { player, environment } = setup();
  assert.deepEqual(player.getVoiceCapabilities(), { fixedVoice: false, streaming: false });
  await player.prepare();
  assert.deepEqual(player.getVoiceCapabilities(), { fixedVoice: true, streaming: true });
  environment.fetch = async () => { throw new TypeError('Unavailable'); };
  await player.prepare(true);
  assert.deepEqual(player.getVoiceCapabilities(), { fixedVoice: false, streaming: false });
});

test('fixed voice capability is independent of whether that engine supports streaming', async () => {
  const { player } = setup({ fixedVoice: true, streaming: false });
  await player.prepare();
  assert.deepEqual(player.getVoiceCapabilities(), { fixedVoice: true, streaming: false });
});

test('slow-engine PCM remains silent until the end marker and EOF validate the complete speech', async () => {
  const { player, sinks, setPost } = setup();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  setPost(async () => new Response(new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
  }), { headers: { 'Content-Type': 'application/x-ndjson' } }));
  const pending = player.play('lumi', 'Uma resposta nova e completa.', true, { requireNatural: true });
  await tick();
  controller.enqueue(line({ ...start, bufferUntilEnd: true })); controller.enqueue(line(frame)); await tick();
  assert.equal(sinks[0].samples.length, 0); assert.equal(sinks[0].finished, false);
  assert.equal(player.getSnapshot().status, 'loading'); assert.equal(player.getMouthLevel(), 0);
  controller.enqueue(line(frame)); controller.enqueue(line(end)); await tick();
  assert.equal(sinks[0].samples.length, 0, 'the end marker alone must not bypass EOF validation');
  controller.close(); await pending;
  assert.equal(sinks[0].samples.length, 2); assert.equal(sinks[0].finished, true);
  assert.equal(player.getSnapshot().status, 'playing'); sinks[0].events.ended();
  assert.equal(player.getSnapshot().status, 'idle');
});

test('buffered PCM never speaks if the engine reports an error or closes without its end marker', async () => {
  for (const ending of [[], [{ type: 'error', code: 'SPEECH_TIMEOUT' }], [end, frame]]) {
    const { player, sinks, setPost } = setup();
    setPost(async () => response({ ...start, bufferUntilEnd: true }, frame, ...ending));
    await player.play('lumi', 'Uma resposta nova.', true, { requireNatural: true });
    assert.equal(sinks[0].samples.length, 0); assert.equal(sinks[0].finished, false); assert.equal(sinks[0].closed, true);
    assert.equal(player.getSnapshot().status, 'idle'); assert.match(player.getSnapshot().message, /Não consegui preparar/);
  }
});

test('cancelling buffered generation discards all received PCM and cancels its pending job', async () => {
  const { player, sinks, setPost, requests } = setup();
  let cancelled = false;
  setPost(async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(line({ ...start, bufferUntilEnd: true })); controller.enqueue(line(frame)); },
    cancel() { cancelled = true; },
  }), { headers: { 'Content-Type': 'application/x-ndjson' } }));
  const pending = player.play('lumi', 'Uma resposta nova.', true, { requireNatural: true }); await tick();
  player.stop(); await pending;
  assert.equal(sinks[0].samples.length, 0); assert.equal(sinks[0].closed, true); assert.equal(cancelled, true);
  assert.equal(requests.filter(request => request.options?.method === 'DELETE').length, 1);
});

test('buffered completed speech preserves autoplay recovery without fetching or synthesizing again', async () => {
  const { player, sinks, setPost, requests } = setup({ blocked: true });
  setPost(async () => response({ ...start, bufferUntilEnd: true }, frame, frame, end));
  await player.play('lumi', 'Uma resposta nova.', true, { requireNatural: true });
  assert.equal(player.getSnapshot().status, 'ready'); assert.equal(sinks[0].samples.length, 2); assert.equal(sinks[0].finished, true);
  assert.equal(player.getMouthLevel(), 0);
  await player.resume('lumi');
  assert.equal(player.getSnapshot().status, 'playing');
  assert.equal(requests.filter(request => request.options?.method === 'POST').length, 1);
  player.stop();
});

test('fixed voice keeps the complete prepared-text cache key in WAV fallback without Web Audio or streaming', async () => {
  const text = 'Olá! Eu sou a Lumi, sua companheira de descobertas. Vamos aprender uma palavra nova e explorar a nossa ilha juntos?';
  for (const streaming of [true, false]) {
    const { player, environment, setPost, requests, blobs, sinks } = setup({ fixedVoice: true, streaming });
    if (streaming) environment.pcmAudio = undefined;
    setPost(async () => new Response('prepared wav', { headers: { 'Content-Type': 'audio/wav', 'X-Speech-Provider': 'qwen' } }));
    await player.play('lumi', text, true, { requireNatural: true, profile: 'conversation' });
    const posts = requests.filter(request => request.options?.method === 'POST');
    assert.equal(posts.length, 1);
    const payload = JSON.parse(String(posts[0].options?.body));
    assert.equal(payload.text, text); assert.equal(payload.stream, undefined);
    assert.equal(blobs.length, 1); assert.equal(sinks.length, 0);
    assert.equal(player.getSnapshot().status, 'playing');
    player.stop();
  }
});
