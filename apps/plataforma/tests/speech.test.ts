import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechPlayer, conversationSpeechPhrases, qwenSpeechChunks, wavMouthEnvelope, selectPortugueseVoice, speechPhrases, speechSourceLabel, isLoopbackHostname, type SpeechEnvironment } from '../lib/speech';

function voice(name: string, lang = 'pt-BR', localService = true): SpeechSynthesisVoice {
  return { name, lang, localService, default: false, voiceURI: name };
}
function setup({ neural = false, kokoro = false, qwen = false, localServer = false, offline = false, voices = [voice('Microsoft Francisca Natural')], blocked = false } = {}) {
  class Synthesis extends EventTarget {
    phrases: SpeechSynthesisUtterance[] = [];
    cancelled = 0;
    getVoices = () => voices;
    cancel = () => { this.cancelled++; };
    speak = (phrase: SpeechSynthesisUtterance) => { this.phrases.push(phrase); phrase.onstart?.call(phrase, {} as SpeechSynthesisEvent); };
  }
  class Audio {
    currentTime = 0; paused = true; ended = false;
    onpause: (() => void) | null = null; onwaiting: (() => void) | null = null;
    src = ''; onended: (() => void) | null = null; onerror: (() => void) | null = null; onplaying: (() => void) | null = null;
    pauses = 0; attempts = 0;
    async play() {
      this.attempts++;
      if (blocked && this.attempts === 1) throw new DOMException('Gesture needed', 'NotAllowedError');
      this.paused = false; this.onplaying?.();
    }
    pause() { this.pauses++; this.paused = true; this.onpause?.(); }
    removeAttribute(name: string) { if (name === 'src') this.src = ''; }
    load() {}
  }
  const synthesis = new Synthesis(), audios: Audio[] = [], revoked: string[] = [], blobTypes: string[] = [];
  const requests: { url: string; options?: RequestInit }[] = [];
  const environment: SpeechEnvironment = {
    synthesis: synthesis as unknown as SpeechSynthesis,
    utterance: text => ({ text } as SpeechSynthesisUtterance),
    audio: () => { const audio = new Audio(); audios.push(audio); return audio as unknown as HTMLAudioElement; },
    fetch: async (url, options) => {
      requests.push({ url: String(url), options });
      return options?.method === 'POST'
        ? qwen ? qwenAudio() : new Response('audio', { headers: { 'Content-Type': kokoro ? 'audio/wav' : 'audio/mpeg', 'X-Speech-Provider': kokoro ? 'kokoro' : 'openai' } })
        : Response.json({ ok: true, mode: neural || kokoro || qwen ? 'neural' : 'browser', provider: qwen ? 'qwen' : kokoro ? 'kokoro' : 'openai' });
    },
    online: () => !offline,
    localServer: () => localServer,
    createURL: blob => { blobTypes.push(blob.type); return 'blob:test-audio'; },
    revokeURL: url => { revoked.push(url); },
  };
  return { environment, player: new SpeechPlayer(environment), synthesis, audios, requests, revoked, blobTypes };
}

function speechPayload(body: string) {
  const payload = JSON.parse(body) as Record<string, unknown>;
  assert.match(String(payload.requestId), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  delete payload.requestId;
  return payload;
}
function mockPosts(environment: SpeechEnvironment, handler: SpeechEnvironment['fetch']) {
  const original = environment.fetch;
  environment.fetch = (url, options) => options?.method === 'POST' ? handler(url, options) : original(url, options);
}

test('prioritizes natural Brazilian Portuguese voices and local voices offline', () => {
  const us = voice('Natural Voice', 'en-US'), pt = voice('Natural Joana', 'pt-PT');
  const basic = voice('Maria'), natural = voice('Francisca Natural', 'pt-BR', false);
  assert.equal(selectPortugueseVoice([us, pt, basic, natural]), natural);
  assert.equal(selectPortugueseVoice([us, pt, basic, natural], true), basic);
  assert.equal(selectPortugueseVoice([us]), undefined);
  assert.equal(selectPortugueseVoice([natural], true), undefined);
});

test('phrases keep accents, syllables, punctuation and all words in long text', () => {
  const text = 'Oi! Vamos ler BA-NA-NA? Ótimo. ' + 'Uma palavra com emoção. '.repeat(40) + 'Fim!';
  const phrases = speechPhrases(text);
  assert.equal(phrases.join(' '), text);
  assert.ok(phrases.every(phrase => phrase.length <= 240));
  assert.equal(phrases[1], 'Vamos ler BA-NA-NA?');
  const long = Array.from({ length: 150 }, (_, index) => 'palavra' + index).join(' ');
  assert.equal(speechPhrases(long).join(' '), long);
  assert.ok(speechPhrases(long).length > 1);
});

test('muting performs no network or speech work and gives an actionable message', async () => {
  const { player, requests, synthesis } = setup();
  await player.play('button', 'Olá', false);
  assert.equal(requests.length, 0);
  assert.equal(synthesis.phrases.length, 0);
  assert.match(player.getSnapshot().message, /Ative o som/);
});

test('device speech waits for loaded voices, uses natural pace, and stop cancels next sentence', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const voices: SpeechSynthesisVoice[] = [];
  const { player, synthesis } = setup({ offline: true, voices });
  const pending = player.play('a', 'Oi! Vamos aprender?');
  assert.equal(synthesis.phrases.length, 0);
  voices.push(voice('Luciana Enhanced'));
  synthesis.dispatchEvent(new Event('voiceschanged'));
  await pending;
  const phrase = synthesis.phrases[0];
  assert.equal(phrase.voice, voices[0]);
  assert.equal(phrase.lang, 'pt-BR');
  assert.equal(phrase.rate, .94);
  assert.equal(player.getSnapshot().source, 'browser');
  phrase.onend?.call(phrase, {} as SpeechSynthesisEvent);
  player.stop('another-button');
  assert.equal(player.getSnapshot().status, 'playing');
  player.stop('a');
  t.mock.timers.tick(1000);
  assert.equal(synthesis.phrases.length, 1);
  assert.equal(player.getSnapshot().status, 'idle');
  assert.equal(synthesis.cancelled, 1);
});

test('neural speech sends only requested text and releases audio at completion', async () => {
  const { player, synthesis, requests, audios, revoked } = setup({ neural: true });
  await player.play('a', 'Oi! Eu sou a Lumi.');
  assert.deepEqual(speechPayload(requests[1].options?.body as string), { text: 'Oi! Eu sou a Lumi.' });
  assert.equal(player.getSnapshot().source, 'neural');
  assert.equal(player.getSnapshot().status, 'playing');
  assert.equal(synthesis.phrases.length, 0);
  audios[0].onended?.();
  assert.equal(player.getSnapshot().status, 'idle');
  assert.equal(audios[0].src, '');
  assert.deepEqual(revoked, ['blob:test-audio']);
});

test('a late neural response cannot speak after a newer reading has started', async () => {
  const { player, environment, requests, audios } = setup({ neural: true });
  await player.prepare();
  const original = environment.fetch;
  let resolveOld!: (response: Response) => void;
  let oldSignal: AbortSignal | null | undefined;
  environment.fetch = async (url, options) => {
    if (String(options?.body).includes('Primeira')) {
      oldSignal = options?.signal;
      return new Promise<Response>(resolve => { resolveOld = resolve; });
    }
    return original(url, options);
  };
  const old = player.play('old', 'Primeira leitura');
  await player.play('new', 'Nova leitura');
  assert.equal(oldSignal?.aborted, true);
  resolveOld(new Response('old audio', { headers: { 'Content-Type': 'audio/mpeg' } }));
  await old;
  assert.equal(audios.length, 1);
  assert.equal(requests.length, 2);
  assert.equal(player.getSnapshot().owner, 'new');
  player.stop();
});

