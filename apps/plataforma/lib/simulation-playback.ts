export type SimulationPlayback = { index: number; playing: boolean };
export type SimulationPlaybackAction = 'toggle' | 'tick' | 'previous' | 'next' | 'restart' | 'finish';

function lastFrame(frameCount: number) {
  return Number.isSafeInteger(frameCount) && frameCount > 0 ? frameCount - 1 : 0;
}

export function initialSimulationPlayback(frameCount: number, reducedMotion: boolean): SimulationPlayback {
  return { index: 0, playing: lastFrame(frameCount) > 0 && !reducedMotion };
}

/** Manual navigation pauses execution; reaching the final frame always stops its timer. */
export function advanceSimulationPlayback(state: SimulationPlayback, action: SimulationPlaybackAction, frameCount: number): SimulationPlayback {
  const last = lastFrame(frameCount);
  const index = Math.max(0, Math.min(last, state.index));
  switch (action) {
    case 'toggle': return { index: index === last ? 0 : index, playing: last > 0 && (index === last || !state.playing) };
    case 'tick': return state.playing ? { index: Math.min(index + 1, last), playing: index + 1 < last } : { index, playing: false };
    case 'previous': return { index: Math.max(0, index - 1), playing: false };
    case 'next': return { index: Math.min(last, index + 1), playing: false };
    case 'restart': return { index: 0, playing: last > 0 };
    case 'finish': return { index: last, playing: false };
  }
}
