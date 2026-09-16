# Letria

Plataforma de alfabetização com experiência de aventura educativa, desenvolvida a partir de [Requisitos_Funcionais_Plataforma_Gamificada_Alfabetizacao.docx](../Requisitos_Funcionais_Plataforma_Gamificada_Alfabetizacao.docx).

A implementação entrega uma jornada funcional de estudante, professor, responsável e administrador, com conteúdo autoral, persistência no servidor, atividades offline e acompanhamento pedagógico. **Os 140 requisitos do documento abrangem um produto maior que esta entrega.** A cobertura individual, limitações e evidências estão em [docs/REQUISITOS.md](docs/REQUISITOS.md).

## O que está disponível

- Cinco etapas de alfabetização, vinte atividades e cem questões de escolha/ordenação, além de sondagem inicial com dez itens.
- Mapa de mundos, missões, avatar, conquistas, XP, sequência de participação e recomendações de revisão.
- Progressão por evidências: dez itens diferentes, duas atividades, pelo menos 80% de acerto e controle de erros recentes. XP não libera mundos sozinho.
- Prática livre no baú, incluindo atividades de mundos futuros, preservando os pré-requisitos da jornada.
- Cadastro de escola, turmas e estudantes; contas de professor/responsável e entrada infantil por código.
- Editor de atividades, prévia, publicação, versões preservadas e atribuição de missões por turma.
- Painéis, matriz de habilidades, registros de intervenção, relatório individual/turma, CSV e impressão/PDF pelo navegador.
- Gravação opcional de leitura, consentimento de voz, reprodução autorizada e revogação com exclusão dos arquivos.
- PWA, pacote para uso sem internet, rascunhos neste dispositivo e fila de resultados com reenvio idempotente.
- Fonte ajustável, contraste, redução de movimento, controles de teclado e narração quando o navegador oferece síntese de voz.

## Executar localmente

O projeto usa React/TypeScript com Vinext, Vite e runtime Cloudflare Workers. O pacote declara Node.js **22.15 ou superior**; as verificações desta entrega foram executadas com **Node 24.16.0**.

Na pasta `plataforma`:

```powershell
npm install
npx wrangler types --config wrangler.local.jsonc worker-configuration.d.ts
npm run db:migrate
npm run dev
```

Abra o endereço informado pelo servidor, normalmente `http://localhost:3000`. A configuração [wrangler.local.jsonc](wrangler.local.jsonc) usa D1 e R2 locais emulados. Dados do desenvolvimento ficam na pasta de estado do Wrangler e não exigem cadastrar credenciais de produção.

O comando de migração deve ser executado em um banco novo ou com histórico de migrações consistente. Uma base antiga criada diretamente com `d1 execute --file` precisa de reconciliação do histórico antes de aplicar migrações; não repita a criação das mesmas tabelas nem apague dados para resolver isso.

Não existe conta de administrador com senha padrão. Uma instalação nova abre uma **demonstração isolada**, com escola e estudantes fictícios. Os nomes e resultados desse cenário estão identificados como demonstração.

## Experimentar e cadastrar uma escola

1. Na demonstração, abra o seletor de perfil para explorar estudante, professor, responsável e administrador. Essa troca existe somente na demonstração.
2. Jogue uma atividade, peça uma pista, pause em **Salvar e sair** e reabra a mesma atividade para retomar no mesmo dispositivo.
3. Em professor, crie uma turma, cadastre um estudante, guarde o código apresentado e proponha uma missão.
4. Use **Criar minha escola** para cadastrar nome, e-mail, senha e instituição. Isso cria um ambiente próprio vazio e uma conta administradora.
5. Na administração da escola, cadastre contas de educadores e responsáveis e atribua o educador responsável ao criar/editar cada turma. Professores acessam somente suas turmas. A conta familiar é vinculada a um estudante; o estudante entra pelo código individual.
6. Um responsável autoriza a gravação no portal da família. Após missões de frases/textos, o estudante pode gravar uma leitura e enviar ao acompanhamento.

Credenciais e dados reais devem ser usados somente depois da homologação institucional e dos controles operacionais descritos abaixo.

## Offline e retomada

Entre com conexão e use **Baú de atividades → Baixar**. O service worker guarda o aplicativo e seus recursos públicos; IndexedDB guarda o último contexto disponível, rascunhos e envios pendentes. A API autenticada e os áudios privados não são colocados no cache público do service worker.

O rascunho conserva questão atual, respostas, seleção, feedback, pista, tempo e identificador do envio. É separado por conta e atividade. Uma mudança incompatível no conteúdo descarta o rascunho antigo para evitar aplicar respostas ao gabarito errado.

Ao terminar sem rede, o resultado entra na fila local. A reconexão tenta enviá-lo automaticamente. O servidor recalcula a nota e aceita o mesmo identificador de forma idempotente; repetir uma atividade não duplica a recompensa de XP. A troca de identidade fica bloqueada enquanto existem resultados pendentes.

A gravação de áudio precisa de conexão para envio e não participa da fila offline. Narração offline depende das vozes instaladas no dispositivo. Limpar dados do navegador remove rascunhos e envios ainda não sincronizados.

O pacote contém a implementação desses fluxos e testes de validação/idempotência. A experiência completa de instalação, navegação fria desconectada e atualização entre versões ainda precisa ser homologada nos navegadores/dispositivos do piloto.

## Verificar

```powershell
npm run typecheck
npm test
npm run lint
npm run build
```

