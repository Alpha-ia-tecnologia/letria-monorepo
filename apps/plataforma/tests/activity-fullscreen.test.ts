import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivityFullscreen, type FullscreenHost, type FullscreenTarget } from '../lib/activity-fullscreen';

function fixture() {
  const events = new Set<() => void>();
  let exits = 0;
  const host: FullscreenHost & { fullscreenElement: unknown; fullscreenEnabled: boolean } = {
    fullscreenEnabled: true,
    fullscreenElement: null,
    addEventListener: (_, listener) => { events.add(listener); },
    removeEventListener: (_, listener) => { events.delete(listener); },
    exitFullscreen: async () => { exits++; host.fullscreenElement = null; events.forEach(listener => listener()); },
  };
  const target: FullscreenTarget = {
    requestFullscreen: async () => { host.fullscreenElement = target; events.forEach(listener => listener()); },
  };
  const controller = createActivityFullscreen();
  const disconnect = controller.connect(host, target);
  return { controller, host, target, disconnect, events, exits: () => exits };
}

test('fullscreen enters and exits the activity', async () => {
  const f = fixture();
  await f.controller.toggle();
  assert.deepEqual(f.controller.getSnapshot(), { expanded: true, pending: false });
  assert.equal(f.host.fullscreenElement, f.target);
  await f.controller.toggle();
  assert.deepEqual(f.controller.getSnapshot(), { expanded: false, pending: false });
  assert.equal(f.host.fullscreenElement, null);
  assert.equal(f.exits(), 1);
  f.disconnect();
});

test('unsupported and denied fullscreen still expand the activity in the window', async () => {
  for (const reason of ['disabled', 'missing', 'denied'] as const) {
    const f = fixture();
    if (reason === 'disabled') f.host.fullscreenEnabled = false;
    if (reason === 'missing') f.target.requestFullscreen = undefined;
    if (reason === 'denied') f.target.requestFullscreen = async () => { throw new Error('Not allowed'); };
    await f.controller.toggle();
    assert.deepEqual(f.controller.getSnapshot(), { expanded: true, pending: false }, reason);
    assert.equal(f.host.fullscreenElement, null);
    await f.controller.exit();
    assert.equal(f.controller.getSnapshot().expanded, false);
    f.disconnect();
  }
});

test('the browser Escape action restores the inline activity state', async () => {
  const f = fixture();
  await f.controller.toggle();
  await f.host.exitFullscreen!();
  assert.deepEqual(f.controller.getSnapshot(), { expanded: false, pending: false });
  f.disconnect();
});

test('unmount releases only fullscreen owned by the activity', async () => {
  const f = fixture();
  await f.controller.toggle();
  f.disconnect();
  assert.equal(f.host.fullscreenElement, null);
  assert.equal(f.exits(), 1);
  assert.equal(f.events.size, 0);
  const other = fixture();
  other.host.fullscreenElement = {};
  other.disconnect();
  assert.equal(other.exits(), 0);
});

test('a late fullscreen request is closed after the activity has unmounted', async () => {
  const f = fixture();
  let finish!: () => void;
  f.target.requestFullscreen = () => new Promise<void>(resolve => {
    finish = () => { f.host.fullscreenElement = f.target; resolve(); };
  });
  const pending = f.controller.toggle();
  assert.equal(f.controller.getSnapshot().pending, true);
  f.disconnect();
  finish();
  await pending;
  assert.equal(f.host.fullscreenElement, null);
  assert.equal(f.controller.getSnapshot().expanded, false);
});

test('leaving during a pending request does not reopen the activity afterwards', async () => {
  const f = fixture();
  let finish!: () => void;
  f.target.requestFullscreen = () => new Promise<void>(resolve => {
    finish = () => { f.host.fullscreenElement = f.target; resolve(); };
  });
  const pending = f.controller.toggle();
  await f.controller.exit();
  finish();
  await pending;
  assert.equal(f.host.fullscreenElement, null);
  assert.equal(f.controller.getSnapshot().expanded, false);
  f.disconnect();
});

test('a rejected native exit retains an accessible exit control', async () => {
  const f = fixture();
  await f.controller.toggle();
  f.host.exitFullscreen = async () => { throw new Error('Try again'); };
  await f.controller.exit();
  assert.equal(f.controller.getSnapshot().expanded, true);
  assert.equal(f.host.fullscreenElement, f.target);
  f.disconnect();
});

