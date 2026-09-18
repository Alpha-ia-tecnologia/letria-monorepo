import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRICULUM_ACTIVITIES, evaluateChallenge, type CurriculumId } from '../lib/computational-curriculum';
import type { ChallengeAnswer, CurriculumActivity } from '../lib/computational-curriculum-types';
import { BROKEN_PROGRAM, ROBOT_BOARD, type Direction } from '../lib/computational';
import { simulateCurriculumProgram, simulateRobotProgram, supportsProgramSimulation } from '../lib/program-simulation';
import type { ProgramSimulationData, SimulationFrame } from '../lib/program-simulation-types';

function activity(id: CurriculumId): CurriculumActivity {
  const found = CURRICULUM_ACTIVITIES.find((item) => item.id === id);
  assert.ok(found);
  return found;
}
function simulate(id: CurriculumId, answer: ChallengeAnswer): ProgramSimulationData {
  const data = simulateCurriculumProgram(activity(id), answer);
  assert.ok(data, `${id}: the student's valid commands must be executable`);
  assert.deepEqual(data.result, evaluateChallenge(activity(id), answer), 'The simulation must preserve curriculum grading.');
  assert.equal(data.frames[0].tone, 'normal');
  assert.equal(data.frames.at(-1)?.tone, data.result.correct ? 'success' : 'warning');
  const instructionIds = new Set(data.instructions.map(({ id }) => id));
  for (const frame of data.frames) {
    if (frame.activeInstruction) assert.ok(instructionIds.has(frame.activeInstruction), `Unknown highlighted instruction: ${frame.activeInstruction}`);
    assert.ok(frame.instruction && frame.description);
  }
  return data;
}
const final = (data: ProgramSimulationData): SimulationFrame => data.frames.at(-1)!;
const garden: ChallengeAnswer = {
  sequence: ['materials', 'plant', 'care'],
  stages: { materials: ['pot', 'soil'], plant: ['hole', 'seed', 'cover'], care: ['check', 'water'] },
};

test('only executable program activities receive a simulation, including both sequence exercises', () => {
  const supported = CURRICULUM_ACTIVITIES.filter(supportsProgramSimulation).map(({ id }) => id);
  assert.deepEqual(supported, ['follow-the-trail', 'picnic-sequence', 'bridge-repeat', 'lighthouse-until', 'party-parts', 'garden-loops', 'island-routes', 'water-decisions']);
  for (const item of CURRICULUM_ACTIVITIES.filter((item) => !supportsProgramSimulation(item))) {
    assert.equal(simulateCurriculumProgram(item, {}), null);
  }
});

test('a counted loop moves once per iteration from its actual starting place', () => {
  const data = simulate('bridge-repeat', { parameters: { direction: 'forward', count: '4' } });
  assert.equal(data.result.correct, true);
  assert.equal(data.model.kind, 'track');
  assert.equal(data.frames[0].active, 'flower');
  assert.deepEqual(data.frames.filter((frame) => frame.activeInstruction === 'move' && frame.instruction !== 'Resultado do programa').map(({ active }) => active), ['rock', 'tree', 'bridge', 'lighthouse']);
  assert.deepEqual(final(data).visited, ['flower', 'rock', 'tree', 'bridge', 'lighthouse']);
});

test('a wrong count goes past the goal, and a wrong direction stops at the boundary', () => {
  const overshoot = simulate('bridge-repeat', { parameters: { direction: 'forward', count: '5' } });
  assert.equal(overshoot.result.correct, false);
  assert.equal(final(overshoot).active, 'mountain');
  const outside = simulate('bridge-repeat', { parameters: { direction: 'back', count: '4' } });
  assert.equal(outside.result.correct, false);
  assert.deepEqual(final(outside).visited, ['flower', 'camp']);
  const blocked = outside.frames.at(-2)!;
  assert.equal(blocked.tone, 'warning');
  assert.equal(blocked.active, 'camp');
  assert.equal(blocked.counters?.[0].value, '2 de 4');
});

