import { evaluateChallenge } from './computational-curriculum';
import type { ChallengeAnswer, ChallengeResult, ChallengeToken, CurriculumActivity } from './computational-curriculum-types';
import { DIRECTIONS, runProgram, type Direction, type RobotBoard } from './computational';
import type { ProgramSimulationData, SimulationFrame, SimulationModel } from './program-simulation-types';

const PROGRAM_KINDS = new Set(['repeat', 'until', 'nested', 'branch', 'decompose', 'sequence', 'graph']);
const MAX_STEPS = 100;
type Instructions = { id: string; label: string }[];
type FrameState = Omit<SimulationFrame, 'instruction' | 'description' | 'tone'>;

export function supportsProgramSimulation(activity: CurriculumActivity): boolean {
  return PROGRAM_KINDS.has(activity.kind);
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= MAX_STEPS && value.every((item) => typeof item === 'string');
const countValue = (value: unknown, maximum: number): number | null => {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count <= Math.min(maximum, MAX_STEPS) ? count : null;
};
const token = (id: string, label: string, symbol: string): ChallengeToken => ({ id, label, symbol });

/** Every frame owns its state: advancing or editing an answer cannot change the past. */
function snapshot(frame: SimulationFrame): SimulationFrame {
  return Object.freeze({
    ...frame,
    ...(frame.visited ? { visited: Object.freeze([...frame.visited]) } : {}),
    ...(frame.planted ? { planted: Object.freeze([...frame.planted]) } : {}),
    ...(frame.tokens ? { tokens: Object.freeze(frame.tokens.map((item) => Object.freeze({ ...item }))) } : {}),
    ...(frame.counters ? { counters: Object.freeze(frame.counters.map((item) => Object.freeze({ ...item }))) } : {}),
    ...(frame.condition ? { condition: Object.freeze({ ...frame.condition }) } : {}),
    ...(frame.pots ? { pots: Object.freeze(Object.fromEntries(Object.entries(frame.pots).map(([id, pot]) => [id, Object.freeze({ ...pot })]))) } : {}),
  });
}

function timeline() {
  const frames: SimulationFrame[] = [];
  return {
    frames,
    push(instruction: string, description: string, state: FrameState, tone: SimulationFrame['tone'] = 'normal') {
      frames.push(snapshot({ instruction, description, tone, ...state }));
    },
  };
}

function finish(title: string, model: SimulationModel, instructions: Instructions, frames: SimulationFrame[], result: ChallengeResult): ProgramSimulationData {
  const last = frames.at(-1)!;
  frames.push(snapshot({ ...last, instruction: 'Resultado do programa', description: result.message, tone: result.correct ? 'success' : 'warning' }));
  return { title, model, instructions, frames: Object.freeze(frames), result };
}

function simulateTrack(activity: Extract<CurriculumActivity, { kind: 'repeat' | 'until' }>, answer: ChallengeAnswer): ProgramSimulationData | null {
  const parameters = record(answer.parameters) ? answer.parameters : {};
  if (parameters.direction !== 'forward' && parameters.direction !== 'back') return null;
  if (!activity.track.length || activity.track.length > MAX_STEPS || !activity.track[activity.start] || !activity.track[activity.target]) return null;
  const count = activity.kind === 'repeat' ? countValue(parameters.count, activity.maxCount) : null;
  if (activity.kind === 'repeat' && count === null) return null;
  if (activity.kind === 'until' && !activity.stopOptions.some(({ id }) => id === parameters.stop)) return null;
  const direction = parameters.direction === 'forward' ? 1 : -1;
  const moveLabel = direction === 1 ? 'Dar um passo para a frente' : 'Dar um passo para trás';
  const stopLabel = activity.track.find(({ id }) => id === parameters.stop)?.label ?? String(parameters.stop ?? '');
  const instructions: Instructions = activity.kind === 'repeat'
    ? [{ id: 'repeat', label: `Repetir ${count} vezes` }, { id: 'move', label: moveLabel }]
    : [{ id: 'condition', label: `Já cheguei em ${stopLabel}?` }, { id: 'move', label: moveLabel }, { id: 'stop', label: 'Se sim, parar' }];
  const model: SimulationModel = { kind: 'track', places: activity.track, start: activity.track[activity.start].id, goal: activity.track[activity.target].id };
  const { frames, push } = timeline();
  let position = activity.start;
  const visited = [activity.track[position].id];
  const state = (extra: FrameState = {}): FrameState => ({ active: activity.track[position].id, visited, ...extra });
  push('Antes de começar', `O robô começa em ${activity.track[position].label}.`, state());
  if (activity.kind === 'repeat') push('Preparar a repetição', `O programa fará ${count} passos na direção escolhida.`, state({ activeInstruction: 'repeat', counters: [{ label: 'Repetição', value: `0 de ${count}` }] }));
  for (let step = 0; step < MAX_STEPS; step += 1) {
    if (activity.kind === 'until') {
      const met = activity.track[position].id === parameters.stop;
      push('Verificar a condição', `${activity.track[position].label}: ${met ? 'sim, é o lugar escolhido; o programa deve parar.' : 'ainda não é o lugar escolhido; vamos dar mais um passo.'}`,
        state({ activeInstruction: 'condition', condition: { label: `Já cheguei em ${stopLabel}?`, value: met }, counters: [{ label: 'Passos dados', value: String(step) }] }));
      if (met) {
        push('Parar', `O robô fica em ${activity.track[position].label}, como a condição mandou.`, state({ activeInstruction: 'stop', condition: { label: `Já cheguei em ${stopLabel}?`, value: true } }));
        break;
      }
    } else if (step >= count!) break;
    const next = position + direction;
    const counters = [{ label: activity.kind === 'repeat' ? 'Repetição' : 'Passo', value: activity.kind === 'repeat' ? `${step + 1} de ${count}` : String(step + 1) }];
    if (next < 0 || next >= activity.track.length) {
      push(`Passo ${step + 1}: fim da trilha`, 'Este comando tentaria sair da trilha. O robô fica na última parada segura e a execução termina.', state({ activeInstruction: 'move', counters }), 'warning');
      break;
    }
    position = next;
    visited.push(activity.track[position].id);
    push(`Passo ${step + 1}`, `O robô chegou em ${activity.track[position].label}.`, state({ activeInstruction: 'move', counters }));
  }
  return finish(activity.title, model, instructions, frames, evaluateChallenge(activity, answer));
}

function simulateNested(activity: Extract<CurriculumActivity, { kind: 'nested' }>, answer: ChallengeAnswer): ProgramSimulationData | null {
  const rows = countValue(answer.parameters?.rows, activity.maxCount);
  const columns = countValue(answer.parameters?.columns, activity.maxCount);
  if (rows === null || columns === null || rows * columns > MAX_STEPS) return null;
  const instructions = [{ id: 'outer', label: `Repetir ${rows} fileiras` }, { id: 'inner', label: `Em cada fileira, repetir ${columns} flores` }, { id: 'plant', label: 'Plantar uma flor' }];
  // The board comes from the student's program, including a valid but wrong shape.
  const model: SimulationModel = { kind: 'grid', rows, columns, rocks: [] };
  const planted: string[] = [];
  const { frames, push } = timeline();
  push('Antes de começar', `Seu programa vai criar ${rows} fileiras com ${columns} flores em cada uma. O canteiro ainda está vazio.`, { planted });
  for (let row = 0; row < rows; row += 1) {
    const counters = (column: number) => [{ label: 'Fileira (fora)', value: `${row + 1} de ${rows}` }, { label: 'Flor (dentro)', value: `${column} de ${columns}` }];
    push(`Começar a fileira ${row + 1}`, 'A repetição de dentro recomeça do primeiro espaço nesta fileira.', { planted, active: `${row},0`, activeInstruction: 'outer', counters: counters(0) });
    for (let column = 0; column < columns; column += 1) {
      push('Repetição de dentro', `Escolher o espaço da linha ${row + 1}, coluna ${column + 1}.`, { planted, active: `${row},${column}`, activeInstruction: 'inner', counters: counters(column + 1) });
      planted.push(`${row},${column}`);
      push(`Plantar a flor ${planted.length}`, `Uma nova flor apareceu na linha ${row + 1}, coluna ${column + 1}.`, { planted, active: `${row},${column}`, activeInstruction: 'plant', counters: counters(column + 1) });
    }
  }
  return finish(activity.title, model, instructions, frames, evaluateChallenge(activity, answer));
}

function simulateBranch(activity: Extract<CurriculumActivity, { kind: 'branch' }>, answer: ChallengeAnswer): ProgramSimulationData | null {
  const parameters = record(answer.parameters) ? answer.parameters : {};
  if (![parameters.dry, parameters.wet].every((value) => value === 'water' || value === 'skip') || activity.cases.length > MAX_STEPS) return null;
  const actionLabel = (action: unknown) => action === 'water' ? 'Regar' : 'Esperar';
  const instructions = [{ id: 'condition', label: 'A terra está seca?' }, { id: 'dry', label: `Se sim: ${actionLabel(parameters.dry).toLowerCase()}` }, { id: 'wet', label: `Senão: ${actionLabel(parameters.wet).toLowerCase()}` }];
  const model: SimulationModel = { kind: 'pots', pots: activity.cases };
  const pots: Record<string, { dry: boolean; action: 'water' | 'skip' | null; overwatered?: boolean }> = Object.fromEntries(activity.cases.map(({ id, dry }) => [id, { dry, action: null }]));
  const { frames, push } = timeline();
  push('Antes de começar', 'Cada vaso tem seu próprio estado de terra. A mesma regra será testada em todos eles.', { pots });
  for (const [index, item] of activity.cases.entries()) {
    const dry = pots[item.id].dry;
    const condition = { label: 'A terra está seca?', value: dry };
    const counters = [{ label: 'Vaso', value: `${index + 1} de ${activity.cases.length}` }];
    push(`Observar ${item.label}`, `A terra está ${dry ? 'seca: a resposta é sim.' : 'úmida: a resposta é não.'}`, { pots, active: item.id, activeInstruction: 'condition', condition, counters });
    const action = parameters[dry ? 'dry' : 'wet'] as 'water' | 'skip';
    const overwatered = action === 'water' && !dry;
    pots[item.id] = { dry: action === 'water' ? false : dry, action, ...(overwatered ? { overwatered: true } : {}) };
    const description = action === 'water'
      ? overwatered ? 'O programa regou uma terra que já estava úmida. Este vaso recebeu água demais.' : 'O programa regou o vaso. A terra seca ficou úmida.'
      : dry ? 'O programa escolheu esperar. A terra continua seca, precisando de água.' : 'O programa esperou. A terra continua úmida e o vaso está bem.';
    push(`${actionLabel(action)}: ${item.label}`, description, { pots, active: item.id, activeInstruction: dry ? 'dry' : 'wet', condition: { label: 'Terra seca antes da ação?', value: dry }, counters }, overwatered || (action === 'skip' && dry) ? 'warning' : 'normal');
  }
  return finish(activity.title, model, instructions, frames, evaluateChallenge(activity, answer));
}

function simulateSequence(activity: Extract<CurriculumActivity, { kind: 'sequence' }>, answer: ChallengeAnswer): ProgramSimulationData | null {
  const sequence = answer.sequence;
  if (!strings(sequence) || !sequence.length || !sequence.every((id) => activity.items.some((item) => item.id === id))) return null;
  const instructions = sequence.map((id, index) => ({ id: `step-${index}`, label: activity.items.find((item) => item.id === id)!.label }));
  const { frames, push } = timeline();
  if (activity.reference) {
    const places = activity.reference.map((id) => activity.items.find((item) => item.id === id)).filter((item): item is ChallengeToken => Boolean(item));
    if (!places.length) return null;
    const model: SimulationModel = { kind: 'track', places, start: places[0].id, goal: places.at(-1)!.id };
    const visited = [model.start];
    push('Antes de começar', `Vamos seguir os lugares na ordem que você montou. A saída fica em ${places[0].label}.`, { active: model.start, visited });
    for (const [index, id] of sequence.entries()) {
      const item = activity.items.find((place) => place.id === id)!;
      const followsGuide = id === activity.reference[index];
      if (index !== 0 || id !== model.start) visited.push(id);
      push(`Parada ${index + 1}`, `${item.label}.${followsGuide ? ' Esta parada acompanha o guia.' : ' Esta parada está em outra posição no guia. Observe como o caminho mudou.'}`,
        { active: id, visited, activeInstruction: `step-${index}`, counters: [{ label: 'Parada', value: `${index + 1} de ${sequence.length}` }] }, followsGuide ? 'normal' : 'warning');
    }
    return finish(activity.title, model, instructions, frames, evaluateChallenge(activity, answer));
  }
  const model: SimulationModel = { kind: 'story', theme: activity.id === 'picnic-sequence' ? 'picnic' : 'steps' };
  if (model.theme === 'picnic') {
    let state: 'raw' | 'washed' | 'cut' | 'served' | 'eaten' = 'raw';
    const scenes: Record<typeof state | 'washed' | 'cut' | 'served' | 'eaten', ChallengeToken[]> = {
      raw: [token('raw', 'Frutas ainda sem lavar', '🍎')],
      washed: [token('washed', 'Frutas limpas e inteiras', '🍎'), token('clean', 'Água da lavagem', '💧')],
      cut: [token('cut', 'Frutas limpas e cortadas por um adulto', '🍎'), token('pieces', 'Pedaços prontos para servir', '🍇')],
      served: [token('served', 'Frutas cortadas servidas na tigela', '🥣')],
      eaten: [token('eaten', 'Frutas comidas no piquenique', '😋'), token('empty-bowl', 'Tigela vazia', '🥣')],
    };
    const operations = {
      wash: { before: 'raw', after: 'washed', needs: 'As frutas precisam estar inteiras e ainda sem lavar.' },
      cut: { before: 'washed', after: 'cut', needs: 'Um adulto só vai cortar depois que as frutas forem lavadas.' },
      serve: { before: 'cut', after: 'served', needs: 'Para servir, as frutas precisam estar lavadas e cortadas.' },
      eat: { before: 'served', after: 'eaten', needs: 'Para comer, as frutas precisam ter sido servidas.' },
    } as const;
    push('Antes de começar', 'As frutas estão inteiras e ainda não foram lavadas.', { tokens: scenes[state] });
    for (const [index, id] of sequence.entries()) {
      const operation = operations[id as keyof typeof operations];
      const command = instructions[index];
      if (!operation || state !== operation.before) {
        push(`Passo ${index + 1}: vamos revisar`, operation?.needs ?? 'Esta ação não faz parte do preparo das frutas.', { tokens: scenes[state], activeInstruction: command.id }, 'warning');
        break;
      }
      state = operation.after;
      push(`Passo ${index + 1}`, command.label, { tokens: scenes[state], activeInstruction: command.id, counters: [{ label: 'Ação', value: `${index + 1} de ${sequence.length}` }] });
    }
  } else {
    const tokens: ChallengeToken[] = [];
    push('Antes de começar', 'Nenhuma ação foi executada ainda.', { tokens });
    for (const [index, id] of sequence.entries()) {
      const item = activity.items.find((step) => step.id === id)!;
      tokens.push(item);
      push(`Passo ${index + 1}`, item.label, { tokens, activeInstruction: instructions[index].id });
    }
  }
  return finish(activity.title, model, instructions, frames, evaluateChallenge(activity, answer));
}

function simulateDecomposition(activity: Extract<CurriculumActivity, { kind: 'decompose' }>, answer: ChallengeAnswer): ProgramSimulationData | null {
  if (!strings(answer.sequence) || !answer.sequence.length || !record(answer.stages)) return null;
  const parts: { id: string; title: string; commands: { id: string; token: ChallengeToken }[] }[] = [];
  let commandCount = 0;
  for (const [index, stageId] of answer.sequence.entries()) {
    const stage = activity.stages.find(({ id }) => id === stageId);
    const selected = answer.stages[stageId];
    if (!stage || !strings(selected) || !selected.every((id) => stage.items.some((item) => item.id === id))) return null;
    commandCount += selected.length;
    if (commandCount > MAX_STEPS) return null;
    parts.push({ id: `part-${index}`, title: stage.title, commands: selected.map((id, step) => ({ id: `part-${index}-step-${step}`, token: stage.items.find((item) => item.id === id)! })) });
  }
  const instructions = parts.flatMap((part) => [{ id: part.id, label: part.title }, ...part.commands.map((command) => ({ id: command.id, label: command.token.label }))]);
  const { frames, push } = timeline();
  const state = { pot: false, soil: false, hole: false, seed: false, cover: false, check: false, water: false };
  const extras: ChallengeToken[] = [];
  const scene = (): ChallengeToken[] => [
    ...(state.pot ? [token('pot', state.soil ? 'Vaso com terra' : 'Vaso vazio', '🪴')] : []),
    ...(state.soil ? [token('soil', state.water ? 'Terra úmida' : 'Terra seca', state.water ? '💧' : '🟤')] : []),
    ...(state.hole && !state.cover ? [token('hole', 'Buraco aberto na terra', '🕳️')] : []),
    ...(state.seed ? [token('seed', state.cover ? 'Semente coberta com terra' : 'Semente dentro do buraco', '🌱')] : []),
    ...(state.check ? [token('check', state.water ? 'Terra verificada e regada' : 'Verificação: a terra está seca', '🔎')] : []),
    ...extras,
  ];
  push('Antes de começar', 'Vamos executar apenas as partes e os passos que você montou. O vaso ainda não foi preparado.', { tokens: scene() });
  let interrupted = false;
  for (const [partIndex, part] of parts.entries()) {
    const counters = [{ label: 'Parte', value: `${partIndex + 1} de ${parts.length}` }];
    push(`Começar a parte ${partIndex + 1}`, part.title, { tokens: scene(), activeInstruction: part.id, counters });
    if (!part.commands.length) push('Esta parte está vazia', 'Nenhum passo foi montado nesta parte. O programa segue sem fazer mudanças.', { tokens: scene(), activeInstruction: part.id, counters }, 'warning');
    for (const command of part.commands) {
      const id = command.token.id;
      let warning = '';
      if (id === 'pot') {
        if (state.pot) warning = 'O vaso já foi preparado. Este passo repetido não inicia outra horta.';
        else state.pot = true;
      } else if (id === 'soil') {
        if (!state.pot) warning = 'A terra precisa de um vaso. Primeiro é preciso pegar o vaso vazio.';
        else if (state.soil) warning = 'O vaso já tem terra. Este passo está repetido.';
        else state.soil = true;
      } else if (id === 'hole') {
        if (!state.soil) warning = 'Ainda não há terra no vaso para abrir o buraco.';
        else if (state.hole) warning = 'O buraco já foi aberto. Este passo está repetido.';
        else state.hole = true;
      } else if (id === 'seed') {
        if (!state.hole || state.cover) warning = 'Para colocar a semente, precisamos de um buraco aberto na terra.';
        else if (state.seed) warning = 'A semente já está no buraco. Este passo está repetido.';
        else state.seed = true;
      } else if (id === 'cover') {
        if (!state.seed) warning = 'Não há uma semente no buraco para cobrir.';
        else if (state.cover) warning = 'A semente já está coberta. Este passo está repetido.';
        else state.cover = true;
      } else if (id === 'check') {
        if (!state.cover) warning = 'Esta parte cuida da semente plantada. Primeiro é preciso terminar de plantar e cobrir a semente.';
        else if (state.check) warning = 'A terra já foi verificada. Este passo está repetido.';
        else state.check = true;
      } else if (id === 'water') {
        if (!state.check) warning = 'Antes de regar, precisamos verificar a terra da semente já plantada.';
        else if (state.water) warning = 'A terra já foi regada. Repetir esta ação colocaria água demais.';
        else state.water = true;
      } else {
        extras.push({ ...command.token, id: `${command.id}-${id}` });
        push('Uma ação fora do plano da horta', `${command.token.label}. Essa ação não prepara nem cuida da semente; observe o que ainda falta.`, { tokens: scene(), activeInstruction: command.id, counters }, 'warning');
        continue;
      }
      push(warning ? 'Este passo ainda não pode acontecer' : command.token.label, warning || 'A ação mudou a horta. Vamos acompanhar o próximo passo escolhido.', { tokens: scene(), activeInstruction: command.id, counters }, warning ? 'warning' : 'normal');
      if (warning) { interrupted = true; break; }
    }
    if (interrupted) break;
  }
  return finish(activity.title, { kind: 'story', theme: 'garden' }, instructions, frames, evaluateChallenge(activity, answer));
}

function simulateGraph(activity: Extract<CurriculumActivity, { kind: 'graph' }>, answer: ChallengeAnswer): ProgramSimulationData | null {
  const path = answer.path;
  if (!strings(path) || !path.length || !path.every((id) => activity.nodes.some((item) => item.id === id))) return null;
  const model: SimulationModel = { kind: 'graph', nodes: activity.nodes, edges: activity.edges, start: activity.start, goal: activity.goal };
  const instructions = path.map((id, index) => ({ id: `stop-${index}`, label: `${index === 0 ? 'Sair de' : 'Ir para'} ${activity.nodes.find((item) => item.id === id)!.label}` }));
  const { frames, push } = timeline();
  const visited = [activity.start];
  let active = activity.start;
  push('Antes de começar', 'A viagem começa no porto. O viajante só atravessa onde existe uma ponte.', { active, visited });
  if (path[0] !== activity.start) {
    push('A partida precisa ser revisada', 'O primeiro lugar do seu plano não é o porto. O viajante continua no ponto de partida.', { active, visited, activeInstruction: 'stop-0' }, 'warning');
  } else {
    push('Ponto de partida', 'O viajante está no primeiro lugar escolhido.', { active, visited, activeInstruction: 'stop-0' });
    for (let index = 1; index < path.length; index += 1) {
      const next = path[index];
      const connected = activity.edges.some(([from, to]) => (from === active && to === next) || (to === active && from === next));
      const counters = [{ label: 'Travessia', value: `${index} de ${path.length - 1}` }];
      if (index > activity.maxSteps || !connected) {
        push('Travessia interrompida', index > activity.maxSteps ? 'O caminho ultrapassou o limite de travessias desta expedição.' : 'Não existe uma ponte para o próximo lugar escolhido. O viajante fica na última ilha alcançada.', { active, visited, activeInstruction: `stop-${index}`, counters }, 'warning');
        break;
      }
      active = next;
      visited.push(active);
      const node = activity.nodes.find(({ id }) => id === active)!;
      push(`Travessia ${index}`, `O viajante atravessou a ponte e chegou em ${node.label}.`, { active, visited, activeInstruction: `stop-${index}`, counters });
    }
  }
  return finish(activity.title, model, instructions, frames, evaluateChallenge(activity, answer));
}

export function simulateCurriculumProgram(activity: CurriculumActivity, answer: ChallengeAnswer): ProgramSimulationData | null {
  if (!record(answer)) return null;
  switch (activity.kind) {
    case 'repeat':
    case 'until': return simulateTrack(activity, answer);
    case 'nested': return simulateNested(activity, answer);
    case 'branch': return simulateBranch(activity, answer);
    case 'sequence': return simulateSequence(activity, answer);
    case 'decompose': return simulateDecomposition(activity, answer);
    case 'graph': return simulateGraph(activity, answer);
    default: return null;
  }
}

export function simulateRobotProgram(board: RobotBoard, commands: readonly Direction[]): ProgramSimulationData {
  const checked = runProgram(board, commands);
  const cellId = (cell: { row: number; column: number }) => `${cell.row},${cell.column}`;
  const model: SimulationModel = { kind: 'grid', rows: board.rows, columns: board.columns, rocks: board.rocks.map(cellId), start: cellId(board.start), goal: cellId(board.goal) };
  const instructions = commands.slice(0, MAX_STEPS).map((direction, index) => ({ id: `command-${index}`, label: DIRECTIONS.find(({ id }) => id === direction)?.label ?? 'Comando desconhecido' }));
  const { frames, push } = timeline();
  const visited = [cellId(board.start)];
  let active = cellId(board.start);
  push('Antes de começar', 'O robô está na saída. Vamos executar as setas na ordem em que foram montadas.', { active, visited });
  for (let index = 1; index < checked.path.length; index += 1) {
    active = cellId(checked.path[index]);
    visited.push(active);
    push(`Comando ${index}`, instructions[index - 1].label, { active, visited, activeInstruction: `command-${index - 1}`, counters: [{ label: 'Comando', value: `${index} de ${commands.length}` }] });
  }
  const messages = {
    success: 'O robô chegou à estrela seguindo todas as setas do seu programa!',
    incomplete: 'O programa terminou com o robô fora da estrela. Observe onde ele parou e ajuste o caminho.',
    blocked: 'Uma pedra bloqueou este passo. O robô ficou na última casa livre; revise a seta destacada.',
    outside: 'Esta seta levaria o robô para fora do tabuleiro. Ele ficou na última casa segura; revise esse passo.',
    invalid: 'Este programa tem um comando ou uma configuração inválida. Use as setas e o limite apresentados no desafio.',
  };
  if (checked.failedStep !== null) push(`Comando ${checked.failedStep + 1}: vamos revisar`, messages[checked.status], { active, visited, activeInstruction: `command-${checked.failedStep}`, counters: [{ label: 'Comando', value: `${checked.failedStep + 1} de ${commands.length}` }] }, 'warning');
  return finish('Programa do robô', model, instructions, frames, { correct: checked.status === 'success', message: messages[checked.status] });
}
