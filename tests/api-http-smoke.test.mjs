import test from "node:test";
import assert from "node:assert/strict";
import { testOrigin as base } from "./helpers/test-origin.mjs";
test("real HTTP: durable D1, school workflow, private R2, access control, idempotency", { timeout: 60_000 }, async () => {
  let cookie = "";
  async function request(action, expected = 200) {
    const response = await fetch(base + "/api/platform", action ? { method: "POST", headers: { cookie, "Content-Type": "application/json", Origin: base }, body: JSON.stringify(action) } : { headers: { cookie } });
    const body = await response.json();
    assert.equal(response.status, expected, JSON.stringify(body));
    const nextCookie = response.headers.get("set-cookie"); if (nextCookie) cookie = nextCookie.split(";")[0];
    return body;
  }
  const initial = await request(); assert.equal(initial.data.students[0].name, "Lia");
  const persisted = await request(); assert.equal(initial.data.session.institutionId, persisted.data.session.institutionId);
  await request({ action: "createClassroom", name: "Forbidden", grade: "2º ano" }, 403);
  const teacher = await request({ action: "switchRole", role: "teacher" }); assert.equal(teacher.data.students.length, 7);
  const classData = await request({ action: "createClassroom", name: "Turma de teste HTTP", grade: "1º ano" }); const classroom = classData.data.classrooms.find((c) => c.name === "Turma de teste HTTP"); assert.ok(classroom);
  const created = await request({ action: "createStudent", name: "Estudante fictício HTTP", classroomId: classroom.id }); assert.equal(created.accessCode.length, 12);
  const student = created.data.students.find((s) => s.name === "Estudante fictício HTTP");
  const draft = await request({ action: "saveActivity", activity: { title: "Atividade HTTP", worldId: 1, questions: [{ id: "q1", type: "choice", prompt: "A primeira letra de AMOR é?", options: ["A", "B"], answer: "A", explanation: "AMOR começa com A." }] } });
  const activity = draft.data.customActivities.find((a) => a.title === "Atividade HTTP");
  await request({ action: "publishActivity", id: activity.id });
  await request({ action: "assignActivity", classroomId: classroom.id, activityId: activity.id, dueDate: "2026-12-31" });
  await request({ action: "addNote", studentId: student.id, text: "Observação fictícia de teste HTTP.", type: "intervention" });
  const logged = await request({ action: "studentLogin", code: created.accessCode }); assert.equal(logged.data.students.length, 1); assert.equal(logged.data.students[0].id, student.id); assert.equal(logged.data.assignments.length, 1);
  const body = { action: "submit", activityId: activity.id, activityVersion: 1, submissionId: crypto.randomUUID(), answers: { q1: "A" }, durationSeconds: 12 };
  const result = await request(body); assert.equal(result.submission.score, 100); assert.equal(result.submission.xpEarned, 50);
  const duplicate = await request(body); assert.equal(duplicate.data.submissions.length, 1);
  const retry = await request({ ...body, submissionId: crypto.randomUUID() }); assert.equal(retry.submission.xpEarned, 0);
  await request({ action: "switchRole", role: "guardian" }); await request({ action: "setConsent", studentId: student.id, consent: true });
  await request({ action: "switchRole", role: "student" });
  const form = new FormData(), audio = new Uint8Array(64); audio.set([0x1a, 0x45, 0xdf, 0xa3]); form.set("file", new File([audio], "test.webm", { type: "audio/webm" })); form.set("studentId", student.id); form.set("activityId", activity.id);
  const uploaded = await fetch(base + "/api/audio", { method: "POST", headers: { cookie, Origin: base }, body: form }); const recording = await uploaded.json(); assert.equal(uploaded.status, 200, JSON.stringify(recording));
  const downloaded = await fetch(base + "/api/audio?id=" + recording.recordingId, { headers: { cookie } }); assert.equal(downloaded.status, 200); assert.equal((await downloaded.arrayBuffer()).byteLength, 64);
  const unauthenticated = await fetch(base + "/api/audio?id=" + recording.recordingId); assert.equal(unauthenticated.status, 401);
  await request({ action: "switchRole", role: "guardian" }); const revoked = await request({ action: "setConsent", studentId: student.id, consent: false }); assert.equal(revoked.data.recordings.length, 0);
  console.log("Validated institution", initial.data.session.institutionId, "with isolated fictitious test data.");
});
