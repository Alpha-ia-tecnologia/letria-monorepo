import test from 'node:test';
import assert from 'node:assert/strict';
import { BNCC_SKILLS, BNCC_SOURCE, CURRICULUM_ACTIVITIES, CURRICULUM_IDS, evaluateChallenge, type CurriculumId } from '../lib/computational-curriculum';
import type { ChallengeAnswer, CurriculumActivity } from '../lib/computational-curriculum-types';

const activity = (id: CurriculumId): CurriculumActivity => {
  const found = CURRICULUM_ACTIVITIES.find((item) => item.id === id);
  assert.ok(found, `Missing activity: ${id}`);
  return found;
};

// Independent answers describe the intended learner actions, rather than copying expected fields.
const solutions: Record<CurriculumId, ChallengeAnswer> = {
  'shape-gardens': { groups: { 'red-circle': 'circles', 'blue-square': 'squares', 'yellow-circle': 'circles', 'red-square': 'squares', 'blue-circle': 'circles', 'yellow-square': 'squares' } },
  'follow-the-trail': { sequence: ['camp', 'bridge', 'tree', 'picnic'] },
  'picnic-sequence': { sequence: ['wash', 'cut', 'serve', 'eat'] },
  'essential-backpack': { selected: ['straps', 'storage'] },
  'bridge-repeat': { parameters: { direction: 'forward', count: '4' } },
  'true-or-false': { truths: { three: true, two: false, 'not-open': true, 'not-three': false } },
  'lighthouse-until': { parameters: { direction: 'forward', stop: 'lighthouse' } },
  'party-parts': { stages: { care: ['check', 'water'], materials: ['pot', 'soil'], plant: ['hole', 'seed', 'cover'] }, sequence: ['materials', 'plant', 'care'] },
  'seed-matrix': { grid: ['2,3', '0,2', '2,0', '1,1'] },
  'animal-record': { fields: { name: 'Mimo', age: '3 anos', island: 'Ilha do Rio', food: 'Frutas' } },
  'garden-loops': { parameters: { rows: '3', columns: '4' } },
  'backpack-list': { sequence: ['apple', 'book', 'water'] },
  'island-routes': { path: ['port', 'orchard', 'library', 'school'] },
  'logic-gates': { truths: { 'and-both': true, 'and-one': false, 'or-both': true, 'or-one': true, 'not-map': false, 'not-key': true } },
  'water-decisions': { parameters: { dry: 'water', wet: 'skip' } },
};

