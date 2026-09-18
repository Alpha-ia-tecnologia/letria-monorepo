# Letria Voice — Lumi

Serviço privado de voz em português da Lumi, com Qwen3-TTS e referência sintética fixa. A fonte canônica fica em `services/lumi-voice` no monorepositório **letria-monorepo**; **letria-voice** recebe esse diretório por `git subtree split`. Faça as alterações na fonte canônica antes de atualizar o repositório independente.

## Dois formatos de checkout

| Recurso | Monorepositório | Repositório independente |
| --- | --- | --- |
| Serviço | `services/lumi-voice/` | Raiz do checkout |
| Python isolado | `.venv-qwen/` na raiz do monorepo | `.venv-qwen/` na raiz do serviço |
| Configuração privada | `apps/plataforma/.env.qwen.local` | `.env.qwen.local` na raiz do serviço |
| Modelos, referência e cache | `models/`, `voices/`, `cache/` dentro do serviço | Mesmos diretórios dentro do serviço |

Os instaladores identificam o monorepositório pela posição `services/lumi-voice` e pelo manifesto `apps/plataforma/package.json`. Um checkout independente não escreve ambientes ou configuração em diretórios superiores.

## Preparar um checkout independente

Use Python **3.12** e reserve espaço para os modelos e o ambiente isolado. Execute na raiz deste serviço:

```sh
python scripts/setup-qwen.py
```

O instalador verifica os arquivos baixados, prepara `.venv-qwen` e cria `.env.qwen.local` com um token aleatório somente se esse arquivo ainda não existir. `--cpu` seleciona o runtime sem CUDA.

Para reproduzir a voz fixa da Lumi, instale também o modelo Base e provisione **a referência sintética original**, obtida no armazenamento privado do projeto:

```sh
python scripts/setup-qwen-base.py --reference-wav /caminho/privado/lumi-original.wav --reference-embedding-only
```

Se houver transcrição exata, use `--reference-text-file /caminho/privado/transcricao.txt` no lugar de `--reference-embedding-only`. O instalador preserva uma referência existente diferente. O áudio, os metadados da referência e os modelos não acompanham o clone do GitHub.

Configure `QWEN_TTS_MODEL_DIR` para o diretório `models/base` instalado. O modelo Base procura a referência em `voices/lumi`; `QWEN_TTS_REFERENCE_DIR` permite indicar explicitamente outro diretório com a mesma referência original. Consulte `.env.example` para os nomes das variáveis; nunca coloque tokens reais nesse exemplo.

## Iniciar

O servidor lê variáveis **do processo**. Carregue a configuração privada no gerenciador de serviços ou no ambiente do terminal antes de executar; o servidor não lê `.env.qwen.local` automaticamente. `QWEN_TTS_API_TOKEN` deve conter um token privado de pelo menos 32 caracteres. Na raiz do serviço:

```sh
# Linux/macOS, depois de carregar as variáveis do processo
.venv-qwen/bin/python server.py
```

No Windows, use `.venv-qwen\Scripts\python.exe server.py`. Caminhos relativos de modelo e cache são resolvidos a partir desse diretório de execução. No monorepo, prefira `npm run start:qwen` na raiz: o iniciador existente carrega a configuração do app e mantém a integração com a plataforma.

O serviço escuta em `127.0.0.1:8766` por padrão. A plataforma chama os endpoints autenticados `/health`, `/v1/audio/speech` e `/v1/audio/prepare`; navegadores não acessam a voz diretamente. O modo de rede privada para contêineres exige configuração explícita, descrita abaixo. Este repositório não publica o serviço automaticamente.

## Docker e Easypanel

Use o **Dockerfile da raiz do repositório letria-voice**, com contexto de build `.`. Dentro do monorepo, o contexto equivalente é `services/lumi-voice`. A imagem instala Python 3.12, dependências de áudio e PyTorch para CPU. Pesos, referências, cache e segredos ficam fora do contexto e da imagem.

```sh
docker build -t letria-voice:local .
```

A imagem roda com **UID/GID 10001**, porta interna **8766**, e requer:

