export interface VoiceInputState {
  status: 'idle' | 'listening' | 'processing' | 'error';
  transcript: string;
  interim: string;
  error: string;
}
export const IDLE_VOICE_INPUT: VoiceInputState = { status: 'idle', transcript: '', interim: '', error: '' };
export interface RecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: { transcript: string };
}
export interface RecognitionResultEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
export interface RecognitionErrorEvent { error: string }
export interface RecognitionEngine {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionFactory = () => RecognitionEngine;
type RecognitionWindow = Window & {
  SpeechRecognition?: new () => RecognitionEngine;
  webkitSpeechRecognition?: new () => RecognitionEngine;
};

/** Feature detection does not request permission or start a microphone. */
export function getBrowserRecognitionFactory(): RecognitionFactory | undefined {
  if (typeof window === 'undefined') return undefined;
  const browser = window as RecognitionWindow;
  const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  return Constructor ? () => new Constructor() : undefined;
}
function recognitionError(code: string) {
  switch (code) {
    case 'not-allowed': case 'service-not-allowed': case 'NotAllowedError':
      return 'O microfone não foi autorizado. Permita o acesso nas configurações do navegador ou escreva sua dúvida.';
    case 'audio-capture': case 'NotFoundError':
      return 'Não encontrei um microfone disponível. Confira a conexão do microfone ou escreva sua dúvida.';
    case 'network':
      return 'A conexão com o reconhecimento de voz falhou. Tente novamente ou escreva sua dúvida.';
    case 'no-speech':
      return 'Não consegui ouvir sua fala. Toque no microfone e tente novamente, ou escreva sua dúvida.';
    case 'language-not-supported': case 'NotSupportedError':
      return 'O reconhecimento de voz em português não está disponível neste navegador. Você pode escrever sua dúvida.';
    default:
      return 'Não foi possível ouvir agora. Tente novamente ou escreva sua dúvida.';
  }
}
const MAX_CHARACTERS = 500;
const MAX_SESSION_MS = 30000;
const FINAL_RESULT_WAIT_MS = 2000;

/** Native recognition only: no application audio recording, uploads or storage. */
export class VoiceInput {
  private state = IDLE_VOICE_INPUT;
  private listeners = new Set<() => void>();
  private generation = 0;
  private active?: RecognitionEngine;
  private sessionTimer?: ReturnType<typeof setTimeout>;
  private finalTimer?: ReturnType<typeof setTimeout>;
  private results = new Map<number, { text: string; final: boolean }>();
  constructor(private factory?: RecognitionFactory) {}
  getSnapshot = () => this.state;
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  private emit(state: VoiceInputState) { this.state = state; this.listeners.forEach(listener => listener()); }
  private current(engine: RecognitionEngine, generation: number) { return this.active === engine && this.generation === generation; }
  private release(abort: boolean) {
    clearTimeout(this.sessionTimer); clearTimeout(this.finalTimer);
    this.sessionTimer = undefined; this.finalTimer = undefined;
    const engine = this.active; this.active = undefined;
    if (!engine) return;
    engine.onstart = null; engine.onresult = null; engine.onerror = null; engine.onend = null;
    if (abort) { try { engine.abort(); } catch { /* Recognition may already have ended. */ } }
  }
  private finish(error = '', abort = false) {
    this.release(abort);
    const transcript = this.state.transcript;
    const message = error || (!transcript ? recognitionError('no-speech') : '');
    this.emit({ status: message ? 'error' : 'idle', transcript, interim: '', error: message });
  }
  /** Call synchronously from a user click. Returns false when starting failed. */
  start = (): boolean => {
    this.generation++;
    this.release(true); this.results.clear();
    if (!this.factory) {
      this.emit({ ...IDLE_VOICE_INPUT, status: 'error', error: 'Este navegador não oferece entrada por voz. Você pode escrever sua dúvida para a Lumi.' });
      return false;
    }
    let engine: RecognitionEngine;
    try { engine = this.factory(); }
    catch (error) {
      this.emit({ ...IDLE_VOICE_INPUT, status: 'error', error: recognitionError(error instanceof Error ? error.name : '') });
      return false;
    }
    const generation = this.generation;
    this.active = engine;
    engine.lang = 'pt-BR'; engine.continuous = true; engine.interimResults = true; engine.maxAlternatives = 1;
    engine.onstart = () => {
      if (this.current(engine, generation) && this.state.status !== 'processing') this.emit({ ...this.state, status: 'listening' });
    };
    engine.onresult = event => {
      if (!this.current(engine, generation)) return;
      // Recognition results are an indexed session list, not incremental strings.
      // Replacing an interim result must not duplicate a previously finalized word.
      for (const index of this.results.keys()) if (index >= event.results.length) this.results.delete(index);
      const from = Number.isInteger(event.resultIndex) && event.resultIndex >= 0 ? event.resultIndex : 0;
      for (let index = from; index < event.results.length; index++) {
        const result = event.results[index];
        const text = result?.[0]?.transcript;
        if (typeof text === 'string') this.results.set(index, { text: text.replace(/\s+/g, ' ').trim().slice(0, MAX_CHARACTERS), final: !!result.isFinal });
      }
      const parts = [...this.results.entries()].sort(([left], [right]) => left - right).map(([, result]) => result);
      const transcript = parts.filter(result => result.final).map(result => result.text).filter(Boolean).join(' ').slice(0, MAX_CHARACTERS);
      const interim = parts.filter(result => !result.final).map(result => result.text).filter(Boolean).join(' ').slice(0, Math.max(0, MAX_CHARACTERS - transcript.length));
      this.emit({ ...this.state, transcript, interim, error: '' });
      if (transcript.length + interim.length >= MAX_CHARACTERS) this.stop();
    };
    engine.onerror = event => {
      if (!this.current(engine, generation)) return;
      if (event.error === 'aborted') { this.release(false); this.emit({ ...this.state, status: 'idle', interim: '', error: '' }); }
      else this.finish(recognitionError(event.error), true);
    };
    engine.onend = () => { if (this.current(engine, generation)) this.finish(); };
    this.emit({ ...IDLE_VOICE_INPUT, status: 'listening' });
    this.sessionTimer = setTimeout(() => { if (this.current(engine, generation)) this.stop(); }, MAX_SESSION_MS);
    try { engine.start(); return true; }
    catch (error) {
      this.finish(recognitionError(error instanceof Error ? error.name : ''), true);
      return false;
    }
  };
  /** Finish this utterance and briefly wait for its final transcript. */
  stop = () => {
    const engine = this.active;
    if (!engine || this.state.status === 'processing') return;
    const generation = this.generation;
    clearTimeout(this.sessionTimer); this.sessionTimer = undefined;
    this.emit({ ...this.state, status: 'processing' });
    this.finalTimer = setTimeout(() => { if (this.current(engine, generation)) this.finish('', true); }, FINAL_RESULT_WAIT_MS);
    try { engine.stop(); }
    catch { if (this.current(engine, generation)) this.finish('', true); }
  };
  /** Cancel on context changes/close; late native events cannot restore old text. */
  abort = () => {
    this.generation++;
    this.release(true); this.results.clear();
    this.emit(IDLE_VOICE_INPUT);
  };
}