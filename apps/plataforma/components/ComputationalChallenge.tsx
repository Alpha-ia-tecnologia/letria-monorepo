'use client';

import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import ProgramSimulation from './ProgramSimulation';
import { simulateCurriculumProgram, supportsProgramSimulation } from '@/lib/program-simulation';
import type { ProgramSimulationData } from '@/lib/program-simulation-types';
import { evaluateChallenge } from '@/lib/computational-curriculum';
import type { ChallengeAnswer, ChallengeResult, ChallengeToken, CurriculumActivity } from '@/lib/computational-curriculum-types';
import './computational-challenge.css';

type ChallengeProps = {
  activity: CurriculumActivity;
  onResult: (result: ChallengeResult) => void;
  onChange: () => void;
  onPlayingChange?: (playing: boolean) => void;
};

function initialAnswer(activity: CurriculumActivity): ChallengeAnswer {
  if (activity.kind === 'matrix') return { grid: [...activity.initial] };
  if (activity.kind === 'record') return { fields: Object.fromEntries(activity.fields.map(field => [field.id, field.initial])) };
  if (activity.kind === 'list') return { sequence: [...activity.initial] };
  if (activity.kind === 'graph') return { path: [activity.start] };
  return {};
}

function Token({ token }: { token: ChallengeToken }) {
  return <><span className="lc-symbol" aria-hidden="true">{token.symbol}</span><span>{token.label}</span></>;
}

function Tasks({ tasks }: { tasks: readonly string[] }) {
  return <ol className="lc-tasks">{tasks.map((task, index) => <li key={index}>{task}</li>)}</ol>;
}

