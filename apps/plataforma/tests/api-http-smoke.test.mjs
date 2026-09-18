import test from "node:test";
import assert from "node:assert/strict";
import { testOrigin as base } from "./helpers/test-origin.mjs";
test("real HTTP: durable SQL, school workflow, private R2, access control, idempotency", { timeout: 60_000 }, async () => {
  let cookie = "";
  async function request(action, expected = 200) {
    const response = await fetch(base + "/api/platform" + (!action && !cookie ? "?demo=1" : ""), action ? { method: "POST", headers: { cookie, "Content-Type": "application/json", Origin: base }, body: JSON.stringify(action) } : { headers: { cookie } });
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

test("real HTTP: Lumi exposes public provider status and safe local hints", async () => {
  assert.equal((await fetch(base + '/api/tutor')).status, 401);
  const sessionResponse = await fetch(base + '/api/platform?demo=1');
  assert.equal(sessionResponse.status, 200);
  const cookie = sessionResponse.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const status = await fetch(base + '/api/tutor', { headers: { cookie } });
  assert.equal(status.status, 200);
  assert.match(status.headers.get('cache-control'), /no-store/);
  const configuration = await status.json();
  assert.deepEqual(Object.keys(configuration).sort(), ['mode', 'ok', 'provider']);
  assert.equal(configuration.ok, true);
  assert.ok(['local', 'ai'].includes(configuration.mode));
  assert.doesNotMatch(JSON.stringify(configuration), /api[_-]?key|authorization|bearer|reasoning|<think>/i);
  if (configuration.mode === 'ai') {
    assert.ok(['deepseek', 'openai'].includes(configuration.provider));
    return; // Status is safe to inspect; never call a paid provider from smoke tests.
  }
  assert.equal(configuration.provider, 'local');
  const response = await fetch(base + '/api/tutor', {
    method: 'POST', headers: { cookie, Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Como avanço na trilha?' }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const result = await response.json();
  assert.deepEqual(Object.keys(result).sort(), ['mode', 'ok', 'provider', 'reason', 'reply']);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'local');
  assert.equal(result.provider, 'local');
  assert.equal(result.reason, 'unconfigured');
  assert.match(result.reply, /território/);
  assert.doesNotMatch(JSON.stringify(result), /api[_-]?key|authorization|bearer|reasoning|<think>/i);
  assert.ok(!JSON.stringify(result).includes(cookie), 'The session cookie stays outside the tutor response');
});


test("real HTTP: speech configuration is private and unconfigured speech stays local", async () => {
  assert.equal((await fetch(base + "/api/speech")).status, 401);
  const session = await fetch(base + "/api/platform?demo=1");
  const cookie = session.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const response = await fetch(base + "/api/speech", { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const status = await response.json();
  assert.ok(["neural", "browser"].includes(status.mode));
  if (status.mode === "neural") return; // Never generate paid audio in smoke tests.
  const audio = await fetch(base + "/api/speech", {
    method: "POST", headers: { cookie, Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Oi! Eu sou a Lumi." }),
  });
  assert.equal(audio.status, 503);
  assert.equal((await audio.json()).code, "VOICE_UNAVAILABLE");
});


test("real HTTP: Dora generates audible local WAV through the authenticated app", { timeout: 90000 }, async t => {
  const session = await fetch(base + "/api/platform?demo=1");
  const cookie = session.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const capabilities = await fetch(base + "/api/speech", { headers: { cookie } });
  assert.equal(capabilities.status, 200);
  const config = await capabilities.json();
  if (config.provider !== "kokoro") return t.skip("Dora local is not selected or ready");
  assert.equal(config.mode, "neural");
  const lengths = {};
  for (const options of [{ profile: "reading", pace: "natural" }, { profile: "conversation", pace: "natural" }, { profile: "conversation", pace: "calm" }]) {
    const response = await fetch(base + "/api/speech", {
      method: "POST", headers: { cookie, Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Oi! Eu sou a Lumi. Vamos ler as vogais: A, E, I, O, U. Pode ir com calma. Eu vou acompanhar você.", ...options }),
      signal: AbortSignal.timeout(65000),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "audio/wav");
    assert.equal(response.headers.get("x-speech-provider"), "kokoro");
    assert.match(response.headers.get("cache-control"), /no-store/);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WAVE");
    assert.equal(bytes.readUInt32LE(24), 24000);
    assert.equal(bytes.readUInt16LE(22), 1);
    assert.equal(bytes.readUInt16LE(34), 16);
    assert.ok(bytes.length > 48000, "More than one second of speech was generated");
    let peak = 0;
    for (let index = 44; index + 1 < bytes.length; index += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(index)));
    assert.ok(peak > 500, "Speech output is not silent");
    lengths[options.profile + ":" + options.pace] = bytes.length;
  }
  assert.ok(lengths["conversation:calm"] > lengths["conversation:natural"] * 1.02, "The calmer voice is actually slower; cached audio must not ignore the pace");
});


test("real HTTP: expanded teacher bank assigns multi-select and pairs and records learner results", async () => {
  let cookie = "";
  async function request(action) {
    const response = await fetch(base + "/api/platform" + (!action && !cookie ? "?demo=1" : ""), action ? {
      method: "POST", headers: { cookie, "Content-Type": "application/json", Origin: base }, body: JSON.stringify(action),
    } : {});
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    cookie = response.headers.get("set-cookie")?.split(";")[0] || cookie;
    return body;
  }
  const initial = await request();
  const studentId = initial.data.session.studentId;
  const teacher = await request({ action: "switchRole", role: "teacher" });
  const classroomId = teacher.data.students.find(student => student.id === studentId).classroomId;
  const missions = [
    { id: "bank-logica-filtros", answers: [
      ["JACARÉ", "TUCANO"], ["Azul, redondo e grande", "Azul, redondo e pequeno"], ["6", "4"],
      ["Juntar os livros da mesma cor", "Separar os livros pela cor da capa"],
    ] },
    { id: "bank-logica-comandos", answers: [
      ["Ir para cima", "Ir para a direita", "Ir para baixo"],
      ["Começar o movimento", "Fazer a ação outra vez", "Encerrar o movimento"],
      ["Dar um nome ao cartaz", "Representar a ideia com um desenho", "Mostrar o cartaz para a turma"],
      ["Acender a lanterna", "Regar a terra", "Colorir o desenho"],
    ] },
  ];
  for (const mission of missions) await request({ action: "assignActivity", classroomId, activityId: mission.id, dueDate: "2026-12-31" });
  const learner = await request({ action: "switchRole", role: "student" });
  for (const mission of missions) {
    assert.ok(learner.data.assignments.some(assignment => assignment.activityId === mission.id));
    const result = await request({ action: "submit", activityId: mission.id, activityVersion: 1, submissionId: crypto.randomUUID(), durationSeconds: 30,
      answers: Object.fromEntries(mission.answers.map((answer, index) => [mission.id + "-q" + (index + 1), answer])),
    });
    assert.equal(result.submission.score, 100);
    assert.equal(result.submission.xpEarned, 40);
  }
  const report = await request({ action: "switchRole", role: "teacher" });
  for (const mission of missions) assert.ok(report.data.submissions.some(row => row.studentId === studentId && row.activityId === mission.id && row.score === 100));
});


test('real HTTP: session inspection is read-only, demos are explicit and logout requires a new sign-in', async () => {
  const anonymous = await fetch(base + '/api/session');
  assert.equal(anonymous.status, 200);
  assert.deepEqual(await anonymous.json(), { ok: true, session: null });
  assert.equal(anonymous.headers.get('set-cookie'), null);
  assert.match(anonymous.headers.get('cache-control'), /no-store/);
  const initialAccess = await fetch(base + '/api/platform');
  assert.equal(initialAccess.status, 401);
  assert.equal((await initialAccess.json()).code, 'UNAUTHENTICATED');
  const demo = await fetch(base + '/api/platform?demo=1');
  assert.equal(demo.status, 200);
  const cookie = demo.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const expected = (await demo.json()).data.session;
  const status = await fetch(base + '/api/session', { headers: { cookie } });
  assert.deepEqual(await status.json(), { ok: true, session: expected });
  assert.equal(status.headers.get('set-cookie'), null);
  const preserved = await fetch(base + '/api/platform?demo=1', { headers: { cookie } });
  assert.equal(preserved.status, 200);
  assert.deepEqual((await preserved.json()).data.session, expected);
  assert.equal(preserved.headers.get('set-cookie'), null);
  const logout = await fetch(base + '/api/platform', { method: 'POST', headers: { cookie, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
  assert.equal(logout.status, 200);
  assert.deepEqual(await logout.json(), { ok: true });
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.deepEqual(await (await fetch(base + '/api/session', { headers: { cookie } })).json(), { ok: true, session: null });
  const revoked = await fetch(base + '/api/platform', { headers: { cookie } });
  assert.equal(revoked.status, 401);
  assert.equal(revoked.headers.get('set-cookie'), null);
});


test('real HTTP: a fictitious school registers and signs in by email with session revocation', { timeout: 90000 }, async () => {
  const marker = crypto.randomUUID();
  const email = 'http-login-' + marker + '@example.invalid';
  const password = 'Ficticia-' + crypto.randomUUID();
  const institutionName = 'Escola fictícia HTTP ' + marker;
  const post = (action, cookie = '') => fetch(base + '/api/platform', {
    method: 'POST', headers: { cookie, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(action),
  });
  const registration = await post({ action: 'register', name: 'Admin fictício HTTP', email, password, institutionName });
  assert.equal(registration.status, 200);
  const registered = await registration.json();
  assert.equal(registered.ok, true);
  assert.equal(registered.data.session.role, 'admin');
  assert.equal(registered.data.session.isDemo, false);
  assert.equal(registered.data.session.institutionName, institutionName);
  assert.equal(registered.data.students.length, 0);
  const userId = registered.data.session.userId;
  const registrationCookie = registration.headers.get('set-cookie')?.split(';')[0];
  assert.ok(registrationCookie, 'Registration creates a session');
  const signedOut = await post({ action: 'logout' }, registrationCookie);
  assert.equal(signedOut.status, 200);
  assert.deepEqual(await signedOut.json(), { ok: true });
  assert.match(signedOut.headers.get('set-cookie'), /Max-Age=0/);
  assert.deepEqual(await (await fetch(base + '/api/session', { headers: { cookie: registrationCookie } })).json(), { ok: true, session: null });

  const denied = await post({ action: 'login', email, password: 'Senha-incorreta-ficticia' });
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get('set-cookie'), null);
  const invalid = await denied.json();
  assert.equal(invalid.code, 'INVALID_CREDENTIALS');
  assert.equal(invalid.data, undefined);
  assert.deepEqual(await (await fetch(base + '/api/session')).json(), { ok: true, session: null });

  const login = await post({ action: 'login', email, password });
  assert.equal(login.status, 200);
  const logged = await login.json();
  assert.equal(logged.data.session.userId, userId);
  assert.equal(logged.data.session.role, 'admin');
  assert.equal(logged.data.session.isDemo, false);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie && cookie !== registrationCookie, 'Signing in issues a fresh session');
  const status = await fetch(base + '/api/session', { headers: { cookie } });
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { ok: true, session: logged.data.session });
  const logout = await post({ action: 'logout' }, cookie);
  assert.equal(logout.status, 200);
  assert.deepEqual(await logout.json(), { ok: true });
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.deepEqual(await (await fetch(base + '/api/session', { headers: { cookie } })).json(), { ok: true, session: null });
  const revoked = await fetch(base + '/api/platform', { headers: { cookie } });
  assert.equal(revoked.status, 401);
  assert.equal((await revoked.json()).code, 'UNAUTHENTICATED');
});

test('real HTTP: Qwen generates audible Lumi WAV and reuses identical cached audio', { timeout: 190000 }, async t => {
  const session = await fetch(base + '/api/platform?demo=1');
  assert.equal(session.status, 200);
  const cookie = session.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  await session.body?.cancel();
  const capabilities = await fetch(base + '/api/speech', { headers: { cookie } });
  assert.equal(capabilities.status, 200);
  assert.match(capabilities.headers.get('cache-control'), /no-store/);
  const configuration = await capabilities.json();
  if (configuration.provider !== 'qwen' && configuration.preferredProvider !== 'qwen') {
    return t.skip('Qwen is not the selected provider');
  }
  assert.deepEqual(configuration, { ok: true, mode: 'neural', provider: 'qwen', voice: 'Lumi' });

  const body = JSON.stringify({
    text: 'Olá! Eu sou a Lumi. Vamos descobrir juntos uma ilha de ideias!',
    profile: 'conversation', pace: 'natural',
  });
  const signal = AbortSignal.any([t.signal, AbortSignal.timeout(185000)]);
  async function generate() {
    const response = await fetch(base + '/api/speech', {
      method: 'POST', headers: { cookie, Origin: base, 'Content-Type': 'application/json' },
      body, signal, cache: 'no-store',
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/wav');
    assert.equal(response.headers.get('x-speech-provider'), 'qwen');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(Number(response.headers.get('content-length')), bytes.length);
    assert.ok(bytes.length >= 44 && bytes.length <= 5 * 1024 * 1024);
    return bytes;
  }
  const firstStarted = performance.now();
  const bytes = await generate();
  const firstMilliseconds = performance.now() - firstStarted;
  t.diagnostic('Qwen first POST: ' + firstMilliseconds.toFixed(0) + ' ms');
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
  let format, samples;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    assert.ok(start + length <= bytes.length, 'Every WAV chunk fits in the response');
    if (id === 'fmt ') format = bytes.subarray(start, start + length);
    if (id === 'data') samples = bytes.subarray(start, start + length);
    offset = start + length + (length % 2);
  }
  assert.ok(format?.length >= 16, 'The WAV includes a complete format chunk');
  assert.equal(format.readUInt16LE(0), 1, 'Uncompressed PCM');
  assert.equal(format.readUInt16LE(2), 1, 'Mono');
  assert.equal(format.readUInt32LE(4), 24000, '24 kHz');
  assert.equal(format.readUInt32LE(8), 48000, 'PCM byte rate');
  assert.equal(format.readUInt16LE(12), 2, 'PCM block alignment');
  assert.equal(format.readUInt16LE(14), 16, '16-bit samples');
  assert.ok(samples && samples.length % 2 === 0, 'The WAV contains aligned PCM samples');
  const seconds = samples.length / 48000;
  assert.ok(seconds > 1 && seconds <= 90, 'The short narration is between one and 90 seconds');
  let peak = 0;
  for (let offset = 0; offset < samples.length; offset += 2) {
    peak = Math.max(peak, Math.abs(samples.readInt16LE(offset)));
  }
  assert.ok(peak > 500, 'The generated narration is not silent');
  const repeatedStarted = performance.now();
  const repeated = await generate();
  const repeatedMilliseconds = performance.now() - repeatedStarted;
  t.diagnostic('Qwen repeated POST (cached): ' + repeatedMilliseconds.toFixed(0) + ' ms; audio: ' + seconds.toFixed(2) + ' s');
  assert.ok(repeated.equals(bytes), 'Repeating the same text and style returns the identical cached WAV');
});


test('real HTTP: Qwen cancellation releases the next Lumi greeting', { timeout: 195000 }, async t => {
  const session = await fetch(base + '/api/platform?demo=1');
  const cookie = session.headers.get('set-cookie')?.split(';')[0];
  assert.equal(session.status, 200);
  assert.ok(cookie);
  const config = await (await fetch(base + '/api/speech', { headers: { cookie } })).json();
  if (config.provider !== 'qwen' && config.preferredProvider !== 'qwen') return t.skip('Qwen is not selected');
  assert.equal(config.provider, 'qwen');
  const headers = { cookie, Origin: base, 'Content-Type': 'application/json' };
  const requestId = crypto.randomUUID();
  const abort = new AbortController();
  let settled = false;
  const previous = fetch(base + '/api/speech', {
    method: 'POST', headers, signal: abort.signal,
    body: JSON.stringify({ text: 'Vamos descobrir os sons da missão ' + Date.now() + '.', profile: 'conversation', pace: 'natural', requestId }),
  }).then(async response => ({ status: response.status, bytes: (await response.arrayBuffer()).byteLength }))
    .catch(error => ({ cancelled: error.name })).finally(() => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 3000));
  const wasPending = !settled;
  abort.abort();
  const cancelled = fetch(base + '/api/speech', {
    method: 'DELETE', headers, body: JSON.stringify({ requestId }), signal: AbortSignal.timeout(10000),
  }).then(async response => ({ status: response.status, body: await response.json() }));
  const started = performance.now();
  const next = fetch(base + '/api/speech', {
    method: 'POST', headers, signal: AbortSignal.timeout(185000),
    body: JSON.stringify({ text: 'Oi! Eu sou a Lumi, sua corujinha guia. Qual pedacinho deste desafio você quer entender?', profile: 'conversation', pace: 'natural', requestId: crypto.randomUUID() }),
  });
  const [cancellation, response] = await Promise.all([cancelled, next]);
  assert.equal(cancellation.status, 200);
  assert.deepEqual(cancellation.body, { ok: true });
  assert.ok(wasPending, 'The previous voice was still being prepared when cancelled');
  assert.deepEqual(await previous, { cancelled: 'AbortError' });
  assert.equal(response.status, 200, 'The next voice must succeed without a busy retry');
  assert.equal(response.headers.get('x-speech-provider'), 'qwen');
  assert.equal(response.headers.get('content-type'), 'audio/wav');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.ok(bytes.length > 48000);
  t.diagnostic('Explicit cancellation accepted; next complete Lumi greeting received in ' + ((performance.now() - started) / 1000).toFixed(2) + ' s.');
});
