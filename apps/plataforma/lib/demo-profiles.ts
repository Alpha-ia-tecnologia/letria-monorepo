import type { Role } from './types';

// Public names of each demonstration profile, as used in `/plataforma?demo=1&perfil=…`.
export const demoProfiles = [
  { perfil: 'estudante', role: 'student' },
  { perfil: 'professor', role: 'teacher' },
  { perfil: 'responsavel', role: 'guardian' },
  { perfil: 'gestao', role: 'admin' },
] as const satisfies readonly { perfil: string; role: Role }[];

export const demoRoleFor = (perfil: unknown): Role | undefined => demoProfiles.find(profile => profile.perfil === perfil)?.role;
