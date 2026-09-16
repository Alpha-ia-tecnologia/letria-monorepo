import { env } from "cloudflare:workers";
import { ApiError, valueId } from "./security";
import { audit, db, fetchActivity, now, requireRole, requireStudent, uid, type Auth } from "./platform";
interface StoredObject { body: ReadableStream<Uint8Array>; httpMetadata?: { contentType?: string }; size: number }
interface Bucket { put(key: string, value: ArrayBuffer, options?: { httpMetadata: { contentType: string } }): Promise<unknown>; get(key: string): Promise<StoredObject | null>; delete(key: string | string[]): Promise<void> }
function audioBucket(): Bucket { const bucket = (env as unknown as { AUDIO?: Bucket }).AUDIO; if (!bucket) throw new ApiError(503, "O armazenamento de áudio está indisponível no momento.", "AUDIO_UNAVAILABLE"); return bucket; }
export async function deleteAudioObjects(keys: string[]): Promise<void> { if (keys.length) await audioBucket().delete(keys); }
export async function readBounded(request: Request, limit: number): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length") || 0) > limit) throw new ApiError(413, "Arquivo ou solicitação muito grande.");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > limit) { await reader.cancel(); throw new ApiError(413, "Arquivo ou solicitação muito grande."); } chunks.push(item.value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; } return bytes;
}
function audioMagic(bytes: Uint8Array, type: string): boolean {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (type === "audio/webm") return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (type === "audio/ogg") return ascii(0, 4) === "OggS";
  if (type === "audio/mp4") return ascii(4, 8) === "ftyp";
  if (type === "audio/wav" || type === "audio/x-wav") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE";
  if (type === "audio/mpeg") return ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  return false;
}
export async function saveRecording(auth: Auth, request: Request) {
  requireRole(auth, ["student", "teacher", "admin"]);
  const bytes = await readBounded(request, 8 * 1024 * 1024);
  let form: FormData;
  try { form = await new Response(bytes as BodyInit, { headers: { "Content-Type": request.headers.get("Content-Type") || "" } }).formData(); } catch { throw new ApiError(400, "Envie a gravação em formulário multipart."); }
  const student = await requireStudent(auth, form.get("studentId") || undefined), activity = await fetchActivity(auth, form.get("activityId")), file = form.get("file");
  if (!student.consent_audio) throw new ApiError(403, "O responsável precisa autorizar as gravações antes de começar.", "CONSENT_REQUIRED");
  if (!(file instanceof File) || file.size < 32 || file.size > 7 * 1024 * 1024) throw new ApiError(400, "Envie um áudio válido de até 7 MB.");
  const mimeType = file.type.split(";")[0].toLowerCase(), buffer = await file.arrayBuffer();
  if (!audioMagic(new Uint8Array(buffer), mimeType)) throw new ApiError(400, "Formato não suportado. Use uma gravação WebM, Ogg, MP4, MP3 ou WAV.");
  const count = await db().prepare("SELECT COUNT(*) AS count FROM recordings WHERE student_id=? AND institution_id=?").bind(student.id, auth.institutionId).first();
  if (Number(count?.count) >= 30) throw new ApiError(409, "Este estudante já possui 30 gravações. Exclua uma gravação anterior para continuar.");
  const id = uid(), key = auth.institutionId + "/" + student.id + "/" + id, bucket = audioBucket();
  await bucket.put(key, buffer, { httpMetadata: { contentType: mimeType } });
  try {
    await db().prepare("INSERT INTO recordings (id,institution_id,student_id,activity_id,object_key,mime_type,size,created_at) SELECT ?,institution_id,id,?,?,?,?,? FROM students WHERE id=? AND institution_id=? AND consent_audio=1").bind(id, activity.id, key, mimeType, file.size, now(), student.id, auth.institutionId).run();
    const row = await db().prepare("SELECT id FROM recordings WHERE id=?").bind(id).first();
    if (!row) throw new ApiError(403, "A autorização de gravação foi revogada.", "CONSENT_REQUIRED");
  } catch (error) { await bucket.delete(key); throw error; }
  await audit(auth, "saveRecording", id); return { recordingId: id };
}
export async function streamRecording(auth: Auth, id: unknown): Promise<Response> {
  const row = await db().prepare("SELECT * FROM recordings WHERE id=? AND institution_id=?").bind(valueId(id), auth.institutionId).first();
  if (!row) throw new ApiError(404, "Gravação não encontrada."); const student = await requireStudent(auth, row.student_id);
  if (!student.consent_audio) throw new ApiError(403, "A autorização de gravação foi revogada.", "CONSENT_REQUIRED");
  const object = await audioBucket().get(String(row.object_key)); if (!object) throw new ApiError(404, "O arquivo de áudio não está disponível.");
  return new Response(object.body, { headers: { "Content-Type": String(row.mime_type), "Content-Length": String(object.size), "Cache-Control": "private, no-store", "Content-Disposition": 'inline; filename="leitura-' + row.id + '"', "X-Content-Type-Options": "nosniff" } });
}
