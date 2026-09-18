# Lumi 3D, voz Qwen e DeepSeek

> Monorepo: execute os comandos npm na raiz do repositório. Os caminhos de arquivos abaixo partem dessa raiz; as configurações privadas ficam em `apps/plataforma/`.

A conversa da Lumi tem uma corujinha 3D interativa, respostas faladas com Qwen local e ditado em português. A voz padrão reutiliza a referência original da Lumi; Dora não é usada para o personagem. O **DeepSeek está ativado na instalação local** com a chave fornecida pelo usuário. A Lumi gera respostas pela API; pistas educativas locais continuam disponíveis quando a conexão falha. A chave permanece nos arquivos privados do servidor.

## Usar na plataforma

1. Abra http://127.0.0.1:3002/plataforma, entre na conta ou explore a demonstração pelo login.
2. Toque em **Converse com a Lumi**, no painel, nas ilhas ou durante uma atividade.
3. Arraste a corujinha para girar; toque nela para acenar. Pelo teclado, use as setas esquerda/direita e Enter.
4. Digite uma pergunta ou escolha uma sugestão. **Responder em voz** reproduz a resposta automaticamente quando o som está ativo. **Ouvir** repete e **Parar voz** interrompe. No modo de referência fixa, a interface identifica **Voz padrão da Lumi**; o ritmo vem da amostra escolhida. Se o navegador bloquear reprodução automática, use **Tocar resposta**.
5. Para ditar, toque no microfone, fale e conclua. O texto reconhecido aparece no campo para revisão; só é enviado ao tocar em **Enviar pergunta**.

O microfone exige autorização de voz do estudante no portal da família, permissão do navegador e suporte ao reconhecimento de fala. A escuta começa somente por ação do usuário; termina após 30 segundos, com até dois segundos para o resultado final. Cada pergunta aceita até 500 caracteres. A narração da plataforma para ao iniciar o ditado.

