# Dora: voz local da Lumi

> Monorepo: execute os comandos npm na raiz do repositório. Os caminhos de arquivos abaixo partem dessa raiz; as configurações privadas ficam em `apps/plataforma/`.

A narração usa Kokoro-82M com a voz brasileira pf_dora. O áudio é gerado na CPU do computador que executa a Letria, sem chave de serviço pago. A conversa generativa da Lumi continua independente: o DeepSeek está preparado e desativado até ser configurado. A voz funciona com as pistas locais.

## Preparar e executar

Na raiz do monorepo, com Node e Python 3.12 instalados:

    npm run voice:setup
    npm run build
    npm run start:kokoro

O primeiro comando instala as dependências em `.venv-kokoro/`, na raiz, baixa aproximadamente 337 MiB de modelo/vozes e verifica tamanho e SHA256 publicados no release. O download só precisa de internet na preparação; arquivos já verificados são reutilizados.

O último comando inicia a Dora em 127.0.0.1:8765 e a aplicação em http://127.0.0.1:3002. Ambos ficam ativos enquanto o comando estiver em execução. Pare com Ctrl+C. Usa o PostgreSQL configurado em apps/plataforma/.env.postgres.local e o armazenamento local de áudio em apps/plataforma/.wrangler/test-state. Em um computador novo, siga [POSTGRESQL.md](POSTGRESQL.md) e execute npm run db:apply antes de iniciar.

Em **Do seu jeito**, ative o som e toque em **Experimentar a voz**. Na conversa e nas atividades, os controles permitem ouvir e parar. Durante a reprodução da Dora, a legenda informa **Dora · voz local · gerada por IA**. Se o navegador exigir interação para tocar áudio, use **Tocar áudio**.

## Configuração privada

A preparação cria apps/plataforma/.env.kokoro.local com TTS_PROVIDER=kokoro, KOKORO_URL=http://127.0.0.1:8765 e um token aleatório para o serviço local. O arquivo é ignorado pelo Git, assim como os modelos e o ambiente Python. Não compartilhe o token.

start:kokoro carrega primeiro apps/plataforma/.env, quando existir, e depois apps/plataforma/.env.kokoro.local. Portanto, a configuração da Dora tem prioridade. A configuração de conversa em apps/plataforma/.env é separada da narração; consulte [LUMI_3D_DEEPSEEK.md](LUMI_3D_DEEPSEEK.md). Com TTS_PROVIDER=kokoro, falhas da voz local nunca acionam a narração paga da OpenAI.

O serviço Python aceita apenas conexões locais autenticadas, sem acesso direto pelo navegador. O servidor da aplicação encaminha apenas o texto solicitado, sem perfis, notas ou gravações. Os últimos áudios ficam em um cache limitado de memória; textos e áudios não são gravados em disco pelo serviço.

## Perfil da Lumi

O controle **Ritmo**, ao lado de **Responder em voz**, permite escolher uma fala de conversa ou mais pausada. Fechar a janela, mudar o ritmo ou começar o ditado interrompe a reprodução. O bico da corujinha continua acompanhando a amplitude do áudio gerado.

Em conversas, o nome da personagem é pronunciado “Lúmi”; o texto exibido e a leitura dos exercícios permanecem como escritos.

O ajuste mantém o modelo já instalado e não precisa de chave, novo download ou serviço pago. A qualidade é subjetiva: preservamos o timbre Dora e ajustamos contexto de síntese, cadência e pausas, sem prometer que a voz se torne indistinguível de uma gravação humana. A [documentação das vozes Kokoro](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) recomenda agrupar falas curtas, porque fragmentos muito breves podem prejudicar a qualidade.

## Funcionamento e limites

- Áudio WAV mono, PCM16, 24 kHz; português brasileiro com timbre original de pf_dora.
- Perfil de conversa com frases curtas agrupadas para conservar continuidade e pausas nativas de oração/frase. Perfil de leitura preserva a separação pedagógica de sílabas e enunciados.
- Ritmos **Natural** e **Mais tranquilo**, selecionados na conversa e lembrados neste dispositivo. O ritmo muda durante a síntese, sem alterar a altura da voz ou a velocidade de reprodução do arquivo.
- Até 2.400 caracteres por solicitação e 90 segundos de áudio, sem truncar o texto silenciosamente.
- Uma geração por vez na CPU; áudios recentes podem ser reutilizados.
- A interface cancela áudio e pedidos ao navegar ou parar. Uma inferência de CPU já iniciada pode terminar no serviço, mas não volta a tocar após o cancelamento.
- Na execução em localhost, a voz pode funcionar mesmo se o navegador indicar ausência de internet.
- Na conversa da Lumi e na amostra das preferências, a voz natural é priorizada. Se não puder ser gerada, o texto permanece disponível e aparece um aviso. A conversa oferece **Tentar voz da Lumi** e **Usar voz do dispositivo**; não inicia a voz alternativa automaticamente.
- A narração geral das atividades mantém a alternativa automática de português do dispositivo para continuar acessível quando o serviço local não está disponível.
- O desempenho e a qualidade de pronúncia variam conforme o computador e o texto. Letras isoladas, sílabas e frases curtas devem passar por revisão pedagógica/auditiva antes de uso em turma.

A execução em Cloudflare Workers não inclui o modelo Python. Para hospedar a Letria com Dora, será necessário um servidor de voz próprio acessível pelo backend, com autenticação e HTTPS; 127.0.0.1 de um servidor hospedado não aponta para este computador.

## Validação

    npm run voice:test
    npm test
    npm run typecheck
    npm run lint
    npm run build

Os testes Python usam síntese simulada para verificar autenticação, origem, limites, cache, concorrência e saída WAV. Os testes de API validam o encaminhamento autenticado ao Kokoro e a ausência de chamadas pagas. Os testes do reprodutor cobrem WAV, cancelamento, bloqueio de reprodução móvel, modo offline local e falhas.

Na implementação também foram gerados áudios reais com Dora para boas-vindas, sílabas e vogais. A geração e o formato foram verificados; isso não substitui ouvir e revisar a pronúncia.

## Fontes do modelo

- [Kokoro original](https://github.com/hexgrad/kokoro) e [vozes brasileiras](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md).
- [Kokoro ONNX](https://github.com/thewh1teagle/kokoro-onnx), runtime CPU utilizado.
- [Release dos modelos](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1). Os hashes fixos estão em services/kokoro/scripts/setup-kokoro.py.

## Verificação do novo perfil de conversa

Passaram 138 testes unitários TypeScript, 51 testes de API em SQLite e 22 testes Python. TypeScript, ESLint e build também passaram. A geração real de WAV com Dora valida áudio audível, formato e diferença efetiva de duração entre os ritmos; a revisão subjetiva de naturalidade continua sendo feita ao ouvir a voz. Nenhuma chave nova ou serviço externo de voz foi utilizado.
