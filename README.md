# Letria — monorepo

Plataforma de alfabetização e pensamento computacional, com jornadas para estudantes, professores, famílias e administração escolar. Este repositório reúne a aplicação web e os serviços locais de voz da Lumi.

O detalhamento do produto, da arquitetura e das limitações está no [README da aplicação](apps/plataforma/README.md). A [matriz de requisitos](docs/REQUISITOS.md) registra a cobertura e as lacunas; a organização em monorepo não equivale à homologação para produção.

## Easypanel

A implantação principal usa **um único serviço da plataforma**, com **DeepSeek no chat e OpenAI Marin na voz**. Configure o repositório `Alpha-ia-tecnologia/letria-monorepo`, Build Path `/`, Dockerfile `Dockerfile`, porta interna `3000` e volume `/data/recordings` gravável por UID/GID `1000:1000`. Siga [o guia do Easypanel](docs/EASYPANEL.md) e o [exemplo público de ambiente](infra/easypanel/plataforma-api/.env.example).

O arquivo privado `.env.easypanel.local`, na raiz do monorepo, reúne a configuração para colar em **Environment** do painel; ele é ignorado pelo Git. Preencha o domínio público exato em `VINEXT_TRUSTED_HOSTS` antes de implantar e mantenha credenciais fora do repositório.

Deixe o **CMD do Dockerfile iniciar o servidor Node**. `npm start` e `npm run start:openai` usam Wrangler localmente, na porta `3002`, e não substituem o comando do container. A implantação não migra automaticamente o banco nem gravações existentes em R2/`.wrangler`; o guia detalha as verificações e a transferência necessária. `/api/health` verifica apenas o processo HTTP.

O Qwen e seu repositório de voz permanecem disponíveis como alternativa documentada, sem necessidade de implantá-los no percurso com Marin.

## Estrutura

| Diretório | Responsabilidade |
| --- | --- |
| [apps/plataforma/](apps/plataforma/) | Aplicação React/TypeScript, Vinext/Vite, APIs, conteúdo, testes e scripts Node |
| [services/lumi-voice/](services/lumi-voice/) | Serviço Python Qwen, referência da Lumi, modelos, cache e scripts de preparação |
| [services/kokoro/](services/kokoro/) | Serviço Python Kokoro/Dora e seus scripts de preparação |
| [infra/cloudflare/](infra/cloudflare/) | Configuração local do runtime Cloudflare |
| [docs/](docs/) | Guias de operação, decisões, currículo e histórias de usuário |

O `package.json`, o `package-lock.json` e o `node_modules/` compartilhados ficam na raiz. Os ambientes Python `.venv-qwen/` e `.venv-kokoro/` também permanecem na raiz; não são dependências do workspace npm.

As configurações locais privadas `.env*` e `.dev.vars` ficam em `apps/plataforma/`; `.env.easypanel.local` fica na raiz como arquivo privado de entrega ao painel. A saída de compilação, o estado local do Wrangler e os arquivos de trabalho ficam, respectivamente, em `apps/plataforma/dist/`, `apps/plataforma/.wrangler/` e `apps/plataforma/work/`. Modelos, referência, cache de voz, credenciais e dados locais continuam fora do versionamento conforme as regras do projeto.

## Executar localmente

Execute os comandos abaixo na **raiz deste repositório**, a pasta que contém este README e o `package-lock.json`. O projeto requer Node.js 22.15 ou superior e usa npm 10.9.8, também presente na imagem Docker. Essa versão aplica o override de segurança do `image-size` no workspace; ao atualizar dependências, mantenha a versão de npm indicada em `packageManager`. Python 3.12 é necessário apenas para os serviços locais de voz Qwen/Kokoro.

```powershell
npx --yes npm@10.9.8 ci
npm run build
npm run start:openai
```

Esse fluxo pressupõe PostgreSQL, DeepSeek e a chave OpenAI configurados privadamente. Para a primeira instalação, siga [PostgreSQL](docs/POSTGRESQL.md) e [Marin no ambiente local](docs/VOZ_OPENAI_LOCAL.md). Os fluxos [Qwen](docs/VOZ_QWEN.md) e [Kokoro/Dora](docs/VOZ_DORA.md) permanecem como alternativas.

