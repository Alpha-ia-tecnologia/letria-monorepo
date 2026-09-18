'use client';

import { useCallback, useId, useState, type CSSProperties } from 'react';
import { ArrowRight, AudioLines, BookOpen, Check, Clock3, Compass, Crown, Flag, Flower2, Leaf, Lock, Maximize2, Mountain, Music2, Play, Route, Shell, Sparkles, Sprout, Star, Sun, Telescope, TreePine, Trophy, Waves } from 'lucide-react';
import type { Activity } from '@/lib/content';
import type { StudentProgress } from '@/lib/pedagogy';
import { getJourney } from '@/lib/journey';
import { getWorldTheme } from '@/lib/world-themes';
import LumiCharacter from './LumiCharacter';
import MapExplorer from './MapExplorer';
import './journey.css';
import './journey-map.css';

const worldIcons = [TreePine, AudioLines, BookOpen, Mountain, Crown];
const habitatsByWorld = [
  [Sprout, Leaf, Flower2, TreePine], [Waves, AudioLines, Music2, Sparkles],
  [Shell, Route, Sun, Flag], [Route, Flag, Mountain, Sun], [BookOpen, Crown, Telescope, Sparkles],
];
const markerColors = [
  { light: '#ffe676', color: '#ffc738', shadow: '#d99814' },
  { light: '#a5e87a', color: '#66c844', shadow: '#399d29' },
  { light: '#73d6ff', color: '#32acf1', shadow: '#1680c8' },
  { light: '#d0a0ff', color: '#a16beb', shadow: '#7244b9' },
];
const growthLabels = ['Um novo começo', 'Primeira descoberta', 'Criando conexões', 'Ganhando vida', 'Ecossistema completo'];

