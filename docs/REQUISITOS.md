# Rastreabilidade dos requisitos da Letria

Referência: [Requisitos Funcionais da Plataforma Gamificada de Alfabetização, versão 1.0](../../Requisitos_Funcionais_Plataforma_Gamificada_Alfabetizacao.docx). Revisão de implementação em 16/09/2026.

Esta matriz preserva os identificadores RF-001 a RF-140 e RN-001 a RN-010 do documento original. A entrega é uma plataforma funcional inicial; **não representa a conclusão integral dos 140 requisitos nem homologação para operação escolar em produção**.

## Como interpretar

- **Implementado:** comportamento principal existe no código. A coluna de evidência distingue teste automatizado de revisão de código; este estado não afirma certificação de acessibilidade ou homologação com crianças.
- **Parcial:** existe parte útil do fluxo, mas falta pelo menos uma capacidade explícita do requisito.
- **Planejado:** o requisito consta do documento de origem e não tem implementação operacional nesta versão; não indica prazo assumido.

Nesta revisão: **35 implementados, 76 parciais e 29 planejados**. Os requisitos são amplos: por exemplo, ter CSV e impressão não equivale a cumprir todos os formatos de exportação, e armazenar áudio não equivale a calcular fluência.

Os rótulos P01–P12, D01–D05, S01–S11, O01–O04 e W01–W08 são referências documentais aos **nomes reais dos 40 testes** listados ao final. Não são identificadores inseridos artificialmente nos arquivos de teste. “Revisão” significa inspeção de implementação, sem caso automatizado específico para toda a abrangência do requisito.

## Arquivos de referência

| Sigla | Implementação |
| --- | --- |
| APP | [apps/plataforma/components/Letria.tsx](../apps/plataforma/components/Letria.tsx): navegação, painel infantil, missões, PWA e autenticação |
| JOGO | [apps/plataforma/components/Game.tsx](../apps/plataforma/components/Game.tsx): execução, feedback, pausa e prática livre |
| ED | [apps/plataforma/components/Educator.tsx](../apps/plataforma/components/Educator.tsx): professor, família, administração e relatórios |
| CAT | [apps/plataforma/lib/content.ts](../apps/plataforma/lib/content.ts): 5 etapas, 20 atividades, 100 itens e diagnóstico |
| PED | [apps/plataforma/lib/pedagogy.ts](../apps/plataforma/lib/pedagogy.ts): avaliação, domínio, recomendação, XP e histórico |
| CLIENTE | [apps/plataforma/lib/client.ts](../apps/plataforma/lib/client.ts): IndexedDB, fila offline e validação de rascunhos |
| AUT | [apps/plataforma/lib/server/platform.ts](../apps/plataforma/lib/server/platform.ts), [actions.ts](../apps/plataforma/lib/server/actions.ts), [security.ts](../apps/plataforma/lib/server/security.ts), [API](../apps/plataforma/app/api/platform/route.ts) |
| DB | [apps/plataforma/db/schema.ts](../apps/plataforma/db/schema.ts), [migração SQL](../apps/plataforma/drizzle/0000_acoustic_mimic.sql) |
| VOZ | [apps/plataforma/components/Recorder.tsx](../apps/plataforma/components/Recorder.tsx): captura e reprodução local |
| AUDIO | [apps/plataforma/lib/server/storage.ts](../apps/plataforma/lib/server/storage.ts), [API de áudio](../apps/plataforma/app/api/audio/route.ts): consentimento e R2 privado |
| PWA | [apps/plataforma/public/sw.js](../apps/plataforma/public/sw.js), [apps/plataforma/public/manifest.webmanifest](../apps/plataforma/public/manifest.webmanifest), [apps/plataforma/app/layout.tsx](../apps/plataforma/app/layout.tsx) |

## Regras aplicadas na versão

**Atualização da experiência:** o mapa agora avança por 20 territórios sequenciais. Uma tentativa com 80% ou mais conquista um território; quatro territórios abrem o mundo seguinte. Conquistas não são revogadas por erros posteriores. A matriz de domínio do professor continua avaliando 10 questões distintas em duas atividades, 80% de acerto e erros recentes, separadamente da ordem do mapa. Veja [Trilha e Lumi](TRILHA_E_LUMI.md).

XP é concedido uma única vez por estudante/atividade com resultado de pelo menos 80%. Nível de experiência e acesso pedagógico são conceitos separados. O baú permite prática livre explícita de mundos futuros; isso não libera etapas sem cumprir a cadeia de pré-requisitos.

A matriz docente mostra o estado de domínio por evidências da trilha. Os cartões de aproveitamento geral continuam mostrando a **média de todas as tentativas**, com sinal de apoio abaixo de 70%; essa média **não equivale ao domínio de 80% com amostra mínima**. O relatório individual também apresenta a sondagem inicial, que contém apenas dois itens por etapa e não deve ser interpretada como diagnóstico completo de alfabetização.

Atividades docentes possuem correção e histórico, mas não entram na evidência de domínio dos cinco mundos do catálogo. Seu XP oficial entra no saldo. Ainda falta mapear atividades autorais validadas à matriz de habilidades.