test('curriculum has one practice for each of the 15 early-years computational thinking skills', () => {
  assert.equal(CURRICULUM_ACTIVITIES.length, 15);
  assert.deepEqual(CURRICULUM_ACTIVITIES.map(({ id }) => id), [...CURRICULUM_IDS]);
  assert.equal(new Set(CURRICULUM_IDS).size, 15);
  assert.deepEqual(CURRICULUM_ACTIVITIES.map(({ skill }) => skill).sort(), Object.keys(BNCC_SKILLS).sort());
  assert.match(BNCC_SOURCE, /^https:\/\/basenacionalcomum\.mec\.gov\.br\//);
  for (const item of CURRICULUM_ACTIVITIES) {
    assert.equal(BNCC_SKILLS[item.skill].grade, item.grade);
    assert.ok(item.title && item.prompt && item.hint && item.concept);
  }
});

for (const id of CURRICULUM_IDS) {
  test(`${id}: the intended learner solution works without changing activity or answer`, () => {
    const challenge = activity(id);
    const answer = structuredClone(solutions[id]);
    const before = JSON.stringify({ challenge, answer });
    const checked = evaluateChallenge(challenge, answer);
    assert.equal(checked.correct, true, checked.message);
    assert.ok(checked.message.length > 20);
    assert.equal(JSON.stringify({ challenge, answer }), before);
    assert.equal(evaluateChallenge(challenge, {}).correct, false, 'An unanswered activity cannot be completed.');
    assert.equal(evaluateChallenge(challenge, null as unknown as ChallengeAnswer).correct, false);
  });
}

test('classification requires every item in a known group and uses shape rather than colour', () => {
  const challenge = activity('shape-gardens');
  const groups = solutions['shape-gardens'].groups!;
  assert.equal(evaluateChallenge(challenge, { groups: { ...groups, 'red-square': 'circles' } }).correct, false);
  assert.equal(evaluateChallenge(challenge, { groups: { ...groups, 'red-square': 'red' } }).correct, false);
  assert.equal(evaluateChallenge(challenge, { groups: { ...groups, unknown: 'circles' } }).correct, false);
  assert.equal(evaluateChallenge(challenge, { groups: { 'red-circle': 'circles' } }).correct, false);
});

test('step algorithms reject shuffled, missing, duplicate and unknown steps', () => {
  for (const id of ['follow-the-trail', 'picnic-sequence'] as const) {
    const steps = solutions[id].sequence!;
    assert.equal(evaluateChallenge(activity(id), { sequence: steps.toReversed() }).correct, false);
    assert.equal(evaluateChallenge(activity(id), { sequence: steps.slice(1) }).correct, false);
    assert.equal(evaluateChallenge(activity(id), { sequence: [steps[0], steps[0], ...steps.slice(2)] }).correct, false);
    assert.equal(evaluateChallenge(activity(id), { sequence: [steps[0], 'teleport', ...steps.slice(2)] }).correct, false);
  }
});

test('essential attributes accept either selection order but reject decorations or duplicates', () => {
  const challenge = activity('essential-backpack');
  assert.equal(evaluateChallenge(challenge, { selected: ['storage', 'straps'] }).correct, true);
  for (const selected of [['storage'], ['storage', 'straps', 'star'], ['storage', 'storage'], ['purple', 'star'], ['unknown']]) {
    assert.equal(evaluateChallenge(challenge, { selected }).correct, false);
  }
});

test('logical answers require explicit booleans and inclusive OR accepts two true operands', () => {
  const challenge = activity('logic-gates');
  const truths = solutions['logic-gates'].truths!;
  assert.equal(evaluateChallenge(challenge, { truths: { ...truths, 'or-both': false } }).correct, false);
  assert.equal(evaluateChallenge(challenge, { truths: { ...truths, 'not-map': true } }).correct, false);
  assert.equal(evaluateChallenge(challenge, { truths: { ...truths, unknown: true } }).correct, false);
  assert.equal(evaluateChallenge(challenge, { truths: { ...truths, 'or-both': 'true' } } as unknown as ChallengeAnswer).correct, false);
  assert.equal(evaluateChallenge(activity('true-or-false'), { truths: { three: true, two: false, 'not-open': true } }).correct, false);
});

test('counted repetition simulates each move, checks final position and stops at boundaries', () => {
  const challenge = activity('bridge-repeat');
  const solved = evaluateChallenge(challenge, solutions['bridge-repeat']);
  assert.deepEqual(solved.trace, ['Início: Flor.', 'Passo 1: Pedra.', 'Passo 2: Árvore.', 'Passo 3: Ponte.', 'Passo 4: Farol.']);
  const overshoot = evaluateChallenge(challenge, { parameters: { direction: 'forward', count: '5' } });
  assert.equal(overshoot.correct, false);
  assert.equal(overshoot.trace?.at(-1), 'Passo 5: Montanha.');
  const outside = evaluateChallenge(challenge, { parameters: { direction: 'back', count: '4' } });
  assert.equal(outside.correct, false);
  assert.deepEqual(outside.trace, ['Início: Flor.', 'Passo 1: Acampamento.', 'Passo 2: fora da trilha; execução interrompida.']);
  for (const count of ['0', '-1', '2.5', '4abc', '04', 'Infinity', '9', '100000000000000000000']) {
    assert.equal(evaluateChallenge(challenge, { parameters: { direction: 'forward', count } }).correct, false);
  }
  assert.equal(evaluateChallenge(challenge, { parameters: { direction: 'teleport', count: '4' } }).correct, false);
});

test('conditional repetition checks the current cell before moving and stops at the selected condition', () => {
  const challenge = activity('lighthouse-until');
  const solved = evaluateChallenge(challenge, solutions['lighthouse-until']);
  assert.equal(solved.trace?.filter((step) => step.includes('dar mais um passo')).length, 4);
  assert.equal(solved.trace?.at(-1), 'Farol: condição satisfeita; parar.');
  const immediate = evaluateChallenge(challenge, { parameters: { direction: 'forward', stop: 'camp' } });
  assert.equal(immediate.correct, false);
  assert.deepEqual(immediate.trace, ['Início: Acampamento.', 'Acampamento: condição satisfeita; parar.']);
  const early = evaluateChallenge(challenge, { parameters: { direction: 'forward', stop: 'flower' } });
  assert.equal(early.correct, false);
  assert.equal(early.trace?.at(-1), 'Flor: condição satisfeita; parar.');
  const outside = evaluateChallenge(challenge, { parameters: { direction: 'back', stop: 'lighthouse' } });
  assert.equal(outside.correct, false);
  assert.match(outside.trace?.at(-1) ?? '', /execução interrompida/);
  assert.equal(evaluateChallenge(challenge, { parameters: { direction: 'forward', stop: 'unknown' } }).correct, false);
});

test('decomposition requires solved ordered subprograms as well as their correct combination', () => {
  const challenge = activity('party-parts');
  const complete = solutions['party-parts'];
  assert.equal(evaluateChallenge(challenge, { ...complete, sequence: ['plant', 'materials', 'care'] }).correct, false);
  assert.equal(evaluateChallenge(challenge, { ...complete, stages: { ...complete.stages, materials: ['soil', 'pot'] } }).correct, false);
  assert.equal(evaluateChallenge(challenge, { ...complete, stages: { ...complete.stages, plant: ['hole', 'seed', 'seed'] } }).correct, false);
  assert.equal(evaluateChallenge(challenge, { ...complete, stages: { ...complete.stages, care: ['water'] } }).correct, false);
  const trace = evaluateChallenge(challenge, complete).trace!;
  assert.equal(trace.filter((line) => line.startsWith('Parte ')).length, 3);
  assert.equal(trace.length, 10, 'The composed execution includes every step of all three parts.');
  assert.ok(trace.findIndex((line) => line.includes('Pegar um vaso vazio')) < trace.findIndex((line) => line.includes('Abrir um buraco')));
});

test('matrix edits distinguish row and column and preserve untouched cells', () => {
  const challenge = activity('seed-matrix');
  assert.equal(evaluateChallenge(challenge, { grid: ['0,0', '1,1', '2,3'] }).correct, false);
  assert.equal(evaluateChallenge(challenge, { grid: ['0,2', '2,0'] }).correct, false, 'Existing seeds that were not mentioned must stay.');
  assert.equal(evaluateChallenge(challenge, { grid: ['0,2', '1,1', '2,0', '2,3', '2,3'] }).correct, false);
  assert.equal(evaluateChallenge(challenge, { grid: ['0,2', '1,1', '2,0', '3,2'] }).correct, false);
  assert.equal(evaluateChallenge(challenge, { grid: ['0,2', '1,1', '2,0', '2.0,3'] }).correct, false);
  assert.equal(evaluateChallenge(challenge, { grid: ['0,2', '1,1', '2,0', '-1,3'] }).correct, false);
});

test('record updates must change the requested fields while retaining name and food', () => {
  const challenge = activity('animal-record');
  const fields = solutions['animal-record'].fields!;
  assert.equal(evaluateChallenge(challenge, { fields: { ...fields, age: '2 anos' } }).correct, false);
  assert.equal(evaluateChallenge(challenge, { fields: { ...fields, name: 'Lumi' } }).correct, false);
  assert.equal(evaluateChallenge(challenge, { fields: { ...fields, food: 'Folhas' } }).correct, false);
  assert.equal(evaluateChallenge(challenge, { fields: { ...fields, age: '99 anos' } }).correct, false);
  assert.equal(evaluateChallenge(challenge, { fields: { age: '3 anos', island: 'Ilha do Rio' } }).correct, false);
});

test('nested repetitions restart the inner loop for each outer iteration, with shape as well as total checked', () => {
  const challenge = activity('garden-loops');
  const solved = evaluateChallenge(challenge, solutions['garden-loops']);
  const planting = solved.trace!.filter((line) => line.includes('plantar na linha'));
  assert.equal(planting.length, 12);
  assert.equal(planting.filter((line) => line.startsWith('Repetição de dentro 1:')).length, 3);
  assert.match(planting[4], /linha 2, coluna 1/);
  assert.match(planting.at(-1)!, /linha 3, coluna 4/);
  const transposed = evaluateChallenge(challenge, { parameters: { rows: '4', columns: '3' } });
  assert.equal(transposed.correct, false, 'The same total in a different arrangement does not satisfy the requested matrix.');
  assert.equal(transposed.trace?.filter((line) => line.includes('plantar na linha')).length, 12);
  for (const rows of ['0', '7', '3.0', '3e0', '-3']) {
    assert.equal(evaluateChallenge(challenge, { parameters: { rows, columns: '4' } }).correct, false);
  }
});

test('list manipulation rejects a correct set in the wrong order and repeated or unchanged items', () => {
  const challenge = activity('backpack-list');
  for (const sequence of [['book', 'apple', 'toy'], ['book', 'apple', 'water'], ['apple', 'book', 'water', 'water'], ['apple', 'book'], ['apple', 'book', 'unknown']]) {
    assert.equal(evaluateChallenge(challenge, { sequence }).correct, false);
  }
});

test('graph traversal accepts alternative connected routes and rejects skipped bridges or a missed destination', () => {
  const challenge = activity('island-routes');
  const alternate = ['port', 'bridge', 'lake', 'library', 'school'];
  assert.equal(evaluateChallenge(challenge, { path: alternate }).correct, true);
  assert.deepEqual(evaluateChallenge(challenge, { path: alternate }).trace, ['Porto', 'Ilha das Flores', 'Lago', 'Biblioteca', 'Escola']);
  assert.equal(evaluateChallenge(challenge, { path: ['port', 'library', 'school'] }).correct, false);
  assert.equal(evaluateChallenge(challenge, { path: ['port', 'bridge', 'lake', 'school'] }).correct, false);
  assert.equal(evaluateChallenge(challenge, { path: ['port', 'orchard', 'library'] }).correct, false);
  assert.equal(evaluateChallenge(challenge, { path: ['orchard', 'library', 'school'] }).correct, false);
  assert.equal(evaluateChallenge(challenge, { path: ['port', 'port', 'orchard', 'library', 'school'] }).correct, false);
  assert.equal(evaluateChallenge(challenge, { path: ['port', 'unknown', 'school'] }).correct, false);
  assert.equal(evaluateChallenge(challenge, { path: ['port', 'orchard', 'port', 'orchard', 'port', 'orchard', 'library', 'lake', 'school'] }).correct, false);
});

test('conditional selection executes both branches on every case and reveals the programmed actions', () => {
  const challenge = activity('water-decisions');
  const solved = evaluateChallenge(challenge, solutions['water-decisions']);
  assert.deepEqual(solved.trace, ['Girassol: terra seca → regar.', 'Hortelã: terra úmida → esperar.', 'Samambaia: terra úmida → esperar.', 'Cenoura: terra seca → regar.']);
  const reversed = evaluateChallenge(challenge, { parameters: { dry: 'skip', wet: 'water' } });
  assert.equal(reversed.correct, false);
  assert.equal(reversed.trace?.[1], 'Hortelã: terra úmida → regar.');
  assert.equal(evaluateChallenge(challenge, { parameters: { dry: 'water', wet: 'water' } }).correct, false);
  assert.equal(evaluateChallenge(challenge, { parameters: { dry: 'water' } }).correct, false);
  assert.equal(evaluateChallenge(challenge, { parameters: { dry: 'water', wet: 'jump' } }).correct, false);
});
