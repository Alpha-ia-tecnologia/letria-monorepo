# Voz padrão da Lumi: Qwen e áudios preparados

> Monorepo: execute os comandos npm na raiz do repositório. Os caminhos de arquivos abaixo partem dessa raiz; as configurações privadas ficam em `apps/plataforma/`.

A instalação local usa **Qwen3-TTS 1.7B Base** com a amostra original da Lumi criada anteriormente pelo VoiceDesign. A referência é lida e suas características são extraídas uma vez ao iniciar o serviço; todas as novas falas reutilizam esse perfil. Não foi usada a voz de uma pessoa nem a Dora.

A referência fica em `services/lumi-voice/voices/lumi/reference.wav`, com SHA256 e proveniência em `reference.json`. Como a amostra antiga não tinha uma transcrição confiável, esta instalação usa explicitamente `x_vector_only_mode: true` (características do locutor). A configuração também suporta referência com transcrição exata, que permite o modo contextual do Qwen. A voz tende a manter sua identidade; pronúncia, emoção e similaridade ainda exigem avaliação auditiva. O modelo Base preserva a cadência da referência e não usa as instruções Natural/Mais tranquilo do VoiceDesign: nesse modo a interface mostra **Voz padrão da Lumi**.

## Executar

Na raiz do monorepo, com os modelos e a referência já preparados:

```powershell
npm run build
npm run start:qwen
```

A plataforma fica em http://127.0.0.1:3002. O serviço de voz fica exclusivamente em 127.0.0.1:8766. O inicializador lê a configuração privada de voz em `apps/plataforma/.env.qwen.local`, além da conversa e do PostgreSQL já existentes. A instalação atual contém:

```dotenv
TTS_PROVIDER=qwen
QWEN_TTS_URL=http://127.0.0.1:8766
QWEN_TTS_MODEL_DIR=../../services/lumi-voice/models/base
QWEN_TTS_REFERENCE_DIR=../../services/lumi-voice/voices/lumi
```

Os valores relativos de `QWEN_TTS_MODEL_DIR` e `QWEN_TTS_REFERENCE_DIR` são resolvidos a partir de `apps/plataforma/`, onde fica o arquivo de configuração. Por isso usam `../../services/lumi-voice/`. O ambiente Python permanece em `.venv-qwen/`, na raiz.

O token privado permanece no mesmo arquivo; não copie seu valor para o cliente. `npm start` inicia somente a aplicação e exige o serviço de voz separado. DeepSeek gera respostas novas e é independente da voz. Cumprimentos simples como “oi” e agradecimentos completos usam respostas fixas locais; perguntas e relatos acrescentados à saudação continuam no fluxo do tutor.

## Preparar modelos e referência em outra instalação

Python 3.12, Node.js 22.15+ e espaço para os pesos e dependências são necessários. O preparo original é `npm run voice:qwen:setup`; o Base é instalado com:

```powershell
npm run voice:qwen:base:setup -- --reference-wav "C:/caminho/voz-original.wav" --reference-text-file "C:/caminho/transcricao-exata.txt"
```

Quando não houver transcrição exata, use `--reference-embedding-only` no lugar de `--reference-text-file`. A opção deve ser explícita; nenhuma transcrição é adivinhada. O script não substitui uma referência diferente já existente. Configure os dois caminhos acima em `apps/plataforma/.env.qwen.local` para selecionar o Base; o instalador não troca o provedor automaticamente.

O Base usa a revisão `fd4b254389122332181a7c3db7f27e918eec64e3`, arquivos e hashes fixados em `services/lumi-voice/scripts/setup-qwen-base.py`. O tokenizador já baixado pelo VoiceDesign é reaproveitado após verificação. Pesos e referência ficam fora do Git. Guarde uma cópia de segurança da referência para preservar a identidade da Lumi. O serviço usa somente arquivos locais e não baixa recursos ao iniciar.

## Biblioteca de narração

- O inicializador coloca seis falas recorrentes na preparação: cumprimento, agradecimento, três apresentações e a demonstração da voz.
- Publicar uma atividade ou atribuí-la a uma turma coloca suas instruções e a introdução da ilha na fila, sem aguardar a síntese na publicação. O professor recebe a confirmação de preparação ou indisponibilidade.
- A fila tem prioridade menor que as solicitações de fala e retoma após reiniciar. Áudios concluídos são reaproveitados por texto, perfil, ritmo, referência e versão do motor.
- Alterar o conteúdo ou a identidade da voz cria outra chave; um áudio de uma versão anterior não é apresentado como pronto.

É possível preparar também as atividades já existentes:

```powershell
npm run voice:prepare
npm run voice:prepare -- --activity=letras-1
npm run voice:prepare -- --catalog
```

