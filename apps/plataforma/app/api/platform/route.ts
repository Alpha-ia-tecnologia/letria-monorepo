import { withDatabase } from "@/lib/server/database";
import { authenticateAction, bootstrap, changePassword, establishDemo, getAuth, rateLimit } from "@/lib/server/platform";
import { dispatch } from "@/lib/server/actions";
import { ApiError, ensureSameOrigin, errorResponse, jsonResponse, sessionCookie } from "@/lib/server/security";
import { readBounded } from "@/lib/server/storage";
import { demoProfiles } from "@/lib/demo-profiles";

export const dynamic = "force-dynamic";
function withToken(request: Request, token: string): Request { const headers = new Headers(request.headers); headers.set("cookie", "letria_session=" + token); return new Request(request.url, { headers }); }
async function handleGET(request: Request): Promise<Response> {
  try {
    ensureSameOrigin(request);
    const query = new URL(request.url).searchParams, demo = query.get("demo") === "1", demoRole = demoProfiles.find(profile => profile.role === query.get("role"))?.role;
    let auth = await getAuth(request), cookie: string | undefined;
    if (!auth && demo) { const token = await establishDemo(request, demoRole); cookie = sessionCookie(token, request); auth = await getAuth(withToken(request, token)); }
    // A demonstration already open switches to the requested profile; a real account is never changed.
    else if (auth?.isDemo && demo && demoRole && demoRole !== auth.role) { await dispatch(auth, { action: "switchRole", role: demoRole }); auth = await getAuth(request); }
    if (!auth) throw new ApiError(401, "Entre na sua conta para acessar a plataforma.", "UNAUTHENTICATED");
    return jsonResponse({ ok: true, data: await bootstrap(auth) }, 200, cookie);
  } catch (error) { return errorResponse(error); }
}
async function handlePOST(request: Request): Promise<Response> {
  try {
    ensureSameOrigin(request);
    if (!request.headers.get("content-type")?.includes("application/json")) throw new ApiError(415, "Use o formato JSON.");
    let body: Record<string, unknown>;
    try { const parsed = JSON.parse(new TextDecoder().decode(await readBounded(request, 128 * 1024))); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); body = parsed; } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, "Solicitação JSON inválida."); }
    const previous = await getAuth(request);
    if (body.action === "logout") {
      await authenticateAction(request, body, previous);
      return jsonResponse({ ok: true }, 200, sessionCookie("", request, 0));
    }
    if (["register", "login", "studentLogin"].includes(String(body.action))) {
      const token = await authenticateAction(request, body, previous); if (!token) throw new ApiError(401, "Falha ao iniciar sessão.");
      const auth = await getAuth(withToken(request, token)); if (!auth) throw new ApiError(401, "Falha ao iniciar sessão.");
      return jsonResponse({ ok: true, data: await bootstrap(auth) }, 200, sessionCookie(token, request));
    }
    if (!previous) throw new ApiError(401, "Sua sessão expirou. Atualize a página.", "UNAUTHENTICATED");
    await rateLimit(request, "actions", previous.userId, 150);
    const result = body.action === "changePassword" ? await changePassword(request, previous, body) : await dispatch(previous, body), auth = await getAuth(request);
    if (!auth) throw new ApiError(401, "Sua sessão foi encerrada. Atualize a página.", "UNAUTHENTICATED");
    return jsonResponse({ ok: true, ...result, data: await bootstrap(auth) });
  } catch (error) { return errorResponse(error); }
}

export const GET = withDatabase(handleGET);
export const POST = withDatabase(handlePOST);
