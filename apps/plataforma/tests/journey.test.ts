import test from 'node:test';
import assert from 'node:assert/strict';
import { activities } from '../lib/content';
import { getJourney } from '../lib/journey';
import { canStartActivity, deriveStudentProgress, getWorldStatus } from '../lib/pedagogy';
import { localTutorReply } from '../lib/tutor';
const evidence = (index: number, wrong = 0) => ({
  activityId: activities[index].id, completedAt: new Date(2026, 8, 16, 12, index).toISOString(), xpEarned: wrong <= 1 ? 50 : 0,
  answers: Object.fromEntries(activities[index].questions.map((q, i) => [q.id, i < wrong ? 'incorreta' : q.answer])),
});
test('each solved activity unlocks exactly the next territory; 60% does not unlock', () => {
  const initial = deriveStudentProgress([]);
  assert.equal(getJourney(initial).next?.activity.id, activities[0].id);
  assert.equal(canStartActivity(initial, activities[1].id), false);
  assert.equal(getJourney(deriveStudentProgress([evidence(0, 2)])).completed, 0);
  const success = deriveStudentProgress([evidence(0, 1)]);
  assert.equal(getJourney(success).completed, 1);
  assert.equal(canStartActivity(success, activities[1].id), true);
  assert.equal(canStartActivity(success, activities[2].id), false);
});
test('four territories open a world; free practice in distant worlds cannot skip the trail', () => {
  const progress = deriveStudentProgress([evidence(0), evidence(1), evidence(2), evidence(3)]);
  assert.equal(getJourney(progress).next?.activity.worldId, 2);
  assert.equal(getWorldStatus(progress, 2).unlocked, true);
  assert.equal(getWorldStatus(progress, 3).unlocked, false);
  const distant = deriveStudentProgress([evidence(19)]);
  assert.equal(getJourney(distant).completed, 0);
  assert.equal(getWorldStatus(distant, 5).unlocked, false);
});
test('retries preserve conquered territories and the entire trail has a terminal state', () => {
  const progress = deriveStudentProgress([evidence(0), { ...evidence(0, 5), completedAt: '2026-09-20T12:00:00Z' }]);
  assert.equal(getJourney(progress).completed, 1);
  const all = getJourney(deriveStudentProgress(activities.map((_, i) => evidence(i))));
  assert.equal(all.completed, 20);
  assert.equal(all.next, null);
  assert.equal(all.percent, 100);
});
test('partial failed submissions cannot combine into a conquered territory', () => {
  const q = activities[0].questions;
  const partial = [
    { activityId: activities[0].id, completedAt: '2026-09-16T12:00:00Z', xpEarned: 0, answers: Object.fromEntries(q.slice(0, 3).map(item => [item.id, item.answer])) },
    { activityId: activities[0].id, completedAt: '2026-09-16T12:01:00Z', xpEarned: 0, answers: Object.fromEntries(q.slice(3).map(item => [item.id, item.answer])) },
  ];
  assert.equal(getJourney(deriveStudentProgress(partial)).completed, 0);
});
test('Lumi explains literacy topics locally and offers context without copying the answer key', () => {
  assert.match(localTutorReply('O que é uma rima?'), /GATO e SAPATO/);
  assert.match(localTutorReply('Como avanço na trilha?'), /4 dos 5/);
  const question = { ...activities[0].questions[0], explanation: 'SECRET_ANSWER', answer: 'SECRET_ANSWER' };
  const reply = localTutorReply('Me dê uma pista', { activity: activities[0], question });
  assert.match(reply, /pergunta/);
  assert.doesNotMatch(reply, /SECRET_ANSWER/);
  assert.match(localTutorReply('Explique buracos negros'), /dicas locais/i);
});
