import assert from 'node:assert/strict';
import test from 'node:test';
import { activityCatalog } from '../lib/activity-catalog';
import { getStudentNextStep, getStudentTasks } from '../lib/student-journey';
import type { Assignment, Student, Submission } from '../lib/types';

const [activityA, activityB, recommended] = activityCatalog;
const student: Student = {
  id: 'student-a', name: 'Ana', classroomId: 'class-a', classroomName: 'Primeiro A',
  avatar: '🌻', grade: '1º ano', consentAudio: false, createdAt: '2026-09-01T09:00:00Z',
};
const assignment = (patch: Partial<Assignment> = {}): Assignment => ({
  id: 'assignment-a', classroomId: 'class-a', activityId: activityA.id,
  title: 'Atividade escolhida pela professora', dueDate: '2026-09-20', createdAt: '2026-09-17T09:00:00Z',
  ...patch,
});
const submission = (patch: Partial<Submission> = {}): Submission => ({
  id: 'submission-a', studentId: student.id, activityId: activityA.id, activityVersion: 1,
  score: 0, correct: 0, total: activityA.questions.length, xpEarned: 0,
  answers: Object.fromEntries(activityA.questions.map(question => [question.id, 'resposta incorreta'])),
  completedAt: '2026-09-17T10:00:00Z', durationSeconds: 60, isDiagnostic: false,
  ...patch,
});

test('classroom tasks are isolated by classroom and completion belongs to the selected student', () => {
  const tasks = getStudentTasks([
    assignment(),
    assignment({ id: 'other-class', classroomId: 'class-b' }),
  ], [submission({ studentId: 'student-b' })], student, activityCatalog);
  assert.deepEqual(tasks.map(task => task.assignment.id), ['assignment-a']);
  assert.equal(tasks[0].submitted, false);
  assert.equal(tasks[0].activity, activityA);
  assert.deepEqual(getStudentTasks([assignment()], [], undefined, activityCatalog), []);
  assert.deepEqual(getStudentTasks([assignment()], [], { ...student, classroomId: null }, activityCatalog), []);
});

test('older attempts, diagnostics and another activity cannot complete a newly assigned task', () => {
  const attempts = [
    submission({ id: 'before', completedAt: '2026-09-17T08:59:59Z', score: 100 }),
    submission({ id: 'diagnostic', isDiagnostic: true, score: 100 }),
    submission({ id: 'other-activity', activityId: activityB.id, score: 100 }),
  ];
  const [task] = getStudentTasks([assignment()], attempts, student, activityCatalog);
  assert.equal(task.submitted, false);
});

test('a submitted attempt after assignment counts as completed even with no correct answers', () => {
  const [task] = getStudentTasks([assignment()], [submission()], student, activityCatalog);
  assert.equal(task.submitted, true);
  const [atAssignmentTime] = getStudentTasks([assignment()], [submission({ completedAt: assignment().createdAt })], student, activityCatalog);
  assert.equal(atAssignmentTime.submitted, true);
});

test('pending tasks come before completed tasks and are ordered by deadline, with undated tasks last', () => {
  const completedActivity = recommended;
  const assignments = [
    assignment({ id: 'undated', dueDate: '' }),
    assignment({ id: 'later', dueDate: '2026-09-25' }),
    assignment({ id: 'completed', dueDate: '2026-09-18', activityId: completedActivity.id }),
    assignment({ id: 'earlier', dueDate: '2026-09-19' }),
  ];
  const tasks = getStudentTasks(assignments, [submission({ activityId: completedActivity.id })], student, activityCatalog);
  assert.deepEqual(tasks.map(task => task.assignment.id), ['earlier', 'later', 'undated', 'completed']);
  assert.deepEqual(tasks.map(task => task.submitted), [false, false, false, true]);
});

test('unavailable content is retained as a null task and skipped by the next-action recommendation', () => {
  const tasks = getStudentTasks([
    assignment({ id: 'missing', activityId: 'activity-no-longer-available', dueDate: '2026-09-18' }),
    assignment({ id: 'available', activityId: activityB.id, dueDate: '2026-09-19' }),
  ], [], student, activityCatalog);
  assert.equal(tasks[0].activity, null);
  assert.equal(tasks[0].submitted, false);
  const next = getStudentNextStep(tasks, false, false, recommended, 'Próxima atividade da trilha.');
  assert.equal(next.kind, 'assignment');
  assert.equal(next.activity, activityB);
  const missingOnly = tasks.filter(task => task.activity === null);
  assert.equal(getStudentNextStep(missingOnly, false, false, recommended, '').kind, 'diagnostic');
  assert.equal(getStudentNextStep(missingOnly, false, true, recommended, '').activity, recommended);
});

test('the next action prioritizes an available classroom task over the first diagnostic or a returning recommendation', () => {
  const tasks = getStudentTasks([assignment()], [], student, activityCatalog);
  for (const [diagnosticComplete, hasPractice] of [[false, false], [true, true]]) {
    const next = getStudentNextStep(tasks, diagnosticComplete, hasPractice, recommended, 'Continuar a trilha.');
    assert.equal(next.kind, 'assignment');
    assert.equal(next.title, assignment().title);
    assert.equal(next.activity, activityA);
    assert.equal(next.minutes, activityA.durationMinutes);
  }
});

test('the first diagnostic is suggested only with no pending classroom task, practice or completed diagnostic', () => {
  const next = getStudentNextStep([], false, false, recommended, 'Continuar a trilha.');
  assert.equal(next.kind, 'diagnostic');
  assert.equal(next.activity, null);
  assert.ok(next.minutes > 0);
  for (const [diagnosticComplete, hasPractice] of [[true, false], [false, true], [true, true]]) {
    const returning = getStudentNextStep([], diagnosticComplete, hasPractice, recommended, 'Retomar sons do bosque.');
    assert.equal(returning.kind, 'journey');
    assert.equal(returning.activity, recommended);
    assert.equal(returning.description, 'Retomar sons do bosque.');
    assert.equal(returning.minutes, recommended.durationMinutes);
  }
  const completed = getStudentTasks([assignment()], [submission()], student, activityCatalog);
  assert.equal(getStudentNextStep(completed, false, true, recommended, '').kind, 'journey');
});

test('invalid dates never invent a completion, and deriving tasks and next actions leaves inputs untouched', () => {
  const assignments = Object.freeze([
    Object.freeze(assignment({ id: 'later', dueDate: '2026-09-25' })),
    Object.freeze(assignment({ id: 'invalid-date', createdAt: 'not-a-date' })),
    Object.freeze(assignment({ id: 'earlier', dueDate: '2026-09-18' })),
  ]);
  const submissions = Object.freeze([Object.freeze(submission({ completedAt: 'not-a-date' }))]);
  const selectedStudent = Object.freeze({ ...student });
  const catalog = Object.freeze([activityA, activityB, recommended]);
  const before = JSON.stringify({ assignments, submissions, selectedStudent, catalog });
  const tasks = getStudentTasks(assignments, submissions, selectedStudent, catalog);
  assert.ok(tasks.every(task => !task.submitted));
  const invalidAssignment = getStudentTasks([assignment({ createdAt: 'not-a-date' })], [submission()], selectedStudent, catalog);
  assert.equal(invalidAssignment[0].submitted, false);
  const tasksBefore = JSON.stringify(tasks);
  getStudentNextStep(Object.freeze(tasks), false, false, recommended, 'Continuar.');
  assert.equal(JSON.stringify(tasks), tasksBefore);
  assert.equal(JSON.stringify({ assignments, submissions, selectedStudent, catalog }), before);
});
