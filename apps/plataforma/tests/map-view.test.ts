import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MAP_ZOOM, MIN_MAP_ZOOM, MAP_ZOOM_STEP,
  clampMapZoom, getMapDimensions, preserveMapCenter,
} from '../lib/map-view';

test('zoom is bounded, rounded and safe before the viewport is measured', () => {
  assert.equal(MIN_MAP_ZOOM, 1);
  assert.equal(MAX_MAP_ZOOM, 2);
  assert.equal(MAP_ZOOM_STEP, .25);
  assert.equal(clampMapZoom(-1), 1);
  assert.equal(clampMapZoom(10), 2);
  assert.equal(clampMapZoom(1.236), 1.24);
  assert.equal(clampMapZoom(1.999), 2);
  for (const value of [NaN, Infinity, -Infinity]) assert.equal(clampMapZoom(value), 1);
});

test('map dimensions reserve mobile gutters and preserve the portrait aspect ratio', () => {
  assert.deepEqual(getMapDimensions(360, 1), { width: 336, height: 504 });
  assert.deepEqual(getMapDimensions(300, 2), { width: 552, height: 828 });
  assert.deepEqual(getMapDimensions(320, 1.25), { width: 370, height: 555 });
  assert.deepEqual(getMapDimensions(100, 1), { width: 240, height: 360 });
});

test('large and unavailable viewports use a bounded base and bounded zoom', () => {
  assert.deepEqual(getMapDimensions(1280, 1.5), { width: 720, height: 1080 });
  assert.deepEqual(getMapDimensions(1280, 5), { width: 960, height: 1440 });
  for (const viewport of [0, -20, NaN, Infinity]) {
    assert.deepEqual(getMapDimensions(viewport, 1), { width: 480, height: 720 });
  }
  assert.deepEqual(getMapDimensions(360, NaN), { width: 336, height: 504 });
});

test('zoom preserves the visible relative center on both axes', () => {
  const change = {
    left: 80, top: 100, viewportWidth: 320, viewportHeight: 500,
    previousWidth: 480, previousHeight: 720, nextWidth: 960, nextHeight: 1440,
  };
  const after = preserveMapCenter(change);
  assert.deepEqual(after, { left: 320, top: 450 });
  assert.equal((change.left + 160) / 480, (after.left + 160) / 960);
  assert.equal((change.top + 250) / 720, (after.top + 250) / 1440);
  assert.deepEqual(preserveMapCenter({
    ...change, ...after, previousWidth: 960, previousHeight: 1440, nextWidth: 480, nextHeight: 720,
  }), { left: 80, top: 100 });
});

test('zooming out at either edge clamps to real scroll bounds', () => {
  const change = {
    viewportWidth: 320, viewportHeight: 500,
    previousWidth: 960, previousHeight: 1440, nextWidth: 480, nextHeight: 720,
  };
  assert.deepEqual(preserveMapCenter({ ...change, left: 0, top: 0 }), { left: 0, top: 0 });
  assert.deepEqual(preserveMapCenter({ ...change, left: 640, top: 940 }), { left: 160, top: 220 });
  assert.deepEqual(preserveMapCenter({ ...change, left: 10000, top: 10000 }), { left: 160, top: 220 });
  assert.deepEqual(preserveMapCenter({ ...change, left: -100, top: -100 }), { left: 0, top: 0 });
});

test('a centered map stays centered when zoom creates mobile scrolling', () => {
  assert.deepEqual(preserveMapCenter({
    left: 0, top: 0, viewportWidth: 360, viewportHeight: 640,
    previousWidth: 336, previousHeight: 504, nextWidth: 672, nextHeight: 1008,
  }), { left: 156, top: 184 });
});

test('resizing to a viewport larger than the map removes obsolete offsets', () => {
  assert.deepEqual(preserveMapCenter({
    left: 400, top: 800, viewportWidth: 1100, viewportHeight: 900,
    previousWidth: 960, previousHeight: 1440, nextWidth: 480, nextHeight: 720,
  }), { left: 0, top: 0 });
});

test('one axis can remain centered while the other scrolls', () => {
  assert.deepEqual(preserveMapCenter({
    left: 0, top: 300, viewportWidth: 800, viewportHeight: 400,
    previousWidth: 480, previousHeight: 720, nextWidth: 720, nextHeight: 1080,
  }), { left: 0, top: 550 });
});

test('invalid image measurements cannot produce invalid scroll coordinates', () => {
  assert.deepEqual(preserveMapCenter({
    left: NaN, top: Infinity, viewportWidth: 360, viewportHeight: 640,
    previousWidth: 0, previousHeight: NaN, nextWidth: 720, nextHeight: 1080,
  }), { left: 0, top: 0 });
  assert.deepEqual(preserveMapCenter({
    left: 10, top: 20, viewportWidth: 360, viewportHeight: 640,
    previousWidth: 480, previousHeight: 720, nextWidth: Infinity, nextHeight: -1,
  }), { left: 0, top: 0 });
});