test('until checks before every movement, then checks true at the stop', () => {
  const data = simulate('lighthouse-until', { parameters: { direction: 'forward', stop: 'lighthouse' } });
  assert.equal(data.result.correct, true);
  const checks = data.frames.filter((frame) => frame.activeInstruction === 'condition');
  assert.deepEqual(checks.map(({ active }) => active), ['camp', 'tree', 'river', 'flower', 'lighthouse']);
  assert.deepEqual(checks.map(({ condition }) => condition?.value), [false, false, false, false, true]);
  assert.deepEqual(final(data).visited, ['camp', 'tree', 'river', 'flower', 'lighthouse']);
  assert.equal(data.frames[1].activeInstruction, 'condition');
  assert.equal(data.frames[2].activeInstruction, 'move');
});

test('an initially true stop condition never moves, even when it is the wrong destination', () => {
  const data = simulate('lighthouse-until', { parameters: { direction: 'forward', stop: 'camp' } });
  assert.equal(data.result.correct, false);
  assert.equal(data.frames[1].condition?.value, true);
  assert.equal(data.frames.some((frame) => frame.activeInstruction === 'move'), false);
  assert.deepEqual(final(data).visited, ['camp']);
});

test('until honors a wrong early stop and never invents a route outside the track', () => {
  const early = simulate('lighthouse-until', { parameters: { direction: 'forward', stop: 'flower' } });
  assert.equal(final(early).active, 'flower');
  assert.equal(early.result.correct, false);
  assert.equal(final(early).visited?.includes('lighthouse'), false);
  const outside = simulate('lighthouse-until', { parameters: { direction: 'back', stop: 'lighthouse' } });
  assert.deepEqual(final(outside).visited, ['camp']);
  assert.equal(outside.frames.at(-2)?.tone, 'warning');
});

test('nested loops plant one actual flower per inner iteration and restart the inner counter', () => {
  const data = simulate('garden-loops', { parameters: { rows: '3', columns: '4' } });
  assert.equal(data.result.correct, true);
  assert.deepEqual(data.model, { kind: 'grid', rows: 3, columns: 4, rocks: [] });
  assert.deepEqual(data.frames[0].planted, []);
  const planting = data.frames.filter((frame) => frame.activeInstruction === 'plant' && frame.instruction !== 'Resultado do programa');
  assert.equal(planting.length, 12);
  for (const [index, frame] of planting.entries()) assert.equal(frame.planted?.length, index + 1);
  assert.deepEqual(planting[0].planted, ['0,0']);
  assert.equal(planting[4].active, '1,0');
  assert.equal(planting[4].counters?.[1].value, '1 de 4');
  assert.equal(planting[11].active, '2,3');
  assert.equal(final(data).planted?.length, 12);
});

test('a wrong nested loop keeps the chosen shape and never fills the expected answer', () => {
  const small = simulate('garden-loops', { parameters: { rows: '1', columns: '2' } });
  assert.equal(small.result.correct, false);
  assert.deepEqual(small.model, { kind: 'grid', rows: 1, columns: 2, rocks: [] });
  assert.deepEqual(final(small).planted, ['0,0', '0,1']);
  const transpose = simulate('garden-loops', { parameters: { rows: '4', columns: '3' } });
  assert.equal(transpose.result.correct, false);
  assert.deepEqual(transpose.model, { kind: 'grid', rows: 4, columns: 3, rocks: [] });
  assert.equal(final(transpose).planted?.includes('3,2'), true);
  assert.equal(final(transpose).planted?.includes('2,3'), false);
});

test('a conditional program observes each pot before the chosen action changes its soil', () => {
  const data = simulate('water-decisions', { parameters: { dry: 'water', wet: 'skip' } });
  assert.equal(data.result.correct, true);
  const conditions = data.frames.filter((frame) => frame.activeInstruction === 'condition');
  assert.deepEqual(conditions.map(({ condition }) => condition?.value), [true, false, false, true]);
  assert.equal(data.frames[0].pots?.sunflower.dry, true);
  assert.equal(conditions[0].pots?.sunflower.dry, true);
  assert.equal(data.frames[2].pots?.sunflower.dry, false);
  assert.equal(final(data).pots?.sunflower.action, 'water');
  assert.equal(final(data).pots?.mint.action, 'skip');
});

test('wrong conditional branches visibly leave dry pots dry and overwater wet pots', () => {
  const data = simulate('water-decisions', { parameters: { dry: 'skip', wet: 'water' } });
  assert.equal(data.result.correct, false);
  assert.deepEqual(final(data).pots?.sunflower, { dry: true, action: 'skip' });
  assert.deepEqual(final(data).pots?.mint, { dry: false, action: 'water', overwatered: true });
  assert.equal(final(data).pots?.fern.overwatered, true);
  assert.equal(final(data).pots?.carrot.dry, true);
  assert.equal(data.frames.filter((frame) => frame.tone === 'warning' && frame.instruction !== 'Resultado do programa').length, 4);
});

