import assert from 'node:assert/strict';
import test from 'node:test';
import { getEducatorJourney } from '../lib/educator-journey';
import type { Classroom, PlatformData, Student, Submission } from '../lib/types';

const classroom = (id = 'class-a', teacherUserId: string | null = 'teacher-1'): Classroom => ({ id, teacherUserId, name: id, grade: '1º ano', teacherName: 'Professora', createdAt: '2026-01-01' });
const student = (id = 'student-a', classroomId: string | null = 'class-a'): Student => ({ id, classroomId, name: 'Ana', classroomName: classroomId || '', avatar: '🌻', grade: '1º ano', consentAudio: false, createdAt: '2026-01-01' });
const submission = (studentId = 'student-a'): Submission => ({ id: `result-${studentId}`, studentId, activityId: 'activity-a', activityVersion: 1, score: 50, correct: 1, total: 2, xpEarned: 5, answers: {}, completedAt: '2026-01-02', durationSeconds: 30, isDiagnostic: false });
const base = (): Parameters<typeof getEducatorJourney>[0] => ({
  session: { userId: 'teacher-1', name: 'Professora', role: 'teacher', institutionId: 'school-a', institutionName: 'Escola', isDemo: false, studentId: null },
  staff: [], classrooms: [], students: [], assignments: [], submissions: [],
});
const assignment = (classroomId = 'class-a'): PlatformData['assignments'][number] => ({ id: `assignment-${classroomId}`, classroomId, activityId: 'activity-a', title: '', dueDate: '2026-01-03', createdAt: '2026-01-01' });

test('a new teacher is directed through classroom, student, assignment, then results', () => {
  const data = base();
  assert.deepEqual(getEducatorJourney(data).action, { kind: 'class' });
  data.classrooms = [classroom()];
  assert.deepEqual(getEducatorJourney(data).action, { kind: 'student', classId: 'class-a' });
  data.students = [student()];
  assert.deepEqual(getEducatorJourney(data).action, { kind: 'navigate', section: 'activities' });
  data.assignments = [assignment()];
  assert.equal(getEducatorJourney(data).current, 'reports');
  assert.deepEqual(getEducatorJourney(data).action, { kind: 'navigate', section: 'classes' });
  assert.match(getEducatorJourney(data).description, /códigos/);
  data.submissions = [submission()];
  assert.deepEqual(getEducatorJourney(data).action, { kind: 'navigate', section: 'reports' });
  assert.ok(getEducatorJourney(data).steps.every(step => step.complete));
});

test('the selected classroom has its own next step even when another classroom is active', () => {
  const data = base();
  data.classrooms = [classroom(), classroom('class-b')];
  data.students = [student()];
  data.assignments = [assignment()];
  data.submissions = [submission()];
  const journey = getEducatorJourney(data, 'class-b');
  assert.equal(journey.current, 'students');
  assert.deepEqual(journey.action, { kind: 'student', classId: 'class-b' });
  assert.equal(journey.steps.find(step => step.id === 'reports')?.complete, false);
});

test('a student without a classroom is linked before suggesting a duplicate registration', () => {
  const data = base();
  data.classrooms = [classroom()];
  data.students = [student('unassigned', null)];
  const journey = getEducatorJourney(data);
  assert.deepEqual(journey.action, { kind: 'student', classId: 'class-a', id: 'unassigned' });
  assert.match(journey.title, /Vincule Ana/);
});

test('administrators create a teacher account and link an existing class before enrolling students', () => {
  const data = base();
  data.session.role = 'admin';
  data.classrooms = [classroom('class-a', null)];
  assert.deepEqual(getEducatorJourney(data).action, { kind: 'account' });
  data.staff = [{ id: 'teacher-1', name: 'Professora', role: 'teacher', studentId: null }];
  assert.deepEqual(getEducatorJourney(data).action, { kind: 'class', id: 'class-a' });
  data.classrooms[0].teacherUserId = 'teacher-1';
  assert.deepEqual(getEducatorJourney(data).action, { kind: 'student', classId: 'class-a' });
});

test('unrelated records cannot mark the visible classroom workflow complete or mutate data', () => {
  const data = base();
  data.classrooms = [classroom()];
  data.students = [student()];
  data.assignments = [assignment('class-outside')];
  data.submissions = [submission('student-outside')];
  const snapshot = JSON.stringify(data);
  const journey = getEducatorJourney(data);
  assert.equal(journey.current, 'activities');
  assert.equal(journey.steps.find(step => step.id === 'reports')?.complete, false);
  assert.equal(JSON.stringify(data), snapshot);
});