function TokenOrder({ title, tokens, value, maxItems, onChange, insert = false }: {
  title: string;
  tokens: readonly ChallengeToken[];
  value: readonly string[];
  maxItems: number;
  onChange: (next: string[]) => void;
  insert?: boolean;
}) {
  const [insertion, setInsertion] = useState('end');
  function add(id: string) {
    const next = [...value];
    next.splice(insertion === 'end' ? value.length : Math.min(Number(insertion), value.length), 0, id);
    onChange(next);
  }
  function move(index: number, offset: number) {
    const next = [...value];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  }
  return <fieldset className="lc-order">
    <legend>{title}</legend>
    <p className="lc-instruction">Escolha as peças abaixo. Use as setas para mudar a ordem ou o × para retirar.</p>
    <ol className="lc-ordered" aria-label={title}>
      {value.map((id, index) => {
        const token = tokens.find(item => item.id === id);
        if (!token) return null;
        return <li key={`${index}-${id}`}>
          <span className="lc-step-number" aria-hidden="true">{index + 1}</span>
          <span className="lc-ordered-token"><Token token={token} /></span>
          <span className="lc-piece-actions">
            <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Mover ${token.label}, passo ${index + 1}, para antes`}>←</button>
            <button type="button" disabled={index === value.length - 1} onClick={() => move(index, 1)} aria-label={`Mover ${token.label}, passo ${index + 1}, para depois`}>→</button>
            <button type="button" onClick={() => onChange(value.filter((_, itemIndex) => index !== itemIndex))} aria-label={`Retirar ${token.label}, passo ${index + 1}`}>×</button>
          </span>
        </li>;
      })}
    </ol>
    {!value.length && <p className="lc-empty">Sua sequência começa aqui.</p>}
    {insert && <label className="lc-inline-field">Inserir a próxima peça
      <select value={insertion} onChange={event => setInsertion(event.target.value)}>
        <option value="end">No final da lista</option>
        {value.map((_, index) => <option key={index} value={index}>Antes da posição {index + 1}</option>)}
      </select>
    </label>}
    <div className="lc-token-pool" aria-label="Peças disponíveis">
      {tokens.map(token => <button type="button" key={token.id} disabled={value.length >= maxItems} onClick={() => add(token.id)} aria-label={`Adicionar ${token.label}`}><Token token={token} /><span aria-hidden="true">+</span></button>)}
    </div>
    <small className="lc-counter">{value.length} de até {maxItems} peças</small>
  </fieldset>;
}

function Direction({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  return <fieldset className="lc-direction"><legend>Em qual direção?</legend><div className="lc-segmented">
    <button type="button" aria-pressed={value === 'back'} onClick={() => onChange('back')}><span aria-hidden="true">←</span> Para trás</button>
    <button type="button" aria-pressed={value === 'forward'} onClick={() => onChange('forward')}>Para a frente <span aria-hidden="true">→</span></button>
  </div></fieldset>;
}

function Count({ label, value, max, onChange }: { label: string; value?: string; max: number; onChange: (value: string) => void }) {
  return <label className="lc-count-field"><span>{label}</span><select value={value ?? ''} onChange={event => onChange(event.target.value)}><option value="">Escolha</option>{Array.from({ length: max }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>;
}

export default function ComputationalChallenge({ activity, onResult, onChange, onPlayingChange }: ChallengeProps) {
  const [answer, setAnswer] = useState<ChallengeAnswer>(() => initialAnswer(activity));
  const [simulation, setSimulation] = useState<{ data: ProgramSimulationData; serial: number } | null>(null);
  const serial = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  function change(patch: Partial<ChallengeAnswer>) {
    setAnswer(current => ({ ...current, ...patch }));
    setSimulation(null);
    onPlayingChange?.(false);
    onChange();
  }
  function parameter(key: string, value: string) { change({ parameters: { ...answer.parameters, [key]: value } }); }
  function toggle(key: 'selected' | 'grid', id: string) {
    const current = answer[key] ?? [];
    change({ [key]: current.includes(id) ? current.filter(value => value !== id) : [...current, id] });
  }
  let content: ReactNode;

  switch (activity.kind) {
    case 'classify':
      content = <fieldset className="lc-card-grid"><legend>Encontre o grupo de cada objeto</legend>{activity.items.map(item => <label key={item.id} className="lc-classify-card"><span className="lc-card-token"><Token token={item} /></span><select value={answer.groups?.[item.id] ?? ''} onChange={event => change({ groups: { ...answer.groups, [item.id]: event.target.value } })} aria-label={`Grupo de ${item.label}`}><option value="">Escolha um grupo</option>{activity.groups.map(group => <option key={group.id} value={group.id}>{group.symbol} {group.label}</option>)}</select></label>)}</fieldset>;
      break;
    case 'sequence':
      content = <>
        {activity.reference && <div className="lc-reference"><h2>Observe este caminho</h2><ol>{activity.reference.map((id, index) => { const token = activity.items.find(item => item.id === id); return token ? <li key={index}><Token token={token} /></li> : null; })}</ol></div>}
        <TokenOrder title="Monte a sequência" tokens={activity.items} value={answer.sequence ?? []} maxItems={activity.expected.length} onChange={sequence => change({ sequence })} />
      </>;
      break;
    case 'select':
      content = <>
        <div className="lc-models">{activity.models.map((model, index) => <section className="lc-model" key={index}><h2>{model.title}</h2><ul>{model.attributes.map(attribute => <li key={attribute}>{attribute}</li>)}</ul></section>)}</div>
        <fieldset className="lc-card-grid"><legend>Escolha as características</legend>{activity.items.map(item => <button type="button" className="lc-select-card" key={item.id} aria-pressed={(answer.selected ?? []).includes(item.id)} onClick={() => toggle('selected', item.id)}><Token token={item} /><span className="lc-selection-mark" aria-hidden="true">{answer.selected?.includes(item.id) ? '✓' : '+'}</span></button>)}</fieldset>
      </>;
      break;
    case 'truth':
      content = <div className="lc-truths">{activity.statements.map(statement => <fieldset key={statement.id} className="lc-truth-card"><legend>{statement.label}</legend><div className="lc-segmented"><button type="button" aria-pressed={answer.truths?.[statement.id] === true} onClick={() => change({ truths: { ...answer.truths, [statement.id]: true } })}>Verdadeiro</button><button type="button" aria-pressed={answer.truths?.[statement.id] === false} onClick={() => change({ truths: { ...answer.truths, [statement.id]: false } })}>Falso</button></div></fieldset>)}</div>;
      break;
    case 'repeat':
    case 'until':
      content = <>
        <ol className="lc-track" aria-label="Caminho do explorador">{activity.track.map((item, index) => <li key={item.id} className={`${index === activity.start ? 'is-start' : ''} ${index === activity.target ? 'is-goal' : ''}`}><small>Casa {index + 1}</small><Token token={item} />{index === activity.start && <strong>🤖 Início</strong>}{index === activity.target && <strong>★ Destino</strong>}</li>)}</ol>
        <div className="lc-program-block"><Direction value={answer.parameters?.direction} onChange={value => parameter('direction', value)} />{activity.kind === 'repeat' ? <Count label="Repetir um passo quantas vezes?" value={answer.parameters?.count} max={activity.maxCount} onChange={value => parameter('count', value)} /> : <label className="lc-count-field"><span>Andar até encontrar…</span><select value={answer.parameters?.stop ?? ''} onChange={event => parameter('stop', event.target.value)}><option value="">Escolha onde parar</option>{activity.stopOptions.map(option => <option key={option.id} value={option.id}>{option.symbol} {option.label}</option>)}</select></label>}</div>
      </>;
      break;
    case 'decompose':
      content = <div className="lc-decomposition">
        {activity.stages.map((stage, index) => <details key={stage.id} className="lc-stage" open={index === 0 ? true : undefined}><summary><span className="lc-stage-badge">Parte {index + 1}</span><strong>{stage.title}</strong><small>{(answer.stages?.[stage.id] ?? []).length} de {stage.expected.length} passos</small></summary><TokenOrder title="Monte os passos desta parte" tokens={stage.items} value={answer.stages?.[stage.id] ?? []} maxItems={stage.expected.length} onChange={sequence => change({ stages: { ...answer.stages, [stage.id]: sequence } })} /></details>)}
        <TokenOrder title="Agora, junte as partes na ordem certa" tokens={activity.stages.map(stage => ({ id: stage.id, label: stage.title, symbol: '🧩' }))} value={answer.sequence ?? []} maxItems={activity.stages.length} onChange={sequence => change({ sequence })} />
      </div>;
      break;
    case 'matrix':
      content = <div className="lc-split"><div><Tasks tasks={activity.tasks} /><p className="lc-instruction">Toque em uma casa para plantar ou retirar a muda. Confira o número da linha e da coluna.</p></div><div className="lc-matrix-wrap"><div className="lc-matrix" style={{ '--lc-columns': activity.columns } as CSSProperties} role="group" aria-label={`Horta com ${activity.rows} linhas e ${activity.columns} colunas`}><span className="lc-axis-label">L / C</span>{Array.from({ length: activity.columns }, (_, column) => <span className="lc-axis" key={`col-${column}`}>{column + 1}</span>)}{Array.from({ length: activity.rows }, (_, row) => <div className="lc-matrix-row" key={row}><span className="lc-axis">{row + 1}</span>{Array.from({ length: activity.columns }, (_, column) => { const id = `${row},${column}`; const planted = (answer.grid ?? []).includes(id); return <button type="button" key={id} aria-label={`Linha ${row + 1}, coluna ${column + 1}: ${planted ? 'com muda' : 'vazia'}`} aria-pressed={planted} onClick={() => toggle('grid', id)}><span aria-hidden="true">{planted ? '🌱' : '·'}</span></button>; })}</div>)}</div><p className="lc-instruction">🌱 Muda plantada · Casa vazia</p></div></div>;
      break;
    case 'record':
      content = <div className="lc-split"><Tasks tasks={activity.tasks} /><fieldset className="lc-record"><legend>Ficha da descoberta</legend>{activity.fields.map(field => <label key={field.id}><span>{field.label}</span><select value={answer.fields?.[field.id] ?? field.initial} onChange={event => change({ fields: { ...answer.fields, [field.id]: event.target.value } })}>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>)}</fieldset></div>;
      break;
    case 'nested':
      content = <div className="lc-split"><div className="lc-nested-model"><h2>Observe o canteiro</h2><div className="lc-flower-matrix" style={{ '--lc-columns': activity.columns } as CSSProperties} role="img" aria-label={`${activity.rows} fileiras com ${activity.columns} flores em cada fileira`}>{Array.from({ length: activity.rows * activity.columns }, (_, index) => <span key={index} aria-hidden="true">🌷</span>)}</div><p>{activity.rows} fileiras · {activity.columns} flores por fileira</p></div><div className="lc-program-block lc-nested-block"><Count label="Repetir para cada fileira" max={activity.maxCount} value={answer.parameters?.rows} onChange={value => parameter('rows', value)} /><div className="lc-program-block"><Count label="Dentro da fileira, plantar uma flor e repetir" max={activity.maxCount} value={answer.parameters?.columns} onChange={value => parameter('columns', value)} /></div><p className="lc-instruction">Depois, passe para a próxima fileira.</p></div></div>;
      break;
    case 'list':
      content = <><Tasks tasks={activity.tasks} /><TokenOrder title="Organize a lista" tokens={activity.items} value={answer.sequence ?? []} maxItems={activity.maxItems} onChange={sequence => change({ sequence })} insert /></>;
      break;
    case 'graph': {
      const path = answer.path ?? [activity.start];
      const current = path[path.length - 1];
      const getNode = (id: string) => activity.nodes.find(node => node.id === id)!;
      const connected = (id: string) => activity.edges.some(([from, to]) => (from === current && to === id) || (to === current && from === id));
      content = <>
        <p className="lc-instruction">Saia de <strong>{getNode(activity.start).label}</strong>{activity.via.length ? <> e passe por <strong>{activity.via.map(id => getNode(id).label).join(', ')}</strong></> : null}. Termine em <strong>{getNode(activity.goal).label}</strong>.</p>
        <div className="lc-graph" role="group" aria-label="Mapa de lugares ligados por caminhos">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{activity.edges.map(([from, to]) => { const a = getNode(from); const b = getNode(to); const visited = path.some((id, index) => index > 0 && ((id === from && path[index - 1] === to) || (id === to && path[index - 1] === from))); return <line key={`${from}-${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={visited ? 'is-visited' : ''} />; })}</svg>
          {activity.nodes.map(node => <button type="button" key={node.id} className={`lc-graph-node${current === node.id ? ' is-current' : ''}${path.includes(node.id) ? ' is-visited' : ''}`} style={{ left: `${node.x}%`, top: `${node.y}%` }} disabled={!connected(node.id) || path.length >= activity.maxSteps + 1} aria-label={`${node.label}${current === node.id ? ', você está aqui' : ''}${node.id === activity.goal ? ', destino' : ''}`} onClick={() => change({ path: [...path, node.id] })}><Token token={node} />{current === node.id && <small>Você está aqui</small>}</button>)}
        </div>
        <p className="lc-instruction">De <strong>{getNode(current).label}</strong>, você pode ir para {activity.nodes.filter(node => connected(node.id)).map(node => node.label).join(', ')}. Toque em um desses lugares. Os caminhos verdes mostram por onde você passou.</p>
        <ol className="lc-path" aria-label="Caminho escolhido">{path.map((id, index) => <li key={index}><span className="lc-step-number">{index + 1}</span>{getNode(id).label}</li>)}</ol>
        <div className="lc-inline-actions"><button type="button" disabled={path.length < 2} onClick={() => change({ path: path.slice(0, -1) })}>← Voltar um passo</button><button type="button" disabled={path.length < 2} onClick={() => change({ path: [activity.start] })}>Recomeçar o caminho</button><small>{path.length - 1} de até {activity.maxSteps} passos</small></div>
      </>;
      break;
    }
    case 'branch':
      content = <>
        <div className="lc-pots">{activity.cases.map(item => <div className={`lc-pot${item.dry ? ' is-dry' : ''}`} key={item.id}><span aria-hidden="true">{item.dry ? '🪴' : '🌿'}</span><strong>{item.label}</strong><small>{item.dry ? 'Terra seca' : 'Terra úmida'}</small></div>)}</div>
        <fieldset className="lc-conditions"><legend>Crie uma regra para cuidar de todos os vasos</legend>{[{ id: 'dry', label: 'Se a terra estiver seca…' }, { id: 'wet', label: 'Senão, se a terra já estiver úmida…' }].map(condition => <label key={condition.id}><strong>{condition.label}</strong><select value={answer.parameters?.[condition.id] ?? ''} onChange={event => parameter(condition.id, event.target.value)}><option value="">O que fazer?</option><option value="water">💧 Regar a planta</option><option value="skip">✋ Não regar agora</option></select></label>)}</fieldset>
      </>;
      break;
  }

  function submitProgram() {
    onChange();
    onPlayingChange?.(false);
    const next = supportsProgramSimulation(activity) ? simulateCurriculumProgram(activity, answer) : null;
    if (next) {
      serial.current += 1;
      setSimulation({ data: next, serial: serial.current });
    } else {
      setSimulation(null);
      onResult(evaluateChallenge(activity, answer));
    }
  }

  return <form ref={form} tabIndex={-1} aria-label={simulation ? "Simulação do programa" : "Editor do desafio"} id={`logic-challenge-${activity.id}`} className={`logic-challenge lc-kind-${activity.kind}${simulation ? ' is-simulating' : ''}`} onSubmit={event => { event.preventDefault(); submitProgram(); }}>
    {simulation ? <div className="logic-simulation-stage">
      <button type="button" className="logic-edit-program" onClick={() => { setSimulation(null); onPlayingChange?.(false); onChange(); form.current?.focus({ preventScroll: true }); }}>← Editar programa</button>
      <ProgramSimulation key={simulation.serial} simulation={simulation.data} onPlayingChange={onPlayingChange} onFinish={() => onResult(simulation.data.result)} />
    </div> : content}
  </form>;
}
