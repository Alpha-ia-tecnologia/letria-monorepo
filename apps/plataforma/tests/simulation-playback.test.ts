import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceSimulationPlayback as advance, initialSimulationPlayback as initial } from '../lib/simulation-playback';

test('autoplay respects reduced motion and does not start an empty or single-frame simulation', () => {
  assert.deepEqual(initial(4, false), { index: 0, playing: true });
  assert.deepEqual(initial(4, true), { index: 0, playing: false });
  for (const count of [0, 1, -2, NaN]) assert.equal(initial(count, false).playing, false);
});

test('execution reaches the final frame once and cannot overrun the trace', () => {
  let state = initial(3, false);
  state = advance(state, 'tick', 3);
  assert.deepEqual(state, { index: 1, playing: true });
  state = advance(state, 'tick', 3);
  assert.deepEqual(state, { index: 2, playing: false });
  assert.deepEqual(advance(state, 'tick', 3), state);
  assert.deepEqual(advance(state, 'next', 3), state);
});

test('pausing holds the current frame and manual steps do not resume the timer', () => {
  const paused = advance({ index: 2, playing: true }, 'toggle', 6);
  assert.deepEqual(advance(paused, 'tick', 6), paused);
  assert.deepEqual(advance(paused, 'previous', 6), { index: 1, playing: false });
  assert.deepEqual(advance(paused, 'next', 6), { index: 3, playing: false });
  assert.deepEqual(advance({ index: 0, playing: false }, 'previous', 6), { index: 0, playing: false });
});

test('finishing skips to the actual final result and explicit replay starts from the beginning', () => {
  const finished = advance(initial(7, false), 'finish', 7);
  assert.deepEqual(finished, { index: 6, playing: false });
  assert.deepEqual(advance(finished, 'toggle', 7), { index: 0, playing: true });
  assert.deepEqual(advance({ index: 3, playing: false }, 'restart', 7), { index: 0, playing: true });
  assert.deepEqual(advance(initial(1, true), 'restart', 1), { index: 0, playing: false });
});
