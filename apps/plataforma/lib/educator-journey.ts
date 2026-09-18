import type { PlatformData } from './types';

export type EducatorStepId = 'accounts' | 'classes' | 'students' | 'activities' | 'reports';
export type EducatorJourneyStep = { id: EducatorStepId; label: string; detail: string; complete: boolean };
export type EducatorNextAction =
  | { kind: 'account' }
  | { kind: 'class'; id?: string }
  | { kind: 'student'; classId?: string; id?: string }
  | { kind: 'navigate'; section: 'classes' | 'activities' | 'reports' };

/** A suggested next action, derived only from records the current account can see. */
export function getEducatorJourney(data: Pick<PlatformData, 'session' | 'staff' | 'classrooms' | 'students' | 'assignments' | 'submissions'>, classroomId = '') {
  const admin = data.session.role === 'admin';
  const classrooms = data.classrooms.filter(classroom => !classroomId || classroom.id === classroomId);
  const classroomIds = new Set(classrooms.map(classroom => classroom.id));
  const students = data.students.filter(student => student.classroomId && classroomIds.has(student.classroomId));
  const studentIds = new Set(students.map(student => student.id));
  const assignments = data.assignments.filter(assignment => classroomIds.has(assignment.classroomId));
  const submissions = data.submissions.filter(submission => studentIds.has(submission.studentId));
  const hasTeacher = data.staff.some(person => person.role === 'teacher');
  const unassignedClass = admin ? classrooms.find(classroom => !classroom.teacherUserId) : undefined;
  const steps: EducatorJourneyStep[] = [
    ...(admin ? [{ id: 'accounts' as const, label: 'Cadastrar professor', detail: 'Crie o acesso da equipe.', complete: hasTeacher }] : []),
    { id: 'classes', label: 'Organizar turmas', detail: admin ? 'Defina a turma e o professor.' : 'Informe o nome e o ano escolar.', complete: classrooms.length > 0 && !unassignedClass },
    { id: 'students', label: 'Adicionar estudantes', detail: 'Entregue o código de entrada.', complete: students.length > 0 },
    { id: 'activities', label: 'Escolher atividade', detail: 'Envie uma proposta para a turma.', complete: assignments.length > 0 },
    { id: 'reports', label: 'Acompanhar resultados', detail: 'Veja as respostas e planeje o apoio.', complete: submissions.length > 0 },
  ];
  let current: EducatorStepId = 'reports';
  let title = 'Veja como cada estudante está aprendendo';
  let description = 'Confira as atividades realizadas. Use as respostas para decidir o que retomar ou qual será a próxima proposta.';
  let button = 'Ver resultados';
  let action: EducatorNextAction = { kind: 'navigate', section: 'reports' };

  if (admin && !hasTeacher) {
    current = 'accounts'; title = 'Comece pelo acesso do professor';
    description = 'Cadastre o professor que acompanhará a turma. Depois, vincule esse acesso à turma para que ele veja seus estudantes.';
    button = 'Cadastrar professor'; action = { kind: 'account' };
  } else if (!classrooms.length) {
    current = 'classes'; title = 'Crie sua primeira turma';
    description = 'Você só precisa informar o nome da turma e o ano escolar. No próximo passo, poderá adicionar os estudantes.';
    button = 'Criar turma'; action = { kind: 'class' };
  } else if (unassignedClass) {
    current = 'classes'; title = `Defina o professor de ${unassignedClass.name}`;
    description = 'Escolha quem acompanhará esta turma. O professor terá acesso aos estudantes e às atividades dela.';
    button = 'Vincular professor'; action = { kind: 'class', id: unassignedClass.id };
  } else if (!students.length) {
    current = 'students';
    const unattachedStudent = data.students.find(student => !student.classroomId);
    title = unattachedStudent ? `Vincule ${unattachedStudent.name.split(' ')[0]} a uma turma` : 'Agora, adicione os estudantes';
    description = unattachedStudent ? 'Este estudante já está cadastrado. Escolha a turma para receber atividades e aparecer no acompanhamento.' : 'Cadastre um estudante por vez. Ao salvar, você recebe o código que ele usará para entrar, sem precisar de e-mail.';
    button = unattachedStudent ? 'Escolher turma do estudante' : 'Adicionar estudante';
    action = { kind: 'student', classId: classrooms[0].id, ...(unattachedStudent ? { id: unattachedStudent.id } : {}) };
  } else if (!assignments.length) {
    current = 'activities'; title = 'Escolha a primeira atividade da turma';
    description = 'Abra o banco de atividades, veja uma proposta e escolha “Propor”. Depois, confirme a turma e o prazo.';
    button = 'Escolher atividade'; action = { kind: 'navigate', section: 'activities' };
  } else if (!submissions.length) {
    title = 'A atividade está pronta para os estudantes';
    description = 'Peça que entrem com seus códigos e abram “Atividades da turma”. As respostas aparecerão no acompanhamento depois da conclusão.';
    button = 'Ver estudantes e códigos'; action = { kind: 'navigate', section: 'classes' };
  }
  return { steps, current, title, description, button, action };
}
