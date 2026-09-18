'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, AudioLines, Check, Lightbulb, LoaderCircle, Maximize2, Minimize2, ScanFace, Settings2, MessageCircle, Mic, MicOff, Play, RotateCcw, Sparkles, Square, Volume2, VolumeX, X } from 'lucide-react';
import type { Activity, Question } from '@/lib/content';
import { localTutorReply, type TutorMessage, type TutorReply } from '@/lib/tutor';
import { getSpeechPlayer, IDLE_SPEECH, speechSourceLabel, type SpeechOptions } from '@/lib/speech';
import { VoiceInput, getBrowserRecognitionFactory } from '@/lib/speech-recognition';
import { useLocalPreference } from '@/lib/preferences';
import { acquireBodyScrollLock } from '@/lib/body-scroll-lock';
import { createActivityFullscreen, getInlineFullscreenSnapshot } from '@/lib/activity-fullscreen';
import { createConversationScroll } from '@/lib/conversation-scroll';
import SpeechButton from './SpeechButton';
import { lumiGreeting } from '@/lib/speech-content';
import LumiCharacter from './LumiCharacter';
import Lumi3D from './Lumi3D';
import './journey.css';
import './learning-playful.css';
import './lumi-live.css';
import './lumi-chat-layout.css';

type Props = {
  activity?: Activity; question?: Question; topic?: 'computational'; sound: boolean;
  open: boolean; onOpen: () => void; onClose: () => void;
  reducedMotion?: boolean; allowMicrophone?: boolean;
};
type ChatMessage = TutorMessage & { id: string; mode?: 'ai' | 'local' };
const subscribeSpeech = (callback: () => void) => getSpeechPlayer()?.subscribe(callback) || (() => {});
const speechSnapshot = () => getSpeechPlayer()?.getSnapshot() || IDLE_SPEECH;
const serverSpeech = () => IDLE_SPEECH;
const idleVoice = { status: 'idle' as const, transcript: '', interim: '', error: '' };
const noSubscribe = () => () => {};
const microphoneAvailable = () => !!getBrowserRecognitionFactory();
const serverFalse = () => false;
function motionSubscribe(callback: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
const motionSnapshot = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function LumiTutor(props: Props) {
  const context = [props.activity?.id, (props.activity as (Activity & { version?: number }) | undefined)?.version, props.question?.id, props.topic].join(':');
  return <div className="lumi-companion playful-lumi lumi-live">
    {!props.open && <button className="lumi-launcher" onClick={props.onOpen} aria-label="Conversar com a Lumi em 3D"><LumiCharacter /><span><strong>Vamos descobrir juntos?</strong><small>Converse com a Lumi <Sparkles size={12} /></small></span></button>}
    {props.open && <LumiConversation key={context} {...props} />}
  </div>;
}

function LumiConversation({ activity, question, topic, sound, onClose, reducedMotion = false, allowMicrophone = false }: Props) {
  const scope = 'lumi:' + useId() + ':';
  const titleId = useId(), inputId = useId(), helpId = useId(), historyId = useId();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [mode, setMode] = useState<'ai' | 'local'>('local');
  const [autoVoice, saveAutoVoice] = useLocalPreference('letria-lumi-auto-voice', 'true');
  const [savedPace, savePace] = useLocalPreference('letria-lumi-voice-pace', 'natural');
  const [fixedVoice, setFixedVoice] = useState(false);
  const voicePace = !fixedVoice && savedPace === 'calm' ? 'calm' : 'natural';
  const voiceOptions = useMemo<SpeechOptions>(() => ({ profile: 'conversation', pace: voicePace, requireNatural: true }), [voicePace]);
  const [voice] = useState(() => new VoiceInput(getBrowserRecognitionFactory()));
  const voiceState = useSyncExternalStore(voice.subscribe, voice.getSnapshot, () => idleVoice);
  const speech = useSyncExternalStore(subscribeSpeech, speechSnapshot, serverSpeech);
  const hasMicrophone = useSyncExternalStore(noSubscribe, microphoneAvailable, serverFalse);
  const systemReducedMotion = useSyncExternalStore(motionSubscribe, motionSnapshot, serverFalse);
  const panel = useRef<HTMLDivElement>(null), conversation = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const closeHandler = useRef(onClose);
  const fullscreen = useMemo(() => createActivityFullscreen(), []);
  const fullscreenState = useSyncExternalStore(fullscreen.subscribe, fullscreen.getSnapshot, getInlineFullscreenSnapshot);
  const [featured, setFeatured] = useState(false);
  const historyScroll = useMemo(() => createConversationScroll(), []);
  const unread = useSyncExternalStore(historyScroll.subscribe, historyScroll.getSnapshot, serverFalse);
  const controller = useRef<AbortController | null>(null), lock = useRef(false), generation = useRef(0), counter = useRef(0);
  const microphonePrefix = useRef('');
  const soundEnabled = useRef(sound), speakAutomatically = useRef(autoVoice === 'true');
  const ownsSpeech = speech.owner?.startsWith(scope) ?? false;
  const speaking = ownsSpeech && speech.status === 'playing';
  const speechLoading = ownsSpeech && speech.status === 'loading';
  const speechReady = ownsSpeech && speech.status === 'ready';
  const listening = voiceState.status === 'listening', transcribing = voiceState.status === 'processing';
  const recording = listening || transcribing;
  const mood = recording ? 'listening' : busy || speechLoading ? 'thinking' : speaking ? 'speaking' : 'idle';
  const greeting = lumiGreeting(question ? 'question' : topic === 'computational' ? 'computational' : 'general');
  const suggestions = question ? ['Me dê uma pista', 'Como faço esta atividade?', 'O que é uma sílaba?'] : topic === 'computational' ? ['O que é um padrão?', 'Como programar o robô?', 'Como corrigir um passo?'] : ['Como crescem as ilhas?', 'Como avanço na trilha?', 'O que é uma rima?'];

  const stopLumi = useCallback(() => {
    const player = getSpeechPlayer();
    const current = player?.getSnapshot();
    if (current?.owner?.startsWith(scope)) player?.stop(current.owner);
  }, [scope]);
  const mouthLevel = useCallback(() => {
    const player = getSpeechPlayer();
    return player?.getSnapshot().owner?.startsWith(scope) ? player.getMouthLevel() : 0;
  }, [scope]);

  useEffect(() => {
    let active = true;
    const player = getSpeechPlayer();
    void player?.prepare().then(() => { if (active) setFixedVoice(player.getVoiceCapabilities().fixedVoice); });
    return () => { active = false; };
  }, []);
  useEffect(() => { soundEnabled.current = sound; speakAutomatically.current = autoVoice === 'true'; if (!sound) stopLumi(); }, [sound, autoVoice, stopLumi]);
  useEffect(() => { if (!allowMicrophone) voice.abort(); }, [allowMicrophone, voice]);
  useEffect(() => voice.subscribe(() => {
    const state = voice.getSnapshot();
    if (state.transcript) setText([microphonePrefix.current, state.transcript].filter(Boolean).join(' ').slice(0, 500));
  }), [voice]);
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/api/tutor', { signal: abort.signal, credentials: 'same-origin', cache: 'no-store' })
      .then(async response => { if (!response.ok) return; const result = await response.json() as { mode?: string }; if (!abort.signal.aborted) setMode(result.mode === 'ai' ? 'ai' : 'local'); }).catch(() => {});
    const invalidateRequest = () => { generation.current++; controller.current?.abort(); lock.current = false; };
    return () => { abort.abort(); invalidateRequest(); voice.abort(); stopLumi(); };
  }, [voice, stopLumi]);
  useEffect(() => { closeHandler.current = onClose; }, [onClose]);
  useEffect(() => fullscreen.connect(document, panel.current), [fullscreen]);
  useEffect(() => {
    const element = conversation.current;
    if (!element) return;
    const disconnect = historyScroll.connect(element);
    const observer = new ResizeObserver(() => historyScroll.resized());
    observer.observe(element);
    return () => { observer.disconnect(); disconnect(); };
  }, [historyScroll]);
  useEffect(() => {
    const last = messages.at(-1);
    historyScroll.update(last?.id ?? null, last?.role);
  }, [messages, busy, historyScroll]);
  useEffect(() => { historyScroll.resized(); }, [fullscreenState.expanded, featured, historyScroll]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const releaseScroll = acquireBodyScrollLock(document.body);
    panel.current?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (fullscreen.getSnapshot().expanded) void fullscreen.exit(); else closeHandler.current(); return; }
      if (event.key !== 'Tab') return;
      const elements = [...(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], summary, [tabindex="0"]') || [])].filter(element => element.getClientRects().length > 0);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', key);
    return () => { releaseScroll(); document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [fullscreen]);
  useEffect(() => {
    const interrupt = () => { if (document.hidden) { voice.abort(); stopLumi(); } };
    document.addEventListener('visibilitychange', interrupt);
    return () => document.removeEventListener('visibilitychange', interrupt);
  }, [voice, stopLumi]);

  function toggleFeatured() {
    if (fullscreenState.expanded && featured) setFeatured(false);
    else {
      setFeatured(true);
      if (!fullscreenState.expanded) void fullscreen.toggle();
    }
  }
  function cancelRequest() {
    generation.current++; controller.current?.abort(); lock.current = false; setBusy(false);
  }
  function reset() {
    cancelRequest(); voice.abort(); stopLumi(); setMessages([]); setText(''); setNotice(''); input.current?.focus();
  }
  function toggleMicrophone() {
    if (listening) { voice.stop(); return; }
    if (transcribing) { voice.abort(); return; }
    if (!allowMicrophone || !hasMicrophone || busy) return;
    getSpeechPlayer()?.stop(); setNotice(''); microphonePrefix.current = text.trim(); voice.start();
  }
  function addReply(reply: string, replyMode: 'ai' | 'local', epoch: number) {
    if (generation.current !== epoch) return;
    const id = String(++counter.current);
    setMessages(previous => [...previous, { id, role: 'assistant', content: reply, mode: replyMode }]);
    setMode(replyMode);
    if (soundEnabled.current && speakAutomatically.current && !document.hidden) void getSpeechPlayer()?.play(scope + id, reply, true, voiceOptions);
  }
  async function ask(value: string) {
    const message = value.trim();
    if (!message || message.length > 500 || lock.current || recording) return;
    voice.abort(); stopLumi(); lock.current = true; setBusy(true); setText(''); setNotice('');
    const epoch = ++generation.current;
    const history = messages.slice(-6).map(({ role, content }) => ({ role, content }));
    setMessages(previous => [...previous, { id: String(++counter.current), role: 'user', content: message }]);
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 19000);
    try {
      if (!navigator.onLine) {
        addReply(localTutorReply(message, { activity, question, topic }), 'local', epoch);
        setNotice('Sem conexão. Podemos continuar com as pistas da Letria.'); return;
      }
      const response = await fetch('/api/tutor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', cache: 'no-store', signal: abort.signal,
        body: JSON.stringify({ message, topic, activityId: activity?.id, activityVersion: (activity as (Activity & { version?: number }) | undefined)?.version, questionId: question?.id, history }),
      });
      const result = await response.json() as TutorReply & { error?: string };
      if (generation.current !== epoch) return;
      if (!response.ok || !result.ok) {
        if ([400, 401, 403, 429].includes(response.status)) { setNotice(result.error || 'Não consegui conversar agora. Tente novamente em instantes.'); setText(message); return; }
        throw new Error('unavailable');
      }
      if (typeof result.reply !== 'string' || !result.reply.trim()) throw new Error('empty_reply');
      addReply(result.reply.slice(0, 1200), result.mode === 'ai' ? 'ai' : 'local', epoch);
      if (result.reason === 'unavailable') setNotice('A conversa com IA está indisponível. Aqui vai uma pista da Letria.');
    } catch {
      if (generation.current !== epoch) return;
      addReply(localTutorReply(message, { activity, question, topic }), 'local', epoch);
      setNotice('A conexão demorou. Vamos continuar com uma pista da Letria.');
    } finally {
      clearTimeout(timeout);
      if (generation.current === epoch) { lock.current = false; setBusy(false); }
    }
  }
  function submit(event: FormEvent) { event.preventDefault(); void ask(text); }
  const voiceNeedsHelp = ownsSpeech && speech.status === 'idle' && !!speech.message && sound;
  const replayText = messages.find(message => message.role === 'assistant' && scope + message.id === speech.owner)?.content || greeting;
  const replayOwner = speech.owner || scope + 'greeting';
  const voiceHelp = !allowMicrophone ? 'Para falar pelo microfone, a autorização de voz do estudante deve estar ativa no perfil da família.' : !hasMicrophone ? 'Este navegador não oferece ditado. Você pode escrever sua pergunta.' : 'O ditado usa o serviço de voz do navegador e pode precisar de internet. Revise o texto antes de enviar.';

  return <><button className="lumi-shade" tabIndex={-1} aria-label="Fechar conversa" onClick={onClose} />
    <div className={'lumi-panel lumi-live-panel' + (fullscreenState.expanded ? ' lumi-live-expanded' : '') + (fullscreenState.expanded && featured ? ' lumi-live-featured' : '')} ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="lumi-panel-header lumi-live-header">
        <span className="lumi-live-logo"><Sparkles size={22} /></span>
        <div className="lumi-live-heading"><h2 id={titleId}>Um momento com a Lumi</h2><p>Sua companheira de descobertas</p></div>
        <div className="lumi-live-view-controls">
          <button type="button" className="lumi-view-button" aria-pressed={fullscreenState.expanded} aria-busy={fullscreenState.pending} onClick={() => void fullscreen.toggle()} title={fullscreenState.expanded ? 'Sair da tela cheia (Esc)' : 'Abrir conversa em tela cheia'}>{fullscreenState.expanded ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}<span>{fullscreenState.expanded ? 'Sair da tela cheia' : 'Tela cheia'}</span></button>
          <button type="button" className="lumi-view-button" aria-pressed={fullscreenState.expanded && featured} onClick={toggleFeatured}><ScanFace size={18}/><span>{fullscreenState.expanded && featured ? 'Equilibrar visual' : 'Ampliar Lumi'}</span></button>
        </div>
        <div className="lumi-live-header-actions"><button type="button" className="icon-btn" onClick={reset} aria-label="Começar uma nova conversa" title="Nova conversa"><RotateCcw size={19} /></button><button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar conversa"><X size={22} /></button></div>
      </header>
      <div className="lumi-live-layout">
        <aside className="lumi-live-stage" aria-label="Lumi, sua guia virtual">
          <span className={'lumi-live-badge ' + (mode === 'ai' ? 'is-ai' : '')}><span />{mode === 'ai' ? 'Conversa com IA' : 'Pistas da Letria'}</span>
          <Lumi3D mood={mood} getMouthLevel={mouthLevel} reducedMotion={reducedMotion || systemReducedMotion} className="lumi-live-avatar" />
          <div className="lumi-live-stage-copy" role="status"><strong>{listening ? 'Estou ouvindo você...' : transcribing ? 'Vamos conferir sua pergunta?' : busy ? 'Vamos pensar um pouquinho...' : speechLoading ? 'Preparando minha voz...' : speaking ? 'Uma pista para descobrir!' : 'Oi! Que bom ter você aqui.'}</strong><p>{listening ? 'Toque no microfone para concluir.' : transcribing ? 'Você poderá revisar antes de enviar.' : 'Perguntar também faz parte da aventura.'}</p></div>
          <div className="lumi-live-playback">{speechReady ? <button type="button" onClick={() => void getSpeechPlayer()?.resume(speech.owner!)}><Play size={17} />Tocar resposta</button> : ownsSpeech && speech.status !== 'idle' ? <button type="button" onClick={stopLumi}><Square size={16} />Parar voz</button> : <button type="button" disabled={recording} onClick={() => void getSpeechPlayer()?.play(scope + 'greeting', greeting, sound, voiceOptions)}><Volume2 size={17} />Ouvir a Lumi</button>}</div>
          <small className="lumi-live-voice-source">{ownsSpeech && speech.status !== 'idle' ? speechLoading ? speech.message || 'Só um instante, estou preparando minha voz.' : speechSourceLabel(speech.source) : 'Voz da Lumi gerada por IA'}</small>
        </aside>
        <section className="lumi-live-chat" aria-label="Conversa com a Lumi">
          <div className="lumi-context"><MessageCircle size={15} /><span>{question ? 'Uma pista para este desafio' : topic === 'computational' ? 'Explorando a ilha da lógica' : 'Explorando nosso arquipélago'}</span></div>
          <div className="lumi-history">
          <div className="lumi-conversation" ref={conversation} id={historyId} tabIndex={0} onScroll={historyScroll.scrolled} role="log" aria-label="Histórico da conversa com a Lumi" aria-live="polite" aria-relevant="additions">
            <div className="lumi-message assistant"><span className="lumi-live-author">LUMI</span><p>{greeting}</p></div>
            {messages.map(message => <div className={'lumi-message ' + message.role} key={message.id}><span className="lumi-live-author">{message.role === 'assistant' ? 'LUMI' : 'VOCÊ'}</span><p>{message.content}</p>{message.role === 'assistant' && <div className="lumi-message-footer"><small>{message.mode === 'ai' ? 'Resposta de IA' : 'Pista da Letria'}</small><SpeechButton owner={scope + message.id} text={message.content} enabled={sound} disabled={recording} options={voiceOptions} label="Ouvir" /></div>}</div>)}
            {busy && <div className="lumi-thinking-message" role="status"><LoaderCircle size={16} className="spin" />Preparando uma pista...<button type="button" onClick={cancelRequest}>Cancelar</button></div>}
          </div>
          {unread && <button type="button" className="lumi-new-messages" onClick={historyScroll.latest} aria-controls={historyId}><ArrowDown size={16}/> Novas mensagens</button>}
          </div>
          <div className="lumi-chat-controls">
          {(notice || voiceState.error || (ownsSpeech && speech.message)) && <p className="lumi-notice" role="status">{voiceState.error || notice || speech.message}</p>}
          {voiceNeedsHelp && <div className="lumi-live-voice-recovery"><button type="button" disabled={recording || busy} onClick={() => void getSpeechPlayer()?.play(replayOwner, replayText, sound, voiceOptions)}><Volume2 size={14} />Tentar voz da Lumi</button>{speech.source !== 'browser' && <button type="button" disabled={recording || busy} onClick={() => void getSpeechPlayer()?.playOnDevice(replayOwner, replayText, sound, voiceOptions)}>Usar voz do dispositivo</button>}</div>}
          {recording && <div className="lumi-live-dictation" role="status"><AudioLines size={18} /><span>{voiceState.interim || voiceState.transcript || (listening ? 'Pode falar. Estou ouvindo...' : 'Concluindo o ditado...')}</span></div>}
          <form onSubmit={submit} className="lumi-live-composer"><label className="sr-only" htmlFor={inputId}>Sua pergunta para a Lumi</label><textarea id={inputId} ref={input} value={text} onChange={event => setText(event.target.value)} maxLength={500} rows={2} placeholder="O que vamos descobrir hoje?" disabled={busy || recording} autoComplete="off" aria-describedby={helpId} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><div className="lumi-live-compose-actions"><button type="button" className={'lumi-live-mic ' + (recording ? 'is-listening' : '')} onClick={toggleMicrophone} disabled={!allowMicrophone || !hasMicrophone || busy || (!recording && text.length >= 500)} aria-label={listening ? 'Concluir ditado' : transcribing ? 'Cancelar ditado' : 'Falar pelo microfone'} aria-pressed={recording} title={allowMicrophone && hasMicrophone ? 'Falar pelo microfone' : voiceHelp}>{recording ? <Square size={18} /> : !allowMicrophone || !hasMicrophone ? <MicOff size={19} /> : <Mic size={20} />}</button><small>{text.length}/500</small><button type="submit" className="lumi-live-send" disabled={busy || recording || !text.trim()} aria-label="Enviar pergunta"><ArrowUp size={20} /></button></div></form>
          <div className="lumi-chat-extras">
            <details className="lumi-chat-disclosure"><summary><Lightbulb size={16}/> Ideias para perguntar</summary>
          <div className="lumi-suggestions" aria-label="Ideias para perguntar">{suggestions.map(item => <button key={item} disabled={busy || recording} onClick={() => void ask(item)}>{item}</button>)}</div>
            </details>
            <details className="lumi-chat-disclosure"><summary><Settings2 size={16}/> Voz e opções</summary>
          <div className="lumi-live-options"><button type="button" aria-pressed={autoVoice === 'true' && sound} disabled={!sound} onClick={() => { const next = autoVoice !== 'true'; saveAutoVoice(String(next)); if (!next) stopLumi(); }}>{autoVoice === 'true' && sound ? <Volume2 size={16} /> : <VolumeX size={16} />}Responder em voz{autoVoice === 'true' && sound && <Check size={13} />}</button>{fixedVoice ? <span className="lumi-live-pace">Voz padrão da Lumi</span> : <label className="lumi-live-pace"><span>Ritmo</span><select aria-label="Ritmo da voz da Lumi" value={voicePace} disabled={busy || recording} onChange={event => { stopLumi(); savePace(event.target.value); }}><option value="natural">Natural</option><option value="calm">Mais tranquilo</option></select></label>}</div>
          <p className="lumi-live-microphone-help" id={helpId}>{!sound && 'O som está desligado nas suas preferências. '}{voiceHelp}</p>
          <p className="lumi-footnote">Lumi é uma personagem virtual. {mode === 'ai' ? 'A IA pode errar; seu professor também pode ajudar.' : 'Estas são pistas educativas da Letria.'} Não compartilhe dados pessoais.</p>
            </details>
          </div>
          </div>
        </section>
      </div>
    </div>
  </>;
}