function nestedFixture() {
  const f = fixture();
  const stack: FullscreenTarget[] = [];
  const child: FullscreenTarget = {};
  f.target.contains = element => element === child;
  const emit = () => { f.events.forEach(listener => listener()); };
  for (const target of [f.target, child]) {
    target.requestFullscreen = async () => {
      stack.push(target);
      f.host.fullscreenElement = target;
      emit();
    };
  }
  f.host.exitFullscreen = async () => {
    stack.pop();
    f.host.fullscreenElement = stack.at(-1) ?? null;
    emit();
  };
  const childController = createActivityFullscreen();
  const disconnectChild = childController.connect(f.host, child);
  return { ...f, child, childController, disconnectChild, emit };
}

test('nested chat fullscreen preserves the activity and exiting reveals it again', async () => {
  const f = nestedFixture();
  await f.controller.toggle();
  await f.childController.toggle();
  assert.equal(f.host.fullscreenElement, f.child);
  assert.equal(f.controller.getSnapshot().expanded, true);
  assert.equal(f.childController.getSnapshot().expanded, true);
  await f.childController.exit();
  assert.equal(f.host.fullscreenElement, f.target);
  assert.equal(f.controller.getSnapshot().expanded, true);
  assert.equal(f.childController.getSnapshot().expanded, false);
  await f.controller.exit();
  assert.equal(f.host.fullscreenElement, null);
  assert.equal(f.controller.getSnapshot().expanded, false);
  f.disconnectChild();
  f.disconnect();
});

test('browser Escape can restore one fullscreen level or leave all levels', async () => {
  const f = nestedFixture();
  await f.controller.toggle();
  await f.childController.toggle();
  await f.host.exitFullscreen!();
  assert.equal(f.controller.getSnapshot().expanded, true);
  assert.equal(f.childController.getSnapshot().expanded, false);
  await f.childController.toggle();
  f.host.fullscreenElement = null;
  f.emit();
  assert.equal(f.controller.getSnapshot().expanded, false);
  assert.equal(f.childController.getSnapshot().expanded, false);
  f.disconnectChild();
  f.disconnect();
});

test('closing or unmounting a fallback chat never exits its fullscreen activity', async () => {
  for (const action of ['exit', 'unmount'] as const) {
    const f = nestedFixture();
    await f.controller.toggle();
    f.child.requestFullscreen = undefined;
    await f.childController.toggle();
    if (action === 'exit') await f.childController.exit();
    else f.disconnectChild();
    assert.equal(f.host.fullscreenElement, f.target, action);
    assert.equal(f.controller.getSnapshot().expanded, true, action);
    assert.equal(f.childController.getSnapshot().expanded, false, action);
    if (action === 'exit') f.disconnectChild();
    f.disconnect();
  }
});

test('unmounting a native fullscreen chat restores its fullscreen activity', async () => {
  const f = nestedFixture();
  await f.controller.toggle();
  await f.childController.toggle();
  f.disconnectChild();
  assert.equal(f.host.fullscreenElement, f.target);
  assert.equal(f.controller.getSnapshot().expanded, true);
  f.disconnect();
});

test('failed nested exit preserves controls and the parent layout', async () => {
  const f = nestedFixture();
  await f.controller.toggle();
  await f.childController.toggle();
  f.host.exitFullscreen = async () => { throw new Error('Try again'); };
  await f.childController.exit();
  assert.equal(f.host.fullscreenElement, f.child);
  assert.equal(f.childController.getSnapshot().expanded, true);
  assert.equal(f.controller.getSnapshot().expanded, true);
  // A parent exit must not claim or close the active descendant.
  await f.controller.exit();
  assert.equal(f.host.fullscreenElement, f.child);
  assert.equal(f.controller.getSnapshot().expanded, true);
  f.disconnectChild();
  f.disconnect();
});

test('unrelated fullscreen elements are never treated as owned descendants', async () => {
  const f = nestedFixture();
  await f.controller.toggle();
  const unrelated = {};
  f.host.fullscreenElement = unrelated;
  f.emit();
  assert.equal(f.controller.getSnapshot().expanded, false);
  await f.controller.exit();
  assert.equal(f.host.fullscreenElement, unrelated);
  f.disconnectChild();
  f.disconnect();
  assert.equal(f.host.fullscreenElement, unrelated);
});