## Módulo 1 — Autenticação e gestão de usuários

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-001 | Cadastro de usuários | Parcial | Estudante, professor, responsável e administrador. Coordenador, gestor e avaliador próprios ainda ausentes. | AUT, ED; S01, S04, S05 |
| RF-002 | Formas de acesso | Parcial | E-mail/senha e código individual. Sem matrícula/senha, QR Code, código de turma, código visual ou login institucional. | AUT; S04, S05 |
| RF-003 | Recuperação de acesso | Parcial | Professor pode renovar código do estudante e invalidar suas sessões. Sem recuperação de senha por e-mail. | AUT, ED; revisão |
| RF-004 | Perfil do estudante | Parcial | Nome, ano, turma, instituição, avatar e histórico. Sem nascimento, necessidades educacionais estruturadas ou classificação validada. | AUT, ED, PED; revisão |
| RF-005 | Perfis e permissões | Implementado | RBAC no servidor, isolamento institucional, professor restrito às turmas atribuídas e responsável restrito ao estudante vinculado. | AUT; S01, S03, S05, S06, S11 |
| RF-006 | Vinculação familiar | Implementado | Admin cria contas de responsáveis vinculadas a um estudante; mais de uma conta pode apontar ao mesmo estudante. | AUT, ED; revisão |
| RF-007 | Importação de usuários | Parcial | Cadastros manuais de turma e estudante. Sem importação CSV/XLSX ou integração escolar. | ED, AUT; revisão |
| RF-008 | Transferência de estudante | Parcial | Mudança de turma da mesma instituição preserva o estudante e seus resultados. Sem transferência entre escolas. | ED, AUT; S08 |

## Módulo 2 — Escolas, turmas e grupos

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-009 | Cadastro institucional | Parcial | Cadastro de escola, administrador, turmas e ano. Sem hierarquia de rede, turnos ou etapas configuráveis. | AUT, ED; S04 |
| RF-010 | Organização das turmas | Parcial | Lista de estudantes, tentativas e aproveitamento. Sem nível de alfabetização docente formalmente validado. | ED; revisão |
| RF-011 | Grupos pedagógicos | Planejado | Não há entidade nem editor de grupos pedagógicos. | ED, DB; revisão |
| RF-012 | Enturmação sugerida | Planejado | Não há algoritmo de agrupamento de estudantes. | PED, ED; revisão |
| RF-013 | Atribuição de professores | Parcial | Administrador vincula ou transfere um educador responsável; professor acessa apenas suas turmas. Falta co-docência com múltiplos responsáveis pela mesma turma. | AUT, DB, ED; S11 |

## Módulo 3 — Avaliação diagnóstica

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-014 | Avaliação inicial | Implementado | Sondagem jogável com 10 questões e registro das respostas. | CAT, JOGO, PED; P08 |
| RF-015 | Habilidades avaliadas | Parcial | Duas questões por etapa, de letras à compreensão. Sem pseudopalavras, avaliação oral de fluência ou produção. | CAT; P01, P08 |
| RF-016 | Avaliação adaptativa | Planejado | A sondagem tem sequência fixa; tempo e pedidos de ajuda não adaptam seus itens. | CAT, PED; revisão |
| RF-017 | Interrupção inteligente | Planejado | A sondagem termina após os 10 itens, sem critério psicométrico de parada. | CAT, JOGO; revisão |
| RF-018 | Classificação do estudante | Parcial | Domínio e foco sugerido por regras fixas. Sem níveis de alfabetização configuráveis ou confirmação docente. | PED; P03–P06, P08 |
| RF-019 | Reavaliação periódica | Parcial | Diagnóstico pode ser repetido; faltam agenda de avaliações e recorrência. | APP, CAT; revisão |
| RF-020 | Observações da aplicação | Parcial | Notas e intervenções livres. Sem formulário de hesitações, omissões e autocorreções por item. | ED, AUT; revisão |

## Módulo 4 — Matriz de habilidades

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-021 | Cadastro da matriz | Parcial | Cinco eixos fixos com pré-requisitos. Sem CRUD de matriz por ano, dificuldade e evidência. | CAT, PED; P01, P05 |
| RF-022 | Alinhamento curricular | Planejado | Não há códigos BNCC nem mapeamento de currículo institucional. | CAT, DB; revisão |
| RF-023 | Pré-requisitos | Implementado | Cadeia entre cinco mundos; territórios anteriores resolvidos governam o avanço na trilha. | PED, AUT; P03–P05, S03, S10 |
| RF-024 | Escala de domínio | Parcial | Estados bloqueado, disponível, revisão e consolidado. A escala não é configurável. | PED; P03, P05, P06 |
| RF-025 | Atualização do domínio | Parcial | Acerto mais recente por item e erros recentes recalculam domínio. Tempo e frequência não ponderam o domínio. | PED; P04–P06 |

