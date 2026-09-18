# Simulações de programas no pensamento computacional

O laboratório usa uma área de execução visual para as **10 explorações em que a criança monta um programa ou caminho**. A simulação acompanha as instruções escolhidas, incluindo tentativas que não atingem o objetivo.

| Exploração | ID | O que a execução mostra |
| --- | --- | --- |
| Robô explorador | `algorithm` | Cada deslocamento no tabuleiro, a posição atual e a interrupção diante de pedra ou borda. |
| Detetive de setas | `debug` | O programa original ou a sequência com a seta corrigida, percorrida passo a passo. |
| Siga o guia da Lumi | `follow-the-trail` | A sequência de lugares escolhida e sua relação com o percurso apresentado. |
| Receita do piquenique | `picnic-sequence` | O efeito de lavar, cortar, servir e comer, respeitando as dependências entre ações. |
| Passos que se repetem | `bridge-repeat` | O robô dando um passo por repetição na direção e quantidade configuradas. |
| Até encontrar o farol | `lighthouse-until` | A verificação da condição de parada e os deslocamentos enquanto ela não acontece. |
| Uma horta em pequenas partes | `party-parts` | As partes combinadas e os passos internos de preparar, plantar e cuidar. |
| Um jardim de repetições | `garden-loops` | A abertura de cada fileira e o plantio de cada flor, distinguindo as duas repetições. |
| Pontes entre ilhas | `island-routes` | A travessia das pontes na ordem do caminho montado. |
| Regar ou esperar? | `water-decisions` | A condição de cada vaso, a escolha do ramo e o efeito de regar ou esperar. |

## Construir, observar e ajustar

**Testar programa** abre a execução no lugar do editor. **Editar programa** retorna às mesmas escolhas para permitir um ajuste e uma nova tentativa. Em Detetive de setas, **Ver o programa original** permite investigar o erro antes da correção.

A reprodução oferece:

- **Reproduzir / Pausar / Rever:** acompanhar automaticamente ou interromper no ponto atual.
- **Anterior / Próximo:** inspecionar um quadro por vez; a navegação manual pausa a execução.
- **Recomeçar:** voltar ao primeiro quadro e reproduzir a mesma tentativa.
- **Velocidade:** Devagar (1,5 segundo), Normal (0,9 segundo) ou Rápido (0,5 segundo por quadro).
- **Ver meu programa:** consultar as instruções com destaque para a instrução ativa.
- **Ver resultado:** avançar diretamente ao estado final calculado a partir do programa escolhido.

A preferência de movimento reduzido impede o início automático, preservando a navegação por passos. A criança ainda pode solicitar a reprodução pelos controles. Os estados da cena e as explicações permanecem disponíveis mesmo sem animação.

O resultado da tentativa chega ao laboratório somente quando a reprodução alcança seu último quadro, inclusive quando a criança escolhe **Ver resultado**. Uma resposta correta pode então registrar a descoberta no progresso local. Apenas assistir ao programa original de depuração não registra conclusão. Editar ou sair de uma exploração cancela a reprodução daquela tentativa.

Os quadros são calculados a partir dos comandos da criança: instrução ativa, explicação do efeito e estado visual da cena. Contadores e condições fazem parte dos quadros das atividades que os utilizam. A execução não depende da resposta da IA nem da geração de áudio.

## Alcance

As outras nove explorações praticam seleção, classificação, reconhecimento de padrões, valores lógicos ou edição direta de dados. Elas continuam usando seus controles específicos e a conferência da resposta; não são tratadas como executores de programas.

O banco de atividades do professor possui questões de leitura, ordenação e escolha sobre procedimentos. Sua interface genérica continua distinta deste laboratório de execução. Esta mudança não altera notas, XP, trilhas, formatos de atividade ou dados do banco.

Os códigos de habilidades e os limites pedagógicos estão em [BNCC_PENSAMENTO_COMPUTACIONAL.md](BNCC_PENSAMENTO_COMPUTACIONAL.md).
