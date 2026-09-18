'use client';

import {useEffect,useId,useRef,useState,useSyncExternalStore,type CSSProperties,type PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft,ArrowRight,Check,Clock3,Compass,Flag,Lock,Map,Maximize2,Minimize2,Minus,Plus,RotateCcw,Route,Sparkles,Sprout,Star,X} from 'lucide-react';
import type {Activity} from '@/lib/content';
import type {StudentProgress} from '@/lib/pedagogy';
import {getJourney} from '@/lib/journey';
import {getWorldTheme} from '@/lib/world-themes';
import {clampMapZoom,getMapDimensions,preserveMapCenter,MAX_MAP_ZOOM,MIN_MAP_ZOOM,MAP_ZOOM_STEP} from '@/lib/map-view';
import './map-explorer.css';

type MapExplorerProps = {
  progress: StudentProgress;
  initialWorld?: number;
  onSelectWorld: (worldId:number)=>void;
  onClose: ()=>void;
  onPlay: (activity:Activity)=>void;
  onComputational?: ()=>void;
};
function subscribeFullscreen(listener:()=>void){
  document.addEventListener('fullscreenchange',listener);
  document.addEventListener('fullscreenerror',listener);
  return()=>{document.removeEventListener('fullscreenchange',listener);document.removeEventListener('fullscreenerror',listener);};
}
function motionBehavior():ScrollBehavior {
  return document.documentElement.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
}

