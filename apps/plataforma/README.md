# Letria — aplicação web

Este workspace fica em `apps/plataforma/`. A estrutura do repositório e os comandos da raiz estão no [README do monorepo](../../README.md). Execute os comandos npm deste guia na raiz do monorepo; arquivos de código e configurações mencionados sem prefixo são relativos a este workspace.

Plataforma de alfabetização com experiência de aventura educativa, desenvolvida a partir de [Requisitos_Funcionais_Plataforma_Gamificada_Alfabetizacao.docx](../../../Requisitos_Funcionais_Plataforma_Gamificada_Alfabetizacao.docx).

A implementação entrega uma jornada funcional de estudante, professor, responsável e administrador, com conteúdo autoral, persistência no servidor, atividades offline e acompanhamento pedagógico. **Os 140 requisitos do documento abrangem um produto maior que esta entrega.** A cobertura individual, limitações e evidências estão em [docs/REQUISITOS.md](../../docs/REQUISITOS.md).

## O que está disponível

- Landing page de apresentação e tela de login com acesso por e-mail/senha, código estudantil e cadastro de escola.

- Cinco etapas de alfabetização e banco de 56 atividades com 244 desafios, incluindo associação, seleção múltipla e pensamento computacional; sondagem inicial com dez itens.
- Mapa interativo de territórios e portais, missões, avatar, conquistas, XP e indicação do próximo desafio.
- Lumi 3D: corujinha interativa, ditado revisável, respostas faladas com voz própria da Lumi via Qwen local, Dora como alternativa e integração com DeepSeek, ativada na instalação local com a chave privada fornecida. Sem ativação/chave, usa pistas locais identificadas.
- Trilha de 20 territórios: cada atividade resolvida com pelo menos 80% libera a próxima; quatro territórios conquistados abrem o mundo seguinte. A matriz docente mantém a avaliação de domínio por evidências.
- Prática livre no baú, incluindo atividades de mundos futuros, preservando os pré-requisitos da jornada.
- Cadastro de escola, turmas e estudantes; contas de professor/responsável e entrada infantil por código.
- Editor de atividades, prévia, publicação, versões preservadas e atribuição de missões por turma.
- Painéis, matriz de habilidades, registros de intervenção, relatório individual/turma, CSV e impressão/PDF pelo navegador.
- Gravação opcional de leitura, consentimento de voz, reprodução autorizada e revogação com exclusão dos arquivos.
- PWA, pacote para uso sem internet, rascunhos neste dispositivo e fila de resultados com reenvio idempotente.
- Fonte ajustável, contraste, redução de movimento, controles de teclado e narração quando o navegador oferece síntese de voz.

## Executar localmente

O projeto usa React/TypeScript com Vinext, Vite e runtime Cloudflare Workers. O pacote declara Node.js **22.15 ou superior**; as verificações desta entrega foram executadas com **Node 24.16.0**.

Configure a conexão privada em `apps/plataforma/.env.postgres.local`, a partir da raiz do monorepo, conforme [docs/POSTGRESQL.md](../../docs/POSTGRESQL.md). A persistência ativa é PostgreSQL; o R2 local armazena os arquivos de áudio.

~~~powershell
npm install
npm run voice:qwen:setup
npm run db:apply
npm run build
npm run start:qwen
~~~

A preparação da voz exige Python 3.12 e pelo menos 12 GB livres em disco; baixa aproximadamente 4,5 GB de modelos, além das dependências. O Qwen gera uma voz própria localmente, sem API paga. Consulte [Voz Qwen](../../docs/VOZ_QWEN.md) para requisitos e limites. A Dora permanece disponível por seleção explícita com `npm run start:kokoro`.

Abra http://127.0.0.1:3002. Para desenvolver com recarga automática, use npm run dev com a conexão privada configurada também em .dev.vars. Para importar bancos SQLite existentes, simule primeiro com npm run db:migrate e informe os caminhos --sqlite; consulte o procedimento e os backups no guia PostgreSQL.

