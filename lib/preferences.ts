'use client';
import { useSyncExternalStore } from 'react';
const eventName = 'letria-preference-change';
function subscribe(listener: () => void) {
  window.addEventListener('storage', listener); window.addEventListener(eventName, listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener(eventName, listener); };
}
export function useLocalPreference(key: string, fallback: string) {
  const value = useSyncExternalStore(subscribe, () => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }, () => fallback);
  function save(next: string) { try { localStorage.setItem(key, next); window.dispatchEvent(new Event(eventName)); } catch { /* Optional device preference. */ } }
  return [value, save] as const;
}
