# Relatório da migração PostgreSQL

Banco: edu. Schema: letria. Status: concluída.

1503 registros importados e verificados em todas as colunas; 15 tabelas de domínio e 2 tabelas de controle.

| Tabela | Registros importados | Verificação |
| --- | ---: | --- |
| institutions | 42 | Todas as colunas conferem |
| users | 55 | Todas as colunas conferem |
| sessions | 40 | Todas as colunas conferem |
| classrooms | 55 | Todas as colunas conferem |
| students | 300 | Todas as colunas conferem |
| activities | 13 | Todas as colunas conferem |
| activity_versions | 13 | Todas as colunas conferem |
| submissions | 439 | Todas as colunas conferem |
| xp_awards | 180 | Todas as colunas conferem |
| assignments | 57 | Todas as colunas conferem |
| notes | 54 | Todas as colunas conferem |
| notifications | 70 | Todas as colunas conferem |
| recordings | 0 | Todas as colunas conferem |
| audit_logs | 121 | Todas as colunas conferem |
| rate_limits | 64 | Todas as colunas conferem |

Execução: 2026-09-17T02-08-44-503Z-b69263e8.
Backups privados: apps/plataforma/work/migrations/2026-09-17T02-08-44-503Z-b69263e8/.

A contagem descreve o ponto da migração. O uso e os testes posteriores podem adicionar registros no PostgreSQL.

O catálogo compartilhado da plataforma (56 atividades, 244 desafios) permanece disponível no código e no pacote offline; as 13 atividades importadas são criações próprias das escolas.
