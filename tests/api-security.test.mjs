import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { registerHooks } from "node:module";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
globalThis.__letriaTestEnv = {};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") return { url: "letria:env", shortCircuit: true };
    if (specifier.startsWith("@/")) return { url: pathToFileURL(path.join(root, specifier.slice(2) + ".ts")).href, shortCircuit: true };
    if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
      const resolved = new URL(specifier, context.parentURL); if (existsSync(fileURLToPath(resolved) + ".ts")) return { url: resolved.href + ".ts", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "letria:env") return { format: "module", source: "export const env=globalThis.__letriaTestEnv;", shortCircuit: true };
    if (url.endsWith(".ts") && !url.includes("node_modules")) return { format: "module", source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true };
    return nextLoad(url, context);
  }
});
const { GET, POST } = await import("../app/api/platform/route.ts");
const { POST: upload, GET: download } = await import("../app/api/audio/route.ts");
const { activities } = await import("../lib/content.ts");
const { hashPassword, verifyPassword } = await import("../lib/server/security.ts");
let sqlite, objects;
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:"); sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(path.join(root, "drizzle")).filter((name) => name.endsWith(".sql")).sort()) sqlite.exec(readFileSync(path.join(root, "drizzle", file), "utf8"));
  function prepare(query) {
    let values = [];
    return { bind(...input) { values = input; return this; }, async first() { return sqlite.prepare(query).get(...values) || null; }, async all() { return { results: sqlite.prepare(query).all(...values) }; }, async run() { return sqlite.prepare(query).run(...values); } };
  }
  globalThis.__letriaTestEnv.DB = { prepare, async batch(statements) { sqlite.exec("BEGIN"); try { const output = []; for (const statement of statements) output.push(await statement.run()); sqlite.exec("COMMIT"); return output; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } } };
  objects = new Map();
  globalThis.__letriaTestEnv.AUDIO = { async put(key, buffer, metadata) { objects.set(key, { buffer, metadata }); }, async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key); }, async get(key) { const item = objects.get(key); if (!item) return null; return { body: new Blob([item.buffer]).stream(), size: item.buffer.byteLength }; } };
});
async function start() { const response = await GET(new Request("https://letria.test/api/platform")); const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); return { cookie: response.headers.get("set-cookie").split(";")[0], data: body.data }; }
async function action(cookie, body, expected = 200) { const response = await POST(new Request("https://letria.test/api/platform", { method: "POST", headers: { cookie, "Content-Type": "application/json", Origin: "https://letria.test" }, body: JSON.stringify(body) })); const result = await response.json(); assert.equal(response.status, expected, JSON.stringify(result)); return { ...result, cookie: response.headers.get("set-cookie")?.split(";")[0] || cookie }; }
const answerAll = (activity) => Object.fromEntries(activity.questions.map((q) => [q.id, q.answer]));
test("demo institutions are isolated and role authorization is server enforced", async () => {
  const first = await start(), second = await start();
  assert.notEqual(first.data.session.institutionId, second.data.session.institutionId);
  assert.equal(first.data.students.length, 1); assert.equal(first.data.students[0].name, "Lia");
  await action(first.cookie, { action: "createClassroom", name: "Forbidden", grade: "1" }, 403);
  const teacher = await action(first.cookie, { action: "switchRole", role: "teacher" }); assert.equal(teacher.data.students.length, 7);
  await action(first.cookie, { action: "updateStudent", id: second.data.students[0].id, name: "Invasion" }, 404);
  const other = await action(second.cookie, { action: "switchRole", role: "teacher" }); assert.notDeepEqual(other.data.classrooms.map((x) => x.id), teacher.data.classrooms.map((x) => x.id));
});
test("scores are recomputed; submissions are idempotent and XP cannot be farmed", async () => {
  const session = await start(), activity = activities[2], submissionId = crypto.randomUUID();
  const payload = { action: "submit", submissionId, activityId: activity.id, answers: answerAll(activity), durationSeconds: 31, score: 999, xpEarned: 999999 };
  const first = await action(session.cookie, payload); assert.equal(first.submission.score, 100); assert.equal(first.submission.xpEarned, activity.xp);
  const repeat = await action(session.cookie, payload); assert.deepEqual(repeat.submission, first.submission);
  assert.equal(repeat.data.submissions.filter((s) => s.id === submissionId).length, 1);
  const retry = await action(session.cookie, { ...payload, submissionId: crypto.randomUUID() }); assert.equal(retry.submission.xpEarned, 0);
  const changed = { ...payload, answers: { ...payload.answers, [activity.questions[0].id]: activity.questions[0].options.find((o) => o !== activity.questions[0].answer) } };
  await action(session.cookie, changed, 409);
  const wrong = await action(session.cookie, { ...changed, submissionId: crypto.randomUUID() }); assert.equal(wrong.submission.score, 80); assert.equal(wrong.submission.xpEarned, 0);
});
test("locked worlds and unauthorized student IDs are rejected", async () => {
  const session = await start(), last = activities.at(-1);
  await action(session.cookie, { action: "submit", submissionId: crypto.randomUUID(), activityId: last.id, answers: answerAll(last), durationSeconds: 40 }, 403);
  await action(session.cookie, { action: "submit", submissionId: crypto.randomUUID(), studentId: crypto.randomUUID(), activityId: activities[0].id, answers: answerAll(activities[0]), durationSeconds: 40 }, 403);
});
test("registration is empty, passwords are salted hashes and actual roles cannot switch", async () => {
  const session = await start(), registered = await action(session.cookie, { action: "register", name: "Admin", email: "admin@example.test", password: "Senha-segura-2026", institutionName: "Escola Real" });
  assert.equal(registered.data.session.isDemo, false); assert.equal(registered.data.session.role, "admin"); assert.equal(registered.data.students.length, 0);
  await action(registered.cookie, { action: "switchRole", role: "teacher" }, 403);
  const stored = sqlite.prepare("SELECT password_hash FROM users WHERE email=?").get("admin@example.test").password_hash;
  assert.ok(stored.startsWith("pbkdf2-sha256$")); assert.ok(!stored.includes("Senha"));
  assert.equal(await verifyPassword("Senha-segura-2026", stored), true); assert.equal(await verifyPassword("errada", stored), false);
  const one = await hashPassword("Senha-segura-2026"), two = await hashPassword("Senha-segura-2026"); assert.notEqual(one, two);
  await action(registered.cookie, { action: "login", email: "admin@example.test", password: "errada" }, 401);
  const logged = await action(registered.cookie, { action: "login", email: "admin@example.test", password: "Senha-segura-2026" }); assert.equal(logged.data.session.institutionName, "Escola Real");
});
test("student code only grants student access to its own profile", async () => {
  const session = await start(); const teacher = await action(session.cookie, { action: "switchRole", role: "teacher" });
  const created = await action(session.cookie, { action: "createStudent", name: "Novo aluno", classroomId: teacher.data.classrooms[0].id }); assert.equal(created.accessCode.length, 12);
  const login = await action(session.cookie, { action: "studentLogin", code: created.accessCode });
  assert.equal(login.data.session.role, "student"); assert.equal(login.data.students.length, 1); assert.equal(login.data.students[0].name, "Novo aluno");
  await action(login.cookie, { action: "createClassroom", name: "Invalid", grade: "2" }, 403);
});
test("cross-origin writes are rejected", async () => {
  const session = await start(), response = await POST(new Request("https://letria.test/api/platform", { method: "POST", headers: { cookie: session.cookie, "Content-Type": "application/json", Origin: "https://evil.test" }, body: JSON.stringify({ action: "switchRole", role: "admin" }) }));
  assert.equal(response.status, 403);
});
test("private audio requires guardian consent and revocation removes file", async () => {
  const session = await start(), studentId = session.data.students[0].id;
  function request() { const form = new FormData(); const bytes = new Uint8Array(64); bytes.set([0x1a, 0x45, 0xdf, 0xa3]); form.set("file", new File([bytes], "leitura.webm", { type: "audio/webm" })); form.set("studentId", studentId); form.set("activityId", activities[0].id); return new Request("https://letria.test/api/audio", { method: "POST", headers: { cookie: session.cookie, Origin: "https://letria.test" }, body: form }); }
  assert.equal((await upload(request())).status, 403);
  await action(session.cookie, { action: "setConsent", studentId, consent: true }, 403);
  await action(session.cookie, { action: "switchRole", role: "guardian" }); await action(session.cookie, { action: "setConsent", studentId, consent: true });
  await action(session.cookie, { action: "switchRole", role: "student" });
  const saved = await upload(request()), result = await saved.json(); assert.equal(saved.status, 200, JSON.stringify(result)); assert.equal(objects.size, 1);
  const stranger = await start(); assert.equal((await download(new Request("https://letria.test/api/audio?id=" + result.recordingId, { headers: { cookie: stranger.cookie } }))).status, 404);
  await action(session.cookie, { action: "switchRole", role: "guardian" }); const revoked = await action(session.cookie, { action: "setConsent", studentId, consent: false }); assert.equal(revoked.data.recordings.length, 0); assert.equal(objects.size, 0);
});
test("classroom deletion preserves student learning history", async () => {
  const session = await start(), teacher = await action(session.cookie, { action: "switchRole", role: "teacher" });
  const count = teacher.data.submissions.length;
  await action(session.cookie, { action: "deleteClassroom", id: teacher.data.classrooms[0].id }); const deleted = await action(session.cookie, { action: "switchRole", role: "admin" });
  assert.equal(deleted.data.classrooms.length, 0); assert.equal(deleted.data.students.length, 7); assert.equal(deleted.data.submissions.length, count); assert.equal(deleted.data.students[0].classroomId, null);
});