test('provider outage falls back to Portuguese device speech', async () => {
  const { player, environment, synthesis } = setup({ neural: true });
  await player.prepare();
  environment.fetch = async () => Response.json({ code: 'VOICE_UNAVAILABLE' }, { status: 503 });
  await player.play('a', 'Vamos descobrir?');
  assert.equal(synthesis.phrases.length, 1);
  assert.equal(player.getSnapshot().source, 'browser');
  player.stop();
});

test('mobile autoplay block offers a second tap without generating the audio again', async () => {
  const { player, requests, audios } = setup({ neural: true, blocked: true });
  await player.play('a', 'Olá!');
  assert.equal(player.getSnapshot().status, 'ready');
  assert.match(player.getSnapshot().message, /Tocar áudio/);
  await player.resume('a');
  assert.equal(player.getSnapshot().status, 'playing');
  assert.equal(audios[0].attempts, 2);
  assert.equal(requests.length, 2);
  player.stop();
});

test('stopping during voice loading prevents late playback', async () => {
  const voices: SpeechSynthesisVoice[] = [];
  const { player, synthesis } = setup({ offline: true, voices });
  const pending = player.play('a', 'Olá!');
  player.stop('a');
  voices.push(voice('Maria'));
  synthesis.dispatchEvent(new Event('voiceschanged'));
  await pending;
  assert.equal(synthesis.phrases.length, 0);
  assert.equal(player.getSnapshot().status, 'idle');
});

test('missing Portuguese voice yields a visible explanation instead of wrong-language playback', async () => {
  const { player, synthesis } = setup({ offline: true, voices: [voice('English', 'en-US')] });
  await player.play('a', 'Olá!');
  assert.equal(synthesis.phrases.length, 0);
  assert.equal(player.getSnapshot().status, 'idle');
  assert.match(player.getSnapshot().message, /voz em português/);
});


test('older browsers without Intl.Segmenter still preserve the spoken text', () => {
  const original = Intl.Segmenter;
  try {
    Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true, writable: true });
    assert.deepEqual(speechPhrases('Olá! Leia BA-NA-NA. Vamos?'), ['Olá!', 'Leia BA-NA-NA.', 'Vamos?']);
  } finally { Object.defineProperty(Intl, 'Segmenter', { value: original, configurable: true, writable: true }); }
});

test('a corrupt audio playback falls back once and releases its blob', async () => {
  const { player, audios, synthesis, revoked } = setup({ neural: true });
  await player.play('a', 'Uma pista!');
  const fail = audios[0].onerror;
  fail?.(); fail?.();
  assert.equal(synthesis.phrases.length, 1);
  assert.equal(player.getSnapshot().source, 'browser');
  assert.deepEqual(revoked, ['blob:test-audio']);
  player.stop();
});

test('an unsupported MP3 decoder falls back to device speech', async () => {
  const { player, environment, synthesis, revoked } = setup({ neural: true });
  const originalAudio = environment.audio;
  environment.audio = () => {
    const audio = originalAudio();
    audio.play = async () => { throw new DOMException('Unsupported', 'NotSupportedError'); };
    return audio;
  };
  await player.play('a', 'Uma pista!');
  assert.equal(synthesis.phrases.length, 1);
  assert.equal(player.getSnapshot().source, 'browser');
  assert.deepEqual(revoked, ['blob:test-audio']);
  player.stop();
});

test('loopback detection includes IPv4, IPv6 and localhost without accepting remote lookalikes', () => {
  for (const hostname of ['localhost', 'LOCALHOST', '127.0.0.1', '::1', '[::1]']) assert.ok(isLoopbackHostname(hostname));
  for (const hostname of ['localhost.example.com', '127.0.0.1.example.com', '192.168.0.2', 'example.com']) assert.equal(isLoopbackHostname(hostname), false);
});

test('Dora plays WAV from the local app without internet and discloses its actual provider', async t => {
  const timeouts: number[] = [];
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { timeouts.push(ms); return new AbortController().signal; });
  const { player, synthesis, requests, audios, revoked, blobTypes } = setup({ kokoro: true, offline: true, localServer: true });
  await player.play('dora', 'Olá! Vamos aprender juntos?');
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.url === '/api/speech'));
  assert.deepEqual(speechPayload(requests[1].options?.body as string), { text: 'Olá! Vamos aprender juntos?' });
  assert.equal(player.getSnapshot().source, 'kokoro');
  assert.equal(player.getSnapshot().status, 'playing');
  assert.equal(speechSourceLabel(player.getSnapshot().source), 'Dora · voz local · gerada por IA');
  assert.deepEqual(blobTypes, ['audio/wav']);
  assert.deepEqual(timeouts, [5000, 65000]);
  assert.equal(synthesis.phrases.length, 0);
  audios[0].onended?.();
  assert.deepEqual(revoked, ['blob:test-audio']);
  assert.equal(player.getSnapshot().status, 'idle');
});

test('a remote app stays with its local device voice when offline', async () => {
  const { player, requests, synthesis } = setup({ kokoro: true, offline: true });
  await player.play('a', 'Olá!');
  assert.equal(requests.length, 0);
  assert.equal(synthesis.phrases.length, 1);
  assert.equal(player.getSnapshot().source, 'browser');
  player.stop();
});

test('a failed Kokoro service falls back to the device without contacting an external provider', async () => {
  const { player, environment, synthesis, requests } = setup({ kokoro: true, offline: true, localServer: true });
  await player.prepare();
  environment.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return Response.json({ code: 'VOICE_UNAVAILABLE' }, { status: 503 });
  };
  await player.play('a', 'Uma pista para você.');
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.url === '/api/speech'));
  assert.equal(synthesis.phrases.length, 1);
  assert.equal(player.getSnapshot().source, 'browser');
  player.stop();
});

test('the Dora label follows the audio response header even if capabilities changed', async () => {
  const { player, environment } = setup({ kokoro: true });
  await player.prepare();
  environment.fetch = async () => new Response('audio', {
    headers: { 'Content-Type': 'audio/mpeg', 'X-Speech-Provider': 'openai' },
  });
  await player.play('a', 'Vamos ler?');
  assert.equal(player.getSnapshot().source, 'neural');
  assert.equal(speechSourceLabel(player.getSnapshot().source), 'Voz gerada por IA');
  player.stop();
});

test('Dora retains its provider after mobile playback needs a second tap', async () => {
  const { player, requests } = setup({ kokoro: true, blocked: true });
  await player.play('a', 'Olá!');
  assert.equal(player.getSnapshot().status, 'ready');
  assert.equal(player.getSnapshot().source, 'kokoro');
  await player.resume('a');
  assert.equal(player.getSnapshot().status, 'playing');
  assert.equal(player.getSnapshot().source, 'kokoro');
  assert.equal(requests.length, 2);
  player.stop();
});

test('OpenAI retains its shorter timeout', async t => {
  const timeouts: number[] = [];
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { timeouts.push(ms); return new AbortController().signal; });
  const { player } = setup({ neural: true });
  await player.play('a', 'Olá!');
  assert.deepEqual(timeouts, [5000, 18000]);
  player.stop();
});

test('a local voice service becomes discoverable five seconds after an unavailable check', async t => {
  let now = 10000;
  t.mock.method(Date, 'now', () => now);
  const { player, environment, requests } = setup({ localServer: true });
  await player.prepare();
  assert.equal(requests.length, 1);
  const original = environment.fetch;
  environment.fetch = async (url, options) => {
    if (options?.method !== 'POST') {
      requests.push({ url: String(url), options });
      return Response.json({ mode: 'neural', provider: 'kokoro' });
    }
    return original(url, options);
  };
  now += 4999;
  await player.prepare();
  assert.equal(requests.length, 1);
  now += 1;
  await player.prepare();
  assert.equal(requests.length, 2);
  player.stop();
});

function pcmWav(samples: number[], sampleRate = 8000): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
  const text = (offset: number, value: string) => new Uint8Array(buffer, offset, value.length).set(new TextEncoder().encode(value));
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true));
  return buffer;
}

