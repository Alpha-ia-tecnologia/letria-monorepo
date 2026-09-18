# Infraestrutura

Esta pasta reúne a configuração de execução local do monorepo. Os comandos `npm` são executados na raiz e encaminham o trabalho ao aplicativo em `apps/plataforma`.

## Cloudflare local

`cloudflare/wrangler.local.jsonc` aponta para o worker e os arquivos públicos de `apps/plataforma`. Os caminhos são relativos à pasta da configuração; o schema do Wrangler fica no `node_modules` da raiz. O arquivo preserva os bindings `ASSETS` e `AUDIO` usados pela aplicação.

A configuração local não cria infraestrutura de produção. Para executar a plataforma, use os comandos de desenvolvimento ou inicialização descritos no README da raiz.

## Verificações automáticas

O workflow `.github/workflows/ci.yml` instala o lockfile da raiz com Node.js 22 e executa tipos, lint, testes unitários, contratos da API, validação dos planos de migração e build. A API usa SQLite em memória e provedores simulados; os testes de migração não conectam ao PostgreSQL. O workflow não executa migrações reais, testes de voz ao vivo ou publicação.

Os contratos Python rodam separadamente para `services/lumi-voice` e `services/kokoro`, com Python 3.11 e apenas a biblioteca padrão. Eles usam áudio e sintetizadores de teste, sem instalar pacotes de IA, baixar modelos ou exigir GPU. A execução manual do workflow permite desativar esses jobs pelo campo `voice_contracts`.

## Limites para produção

Ainda é necessário definir explicitamente o ambiente de publicação, os recursos de armazenamento de áudio, a conexão ao banco e os segredos fora do repositório. Os serviços Python de voz precisam de um processo próprio e de seus modelos; eles não são incluídos no worker Cloudflare nem são provisionados pelo CI. O build e os contratos simulados não substituem a validação da conexão com PostgreSQL, do armazenamento de áudio ou da síntese real no ambiente escolhido.