test("published versions remain available during edits and grading uses requested snapshot", async () => {
  const session = await start(); await action(session.cookie, { action: "switchRole", role: "teacher" });
  const activity = { title: "Atividade original", worldId: 1, questions: [{ id: "q1", type: "choice", prompt: "Qual letra?", options: ["A", "B"], answer: "A", explanation: "A" }] };
  const draft = await action(session.cookie, { action: "saveActivity", activity }); const id = draft.data.customActivities[0].id;
  await action(session.cookie, { action: "publishActivity", id });
  await action(session.cookie, { action: "saveActivity", activity: { ...activity, id, title: "Nova versão", questions: [{ ...activity.questions[0], answer: "B" }] } });
  const student = await action(session.cookie, { action: "switchRole", role: "student" });
  assert.equal(student.data.customActivities[0].title, "Atividade original"); assert.equal(student.data.customActivities[0].version, 1);
  await action(session.cookie, { action: "switchRole", role: "teacher" }); await action(session.cookie, { action: "publishActivity", id });
  await action(session.cookie, { action: "switchRole", role: "student" });
  const saved = await action(session.cookie, { action: "submit", submissionId: crypto.randomUUID(), activityId: id, activityVersion: 1, answers: { q1: "A" }, durationSeconds: 4 });
  assert.equal(saved.submission.score, 100); assert.equal(saved.submission.activityVersion, 1);
  const latest = await action(session.cookie, { action: "submit", submissionId: crypto.randomUUID(), activityId: id, activityVersion: 2, answers: { q1: "A" }, durationSeconds: 4 });
  assert.equal(latest.submission.score, 0); assert.equal(latest.submission.activityVersion, 2);
});
test("explicit free practice is allowed without changing journey prerequisites", async () => {
  const { deriveStudentProgress, getWorldStatus } = await import("../lib/pedagogy.ts");
  const session = await start(), last = activities.at(-1);
  const result = await action(session.cookie, { action: "submit", submissionId: crypto.randomUUID(), activityId: last.id, practice: true, answers: answerAll(last), durationSeconds: 30 });
  assert.equal(result.submission.score, 100);
  assert.equal(getWorldStatus(deriveStudentProgress(result.data.submissions), 5).unlocked, false);
});
test("teachers can only read and mutate their assigned classrooms; admin can transfer ownership", async () => {
  const school = await action("", { action: "register", name: "Gestão", email: "gestao@example.test", password: "Senha-administrador", institutionName: "Escola de vínculos" });
  const admin = school.cookie;
  await action(admin, { action: "createUser", name: "Ana professora", email: "ana@example.test", password: "Senha-professora", role: "teacher" });
  const staff = await action(admin, { action: "createUser", name: "Beto professor", email: "beto@example.test", password: "Senha-professor", role: "teacher" });
  const anaId = staff.data.staff.find((s) => s.email === "ana@example.test").id, betoId = staff.data.staff.find((s) => s.email === "beto@example.test").id;
  assert.ok(staff.data.staff.every((s) => !("passwordHash" in s) && !("password_hash" in s)));
  const anaClassData = await action(admin, { action: "createClassroom", name: "Turma Ana", grade: "2º ano", teacherUserId: anaId });
  const classA = anaClassData.data.classrooms.find((c) => c.name === "Turma Ana").id;
  const betoClassData = await action(admin, { action: "createClassroom", name: "Turma Beto", grade: "2º ano", teacherUserId: betoId });
  const classB = betoClassData.data.classrooms.find((c) => c.name === "Turma Beto").id;
  const emptyData = await action(admin, { action: "createClassroom", name: "Sem vínculo", grade: "2º ano" });
  const unassigned = emptyData.data.classrooms.find((c) => c.name === "Sem vínculo").id;
  const studentAData = await action(admin, { action: "createStudent", name: "Aluno da Ana", classroomId: classA });
  const studentA = studentAData.data.students.find((s) => s.name === "Aluno da Ana").id;
  const studentBData = await action(admin, { action: "createStudent", name: "Aluno do Beto", classroomId: classB });
  const studentB = studentBData.data.students.find((s) => s.name === "Aluno do Beto").id;
  await action(admin, { action: "createStudent", name: "Aluno sem vínculo", classroomId: unassigned });
  for (const studentId of [studentA, studentB]) {
    await action(admin, { action: "submit", studentId, submissionId: crypto.randomUUID(), activityId: activities[0].id, answers: answerAll(activities[0]), durationSeconds: 20 });
    await action(admin, { action: "addNote", studentId, text: "Orientação privada para " + studentId, type: "intervention" });
  }
  const assignedB = await action(admin, { action: "assignActivity", classroomId: classB, activityId: activities[0].id, dueDate: "2026-12-31" });
  const assignmentB = assignedB.data.assignments.find((a) => a.classroomId === classB).id, noteB = assignedB.data.notes.find((n) => n.studentId === studentB).id;
  await action(admin, { action: "setConsent", studentId: studentB, consent: true });
  const form = new FormData(), bytes = new Uint8Array(64); bytes.set([0x1a,0x45,0xdf,0xa3]);
  form.set("file", new File([bytes], "private.webm", { type: "audio/webm" })); form.set("studentId", studentB); form.set("activityId", activities[0].id);
  const saved = await upload(new Request("https://letria.test/api/audio", { method: "POST", headers: { cookie: admin, Origin: "https://letria.test" }, body: form }));
  assert.equal(saved.status, 200); const recordingId = (await saved.json()).recordingId;
  const ana = await action("", { action: "login", email: "ana@example.test", password: "Senha-professora" });
  const beto = await action("", { action: "login", email: "beto@example.test", password: "Senha-professor" });
  assert.deepEqual(ana.data.classrooms.map((c) => c.id), [classA]); assert.deepEqual(ana.data.students.map((s) => s.id), [studentA]);
  assert.equal(ana.data.submissions.length, 1); assert.equal(ana.data.notes.length, 1); assert.equal(ana.data.recordings.length, 0); assert.equal(ana.data.staff.length, 0); assert.equal(ana.data.assignments.length, 0);
  assert.equal(beto.data.recordings.length, 1);
  for (const payload of [
    { action: "createStudent", name: "Invasão", classroomId: classB },
    { action: "updateStudent", id: studentB, name: "Invasão" },
    { action: "updateStudent", id: studentA, name: "Transferência", classroomId: classB },
    { action: "deleteStudent", id: studentB },
    { action: "resetStudentCode", studentId: studentB },
    { action: "updateClassroom", id: classB, name: "Invasão", grade: "1º ano" },
    { action: "updateClassroom", id: classA, name: "Turma Ana", grade: "2º ano", teacherUserId: betoId },
    { action: "deleteClassroom", id: classB },
    { action: "addNote", studentId: studentB, text: "Invasão" },
    { action: "deleteNote", id: noteB },
    { action: "assignActivity", classroomId: classB, activityId: activities[0].id, dueDate: "2026-12-31" },
    { action: "deleteAssignment", id: assignmentB },
    { action: "deleteRecording", id: recordingId },
    { action: "submit", studentId: studentB, submissionId: crypto.randomUUID(), activityId: activities[0].id, answers: answerAll(activities[0]), durationSeconds: 20 }
  ]) await action(ana.cookie, payload, 403);
  await action(ana.cookie, { action: "createStudent", name: "Sem turma" }, 400);
  assert.equal((await download(new Request("https://letria.test/api/audio?id=" + recordingId, { headers: { cookie: ana.cookie } }))).status, 403);
  assert.equal((await download(new Request("https://letria.test/api/audio?id=" + recordingId, { headers: { cookie: beto.cookie } }))).status, 200);
  await action(ana.cookie, { action: "readNotifications" });
  assert.equal(sqlite.prepare("SELECT read FROM notifications WHERE student_id=?").get(studentB).read, 0);
  const own = await action(ana.cookie, { action: "createClassroom", name: "Nova turma da Ana", grade: "1º ano" });
  assert.equal(own.data.classrooms.find((c) => c.name === "Nova turma da Ana").teacherUserId, anaId);
  await action(admin, { action: "updateClassroom", id: classA, name: "Turma transferida", grade: "2º ano", teacherUserId: betoId });
  const refreshedAna = await action(ana.cookie, { action: "saveSettings", sound: false });
  assert.equal(refreshedAna.data.students.length, 0); assert.equal(refreshedAna.data.submissions.length, 0); assert.equal(refreshedAna.data.notes.length, 0);
  await action(ana.cookie, { action: "resetStudentCode", studentId: studentA }, 403);
  const refreshedBeto = await action(beto.cookie, { action: "saveSettings", sound: false });
  assert.equal(refreshedBeto.data.students.length, 2); assert.equal(refreshedBeto.data.submissions.length, 2);
  await action(admin, { action: "updateClassroom", id: classB, name: "Turma sem responsável", grade: "2º ano", teacherUserId: null });
  await action(beto.cookie, { action: "addNote", studentId: studentB, text: "Sem vínculo" }, 403);
});
