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
export const clearOffline = async (options?: { preserveQueue?: boolean }) => {
  await transaction('cache', 'readwrite', store => store.clear());
  if (!options?.preserveQueue) await transaction('queue', 'readwrite', store => store.clear());
};
export interface QueuedAnswer { id: string; owner: string; action: PlatformAction; createdAt: string }
/** Pin legacy and new offline answers to their recorded student, never the active cookie. */
export function queuedSubmissionAction(item: QueuedAnswer): Extract<PlatformAction, { action: 'submit' | 'diagnostic' }> {
  if (!item?.action || !['submit', 'diagnostic'].includes(item.action.action)) throw new Error('Somente respostas de atividades podem ser sincronizadas.');
  const parts = typeof item.owner === 'string' ? item.owner.split(':') : [];
  if (parts.length !== 2 || parts.some(part => !/^[a-zA-Z0-9_-]{1,100}$/.test(part) || part === 'null' || part === 'undefined')) {
    throw new Error('Esta resposta não está vinculada a um estudante válido.');
  }
  return { ...item.action, studentId: parts[1] } as Extract<PlatformAction, { action: 'submit' | 'diagnostic' }>;
}
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
    stimulus: question.stimulus, options: question.options, matches: question.matches, answer: question.answer,
  })));
}
function validSelection(question: Question, answer: unknown, complete: boolean): boolean {
  if (question.type === 'choice') {
    return typeof answer === 'string' && (question.options.includes(answer) || (!complete && answer === ''));
  }
  if (answer === '' && !complete) return true;
  if (!Array.isArray(answer) || answer.length > question.options.length) return false;
  if (question.type === 'multi') {
    return (!complete || answer.length > 0) && new Set(answer).size === answer.length
      && answer.every(item => typeof item === 'string' && question.options.includes(item));
  }
  if (complete && answer.length !== question.options.length) return false;
  const available = [...(question.type === 'match' ? question.matches ?? [] : question.options)];
  for (const item of answer) {
    if (typeof item !== 'string') return false;
    if (question.type === 'match' && item === '' && !complete) continue;
    const found = available.indexOf(item);
    if (found < 0) return false;
    available.splice(found, 1);
  }
  return true;
}
/** Readiness checks shape only; an incorrect but complete response can still be submitted. */
export function isCompleteAnswer(question: Question, answer: unknown): boolean {
  return validSelection(question, answer, true);
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

export class ApiClientError extends Error {
  constructor(message: string, public readonly code?: string) { super(message); this.name = 'ApiClientError'; }
}
export async function api(action?: PlatformAction, options?: { demo?: boolean }): Promise<ApiResult> {
  const response = await fetch(!action && options?.demo ? '/api/platform?demo=1' : '/api/platform', {
    method: action ? 'POST' : 'GET',
    headers: action ? { 'Content-Type': 'application/json' } : undefined,
    body: action ? JSON.stringify(action) : undefined,
    credentials: 'same-origin', cache: 'no-store',
  });
  const result = await response.json() as ApiResult;
  if (!response.ok || !result.ok) throw new ApiClientError(result.error || 'Não foi possível salvar. Tente novamente.', result.code);
  return result;
}