test('PCM mouth envelopes retain silence, respond to loudness and reject malformed audio', () => {
  const samples = [...Array(160).fill(0), ...Array(160).fill(.08), ...Array(160).fill(.4), ...Array(160).fill(0)];
  const envelope = wavMouthEnvelope(pcmWav(samples)); assert.ok(envelope);
  assert.equal(envelope.frameDuration, .02); assert.equal(envelope.levels.length, 4);
  assert.equal(envelope.levels[0], 0); assert.equal(envelope.levels[3], 0);
  assert.ok(envelope.levels[1] > 0 && envelope.levels[1] < envelope.levels[2]);
  assert.ok([...envelope.levels].every(level => Number.isFinite(level) && level >= 0 && level <= 1));
  assert.equal(wavMouthEnvelope(new ArrayBuffer(12)), undefined);
  const invalid = pcmWav(samples); new DataView(invalid).setUint32(40, 999999, true);
  assert.equal(wavMouthEnvelope(invalid), undefined);
});

test('Dora mouth levels follow the audio clock, stay silent when paused and emit no frame updates', async () => {
  const { player, environment, audios } = setup({ kokoro: true });
  const original = environment.fetch;
  environment.fetch = async (url, options) => options?.method === 'POST' ? new Response(pcmWav([...Array(320).fill(0), ...Array(640).fill(.3), ...Array(320).fill(0)]), { headers: { 'Content-Type': 'audio/wav', 'X-Speech-Provider': 'kokoro' } }) : original(url, options);
  assert.equal(player.getMouthLevel(), 0); await player.play('lumi:test', 'Uma pista.');
  await new Promise<void>(resolve => setImmediate(resolve));
  const audio = audios[0]; audio.currentTime = .02; assert.equal(player.getMouthLevel(), 0);
  audio.currentTime = .06; assert.ok(player.getMouthLevel() > .5);
  let updates = 0; const unsubscribe = player.subscribe(() => updates++);
  for (let index = 0; index < 60; index++) player.getMouthLevel();
  assert.equal(updates, 0);
  audio.paused = true; assert.equal(player.getMouthLevel(), 0);
  audio.paused = false; audio.onwaiting?.(); assert.equal(player.getMouthLevel(), 0);
  audio.onplaying?.(); assert.ok(player.getMouthLevel() > .5);
  audio.currentTime = .14; assert.equal(player.getMouthLevel(), 0);
  audio.currentTime = .06; player.stop(); assert.equal(player.getMouthLevel(), 0); unsubscribe();
});

test('blocked autoplay never opens the mouth and a second tap uses the same envelope', async () => {
  const { player, environment, audios } = setup({ kokoro: true, blocked: true });
  const original = environment.fetch;
  environment.fetch = async (url, options) => options?.method === 'POST' ? new Response(pcmWav(Array(800).fill(.2)), { headers: { 'Content-Type': 'audio/wav' } }) : original(url, options);
  await player.play('lumi:test', 'Olá.'); await new Promise<void>(resolve => setImmediate(resolve));
  audios[0].currentTime = .02; assert.equal(player.getSnapshot().status, 'ready'); assert.equal(player.getMouthLevel(), 0);
  await player.resume('lumi:test'); assert.ok(player.getMouthLevel() > 0); player.stop();
});

test('optional decoding never blocks playback and cancellation invalidates stale analysis', async () => {
  const { player, environment, audios } = setup({ neural: true });
  let resolveDecode!: (value: { levels: Float32Array; frameDuration: number }) => void;
  let signal: AbortSignal | undefined; let decodes = 0;
  environment.decodeMouthEnvelope = (_buffer, nextSignal) => {
    decodes++; signal = nextSignal;
    return decodes === 1 ? new Promise(resolve => { resolveDecode = resolve; }) : Promise.resolve({ levels: new Float32Array([.2, .2]), frameDuration: .02 });
  };
  await player.play('old', 'Antes.'); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(player.getSnapshot().status, 'playing'); assert.equal(player.getMouthLevel(), 0);
  const oldSignal = signal; await player.play('new', 'Depois.'); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(oldSignal?.aborted, true); audios[1].currentTime = .01;
  assert.ok(Math.abs(player.getMouthLevel() - .2) < .0001);
  resolveDecode({ levels: new Float32Array([1, 1]), frameDuration: .02 }); await new Promise<void>(resolve => setImmediate(resolve));
  assert.ok(Math.abs(player.getMouthLevel() - .2) < .0001); player.stop(); assert.equal(signal?.aborted, true);
});

test('decoder errors keep audio playing and invalid analysis values stay bounded', async () => {
  const { player, environment } = setup({ neural: true });
  environment.decodeMouthEnvelope = async () => { throw new Error('Optional decoder unavailable'); };
  await player.play('a', 'Olá.'); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(player.getSnapshot().status, 'playing'); assert.equal(player.getMouthLevel(), 0); player.stop();
  const other = setup({ neural: true }); other.environment.decodeMouthEnvelope = async () => ({ levels: new Float32Array([NaN, Infinity, -4, 8]), frameDuration: .02 });
  await other.player.play('b', 'Olá.'); await new Promise<void>(resolve => setImmediate(resolve));
  for (const time of [0, .01, .02, .04, .06, .07, .5, -1]) {
    other.audios[0].currentTime = time; const value = other.player.getMouthLevel(); assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
  }
  other.player.stop();
});

test('device mouth animation uses bounded boundary pulses and closes between sentences and on cancellation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { player, environment, synthesis } = setup({ offline: true });
  let now = 1000; environment.now = () => now;
  await player.play('lumi:test', 'Oi! Vamos ler?'); const phrase = synthesis.phrases[0];
  now += 50; assert.ok(player.getMouthLevel() > 0);
  phrase.onboundary?.call(phrase, { charIndex: 0, charLength: 2 } as SpeechSynthesisEvent);
  now += 65; assert.ok(player.getMouthLevel() > .6);
  phrase.onpause?.call(phrase, {} as SpeechSynthesisEvent); assert.equal(player.getMouthLevel(), 0);
  phrase.onresume?.call(phrase, {} as SpeechSynthesisEvent); now += 50; assert.ok(player.getMouthLevel() > 0);
  const oldBoundary = phrase.onboundary;
  phrase.onend?.call(phrase, {} as SpeechSynthesisEvent); assert.equal(player.getMouthLevel(), 0);
  t.mock.timers.tick(160); assert.equal(synthesis.phrases.length, 2); now += 50; assert.ok(player.getMouthLevel() > 0);
  player.stop(); oldBoundary?.call(phrase, { charIndex: 0, charLength: 2 } as SpeechSynthesisEvent); assert.equal(player.getMouthLevel(), 0);
  assert.equal(phrase.onboundary, null);
});
test('conversation options reach the speech endpoint without sending client quality flags', async () => {
  const { player, requests, synthesis } = setup({ kokoro: true });
  await player.play('lumi:test', 'Oi! Vamos descobrir?', true, { profile: 'conversation', pace: 'calm', requireNatural: true });
  assert.deepEqual(speechPayload(requests.find(request => request.options?.method === 'POST')!.options!.body as string), { text: 'Oi! Vamos descobrir?', profile: 'conversation', pace: 'calm' });
  assert.equal(synthesis.phrases.length, 0); assert.equal(player.getSnapshot().source, 'kokoro'); player.stop();
});

test('a failed health check cannot force natural Lumi speech onto the device voice', async t => {
  const timeouts: number[] = [];
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { timeouts.push(ms); return new AbortController().signal; });
  const { player, environment, synthesis, requests } = setup({ localServer: true });
  const original = environment.fetch;
  environment.fetch = async (url, options) => {
    if (options?.method !== 'POST') { requests.push({ url: String(url), options }); throw new DOMException('Health timed out', 'TimeoutError'); }
    return original(url, options);
  };
  await player.play('lumi:test', 'Uma pista.', true, { profile: 'conversation', requireNatural: true });
  assert.equal(requests.length, 2); assert.deepEqual(timeouts, [5000, 185000]);
  assert.equal(synthesis.phrases.length, 0); assert.equal(player.getSnapshot().status, 'playing'); player.stop();
});

