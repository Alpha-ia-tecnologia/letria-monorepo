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

Configure `QWEN_TTS_MODEL_DIR` para o diretório `models/base` instalado. O modelo Base procura a referência em `voices/lumi`. Consulte `.env.example` para os nomes das variáveis; nunca coloque tokens reais nesse exemplo.

## Iniciar

O servidor lê variáveis **do processo**. Carregue a configuração privada no gerenciador de serviços ou no ambiente do terminal antes de executar; o servidor não lê `.env.qwen.local` automaticamente. `QWEN_TTS_API_TOKEN` deve conter um token privado de pelo menos 32 caracteres. Na raiz do serviço:

```sh
# Linux/macOS, depois de carregar as variáveis do processo
.venv-qwen/bin/python server.py
```

No Windows, use `.venv-qwen\Scripts\python.exe server.py`. Caminhos relativos de modelo e cache são resolvidos a partir desse diretório de execução. No monorepo, prefira `npm run start:qwen` na raiz: o iniciador existente carrega a configuração do app e mantém a integração com a plataforma.

O serviço escuta em `127.0.0.1:8766` por padrão. A plataforma chama os endpoints autenticados `/health`, `/v1/audio/speech` e `/v1/audio/prepare`; navegadores não acessam a voz diretamente. Produção precisa de um processo supervisionado, armazenamento privado persistente e um proxy HTTPS apropriado para a conexão com a API. Este repositório não publica nem abre o serviço automaticamente.

## Verificar sem GPU ou modelos

```sh
python -S -m unittest discover -s . -p 'test_*.py'
```

Os contratos usam apenas a biblioteca padrão e dados fictícios. Incluem os dois formatos de checkout, geração simulada, autenticação HTTP e cache. A CI deste diretório passa a funcionar quando ele é a raiz do repositório independente; o monorepo mantém seu próprio workflow.
