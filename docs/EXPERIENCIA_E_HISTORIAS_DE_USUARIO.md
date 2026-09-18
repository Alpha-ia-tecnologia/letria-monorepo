# Experiência e histórias de usuário da Letria

Revisão: 17/09/2026. Escopo: entrada, orientação inicial e navegação de estudantes, professores, familiares e administradores.

Esta análise foi feita pela leitura da implementação e da documentação da plataforma. Os personagens abaixo são fictícios e representam hipóteses de uso; não são resultados de entrevistas ou testes com usuários. A proposta preserva as ilhas, a Lumi e a aprendizagem por descoberta, organizando as decisões pela tarefa que cada pessoa precisa realizar.

## O problema a resolver

A Letria já oferece trilha, atividades livres, pensamento computacional, acompanhamento pedagógico e acessos distintos. A dificuldade principal é descobrir **por onde começar, qual caminho escolher e o que acontece depois**. Para quem usa pouco a tecnologia, muitos recursos com o mesmo destaque podem parecer muitas tarefas obrigatórias.

A experiência deve responder a três perguntas em cada etapa:

1. **Onde estou?** Um título claro e um menu que indique a área atual.
2. **O que faço agora?** Uma ação principal, com uma explicação curta do resultado esperado.
3. **Como volto ou peço ajuda?** Retorno previsível e orientação disponível sem depender da IA ou do áudio.

## Achados que orientam a reestruturação

| Prioridade | Evidência encontrada no código anterior | Efeito provável | Direção adotada |
| --- | --- | --- | --- |
| Alta | A chamada inicial da landing abria o acesso adulto, enquanto cadastrar uma escola recebia destaque. | Uma criança poderia procurar e-mail; um professor já vinculado poderia criar outra instituição. | Identificar estudante, equipe e família antes do formulário; separar a criação da escola. |
| Alta | A página inicial infantil mostrava categorias, mapa, recomendação, metas do dia e conquistas com múltiplos convites. | A pessoa precisava comparar opções antes da primeira atividade. | Destacar o próximo passo; manter exploração livre e conquistas como caminhos complementares. |
| Alta | “Missões” reunia metas de uso e tarefas atribuídas; o indicador lateral era fixo em três. | A criança não sabia quantas atividades o professor havia pedido. | Separar as atividades da turma das metas opcionais e calcular a pendência a partir dos dados. |
| Alta | Professor sem turma recebia uma ação de preparar missão, cuja atribuição exige turma. | O primeiro clique podia chegar a um impedimento. | Orientar preparação na ordem turma, estudante, atividade e acompanhamento. |
| Alta | O botão de acesso do estudante chamava a renovação do código. | A pessoa poderia acreditar que apenas consultava um código existente. | Explicar que gerar um novo código substitui o anterior; distinguir cadastro de renovação. |
| Média | Rótulos como “Baú”, “Do seu jeito” e “Mural” dependiam da interpretação da metáfora. | A finalidade de algumas áreas precisava ser descoberta por tentativa. | Conservar a narrativa nas ilustrações e associar os controles a tarefas literais. |
| Média | O clique na marca levava sempre a `dashboard`, inclusive para o responsável cujo início é `family`. | Voltar ao início podia abrir uma área diferente da navegação familiar. | Resolver o destino inicial de acordo com o perfil conectado. |
| Média | Ajudas estavam distribuídas entre a Lumi, preferências, modais e textos de apoio. | Uma dúvida operacional podia parecer exigir uma conversa com a IA. | Oferecer ajuda de uso em texto, organizada por perfil e acessível a qualquer momento. |

Os efeitos da tabela são hipóteses fundamentadas na estrutura da interface, não medidas de dificuldade observada.

## Uma história que conecta os perfis