test('the picnic transforms raw fruit into washed, cut, served and eaten states', () => {
  const data = simulate('picnic-sequence', { sequence: ['wash', 'cut', 'serve', 'eat'] });
  assert.equal(data.result.correct, true);
  assert.deepEqual(data.frames.map((frame) => frame.tokens?.[0].id), ['raw', 'washed', 'cut', 'served', 'eaten', 'eaten']);
});

test('out-of-order picnic instructions stop before any impossible action changes the scene', () => {
  const cutFirst = simulate('picnic-sequence', { sequence: ['cut', 'wash', 'serve', 'eat'] });
  assert.equal(cutFirst.result.correct, false);
  assert.deepEqual(final(cutFirst).tokens?.map(({ id }) => id), ['raw']);
  assert.equal(cutFirst.frames[1].activeInstruction, 'step-0');
  assert.equal(cutFirst.frames[1].tone, 'warning');
  const eatEarly = simulate('picnic-sequence', { sequence: ['wash', 'cut', 'eat', 'serve'] });
  assert.equal(final(eatEarly).tokens?.[0].id, 'cut');
  assert.equal(eatEarly.frames.some((frame) => frame.tokens?.[0].id === 'served'), false);
});

test('partial and duplicated sequence programs execute their entered steps without completion', () => {
  const partial = simulate('picnic-sequence', { sequence: ['wash'] });
  assert.equal(partial.result.correct, false);
  assert.equal(final(partial).tokens?.[0].id, 'washed');
  assert.equal(partial.instructions.length, 1);
  const duplicate = simulate('picnic-sequence', { sequence: ['wash', 'wash', 'cut', 'eat'] });
  assert.equal(final(duplicate).tokens?.[0].id, 'washed');
  assert.equal(duplicate.frames.at(-2)?.activeInstruction, 'step-1');
});

test('the reference trail follows selected places and flags deviations without substituting the guide', () => {
  const correct = simulate('follow-the-trail', { sequence: ['camp', 'bridge', 'tree', 'picnic'] });
  assert.equal(correct.result.correct, true);
  assert.deepEqual(final(correct).visited, ['camp', 'bridge', 'tree', 'picnic']);
  const wrong = simulate('follow-the-trail', { sequence: ['camp', 'tree', 'bridge', 'picnic'] });
  assert.equal(wrong.result.correct, false);
  assert.deepEqual(final(wrong).visited, ['camp', 'tree', 'bridge', 'picnic']);
  assert.equal(wrong.frames.find((frame) => frame.activeInstruction === 'step-1')?.tone, 'warning');
  const partial = simulate('follow-the-trail', { sequence: ['camp', 'bridge'] });
  assert.deepEqual(final(partial).visited, ['camp', 'bridge']);
  assert.equal(partial.result.correct, false);
});

test('decomposition executes the selected subprograms and visible garden transitions', () => {
  const data = simulate('party-parts', garden);
  assert.equal(data.result.correct, true);
  assert.equal(data.instructions.length, 10);
  assert.deepEqual(data.frames[0].tokens, []);
  const pot = data.frames.find((frame) => frame.activeInstruction === 'part-0-step-0')!;
  assert.deepEqual(pot.tokens?.map(({ id }) => id), ['pot']);
  const seed = data.frames.find((frame) => frame.activeInstruction === 'part-1-step-1')!;
  assert.deepEqual(seed.tokens?.map(({ id }) => id), ['pot', 'soil', 'hole', 'seed']);
  assert.equal(final(data).tokens?.some(({ label }) => label === 'Terra úmida'), true);
  assert.equal(final(data).tokens?.some(({ id }) => id === 'hole'), false);
});

test('decomposition exposes wrong stage order and stops before planting without soil', () => {
  const data = simulate('party-parts', { ...garden, sequence: ['plant', 'materials', 'care'] });
  assert.equal(data.result.correct, false);
  assert.equal(data.frames.at(-2)?.activeInstruction, 'part-0-step-0');
  assert.equal(data.frames.at(-2)?.tone, 'warning');
  assert.deepEqual(final(data).tokens, []);
  assert.equal(data.frames.some((frame) => frame.activeInstruction === 'part-1'), false);
});

