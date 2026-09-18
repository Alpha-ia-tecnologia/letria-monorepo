import type { ChallengeAnswer, ChallengeResult, ChallengeToken, CurriculumActivity, SchoolYear, SkillCode } from './computational-curriculum-types';

export const BNCC_SOURCE = 'https://basenacionalcomum.mec.gov.br/images/historico/anexo_parecer_cneceb_n_2_2022_bncc_computacao.pdf';

/** Recortes de prática: uma exploração não comprova o domínio integral da habilidade. */
export const BNCC_SKILLS: Record<SkillCode, { grade: SchoolYear; label: string; description: string }> = {
  EF01CO01: { grade: 1, label: 'Classificação', description: 'Agrupar objetos por características e explicar os critérios utilizados.' },
  EF01CO02: { grade: 1, label: 'Passos de referência', description: 'Seguir sequências de passos para resolver problemas.' },
  EF01CO03: { grade: 1, label: 'Sequências de passos', description: 'Criar e reorganizar passos, relacionando essas sequências a algoritmos.' },
  EF02CO01: { grade: 2, label: 'Atributos essenciais', description: 'Comparar modelos e identificar características essenciais dos objetos.' },
  EF02CO02: { grade: 2, label: 'Repetição definida', description: 'Criar e simular algoritmos com repetições de quantidade conhecida.' },
  EF03CO01: { grade: 3, label: 'Verdade e negação', description: 'Interpretar afirmações como verdadeiras ou falsas, incluindo sua negação.' },
  EF03CO02: { grade: 3, label: 'Repetição condicional', description: 'Criar e simular repetições controladas por condições.' },
  EF03CO03: { grade: 3, label: 'Decomposição', description: 'Resolver partes menores de um problema e combinar suas soluções.' },
  EF04CO01: { grade: 4, label: 'Matrizes', description: 'Representar informações em matrizes e acessar elementos por coordenadas.' },
  EF04CO02: { grade: 4, label: 'Registros', description: 'Organizar informações em registros e acessar seus campos.' },
  EF04CO03: { grade: 4, label: 'Repetições aninhadas', description: 'Criar e simular algoritmos com repetições dentro de repetições.' },
  EF05CO01: { grade: 5, label: 'Listas', description: 'Representar informações em listas de tamanho variável e manipular elementos.' },
  EF05CO02: { grade: 5, label: 'Grafos', description: 'Representar relações por grafos e percorrer suas conexões.' },
  EF05CO03: { grade: 5, label: 'E, OU e NÃO', description: 'Avaliar expressões com os operadores lógicos E, OU e NÃO.' },
  EF05CO04: { grade: 5, label: 'Seleção condicional', description: 'Criar e simular algoritmos que escolhem ações conforme condições.' },
};

export const CURRICULUM_IDS = [
  'shape-gardens', 'follow-the-trail', 'picnic-sequence', 'essential-backpack', 'bridge-repeat',
  'true-or-false', 'lighthouse-until', 'party-parts', 'seed-matrix', 'animal-record',
  'garden-loops', 'backpack-list', 'island-routes', 'logic-gates', 'water-decisions',
] as const;
export type CurriculumId = typeof CURRICULUM_IDS[number];

const token = (id: string, label: string, symbol: string): ChallengeToken => ({ id, label, symbol });

