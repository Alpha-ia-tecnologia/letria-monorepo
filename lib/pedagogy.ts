import { activities, diagnosticQuestions, getActivity, worlds } from "./content";
import type { Activity, Question } from "./content";

export type Answer = string | string[];
export type Attempt = {
  id: string; activityId: string; questionId: string; worldId: number;
  correct: boolean; answer: Answer; createdAt: string;
};
export type StudentProgress = {
  attempts: Attempt[]; xp: number; coins: number; completedActivityIds: string[];
  rewardedActivityIds: string[]; unlockedWorldIds: number[];
  streak: number; lastStudyDate: string | null; diagnosticComplete: boolean;
};
export type WorldStatus = {
  status: "locked" | "available" | "review" | "mastered"; accuracy: number;
  sampleSize: number; activitiesPracticed: number; mastered: boolean; unlocked: boolean; reason: string;
};
export type Recommendation = {
  activity: Activity; activityId: string; worldId: number; title: string; reason: string;
  kind: "start" | "practice" | "review" | "advance" | "challenge";
};
export type SubmissionEvidence = {
  activityId: string; answers: Record<string, Answer>; completedAt: string; xpEarned?: number;
};
export const MASTERY_RULES = {
  minDistinctQuestions: 10, minActivities: 2, minAccuracy: 80, recentWindow: 5, maxRecentErrors: 1,
} as const;

export function createInitialProgress(): StudentProgress {
  return { attempts: [], xp: 0, coins: 0, completedActivityIds: [], rewardedActivityIds: [],
    unlockedWorldIds: [1], streak: 0, lastStudyDate: null, diagnosticComplete: false };
}