## Módulo 5 — Trilhas de alfabetização

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-026 | Trilhas sequenciais | Implementado | Cinco etapas, quatro atividades por etapa, mapa de jornada. | CAT, APP; P01 |
| RF-027 | Trilhas personalizadas | Parcial | Recomendação individual de início, prática, revisão ou avanço. Não cria uma sequência editável exclusiva. | PED, APP; P03, P05, P06 |
| RF-028 | Trilhas por turma | Parcial | Atribuição de uma atividade por missão; sem atribuição de uma trilha completa. | ED, AUT; revisão |
| RF-029 | Trilhas por grupo | Planejado | Sem grupos pedagógicos ou atribuição por grupo. | DB; revisão |
| RF-030 | Trilhas individuais | Planejado | Missões são atribuídas por turma; notas individuais não equivalem a atividades exclusivas. | ED, AUT; revisão |
| RF-031 | Pré-requisitos para avanço | Implementado | Servidor controla trilha; biblioteca usa prática livre explícita sem pular a cadeia de pré-requisitos. | PED, JOGO, AUT; P03–P05, S03, S10 |
| RF-032 | Desbloqueio progressivo | Implementado | Acesso conquistado por atividades resolvidas permanece; revisões posteriores não apagam conquistas. | PED; P05, P06 |
| RF-033 | Revisão espaçada | Planejado | Não existe agenda por intervalo ou teste de retenção. | PED; revisão |
| RF-034 | Recuperação automática | Implementado | Erros recentes priorizam atividade para revisão no primeiro mundo disponível que precisa de apoio. | PED, APP; P06 |

## Módulo 6 — Banco de atividades

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-035 | Tipos de atividades | Parcial | 100 itens de escolha/ordenação e leitura oral nos mundos avançados. Sem pseudopalavras, reconto ou produção textual livre. | CAT, JOGO, VOZ; P01, P02 |
| RF-036 | Filtros de atividades | Parcial | Busca textual, mundo, catálogo institucional e favoritos. Sem faixa etária, ano e dificuldade estruturados. | ED, APP; revisão |
| RF-037 | Recursos multimídia | Parcial | Texto, ilustrações/ícones, narração do navegador e gravação. Sem editor de vídeo/animações ou upload de imagem por questão. | JOGO, VOZ, ED; revisão |
| RF-038 | Banco institucional | Implementado | Atividades autorais da instituição com rascunho, publicação e versões. | ED, AUT, DB; S09 |
| RF-039 | Favoritos | Parcial | Favoritos docentes em armazenamento do navegador, sem sincronização entre dispositivos. | ED; revisão |
| RF-040 | Duplicação e adaptação | Planejado | Editor cria/edita atividades próprias; duplicar uma atividade do catálogo não está implementado. | ED; revisão |

## Módulo 7 — Autoria de atividades

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-041 | Editor visual | Implementado | Formulários para atividade e questões de escolha ou ordenação, sem programação. | ED, AUT; S09 |
| RF-042 | Modelos prontos | Parcial | Dois formatos de questão; sem galeria de modelos de jogos. | ED; revisão |
| RF-043 | Configuração pedagógica | Parcial | Título, instrução, habilidade, mundo, gabarito, feedback, duração estimada e XP. Sem dificuldade, limite de tentativas ou tempo obrigatório. | ED, AUT; S09 |
| RF-044 | Criação assistida | Planejado | Não há geração automática a partir de tema/objetivo. | ED; revisão |
| RF-045 | Validação humana | Parcial | Publicação manual de rascunhos; não existe conteúdo gerado automaticamente nem aprovação independente. | ED, AUT; S09 |
| RF-046 | Pré-visualização | Implementado | Prévia não registra resultados de estudante. | ED, JOGO; revisão |
| RF-047 | Agendamento | Parcial | Missões possuem data de entrega. Não há janela de abertura/encerramento com horário. | ED, AUT; revisão |
| RF-048 | Compartilhamento | Implementado | Catálogo institucional acessível a professores da mesma instituição. | AUT, ED; S01, S09 |
| RF-049 | Versionamento | Implementado | Snapshots publicados preservados e envio com versão para correção do gabarito correspondente. | AUT, DB, JOGO; S09 |

## Módulo 8 — Gamificação

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-050 | Sistema de pontos | Parcial | XP uma vez por atividade com pelo menos 80% de acertos. Sem bônus separados de melhoria/frequência. | PED, AUT; P07, S02 |
| RF-051 | Experiência e níveis | Implementado | XP oficial acumulado, moedas derivadas e níveis de experiência. | PED, APP; P10, P12, D05 |
| RF-052 | Medalhas e conquistas | Parcial | Conquistas visuais por marcos fixos. Sem regras editoráveis ou medida de autonomia. | APP; revisão |
| RF-053 | Missões | Parcial | Missões docentes por turma com título e prazo; metas diárias do sistema. Sem recorrência semanal configurável. | APP, ED, AUT; revisão |
| RF-054 | Narrativa gamificada | Implementado | Mundos, mapa, personagem, missões e linguagem de aventura educativa. | APP, JOGO, CAT; revisão |
| RF-055 | Avatar | Parcial | Escolha entre avatares no dispositivo; cadastro docente também registra avatar. Escolha do estudante não sincroniza com perfil servidor. | APP, ED, AUT; revisão |
| RF-056 | Recompensas virtuais | Parcial | Moedas e conquistas exibidas. Sem loja, roupas, cenários ou inventário desbloqueável. | APP, PED; D05 |
| RF-057 | Sequência de participação | Implementado | Sequência por dia em São Paulo; nenhuma dedução de XP por interrupção. | PED; P06, P11 |
| RF-058 | Ranking configurável | Planejado | Rankings individuais/equipes não estão presentes. | APP; revisão |
| RF-059 | Proteção da criança | Implementado | Não há ranking público nem exposição pública de menores com baixo desempenho. | APP, AUT; S01, S05 |
| RF-060 | Recompensas pedagógicas | Parcial | Domínio depende de evidências; sem prêmio por velocidade ou punição por erro. Autonomia e evolução ainda não têm recompensa própria. | PED, JOGO; P03–P07 |
| RF-061 | Eventos coletivos | Planejado | Mensagem visual de cooperação não corresponde a uma missão cooperativa persistida. | APP, DB; revisão |

