import type { ChallengeResult, ChallengeToken } from './computational-curriculum-types';

export type SimulationModel =
  | { kind: 'track'; places: readonly ChallengeToken[]; start: string; goal: string }
  | { kind: 'grid'; rows: number; columns: number; rocks: readonly string[]; start?: string; goal?: string }
  | { kind: 'pots'; pots: readonly { id: string; label: string; dry: boolean }[] }
  | { kind: 'story'; theme: 'picnic' | 'garden' | 'steps' }
  | { kind: 'graph'; nodes: readonly (ChallengeToken & { x: number; y: number })[]; edges: readonly (readonly [string, string])[]; start: string; goal: string };

export type SimulationFrame = {
  instruction: string;
  description: string;
  tone: 'normal' | 'success' | 'warning';
  activeInstruction?: string;
  active?: string;
  visited?: readonly string[];
  planted?: readonly string[];
  tokens?: readonly ChallengeToken[];
  pots?: Readonly<Record<string, { dry: boolean; action: 'water' | 'skip' | null; overwatered?: boolean }>>;
  counters?: readonly { label: string; value: string }[];
  condition?: { label: string; value: boolean };
};

export type ProgramSimulationData = {
  title: string;
  model: SimulationModel;
  instructions: readonly { id: string; label: string }[];
  frames: readonly SimulationFrame[];
  result: ChallengeResult;
};