```env
QWEN_TTS_HOST=0.0.0.0
QWEN_TTS_PORT=8766
QWEN_TTS_ALLOWED_HOSTS=projeto_voice:8766
QWEN_TTS_API_TOKEN=<token privado igual ao da API da plataforma>
QWEN_TTS_DEVICE=cpu
QWEN_TTS_MODEL_DIR=/data/models/base
QWEN_TTS_REFERENCE_DIR=/data/voices/lumi
QWEN_TTS_CACHE_DIR=/data/cache/prepared
```

Troque `projeto_voice` pelo DNS interno real mostrado pelo Easypanel. `ALLOWED_HOSTS` é uma lista separada por vírgulas de valores exatos de `Host`, incluindo a porta quando usada. Não aceita URLs ou curingas. O serviço mantém loopback para a verificação de saúde. `Origin` de navegador continua bloqueado, e todos os endpoints continuam exigindo o token. Não crie um domínio público para conectar serviços pela rede privada.

Na **plataforma**, configure `TTS_PROVIDER=qwen`, o mesmo token e `QWEN_TTS_URL=http://projeto_voice:8766`. Para essa origem HTTP interna, configure também `QWEN_TTS_ALLOW_HTTP_ORIGIN=http://projeto_voice:8766` na plataforma. Essa exceção precisa coincidir exatamente com a origem da URL. Conexões externas usam HTTPS.

### Preparar volumes antes de iniciar

Os instaladores acima podem preparar os artefatos em uma máquina administrativa. Execute `python scripts/setup-qwen-base.py --check` para conferir os pesos Base instalados. Transfira os pesos verificados e o par **original** `reference.wav` + `reference.json` para o servidor por um canal privado.

Se os artefatos estiverem no checkout deste serviço **no servidor**, os comandos abaixo copiam para uma pasta dedicada. Não substitua uma referência já em uso por outra gravação.

```sh
sudo install -d -m 0750 /srv/letria-voice/models/base /srv/letria-voice/voices/lumi /srv/letria-voice/cache
sudo cp -a models/base/. /srv/letria-voice/models/base/
sudo cp -a voices/lumi/. /srv/letria-voice/voices/lumi/
sudo chown -R 10001:10001 /srv/letria-voice/models /srv/letria-voice/voices /srv/letria-voice/cache
sudo chmod -R u+rwX,go-rwx /srv/letria-voice/models /srv/letria-voice/voices /srv/letria-voice/cache
```

Cadastre os mounts no Easypanel:

| Origem no servidor | Destino no contêiner | Acesso |
| --- | --- | --- |
| `/srv/letria-voice/models` | `/data/models` | Somente leitura |
| `/srv/letria-voice/voices` | `/data/voices` | Somente leitura |
| `/srv/letria-voice/cache` | `/data/cache` | Leitura e escrita para UID/GID 10001 |

Um volume vazio **não inicia a voz**. O processo informa a falta de modelos antes de carregar o runtime, e não faz download durante a inicialização. A referência inválida também impede o carregamento. O cache de falas preparadas pode começar vazio.

O `HEALTHCHECK` usa `python healthcheck.py`, lê o token do ambiente e consulta `/health` via loopback sem gerar fala nem imprimir credenciais. Aguarda até 300 segundos de inicialização antes de contar falhas; o serviço só responde como pronto depois de carregar o modelo.

### GPU opcional

Para instalar wheels CUDA 12.8, use o argumento de build:

```sh
docker build --build-arg PYTORCH_INDEX_URL=https://download.pytorch.org/whl/cu128 -t letria-voice:cuda .
```

Também é necessário disponibilizar uma GPU NVIDIA compatível ao contêiner e definir `QWEN_TTS_DEVICE=cuda`. O argumento de build sozinho não disponibiliza GPU; com `cuda` selecionado, a falta de GPU impede a inicialização. A imagem padrão permanece em CPU. Consulte as [versões oficiais do PyTorch](https://pytorch.org/get-started/previous-versions/) para escolher wheels compatíveis. A verificação de saúde segue o [contrato HEALTHCHECK do Docker](https://docs.docker.com/reference/dockerfile/#healthcheck).

## Verificar sem GPU ou modelos

```sh
python -S -m unittest discover -s . -p 'test_*.py'
```

Os contratos usam apenas a biblioteca padrão e dados fictícios. Incluem os dois formatos de checkout, geração simulada, autenticação HTTP e cache. A CI deste diretório passa a funcionar quando ele é a raiz do repositório independente; o monorepo mantém seu próprio workflow.
