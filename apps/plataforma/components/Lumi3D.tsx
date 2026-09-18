'use client';

/* eslint-disable @next/next/no-img-element -- The static fallback shares the existing offline-cacheable mascot asset. */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { LumiMood, LumiScene } from '../lib/lumi-scene';
import './lumi-3d.css';

export type Lumi3DProps = {
  mood: LumiMood;
  getMouthLevel?: () => number;
  reducedMotion?: boolean;
  className?: string;
  onInteract?: () => void;
  onReady?: (ready: boolean) => void;
};
const descriptions: Record<LumiMood, string> = { idle: 'Lumi está pronta para ajudar.', thinking: 'Lumi está pensando.', listening: 'Lumi está ouvindo.', speaking: 'Lumi está falando.' };

export default function Lumi3D({ mood, getMouthLevel, reducedMotion = false, className = '', onInteract, onReady }: Lumi3DProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const viewport = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<LumiScene | null>(null), wake = useRef<(() => void) | null>(null);
  const props = useRef({ mood, getMouthLevel, reducedMotion, onInteract, onReady });
  const pointer = useRef<{ id: number; startX: number; startY: number; x: number; dragging: boolean } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    props.current = { mood, getMouthLevel, reducedMotion, onInteract, onReady };
    wake.current?.();
  }, [mood, getMouthLevel, reducedMotion, onInteract, onReady]);

  useEffect(() => {
    const element = viewport.current, target = canvas.current;
    if (!element || !target) return;
    let cancelled = false, importing = false, failed = false, inView = false, drawable = false, reportedReady = false;
    let currentScene: LumiScene | null = null;
    let raf = 0, previousTime = 0;
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const canRender = () => !cancelled && !failed && inView && drawable && !document.hidden;
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; previousTime = 0; };
    const disposeScene = () => {
      stop(); scene.current = null;
      const disposable = currentScene; currentScene = null;
      disposable?.dispose();
    };
    const fail = () => {
      if (cancelled || failed) return;
      failed = true;
      target.removeEventListener('webglcontextlost', onContextLost);
      disposeScene();
      setStatus('fallback'); props.current.onReady?.(false); reportedReady = false;
    };
    const onContextLost = (event: Event) => { event.preventDefault(); fail(); };
    const draw = (now: number) => {
      raf = 0;
      if (!canRender() || !currentScene) { previousTime = 0; return; }
      const delta = previousTime ? (now - previousTime) / 1000 : 1 / 60; previousTime = now;
      let mouthLevel = 0;
      try { mouthLevel = props.current.getMouthLevel?.() ?? 0; } catch { /* Unavailable audio leaves the mouth at rest. */ }
      try {
        const again = currentScene.frame(delta, { mood: props.current.mood, mouthLevel, reducedMotion: props.current.reducedMotion || motionPreference.matches });
        if (!reportedReady) { reportedReady = true; setStatus('ready'); props.current.onReady?.(true); }
        if (again && canRender()) raf = requestAnimationFrame(draw); else previousTime = 0;
      } catch { fail(); }
    };
    const requestFrame = () => { if (canRender() && currentScene && !raf) raf = requestAnimationFrame(draw); };
    const resize = () => {
      const bounds = element.getBoundingClientRect(); drawable = bounds.width > 0 && bounds.height > 0;
      if (drawable) currentScene?.resize(bounds.width, bounds.height, window.devicePixelRatio || 1);
      if (canRender()) requestFrame(); else stop();
    };
    const initialize = async () => {
      if (importing || currentScene || !canRender()) return;
      importing = true;
      try {
        const [THREE, module] = await Promise.all([import('three'), import('../lib/lumi-scene')]);
        // StrictMode cleanup or hiding during import must not leave a late GPU context behind.
        if (!canRender()) return;
        currentScene = module.createLumiScene(THREE, target);
        scene.current = currentScene;
        resize(); requestFrame();
      } catch { fail(); } finally { importing = false; }
    };
    const refresh = () => { if (canRender()) { if (currentScene) requestFrame(); else void initialize(); } else stop(); };
    const fallbackVisibility = () => {
      const bounds = element.getBoundingClientRect();
      inView = bounds.bottom > 0 && bounds.top < window.innerHeight && bounds.right > 0 && bounds.left < window.innerWidth;
      resize(); refresh();
    };
    const onResize = () => { resize(); refresh(); };
    wake.current = refresh;
    target.addEventListener('webglcontextlost', onContextLost, false);
    document.addEventListener('visibilitychange', refresh);
    motionPreference.addEventListener('change', refresh);
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize);
    resizeObserver?.observe(element);
    window.addEventListener('resize', onResize, { passive: true });
    const intersectionObserver = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      const entry = entries.find(item => item.target === element);
      if (entry) { inView = entry.isIntersecting; resize(); refresh(); }
    }, { threshold: 0.01 });
    if (intersectionObserver) { intersectionObserver.observe(element); resize(); }
    else { window.addEventListener('scroll', fallbackVisibility, { passive: true }); fallbackVisibility(); }
    return () => {
      cancelled = true;
      intersectionObserver?.disconnect(); resizeObserver?.disconnect();
      target.removeEventListener('webglcontextlost', onContextLost);
      document.removeEventListener('visibilitychange', refresh);
      motionPreference.removeEventListener('change', refresh);
      window.removeEventListener('resize', onResize); window.removeEventListener('scroll', fallbackVisibility);
      wake.current = null; pointer.current = null;
      disposeScene();
      if (reportedReady) props.current.onReady?.(false);
    };
  }, []);

  function startPointer(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    suppressClick.current = false;
    pointer.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, dragging: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function movePointer(event: PointerEvent<HTMLButtonElement>) {
    const active = pointer.current;
    if (!active || active.id !== event.pointerId) return;
    const horizontal = Math.abs(event.clientX - active.startX), vertical = Math.abs(event.clientY - active.startY);
    if (horizontal > 6 && horizontal > vertical) active.dragging = true;
    if (active.dragging) {
      event.preventDefault(); suppressClick.current = true;
      scene.current?.turn((event.clientX - active.x) * 0.006); wake.current?.();
    }
    active.x = event.clientX;
  }
  function endPointer(event: PointerEvent<HTMLButtonElement>) {
    if (pointer.current?.id !== event.pointerId) return;
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function turnWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault(); scene.current?.turn(event.key === 'ArrowLeft' ? -0.16 : 0.16); wake.current?.();
  }
  function greet() { scene.current?.wave(); wake.current?.(); props.current.onInteract?.(); }

  return <div className={('lumi-3d ' + className).trim()} data-mood={mood} data-render={status}>
    <div className="lumi-3d-viewport" ref={viewport}>
      <div className="lumi-3d-backdrop" aria-hidden="true" />
      <canvas ref={canvas} className="lumi-3d-canvas" aria-hidden="true" />
      {status !== 'ready' && <img className="lumi-3d-fallback" src="/art/lumi-explorer.png" alt="Lumi, a corujinha exploradora lilás com um lenço amarelo, em uma imagem estática" width={1254} height={1254} />}
      {status === 'ready' && <button type="button" className="lumi-3d-interaction" aria-label="Interagir com Lumi em 3D: toque ou pressione Enter para acenar; arraste ou use as setas esquerda e direita para girar" onPointerDown={startPointer} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} onLostPointerCapture={endPointer} onKeyDown={turnWithKeyboard} onClick={event => {
        if (event.detail > 0 && suppressClick.current) { suppressClick.current = false; return; }
        greet();
      }}><span className="lumi-3d-sr-only">Acenar para Lumi</span></button>}
    </div>
    {status === 'fallback' ? <p className="lumi-3d-hint lumi-3d-fallback-note" role="status">Visual 3D indisponível neste dispositivo. Lumi continua aqui para ajudar.</p> : status === 'loading' ? <p className="lumi-3d-hint" role="status">Preparando a Lumi...</p> : <><p className="lumi-3d-hint" aria-hidden="true">Arraste para girar · toque para acenar</p><span className="lumi-3d-sr-only" role="status">{descriptions[mood]}</span></>}
  </div>;
}
