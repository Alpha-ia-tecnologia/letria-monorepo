import test from 'node:test';
import assert from 'node:assert/strict';
import { consumePcmStream, createPcmPlayback, PCM_MAX_SECONDS, PCM_SAMPLE_RATE, type PcmPlaybackEvents } from '../lib/pcm-stream';

const start = { type: 'start', sampleRate: PCM_SAMPLE_RATE };
const end = { type: 'end' };
const frame = (values: number[]) => {
  const bytes = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => bytes.writeInt16LE(value, index * 2));
  return { type: 'audio', data: bytes.toString('base64') };
};
const eventsBody = (...events: unknown[]) => new Response(events.map(event => JSON.stringify(event)).join('\n')).body!;
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('PCM decoder plays network fragments in order before the stream closes', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  const received: number[][] = []; let finished = false;
  const pending = consumePcmStream(body, new AbortController().signal, {
    start: rate => assert.equal(rate, 24000),
    audio: data => received.push([...data]),
    end: () => { finished = true; },
  });
  const serialized = JSON.stringify(start) + '\n' + JSON.stringify(frame([-32768, 0, 16384, 32767])) + '\n';
  for (const fragment of [serialized.slice(0, 7), serialized.slice(7, 34), serialized.slice(34)]) controller.enqueue(new TextEncoder().encode(fragment));
  await tick();
  assert.deepEqual(received, [[-1, 0, .5, 32767 / 32768]]);
  assert.equal(finished, false);
  controller.enqueue(new TextEncoder().encode(JSON.stringify(frame([8192])) + '\n' + JSON.stringify(end)));
  controller.close(); await pending;
  assert.deepEqual(received[1], [.25]); assert.equal(finished, true);
});

test('PCM decoder rejects incomplete, misordered, malformed, and empty streams', async () => {
  for (const events of [
    [], [start], [start, frame([1])], [frame([1]), start, end],
    [start, start, frame([1]), end], [start, end], [start, frame([1]), end, frame([2])],
    [{ type: 'start', sampleRate: 44100 }, frame([1]), end],
    [{ ...start, bufferUntilEnd: 'true' }, frame([1]), end],
    [{ ...start, bufferUntilEnd: null }, frame([1]), end],
    [start, { type: 'audio', data: 'AA==' }, end],
    [start, { type: 'audio', data: '!!!!' }, end],
    [start, { type: 'audio', data: 'AA==\n' }, end],
    [null], ['start'], [start, { type: 'something-else' }],
  ]) {
    let finished = false;
    await assert.rejects(consumePcmStream(eventsBody(...events), new AbortController().signal, {
      start() {}, audio() {}, end() { finished = true; },
    }));
    assert.equal(finished, false);
  }
});

test('PCM decoder preserves provider errors after partial audio and cancels the reader', async () => {
  const controller = new AbortController(); let frames = 0, finished = false;
  await assert.rejects(consumePcmStream(eventsBody(start, frame([1]), { type: 'error', code: 'SPEECH_TIMEOUT' }), controller.signal, {
    start() {}, audio() { frames++; }, end() { finished = true; },
  }), { code: 'SPEECH_TIMEOUT' });
  assert.equal(frames, 1); assert.equal(finished, false);
});

test('PCM decoder cancellation interrupts a pending read without another network frame', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const abort = new AbortController();
  const pending = consumePcmStream(body, abort.signal, { start() {}, audio() {}, end() { assert.fail('cancelled streams never finish'); } });
  abort.abort(new DOMException('Cancelled', 'AbortError'));
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(cancelled, true); assert.equal(body.locked, false);
});

test('PCM decoder rejects oversized frames and speech longer than the 90 second budget', async () => {
  const consumer = { start() {}, audio() {}, end() { assert.fail('oversized streams never finish'); } };
  await assert.rejects(consumePcmStream(eventsBody(start, { type: 'audio', data: Buffer.alloc(256 * 1024 + 2).toString('base64') }, end), new AbortController().signal, consumer));
  const second = frame(Array(PCM_SAMPLE_RATE).fill(0));
  await assert.rejects(consumePcmStream(eventsBody(start, ...Array(PCM_MAX_SECONDS + 1).fill(second), end), new AbortController().signal, consumer), { code: 'VOICE_STREAM_LIMIT' });
});

test('PCM decoder accepts prepared audio delivered immediately but still requires its end marker', async () => {
  const parts: number[][] = [];
  await consumePcmStream(eventsBody(start, frame([1000, -1000]), end), new AbortController().signal, {
    start() {}, audio: data => parts.push([...data]), end: () => parts.push([]),
  });
  assert.deepEqual(parts, [[1000 / 32768, -1000 / 32768], []]);
});