test('a busy known Dora service gets one retry and never silently switches Lumi to a device voice', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { player, environment, synthesis } = setup({ kokoro: true });
  await player.prepare(); let attempts = 0;
  mockPosts(environment, async () => { attempts++; return Response.json({ code: 'VOICE_UNAVAILABLE' }, { status: 503 }); });
  const pending = player.play('lumi:test', 'Minha pista.', true, { requireNatural: true });
  await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(attempts, 1);
  t.mock.timers.tick(350); await pending;
  assert.equal(attempts, 2); assert.equal(synthesis.phrases.length, 0); assert.equal(player.getSnapshot().status, 'idle');
  assert.match(player.getSnapshot().message, /Tente novamente ou escolha a voz do dispositivo/); player.stop();
});

test('a successful short retry keeps Dora and shares the original deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { player, environment, synthesis } = setup({ kokoro: true }); await player.prepare();
  const signals: (AbortSignal | null | undefined)[] = []; let attempts = 0;
  mockPosts(environment, async (_url, options) => {
    attempts++; signals.push(options?.signal);
    return attempts === 1 ? new Response('', { status: 503 }) : new Response('audio', { headers: { 'Content-Type': 'audio/wav', 'X-Speech-Provider': 'kokoro' } });
  });
  const pending = player.play('lumi:test', 'Minha pista.', true, { requireNatural: true });
  await new Promise<void>(resolve => setImmediate(resolve)); t.mock.timers.tick(350); await pending;
  assert.equal(attempts, 2); assert.equal(signals[0], signals[1]); assert.equal(player.getSnapshot().source, 'kokoro');
  assert.equal(synthesis.phrases.length, 0); player.stop();
});

test('cancelling during the retry delay prevents another request and any fallback audio', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { player, environment, synthesis } = setup({ kokoro: true }); await player.prepare(); let attempts = 0;
  mockPosts(environment, async () => { attempts++; return new Response('', { status: 503 }); });
  const pending = player.play('lumi:test', 'Uma pista.', true, { requireNatural: true });
  await new Promise<void>(resolve => setImmediate(resolve)); player.stop(); await pending; t.mock.timers.tick(1000);
  assert.equal(attempts, 1); assert.equal(synthesis.phrases.length, 0); assert.equal(player.getSnapshot().status, 'idle');
});

test('authorization and rate limit responses are never retried or spoken with a fallback voice', async () => {
  for (const status of [401, 403, 429]) {
    const { player, environment, synthesis } = setup({ kokoro: true }); await player.prepare(); let attempts = 0;
    mockPosts(environment, async () => { attempts++; return new Response('', { status }); });
    await player.play('lumi:test', 'Uma pista.', true, { requireNatural: true });
    assert.equal(attempts, 1); assert.equal(synthesis.phrases.length, 0); assert.equal(player.getSnapshot().status, 'idle'); player.stop();
  }
});

test('explicit device playback is network-free and groups short conversation sentences', async () => {
  const { player, synthesis, requests } = setup({ kokoro: true });
  await player.playOnDevice('lumi:test', 'Oi! Eu sou a Lumi. Vamos ler BA-NA-NA?', true, { profile: 'conversation', pace: 'calm', requireNatural: true });
  assert.equal(requests.length, 0); assert.equal(synthesis.phrases.length, 1);
  assert.equal(synthesis.phrases[0].text, 'Oi! Eu sou a Lumi. Vamos ler BA-NA-NA?');
  assert.equal(synthesis.phrases[0].rate, .92); assert.equal(synthesis.phrases[0].pitch, 1); assert.equal(player.getSnapshot().source, 'browser'); player.stop();
});

test('natural-only speech while offline preserves text without automatically speaking on the device', async () => {
  const { player, synthesis, requests } = setup({ offline: true });
  await player.play('lumi:test', 'Uma pista.', true, { requireNatural: true });
  assert.equal(requests.length, 0); assert.equal(synthesis.phrases.length, 0); assert.equal(player.getSnapshot().status, 'idle');
  assert.match(player.getSnapshot().message, /voz da Lumi está indisponível/); player.stop();
});

test('natural-only playback preserves mobile second-tap recovery and does not resynthesize', async () => {
  const { player, requests, synthesis } = setup({ kokoro: true, blocked: true });
  await player.play('lumi:test', 'Uma pista.', true, { requireNatural: true, profile: 'conversation', pace: 'natural' });
  assert.equal(player.getSnapshot().status, 'ready'); assert.equal(synthesis.phrases.length, 0);
  await player.resume('lumi:test'); assert.equal(player.getSnapshot().status, 'playing');
  assert.equal(requests.filter(request => request.options?.method === 'POST').length, 1); player.stop();
});

test('natural-only playback errors close the mouth and report recovery instead of changing timbre', async () => {
  const { player, audios, synthesis, revoked } = setup({ kokoro: true });
  await player.play('lumi:test', 'Uma pista.', true, { requireNatural: true });
  audios[0].onerror?.();
  assert.equal(synthesis.phrases.length, 0); assert.equal(player.getSnapshot().status, 'idle'); assert.equal(player.getMouthLevel(), 0);
  assert.match(player.getSnapshot().message, /voz da Lumi/); assert.deepEqual(revoked, ['blob:test-audio']); player.stop();
});

test('conversation grouping preserves all words and punctuation within bounded utterances', () => {
  const text = 'Oi! Vamos ler BA-NA-NA? Ótimo. ' + 'Uma palavra com emoção. '.repeat(30) + 'Fim!';
  const conversational = conversationSpeechPhrases(text), reading = speechPhrases(text);
  assert.equal(conversational.join(' '), text); assert.ok(conversational.every(phrase => phrase.length <= 240));
  assert.ok(conversational.length < reading.length); assert.match(conversational[0], /^Oi! Vamos ler BA-NA-NA\? Ótimo\./);
});

function qwenAudio() {
  const samples = [...Array(480).fill(0), ...Array(1920).fill(.25), ...Array(480).fill(0)];
  return new Response(pcmWav(samples, 24000), {
    headers: { 'Content-Type': 'audio/wav', 'X-Speech-Provider': 'qwen', 'X-Speech-Voice': 'lumi', 'Cache-Control': 'no-store' },
  });
}

test('Qwen speaks local WAV offline with its own deadline, label, options and synchronized mouth', async t => {
  const timeouts: number[] = [];
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { timeouts.push(ms); return new AbortController().signal; });
  const { player, requests, synthesis, audios, blobTypes, revoked } = setup({ qwen: true, offline: true, localServer: true });
  await player.play('lumi:qwen', 'Olá! Vamos descobrir?', true, { profile: 'conversation', pace: 'calm', requireNatural: true });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(timeouts, [5000, 185000]);
  assert.equal(requests.length, 2); assert.ok(requests.every(request => request.url === '/api/speech'));
  assert.deepEqual(speechPayload(requests[1].options?.body as string), { text: 'Olá! Vamos descobrir?', profile: 'conversation', pace: 'calm' });
  assert.equal(player.getSnapshot().source, 'qwen'); assert.equal(player.getSnapshot().status, 'playing');
  assert.equal(speechSourceLabel(player.getSnapshot().source), 'Lumi · Qwen · voz local gerada por IA');
  assert.deepEqual(blobTypes, ['audio/wav']); assert.equal(synthesis.phrases.length, 0);
  audios[0].currentTime = 0; assert.equal(player.getMouthLevel(), 0);
  audios[0].currentTime = .04; assert.ok(player.getMouthLevel() > .5 && player.getMouthLevel() <= 1);
  audios[0].onwaiting?.(); assert.equal(player.getMouthLevel(), 0);
  audios[0].onplaying?.(); assert.ok(player.getMouthLevel() > .5);
  audios[0].onended?.(); assert.equal(player.getMouthLevel(), 0);
  assert.deepEqual(revoked, ['blob:test-audio']); assert.equal(player.getSnapshot().status, 'idle');
});