export default function MapExplorer({progress,initialWorld,onSelectWorld,onClose,onPlay,onComputational}:MapExplorerProps) {
  const journey=getJourney(progress);
  const [islandId,setIslandId]=useState<number|null>(()=>journey.worlds.some(item=>item.world.id===initialWorld)?initialWorld!:null);
  const [territoryId,setTerritoryId]=useState<string|null>(null);
  const [zoom,setZoom]=useState(1),[viewportWidth,setViewportWidth]=useState(504),[panning,setPanning]=useState(false);
  const shell=useRef<HTMLDivElement>(null);
  const [fullscreenBusy,setFullscreenBusy]=useState(false),[fullscreenNotice,setFullscreenNotice]=useState('');
  const fullscreenPending=useRef(false);
  const fullscreenState=useSyncExternalStore(subscribeFullscreen,()=>!document.fullscreenEnabled?'unavailable':shell.current&&document.fullscreenElement===shell.current?'active':'ready',()=> 'unavailable');
  const dialog=useRef<HTMLDialogElement>(null),content=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null);
  const heading=useRef<HTMLHeadingElement>(null),detailHeading=useRef<HTMLHeadingElement>(null),detail=useRef<HTMLDivElement>(null);
  const lastIsland=useRef<number|null>(initialWorld??null);
  const pan=useRef<{id:number;x:number;y:number;left:number;top:number}|null>(null);
  const titleId=useId(),helpId=useId(),detailId=useId();
  const world=journey.worlds.find(item=>item.world.id===islandId)??journey.worlds[0];
  const theme=getWorldTheme(world.world.id);
  const selectedNode=world.steps.find(node=>node.activity.id===territoryId)??world.steps.find(node=>node.status==='current')??world.steps[0];
  const grown=world.steps.filter(node=>node.status==='completed').length;
  const dimensions=getMapDimensions(viewportWidth,zoom);
  const previousNode=journey.nodes[selectedNode.index-1];
  const mapStyle={'--explorer-accent':theme.accent,'--explorer-soft':theme.soft,'--explorer-sky':theme.sky} as CSSProperties;

  useEffect(()=>{
    const element=dialog.current,fullscreenShell=shell.current;
    if(!element)return;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    if(!element.open)element.showModal();
    return()=>{
      if(fullscreenShell&&document.fullscreenElement===fullscreenShell)void document.exitFullscreen().catch(()=>{});
      if(element.open)element.close();
      document.body.style.overflow=overflow;
      if(previous?.isConnected)previous.focus({preventScroll:true});
    };
  },[]);
  useEffect(()=>{
    const frame=requestAnimationFrame(()=>{
      content.current?.scrollTo({top:0,behavior:'instant'});
      if(islandId===null && lastIsland.current!==null){
        dialog.current?.querySelector<HTMLButtonElement>('[data-map-island="'+lastIsland.current+'"]')?.focus({preventScroll:true});
      }else heading.current?.focus({preventScroll:true});
    });
    return()=>cancelAnimationFrame(frame);
  },[islandId]);
  useEffect(()=>{
    const element=viewport.current;
    if(!element)return;
    const measure=()=>setViewportWidth(element.clientWidth);
    measure();
    const observer=new ResizeObserver(measure);observer.observe(element);
    return()=>observer.disconnect();
  },[islandId]);

  async function toggleFullscreen(){
    const element=shell.current;
    if(!element||fullscreenPending.current)return;
    fullscreenPending.current=true;setFullscreenBusy(true);setFullscreenNotice('');
    try{
      if(document.fullscreenElement===element)await document.exitFullscreen();
      else await element.requestFullscreen({navigationUI:'hide'});
    }catch{
      setFullscreenNotice('Não foi possível ativar a tela cheia. O mapa continua ocupando toda a janela.');
    }finally{fullscreenPending.current=false;setFullscreenBusy(false);}
  }
  function chooseIsland(id:number){
    lastIsland.current=id;setIslandId(id);setTerritoryId(null);setZoom(1);setPanning(false);pan.current=null;
    onSelectWorld(id);
    viewport.current?.scrollTo({left:0,top:0,behavior:'instant'});
  }
  function overview(){setIslandId(null);setTerritoryId(null);setZoom(1);pan.current=null;setPanning(false);}
  function selectTerritory(id:string){
    setTerritoryId(id);
    requestAnimationFrame(()=>{
      detailHeading.current?.focus({preventScroll:true});
      detail.current?.scrollIntoView({block:'nearest',behavior:motionBehavior()});
    });
  }
  function changeZoom(value:number){
    const nextZoom=clampMapZoom(value),element=viewport.current;
    if(!element || nextZoom===zoom)return;
    const nextDimensions=getMapDimensions(element.clientWidth,nextZoom);
    const nextScroll=preserveMapCenter({left:element.scrollLeft,top:element.scrollTop,viewportWidth:element.clientWidth,viewportHeight:element.clientHeight,previousWidth:dimensions.width,previousHeight:dimensions.height,nextWidth:nextDimensions.width,nextHeight:nextDimensions.height});
    setZoom(nextZoom);
    requestAnimationFrame(()=>element.scrollTo({...nextScroll,behavior:'instant'}));
  }
  function startPan(event:PointerEvent<HTMLDivElement>){
    if(event.pointerType!=='mouse'||event.button!==0||(event.target as HTMLElement).closest('button'))return;
    pan.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:event.currentTarget.scrollLeft,top:event.currentTarget.scrollTop};
    event.currentTarget.setPointerCapture(event.pointerId);setPanning(true);
  }
  function movePan(event:PointerEvent<HTMLDivElement>){
    if(!pan.current||pan.current.id!==event.pointerId)return;
    event.currentTarget.scrollLeft=pan.current.left-(event.clientX-pan.current.x);
    event.currentTarget.scrollTop=pan.current.top-(event.clientY-pan.current.y);
  }
  function finishPan(event:PointerEvent<HTMLDivElement>){
    if(pan.current?.id!==event.pointerId)return;
    pan.current=null;setPanning(false);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function playSelected(){
    if(selectedNode.status==='locked')return;
    onClose();onPlay(selectedNode.activity);
  }

  if(typeof document==='undefined')return null;
  return createPortal(<dialog ref={dialog} className="map-explorer" style={mapStyle} aria-labelledby={titleId} aria-describedby={helpId} aria-modal="true"
    onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div ref={shell} className="map-explorer-shell">
      <header className="map-explorer-header">
        <div className="map-explorer-heading"><span><Compass size={15}/> MAPA EM TELA CHEIA</span><h2 id={titleId} ref={heading} tabIndex={-1}>{islandId===null?'Seu arquipélago de aventuras':theme.name}</h2></div>
        <div className="map-explorer-actions">{islandId!==null&&<button type="button" className="map-explorer-back" onClick={overview}><ArrowLeft size={18}/><span>Ver arquipélago</span></button>}{fullscreenState!=='unavailable'&&<button type="button" className="map-explorer-fullscreen" disabled={fullscreenBusy} aria-label={fullscreenState==='active'?'Sair da tela cheia':'Ativar tela cheia'} title={fullscreenState==='active'?'Sair da tela cheia':'Ativar tela cheia'} aria-pressed={fullscreenState==='active'} onClick={()=>void toggleFullscreen()}>{fullscreenState==='active'?<Minimize2 size={20}/>:<Maximize2 size={20}/>}<span>{fullscreenState==='active'?'Sair da tela cheia':'Tela cheia'}</span></button>}<button type="button" className="map-explorer-close" aria-label="Fechar mapa expandido" onClick={onClose}><X size={24}/></button></div>
      </header>
      <div ref={content} className="map-explorer-content">
        {islandId===null?<section className="map-explorer-overview">
          <div className="map-overview-intro"><div><h3>Qual ilha vamos conhecer?</h3><p>Clique em uma ilha para se aproximar, conhecer seus territórios e acompanhar suas descobertas.</p></div><span className="map-overview-count"><Sprout size={21}/><strong>{journey.completed}/{journey.total}</strong> territórios conquistados</span></div>
          <div className="map-overview-sea" role="group" aria-label="Ilhas do arquipélago">
            {journey.worlds.map(({world:item,steps,unlocked,completed})=>{
              const itemTheme=getWorldTheme(item.id),current=journey.next?.activity.worldId===item.id;
              return <button key={item.id} data-map-island={item.id} type="button" className={'map-overview-island map-overview-island-'+item.id+(!unlocked?' is-locked':'')+(current?' is-current':'')+(completed?' is-completed':'')}
                aria-label={'Aproximar e conhecer '+itemTheme.name+(unlocked?'':'. Ilha ainda bloqueada, prévia disponível.')}
                style={{'--island-accent':itemTheme.accent,'--island-soft':itemTheme.soft} as CSSProperties} onClick={()=>chooseIsland(item.id)}>
                <span className="map-overview-art" style={{backgroundImage:`url("${itemTheme.image}")`}}><span className="map-overview-number">{completed?<Check size={20}/>:!unlocked?<Lock size={18}/>:item.id}</span>{current&&<span className="map-overview-tag">Você está aqui</span>}</span>
                <strong>{itemTheme.name}</strong><small>{completed?'Ecossistema completo!':unlocked?steps.filter(node=>node.status==='completed').length+' de 4 descobertas':'Ilha a descobrir'}</small>
                <span className="map-overview-dots" aria-hidden="true">{steps.map(node=><i key={node.activity.id} className={node.status==='completed'?'is-complete':''}/>)}</span>
              </button>;
            })}
          </div>
          <p className="map-overview-tip"><Map size={18}/> Você pode conhecer todas as ilhas. Os desafios abrem conforme suas conquistas.</p>
        </section>:<section className="map-explorer-detail" key={islandId} aria-label={'Exploração de '+theme.name}>
          <div className="map-island-layout">
            <div className="map-island-stage">
              <div className="map-island-toolbar"><span className="map-island-chip"><Flag size={15}/> Ilha {world.world.id} · {grown}/4</span><div className="map-zoom-controls" role="group" aria-label="Aproximação do mapa"><button type="button" aria-label="Afastar mapa" disabled={zoom<=MIN_MAP_ZOOM} onClick={()=>changeZoom(zoom-MAP_ZOOM_STEP)}><Minus size={19}/></button><output aria-live="polite" aria-label="Nível de aproximação">{Math.round(zoom*100)}%</output><button type="button" aria-label="Aproximar mapa" disabled={zoom>=MAX_MAP_ZOOM} onClick={()=>changeZoom(zoom+MAP_ZOOM_STEP)}><Plus size={19}/></button><button type="button" aria-label="Restaurar aproximação inicial" disabled={zoom===1} onClick={()=>changeZoom(1)}><RotateCcw size={18}/></button></div></div>
              <div ref={viewport} className={'map-island-viewport'+(panning?' is-panning':'')} tabIndex={0} role="region" aria-label={'Mapa de '+theme.name+'. Use as setas do teclado ou arraste para percorrer a ilha.'} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={finishPan} onPointerCancel={finishPan} onLostPointerCapture={()=>{pan.current=null;setPanning(false);}}>
                <div className="map-island-canvas" style={{width:dimensions.width,height:dimensions.height,backgroundImage:`url("${theme.image}")`}}>
                  {world.steps.map((node,index)=><button key={node.activity.id} type="button" className={'map-territory is-'+node.status+(selectedNode.activity.id===node.activity.id?' is-selected':'')} style={{left:theme.positions[index][0]+'%',top:theme.positions[index][1]+'%'}} aria-controls={detailId} aria-pressed={selectedNode.activity.id===node.activity.id} aria-label={'Ver detalhes do território '+(node.index+1)+': '+node.title+'. '+(node.status==='locked'?'Ainda bloqueado.':node.status==='completed'?'Conquistado.':'Pronto para explorar.')} onClick={()=>selectTerritory(node.activity.id)}><b>{node.index+1}</b>{node.status==='locked'?<Lock size={15}/>:node.status==='completed'?<Check size={18}/>:<Star size={16}/>}<span className="map-territory-label">{selectedNode.activity.id===node.activity.id?node.title:node.status==='completed'?'Conquistado':node.status==='locked'?'A descobrir':'Explorar'}</span></button>)}
                </div>
              </div>
              <div className="map-island-caption"><Sparkles size={16}/><span>Toque em um ponto da trilha para descobrir mais.</span></div><p className="map-pan-help">Arraste ou deslize a ilha para ver os detalhes. Use + e − para ajustar a aproximação.</p>
            </div>
            <aside className="map-island-details" aria-label="Descobertas desta ilha">
              <span className="map-detail-status">{world.completed?'ECOSSISTEMA COMPLETO':world.unlocked?'SUA EXPEDIÇÃO':'PRÉVIA DA ILHA'}</span><h3>{theme.title}</h3><p>{theme.description}</p>
              <div className="map-detail-progress" role="progressbar" aria-label="Territórios conquistados nesta ilha" aria-valuenow={grown} aria-valuemin={0} aria-valuemax={4}><span style={{width:grown/4*100+'%'}}/></div>
              <div ref={detail} className="map-territory-detail" id={detailId}>
                <span>TERRITÓRIO {selectedNode.index+1} · {selectedNode.status==='locked'?'A DESCOBRIR':selectedNode.status==='completed'?'CONQUISTADO':'PRONTO PARA EXPLORAR'}</span><h4 ref={detailHeading} tabIndex={-1}>{selectedNode.title}</h4><p><strong>{selectedNode.activity.title}</strong></p><p>{selectedNode.activity.description}</p>
                <div className="map-territory-facts"><span><Clock3 size={15}/>{selectedNode.activity.durationMinutes} min</span><span><Sparkles size={15}/>{selectedNode.activity.questions.length} desafios</span><span><Star size={15}/>{selectedNode.activity.xp} XP</span></div>
                <p className="map-territory-unlock">{selectedNode.status==='locked'?<><Lock size={17}/><span>Conquiste {previousNode?.title??'o território anterior'} para abrir este caminho.</span></>:<><Sprout size={17}/><span>{theme.milestones[world.steps.findIndex(node=>node.activity.id===selectedNode.activity.id)]}</span></>}</p>
                <button type="button" className="map-explorer-play" disabled={selectedNode.status==='locked'} onClick={playSelected}>{selectedNode.status==='locked'?<><Lock size={17}/> Caminho ainda fechado</>:<>{selectedNode.status==='completed'?'Explorar novamente':'Começar a aventura'}<ArrowRight size={18}/></>}</button>
              </div>
              <div className="map-ecosystem-details"><h4><Sprout size={17}/>{theme.habitatLabel}</h4><ol>{theme.milestones.map((milestone,index)=><li key={milestone} className={index<grown?'is-complete':''}>{index<grown?<Check size={16}/>:<Sprout size={16}/>}<span>{milestone}</span></li>)}</ol></div>
            </aside>
          </div>
          <nav className="map-island-switcher" aria-label="Visitar outra ilha">{journey.worlds.map(item=>{const itemTheme=getWorldTheme(item.world.id);return <button type="button" key={item.world.id} className={item.world.id===islandId?'is-selected':''} aria-current={item.world.id===islandId?'true':undefined} onClick={()=>chooseIsland(item.world.id)}><span className="mini-image" aria-hidden="true" style={{backgroundImage:`url("${itemTheme.image}")`}}/><span>{itemTheme.shortName}</span>{!item.unlocked&&<Lock size={12}/>}</button>;})}</nav>
        </section>}
      </div>
      <footer className="map-explorer-footer"><p id={helpId}>{islandId===null?'Escolha uma ilha para aproximar.':'Selecione um território para ver os desafios.'} {fullscreenState==='active'?'Use Esc para sair da tela cheia.':'Use Esc para fechar o mapa.'}</p>{fullscreenNotice&&<p className="map-fullscreen-notice" role="status">{fullscreenNotice}</p>}{onComputational&&<button type="button" onClick={()=>{onClose();onComputational();}}><Route size={16}/> Ilha das Ideias<ArrowRight size={15}/></button>}</footer>
    </div>
  </dialog>,document.body);
}