class FakeContext extends EventTarget {
  state: AudioContextState = 'running';
  currentTime = 0;
  destination = {};
  closed = 0;
  resumeAllowed = true;
  resumePending = false;
  sources: { buffer: { duration: number } | null; startTime: number; onended: (() => void) | null; stopped: boolean; disconnected: boolean; connect(): void; disconnect(): void; start(time: number): void; stop(): void }[] = [];
  analyser = { fftSize: 256, connect() {}, disconnect() {}, getFloatTimeDomainData(data: Float32Array) { data.fill(.1); } };
  createAnalyser = () => this.analyser;
  createBuffer = (_channels: number, length: number, rate: number) => {
    const data = new Float32Array(length);
    return { duration: length / rate, getChannelData: () => data };
  };
  createBufferSource = () => {
    const source = {
      buffer: null as { duration: number } | null, startTime: -1, onended: null as (() => void) | null, stopped: false, disconnected: false,
      connect() {}, disconnect() { this.disconnected = true; }, start(time: number) { this.startTime = time; }, stop() { this.stopped = true; },
    };
    this.sources.push(source); return source;
  };
  async resume() {
    if (this.resumePending) return new Promise<void>(() => {});
    if (!this.resumeAllowed) throw new DOMException('Gesture needed', 'NotAllowedError');
    this.state = 'running'; this.dispatchEvent(new Event('statechange'));
  }
  async close() { this.closed++; this.state = 'closed'; }
}
function pcmSetup(context = new FakeContext()) {
  const calls: string[] = [];
  const events = Object.fromEntries(['playing', 'waiting', 'blocked', 'ended', 'error'].map(name => [name, () => calls.push(name)])) as unknown as PcmPlaybackEvents;
  return { context, calls, playback: createPcmPlayback(events, () => context as unknown as AudioContext) };
}
test('PCM scheduling is contiguous, reports actual buffering gaps and completes after the last buffer', () => {
  const { context, calls, playback } = pcmSetup();
  playback.append(new Float32Array(24000), 24000);
  playback.append(new Float32Array(12000), 24000);
  assert.deepEqual(context.sources.map(source => source.startTime), [.04, 1.04]);
  assert.equal(playback.mouthLevel(), 0);
  context.currentTime = .2; assert.ok(playback.mouthLevel() > 0);
  context.sources[0].onended?.(); assert.equal(calls.includes('ended'), false);
  context.currentTime = 1.54; context.sources[1].onended?.();
  assert.equal(calls.at(-1), 'waiting'); assert.equal(playback.mouthLevel(), 0);
  context.currentTime = 2; playback.append(new Float32Array(2400), 24000);
  assert.equal(context.sources[2].startTime, 2.04);
  playback.finish(); assert.equal(calls.includes('ended'), false);
  context.currentTime = 2.14; context.sources[2].onended?.();
  assert.equal(calls.at(-1), 'ended');
  playback.close(); assert.equal(context.closed, 1);
});

test('PCM autoplay block retains queued buffers and resumes them without requesting audio again', async () => {
  const context = new FakeContext(); context.state = 'suspended'; context.resumeAllowed = false;
  const { calls, playback } = pcmSetup(context);
  playback.append(new Float32Array(2400), 24000); playback.finish(); await tick();
  assert.ok(calls.includes('blocked')); assert.equal(calls.includes('ended'), false);
  assert.equal(playback.mouthLevel(), 0);
  context.resumeAllowed = true; await playback.resume();
  assert.equal(calls.at(-1), 'playing'); assert.equal(context.sources.length, 1);
  context.currentTime = .14; context.sources[0].onended?.();
  assert.equal(calls.at(-1), 'ended'); playback.close();
});

test('PCM close stops every queued source, releases buffers and suppresses late events', async () => {
  const { context, calls, playback } = pcmSetup();
  playback.append(new Float32Array(2400), 24000); playback.append(new Float32Array(2400), 24000);
  const late = context.sources[0].onended;
  playback.close(); playback.close();
  const before = calls.length;
  late?.(); context.dispatchEvent(new Event('statechange')); await playback.resume();
  assert.equal(calls.length, before); assert.equal(context.closed, 1);
  assert.ok(context.sources.every(source => source.stopped && source.disconnected && source.buffer === null));
  assert.equal(playback.mouthLevel(), 0);
});

test('PCM pending autoplay resume does not hold teardown open', async () => {
  const context = new FakeContext(); context.state = 'suspended'; context.resumePending = true;
  const { playback } = pcmSetup(context);
  playback.append(new Float32Array(2400), 24000);
  const resume = playback.resume();
  playback.close(); await resume;
  assert.equal(context.closed, 1);
});
