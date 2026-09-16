import { env } from "cloudflare:workers";
import { activities as catalog } from "@/lib/content";
import type { Answers, PlatformData, PlatformSession, Role, Submission, CustomActivity } from "@/lib/types";
import { ApiError, digest, hashPassword, randomToken, valueString, valueEmail, valuePassword, valueId, verifyPassword } from "./security";

type Row = Record<string, unknown>;
interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Row>(): Promise<T | null>;
  all<T = Row>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
interface Database { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> }
export function db(): Database { const database = (env as unknown as { DB?: Database }).DB; if (!database) throw new ApiError(503, "O banco de dados está sendo preparado. Tente novamente em instantes.", "DATABASE_UNAVAILABLE"); return database; }
export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
export interface Auth extends PlatformSession { tokenHash: string; settings: PlatformData["settings"] }
export const defaults = { sound: true, reducedMotion: false, fontScale: 1 };
const privileged = (auth: Auth) => auth.role === "teacher" || auth.role === "admin";
export function requireRole(auth: Auth, roles: Role[]): void { if (!roles.includes(auth.role)) throw new ApiError(403, "Seu perfil não tem permissão para esta ação.", "FORBIDDEN"); }
export async function rateLimit(request: Request, operation: string, identifier = "", limit = 20): Promise<void> {
  const key = await digest(operation + ":" + (request.headers.get("CF-Connecting-IP") || "local") + ":" + identifier);
  const time = Date.now(); const reset = time + 15 * 60 * 1000;
  await db().prepare("INSERT INTO rate_limits (key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<? THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at<? THEN ? ELSE reset_at END").bind(key, reset, time, time, reset).run();
  const row = await db().prepare("SELECT count FROM rate_limits WHERE key=?").bind(key).first();
  if (Number(row?.count) > limit) throw new ApiError(429, "Muitas tentativas. Aguarde 15 minutos para tentar novamente.", "RATE_LIMIT");
}
export async function getAuth(request: Request): Promise<Auth | null> {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)letria_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return null;
  const tokenHash = await digest(token);
  const row = await db().prepare("SELECT s.token_hash,s.role AS session_role,s.settings,u.id,u.name,u.email,u.role,u.student_id,u.institution_id,i.name AS institution_name,i.is_demo FROM sessions s JOIN users u ON u.id=s.user_id JOIN institutions i ON i.id=u.institution_id WHERE s.token_hash=? AND s.expires_at>?").bind(tokenHash, now()).first();
  if (!row) return null;
  return { tokenHash, userId: String(row.id), name: String(row.name), email: row.email ? String(row.email) : undefined, role: (row.is_demo ? row.session_role : row.role) as Role, isDemo: Boolean(row.is_demo), institutionId: String(row.institution_id), institutionName: String(row.institution_name), studentId: row.student_id ? String(row.student_id) : null, settings: { ...defaults, ...JSON.parse(String(row.settings || "{}")) } };
}
async function newSession(userId: string, role: Role): Promise<string> {
  const token = randomToken();
  await db().prepare("INSERT INTO sessions (token_hash,user_id,role,expires_at,settings) VALUES (?,?,?,?,?)").bind(await digest(token), userId, role, new Date(Date.now() + 7 * 86400000).toISOString(), JSON.stringify(defaults)).run();
  return token;
}
export async function establishDemo(request: Request): Promise<string> {
  await rateLimit(request, "demo", "", 60);
  const institutionId = uid(), userId = uid(), classroomId = uid(), studentIds = Array.from({ length: 7 }, uid), stamp = now();
  const statements = [
    db().prepare("INSERT INTO institutions (id,name,is_demo,created_at) VALUES (?,?,1,?)").bind(institutionId, "Escola Aurora · demonstração", stamp),
    db().prepare("INSERT INTO users (id,institution_id,name,role,student_id,created_at) VALUES (?,?,?,?,?,?)").bind(userId, institutionId, "Lia", "student", studentIds[0], stamp),
    db().prepare("INSERT INTO classrooms (id,institution_id,name,grade,teacher_name,teacher_user_id,created_at) VALUES (?,?,?,?,?,?,?)").bind(classroomId, institutionId, "2º ano A", "2º ano", "Prof. Marina · fictícia", userId, stamp)
  ];
  const names = ["Lia", "Miguel", "Sofia", "Davi", "Helena", "Theo", "Alice"], avatars = ["🦊", "🐸", "🐱", "🐻", "🦉", "🐼", "🐰"];
  names.forEach((name, i) => statements.push(db().prepare("INSERT INTO students (id,institution_id,classroom_id,name,avatar,grade,consent_audio,created_at) VALUES (?,?,?,?,?,?,0,?)").bind(studentIds[i], institutionId, classroomId, name, avatars[i], "2º ano", stamp)));
  catalog.slice(0, 2).forEach((activity, index) => {
    const date = new Date(Date.now() - (2 - index) * 86400000).toISOString();
    studentIds.forEach((studentId, i) => {
      if (i === 4 || (index === 1 && i > 3)) return;
      const score = i === 0 || i === 1 ? 100 : i === 2 ? 67 : 33;
      const correct = Math.round(activity.questions.length * score / 100);
      const answers: Answers = {};
      activity.questions.forEach((q, n) => { answers[q.id] = n < correct ? q.answer : q.options.find((o) => o !== q.answer) || ""; });
      const id = uid(), xp = score >= 80 ? activity.xp : 0;
      statements.push(db().prepare("INSERT INTO submissions (id,institution_id,student_id,activity_id,activity_version,score,correct,total,xp_earned,answers,fingerprint,completed_at,duration_seconds,is_diagnostic) VALUES (?,?,?,?,1,?,?,?,?,?,?,?,120,0)").bind(id, institutionId, studentId, activity.id, Math.round(correct / activity.questions.length * 100), correct, activity.questions.length, xp, JSON.stringify(answers), "demo-" + id, date));
      if (xp) statements.push(db().prepare("INSERT INTO xp_awards (id,student_id,activity_id,submission_id,xp) VALUES (?,?,?,?,?)").bind(uid(), studentId, activity.id, id, xp));
    });
  });
  statements.push(db().prepare("INSERT INTO assignments (id,institution_id,classroom_id,activity_id,title,due_date,created_at) VALUES (?,?,?,?,?,?,?)").bind(uid(), institutionId, classroomId, catalog[2].id, catalog[2].title, new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), stamp));
  statements.push(db().prepare("INSERT INTO notifications (id,institution_id,student_id,title,text,read,created_at) VALUES (?,?,NULL,?,?,0,?)").bind(uid(), institutionId, "Sua aventura começa aqui!", "Este espaço usa alunos fictícios. Explore os perfis e experimente as atividades.", stamp));
  statements.push(db().prepare("INSERT INTO notes (id,institution_id,student_id,text,type,author,created_at) VALUES (?,?,?,?,?,?,?)").bind(uid(), institutionId, studentIds[2], "Exemplo fictício: retomar a associação entre letras e sons com apoio visual, em uma sessão curta.", "intervention", "Prof. Marina · fictícia", stamp));
  await db().batch(statements);
  return newSession(userId, "student");
}
export async function authenticateAction(request: Request, body: Record<string, unknown>, previous: Auth | null): Promise<string | null> {
  const action = body.action;
  if (action === "logout") { if (previous) await db().prepare("DELETE FROM sessions WHERE token_hash=?").bind(previous.tokenHash).run(); return establishDemo(request); }
  if (action === "register") {
    await rateLimit(request, "register", "", 10);
    const name = valueString(body.name, "Nome", 80), email = valueEmail(body.email), password = valuePassword(body.password), institutionName = valueString(body.institutionName, "Nome da instituição", 120);
    const exists = await db().prepare("SELECT id FROM users WHERE email=?").bind(email).first();
    if (exists) throw new ApiError(409, "Este e-mail já está cadastrado. Entre com sua senha.", "EMAIL_IN_USE");
    const userId = uid(), institutionId = uid(), stamp = now(), passwordHash = await hashPassword(password);
    await db().batch([
      db().prepare("INSERT INTO institutions (id,name,is_demo,created_at) VALUES (?,?,0,?)").bind(institutionId, institutionName, stamp),
      db().prepare("INSERT INTO users (id,institution_id,name,email,password_hash,role,created_at) VALUES (?,?,?,?,?,'admin',?)").bind(userId, institutionId, name, email, passwordHash, stamp)
    ]);
    if (previous) await db().prepare("DELETE FROM sessions WHERE token_hash=?").bind(previous.tokenHash).run();
    return newSession(userId, "admin");
  }
  if (action === "login") {
    const email = valueEmail(body.email), password = valueString(body.password, "Senha", 128);
    await rateLimit(request, "login", email, 12);
    const row = await db().prepare("SELECT id,role,password_hash FROM users WHERE email=?").bind(email).first();
    const valid = await verifyPassword(password, row?.password_hash ? String(row.password_hash) : "pbkdf2-sha256$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000");
    if (!row || !valid) throw new ApiError(401, "E-mail ou senha incorretos.", "INVALID_CREDENTIALS");
    if (previous) await db().prepare("DELETE FROM sessions WHERE token_hash=?").bind(previous.tokenHash).run();
    return newSession(String(row.id), row.role as Role);
  }
  if (action === "studentLogin") {
    await rateLimit(request, "student-login", "", 12);
    const code = valueString(body.code, "Código", 40).replace(/[-\s]/g, "").toUpperCase();
    const row = await db().prepare("SELECT id,institution_id,name FROM students WHERE code_hash=?").bind(await digest(code)).first();
    if (!row) throw new ApiError(401, "Código de estudante inválido.", "INVALID_CREDENTIALS");
    let user = await db().prepare("SELECT id FROM users WHERE student_id=? AND role='student'").bind(row.id).first();
    if (!user) {
      const userId = uid();
      await db().prepare("INSERT INTO users (id,institution_id,name,role,student_id,created_at) VALUES (?,?,?,'student',?,?)").bind(userId, row.institution_id, row.name, row.id, now()).run();
      user = { id: userId };
    }
    if (previous) await db().prepare("DELETE FROM sessions WHERE token_hash=?").bind(previous.tokenHash).run();
    return newSession(String(user.id), "student");
  }
  return null;
}
export async function requireStudent(auth: Auth, rawId?: unknown): Promise<Row> {
  const id = rawId ? valueId(rawId, "Estudante") : auth.studentId;
  if (!id) throw new ApiError(400, "Selecione um estudante.");
  if (!privileged(auth) && id !== auth.studentId) throw new ApiError(403, "Acesso ao estudante não autorizado.", "FORBIDDEN");
  const student = await db().prepare("SELECT * FROM students WHERE id=? AND institution_id=?").bind(id, auth.institutionId).first();
  if (!student) throw new ApiError(404, "Estudante não encontrado.", "NOT_FOUND");
  if (auth.role === "teacher") {
    const assigned = await db().prepare("SELECT id FROM classrooms WHERE id=? AND institution_id=? AND teacher_user_id=?").bind(student.classroom_id, auth.institutionId, auth.userId).first();
    if (!assigned) throw new ApiError(403, "Este estudante não pertence às suas turmas.", "FORBIDDEN");
  }
  return student;
}
export function submissionRow(row: Row): Submission { return { id: String(row.id), studentId: String(row.student_id), activityId: String(row.activity_id), activityVersion: Number(row.activity_version), score: Number(row.score), correct: Number(row.correct), total: Number(row.total), xpEarned: Number(row.xp_earned), answers: JSON.parse(String(row.answers)), completedAt: String(row.completed_at), durationSeconds: Number(row.duration_seconds), isDiagnostic: Boolean(row.is_diagnostic) }; }
export async function bootstrap(auth: Auth): Promise<PlatformData> {
  const institution = auth.institutionId, limited = !privileged(auth), teacher = auth.role === "teacher";
  const taughtClasses = "SELECT id FROM classrooms WHERE teacher_user_id=?";
  const taughtStudents = "SELECT id FROM students WHERE classroom_id IN (" + taughtClasses + ")";
  const studentFilter = limited ? " AND student_id=?" : teacher ? " AND student_id IN (" + taughtStudents + ")" : "";
  const studentArgs = limited ? [institution, auth.studentId || "none"] : teacher ? [institution, auth.userId] : [institution];
  const [studentsResult, classroomsResult, submissionsResult, assignmentsResult, notesResult, notificationsResult, activitiesResult, recordingsResult, staffResult] = await Promise.all([
    db().prepare("SELECT s.*,c.name AS classroom_name FROM students s LEFT JOIN classrooms c ON c.id=s.classroom_id WHERE s.institution_id=?" + (limited ? " AND s.id=?" : teacher ? " AND s.classroom_id IN (" + taughtClasses + ")" : "") + " ORDER BY s.created_at,s.name").bind(...studentArgs).all(),
    db().prepare("SELECT * FROM classrooms WHERE institution_id=?" + (limited ? " AND id IN (SELECT classroom_id FROM students WHERE id=?)" : teacher ? " AND teacher_user_id=?" : "") + " ORDER BY created_at").bind(...studentArgs).all(),
    db().prepare("SELECT * FROM submissions WHERE institution_id=?" + studentFilter + " ORDER BY completed_at DESC").bind(...studentArgs).all(),
    db().prepare("SELECT * FROM assignments WHERE institution_id=?" + (limited ? " AND classroom_id IN (SELECT classroom_id FROM students WHERE id=?)" : teacher ? " AND classroom_id IN (" + taughtClasses + ")" : "") + " ORDER BY created_at DESC").bind(...studentArgs).all(),
    auth.role === "student" ? Promise.resolve({ results: [] }) : db().prepare("SELECT * FROM notes WHERE institution_id=?" + studentFilter + (auth.role === "guardian" ? " AND type='intervention'" : "") + " ORDER BY created_at DESC").bind(...studentArgs).all(),
    db().prepare("SELECT * FROM notifications WHERE institution_id=?" + (limited ? " AND (student_id IS NULL OR student_id=?)" : teacher ? " AND (student_id IS NULL OR student_id IN (" + taughtStudents + "))" : "") + " ORDER BY created_at DESC LIMIT 30").bind(...studentArgs).all(),
    db().prepare("SELECT a.*, (SELECT body FROM activity_versions v WHERE v.activity_id=a.id ORDER BY version DESC LIMIT 1) AS published_body, (SELECT version FROM activity_versions v WHERE v.activity_id=a.id ORDER BY version DESC LIMIT 1) AS published_version FROM activities a WHERE a.institution_id=?" + (limited ? " AND (a.status='published' OR EXISTS (SELECT 1 FROM activity_versions v WHERE v.activity_id=a.id))" : "") + " ORDER BY a.created_at DESC").bind(institution).all(),
    db().prepare("SELECT * FROM recordings WHERE institution_id=?" + studentFilter + " ORDER BY created_at DESC").bind(...studentArgs).all(),
    auth.role === "admin" ? db().prepare("SELECT id,name,email,role,student_id FROM users WHERE institution_id=? AND role IN ('teacher','guardian','admin') ORDER BY name").bind(institution).all() : Promise.resolve({ results: [] })
  ]);
  const { settings } = auth; const session: PlatformSession = { userId: auth.userId, name: auth.name, email: auth.email, role: auth.role, isDemo: auth.isDemo, institutionId: auth.institutionId, institutionName: auth.institutionName, studentId: auth.studentId };
  return {
    session, settings, serverTime: now(),
    staff: auth.isDemo && auth.role === "admin" ? [{ id: auth.userId, name: "Prof. Marina · fictícia", role: "teacher", studentId: null }] : staffResult.results.map((r: Row) => ({ id: String(r.id), name: String(r.name), ...(r.email ? { email: String(r.email) } : {}), role: r.role as "teacher" | "guardian" | "admin", studentId: r.student_id ? String(r.student_id) : null })),
    students: studentsResult.results.map((r) => ({ id: String(r.id), name: String(r.name), classroomId: r.classroom_id ? String(r.classroom_id) : null, classroomName: String(r.classroom_name || "Sem turma"), avatar: String(r.avatar), grade: String(r.grade), consentAudio: Boolean(r.consent_audio), createdAt: String(r.created_at) })),
    classrooms: classroomsResult.results.map((r) => ({ id: String(r.id), name: String(r.name), grade: String(r.grade), teacherName: String(r.teacher_name), teacherUserId: r.teacher_user_id ? String(r.teacher_user_id) : null, createdAt: String(r.created_at) })),
    submissions: submissionsResult.results.map(submissionRow),
    assignments: assignmentsResult.results.map((r) => ({ id: String(r.id), classroomId: String(r.classroom_id), activityId: String(r.activity_id), title: String(r.title), dueDate: String(r.due_date), createdAt: String(r.created_at) })),
    notes: notesResult.results.map((r: Row) => ({ id: String(r.id), studentId: String(r.student_id), text: String(r.text), type: r.type as "observation" | "intervention", author: String(r.author), createdAt: String(r.created_at) })),
    notifications: notificationsResult.results.map((r) => ({ id: String(r.id), title: String(r.title), text: String(r.text), read: Boolean(r.read), createdAt: String(r.created_at) })),
    customActivities: activitiesResult.results.map((r) => ({ ...JSON.parse(String(limited && r.published_body ? r.published_body : r.body)), id: String(r.id), version: Number(limited && r.published_version ? r.published_version : r.version), status: limited ? "published" : r.status, createdAt: String(r.created_at) } as CustomActivity)),
    recordings: recordingsResult.results.map((r) => ({ id: String(r.id), studentId: String(r.student_id), activityId: String(r.activity_id), mimeType: String(r.mime_type), size: Number(r.size), createdAt: String(r.created_at) }))
  };
}
export async function fetchActivity(auth: Auth, rawId: unknown, requestedVersion?: unknown) {
  const activityId = valueId(rawId, "Atividade"), builtIn = catalog.find((a) => a.id === activityId);
  if (requestedVersion !== undefined && (typeof requestedVersion !== "number" || !Number.isInteger(requestedVersion) || requestedVersion < 1)) throw new ApiError(400, "Versão de atividade inválida.");
  if (builtIn) { if (requestedVersion !== undefined && requestedVersion !== 1) throw new ApiError(404, "Versão de atividade não encontrada."); return { ...builtIn, version: 1 }; }
  const row = await db().prepare("SELECT * FROM activities WHERE id=? AND institution_id=?").bind(activityId, auth.institutionId).first();
  if (!row) throw new ApiError(404, "Atividade publicada não encontrada.", "NOT_FOUND");
  const version = requestedVersion === undefined
    ? await db().prepare("SELECT body,version FROM activity_versions WHERE activity_id=? ORDER BY version DESC LIMIT 1").bind(activityId).first()
    : await db().prepare("SELECT body,version FROM activity_versions WHERE activity_id=? AND version=?").bind(activityId, requestedVersion).first();
  if (!version) throw new ApiError(404, "A atividade ainda não foi publicada.", "NOT_FOUND");
  return { ...JSON.parse(String(version.body)), id: String(row.id), version: Number(version.version) } as CustomActivity;
}
export async function audit(auth: Auth, action: string, detail: string): Promise<void> {
  await db().prepare("INSERT INTO audit_logs (id,institution_id,user_id,action,detail,created_at) VALUES (?,?,?,?,?,?)").bind(uid(), auth.institutionId, auth.userId, action, detail.slice(0, 300), now()).run();
}
export async function notify(auth: Auth, title: string, text: string, studentId: string | null = null): Promise<void> {
  await db().prepare("INSERT INTO notifications (id,institution_id,student_id,title,text,read,created_at) VALUES (?,?,?,?,?,0,?)").bind(uid(), auth.institutionId, studentId, title, text, now()).run();
}