**A escola de Leo está começando a usar a Letria.** Paulo, que organiza os acessos, cria o espaço da escola. Ele entende que esse cadastro é feito uma vez pela instituição. Depois cria o acesso da professora Ana e organiza o vínculo com a turma. O código de cada estudante pertence àquela criança; não é uma senha coletiva da classe.

**Ana quer preparar uma atividade sem aprender todos os recursos de uma vez.** Ao entrar, ela encontra a sequência de preparação. Abre sua turma, cadastra Leo e entrega o código exibido. Em seguida procura uma atividade pronta, abre a prévia e escolhe a turma e o prazo. Não precisa criar conteúdo autoral para começar. Quando Leo concluir, ela poderá acompanhar as respostas registradas e decidir se ele precisa de outra proposta.

**Leo quer saber o que fazer agora.** Na entrada, escolhe o acesso de estudante e digita o código recebido. Na página inicial, encontra uma ação em destaque, com o nome do desafio e uma explicação curta. Se o professor deixou uma atividade, consegue encontrá-la sem confundir o pedido com as metas opcionais. Quando escolhe explorar a trilha, vê qual território já alcançou e qual é o próximo disponível.

**Durante a descoberta, Leo pode tentar novamente.** Ele lê ou ouve o enunciado, usa tela cheia se precisar de mais espaço e pede uma pista. Nas atividades de programação, monta os passos, testa o programa, observa o efeito e volta à edição para ajustar. Errar não apaga os mundos que já conquistou. Ao terminar, recebe um resultado e pode escolher o próximo passo ou retornar ao início.

**Marta acompanha Leo em casa e usa pouco o computador.** Ela entra com o acesso de familiar entregue pela escola e encontra o acompanhamento da criança vinculada à sua conta. Vê as atividades registradas e as orientações que Ana decidiu compartilhar. Entende que pode apoiar com uma conversa e uma pequena prática, sem interpretar sozinha uma matriz técnica. Se desejar, gerencia a autorização de voz na área indicada; o uso básico da plataforma não depende de gravar áudio.

**No dia seguinte, ninguém precisa recomeçar a organização.** Ana retorna às turmas e aos resultados. Leo encontra novamente o início e seu próximo passo. Marta volta ao acompanhamento da criança. Os recursos de personalização, instalação e exploração continuam disponíveis, mas não formam uma lista de tarefas obrigatórias para aprender.

## Ordem da experiência

| Perfil | Fluxo anterior mais exigente | Fluxo orientado à tarefa |
| --- | --- | --- |
| Estudante | Entrada genérica → escolher acesso → painel com várias chamadas → descobrir qual atividade iniciar. | Escolher estudante → código da escola → próximo passo → realizar → compreender resultado → continuar ou voltar. |
| Professor | Visão geral → preparar missão → perceber que faltam turma ou estudantes → procurar cadastro → retornar ao banco. | Entrar → verificar preparação → turma → estudantes e códigos → escolher atividade → atribuir → acompanhar. |
| Familiar | Entrada compartilhada → localizar acompanhamento → interpretar indicadores e mural. | Entrar com acesso da escola → criança vinculada → últimas atividades → orientação da escola → apoio e preferências. |
| Administrador | Criar escola → painel pedagógico → descobrir onde criar acessos e vínculos. | Criar escola → organizar equipe e turmas → cadastrar ou vincular estudantes e famílias → acompanhar a preparação. |

O fluxo orienta o começo, mas não bloqueia pessoas experientes em um tutorial. A ordem sugerida de preparação não concede novas permissões: cada papel continua restrito às ações autorizadas pelo servidor.

## Navegação e ações desta reestruturação

Na apresentação da plataforma, **Entrar na Letria** é a chamada principal e **Ver demonstração** informa o uso de dados fictícios. **Encontre o seu acesso** separa **Sou estudante**, **Sou professor** e **Sou responsável**. A criação institucional aparece em **Vai administrar uma escola nova?**. Na tela de entrada, a primeira etapa identifica quem vai entrar e a segunda solicita código ou e-mail e senha. A ajuda visível explica de onde vêm os acessos.

