# PostgreSQL na Letria

> Monorepo: execute os comandos npm na raiz do repositório. Os caminhos de arquivos abaixo partem dessa raiz; as configurações privadas ficam em `apps/plataforma/`.

A persistência da plataforma usa PostgreSQL, no schema letria por padrão. A URL pertence somente ao servidor, em apps/plataforma/.env.postgres.local. O aplicativo não usa o SQLite como alternativa quando o PostgreSQL está indisponível.

## Configuração privada

Use as variáveis DATABASE_DRIVER=postgres, DATABASE_SCHEMA=letria e DATABASE_URL. O endereço real e a senha não devem ser incluídos em repositórios, documentação, parâmetros públicos ou variáveis NEXT_PUBLIC_/VITE_. O modo SSL segue a URL configurada. Os exemplos usam sslmode=require; a conexão recebida nesta migração usa sslmode=disable.

Os comandos `npm start`, `npm run start:qwen` e `npm run start:kokoro` leem o arquivo privado explicitamente. O desenvolvimento Vite usa a cópia privada em apps/plataforma/.dev.vars. Ao trocar a conexão, atualize as duas configurações. As URLs e senhas são ocultadas nos logs dos inicializadores.

## Estrutura

As 15 tabelas de domínio são:

| Tabela | Conteúdo |
| --- | --- |
| institutions | Escolas e identificação de demonstração |
| users | Contas, papéis e hashes de senha |
| sessions | Tokens com hash, expiração e preferências |
| classrooms | Turmas e professor responsável |
| students | Estudantes, vínculo de turma, códigos com hash e consentimento |
| activities | Atividades criadas pela escola, rascunhos e versão |
| activity_versions | Conteúdo das versões publicadas |
| submissions | Respostas, notas, duração e resultado por tentativa |
| xp_awards | Recompensa única por estudante e atividade |
| assignments | Propostas por turma e prazo |
| notes | Observações e intervenções docentes |
| notifications | Notificações por escola e estudante |
| recordings | Metadados e chaves dos arquivos de leitura |
| audit_logs | Histórico das operações |
| rate_limits | Contadores e janelas de limite de requisições |

O catálogo compartilhado de 56 atividades e 244 desafios permanece versionado no código, inclusive para o uso offline. A tabela activities guarda as criações de cada escola, e não duplica esse catálogo. Os arquivos de áudio continuam no armazenamento de objetos; os metadados ficam no PostgreSQL.

O SQL completo está em apps/plataforma/postgres/migrations/0001_initial.sql; o modelo Drizzle está em apps/plataforma/db/schema.ts. As tabelas usam chaves primárias, chaves estrangeiras, índices de busca, unicidade de e-mail/código e restrições de papéis, notas, versões, consentimento e XP. Os documentos de questões, respostas e preferências usam JSONB; datas de eventos usam timestamptz; os prazos usam date. Identificadores legados permanecem text, preservando todos os IDs. Indicadores binários usam smallint com CHECK para compatibilidade com as consultas existentes.

A relação entre users.student_id e students é diferida até o fim da transação: a criação da demonstração registra usuário e estudante juntos. Referências históricas de notificações e auditoria mantêm a semântica original quando uma conta é removida. Atividades de tentativas e propostas podem referir-se tanto ao catálogo compartilhado quanto às criações da escola.

## Migração e recuperação

Antes de importar, interrompa as escritas na plataforma. O migrador aceita um ou mais argumentos --sqlite e cria snapshots consistentes em apps/plataforma/work/migrations. Ele verifica a integridade SQLite, reconcilia duplicações idênticas e aborta em conflitos de conteúdo; não sobrescreve registros de negócio existentes. Apenas rate_limits adota os maiores valores de contador e vencimento, preservando o limite operacional mais conservador.

Execute os comandos pela raiz do monorepo. O migrador roda no workspace `apps/plataforma/`; use caminhos absolutos para os arquivos SQLite de origem. Execute primeiro a simulação:

~~~powershell
npm run db:migrate -- --sqlite "C:/caminho/primeira.sqlite" --sqlite "C:/caminho/segunda.sqlite"
~~~

Para aplicar a estrutura e importar os dados validados:

~~~powershell
npm run db:apply -- --sqlite "C:/caminho/primeira.sqlite" --sqlite "C:/caminho/segunda.sqlite"
~~~

A criação e a importação usam transação e bloqueio consultivo para impedir duas migrações simultâneas. O manifesto registra contagens e verificações sem expor a credencial. Os bancos de origem permanecem preservados. Para uma instalação nova, omita --sqlite. Não importe novamente snapshots antigos sobre dados já alterados sem revisar os conflitos.

Os snapshots são cópias privadas e contêm dados da aplicação. O diretório work é ignorado pelo Git. Para recuperação, mantenha os arquivos SQLite originais e os snapshots até a homologação; uma volta ao banco antigo exige reconciliar qualquer escrita realizada no PostgreSQL depois da troca.

## Execução e verificação

~~~powershell
npm run typecheck
npm run lint
npm test
npm run test:postgres
npm run build
npm run start:kokoro
~~~

A suíte PostgreSQL cria um schema temporário exclusivo letria_test_<UUID>, executa as regras de API, verifica rollback e concorrência e remove apenas esse schema no fim. Não usa as tabelas da aplicação para limpeza. A suíte SQLite existe somente como teste de regressão e recebe DATABASE_DRIVER=sqlite de forma explícita.

O adaptador cria um pool por requisição com até quatro conexões e o encerra ao finalizar. Operações em lote compartilham uma transação. As respostas da API continuam usando os mesmos formatos de JSON e datas que os clientes e o modo offline esperam. As migrações antigas em drizzle ficam preservadas para testes e leitura do histórico SQLite; não são aplicadas no PostgreSQL.


## Migração realizada

A migração concluída em 17/09/2026 (UTC) criou o schema letria no banco edu e importou **1503 registros** das duas bases locais. Foram preservados 42 registros de instituições, 55 contas, 40 sessões, 55 turmas, 300 estudantes, 13 atividades próprias e 13 versões publicadas, 439 tentativas, 180 recompensas de XP, 57 atribuições, 54 notas, 70 notificações, 121 registros de auditoria e 64 limites operacionais. Não havia gravações registradas nas origens. Os ambientes de demonstração e de testes já existentes foram preservados junto com os demais dados.

Todas as colunas foram comparadas, normalizando somente JSON e representações de data/UTC. O banco também contém schema_migrations (checksums SQL) e migration_runs (resumo de cada execução). O registro de aplicação é 2026-09-17T02-08-44-503Z-b69263e8. Os dois snapshots SQLite, o manifesto e o backup lógico do destino anterior, target-before.json, estão em apps/plataforma/work/migrations/2026-09-17T02-08-44-503Z-b69263e8/. Os bancos SQLite originais continuam preservados.

As propostas geradas por Drizzle precisam de revisão antes de integrar apps/plataforma/postgres/migrations; preserve a restrição DEFERRABLE INITIALLY DEFERRED em users.student_id. O SQL versionado é a referência dessa regra.
