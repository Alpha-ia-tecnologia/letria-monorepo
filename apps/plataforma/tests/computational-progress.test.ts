import test from 'node:test';
import assert from 'node:assert/strict';
import { completeLabActivity, decodeLabProgress, LAB_IDS } from '../lib/computational';
import { CURRICULUM_IDS } from '../lib/computational-curriculum';

test('the larger curriculum preserves legacy progress and stores new discoveries in the same version', () => {
  const legacy = '{"version":1,"completed":["parts","patterns","algorithm","debug"]}';
  const progress = decodeLabProgress(legacy);
  assert.equal(progress.completed.length, 4);
  assert.equal(LAB_IDS.length, 19);
  const combined = completeLabActivity(progress, CURRICULUM_IDS[0]);
  assert.deepEqual(combined.completed, ['parts', 'patterns', 'algorithm', 'debug', CURRICULUM_IDS[0]]);
  assert.deepEqual(decodeLabProgress(JSON.stringify(combined)), combined);
  assert.equal(progress.completed.length, 4);
});

test('new discoveries remain unique and unknown saved activities are discarded', () => {
  let progress = decodeLabProgress(JSON.stringify({ version: 1, completed: [CURRICULUM_IDS[0], 'missing-activity', CURRICULUM_IDS[0], 'parts'] }));
  assert.deepEqual(progress.completed, ['parts', CURRICULUM_IDS[0]]);
  for (const id of LAB_IDS) {
    progress = completeLabActivity(progress, id);
    progress = completeLabActivity(progress, id);
  }
  assert.deepEqual(progress.completed, [...LAB_IDS]);
  assert.deepEqual(decodeLabProgress(JSON.stringify(progress)), progress);
});