test('an unavailable preferred Qwen provider sets the natural request deadline without announcing readiness', async t => {
  for (const status of [200, 503]) {
    const timeouts: number[] = [];
    const timeoutMock = t.mock.method(AbortSignal, 'timeout', (ms: number) => { timeouts.push(ms); return new AbortController().signal; });
    const { player, environment, requests, synthesis, audios } = setup({ localServer: true });
    environment.fetch = async (url, options) => {
      requests.push({ url: String(url), options });
      if (options?.method !== 'POST') return Response.json({ mode: 'browser', preferredProvider: 'qwen' }, { status });
      assert.equal(player.getSnapshot().status, 'loading'); assert.equal(player.getSnapshot().source, null);
      return qwenAudio();
    };
    await player.prepare(); assert.equal(player.getSnapshot().status, 'idle'); assert.equal(audios.length, 0);
    await player.play('lumi:qwen', 'Uma pista.', true, { requireNatural: true });
    assert.deepEqual(timeouts, [5000, 5000, 185000]);
    assert.equal(synthesis.phrases.length, 0); assert.equal(player.getSnapshot().source, 'qwen');
    assert.equal(requests.filter(request => request.options?.method === 'POST').length, 1);
    player.stop(); timeoutMock.mock.restore();
  }
});

test('a preferred Qwen provider in an unavailable health response does not make default calls assume it is ready', async () => {
  const { player, environment, synthesis } = setup({ localServer: true }); let posts = 0;
  environment.fetch = async (_url, options) => {
    if (options?.method === 'POST') { posts++; return qwenAudio(); }
    return Response.json({ mode: 'neural', provider: 'qwen', preferredProvider: 'qwen' }, { status: 503 });
  };
  await player.prepare(); await player.play('reading', 'Uma pista.');
  assert.equal(posts, 0); assert.equal(synthesis.phrases.length, 1); assert.equal(player.getSnapshot().source, 'browser'); player.stop();
});

test('a failed later health probe uses the full deadline for an unknown local provider', async t => {
  const timeouts: number[] = [];
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { timeouts.push(ms); return new AbortController().signal; });
  const { player, environment, synthesis } = setup({ qwen: true, localServer: true }); await player.prepare();
  environment.fetch = async (_url, options) => {
    if (options?.method !== 'POST') throw new DOMException('Health timeout', 'TimeoutError');
    return qwenAudio();
  };
  await player.prepare(true); await player.play('lumi:qwen', 'Uma pista.', true, { requireNatural: true });
  assert.equal(timeouts.at(-1), 185000); assert.equal(player.getSnapshot().source, 'qwen'); assert.equal(synthesis.phrases.length, 0); player.stop();
});

test('a busy Qwen service retries once using the same 185-second request deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const timeouts: number[] = [];
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { timeouts.push(ms); return new AbortController().signal; });
  const { player, environment, synthesis } = setup({ qwen: true }); await player.prepare();
  const signals: (AbortSignal | null | undefined)[] = [];
  mockPosts(environment, async (_url, options) => {
    signals.push(options?.signal);
    return signals.length === 1 ? Response.json({ code: 'VOICE_UNAVAILABLE' }, { status: 503 }) : qwenAudio();
  });
  const pending = player.play('lumi:qwen', 'Minha pista.', true, { requireNatural: true });
  await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(signals.length, 1);
  t.mock.timers.tick(350); await pending;
  assert.equal(signals.length, 2); assert.equal(signals[0], signals[1]); assert.deepEqual(timeouts, [5000, 5000, 185000]);
  assert.equal(player.getSnapshot().source, 'qwen'); assert.equal(synthesis.phrases.length, 0); player.stop();
});

test('persistent Qwen failure stops after one retry and keeps natural-only speech off the device', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { player, environment, synthesis, audios } = setup({ qwen: true }); await player.prepare(); let attempts = 0;
  mockPosts(environment, async () => { attempts++; return new Response('', { status: 503 }); });
  const pending = player.play('lumi:qwen', 'Minha pista.', true, { requireNatural: true });
  await new Promise<void>(resolve => setImmediate(resolve)); t.mock.timers.tick(350); await pending; t.mock.timers.tick(1000);
  assert.equal(attempts, 2); assert.equal(audios.length, 0); assert.equal(synthesis.phrases.length, 0);
  assert.equal(player.getSnapshot().status, 'idle'); assert.match(player.getSnapshot().message, /Tente novamente/); player.stop();
});

test('cancelling a Qwen retry clears its timer and prevents any later request or audio', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { player, environment, audios, synthesis } = setup({ qwen: true }); await player.prepare(); let attempts = 0;
  mockPosts(environment, async () => { attempts++; return new Response('', { status: 503 }); });
  const pending = player.play('lumi:qwen', 'Uma pista.', true, { requireNatural: true });
  await new Promise<void>(resolve => setImmediate(resolve)); player.stop('lumi:qwen'); await pending; t.mock.timers.tick(1000);
  assert.equal(attempts, 1); assert.equal(audios.length, 0); assert.equal(synthesis.phrases.length, 0); assert.equal(player.getSnapshot().owner, null);
});

test('a late Qwen response cannot replace a newer voice after cancellation', async () => {
  const { player, environment, audios, synthesis } = setup({ qwen: true }); await player.prepare();
  let resolveOld!: (response: Response) => void; let oldSignal: AbortSignal | null | undefined;
  mockPosts(environment, async (_url, options) => {
    if (String(options?.body).includes('Primeira')) { oldSignal = options?.signal; return new Promise<Response>(resolve => { resolveOld = resolve; }); }
    return qwenAudio();
  });
  const old = player.play('lumi:old', 'Primeira pista.', true, { requireNatural: true });
  await new Promise<void>(resolve => setImmediate(resolve));
  await player.play('lumi:new', 'Nova pista.', true, { requireNatural: true });
  assert.equal(oldSignal?.aborted, true); resolveOld(qwenAudio()); await old;
  assert.equal(audios.length, 1); assert.equal(player.getSnapshot().owner, 'lumi:new'); assert.equal(player.getSnapshot().source, 'qwen');
  assert.equal(synthesis.phrases.length, 0); player.stop(); assert.equal(player.getMouthLevel(), 0);
});

test('Qwen does not retry authorization or rate limits and keeps speech natural-only', async () => {
  for (const status of [401, 403, 429]) {
    const { player, environment, synthesis, audios } = setup({ qwen: true }); await player.prepare(); let attempts = 0;
    mockPosts(environment, async () => { attempts++; return new Response('', { status }); });
    await player.play('lumi:qwen', 'Uma pista.', true, { requireNatural: true });
    assert.equal(attempts, 1); assert.equal(audios.length, 0); assert.equal(synthesis.phrases.length, 0); assert.equal(player.getSnapshot().status, 'idle'); player.stop();
  }
});

test('Qwen blocked autoplay preserves its provider and WAV for an explicit second tap', async () => {
  const { player, requests, audios, synthesis } = setup({ qwen: true, blocked: true });
  await player.play('lumi:qwen', 'Uma pista.', true, { requireNatural: true });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(player.getSnapshot().status, 'ready'); assert.equal(player.getSnapshot().source, 'qwen'); assert.equal(player.getMouthLevel(), 0);
  await player.resume('lumi:qwen'); audios[0].currentTime = .04;
  assert.equal(player.getSnapshot().status, 'playing'); assert.ok(player.getMouthLevel() > .5);
  assert.equal(requests.filter(request => request.options?.method === 'POST').length, 1); assert.equal(synthesis.phrases.length, 0); player.stop();
});

