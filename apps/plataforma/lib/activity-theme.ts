import type { Activity } from './content';
import { getActivityMetadata } from './activity-catalog';
import { getWorldTheme, type WorldTheme } from './world-themes';

const logicTheme: WorldTheme = {
  ...getWorldTheme(3), id: 6, name: 'Ilha da Lógica', shortName: 'Lógica',
  image: '/art/ecosystem-logic.png', accent: '#277e78', soft: '#e2f8f0', sky: '#8adfd9',
  title: 'Pequenas ideias, grandes descobertas',
  description: 'Explore padrões, organize instruções e descubra como resolver problemas por partes.',
  missionLabel: 'Expedição do pensamento computacional', habitatLabel: 'Seu laboratório de ideias',
  habitatIntro: 'Uma nova ideia é o começo da descoberta.',
  gameIntro: 'Vamos descobrir uma estratégia? Observe as pistas, organize seus passos e teste suas ideias.',
  gameReward: 'Você experimentou uma nova maneira de resolver problemas!',
};

export function getActivityTheme(activity: Activity): WorldTheme {
  return getActivityMetadata(activity).area === 'logic' ? logicTheme : getWorldTheme(activity.worldId);
}
