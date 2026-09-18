import { env } from 'cloudflare:workers';
import { activitySpeech, type PreparedSpeech } from '../speech-content';
import type { Activity } from '../content';

export type VoicePreparation = 'queued' | 'partial' | 'unavailable' | 'disabled';
interface VoiceSettings { TTS_PROVIDER?: string; QWEN_TTS_URL?: string; QWEN_TTS_API_TOKEN?: string }
/** Enqueue only approved educational content; arbitrary student messages never enter the disk library. */
export async function queuePreparedSpeech(items: PreparedSpeech[], settings: VoiceSettings, fetcher: typeof fetch = fetch): Promise<VoicePreparation> {
  if (settings.TTS_PROVIDER !== 'qwen') return 'disabled';
  let queued = false;
  try {
    const token = settings.QWEN_TTS_API_TOKEN?.trim();
    if (!token || token.length < 32 || /\s/.test(token)) return 'unavailable';
    const url = new URL(settings.QWEN_TTS_URL || 'http://127.0.0.1:8766');
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:'
      && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) return 'unavailable';
    const batches: PreparedSpeech[][] = [];
    for (const item of items) {
      const batch = batches.at(-1);
      if (!batch || batch.length === 32 || new TextEncoder().encode(JSON.stringify({ items: [...batch, item] })).length > 15000) batches.push([item]);
      else batch.push(item);
    }
    // This deadline only covers queue acknowledgement, never GPU synthesis.
    const signal = AbortSignal.timeout(5000);
    for (const batch of batches) {
      const response = await fetcher(url.href.replace(/\/+$/, '') + '/v1/audio/prepare', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: batch }), redirect: 'manual', signal,
      });
      await response.body?.cancel();
      if (response.status !== 202) return queued ? 'partial' : 'unavailable';
      queued = true;
    }
    return queued ? 'queued' : 'disabled';
  } catch { return queued ? 'partial' : 'unavailable'; }
}
export function prepareActivitySpeech(activity: Pick<Activity, 'worldId' | 'questions'>): Promise<VoicePreparation> {
  return queuePreparedSpeech(activitySpeech(activity), env as VoiceSettings);
}