test('corrupt Qwen WAV closes the mouth, releases resources and never falls back implicitly', async () => {
  const { player, environment, audios, synthesis, revoked } = setup({ qwen: true }); const original = environment.fetch;
  environment.fetch = async (url, options) => options?.method === 'POST'
    ? new Response('corrupt WAV', { headers: { 'Content-Type': 'audio/wav', 'X-Speech-Provider': 'qwen' } }) : original(url, options);
  await player.play('lumi:qwen', 'Uma pista.', true, { requireNatural: true });
  const fail = audios[0].onerror; fail?.(); fail?.();
  assert.equal(player.getSnapshot().status, 'idle'); assert.equal(player.getMouthLevel(), 0); assert.equal(synthesis.phrases.length, 0);
  assert.deepEqual(revoked, ['blob:test-audio']); assert.match(player.getSnapshot().message, /voz da Lumi/); player.stop();
});

test('Qwen playback labels follow the actual audio header when provider selection changes', async () => {
  const { player, environment } = setup({ kokoro: true }); await player.prepare(); mockPosts(environment, async () => qwenAudio());
  await player.play('lumi:qwen', 'Uma pista.', true, { requireNatural: true }); assert.equal(player.getSnapshot().source, 'qwen'); player.stop();
  const other = setup({ qwen: true }); await other.player.prepare();
  other.environment.fetch = async () => new Response('audio', { headers: { 'Content-Type': 'audio/mpeg', 'X-Speech-Provider': 'openai' } });
  await other.player.play('reading', 'Uma pista.'); assert.equal(other.player.getSnapshot().source, 'neural'); other.player.stop();
});

test('muted Qwen speech does no network, decoding or audio work', async () => {
  const { player, environment, requests, audios, synthesis } = setup({ qwen: true }); let decodes = 0;
  environment.decodeMouthEnvelope = async () => { decodes++; return undefined; };
  await player.play('lumi:qwen', 'Uma pista.', false, { profile: 'conversation', pace: 'natural', requireNatural: true });
  assert.equal(requests.length, 0); assert.equal(audios.length, 0); assert.equal(synthesis.phrases.length, 0); assert.equal(decodes, 0);
  assert.equal(player.getMouthLevel(), 0); assert.match(player.getSnapshot().message, /Ative o som/);
});


test('every natural playback refreshes provider selection while confirmed providers retain their deadlines', async t => {
  const timeouts: number[] = [];
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { timeouts.push(ms); return new AbortController().signal; });
  const { player, environment } = setup({ localServer: true });
  let provider = 'kokoro', probes = 0; const ids: string[] = [];
  environment.fetch = async (_url, options) => {
    if (options?.method !== 'POST') { probes++; return Response.json({ mode: 'neural', provider }); }
    const payload = JSON.parse(String(options.body)); ids.push(payload.requestId);
    return new Response('audio', { headers: { 'Content-Type': 'audio/wav', 'X-Speech-Provider': provider } });
  };
  for (const selected of ['kokoro', 'qwen', 'openai']) {
    provider = selected; await player.play('lumi:test', 'Uma pista.', true, { requireNatural: true });
  }
  assert.equal(probes, 3); assert.deepEqual(timeouts, [5000, 65000, 5000, 185000, 5000, 18000]);
  assert.equal(new Set(ids).size, 3); assert.ok(ids.every(id => /^[0-9a-f-]{36}$/.test(id))); player.stop();
});

test('a failed fresh health probe cannot reuse a stale Kokoro timeout for unknown local Qwen', async t => {
  const timeouts: number[] = [];
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { timeouts.push(ms); return new AbortController().signal; });
  const { player, environment } = setup({ kokoro: true, localServer: true }); await player.prepare();
  environment.fetch = async (_url, options) => {
    if (options?.method !== 'POST') throw new DOMException('Health timed out', 'TimeoutError');
    return qwenAudio();
  };
  await player.play('lumi:test', 'Uma pista.', true, { requireNatural: true });
  assert.deepEqual(timeouts, [5000, 5000, 185000]); assert.equal(player.getSnapshot().source, 'qwen'); player.stop();
});

test('stopping pending Qwen sends one independent keepalive DELETE for that request only', async () => {
  const { player, environment, requests, audios, synthesis } = setup({ qwen: true });
  let complete!: (response: Response) => void; let post: RequestInit | undefined;
  mockPosts(environment, async (_url, options) => { post = options; return new Promise(resolve => { complete = resolve; }); });
  const pending = player.play('lumi:test', 'Texto que não deve entrar no cancelamento.', true, { requireNatural: true });
  await new Promise<void>(resolve => setImmediate(resolve)); player.stop('another-owner');
  assert.equal(requests.filter(request => request.options?.method === 'DELETE').length, 0);
  player.stop('lumi:test'); player.stop('lumi:test'); player.stop();
  const cancellations = requests.filter(request => request.options?.method === 'DELETE'); assert.equal(cancellations.length, 1);
  const options = cancellations[0].options!;
  assert.equal(cancellations[0].url, '/api/speech'); assert.equal(options.keepalive, true);
  assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store'); assert.equal(options.signal, undefined);
  assert.deepEqual(JSON.parse(String(options.body)), { requestId: JSON.parse(String(post?.body)).requestId });
  assert.equal(post?.signal?.aborted, true); complete(qwenAudio()); await pending;
  assert.equal(audios.length, 0); assert.equal(synthesis.phrases.length, 0); assert.equal(player.getSnapshot().owner, null);
});

test('a request with unknown local provider also supports explicit cancellation', async () => {
  const { player, environment } = setup({ localServer: true }); const requests: RequestInit[] = [];
  let complete!: (response: Response) => void;
  environment.fetch = async (_url, options) => {
    requests.push(options || {});
    if (options?.method === 'DELETE') return new Response(null, { status: 204 });
    if (options?.method === 'POST') return new Promise(resolve => { complete = resolve; });
    throw new Error('Health unavailable');
  };
  const pending = player.play('lumi:test', 'Uma pista.', true, { requireNatural: true });
  await new Promise<void>(resolve => setImmediate(resolve)); player.stop();
  assert.equal(requests.filter(request => request.method === 'DELETE').length, 1);
  complete(qwenAudio()); await pending; assert.equal(player.getSnapshot().status, 'idle');
});

test('known Kokoro and paid providers never receive the Qwen cancellation operation', async () => {
  for (const configuration of [{ kokoro: true }, { neural: true }]) {
    const { player, environment, requests } = setup(configuration); let complete!: (response: Response) => void;
    mockPosts(environment, async () => new Promise(resolve => { complete = resolve; }));
    const pending = player.play('reading', 'Uma pista.', true, { requireNatural: true });
    await new Promise<void>(resolve => setImmediate(resolve)); player.stop(); complete(qwenAudio()); await pending;
    assert.equal(requests.filter(request => request.options?.method === 'DELETE').length, 0);
  }
});

test('a retry retains its requestId and cancellation targets only its pending second POST', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { player, environment, requests, audios } = setup({ qwen: true }); const ids: string[] = [];
  let complete!: (response: Response) => void;
  mockPosts(environment, async (_url, options) => {
    ids.push(JSON.parse(String(options?.body)).requestId);
    return ids.length === 1 ? Response.json({ code: 'VOICE_BUSY' }, { status: 503 }) : new Promise(resolve => { complete = resolve; });
  });
  const pending = player.play('lumi:test', 'Uma pista.', true, { requireNatural: true });
  await new Promise<void>(resolve => setImmediate(resolve)); t.mock.timers.tick(350);
  await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]);
  player.stop(); const cancellations = requests.filter(request => request.options?.method === 'DELETE');
  assert.equal(cancellations.length, 1); assert.deepEqual(JSON.parse(String(cancellations[0].options?.body)), { requestId: ids[0] });
  complete(qwenAudio()); await pending; assert.equal(audios.length, 0);
});

