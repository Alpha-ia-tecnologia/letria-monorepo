'use client';

import { useEffect, useEffectEvent, useId, useRef, useState, type CSSProperties } from 'react';
import { Check, ChevronLeft, ChevronRight, Flag, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { advanceSimulationPlayback, initialSimulationPlayback, type SimulationPlaybackAction } from '@/lib/simulation-playback';
import type { ProgramSimulationData, SimulationFrame, SimulationModel } from '@/lib/program-simulation-types';
import './program-simulation.css';

type ProgramSimulationProps = {
  simulation: ProgramSimulationData;
  onFinish?: () => void;
  onPlayingChange?: (playing: boolean) => void;
};

const SPEEDS = [{ value: 1500, label: 'Devagar' }, { value: 900, label: 'Normal' }, { value: 500, label: 'Rápido' }];

function prefersReducedMotion() {
  return typeof document === 'undefined' || document.documentElement.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function TrackScene({ model, frame }: { model: Extract<SimulationModel, { kind: 'track' }>; frame: SimulationFrame }) {
  const activeIndex = Math.max(0, model.places.findIndex(place => place.id === (frame.active ?? model.start)));
  const count = model.places.length;
  return <div className="ps-track" style={{ '--ps-places': Math.max(1, count) } as CSSProperties}>
    <div className="ps-track-rail" aria-hidden="true"><span style={{ width: `${count > 1 ? activeIndex / (count - 1) * 100 : 0}%` }} /></div>
    <div className="ps-traveler" style={{ left: `${(activeIndex + .5) / Math.max(1, count) * 100}%` }} role="img" aria-label={`Robô em ${model.places[activeIndex]?.label ?? 'seu ponto inicial'}`}>🤖</div>
    {model.places.map(place => <div key={place.id} className={`ps-place${frame.visited?.includes(place.id) ? ' is-visited' : ''}${frame.active === place.id ? ' is-active' : ''}`}>
      <span className="ps-place-symbol" aria-hidden="true">{place.symbol}</span>
      <strong>{place.label}</strong>
      <small>{place.id === model.goal ? 'Destino ⭐' : frame.visited?.includes(place.id) ? 'Visitado ✓' : '\u00a0'}</small>
    </div>)}
  </div>;
}

function GridScene({ model, frame }: { model: Extract<SimulationModel, { kind: 'grid' }>; frame: SimulationFrame }) {
  const active = frame.active ?? model.start;
  const position = active?.split(',').map(Number);
  const robot = model.start !== undefined && position?.length === 2 && position.every(Number.isFinite);
  return <div className="ps-grid-scene" style={{ '--ps-columns': model.columns, '--ps-rows': model.rows } as CSSProperties}>
    <div className="ps-grid-columns" aria-hidden="true">{Array.from({ length: model.columns }, (_, column) => <span key={column}>{column + 1}</span>)}</div>
    <div className="ps-grid-rows" aria-hidden="true">{Array.from({ length: model.rows }, (_, row) => <span key={row}>{row + 1}</span>)}</div>
    <div className="ps-grid" role="group" aria-label={`Cenário com ${model.rows} linhas e ${model.columns} colunas`}>
      {Array.from({ length: model.rows * model.columns }, (_, index) => {
        const row = Math.floor(index / model.columns), column = index % model.columns, id = `${row},${column}`;
        const planted = frame.planted?.includes(id), rock = model.rocks.includes(id), goal = model.goal === id;
        const visited = frame.visited?.includes(id), current = active === id;
        const content = rock ? 'pedra' : planted ? 'flor plantada' : goal ? 'estrela de chegada' : 'livre';
        return <div key={id} className={`ps-grid-cell${visited ? ' is-visited' : ''}${current ? ' is-active' : ''}${planted ? ' is-planted' : ''}${rock ? ' is-rock' : ''}`} role="img" aria-label={`Linha ${row + 1}, coluna ${column + 1}: ${content}${current ? ', posição atual' : ''}`}>
          <span aria-hidden="true">{rock ? '🪨' : planted ? '🌼' : goal ? '⭐' : visited ? '•' : ''}</span>
        </div>;
      })}
      {robot && position && <span className="ps-grid-robot" style={{ left: `${(position[1] + .5) / model.columns * 100}%`, top: `${(position[0] + .5) / model.rows * 100}%` }} aria-hidden="true">🤖</span>}
    </div>
  </div>;
}

function PotsScene({ model, frame }: { model: Extract<SimulationModel, { kind: 'pots' }>; frame: SimulationFrame }) {
  return <div className="ps-pots" role="group" aria-label="Estado das plantas depois deste passo">
    {model.pots.map(pot => {
      const state = frame.pots?.[pot.id] ?? { dry: pot.dry, action: null };
      const active = frame.active === pot.id;
      const status = state.overwatered ? 'Água em excesso' : state.action === 'water' ? 'Regado' : state.dry ? 'Terra seca' : 'Terra úmida';
      return <div key={pot.id} className={`ps-pot${active ? ' is-active' : ''}${state.dry ? ' is-dry' : ' is-watered'}${state.overwatered ? ' is-overwatered' : ''}`}>
        <span className="ps-pot-action" aria-hidden="true">{state.action === 'water' ? '💧' : state.action === 'skip' ? '✓' : '\u00a0'}</span>
        <span className="ps-pot-plant" aria-hidden="true">{state.dry ? '🥀' : '🪴'}</span>
        <strong>{pot.label}</strong><span className="ps-soil" aria-hidden="true" /><small>{status}</small>
      </div>;
    })}
  </div>;
}

function StoryScene({ model, frame }: { model: Extract<SimulationModel, { kind: 'story' }>; frame: SimulationFrame }) {
  const title = model.theme === 'picnic' ? 'Nosso piquenique' : model.theme === 'garden' ? 'Nosso jardim' : 'O que mudou neste passo';
  return <div className={`ps-story ps-story-${model.theme}`} role="group" aria-label={title}>
    <span className="ps-story-scenery" aria-hidden="true">{model.theme === 'picnic' ? '🌳 ☀️ 🌳' : model.theme === 'garden' ? '🌿 ☀️ 🌿' : '✨'}</span>
    <div className="ps-story-props">
      {frame.tokens?.length ? frame.tokens.map((token, index) => <div key={`${token.id}-${index}`} className={`ps-story-prop${frame.active === token.id ? ' is-active' : ''}`}>
        <span aria-hidden="true">{token.symbol}</span><strong>{token.label}</strong>
      </div>) : <div className="ps-story-empty"><span aria-hidden="true">✨</span><strong>Vamos preparar tudo!</strong></div>}
    </div>
    <span className="ps-story-ground" aria-hidden="true" />
  </div>;
}

function GraphScene({ model, frame }: { model: Extract<SimulationModel, { kind: 'graph' }>; frame: SimulationFrame }) {
  const active = model.nodes.find(node => node.id === (frame.active ?? model.start));
  const visited = frame.visited ?? [];
  return <svg className="ps-graph" viewBox="0 0 100 100" role="img" aria-label={`Viagem entre ilhas. Robô em ${active?.label ?? 'seu ponto inicial'}. Ilhas visitadas: ${visited.map(id => model.nodes.find(node => node.id === id)?.label).filter(Boolean).join(', ') || 'nenhuma'}.`}>
    {model.edges.map(([from, to]) => {
      const start = model.nodes.find(node => node.id === from), end = model.nodes.find(node => node.id === to);
      if (!start || !end) return null;
      const traveled = visited.some((node, index) => index > 0 && ((node === from && visited[index - 1] === to) || (node === to && visited[index - 1] === from)));
      return <line key={`${from}-${to}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={traveled ? 'is-visited' : ''} />;
    })}
    {model.nodes.map(node => <g key={node.id} className={`ps-graph-island${visited.includes(node.id) ? ' is-visited' : ''}${active?.id === node.id ? ' is-active' : ''}`}>
      <ellipse cx={node.x} cy={node.y + 2} rx="9" ry="7" />
      <text x={node.x} y={node.y + 1} className="ps-graph-symbol" aria-hidden="true">{node.symbol}</text>
      <text x={node.x} y={node.y + 12} className="ps-graph-name">{node.label}</text>
      {node.id === model.goal && <text x={node.x + 7} y={node.y - 6} className="ps-graph-goal" aria-hidden="true">⭐</text>}
    </g>)}
    {active && <g className="ps-graph-robot" style={{ transform: `translate(${active.x}px, ${active.y - 6}px)` }} aria-hidden="true"><circle r="6" /><text x="0" y="2.2">🤖</text></g>}
  </svg>;
}

function Scene({ model, frame }: { model: SimulationModel; frame: SimulationFrame }) {
  switch (model.kind) {
    case 'track': return <TrackScene model={model} frame={frame} />;
    case 'grid': return <GridScene model={model} frame={frame} />;
    case 'pots': return <PotsScene model={model} frame={frame} />;
    case 'story': return <StoryScene model={model} frame={frame} />;
    case 'graph': return <GraphScene model={model} frame={frame} />;
  }
}

export default function ProgramSimulation({ simulation, onFinish, onPlayingChange }: ProgramSimulationProps) {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [playback, setPlayback] = useState(() => initialSimulationPlayback(simulation.frames.length, prefersReducedMotion()));
  const [speed, setSpeed] = useState(900);
  const finished = useRef(false);
  const notifyFinish = useEffectEvent(() => onFinish?.());
  const notifyPlaying = useEffectEvent((playing: boolean) => onPlayingChange?.(playing));
  const count = simulation.frames.length;
  const atEnd = count > 0 && playback.index === count - 1;
  const frame = simulation.frames[playback.index];

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!playback.playing) return;
    const timer = window.setTimeout(() => setPlayback(previous => advanceSimulationPlayback(previous, 'tick', count)), speed);
    return () => window.clearTimeout(timer);
  }, [playback.index, playback.playing, count, speed]);

  useEffect(() => {
    notifyPlaying(playback.playing);
  }, [playback.playing]);

  useEffect(() => () => notifyPlaying(false), []);

  useEffect(() => {
    if (atEnd && !finished.current) {
      finished.current = true;
      notifyFinish();
    }
  }, [atEnd]);

  function navigate(action: SimulationPlaybackAction) {
    setPlayback(previous => advanceSimulationPlayback(previous, action, count));
  }

  if (!frame) return <p className="ps-empty">Monte os passos do programa para acompanhar a simulação.</p>;

  return <section className={`program-simulation ps-tone-${frame.tone}${playback.playing ? ' is-playing' : ''}`} aria-labelledby={titleId}>
    <header className="ps-heading"><div><span className="ps-eyebrow">Seu programa em ação</span><h2 id={titleId} ref={headingRef} tabIndex={-1}>{simulation.title}</h2></div><span className="ps-step-count">Etapa {playback.index + 1}/{count}</span></header>
    <div className="ps-progress" role="progressbar" aria-label="Progresso da simulação" aria-valuemin={0} aria-valuemax={Math.max(1, count - 1)} aria-valuenow={playback.index}><span style={{ width: `${count > 1 ? playback.index / (count - 1) * 100 : 100}%` }} /></div>
    <div className="ps-scene"><Scene model={simulation.model} frame={frame} /></div>
    {(frame.counters?.length || frame.condition) && <div className="ps-observations">
      {frame.counters?.map((counter, index) => <span className="ps-counter" key={`${counter.label}-${index}`}>{counter.label}: <strong>{counter.value}</strong></span>)}
      {frame.condition && <span className={`ps-condition${frame.condition.value ? ' is-true' : ''}`}><span>{frame.condition.label}</span><strong>{frame.condition.value ? 'Sim ✓' : 'Não'}</strong></span>}
    </div>}
    <div className="ps-narration" aria-live="polite" aria-atomic="true"><span className="ps-narration-icon" aria-hidden="true">{frame.tone === 'success' ? <Check size={20} /> : frame.tone === 'warning' ? '🔎' : '▶'}</span><div><strong>{frame.instruction}</strong><p>{frame.description}</p></div></div>
    {!!simulation.instructions.length && <details className="ps-instructions"><summary>Ver meu programa <span>{frame.activeInstruction ? simulation.instructions.find(instruction => instruction.id === frame.activeInstruction)?.label : 'Pronto para começar'}</span></summary>
      <ol>{simulation.instructions.map(instruction => <li key={instruction.id} className={instruction.id === frame.activeInstruction ? 'is-current' : ''} aria-current={instruction.id === frame.activeInstruction ? 'step' : undefined}>{instruction.id === frame.activeInstruction && <span className="ps-current-marker" aria-hidden="true">▶ </span>}{instruction.label}</li>)}</ol>
    </details>}
    <div className="ps-controls" aria-label="Controles da simulação">
      <div className="ps-playback-buttons">
        <button type="button" className="ps-play-button" onClick={() => navigate('toggle')} disabled={count < 2} aria-label={playback.playing ? 'Pausar simulação' : atEnd ? 'Reproduzir simulação novamente' : 'Reproduzir simulação'}>{playback.playing ? <Pause size={17} /> : <Play size={17} />}<span>{playback.playing ? 'Pausar' : atEnd ? 'Rever' : 'Reproduzir'}</span></button>
        <button type="button" onClick={() => navigate('previous')} disabled={playback.index === 0} aria-label="Passo anterior" title="Passo anterior"><ChevronLeft size={20} /><span className="ps-step-button-label">Anterior</span></button>
        <button type="button" onClick={() => navigate('next')} disabled={atEnd} aria-label="Próximo passo" title="Próximo passo"><span className="ps-step-button-label">Próximo</span><ChevronRight size={20} /></button>
        <button type="button" onClick={() => navigate('restart')} disabled={count < 2 || playback.index === 0 && playback.playing} aria-label="Recomeçar simulação" title="Recomeçar simulação"><RotateCcw size={17} /></button>
      </div>
      <label className="ps-speed">Velocidade<select value={speed} onChange={event => setSpeed(Number(event.target.value))}>{SPEEDS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <button type="button" className="ps-result-button" onClick={() => navigate('finish')} disabled={atEnd}>{atEnd ? <Flag size={16} /> : <SkipForward size={16} />}<span>{atEnd ? 'Fim da simulação' : 'Ver resultado'}</span></button>
    </div>
  </section>;
}