| Perfil | Ordem principal | Recursos complementares |
| --- | --- | --- |
| Estudante | Início → Atividades da turma → Trilha de ilhas → Lógica e programação → Minhas conquistas. | Todas as atividades, Como usar e preferências. |
| Professor | Início → Turmas e alunos → Escolher atividades → Acompanhar alunos → Avisos e orientações. | Ajuda de uso, preferências e conta. |
| Administrador | Mesma sequência da equipe, com Contas da escola para criar os acessos. | Percurso inicial inclui cadastrar professor e organizar seus vínculos. |
| Familiar | Acompanhar criança → Avisos e orientações. | Ajuda de uso, preferências, conta e autorização de voz. |

No início do estudante, o próximo passo usa esta ordem: **atividade da turma pendente e disponível**, priorizada pelo prazo; **primeira descoberta**, se ainda não há histórico; ou **atividade recomendada pelo progresso**. A tela concentra a chamada principal e mantém a trilha, a lógica e outras atividades como caminhos complementares. A prioridade exige que o conteúdo da atividade esteja disponível no catálogo da conta. Atividades de mundos futuros podem ser realizadas em prática livre, conforme o comportamento já existente; isso não pula os pré-requisitos da trilha.

Uma atribuição é tratada como enviada quando existe uma tentativa do mesmo estudante e da mesma atividade, realizada a partir da data de criação da atribuição. Portanto, uma tentativa anterior não encerra uma nova proposta; enviar não significa alcançar 80% nem demonstrar domínio. O indicador do menu conta as atribuições pendentes do estudante. As metas voluntárias de prática ficam separadas em uma área recolhível.

Na equipe, o percurso inicial dá acesso a **organizar turmas → adicionar estudantes → escolher atividade → acompanhar resultados**, de acordo com os dados já existentes. O administrador também encontra a criação de acesso de professor. No acompanhamento familiar, os convites orientam **como ajudar hoje** e **onde ler as orientações da escola**.

**Como usar** apresenta os caminhos do perfil conectado e permite abrir a área indicada sem exigir uma conversa com a Lumi. O clique na marca volta ao início correspondente ao perfil. A opção de renovar o acesso infantil avisa, antes da ação, que um novo código substitui o anterior.

## Histórias e critérios de aceite

### HU-01 — Encontrar o acesso correto

**Como estudante, professor ou familiar, quero identificar como entrar para usar o acesso que a escola me entregou.**

- O acesso de estudante pede o código individual, sem exigir e-mail.
- Professor e familiar usam e-mail e senha, com explicação de que a escola fornece o acesso.
- O cadastro institucional identifica que cria uma escola e uma conta administradora.
- A demonstração informa que usa pessoas fictícias.
- A ajuda orienta procurar a escola quando não há código ou credenciais; não promete recuperação automática indisponível.

### HU-02 — Começar sem decidir entre todos os recursos

**Como estudante com pouca familiaridade com a plataforma, quero encontrar meu próximo passo ao entrar para conseguir começar uma atividade.**

- A página inicial destaca uma ação de aprendizagem e explica seu destino: atribuição pendente disponível, primeira descoberta ou recomendação, nessa ordem.
- Atividades atribuídas pelo professor são distinguíveis da exploração livre.
- O estado inicial considera o progresso existente; voltar ao início não zera conquistas.
- A sondagem inicial é apresentada como uma descoberta para conhecer o ponto de partida, sem promessa de diagnóstico completo.
- O menu e a marca permitem retornar ao início correto do perfil.

### HU-03 — Entender uma tarefa da turma

**Como estudante, quero encontrar as atividades que o professor pediu para realizar a proposta certa.**