A aplicação abre em [http://127.0.0.1:3002](http://127.0.0.1:3002). `npm start` inicia somente a aplicação pelo Wrangler e prioriza a voz de `.env.openai.local` quando esse arquivo existe. `npm run dev` inicia o desenvolvimento com recarga automática; consulte a origem informada no terminal.

## Comandos da raiz

Os comandos existentes são encaminhados ao workspace da aplicação. Não é necessário entrar em `apps/plataforma/` para usá-los.

| Comando | Uso |
| --- | --- |
| `npm run dev` | Desenvolvimento com Vinext/Vite |
| `npm run build` | Compilar a aplicação para o runtime Worker local |
| `npm run build:node` / `npm run start:node` | Compilar e executar o servidor Node para Easypanel/Linux |
| `npm run test:node` | Verificar o build Node por HTTP, sem banco real |
| `npm start` | Executar a aplicação compilada localmente pelo Wrangler |
| `npm run start:openai` | Executar localmente com voz Marin por API e conversa DeepSeek |
| `npm run start:qwen` | Executar aplicação e voz Qwen local |
| `npm run start:kokoro` | Executar aplicação e voz Kokoro/Dora local |
| `npm run typecheck` / `npm run lint` | Verificações TypeScript e ESLint |
| `npm test` | Suítes de domínio, API e migração |
| `npm run test:render` | Verificações HTTP de páginas e recursos públicos |
| `npm run voice:qwen:setup` | Preparar o ambiente e o modelo Qwen VoiceDesign |
| `npm run voice:qwen:base:setup -- <opções>` | Preparar Qwen Base e a referência original da Lumi |
| `npm run voice:qwen:test` | Testes Python do serviço Qwen |
| `npm run voice:setup` / `npm run voice:test` | Preparação e testes do Kokoro |
| `npm run voice:prepare -- <opções>` | Preparar a biblioteca de falas recorrentes e atividades |
| `npm run db:migrate -- <opções>` | Simular a estrutura/importação PostgreSQL |
| `npm run db:apply -- <opções>` | Aplicar a estrutura/importação conforme o guia PostgreSQL |

Os caminhos que um comando recebe como argumentos seguem a resolução do script executado no workspace. Para arquivos externos, use caminhos absolutos quando necessário. Os guias de voz e banco detalham os argumentos.

## Verificar

```powershell
npm run typecheck
npm test
npm run lint
npm run build
```

Com a aplicação local em execução:

```powershell
$env:LETRIA_TEST_URL = 'http://127.0.0.1:3002'
npm run test:render
```

O teste de renderização faz requisições HTTP; não controla um navegador nem valida a experiência visual. `test:http` realiza operações de negócio com registros fictícios e deve apontar para um ambiente de teste. Os procedimentos de API, banco e migração estão em [PostgreSQL](docs/POSTGRESQL.md).

## Configurações e guias

| Assunto | Referência |
| --- | --- |
| Produto e limites da implementação | [README da aplicação](apps/plataforma/README.md) |
| Jornada e histórias de usuário | [Experiência dos usuários](docs/EXPERIENCIA_E_HISTORIAS_DE_USUARIO.md) |
| Banco e importação de dados | [PostgreSQL](docs/POSTGRESQL.md) |
| Testar voz Marin por API no computador | [OpenAI local](docs/VOZ_OPENAI_LOCAL.md) |
| Voz Qwen alternativa e áudios preparados | [Qwen](docs/VOZ_QWEN.md) |
| Voz alternativa | [Kokoro/Dora](docs/VOZ_DORA.md) |
| Personagem, microfone e conversa | [Lumi e DeepSeek](docs/LUMI_3D_DEEPSEEK.md) |
| Habilidades de pensamento computacional | [Correspondência com a BNCC](docs/BNCC_PENSAMENTO_COMPUTACIONAL.md) |
| Execução dos programas | [Simulações](docs/SIMULACOES_DE_PROGRAMAS.md) |

A configuração local fica em [infra/cloudflare/wrangler.local.jsonc](infra/cloudflare/wrangler.local.jsonc). O fluxo Sites permanece associado à aplicação em [apps/plataforma/.openai/hosting.json](apps/plataforma/.openai/hosting.json), com sua integração de build preservada. Esta reorganização não publica a aplicação nem provisiona bancos ou armazenamento remoto.

## Repositórios no GitHub

- [letria-monorepo](https://github.com/Alpha-ia-tecnologia/letria-monorepo): fonte principal da plataforma e dos serviços.
- [letria-voice](https://github.com/Alpha-ia-tecnologia/letria-voice): publicação independente do conteúdo de `services/lumi-voice`.

As alterações da voz são feitas primeiro no monorepositório. Para atualizar o repositório independente após registrar as alterações em um commit, use `git subtree push --prefix=services/lumi-voice voice main`, com o remote `voice` apontando para `git@github.com:Alpha-ia-tecnologia/letria-voice.git`. Um clone novo precisa configurar esse remote com `git remote add voice git@github.com:Alpha-ia-tecnologia/letria-voice.git`.

O [README da voz](services/lumi-voice/README.md) explica a instalação independente e o provisionamento dos modelos e da referência privada da Lumi.
