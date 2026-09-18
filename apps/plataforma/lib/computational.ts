import { CURRICULUM_IDS } from './computational-curriculum';

export const INTRO_LAB_IDS = ['parts', 'patterns', 'algorithm', 'debug'] as const;
export const LAB_IDS = [...INTRO_LAB_IDS, ...CURRICULUM_IDS] as const;
export type LabId = typeof LAB_IDS[number];
export type Direction = 'up' | 'right' | 'down' | 'left';
export type Cell = { row: number; column: number };
export type RobotBoard = {
  rows: number; columns: number; start: Cell; goal: Cell; rocks: readonly Cell[]; maxCommands: number;
};
export type ProgramResult = {
  status: 'success' | 'incomplete' | 'blocked' | 'outside' | 'invalid';
  path: Cell[];
  failedStep: number | null;
};
export type LabProgress = { version: 1; completed: LabId[] };

export const LAB_ACTIVITIES: readonly {
  id: typeof INTRO_LAB_IDS[number]; title: string; subtitle: string; prompt: string; hint: string; concept: string;
}[] = [
  {
    id: 'parts', title: 'Pequenos passos', subtitle: 'Dividir para resolver',
    prompt: 'Vamos plantar uma semente! Quais são os três pequenos passos de que precisamos?',
    hint: 'Pense no que uma semente precisa para começar a crescer. O que fazemos com a terra, a semente e a água?',
    concept: 'Você dividiu uma tarefa maior em partes menores. Isso se chama decomposição.',
  },
  {
    id: 'patterns', title: 'O que vem depois?', subtitle: 'Encontrar padrões',
    prompt: 'Observe as figuras que se repetem. Qual figura completa a sequência?',
    hint: 'Leia os grupos em voz alta: sol, folha, folha. Depois começa outro grupo igual.',
    concept: 'Você encontrou uma repetição e descobriu o próximo elemento. Isso é reconhecer padrões.',
  },
  {
    id: 'algorithm', title: 'Robô explorador', subtitle: 'Criar um caminho',
    prompt: 'Programe o robô para chegar à estrela. Cada seta anda uma casa. Desvie das pedras!',
    hint: 'Olhe o caminho inteiro antes de começar. Você pode passar pela coluna da esquerda e depois pelo alto do mapa.',
    concept: 'Você criou uma sequência de instruções. Essa sequência é um algoritmo!',
  },
  {
    id: 'debug', title: 'Detetive de setas', subtitle: 'Encontrar e corrigir',
    prompt: 'Uma seta deste programa está errada. Escolha o passo que precisa mudar e troque a direção.',
    hint: 'Acompanhe as setas uma por uma. O robô começa embaixo: pode descer ainda mais depois das duas primeiras setas?',
    concept: 'Você encontrou um problema e corrigiu a instrução. Isso se chama depuração.',
  },
];

export const PLANT_STEPS = [
  { id: 'soil', label: 'Colocar terra no vaso', symbol: '🪴' },
  { id: 'balloon', label: 'Encher um balão', symbol: '🎈' },
  { id: 'seed', label: 'Colocar a semente na terra', symbol: '🌱' },
  { id: 'water', label: 'Regar com um pouco de água', symbol: '💧' },
] as const;
export const REQUIRED_PLANT_STEPS = ['soil', 'seed', 'water'] as const;
export const REPEATING_PATTERN = ['sun', 'leaf', 'leaf'] as const;
export const PATTERN_VISIBLE_LENGTH = 5;
export const PATTERN_OPTIONS = [
  { id: 'sun', symbol: '☀️', label: 'Sol' },
  { id: 'cloud', symbol: '☁️', label: 'Nuvem' },
  { id: 'leaf', symbol: '🍃', label: 'Folha' },
  { id: 'star', symbol: '⭐', label: 'Estrela' },
] as const;
export const DIRECTIONS: readonly { id: Direction; label: string; symbol: string }[] = [
  { id: 'up', label: 'Para cima', symbol: '↑' },
  { id: 'right', label: 'Para a direita', symbol: '→' },
  { id: 'down', label: 'Para baixo', symbol: '↓' },
  { id: 'left', label: 'Para a esquerda', symbol: '←' },
];
export const ROBOT_BOARD: RobotBoard = {
  rows: 4, columns: 4,
  start: { row: 3, column: 0 }, goal: { row: 0, column: 3 },
  rocks: [{ row: 2, column: 1 }, { row: 1, column: 1 }, { row: 1, column: 3 }],
  maxCommands: 10,
};
export const BROKEN_PROGRAM: readonly Direction[] = ['right', 'right', 'down', 'up', 'up', 'right'];