function normalized(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}
export function evaluateAnswer(question: Question, answer: Answer | undefined): boolean {
  if (answer === undefined) return false;
  if (question.type === "order") {
    const expected = question.answer;
    return Array.isArray(answer) && Array.isArray(expected)
      && answer.length === expected.length
      && answer.every((part, index) => typeof part === "string" && normalized(part) === normalized(expected[index]));
  }
  return typeof answer === "string" && typeof question.answer === "string"
    && normalized(answer) === normalized(question.answer);
}
function questionList(activityId: string): Question[] {
  if (activityId === "diagnostic") return diagnosticQuestions;
  const activity = getActivity(activityId);
  if (!activity) throw new Error("Atividade não encontrada.");
  return activity.questions;
}
/** Scores are recomputed from the answer key, including unanswered items. */
export function scoreActivity(activityId: string, answers: Record<string, Answer>) {
  const questions = questionList(activityId);
  const errors = questions.filter((question) => !evaluateAnswer(question, answers[question.id])).map((question) => question.id);
  const correct = questions.length - errors.length;
  const score = Math.round(correct / questions.length * 100);
  return { correct, total: questions.length, score,
    xpEarned: activityId !== "diagnostic" && score >= 80 ? getActivity(activityId)!.xp : 0, errors };
}
function worldEvidence(progress: StudentProgress, worldId: number) {
  const attempts = progress.attempts.filter((attempt) => attempt.worldId === worldId && attempt.activityId !== "diagnostic");
  const latest = new Map<string, Attempt>();
  for (const attempt of attempts) latest.set(attempt.questionId, attempt);
  const distinct = [...latest.values()];
  const correct = distinct.filter((attempt) => attempt.correct).length;
  const sampleSize = distinct.length;
  const accuracy = sampleSize ? Math.round(correct / sampleSize * 100) : 0;
  const activitiesPracticed = new Set(distinct.map((attempt) => attempt.activityId)).size;
  const recentErrors = attempts.slice(-MASTERY_RULES.recentWindow).filter((attempt) => !attempt.correct).length;
  const enoughEvidence = sampleSize >= MASTERY_RULES.minDistinctQuestions && activitiesPracticed >= MASTERY_RULES.minActivities;
  const mastered = enoughEvidence && correct / sampleSize * 100 >= MASTERY_RULES.minAccuracy && recentErrors <= MASTERY_RULES.maxRecentErrors;
  return { attempts, distinct, sampleSize, accuracy, activitiesPracticed, recentErrors, enoughEvidence, mastered };
}
export function getWorldStatus(progress: StudentProgress, worldId: number): WorldStatus {
  const evidence = worldEvidence(progress, worldId);
  const exists = worlds.some((world) => world.id === worldId);
  const unlocked = exists && (worldId === 1 || (progress.unlockedWorldIds ?? []).includes(worldId));
  const needsReview = evidence.recentErrors > MASTERY_RULES.maxRecentErrors
    || (evidence.sampleSize >= 5 && evidence.accuracy < MASTERY_RULES.minAccuracy);
  const status = !unlocked ? "locked" : evidence.mastered ? "mastered" : needsReview ? "review" : "available";
  let reason: string;
  if (!unlocked) reason = "Consolide as habilidades do mundo anterior para abrir este caminho.";
  else if (evidence.mastered) reason = "Você mostrou o que aprendeu em diferentes desafios. Próximo mundo liberado!";
  else if (needsReview) reason = "Vamos revisitar alguns desafios com calma. Cada tentativa ajuda a aprender.";
  else if (!evidence.sampleSize) reason = "Um novo caminho espera por você. Comece pela primeira missão!";
  else reason = `Você já explorou ${evidence.sampleSize} desafios diferentes. Continue praticando em mais de uma missão.`;
  return { status, accuracy: evidence.accuracy, sampleSize: evidence.sampleSize,
    activitiesPracticed: evidence.activitiesPracticed, mastered: evidence.mastered, unlocked, reason };
}
function timestamp(now?: string | Date): string {
  const value = now instanceof Date ? now : new Date(now ?? Date.now());
  if (!Number.isFinite(value.getTime())) throw new Error("Data de atividade inválida.");
  return value.toISOString();
}
function localDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}
function withStudyDay(progress: StudentProgress, iso: string): StudentProgress {
  const day = localDay(iso);
  if (day === progress.lastStudyDate || (progress.lastStudyDate && day < progress.lastStudyDate)) return progress;
  const difference = progress.lastStudyDate
    ? (Date.parse(`${day}T12:00:00Z`) - Date.parse(`${progress.lastStudyDate}T12:00:00Z`)) / 86_400_000 : null;
  return { ...progress, lastStudyDate: day, streak: difference === 1 ? progress.streak + 1 : 1 };
}
/** Records evidence; repeated items cannot inflate the distinct-question sample. */
export function recordAttempt(progress: StudentProgress, input: {
  activityId: string; questionId: string; answer: Answer; now?: string | Date;
}): StudentProgress {
  const question = questionList(input.activityId).find((item) => item.id === input.questionId);
  if (!question) throw new Error("Desafio não encontrado nesta atividade.");
  if (typeof input.answer !== "string" && !(Array.isArray(input.answer) && input.answer.every((part) => typeof part === "string"))) {
    throw new Error("Resposta inválida.");
  }
  const worldId = getActivity(input.activityId)?.worldId ?? question.worldId ?? 1;
  const createdAt = timestamp(input.now);
  const attempt: Attempt = {
    id: `${input.activityId}:${question.id}:${createdAt}:${progress.attempts.length}`,
    activityId: input.activityId, questionId: question.id, worldId,
    correct: evaluateAnswer(question, input.answer),
    answer: Array.isArray(input.answer) ? [...input.answer] : input.answer, createdAt,
  };
  let next: StudentProgress = withStudyDay({ ...progress, attempts: [...progress.attempts, attempt],
    unlockedWorldIds: [...(progress.unlockedWorldIds ?? [1])] }, createdAt);
  // Keep earned access. Recent difficulty prompts review without erasing positive progress.
  for (const world of worlds) {
    if (next.unlockedWorldIds.includes(world.id) && worldEvidence(next, world.id).mastered
      && world.id < worlds.length && !next.unlockedWorldIds.includes(world.id + 1)) {
      next = { ...next, unlockedWorldIds: [...next.unlockedWorldIds, world.id + 1] };
    }
  }
  return next;
}
export function completeActivity(progress: StudentProgress, activityId: string, now?: string | Date): StudentProgress {
  const questions = questionList(activityId);
  const latest = new Map(progress.attempts.filter((attempt) => attempt.activityId === activityId).map((attempt) => [attempt.questionId, attempt]));
  if (!questions.every((question) => latest.has(question.id))) return progress;
  const next = withStudyDay(progress, timestamp(now));
  const rewarded = next.rewardedActivityIds ?? [];
  const accuracy = questions.filter((question) => latest.get(question.id)?.correct).length / questions.length * 100;
  const reward = activityId !== "diagnostic" && accuracy >= 80 && !rewarded.includes(activityId)
    ? getActivity(activityId)!.xp : 0;
  return { ...next,
    xp: next.xp + reward, coins: next.coins + reward / 5,
    completedActivityIds: next.completedActivityIds.includes(activityId) ? [...next.completedActivityIds] : [...next.completedActivityIds, activityId],
    rewardedActivityIds: reward ? [...rewarded, activityId] : [...rewarded],
    diagnosticComplete: next.diagnosticComplete || activityId === "diagnostic",
  };
}
export function deriveStudentProgress(submissions: SubmissionEvidence[]): StudentProgress {
  let progress = createInitialProgress();
  const chronological = [...submissions].sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  for (const submission of chronological) {
    if (submission.activityId !== "diagnostic" && !getActivity(submission.activityId)) continue;
    for (const question of questionList(submission.activityId)) {
      const answer = submission.answers[question.id];
      if (answer !== undefined) progress = recordAttempt(progress, {
        activityId: submission.activityId, questionId: question.id, answer, now: submission.completedAt,
      });
    }
    progress = completeActivity(progress, submission.activityId, submission.completedAt);
  }
  if (submissions.length && submissions.every((submission) => Number.isFinite(submission.xpEarned))) {
    progress.xp = submissions.reduce((total, submission) => total + Math.max(0, submission.xpEarned!), 0);
    progress.coins = Math.floor(progress.xp / 5);
  }
  return progress;
}
export function canStartActivity(progress: StudentProgress, activityId: string): boolean {
  if (activityId === "diagnostic") return true;
  const activity = getActivity(activityId);
  return !!activity && getWorldStatus(progress, activity.worldId).unlocked;
}
export function getRecommendation(progress: StudentProgress): Recommendation {
  const available = worlds.filter((world) => getWorldStatus(progress, world.id).unlocked);
  const reviewWorld = available.find((world) => getWorldStatus(progress, world.id).status === "review");
  const targetWorld = reviewWorld ?? available.find((world) => !getWorldStatus(progress, world.id).mastered) ?? worlds[worlds.length - 1];
  const candidates = activities.filter((item) => item.worldId === targetWorld.id);
  let activity: Activity;
  let kind: Recommendation["kind"];
  let reason: string;
  if (reviewWorld) {
    const missed = worldEvidence(progress, reviewWorld.id).distinct.filter((attempt) => !attempt.correct);
    activity = [...candidates].sort((a, b) => missed.filter((item) => item.activityId === b.id).length - missed.filter((item) => item.activityId === a.id).length)[0];
    kind = "review";
    reason = `Uma nova chance de praticar ${activity.skill.toLocaleLowerCase("pt-BR")}, com pistas e sem pressa.`;
  } else {
    activity = candidates.find((item) => !progress.completedActivityIds.includes(item.id))
      ?? [...candidates].sort((a, b) => progress.attempts.filter((attempt) => attempt.activityId === a.id).length - progress.attempts.filter((attempt) => attempt.activityId === b.id).length)[0];
    if (!progress.attempts.some((attempt) => attempt.activityId !== "diagnostic")) {
      kind = "start"; reason = "Comece sua aventura reconhecendo as letras e seus sons.";
    } else if (targetWorld.id > 1 && !progress.attempts.some((attempt) => attempt.worldId === targetWorld.id && attempt.activityId !== "diagnostic")) {
      kind = "advance"; reason = "Seu aprendizado abriu um novo caminho. Explore a próxima habilidade!";
    } else if (worlds.every((world) => getWorldStatus(progress, world.id).mastered)) {
      kind = "challenge"; reason = "Você explorou todos os mundos! Releia e continue fortalecendo suas descobertas.";
    } else {
      kind = "practice"; reason = "Pratique desafios diferentes para fortalecer essa habilidade.";
    }
  }
  return { activity, activityId: activity.id, worldId: activity.worldId, title: activity.title, kind, reason };
}
export function getSummary(progress: StudentProgress) {
  const attempts = progress.attempts.filter((attempt) => attempt.activityId !== "diagnostic");
  const correct = attempts.filter((attempt) => attempt.correct).length;
  const xpInLevel = progress.xp % 150;
  return { xp: progress.xp, coins: progress.coins, level: Math.floor(progress.xp / 150) + 1,
    levelProgress: Math.round(xpInLevel / 150 * 100), xpInLevel, xpToNextLevel: 150 - xpInLevel,
    correct, total: attempts.length, accuracy: attempts.length ? Math.round(correct / attempts.length * 100) : 0,
    masteredWorlds: worlds.filter((world) => getWorldStatus(progress, world.id).mastered).length,
    completedActivities: progress.completedActivityIds.filter((id) => id !== "diagnostic").length, streak: progress.streak };
}
export function getDiagnosticResult(progress: StudentProgress) {
  const latest = new Map(progress.attempts.filter((attempt) => attempt.activityId === "diagnostic").map((attempt) => [attempt.questionId, attempt]));
  const evidence = worlds.map((world) => {
    const answers = [...latest.values()].filter((attempt) => attempt.worldId === world.id);
    return { worldId: world.id, skill: world.skill, correct: answers.filter((attempt) => attempt.correct).length, total: answers.length, expected: 2 };
  });
  const complete = diagnosticQuestions.every((question) => latest.has(question.id));
  const focus = evidence.find((item) => item.total < item.expected || item.correct < item.expected) ?? evidence[evidence.length - 1];
  return { complete, answered: latest.size, total: diagnosticQuestions.length,
    correct: [...latest.values()].filter((attempt) => attempt.correct).length, evidence, suggestedWorldId: focus.worldId,
    message: complete ? "Conhecemos um pouco do seu jeito de aprender. A trilha vai se adaptar às próximas descobertas!" : "Faça os desafios no seu ritmo. Cada resposta ajuda a preparar sua aventura.",
    note: "Sondagem inicial com duas questões por habilidade; não substitui a avaliação do educador nem libera etapas sem evidência de prática." };
}
