import { consumePcmStream, createPcmPlayback, PcmStreamError, type PcmPlayback, type PcmPlaybackEvents } from './pcm-stream';

export type SpeechSource = 'qwen' | 'kokoro' | 'neural' | 'browser';
export interface SpeechOptions {
  profile?: 'conversation' | 'reading';
  pace?: 'natural' | 'calm';
  requireNatural?: boolean;
  preferDevice?: boolean;
}

export function speechSourceLabel(source: SpeechSource | null) {
  if (source === 'qwen') return 'Lumi · Qwen · voz local gerada por IA';
  if (source === 'kokoro') return 'Dora · voz local · gerada por IA';
  return source === 'neural' ? 'Voz gerada por IA' : 'Voz do dispositivo';
}

export function isLoopbackHostname(hostname: string) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname.toLowerCase());
}
export interface SpeechState {
  owner: string | null;
  status: 'idle' | 'loading' | 'ready' | 'playing';
  source: SpeechSource | null;
  message: string;
}
export const IDLE_SPEECH: SpeechState = { owner: null, status: 'idle', source: null, message: '' };

export function selectPortugueseVoice(voices: SpeechSynthesisVoice[], offline = false) {
  return voices.filter(voice => /^pt(?:[-_]|$)/i.test(voice.lang) && (!offline || voice.localService))
    .map(voice => ({
      voice,
      score: (/^pt[-_]br$/i.test(voice.lang) ? 100 : 0)
        + (/natural|neural|enhanced|premium/i.test(voice.name) ? 40 : 0)
        + (/francisca|thalita|luciana|camila|vitoria|vitória|maria/i.test(voice.name) ? 8 : 0)
        + (voice.default ? 2 : 0),
    })).sort((a, b) => b.score - a.score)[0]?.voice;
}

