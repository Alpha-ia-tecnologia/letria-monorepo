export type SchoolYear = 1 | 2 | 3 | 4 | 5;
export type SkillCode = 'EF01CO01' | 'EF01CO02' | 'EF01CO03' | 'EF02CO01' | 'EF02CO02' | 'EF03CO01' | 'EF03CO02' | 'EF03CO03' | 'EF04CO01' | 'EF04CO02' | 'EF04CO03' | 'EF05CO01' | 'EF05CO02' | 'EF05CO03' | 'EF05CO04';
export type ChallengeToken = { id: string; label: string; symbol: string };
export type ChallengeBase = { id: string; grade: SchoolYear; skill: SkillCode; title: string; subtitle: string; prompt: string; hint: string; concept: string };
export type ChallengeMechanic =
  | { kind: 'classify'; items: readonly ChallengeToken[]; groups: readonly ChallengeToken[]; expected: Readonly<Record<string, string>> }
  | { kind: 'sequence'; items: readonly ChallengeToken[]; expected: readonly string[]; reference?: readonly string[] }
  | { kind: 'select'; items: readonly ChallengeToken[]; expected: readonly string[]; models: readonly { title: string; attributes: readonly string[] }[] }
  | { kind: 'truth'; statements: readonly { id: string; label: string; expected: boolean }[] }
  | { kind: 'repeat'; track: readonly ChallengeToken[]; start: number; target: number; maxCount: number }
  | { kind: 'until'; track: readonly ChallengeToken[]; start: number; target: number; stopOptions: readonly ChallengeToken[] }
  | { kind: 'decompose'; stages: readonly { id: string; title: string; items: readonly ChallengeToken[]; expected: readonly string[] }[]; expectedOrder: readonly string[] }
  | { kind: 'matrix'; rows: number; columns: number; initial: readonly string[]; target: readonly string[]; tasks: readonly string[] }
  | { kind: 'record'; fields: readonly { id: string; label: string; initial: string; options: readonly string[]; expected: string }[]; tasks: readonly string[] }
  | { kind: 'nested'; rows: number; columns: number; maxCount: number }
  | { kind: 'list'; items: readonly ChallengeToken[]; initial: readonly string[]; expected: readonly string[]; tasks: readonly string[]; maxItems: number }
  | { kind: 'graph'; nodes: readonly (ChallengeToken & { x: number; y: number })[]; edges: readonly (readonly [string, string])[]; start: string; goal: string; via: readonly string[]; maxSteps: number }
  | { kind: 'branch'; cases: readonly { id: string; label: string; dry: boolean }[] };
export type CurriculumActivity = ChallengeBase & ChallengeMechanic;
export type ChallengeAnswer = {
  selected?: string[];
  sequence?: string[];
  groups?: Record<string, string>;
  truths?: Record<string, boolean>;
  parameters?: Record<string, string>;
  stages?: Record<string, string[]>;
  grid?: string[];
  fields?: Record<string, string>;
  path?: string[];
};
export type ChallengeResult = { correct: boolean; message: string; trace?: string[] };
