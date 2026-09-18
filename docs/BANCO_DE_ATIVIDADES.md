# Banco de atividades do professor

O banco reúne 56 atividades prontas e 244 desafios: as 20 missões da trilha (100 desafios) e 36 propostas complementares (144 desafios). Cada proposta complementar contém quatro questões originais, objetivo pedagógico, habilidade, orientação ao professor e explicações das respostas.

## Áreas e formatos

Há seis novas atividades por área: letras e alfabeto; sons e rimas; sílabas e palavras; frases e escrita; leitura e interpretação; pensamento computacional. As propostas de lógica exploram sequências, padrões, decomposição, instruções e depuração. Os níveis são Primeiras descobertas, Em desenvolvimento e Novos desafios; são sugestões de complexidade, sem classificação automática por idade ou vinculação normativa.

Os nove formatos pedagógicos são escolha de resposta, completar ideias, encontrar o intruso, verdadeiro ou falso, ordenação, seleção múltipla, associação de pares, investigação de texto e lógica. Eles utilizam quatro interações: escolha única, ordenação, seleção de várias respostas e associação.

Na associação, cada item da esquerda recebe uma correspondência diferente. Na seleção múltipla, a ordem dos cliques não altera a correção; opções ausentes, extras ou repetidas não equivalem ao gabarito. As explicações aparecem após conferir a resposta.

## Fluxo docente

Abra o perfil Professor e selecione Banco de atividades. Busque por título ou habilidade e combine filtros por área, mundo, formato e nível. Consulte os detalhes e o gabarito antes de explorar, atribuir à turma ou copiar como rascunho para personalização. Favoritas são preferências locais deste dispositivo e desta conta.

O editor permite criar os quatro tipos de interação. Para associar, informe os itens da esquerda, suas correspondências disponíveis e a resposta de cada linha. Cópias preservam textos de apoio, narração e ilustrações. Uma cópia recebe seu próprio registro ao salvar e precisa ser publicada antes da atribuição.

## Integração e progresso

O catálogo completo fica em apps/plataforma/lib/activity-catalog.ts; as propostas complementares, em apps/plataforma/lib/activity-bank.ts. A sequência oficial de vinte territórios permanece em apps/plataforma/lib/content.ts. Atividades complementares podem ser atribuídas e realizadas pelo estudante nas Missões do professor e no Baú de atividades. Elas registram tentativas e resultados nos relatórios e concedem XP uma única vez por atividade, com pelo menos 80% de acerto. Não acrescentam territórios nem substituem a evidência de domínio dos cinco mundos da trilha.

As APIs resolvem IDs do catálogo ampliado, validam respostas e recalculam a nota no servidor. Seleções múltiplas são armazenadas em ordem canônica para manter a idempotência. Atividades criadas pelo professor continuam usando rascunhos e versões publicadas. A Lumi recebe também o tipo de questão e as correspondências visíveis, sem envio do gabarito ao serviço de IA.

## Validação

Os testes verificam a integridade dos 244 desafios, distribuição das propostas, filtros combinados e busca sem acentos, preservação da trilha, correção dos novos formatos, retomada dos rascunhos, atribuição, publicação, isolamento de perfis e proteção contra XP repetido.
