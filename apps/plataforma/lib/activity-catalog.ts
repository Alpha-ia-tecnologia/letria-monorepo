import { activities, worlds, type Activity } from './content';
import { supplementalActivities, type BankArea, type BankFormat, type BankLevel } from './activity-bank';

/** The teaching library includes extensions; the island trail keeps its own sequence. */
export const activityCatalog: Activity[] = [...activities, ...supplementalActivities];
export const areaLabels: Record<BankArea, string> = {
  letters: 'Letras e alfabeto', sounds: 'Sons e rimas', words: 'Sílabas e palavras',
  sentences: 'Frases e escrita', reading: 'Leitura e interpretação', logic: 'Pensamento computacional',
};
export const formatLabels: Record<BankFormat, string> = {
  choice: 'Escolha uma resposta', completion: 'Complete a ideia', intruder: 'Encontre o intruso',
  'true-false': 'Verdadeiro ou falso', order: 'Coloque em ordem', multi: 'Selecione várias',
  match: 'Associe os pares', reading: 'Investigue o texto', logic: 'Resolva a lógica',
};
export const levelLabels: Record<BankLevel, string> = {
  beginner: 'Primeiras descobertas', developing: 'Em desenvolvimento', challenge: 'Novos desafios',
};
const builtinFormats: Record<string, BankFormat> = {
  'letras-4': 'completion', 'palavras-2': 'completion', 'frases-2': 'completion',
  'frases-3': 'reading', 'frases-4': 'completion', 'historias-1': 'reading',
  'historias-2': 'reading', 'historias-3': 'reading', 'historias-4': 'reading',
};
const areaForWorld: BankArea[] = ['letters', 'sounds', 'words', 'sentences', 'reading'];
export function getCatalogActivity(id: string): Activity | undefined {
  return activityCatalog.find(activity => activity.id === id);
}
export function getActivityMetadata(activity: Activity): {
  area: BankArea; format: BankFormat; level: BankLevel; objective: string; teacherTip: string;
} {
  const extra = supplementalActivities.find(item => item.id === activity.id);
  if (extra) return { area: extra.area, format: extra.format, level: extra.level, objective: extra.objective, teacherTip: extra.teacherTip };
  const type = activity.questions[0]?.type ?? activity.type;
  return {
    area: areaForWorld[activity.worldId - 1] ?? 'letters',
    format: builtinFormats[activity.id] ?? type,
    level: activity.worldId <= 2 ? 'beginner' : activity.worldId <= 4 ? 'developing' : 'challenge',
    objective: activity.description || activity.skill,
    teacherTip: 'Apresente o enunciado, dê tempo para a criança pensar e peça que explique sua escolha. Retome a explicação dos desafios que precisarem de apoio.',
  };
}
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
export function filterActivityCatalog(items: Activity[], filters: {
  search?: string; area?: string; format?: string; level?: string; worldId?: number;
} = {}): Activity[] {
  const terms = normalize(filters.search ?? '').split(/\s+/).filter(Boolean);
  return items.filter(activity => {
    const meta = getActivityMetadata(activity);
    if (filters.area && meta.area !== filters.area) return false;
    if (filters.format && meta.format !== filters.format) return false;
    if (filters.level && meta.level !== filters.level) return false;
    if (filters.worldId && activity.worldId !== filters.worldId) return false;
    const searchable = normalize([activity.title, activity.description, activity.skill, meta.objective,
      areaLabels[meta.area], formatLabels[meta.format], levelLabels[meta.level],
      worlds.find(world => world.id === activity.worldId)?.title ?? ''].join(' '));
    return terms.every(term => searchable.includes(term));
  });
}
