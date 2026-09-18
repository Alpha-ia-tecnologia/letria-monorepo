export type FullscreenTarget = {
  requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
  contains?: (other: Node | null) => boolean;
};

export type FullscreenHost = {
  readonly fullscreenElement: unknown;
  readonly fullscreenEnabled?: boolean;
  exitFullscreen?: () => Promise<void>;
  addEventListener: (event: 'fullscreenchange', listener: () => void) => void;
  removeEventListener: (event: 'fullscreenchange', listener: () => void) => void;
};

function containsFullscreenElement(target: FullscreenTarget, element: unknown) {
  if (!element || !target.contains) return false;
  // Hosts may be test doubles or expose a fullscreen element from another realm.
  try { return target.contains(element as Node); } catch { return false; }
}

const inline = { expanded: false, pending: false };
export const getInlineFullscreenSnapshot = () => inline;

/** Keeps window expansion usable when native fullscreen is unavailable or denied. */
export function createActivityFullscreen() {
  let currentTarget: FullscreenTarget | null = null;
  let host: FullscreenHost | null = null;
  let nativeOwner: FullscreenTarget | null = null;
  let snapshot = inline;
  let request = 0;
  const listeners = new Set<() => void>();

  function update(expanded: boolean, pending = false) {
    if (snapshot.expanded === expanded && snapshot.pending === pending) return;
    snapshot = { expanded, pending };
    listeners.forEach(listener => listener());
  }

  async function exitNative(document: FullscreenHost, target: FullscreenTarget | null) {
    if (target && document.fullscreenElement === target) {
      try { await document.exitFullscreen?.(); } catch { /* The window layout remains usable. */ }
    }
  }

  function changed() {
    const target = currentTarget;
    if (host && target && host.fullscreenElement === target) {
      nativeOwner = target;
      if (!snapshot.expanded) void exitNative(host, target);
    } else if (nativeOwner && !containsFullscreenElement(nativeOwner, host?.fullscreenElement)) {
      nativeOwner = null;
      request++;
      update(false);
    }
  }

  async function exit() {
    const ticket = ++request;
    const document = host, ownedTarget = nativeOwner, target = ownedTarget ?? currentTarget;
    nativeOwner = null;
    update(false);
    if (document) {
      await exitNative(document, target);
      if (ticket === request && host === document && target && (
        document.fullscreenElement === target ||
        (ownedTarget && containsFullscreenElement(ownedTarget, document.fullscreenElement))
      )) {
        nativeOwner = target;
        update(true);
      }
    }
  }

  async function enter() {
    const document = host, target = currentTarget;
    if (!document || !target || snapshot.expanded) return;
    const ticket = ++request;
    const canRequest = document.fullscreenEnabled !== false && !!target.requestFullscreen;
    update(true, canRequest);
    if (!canRequest) return;
    try {
      await target.requestFullscreen!({ navigationUI: 'hide' });
      if (ticket !== request || host !== document) {
        if (!snapshot.expanded) await exitNative(document, target);
        return;
      }
      if (document.fullscreenElement === target) nativeOwner = target;
    } catch { /* Keep the activity expanded inside the browser window. */ }
    finally { if (ticket === request) update(true); }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    connect(document: FullscreenHost, target: FullscreenTarget | null) {
      host = document;
      currentTarget = target;
      document.addEventListener('fullscreenchange', changed);
      return () => {
        request++;
        document.removeEventListener('fullscreenchange', changed);
        void exitNative(document, nativeOwner ?? currentTarget);
        nativeOwner = null;
        host = null;
        currentTarget = null;
        update(false);
      };
    },
    exit,
    toggle: () => snapshot.expanded ? exit() : enter(),
  };
}