test('decomposition exposes a wrong inner order without silently preparing missing materials', () => {
  const noPot = simulate('party-parts', { ...garden, stages: { ...garden.stages, materials: ['soil', 'pot'] } });
  assert.equal(noPot.result.correct, false);
  assert.deepEqual(final(noPot).tokens, []);
  assert.match(noPot.frames.at(-2)?.description ?? '', /vaso/);
  const noCheck = simulate('party-parts', { ...garden, stages: { ...garden.stages, care: ['water', 'check'] } });
  assert.equal(noCheck.result.correct, false);
  assert.equal(final(noCheck).tokens?.some(({ label }) => label === 'Terra seca'), true);
  assert.equal(final(noCheck).tokens?.some(({ id }) => id === 'check'), false);
});

test('decomposition runs incomplete chosen parts, repeated instructions and distractions', () => {
  const partial = simulate('party-parts', { sequence: ['materials'], stages: { materials: ['pot'] } });
  assert.equal(partial.result.correct, false);
  assert.deepEqual(final(partial).tokens?.map(({ id }) => id), ['pot']);
  assert.equal(partial.instructions.length, 2);
  const repeated = simulate('party-parts', { ...garden, stages: { ...garden.stages, materials: ['pot', 'soil', 'soil'] } });
  assert.equal(repeated.result.correct, false);
  assert.equal(repeated.frames.at(-2)?.activeInstruction, 'part-0-step-2');
  assert.equal(final(repeated).tokens?.some(({ id }) => id === 'seed'), false);
  const distraction = simulate('party-parts', { ...garden, stages: { ...garden.stages, materials: ['pot', 'balloon', 'soil'] } });
  assert.equal(distraction.result.correct, false);
  assert.equal(distraction.frames.find((frame) => frame.activeInstruction === 'part-0-step-1')?.tone, 'warning');
  assert.equal(final(distraction).tokens?.some(({ symbol }) => symbol === '🎈'), true);
  assert.equal(final(distraction).tokens?.some(({ label }) => label === 'Terra úmida'), true, 'A harmless distraction is shown, then later feasible selected steps still run.');
});

test('an empty selected subprogram is shown without injecting its missing commands', () => {
  const data = simulate('party-parts', { sequence: ['materials', 'plant'], stages: { materials: [], plant: ['hole'] } });
  assert.equal(data.result.correct, false);
  assert.equal(data.frames.some((frame) => frame.instruction === 'Esta parte está vazia'), true);
  assert.deepEqual(final(data).tokens, []);
});

test('graph simulation accepts alternative connected paths and shows the actual islands visited', () => {
  for (const path of [['port', 'orchard', 'library', 'school'], ['port', 'bridge', 'lake', 'library', 'school']]) {
    const data = simulate('island-routes', { path });
    assert.equal(data.result.correct, true);
    assert.deepEqual(final(data).visited, path);
    assert.equal(final(data).active, 'school');
  }
});

test('graph simulation stops at a missing bridge and does not teleport to the selected destination', () => {
  const data = simulate('island-routes', { path: ['port', 'library', 'school'] });
  assert.equal(data.result.correct, false);
  assert.deepEqual(final(data).visited, ['port']);
  assert.equal(final(data).active, 'port');
  assert.equal(data.frames.at(-2)?.activeInstruction, 'stop-1');
  assert.equal(data.frames.at(-2)?.tone, 'warning');
});

test('a connected route missing the library reaches school but still fails the original goal', () => {
  const path = ['port', 'bridge', 'lake', 'school'];
  const data = simulate('island-routes', { path });
  assert.equal(data.result.correct, false);
  assert.deepEqual(final(data).visited, path);
  assert.equal(final(data).active, 'school');
  assert.match(data.result.message, /biblioteca/);
  const badStart = simulate('island-routes', { path: ['orchard', 'library', 'school'] });
  assert.deepEqual(final(badStart).visited, ['port']);
});

