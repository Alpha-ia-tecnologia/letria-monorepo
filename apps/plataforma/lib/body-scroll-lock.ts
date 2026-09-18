type ScrollLockBody = { style: { overflow: string } };
type BodyLock = { owners: number; previousOverflow: string };

const locks = new WeakMap<ScrollLockBody, BodyLock>();

/** Nested overlays may close in any order without unlocking or trapping the page. */
export function acquireBodyScrollLock(body: ScrollLockBody): () => void {
  let lock = locks.get(body);
  if (!lock) {
    lock = { owners: 0, previousOverflow: body.style.overflow };
    locks.set(body, lock);
    body.style.overflow = 'hidden';
  }
  lock.owners++;
  const acquired = lock;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    acquired.owners--;
    if (acquired.owners === 0) {
      body.style.overflow = acquired.previousOverflow;
      locks.delete(body);
    }
  };
}