## Módulo 9 — Execução e correção

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-062 | Orientação multimodal | Implementado | Enunciados escritos, estímulos visuais e botão de narração. | JOGO, CLIENTE; revisão |
| RF-063 | Feedback imediato | Implementado | Resposta seguida de retorno acolhedor e continuidade da missão. | JOGO, PED; P02 |
| RF-064 | Feedback pedagógico | Implementado | Pistas e explicações específicas em cada questão. | CAT, JOGO; P01 |
| RF-065 | Tentativas | Planejado | Não há número de tentativas/comportamento por erro configurável pelo professor. | ED, JOGO; revisão |
| RF-066 | Registro detalhado | Parcial | Respostas, acerto, tentativas completas, versão, duração e data no servidor. Pistas/estado parcial ficam no rascunho; dispositivo e abandono não são eventos analíticos. | AUT, CLIENTE, JOGO; P09, S02, D01–D04 |
| RF-067 | Correção automática | Implementado | Servidor recalcula escolha/ordenação sem confiar em XP ou nota enviada. | PED, AUT; P02, P09, S02 |
| RF-068 | Correção pelo professor | Parcial | Gravação e nota/intervenção humana; sem produção aberta e sem workflow formal de correção ligado a uma resposta. | VOZ, ED, AUT; S07 |
| RF-069 | Correção por rubrica | Planejado | Não há editor de rubricas. | ED, DB; revisão |
| RF-070 | Atividades coletivas | Planejado | Execução e resultados são individuais. | JOGO, DB; revisão |

## Módulo 10 — Leitura oral e fluência

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-071 | Gravação de leitura | Parcial | Microfone opcional após atividades de frases/textos, com consentimento e armazenamento privado. Sem leitura oral de palavras em fluxo dedicado. | JOGO, VOZ, AUDIO; S07 |
| RF-072 | Reprodução pelo professor | Parcial | API de áudio autorizada e acompanhamento com notas. Avaliação formal associada à gravação não está modelada. | ED, AUDIO; S07 |
| RF-073 | Indicadores de fluência | Planejado | Não são calculados palavras/minuto, precisão oral, pausas ou autocorreções. | VOZ, AUDIO; revisão |
| RF-074 | Análise automatizada | Planejado | Sem reconhecimento de fala, transcrição ou modelo de análise oral. | VOZ, AUDIO; revisão |
| RF-075 | Validação do professor | Planejado | Não há resultados de reconhecimento de fala a confirmar/corrigir. | ED; revisão |
| RF-076 | Biblioteca de textos | Parcial | Pequenos textos autorais integrados às atividades; sem acervo filtrável por gênero, extensão e dificuldade. | CAT; P01 |
| RF-077 | Compreensão após leitura | Implementado | Perguntas literais, inferenciais e de síntese após textos curtos. | CAT, JOGO; P01 |

## Módulo 11 — Personalização da aprendizagem

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-078 | Perfil pedagógico individual | Parcial | Evidências por mundo e recomendação. Sem perfil completo de ritmo/fluência ou taxonomia de dificuldades. | PED, ED; P05, P06, P10 |
| RF-079 | Próxima atividade recomendada | Implementado | Indica o próximo território da sequência; após toda a trilha, sugere prática/revisão. | PED, APP; P03, P05, P06, P12 |
| RF-080 | Detecção de dificuldades | Parcial | Identifica itens errados e baixa precisão por mundo; não classifica tipos de troca, omissão ou lentidão. | PED, ED; P06 |
| RF-081 | Plano de intervenção | Parcial | Sugestão de revisão e notas de intervenção; sem plano completo com frequência/prazo/reavaliação. | PED, ED, AUT; P06 |
| RF-082 | Controle do professor | Parcial | Docente registra intervenções e escolhe missões, mas não altera/aceita/rejeita recomendação ou domínio formalmente. | ED, PED; revisão |
| RF-083 | Ajuste de dificuldade | Parcial | Encaminhamento para revisão ou etapa seguinte; itens da atividade não se ajustam dinamicamente. | PED; P05, P06 |
| RF-084 | Preferências do estudante | Parcial | Avatar e preferências visuais. Sem seleção adaptativa de conteúdos por interesses. | APP; revisão |

## Módulo 12 — Painel do estudante

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-085 | Tela inicial infantil | Implementado | Missão, próxima atividade, progresso, avatar, XP, conquistas e continuar. | APP; revisão |
| RF-086 | Mapa da jornada | Implementado | Atividades concluídas, mundos acessíveis e futuros; acesso livre pelo baú. | APP, PED; P03, P05, P06, S10 |
| RF-087 | Portfólio | Parcial | Conquistas e resultados; gravações no acompanhamento familiar/docente. Sem portfólio de textos/trabalhos acessível ao estudante. | APP, ED, AUDIO; revisão |
| RF-088 | Feedback de evolução | Parcial | Mensagens positivas e progresso individual. Sem comparação longitudinal explícita antes/depois. | JOGO, APP; P06 |

