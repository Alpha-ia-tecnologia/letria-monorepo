import type { Submission, PlatformAction, PlatformData, ApiResult, Answers } from './types';
import type { Activity, Question } from './content';
import { deriveStudentProgress, type StudentProgress } from './pedagogy';

export function progressFromSubmissions(submissions: Submission[]): StudentProgress {
  return deriveStudentProgress(submissions);
}

const DB_NAME = 'letria-offline-v1';
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('cache');
      request.result.createObjectStore('queue', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction<T>(store: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = operation(tx.objectStore(store));
    tx.oncomplete = () => { db.close(); resolve(request.result as T); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('A gravação local foi interrompida.')); };
  });
}
export const cachePlatform = (data: PlatformData) => transaction('cache', 'readwrite', store => store.put(data, 'platform'));
export const cachedPlatform = () => transaction<PlatformData | undefined>('cache', 'readonly', store => store.get('platform'));
export const clearOffline = async () => {
  await transaction('cache', 'readwrite', store => store.clear());
  await transaction('queue', 'readwrite', store => store.clear());
};
export interface QueuedAnswer { id: string; owner: string; action: PlatformAction; createdAt: string }
export const enqueue = (item: QueuedAnswer) => transaction('queue', 'readwrite', store => store.put(item));
export const queued = () => transaction<QueuedAnswer[]>('queue', 'readonly', store => store.getAll());
export const dequeue = (id: string) => transaction('queue', 'readwrite', store => store.delete(id));

/** A draft stays on this device and is isolated by signed-in account and activity. */
export interface GameDraft {
  schemaVersion: 1;
  owner: string;
  activityId: string;
  revision: string;
  index: number;
  answers: Answers;
  selected: string | string[];
  checked: boolean;
  practice: boolean;
  hint: boolean;
  submissionId: string;
  elapsedSeconds: number;
  updatedAt: string;
}
export function activityRevision(activity: Activity): string {
  // An edited published activity must not reuse answers from an older question set.
  return JSON.stringify(activity.questions.map(question => ({
    id: question.id, type: question.type, prompt: question.prompt,
    stimulus: question.stimulus, options: question.options, answer: question.answer,
  })));
}
function validSelection(question: Question, answer: unknown, complete: boolean): boolean {
  if (question.type === 'choice') {
    return typeof answer === 'string' && (question.options.includes(answer) || (!complete && answer === ''));
  }
  if (answer === '' && !complete) return true;
  if (!Array.isArray(answer) || (complete && answer.length !== question.options.length) || answer.length > question.options.length) return false;
  const available = [...question.options];
  for (const item of answer) {
    if (typeof item !== 'string') return false;
    const found = available.indexOf(item);
    if (found < 0) return false;
    available.splice(found, 1);
  }
  return true;
}
export function isCompatibleDraft(raw: unknown, owner: string, activity: Activity): raw is GameDraft {
  if (!raw || typeof raw !== 'object') return false;
  const draft = raw as Partial<GameDraft>;
  if (draft.schemaVersion !== 1 || draft.owner !== owner || draft.activityId !== activity.id
    || draft.revision !== activityRevision(activity)
    || typeof draft.index !== 'number' || !Number.isInteger(draft.index)
    || draft.index < 0 || draft.index >= activity.questions.length
    || typeof draft.checked !== 'boolean' || typeof draft.hint !== 'boolean' || typeof draft.practice !== 'boolean'
    || typeof draft.submissionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(draft.submissionId)
    || typeof draft.elapsedSeconds !== 'number' || !Number.isFinite(draft.elapsedSeconds) || draft.elapsedSeconds < 0
    || typeof draft.updatedAt !== 'string' || !Number.isFinite(Date.parse(draft.updatedAt))
    || !draft.answers || typeof draft.answers !== 'object' || Array.isArray(draft.answers)) return false;
  const current = activity.questions[draft.index];
  if (!validSelection(current, draft.selected, draft.checked)) return false;
  const expectedIds = activity.questions.slice(0, draft.index + (draft.checked ? 1 : 0)).map(question => question.id);
  if (Object.keys(draft.answers).length !== expectedIds.length) return false;
  for (const id of expectedIds) {
    const question = activity.questions.find(item => item.id === id)!;
    if (!validSelection(question, draft.answers[id], true)) return false;
  }
  return !draft.checked || JSON.stringify(draft.answers[current.id]) === JSON.stringify(draft.selected);
}
function draftKey(owner: string, activityId: string): string {
  return `draft:${encodeURIComponent(owner)}:${encodeURIComponent(activityId)}`;
}
export const saveGameDraft = (draft: GameDraft) =>
  transaction('cache', 'readwrite', store => store.put(draft, draftKey(draft.owner, draft.activityId)));
export const loadGameDraft = (owner: string, activityId: string) =>
  transaction<unknown>('cache', 'readonly', store => store.get(draftKey(owner, activityId)));
export const clearGameDraft = (owner: string, activityId: string) =>
  transaction('cache', 'readwrite', store => store.delete(draftKey(owner, activityId)));

export async function api(action?: PlatformAction): Promise<ApiResult> {
  const response = await fetch('/api/platform', {
    method: action ? 'POST' : 'GET',
    headers: action ? { 'Content-Type': 'application/json' } : undefined,
    body: action ? JSON.stringify(action) : undefined,
    credentials: 'same-origin', cache: 'no-store',
  });
  const result = await response.json() as ApiResult;
  if (!response.ok || !result.ok) throw new Error(result.error || 'Não foi possível salvar. Tente novamente.');
  return result;
}
export function speak(text: string, enabled = true) {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const phrase = new SpeechSynthesisUtterance(text);
  phrase.lang = 'pt-BR';
  phrase.rate = .82;
  window.speechSynthesis.speak(phrase);
  return true;
}
