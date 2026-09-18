import { activities, worlds } from './content';
import type { StudentProgress } from './pedagogy';

export const TERRITORY_NAMES = [
  'Clareira das Vogais', 'Ponte dos Primeiros Sons', 'Jardim do Alfabeto', 'Portal da Floresta',
  'Cachoeira das Rimas', 'Gruta dos Ecos', 'Colina dos Sons', 'Portal das Melodias',
  'Praia das Sílabas', 'Arquipélago das Palavras', 'Farol das Descobertas', 'Portal das Ilhas',
  'Escadaria das Frases', 'Praça da Pontuação', 'Pico da Leitura', 'Portal das Montanhas',
  'Biblioteca Encantada', 'Torre das Histórias', 'Observatório da Imaginação', 'Castelo das Conquistas',
];
export const WORLD_NAMES = ['Floresta das Letras', 'Vale dos Sons', 'Ilha das Palavras', 'Montanha das Frases', 'Castelo das Histórias'];
export function getJourney(progress: Pick<StudentProgress, 'rewardedActivityIds'>) {
  const solved = new Set(progress.rewardedActivityIds);
  let frontier = 0;
  while (frontier < activities.length && solved.has(activities[frontier].id)) frontier++;
  const nodes = activities.map((activity, index) => ({
    activity, index, title: TERRITORY_NAMES[index],
    status: (index < frontier ? 'completed' : index === frontier ? 'current' : 'locked') as 'completed' | 'current' | 'locked',
    practiced: solved.has(activity.id),
    portal: index === activities.length - 1 || activities[index + 1].worldId !== activity.worldId,
  }));
  return {
    nodes, completed: frontier, total: nodes.length, percent: Math.round(frontier / nodes.length * 100),
    next: nodes[frontier] ?? null,
    worlds: worlds.map(world => {
      const steps = nodes.filter(node => node.activity.worldId === world.id);
      return { world, steps, unlocked: steps[0].index <= frontier, completed: steps.every(step => step.status === 'completed') };
    }),
  };
}
