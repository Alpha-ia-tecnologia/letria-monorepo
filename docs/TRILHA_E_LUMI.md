# Trilha de territórios e Lumi

A área **Explorar mundos** agora apresenta 20 territórios em cinco mundos, com portais, paisagens, progresso e indicação da próxima aventura. Cada atividade do catálogo equivale a um território.

## Desbloqueios

- Uma tentativa com pelo menos 80% de acerto conquista o território.
- A próxima atividade da sequência fica disponível. Quatro territórios conquistados abrem o mundo seguinte.
- Uma nova tentativa com erros não apaga uma conquista anterior.
- XP isolado, sondagem inicial, respostas parciais e atividades personalizadas não pulam territórios.
- A prática livre continua disponível no baú. Resolver uma atividade futura registra o resultado, mas não dispensa os territórios anteriores.
- O servidor verifica os mesmos pré-requisitos do mapa. O histórico existente é preservado; o mapa é reconstruído usando as tentativas aprovadas.
- Resultados offline aguardam sincronização para confirmar novos desbloqueios no servidor.

O domínio pedagógico da matriz docente continua usando amostra, acurácia e erros recentes; a **ordem de acesso ao mapa** segue os territórios resolvidos, conforme a nova direção do produto.

## Personagem Lumi

A corujinha acompanha o mapa e cada desafio. Ao abrir a conversa, aparece em 3D com gestos, estados de escuta/pensamento e bico sincronizado à voz Dora. Aceita perguntas digitadas ou ditadas e revisadas antes do envio. A interface identifica cada resposta como **Pista da Letria** ou **Resposta de IA**.

As pistas locais funcionam sem credenciais e sem internet. A conversa fica somente na memória da interface e é reiniciada ao fechar ou trocar de questão, área ou conta. A voz Dora e o microfone têm requisitos próprios; o ditado depende do navegador.

A integração com DeepSeek foi preparada, mas está desativada enquanto não houver chave privada e ativação explícita. Consulte [Lumi 3D, voz Dora e DeepSeek](LUMI_3D_DEEPSEEK.md) para os controles, limites e configuração futura. O provedor OpenAI legado continua disponível por configuração.

## Validação

- Testes de progressão: desbloqueio por atividade, limite de 80%, fim da trilha, preservação de conquistas e bloqueio de evidência parcial.
- Testes de API: sessão, origem, escopo da atividade, limite de texto e histórico, contexto enviado ao provedor e recuperação de falhas.
- TypeScript, lint, build e verificações HTTP.
- Não foi executada homologação visual em navegador nesta alteração.

## Voz da Lumi

A execução local agora usa **Kokoro com a voz Dora**, em português brasileiro, sem serviço pago de narração. Consulte [Voz Dora](VOZ_DORA.md) para instalação, execução, limites e testes. Os controles de ouvir/parar estão nas atividades, nas respostas da Lumi e em “Experimentar a voz” nas preferências.

A alternativa OpenAI implementada anteriormente permanece disponível somente quando selecionada/configurada. Ao selecionar Kokoro, o aplicativo usa a voz local ou a voz do dispositivo em caso de falha; nunca migra automaticamente para a narração paga.
