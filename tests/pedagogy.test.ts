import test from "node:test";
import assert from "node:assert/strict";
import { activities, diagnosticQuestions, worlds } from "../lib/content";
import {
  canStartActivity, completeActivity, createInitialProgress, deriveStudentProgress,
  evaluateAnswer, getDiagnosticResult, getRecommendation, getSummary,
  getWorldStatus, recordAttempt, scoreActivity,
} from "../lib/pedagogy";
import type { StudentProgress, Answer } from "../lib/pedagogy";

const fixedDate = "2026-09-16T15:00:00.000Z";
function play(progress: StudentProgress, activityId: string, wrongIndexes: number[] = [], now = fixedDate) {
  const activity = activities.find((item) => item.id === activityId)!;
  let result = progress;
  for (const [index, question] of activity.questions.entries()) {
    result = recordAttempt(result, { activityId, questionId: question.id,
      answer: wrongIndexes.includes(index) ? "resposta incorreta" : question.answer, now });
  }
  return completeActivity(result, activityId, now);
}
function answersFor(id: string): Record<string, Answer> {
  return Object.fromEntries(activities.find((item) => item.id === id)!.questions.map((question) => [question.id, question.answer]));
}

test("RF conteúdo: cinco etapas, vinte atividades e cem desafios com gabaritos válidos", () => {
  assert.equal(worlds.length, 5);
  assert.equal(activities.length, 20);
  assert.equal(new Set(activities.map((item) => item.id)).size, 20);
  const ids = activities.flatMap((item) => item.questions.map((question) => question.id));
  assert.equal(ids.length, 100);
  assert.equal(new Set(ids).size, 100);
  for (const world of worlds) assert.equal(activities.filter((item) => item.worldId === world.id).length, 4);
  for (const activity of activities) {
    assert.equal(activity.questions.length, 5);
    for (const question of activity.questions) {
      assert.ok(question.prompt && question.explanation);
      assert.equal(new Set(question.options).size, question.options.length);
      if (question.type === "choice") assert.ok(question.options.includes(question.answer as string));
      else assert.deepEqual([...question.answer].sort(), [...question.options].sort());
    }
  }
});

test("RF avaliação: comparação aceita caixa e espaços; ordenação exige sequência completa", () => {
  const choice = activities[0].questions[0];
  assert.equal(evaluateAnswer(choice, " a "), true);
  assert.equal(evaluateAnswer(choice, ["A"]), false);
  const ordered = activities.find((item) => item.id === "palavras-1")!.questions[0];
  assert.equal(evaluateAnswer(ordered, ["BO", "LA"]), true);
  assert.equal(evaluateAnswer(ordered, ["LA", "BO"]), false);
  assert.equal(evaluateAnswer(ordered, ["BO"]), false);
  assert.equal(evaluateAnswer(ordered, undefined), false);
});

test("RN progressão: XP isolado não libera mundos nem recomenda etapas bloqueadas", () => {
  const progress = { ...createInitialProgress(), xp: 50_000 };
  assert.equal(getWorldStatus(progress, 2).unlocked, false);
  assert.equal(canStartActivity(progress, "rimas-1"), false);
  assert.equal(canStartActivity(progress, "letras-1"), true);
  assert.equal(getRecommendation(progress).worldId, 1);
  assert.equal(getWorldStatus(progress, 999).unlocked, false);
});

test("RN evidência mínima: repetir uma questão ou uma atividade não infla a amostra", () => {
  let progress = createInitialProgress();
  const question = activities[0].questions[0];
  for (let index = 0; index < 30; index++) progress = recordAttempt(progress, {
    activityId: "letras-1", questionId: question.id, answer: question.answer, now: fixedDate,
  });
  assert.equal(getWorldStatus(progress, 1).sampleSize, 1);
  assert.equal(getWorldStatus(progress, 2).unlocked, false);
  for (let index = 0; index < 4; index++) progress = play(progress, "letras-1");
  assert.equal(getWorldStatus(progress, 1).sampleSize, 5);
  assert.equal(getWorldStatus(progress, 1).activitiesPracticed, 1);
  assert.equal(getWorldStatus(progress, 2).unlocked, false);
  assert.equal(progress.xp, 50);
});

test("RN domínio: dez itens distintos em duas atividades com 80% liberam a etapa seguinte", () => {
  let progress = play(createInitialProgress(), "letras-1", [0, 1]);
  progress = play(progress, "letras-2");
  const status = getWorldStatus(progress, 1);
  assert.equal(status.sampleSize, 10);
  assert.equal(status.activitiesPracticed, 2);
  assert.equal(status.accuracy, 80);
  assert.equal(status.mastered, true);
  assert.equal(getWorldStatus(progress, 2).unlocked, true);
  assert.equal(getWorldStatus(progress, 3).unlocked, false);
  assert.equal(getRecommendation(progress).kind, "advance");
  assert.equal(getRecommendation(progress).worldId, 2);
});

