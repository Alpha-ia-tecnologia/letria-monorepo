import test from 'node:test';
import assert from 'node:assert/strict';
import { queuedSubmissionAction, type QueuedAnswer } from '../lib/client';

function queuedAnswer(overrides: Partial<QueuedAnswer> = {}): QueuedAnswer {
  return {
    id: 'attempt-1', owner: 'institution-a:student-a', createdAt: '2026-09-16T12:00:00.000Z',
    action: { action: 'submit', submissionId: 'attempt-1', activityId: 'activity-1', answers: { q1: 'A' }, durationSeconds: 12 },
    ...overrides,
  };
}

test('legacy queued answers without a target bind to the recorded student', () => {
  const original = queuedAnswer();
  const action = queuedSubmissionAction(original);
  assert.equal(action.studentId, 'student-a');
  assert.equal(action.submissionId, 'attempt-1');
  assert.deepEqual(action.answers, { q1: 'A' });
  assert.equal('studentId' in original.action, false);
});

test('queue ownership overrides a forged or stale target for submissions and diagnostics', () => {
  for (const type of ['submit', 'diagnostic'] as const) {
    const original = queuedAnswer({ action: { action: type, submissionId: 'attempt-1', activityId: 'activity-1', answers: {}, durationSeconds: 12, studentId: 'another-student' } });
    const action = queuedSubmissionAction(original);
    assert.equal(action.studentId, 'student-a');
    assert.equal(action.action, type);
    assert.ok('studentId' in original.action && original.action.studentId === 'another-student');
  }
});

test('non-learning actions and malformed or anonymous owners cannot be replayed', () => {
  assert.throws(() => queuedSubmissionAction(queuedAnswer({ action: { action: 'logout' } })), /Somente respostas/);
  assert.throws(() => queuedSubmissionAction(queuedAnswer({ action: { action: 'switchRole', role: 'admin' } })), /Somente respostas/);
  for (const owner of ['', 'institution', 'institution:', ':student', 'institution:null', 'institution:undefined', 'null:student', 'institution:student:extra', 'institution:../student', 'institution:student with spaces']) {
    assert.throws(() => queuedSubmissionAction(queuedAnswer({ owner })), /estudante válido/);
  }
});
