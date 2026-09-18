'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, Flag, Leaf, Lightbulb, Mountain, Play, Puzzle, Repeat2, RotateCcw, Route, Sparkles, Star, Trophy, Wrench } from 'lucide-react';
import {
  BROKEN_PROGRAM, DIRECTIONS, LAB_ACTIVITIES, PATTERN_OPTIONS, PATTERN_VISIBLE_LENGTH,
  PLANT_STEPS, REPEATING_PATTERN, REQUIRED_PLANT_STEPS, ROBOT_BOARD,
  completeLabActivity, decodeLabProgress, matchesRequiredSteps, patternAt, repairProgram, sameCell,
  type Direction, type LabId,
} from '@/lib/computational';
import { BNCC_SKILLS, BNCC_SOURCE, CURRICULUM_ACTIVITIES } from '@/lib/computational-curriculum';
import type { SchoolYear, SkillCode, ChallengeResult } from '@/lib/computational-curriculum-types';
import ComputationalChallenge from './ComputationalChallenge';
import ProgramSimulation from './ProgramSimulation';
import { simulateRobotProgram, supportsProgramSimulation } from '@/lib/program-simulation';
import type { ProgramSimulationData } from '@/lib/program-simulation-types';
import { getSpeechPlayer } from '@/lib/speech';
import LumiCharacter from './LumiCharacter';
import SpeechButton from './SpeechButton';
import ActivityViewport, { ActivityFullscreenButton } from './ActivityViewport';
import './computational-lab.css';
import './computational-catalog.css';
import './program-simulation-layout.css';

type LabProps = { onClose: () => void; sound: boolean; storageKey: string };
type Feedback = { kind: 'success' | 'retry'; message: string };
const activityIcons: Partial<Record<LabId, typeof Puzzle>> = { parts: Puzzle, patterns: Repeat2, algorithm: Route, debug: Wrench };
const explorations = [...LAB_ACTIVITIES, ...CURRICULUM_ACTIVITIES];
const schoolYears: readonly SchoolYear[] = [1, 2, 3, 4, 5];
const serverSnapshot = () => null;

function makeProgressStore(storageKey: string) {
  const listeners = new Set<() => void>();
  let memory: string | null = null;
  let unavailable = false;
  function snapshot() {
    if (typeof window === 'undefined') return null;
    if (unavailable) return memory;
    try { return window.localStorage.getItem(storageKey); }
    catch { return memory; }
  }
  return {
    snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      const changed = (event: StorageEvent) => {
        if (event.key === storageKey || event.key === null) {
          unavailable = false;
          listener();
        }
      };
      window.addEventListener('storage', changed);
      return () => { listeners.delete(listener); window.removeEventListener('storage', changed); };
    },
    complete(id: LabId) {
      const updated = completeLabActivity(decodeLabProgress(snapshot()), id);
      memory = JSON.stringify(updated);
      try { window.localStorage.setItem(storageKey, memory); unavailable = false; }
      catch { unavailable = true; }
      listeners.forEach(listener => listener());
      return !unavailable;
    },
  };
}

export default function ComputationalLab(props: LabProps) {
  return <ComputationalSession key={props.storageKey} {...props}/>;
}