test('stopping between completed HTTP attempts does not send an unnecessary DELETE', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { player, environment, requests } = setup({ qwen: true });
  mockPosts(environment, async () => Response.json({ code: 'VOICE_BUSY' }, { status: 503 }));
  const pending = player.play('lumi:test', 'Uma pista.', true, { requireNatural: true });
  await new Promise<void>(resolve => setImmediate(resolve)); player.stop(); await pending; t.mock.timers.tick(1000);
  assert.equal(requests.filter(request => request.options?.method === 'DELETE').length, 0);
});

test('ready, completed and failed Qwen requests never cause cancellation DELETEs', async () => {
  for (const blocked of [false, true]) {
    const { player, requests, audios } = setup({ qwen: true, blocked });
    await player.play('lumi:test', 'Uma pista.', true, { requireNatural: true });
    if (!blocked) audios[0].onended?.();
    player.stop(); assert.equal(requests.filter(request => request.options?.method === 'DELETE').length, 0);
  }
  for (const fail of ['http', 'network']) {
    const { player, environment, requests } = setup({ qwen: true });
    mockPosts(environment, async () => { if (fail === 'network') throw new Error('Network unavailable'); return new Response('', { status: 401 }); });
    await player.play('lumi:test', 'Uma pista.', true, { requireNatural: true }); player.stop();
    assert.equal(requests.filter(request => request.options?.method === 'DELETE').length, 0);
  }
});

test('closing during the health probe never starts synthesis or sends a cancellation request', async () => {
  const { player, environment, audios } = setup({ qwen: true }); const methods: string[] = [];
  let complete!: (response: Response) => void;
  environment.fetch = async (_url, options) => { methods.push(options?.method || 'GET'); return new Promise(resolve => { complete = resolve; }); };
  const pending = player.play('lumi:test', 'Uma pista.', true, { requireNatural: true });
  player.stop(); complete(Response.json({ mode: 'neural', provider: 'qwen' })); await pending;
  assert.deepEqual(methods, ['GET']); assert.equal(audios.length, 0); assert.equal(player.getSnapshot().owner, null);
});

test('persistent busy responses explain contention and preserve the known provider for subsequent readings', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { player, environment, requests, synthesis } = setup({ qwen: true }); let posts = 0;
  mockPosts(environment, async () => { posts++; return posts <= 2 ? Response.json({ code: 'VOICE_BUSY' }, { status: 503 }) : qwenAudio(); });
  const pending = player.play('lumi:test', 'Uma pista.', true, { requireNatural: true });
  await new Promise<void>(resolve => setImmediate(resolve)); t.mock.timers.tick(350); await pending;
  assert.equal(posts, 2); assert.match(player.getSnapshot().message, /ocupada terminando outra fala/);
  assert.doesNotMatch(player.getSnapshot().message, /indisponível/); assert.equal(synthesis.phrases.length, 0);
  await player.play('reading', 'Outra pista.');
  assert.equal(posts, 3); assert.equal(player.getSnapshot().source, 'qwen');
  assert.equal(requests.filter(request => request.options?.method === 'DELETE').length, 0); player.stop();
});

test('expired sessions and rate limits receive actionable notices without provider fallback', async () => {
  for (const [status, message] of [[401, /sessão expirou.*Entre novamente/], [429, /Aguarde um pouco/]] as const) {
    const { player, environment, synthesis, requests } = setup({ qwen: true }); let posts = 0;
    mockPosts(environment, async () => { posts++; return Response.json({ error: 'Never display arbitrary backend text' }, { status }); });
    await player.play('lumi:test', 'Uma pista.', true, { requireNatural: true });
    assert.equal(posts, 1); assert.match(player.getSnapshot().message, message); assert.equal(synthesis.phrases.length, 0);
    assert.equal(requests.filter(request => request.options?.method === 'DELETE').length, 0); player.stop();
  }
});

test('failed explicit cancellation remains best effort and cannot interrupt the next playback', async () => {
  const { player, environment, audios } = setup({ qwen: true }); const original = environment.fetch;
  let complete!: (response: Response) => void; let first = true; const ids: string[] = [];
  environment.fetch = async (url, options) => {
    if (options?.method === 'DELETE') throw new Error('Cancellation network failure');
    if (options?.method !== 'POST') return original(url, options);
    ids.push(JSON.parse(String(options.body)).requestId);
    if (first) { first = false; return new Promise(resolve => { complete = resolve; }); }
    return qwenAudio();
  };
  const pending = player.play('lumi:old', 'Antes.', true, { requireNatural: true });
  await new Promise<void>(resolve => setImmediate(resolve)); await player.play('lumi:new', 'Depois.', true, { requireNatural: true });
  complete(qwenAudio()); await pending;
  assert.equal(ids.length, 2); assert.notEqual(ids[0], ids[1]); assert.equal(audios.length, 1); assert.equal(player.getSnapshot().owner, 'lumi:new'); player.stop();
});


const longLumiReply = 'Oi! Eu sou a Lumi e estou aqui para ajudar. Vamos descobrir as palavras com Ana-Maria e João? Leia BA-NA-NA com calma e observe cada pedacinho. Depois me conte uma palavra que você conhece. Podemos encontrar outras descobertas juntos!';

test('Qwen chunks retain every word, name, syllable and punctuation with a short first part', () => {
  const parts = qwenSpeechChunks(longLumiReply);
  assert.equal(parts.join(' '), longLumiReply); assert.ok(parts.length > 3);
  assert.ok(parts[0].length <= 48); assert.ok(parts.slice(1).every(part => part.length <= 80));
  assert.ok(parts.some(part => part.includes('Ana-Maria'))); assert.ok(parts.some(part => part.includes('BA-NA-NA')));
  assert.ok(parts.at(-1)?.endsWith('juntos!')); assert.deepEqual(qwenSpeechChunks(''), []);
  assert.deepEqual(qwenSpeechChunks('   '), []); assert.deepEqual(qwenSpeechChunks('Oi, João!'), ['Oi, João!']);
  const varied = 'Olá, Lúmi!\n\n João    perguntou: “É uma sílaba?”\tSim, BA-NA-NA! 🦉';
  assert.equal(qwenSpeechChunks(varied).join(' '), varied.replace(/\s+/gu, ' ').trim());
});

test('Qwen chunks never cut an indivisible long word or lose an unpunctuated ending', () => {
  const longWord = 'á'.repeat(140), text = longWord + ' ' + 'descoberta '.repeat(35) + 'fim';
  const parts = qwenSpeechChunks(text);
  assert.equal(parts[0], longWord); assert.equal(parts.join(' '), text);
  assert.ok(parts.slice(1).every(part => part.length <= 80)); assert.ok(parts.at(-1)?.endsWith('fim'));
});

