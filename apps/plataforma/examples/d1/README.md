# Exemplo legado de D1

Este exemplo independente do template original não integra as rotas da plataforma e não usa o banco PostgreSQL da Letria. Seu schema de notas é específico do exemplo e exige um binding D1 próprio.

A plataforma usa exclusivamente PostgreSQL na configuração atual. Consulte [a documentação da migração](../../docs/POSTGRESQL.md) e a estrutura em [postgres/migrations](../../postgres/migrations/0001_initial.sql).
