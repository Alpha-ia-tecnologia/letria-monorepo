import type { PlatformSession } from '@/lib/types';
import { withDatabase } from '@/lib/server/database';
import { getAuth } from '@/lib/server/platform';
import { ensureSameOrigin, errorResponse, jsonResponse } from '@/lib/server/security';

export const dynamic = 'force-dynamic';
async function handleGET(request: Request): Promise<Response> {
  try {
    ensureSameOrigin(request);
    const auth = await getAuth(request);
    const session: PlatformSession | null = auth ? {
      userId: auth.userId,
      name: auth.name,
      email: auth.email,
      role: auth.role,
      isDemo: auth.isDemo,
      institutionId: auth.institutionId,
      institutionName: auth.institutionName,
      studentId: auth.studentId,
    } : null;
    return jsonResponse({ ok: true, session });
  } catch (error) { return errorResponse(error); }
}
export const GET = withDatabase(handleGET);
