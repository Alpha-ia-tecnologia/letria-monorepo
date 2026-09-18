import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BROKEN_PROGRAM, LAB_IDS, REQUIRED_PLANT_STEPS, ROBOT_BOARD, completeLabActivity,
  decodeLabProgress, matchesRequiredSteps, patternAt, repairProgram, runProgram,
} from '../lib/computational';

test('decomposition accepts an unordered exact set and rejects missing, distractor and duplicate steps', () => {
  assert.equal(matchesRequiredSteps(['water', 'soil', 'seed'], REQUIRED_PLANT_STEPS), true);
  assert.equal(matchesRequiredSteps(['soil', 'seed'], REQUIRED_PLANT_STEPS), false);
  assert.equal(matchesRequiredSteps(['soil', 'seed', 'water', 'balloon'], REQUIRED_PLANT_STEPS), false);
  assert.equal(matchesRequiredSteps(['soil', 'soil', 'water'], REQUIRED_PLANT_STEPS), false);
  assert.equal(matchesRequiredSteps(['soil', null, 'water'], REQUIRED_PLANT_STEPS), false);
  assert.equal(matchesRequiredSteps('soil,seed,water', REQUIRED_PLANT_STEPS), false);
});

test('patterns repeat through multiple cycles and reject invalid positions', () => {
  const pattern = ['sun', 'leaf', 'leaf'];
  assert.deepEqual(Array.from({ length: 8 }, (_, index) => patternAt(pattern, index)),
    ['sun', 'leaf', 'leaf', 'sun', 'leaf', 'leaf', 'sun', 'leaf']);
  assert.equal(patternAt([], 0), null);
  assert.equal(patternAt(pattern, -1), null);
  assert.equal(patternAt(pattern, 1.5), null);
  assert.equal(patternAt(pattern, Infinity), null);
});

test('robot execution accepts different safe routes and records every reached cell', () => {
  const before = JSON.stringify(ROBOT_BOARD);
  const first = runProgram(ROBOT_BOARD, ['up', 'up', 'up', 'right', 'right', 'right']);
  const second = runProgram(ROBOT_BOARD, ['right', 'right', 'up', 'up', 'up', 'right']);
  assert.equal(first.status, 'success');
  assert.equal(second.status, 'success');
  assert.equal(first.path.length, 7);
  assert.deepEqual(first.path.at(-1), ROBOT_BOARD.goal);
  assert.deepEqual(second.path.at(-1), ROBOT_BOARD.goal);
  first.path[0].row = 100;
  assert.equal(JSON.stringify(ROBOT_BOARD), before);
});

test('robot stops at the first obstacle or edge and does not move into the invalid square', () => {
  const blocked = runProgram(ROBOT_BOARD, ['right', 'up', 'right']);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.failedStep, 1);
  assert.deepEqual(blocked.path, [{ row: 3, column: 0 }, { row: 3, column: 1 }]);
  const outside = runProgram(ROBOT_BOARD, ['down']);
  assert.equal(outside.status, 'outside');
  assert.equal(outside.failedStep, 0);
  assert.equal(outside.path.length, 1);
});

test('arrival is checked at program end and malformed or excessive commands are rejected', () => {
  assert.equal(runProgram(ROBOT_BOARD, []).status, 'incomplete');
  assert.equal(runProgram(ROBOT_BOARD, ['up']).status, 'incomplete');
  assert.equal(runProgram(ROBOT_BOARD, ['up', 'up', 'up', 'right', 'right', 'right', 'left']).status, 'incomplete');
  assert.equal(runProgram(ROBOT_BOARD, ['teleport']).status, 'invalid');
  assert.equal(runProgram(ROBOT_BOARD, Array(11).fill('up')).status, 'invalid');
  assert.equal(runProgram(ROBOT_BOARD, null).status, 'invalid');
  assert.equal(runProgram({ ...ROBOT_BOARD, start: { row: 4, column: 0 } }, []).status, 'invalid');
});

test('debugging repairs one instruction without modifying the source program', () => {
  assert.equal(runProgram(ROBOT_BOARD, BROKEN_PROGRAM).status, 'outside');
  const repaired = repairProgram(BROKEN_PROGRAM, 2, 'up');
  assert.ok(repaired);
  assert.equal(runProgram(ROBOT_BOARD, repaired).status, 'success');
  assert.equal(BROKEN_PROGRAM[2], 'down');
  assert.equal(repairProgram(BROKEN_PROGRAM, -1, 'up'), null);
  assert.equal(repairProgram(BROKEN_PROGRAM, 6, 'up'), null);
  assert.equal(repairProgram(BROKEN_PROGRAM, 1.5, 'up'), null);
  const wrongRepair = repairProgram(BROKEN_PROGRAM, 2, 'left');
  assert.notEqual(runProgram(ROBOT_BOARD, wrongRepair).status, 'success');
});

test('cached discoveries reject invalid versions and preserve only recognized unique activity IDs', () => {
  for (const raw of [null, '{}', 'not json', '[]', '{"version":2,"completed":["parts"]}', 'x'.repeat(3000)]) {
    assert.deepEqual(decodeLabProgress(raw), { version: 1, completed: [] });
  }
  assert.deepEqual(decodeLabProgress('{"version":1,"completed":["debug","parts","parts",null,"fake"]}'),
    { version: 1, completed: ['parts', 'debug'] });
  let progress = decodeLabProgress(null);
  progress = completeLabActivity(progress, 'parts');
  progress = completeLabActivity(progress, 'parts');
  assert.deepEqual(progress.completed, ['parts']);
  for (const id of LAB_IDS) progress = completeLabActivity(progress, id);
  assert.deepEqual(progress.completed, [...LAB_IDS]);
  assert.deepEqual(decodeLabProgress(JSON.stringify(progress)), progress);
});
