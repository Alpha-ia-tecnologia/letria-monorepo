import { withDatabase } from "@/lib/server/database";
import { env } from 'cloudflare:workers';
import { diagnosticQuestions, type Activity } from '@/lib/content';
import { preparedTutorReply } from '@/lib/speech-content';
import { localTutorReply, type TutorContext, type TutorMessage } from '@/lib/tutor';
import { fetchActivity, getAuth, rateLimit } from '@/lib/server/platform';
import { ApiError, ensureSameOrigin, errorResponse, jsonResponse, valueString } from '@/lib/server/security';
import { readBounded } from '@/lib/server/storage';
import { selectTutorProvider, tutorProviderRequest, tutorProviderReply, readTutorProviderResponse, type TutorEnvironment } from '@/lib/server/tutor-provider';

export const dynamic = 'force-dynamic';
const config = () => selectTutorProvider(env as unknown as TutorEnvironment);
async function handleGET(request: Request) {
  try {
    ensureSameOrigin(request);
    if (!await getAuth(request)) throw new ApiError(401, 'Entre na sua aventura para conversar com a Lumi.');
    const { provider } = config();
    return jsonResponse({ ok: true, mode: provider === 'local' ? 'local' : 'ai', provider });
  } catch (error) { return errorResponse(error); }
}
async function handlePOST(request: Request) {
  try {
    ensureSameOrigin(request);
    const auth = await getAuth(request);
    if (!auth) throw new ApiError(401, 'Sua sessão expirou. Reabra a aventura para falar com a Lumi.');
    if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415, 'Use JSON.');
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(await readBounded(request, 16 * 1024)));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'Mensagem inválida.'); }
    const message = valueString(body.message, 'Mensagem', 500);
    const context: TutorContext = body.topic === 'computational' && !body.activityId ? { topic: 'computational' } : {};
    if (body.activityId) {
      context.activity = body.activityId === 'diagnostic'
        ? { id: 'diagnostic', title: 'Primeira descoberta', worldId: 1, description: '', skill: 'Sondagem', type: 'choice', durationMinutes: 8, xp: 0, questions: diagnosticQuestions }
        : await fetchActivity(auth, body.activityId, body.activityVersion) as Activity;
      if (body.questionId) {
        context.question = context.activity.questions.find(question => question.id === body.questionId);
        if (!context.question) throw new ApiError(400, 'Este desafio não pertence à atividade.');
      }
    } else if (body.questionId) throw new ApiError(400, 'Informe a atividade do desafio.');
    const history: TutorMessage[] = [];
    if (body.history !== undefined) {
      if (!Array.isArray(body.history) || body.history.length > 6) throw new ApiError(400, 'Conversa muito longa.');
      for (const item of body.history) {
        if (!item || typeof item !== 'object' || !['user', 'assistant'].includes(item.role)) throw new ApiError(400, 'Mensagem da conversa inválida.');
        history.push({ role: item.role, content: valueString(item.content, 'Mensagem', 1200) });
      }
    }
    await rateLimit(request, 'tutor', auth.userId, 40);
    const fallback = (reason: 'unconfigured' | 'unavailable') => jsonResponse({ ok: true, reply: localTutorReply(message, context), mode: 'local', provider: 'local', reason });
    const prepared = preparedTutorReply(message);
    if (prepared) return jsonResponse({ ok: true, reply: prepared, mode: 'local', provider: 'local', prepared: true });
    const configuration = config();
    if (configuration.provider === 'local') return fallback('unconfigured');
    try {
      request.signal.throwIfAborted();
      const providerRequest = tutorProviderRequest(configuration, message, history, context);
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15000)]);
      const response = await fetch(providerRequest.url, {
        method: 'POST', headers: { Authorization: 'Bearer ' + configuration.key, 'Content-Type': 'application/json' },
        body: JSON.stringify(providerRequest.body), redirect: 'manual', signal,
      });
      const result = await readTutorProviderResponse(response, signal);
      const reply = tutorProviderReply(configuration.provider, result);
      if (!reply) return fallback('unavailable');
      return jsonResponse({ ok: true, reply, mode: 'ai', provider: configuration.provider });
    } catch { return fallback('unavailable'); }
  } catch (error) { return errorResponse(error); }
}

export const GET = withDatabase(handleGET);
export const POST = withDatabase(handlePOST);