export function sameCell(a: Cell, b: Cell): boolean {
  return a.row === b.row && a.column === b.column;
}

export function matchesRequiredSteps(selected: unknown, required: readonly string[]): boolean {
  if (!Array.isArray(selected) || selected.length !== required.length) return false;
  if (new Set(selected).size !== selected.length) return false;
  return selected.every(item => typeof item === 'string' && required.includes(item));
}

export function patternAt(pattern: readonly string[], index: number): string | null {
  if (!pattern.length || !Number.isSafeInteger(index) || index < 0) return null;
  return pattern[index % pattern.length];
}

function isDirection(value: unknown): value is Direction {
  return DIRECTIONS.some(item => item.id === value);
}

export function runProgram(board: RobotBoard, commands: unknown): ProgramResult {
  const path = [{ ...board.start }];
  const failure = (status: ProgramResult['status'], failedStep: number | null): ProgramResult => ({ status, path, failedStep });
  const inside = (cell: Cell) => Number.isInteger(cell.row) && Number.isInteger(cell.column) &&
    cell.row >= 0 && cell.column >= 0 && cell.row < board.rows && cell.column < board.columns;
  if (!Number.isInteger(board.rows) || !Number.isInteger(board.columns) ||
      board.rows < 1 || board.columns < 1 || board.rows > 20 || board.columns > 20 ||
      !Number.isInteger(board.maxCommands) || board.maxCommands < 1 || board.maxCommands > 100 ||
      !inside(board.start) || !inside(board.goal) || board.rocks.some(cell => !inside(cell) || sameCell(cell, board.start) || sameCell(cell, board.goal)) ||
      !Array.isArray(commands) || commands.length > board.maxCommands || !commands.every(isDirection)) {
    return failure('invalid', null);
  }
  let position = { ...board.start };
  for (let index = 0; index < commands.length; index++) {
    const direction = commands[index] as Direction;
    const next = {
      row: position.row + (direction === 'up' ? -1 : direction === 'down' ? 1 : 0),
      column: position.column + (direction === 'left' ? -1 : direction === 'right' ? 1 : 0),
    };
    if (!inside(next)) return failure('outside', index);
    if (board.rocks.some(rock => sameCell(rock, next))) return failure('blocked', index);
    path.push(next);
    position = next;
  }
  return failure(sameCell(position, board.goal) ? 'success' : 'incomplete', null);
}

export function repairProgram(commands: readonly Direction[], index: number, replacement: Direction): Direction[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= commands.length || !isDirection(replacement) ||
      !commands.every(isDirection)) return null;
  return commands.map((direction, position) => position === index ? replacement : direction);
}

export function decodeLabProgress(raw: unknown): LabProgress {
  const empty: LabProgress = { version: 1, completed: [] };
  if (typeof raw !== 'string' || raw.length > 2048) return empty;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return empty;
    const record = value as Record<string, unknown>;
    if (record.version !== 1 || !Array.isArray(record.completed)) return empty;
    return { version: 1, completed: LAB_IDS.filter(id => record.completed && (record.completed as unknown[]).includes(id)) };
  } catch {
    return empty;
  }
}

export function completeLabActivity(progress: LabProgress, activity: LabId): LabProgress {
  if (!LAB_IDS.includes(activity)) return progress;
  return { version: 1, completed: LAB_IDS.filter(id => id === activity || progress.completed.includes(id)) };
}
