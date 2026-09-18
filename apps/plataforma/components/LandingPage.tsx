'use client';

/* eslint-disable @next/next/no-img-element -- Bundled illustrations use the same direct asset URLs as the offline platform. */

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowRight, BookOpen, Bot, Check, ChevronDown, Compass, Copy, GraduationCap, Heart, LayoutGrid, Map, Menu, MessageCircle, School, Sparkles, Sprout, Star, Trophy, Users, WandSparkles, X } from 'lucide-react';
import { activityCatalog } from '../lib/activity-catalog';
import { worlds } from '../lib/content';
import { getWorldTheme } from '../lib/world-themes';
import './landing-page.css';
import './entry-guidance.css';

const totalQuestions = activityCatalog.reduce((total, activity) => total + activity.questions.length, 0);
const navigation = [
  { href: '#seu-acesso', label: 'Como entrar' },
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#educadores', label: 'Para educadores' },
];
const steps = [
  { number: '01', icon: Compass, title: 'Entre com o acesso da escola', text: 'Estudantes usam um código. Professores e responsáveis usam e-mail e senha. A escola fornece esses dados.', color: 'lilac' },
  { number: '02', icon: WandSparkles, title: 'Veja o que fazer primeiro', text: 'Depois de entrar, encontre sua próxima ação: realizar uma atividade, orientar a turma ou acompanhar a criança.', color: 'peach' },
  { number: '03', icon: Sprout, title: 'Continue de onde parou', text: 'O estudante avança uma atividade por vez. Professores e responsáveis acompanham as descobertas e ajudam quando necessário.', color: 'mint' },
];
const worldCopy: Record<number, string> = {
  1: 'Letras ganham vida entre árvores, clareiras e primeiras descobertas.',
  2: 'Rimas, ritmos e pedacinhos sonoros dão melodia à aventura.',
  3: 'Sílabas se encontram e constroem pontes para novas palavras.',
  4: 'Palavras em ordem, pontuação e ideias que fazem sentido.',
  5: 'Personagens, pistas e histórias para ampliar a imaginação.',
};
const questions = [
  { title: 'Como minha escola começa a usar a Letria?', answer: 'A pessoa que vai administrar uma escola nova escolhe “Cadastrar uma nova escola”. Depois, organiza as turmas e os acessos. Se sua escola já usa a Letria, peça o acesso à equipe e escolha “Entrar na Letria”.' },
  { title: 'Como o estudante entra na própria jornada?', answer: 'Na tela de entrada, escolha o acesso de estudante e informe o código fornecido pela escola. Esse código conecta a criança ao seu perfil e à sua jornada de aprendizagem.' },
  { title: 'É possível aprender sem conexão com a internet?', answer: 'Sim, com preparação: conecte-se e baixe as atividades antes de ficar offline. O conteúdo baixado continua disponível no mesmo dispositivo, e as respostas pendentes podem ser sincronizadas quando a conexão voltar. O primeiro acesso e o download precisam de internet.' },
  { title: 'Como a Lumi ajuda durante as atividades?', answer: 'A Lumi é a assistente de inteligência artificial da Letria. A criança pode pedir uma dica, tirar uma dúvida sobre o desafio e receber explicações para pensar no próximo passo. Ela acompanha a prática; o professor continua orientando a aprendizagem.' },
];

