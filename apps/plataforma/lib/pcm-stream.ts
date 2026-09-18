/** Bounded mono PCM transport. A successful HTTP response alone is not completion. */
export const PCM_SAMPLE_RATE = 24000;
export const PCM_MAX_SECONDS = 90;
const MAX_FRAME_BYTES = 256 * 1024;
const MAX_LINE_BYTES = 360 * 1024;
const MAX_STREAM_BYTES = PCM_SAMPLE_RATE * PCM_MAX_SECONDS * 2 * 1.5 + 1024 * 1024;

export interface PcmStreamConsumer {
  start(sampleRate: number, options: { bufferUntilEnd: boolean }): void;
  audio(samples: Float32Array, sampleRate: number): void;
  end(): void;
}

export class PcmStreamError extends Error {
  constructor(public code: string) { super(code); this.name = 'PcmStreamError'; }
}

function decodeFrame(data: unknown): Float32Array {
  if (typeof data !== 'string' || !data.length || data.length > Math.ceil(MAX_FRAME_BYTES / 3) * 4
    || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new PcmStreamError('VOICE_INVALID_STREAM');
  const raw = atob(data);
  if (!raw.length || raw.length % 2 || raw.length > MAX_FRAME_BYTES) throw new PcmStreamError('VOICE_INVALID_STREAM');
  const samples = new Float32Array(raw.length / 2);
  for (let i = 0; i < samples.length; i++) {
    const value = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8);
    samples[i] = (value >= 32768 ? value - 65536 : value) / 32768;
  }
  return samples;
}

export async function consumePcmStream(body: ReadableStream<Uint8Array>, signal: AbortSignal, consumer: PcmStreamConsumer): Promise<void> {
  const reader = body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = '', started = false, ended = false, frames = 0, samples = 0, bytes = 0;
  const abort = () => { void reader.cancel(signal.reason).catch(() => {}); };
  const checkAbort = () => { if (signal.aborted) throw signal.reason ?? new DOMException('Cancelled', 'AbortError'); };
  const line = (raw: string) => {
    checkAbort();
    if (!raw.trim()) return;
    if (ended || raw.length > MAX_LINE_BYTES) throw new PcmStreamError('VOICE_INVALID_STREAM');
    let event: Record<string, unknown>;
    try { event = JSON.parse(raw); } catch { throw new PcmStreamError('VOICE_INVALID_STREAM'); }
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new PcmStreamError('VOICE_INVALID_STREAM');
    if (event.type === 'error') throw new PcmStreamError(typeof event.code === 'string' ? event.code : 'VOICE_UNAVAILABLE');
    if (event.type === 'start') {
      if (started || event.sampleRate !== PCM_SAMPLE_RATE || (event.bufferUntilEnd !== undefined && typeof event.bufferUntilEnd !== 'boolean')) throw new PcmStreamError('VOICE_INVALID_STREAM');
      started = true; consumer.start(PCM_SAMPLE_RATE, { bufferUntilEnd: event.bufferUntilEnd === true }); return;
    }
    if (event.type === 'audio') {
      if (!started) throw new PcmStreamError('VOICE_INVALID_STREAM');
      const pcm = decodeFrame(event.data);
      samples += pcm.length; frames++;
      if (samples > PCM_SAMPLE_RATE * PCM_MAX_SECONDS || frames > 12000) throw new PcmStreamError('VOICE_STREAM_LIMIT');
      consumer.audio(pcm, PCM_SAMPLE_RATE); return;
    }
    if (event.type === 'end' && started && samples > 0) { ended = true; return; }
    throw new PcmStreamError('VOICE_INVALID_STREAM');
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    checkAbort();
    while (true) {
      const next = await reader.read();
      checkAbort();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_STREAM_BYTES) throw new PcmStreamError('VOICE_STREAM_LIMIT');
      pending += decoder.decode(next.value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf('\n')) !== -1) {
        line(pending.slice(0, newline)); pending = pending.slice(newline + 1);
      }
      if (pending.length > MAX_LINE_BYTES) throw new PcmStreamError('VOICE_STREAM_LIMIT');
    }
    pending += decoder.decode();
    if (pending.trim()) line(pending);
    if (!ended) throw new PcmStreamError('VOICE_INCOMPLETE_STREAM');
    consumer.end();
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export interface PcmPlaybackEvents {
  playing(): void;
  waiting(): void;
  blocked(): void;
  ended(): void;
  error(): void;
}
export interface PcmPlayback {
  append(samples: Float32Array, sampleRate: number): void;
  finish(): void;
  resume(): Promise<void>;
  close(): void;
  mouthLevel(): number;
}

