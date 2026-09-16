import { authenticateAction, bootstrap, establishDemo, getAuth, rateLimit } from "@/lib/server/platform";
import { dispatch } from "@/lib/server/actions";
import { ApiError, ensureSameOrigin, errorResponse, jsonResponse, sessionCookie } from "@/lib/server/security";
import { readBounded } from "@/lib/server/storage";

export const dynamic = "force-dynamic";
function withToken(request: Request, token: string): Request { const headers = new Headers(request.headers); headers.set("cookie", "letria_session=" + token); return new Request(request.url, { headers }); }
export async function GET(request: Request): Promise<Response> {
  try {
    ensureSameOrigin(request);
    let auth = await getAuth(request), cookie: string | undefined;
    if (!auth) { const token = await establishDemo(request); cookie = sessionCookie(token, request); auth = await getAuth(withToken(request, token)); }
    if (!auth) throw new ApiError(401, "Sessão indisponível. Atualize a página.");
    return jsonResponse({ ok: true, data: await bootstrap(auth) }, 200, cookie);
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request): Promise<Response> {
  try {
    ensureSameOrigin(request);
    if (!request.headers.get("content-type")?.includes("application/json")) throw new ApiError(415, "Use o formato JSON.");
    let body: Record<string, unknown>;
    try { const parsed = JSON.parse(new TextDecoder().decode(await readBounded(request, 128 * 1024))); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); body = parsed; } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, "Solicitação JSON inválida."); }
    const previous = await getAuth(request);
    if (["register", "login", "studentLogin", "logout"].includes(String(body.action))) {
      const token = await authenticateAction(request, body, previous); if (!token) throw new ApiError(401, "Falha ao iniciar sessão.");
      const auth = await getAuth(withToken(request, token)); if (!auth) throw new ApiError(401, "Falha ao iniciar sessão.");
      return jsonResponse({ ok: true, data: await bootstrap(auth) }, 200, sessionCookie(token, request));
    }
    if (!previous) throw new ApiError(401, "Sua sessão expirou. Atualize a página.", "UNAUTHENTICATED");
    await rateLimit(request, "actions", previous.userId, 150);
    const result = await dispatch(previous, body), auth = await getAuth(request);
    if (!auth) throw new ApiError(401, "Sua sessão foi encerrada. Atualize a página.", "UNAUTHENTICATED");
    return jsonResponse({ ok: true, ...result, data: await bootstrap(auth) });
  } catch (error) { return errorResponse(error); }
}