O reconhecimento usa SpeechRecognition do navegador, com suporte variável, e pode processar áudio pelo serviço do navegador e precisar de internet. O aplicativo não grava nem armazena esse áudio; esse comportamento não garante processamento local pelo navegador. A pergunta digitada continua disponível quando não há suporte. Para uso remoto do microfone, sirva a aplicação por HTTPS; localhost funciona para desenvolvimento. Referência: [SpeechRecognition no MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

Fechar a Lumi cancela o pedido pendente, a escuta e a fala da conversa. Trocar de questão, área ou conta inicia outro contexto. O histórico fica apenas na memória da conversa aberta; não é salvo no banco ou no cache offline. Ocultar a aba interrompe microfone e reprodução.

## Avatar e voz

A corujinha usa geometria real de Three.js: olhos, asas e bico articulados, lenço amarelo, mochila e uma pequena ilha. O painel acompanha os estados ouvindo, pensando e falando. O movimento do bico segue a intensidade do PCM ou WAV do Qwen; é sincronização por amplitude, sem análise de fonemas. Na voz alternativa do navegador, o movimento é estimado a partir dos eventos de fala.

O 3D carrega sob demanda, limita a resolução de renderização e pausa fora da área visível ou em aba oculta. Respeita a preferência de reduzir movimento, libera recursos ao fechar e apresenta a imagem estática da Lumi com aviso quando WebGL não funciona.

O padrão local é **Qwen3-TTS 1.7B Base** com a referência original criada pelo VoiceDesign. As características dessa voz são extraídas uma vez na inicialização e reutilizadas nas respostas. Não clona Letícia ou outra pessoa. Saudações e narrações educacionais podem ser preparadas antecipadamente; as perguntas novas continuam usando DeepSeek e precisam de síntese. Veja instalação, biblioteca e medidas em [VOZ_QWEN.md](VOZ_QWEN.md).

Use **npm run start:qwen** após compilar. O comando inicia voz na porta 8766, prepara falas recorrentes em segundo plano e inicia a aplicação na porta 3002. `npm start` inicia apenas a aplicação.

Se a voz selecionada estiver indisponível, a conversa permanece em texto com aviso e controles para tentar novamente ou escolher a voz do dispositivo. Essa alternativa só toca por escolha explícita. A narração das atividades mantém a alternativa automática para acessibilidade. Qwen e Dora funcionam sem chave de API paga e não acionam uma voz paga em caso de falha.

O Qwen usa os pesos locais, uma síntese por vez, cache de conversas na RAM e biblioteca privada durável para falas preparadas explicitamente. A fila de atividades persiste após reinício. O prazo é 170 segundos, com até 2.400 caracteres e 90 segundos de áudio. O transporte aceita PCM incremental; nesta GPU, as falas inéditas aguardam conclusão antes de tocar para evitar entrecortes. Falas já salvas começam ao carregar. Pronúncia e adequação infantil devem ser avaliadas ouvindo as amostras.

Funcionar sem internet no computador que executa o Qwen não disponibiliza esse modelo no celular. Um PWA desconectado depende das vozes do próprio dispositivo; o ditado do navegador também pode exigir internet. O Qwen é independente da ativação do DeepSeek.

## Configuração do DeepSeek

Os arquivos privados **apps/plataforma/.env** e **apps/plataforma/.dev.vars** estão sincronizados com `TUTOR_PROVIDER=deepseek`, `DEEPSEEK_ENABLED=true`, modelo `deepseek-flash` e a chave privada. Os arquivos de exemplo preservam a configuração inicial desativada:

~~~dotenv
TUTOR_PROVIDER=local
DEEPSEEK_ENABLED=false
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-flash
~~~

Quando for conectar o serviço, configure a chave privadamente no servidor, selecione **TUTOR_PROVIDER=deepseek** e altere **DEEPSEEK_ENABLED=true**. A ativação exige a chave e essa opção explícita. Não use variáveis públicas, não coloque a chave em componentes e não envie o arquivo privado ao Git.

Ao ativar, cada pergunta enviada à Lumi poderá encaminhar para **https://api.deepseek.com/chat/completions**: a mensagem revisada, até seis mensagens anteriores e o texto/opções do exercício validado pelo servidor. Perfis, notas, identificadores de estudantes, gravações e gabaritos não são anexados. O texto livre pode conter informações digitadas pelo usuário; a ativação deve considerar esse destino e esse conteúdo.

Os comandos **npm run start:qwen** e **npm run start:kokoro** leem **apps/plataforma/.env**, preservando as configurações separadas do provedor de voz escolhido e do PostgreSQL. Reinicie o processo depois de alterar o arquivo. Para **npm run dev**, mantenha a configuração equivalente em **apps/plataforma/.dev.vars**. Não é necessário alterar ou migrar o banco para ativar a conversa.

A Lumi é orientada a responder em até 35 palavras, geralmente uma ou duas frases curtas, com cumprimentos breves e sem emojis ou formatação. O texto não é truncado para caber na fala: a voz fixa recebe o texto completo, com preparação e reprodução canceláveis. A integração usa respostas de texto, com raciocínio desativado, tempo limite de 15 segundos e no máximo 1.200 caracteres de resposta. O servidor preserva autenticação, escopo da atividade, limite de requisições e validação de histórico. Falhas ou respostas incompletas voltam a uma pista local identificada. O cliente não recebe a chave ou o conteúdo interno de raciocínio. Contrato: [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/).

O provedor OpenAI legado continua disponível por seleção explícita. Selecionar DeepSeek sem ativação/chave retorna pistas locais e não aciona outro provedor pago. Para desativar a conversa remota, use **TUTOR_PROVIDER=local** e reinicie.

## Validação desta entrega

- A integração Qwen passou em 34 testes Python, 67 testes de API e 72 testes do reprodutor de fala. Eles validam contratos, autenticação, WAV, limites, cache, cancelamento, identificação do provedor e ausência de chamada paga como alternativa automática.
- Os testes Python usam síntese simulada. Os testes HTTP com Qwen real validaram áudio, cache e cancelamento; tempos medidos estão no [guia Qwen](VOZ_QWEN.md). A avaliação auditiva/pedagógica é separada desses testes.
- Na entrega anterior do avatar e da conversa, passaram os testes de poses/descarte, amplitude, ditado e respostas simuladas, além de TypeScript, ESLint, build e verificações HTTP locais de páginas/PWA, Lumi e WAV Dora. Esses resultados não representam uma prova de geração Qwen.
- A chave foi validada pelo endpoint oficial de modelos. Após reiniciar a plataforma, uma pergunta fictícia sobre vogais passou pelo POST autenticado `/api/tutor` e recebeu HTTP 200, `provider: deepseek`, `mode: ai`, sem fallback, em 2,4 segundos. O teste não enviou dados reais de estudantes. As suítes automatizadas continuam usando respostas simuladas para evitar consumo involuntário da API.
- A renderização WebGL e a permissão real de microfone ainda precisam ser experimentadas no navegador/dispositivo de uso; não foi executada automação visual nesta alteração.

Arquivos principais: apps/plataforma/components/LumiTutor.tsx, apps/plataforma/components/Lumi3D.tsx, apps/plataforma/lib/lumi-scene.ts, apps/plataforma/lib/speech.ts, apps/plataforma/lib/speech-recognition.ts, apps/plataforma/lib/server/tutor-provider.ts, apps/plataforma/app/api/tutor/route.ts, apps/plataforma/app/api/speech/route.ts e services/lumi-voice/.