export const CURRICULUM_ACTIVITIES: readonly (CurriculumActivity & { id: CurriculumId })[] = [
  {
    id: 'shape-gardens', grade: 1, skill: 'EF01CO01', kind: 'classify',
    title: 'Jardins das formas', subtitle: 'Agrupar por uma característica',
    prompt: 'Organize as peças em dois jardins. Observe a forma: as cores podem ser diferentes!',
    hint: 'Uma peça redonda e outra redonda podem ficar juntas, mesmo que tenham cores diferentes.',
    concept: 'Você classificou as peças pela forma. A cor era outra característica, mas não era o critério destes jardins.',
    items: [token('red-circle', 'Círculo vermelho', '🔴'), token('blue-square', 'Quadrado azul', '🟦'), token('yellow-circle', 'Círculo amarelo', '🟡'), token('red-square', 'Quadrado vermelho', '🟥'), token('blue-circle', 'Círculo azul', '🔵'), token('yellow-square', 'Quadrado amarelo', '🟨')],
    groups: [token('circles', 'Círculos', '⚪'), token('squares', 'Quadrados', '⬜')],
    expected: { 'red-circle': 'circles', 'blue-square': 'squares', 'yellow-circle': 'circles', 'red-square': 'squares', 'blue-circle': 'circles', 'yellow-square': 'squares' },
  },
  {
    id: 'follow-the-trail', grade: 1, skill: 'EF01CO02', kind: 'sequence',
    title: 'Siga o guia da Lumi', subtitle: 'Seguir instruções na ordem',
    prompt: 'A Lumi deixou um guia para chegar ao piquenique. Monte seu caminho na mesma ordem do guia.',
    hint: 'Leia o guia da esquerda para a direita. Qual é a primeira parada? E a próxima?',
    concept: 'Você seguiu uma sequência de instruções. Cada passo tinha uma posição para levar ao destino.',
    items: [token('tree', 'Passar pela árvore', '🌳'), token('picnic', 'Chegar ao piquenique', '🧺'), token('bridge', 'Cruzar a ponte', '🌉'), token('camp', 'Sair do acampamento', '⛺')],
    reference: ['camp', 'bridge', 'tree', 'picnic'], expected: ['camp', 'bridge', 'tree', 'picnic'],
  },
  {
    id: 'picnic-sequence', grade: 1, skill: 'EF01CO03', kind: 'sequence',
    title: 'Receita do piquenique', subtitle: 'Organizar um pequeno algoritmo',
    prompt: 'Vamos servir frutas no piquenique! Organize os passos: lavar antes de cortar, cortar antes de servir e servir antes de comer.',
    hint: 'Pense no que precisa estar pronto antes de começar cada ação. Comer pode acontecer antes de servir?',
    concept: 'A ordem das ações muda o resultado. Você organizou um algoritmo para preparar e servir as frutas.',
    items: [token('serve', 'Servir as frutas cortadas', '🥣'), token('wash', 'Lavar as frutas', '🚿'), token('eat', 'Comer as frutas servidas', '😋'), token('cut', 'Um adulto corta as frutas', '🍎')],
    expected: ['wash', 'cut', 'serve', 'eat'],
  },
  {
    id: 'essential-backpack', grade: 2, skill: 'EF02CO01', kind: 'select',
    title: 'O que faz uma mochila?', subtitle: 'Comparar modelos e funções',
    prompt: 'Compare os dois modelos. Escolha apenas as características necessárias para guardar objetos e carregar a mochila nas costas.',
    hint: 'A mochila continua funcionando se mudar de cor? E se perder o espaço para os objetos ou as alças?',
    concept: 'Um modelo destaca características essenciais para uma função. Cores e enfeites podem mudar sem alterar essa função.',
    models: [
      { title: 'Mochila da Lumi', attributes: ['Cor roxa', 'Compartimento para objetos', 'Alças para carregar nas costas', 'Enfeite de estrela'] },
      { title: 'Mochila do explorador', attributes: ['Cor verde', 'Compartimento para objetos', 'Alças para carregar nas costas', 'Enfeite de folha'] },
    ],
    items: [token('purple', 'Ser sempre roxa', '🟣'), token('storage', 'Ter compartimento para objetos', '🎒'), token('star', 'Ter enfeite de estrela', '⭐'), token('straps', 'Ter alças para carregar nas costas', '🧍')],
    expected: ['storage', 'straps'],
  },
  {
    id: 'bridge-repeat', grade: 2, skill: 'EF02CO02', kind: 'repeat',
    title: 'Passos que se repetem', subtitle: 'Programar uma quantidade de repetições',
    prompt: 'O robô está na flor e quer chegar ao farol. Escolha a direção e quantas vezes ele deve dar um passo. Execute para conferir o caminho.',
    hint: 'Conte os deslocamentos entre a flor e o farol. A casa onde o robô começa não é um passo.',
    concept: 'O comando repetir permite escrever uma ação uma vez e executá-la uma quantidade definida de vezes.',
    track: [token('camp', 'Acampamento', '⛺'), token('flower', 'Flor', '🌼'), token('rock', 'Pedra', '🪨'), token('tree', 'Árvore', '🌳'), token('bridge', 'Ponte', '🌉'), token('lighthouse', 'Farol', '💡'), token('mountain', 'Montanha', '⛰️')],
    start: 1, target: 5, maxCount: 8,
  },
  {
    id: 'true-or-false', grade: 3, skill: 'EF03CO01', kind: 'truth',
    title: 'Detetives da verdade', subtitle: 'Investigar afirmações e negações',
    prompt: 'Observe os fatos: Lumi tem três sementes e a caixa azul está fechada. Marque cada afirmação como verdadeira ou falsa.',
    hint: 'Compare cada frase com os fatos. A palavra “não” pode inverter o que uma afirmação diz.',
    concept: 'Uma afirmação pode ser verdadeira ou falsa. Negar uma afirmação inverte seu valor lógico.',
    statements: [
      { id: 'three', label: 'Lumi tem três sementes.', expected: true },
      { id: 'two', label: 'Lumi tem duas sementes.', expected: false },
      { id: 'not-open', label: 'A caixa azul não está aberta.', expected: true },
      { id: 'not-three', label: 'Lumi não tem três sementes.', expected: false },
    ],
  },
  {
    id: 'lighthouse-until', grade: 3, skill: 'EF03CO02', kind: 'until',
    title: 'Até encontrar o farol', subtitle: 'Repetir até uma condição acontecer',
    prompt: 'Saia do acampamento e avance até o farol. Desta vez, o robô deve parar ao reconhecer um lugar, sem receber uma quantidade de passos.',
    hint: 'A condição é uma pergunta feita a cada parada: “Cheguei ao lugar escolhido?”. Se sim, o robô para.',
    concept: 'Esta repetição termina quando a condição escolhida é satisfeita. O robô verifica o lugar onde está antes de continuar.',
    track: [token('camp', 'Acampamento', '⛺'), token('tree', 'Árvore', '🌳'), token('river', 'Rio', '🌊'), token('flower', 'Flor', '🌼'), token('lighthouse', 'Farol', '💡'), token('mountain', 'Montanha', '⛰️')],
    start: 0, target: 4,
    stopOptions: [token('flower', 'Encontrar uma flor', '🌼'), token('lighthouse', 'Encontrar o farol', '💡'), token('mountain', 'Encontrar a montanha', '⛰️'), token('camp', 'Estar no acampamento', '⛺')],
  },
  {
    id: 'party-parts', grade: 3, skill: 'EF03CO03', kind: 'decompose',
    title: 'Uma horta em pequenas partes', subtitle: 'Resolver partes e combinar soluções',
    prompt: 'A terra está seca. Resolva três pequenos programas para criar a horta: ordene os passos de cada parte e depois combine as partes em um plano completo.',
    hint: 'Dentro de cada parte, pense no que vem antes. Depois combine: preparar o vaso, plantar a semente e cuidar da terra seca.',
    concept: 'Você resolveu problemas menores e combinou suas soluções na ordem certa. Essa estratégia se chama decomposição.',
    stages: [
      { id: 'care', title: 'Cuidar da semente plantada', items: [token('water', 'Regar a terra seca', '💧'), token('paint', 'Pintar as folhas', '🎨'), token('check', 'Verificar como está a terra', '🔎')], expected: ['check', 'water'] },
      { id: 'materials', title: 'Preparar o vaso', items: [token('soil', 'Colocar terra no vaso', '🟤'), token('balloon', 'Encher um balão', '🎈'), token('pot', 'Pegar um vaso vazio', '🪴')], expected: ['pot', 'soil'] },
      { id: 'plant', title: 'Plantar a semente', items: [token('cover', 'Cobrir a semente com terra', '🟤'), token('seed', 'Colocar a semente no buraco', '🌱'), token('hole', 'Abrir um buraco na terra', '🕳️')], expected: ['hole', 'seed', 'cover'] },
    ],
    expectedOrder: ['materials', 'plant', 'care'],
  },
  {
    id: 'seed-matrix', grade: 4, skill: 'EF04CO01', kind: 'matrix',
    title: 'Horta por coordenadas', subtitle: 'Ler e modificar uma matriz',
    prompt: 'Cada canteiro tem uma linha e uma coluna. Toque nas casas para plantar ou retirar sementes e cumpra as três mudanças.',
    hint: 'Comece localizando a linha na lateral e depois a coluna no alto. Linha 1, coluna 3 fica na primeira fileira.',
    concept: 'Uma matriz organiza informações em linhas e colunas. As duas coordenadas identificam uma posição sem ambiguidade.',
    rows: 3, columns: 4, initial: ['0,0', '1,1', '2,3'], target: ['0,2', '1,1', '2,0', '2,3'],
    tasks: ['Retire a semente da linha 1, coluna 1.', 'Plante na linha 1, coluna 3.', 'Plante na linha 3, coluna 1. Mantenha as outras sementes.'],
  },
  {
    id: 'animal-record', grade: 4, skill: 'EF04CO02', kind: 'record',
    title: 'A ficha do Mimo', subtitle: 'Consultar e atualizar campos',
    prompt: 'Mimo fez aniversário e mudou de ilha. Atualize somente os campos que mudaram na ficha dele.',
    hint: 'Cada campo guarda um tipo de informação. Procure idade e moradia; os outros dados continuam iguais.',
    concept: 'Um registro reúne campos sobre o mesmo objeto. Você consultou a ficha e atualizou campos específicos, preservando os demais.',
    fields: [
      { id: 'name', label: 'Nome', initial: 'Mimo', options: ['Mimo', 'Lumi', 'Téo'], expected: 'Mimo' },
      { id: 'age', label: 'Idade', initial: '2 anos', options: ['1 ano', '2 anos', '3 anos', '4 anos'], expected: '3 anos' },
      { id: 'island', label: 'Moradia', initial: 'Ilha da Floresta', options: ['Ilha da Floresta', 'Ilha do Rio', 'Ilha da Montanha'], expected: 'Ilha do Rio' },
      { id: 'food', label: 'Comida favorita', initial: 'Frutas', options: ['Frutas', 'Sementes', 'Folhas'], expected: 'Frutas' },
    ],
    tasks: ['Mimo tinha 2 anos e completou mais um: atualize a idade.', 'Ele agora mora na Ilha do Rio.', 'O nome e a comida favorita continuam iguais.'],
  },
  {
    id: 'garden-loops', grade: 4, skill: 'EF04CO03', kind: 'nested',
    title: 'Um jardim de repetições', subtitle: 'Repetir dentro de outra repetição',
    prompt: 'Programe uma horta com três fileiras e quatro flores em cada fileira. A repetição de fora cria as fileiras; a de dentro planta as flores.',
    hint: 'A cada volta da repetição de fora, a repetição de dentro começa de novo. Três fileiras com quatro flores formam doze posições.',
    concept: 'Um laço dentro de outro é uma repetição aninhada. A repetição interna se completa a cada execução da externa.',
    rows: 3, columns: 4, maxCount: 6,
  },
  {
    id: 'backpack-list', grade: 5, skill: 'EF05CO01', kind: 'list',
    title: 'A lista da expedição', subtitle: 'Inserir, retirar e reorganizar itens',
    prompt: 'A expedição mudou! Edite a lista da mochila: retire o brinquedo, inclua água e organize tudo na ordem pedida.',
    hint: 'Uma lista pode mudar de tamanho e de ordem. Depois de retirar e acrescentar itens, confira qual está em cada posição.',
    concept: 'Você manipulou uma lista: removeu, inseriu e reorganizou elementos. A posição de cada item também faz parte da informação.',
    items: [token('book', 'Livro', '📘'), token('apple', 'Maçã', '🍎'), token('toy', 'Brinquedo', '🧸'), token('water', 'Garrafa de água', '💧')],
    initial: ['book', 'apple', 'toy'], expected: ['apple', 'book', 'water'], maxItems: 6,
    tasks: ['Retire o brinquedo.', 'Inclua uma garrafa de água.', 'Deixe a maçã em primeiro, o livro em segundo e a água em terceiro. Use um de cada.'],
  },
  {
    id: 'island-routes', grade: 5, skill: 'EF05CO02', kind: 'graph',
    title: 'Pontes entre ilhas', subtitle: 'Explorar conexões e caminhos',
    prompt: 'Saia do porto, visite a biblioteca e termine na escola. Viaje apenas pelas pontes desenhadas. Existe mais de um caminho possível!',
    hint: 'Cada ilha é um ponto e cada ponte é uma conexão. Você pode passar pelo pomar ou pelo lago, desde que visite a biblioteca antes de terminar.',
    concept: 'O mapa é um grafo: ilhas representam pontos e pontes representam relações. Caminhos diferentes podem cumprir o mesmo objetivo.',
    nodes: [
      { ...token('port', 'Porto', '⛵'), x: 12, y: 50 },
      { ...token('orchard', 'Pomar', '🍎'), x: 36, y: 18 },
      { ...token('bridge', 'Ilha das Flores', '🌼'), x: 36, y: 82 },
      { ...token('library', 'Biblioteca', '📚'), x: 64, y: 18 },
      { ...token('lake', 'Lago', '🌊'), x: 64, y: 82 },
      { ...token('school', 'Escola', '🏫'), x: 88, y: 50 },
    ],
    edges: [['port', 'orchard'], ['port', 'bridge'], ['orchard', 'library'], ['bridge', 'lake'], ['library', 'lake'], ['library', 'school'], ['lake', 'school']],
    start: 'port', goal: 'school', via: ['library'], maxSteps: 7,
  },
  {
    id: 'logic-gates', grade: 5, skill: 'EF05CO03', kind: 'truth',
    title: 'O portão das ideias', subtitle: 'Combinar E, OU e NÃO',
    prompt: 'Lumi tem um mapa e uma lanterna, mas não tem uma chave. Use esses fatos para investigar as frases. No OU, basta uma parte verdadeira; as duas também podem ser verdadeiras.',
    hint: 'E precisa das duas partes verdadeiras. OU precisa de pelo menos uma. NÃO inverte o valor da afirmação.',
    concept: 'Você combinou valores lógicos. O OU é inclusivo: continua verdadeiro quando as duas partes são verdadeiras.',
    statements: [
      { id: 'and-both', label: 'Lumi tem mapa E tem lanterna.', expected: true },
      { id: 'and-one', label: 'Lumi tem mapa E tem chave.', expected: false },
      { id: 'or-both', label: 'Lumi tem mapa OU tem lanterna.', expected: true },
      { id: 'or-one', label: 'Lumi tem chave OU tem lanterna.', expected: true },
      { id: 'not-map', label: 'Lumi NÃO tem mapa.', expected: false },
      { id: 'not-key', label: 'Lumi NÃO tem chave.', expected: true },
    ],
  },
  {
    id: 'water-decisions', grade: 5, skill: 'EF05CO04', kind: 'branch',
    title: 'Regar ou esperar?', subtitle: 'Programar uma escolha condicional',
    prompt: 'Crie uma regra para todos os vasos: se a terra estiver seca, regue; senão, espere. Escolha as ações e execute seu programa em cada vaso.',
    hint: 'O robô decide novamente em cada vaso. A mesma regra pode produzir ações diferentes, porque a terra pode estar seca ou úmida.',
    concept: 'Uma condição escolhe qual ação executar. O programa usa SE e SENÃO e aplica a regra a todos os vasos.',
    cases: [
      { id: 'sunflower', label: 'Girassol', dry: true },
      { id: 'mint', label: 'Hortelã', dry: false },
      { id: 'fern', label: 'Samambaia', dry: false },
      { id: 'carrot', label: 'Cenoura', dry: true },
    ],
  },
];

