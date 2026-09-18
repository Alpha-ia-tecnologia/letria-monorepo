export const MIN_MAP_ZOOM = 1;
export const MAX_MAP_ZOOM = 2;
export const MAP_ZOOM_STEP = .25;

export function clampMapZoom(value: number): number {
  if (!Number.isFinite(value)) return MIN_MAP_ZOOM;
  return Math.round(Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, value)) * 100) / 100;
}

export function getMapDimensions(viewportWidth: number, zoom: number): { width: number; height: number } {
  const base = Number.isFinite(viewportWidth) && viewportWidth > 0
    ? Math.min(480, Math.max(240, viewportWidth - 24))
    : 480;
  const width = base * clampMapZoom(zoom);
  return { width, height: width * 1.5 };
}

export type MapCenterChange = {
  left: number;
  top: number;
  viewportWidth: number;
  viewportHeight: number;
  previousWidth: number;
  previousHeight: number;
  nextWidth: number;
  nextHeight: number;
};

function preserveAxisCenter(offset: number, viewport: number, previous: number, next: number): number {
  if (!Number.isFinite(previous) || previous <= 0 || !Number.isFinite(next) || next <= 0) return 0;
  const visible = Number.isFinite(viewport) ? Math.max(0, viewport) : 0;
  const previousLimit = Math.max(0, previous - visible);
  const previousOffset = Number.isFinite(offset) ? Math.min(previousLimit, Math.max(0, offset)) : 0;
  // A map that fits within the viewport is centered, with no scroll offset.
  const relativeCenter = (previousOffset + Math.min(visible, previous) / 2) / previous;
  const nextOffset = relativeCenter * next - visible / 2;
  return Math.min(Math.max(0, next - visible), Math.max(0, nextOffset));
}

export function preserveMapCenter(change: MapCenterChange): { left: number; top: number } {
  return {
    left: preserveAxisCenter(change.left, change.viewportWidth, change.previousWidth, change.nextWidth),
    top: preserveAxisCenter(change.top, change.viewportHeight, change.previousHeight, change.nextHeight),
  };
}
