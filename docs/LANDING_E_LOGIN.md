# Apresentação e acesso à Letria

- `/`: landing page pública, com mundos, Lumi, recursos para educadores e perguntas frequentes.
- `/login`: e-mail e senha para equipe e responsáveis; botão de acesso estudantil por código.
- `/login?modo=estudante`: acesso estudantil diretamente.
- `/login?modo=cadastro`: cadastro da escola e de sua pessoa administradora.
- `/plataforma`: área de aprendizagem; sessões ausentes levam à entrada.
- `/plataforma?demo=1`: início explícito de uma demonstração; contas já conectadas são preservadas.

A página de apresentação e os formulários abrem sem criar contas ou dados de demonstração. As credenciais continuam sendo validadas pela API existente no PostgreSQL. Logout revoga a sessão e expira o cookie. A consulta pública de sessão está em `GET /api/session`, sem token ou hash.

A área instalada pelo PWA agora inicia em `/plataforma`. O pacote offline inclui essa página e suas dependências. Filas de respostas são identificadas por instituição e estudante e preservadas ao sair; outro perfil não sincroniza respostas que não lhe pertencem.

## Visual

Creme, violeta, lavanda e menta; fontes locais Nunito e DM Sans; ilustrações já existentes do arquipélago. Menu móvel, links reais, perguntas expansíveis, rótulos de formulário e opção de mostrar senha. Nenhum serviço de e-mail ou recuperação de senha foi simulado: a tela orienta solicitar ajuda à escola.

A capa social está em `apps/plataforma/public/og.png`, criada com a ferramenta integrada imagegen. A imagem anterior foi preservada em `apps/plataforma/public/art/og-platform.png`.

Prompt da capa: criar um cartão social horizontal da Letria, com fundo creme #faf8f3, texto ameixa #282046 e violeta #7650dc, tipografia arredondada grande, marca letria com estrela e título “Pequenas descobertas. Grandes aventuras.”; subtítulo “Um universo para aprender brincando.”; à direita uma ilha flutuante de grama com trilha dourada, árvore, blocos A B C e uma corujinha exploradora sorridente com mochila, em estilo 3D de massinha e luz suave. Sem moldura de navegador ou estatísticas inventadas.
