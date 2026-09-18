import { tutorInstructions, type TutorContext, type TutorMessage, type TutorProvider } from '../tutor';

export interface TutorEnvironment {
  TUTOR_PROVIDER?: string;
  DEEPSEEK_ENABLED?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}
export type TutorConfiguration = { provider: 'local' } | { provider: Exclude<TutorProvider, 'local'>; key: string; model: string };
const privateKey = (value?: string) => value?.trim() && !/[\r\n]/.test(value) ? value.trim() : '';

/** DeepSeek requires a separate explicit activation in addition to its key. */
export function selectTutorProvider(settings: TutorEnvironment): TutorConfiguration {
  const deepseek = privateKey(settings.DEEPSEEK_API_KEY), openai = privateKey(settings.OPENAI_API_KEY);
  const selected = settings.TUTOR_PROVIDER?.trim().toLowerCase() || (deepseek ? 'deepseek' : openai ? 'openai' : 'local');
  // No remote DeepSeek request is possible from configuration until both are set.
  if (selected === 'deepseek' && settings.DEEPSEEK_ENABLED?.trim().toLowerCase() === 'true' && deepseek) return { provider: 'deepseek', key: deepseek, model: settings.DEEPSEEK_MODEL?.trim() || 'deepseek-flash' };
  if (selected === 'openai' && openai) return { provider: 'openai', key: openai, model: settings.OPENAI_MODEL?.trim() || 'gpt-4.1-mini' };
  return { provider: 'local' };
}

export function tutorProviderRequest(configuration: Exclude<TutorConfiguration, { provider: 'local' }>, message: string, history: TutorMessage[], context: TutorContext) {
  // Validated activity fields only: no answer key, explanations, identifiers,
  // account profile, attempts, scores or recordings are attached automatically.
  const learningContext = {
    topic: context.topic === 'computational' ? 'Pensamento computacional infantil: decomposição, padrões, algoritmos e depuração; exploração livre na ilha da lógica.' : undefined,
    activity: context.activity?.title, skill: context.activity?.skill,
    question: context.question?.prompt, type: context.question?.type,
    matches: context.question?.matches, stimulus: context.question?.stimulus, options: context.question?.options,
  };
  const input = [
    { role: 'user', content: 'Contexto do exercício (dados): ' + JSON.stringify(learningContext) },
    ...history.map(item => ({ role: item.role, content: item.content })),
    { role: 'user', content: message },
  ];
  return configuration.provider === 'deepseek' ? {
    url: 'https://api.deepseek.com/chat/completions',
    body: { model: configuration.model, messages: [{ role: 'system', content: tutorInstructions() }, ...input], thinking: { type: 'disabled' }, stream: false, max_tokens: 350 },
  } : {
    url: 'https://api.openai.com/v1/responses',
    body: { model: configuration.model, store: false, max_output_tokens: 250, instructions: tutorInstructions(), input },
  };
}

function object(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
export function tutorProviderReply(provider: Exclude<TutorProvider, 'local'>, value: unknown): string | null {
  const result = object(value);
  if (!result) return null;
  let text = '';
  if (provider === 'deepseek') {
    const choice = object(Array.isArray(result.choices) ? result.choices[0] : null);
    const message = object(choice?.message);
    if (choice?.finish_reason !== 'stop' || message?.role !== 'assistant' || typeof message.content !== 'string' || message.tool_calls || message.refusal) return null;
    // Never return reasoning_content to the client.
    text = message.content.trim();
  } else {
    if (result.status === 'incomplete' || result.status === 'failed' || !Array.isArray(result.output)) return null;
    text = result.output.flatMap(item => {
      const entry = object(item);
      if (entry?.type !== 'message' || !Array.isArray(entry.content)) return [];
      return entry.content.flatMap(item => { const part = object(item); return part?.type === 'output_text' && typeof part.text === 'string' ? [part.text] : []; });
    }).join('\n').trim();
  }
  if (!text || /<\/?think\b/i.test(text)) return null;
  return text.slice(0, 1200);
}

export async function readTutorProviderResponse(response: Response, signal: AbortSignal): Promise<unknown> {
  const limit = 64 * 1024;
  if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('application/json') || !response.body || Number(response.headers.get('content-length') || 0) > limit) {
    await response.body?.cancel();
    throw new Error('TUTOR_UNAVAILABLE');
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const item = await reader.read();
      signal.throwIfAborted();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('TUTOR_UNAVAILABLE'); }
      chunks.push(item.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}