function Brand() {
  return <span className="lp-brand"><span className="lp-brand-mark"><BookOpen size={25} strokeWidth={2.5} aria-hidden="true" /></span><span>letria<Sparkles size={16} strokeWidth={2.3} aria-hidden="true" /></span></span>;
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus(); }
    };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setMenuOpen(false);
    };
    const desktop = window.matchMedia('(min-width: 941px)');
    const onResize = () => { if (desktop.matches) setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    desktop.addEventListener('change', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      desktop.removeEventListener('change', onResize);
    };
  }, [menuOpen]);

  return <div className="landing-page">
    <Link prefetch={false} className="lp-skip" href="#lp-content">Pular para o conteúdo</Link>
    <header className="lp-header" ref={header}>
      <div className="lp-container lp-header-inner">
        <Link prefetch={false} href="/" aria-label="Letria, página inicial"><Brand /></Link>
        <nav className="lp-desktop-nav" aria-label="Navegação principal">{navigation.map(item => <Link prefetch={false} href={item.href} key={item.href}>{item.label}</Link>)}</nav>
        <div className="lp-header-actions"><Link prefetch={false} className="lp-login" href="/plataforma?demo=1">Ver demonstração</Link><Link prefetch={false} className="lp-button lp-button-small lp-button-primary" href="/login">Entrar na Letria<ArrowRight size={16} aria-hidden="true" /></Link></div>
        <button ref={menuButton} className="lp-menu-button" type="button" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen} aria-controls="lp-mobile-nav" onClick={() => setMenuOpen(open => !open)}>{menuOpen ? <X size={25} /> : <Menu size={25} />}</button>
      </div>
      <nav id="lp-mobile-nav" className="lp-mobile-nav" aria-label="Navegação móvel" hidden={!menuOpen}>
        {navigation.map(item => <Link prefetch={false} href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>{item.label}<ArrowRight size={17} aria-hidden="true" /></Link>)}
        <Link prefetch={false} href="/plataforma?demo=1" onClick={() => setMenuOpen(false)}>Ver demonstração<ArrowRight size={17} aria-hidden="true" /></Link>
        <Link prefetch={false} className="lp-button lp-button-primary" href="/login">Entrar na Letria</Link>
      </nav>
    </header>

    <main id="lp-content" tabIndex={-1}>
      <section className="lp-container lp-hero" aria-labelledby="lp-hero-title">
        <div className="lp-hero-copy">
          <span className="lp-eyebrow"><span className="lp-eyebrow-dot" />APRENDER É EXPLORAR</span>
          <h1 id="lp-hero-title">Pequenas descobertas. <span>Grandes aventuras.</span></h1>
          <p className="lp-hero-description">Um universo de alfabetização para explorar, brincar e aprender. Ilhas interativas, novos desafios e a Lumi ao lado de cada descoberta.</p>
          <div className="lp-hero-actions"><Link prefetch={false} className="lp-button lp-button-primary" href="/login">Entrar na Letria<ArrowRight size={19} aria-hidden="true" /></Link><Link prefetch={false} className="lp-button lp-button-secondary" href="/plataforma?demo=1"><Compass size={19} aria-hidden="true" />Ver demonstração</Link></div>
          <p className="eg-demo-note">Já tem acesso? Entre para continuar. Na demonstração, você conhece a plataforma com dados fictícios.</p>
          <div className="lp-hero-note"><span className="lp-note-icon"><Heart size={18} aria-hidden="true" /></span><p>Para quem está descobrindo as palavras.<br /><strong>E para quem acompanha cada passo.</strong></p></div>
        </div>
        <figure className="lp-hero-visual">
          <div className="lp-hero-halo" aria-hidden="true" /><Sparkles className="lp-hero-spark lp-spark-one" size={35} aria-hidden="true" /><Star className="lp-hero-spark lp-spark-two" size={25} aria-hidden="true" />
          <div className="lp-map-preview">
            <div className="lp-map-top"><span><Map size={17} aria-hidden="true" />Seu mundo de descobertas</span><span className="lp-map-dot" aria-hidden="true" /></div>
            <div className="lp-map-art"><img src="/art/trail-island.png" alt="Ilha verde com uma trilha sinuosa, árvores, cachoeira e uma casinha no alto" width={1024} height={1536} fetchPriority="high" /><span className="lp-path-marker lp-marker-one" aria-hidden="true"><Check size={23} strokeWidth={3} /></span><span className="lp-path-marker lp-marker-two" aria-hidden="true">2</span><span className="lp-path-marker lp-marker-three" aria-hidden="true"><Star size={22} fill="currentColor" /></span></div>
          </div>
          <div className="lp-floating-card lp-unlock"><span className="lp-floating-icon lp-icon-mint"><Sprout size={24} aria-hidden="true" /></span><div><small>NOVOS CAMINHOS</small><strong>Mundo desbloqueado!</strong></div><Sparkles size={19} aria-hidden="true" /></div>
          <div className="lp-floating-card lp-achievement"><span className="lp-floating-icon lp-icon-yellow"><Trophy size={25} aria-hidden="true" /></span><div><small>CADA DESCOBERTA CONTA</small><strong>Uma nova conquista</strong><span className="lp-mini-stars" aria-hidden="true"><Star size={13} fill="currentColor" /><Star size={13} fill="currentColor" /><Star size={13} fill="currentColor" /></span></div></div>
          <figcaption>Uma ilustração da jornada que cresce com o aprendizado.</figcaption>
        </figure>
      </section>

      <section className="lp-container eg-entry-paths" id="seu-acesso" aria-labelledby="eg-paths-title">
        <div className="eg-entry-heading"><span className="lp-eyebrow">O PRIMEIRO PASSO</span><h2 id="eg-paths-title">Encontre o seu acesso.</h2><p>Escolha como você participa da aprendizagem. A escola entrega os dados para entrar.</p></div>
        <div className="eg-entry-grid">
          <article className="eg-entry-card eg-entry-student"><span className="eg-profile-icon"><BookOpen size={25} aria-hidden="true" /></span><h3>Sou estudante</h3><p>Use o código que seu professor entregou e encontre sua próxima atividade.</p><span className="eg-credential-label">Você vai precisar do seu código</span><Link prefetch={false} href="/login?modo=estudante">Entrar como estudante <ArrowRight size={17} aria-hidden="true" /></Link></article>
          <article className="eg-entry-card"><span className="eg-profile-icon"><GraduationCap size={25} aria-hidden="true" /></span><h3>Sou professor</h3><p>Entre para organizar as atividades da turma e acompanhar as descobertas dos estudantes.</p><span className="eg-credential-label">E-mail e senha fornecidos pela escola</span><Link prefetch={false} href="/login">Entrar como professor <ArrowRight size={17} aria-hidden="true" /></Link></article>
          <article className="eg-entry-card eg-entry-family"><span className="eg-profile-icon"><Heart size={25} aria-hidden="true" /></span><h3>Sou responsável</h3><p>Entre na sua conta para acompanhar a criança vinculada a você e apoiar a aprendizagem.</p><span className="eg-credential-label">E-mail e senha fornecidos pela escola</span><Link prefetch={false} href="/login">Entrar como responsável <ArrowRight size={17} aria-hidden="true" /></Link></article>
        </div>
        <aside className="eg-new-school"><School size={25} aria-hidden="true" /><div><h3>Vai administrar uma escola nova?</h3><p>O cadastro da instituição é o primeiro passo para quem vai organizar a escola na Letria.</p></div><Link prefetch={false} href="/login?modo=cadastro">Cadastrar uma nova escola <ArrowRight size={17} aria-hidden="true" /></Link></aside>
        <p className="eg-access-support">Ainda não recebeu seu acesso? Peça ao professor, à secretaria ou à equipe da sua escola.</p>
      </section>

      <section className="lp-container lp-stats" aria-label="O universo de atividades da Letria">
        <p>Um universo inteiro.<br /><strong>Pequenos passos para explorar.</strong></p>
        <div><strong>{activityCatalog.length}</strong><span>atividades para descobrir</span></div><div><strong>{totalQuestions}</strong><span>desafios para pensar</span></div><div><strong>{worlds.length}</strong><span>mundos conectados</span></div>
      </section>

      <section className="lp-container lp-section lp-how" id="como-funciona" aria-labelledby="lp-how-title">
        <div className="lp-section-heading lp-heading-centered"><span className="lp-eyebrow">DO PRIMEIRO PASSO À PRÓXIMA DESCOBERTA</span><h2 id="lp-how-title">Um passo de cada vez.<br /><span>Com orientação para continuar.</span></h2><p>Saiba como começar e encontre ajuda durante o caminho.</p></div>
        <div className="lp-steps">{steps.map(step => <article className={'lp-step lp-step-' + step.color} key={step.number}><div className="lp-step-top"><span className="lp-step-icon"><step.icon size={30} strokeWidth={1.8} aria-hidden="true" /></span><span className="lp-step-number">{step.number}</span></div><h3>{step.title}</h3><p>{step.text}</p></article>)}</div>
      </section>

      <section className="lp-universe" id="universo" aria-labelledby="lp-universe-title">
        <div className="lp-container"><div className="lp-section-heading lp-heading-row"><div><span className="lp-eyebrow">UM ARQUIPÉLAGO DE POSSIBILIDADES</span><h2 id="lp-universe-title">Cada ilha, um novo<br /><span>jeito de aprender.</span></h2></div><p>Das primeiras letras às histórias inteiras: siga a trilha, aproxime o mapa e descubra o que existe em cada mundo.</p></div>
          <div className="lp-world-grid">{worlds.map(world => { const theme = getWorldTheme(world.id); return <Link prefetch={false} className="lp-world-card" href="/login?modo=estudante" key={world.id} style={{ '--lp-world-soft': theme.soft, '--lp-world-accent': theme.accent } as CSSProperties}><div className="lp-world-picture"><img src={theme.image} alt="" width={1024} height={1536} loading="lazy" /><span className="lp-world-index">MUNDO 0{world.id}</span></div><div className="lp-world-copy"><span className="lp-world-skill">{world.skill}</span><h3>{world.title}</h3><p>{worldCopy[world.id]}</p><span className="lp-world-link">Entrar para explorar<ArrowRight size={17} aria-hidden="true" /></span></div></Link>; })}
            <Link prefetch={false} className="lp-world-card lp-logic-card" href="/login?modo=estudante"><div className="lp-world-picture"><img src="/art/ecosystem-logic.png" alt="" width={1024} height={1536} loading="lazy" /><span className="lp-world-index"><Bot size={13} aria-hidden="true" />EXPEDIÇÃO EXTRA</span></div><div className="lp-world-copy"><span className="lp-world-skill">Lógica e criatividade</span><h3>Pensamento computacional</h3><p>Padrões, pequenos robôs e boas ideias para resolver um desafio por partes.</p><span className="lp-world-link">Entrar para descobrir<ArrowRight size={17} aria-hidden="true" /></span></div></Link>
          </div>
        </div>
      </section>

      <section className="lp-container lp-section lp-bento" aria-label="Companhia para aprender e ferramentas para ensinar">
        <article className="lp-lumi-card" aria-labelledby="lp-lumi-title"><div className="lp-lumi-copy"><span className="lp-eyebrow"><Sparkles size={15} aria-hidden="true" />CONHEÇA A LUMI</span><h2 id="lp-lumi-title">Uma companhia<br />para a curiosidade.</h2><p>Travou em um desafio? A Lumi, nossa assistente de IA, ajuda com dicas e explicações para a criança continuar pensando.</p><Link prefetch={false} className="lp-text-link" href="/plataforma?demo=1">Conhecer a Lumi<ArrowRight size={18} aria-hidden="true" /></Link></div><div className="lp-lumi-scene"><div className="lp-lumi-speech"><MessageCircle size={19} aria-hidden="true" /><span>Vamos descobrir<br /><strong>uma pista juntos?</strong></span></div><img src="/art/lumi-explorer.png" alt="Lumi, uma corujinha exploradora lilás com um lenço amarelo, acenando" width={1254} height={1254} loading="lazy" /><span className="lp-lumi-caption">Sua assistente de aprendizagem</span></div></article>
        <article className="lp-teacher-card" id="educadores" aria-labelledby="lp-teacher-title"><span className="lp-eyebrow"><GraduationCap size={17} aria-hidden="true" />FEITA TAMBÉM PARA QUEM ENSINA</span><h2 id="lp-teacher-title">Seu olhar pedagógico.<br /><span>Novas possibilidades.</span></h2><p>Um espaço para preparar experiências e acompanhar o percurso de cada estudante.</p><ul><li><LayoutGrid size={20} aria-hidden="true" /><span><strong>Um banco cheio de possibilidades</strong>Filtre por área, formato e nível. Pré-visualize os desafios antes de usar.</span></li><li><Copy size={20} aria-hidden="true" /><span><strong>Atividades com a sua intenção</strong>Copie, adapte, publique e atribua atividades às suas turmas.</span></li><li><Users size={20} aria-hidden="true" /><span><strong>Acompanhamento que apoia decisões</strong>Consulte resultados e registre observações nos relatórios de aprendizagem.</span></li></ul><Link prefetch={false} className="lp-button lp-button-dark" href="/login">Entrar como professor<ArrowRight size={18} aria-hidden="true" /></Link></article>
      </section>

      <section className="lp-container lp-faq lp-section" aria-labelledby="lp-faq-title"><div className="lp-faq-heading"><span className="lp-eyebrow">ANTES DE PARTIR</span><h2 id="lp-faq-title">A curiosidade<br />começa aqui.</h2><p>Algumas respostas para ajudar no primeiro passo.</p><span className="lp-faq-decoration" aria-hidden="true"><MessageCircle size={39} strokeWidth={1.6} /><Sparkles size={25} /></span></div><div className="lp-faq-items">{questions.map(question => <details className="lp-faq-item" key={question.title}><summary><span>{question.title}</span><ChevronDown size={20} aria-hidden="true" /></summary><p>{question.answer}</p></details>)}</div></section>

      <section className="lp-container lp-final-wrap" aria-labelledby="lp-final-title"><div className="lp-final-cta"><span className="lp-final-star lp-final-star-one" aria-hidden="true"><Star size={43} fill="currentColor" /></span><span className="lp-eyebrow">O PRÓXIMO PASSO PODE SER PEQUENO</span><h2 id="lp-final-title">A descoberta pode ser enorme.</h2><p>Use o acesso entregue pela sua escola para continuar.</p><Link prefetch={false} className="lp-button lp-button-white" href="/login">Entrar na Letria<ArrowRight size={19} aria-hidden="true" /></Link><Sparkles className="lp-final-star lp-final-star-two" size={53} aria-hidden="true" /></div></section>
    </main>

    <footer className="lp-container lp-footer"><div><Link prefetch={false} href="/" aria-label="Letria, página inicial"><Brand /></Link><p>Uma aventura em cada palavra.</p></div><nav aria-label="Navegação do rodapé"><Link prefetch={false} href="#universo">Explorar o universo</Link><Link prefetch={false} href="/login">Entrar na plataforma</Link><Link prefetch={false} href="#lp-content" className="lp-back-top">Voltar ao início<ArrowDown size={16} aria-hidden="true" /></Link></nav><span className="lp-copyright">© {new Date().getFullYear()} Letria. Feita para descobrir.</span></footer>
  </div>;
}