A página inicial apresenta a plataforma. Use **Entrar** para acessar a conta, **Para minha escola** para cadastrar uma instituição ou **Explorar demonstração** para conhecer o ambiente com dados fictícios. Não existe conta administradora com senha padrão. A demonstração é criada apenas quando solicitada; contas já conectadas são preservadas. As rotas são `/`, `/login` e `/plataforma`; detalhes em [docs/LANDING_E_LOGIN.md](../../docs/LANDING_E_LOGIN.md).

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

Ao terminar sem rede, o resultado entra na fila local. A reconexão tenta enviá-lo automaticamente. O servidor recalcula a nota e aceita o mesmo identificador de forma idempotente; repetir uma atividade não duplica a recompensa de XP. As respostas pendentes são preservadas ao sair da conta e só são sincronizadas pelo perfil de origem. A tela de entrada avisa quando há respostas de outro perfil no mesmo dispositivo.

A gravação de áudio precisa de conexão para envio e não participa da fila offline. O Qwen funciona sem internet no computador que hospeda seu modelo e serviço; isso não instala a narração Qwen no celular. Narração offline no próprio dispositivo depende das vozes instaladas nele. Limpar dados do navegador remove rascunhos e envios ainda não sincronizados.

O pacote contém a implementação desses fluxos e testes de validação/idempotência. A experiência completa de instalação, navegação fria desconectada e atualização entre versões ainda precisa ser homologada nos navegadores/dispositivos do piloto.

## Verificar

```powershell
npm run typecheck
npm test
npm run lint
npm run build
```

`npm test` executa a suíte de domínio/rascunhos e a suíte de API. O inventário da suíte original e sua ligação com requisitos está em [docs/REQUISITOS.md](../../docs/REQUISITOS.md). Verificações adicionais podem ser consultadas em `tests/`.

Com o servidor local ativo:

```powershell
$env:LETRIA_TEST_URL = 'http://127.0.0.1:3002'
npm run test:http
npm run test:render
```

O teste HTTP cobre PostgreSQL/R2, criação de escola de demonstração, turmas, estudantes, atividades, missões, consentimento e idempotência. Usa dados fictícios e cria registros isolados no servidor indicado; direcione-o para desenvolvimento/teste.

A migração inclui a suíte de API executável contra PostgreSQL em schema temporário isolado, além dos testes de domínio, adaptador, importação e HTTP. Consulte os comandos e o procedimento em [docs/POSTGRESQL.md](../../docs/POSTGRESQL.md).

O teste de renderização consulta HTTP, metadados e arquivos do PWA. Ele não controla um navegador nem verifica interação visual. O teste HTTP de negócio foi validado com o runtime local real; os testes de API podem usar PostgreSQL em schema isolado ou SQLite em memória, além de um adaptador de R2 para os arquivos de teste.

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
| [db/schema.ts](db/schema.ts), [postgres/migrations/](postgres/migrations/) | Modelo e migrações PostgreSQL |
| [drizzle/](drizzle/) | Migrações SQLite/D1 preservadas para compatibilidade e testes |
| [public/sw.js](public/sw.js) | Cache público e ciclo de atualização do PWA |
| [.openai/hosting.json](.openai/hosting.json) | Bindings usados pela hospedagem Sites |

## Persistência e implantação

PostgreSQL mantém instituições, contas, turmas, estudantes, respostas, versões de atividades, recompensas, consentimento e registros administrativos. R2 mantém áudios privados. As configurações locais usam:

| Configuração | Serviço | Uso |
| --- | --- | --- |
| `DATABASE_URL`, `DATABASE_DRIVER=postgres` e `DATABASE_SCHEMA` | PostgreSQL | Dados persistentes e transações de resultados/XP |
| `AUDIO` | Cloudflare R2 | Arquivos de voz com acesso somente pela API |
| `ASSETS` | Assets do Worker | JavaScript, CSS, imagens, fontes e PWA |

