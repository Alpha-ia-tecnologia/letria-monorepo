# Voz Marin da OpenAI no ambiente local

A plataforma pode usar a voz **Marin**, com o modelo `gpt-4o-mini-tts`, mantendo a DeepSeek responsável pelas respostas do chat. Esse modo não precisa do serviço Python Qwen, de modelos locais ou de GPU.

## Configurar e iniciar

1. Abra no seu editor o arquivo privado `apps/plataforma/.env.openai.local`. Ele é ignorado pelo Git. Preencha somente a chave no campo `OPENAI_API_KEY`, mantendo:

   ```dotenv
   TTS_PROVIDER=openai
   OPENAI_API_KEY=SUA_CHAVE_PRIVADA
   OPENAI_TTS_VOICE=marin
   ```

   Substitua o marcador pela sua chave, salve o arquivo e mantenha esse conteúdo fora do chat e do repositório.
2. No terminal, entre na raiz do monorepo, onde estão `package.json` e `package-lock.json`. Com a aplicação compilada, execute:

   ```powershell
   npm run start:openai
   ```

   Se ainda não houver uma compilação local, execute `npm run build` antes. O comando inicia somente a aplicação pelo Wrangler, na porta `3002`; as configurações existentes de PostgreSQL e DeepSeek continuam sendo carregadas.
3. Abra [http://127.0.0.1:3002](http://127.0.0.1:3002), entre na plataforma e abra a Lumi. Envie uma mensagem e use a opção de ouvir, ou ative **Responder em voz**.

O comando `npm start` também prioriza a configuração de voz de `.env.openai.local` quando esse arquivo existe. Para tornar explícita a escolha da OpenAI, use `npm run start:openai`.

Sempre que preencher ou alterar a chave, encerre o servidor em execução com `Ctrl+C` e inicie-o novamente. Apenas salvar o arquivo não atualiza o processo que já está aberto.

## O que conferir

A chave foi deixada vazia para preenchimento privado. Sem uma chave válida e acesso disponível à API, a voz não está validada. O teste completo exige reproduzir uma fala depois de configurar e reiniciar o servidor.

Marin é uma voz pronta da OpenAI. Ela não reproduz automaticamente a referência Qwen da Lumi nem garante um timbre infantil; avalie a voz no contexto das atividades. A integração orienta a narração em português brasileiro e envia o texto a ser falado à API externa, usando a chave somente no servidor.

Neste modo, cada solicitação de narração chama a API e recebe o MP3 completo antes da reprodução. O cache persistente e a biblioteca de falas preparadas do Qwen não são reutilizados. A duração da espera depende da API e da conexão; este guia não registra uma medição de latência nem uma síntese já validada.
