# Ecossistema de ilhas e pensamento computacional

A trilha mantém as 20 atividades e os cinco mundos de alfabetização. Sua apresentação agora é um arquipélago: as ilhas têm ilustrações, cores, textos de expedição e quatro marcos de crescimento próprios.

- **Letras:** brotos, ponte, jardim e floresta.
- **Sons:** cachoeira de rimas, gruta dos ecos, colina e festa musical.
- **Palavras:** praia de sílabas, pontes, farol e porto.
- **Frases:** escadaria, praça, mirante e vila nas montanhas.
- **Histórias:** biblioteca, torre, observatório e castelo.

Os estados visuais vêm de `getJourney`: somente territórios conquistados em sequência fazem habitats aparecerem e abrem rotas. Uma atividade precisa de pelo menos 80% de acerto. Prática livre em uma ilha distante não pula os pré-requisitos. Ilhas bloqueadas podem ser conhecidas por prévia; seus desafios continuam bloqueados. Ao concluir as vinte atividades, todas as ilhas ficam conectadas e permitem revisita.

`apps/plataforma/lib/world-themes.ts` centraliza ilustrações, coordenadas dos pontos, mensagens e paletas. O mesmo tema acompanha a criança na tela de atividade e na celebração. As novas imagens estão incluídas na lista explícita de arquivos públicos do modo offline. Prompts e proveniência estão em `ECOSYSTEM_ASSETS.md`.

## Ilha das Ideias

O card **Pensamento computacional**, o menu lateral e o convite no arquipélago abrem **19 explorações livres**. As quatro experiências iniciais continuam disponíveis:

1. Dividir a tarefa de plantar em pequenos passos (decomposição).
2. Completar uma sequência de figuras (padrões).
3. Programar um robô com setas para alcançar uma estrela (algoritmos).
4. Encontrar e corrigir uma instrução incorreta (depuração).

Outras quinze explorações mobilizam habilidades do eixo Pensamento Computacional da BNCC, do 1º ao 5º ano. A variedade inclui classificação, sequência de ações, atributos essenciais de modelos, repetições, verdadeiro ou falso, condições de parada, decomposição, matrizes, registros, listas, grafos e decisões condicionais. A biblioteca permite filtrar por ano, habilidade e progresso, preservando a exploração livre.

A matriz dos códigos, a referência oficial e os limites pedagógicos de cada experiência estão em [BNCC_PENSAMENTO_COMPUTACIONAL.md](BNCC_PENSAMENTO_COMPUTACIONAL.md). A associação a uma habilidade indica o que a prática mobiliza; a conclusão de um desafio não representa avaliação integral ou domínio dessa habilidade.

Os controles funcionam com toque, mouse e teclado. O robô respeita limites do mapa e obstáculos. As descobertas podem ser refeitas sem punições; instruções, pistas e explicações usam a voz configurada da plataforma. O modo de tela cheia continua disponível para realizar as atividades.

O progresso das 19 explorações é separado do progresso oficial de alfabetização: não concede XP nem desbloqueia territórios. Ele é salvo neste navegador, com uma chave de armazenamento separada por instituição, usuário e estudante. O formato `version: 1` e os quatro identificadores antigos são mantidos, preservando descobertas anteriores e aceitando os quinze identificadores novos. A ampliação usa `localStorage` e não requer alteração do banco de dados.

Esse progresso não é sincronizado com outros dispositivos nem enviado aos relatórios docentes. Falhas de armazenamento mantêm a exploração disponível e mostram um aviso. Valores inválidos são descartados. Filtrar as explorações não apaga conclusões.

A Lumi reconhece o contexto de pensamento computacional tanto nas dicas locais quanto na API autenticada. O servidor aceita apenas o identificador conhecido desse contexto; atividades oficiais continuam usando o contexto validado pelo servidor. A fala em andamento é interrompida ao mudar de exploração.

## Mapa expandido e aproximação

O botão **Expandir mapa** abre uma visão ampla do arquipélago tanto na página inicial quanto na trilha. Clicar diretamente em uma ilha abre essa mesma visão já aproximada na ilha escolhida.

- A visão geral permite escolher entre as cinco ilhas.
- Dentro da ilha, os controles **+**, **−** e **Restaurar aproximação inicial** ajustam a escala entre 100% e 200%, preservando o ponto central.
- Arraste com o mouse ou deslize no celular para percorrer a imagem. A região também recebe foco e permite rolagem pelo teclado.
- Selecionar um território mostra a atividade, duração, quantidade de desafios, XP e condição de desbloqueio. Somente a ação **Começar a aventura** inicia a atividade.
- Ilhas e territórios bloqueados oferecem prévia, sem permitir iniciar desafios indevidamente.
- **Ver arquipélago** retorna à visão geral; **Fechar** ou Esc volta à plataforma. O foco retorna ao controle usado para abrir o mapa.

A expansão usa as mesmas imagens e os mesmos dados de progresso, sem alterar as regras pedagógicas. Movimento reduzido e alto contraste são respeitados. Os cálculos de escala e centro ficam em `apps/plataforma/lib/map-view.ts` e possuem testes para celular, limites, cantos e redimensionamento.
### Tela cheia

O mapa expandido agora ocupa toda a janela, sem margens externas, em computadores e celulares. O arquipélago usa a largura disponível; no desktop, o painel de detalhes fica limitado a 400px para priorizar o mapa.

O botão **Tela cheia**, no cabeçalho, solicita o modo nativo do navegador no conteúdo do explorador. **Sair da tela cheia** ou Esc restaura a janela. Fechar o mapa também encerra o modo nativo quando ele pertence ao explorador. Se o navegador não oferecer o recurso, a visão continua ocupando toda a janela. Uma recusa é informada sem interromper a exploração.

A implementação usa o contêiner interno do diálogo, pois o próprio elemento `dialog` não pode ser o alvo de `requestFullscreen`. Referência: [Fullscreen API Standard](https://fullscreen.spec.whatwg.org/).