## Módulo 13 — Painel do professor

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-089 | Visão geral da turma | Parcial | Participação, tentativas, média, missões e estudantes com média baixa. Sem todos os estados de pendência/domínio configurável. | ED; revisão |
| RF-090 | Mapa de habilidades | Implementado | Matriz estudante × mundo usa estado, precisão e amostra de domínio calculados pela mesma lógica da trilha. | ED, PED; P04–P06, revisão da integração |
| RF-091 | Alertas pedagógicos | Parcial | Média abaixo de 70% indica necessidade de incentivo; não cobre estagnação, queda temporal ou reavaliação. | ED; revisão |
| RF-092 | Filtros e detalhamento | Parcial | Filtros por turma/estudante nos relatórios e mundo na biblioteca. Sem período e combinações completas. | ED; revisão |
| RF-093 | Registro de intervenção | Parcial | Intervenções persistidas com estudante, autor e data. Não liga automaticamente um plano a resultados posteriores. | ED, AUT; revisão |
| RF-094 | Diário pedagógico | Parcial | Notas individuais persistentes; sem diário coletivo por turma. | ED, AUT; revisão |

## Módulo 14 — Relatórios personalizados

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-095 | Relatório individual | Parcial | Tentativas, domínio por mundo, diagnóstico inicial, datas, tempo e notas. Sem nível validado, fluência oral, comparação temporal completa ou objetivos estruturados. | ED; revisão |
| RF-096 | Relatório da turma | Parcial | Consolidação por turma e mundo; sem recorte por período e nível configurável. | ED; revisão |
| RF-097 | Relatório comparativo | Planejado | Não há comparação de diagnóstico/intermediárias/final; tabela de histórico não substitui esse relatório. | ED; revisão |
| RF-098 | Relatório de agrupamentos | Planejado | Sem agrupamentos sugeridos. | ED; revisão |
| RF-099 | Relatório institucional | Parcial | Visão da instituição/turmas; sem rede, múltiplas escolas, professores e período. | ED, AUT; revisão |
| RF-100 | Relatório narrativo | Parcial | Parecer manual editável e salvo; não há geração automática de síntese. | ED; revisão |
| RF-101 | Exportação | Parcial | CSV e impressão/salvar PDF pelo navegador. Sem arquivo XLSX ou gerador PDF próprio. | ED; revisão |
| RF-102 | Compartilhamento com responsáveis | Parcial | Portal familiar e intervenções compartilhadas; sem publicação de uma versão controlada de relatório. | ED, AUT; revisão |
| RF-103 | Histórico longitudinal | Parcial | Histórico persiste ao mudar/remover turma. Sem transferência entre instituições e sem ciclo anual estruturado. | DB, AUT; S08 |

## Módulo 15 — Portal dos responsáveis

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-104 | Acompanhamento familiar | Parcial | Missões, médias por mundo, XP e intervenções do estudante vinculado; sem catálogo completo de conquistas. | ED, AUT; S01, S05 |
| RF-105 | Orientações para casa | Parcial | Orientação simples fixa e intervenções docentes. Não há biblioteca personalizada por evidência. | ED; revisão |
| RF-106 | Notificações | Parcial | Notificações internas de missões/diagnóstico/intervenção. Sem e-mail ou push. | ED, AUT; revisão |
| RF-107 | Comunicação | Planejado | Responsável não envia mensagens ao professor; mural é de leitura. | ED, AUT; revisão |
| RF-108 | Linguagem acessível | Implementado | Portal familiar explica prática e progresso em linguagem simples e positiva. | ED; revisão |

## Módulo 16 — PWA e offline

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-109 | Instalação como aplicativo | Implementado | Manifesto, ícones, service worker e fluxo de instalação; homologação entre navegadores ainda necessária. | PWA, APP; W06; homologação de navegador pendente |
| RF-110 | Funcionamento offline | Implementado | Pacote baixado inclui shell e dependências; dados e respostas ficam em IndexedDB. Navegação fria sem rede ainda precisa de homologação em navegador. | PWA, APP, CLIENTE; O01–O04, W01–W08; homologação de navegador pendente |
| RF-111 | Sincronização automática | Implementado | Fila IndexedDB, envio ao reconectar e idempotência servidor; falta homologar o ciclo completo desconexão/reconexão no navegador. | APP, CLIENTE, AUT; S02 |
| RF-112 | Conteúdo offline | Parcial | Download do pacote local pelo usuário; sem seleção docente de trilhas/atividades por turma. | APP, PWA; O03, O04, W01–W03 |
| RF-113 | Estado da conexão | Implementado | Indicadores online, offline, sincronizando e quantidade pendente. | APP; revisão |
| RF-114 | Prevenção de perda de dados | Implementado | Rascunho por conta/atividade e fila persistente; conserva índice, respostas, seleção e identificador de envio. | CLIENTE, JOGO; D01–D04, S02 |
| RF-115 | Atualização do PWA | Implementado | Nova versão aguarda ação explícita; atualização bloqueada durante missão e envios pendentes. Falta homologar atualização entre builds no navegador. | APP, PWA; validação de navegador necessária |
| RF-116 | Notificações push | Planejado | Sem assinatura Push API, VAPID ou serviço de envio. | PWA; revisão |