test('robot directions move the shared visual model and stop on the first blocked command', () => {
  const commands: Direction[] = ['right', 'right', 'up', 'up', 'up', 'right'];
  const data = simulateRobotProgram(ROBOT_BOARD, commands);
  assert.equal(data.result.correct, true);
  assert.equal(data.frames[0].active, '3,0');
  assert.equal(final(data).active, '0,3');
  assert.deepEqual(final(data).visited, ['3,0', '3,1', '3,2', '2,2', '1,2', '0,2', '0,3']);
  const leftGoal = simulateRobotProgram(ROBOT_BOARD, [...commands, 'left']);
  assert.equal(leftGoal.result.correct, false, 'Visiting the star is insufficient if later commands leave it.');
  assert.equal(final(leftGoal).active, '0,2');
  assert.equal(final(leftGoal).visited?.includes('0,3'), true);
  assert.match(leftGoal.result.message, /terminou.*fora da estrela/);
  const blocked = simulateRobotProgram(ROBOT_BOARD, ['up', 'right', 'up']);
  assert.equal(blocked.result.correct, false);
  assert.deepEqual(final(blocked).visited, ['3,0', '2,0']);
  assert.equal(blocked.frames.at(-2)?.activeInstruction, 'command-1');
  const broken = simulateRobotProgram(ROBOT_BOARD, BROKEN_PROGRAM);
  assert.equal(broken.result.correct, false);
  assert.equal(final(broken).active, '3,2');
  assert.equal(broken.frames.at(-2)?.activeInstruction, 'command-2');
});

test('robot empty and excessive programs cannot move or complete', () => {
  for (const commands of [[], Array.from({ length: 101 }, () => 'right' as const)]) {
    const data = simulateRobotProgram(ROBOT_BOARD, commands);
    assert.equal(data.result.correct, false);
    assert.deepEqual(final(data).visited, ['3,0']);
    assert.ok(data.instructions.length <= 100);
  }
});

test('all frames are isolated immutable snapshots and editing an answer cannot rewrite the run', () => {
  const answer = { parameters: { dry: 'water', wet: 'skip' } };
  const data = simulate('water-decisions', answer);
  const before = JSON.stringify(data);
  answer.parameters.dry = 'skip';
  assert.equal(JSON.stringify(data), before);
  assert.notEqual(data.frames[0].pots, data.frames[1].pots);
  assert.notEqual(data.frames[0].pots?.sunflower, data.frames[1].pots?.sunflower);
  assert.equal(data.frames[0].pots?.sunflower.dry, true);
  assert.equal(final(data).pots?.sunflower.dry, false);
  assert.ok(Object.isFrozen(data.frames));
  assert.ok(Object.isFrozen(data.frames[0]));
  assert.ok(Object.isFrozen(data.frames[0].pots));
  assert.ok(Object.isFrozen(data.frames[0].pots?.sunflower));
  const nested = simulate('garden-loops', { parameters: { rows: '3', columns: '4' } });
  assert.ok(Object.isFrozen(nested.frames[0].planted));
  assert.deepEqual(nested.frames[0].planted, []);
  assert.equal(final(nested).planted?.length, 12);
  const rawGarden = JSON.stringify(garden);
  simulate('party-parts', garden);
  assert.equal(JSON.stringify(garden), rawGarden);
});

test('unanswered or malformed parameters produce no fake simulation and work remains bounded', () => {
  for (const item of CURRICULUM_ACTIVITIES.filter(supportsProgramSimulation)) {
    assert.equal(simulateCurriculumProgram(item, {}), null);
    assert.equal(simulateCurriculumProgram(item, null as unknown as ChallengeAnswer), null);
  }
  for (const count of ['0', '-1', '4.0', '04', 'Infinity', '9', '10000000000000']) {
    assert.equal(simulateCurriculumProgram(activity('bridge-repeat'), { parameters: { direction: 'forward', count } }), null);
  }
  assert.equal(simulateCurriculumProgram(activity('lighthouse-until'), { parameters: { direction: 'forward', stop: 'unknown' } }), null);
  assert.equal(simulateCurriculumProgram(activity('garden-loops'), { parameters: { rows: '100000', columns: '100000' } }), null);
  assert.equal(simulateCurriculumProgram(activity('water-decisions'), { parameters: { dry: 'jump', wet: 'skip' } }), null);
  assert.equal(simulateCurriculumProgram(activity('picnic-sequence'), { sequence: ['teleport'] }), null);
  assert.equal(simulateCurriculumProgram(activity('party-parts'), { sequence: ['materials'], stages: { materials: ['unknown'] } }), null);
  assert.equal(simulateCurriculumProgram(activity('island-routes'), { path: Array.from({ length: 101 }, () => 'port') }), null);
});
