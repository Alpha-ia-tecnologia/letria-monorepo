import { WORLD_NAMES } from './journey';

export type WorldTheme = {
  id: number; name: string; shortName: string; image: string; accent: string; soft: string; sky: string;
  title: string; description: string; missionLabel: string; habitatLabel: string;
  habitatIntro: string; milestones: string[]; gameIntro: string; gameReward: string; positions: [number, number][];
};

export const WORLD_THEMES: WorldTheme[] = [
  {
    positions: [[55, 73], [34, 56], [62, 37], [48, 12]],
    id: 1, name: WORLD_NAMES[0], shortName: 'Letras', image: '/art/trail-island.png',
    accent: '#438e32', soft: '#edf9da', sky: '#48c0ef', title: 'Uma floresta que cresce com você',
    description: 'Entre pelas clareiras, descubra as letras e ajude a floresta a florescer. Cada conquista faz uma nova parte deste lugar ganhar vida.',
    missionLabel: 'Expedição pela floresta', habitatLabel: 'Sua floresta de descobertas', habitatIntro: 'A primeira semente está esperando por você.',
    milestones: ['A clareira ganhou seus primeiros brotos.', 'Uma ponte uniu as margens do riacho.', 'O jardim floresceu com novas letras.', 'A floresta cresceu e abriu a rota para os sons.'],
    gameIntro: 'Vamos encontrar letras pela floresta? Observe cada pista com calma.',
    gameReward: 'Sua descoberta ajuda a floresta a crescer!',
  },
  {
    positions: [[52, 69], [36, 39], [61, 27], [55, 13]],
    id: 2, name: WORLD_NAMES[1], shortName: 'Sons', image: '/art/ecosystem-sounds.png',
    accent: '#8854bd', soft: '#f4e9ff', sky: '#92c9ed', title: 'Um vale que encontra sua melodia',
    description: 'Ouça a cachoeira, explore a gruta dos ecos e descubra sons parecidos. Suas conquistas formam a melodia desta ilha.',
    missionLabel: 'Expedição dos pequenos ouvintes', habitatLabel: 'A orquestra do vale', habitatIntro: 'O vale espera pela primeira nota.',
    milestones: ['A cachoeira começou a cantar suas rimas.', 'A gruta ganhou novos ecos.', 'Os sons se encontraram na colina.', 'O vale está em festa: uma nova rota se abriu.'],
    gameIntro: 'Escute com atenção: cada som é uma pista para explorar este vale.',
    gameReward: 'O vale ganhou mais uma nota na sua melodia!',
  },
  {
    positions: [[51, 71.5], [38, 47.5], [62, 29.5], [54.5, 12.5]],
    id: 3, name: WORLD_NAMES[2], shortName: 'Palavras', image: '/art/ecosystem-words.png',
    accent: '#127da8', soft: '#e4f7ff', sky: '#40c5ee', title: 'Palavras que conectam pequenas ilhas',
    description: 'Junte sílabas como quem constrói pontes. Viaje pelas praias e acenda o farol para conectar novas descobertas.',
    missionLabel: 'Expedição de ilha em ilha', habitatLabel: 'Seu porto de palavras', habitatIntro: 'Uma pequena praia é o começo da viagem.',
    milestones: ['A praia ganhou um novo caminho de sílabas.', 'Uma ponte conectou as primeiras palavras.', 'O farol acendeu para guiar novas descobertas.', 'O porto está pronto para seguir até as montanhas.'],
    gameIntro: 'Cada sílaba é uma peça. Vamos juntar as peças e descobrir palavras?',
    gameReward: 'Mais uma ponte de palavras nasceu na sua ilha!',
  },
  {
    positions: [[56.5, 68.7], [32.5, 47], [60.5, 25.2], [48.5, 9.5]],
    id: 4, name: WORLD_NAMES[3], shortName: 'Frases', image: '/art/ecosystem-phrases.png',
    accent: '#b46e19', soft: '#fff2d4', sky: '#a1d9ed', title: 'Uma vila que chega cada vez mais alto',
    description: 'Suba pelos caminhos das frases, visite a praça da pontuação e encontre novas vistas. Sua leitura faz a vila crescer pela montanha.',
    missionLabel: 'Expedição até o alto da montanha', habitatLabel: 'Sua vila nas alturas', habitatIntro: 'A trilha começa no pé da montanha.',
    milestones: ['A primeira escadaria ligou as casas da vila.', 'A praça ganhou sinais e novas conversas.', 'O mirante revelou um horizonte de leitura.', 'A vila chegou ao alto e encontrou a rota do castelo.'],
    gameIntro: 'Vamos organizar as ideias e subir mais um trecho da montanha?',
    gameReward: 'Sua leitura abriu uma nova vista na montanha!',
  },
  {
    positions: [[57.5, 67.5], [37.5, 42.5], [63, 30], [50, 17]],
    id: 5, name: WORLD_NAMES[4], shortName: 'Histórias', image: '/art/ecosystem-stories.png',
    accent: '#9852a1', soft: '#fbe9fb', sky: '#b2b3f5', title: 'Um reino que floresce com histórias',
    description: 'Abra livros, descubra personagens e explore o observatório da imaginação. Cada história ilumina uma nova parte deste reino.',
    missionLabel: 'Expedição da imaginação', habitatLabel: 'Seu reino de histórias', habitatIntro: 'O primeiro livro está pronto para ser aberto.',
    milestones: ['A biblioteca abriu suas portas para novas histórias.', 'A torre se iluminou com novos personagens.', 'O observatório revelou um céu de imaginação.', 'O castelo está em festa: todo o arquipélago ganhou vida!'],
    gameIntro: 'Uma história guarda muitas descobertas. Vamos encontrar as pistas juntos?',
    gameReward: 'Mais uma parte do reino foi iluminada pela sua leitura!',
  },
];

export function getWorldTheme(worldId: number): WorldTheme {
  return WORLD_THEMES.find(theme => theme.id === worldId) ?? WORLD_THEMES[0];
}