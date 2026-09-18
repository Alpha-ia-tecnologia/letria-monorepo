# Letria no Easypanel

A implantação escolhida usa **um único serviço da plataforma**, com **DeepSeek para a conversa** e **OpenAI Marin para a voz da Lumi**. O PostgreSQL existente continua sendo usado. O serviço Qwen fica preservado como alternativa, descrita ao final; ele não precisa ser implantado neste percurso.

Este guia descreve a configuração e as verificações no destino. Preparar arquivos ou publicar o código no GitHub não executa o deploy no Easypanel nem confirma o funcionamento do domínio e das integrações.

## 1. Criar o serviço da plataforma

No projeto Easypanel, crie um serviço **App** chamado `plataforma` e configure:

| Campo | Valor |
| --- | --- |
| Source | GitHub |
| Repositório | `Alpha-ia-tecnologia/letria-monorepo` |
| Branch | `main` |
| Source → Build Path | `/` |
| Build | Dockerfile |
| Caminho do Dockerfile | `Dockerfile` |
| Porta interna da aplicação | `3000` |
| Réplicas iniciais | `1` |

O contexto precisa ser a raiz do monorepo, pois o build usa o workspace npm e o lockfile compartilhado. No Easypanel, Build Path também determina o contexto Docker, e o caminho do Dockerfile é relativo a ele. [Referência: Builders](https://easypanel.io/docs/builders).

Deixe vazios os campos que substituem comandos de build ou inicialização. O Dockerfile da raiz compila a aplicação e seu **CMD inicia o servidor Node**. `npm start` usa Wrangler para desenvolvimento/testes locais; não é o comando desta implantação.

## 2. Preencher o ambiente privado

O modelo público está em [infra/easypanel/plataforma-api/.env.example](../infra/easypanel/plataforma-api/.env.example). Na entrega local, `.env.easypanel.local`, na **raiz do monorepo**, é o arquivo privado reservado para reunir a conexão PostgreSQL e as chaves existentes. Esse arquivo é ignorado pelo Git e não acompanha o clone do GitHub. Transfira seu conteúdo diretamente para **Environment** do serviço `plataforma`, sem publicá-lo no repositório ou no chat.

Antes de implantar, confirme o domínio público que será usado. `VINEXT_TRUSTED_HOSTS` precisa receber esse domínio exato, sem protocolo ou caminho. Não deixe um domínio fictício ou marcador nesse campo. Se o painel oferecer um domínio automático e você decidir usá-lo, copie exatamente esse host.

Os campos necessários são:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
LETRIA_TRUST_PROXY_HOPS=1
VINEXT_TRUSTED_HOSTS=SEU_DOMINIO_PUBLICO_EXATO
AUDIO_STORAGE_DIR=/data/recordings

DATABASE_DRIVER=postgres
DATABASE_SCHEMA=letria
DATABASE_URL=SUBSTITUA_PELA_URL_POSTGRESQL_PRIVADA_EXISTENTE

TUTOR_PROVIDER=deepseek
DEEPSEEK_ENABLED=true
DEEPSEEK_API_KEY=SUBSTITUA_PELA_CHAVE_PRIVADA_DEEPSEEK
DEEPSEEK_MODEL=deepseek-flash

TTS_PROVIDER=openai
OPENAI_API_KEY=SUBSTITUA_PELA_CHAVE_PRIVADA_OPENAI
OPENAI_TTS_VOICE=marin
```

Os marcadores acima não são valores prontos para uso. Para mais de um domínio público, separe os hosts exatos por vírgula. Atualize essa lista quando trocar o domínio.

A conversa e a voz são configurações independentes: `TUTOR_PROVIDER=deepseek` preserva o chat atual; `TTS_PROVIDER=openai` usa Marin na narração. A integração de voz usa `gpt-4o-mini-tts`; `OPENAI_MODEL` não muda esse modelo. As variáveis `QWEN_TTS_*`, modelos locais, serviço Python e GPU não são necessários neste percurso.

As chaves permanecem no servidor. Não acrescente `ARG` para senhas ou chaves nos Dockerfiles: o Easypanel também fornece variáveis de ambiente como argumentos de build, que não constituem armazenamento seguro de segredos. [Referência: Dockerfile no Easypanel](https://easypanel.io/docs/builders#dockerfile).

A narração envia o texto a ser falado à API OpenAI. Marin é uma voz pronta e não transfere automaticamente o timbre da referência Qwen da Lumi. A biblioteca de falas preparadas e seu cache persistente atuais pertencem ao Qwen; a integração OpenAI não os reutiliza. Cada solicitação de narração chama a API e recebe o MP3 completo antes da reprodução. A configuração não acrescenta streaming ou uma garantia de latência.

## 3. Preservar gravações e configurar o domínio

Em **Storage** da plataforma, crie um volume com destino **`/data/recordings`**. A imagem executa com **UID/GID `1000:1000`**; verifique permissão de gravação para esse usuário. Esse volume guarda as gravações de leitura; os metadados permanecem no PostgreSQL.

Criar esse volume não transfere gravações já existentes no R2 ou no armazenamento local em `.wrangler`. O PostgreSQL guarda as referências e os metadados, não os arquivos de áudio. Se houver gravações anteriores, prepare uma exportação da origem e uma importação que use o adaptador de armazenamento Node: seus arquivos reúnem metadados e áudio, portanto copiar WAVs brutos para `/data/recordings` não basta. Preserve a origem durante a transferência e confira a contagem das gravações e sua reprodução na plataforma antes de mudar definitivamente o acesso para o novo armazenamento.

Mantenha inicialmente **uma réplica** da plataforma. O armazenamento local desta configuração não estabelece, por si só, compartilhamento de gravações entre diferentes servidores.

Em **Domains**, configure `letria.exemplo.com`, habilite HTTPS e use destino **HTTP, porta interna `3000`**. Configure o DNS do domínio para o servidor conforme seu provedor. Não é necessário publicar `3000` em **Ports**.

Domínios passam pelo proxy do Easypanel; portas publicadas expõem o serviço diretamente. Os serviços devem escutar em `0.0.0.0`, e mudanças de armazenamento precisam de um novo deploy. [Referência: App Service](https://easypanel.io/docs/services/app).

O proxy Traefik fornece cabeçalhos como `X-Forwarded-Host` e `X-Forwarded-Proto`. Preserve o host e o protocolo externos no encaminhamento para que login, cookies e verificação de origem funcionem com HTTPS. A lista de hosts confiáveis deve refletir os domínios reais. [Referência: cabeçalhos do Traefik](https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/headers/).

`LETRIA_TRUST_PROXY_HOPS=1` permite identificar o IP do usuário atrás de um único proxy privado do Easypanel, mantendo limites de acesso separados por IP. Essa configuração pressupõe acesso somente pelo proxy; não exponha a porta do container diretamente. Fora dessa topologia, revise o número de proxies confiáveis; o padrão do servidor é `0`.

No servidor Node, as requisições compartilham um pool limitado a 10 conexões PostgreSQL por processo, em vez de abrir um pool por requisição. Considere esse limite ao aumentar o número de réplicas.

Salve as configurações e selecione **Deploy** na plataforma. Deixe o comando padrão do Dockerfile iniciar o servidor Node. `npm start` e `npm run start:openai` são iniciadores locais pelo Wrangler, na porta `3002`; não substitua o comando do container por eles.

O Dockerfile verifica `/api/health` para confirmar que o processo HTTP responde. Essa rota é uma verificação de funcionamento do servidor, sem consultar PostgreSQL, DeepSeek ou OpenAI; um container saudável não confirma essas integrações.

## 4. Usar o PostgreSQL correto

Se o banco já foi migrado e contém as escolas e usuários, use sua conexão existente. Criar um novo Postgres no Easypanel gera outro banco; não transfere os dados anteriores.

Se optar por um banco novo no mesmo projeto Easypanel, obtenha a URL em **Credentials** do serviço Postgres e use a conexão **interna**, sem expor uma porta externa. A documentação explica que essa URL usa `sslmode=disable` na rede privada. Para um banco externo, preserve os requisitos de TLS e acesso desse servidor. [Referência: Postgres Service](https://easypanel.io/docs/services/postgres).

Para verificar e, quando necessário, aplicar a estrutura, use o **Shell** da plataforma na raiz do projeto da imagem:

```sh
npm run db:migrate
```

Esse comando simula a migração usando as variáveis do ambiente. Revise o resultado e confirme que a conexão aponta para o banco pretendido. Havendo estrutura nova ou migrações pendentes, aplique em uma janela apropriada:

```sh
npm run db:apply
```

Sem `--sqlite`, esses comandos não importam bancos locais antigos. O início normal da aplicação não substitui esse procedimento. Para importação, backups e recuperação, consulte [PostgreSQL](POSTGRESQL.md). Preserve fora do container os registros privados da migração antes de descartá-lo; o diretório `work` não é o volume de gravações.

## 5. Conferir após o deploy

1. Abra a página inicial e o login pelo domínio HTTPS configurado.
2. Entre com uma conta já existente e confira se turma e estudantes correspondem ao banco esperado.
3. Abra a Lumi, envie uma pergunta curta e confira a resposta da conversa e a narração Marin. A rota `/api/health` não valida chaves, disponibilidade de uso das APIs nem o tempo de resposta.
4. No perfil com autorização de gravação, grave uma leitura de teste e confirme sua reprodução. Verifique novamente após um redeploy para conferir a persistência do volume.
5. Configure a cópia privada das gravações e o backup lógico do PostgreSQL. Teste a recuperação em um ambiente separado.

O backup de volumes do Easypanel atende volumes gerenciados; Bind e File ficam fora desse recurso. A sincronização é um espelho, não uma série de snapshots com retenção. [Referência: Volume Backups](https://easypanel.io/docs/backups/volumes).

| Sintoma | Conferir primeiro |
| --- | --- |
| Build não encontra workspace ou lockfile | Build Path `/` e Dockerfile da raiz do monorepo |
| Domínio retorna erro de proxy | Container ativo, destino HTTP `3000` e bind `0.0.0.0` |
| Login falha após trocar o domínio | HTTPS, `VINEXT_TRUSTED_HOSTS` e encaminhamento de host/protocolo |
| Conversa usa respostas locais | Configuração DeepSeek, chave e disponibilidade do provedor |
| Voz indisponível ou opção do dispositivo | `TTS_PROVIDER=openai`, chave OpenAI, acesso à API e novo deploy após alterar Environment |
| Voz funciona, mas demora | Conexão, disponibilidade do provedor e tamanho do texto; o MP3 completo é recebido antes de tocar |
| Gravações somem após redeploy | Volume em `/data/recordings` e permissão UID `1000` |

As verificações acima são passos a executar no destino. A documentação e os testes locais não comprovam implantação, disponibilidade ou desempenho do servidor Easypanel.

## Alternativa — Hospedar a voz Qwen

Esta seção preserva a opção de executar a voz no próprio servidor. Ela não faz parte da implantação com Marin. Consulte também [Voz Qwen](VOZ_QWEN.md) e o [README do serviço](../services/lumi-voice/README.md).

Para escolher essa alternativa, mantenha a plataforma conforme as seções anteriores e adicione um segundo serviço App chamado `voice` no mesmo projeto:

| Campo | Valor |
| --- | --- |
| Repositório GitHub | `Alpha-ia-tecnologia/letria-voice` |
| Branch | `main` |
| Source → Build Path | `/` |
| Build → Dockerfile | `Dockerfile` |
| Porta interna | `8766` |

O repositório independente corresponde a `services/lumi-voice/` do monorepo. Confirme que seu Dockerfile está publicado antes do deploy. Nos exemplos seguintes, `projeto` representa o nome do projeto Easypanel.

### A. Preparar os arquivos privados da voz

O clone do GitHub não contém pesos do Qwen, referência da Lumi nem cache de áudio. Provisione esses arquivos antes de iniciar `voice`; o container não baixa modelos durante a inicialização.

Use o procedimento do [README do serviço de voz](../services/lumi-voice/README.md) para instalar o modelo Base e a **referência sintética original da Lumi** em um checkout privado. A referência inclui o áudio e seus metadados; copiar somente um WAV para uma pasta arbitrária não reproduz a configuração preparada.

O armazenamento montado no container deve apresentar esta estrutura:

```text
/data/
├── models/
│   └── base/          # Diretório completo do modelo Base preparado
├── voices/
│   └── lumi/          # Referência original e metadados preparados
└── cache/
    └── prepared/     # Criado e atualizado pelo serviço
```

Para um servidor Linux, prepare `/srv/letria-voice` conforme o README da voz e configure estas montagens em **Storage → Bind**:

| Origem no servidor | Destino no container | Permissão necessária |
| --- | --- | --- |
| `/srv/letria-voice/models` | `/data/models` | Leitura |
| `/srv/letria-voice/voices` | `/data/voices` | Leitura |
| `/srv/letria-voice/cache` | `/data/cache` | Leitura e escrita |

Também é possível usar um volume gerenciado montado em `/data`, desde que seu conteúdo e suas permissões sejam provisionados privadamente antes da primeira execução. Não monte um volume vazio sobre arquivos já preparados esperando que os modelos sejam baixados.

O serviço executa com **UID/GID `10001:10001`**. Esse usuário precisa ler modelos e referência e gravar o cache. O README da voz contém os comandos de cópia e permissões, além da alternativa com montagens separadas para modelos, referência e cache.

### B. Configurar e iniciar `voice`

Em **Environment** do serviço `voice`, configure os valores de container abaixo. O [exemplo do serviço](../services/lumi-voice/.env.example) também documenta o modo local; para Easypanel, use host, caminhos e porta deste bloco:

```dotenv
QWEN_TTS_HOST=0.0.0.0
QWEN_TTS_PORT=8766
QWEN_TTS_ALLOWED_HOSTS=projeto_voice:8766
QWEN_TTS_API_TOKEN=SUBSTITUA_PELO_TOKEN_PRIVADO_COMPARTILHADO
QWEN_TTS_DEVICE=cpu
QWEN_TTS_MODEL_DIR=/data/models/base
QWEN_TTS_REFERENCE_DIR=/data/voices/lumi
QWEN_TTS_CACHE_DIR=/data/cache/prepared
```

Gere um token aleatório privado de **pelo menos 32 caracteres, sem espaços** e use exatamente o mesmo valor no serviço da plataforma. O texto acima é apenas um marcador; não o utilize como senha. Armazene o valor no gerenciador de segredos da equipe e nos campos privados do painel.

O endereço interno segue o nome do projeto e do serviço: com projeto `projeto` e serviço `voice`, o host é `projeto_voice`. Esse formato aparece nos [templates oficiais do Easypanel](https://github.com/easypanel-io/templates/blob/main/templates/mattermost/index.ts#L60). Confirme os nomes efetivamente usados no painel; `localhost` dentro da plataforma aponta para o próprio container, não para a voz.

`QWEN_TTS_ALLOWED_HOSTS` recebe o host com porta, sem `http://`. Essa lista é obrigatória ao escutar em `0.0.0.0`; não use curingas. O healthcheck local do container continua permitido.

Mantenha `voice` com **uma réplica**, sem publicar a porta `8766` e sem domínio público. Se o Easypanel criar um domínio automático, remova-o desse serviço. A plataforma acessará a voz pela rede interna; o navegador acessará apenas a plataforma.

Salve e selecione **Deploy**. Aguarde o carregamento do modelo. O Dockerfile inclui uma verificação autenticada de `/health`, com período inicial de 300 segundos; ela verifica a prontidão sem gerar uma fala. No **Shell** de `voice`, também é possível executar:

```sh
python healthcheck.py
```

O comando usa o token já presente no ambiente e retorna código zero quando o modelo está pronto. Não copie o token para a linha de comando. Modelo ausente, referência incompleta ou permissões incorretas devem ser corrigidos no armazenamento antes de repetir o deploy.

### C. Conectar a plataforma ao Qwen

Somente ao adotar esta alternativa, substitua a seleção da voz em **Environment** da plataforma por:

```dotenv
TTS_PROVIDER=qwen
QWEN_TTS_URL=http://projeto_voice:8766
QWEN_TTS_ALLOW_HTTP_ORIGIN=http://projeto_voice:8766
QWEN_TTS_API_TOKEN=SUBSTITUA_PELO_MESMO_TOKEN_DO_SERVICO_VOICE
```

O [exemplo completo para Qwen](../infra/easypanel/plataforma/.env.example) reúne os demais campos da plataforma. Preserve a conexão PostgreSQL e a configuração DeepSeek.

`QWEN_TTS_ALLOW_HTTP_ORIGIN` autoriza somente a origem HTTP interna informada, que precisa corresponder a `QWEN_TTS_URL` em protocolo, host e porta. Em servidores separados, configure HTTPS autenticado ou uma rede privada apropriada entre os hosts. Não use a exceção HTTP para expor a voz pela internet.

Depois de atualizar o ambiente, faça um novo deploy da plataforma e confirme a voz. A aplicação continua sendo iniciada pelo CMD Node do Dockerfile; `start:qwen` é um comando do ambiente local.

### D. GPU e tempo de resposta do Qwen

A imagem da voz usa **CPU por padrão**. Ela permite executar sem GPU, mas falas novas podem demorar muito; o tempo depende do servidor, do texto e da concorrência. Um áudio já preparado pode ser reutilizado do cache persistente, enquanto uma resposta inédita ainda exige síntese.

Para usar CUDA, o servidor precisa possuir GPU NVIDIA acessível, driver compatível e NVIDIA Container Toolkit configurado no Docker/Swarm. O painel não acrescenta GPU a uma VPS que não a possui. Verifique a visibilidade com `nvidia-smi` dentro de um container antes de mudar a configuração da voz. [Referência: GPU Support](https://easypanel.io/docs/guides/gpu-support).

Depois de preparar o host, configure no serviço `voice`:

```dotenv
PYTORCH_INDEX_URL=https://download.pytorch.org/whl/cu128
QWEN_TTS_DEVICE=cuda
```

`PYTORCH_INDEX_URL` é um argumento de build do Dockerfile. Faça um **Force Rebuild** da voz para instalar as dependências CUDA; somente reiniciar a imagem CPU não é suficiente. Confirme compatibilidade do driver com essa versão de CUDA e espaço de memória para o modelo. Alterações do runtime Docker devem ser planejadas pelo administrador do servidor, pois podem afetar outros serviços.

Não há neste guia uma medição de latência ou capacidade do seu servidor. Valide uma frase curta e uma resposta maior antes de disponibilizar a conversa para uma turma. Para enfileirar as falas recorrentes e o catálogo no Shell da **plataforma**, depois que `voice` estiver saudável, execute:

```sh
npm run voice:prepare -- --catalog --enqueue-only
```

O comando usa as variáveis do serviço e não exige `.env.qwen.local` no container. Sem `--enqueue-only`, acompanha a conclusão. O cache precisa permanecer no volume da voz entre implantações. Mais detalhes em [Voz Qwen](VOZ_QWEN.md).

### E. Conferir a alternativa Qwen

Além das verificações da seção 5, confirme que `voice` não tem domínio público nem porta `8766` publicada. Preserve uma cópia privada da referência e do armazenamento necessário. Se usar `/srv/letria-voice` por Bind, ele não será incluído no backup de volumes gerenciados do painel.

Se a voz não iniciar, confira modelos, referência, permissões UID `10001` e logs. Se a plataforma não alcançá-la, confira o DNS interno, o token compartilhado e as origens/hosts permitidos. Desempenho em CPU ou GPU precisa ser medido no servidor escolhido.