A configuração de Sites preserva as declarações legadas `{"d1":"DB","r2":"AUDIO"}` e a integração de [build/sites-vite-plugin.ts](build/sites-vite-plugin.ts) com o Worker. O binding D1 legado não substitui a conexão PostgreSQL ativa. Uma implantação precisa configurar a conexão privada do banco, o armazenamento e os demais recursos do ambiente. A configuração local está em [infra/cloudflare/wrangler.local.jsonc](../../infra/cloudflare/wrangler.local.jsonc); referências locais não representam recursos remotos provisionados.

Para executar a saída de build local com voz, use `npm run build` e `npm run start:qwen`. `npm start` inicia somente a aplicação e prefere `.env.qwen.local` quando esse arquivo existe; a voz exige o serviço correspondente já ativo. Um build bem-sucedido não confirma que os bancos e buckets de um ambiente remoto tenham sido provisionados ou migrados.

Sessões usam cookie HttpOnly e token opaco armazenado como hash; senhas usam PBKDF2 com salt. O servidor valida origem, perfil e escopo dos registros, recalcula respostas, limita solicitações e restringe os áudios. Esses controles fazem parte da implementação; não equivalem a uma auditoria independente ou garantia de conformidade.

## Escopo restante e preparação do piloto

Ainda não há QR Code, autenticação institucional, importação de planilhas, recuperação de senha por e-mail, papéis próprios de coordenador/gestor/avaliador, rede com múltiplas escolas, grupos pedagógicos, revisão espaçada por calendário, rubricas, produção textual livre, análise automática da fala ou notificações push.

Administração completa de usuários, retenção programada, anonimização de pesquisa, exportação integral de dados, transferência entre escolas e relatórios comparativos por período ainda exigem desenvolvimento. O catálogo e a sondagem precisam de validação pedagógica; não oferecem diagnóstico clínico nem uma avaliação normatizada de alfabetização.

Antes de operar com uma escola, validar: permissões por turma e decisões docentes; PWA e acessibilidade nos dispositivos usados; política de consentimento/retenção; recuperação de contas; backups e restauração; monitoração; capacidade; limpeza de ambientes de demonstração; limites de armazenamento e procedimentos de atendimento. A [matriz de requisitos](../../docs/REQUISITOS.md) detalha cada lacuna.

## Recursos visuais

A imagem original [public/og.png](public/og.png), usada na abertura/social, foi gerada com ImageGen para a identidade Letria: fundo índigo escuro, destaques em menta, corujinha exploradora em ilha mágica de letras e tipografia da marca “Letria — Uma aventura em cada palavra”.

As famílias Nunito e DM Sans são servidas localmente em [public/fonts/](public/fonts/), com suas licenças OFL no mesmo diretório. A experiência não precisa carregar fontes de um serviço externo a cada acesso.

## Nova trilha e Lumi

Consulte [Trilha e Lumi](../../docs/TRILHA_E_LUMI.md) para as regras de conquista e [Lumi 3D e DeepSeek](../../docs/LUMI_3D_DEEPSEEK.md) para usar o avatar, o microfone e configurar a conversa depois. A integração DeepSeek está desativada e exige chave privada e ativação explícita no servidor; as pistas locais já funcionam.

## Voz local da Lumi (Qwen)

O padrão local usa Qwen3-TTS Base com uma referência fixa da voz original da Lumi. As falas recorrentes e as atividades publicadas podem ser preparadas e salvas antecipadamente; respostas inéditas ainda exigem síntese. Use `npm run build` e `npm run start:qwen` na instalação configurada. A plataforma fica em http://127.0.0.1:3002. Os modelos, a referência e o cache Qwen ficam em `../../services/lumi-voice/`; o ambiente Python fica em `../../.venv-qwen/`. Comandos de preparação e limites: [Voz Qwen](../../docs/VOZ_QWEN.md).

Para escolher Dora/Kokoro, use `npm run voice:setup` e `npm run start:kokoro`, encerrando antes a aplicação que ocupa a porta 3002. Essa alternativa continua disponível em `../../services/kokoro/`, com ambiente `../../.venv-kokoro/` e configuração privada `.env.kokoro.local`; consulte [Voz Dora](../../docs/VOZ_DORA.md). DeepSeek está ativado nesta instalação para as respostas novas; a voz local funciona separadamente.