const result = (correct: boolean, message: string, trace?: string[]): ChallengeResult => ({ correct, message, ...(trace ? { trace } : {}) });
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 100 && value.every((item) => typeof item === 'string');
const sameOrder = (actual: readonly string[], expected: readonly string[]) => actual.length === expected.length && actual.every((item, index) => item === expected[index]);
const unique = (items: readonly string[]) => new Set(items).size === items.length;
const knownItems = (actual: readonly string[], items: readonly ChallengeToken[]) => actual.every((id) => items.some((item) => item.id === id));
const sameSet = (actual: readonly string[], expected: readonly string[]) => unique(actual) && actual.length === expected.length && expected.every((id) => actual.includes(id));
const exactKeys = (actual: Record<string, unknown>, expected: readonly string[]) => Object.keys(actual).length === expected.length && expected.every((id) => Object.hasOwn(actual, id));
const integer = (value: unknown, maximum: number): number | null => {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
};

export function evaluateChallenge(activity: CurriculumActivity, answer: ChallengeAnswer): ChallengeResult {
  if (!record(answer)) return result(false, 'Escolha suas respostas para experimentar o desafio.');

  switch (activity.kind) {
    case 'classify': {
      if (!record(answer.groups) || !exactKeys(answer.groups, activity.items.map(({ id }) => id))) return result(false, 'Escolha um jardim para cada peça antes de conferir.');
      if (!Object.values(answer.groups).every((group) => activity.groups.some(({ id }) => id === group))) return result(false, 'Use os jardins apresentados para organizar todas as peças.');
      const correct = activity.items.every(({ id }) => answer.groups?.[id] === activity.expected[id]);
      return result(correct, correct ? 'Os jardins estão organizados pela forma! Círculos e quadrados encontraram seus grupos.' : 'Algumas peças ficaram em um grupo de outra forma. Observe os contornos e tente novamente.');
    }
    case 'sequence': {
      if (!strings(answer.sequence) || !knownItems(answer.sequence, activity.items)) return result(false, 'Monte sua sequência usando os passos disponíveis.');
      if (answer.sequence.length !== activity.expected.length) return result(false, `Seu plano precisa de ${activity.expected.length} passos. Confira se falta algum.`);
      const correct = sameOrder(answer.sequence, activity.expected);
      return result(correct, correct ? 'Os passos formam um caminho completo e estão na ordem certa!' : activity.reference ? 'Compare seu caminho com o guia, uma parada de cada vez.' : 'Um passo aconteceu antes de estar pronto. Confira o que precisa acontecer primeiro.');
    }
    case 'select': {
      if (!strings(answer.selected) || !unique(answer.selected) || !knownItems(answer.selected, activity.items)) return result(false, 'Escolha cada característica apenas uma vez entre as opções.');
      if (!answer.selected.length) return result(false, 'Escolha as características que fazem a mochila cumprir sua função.');
      const correct = sameSet(answer.selected, activity.expected);
      return result(correct, correct ? 'Você encontrou as características essenciais para guardar e carregar os objetos!' : 'Compare a função das duas mochilas. Alguma escolha é só um enfeite? Alguma parte necessária ficou de fora?');
    }
    case 'truth': {
      if (!record(answer.truths) || !exactKeys(answer.truths, activity.statements.map(({ id }) => id)) || !Object.values(answer.truths).every((value) => typeof value === 'boolean')) return result(false, 'Marque verdadeiro ou falso em todas as afirmações.');
      const incorrect = activity.statements.find(({ id, expected }) => answer.truths?.[id] !== expected);
      return incorrect ? result(false, `Releia esta afirmação e compare com os fatos: “${incorrect.label}”`) : result(true, 'Todas as afirmações foram investigadas! Você usou os fatos para decidir seus valores lógicos.');
    }
    case 'repeat': {
      const parameters = record(answer.parameters) ? answer.parameters : {};
      const count = integer(parameters.count, activity.maxCount);
      if (count === null) return result(false, `Escolha de 1 a ${activity.maxCount} repetições inteiras.`);
      if (parameters.direction !== 'forward' && parameters.direction !== 'back') return result(false, 'Escolha para qual lado o robô deve dar seus passos.');
      const increment = parameters.direction === 'forward' ? 1 : -1;
      let position = activity.start;
      const trace = [`Início: ${activity.track[position].label}.`];
      for (let step = 1; step <= count; step += 1) {
        const next = position + increment;
        if (next < 0 || next >= activity.track.length) return result(false, `No passo ${step}, o robô tentaria sair da trilha. Ajuste a direção ou a quantidade.`, [...trace, `Passo ${step}: fora da trilha; execução interrompida.`]);
        position = next;
        trace.push(`Passo ${step}: ${activity.track[position].label}.`);
      }
      return result(position === activity.target, position === activity.target ? 'O robô chegou ao farol usando a repetição que você programou!' : `O robô parou em ${activity.track[position].label}. Conte os deslocamentos para terminar no farol.`, trace);
    }
    case 'until': {
      const parameters = record(answer.parameters) ? answer.parameters : {};
      if (parameters.direction !== 'forward' && parameters.direction !== 'back') return result(false, 'Escolha a direção em que o robô vai caminhar.');
      if (typeof parameters.stop !== 'string' || !activity.stopOptions.some(({ id }) => id === parameters.stop)) return result(false, 'Escolha qual lugar faz o robô parar.');
      const increment = parameters.direction === 'forward' ? 1 : -1;
      let position = activity.start;
      const trace = [`Início: ${activity.track[position].label}.`];
      while (activity.track[position].id !== parameters.stop) {
        trace.push(`${activity.track[position].label}: a condição ainda não aconteceu; dar mais um passo.`);
        const next = position + increment;
        if (next < 0 || next >= activity.track.length) return result(false, 'A trilha terminou antes de encontrar a condição escolhida. Confira a direção e o lugar de parada.', [...trace, 'Fim da trilha; execução interrompida.']);
        position = next;
      }
      trace.push(`${activity.track[position].label}: condição satisfeita; parar.`);
      return result(position === activity.target, position === activity.target ? 'A condição fez o robô parar exatamente no farol!' : `A condição mandou parar em ${activity.track[position].label}. O destino pedido era o farol.`, trace);
    }
    case 'decompose': {
      if (!record(answer.stages) || !exactKeys(answer.stages, activity.stages.map(({ id }) => id))) return result(false, 'Resolva cada parte da horta e depois organize as etapas.');
      for (const stage of activity.stages) {
        const choices: unknown = answer.stages[stage.id];
        if (!strings(choices) || !unique(choices) || !knownItems(choices, stage.items) || !sameOrder(choices, stage.expected)) return result(false, `Revise a parte “${stage.title}”: organize os passos necessários na ordem em que podem acontecer.`);
      }
      if (!strings(answer.sequence) || !sameOrder(answer.sequence, activity.expectedOrder)) return result(false, 'As partes estão resolvidas! Agora combine as etapas: os materiais precisam estar prontos antes de plantar, e os cuidados vêm depois.');
      const trace = answer.sequence.flatMap((id, index) => {
        const stage = activity.stages.find((item) => item.id === id)!;
        return [`Parte ${index + 1}: ${stage.title}.`, ...answer.stages![id].map((stepId, stepIndex) => `  ${stepIndex + 1}. ${stage.items.find((item) => item.id === stepId)!.label}.`)];
      });
      return result(true, 'Você resolveu cada parte e reuniu as soluções em um plano completo para a horta!', trace);
    }
    case 'matrix': {
      if (!strings(answer.grid) || !unique(answer.grid)) return result(false, 'Use as casas do canteiro para indicar as sementes, sem repetir posições.');
      const valid = answer.grid.every((id) => {
        const match = /^(0|[1-9]\d*),(0|[1-9]\d*)$/.exec(id);
        return match !== null && Number(match[1]) < activity.rows && Number(match[2]) < activity.columns;
      });
      if (!valid) return result(false, 'Uma posição está fora do canteiro. Use as linhas e colunas mostradas.');
      const correct = sameSet(answer.grid, activity.target);
      return result(correct, correct ? 'As sementes estão nas coordenadas pedidas, e as outras foram preservadas!' : 'Confira as três mudanças pelas coordenadas e mantenha as sementes que não foram mencionadas.');
    }
    case 'record': {
      if (!record(answer.fields) || !exactKeys(answer.fields, activity.fields.map(({ id }) => id))) return result(false, 'Preencha todos os campos da ficha do Mimo.');
      if (!activity.fields.every(({ id, options }) => typeof answer.fields?.[id] === 'string' && options.includes(answer.fields[id]))) return result(false, 'Use as opções apresentadas em cada campo da ficha.');
      const incorrect = activity.fields.find(({ id, expected }) => answer.fields?.[id] !== expected);
      return incorrect ? result(false, `Confira o campo “${incorrect.label}” com as novidades sobre o Mimo.`) : result(true, 'Ficha atualizada! Você mudou os campos necessários e preservou as outras informações.');
    }
    case 'nested': {
      const parameters = record(answer.parameters) ? answer.parameters : {};
      const rows = integer(parameters.rows, activity.maxCount);
      const columns = integer(parameters.columns, activity.maxCount);
      if (rows === null || columns === null) return result(false, `Escolha de 1 a ${activity.maxCount} repetições para cada laço.`);
      const trace: string[] = [];
      for (let row = 1; row <= rows; row += 1) {
        trace.push(`Repetição de fora ${row}: começar a fileira ${row}.`);
        for (let column = 1; column <= columns; column += 1) trace.push(`Repetição de dentro ${column}: plantar na linha ${row}, coluna ${column}.`);
      }
      const correct = rows === activity.rows && columns === activity.columns;
      return result(correct, correct ? `Jardim completo: ${rows} fileiras com ${columns} flores em cada uma, totalizando ${rows * columns} flores!` : `Seu programa criou ${rows} fileiras com ${columns} flores em cada uma. O pedido era ${activity.rows} fileiras com ${activity.columns} flores; a organização também importa.`, trace);
    }
    case 'list': {
      if (!strings(answer.sequence) || !knownItems(answer.sequence, activity.items) || answer.sequence.length > activity.maxItems) return result(false, 'Edite a lista usando os itens disponíveis e o limite de espaços.');
      if (!unique(answer.sequence)) return result(false, 'Esta expedição precisa de apenas um de cada item. Retire os repetidos.');
      const correct = sameOrder(answer.sequence, activity.expected);
      return result(correct, correct ? 'Lista pronta! Você retirou, acrescentou e organizou os itens nas posições pedidas.' : 'Confira os itens que devem sair e entrar. Depois compare a primeira, a segunda e a terceira posição com as instruções.');
    }
    case 'graph': {
      if (!strings(answer.path) || answer.path.length < 1 || !knownItems(answer.path, activity.nodes)) return result(false, 'Comece no porto e escolha as próximas ilhas do caminho.');
      if (answer.path[0] !== activity.start) return result(false, 'O caminho precisa começar no porto.');
      if (answer.path.length - 1 > activity.maxSteps) return result(false, `Procure um caminho com até ${activity.maxSteps} travessias.`);
      const trace = [activity.nodes.find(({ id }) => id === activity.start)!.label];
      for (let index = 1; index < answer.path.length; index += 1) {
        const previous = answer.path[index - 1];
        const next = answer.path[index];
        const connected = activity.edges.some(([from, to]) => (from === previous && to === next) || (from === next && to === previous));
        if (!connected) return result(false, 'Duas ilhas do seu caminho não têm uma ponte entre elas. Volte ao último ponto conectado.', trace);
        trace.push(activity.nodes.find(({ id }) => id === next)!.label);
      }
      if (answer.path.at(-1) !== activity.goal) return result(false, 'Seu caminho usa as pontes! Continue até terminar na escola.', trace);
      if (!activity.via.every((id) => answer.path!.slice(0, -1).includes(id))) return result(false, 'Você chegou à escola, mas precisa visitar a biblioteca antes de terminar.', trace);
      return result(true, 'Caminho encontrado! Você visitou a biblioteca e chegou à escola usando as conexões do mapa.', trace);
    }
    case 'branch': {
      const parameters = record(answer.parameters) ? answer.parameters : {};
      if (![parameters.dry, parameters.wet].every((action) => action === 'water' || action === 'skip')) return result(false, 'Escolha uma ação para terra seca e outra para terra úmida.');
      const trace = activity.cases.map(({ label, dry }) => `${label}: terra ${dry ? 'seca' : 'úmida'} → ${parameters[dry ? 'dry' : 'wet'] === 'water' ? 'regar' : 'esperar'}.`);
      const correct = activity.cases.every(({ dry }) => parameters[dry ? 'dry' : 'wet'] === (dry ? 'water' : 'skip'));
      return result(correct, correct ? 'A regra cuidou de todos os vasos: regou a terra seca e esperou onde já estava úmida!' : 'Acompanhe as decisões do programa. Terra seca precisa de água; terra úmida deve esperar.', trace);
    }
    default:
      return result(false, 'Não foi possível conferir este desafio. Abra a exploração novamente.');
  }
}