## Módulo 17 — Acessibilidade e inclusão

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-117 | Leitura das instruções | Implementado | Narração pt-BR usando síntese de voz quando disponível no navegador. | CLIENTE, JOGO; revisão |
| RF-118 | Configuração visual | Parcial | Fonte, contraste, redução de movimento e som ligado/desligado. Sem espaçamento, volume contínuo ou temas completos. | APP, ED, AUT; revisão |
| RF-119 | Navegação acessível | Parcial | Botões semânticos, rótulos, foco e navegação por teclado. Falta auditoria completa com leitores de tela e dispositivos. | APP, JOGO, ED; validação assistiva necessária |
| RF-120 | Tempo configurável | Parcial | Missões sem limite obrigatório para todos; não há configuração por estudante. Gravação tem limite próprio. | JOGO, VOZ; revisão |
| RF-121 | Atividades adaptadas | Parcial | Editor permite adaptar texto/opções e há narração/fonte. Sem variantes vinculadas para uma mesma habilidade. | ED, JOGO; revisão |
| RF-122 | Registro de adaptações | Planejado | Preferências de sessão não são registradas como evidência pedagógica por tentativa. | AUT, DB; revisão |

## Módulo 18 — Comunicação e engajamento

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-123 | Central de notificações | Implementado | Lista interna, indicadores de não lido e marcação de leitura. | APP, ED, AUT; revisão |
| RF-124 | Mensagens por turma | Parcial | Atribuições geram avisos; mural/intervenções são por estudante. Sem comunicado livre direcionado a turma. | ED, AUT; revisão |
| RF-125 | Agenda pedagógica | Parcial | Lista de missões com prazo; sem calendário e avaliações agendadas. | APP, ED; revisão |
| RF-126 | Campanhas temáticas | Planejado | Sem entidade de campanha, evento ou desafio coletivo. | DB, APP; revisão |

## Módulo 19 — Administração e configuração

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-127 | Gestão do catálogo | Parcial | Cadastro/revisão/publicação de atividades. Sem gestão de matriz, biblioteca de mídia e jogos novos. | ED, AUT; S09 |
| RF-128 | Parâmetros de gamificação | Parcial | XP configurável na atividade autoral; níveis/moedas/marcos têm regras fixas. | ED, PED, AUT; P07, S02 |
| RF-129 | Configuração dos níveis | Planejado | Nomes e limiares de domínio são definidos em código. | PED, CAT; revisão |
| RF-130 | Aprovação de conteúdos | Parcial | Rascunho e publicação manual pelo educador; sem etapa independente de revisão/aprovador. | ED, AUT; S09 |
| RF-131 | Auditoria | Parcial | Log de ações administrativas e de áudio; sem console, trilha completa de acessos ou retenção de auditoria. | AUT, AUDIO, DB; revisão |
| RF-132 | Gestão de consentimento | Parcial | Consentimento de voz, revogação e exclusão de gravações. Sem consentimentos separados de imagem/dados/automação. | ED, AUT, AUDIO; S07 |
| RF-133 | Anonimização | Planejado | Exportação inclui identificação; sem modo de pesquisa anonimizado. | ED; revisão |
| RF-134 | Retenção e exclusão | Parcial | Exclusão de estudante/áudio e correção cadastral; sem política de retenção, exportação integral ou gestão completa de contas. Exclusão de estudante apaga resultados. | AUT, AUDIO, DB; S07 |

## Módulo 20 — Inteligência pedagógica

| RF | Requisito | Estado | Entrega e limite | Evidência |
| --- | --- | --- | --- | --- |
| RF-135 | Recomendações explicáveis | Parcial | Regras e motivo textual de prática/revisão. Não há painel detalhado com cada evidência que motivou a decisão. | PED, APP; P03, P05, P06 |
| RF-136 | Atividades personalizadas | Planejado | Não há geração automática por habilidade/idade/interesse. | ED, PED; revisão |
| RF-137 | Textos graduados | Parcial | Textos fixos nas etapas avançadas; sem seleção automática por vocabulário/extensão. | CAT; P01 |
| RF-138 | Identificação de padrões | Parcial | Revisão por erro recente e baixa precisão, sem diagnóstico clínico. Falta classificação persistente de padrões específicos. | PED; P06 |
| RF-139 | Assistente do professor | Planejado | Não há chat ou assistente generativo docente. | ED; revisão |
| RF-140 | Revisão obrigatória de IA | Planejado | A Lumi tem tutor opcional por IA, sem publicação de conteúdo curricular. Geração e publicação de atividades por IA continuam fora do escopo. | ED, AUT; revisão |

## Regras de negócio

| RN | Estado | Evidência e limite |
| --- | --- | --- |
| RN-001 — Avanço pedagógico | Implementado | Domínio independe de XP. PED; P03–P05, S10. |
| RN-002 — Domínio mínimo | Parcial | Limiar de 80% definido em código, sem configuração por instituição. PED; P05. |
| RN-003 — Múltiplas evidências | Implementado | 10 itens distintos/2 atividades; repetição não infla amostra. P04, P05. |
| RN-004 — Erros recentes | Implementado | Revisão por erros recentes com preservação do acesso adquirido. P06. |
| RN-005 — Velocidade | Implementado | Tempo não determina sucesso nem gera prêmio; é registrado por atividade. PED, JOGO. |
| RN-006 — Proteção emocional | Implementado | Feedback acolhedor, sem perda de XP por erro ou pausa. P06, JOGO. |
| RN-007 — Competição saudável | Parcial | Ranking público não existe; modo de ranking opcional/cooperativo também não. APP. |
| RN-008 — Decisão pedagógica | Parcial | Professor registra intervenções; não há override formal de classificação/progressão. ED, PED. |
| RN-009 — Conteúdo automatizado | Parcial | Rascunho/publicação manual existem. Geração automática e validação obrigatória de IA não foram implementadas. S09. |
| RN-010 — Dados sensíveis | Implementado | API restringe instituição, turma docente e estudante; áudio requer consentimento e não usa cache público. S01, S05, S07, S11, O01, W04, W05. |

