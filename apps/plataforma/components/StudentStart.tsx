'use client';

import { ArrowDownToLine, ArrowRight, Award, BookOpen, Bot, CheckCircle2, Clock3, Flag, Heart, LoaderCircle, Map, Sparkles, Star, Trophy } from 'lucide-react';
import type { StudentNextStep } from '@/lib/student-journey';
import LumiCharacter from './LumiCharacter';
import SpeechButton from './SpeechButton';

type Props = {
  next: StudentNextStep; pending: number; name: string; completed: number; xp: number; level: number; levelProgress: number;
  onStart: () => void; onNavigate: (section: string) => void; onHelp: () => void; onGuide: () => void;
  onDownload: () => void; downloading: boolean; offlineReady: boolean; online: boolean; sound: boolean;
};

export default function StudentStart({ next, pending, name, completed, xp, level, levelProgress, onStart, onNavigate, onHelp, onGuide, onDownload, downloading, offlineReady, online, sound }: Props) {
  return <div className="student-start adventure-home">
    <section className="welcome-world start-welcome" aria-label="Seu próximo passo">
      <div className="welcome-copy"><span className="welcome-badge"><Sparkles size={15}/> COMECE POR AQUI</span><h2>{next.title}</h2><p>{next.description}</p><button className="btn btn-primary btn-large" onClick={onStart}>{next.label}<ArrowRight size={19}/></button><span className="start-duration"><Clock3 size={15}/> Cerca de {next.minutes} minutos · sem limite de tempo</span><span className="welcome-reassurance"><Heart size={14}/> Pode tentar de novo. Aprender leva tempo.</span></div>
      <div className="welcome-progress"><span className="progress-medal"><Award size={27}/></span><small>Suas descobertas</small><strong><Star size={21}/>{completed}<span>atividades</span></strong><div className="xp-track"><div style={{width:levelProgress+'%'}}/></div><span>Nível {level} · {xp} pontos de experiência</span></div>
    </section>
    <section className="start-how" aria-label="Como fazer uma atividade"><ol><li><span>1</span><div><strong>Abra a atividade</strong><small>Use o botão acima para começar.</small></div></li><li><span>2</span><div><strong>Leia ou ouça</strong><small>O botão de som lê a instrução.</small></div></li><li><span>3</span><div><strong>Responda e confira</strong><small>Peça uma pista quando precisar.</small></div></li></ol><button className="text-btn" onClick={onGuide}>Ver como usar <ArrowRight size={15}/></button></section>
    <section className="start-destinations" aria-labelledby="start-destinations-title"><div className="section-title"><div><h2 id="start-destinations-title">Escolha outro caminho</h2><p>Você pode voltar ao início sempre que quiser.</p></div></div><div className="start-destination-grid">
      <button className="start-destination start-school" onClick={()=>onNavigate('missions')}><span className="start-destination-icon"><Flag size={27}/></span><strong>Atividades da turma</strong><p>{pending ? `${pending} ${pending===1?'atividade para fazer':'atividades para fazer'}. Veja o que seu professor preparou.` : 'Veja as atividades que seu professor enviou e as que você já fez.'}</p><span>{pending ? 'Ver atividades para fazer' : 'Ver atividades da turma'} <ArrowRight size={16}/></span></button>
      <button className="start-destination start-islands" onClick={()=>onNavigate('worlds')}><span className="start-destination-icon"><Map size={27}/></span><strong>Trilha de ilhas</strong><p>Aprenda letras, sons, palavras e histórias, uma ilha de cada vez.</p><span>Abrir minha trilha <ArrowRight size={16}/></span></button>
      <button className="start-destination start-logic" onClick={()=>onNavigate('computational')}><span className="start-destination-icon"><Bot size={27}/></span><strong>Lógica e programação</strong><p>Organize ideias, crie instruções e veja seu programa funcionando.</p><span>Explorar os desafios <ArrowRight size={16}/></span></button>
    </div></section>
    <section className="start-help panel"><LumiCharacter small/><div><h2>Precisa de uma ajuda, {name}?</h2><p>Use uma pista durante a atividade ou converse com a Lumi. Seu professor também pode ajudar.</p><div className="start-help-actions"><button className="btn btn-secondary" onClick={onHelp}>Conversar com a Lumi <ArrowRight size={16}/></button><SpeechButton text="Para começar, toque no botão da sua próxima atividade. Leia a instrução ou use o botão de som. Escolha sua resposta e confira. Se precisar, peça uma pista. Você pode tentar de novo." enabled={sound} label="Ouvir como começar"/></div></div></section>
    <div className="start-more"><button className="text-btn" onClick={()=>onNavigate('achievements')}><Trophy size={18}/> Ver minhas conquistas <ArrowRight size={15}/></button><button className="text-btn" onClick={()=>onNavigate('library')}><BookOpen size={18}/> Procurar outras atividades <ArrowRight size={15}/></button></div>
    <details className="start-offline"><summary><ArrowDownToLine size={16}/> Quero usar sem internet</summary><p>Prepare as atividades enquanto estiver conectado. Para conversar com a IA, mantenha a conexão. Você pode fazer as atividades salvas sem ela.</p><button className="btn btn-secondary" disabled={downloading||!online} onClick={onDownload}>{downloading?<LoaderCircle size={17} className="spin"/>:offlineReady?<CheckCircle2 size={17}/>:<ArrowDownToLine size={17}/>} {downloading?'Preparando…':offlineReady?'Atualizar atividades salvas':'Preparar atividades sem internet'}</button></details>
  </div>;
}