function ComputationalSession({ onClose, sound, storageKey }: LabProps) {
  const store = useMemo(() => makeProgressStore(storageKey), [storageKey]);
  const saved = useSyncExternalStore(store.subscribe, store.snapshot, serverSnapshot);
  const progress = useMemo(() => decodeLabProgress(saved), [saved]);
  const [active, setActive] = useState<LabId | null>(null);
  const [yearFilter, setYearFilter] = useState<'all' | 'intro' | SchoolYear>('all');
  const [skillFilter, setSkillFilter] = useState<'all' | SkillCode>('all');
  const [progressFilter, setProgressFilter] = useState<'all' | 'new' | 'done'>('all');
  const [selectedSteps, setSelectedSteps] = useState<string[]>([]);
  const [patternChoice, setPatternChoice] = useState('');
  const [program, setProgram] = useState<Direction[]>([]);
  const [debugStep, setDebugStep] = useState<number | null>(null);
  const [replacement, setReplacement] = useState<Direction | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hint, setHint] = useState(false);
  const [robotSimulation, setRobotSimulation] = useState<{ data: ProgramSimulationData; serial: number; grade: boolean } | null>(null);
  const simulationSerial = useRef(0);
  const [running, setRunning] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const activity = explorations.find(item => item.id === active);
  const curriculumActivity = CURRICULUM_ACTIVITIES.find(item => item.id === active);
  const availableSkills = Object.entries(BNCC_SKILLS).filter(([, skill]) => yearFilter === 'all' || skill.grade === yearFilter);
  const visibleActivities = explorations.filter(item => {
    const curricular = 'skill' in item;
    const yearMatches = yearFilter === 'all' || (yearFilter === 'intro' ? !curricular : curricular && item.grade === yearFilter);
    const skillMatches = skillFilter === 'all' || (curricular && item.skill === skillFilter);
    const done = progress.completed.includes(item.id);
    return yearMatches && skillMatches && (progressFilter === 'all' || (progressFilter === 'done' ? done : !done));
  });
  // Continue within the selected school year, even when its last filtered card was just completed.
  const nextActivity = explorations.find(item => item.id !== active && !progress.completed.includes(item.id) &&
    (yearFilter === 'all' || (yearFilter === 'intro' ? !('grade' in item) : 'grade' in item && item.grade === yearFilter)));
  const allComplete = progress.completed.length === explorations.length;
  const isRobot = active === 'algorithm' || active === 'debug';
  const isCurriculumProgram = curriculumActivity && supportsProgramSimulation(curriculumActivity);
  const robot = ROBOT_BOARD.start;

  useEffect(() => { heading.current?.focus(); }, [active]);
  function explore(id: LabId | null) {
    getSpeechPlayer()?.stop();
    setRunning(false); setActive(id); setSelectedSteps([]); setPatternChoice('');
    setProgram([]); setDebugStep(null); setReplacement(null);
    setFeedback(null); setHint(false); setRobotSimulation(null);
  }
  function changed() { setRunning(false); setFeedback(null); setRobotSimulation(null); }
  function complete(id: LabId) {
    if (!store.complete(id)) setSaveNotice('Não foi possível guardar esta descoberta agora. Você pode continuar explorando.');
    else setSaveNotice('');
  }
  function startSimulation(commands: readonly Direction[], grade = true) {
    const data = simulateRobotProgram(ROBOT_BOARD, commands);
    simulationSerial.current += 1;
    setFeedback(null);
    setRunning(false);
    setRobotSimulation({ data, grade, serial: simulationSerial.current });
  }
  function finishRobotSimulation() {
    if (!robotSimulation || !activity) return;
    const result = robotSimulation.data.result;
    setFeedback({ kind: result.correct ? 'success' : 'retry', message: result.message });
    if (robotSimulation.grade && result.correct) complete(activity.id);
  }
  function checkCurriculum(result: ChallengeResult) {
    setFeedback({ kind: result.correct ? 'success' : 'retry', message: result.message });
    if (result.correct && curriculumActivity) complete(curriculumActivity.id);
  }
  function check() {
    if (!activity || curriculumActivity || running) return;
    if (active === 'parts') {
      const success = matchesRequiredSteps(selectedSteps, REQUIRED_PLANT_STEPS);
      setFeedback(success
        ? { kind: 'success', message: 'Isso! Terra no vaso, semente na terra e um pouco de água. Um passo de cada vez!' }
        : { kind: 'retry', message: 'Vamos pensar nos três passos que ajudam a plantar. Você pode marcar ou desmarcar as opções e tentar de novo.' });
      if (success) complete(active);
      return;
    }
    if (active === 'patterns') {
      const success = patternChoice === patternAt(REPEATING_PATTERN, PATTERN_VISIBLE_LENGTH);
      setFeedback(success
        ? { kind: 'success', message: 'Isso mesmo: uma folha! O grupo “sol, folha, folha” aparece outra vez.' }
        : { kind: 'retry', message: 'Quase! Observe o grupo de três figuras que se repete e escolha o que falta no segundo grupo.' });
      if (success) complete(active);
      return;
    }
    const commands = active === 'debug' && debugStep !== null && replacement
      ? repairProgram(BROKEN_PROGRAM, debugStep, replacement)
      : program;
    if (commands) startSimulation(commands);
  }
  function watchBrokenProgram() {
    startSimulation(BROKEN_PROGRAM, false);
  }
  const readyToCheck = curriculumActivity ? true : active === 'parts' ? selectedSteps.length > 0
    : active === 'patterns' ? !!patternChoice
    : active === 'debug' ? debugStep !== null && replacement !== null
    : program.length > 0;

  return <ActivityViewport className="computational-lab" aria-label="Ilha das ideias, pensamento computacional">
    <header className="logic-topbar">
      <button type="button" className="logic-back" onClick={() => { getSpeechPlayer()?.stop(); onClose(); }}><ArrowLeft size={20}/><span>Voltar</span></button>
      {activity && <div className="logic-workshop-nav logic-topbar-nav"><button type="button" className="text-btn" onClick={() => explore(null)}><ArrowLeft size={16}/> Ver explorações</button><span>{progress.completed.includes(activity.id) ? <><CheckCircle2 size={15}/> Já descoberto</> : activity.subtitle}</span></div>}
      <span className="logic-free"><Sparkles size={14}/> Exploração livre</span>
      <ActivityFullscreenButton className="logic-fullscreen-button"/>
      <span className="logic-count"><Flag size={17}/>{progress.completed.length}/{explorations.length}<span className="sr-only"> explorações concluídas nesta ilha</span></span>
    </header>
    <div className="logic-progress" role="progressbar" aria-label="Explorações concluídas na Ilha das Ideias" aria-valuemin={0} aria-valuemax={explorations.length} aria-valuenow={progress.completed.length}><span style={{ width: (progress.completed.length / explorations.length * 100) + '%' }}/></div>

    {!activity ? <>
      <div className="logic-hero">
        <div><span className="logic-kicker"><Bot size={17}/> PENSAMENTO COMPUTACIONAL</span><h1 ref={heading} tabIndex={-1}>Bem-vindo à<br/><span>Ilha das Ideias!</span></h1><p>Organize ideias, programe robôs, explore caminhos e resolva desafios. Uma nova descoberta a cada experiência!</p><span className="logic-hero-note">{explorations.length} explorações · do primeiro passo aos novos desafios</span></div>
      </div>
      {allComplete && <div className="logic-celebration" role="status"><Trophy size={32}/><div><h2>Uma ilha cheia de novas ideias!</h2><p>Você explorou todas as ideias desta ilha. Pode brincar de novo quando quiser.</p></div><LumiCharacter small/></div>}
      <section className="logic-catalog" aria-label="Escolher uma exploração">
        <div className="logic-catalog-heading"><div><h2>Qual será a descoberta de hoje?</h2><p>Escolha seu ano ou experimente uma introdução.</p></div><span className="logic-curriculum-note">BNCC Computação · 1º ao 5º ano</span></div>
        <div className="logic-year-filters" role="group" aria-label="Filtrar por ano escolar">
          <button type="button" aria-pressed={yearFilter === 'all'} onClick={() => { setYearFilter('all'); setSkillFilter('all'); }}>Todos</button>
          <button type="button" aria-pressed={yearFilter === 'intro'} onClick={() => { setYearFilter('intro'); setSkillFilter('all'); }}>Primeiros passos</button>
          {schoolYears.map(year => <button type="button" key={year} aria-pressed={yearFilter === year} onClick={() => { setYearFilter(year); setSkillFilter('all'); }}>{year}º ano</button>)}
        </div>
        <div className="logic-catalog-filters">
          <label>Habilidade<select value={skillFilter} disabled={yearFilter === 'intro'} onChange={event => setSkillFilter(event.target.value as 'all' | SkillCode)}><option value="all">Todas as habilidades</option>{availableSkills.map(([code, skill]) => <option key={code} value={code}>{code} · {skill.label}</option>)}</select></label>
          <label>Suas descobertas<select value={progressFilter} onChange={event => setProgressFilter(event.target.value as 'all' | 'new' | 'done')}><option value="all">Todas</option><option value="new">Para descobrir</option><option value="done">Já descobertas</option></select></label>
        </div>
        <p className="logic-filter-count" role="status">{visibleActivities.length} {visibleActivities.length === 1 ? 'exploração encontrada' : 'explorações encontradas'}</p>
        <div className="logic-explorations">
          {visibleActivities.map(item => {
            const index = explorations.indexOf(item);
            const Icon = activityIcons[item.id] ?? ('kind' in item && ['repeat', 'until', 'nested'].includes(item.kind) ? Repeat2 : 'kind' in item && item.kind === 'graph' ? Route : Puzzle);
            const done = progress.completed.includes(item.id);
            return <button type="button" key={item.id} className={'logic-exploration logic-color-' + (index % 4) + (done ? ' is-complete' : '')} onClick={() => explore(item.id)}>
              <span className="logic-exploration-icon"><Icon size={34}/></span>
              <small>{'grade' in item ? item.grade + 'º ANO' : 'PRIMEIROS PASSOS'}</small><strong>{item.title}</strong><span>{item.subtitle}</span>
              {'skill' in item && <span className="logic-skill-tag">{item.skill}</span>}
              <span className="logic-exploration-action">{done ? <><CheckCircle2 size={17}/> Explorar de novo</> : <>Vamos descobrir <ArrowRight size={17}/></>}</span>
            </button>;
          })}
        </div>
        {!visibleActivities.length && <div className="logic-catalog-empty"><Sparkles size={28}/><h3>Há outras ideias para explorar!</h3><p>Escolha outro ano ou veja todas as descobertas da ilha.</p><button type="button" className="logic-back" onClick={() => { setYearFilter('all'); setSkillFilter('all'); setProgressFilter('all'); }}>Ver todas as explorações</button></div>}
        <details className="logic-curriculum-info"><summary>Para quem acompanha a aprendizagem</summary><p>As novas atividades oferecem práticas relacionadas às 15 habilidades do eixo Pensamento Computacional, do 1º ao 5º ano. Cada experiência trabalha aspectos da habilidade; sua conclusão não substitui o acompanhamento do professor.</p><a href={BNCC_SOURCE} target="_blank" rel="noreferrer">Consultar a BNCC Computação · MEC/CNE <ArrowRight size={14}/></a></details>
      </section>
      <aside className="logic-guide"><LumiCharacter/><div><h2>Vamos experimentar juntos?</h2><p>Não precisa acertar de primeira. Escolha, teste e descubra um novo caminho. Suas descobertas ficam guardadas neste navegador para você continuar depois.</p><SpeechButton text="Vamos experimentar juntos? Não precisa acertar de primeira. Escolha, teste e descubra um novo caminho." enabled={sound} label="Ouvir a Lumi"/></div></aside>
    </> : <div className={'logic-workshop' + ((hint || (feedback && !running)) ? ' has-support' : '')} data-activity={activity.id} data-curriculum={curriculumActivity ? curriculumActivity.kind : undefined}>
      <header className="logic-question"><div className="logic-question-mascot"><LumiCharacter small/></div><span className="logic-kicker">VAMOS PENSAR JUNTOS</span><h1 ref={heading} tabIndex={-1}>{activity.title}</h1><p>{activity.prompt}</p>{curriculumActivity && <details className="logic-skill-detail"><summary>{curriculumActivity.grade}º ano · {BNCC_SKILLS[curriculumActivity.skill].label}</summary><p><strong>{curriculumActivity.skill}</strong> · {BNCC_SKILLS[curriculumActivity.skill].description}</p></details>}<SpeechButton key={activity.id} text={activity.prompt} enabled={sound} label="Ouvir o desafio"/></header>

      {curriculumActivity && <ComputationalChallenge key={curriculumActivity.id} activity={curriculumActivity} onResult={checkCurriculum} onChange={changed} onPlayingChange={setRunning}/>}

      {active === 'parts' && <fieldset className="logic-choices"><legend className="sr-only">Escolha os três passos para plantar</legend>
        {PLANT_STEPS.map(step => {
          const selected = selectedSteps.includes(step.id);
          return <button key={step.id} type="button" aria-pressed={selected} className={'logic-choice' + (selected ? ' is-selected' : '')} onClick={() => { changed(); setSelectedSteps(previous => previous.includes(step.id) ? previous.filter(id => id !== step.id) : [...previous, step.id]); }}><span className="logic-choice-symbol" aria-hidden="true">{step.symbol}</span><strong>{step.label}</strong><span className="logic-choice-check" aria-hidden="true">{selected && <Check size={18}/>}</span></button>;
        })}
      </fieldset>}

      {active === 'patterns' && <div className="logic-pattern">
        <ol className="logic-sequence" aria-label="Sequência a completar">
          {Array.from({ length: PATTERN_VISIBLE_LENGTH }, (_, index) => {
            const item = PATTERN_OPTIONS.find(option => option.id === patternAt(REPEATING_PATTERN, index))!;
            return <li key={index}><span aria-hidden="true">{item.symbol}</span><small>{item.label}</small></li>;
          })}
          <li className="logic-missing"><span aria-hidden="true">?</span><small>Falta qual?</small></li>
        </ol>
        <fieldset className="logic-pattern-options"><legend className="sr-only">Qual figura completa a sequência?</legend>{PATTERN_OPTIONS.map(item => <button type="button" key={item.id} aria-pressed={patternChoice === item.id} className={'logic-pattern-choice' + (patternChoice === item.id ? ' is-selected' : '')} onClick={() => { changed(); setPatternChoice(item.id); }}><span aria-hidden="true">{item.symbol}</span><strong>{item.label}</strong>{patternChoice === item.id && <Check className="logic-pattern-check" size={17}/>}</button>)}</fieldset>
      </div>}

      {isRobot && robotSimulation && <div className="logic-simulation-stage logic-robot-simulation">
        <button type="button" className="logic-edit-program" onClick={() => { changed(); heading.current?.focus({ preventScroll: true }); }}><ArrowLeft size={16}/> Editar programa</button>
        <ProgramSimulation key={robotSimulation.serial} simulation={robotSimulation.data} onPlayingChange={setRunning} onFinish={finishRobotSimulation}/>
      </div>}
      {isRobot && !robotSimulation && <div className="logic-robot-play">
        <div className="logic-board-wrap">
          <div className="logic-board" role="img" aria-label={'Mapa de quatro linhas e quatro colunas. O robô está na linha ' + (robot.row + 1) + ', coluna ' + (robot.column + 1) + '. A estrela está na linha 1, coluna 4. Pedras na linha 2, colunas 2 e 4, e na linha 3, coluna 2.'}>
            {Array.from({ length: ROBOT_BOARD.rows * ROBOT_BOARD.columns }, (_, index) => {
              const cell = { row: Math.floor(index / ROBOT_BOARD.columns), column: index % ROBOT_BOARD.columns };
              const rock = ROBOT_BOARD.rocks.some(item => sameCell(item, cell)), goal = sameCell(cell, ROBOT_BOARD.goal), occupied = sameCell(robot, cell);
              return <span aria-hidden="true" key={index} className={'logic-cell' + (rock ? ' is-rock' : '') + (goal ? ' is-goal' : '')}>{occupied ? <Bot className="logic-robot" size={38}/> : rock ? <Mountain size={29}/> : goal ? <Star className="logic-goal-star" size={31}/> : sameCell(cell, ROBOT_BOARD.start) ? <Flag size={23}/> : <span className="logic-cell-dot"/>}</span>;
            })}
          </div>
          <div className="logic-board-legend"><span><Bot size={16}/> Robô</span><span><Star size={16}/> Destino</span><span><Mountain size={16}/> Pedra</span></div>
          <p className="logic-board-instruction">Cada seta anda uma casa. As direções seguem o desenho do mapa.</p>
        </div>
        <div className="logic-program-panel">
          {active === 'algorithm' ? <>
            <div className="logic-program-heading"><h2>Seu programa</h2><span>{program.length}/{ROBOT_BOARD.maxCommands} setas</span></div>
            <div className="logic-program" aria-label="Instruções do robô">{program.length ? program.map((direction, index) => <button type="button" key={index} disabled={running} onClick={() => { changed(); setProgram(previous => previous.filter((_, position) => position !== index)); }} aria-label={'Remover passo ' + (index + 1) + ': ' + DIRECTIONS.find(item => item.id === direction)!.label}><small>{index + 1}</small><span aria-hidden="true">{DIRECTIONS.find(item => item.id === direction)!.symbol}</span></button>) : <p>Toque nas setas abaixo para criar o caminho.</p>}</div>
            <div className="logic-directions" role="group" aria-label="Adicionar instrução">{DIRECTIONS.map(direction => <button type="button" key={direction.id} disabled={running || program.length >= ROBOT_BOARD.maxCommands} aria-label={'Adicionar: ' + direction.label} onClick={() => { changed(); setProgram(previous => [...previous, direction.id]); }}><span aria-hidden="true">{direction.symbol}</span><small>{direction.label.replace('Para ', '')}</small></button>)}</div>
            <p className="logic-program-help">{program.length === ROBOT_BOARD.maxCommands ? 'O programa está cheio. Toque em uma seta do programa para removê-la.' : 'Toque em uma seta do programa para removê-la.'}</p>
            <button type="button" className="text-btn logic-reset" disabled={!program.length || running} onClick={() => { changed(); setProgram([]); }}><RotateCcw size={15}/> Limpar programa</button>
          </> : <>
            <div className="logic-program-heading"><h2>Encontre a seta</h2><span>1 correção</span></div>
            <div className="logic-program logic-debug-program" role="group" aria-label="Escolha a instrução que precisa mudar">{BROKEN_PROGRAM.map((direction, index) => {
              const display = debugStep === index && replacement ? replacement : direction;
              return <button type="button" key={index} disabled={running} aria-pressed={debugStep === index} className={debugStep === index ? 'is-selected' : ''} onClick={() => { changed(); setDebugStep(index); setReplacement(null); }} aria-label={'Passo ' + (index + 1) + ': ' + DIRECTIONS.find(item => item.id === display)!.label + '. Escolher para corrigir.'}><small>{index + 1}</small><span aria-hidden="true">{DIRECTIONS.find(item => item.id === display)!.symbol}</span></button>;
            })}</div>
            <button type="button" className="text-btn logic-watch" disabled={running} onClick={watchBrokenProgram}><Play size={15}/> Ver o programa original</button>
            <p className="logic-repair-label">{debugStep === null ? 'Primeiro, escolha uma seta acima.' : 'Trocar o passo ' + (debugStep + 1) + ' por:'}</p>
            <div className="logic-directions" role="group" aria-label="Nova direção do passo escolhido">{DIRECTIONS.map(direction => <button type="button" key={direction.id} disabled={debugStep === null || running} aria-pressed={replacement === direction.id} className={replacement === direction.id ? 'is-selected' : ''} aria-label={direction.label} onClick={() => { changed(); setReplacement(direction.id); }}><span aria-hidden="true">{direction.symbol}</span><small>{direction.label.replace('Para ', '')}</small></button>)}</div>
          </>}
          {running && <p className="logic-running" role="status"><Bot size={18}/> O robô está seguindo seu programa…</p>}
        </div>
      </div>}

      <div className="logic-controls"><button type="button" className="logic-hint-button" aria-expanded={hint} aria-controls="logic-hint" onClick={() => setHint(previous => !previous)}><Lightbulb size={18}/>{hint ? 'Guardar a pista' : 'Uma pista da Lumi'}</button><button type={curriculumActivity ? 'submit' : 'button'} form={curriculumActivity ? 'logic-challenge-' + curriculumActivity.id : undefined} className="logic-check" disabled={!readyToCheck || running} onClick={curriculumActivity ? undefined : check}>{running ? 'Explorando…' : isCurriculumProgram ? <><Play size={17}/> Testar programa</> : isRobot ? <><Play size={17}/> Testar {active === 'debug' ? 'correção' : 'programa'}</> : <>Conferir descoberta <ArrowRight size={17}/></>}</button></div>
      {(hint || (feedback && !running)) && <aside className="logic-support" aria-label="Ajuda e resultado da descoberta">
      {hint && <div id="logic-hint" className="logic-hint"><LumiCharacter small/><div><p>{activity.hint}</p><SpeechButton text={activity.hint} enabled={sound} label="Ouvir a pista"/></div></div>}
      {feedback && !running && <div className={'logic-feedback ' + feedback.kind} role="status"><div>{feedback.kind === 'success' ? <CheckCircle2 size={26}/> : <Lightbulb size={26}/>}<div><strong>{feedback.kind === 'success' ? 'Uma nova ideia descoberta!' : 'Vamos tentar outro caminho?'}</strong><p>{feedback.message}</p>{feedback.kind === 'success' && <p className="logic-concept">{activity.concept}</p>}</div></div><SpeechButton text={feedback.message + (feedback.kind === 'success' ? ' ' + activity.concept : '')} enabled={sound} label="Ouvir a Lumi"/>{feedback.kind === 'success' && <button type="button" className="logic-next" onClick={() => explore(nextActivity?.id ?? null)}>{nextActivity ? 'Outra descoberta' : 'Ver minhas descobertas'}<ArrowRight size={17}/></button>}</div>}
      </aside>}
    </div>}
    {saveNotice && <p className="logic-save-notice" role="status">{saveNotice}</p>}
    <footer className="logic-footer"><Leaf size={15}/><span>Sem pressa. Cada tentativa traz uma nova ideia.</span></footer>
  </ActivityViewport>;
}