## Testes automatizados existentes

Os 17 testes de domínio/rascunhos são complementados por 12 testes de service worker em ambiente simulado. Os 11 testes de API executam os handlers reais com SQLite em memória e um adaptador de R2. A suíte principal soma 40 casos e não substitui homologação em navegador ou infraestrutura remota.

| Referência | Nome exato do teste | Arquivo |
| --- | --- | --- |
| P01 | RF conteúdo: cinco etapas, vinte atividades e cem desafios com gabaritos válidos | [pedagogy.test.ts](../apps/plataforma/tests/pedagogy.test.ts) |
| P02 | RF avaliação: comparação aceita caixa e espaços; ordenação exige sequência completa | [pedagogy.test.ts](../apps/plataforma/tests/pedagogy.test.ts) |
| P03 | RN progressão: XP isolado não libera mundos nem recomenda etapas bloqueadas | [pedagogy.test.ts](../apps/plataforma/tests/pedagogy.test.ts) |
| P04 | RN evidência mínima: repetir uma questão ou uma atividade não infla a amostra | [pedagogy.test.ts](../apps/plataforma/tests/pedagogy.test.ts) |
| P05 | RN domínio: evidência pedagógica não pula territórios ainda não conquistados | [pedagogy.test.ts](../apps/plataforma/tests/pedagogy.test.ts) |
| P06 | RN revisão: erros recentes acionam apoio sem apagar XP ou acesso conquistado | [pedagogy.test.ts](../apps/plataforma/tests/pedagogy.test.ts) |
| P07 | RN recompensas: atividade incompleta não conclui; corrigir depois recompensa uma única vez | [pedagogy.test.ts](../apps/plataforma/tests/pedagogy.test.ts) |
| P08 | RF diagnóstico: dez itens graduais em cinco habilidades não substituem a prática | [pedagogy.test.ts](../apps/plataforma/tests/pedagogy.test.ts) |
| P09 | RF avaliação no servidor: respostas ausentes erram e gabaritos adulterados não contam | [pedagogy.test.ts](../apps/plataforma/tests/pedagogy.test.ts) |
| P10 | RF histórico: reconstrução ordena evidências e respeita XP oficial, incluindo conteúdo docente | [pedagogy.test.ts](../apps/plataforma/tests/pedagogy.test.ts) |
| P11 | RN frequência: dias consecutivos usam horário de São Paulo e não duplicam no mesmo dia | [pedagogy.test.ts](../apps/plataforma/tests/pedagogy.test.ts) |
| P12 | RF resumo: diagnóstico não distorce desempenho das missões e progresso inicial é positivo | [pedagogy.test.ts](../apps/plataforma/tests/pedagogy.test.ts) |
| D01 | RF114: rascunho retoma resposta parcial, questão e identificador de envio | [client-drafts.test.ts](../apps/plataforma/tests/client-drafts.test.ts) |
| D02 | RF114: contas e versões diferentes não recuperam respostas de outro contexto | [client-drafts.test.ts](../apps/plataforma/tests/client-drafts.test.ts) |
| D03 | RF114: rascunho corrompido não pula questões nem restaura feedback incoerente | [client-drafts.test.ts](../apps/plataforma/tests/client-drafts.test.ts) |
| D04 | RF114: ordenação parcial preserva peças sem aceitar duplicação inválida | [client-drafts.test.ts](../apps/plataforma/tests/client-drafts.test.ts) |
| D05 | RF progresso: cliente usa a soma oficial de XP e moedas para atividades docentes | [client-drafts.test.ts](../apps/plataforma/tests/client-drafts.test.ts) |
| S01 | demo institutions are isolated and role authorization is server enforced | [api-security.test.mjs](../apps/plataforma/tests/api-security.test.mjs) |
| S02 | scores are recomputed; submissions are idempotent and XP cannot be farmed | [api-security.test.mjs](../apps/plataforma/tests/api-security.test.mjs) |
| S03 | locked worlds and unauthorized student IDs are rejected | [api-security.test.mjs](../apps/plataforma/tests/api-security.test.mjs) |
| S04 | registration is empty, passwords are salted hashes and actual roles cannot switch | [api-security.test.mjs](../apps/plataforma/tests/api-security.test.mjs) |
| S05 | student code only grants student access to its own profile | [api-security.test.mjs](../apps/plataforma/tests/api-security.test.mjs) |
| S06 | cross-origin writes are rejected | [api-security.test.mjs](../apps/plataforma/tests/api-security.test.mjs) |
| S07 | private audio requires guardian consent and revocation removes file | [api-security.test.mjs](../apps/plataforma/tests/api-security.test.mjs) |
| S08 | classroom deletion preserves student learning history | [api-security.test.mjs](../apps/plataforma/tests/api-security.test.mjs) |
| S09 | published versions remain available during edits and grading uses requested snapshot | [api-security.test.mjs](../apps/plataforma/tests/api-security.test.mjs) |
| S10 | explicit free practice is allowed without changing journey prerequisites | [api-security.test.mjs](../apps/plataforma/tests/api-security.test.mjs) |
| S11 | teachers can only read and mutate their assigned classrooms; admin can transfer ownership | [api-security.test.mjs](../apps/plataforma/tests/api-security.test.mjs) |
| O01 | RF-110/RN-010: service worker nunca armazena API privada ou gravações | [offline.test.ts](../apps/plataforma/tests/offline.test.ts) |
| O02 | RF-110: navegação offline recupera shell sem inventar dados | [offline.test.ts](../apps/plataforma/tests/offline.test.ts) |
| O03 | RF-112: download explícito inclui dependências de scripts e fontes | [offline.test.ts](../apps/plataforma/tests/offline.test.ts) |
| O04 | RF-112: arquivos privados ou download incompleto retornam falha | [offline.test.ts](../apps/plataforma/tests/offline.test.ts) |
| W01 | download follows transitive and deferred build assets before making the shell available offline | [service-worker.test.ts](../apps/plataforma/tests/service-worker.test.ts) |
| W02 | an incomplete transfer never replaces an existing complete offline package | [service-worker.test.ts](../apps/plataforma/tests/service-worker.test.ts) |
| W03 | HTML error documents returned as scripts cannot produce a successful download | [service-worker.test.ts](../apps/plataforma/tests/service-worker.test.ts) |
| W04 | API, audio, identity, RSC, authorized, POST, range and external requests bypass the worker | [service-worker.test.ts](../apps/plataforma/tests/service-worker.test.ts) |
| W05 | download messages cannot put private or external URLs into the public cache | [service-worker.test.ts](../apps/plataforma/tests/service-worker.test.ts) |
| W06 | the first installation offers offline instructions and updates wait for an explicit choice | [service-worker.test.ts](../apps/plataforma/tests/service-worker.test.ts) |
| W07 | live navigation does not overwrite the downloaded shell with a partially loaded version | [service-worker.test.ts](../apps/plataforma/tests/service-worker.test.ts) |
| W08 | the known static HTML redirect is accepted without accepting sign-in or external redirects | [service-worker.test.ts](../apps/plataforma/tests/service-worker.test.ts) |

