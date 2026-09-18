'use client';

import { ArrowRight, BookOpen, Heart, Settings2, Volume2 } from 'lucide-react';
import type { Role } from '@/lib/types';
import Modal from './Modal';

const guides: Record<Role, { intro: string; steps: { title: string; text: string; button: string; section: string }[] }> = {
  student: { intro: 'Comece pela atividade indicada no Início. A Lumi ajuda com as instruções, e você pode tentar de novo.', steps: [
    { title: 'Veja o que fazer agora', text: 'No Início há um botão com seu próximo passo. As atividades enviadas pelo professor aparecem primeiro.', button: 'Ir para o início', section: 'dashboard' },
    { title: 'Faça as atividades da turma', text: 'Veja o que está para fazer e o que já foi enviado. Ao abrir uma atividade pausada neste aparelho, você pode retomar de onde parou.', button: 'Ver atividades da turma', section: 'missions' },
    { title: 'Aprenda nas ilhas', text: 'A trilha organiza letras, sons, palavras e histórias. Toque em uma ilha para conhecer seus desafios.', button: 'Abrir a trilha', section: 'worlds' },
    { title: 'Experimente lógica e programação', text: 'Nos desafios com programas, monte os passos, toque em Testar programa e acompanhe a simulação. Essas descobertas ficam salvas neste navegador.', button: 'Ver desafios de lógica', section: 'computational' },
  ] },
  teacher: { intro: 'Siga esta ordem para preparar a turma. O Início mostra qual etapa está faltando e o que fazer em seguida.', steps: [
    { title: 'Prepare sua turma', text: 'Crie a turma, cadastre os alunos e entregue o código de acesso de cada um.', button: 'Abrir turmas e alunos', section: 'classes' },
    { title: 'Escolha uma atividade', text: 'Use o banco de atividades, confira uma prévia e escolha a turma e o prazo antes de enviar.', button: 'Escolher atividades', section: 'activities' },
    { title: 'Acompanhe as respostas', text: 'Escolha uma turma ou um aluno para ver tentativas e habilidades praticadas. Os resultados apoiam sua avaliação pedagógica.', button: 'Acompanhar alunos', section: 'reports' },
    { title: 'Oriente as famílias', text: 'Compartilhe orientações no mural. As observações privadas continuam visíveis apenas à equipe pedagógica.', button: 'Abrir avisos e orientações', section: 'messages' },
  ] },
  guardian: { intro: 'Aqui você acompanha a criança vinculada à sua conta. Para ela fazer atividades, use o acesso de aluno fornecido pela escola.', steps: [
    { title: 'Veja como a criança está aprendendo', text: 'Confira as atividades realizadas e as orientações do professor. Cada criança aprende no seu ritmo.', button: 'Acompanhar criança', section: 'family' },
    { title: 'Leia as orientações da escola', text: 'O mural reúne avisos e orientações. Para falar com a escola, use o canal de contato que ela informou.', button: 'Ver avisos e orientações', section: 'messages' },
    { title: 'Escolha sobre as gravações', text: 'Na página da criança, você pode autorizar ou desativar gravações de leitura. A participação nas atividades continua disponível.', button: 'Ver acompanhamento e gravações', section: 'family' },
  ] },
  admin: { intro: 'Prepare os acessos da escola, organize as turmas e acompanhe o trabalho pedagógico.', steps: [
    { title: 'Crie os acessos da equipe', text: 'Cadastre professores em Contas da escola. As contas de responsáveis devem ser vinculadas à criança correta.', button: 'Abrir contas da escola', section: 'admin' },
    { title: 'Organize turmas e alunos', text: 'Vincule o professor à turma, cadastre os alunos e entregue os códigos de acesso.', button: 'Abrir turmas e alunos', section: 'classes' },
    { title: 'Prepare as atividades', text: 'Confira o banco de atividades e envie propostas com turma e prazo definidos.', button: 'Escolher atividades', section: 'activities' },
    { title: 'Acompanhe e apoie', text: 'Veja os resultados e combine os próximos passos com a equipe pedagógica.', button: 'Acompanhar alunos', section: 'reports' },
  ] },
};

export default function UsageGuide({ role, onClose, onNavigate, onSettings }: { role: Role; onClose: () => void; onNavigate: (section: string) => void; onSettings: () => void }) {
  const guide = guides[role];
  return <Modal title="Como usar a Letria" onClose={onClose} wide><div className="usage-guide"><p className="usage-intro">{guide.intro}</p><ol>{guide.steps.map((step, index) => <li key={step.title}><span className="usage-number">{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p><button type="button" className="text-btn" onClick={()=>onNavigate(step.section)}>{step.button} <ArrowRight size={15}/></button></div></li>)}</ol><aside><Volume2 size={22}/><div><strong>Deixe a leitura confortável</strong><p>Você pode ouvir instruções, aumentar as letras e reduzir movimentos.</p><button type="button" className="text-btn" onClick={onSettings}><Settings2 size={15}/> Ajustar som e leitura</button></div></aside><p className="usage-reassurance"><Heart size={15}/> Precisa de ajuda para acessar sua conta? Peça apoio à escola.</p><span className="usage-return"><BookOpen size={15}/> Este guia fica sempre disponível em “Como usar”.</span></div></Modal>;
}