`npm test` executa a suíte de domínio/rascunhos e a suíte de API. O inventário dos 40 casos principais e sua ligação com requisitos está em [docs/REQUISITOS.md](docs/REQUISITOS.md). Verificações adicionais podem ser consultadas em `tests/`.

Com o servidor local ativo:

```powershell
$env:LETRIA_TEST_URL = 'http://localhost:3000'
npm run test:http
npm run test:render
```

O teste HTTP cobre D1/R2, criação de escola de demonstração, turmas, estudantes, atividades, missões, consentimento e idempotência. Usa dados fictícios e cria registros isolados no servidor indicado; direcione-o para desenvolvimento/teste.

Validação final desta entrega: **39/40 testes principais**, **1/1 teste HTTP de negócio** e **2/2 testes HTTP de renderização/PWA** passaram. `npm run lint`, `npm run typecheck` e `npm run build` também passaram. Não foi realizada homologação visual ou interação automatizada em navegador.

O teste de renderização consulta HTTP, metadados e arquivos do PWA. Ele não controla um navegador nem verifica interação visual. O teste HTTP de negócio foi validado com o runtime local real; os testes de API principais usam SQLite em memória e um adaptador de R2.

## Arquitetura

| Caminho | Responsabilidade |
| --- | --- |
| [components/Letria.tsx](components/Letria.tsx) | Navegação, painel infantil, autenticação e sincronização |
| [components/Game.tsx](components/Game.tsx) | Questões, feedback, prática livre, pausa e retomada |
| [components/Educator.tsx](components/Educator.tsx) | Turmas, autoria, relatórios, família e administração |
| [lib/content.ts](lib/content.ts) | Catálogo pedagógico autoral |
| [lib/pedagogy.ts](lib/pedagogy.ts) | Correção, domínio, recomendações e recompensas |
| [lib/client.ts](lib/client.ts) | IndexedDB, fila offline e cache de rascunhos |
| [app/api/platform/route.ts](app/api/platform/route.ts) | API autenticada de dados e operações |
| [lib/server/](lib/server/) | Sessões, autorização, validação, ações e armazenamento |
| [app/api/audio/route.ts](app/api/audio/route.ts) | Upload e reprodução de áudio autenticados |
| [db/schema.ts](db/schema.ts), [drizzle/](drizzle/) | Esquema e migrações do D1 |
| [public/sw.js](public/sw.js) | Cache público e ciclo de atualização do PWA |
| [.openai/hosting.json](.openai/hosting.json) | Bindings usados pela hospedagem Sites |

## Persistência e implantação

D1 mantém instituições, contas, turmas, estudantes, respostas, versões de atividades, recompensas, consentimento e registros administrativos. R2 mantém áudios privados. As configurações exigem os bindings:

| Binding | Serviço | Uso |
| --- | --- | --- |
| `DB` | Cloudflare D1 | Dados persistentes e transações de resultados/XP |
| `AUDIO` | Cloudflare R2 | Arquivos de voz com acesso somente pela API |
| `ASSETS` | Assets do Worker | JavaScript, CSS, imagens, fontes e PWA |

A configuração de Sites declara `{"d1":"DB","r2":"AUDIO"}`. O build integra [build/sites-vite-plugin.ts](build/sites-vite-plugin.ts) com o Worker. Publicação pelo fluxo Sites deve provisionar os bindings, aplicar as migrações e servir o aplicativo via HTTPS. A configuração local usa identificadores fictícios e não deve ser confundida com os recursos de uma implantação real.

Para executar a saída de build local, use `npm run build` e `npm run start`. Um build bem-sucedido não confirma que os bancos e buckets de um ambiente remoto tenham sido provisionados ou migrados.

Sessões usam cookie HttpOnly e token opaco armazenado como hash; senhas usam PBKDF2 com salt. O servidor valida origem, perfil e escopo dos registros, recalcula respostas, limita solicitações e restringe os áudios. Esses controles fazem parte da implementação; não equivalem a uma auditoria independente ou garantia de conformidade.

## Escopo restante e preparação do piloto

Ainda não há QR Code, autenticação institucional, importação de planilhas, recuperação de senha por e-mail, papéis próprios de coordenador/gestor/avaliador, rede com múltiplas escolas, grupos pedagógicos, revisão espaçada por calendário, rubricas, produção textual livre, análise automática da fala ou notificações push.

Administração completa de usuários, retenção programada, anonimização de pesquisa, exportação integral de dados, transferência entre escolas e relatórios comparativos por período ainda exigem desenvolvimento. O catálogo e a sondagem precisam de validação pedagógica; não oferecem diagnóstico clínico nem uma avaliação normatizada de alfabetização.

Antes de operar com uma escola, validar: permissões por turma e decisões docentes; PWA e acessibilidade nos dispositivos usados; política de consentimento/retenção; recuperação de contas; backups e restauração; monitoração; capacidade; limpeza de ambientes de demonstração; limites de armazenamento e procedimentos de atendimento. A [matriz de requisitos](docs/REQUISITOS.md) detalha cada lacuna.

## Recursos visuais

A imagem original [public/og.png](public/og.png), usada na abertura/social, foi gerada com ImageGen para a identidade Letria: fundo índigo escuro, destaques em menta, corujinha exploradora em ilha mágica de letras e tipografia da marca “Letria — Uma aventura em cada palavra”.

As famílias Nunito e DM Sans são servidas localmente em [public/fonts/](public/fonts/), com suas licenças OFL no mesmo diretório. A experiência não precisa carregar fontes de um serviço externo a cada acesso.