- A área mostra título da proposta, atividade e prazo disponíveis no registro.
- Pendências são derivadas das atribuições e das tentativas posteriores à criação de cada proposta; o menu não usa uma quantidade fixa.
- Na ausência de tarefa, a tela explica que não há atividade pendente e oferece um caminho de exploração.
- Metas de prática da plataforma não são apresentadas como pedidos do professor.
- Uma tentativa anterior à proposta não encerra uma nova atribuição. Uma tentativa enviada pode concluir o envio sem atingir 80%; o estado não é rotulado como domínio da habilidade.

### HU-04 — Tentar, observar e corrigir

**Como estudante, quero entender o efeito da minha resposta para aprender com a tentativa e saber como continuar.**

- O desafio apresenta enunciado, controles, pista e ação de conferência identificáveis.
- Nas dez explorações que executam programas, testar mostra as instruções escolhidas e seus efeitos, inclusive quando incorretos.
- Pausar, avançar por passos e voltar à edição preservam a possibilidade de compreender e corrigir o programa.
- Tela cheia é opcional e tem uma saída identificável.
- A exploração computacional informa que suas descobertas ficam neste navegador e são separadas da trilha de alfabetização.

### HU-05 — Preparar a primeira proposta

**Como professor, quero receber orientação para preparar turma, estudantes e atividade para começar a ensinar sem configurar tudo de uma vez.**

- O início indica o próximo passo a partir da existência de turmas, estudantes e atividades atribuídas.
- O professor consegue abrir as ações existentes de criar turma e cadastrar estudante, conforme suas permissões.
- Cadastrar estudante apresenta o código gerado e a ação de copiar; não exige e-mail infantil.
- O banco oferece atividades prontas e prévia antes da atribuição.
- Atribuir exige atividade publicada ou do catálogo, turma e prazo; uma turma inexistente deve ter um caminho claro de criação.
- Criar uma atividade autoral é uma opção adicional, não um requisito para a primeira proposta.

### HU-06 — Acompanhar e decidir o próximo apoio

**Como professor, quero consultar as tentativas de um estudante e registrar minha orientação para apoiar sua aprendizagem.**

- O acompanhamento permite selecionar turma e estudante.
- Resultados exibem as atividades e datas que sustentam o acompanhamento.
- Média de tentativas, sondagem e domínio por evidências têm significados distintos; nenhuma é apresentada como equivalente às outras.
- Uma observação privada continua reservada à equipe; uma orientação compartilhada identifica que a família poderá lê-la.
- A ausência de resultados aparece como ausência de prática registrada, sem atribuir desempenho negativo à criança.

### HU-07 — Apoiar a criança em casa

**Como familiar, quero saber como a criança está participando e o que posso fazer para ajudá-la, sem precisar conhecer termos pedagógicos ou menus da equipe.**

- A entrada leva diretamente ao acompanhamento familiar.
- O familiar acessa somente a criança vinculada à sua conta e as informações autorizadas.
- Orientações compartilhadas pela escola são identificáveis; observações privadas não são expostas.
- A tela distingue uma sugestão geral para aprender em casa de uma orientação individual escrita pelo professor.
- A autorização de voz é opcional e pode ser alterada pelo fluxo existente.
- Voltar ao início permanece dentro da experiência do familiar.

### HU-08 — Organizar os acessos da escola

**Como administrador, quero organizar equipe, turmas e vínculos para que cada pessoa encontre o espaço adequado ao seu papel.**

- Criar escola é distinto de entrar numa escola já cadastrada.
- Os acessos de professor e responsável são criados pelas ações existentes de administração.
- O acesso de responsável exige o vínculo com um estudante.
- A equipe entende que turmas precisam de atribuição ao professor responsável para o acesso correspondente.
- Gerar um novo código de estudante informa que o anterior será substituído; a interface não apresenta renovação como consulta.
- A demonstração não é tratada como cadastro de pessoas reais.

### HU-09 — Receber ajuda sem depender da IA

