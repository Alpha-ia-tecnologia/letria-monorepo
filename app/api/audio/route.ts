import { bootstrap, getAuth, rateLimit } from "@/lib/server/platform";
import { ApiError, ensureSameOrigin, errorResponse, jsonResponse } from "@/lib/server/security";
import { saveRecording, streamRecording } from "@/lib/server/storage";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  try { ensureSameOrigin(request); const auth = await getAuth(request); if (!auth) throw new ApiError(401, "Entre para ouvir a gravação."); return await streamRecording(auth, new URL(request.url).searchParams.get("id")); } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request): Promise<Response> {
  try { ensureSameOrigin(request); const auth = await getAuth(request); if (!auth) throw new ApiError(401, "Entre para salvar a gravação."); await rateLimit(request, "audio", auth.userId, 30); const result = await saveRecording(auth, request); return jsonResponse({ ok: true, ...result, data: await bootstrap(auth) }); } catch (error) { return errorResponse(error); }
}