test("RN revisão: erros recentes acionam apoio sem apagar XP ou acesso conquistado", () => {
  let progress = createInitialProgress();
  for (const activity of activities.filter((item) => item.worldId === 1)) progress = play(progress, activity.id);
  const earnedXp = progress.xp;
  for (const question of activities[0].questions.slice(0, 2)) {
    progress = recordAttempt(progress, { activityId: "letras-1", questionId: question.id, answer: "incorreta", now: fixedDate });
  }
  assert.equal(getWorldStatus(progress, 1).accuracy, 90);
  assert.equal(getWorldStatus(progress, 1).status, "review");
  assert.equal(getWorldStatus(progress, 2).unlocked, true);
  assert.equal(progress.xp, earnedXp);
  assert.equal(getRecommendation(progress).kind, "review");
  assert.equal(getRecommendation(progress).activityId, "letras-1");
});

test("RN recompensas: atividade incompleta não conclui; corrigir depois recompensa uma única vez", () => {
  const initial = createInitialProgress();
  assert.strictEqual(completeActivity(initial, "letras-1", fixedDate), initial);
  const failed = play(initial, "letras-1", [0, 1]);
  assert.equal(failed.xp, 0);
  const recovered = play(failed, "letras-1");
  assert.equal(recovered.xp, 50);
  assert.equal(recovered.coins, 10);
  const replay = play(recovered, "letras-1");
  assert.equal(replay.xp, 50);
  assert.equal(replay.completedActivityIds.length, 1);
  assert.deepEqual(initial, createInitialProgress());
});

test("RF diagnóstico: dez itens graduais em cinco habilidades não substituem a prática", () => {
  assert.equal(diagnosticQuestions.length, 10);
  assert.deepEqual(diagnosticQuestions.map((question) => question.worldId), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  let progress = createInitialProgress();
  for (const question of diagnosticQuestions) progress = recordAttempt(progress, {
    activityId: "diagnostic", questionId: question.id, answer: question.answer, now: fixedDate,
  });
  progress = completeActivity(progress, "diagnostic", fixedDate);
  const result = getDiagnosticResult(progress);
  assert.equal(progress.diagnosticComplete, true);
  assert.equal(result.complete, true);
  assert.equal(result.correct, 10);
  assert.equal(result.evidence.length, 5);
  assert.equal(progress.xp, 0);
  assert.equal(getWorldStatus(progress, 1).sampleSize, 0);
  assert.equal(getWorldStatus(progress, 2).unlocked, false);
});

test("RF avaliação no servidor: respostas ausentes erram e gabaritos adulterados não contam", () => {
  const answers = answersFor("letras-1");
  const full = scoreActivity("letras-1", answers);
  assert.deepEqual(full, { correct: 5, total: 5, score: 100, xpEarned: 50, errors: [] });
  delete answers["l1-1"];
  answers["inventada"] = "A";
  assert.equal(scoreActivity("letras-1", answers).score, 80);
  assert.equal(scoreActivity("letras-1", {}).xpEarned, 0);
  assert.throws(() => scoreActivity("inexistente", {}), /não encontrada/);
  assert.throws(() => recordAttempt(createInitialProgress(), {
    activityId: "letras-1", questionId: "r1-1", answer: "PATO",
  }), /não encontrado/);
});

test("RF histórico: reconstrução ordena evidências e respeita XP oficial, incluindo conteúdo docente", () => {
  const progress = deriveStudentProgress([
    { activityId: "letras-2", answers: answersFor("letras-2"), completedAt: "2026-09-17T15:00:00Z", xpEarned: 50 },
    { activityId: "letras-1", answers: answersFor("letras-1"), completedAt: fixedDate, xpEarned: 50 },
    { activityId: "docente-123", answers: {}, completedAt: "2026-09-18T15:00:00Z", xpEarned: 20 },
    { activityId: "letras-1", answers: answersFor("letras-1"), completedAt: "2026-09-18T15:00:00Z", xpEarned: 0 },
  ]);
  assert.equal(progress.xp, 120);
  assert.equal(progress.coins, 24);
  assert.equal(getWorldStatus(progress, 2).unlocked, true);
  assert.equal(getWorldStatus(progress, 1).sampleSize, 10);
  assert.equal(progress.streak, 3);
});

test("RN frequência: dias consecutivos usam horário de São Paulo e não duplicam no mesmo dia", () => {
  let progress = play(createInitialProgress(), "letras-1", [], "2026-09-16T02:00:00Z");
  assert.equal(progress.lastStudyDate, "2026-09-15");
  assert.equal(progress.streak, 1);
  progress = play(progress, "letras-2", [], "2026-09-16T02:30:00Z");
  assert.equal(progress.streak, 1);
  progress = play(progress, "letras-3", [], "2026-09-16T03:30:00Z");
  assert.equal(progress.lastStudyDate, "2026-09-16");
  assert.equal(progress.streak, 2);
  progress = play(progress, "letras-4", [], "2026-09-18T12:00:00Z");
  assert.equal(progress.streak, 1);
});

test("RF resumo: diagnóstico não distorce desempenho das missões e progresso inicial é positivo", () => {
  const summary = getSummary(createInitialProgress());
  assert.equal(summary.level, 1);
  assert.equal(summary.levelProgress, 0);
  assert.equal(summary.accuracy, 0);
  assert.equal(summary.completedActivities, 0);
  assert.equal(getRecommendation(createInitialProgress()).kind, "start");
});
