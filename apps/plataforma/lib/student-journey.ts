import type { Activity } from './content';
import type { Assignment, Student, Submission } from './types';

export type StudentTask = { assignment: Assignment; activity: Activity | null; submitted: boolean };
export type StudentNextStep = { kind: 'assignment' | 'diagnostic' | 'journey'; title: string; description: string; label: string; activity: Activity | null; minutes: number };

/** An old attempt must not silently complete a newly assigned classroom task. */
export function getStudentTasks(assignments: readonly Assignment[], submissions: readonly Submission[], student: Pick<Student, 'id' | 'classroomId'> | undefined, activities: readonly Activity[]): StudentTask[] {
  if (!student?.classroomId) return [];
  return assignments.filter(task => task.classroomId === student.classroomId).map(assignment => {
    const assignedAt = Date.parse(assignment.createdAt);
    const submitted = Number.isFinite(assignedAt) && submissions.some(row => row.studentId === student.id && row.activityId === assignment.activityId && !row.isDiagnostic && Number.isFinite(Date.parse(row.completedAt)) && Date.parse(row.completedAt) >= assignedAt);
    return { assignment, activity: activities.find(activity => activity.id === assignment.activityId) ?? null, submitted };
  }).sort((a, b) => Number(a.submitted) - Number(b.submitted) || (a.assignment.dueDate || '9999').localeCompare(b.assignment.dueDate || '9999') || a.assignment.createdAt.localeCompare(b.assignment.createdAt) || a.assignment.id.localeCompare(b.assignment.id));
}

export function getStudentNextStep(tasks: readonly StudentTask[], diagnosticComplete: boolean, hasPractice: boolean, recommended: Activity, reason: string): StudentNextStep {
  const next = tasks.find(task => !task.submitted && task.activity);
  if (next?.activity) return { kind: 'assignment', title: next.assignment.title || next.activity.title, description: 'Seu professor escolheu esta atividade para a turma. Você pode começar por aqui.', label: 'Fazer atividade da turma', activity: next.activity, minutes: next.activity.durationMinutes };
  if (!diagnosticComplete && !hasPractice) return { kind: 'diagnostic', title: 'Vamos descobrir o que você já sabe?', description: 'A Lumi acompanha sua primeira atividade. Não é uma prova: faça no seu ritmo.', label: 'Começar minha primeira atividade', activity: null, minutes: 8 };
  return { kind: 'journey', title: recommended.title, description: reason, label: 'Continuar minha trilha', activity: recommended, minutes: recommended.durationMinutes };
}

export function taskDueLabel(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Sem prazo informado';
  const parsed = new Date(value + 'T12:00:00');
  return Number.isFinite(parsed.getTime()) ? 'Combinado para ' + parsed.toLocaleDateString('pt-BR') : 'Sem prazo informado';
}