Execução:

```powershell
npm test
# Ou separadamente:
npm run test:unit
npm run test:api
```

Evidência adicional: [apps/plataforma/tests/api-http-smoke.test.mjs](../apps/plataforma/tests/api-http-smoke.test.mjs), caso `real HTTP: durable D1, school workflow, private R2, access control, idempotency`, foi executado contra servidor local com D1/R2 emulados e passou. Este é um teste adicional aos 40 acima. Ele cria apenas uma instituição de demonstração isolada com registros fictícios.

```powershell
$env:LETRIA_TEST_URL = 'http://localhost:3001'
node --test apps/plataforma/tests/api-http-smoke.test.mjs
```

Sem `LETRIA_TEST_URL`, esses comandos encerram com erro e instruções para informar a origem de teste. O arquivo [apps/plataforma/tests/rendered-html.test.mjs](../apps/plataforma/tests/rendered-html.test.mjs) acrescenta verificações HTTP do shell, metadados, manifesto, ícones e service worker. Rode `npm run test:render` com o servidor local ativo; esses casos são adicionais aos 40 testes principais e não simulam interação em navegador.

Validação final em 16/09/2026: **40/40** casos de `npm test`, **1/1** caso de `npm run test:http` e **2/2** casos de `npm run test:render` passaram contra o servidor local apropriado. `npm run lint`, `npm run typecheck` e `npm run build` passaram. Os testes HTTP finais usaram a origem local `http://127.0.0.1:3002`; não houve QA visual ou interação automatizada em navegador.

## Validações ainda necessárias

- Teste de ponta a ponta de instalar, baixar, fechar o aplicativo, reabrir sem rede, continuar rascunho, concluir, reconectar e conferir um único resultado.
- Teste de atualização real do service worker preservando filas e rascunhos.
- Navegação assistiva, contraste, leitura de tela, microfone e voz em celular/tablet/computador.
- Validação do conteúdo e dos limiares com equipe pedagógica; a implementação atual não tem normatização psicométrica.
- Homologação institucional de vínculos docentes, transferência de responsabilidade e acesso após desligamento; S11 já cobre negações cruzadas e transferência no servidor.
- Carga, recuperação de backup, monitoração, expiração/limpeza de demonstrações, retenção e exclusão consentida de dados reais.

## Lacunas prioritárias para um piloto institucional

1. Homologar o vínculo docente por turma implementado e expandir para co-docência e permissões granulares por operação quando necessário.
2. Permitir decisão docente sobre domínio, recomendação e progressão, com justificativa e auditoria.
3. Configurar a matriz e os níveis; acrescentar pseudopalavras, escrita/reconto, avaliação oral estruturada e comparação de diagnósticos.
4. Completar recuperação segura de credenciais, gestão de contas, políticas de retenção, exportação integral e transferência entre escolas.
5. Expandir relatórios por período e a rastreabilidade de pistas/adaptações; distinguir média de desempenho de domínio consolidado.
6. Homologar PWA e acessibilidade com dispositivos reais, professores, responsáveis e crianças antes de tratar o sistema como produto institucional concluído.
