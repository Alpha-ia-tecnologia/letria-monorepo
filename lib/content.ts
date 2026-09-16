export type Question = {
  id: string;
  type: "choice" | "order";
  prompt: string;
  stimulus?: string;
  options: string[];
  answer: string | string[];
  explanation: string;
  audioText?: string;
  visual?: string;
  worldId?: number;
};

export type World = {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  color: string;
  icon: string;
  skill: string;
};

export type Activity = {
  id: string;
  worldId: number;
  title: string;
  description: string;
  type: "choice" | "order";
  durationMinutes: number;
  xp: number;
  skill: string;
  questions: Question[];
};

export const worlds: World[] = [
  { id: 1, slug: "bosque-das-letras", title: "Bosque das Letras", subtitle: "Toda aventura começa com um som", description: "Explore as letras, reconheça vogais e descubra os sons que começam as palavras.", color: "#83CC79", icon: "🌳", skill: "Letras e sons" },
  { id: 2, slug: "vale-das-rimas", title: "Vale das Rimas", subtitle: "Ouça, compare e encontre", description: "Brinque com rimas, sons iniciais e pedacinhos sonoros das palavras.", color: "#B697F3", icon: "🎵", skill: "Consciência fonológica" },
  { id: 3, slug: "ilhas-das-palavras", title: "Ilhas das Palavras", subtitle: "Junte os pedacinhos da descoberta", description: "Conecte sílabas, monte palavras e descubra o que cada uma quer dizer.", color: "#6AC4DF", icon: "🏝️", skill: "Sílabas e palavras" },
  { id: 4, slug: "cidade-das-frases", title: "Cidade das Frases", subtitle: "Suas palavras ganham uma história", description: "Organize frases, escolha a pontuação e leia com sentido, no seu tempo.", color: "#F5BA69", icon: "🏰", skill: "Frases e fluência" },
  { id: 5, slug: "galaxia-das-historias", title: "Galáxia das Histórias", subtitle: "Leia o mundo e imagine além", description: "Viaje por pequenos textos, encontre pistas e compreenda as histórias.", color: "#F296AE", icon: "🚀", skill: "Textos e compreensão" },
];

function choice(id: string, prompt: string, options: string[], answer: string, explanation: string, extra: Partial<Question> = {}): Question {
  return { id, type: "choice", prompt, options, answer, explanation, ...extra };
}

function order(id: string, prompt: string, options: string[], answer: string[], explanation: string, extra: Partial<Question> = {}): Question {
  return { id, type: "order", prompt, options, answer, explanation, ...extra };
}

function activity(id: string, worldId: number, title: string, description: string, questions: Question[]): Activity {
  return { id, worldId, title, description, type: questions[0].type, durationMinutes: 4, xp: 50, skill: worlds[worldId - 1].skill, questions };
}