O primeiro comando aguarda as falas recorrentes. O segundo inclui uma atividade do catálogo; o terceiro processa o banco inteiro, em lotes, e pode demorar bastante nesta GPU. `--enqueue-only` apenas confirma a entrada na fila, respeitando a capacidade disponível. O comando pode ser repetido: arquivos concluídos são reutilizados. Publicações personalizadas são preparadas pelo fluxo autenticado da plataforma.

A biblioteca usa `services/lumi-voice/cache/prepared`, com limite de 256 MiB e 2.048 WAVs. O journal privado guarda apenas textos educacionais pendentes enviados explicitamente para preparação e os remove ao concluir. O cache de conversas inéditas permanece somente na RAM (8 áudios/16 MiB): falas dos alunos não entram automaticamente na biblioteca durável. Nenhum áudio é exposto por uma URL pública.

## Reprodução e velocidade

O serviço e a API suportam PCM incremental em NDJSON. O cliente valida início, taxa de amostragem, ordem, limites e marcador de conclusão; cancelar interrompe a geração e libera a fila. A boca acompanha a amplitude real e fica parada durante preparação e pausas.

**Áudios preparados podem começar assim que carregados. Textos inéditos ainda precisam ser sintetizados.** Na RTX 4050 Laptop de 6 GB, o teste de uma frase de 33 caracteres entregou o primeiro bloco em 4,94 s, mas precisou de 20,23 s para 3,44 s de fala. Como essa velocidade produz pausas longas entre blocos, o servidor marca sínteses inéditas com `bufferUntilEnd: true`: o cliente aguarda a conclusão antes de falar continuamente. No cache, a reprodução começa imediatamente. O transporte incremental fica disponível para um motor mais rápido, sem prometer conversação em tempo real no equipamento atual.

Narrações preparadas usam o decodificador completo oficial. O caminho incremental conserva 300 frames de contexto; numa amostra de 6,16 s, a comparação com o decodificador completo teve diferença máxima de um nível de PCM16. Essa comparação não garante equivalência para todas as falas, especialmente acima de 24 s. O limite permanece em 2.400 caracteres, 90 s de áudio e 170 s de geração, com término EOS obrigatório. Textos muito longos podem ultrapassar o prazo nesta máquina.

## Resultados pela plataforma

No teste integrado real, DeepSeek respondeu em 2,22 s (106 caracteres). A saudação preparada ficou disponível ao reprodutor em 2,06 s; a resposta inédita, em 68,09 s; repetir essa resposta reutilizou os mesmos samples em 2,02 s. Os eventos de reprodução foram simulados em Node, com API e GPU reais; não é medição de reprodução no navegador. Após reiniciar o serviço e esvaziar a RAM, a saudação foi recuperada da biblioteca em 1,25 s na requisição de áudio (sem contar a consulta de capacidades).

Amostra local para comparação auditiva: `apps/plataforma/work/qwen-voice/lumi-voz-padrao.wav`. A referência original permanece intacta. Validação: 79 testes de API, 67 testes Python, 98 testes do reprodutor/PCM, TypeScript, ESLint, build e quatro testes HTTP de páginas passaram; o teste integrado real também passou.

## Segurança e verificação

A API da plataforma mantém autenticação, origem, limite de solicitações e cancelamento associado à sessão por HMAC. O serviço exige token privado, Host local e rejeita Origin. Conversas não acionam a preparação persistente; apenas publicação/atribuição autorizada e o comando local podem fazê-lo. Arquivos de áudio usam nomes derivados de hash, gravação atômica, validação de WAV e limite de disco. A fila é invalidada por identidade de voz para não exibir resultados antigos como prontos.

```powershell
npm run voice:qwen:test
npm run test:unit
npm run test:api
npm run typecheck
npm run lint
npm run build
```

Os testes cobrem referência/hash, extração única, cancelamento, EOS, geração incremental, restauração da fila, invalidação de voz, cache, limites e autorização. Testes de integração reais usam GPU e, quando habilitado, a API DeepSeek; não substituem avaliação auditiva no navegador.

Qwen local não instala a voz no celular. Uma hospedagem remota exige um serviço de voz próprio e protegido; a aplicação em Cloudflare não executa os pesos Python. Esta alteração permanece local.

Referência: [Qwen — Voice Design then Clone](https://github.com/QwenLM/Qwen3-TTS#voice-design-then-clone).

Estado inicial da biblioteca validado: seis falas recorrentes e a primeira atividade da trilha (introdução e cinco instruções), total de 12 áudios, sem falhas. A primeira instrução foi recuperada por HTTP em 1.20 s, com indicação de cache e conclusão válida.
