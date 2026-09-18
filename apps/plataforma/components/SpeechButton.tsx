'use client';
import { useEffect, useId, useSyncExternalStore } from 'react';
import { LoaderCircle, Play, Square, Volume2 } from 'lucide-react';
import { getSpeechPlayer, IDLE_SPEECH, speechSourceLabel, type SpeechOptions } from '@/lib/speech';
import './speech.css';

const subscribe = (callback: () => void) => getSpeechPlayer()?.subscribe(callback) || (() => {});
const snapshot = () => getSpeechPlayer()?.getSnapshot() || IDLE_SPEECH;
const serverSnapshot = () => IDLE_SPEECH;
export default function SpeechButton({ text, enabled, label = 'Ouvir', className = 'text-btn', iconOnly = false, owner: providedOwner, disabled = false, options }: {
  text: string; enabled: boolean; label?: string; className?: string; iconOnly?: boolean; owner?: string; disabled?: boolean; options?: SpeechOptions;
}) {
  const generatedOwner = useId(), description = useId();
  const owner = providedOwner || generatedOwner;
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const mine = state.owner === owner;
  const active = mine && state.status !== 'idle';
  const loading = active && state.status === 'loading', ready = active && state.status === 'ready';
  useEffect(() => { void getSpeechPlayer()?.prepare(); }, []);
  useEffect(() => () => { getSpeechPlayer()?.stop(owner); }, [owner, text, enabled, options?.profile, options?.pace, options?.requireNatural, options?.preferDevice]);
  const currentLabel = loading ? 'Cancelar preparação' : ready ? 'Tocar áudio' : active ? 'Parar leitura' : label;
  const message = mine && state.message;
  return <span className={'speech-control' + (iconOnly ? ' speech-control-icon' : '')}>
    <button type="button" disabled={disabled} className={className + (active ? ' speech-active' : '')}
      aria-label={currentLabel} aria-pressed={active} aria-describedby={message || active ? description : undefined}
      title={currentLabel} onClick={() => {
        const player = getSpeechPlayer();
        if (ready) void player?.resume(owner);
        else if (active) player?.stop(owner);
        else void player?.play(owner, text, enabled, options);
      }}>
      {loading ? <LoaderCircle size={iconOnly ? 21 : 15} className="spin"/> : ready ? <Play size={iconOnly ? 21 : 15}/> : active ? <Square size={iconOnly ? 21 : 15}/> : <Volume2 size={iconOnly ? 21 : 15}/>}
      {!iconOnly && <span>{loading ? 'Preparando…' : currentLabel}</span>}
    </button>
    <small id={description} className={'speech-caption' + (iconOnly && !message ? ' sr-only' : '')} role="status">
      {message || (active ? loading ? 'Preparando a voz da Lumi' : speechSourceLabel(state.source) : '')}
    </small>
  </span>;
}