export default function JourneyMap({ progress, onPlay, onHelp, compact = false, initialWorld, onComputational }: {
  progress: StudentProgress; onPlay: (activity: Activity) => void; onHelp: () => void;
  compact?: boolean; initialWorld?: number; onComputational?: () => void;
}) {
  const journey = getJourney(progress);
  const [selected, setSelected] = useState(initialWorld ?? journey.next?.activity.worldId ?? 5);
  const [notice, setNotice] = useState('');
  const [expandedWorld,setExpandedWorld]=useState<number|'overview'|null>(null);
  const closeExplorer=useCallback(()=>setExpandedWorld(null),[]);
  const selectExpandedWorld=useCallback((id:number)=>{setSelected(id);setNotice('');},[]);
  const rulesId = useId();
  const worldDetailsId = useId();
  const territory = journey.worlds.find(item => item.world.id === selected) || journey.worlds[0];
  const worldId = territory.world.id;
  const theme = getWorldTheme(worldId);
  const WorldIcon = worldIcons[worldId - 1];
  const habitatIcons = habitatsByWorld[worldId - 1];
  const completed = territory.steps.filter(step => step.status === 'completed').length;
  const nextHere = territory.steps.find(step => step.status === 'current');
  const mission = nextHere ?? territory.steps[0];
  const openIslands = journey.worlds.filter(world => world.unlocked).length;
  const themeStyle = { '--habitat-accent': theme.accent, '--habitat-soft': theme.soft, '--habitat-sky': theme.sky, '--habitat-image': `url("${theme.image}")`, '--habitat-growth': completed } as CSSProperties;

  function chooseWorld(id: number) { setSelected(id); setNotice(''); setExpandedWorld(id); }
  function visit(node: typeof mission) {
    if (node.status === 'locked') {
      const previous = journey.nodes[node.index - 1];
      setNotice('Este território ainda está fechado. Conquiste ' + (previous?.title ?? 'o território anterior') + ' para abrir o caminho!');
      return;
    }
    setNotice('');
    onPlay(node.activity);
  }

  return <section className={'expedition island-expedition ecosystem-expedition' + (compact ? ' expedition-compact' : '')} aria-label="Ecossistema de ilhas e trilhas" style={themeStyle}>
    {!compact && <header className="island-intro">
      <div><span className="island-eyebrow"><Compass size={16}/> CADA DESCOBERTA FAZ ESTE MUNDO CRESCER</span><h2>Seu arquipélago de aventuras</h2><p>Cinco ilhas conectadas. Um universo que ganha vida com você.</p></div>
      <div className="island-total"><span><Sprout size={23}/></span><div><strong>{openIslands}<small> / {journey.worlds.length}</small></strong><p>ilhas alcançadas</p></div></div>
    </header>}
    <div className="island-progress-row">
      <div className="island-progress" role="progressbar" aria-label="Territórios conquistados" aria-valuenow={journey.completed} aria-valuemin={0} aria-valuemax={journey.total}><span style={{ width: journey.percent + '%' }}/></div>
      <span>{journey.completed} de {journey.total} <Flag size={13} aria-hidden="true"/></span>
    </div>

    <section className="archipelago" aria-label="Mapa do arquipélago">
      <div className="archipelago-heading"><div><span><Waves size={15}/> O MAR DAS DESCOBERTAS</span><h3>De ilha em ilha, tudo se transforma.</h3></div><span className="archipelago-growth"><Sprout size={15}/>{journey.completed === journey.total ? 'Arquipélago completo!' : 'Ecossistema em expansão'}</span><button type="button" className="archipelago-expand" aria-haspopup="dialog" aria-expanded={expandedWorld!==null} onClick={()=>setExpandedWorld('overview')}><Maximize2 size={18}/> Expandir mapa</button></div>
      <div className="archipelago-ocean" role="group" aria-label="Escolher uma ilha para explorar ou conhecer">
        <div className="archipelago-sea-route" aria-hidden="true"/>{journey.worlds.slice(1).map((island, index) => <span key={island.world.id} className={'archipelago-route-leg route-leg-' + (index + 1) + (island.unlocked ? ' is-open' : '')} aria-hidden="true"/>)}
        <span className="archipelago-wave wave-one" aria-hidden="true"><Waves/></span><span className="archipelago-wave wave-two" aria-hidden="true"><Waves/></span>
        <span className="archipelago-tiny-island tiny-one" aria-hidden="true"><TreePine/></span><span className="archipelago-tiny-island tiny-two" aria-hidden="true"><Sprout/></span>
        {journey.worlds.map(({ world, steps, unlocked, completed: finished }) => {
          const islandTheme = getWorldTheme(world.id);
          const Icon = worldIcons[world.id - 1];
          const growth = steps.filter(step => step.status === 'completed').length;
          const current = journey.next?.activity.worldId === world.id;
          return <button key={world.id} type="button" aria-pressed={worldId === world.id} aria-controls={worldDetailsId} aria-haspopup="dialog"
            aria-label={'Aproximar e conhecer ' + islandTheme.name + '. ' + (finished ? 'Ecossistema completo. ' : unlocked ? growth + ' de 4 territórios conquistados. ' : 'Ainda bloqueada. Conhecer esta ilha. ') + (worldId === world.id ? 'Selecionada.' : '')}
            onClick={() => chooseWorld(world.id)} className={'archipelago-island archipelago-island-' + world.id + (worldId === world.id ? ' is-selected' : '') + (!unlocked ? ' is-locked' : '') + (finished ? ' is-completed' : '')}
            style={{ '--mini-accent': islandTheme.accent, '--mini-soft': islandTheme.soft, '--mini-image': `url("${islandTheme.image}")`, '--mini-growth': growth } as CSSProperties}>
            <span className="archipelago-island-art"><span className="archipelago-island-image"/><span className="archipelago-habitats" aria-hidden="true">{habitatsByWorld[world.id - 1].slice(0, growth).map((HabitatIcon, index) => <i key={index}><HabitatIcon size={13}/></i>)}</span><span className="archipelago-island-number">{finished ? <Check size={16}/> : !unlocked ? <Lock size={14}/> : world.id}</span>{current && <span className="archipelago-you">Você está aqui</span>}</span>
            <span className="archipelago-island-name"><Icon size={14}/>{islandTheme.name}</span>
            <span className="archipelago-island-state">{finished ? 'Cheia de vida!' : unlocked ? growth + '/4 descobertas' : 'Ilha a descobrir'}</span>
            <span className="archipelago-life" aria-hidden="true">{steps.map((step, index) => <i key={index} className={step.status === 'completed' ? 'is-grown' : ''}/>)}</span>
          </button>;
        })}
      </div>
      <div className="archipelago-footer"><p><Compass size={17}/><span>{journey.completed === journey.total ? 'Todas as ilhas estão conectadas. Volte para explorar suas descobertas favoritas!' : 'Clique em uma ilha para aproximar e descobrir seus territórios. Cada conquista abre mais um caminho.'}</span></p>{onComputational && <button type="button" onClick={onComputational}><Route size={16}/> Laboratório de ideias<ArrowRight size={15}/></button>}</div>
    </section>

    <div className="habitat-heading" id={worldDetailsId}>
      <div><span>ILHA {String(worldId).padStart(2, '0')} · {territory.unlocked ? 'SUA EXPEDIÇÃO' : 'CONHEÇA O QUE VEM A SEGUIR'}</span><h3>{theme.title}</h3><p>{theme.description}</p></div>
      <span className={'habitat-level' + (territory.completed ? ' is-complete' : '')}><WorldIcon size={22}/><span>{growthLabels[completed]}<small>{completed} de 4 descobertas</small></span></span>
    </div>
    <article className={'island-board habitat-board' + (!territory.unlocked ? ' island-board-locked' : '') + (territory.completed ? ' habitat-complete' : '')}>
      <div className="island-scenery" role="group" aria-label={'Mapa de ' + theme.name + '. A trilha começa embaixo.'} aria-describedby={rulesId}>
        <div className="island-ribbon"><span><WorldIcon size={17}/>{theme.name}</span></div>
        <div className="island-terrain">
          <div className="island-background" aria-hidden="true"/>
          {territory.steps.map((node, index) => {
            const marker = markerColors[index];
            return <div key={node.activity.id} className={'island-stop is-' + node.status} style={{ left: theme.positions[index][0] + '%', top: theme.positions[index][1] + '%', '--marker-light': marker.light, '--marker-color': marker.color, '--marker-shadow': marker.shadow } as CSSProperties}>
              {node.status === 'current' && <span className="island-current-label"><Play size={10} fill="currentColor"/> Jogar</span>}
              <button type="button" className="island-marker" aria-disabled={node.status === 'locked'} aria-current={node.status === 'current' ? 'step' : undefined}
                aria-label={'Território ' + (node.index + 1) + ', ' + node.title + '. ' + (node.status === 'locked' ? 'Bloqueado. Complete o território anterior para liberar.' : node.status === 'completed' ? 'Conquistado. Jogar novamente.' : 'Sua próxima aventura. Jogar ' + node.activity.title + '.')}
                onClick={() => visit(node)}>
                <span className="island-marker-number">{node.index + 1}</span>
                {node.status === 'completed' && <span className="island-marker-badge"><Check size={14} strokeWidth={3}/></span>}
                {node.status === 'locked' && <span className="island-marker-badge"><Lock size={12}/></span>}
                {node.portal && <Crown className="island-portal-crown" size={19}/>}
              </button>
              <span className="island-marker-stars" aria-hidden="true"><Star/><Star/><Star/></span>
              <span className="island-stop-caption">{node.status === 'completed' ? 'Cheio de vida!' : node.status === 'locked' ? 'A descobrir' : 'Vamos lá!'}</span>
            </div>;
          })}
          <div className="island-grown-habitats" aria-hidden="true">{habitatIcons.slice(0, completed).map((HabitatIcon, index) => <span key={index} style={{ left: (theme.positions[index][0] + (index % 2 ? -17 : 17)) + '%', top: (theme.positions[index][1] + 2) + '%' }}><HabitatIcon size={24}/><Sparkles size={12}/></span>)}</div><div className="island-map-pill"><WorldIcon size={15}/><span>{completed} de {territory.steps.length} descobertas</span>{territory.completed && <Check size={15}/>}</div>
        </div>
      </div>

      <div className="island-mission-panel">
        <div className="island-mission-status">{territory.completed ? <><Trophy size={16}/> ECOSSISTEMA COMPLETO</> : !territory.unlocked ? <><Lock size={15}/> PRÉVIA DESTA ILHA</> : <><Flag size={16}/>{theme.missionLabel.toUpperCase()}</>}</div>
        <div className={'island-mission-icon' + (!territory.unlocked ? ' is-locked' : '')}><WorldIcon size={36}/>{territory.completed && <Check size={19}/>}</div>
        <h3>{territory.completed ? 'Olha só o que você fez crescer!' : !territory.unlocked ? 'Uma ilha cheia de possibilidades' : mission.title}</h3>
        <p className="island-mission-description">{territory.completed ? theme.milestones[3] : !territory.unlocked ? 'Siga pela sua trilha para chegar a ' + theme.name + '. Você já pode conhecer o que vai descobrir por aqui.' : theme.gameIntro}</p>
        {nextHere && <>
          <div className="habitat-next-challenge"><small>SEU DESAFIO</small><strong>{nextHere.activity.title}</strong><p>{nextHere.activity.description}</p></div>
          <div className="island-mission-facts"><span><Clock3 size={15}/>{nextHere.activity.durationMinutes} min</span><span><Sparkles size={15}/>{nextHere.activity.questions.length} desafios</span></div>
          <button type="button" className="island-play-button" onClick={() => visit(nextHere)}><Play size={18} fill="currentColor"/> Explorar este território<ArrowRight size={18}/></button>
        </>}
        {!nextHere && journey.next && <button type="button" className="island-play-button" onClick={() => chooseWorld(journey.next!.activity.worldId)}><Compass size={18}/>{territory.completed ? 'Viajar para a próxima ilha' : 'Voltar à minha trilha'}<ArrowRight size={18}/></button>}
        {!nextHere && !journey.next && <button type="button" className="island-play-button" onClick={() => visit(mission)}><Play size={18} fill="currentColor"/> Explorar outra vez<ArrowRight size={18}/></button>}

        <div className="habitat-growth-card">
          <h4><Sprout size={17}/>{theme.habitatLabel}</h4>
          <div className="habitat-growth-tokens" aria-label={completed + ' de 4 partes do ecossistema desenvolvidas'}>{habitatIcons.map((Icon, index) => <span key={index} className={completed > index ? 'is-grown' : ''} title={theme.milestones[index]}><Icon size={23}/>{completed > index && <Check size={10}/>}</span>)}</div>
          <p>{completed ? theme.milestones[completed - 1] : theme.habitatIntro}</p>
          {nextHere && <small><Sparkles size={13}/> Próxima transformação: {theme.milestones[completed]}</small>}
        </div>
        <div className="island-itinerary">
          <h4><span>O que esta ilha pode se tornar</span><small>{completed}/{territory.steps.length}</small></h4>
          <ol>{territory.steps.map((node, index) => <li key={node.activity.id} className={'is-' + node.status} aria-current={node.status === 'current' ? 'step' : undefined}>
            <span className="island-itinerary-number">{node.status === 'completed' ? <Check size={14}/> : node.index + 1}</span>
            <div><strong>{node.title}</strong><small>{theme.milestones[index]}</small></div>
            {node.status === 'locked' && <Lock size={12}/>}{node.status === 'current' && <Play size={12} fill="currentColor"/>}
          </li>)}</ol>
        </div>
        <p className="island-rules" id={rulesId}><Star size={17}/><span>Acerte pelo menos 80% dos desafios para abrir o próximo território e fazer seu ecossistema crescer.</span></p>
      </div>
    </article>
    <div className="island-notice" role="status">{notice && <><Lock size={16}/><span>{notice}</span></>}</div>
    <aside className="island-guide"><LumiCharacter small/><div><strong>Vamos cuidar deste mundo juntos?</strong><p>Sou a Lumi. Cada descoberta faz diferença. Se precisar de uma pista, estou aqui!</p></div><button type="button" onClick={onHelp}><Sparkles size={16}/> Falar com a Lumi</button></aside>
    {!compact && <div className="island-legend"><span><Check size={14}/> Cheio de vida</span><span><Play size={13} fill="currentColor"/> Pronto para explorar</span><span><Lock size={13}/> A descobrir</span></div>}
    {expandedWorld!==null&&<MapExplorer progress={progress} initialWorld={expandedWorld==='overview'?undefined:expandedWorld} onSelectWorld={selectExpandedWorld} onClose={closeExplorer} onPlay={onPlay} onComputational={onComputational}/>}
  </section>;
}