**Como pessoa que usa pouco a tecnologia, quero uma explicação curta dos caminhos disponíveis para meu perfil para continuar uma tarefa sem receio de escolher errado.**

- A ajuda de uso fica acessível pela navegação e usa instruções diretas.
- Os passos descrevem ações reais do perfil conectado, com atalhos para as áreas indicadas, e diferenciam estudante, professor, familiar e administrador.
- A ajuda não exige microfone, voz gerada ou resposta da Lumi.
- Preferências de texto, contraste e movimento continuam disponíveis.
- A ajuda pode ser fechada; não impede a tarefa principal com uma sequência obrigatória.

## Limites que a experiência precisa comunicar

- **Progresso:** a trilha de alfabetização usa resultados oficiais; as 19 explorações de pensamento computacional mantêm descobertas no navegador, separadas por instituição, conta e estudante, sem sincronização com os relatórios docentes.
- **Aprendizagem:** concluir um desafio não certifica domínio integral de uma habilidade da BNCC. A sondagem e as recomendações apoiam a avaliação docente.
- **Atribuições:** o modelo registra a atividade atribuída à turma, mas as respostas se relacionam à atividade. Não há, nesta mudança, uma nova entidade de entrega ou reenvio por atribuição.
- **Mural:** contém avisos e orientações compartilhadas. Não representa um chat bilateral entre família e professor.
- **Acesso:** estudante usa código; adultos recebem e-mail e senha da escola. Não foi acrescentado autocadastro de familiar, recuperação por e-mail ou mudança de papéis numa conta real.
- **Sem internet:** o primeiro acesso e a preparação do conteúdo precisam de conexão. Respostas pendentes continuam vinculadas ao perfil que as produziu. A nova navegação não descarta a fila ao alternar contas.
- **Lumi:** pedir ajuda pedagógica continua possível; a orientação para operar a plataforma não depende da disponibilidade da IA nem do tempo de geração da voz.

## Validação e próximos passos de pesquisa

Os critérios acima orientam a implementação e a revisão por código. A validação técnica deve verificar resolução do início por perfil, escolha do próximo passo, cálculo de pendências, preservação de permissões e renderização das rotas. Compilação e testes automatizados verificam comportamentos do sistema, mas não demonstram que uma pessoa com pouca afinidade digital o considera fácil.

Uma rodada futura de avaliação com usuários pode propor quatro tarefas: estudante entrar e começar; professor preparar a primeira atividade; familiar encontrar uma orientação; administrador criar o acesso correto. Observar dúvidas, necessidade de ajuda, escolhas equivocadas e se a pessoa consegue explicar o resultado do clique. Não foram atribuídos números de melhoria, taxa de sucesso ou redução de cliques sem essa observação.

## Referências da plataforma

- [Tipos e ações existentes](../apps/plataforma/lib/types.ts)
- [Navegação e jornada do estudante](../apps/plataforma/components/Letria.tsx)
- [Próximo passo e atalhos do estudante](../apps/plataforma/components/StudentStart.tsx)
- [Regras de atribuição e próximo passo](../apps/plataforma/lib/student-journey.ts)
- [Guia de uso por perfil](../apps/plataforma/components/UsageGuide.tsx)
- [Sequência de preparação da equipe](../apps/plataforma/lib/educator-journey.ts)
- [Espaços da equipe e família](../apps/plataforma/components/Educator.tsx)
- [Entrada na plataforma](../apps/plataforma/components/LoginPage.tsx)
- [Página de apresentação](../apps/plataforma/components/LandingPage.tsx)
- [Regras da trilha e Lumi](TRILHA_E_LUMI.md)
- [Ecossistema e registro das explorações](ECOSSISTEMA_E_LOGICA.md)
- [BNCC e limites pedagógicos](BNCC_PENSAMENTO_COMPUTACIONAL.md)
- [Execução visual dos programas](SIMULACOES_DE_PROGRAMAS.md)
