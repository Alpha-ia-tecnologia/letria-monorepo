export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "INVALID_REQUEST") { super(message); }
}
export const encoder = new TextEncoder();
export function hex(bytes: Uint8Array): string { return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""); }
export function randomToken(bytes = 32): string { return hex(crypto.getRandomValues(new Uint8Array(bytes))); }
export async function digest(value: string): Promise<string> { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))); }
export function safeEqual(a: string, b: string): boolean { let result = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return result === 0; }
export async function hashPassword(password: string, salt = randomToken(16)): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: encoder.encode(salt), iterations: 100000, hash: "SHA-256" }, key, 256);
  return "pbkdf2-sha256$100000$" + salt + "$" + hex(new Uint8Array(result));
}
export async function verifyPassword(password: string, expected: string): Promise<boolean> {
  const fields = expected.split("$"); if (fields.length !== 4 || fields[0] !== "pbkdf2-sha256" || fields[1] !== "100000") return false;
  return safeEqual(await hashPassword(password, fields[2]), expected);
}
export function valueString(value: unknown, label: string, max = 200, min = 1): string {
  if (typeof value !== "string") throw new ApiError(400, label + " é obrigatório.");
  const result = value.trim(); if (result.length < min || result.length > max) throw new ApiError(400, label + " deve ter entre " + min + " e " + max + " caracteres.");
  return result;
}
export function valueId(value: unknown, label = "Identificador"): string {
  const result = valueString(value, label, 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw new ApiError(400, label + " inválido.");
  return result;
}
export function valueEmail(value: unknown): string { const result = valueString(value, "E-mail", 254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new ApiError(400, "Informe um e-mail válido."); return result; }
export function valuePassword(value: unknown): string { if (typeof value !== "string" || value.length < 10 || value.length > 128) throw new ApiError(400, "A senha deve ter entre 10 e 128 caracteres."); return value; }
export function ensureSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, "Origem da solicitação não autorizada.", "FORBIDDEN");
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new ApiError(403, "Solicitação externa não autorizada.", "FORBIDDEN");
}
export function sessionCookie(token: string, request: Request, maxAge = 60 * 60 * 24 * 7): string { return "letria_session=" + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + maxAge + (new URL(request.url).protocol === "https:" ? "; Secure" : ""); }
export function jsonResponse(payload: unknown, status = 200, cookie?: string): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" });
  if (cookie) headers.set("Set-Cookie", cookie);
  return new Response(JSON.stringify(payload), { status, headers });
}
export function errorResponse(error: unknown): Response { if (error instanceof ApiError) return jsonResponse({ ok: false, error: error.message, code: error.code }, error.status); console.error("Platform API failure", error); return jsonResponse({ ok: false, error: "Não foi possível concluir agora. Tente novamente em instantes.", code: "SERVER_ERROR" }, 500); }
