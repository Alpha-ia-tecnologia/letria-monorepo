export const dynamic = 'force-dynamic';

/** Liveness only: no database writes, external provider calls or configuration disclosure. */
export function GET() {
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
