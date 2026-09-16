import test from 'node:test';
import assert from 'node:assert/strict';
import { activities } from '../lib/content';
import { activityRevision, isCompatibleDraft, progressFromSubmissions, type GameDraft } from '../lib/client';

const activity = activities[0];
function draft(overrides: Partial<GameDraft> = {}): GameDraft {
  return { schemaVersion: 1, owner: 'student-account-1', activityId: activity.id,
    revision: activityRevision(activity), index: 1, answers: { [activity.questions[0].id]: activity.questions[0].answer },
    selected: '', checked: false, hint: false, practice: false,
    submissionId: '2d11c7e3-ecce-4eca-88ca-870435c1a613',
    elapsedSeconds: 24.5, updatedAt: '2026-09-16T15:00:00Z', ...overrides };
}

test('RF114: rascunho retoma resposta parcial, questão e identificador de envio', () => {
  const saved = draft({ selected: activity.questions[1].options[0], hint: true });
  assert.equal(isCompatibleDraft(saved, 'student-account-1', activity), true);
  const checked = draft({ checked: true, selected: activity.questions[1].answer,
    answers: { ...saved.answers, [activity.questions[1].id]: activity.questions[1].answer } });
  assert.equal(isCompatibleDraft(checked, 'student-account-1', activity), true);
  assert.equal(checked.submissionId, saved.submissionId);
});

test('RF114: contas e versões diferentes não recuperam respostas de outro contexto', () => {
  const saved = draft();
  assert.equal(isCompatibleDraft(saved, 'another-account', activity), false);
  assert.equal(isCompatibleDraft(saved, 'student-account-1', activities[1]), false);
  const revised = { ...activity, questions: activity.questions.map((question, index) => index === 0 ? { ...question, options: ['X', 'Y'] } : question) };
  assert.equal(isCompatibleDraft(saved, 'student-account-1', revised), false);
});

test('RF114: rascunho corrompido não pula questões nem restaura feedback incoerente', () => {
  assert.equal(isCompatibleDraft(null, 'student-account-1', activity), false);
  assert.equal(isCompatibleDraft(draft({ index: 999 }), 'student-account-1', activity), false);
  assert.equal(isCompatibleDraft(draft({ answers: {} }), 'student-account-1', activity), false);
  assert.equal(isCompatibleDraft(draft({ checked: true, selected: 'E' }), 'student-account-1', activity), false);
  assert.equal(isCompatibleDraft(draft({ selected: 'alternativa ausente' }), 'student-account-1', activity), false);
  assert.equal(isCompatibleDraft(draft({ elapsedSeconds: NaN }), 'student-account-1', activity), false);
  assert.equal(isCompatibleDraft(draft({ submissionId: 'invalid-id' }), 'student-account-1', activity), false);
});

test('RF114: ordenação parcial preserva peças sem aceitar duplicação inválida', () => {
  const ordered = activities.find(item => item.id === 'palavras-1')!;
  const saved = draft({ activityId: ordered.id, revision: activityRevision(ordered), index: 0, answers: {}, selected: ['BO'], practice: true });
  assert.equal(isCompatibleDraft(saved, 'student-account-1', ordered), true);
  assert.equal(isCompatibleDraft({ ...saved, selected: ['BO', 'BO'] }, 'student-account-1', ordered), false);
  assert.equal(isCompatibleDraft({ ...saved, selected: ['BO'], checked: true, answers: { 'p1-1': ['BO'] } }, 'student-account-1', ordered), false);
});

test('RF progresso: cliente usa a soma oficial de XP e moedas para atividades docentes', () => {
  const progress = progressFromSubmissions([{
    id: 'submission-1', studentId: 'student-1', activityId: 'custom-1', activityVersion: 1,
    score: 100, correct: 1, total: 1, xpEarned: 30, answers: { 'q-1': 'A' },
    completedAt: '2026-09-16T15:00:00Z', durationSeconds: 15, isDiagnostic: false,
  }]);
  assert.equal(progress.xp, 30);
  assert.equal(progress.coins, 6);
  assert.deepEqual(progress.unlockedWorldIds, [1]);
});
