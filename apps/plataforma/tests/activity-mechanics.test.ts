import test from 'node:test';
import assert from 'node:assert/strict';
import type { Activity, Question } from '../lib/content';
import { evaluateAnswer } from '../lib/pedagogy';
import { activityRevision, isCompleteAnswer, isCompatibleDraft, type GameDraft } from '../lib/client';
import { localTutorReply } from '../lib/tutor';

const multi: Question = { id: 'select-vowels', type: 'multi', prompt: 'Quais são vogais?',
  options: ['A', 'B', 'E', 'M'], answer: ['A', 'E'], explanation: 'A e E são vogais.' };
const match: Question = { id: 'link-letters', type: 'match', prompt: 'Encontre a mesma letra.',
  options: ['A', 'B', 'E'], matches: ['e', 'a', 'b'], answer: ['a', 'b', 'e'], explanation: 'Letras maiúsculas e minúsculas.' };
const activityFor = (question: Question): Activity => ({ id: 'extra-mechanics', worldId: 1, title: 'Desafio',
  description: 'Pratique', type: question.type, durationMinutes: 3, xp: 30, skill: 'Letras', questions: [question] });
function draft(question: Question, selected: string | string[], checked = false): GameDraft {
  const activity = activityFor(question);
  return { schemaVersion: 1, owner: 'student-1', activityId: activity.id, revision: activityRevision(activity), index: 0,
    answers: checked ? { [question.id]: selected } : {}, selected, checked, practice: false, hint: false,
    submissionId: '2d11c7e3-ecce-4eca-88ca-870435c1a613', elapsedSeconds: 12, updatedAt: '2026-09-16T15:00:00Z' };
}

test('multi-select grades an exact unordered set without accepting duplicates or distractors', () => {
  assert.equal(evaluateAnswer(multi, ['E', 'A']), true);
  assert.equal(evaluateAnswer(multi, [' a ', 'e']), false);
  for (const answer of [[], ['A'], ['A', 'B'], ['A', 'E', 'M'], ['A', 'A'], ['A', ' a '], ['A', 'X'], 'A']) {
    assert.equal(evaluateAnswer(multi, answer), false);
  }
});

test('matching grades each pair in its left-side position, not as an unordered set', () => {
  assert.equal(evaluateAnswer(match, ['a', 'b', 'e']), true);
  assert.equal(evaluateAnswer(match, [' A ', 'B', 'e']), false);
  for (const answer of [[], ['a', 'b'], ['e', 'a', 'b'], ['a', 'a', 'e'], ['a', '', 'e'], ['a', 'b', 'x'], 'a']) {
    assert.equal(evaluateAnswer(match, answer), false);
  }
});

test('readiness allows wrong complete responses while preventing empty or duplicated selections', () => {
  assert.equal(isCompleteAnswer(multi, ['B']), true);
  assert.equal(isCompleteAnswer(multi, []), false);
  assert.equal(isCompleteAnswer(multi, ['A', 'A']), false);
  assert.equal(isCompleteAnswer(multi, ['unknown']), false);
  assert.equal(isCompleteAnswer(match, ['e', 'b', 'a']), true);
  assert.equal(isCompleteAnswer(match, ['a', '', 'e']), false);
  assert.equal(isCompleteAnswer(match, ['a', 'a', 'e']), false);
  assert.equal(isCompleteAnswer(match, ['a', 'b']), false);
});

test('multi-select drafts resume both partial and checked answers without requiring every option', () => {
  const activity = activityFor(multi);
  for (const selected of ['', [], ['B'], ['E', 'A']]) assert.equal(isCompatibleDraft(draft(multi, selected), 'student-1', activity), true);
  assert.equal(isCompatibleDraft(draft(multi, ['B'], true), 'student-1', activity), true);
  assert.equal(isCompatibleDraft(draft(multi, ['E', 'A'], true), 'student-1', activity), true);
  assert.equal(isCompatibleDraft(draft(multi, [], true), 'student-1', activity), false);
  assert.equal(isCompatibleDraft(draft(multi, ['A', 'A']), 'student-1', activity), false);
});

test('matching drafts preserve gaps only before confirmation and are invalidated by changed right labels', () => {
  const activity = activityFor(match);
  for (const selected of ['', [], ['', 'b', ''], ['a', '', 'e']]) assert.equal(isCompatibleDraft(draft(match, selected), 'student-1', activity), true);
  assert.equal(isCompatibleDraft(draft(match, ['a', '', 'e'], true), 'student-1', activity), false);
  assert.equal(isCompatibleDraft(draft(match, ['a', 'a', 'e']), 'student-1', activity), false);
  assert.equal(isCompatibleDraft(draft(match, ['e', 'b', 'a'], true), 'student-1', activity), true);
  const changed = { ...activity, questions: [{ ...match, matches: ['f', 'a', 'b'] }] };
  assert.equal(isCompatibleDraft(draft(match, ['a', '', 'e']), 'student-1', changed), false);
});

test('new mechanics keep ordering with repeated pieces and single-choice behavior intact', () => {
  const ordered: Question = { ...multi, type: 'order', options: ['LA', 'BO', 'BO'], answer: ['BO', 'BO', 'LA'] };
  assert.equal(isCompleteAnswer(ordered, ['BO', 'BO', 'LA']), true);
  assert.equal(evaluateAnswer(ordered, ['BO', 'BO', 'LA']), true);
  assert.equal(isCompleteAnswer(ordered, ['BO', 'LA', 'LA']), false);
  const choice: Question = { ...multi, type: 'choice', answer: 'A' };
  assert.equal(evaluateAnswer(choice, ' a '), true);
  assert.equal(isCompleteAnswer(choice, 'B'), true);
  assert.equal(isCompleteAnswer(choice, []), false);
});

test('Lumi explains new interactions without revealing answer keys', () => {
  const multiHint = localTutorReply('Me dê uma pista', { question: { ...multi, answer: ['SECRET'] } });
  const matchHint = localTutorReply('Me dê uma pista', { question: { ...match, answer: ['SECRET'] } });
  assert.match(multiHint, /mais de uma resposta/);
  assert.match(matchHint, /formar duplas/);
  assert.ok(!multiHint.includes('SECRET') && !matchHint.includes('SECRET'));
});

test('multi-select and matching preserve case-distinct labels as different choices', () => {
  const forms: Question = { ...multi, options: ['A', 'a', 'B'], answer: ['A', 'a'] };
  assert.equal(evaluateAnswer(forms, ['a', 'A']), true);
  assert.equal(evaluateAnswer(forms, ['A', 'A']), false);
  const formsPair: Question = { ...match, options: ['Maiúscula', 'Minúscula'], matches: ['a', 'A'], answer: ['A', 'a'] };
  assert.equal(evaluateAnswer(formsPair, ['A', 'a']), true);
  assert.equal(evaluateAnswer(formsPair, ['a', 'A']), false);
});