/** Schedule each decoded frame directly; no whole-file buffering or WAV slicing. */
export function createPcmPlayback(events: PcmPlaybackEvents, makeContext: () => AudioContext = () => new window.AudioContext()): PcmPlayback {
  const context = makeContext(), analyser = context.createAnalyser();
  analyser.fftSize = 256; analyser.connect(context.destination);
  const waveform = new Float32Array(analyser.fftSize);
  const sources = new Set<AudioBufferSourceNode>();
  let nextTime = 0, firstTime = 0, closed = false, complete = false, running = false, receivedSamples = 0;
  let resuming: Promise<void> | undefined;
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  let settleResume: (() => void) | undefined;
  const update = () => {
    if (closed) return;
    if (context.state === 'closed') { events.error(); return; }
    if (context.state !== 'running') {
      if (sources.size) { running = false; events.blocked(); }
      return;
    }
    if (sources.size) { if (!running) { running = true; events.playing(); } }
    else if (complete) { events.ended(); }
    else { running = false; events.waiting(); }
  };
  context.addEventListener('statechange', update);
  const api: PcmPlayback = {
    append(samples, sampleRate) {
      if (closed || complete || sampleRate !== PCM_SAMPLE_RATE || !samples.length) throw new PcmStreamError('VOICE_INVALID_STREAM');
      receivedSamples += samples.length;
      if (receivedSamples > sampleRate * PCM_MAX_SECONDS) throw new PcmStreamError('VOICE_STREAM_LIMIT');
      const buffer = context.createBuffer(1, samples.length, sampleRate);
      buffer.getChannelData(0).set(samples);
      const source = context.createBufferSource();
      source.buffer = buffer; source.connect(analyser);
      const start = Math.max(nextTime, context.currentTime + .04);
      if (!sources.size) firstTime = start;
      nextTime = start + samples.length / sampleRate;
      sources.add(source);
      source.onended = () => { source.disconnect(); sources.delete(source); source.buffer = null; update(); };
      source.start(start);
      update();
      if (context.state !== 'running') void api.resume();
    },
    finish() { if (!closed) { complete = true; update(); } },
    resume() {
      if (closed || context.state === 'running') { update(); return Promise.resolve(); }
      if (resuming) return resuming;
      resuming = new Promise<void>(resolve => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true; clearTimeout(resumeTimer); resumeTimer = undefined;
          settleResume = undefined; resuming = undefined; update(); resolve();
        };
        settleResume = done;
        // Browsers can leave resume() pending until a user gesture. Do not stall
        // stream consumption; retain the bounded audio queue for the next tap.
        resumeTimer = setTimeout(done, 300);
        try { void context.resume().then(done, done); } catch { done(); }
      });
      return resuming;
    },
    mouthLevel() {
      if (closed || context.state !== 'running' || !sources.size || context.currentTime < firstTime || context.currentTime >= nextTime) return 0;
      analyser.getFloatTimeDomainData(waveform);
      let sum = 0; for (const sample of waveform) sum += sample * sample;
      return Math.max(0, Math.min(1, (Math.sqrt(sum / waveform.length) - .012) * 5));
    },
    close() {
      if (closed) return;
      closed = true; settleResume?.(); clearTimeout(resumeTimer);
      context.removeEventListener('statechange', update);
      for (const source of sources) {
        source.onended = null;
        try { source.stop(); } catch { /* Already finished. */ }
        source.disconnect(); source.buffer = null;
      }
      sources.clear(); analyser.disconnect(); void context.close().catch(() => {});
    },
  };
  return api;
}