/** Keep punctuation and syllable spelling intact, including the final short phrase. */
export function speechPhrases(text: string): string[] {
  const segments = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter('pt-BR', { granularity: 'sentence' }).segment(text)].map(part => part.segment)
    : text.match(/[^.!?…]+(?:[.!?…]+["”']?|$)|[.!?…]+/gu) || [];
  const sentences = segments.map(part => part.trim()).filter(Boolean);
  return sentences.flatMap(sentence => {
    const parts: string[] = [];
    let current = '';
    for (const word of sentence.split(/\s+/u)) {
      if (current && current.length + word.length > 240) { parts.push(current); current = ''; }
      current += (current ? ' ' : '') + word;
    }
    if (current) parts.push(current);
    return parts;
  });
}

/** Keep conversational intonation across short sentences without long utterances. */
export function conversationSpeechPhrases(text: string): string[] {
  const groups: string[] = [];
  for (const phrase of speechPhrases(text)) {
    const previous = groups.at(-1);
    if (previous && previous.length + 1 + phrase.length <= 240) groups[groups.length - 1] = previous + ' ' + phrase;
    else groups.push(phrase);
  }
  return groups;
}

/** Short local generations, with a smaller first part and no word truncation. */
export function qwenSpeechChunks(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  const limit = () => parts.length === 0 ? 48 : 80;
  const flush = () => { if (current) { parts.push(current); current = ''; } };
  for (const sentence of speechPhrases(text)) {
    // Prefer complete sentences when they fit; otherwise split only at spaces.
    if (current && current.length + 1 + sentence.length > limit()) flush();
    for (const word of sentence.split(/\s+/u)) {
      if (current && current.length + 1 + word.length > limit()) flush();
      current += (current ? ' ' : '') + word;
    }
  }
  flush();
  return parts;
}

export interface MouthEnvelope { levels: Float32Array; frameDuration: number }
const clampMouth = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const rmsMouth = (sum: number, count: number) => clampMouth((Math.sqrt(sum / Math.max(1, count)) - .012) * 5);

/** A small RMS envelope for local 16-bit PCM WAV voices. Silence remains exactly zero. */
export function wavMouthEnvelope(buffer: ArrayBuffer): MouthEnvelope | undefined {
  if (buffer.byteLength < 44 || buffer.byteLength > 8 * 1024 * 1024) return;
  const view = new DataView(buffer);
  const tag = (offset: number) => String.fromCharCode(...new Uint8Array(buffer, offset, 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return;
  const end = view.getUint32(4, true) + 8;
  if (end > buffer.byteLength || end < 44) return;
  let sampleRate = 0, channels = 0, align = 0, dataOffset = 0, dataLength = 0;
  for (let offset = 12; offset + 8 <= end;) {
    const size = view.getUint32(offset + 4, true), start = offset + 8;
    if (start + size > end) return;
    if (tag(offset) === 'fmt ') {
      if (size < 16 || view.getUint16(start, true) !== 1 || view.getUint16(start + 14, true) !== 16) return;
      channels = view.getUint16(start + 2, true); sampleRate = view.getUint32(start + 4, true); align = view.getUint16(start + 12, true);
    } else if (tag(offset) === 'data') { dataOffset = start; dataLength = size; }
    offset = start + size + (size % 2);
  }
  if (!dataOffset || !dataLength || ![1, 2].includes(channels) || align !== channels * 2 || sampleRate < 8000 || sampleRate > 96000 || dataLength % align) return;
  const samples = dataLength / align;
  if (samples / sampleRate > 180) return;
  const frameSize = Math.max(1, Math.round(sampleRate * .02));
  const levels = new Float32Array(Math.ceil(samples / frameSize));
  for (let frame = 0; frame < levels.length; frame++) {
    const from = frame * frameSize, until = Math.min(samples, from + frameSize); let sum = 0;
    for (let index = from; index < until; index++) for (let channel = 0; channel < channels; channel++) {
      const sample = view.getInt16(dataOffset + index * align + channel * 2, true) / 32768; sum += sample * sample;
    }
    levels[frame] = rmsMouth(sum, (until - from) * channels);
  }
  return { levels, frameDuration: frameSize / sampleRate };
}
function decodedMouthEnvelope(audio: AudioBuffer): MouthEnvelope | undefined {
  if (!audio.length || audio.duration > 180 || !Number.isFinite(audio.sampleRate) || audio.sampleRate < 8000) return;
  const frameSize = Math.max(1, Math.round(audio.sampleRate * .02)), channels = Math.min(audio.numberOfChannels, 2);
  if (!channels) return;
  const data = Array.from({ length: channels }, (_, index) => audio.getChannelData(index));
  const levels = new Float32Array(Math.ceil(audio.length / frameSize));
  for (let frame = 0; frame < levels.length; frame++) {
    const from = frame * frameSize, until = Math.min(audio.length, from + frameSize); let sum = 0;
    for (let index = from; index < until; index++) for (const channel of data) sum += channel[index] * channel[index];
    levels[frame] = rmsMouth(sum, (until - from) * channels);
  }
  return { levels, frameDuration: frameSize / audio.sampleRate };
}
/** Decode only. Audio playback never passes through an AudioContext destination. */
async function browserMouthEnvelope(buffer: ArrayBuffer, signal: AbortSignal): Promise<MouthEnvelope | undefined> {
  if (signal.aborted || typeof window === 'undefined' || !window.AudioContext || buffer.byteLength > 8 * 1024 * 1024) return;
  let context: AudioContext | undefined;
  let closing = false;
  const close = () => { if (context && !closing) { closing = true; void context.close().catch(() => {}); } };
  try {
    context = new window.AudioContext(); signal.addEventListener('abort', close, { once: true });
    const audio = await context.decodeAudioData(buffer);
    return signal.aborted ? undefined : decodedMouthEnvelope(audio);
  } catch { return undefined; }
  finally { signal.removeEventListener('abort', close); close(); }
}

export interface SpeechEnvironment {
  synthesis?: SpeechSynthesis;
  utterance(text: string): SpeechSynthesisUtterance;
  audio(): HTMLAudioElement;
  fetch: typeof fetch;
  online(): boolean;
  /** A loopback app can reach its local voice service without an internet connection. */
  localServer?(): boolean;
  createURL(blob: Blob): string;
  revokeURL(url: string): void;
  /** Optional decoder for compressed audio; never blocks audible playback. */
  decodeMouthEnvelope?(buffer: ArrayBuffer, signal: AbortSignal): Promise<MouthEnvelope | undefined>;
  /** Incremental PCM playback; absent in browsers without Web Audio. */
  pcmAudio?(events: PcmPlaybackEvents): PcmPlayback;
  now?(): number;
}
interface Playback {
  owner: string;
  text: string;
  options?: SpeechOptions;
  fallbackStarted?: boolean;
  requestId?: string;
  requestPending?: boolean;
  cancelRemotely?: boolean;
  cancellationSent?: boolean;
  abort: AbortController;
  audio?: HTMLAudioElement;
  pcmAudio?: PcmPlayback;
  source?: 'qwen' | 'kokoro' | 'neural';
  url?: string;
  utterance?: SpeechSynthesisUtterance;
  timer?: ReturnType<typeof setTimeout>;
  envelope?: MouthEnvelope;
  analysisAbort?: AbortController;
  mouthSpeaking?: boolean;
  mouthPaused?: boolean;
  mouthStartedAt?: number;
  mouthBoundaryAt?: number;
  mouthBoundaryDuration?: number;
}

export class SpeechPlayer {
  private state = IDLE_SPEECH;
  private listeners = new Set<() => void>();
  private active?: Playback;
  private mode: SpeechSource = 'browser';
  // Selection from the latest health probe; a failed probe leaves it unknown.
  private selectedProvider?: 'qwen' | 'kokoro' | 'neural';
  private fixedVoice = false;
  private fixedVoiceStreaming = false;
  private checkedUntil = 0;
  private preparing?: Promise<void>;
  constructor(private environment: SpeechEnvironment) {}
  getSnapshot = () => this.state;
  getVoiceCapabilities = () => ({ fixedVoice: this.fixedVoice, streaming: this.fixedVoiceStreaming });
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  private emit(state: SpeechState) { this.state = state; this.listeners.forEach(listener => listener()); }
  private clock() { return this.environment.now?.() ?? (typeof performance === 'undefined' ? Date.now() : performance.now()); }
  /** Read by the avatar render loop; no React notification or timer per frame. */
  getMouthLevel = (): number => {
    const playback = this.active;
    if (!playback || !this.current(playback) || this.state.status !== 'playing' || playback.mouthPaused) return 0;
    if (playback.pcmAudio) return clampMouth(playback.pcmAudio.mouthLevel());
    if (playback.audio) {
      const audio = playback.audio, envelope = playback.envelope;
      if (audio.paused === true || audio.ended === true || !envelope || envelope.frameDuration <= 0 || !Number.isFinite(envelope.frameDuration) || !Number.isFinite(audio.currentTime) || audio.currentTime < 0) return 0;
      const position = audio.currentTime / envelope.frameDuration, index = Math.floor(position);
      if (index >= envelope.levels.length) return 0;
      const left = clampMouth(envelope.levels[index]), right = clampMouth(envelope.levels[Math.min(index + 1, envelope.levels.length - 1)]);
      return clampMouth(left + (right - left) * (position - index));
    }
    if (!playback.mouthSpeaking || this.environment.synthesis?.paused || playback.mouthStartedAt === undefined) return 0;
    // Device TTS exposes no waveform. Word boundaries drive an approximate jaw
    // pulse; devices without boundaries use a gentle estimated speaking rhythm.
    const now = this.clock();
    if (playback.mouthBoundaryAt !== undefined) {
      const age = now - playback.mouthBoundaryAt, duration = playback.mouthBoundaryDuration ?? 230;
      if (age < 0 || age >= duration) return 0;
      return clampMouth(Math.sin(Math.PI * age / duration) * .76);
    }
    const elapsed = Math.max(0, now - playback.mouthStartedAt) / 1000;
    return clampMouth(Math.max(0, Math.sin(elapsed * Math.PI * 9)) * (.5 + .15 * Math.sin(elapsed * 3)));
  };
  private async prepareMouth(playback: Playback, blob: Blob) {
    const audio = playback.audio, abort = new AbortController();
    playback.analysisAbort = abort;
    try {
      const buffer = await blob.arrayBuffer();
      if (!this.current(playback) || playback.audio !== audio || abort.signal.aborted) return;
      const envelope = wavMouthEnvelope(buffer) ?? await this.environment.decodeMouthEnvelope?.(buffer, abort.signal);
      if (this.current(playback) && playback.audio === audio && !abort.signal.aborted) playback.envelope = envelope;
    } catch { /* Facial analysis is optional; playback must continue unchanged. */ }
  }
  private canReachServer() { return this.environment.online() || !!this.environment.localServer?.(); }
  private retryDelay() { return this.environment.localServer?.() ? 5000 : 15000; }
  private current(playback: Playback) { return this.active === playback && !playback.abort.signal.aborted; }
  private disposeAudio(playback: Playback) {
    playback.pcmAudio?.close(); playback.pcmAudio = undefined;
    playback.analysisAbort?.abort(); playback.analysisAbort = undefined; playback.envelope = undefined; playback.mouthPaused = false;
    if (playback.audio) {
      playback.audio.onended = null; playback.audio.onerror = null; playback.audio.onplaying = null; playback.audio.onpause = null; playback.audio.onwaiting = null;
      playback.audio.pause(); playback.audio.removeAttribute('src'); playback.audio.load();
    }
    if (playback.url) this.environment.revokeURL(playback.url);
    playback.audio = undefined; playback.url = undefined;
  }
  private cancelPendingRequest(playback: Playback) {
    if (!playback.requestPending || !playback.cancelRemotely || !playback.requestId || playback.cancellationSent) return;
    playback.cancellationSent = true; playback.requestPending = false;
    // Aborting a browser request is not reliably forwarded by every Worker runtime.
    // This independent keepalive request also works when the component/page closes.
    try {
      void this.environment.fetch('/api/speech', {
        method: 'DELETE', credentials: 'same-origin', cache: 'no-store', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: playback.requestId }),
      }).catch(() => {});
    } catch { /* Cancellation remains best effort; the server also bounds every job. */ }
  }
  private dispose(playback: Playback) {
    this.cancelPendingRequest(playback);
    playback.abort.abort();
    clearTimeout(playback.timer);
    this.disposeAudio(playback);
    if (playback.utterance) {
      playback.utterance.onend = null; playback.utterance.onerror = null; playback.utterance.onstart = null; playback.utterance.onboundary = null; playback.utterance.onpause = null; playback.utterance.onresume = null;
      this.environment.synthesis?.cancel();
    }
  }
  stop = (owner?: string) => {
    if (owner && this.state.owner !== owner) return;
    if (this.active) this.dispose(this.active);
    this.active = undefined;
    this.emit(IDLE_SPEECH);
  };
  private finish(playback: Playback, message = '') {
    if (!this.current(playback)) return;
    this.dispose(playback); this.active = undefined;
    this.emit({ ...this.state, status: 'idle', message });
  }
  prepare = (force = false) => {
    if (!this.canReachServer() || (!force && Date.now() < this.checkedUntil)) return Promise.resolve();
    if (this.preparing) return this.preparing;
    this.preparing = (async () => {
      try {
        const response = await this.environment.fetch('/api/speech', {
          credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(5000),
        });
        const data = response.ok || response.status === 503 ? await response.json() as { mode?: string; provider?: string; preferredProvider?: string; fixedVoice?: boolean; streaming?: boolean } : null;
        this.mode = response.ok && data?.mode === 'neural' ? data.provider === 'qwen' ? 'qwen' : data.provider === 'kokoro' ? 'kokoro' : 'neural' : 'browser';
        this.fixedVoice = this.mode === 'qwen' && data?.fixedVoice === true;
        this.fixedVoiceStreaming = this.fixedVoice && data?.streaming === true;
        this.selectedProvider = this.mode !== 'browser' ? this.mode
          : data?.preferredProvider === 'qwen' || data?.preferredProvider === 'kokoro' ? data.preferredProvider
          : data?.preferredProvider === 'openai' ? 'neural' : undefined;
        this.checkedUntil = Date.now() + (this.mode === 'browser' ? this.retryDelay() : 60000);
      } catch { this.mode = 'browser'; this.selectedProvider = undefined; this.fixedVoice = false; this.fixedVoiceStreaming = false; this.checkedUntil = Date.now() + this.retryDelay(); }
      finally { this.preparing = undefined; }
    })();
    return this.preparing;
  };
  play = async (owner: string, text: string, enabled = true, options?: SpeechOptions) => {
    this.stop();
    if (!enabled) {
      this.emit({ ...IDLE_SPEECH, owner, message: 'Ative o som em “Do seu jeito” para ouvir.' }); return;
    }
    if (!text.trim()) return;
    const playback: Playback = { owner, text, options, abort: new AbortController() };
    this.active = playback;
    this.emit({ owner, status: 'loading', source: null, message: '' });
    // Explicit device playback stays local and starts directly in the click gesture.
    if (options?.preferDevice) { await this.speakOnDevice(playback, text); return; }
    const retryNatural = !!options?.requireNatural;
    if (this.canReachServer() && (Date.now() >= this.checkedUntil || retryNatural)) await this.prepare(retryNatural);
    if (!this.current(playback)) return;
    if ((this.mode !== 'browser' || options?.requireNatural) && this.canReachServer() && text.length <= 2400) {
      const selectedProvider = this.mode !== 'browser' ? this.mode : this.selectedProvider;
      if (selectedProvider === 'qwen' && this.fixedVoiceStreaming && this.environment.pcmAudio) {
        await this.playRemoteStream(playback); return;
      }
      const unknownLocalProvider = !selectedProvider && !!this.environment.localServer?.();
      const chunked = !this.fixedVoice && options?.profile === 'conversation' && (selectedProvider === 'qwen' || unknownLocalProvider);
      const parts = chunked ? qwenSpeechChunks(text) : [text];
      await this.playRemotePart(playback, parts, 0, selectedProvider, chunked);
      return;
    }
    if (!this.current(playback)) return;
    if (options?.requireNatural) { this.finish(playback, text.length > 2400 ? 'Esta fala é longa demais. Tente um trecho menor para ouvir a voz da Lumi.' : 'A voz da Lumi está indisponível agora. Tente novamente ou escolha a voz do dispositivo.'); return; }
    await this.speakOnDevice(playback, text);
  };
  private async playRemoteStream(playback: Playback) {
    const { owner, text, options } = playback;
    const requestId = crypto.randomUUID();
    playback.requestId = requestId; playback.cancelRemotely = true;
    playback.requestPending = false; playback.cancellationSent = false; playback.source = 'qwen';
    const signal = AbortSignal.any([playback.abort.signal, AbortSignal.timeout(185000)]);
    let heardAudio = false;
    try {
      const request = () => {
        playback.requestPending = true;
        return this.environment.fetch('/api/speech', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' }, signal,
          body: JSON.stringify({ text, requestId, stream: true, ...(options?.profile ? { profile: options.profile } : {}), ...(options?.pace ? { pace: options.pace } : {}) }),
        });
      };
      this.emit({ owner, status: 'loading', source: 'qwen', message: 'Preparando a voz da Lumi…' });
      let response = await request();
      if (response.status === 503 && options?.requireNatural && this.current(playback)) {
        playback.requestPending = false; await response.body?.cancel().catch(() => {});
        if (!await this.waitForRetry(playback)) return;
        response = await request();
      }
      if (!this.current(playback)) { await response.body?.cancel().catch(() => {}); return; }
      if (!response.ok) {
        playback.requestPending = false;
        let code = response.status === 401 ? 'SESSION_EXPIRED' : response.status === 429 ? 'VOICE_RATE_LIMIT' : 'VOICE_UNAVAILABLE';
        if (response.headers.get('Content-Type')?.includes('application/json')) {
          try {
            const failure = await response.json() as { code?: string };
            if (failure.code === 'VOICE_BUSY') code = failure.code;
          } catch { /* Keep the status-specific message. */ }
        } else await response.body?.cancel().catch(() => {});
        throw new PcmStreamError(code);
      }
      if (!response.body || !response.headers.get('Content-Type')?.startsWith('application/x-ndjson')) {
        await response.body?.cancel().catch(() => {}); throw new PcmStreamError('VOICE_INVALID_STREAM');
      }
      const pcm = this.environment.pcmAudio!({
        playing: () => {
          if (!this.current(playback) || playback.pcmAudio !== pcm) return;
          heardAudio = true; playback.mouthPaused = false;
          this.emit({ owner, status: 'playing', source: 'qwen', message: '' });
        },
        waiting: () => {
          if (!this.current(playback) || playback.pcmAudio !== pcm) return;
          playback.mouthPaused = true;
          this.emit({ owner, status: 'loading', source: 'qwen', message: 'Preparando a continuação da fala…' });
        },
        blocked: () => {
          if (!this.current(playback) || playback.pcmAudio !== pcm) return;
          playback.mouthPaused = true;
          this.emit({ owner, status: 'ready', source: 'qwen', message: 'Toque em Tocar áudio para ouvir a Lumi.' });
        },
        ended: () => { if (this.current(playback) && playback.pcmAudio === pcm) this.finish(playback); },
        error: () => {
          if (this.current(playback) && playback.pcmAudio === pcm) this.finish(playback, 'A reprodução da voz foi interrompida. Toque em Ouvir para tentar novamente.');
        },
      });
      playback.pcmAudio = pcm;
      let bufferUntilEnd = false;
      const bufferedAudio: { samples: Float32Array; sampleRate: number }[] = [];
      await consumePcmStream(response.body, signal, {
        start: (_sampleRate, transport) => { bufferUntilEnd = transport.bufferUntilEnd; },
        audio: (samples, sampleRate) => {
          if (!this.current(playback)) return;
          if (bufferUntilEnd) bufferedAudio.push({ samples, sampleRate });
          else pcm.append(samples, sampleRate);
        },
        end: () => {
          playback.requestPending = false;
          if (this.current(playback)) {
            // Slower local engines can preserve uninterrupted intonation by
            // waiting for validated completion. Prepared audio streams at once.
            for (const part of bufferedAudio) pcm.append(part.samples, part.sampleRate);
            bufferedAudio.length = 0;
            pcm.finish();
          }
        },
      });
    } catch (error) {
      if (!this.current(playback)) return;
      this.cancelPendingRequest(playback);
      const code = error instanceof PcmStreamError ? error.code : '';
      const message = code === 'SESSION_EXPIRED' ? 'Sua sessão expirou. Entre novamente para ouvir a Lumi.'
        : code === 'VOICE_RATE_LIMIT' ? 'Você fez várias tentativas de voz. Aguarde um pouco antes de tentar novamente.'
        : code === 'VOICE_BUSY' ? 'A voz da Lumi está ocupada terminando outra fala. Aguarde um pouco e tente novamente.'
        : heardAudio ? 'A fala da Lumi foi interrompida antes de terminar. Toque em Ouvir para tentar novamente.' : '';
      if (message) { this.finish(playback, message); return; }
      await this.fallbackToDevice(playback);
    }
  }
  private async playRemotePart(playback: Playback, parts: string[], index: number, selectedProvider: Exclude<SpeechSource, 'browser'> | undefined, chunked: boolean) {
    if (!this.current(playback)) return;
    const { owner, options } = playback;
    const text = parts[index];
    try {
      const knownLocalProvider = selectedProvider === 'qwen' || selectedProvider === 'kokoro';
      const unknownLocalProvider = !selectedProvider && !!this.environment.localServer?.();
      const timeout = selectedProvider === 'qwen' || unknownLocalProvider ? 185000 : selectedProvider === 'kokoro' ? 65000 : 18000;
      const requestId = crypto.randomUUID();
      playback.requestId = requestId;
      playback.requestPending = false; playback.cancellationSent = false;
      playback.cancelRemotely = selectedProvider === 'qwen' || unknownLocalProvider;
      const currentPart = () => this.current(playback) && playback.requestId === requestId;
      this.emit({ owner, status: 'loading', source: playback.source || null, message: chunked
        ? index === 0 ? 'Preparando a primeira parte da fala (1/' + parts.length + ')…'
          : 'Preparando a próxima parte da fala (' + (index + 1) + '/' + parts.length + ')…' : '' });
      const signal = AbortSignal.any([playback.abort.signal, AbortSignal.timeout(timeout)]);
      const body = JSON.stringify({ text, requestId, ...(options?.profile ? { profile: options.profile } : {}), ...(options?.pace ? { pace: options.pace } : {}) });
      const request = async () => {
        playback.requestPending = true;
        try {
          return await this.environment.fetch('/api/speech', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' }, body, signal,
          });
        } catch (error) { if (playback.requestId === requestId) playback.requestPending = false; throw error; }
      };
      let response = await request();
      // A retry belongs to this fragment and shares its ID and original deadline.
      if (response.status === 503 && (knownLocalProvider || unknownLocalProvider) && options?.requireNatural && currentPart()) {
        playback.requestPending = false;
        await response.body?.cancel().catch(() => {});
        if (!await this.waitForRetry(playback) || !currentPart()) return;
        response = await request();
      }
      if (!currentPart()) { await response.body?.cancel().catch(() => {}); return; }
      if (!response.ok) {
        playback.requestPending = false;
        let message = response.status === 401 ? 'Sua sessão expirou. Entre novamente para ouvir a Lumi.'
          : response.status === 429 ? 'Você fez várias tentativas de voz. Aguarde um pouco antes de tentar novamente.' : '';
        if (response.status === 503 && response.headers.get('Content-Type')?.includes('application/json')) {
          try {
            const failure = await response.json() as { code?: unknown };
            if (failure.code === 'VOICE_BUSY') message = 'A voz da Lumi está ocupada terminando outra fala. Aguarde um pouco e tente novamente.';
          } catch { /* Only recognized codes change the user-facing explanation. */ }
        } else await response.body?.cancel().catch(() => {});
        if (message && options?.requireNatural) { this.finish(playback, message); return; }
        throw new Error('speech-unavailable');
      }
      if (!response.headers.get('Content-Type')?.startsWith('audio/')) {
        playback.requestPending = false; await response.body?.cancel().catch(() => {}); throw new Error('speech-unavailable');
      }
      const blob = await response.blob();
      if (playback.requestId === requestId) playback.requestPending = false;
      if (!currentPart()) return;
      if (!blob.size) throw new Error('empty-audio');
      const audio = this.environment.audio();
      playback.audio = audio;
      const provider = response.headers.get('X-Speech-Provider');
      playback.source = provider === 'qwen' ? 'qwen' : provider === 'kokoro' ? 'kokoro' : 'neural';
      this.selectedProvider = playback.source;
      playback.url = this.environment.createURL(blob);
      audio.src = playback.url;
      let ended = false;
      const currentAudio = () => currentPart() && playback.audio === audio && !ended;
      audio.onended = () => {
        if (!currentAudio()) return;
        ended = true;
        if (index + 1 >= parts.length) { this.finish(playback); return; }
        this.disposeAudio(playback);
        void this.playRemotePart(playback, parts, index + 1, playback.source, chunked);
      };
      audio.onplaying = () => {
        if (!currentAudio()) return;
        playback.mouthPaused = false;
        this.emit({ owner, status: 'playing', source: playback.source || 'neural', message: '' });
      };
      audio.onpause = () => { if (currentAudio()) playback.mouthPaused = true; };
      audio.onwaiting = () => { if (currentAudio()) playback.mouthPaused = true; };
      audio.onerror = () => { if (currentAudio()) { ended = true; void this.fallbackToDevice(playback); } };
      void this.prepareMouth(playback, blob);
      this.emit({ owner, status: 'ready', source: playback.source || 'neural', message: '' });
      await this.resume(owner);
    } catch {
      playback.requestPending = false;
      if (!this.current(playback)) return;
      await this.fallbackToDevice(playback);
    }
  }
  playOnDevice = (owner: string, text: string, enabled = true, options?: SpeechOptions) =>
    this.play(owner, text, enabled, { ...options, requireNatural: false, preferDevice: true });
  private waitForRetry(playback: Playback): Promise<boolean> {
    return new Promise(resolve => {
      const done = () => { clearTimeout(timer); playback.abort.signal.removeEventListener('abort', done); resolve(this.current(playback)); };
      const timer = setTimeout(done, 350);
      playback.abort.signal.addEventListener('abort', done, { once: true });
      if (playback.abort.signal.aborted) done();
    });
  }
  resume = async (owner: string) => {
    const playback = this.active;
    if (playback?.pcmAudio && playback.owner === owner) { await playback.pcmAudio.resume(); return; }
    if (!playback?.audio || playback.owner !== owner) return;
    const audio = playback.audio;
    try {
      await audio.play();
      if (this.current(playback) && playback.audio === audio) { playback.mouthPaused = false; this.emit({ owner, status: 'playing', source: playback.source || 'neural', message: '' }); }
    } catch (error) {
      if (!this.current(playback) || playback.audio !== audio) return;
      if (error instanceof Error && error.name === 'NotAllowedError') {
        this.emit({ owner, status: 'ready', source: playback.source || 'neural', message: 'Toque em Tocar áudio para ouvir a Lumi.' });
      } else await this.fallbackToDevice(playback);
    }
  };
  private async fallbackToDevice(playback: Playback) {
    if (!this.current(playback) || playback.fallbackStarted) return;
    playback.fallbackStarted = true;
    this.disposeAudio(playback);
    this.mode = 'browser'; this.checkedUntil = Date.now() + this.retryDelay();
    if (playback.options?.requireNatural) {
      this.finish(playback, 'Não consegui preparar a voz da Lumi agora. Tente novamente ou escolha a voz do dispositivo.'); return;
    }
    await this.speakOnDevice(playback, playback.text);
  }
  private async speakOnDevice(playback: Playback, text: string) {
    const synthesis = this.environment.synthesis;
    if (!synthesis) {
      this.finish(playback, 'A voz está indisponível neste navegador. Tente outro navegador com leitura em português.'); return;
    }
    if (!synthesis.getVoices().length) {
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timeout); synthesis.removeEventListener('voiceschanged', done); playback.abort.signal.removeEventListener('abort', done); resolve(); };
        const timeout = setTimeout(done, 900);
        synthesis.addEventListener('voiceschanged', done);
        playback.abort.signal.addEventListener('abort', done, { once: true });
      });
    }
    if (!this.current(playback)) return;
    const voice = selectPortugueseVoice(synthesis.getVoices(), !this.environment.online());
    if (!voice) {
      this.finish(playback, 'Nenhuma voz em português está disponível. Ative uma voz em português nas configurações do dispositivo.'); return;
    }
    const conversational = playback.options?.profile === 'conversation';
    const phrases = conversational ? conversationSpeechPhrases(text) : speechPhrases(text);
    let index = 0;
    const next = () => {
      if (!this.current(playback)) return;
      const phrase = this.environment.utterance(phrases[index]);
      playback.utterance = phrase;
      phrase.voice = voice; phrase.lang = voice.lang; phrase.rate = conversational ? playback.options?.pace === 'calm' ? .92 : 1 : playback.options?.pace === 'calm' ? .9 : .94; phrase.pitch = 1; phrase.volume = 1;
      let ended = false;
      const currentPhrase = () => this.current(playback) && playback.utterance === phrase && !ended;
      phrase.onstart = () => {
        if (!currentPhrase()) return;
        playback.mouthSpeaking = true; playback.mouthPaused = false; playback.mouthStartedAt = this.clock(); playback.mouthBoundaryAt = undefined;
        this.emit({ owner: playback.owner, status: 'playing', source: 'browser', message: '' });
      };
      phrase.onboundary = event => {
        if (!currentPhrase()) return;
        const word = phrase.text.slice(event.charIndex).match(/^\S+/)?.[0] || '';
        const length = event.charLength || word.length || 3;
        playback.mouthBoundaryAt = this.clock(); playback.mouthBoundaryDuration = Math.min(480, Math.max(130, length * 48));
      };
      phrase.onpause = () => { if (currentPhrase()) playback.mouthPaused = true; };
      phrase.onresume = () => { if (currentPhrase()) { playback.mouthPaused = false; playback.mouthStartedAt = this.clock(); playback.mouthBoundaryAt = undefined; } };
      phrase.onerror = () => { if (currentPhrase()) this.finish(playback, 'Não consegui iniciar a leitura. Toque em Ouvir para tentar novamente.'); };
      phrase.onend = () => {
        if (!currentPhrase()) return;
        ended = true; playback.mouthSpeaking = false;
        phrase.onstart = null; phrase.onboundary = null; phrase.onpause = null; phrase.onresume = null; phrase.onerror = null; phrase.onend = null;
        index++;
        if (index >= phrases.length) { this.finish(playback); return; }
        const sentenceEnd = /[.!?…]["”']?$/.test(phrase.text);
        playback.timer = setTimeout(next, conversational ? sentenceEnd ? playback.options?.pace === 'calm' ? 100 : 60 : 0 : sentenceEnd ? 160 : 70);
      };
      try { synthesis.speak(phrase); } catch { this.finish(playback, 'A leitura está indisponível. Tente novamente.'); }
    };
    this.emit({ owner: playback.owner, status: 'loading', source: 'browser', message: '' });
    next();
  }
}

let browserPlayer: SpeechPlayer | undefined;
export function getSpeechPlayer() {
  if (typeof window === 'undefined') return undefined;
  if (!browserPlayer) {
    browserPlayer = new SpeechPlayer({
      synthesis: 'speechSynthesis' in window ? window.speechSynthesis : undefined,
      utterance: text => new SpeechSynthesisUtterance(text),
      audio: () => new Audio(),
      fetch: (...args) => fetch(...args),
      online: () => navigator.onLine,
      localServer: () => isLoopbackHostname(window.location.hostname),
      createURL: blob => URL.createObjectURL(blob),
      revokeURL: url => URL.revokeObjectURL(url),
      decodeMouthEnvelope: browserMouthEnvelope,
      pcmAudio: window.AudioContext ? events => createPcmPlayback(events) : undefined,
    });
    window.addEventListener('pagehide', () => browserPlayer?.stop());
  }
  return browserPlayer;
}
export const stopSpeech = () => getSpeechPlayer()?.stop();
