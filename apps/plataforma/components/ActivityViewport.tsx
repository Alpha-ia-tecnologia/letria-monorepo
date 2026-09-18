'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type HTMLAttributes } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { createActivityFullscreen, getInlineFullscreenSnapshot } from '../lib/activity-fullscreen';
import { acquireBodyScrollLock } from '../lib/body-scroll-lock';
import './activity-viewport.css';

type FullscreenContext = { expanded: boolean; pending: boolean; toggle: () => Promise<void> };
const ActivityContext = createContext<FullscreenContext | null>(null);

export default function ActivityViewport({ children, className = '', role = 'region', ...props }: HTMLAttributes<HTMLDivElement>) {
  const viewport = useRef<HTMLDivElement>(null);
  const fullscreen = useMemo(() => createActivityFullscreen(), []);
  const state = useSyncExternalStore(fullscreen.subscribe, fullscreen.getSnapshot, getInlineFullscreenSnapshot);

  useEffect(() => fullscreen.connect(document, viewport.current), [fullscreen]);

  useEffect(() => {
    const element = viewport.current;
    if (!state.expanded || !element) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scroll = { left: window.scrollX, top: window.scrollY };
    const releaseScroll = acquireBodyScrollLock(document.body);
    const background = new Map<HTMLElement, boolean>();
    // Keep the expanded activity mounted: changing display must never reset answers.
    for (let branch: HTMLElement = element; branch.parentElement; branch = branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          background.set(sibling, sibling.inert);
          sibling.setAttribute('inert', '');
        }
      }
      if (branch.parentElement === document.body) break;
    }
    element.scrollTop = 0;
    function keydown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Let the Lumi conversation handle its own Escape before leaving the activity.
      if (element?.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"], dialog[open]')) return;
      event.preventDefault();
      void fullscreen.exit();
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      background.forEach((inert, sibling) => { sibling.toggleAttribute('inert', inert); });
      releaseScroll();
      window.scrollTo({ ...scroll, behavior: 'instant' });
      if (previous?.isConnected && !element.querySelector('[aria-modal="true"]')) previous.focus({ preventScroll: true });
    };
  }, [state.expanded, fullscreen]);

  return <ActivityContext.Provider value={{ ...state, toggle: fullscreen.toggle }}>
    <div {...props} role={role} ref={viewport} className={`activity-viewport ${className}${state.expanded ? ' activity-fullscreen' : ''}`}>
      {children}
    </div>
  </ActivityContext.Provider>;
}

export function ActivityFullscreenButton({ className = '' }: { className?: string }) {
  const fullscreen = useContext(ActivityContext);
  if (!fullscreen) throw new Error('ActivityFullscreenButton requires ActivityViewport.');
  const label = fullscreen.expanded ? 'Sair da tela cheia' : 'Tela cheia';
  return <button type="button" className={`activity-fullscreen-button ${className}`} aria-pressed={fullscreen.expanded}
    aria-label={label} title={fullscreen.expanded ? 'Sair da tela cheia (Esc)' : 'Ampliar a atividade para tela cheia'}
    aria-busy={fullscreen.pending} onClick={() => void fullscreen.toggle()}>
    {fullscreen.expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}<span>{label}</span>
  </button>;
}