export const activities: Activity[] = [
  activity("letras-1", 1, "O despertar das vogais", "Ajude a corujinha a encontrar as cinco vogais escondidas no bosque.", [
    choice("l1-1", "Qual letra começa a palavra ABELHA?", ["E", "A", "I", "O"], "A", "ABELHA começa com A. Fale devagar: A-be-lha!", { visual: "🐝", stimulus: "ABELHA", audioText: "Abelha. Qual letra começa a palavra abelha?" }),
    choice("l1-2", "Qual letra começa a palavra ELEFANTE?", ["A", "O", "E", "U"], "E", "ELEFANTE começa com E. Essa letra é uma vogal.", { visual: "🐘", stimulus: "ELEFANTE" }),
    choice("l1-3", "Qual letra começa a palavra ILHA?", ["U", "I", "A", "E"], "I", "ILHA começa com a vogal I.", { visual: "🏝️", stimulus: "ILHA" }),
    choice("l1-4", "Qual letra começa a palavra OVO?", ["E", "U", "O", "A"], "O", "A primeira letra de OVO é O.", { visual: "🥚", stimulus: "OVO" }),
    choice("l1-5", "Qual letra começa a palavra UVA?", ["I", "A", "E", "U"], "U", "UVA começa com U. Agora você encontrou todas as vogais!", { visual: "🍇", stimulus: "UVA" }),
  ]),
  activity("letras-2", 1, "Pegadas de letras", "Reconheça a mesma letra em seus jeitos maiúsculo e minúsculo.", [
    choice("l2-1", "Qual é a forma minúscula da letra A?", ["e", "a", "o", "u"], "a", "A e a são a mesma letra: a vogal A.", { stimulus: "A" }),
    choice("l2-2", "Qual é a forma maiúscula da letra m?", ["N", "W", "M", "V"], "M", "m e M representam a mesma letra, que aparece em MALA.", { stimulus: "m" }),
    choice("l2-3", "Encontre a letra B maiúscula.", ["P", "D", "R", "B"], "B", "B é a letra que começa BOLA.", { stimulus: "b" }),
    choice("l2-4", "Qual é a forma minúscula da letra F?", ["t", "f", "l", "p"], "f", "F e f são a mesma letra. FLOR começa com F.", { stimulus: "F" }),
    choice("l2-5", "Qual par mostra a mesma letra?", ["P e b", "L e i", "T e t", "N e m"], "T e t", "T e t são as formas maiúscula e minúscula da mesma letra."),
  ]),
  activity("letras-3", 1, "Sons do bosque", "Descubra qual letra abre o caminho de cada palavra.", [
    choice("l3-1", "Qual letra começa SAPO?", ["F", "S", "M", "L"], "S", "SAPO começa com S. Escute o começo: sssapo.", { visual: "🐸", stimulus: "SAPO", audioText: "Sapo. Qual letra começa sapo?" }),
    choice("l3-2", "Qual letra começa MALA?", ["N", "B", "M", "P"], "M", "MALA começa com M. Fale: ma-la.", { visual: "🧳", stimulus: "MALA" }),
    choice("l3-3", "Qual letra começa FADA?", ["V", "L", "T", "F"], "F", "FADA começa com F, assim como FITA.", { visual: "🧚", stimulus: "FADA" }),
    choice("l3-4", "Qual letra começa LUA?", ["R", "L", "P", "T"], "L", "LUA começa com L, assim como LUPA.", { visual: "🌙", stimulus: "LUA" }),
    choice("l3-5", "Qual letra começa PATO?", ["B", "D", "P", "T"], "P", "PATO começa com P. Preste atenção no movimento dos lábios ao falar.", { visual: "🦆", stimulus: "PATO" }),
  ]),
  activity("letras-4", 1, "O tesouro do alfabeto", "Complete palavras e encontre letras entre as folhas.", [
    choice("l4-1", "Qual vogal completa a palavra B_LA?", ["I", "E", "O", "U"], "O", "B + O + L + A forma BOLA.", { visual: "⚽", stimulus: "B_LA", audioText: "Bola. Qual vogal está faltando na palavra bola?" }),
    choice("l4-2", "Qual letra está no final de SOL?", ["S", "O", "L", "A"], "L", "SOL tem três letras. A última é L.", { visual: "☀️", stimulus: "SOL" }),
    choice("l4-3", "Qual destas letras é uma vogal?", ["M", "T", "E", "P"], "E", "E é uma vogal. As cinco vogais são A, E, I, O, U."),
    choice("l4-4", "Qual letra aparece duas vezes em ARARA?", ["R", "B", "L", "M"], "R", "ARARA tem dois R e três A. Observe cada posição.", { visual: "🦜", stimulus: "ARARA" }),
    choice("l4-5", "Qual palavra começa com a letra T?", ["BOLA", "SAPO", "MALA", "TATU"], "TATU", "TATU começa com T. Você já reconhece muitas letras!", { stimulus: "T" }),
  ]),
  activity("rimas-1", 2, "Duetos que rimam", "Encontre palavras com finais que soam parecidos.", [
    choice("r1-1", "Qual palavra rima com GATO?", ["BOLA", "PATO", "LUA", "MESA"], "PATO", "GATO e PATO terminam com o mesmo som: ato.", { visual: "🐱", stimulus: "GATO" }),
    choice("r1-2", "Qual palavra rima com MÃO?", ["PÉ", "SOL", "PÃO", "CASA"], "PÃO", "MÃO e PÃO têm o mesmo som no final: ão.", { visual: "✋", stimulus: "MÃO" }),
    choice("r1-3", "Qual palavra rima com JANELA?", ["BONECA", "SAPATO", "PANELA", "CADERNO"], "PANELA", "JANELA e PANELA rimam: o final das duas soa como ela.", { stimulus: "JANELA" }),
    choice("r1-4", "Qual palavra rima com BALÃO?", ["FOGUETE", "CORAÇÃO", "BICICLETA", "LIVRO"], "CORAÇÃO", "BALÃO e CORAÇÃO terminam com o som ão.", { visual: "🎈", stimulus: "BALÃO" }),
    choice("r1-5", "Qual palavra rima com FLOR?", ["AMOR", "FOLHA", "FRUTA", "FITA"], "AMOR", "FLOR e AMOR têm o mesmo som final: or.", { visual: "🌸", stimulus: "FLOR" }),
  ]),
  activity("rimas-2", 2, "Ecos do começo", "Ouça o primeiro som e descubra os pares.", [
    choice("r2-1", "Qual palavra começa com o mesmo som de FACA?", ["VACA", "SACO", "FITA", "MALA"], "FITA", "FACA e FITA começam com o som da letra F.", { stimulus: "FACA" }),
    choice("r2-2", "Qual palavra começa com o mesmo som de MESA?", ["MOLA", "BOLA", "VELA", "TELA"], "MOLA", "MESA e MOLA começam com o som da letra M.", { stimulus: "MESA" }),
    choice("r2-3", "Qual palavra começa com o mesmo som de SAPO?", ["PATO", "GATO", "FADA", "SUCO"], "SUCO", "SAPO e SUCO começam com o som da letra S.", { stimulus: "SAPO" }),
    choice("r2-4", "Qual palavra começa com o mesmo som de VELA?", ["FITA", "VIDA", "LATA", "PIPA"], "VIDA", "VELA e VIDA começam com o som da letra V.", { stimulus: "VELA" }),
    choice("r2-5", "Qual palavra começa com o mesmo som de LUA?", ["RUA", "UVA", "LUPA", "PENA"], "LUPA", "LUA e LUPA começam com o som da letra L.", { visual: "🌙", stimulus: "LUA" }),
  ]),
  activity("rimas-3", 2, "Palmas para as palavras", "Fale em voz alta e conte os pedacinhos que você ouve.", [
    choice("r3-1", "Quantos pedacinhos você ouve em SAPO? Fale: SA-PO.", ["1", "2", "3", "4"], "2", "SA-PO tem duas sílabas. Você pode bater uma palma para cada uma.", { visual: "🐸", stimulus: "SA · PO" }),
    choice("r3-2", "Quantas sílabas tem BANANA?", ["1", "2", "3", "4"], "3", "BA-NA-NA tem três sílabas.", { visual: "🍌", stimulus: "BANANA" }),
    choice("r3-3", "Quantas sílabas tem PÉ?", ["1", "2", "3", "4"], "1", "PÉ tem apenas uma sílaba. Uma palma só!", { visual: "🦶", stimulus: "PÉ" }),
    choice("r3-4", "Quantas sílabas tem BORBOLETA?", ["2", "3", "4", "5"], "4", "BOR-BO-LE-TA tem quatro sílabas.", { visual: "🦋", stimulus: "BORBOLETA" }),
    choice("r3-5", "Qual palavra tem duas sílabas?", ["SOL", "BONECA", "PATO", "ABACAXI"], "PATO", "PA-TO tem duas sílabas. SOL tem uma, BO-NE-CA três e A-BA-CA-XI quatro."),
  ]),
  activity("rimas-4", 2, "A ponte dos sons", "Encontre o som que muda e atravesse o vale.", [
    choice("r4-1", "Troque o primeiro som de PATO pelo som de G. Que palavra aparece?", ["GATO", "RATO", "MATO", "SAPO"], "GATO", "Ao trocar P por G, PATO vira GATO.", { stimulus: "PATO → ?" }),
    choice("r4-2", "Qual palavra NÃO rima com as outras?", ["GATO", "PATO", "RATO", "MESA"], "MESA", "GATO, PATO e RATO rimam. MESA tem um final diferente."),
    choice("r4-3", "O que sobra ao tirar BO de BOLA?", ["BA", "LA", "LO", "OL"], "LA", "BO-LA tem duas sílabas. Tirando BO, sobra LA.", { stimulus: "BO · LA" }),
    choice("r4-4", "Qual palavra começa com a sílaba de MALA?", ["MESA", "MOLA", "MAPA", "MICO"], "MAPA", "MALA e MAPA começam com a mesma sílaba: MA.", { stimulus: "MA · LA" }),
    choice("r4-5", "Junte os sons: PA + TO. Que palavra você ouviu?", ["PATO", "POTE", "TAPA", "PIPA"], "PATO", "PA junto com TO forma PATO.", { visual: "🦆", stimulus: "PA + TO" }),
  ]),
  activity("palavras-1", 3, "Oficina de palavras", "Junte as sílabas para construir palavras novas.", [
    order("p1-1", "Monte a palavra BOLA.", ["LA", "BO"], ["BO", "LA"], "BO + LA = BOLA. Leia a palavra inteira!", { visual: "⚽", stimulus: "BOLA" }),
    order("p1-2", "Monte a palavra SAPO.", ["PO", "SA"], ["SA", "PO"], "SA + PO = SAPO.", { visual: "🐸", stimulus: "SAPO" }),
    order("p1-3", "Monte a palavra PIPA.", ["PA", "PI"], ["PI", "PA"], "PI + PA = PIPA.", { visual: "🪁", stimulus: "PIPA" }),
    order("p1-4", "Monte a palavra BONECA.", ["CA", "BO", "NE"], ["BO", "NE", "CA"], "BO + NE + CA = BONECA.", { visual: "🧸", stimulus: "BONECA" }),
    order("p1-5", "Monte a palavra TOMATE.", ["TE", "TO", "MA"], ["TO", "MA", "TE"], "TO + MA + TE = TOMATE.", { visual: "🍅", stimulus: "TOMATE" }),
  ]),
  activity("palavras-2", 3, "Sílabas perdidas", "Encontre o pedacinho que falta em cada palavra.", [
    choice("p2-1", "Complete a palavra CA__ para formar o nome de uma moradia.", ["SA", "PO", "TA", "MA"], "SA", "CA + SA = CASA. A casa é uma moradia.", { visual: "🏠", stimulus: "CA __" }),
    choice("p2-2", "Complete __LA para formar o nome de um objeto de viagem.", ["PA", "BO", "MA", "VE"], "MA", "MA + LA = MALA. Usamos a mala para guardar roupas em viagens.", { visual: "🧳", stimulus: "__ LA" }),
    choice("p2-3", "Complete BO__CA para formar o nome do brinquedo.", ["NA", "NE", "NI", "NO"], "NE", "BO + NE + CA = BONECA.", { stimulus: "BO __ CA" }),
    choice("p2-4", "Complete SA__TO para formar o nome do que usamos nos pés.", ["PO", "PI", "PE", "PA"], "PA", "SA + PA + TO = SAPATO.", { visual: "👟", stimulus: "SA __ TO" }),
    choice("p2-5", "Complete __VELA para formar o nome de uma história da televisão.", ["NA", "NO", "NE", "NU"], "NO", "NO + VE + LA = NOVELA.", { visual: "📺", stimulus: "__ VE LA" }),
  ]),
  activity("palavras-3", 3, "Baú dos significados", "Leia as pistas e descubra a palavra certa.", [
    choice("p3-1", "Qual palavra dá nome ao animal que mia?", ["PATO", "GATO", "SAPO", "RATO"], "GATO", "GATO é o animal que mia.", { visual: "🐱" }),
    choice("p3-2", "Qual palavra dá nome à fruta amarela e comprida?", ["UVA", "MAÇÃ", "BANANA", "PERA"], "BANANA", "BANANA é uma fruta amarela e comprida.", { visual: "🍌" }),
    choice("p3-3", "Qual palavra dá nome ao que usamos para ler histórias?", ["LIVRO", "COPO", "PATO", "LAGO"], "LIVRO", "O LIVRO guarda histórias, informações e descobertas.", { visual: "📚" }),
    choice("p3-4", "Qual palavra dá nome ao objeto que ilumina quando aceso?", ["BOLA", "LATA", "MALA", "VELA"], "VELA", "Uma VELA acesa produz luz. Ela deve ser usada com um adulto.", { visual: "🕯️" }),
    choice("p3-5", "Qual palavra dá nome ao lugar onde as plantas crescem?", ["JARDIM", "SAPATO", "CADERNO", "TRAVESSEIRO"], "JARDIM", "No JARDIM podemos cuidar de flores e outras plantas.", { visual: "🌻" }),
  ]),
  activity("palavras-4", 3, "Construtores da ilha", "Coloque as sílabas em ordem e leia sua construção.", [
    order("p4-1", "Monte a palavra que dá nome à fruta: ABACAXI.", ["XI", "BA", "A", "CA"], ["A", "BA", "CA", "XI"], "A + BA + CA + XI = ABACAXI.", { visual: "🍍", stimulus: "ABACAXI" }),
    order("p4-2", "Monte a palavra JANELA.", ["NE", "LA", "JA"], ["JA", "NE", "LA"], "JA + NE + LA = JANELA.", { visual: "🪟", stimulus: "JANELA" }),
    order("p4-3", "Monte a palavra CAVALO.", ["LO", "CA", "VA"], ["CA", "VA", "LO"], "CA + VA + LO = CAVALO.", { visual: "🐴", stimulus: "CAVALO" }),
    order("p4-4", "Monte a palavra MACACO.", ["CO", "MA", "CA"], ["MA", "CA", "CO"], "MA + CA + CO = MACACO.", { visual: "🐒", stimulus: "MACACO" }),
    order("p4-5", "Monte a palavra PIRATA.", ["TA", "PI", "RA"], ["PI", "RA", "TA"], "PI + RA + TA = PIRATA. A ilha ganhou mais uma palavra!", { visual: "🏴‍☠️", stimulus: "PIRATA" }),
  ]),
  activity("frases-1", 4, "Frases em construção", "Organize as palavras para contar o que acontece.", [
    order("f1-1", "Monte a frase começando com O.", ["pula.", "sapo", "O"], ["O", "sapo", "pula."], "O sapo pula. A frase começa com letra maiúscula e termina com ponto.", { visual: "🐸" }),
    order("f1-2", "Monte a frase começando com A.", ["rola.", "A", "bola"], ["A", "bola", "rola."], "A bola rola. As palavras juntas contam uma ação.", { visual: "⚽" }),
    order("f1-3", "Monte a frase começando com Lia.", ["um", "Lia", "livro.", "lê"], ["Lia", "lê", "um", "livro."], "Lia lê um livro. Agora a frase tem sentido.", { visual: "📖" }),
    order("f1-4", "Monte a frase começando com O.", ["no", "O", "dorme", "gato", "sofá."], ["O", "gato", "dorme", "no", "sofá."], "O gato dorme no sofá. A frase conta quem, o que faz e onde.", { visual: "🐈" }),
    order("f1-5", "Monte a frase começando com Nós.", ["no", "parque.", "Nós", "brincamos"], ["Nós", "brincamos", "no", "parque."], "Nós brincamos no parque. Leia com calma, ligando as palavras.", { visual: "🛝" }),
  ]),
  activity("frases-2", 4, "Detetives da pontuação", "Descubra como os sinais ajudam a entender as frases.", [
    choice("f2-1", "Qual sinal completa esta pergunta?", [".", "?", ",", ":"], "?", "Usamos ? no final de uma pergunta.", { stimulus: "Qual é o seu nome__" }),
    choice("f2-2", "Qual sinal termina esta frase que conta uma informação?", ["?", ",", ".", ":"], ".", "O ponto final encerra uma frase que conta uma informação.", { stimulus: "O gato dormiu__" }),
    choice("f2-3", "Qual frase mostra uma exclamação de alegria?", ["Quem chegou?", "A porta abriu.", "Que dia lindo!", "Ela tem um livro."], "Que dia lindo!", "O sinal ! pode mostrar alegria, surpresa e outras emoções."),
    choice("f2-4", "Qual frase está escrita com início e final adequados?", ["a menina canta", "A menina canta.", "a Menina canta", "A menina canta,"], "A menina canta.", "Começamos com maiúscula e encerramos a ideia com ponto final."),
    choice("f2-5", "Qual frase está fazendo uma pergunta?", ["Eu gosto de frutas.", "Vamos ao parque?", "Que legal!", "O sol apareceu."], "Vamos ao parque?", "A frase Vamos ao parque? pergunta algo e termina com ?."),
  ]),
  activity("frases-3", 4, "Leitura com sentido", "Leia devagar e descubra o que cada frase conta.", [
    choice("f3-1", "Quem rega a planta?", ["A avó", "O gato", "Bia", "O pai"], "Bia", "A frase conta que Bia é quem rega a planta.", { stimulus: "Bia rega a planta de manhã.", visual: "🪴" }),
    choice("f3-2", "Onde está a bola?", ["No armário", "Debaixo da mesa", "Na mochila", "Em cima da cama"], "Debaixo da mesa", "A frase informa que a bola está debaixo da mesa.", { stimulus: "A bola azul está debaixo da mesa.", visual: "⚽" }),
    choice("f3-3", "Quando Pedro escova os dentes?", ["Antes de dormir", "Durante a aula", "Na hora do passeio", "Antes de brincar"], "Antes de dormir", "A pista de tempo é antes de dormir.", { stimulus: "Pedro escova os dentes antes de dormir.", visual: "🪥" }),
    choice("f3-4", "O que Luna levou para a escola?", ["Uma pipa", "Um carrinho", "Uma bola", "Um livro"], "Um livro", "Luna levou um livro novo para a escola.", { stimulus: "Luna levou um livro novo para a escola.", visual: "📘" }),
    choice("f3-5", "Qual é a cor da pipa?", ["Azul", "Verde", "Amarela", "Vermelha"], "Amarela", "A palavra amarela descreve a cor da pipa.", { stimulus: "A pipa amarela voa bem alto.", visual: "🪁" }),
  ]),
  activity("frases-4", 4, "A missão das frases", "Complete as ideias e conecte palavras com sentido.", [
    choice("f4-1", "Qual palavra completa a frase?", ["nadou", "voou", "leu", "plantou"], "voou", "Um passarinho pode voar. A palavra voou combina com a ideia da frase.", { stimulus: "O passarinho ___ até a árvore.", visual: "🐦" }),
    choice("f4-2", "Qual palavra completa a frase?", ["cantou", "bebeu", "pulou", "correu"], "bebeu", "Bebeu combina com água e com a ação de matar a sede.", { stimulus: "Depois da corrida, Ana ___ água.", visual: "💧" }),
    choice("f4-3", "Qual frase conta a mesma ideia que 'O menino está contente'?", ["O menino está com sono.", "O menino está triste.", "O menino está feliz.", "O menino está cansado."], "O menino está feliz.", "Contente e feliz têm sentidos parecidos."),
    choice("f4-4", "Qual palavra liga as duas ações?", ["mas", "e", "porque", "ou"], "e", "A palavra e une as ações de lavar as mãos e sentar à mesa.", { stimulus: "Léo lavou as mãos ___ sentou à mesa." }),
    choice("f4-5", "Leia em voz alta, no seu ritmo. Onde a frase termina?", ["Depois de crianças", "Depois de brincam", "Depois de juntas", "Depois de As"], "Depois de juntas", "O ponto final depois de juntas mostra onde a frase termina. Faça uma pequena pausa ali.", { stimulus: "As crianças brincam juntas.", audioText: "As crianças brincam juntas." }),
  ]),
  activity("historias-1", 5, "O jardim de Nina", "Leia uma pequena história e encontre as pistas do texto.", [
    choice("h1-1", "O que Nina plantou?", ["Uma pedra", "Uma semente", "Um brinquedo", "Uma folha de papel"], "Uma semente", "O texto conta que Nina plantou uma semente em um vaso.", { stimulus: "Nina plantou uma semente em um vaso. Todos os dias, ela colocava um pouco de água. Uma semana depois, apareceu uma folhinha verde.", visual: "🌱" }),
    choice("h1-2", "Onde Nina plantou a semente?", ["No rio", "Na caixa", "Em um vaso", "Na mochila"], "Em um vaso", "A primeira frase informa o lugar: em um vaso.", { stimulus: "Nina plantou uma semente em um vaso. Todos os dias, ela colocava um pouco de água. Uma semana depois, apareceu uma folhinha verde." }),
    choice("h1-3", "Como Nina cuidava da semente?", ["Colocava um pouco de água", "Guardava no armário", "Cobria com brinquedos", "Deixava sem cuidado"], "Colocava um pouco de água", "O cuidado que aparece no texto é colocar um pouco de água todos os dias.", { stimulus: "Nina plantou uma semente em um vaso. Todos os dias, ela colocava um pouco de água. Uma semana depois, apareceu uma folhinha verde." }),
    choice("h1-4", "O que aconteceu uma semana depois?", ["O vaso sumiu", "Nina viajou", "Apareceu uma flor azul", "Apareceu uma folhinha verde"], "Apareceu uma folhinha verde", "A última frase conta que uma folhinha verde apareceu.", { stimulus: "Nina plantou uma semente em um vaso. Todos os dias, ela colocava um pouco de água. Uma semana depois, apareceu uma folhinha verde." }),
    choice("h1-5", "Qual título combina melhor com a história?", ["Uma viagem de trem", "A semente de Nina", "O jogo de bola", "Um peixe no mar"], "A semente de Nina", "O texto fala de Nina cuidando de uma semente até ela começar a crescer.", { stimulus: "Nina plantou uma semente em um vaso. Todos os dias, ela colocava um pouco de água. Uma semana depois, apareceu uma folhinha verde." }),
  ]),
  activity("historias-2", 5, "Um guarda-chuva para dois", "Descubra ações, sentimentos e pistas que a história oferece.", [
    choice("h2-1", "Como estava o tempo?", ["Nevando", "Ventando sem chuva", "Chovendo", "Ensolarado"], "Chovendo", "A primeira frase diz que começou a chover.", { stimulus: "Na saída da escola, começou a chover. Davi abriu seu guarda-chuva. Ao ver Sofia sem proteção, chamou a amiga. Os dois caminharam juntos até o portão.", visual: "☔" }),
    choice("h2-2", "Quem estava sem proteção da chuva?", ["Davi", "Sofia", "A professora", "O porteiro"], "Sofia", "Davi viu Sofia sem proteção e chamou a amiga.", { stimulus: "Na saída da escola, começou a chover. Davi abriu seu guarda-chuva. Ao ver Sofia sem proteção, chamou a amiga. Os dois caminharam juntos até o portão." }),
    choice("h2-3", "Por que Davi chamou Sofia?", ["Para dividir a proteção do guarda-chuva", "Para pegar um ônibus", "Para jogar bola", "Para voltar à sala"], "Para dividir a proteção do guarda-chuva", "A chuva e a falta de proteção de Sofia são pistas de que Davi quis ajudá-la.", { stimulus: "Na saída da escola, começou a chover. Davi abriu seu guarda-chuva. Ao ver Sofia sem proteção, chamou a amiga. Os dois caminharam juntos até o portão." }),
    choice("h2-4", "Para onde os dois caminharam?", ["Para o mercado", "Para a praia", "Para o parque", "Até o portão"], "Até o portão", "A última frase informa que caminharam até o portão.", { stimulus: "Na saída da escola, começou a chover. Davi abriu seu guarda-chuva. Ao ver Sofia sem proteção, chamou a amiga. Os dois caminharam juntos até o portão." }),
    choice("h2-5", "Que atitude de Davi aparece na história?", ["Esconder o guarda-chuva", "Ajudar uma amiga", "Fugir da escola", "Deixar a amiga sozinha"], "Ajudar uma amiga", "Ao compartilhar a proteção, Davi teve uma atitude de cuidado com Sofia.", { stimulus: "Na saída da escola, começou a chover. Davi abriu seu guarda-chuva. Ao ver Sofia sem proteção, chamou a amiga. Os dois caminharam juntos até o portão." }),
  ]),
  activity("historias-3", 5, "Correio da galáxia", "Leia bilhetes e convites que fazem parte do dia a dia.", [
    choice("h3-1", "Para quem é o bilhete?", ["Para a vovó", "Para o papai", "Para a Bia", "Para a professora"], "Para a vovó", "O nome no começo indica para quem o bilhete foi escrito: Vovó.", { stimulus: "Vovó,\nFui brincar na casa da Bia. Volto às cinco horas.\nUm beijo,\nLia", visual: "💌" }),
    choice("h3-2", "Quem escreveu o bilhete?", ["Bia", "Lia", "Vovó", "Davi"], "Lia", "Lia assina o bilhete no final.", { stimulus: "Vovó,\nFui brincar na casa da Bia. Volto às cinco horas.\nUm beijo,\nLia" }),
    choice("h3-3", "A que horas Lia vai voltar?", ["Às duas", "Às três", "Às quatro", "Às cinco"], "Às cinco", "A informação está na frase Volto às cinco horas.", { stimulus: "Vovó,\nFui brincar na casa da Bia. Volto às cinco horas.\nUm beijo,\nLia" }),
    choice("h3-4", "O que o convite convida você a fazer?", ["Assistir a um filme", "Visitar um museu", "Trocar livros", "Comprar brinquedos"], "Trocar livros", "O título do convite informa que o encontro é uma feira de troca de livros.", { stimulus: "FEIRA DE TROCA DE LIVROS\nSábado, às 10 horas, no pátio da escola.\nTraga um livro e encontre uma nova história!", visual: "📚" }),
    choice("h3-5", "Onde será a feira?", ["No pátio da escola", "Na praça", "Na biblioteca da cidade", "Na casa de Lia"], "No pátio da escola", "O convite informa o lugar: no pátio da escola.", { stimulus: "FEIRA DE TROCA DE LIVROS\nSábado, às 10 horas, no pátio da escola.\nTraga um livro e encontre uma nova história!" }),
  ]),
  activity("historias-4", 5, "O grande piquenique", "Conecte acontecimentos e descubra o sentido da história.", [
    choice("h4-1", "O que a turma combinou?", ["Uma corrida", "Um piquenique", "Uma viagem", "Um jogo de cartas"], "Um piquenique", "A primeira frase conta que a turma combinou um piquenique no parque.", { stimulus: "A turma combinou um piquenique no parque. Cada pessoa levou um alimento. Antes de comer, todos lavaram as mãos. Depois do lanche, recolheram o lixo. O parque ficou limpo para a próxima turma.", visual: "🧺" }),
    choice("h4-2", "O que aconteceu antes de comer?", ["Foram para casa", "Recolheram o lixo", "Lavaram as mãos", "Plantaram uma árvore"], "Lavaram as mãos", "O texto usa antes de comer para mostrar quando lavaram as mãos.", { stimulus: "A turma combinou um piquenique no parque. Cada pessoa levou um alimento. Antes de comer, todos lavaram as mãos. Depois do lanche, recolheram o lixo. O parque ficou limpo para a próxima turma." }),
    choice("h4-3", "O que aconteceu depois do lanche?", ["Recolheram o lixo", "Lavaram os alimentos", "Foram nadar", "Chamaram o ônibus"], "Recolheram o lixo", "Depois do lanche, a turma recolheu o lixo.", { stimulus: "A turma combinou um piquenique no parque. Cada pessoa levou um alimento. Antes de comer, todos lavaram as mãos. Depois do lanche, recolheram o lixo. O parque ficou limpo para a próxima turma." }),
    choice("h4-4", "Por que recolher o lixo foi uma boa ideia?", ["Para esconder os alimentos", "Para levar o parque embora", "Para terminar a escola", "Para deixar o parque limpo"], "Para deixar o parque limpo", "A última frase mostra a consequência: o parque ficou limpo para outras pessoas.", { stimulus: "A turma combinou um piquenique no parque. Cada pessoa levou um alimento. Antes de comer, todos lavaram as mãos. Depois do lanche, recolheram o lixo. O parque ficou limpo para a próxima turma." }),
    choice("h4-5", "Qual frase resume melhor a história?", ["A turma perdeu o lanche no caminho.", "A turma compartilhou um lanche e cuidou do parque.", "Uma pessoa fez um piquenique sozinha.", "A turma ficou na escola porque choveu."], "A turma compartilhou um lanche e cuidou do parque.", "Esse resumo reúne as duas ideias principais: o piquenique em grupo e o cuidado com o espaço.", { stimulus: "A turma combinou um piquenique no parque. Cada pessoa levou um alimento. Antes de comer, todos lavaram as mãos. Depois do lanche, recolheram o lixo. O parque ficou limpo para a próxima turma." }),
  ]),
];

/** Ten diagnostic items progress from letters to comprehension. They do not unlock worlds by themselves. */
export const diagnosticQuestions: Question[] = worlds.flatMap((world) =>
  activities.filter((item) => item.worldId === world.id).slice(0, 2).map((item) => ({ ...item.questions[0], worldId: world.id })),
);

export function getActivity(id: string): Activity | undefined {
  return activities.find((item) => item.id === id);
}

export function getWorld(id: number): World | undefined {
  return worlds.find((item) => item.id === id);
}