test('Qwen starts the first audio before later synthesis and narrates all parts in order under one owner', async t => {
  const timeouts: number[] = [];
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { timeouts.push(ms); return new AbortController().signal; });
  const { player, environment, requests, audios, revoked, synthesis } = setup({ qwen: true });
  const posts: { text: string; requestId: string; profile: string; pace: string }[] = [];
  const states: { status: string; message: string }[] = []; const unsubscribe = player.subscribe(() => states.push(player.getSnapshot()));
  mockPosts(environment, async (_url, options) => { posts.push(JSON.parse(String(options?.body))); return qwenAudio(); });
  const parts = qwenSpeechChunks(longLumiReply);
  await player.play('lumi:complete', longLumiReply, true, { profile: 'conversation', pace: 'calm', requireNatural: true });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(posts.length, 1); assert.equal(audios.length, 1); assert.equal(player.getSnapshot().status, 'playing');
  assert.ok(states.some(state => state.message === 'Preparando a primeira parte da fala (1/' + parts.length + ')…'));
  for (let index = 0; index < parts.length; index++) {
    assert.equal(posts.length, index + 1); assert.equal(posts[index].text, parts[index]);
    assert.equal(posts[index].profile, 'conversation'); assert.equal(posts[index].pace, 'calm');
    assert.equal(player.getSnapshot().owner, 'lumi:complete');
    audios[index].currentTime = .04; assert.ok(player.getMouthLevel() > .5);
    audios[index].onended?.();
    assert.equal(player.getMouthLevel(), 0); assert.equal(audios[index].src, '');
    if (index + 1 < parts.length) {
      assert.equal(player.getSnapshot().status, 'loading');
      assert.equal(player.getSnapshot().message, 'Preparando a próxima parte da fala (' + (index + 2) + '/' + parts.length + ')…');
      await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(player.getSnapshot().status, 'playing');
    }
  }
  assert.equal(player.getSnapshot().status, 'idle'); assert.equal(player.getSnapshot().message, '');
  assert.equal(posts.map(post => post.text).join(' '), longLumiReply); assert.equal(new Set(posts.map(post => post.requestId)).size, parts.length);
  assert.deepEqual(timeouts, [5000, ...parts.map(() => 185000)]);
  assert.equal(requests.filter(request => !request.options?.method).length, 1); assert.equal(requests.filter(request => request.options?.method === 'DELETE').length, 0);
  assert.equal(revoked.length, parts.length); assert.equal(synthesis.phrases.length, 0); unsubscribe();
});

test('stopping while part two is pending deletes only its ID and ignores its late WAV', async () => {
  const { player, environment, requests, audios, synthesis } = setup({ qwen: true });
  const ids: string[] = []; let complete!: (response: Response) => void;
  mockPosts(environment, async (_url, options) => {
    ids.push(JSON.parse(String(options?.body)).requestId);
    return ids.length === 1 ? qwenAudio() : new Promise(resolve => { complete = resolve; });
  });
  await player.play('lumi:parts', longLumiReply, true, { profile: 'conversation', requireNatural: true });
  const oldEnd = audios[0].onended; oldEnd?.();
  assert.equal(player.getSnapshot().status, 'loading'); assert.equal(ids.length, 2); assert.notEqual(ids[0], ids[1]);
  player.stop('lumi:parts'); player.stop();
  const deletes = requests.filter(request => request.options?.method === 'DELETE'); assert.equal(deletes.length, 1);
  assert.deepEqual(JSON.parse(String(deletes[0].options?.body)), { requestId: ids[1] });
  complete(qwenAudio()); await new Promise<void>(resolve => setImmediate(resolve)); oldEnd?.();
  assert.equal(ids.length, 2); assert.equal(audios.length, 1); assert.equal(player.getSnapshot().owner, null); assert.equal(player.getMouthLevel(), 0); assert.equal(synthesis.phrases.length, 0);
});

test('duplicate and stale audio events cannot advance, mute or fail a newer Qwen part', async () => {
  const { player, environment, audios } = setup({ qwen: true }); let posts = 0;
  mockPosts(environment, async () => { posts++; return qwenAudio(); });
  await player.play('lumi:parts', longLumiReply, true, { profile: 'conversation', requireNatural: true });
  const old = { end: audios[0].onended, playing: audios[0].onplaying, pause: audios[0].onpause, waiting: audios[0].onwaiting, error: audios[0].onerror };
  old.end?.(); old.end?.(); assert.equal(posts, 2);
  await new Promise<void>(resolve => setImmediate(resolve)); audios[1].currentTime = .04;
  assert.ok(player.getMouthLevel() > .5);
  old.playing?.(); old.pause?.(); old.waiting?.(); old.error?.(); old.end?.();
  assert.equal(posts, 2); assert.equal(player.getSnapshot().status, 'playing'); assert.ok(player.getMouthLevel() > .5); player.stop();
});

test('autoplay recovery between Qwen parts reuses the current WAV and does not generate ahead', async () => {
  const { player, environment, requests, audios } = setup({ qwen: true, blocked: true }); let posts = 0;
  mockPosts(environment, async () => { posts++; return qwenAudio(); });
  await player.play('lumi:parts', longLumiReply, true, { profile: 'conversation', requireNatural: true });
  assert.equal(player.getSnapshot().status, 'ready'); assert.equal(posts, 1); assert.equal(player.getMouthLevel(), 0);
  await player.resume('lumi:parts'); audios[0].onended?.(); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(posts, 2); assert.equal(player.getSnapshot().status, 'ready'); assert.equal(player.getMouthLevel(), 0);
  await player.resume('lumi:parts'); assert.equal(posts, 2); assert.equal(audios[1].attempts, 2); assert.equal(player.getSnapshot().status, 'playing');
  player.stop(); assert.equal(requests.filter(request => request.options?.method === 'DELETE').length, 0);
});

test('a middle Qwen part reuses its own ID for retry without restarting previous speech', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { player, environment, audios } = setup({ qwen: true }); const posts: { text: string; requestId: string }[] = [];
  mockPosts(environment, async (_url, options) => {
    posts.push(JSON.parse(String(options?.body)));
    return posts.length === 2 ? Response.json({ code: 'VOICE_BUSY' }, { status: 503 }) : qwenAudio();
  });
  await player.play('lumi:parts', longLumiReply, true, { profile: 'conversation', requireNatural: true });
  audios[0].onended?.(); await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(posts.length, 2);
  t.mock.timers.tick(350); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(posts.length, 3); assert.notEqual(posts[0].requestId, posts[1].requestId); assert.equal(posts[1].requestId, posts[2].requestId);
  assert.equal(posts[1].text, posts[2].text); assert.equal(audios.length, 2); assert.equal(player.getSnapshot().status, 'playing'); player.stop();
});

test('failure in a middle Qwen part stops the sequence without skipping text or speaking on the device', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { player, environment, audios, synthesis } = setup({ qwen: true }); const texts: string[] = [];
  mockPosts(environment, async (_url, options) => {
    texts.push(JSON.parse(String(options?.body)).text);
    return texts.length === 1 ? qwenAudio() : Response.json({ code: 'VOICE_BUSY' }, { status: 503 });
  });
  const parts = qwenSpeechChunks(longLumiReply);
  await player.play('lumi:parts', longLumiReply, true, { profile: 'conversation', requireNatural: true });
  audios[0].onended?.(); await new Promise<void>(resolve => setImmediate(resolve)); t.mock.timers.tick(350);
  await new Promise<void>(resolve => setImmediate(resolve)); t.mock.timers.tick(1000);
  assert.deepEqual(texts, [parts[0], parts[1], parts[1]]); assert.equal(audios.length, 1);
  assert.equal(player.getSnapshot().status, 'idle'); assert.equal(player.getSnapshot().owner, 'lumi:parts'); assert.match(player.getSnapshot().message, /ocupada/);
  assert.equal(synthesis.phrases.length, 0); assert.equal(player.getMouthLevel(), 0);
});

test('only Qwen conversations and unknown local conversations are chunked', async () => {
  const cases = [
    { config: { kokoro: true }, profile: 'conversation' as const, chunked: false },
    { config: { neural: true }, profile: 'conversation' as const, chunked: false },
    { config: { qwen: true }, profile: 'reading' as const, chunked: false },
    { config: { localServer: true }, profile: 'conversation' as const, chunked: true },
  ];
  for (const item of cases) {
    const { player, environment } = setup(item.config); const original = environment.fetch; const texts: string[] = [];
    environment.fetch = async (url, options) => {
      if (options?.method !== 'POST') { if (item.chunked) throw new Error('Unknown local provider'); return original(url, options); }
      texts.push(JSON.parse(String(options.body)).text); return qwenAudio();
    };
    await player.play('lumi:test', longLumiReply, true, { profile: item.profile, requireNatural: true });
    assert.deepEqual(texts, [item.chunked ? qwenSpeechChunks(longLumiReply)[0] : longLumiReply]); player.stop();
  }
});
