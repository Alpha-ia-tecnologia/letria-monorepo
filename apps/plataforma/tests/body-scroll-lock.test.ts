import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireBodyScrollLock } from '../lib/body-scroll-lock';

test('leaving fullscreen before closing Lumi keeps the page locked until both close', () => {
  const body = { style: { overflow: '' } };
  const leaveFullscreen = acquireBodyScrollLock(body);
  const closeLumi = acquireBodyScrollLock(body);
  leaveFullscreen();
  assert.equal(body.style.overflow, 'hidden');
  closeLumi();
  assert.equal(body.style.overflow, '');
});

test('closing Lumi first preserves fullscreen and then restores the original overflow', () => {
  const body = { style: { overflow: 'auto' } };
  const leaveFullscreen = acquireBodyScrollLock(body);
  const closeLumi = acquireBodyScrollLock(body);
  closeLumi();
  assert.equal(body.style.overflow, 'hidden');
  leaveFullscreen();
  assert.equal(body.style.overflow, 'auto');
});

test('repeated cleanup cannot release a newer overlay lock', () => {
  const body = { style: { overflow: 'scroll' } };
  const releaseFirst = acquireBodyScrollLock(body);
  releaseFirst();
  const releaseNext = acquireBodyScrollLock(body);
  releaseFirst();
  assert.equal(body.style.overflow, 'hidden');
  releaseNext();
  releaseNext();
  assert.equal(body.style.overflow, 'scroll');
});

test('different documents restore their own scroll settings independently', () => {
  const firstBody = { style: { overflow: '' } };
  const secondBody = { style: { overflow: 'clip' } };
  const releaseFirst = acquireBodyScrollLock(firstBody);
  const releaseSecond = acquireBodyScrollLock(secondBody);
  releaseFirst();
  assert.equal(firstBody.style.overflow, '');
  assert.equal(secondBody.style.overflow, 'hidden');
  releaseSecond();
  assert.equal(secondBody.style.overflow, 'clip');
});
