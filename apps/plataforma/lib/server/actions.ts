import { activities as catalog, diagnosticQuestions, type Question } from "@/lib/content";
import { deriveStudentProgress, canStartActivity, scoreActivity, evaluateAnswer } from "@/lib/pedagogy";
import type { Answers, CustomActivity, Role } from "@/lib/types";
import { ApiError, digest, hashPassword, randomToken, valueEmail, valueId, valuePassword, valueString } from "./security";
import { audit, db, defaults, fetchActivity, notify, now, requireRole, requireStudent, submissionRow, uid, type Auth } from "./platform";
import { deleteAudioObjects } from "./storage";
import { prepareActivitySpeech } from "./prepared-speech";

type Body = Record<string, unknown>;
function obj(value: unknown): Body { if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "Dados inválidos."); return value as Body; }
function integer(value: unknown, min: number, max: number, label: string): number { if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new ApiError(400, label + " inválido."); return value; }
async function classroom(auth: Auth, rawId: unknown) {
  const id = valueId(rawId, "Turma"), row = await db().prepare("SELECT * FROM classrooms WHERE id=? AND institution_id=?").bind(id, auth.institutionId).first();
  if (!row) throw new ApiError(404, "Turma não encontrada.");
  if (auth.role === "teacher" && row.teacher_user_id !== auth.userId) throw new ApiError(403, "Esta turma não está vinculada ao seu perfil.", "FORBIDDEN");
  return row;
}
async function classroomTeacher(auth: Auth, value: unknown, existing?: Record<string, unknown> | null) {
  if (auth.role === "teacher") {
    if (value !== undefined && value !== auth.userId) throw new ApiError(403, "Somente a administração pode alterar o professor responsável.", "FORBIDDEN");
    return { id: auth.userId, name: auth.isDemo ? "Prof. Marina · fictícia" : auth.name };
  }
  const target = value === undefined ? existing?.teacher_user_id : value;
  if (target === undefined || target === null || target === "") return { id: null, name: "Sem professor" };
  const id = valueId(target, "Professor"), row = await db().prepare("SELECT id,name,role FROM users WHERE id=? AND institution_id=?").bind(id, auth.institutionId).first();
  if (!row || (row.role !== "teacher" && !(auth.isDemo && row.id === auth.userId))) throw new ApiError(400, "Selecione um professor cadastrado nesta instituição.");
  return { id: String(row.id), name: auth.isDemo ? "Prof. Marina · fictícia" : String(row.name) };
}
async function scopedRecord(table: "activities" | "assignments" | "notes" | "recordings", auth: Auth, rawId: unknown) {
  const id = valueId(rawId), row = await db().prepare("SELECT * FROM " + table + " WHERE id=? AND institution_id=?").bind(id, auth.institutionId).first();
  if (!row) throw new ApiError(404, "Registro não encontrado.");
  if (table === "assignments") await classroom(auth, row.classroom_id);
  if (table === "notes" || table === "recordings") await requireStudent(auth, row.student_id);
  return row;
}
function answersInput(value: unknown, questions: Question[]): Answers {
  const raw = obj(value), result: Answers = {};
  if (Object.keys(raw).length > questions.length || Object.keys(raw).some(id => !questions.some(q => q.id === id))) throw new ApiError(400, "As respostas não correspondem a esta atividade.");
  for (const q of questions) {
    const answer = raw[q.id];
    if (answer === undefined) continue;
    if (q.type === "choice") {
      if (typeof answer !== "string" || !q.options.includes(answer)) throw new ApiError(400, "Alternativa inválida.");
      result[q.id] = answer;
    } else {
      const available = q.type === "match" ? q.matches ?? [] : q.options;
      if (!Array.isArray(answer) || answer.length > q.options.length || answer.some(item => typeof item !== "string" || !available.includes(item))) throw new ApiError(400, "Seleção inválida para este desafio.");
      const count = (items: unknown[], item: unknown) => items.filter(value => value === item).length;
      if (answer.some(item => count(answer, item) > count(available, item))) throw new ApiError(400, "As respostas não podem repetir uma opção já utilizada.");
      if (q.type === "multi" && new Set(answer).size !== answer.length) throw new ApiError(400, "Selecione cada opção uma única vez.");
      if (q.type === "match" && answer.length !== q.options.length) throw new ApiError(400, "Associe todos os pares antes de enviar.");
      // Canonical order makes multi-select retries independent of the order of clicks.
      result[q.id] = q.type === "multi" ? q.options.filter(option => answer.includes(option)) : answer as string[];
    }
  }
  return result;
}
function scoreQuestions(questions: Question[], answers: Answers) {
  const correct = questions.filter(q => evaluateAnswer(q, answers[q.id])).length;
  return { correct, total: questions.length, score: Math.round(correct / questions.length * 100) };
}
async function submit(auth: Auth, body: Body, diagnostic: boolean) {
  requireRole(auth, ["student", "teacher", "admin"]);
  const student = await requireStudent(auth, body.studentId), studentId = String(student.id), id = valueId(body.submissionId, "Tentativa");
  const activity = diagnostic ? { id: "diagnostic", version: 1, questions: diagnosticQuestions, xp: 0, worldId: 1 } : await fetchActivity(auth, body.activityId, body.activityVersion);
  const answers = answersInput(body.answers, activity.questions), fingerprint = await digest(JSON.stringify({ studentId, activityId: activity.id, activityVersion: activity.version, answers })), duration = integer(body.durationSeconds ?? 0, 0, 7200, "Duração");
  const previous = await db().prepare("SELECT * FROM submissions WHERE id=?").bind(id).first();
  if (previous) { if (previous.institution_id !== auth.institutionId || previous.fingerprint !== fingerprint) throw new ApiError(409, "Este identificador já foi usado em outra tentativa.", "SUBMISSION_CONFLICT"); return { submission: submissionRow(previous) }; }
  if (body.practice !== undefined && typeof body.practice !== "boolean") throw new ApiError(400, "Modo de prática inválido.");
  if (!diagnostic && body.practice !== true && catalog.some((a) => a.id === activity.id)) {
    const history = await db().prepare("SELECT * FROM submissions WHERE student_id=? AND institution_id=? ORDER BY completed_at ASC").bind(studentId, auth.institutionId).all();
    const available = canStartActivity(deriveStudentProgress(history.results.map(submissionRow)), activity.id);
    if (!available) throw new ApiError(403, "Resolva o território anterior para abrir esta etapa.", "WORLD_LOCKED");
  }
  const score = !diagnostic && catalog.some((a) => a.id === activity.id) ? scoreActivity(activity.id, answers) : scoreQuestions(activity.questions, answers);
  const reward = !diagnostic && score.score >= 80 ? activity.xp : 0;
  const stamp = now();
  const statements = [
    db().prepare("INSERT OR IGNORE INTO submissions (id,institution_id,student_id,activity_id,activity_version,score,correct,total,xp_earned,answers,fingerprint,completed_at,duration_seconds,is_diagnostic) VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?,?)").bind(id, auth.institutionId, studentId, activity.id, activity.version, score.score, score.correct, score.total, JSON.stringify(answers), fingerprint, stamp, duration, diagnostic ? 1 : 0)
  ];
  if (reward > 0) statements.push(db().prepare("INSERT OR IGNORE INTO xp_awards (id,student_id,activity_id,submission_id,xp) SELECT ?,student_id,activity_id,id,? FROM submissions WHERE id=? AND fingerprint=? AND institution_id=?").bind(uid(), reward, id, fingerprint, auth.institutionId));
  statements.push(db().prepare("UPDATE submissions SET xp_earned=COALESCE((SELECT xp FROM xp_awards WHERE submission_id=submissions.id),0) WHERE id=? AND fingerprint=? AND institution_id=?").bind(id, fingerprint, auth.institutionId));
  await db().batch(statements);
  const saved = await db().prepare("SELECT * FROM submissions WHERE id=?").bind(id).first();
  if (!saved || saved.fingerprint !== fingerprint || saved.institution_id !== auth.institutionId) throw new ApiError(409, "A tentativa já foi registrada com outros dados.", "SUBMISSION_CONFLICT");
  if (diagnostic) await notify(auth, "Diagnóstico concluído", String(student.name) + " concluiu a avaliação inicial. Veja as habilidades e próximas sugestões.", studentId);
  return { submission: submissionRow(saved) };
}
function cleanActivity(raw: unknown): Omit<CustomActivity, "id" | "createdAt" | "status" | "version"> {
  const a = obj(raw), title = valueString(a.title, "Título", 120), description = a.description ? valueString(a.description, "Descrição", 600) : "";
  const worldId = integer(a.worldId ?? 1, 1, 5, "Mundo"), durationMinutes = integer(a.durationMinutes ?? 4, 1, 30, "Duração"), xp = integer(a.xp ?? 50, 10, 100, "XP");
  if (!Array.isArray(a.questions) || a.questions.length < 1 || a.questions.length > 20) throw new ApiError(400, "Inclua entre 1 e 20 questões.");
  const questionIds = new Set<string>();
  const questions = a.questions.map((rawQuestion, i): Question => {
    const q = obj(rawQuestion);
    if (!["choice", "order", "multi", "match"].includes(String(q.type))) throw new ApiError(400, "Tipo de desafio inválido.");
    const type = q.type as Question["type"];
    const id = q.id ? valueId(q.id, "Questão") : "q-" + (i + 1);
    if (questionIds.has(id)) throw new ApiError(400, "As questões precisam de identificadores diferentes.");
    questionIds.add(id);
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 8) throw new ApiError(400, "Cada questão deve ter entre 2 e 8 opções.");
    const options = q.options.map(option => valueString(option, "Opção", 140));
    if ((type === "multi" || type === "match") && new Set(options).size !== options.length) throw new ApiError(400, "Use opções diferentes em cada posição.");
    let matches: string[] | undefined;
    if (type === "match") {
      if (!Array.isArray(q.matches) || q.matches.length !== options.length) throw new ApiError(400, "Inclua uma correspondência para cada item.");
      matches = q.matches.map(item => valueString(item, "Correspondência", 140));
      if (new Set(matches).size !== matches.length) throw new ApiError(400, "As correspondências precisam ser diferentes.");
    }
    let answer: string | string[];
    if (type === "choice") {
      answer = valueString(q.answer, "Resposta", 140);
      if (!options.includes(answer)) throw new ApiError(400, "A resposta deve estar entre as opções.");
    } else {
      if (!Array.isArray(q.answer) || !q.answer.length || q.answer.length > options.length) throw new ApiError(400, "Informe uma resposta válida para cada desafio.");
      answer = q.answer.map(item => valueString(item, "Resposta", 140));
      if (type === "multi") {
        if (new Set(answer).size !== answer.length || answer.some(item => !options.includes(item))) throw new ApiError(400, "Selecione respostas diferentes que estejam entre as opções.");
        answer = options.filter(option => (answer as string[]).includes(option));
      } else if (JSON.stringify([...answer].sort()) !== JSON.stringify([...(matches ?? options)].sort())) {
        throw new ApiError(400, type === "match" ? "Associe cada correspondência uma única vez." : "A ordem correta deve usar cada opção uma vez.");
      }
    }
    return { id, type, prompt: valueString(q.prompt, "Enunciado", 800), options, answer,
      ...(matches ? { matches } : {}),
      explanation: q.explanation ? valueString(q.explanation, "Explicação", 800) : "Vamos continuar aprendendo!",
      ...(q.stimulus ? { stimulus: valueString(q.stimulus, "Texto de apoio", 2000) } : {}),
      ...(q.audioText ? { audioText: valueString(q.audioText, "Narração", 2000) } : {}),
      ...(q.visual ? { visual: valueString(q.visual, "Ilustração", 20) } : {}) };

  });
  return { title, description, worldId, durationMinutes, xp, skill: a.skill ? valueString(a.skill, "Habilidade", 120) : "Atividade personalizada", type: questions[0].type, questions };
}
export async function dispatch(auth: Auth, body: Body): Promise<Record<string, unknown>> {
  const action = valueString(body.action, "Ação", 40), institution = auth.institutionId, stamp = now();
  if (action === "switchRole") {
    if (!auth.isDemo) throw new ApiError(403, "A troca de perfil está disponível apenas na demonstração.", "FORBIDDEN");
    if (!["student", "teacher", "guardian", "admin"].includes(String(body.role))) throw new ApiError(400, "Perfil inválido.");
    await db().prepare("UPDATE sessions SET role=? WHERE token_hash=?").bind(body.role, auth.tokenHash).run(); return {};
  }
  if (action === "submit" || action === "diagnostic") return submit(auth, body, action === "diagnostic");
  if (action === "saveSettings") {
    const settings = { ...defaults, ...auth.settings };
    if (body.sound !== undefined) { if (typeof body.sound !== "boolean") throw new ApiError(400, "Preferência de som inválida."); settings.sound = body.sound; }
    if (body.reducedMotion !== undefined) { if (typeof body.reducedMotion !== "boolean") throw new ApiError(400, "Preferência de movimento inválida."); settings.reducedMotion = body.reducedMotion; }
    if (body.fontScale !== undefined) { if (typeof body.fontScale !== "number" || ![1, 1.15, 1.3].includes(body.fontScale)) throw new ApiError(400, "Tamanho de texto inválido."); settings.fontScale = body.fontScale; }
    await db().prepare("UPDATE sessions SET settings=? WHERE token_hash=?").bind(JSON.stringify(settings), auth.tokenHash).run(); return {};
  }
  if (action === "readNotifications") {
    const limited = auth.role === "student" || auth.role === "guardian";
    const teacherFilter = " AND (student_id IS NULL OR student_id IN (SELECT id FROM students WHERE classroom_id IN (SELECT id FROM classrooms WHERE teacher_user_id=?)))";
    const filter = limited ? " AND (student_id IS NULL OR student_id=?)" : auth.role === "teacher" ? teacherFilter : "";
    const args = limited ? [institution, auth.studentId] : auth.role === "teacher" ? [institution, auth.userId] : [institution];
    await db().prepare("UPDATE notifications SET read=1 WHERE institution_id=?" + filter).bind(...args).run(); return {};
  }
  if (action === "setConsent") {
    requireRole(auth, ["guardian", "admin"]);
    const student = await requireStudent(auth, body.studentId);
    if (typeof body.consent !== "boolean") throw new ApiError(400, "Consentimento inválido.");
    await db().prepare("UPDATE students SET consent_audio=? WHERE id=? AND institution_id=?").bind(body.consent ? 1 : 0, student.id, institution).run();
    if (!body.consent) {
      const recordings = await db().prepare("SELECT object_key FROM recordings WHERE student_id=? AND institution_id=?").bind(student.id, institution).all();
      await deleteAudioObjects(recordings.results.map((r) => String(r.object_key)));
      await db().prepare("DELETE FROM recordings WHERE student_id=? AND institution_id=?").bind(student.id, institution).run();
    }
    await audit(auth, action, String(student.id) + ":" + body.consent); return {};
  }
  if (action === "deleteRecording") {
    const recording = await scopedRecord("recordings", auth, body.id); await requireStudent(auth, recording.student_id);
    await deleteAudioObjects([String(recording.object_key)]);
    await db().prepare("DELETE FROM recordings WHERE id=? AND institution_id=?").bind(recording.id, institution).run(); await audit(auth, action, String(recording.id)); return {};
  }
  requireRole(auth, ["teacher", "admin"]);
  if (action === "createClassroom" || action === "updateClassroom") {
    const name = valueString(body.name, "Nome da turma", 80), grade = valueString(body.grade, "Ano escolar", 40);
    const existing = action === "updateClassroom" ? await classroom(auth, body.id) : null;
    const teacher = await classroomTeacher(auth, body.teacherUserId, existing);
    if (existing) await db().prepare("UPDATE classrooms SET name=?,grade=?,teacher_name=?,teacher_user_id=? WHERE id=? AND institution_id=?").bind(name, grade, teacher.name, teacher.id, existing.id, institution).run();
    else await db().prepare("INSERT INTO classrooms (id,institution_id,name,grade,teacher_name,teacher_user_id,created_at) VALUES (?,?,?,?,?,?,?)").bind(uid(), institution, name, grade, teacher.name, teacher.id, stamp).run();
    await audit(auth, action, name); return {};
  }
  if (action === "deleteClassroom") { const row = await classroom(auth, body.id); await db().prepare("DELETE FROM classrooms WHERE id=? AND institution_id=?").bind(row.id, institution).run(); await audit(auth, action, String(row.id)); return {}; }
  if (action === "createStudent" || action === "updateStudent") {
    const existing = action === "updateStudent" ? await requireStudent(auth, body.id) : null;
    const classId = body.classroomId === undefined ? existing?.classroom_id : body.classroomId;
    const name = valueString(body.name, "Nome do estudante", 80), classRow = classId ? await classroom(auth, classId) : null;
    if (auth.role === "teacher" && !classRow) throw new ApiError(400, "Selecione uma turma vinculada ao seu perfil.");
    const grade = body.grade ? valueString(body.grade, "Ano escolar", 40) : classRow ? String(classRow.grade) : String(existing?.grade || "2º ano");
    const avatar = body.avatar ? valueString(body.avatar, "Avatar", 20) : String(existing?.avatar || "🦊");
    if (action === "createStudent") {
      const accessCode = randomToken(6).toUpperCase(), id = uid();
      await db().prepare("INSERT INTO students (id,institution_id,classroom_id,name,avatar,grade,code_hash,consent_audio,created_at) VALUES (?,?,?,?,?,?,?,0,?)").bind(id, institution, classRow?.id || null, name, avatar, grade, await digest(accessCode), stamp).run();
      await audit(auth, action, id); return { accessCode };
    }
    const student = existing!;
    await db().prepare("UPDATE students SET name=?,classroom_id=?,avatar=?,grade=? WHERE id=? AND institution_id=?").bind(name, classRow?.id || null, avatar, grade, student.id, institution).run(); await audit(auth, action, String(student.id)); return {};
  }
  if (action === "deleteStudent") {
    const student = await requireStudent(auth, body.id);
    const objects = await db().prepare("SELECT object_key FROM recordings WHERE student_id=? AND institution_id=?").bind(student.id, institution).all();
    await deleteAudioObjects(objects.results.map((r) => String(r.object_key)));
    await db().batch([db().prepare("DELETE FROM users WHERE student_id=? AND institution_id=? AND id<>?").bind(student.id, institution, auth.userId), db().prepare("DELETE FROM notifications WHERE student_id=? AND institution_id=?").bind(student.id, institution), db().prepare("DELETE FROM students WHERE id=? AND institution_id=?").bind(student.id, institution)]);
    await audit(auth, action, String(student.id)); return {};
  }
  if (action === "resetStudentCode") {
    const student = await requireStudent(auth, body.studentId), accessCode = randomToken(6).toUpperCase();
    await db().batch([db().prepare("UPDATE students SET code_hash=? WHERE id=? AND institution_id=?").bind(await digest(accessCode), student.id, institution), db().prepare("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE student_id=? AND role='student' AND institution_id=?)").bind(student.id, institution)]);
    await audit(auth, action, String(student.id)); return { accessCode };
  }
  if (action === "assignActivity") {
    const target = await classroom(auth, body.classroomId), activity = await fetchActivity(auth, body.activityId), dueDate = valueString(body.dueDate, "Prazo", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(dueDate + "T12:00:00Z"))) throw new ApiError(400, "Informe uma data válida.");
    await db().prepare("INSERT INTO assignments (id,institution_id,classroom_id,activity_id,title,due_date,created_at) VALUES (?,?,?,?,?,?,?)").bind(uid(), institution, target.id, activity.id, body.title ? valueString(body.title, "Título", 120) : activity.title, dueDate, stamp).run();
    await notify(auth, "Nova missão da turma", activity.title + " · prazo " + dueDate); await audit(auth, action, activity.id); return { voicePreparation: await prepareActivitySpeech(activity) };
  }
  if (action === "deleteAssignment") { const row = await scopedRecord("assignments", auth, body.id); await db().prepare("DELETE FROM assignments WHERE id=? AND institution_id=?").bind(row.id, institution).run(); return {}; }
  if (action === "saveActivity") {
    const input = obj(body.activity), activity = cleanActivity(input), existing = input.id ? await scopedRecord("activities", auth, input.id) : null;
    const id = existing ? String(existing.id) : uid(), version = existing ? Number(existing.version) + 1 : 1;
    if (existing) await db().prepare("UPDATE activities SET title=?,body=?,status='draft',version=? WHERE id=? AND institution_id=?").bind(activity.title, JSON.stringify(activity), version, id, institution).run();
    else await db().prepare("INSERT INTO activities (id,institution_id,title,body,status,version,created_at) VALUES (?,?,?,?,'draft',1,?)").bind(id, institution, activity.title, JSON.stringify(activity), stamp).run();
    await audit(auth, action, id); return {};
  }
  if (action === "publishActivity") {
    const row = await scopedRecord("activities", auth, body.id); const activity = cleanActivity(JSON.parse(String(row.body)));
    await db().batch([db().prepare("UPDATE activities SET status='published' WHERE id=? AND institution_id=?").bind(row.id, institution), db().prepare("INSERT OR IGNORE INTO activity_versions (id,activity_id,version,body,created_at) VALUES (?,?,?,?,?)").bind(uid(), row.id, row.version, row.body, stamp)]);
    await audit(auth, action, String(row.id) + ":v" + row.version); return { voicePreparation: await prepareActivitySpeech(activity) };
  }
  if (action === "deleteActivity") {
    const row = await scopedRecord("activities", auth, body.id), usage = await db().prepare("SELECT COUNT(*) AS count FROM submissions WHERE activity_id=? AND institution_id=?").bind(row.id, institution).first();
    if (Number(usage?.count) > 0) throw new ApiError(409, "Esta atividade tem resultados de estudantes e precisa ser preservada.");
    await db().batch([db().prepare("DELETE FROM assignments WHERE activity_id=? AND institution_id=?").bind(row.id, institution), db().prepare("DELETE FROM activities WHERE id=? AND institution_id=?").bind(row.id, institution)]); await audit(auth, action, String(row.id)); return {};
  }
  if (action === "addNote") {
    const student = await requireStudent(auth, body.studentId), text = valueString(body.text, "Anotação", 3000), type = body.type === "intervention" ? "intervention" : "observation";
    await db().prepare("INSERT INTO notes (id,institution_id,student_id,text,type,author,created_at) VALUES (?,?,?,?,?,?,?)").bind(uid(), institution, student.id, text, type, auth.isDemo ? "Prof. Marina · fictícia" : auth.name, stamp).run();
    if (type === "intervention") await notify(auth, "Uma nova orientação para aprender", text, String(student.id));
    await audit(auth, action, String(student.id)); return {};
  }
  if (action === "deleteNote") { const row = await scopedRecord("notes", auth, body.id); await db().prepare("DELETE FROM notes WHERE id=? AND institution_id=?").bind(row.id, institution).run(); return {}; }
  if (action === "createUser") {
    requireRole(auth, ["admin"]);
    if (auth.isDemo) throw new ApiError(403, "Crie uma instituição própria para cadastrar contas reais.");
    if (body.role !== "teacher" && body.role !== "guardian") throw new ApiError(400, "Perfil inválido.");
    const role = body.role as Role, name = valueString(body.name, "Nome", 80), email = valueEmail(body.email), password = valuePassword(body.password), student = role === "guardian" ? await requireStudent(auth, body.studentId) : null;
    const existing = await db().prepare("SELECT id FROM users WHERE email=?").bind(email).first(); if (existing) throw new ApiError(409, "E-mail já cadastrado.");
    await db().prepare("INSERT INTO users (id,institution_id,name,email,password_hash,role,student_id,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(uid(), institution, name, email, await hashPassword(password), role, student?.id || null, stamp).run(); await audit(auth, action, role); return {};
  }
  throw new ApiError(400, "Ação desconhecida.");
}
