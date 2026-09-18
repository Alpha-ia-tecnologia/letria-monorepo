'use client';
import {useCallback,useEffect,useImperativeHandle,useMemo,useRef,useState,type CSSProperties,type Ref} from 'react';
import {ArrowLeft,ArrowRight,Check,CheckCircle2,Lightbulb,Star,RotateCcw,Flag,CloudOff,Sparkles,Square,CheckSquare2,Link2} from 'lucide-react';
import {activities,type Activity} from '@/lib/content';
import type {Answers,PlatformData,PlatformAction,ApiResult} from '@/lib/types';
import {evaluateAnswer,canStartActivity} from '@/lib/pedagogy';
import {activityRevision,clearGameDraft,isCompatibleDraft,isCompleteAnswer,loadGameDraft,saveGameDraft,progressFromSubmissions,type GameDraft} from '@/lib/client';
import Recorder from './Recorder';
import SpeechButton from './SpeechButton';
import { questionSpeechText } from '@/lib/speech-content';
import LumiTutor from './LumiTutor';
import LumiCharacter from './LumiCharacter';
import ActivityViewport,{ActivityFullscreenButton} from './ActivityViewport';
import {getJourney, WORLD_NAMES} from '@/lib/journey';
import {localTutorReply} from '@/lib/tutor';
import {getActivityTheme} from '@/lib/activity-theme';
import './journey.css';
import './learning-playful.css';
import './question-mechanics.css';
import './game-fullscreen.css';

export type GameNavigation = { requestExit: () => boolean };
export default function Game({activity,data,onAction,onClose,onRefresh,onContinue,navigationRef,onExitCancel,returnLabel}:{activity:Activity;data:PlatformData;onAction:(a:PlatformAction)=>Promise<ApiResult>;onClose:()=>void;onRefresh:()=>void;onContinue:(activity:Activity)=>void;navigationRef?:Ref<GameNavigation>;onExitCancel?:()=>void;returnLabel?:string}){
 const [index,setIndex]=useState(0),[selected,setSelected]=useState<string|string[]>(''),[answers,setAnswers]=useState<Answers>({}),[checked,setChecked]=useState(false),[hint,setHint]=useState(false),[finished,setFinished]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[xp,setXp]=useState(0),[queued,setQueued]=useState(false),[exit,setExit]=useState(false);
 const [draftReady,setDraftReady]=useState(data.session.role!=='student'),[resumed,setResumed]=useState(false),[draftError,setDraftError]=useState('');
 const started=useRef(0),elapsedBefore=useRef(0),submissionId=useRef(''),heading=useRef<HTMLHeadingElement>(null);
 const pendingWrites=useRef<Promise<unknown>>(Promise.resolve()),draftEnabled=useRef(true);
 const [lumiOpen,setLumiOpen]=useState(false),[openedTerritory,setOpenedTerritory]=useState(''),[nextTerritory,setNextTerritory]=useState<Activity|null>(null);
 const closeLumi=useCallback(()=>setLumiOpen(false),[]);
 const question=activity.questions[index],isDiagnostic=activity.id==='diagnostic',isTrailActivity=activities.some(item=>item.id===activity.id);
 const theme=getActivityTheme(activity);
 const gameClass='game-wrap playful-game themed-game world-theme-'+theme.id;
 const themeStyle={'--world-accent':theme.accent,'--world-soft':theme.soft,'--world-sky':theme.sky,'--world-image':`url("${theme.image}")`} as CSSProperties;
 const student=data.students.find(s=>s.id===data.session.studentId)||data.students[0];
 const isPreview=data.session.role!=='student',owner=data.session.userId;
 useImperativeHandle(navigationRef,()=>({requestExit(){if(busy)return false;if(finished||isPreview)onClose();else setExit(true);return true;}}),[busy,finished,isPreview,onClose]);
 const [practice,setPractice]=useState(()=>!isPreview&&!isDiagnostic&&activities.some(item=>item.id===activity.id)&&!canStartActivity(progressFromSubmissions(data.submissions.filter(item=>item.studentId===student?.id)),activity.id));
 const revision=useMemo(()=>activityRevision(activity),[activity]);
 const serializeWrite=useCallback((operation:()=>Promise<unknown>)=>{
   const pending=pendingWrites.current.catch(()=>undefined).then(operation);
   pendingWrites.current=pending;
   return pending;
 },[]);

 useEffect(()=>{
   let cancelled=false;
   if(!started.current)started.current=Date.now();
   if(!submissionId.current)submissionId.current=crypto.randomUUID();
   if(isPreview)return;
   void (async()=>{
     try {
       const draft=await loadGameDraft(owner,activity.id);
       if(cancelled)return;
       if(isCompatibleDraft(draft,owner,activity)){
         setIndex(draft.index);setSelected(draft.selected);setAnswers(draft.answers);
         setChecked(draft.checked);setHint(draft.hint);setPractice(draft.practice);
         submissionId.current=draft.submissionId;elapsedBefore.current=draft.elapsedSeconds;
         started.current=Date.now();setResumed(true);
       } else if(draft) {
         await clearGameDraft(owner,activity.id);
       }
     } catch {
       if(!cancelled)setDraftError('Não foi possível acessar o rascunho neste dispositivo. Você pode continuar jogando.');
     } finally {
       if(!cancelled)setDraftReady(true);
     }
   })();
   return()=>{cancelled=true;};
 },[activity,owner,isPreview]);

 const makeDraft=useCallback(():GameDraft=>({
   schemaVersion:1,owner,activityId:activity.id,revision,index,answers,selected,checked,hint,practice,
   submissionId:submissionId.current,
   elapsedSeconds:elapsedBefore.current+Math.max(0,(Date.now()-started.current)/1000),
   updatedAt:new Date().toISOString(),
 }),[owner,activity.id,revision,index,answers,selected,checked,hint,practice]);

 useEffect(()=>{
   if(!draftReady||isPreview||!draftEnabled.current)return;
   const draft=makeDraft();
   void serializeWrite(()=>saveGameDraft(draft)).then(()=>setDraftError('')).catch(()=>{
     setDraftError('Não conseguimos guardar a última mudança neste dispositivo. Continue a atividade para registrar seu resultado.');
   });
 },[draftReady,isPreview,makeDraft,serializeWrite]);

 useEffect(()=>{
   if(!draftReady||isPreview)return;
   const saveWhenHidden=()=>{
     if(document.visibilityState==='hidden'&&draftEnabled.current){
       const draft=makeDraft();
       void serializeWrite(()=>saveGameDraft(draft)).catch(()=>undefined);
     }
   };
   document.addEventListener('visibilitychange',saveWhenHidden);
   return()=>document.removeEventListener('visibilitychange',saveWhenHidden);
 },[draftReady,isPreview,makeDraft,serializeWrite]);

 useEffect(()=>{if(draftReady)heading.current?.focus();},[index,draftReady]);
 const correct=checked&&evaluateAnswer(question,selected);
 const allCorrect=activity.questions.filter(q=>evaluateAnswer(q,answers[q.id])).length;
 const answerReady=isCompleteAnswer(question,selected);
 function choose(option:string){
   if(checked||!draftReady)return;
   if(question.type==='order')setSelected(prev=>[...(Array.isArray(prev)?prev:[]),option]);
   else if(question.type==='multi')setSelected(prev=>{const items=Array.isArray(prev)?prev:[];return items.includes(option)?items.filter(item=>item!==option):[...items,option];});
   else setSelected(option);
 }
 function pair(optionIndex:number,value:string){
   if(checked||!draftReady)return;
   setSelected(prev=>question.options.map((_,i)=>i===optionIndex?value:Array.isArray(prev)?prev[i]??'':''));
 }
 function check(){if(!answerReady||checked||!draftReady)return;setAnswers(prev=>({...prev,[question.id]:selected}));setChecked(true);}
 async function finish(){
   setBusy(true);setError('');
   try{
     if(!isPreview){
       // Persist the id before networking so a reload/retry remains idempotent.
       await serializeWrite(()=>saveGameDraft(makeDraft())).catch(()=>undefined);
       const result=await onAction({
         action:isDiagnostic?'diagnostic':'submit',submissionId:submissionId.current,activityId:activity.id,
         activityVersion:(activity as Activity&{version?:number}).version??1,answers,practice,
         durationSeconds:Math.min(7200,Math.max(1,Math.round(elapsedBefore.current+(Date.now()-started.current)/1000))),
       } as PlatformAction);
       if(result.data&&!isDiagnostic){
         const before=getJourney(progressFromSubmissions(data.submissions.filter(item=>item.studentId===student?.id)));
         const after=getJourney(progressFromSubmissions(result.data.submissions.filter(item=>item.studentId===student?.id)));
         if(after.completed>before.completed){setOpenedTerritory(after.next?(after.next.activity.worldId!==activity.worldId?'Novo mundo: '+WORLD_NAMES[after.next.activity.worldId-1]:after.next.title):'Você conquistou todos os territórios!');setNextTerritory(after.next?.activity||null);}
       }
       setXp(result.submission?.xpEarned||0);setQueued(result.code==='OFFLINE_QUEUED');
       draftEnabled.current=false;
       await serializeWrite(()=>clearGameDraft(owner,activity.id)).catch(()=>undefined);
     }
     setFinished(true);
   }catch(e){setError(e instanceof Error?e.message:'Não conseguimos salvar. Seu resultado continua aqui.');}
   finally{setBusy(false);}
 }
 async function pause(){
   if(isPreview){onClose();return;}
   setBusy(true);
   try{
     await serializeWrite(()=>saveGameDraft(makeDraft()));
     onClose();
   }catch{
     setDraftError('O navegador não conseguiu salvar o rascunho. Ao sair, esta tentativa pode ser perdida.');
     setError('Não foi possível salvar a pausa. Você pode continuar ou sair sem salvar.');
   }finally{setBusy(false);}
 }
 function next(){if(index===activity.questions.length-1){void finish();return;}setIndex(i=>i+1);setSelected('');setChecked(false);setHint(false);}

 if(!draftReady)return <ActivityViewport className={gameClass} style={themeStyle} aria-label={activity.title}><div className="game-view-controls"><ActivityFullscreenButton/></div><div className="question-card" role="status"><p>Preparando sua aventura e buscando onde você parou…</p></div></ActivityViewport>;
 if(finished)return <ActivityViewport className={gameClass} style={themeStyle} aria-label={activity.title}><div className="game-view-controls"><ActivityFullscreenButton/></div><div className="result-card"><div className="result-mascot"><LumiCharacter/></div><div className="result-stars" aria-hidden="true"><Star/><Star/><Star/></div><span className="eyebrow">CADA DESCOBERTA CONTA</span><h1>{isDiagnostic?'Conhecemos um pouco mais de você!':'Mais um passo na sua aventura!'}</h1><p>{isPreview?'Esta foi uma prévia. Nenhum resultado de estudante foi alterado.':allCorrect===activity.questions.length?'Você encontrou todas as respostas. Que descoberta incrível!':'Você praticou, descobriu e aprendeu. Vamos continuar crescendo!'}</p><div className="result-metrics"><div><CheckCircle2/><strong>{allCorrect}/{activity.questions.length}</strong><span>descobertas</span></div><div><Star/><strong>+{xp}</strong><span>experiência</span></div><div><Flag/><strong>1</strong><span>aventura vivida</span></div></div>{queued&&<p className="offline-message"><CloudOff size={17}/> Resultado salvo neste dispositivo. Ele será enviado quando a conexão voltar.</p>}{openedTerritory&&!queued&&<div className="unlock-celebration" role="status"><span className="unlock-badge"><Sparkles size={15}/> CAMINHO DESBLOQUEADO</span><h2>{openedTerritory}</h2><p>{theme.gameReward} Seu arquipélago acaba de ganhar um novo horizonte.</p>{nextTerritory&&<button className="btn btn-primary" onClick={()=>onContinue(nextTerritory)}>Seguir pela trilha <ArrowRight size={17}/></button>}</div>}{isTrailActivity&&!isPreview&&!queued&&!openedTerritory&&allCorrect/activity.questions.length<.8&&<p className="info-box">Falta um pouquinho para conquistar este território. Acerte pelo menos 4 de 5 desafios em uma tentativa. Volte à trilha para tentar novamente com a Lumi!</p>}{isDiagnostic&&<p className="info-box">Este é um ponto de partida. Seu professor poderá revisar as evidências e orientar os próximos passos.</p>}{student&&activity.worldId>=4&&!isPreview&&<Recorder studentId={student.id} activityId={activity.id} consent={student.consentAudio} onSaved={onRefresh}/>}<button className="btn btn-primary btn-large" onClick={onClose}>{returnLabel||(isPreview?'Voltar ao banco de atividades':isTrailActivity||isDiagnostic?'Voltar à trilha':'Voltar às atividades')} <ArrowRight size={18}/></button></div></ActivityViewport>;

 return <ActivityViewport className={gameClass} style={themeStyle} aria-label={activity.title}>
   <div className="game-top"><button className="icon-btn" disabled={busy} onClick={()=>setExit(true)} aria-label="Pausar atividade"><ArrowLeft/></button><div className="game-progress-pill"><div className="game-progress" role="progressbar" aria-label="Desafios concluídos" aria-valuemin={0} aria-valuemax={activity.questions.length} aria-valuenow={index}><div style={{width:`${index/activity.questions.length*100}%`}}/></div><span>{index+1}/{activity.questions.length}</span></div><span className="badge"><Star size={14}/> {activity.xp} XP</span><ActivityFullscreenButton/></div>
   {!isDiagnostic&&<section className="game-environment" aria-label={'Expedição em '+theme.name}><div className="game-environment-art" aria-hidden="true"/><div><span>{theme.missionLabel}</span><h2>{theme.name}</h2><p>{theme.gameIntro}</p></div><SpeechButton text={theme.gameIntro} enabled={data.settings.sound} label="Ouvir a expedição" className="icon-btn" iconOnly/></section>}
   {isPreview&&<p className="preview-strip">PRÉVIA DO PROFESSOR · As respostas não entram nos relatórios.</p>}
   {practice&&!isPreview&&<p className="preview-strip">PRÁTICA LIVRE · Explore esta habilidade no seu ritmo. A trilha continua seguindo suas descobertas em cada mundo.</p>}
   {resumed&&!isPreview&&<p className="info-box" role="status">Sua aventura continua de onde você parou. Vamos nessa!</p>}
   {draftError&&<p className="form-error" role="status">{draftError}</p>}
   <div className="game-scene" aria-hidden="true"><span className="game-cloud game-cloud-one"/><span className="game-cloud game-cloud-two"/><LumiCharacter/><span className="game-scene-greeting">{isDiagnostic?'Vamos descobrir!':theme.shortName+' em aventura!'}</span></div>
   <div className="question-card">
    <div className="question-content">
     <span className="eyebrow">{isDiagnostic?'VAMOS NOS CONHECER':activity.title}</span>
     <div className="question-heading"><h1 ref={heading} tabIndex={-1}>{question.prompt}</h1><SpeechButton key={question.id} text={questionSpeechText(question)} enabled={data.settings.sound} label="Ouvir instrução" className="icon-btn speak-btn" iconOnly/></div>
     {question.stimulus&&<div className={`question-stimulus ${question.stimulus.length>50?'reading-text':''}`}>{question.stimulus}</div>}
     {question.visual&&<div className="question-visual">{question.visual}</div>}
    </div>
    <div className="question-response">
     {question.type==='order'&&<div className="answer-slots" aria-label="Sua resposta">{Array.isArray(selected)&&selected.length?selected.map((word,i)=><button key={`${word}-${i}`} disabled={checked} onClick={()=>setSelected((selected as string[]).filter((_,j)=>j!==i))}>{word}</button>):<span>Toque nas partes na ordem certa</span>}</div>}
     {question.type==='multi'&&<p className="mechanic-instruction" id="multi-instruction"><CheckSquare2 size={19}/> Pode escolher mais de uma opção. Toque de novo para desmarcar.</p>}
     {question.type==='match'?<div className="pair-challenge" role="group" aria-label="Formar pares" aria-describedby="pair-instruction">
       <p className="mechanic-instruction" id="pair-instruction"><Link2 size={19}/> Escolha um par para cada cartão. Use cada opção uma vez.</p>
       {question.options.map((option,i)=>{
         const value=Array.isArray(selected)?selected[i]??'':'';
         return <div key={option} className={'pair-row '+(value?'paired':'')+' '+(checked?(correct?'pair-correct':'pair-review'):'')}>
           <label className="pair-label" htmlFor={'pair-'+question.id+'-'+i}><span aria-hidden="true">{i+1}</span>{option}</label>
           <ArrowRight className="pair-arrow" size={22} aria-hidden="true"/>
           <select id={'pair-'+question.id+'-'+i} value={value} disabled={checked} onChange={event=>pair(i,event.target.value)}>
             <option value="">Escolha o par…</option>
             {(question.matches??[]).map(match=>{
               const used=Array.isArray(selected)&&selected.some((item,j)=>j!==i&&item===match);
               return <option key={match} value={match} disabled={used}>{match}{used?' (já usado)':''}</option>;
             })}
           </select>
         </div>;
       })}
       <p className="mechanic-progress" role="status">{Array.isArray(selected)?selected.filter(Boolean).length:0} de {question.options.length} pares formados</p>
     </div>:<div className={'answer-options '+(question.type==='order'?'order-options':question.type==='multi'?'multi-options':'')} role="group" aria-label="Opções de resposta" aria-describedby={question.type==='multi'?'multi-instruction':undefined}>
       {question.options.map((option,i)=>{
         const consumed=question.type==='order'&&Array.isArray(selected)?selected.filter(word=>word===option).length:0;
         const occurrence=question.options.slice(0,i+1).filter(word=>word===option).length;
         const picked=question.type==='choice'?selected===option:question.type==='multi'?Array.isArray(selected)&&selected.includes(option):consumed>=occurrence;
         return <button key={option+'-'+i} disabled={checked||(question.type==='order'&&picked)} aria-pressed={picked} className={'answer-option '+(picked?'selected':'')+' '+(checked&&picked?(correct?'correct':'try-again'):'')} onClick={()=>choose(option)}>{question.type==='choice'&&<span className="option-letter">{String.fromCharCode(65+i)}</span>}{question.type==='multi'&&<span className="multi-marker" aria-hidden="true">{picked?<CheckSquare2 size={25}/>:<Square size={25}/>}</span>}<span className="answer-text">{option}</span>{picked&&question.type==='choice'&&<span className="answer-indicator">{checked&&!correct?<Sparkles size={20}/>:<Check size={20}/>}<span className="sr-only">{checked?(correct?'Resposta correta':'Vamos aprender com esta resposta'):'Sua escolha'}</span></span>}</button>;
       })}
     </div>}
     {question.type==='multi'&&<p className="mechanic-progress" role="status">{Array.isArray(selected)?selected.length:0} opções selecionadas</p>}
     <div className="question-tools"><button className="text-btn" onClick={()=>setHint(!hint)}><Lightbulb size={17}/> Preciso de uma pista</button>{question.type!=='choice'&&!checked&&<button className="text-btn" onClick={()=>setSelected([])}><RotateCcw size={15}/> Recomeçar</button>}</div>
     {hint&&<p className="hint-box"><Lightbulb size={18}/> {localTutorReply("Me dê uma pista",{activity,question})}</p>}
     <button className="game-lumi-hint" onClick={()=>setLumiOpen(true)}><LumiCharacter small/><div><strong>Vamos descobrir juntos?</strong><p>Pergunte à Lumi sobre este desafio <Sparkles size={12}/></p></div></button>
     {checked&&<div className={`feedback ${correct?'feedback-correct':'feedback-learn'}`} role="status"><div>{correct?<CheckCircle2 size={26}/>:<Sparkles size={26}/>}<strong>{correct?'Isso mesmo! Você descobriu!':'Vamos aprender juntos!'}</strong></div><p>{question.explanation}</p></div>}
     {error&&<p role="alert" className="form-error">{error}</p>}
     <div className="game-footer"><span>Sem pressa. Você aprende no seu ritmo.</span><button className="btn btn-primary" disabled={busy||(!checked&&!answerReady)} onClick={checked?next:check}>{busy?'Salvando…':checked?(index===activity.questions.length-1?'Concluir aventura':'Continuar'):'Conferir resposta'} <ArrowRight size={17}/></button></div>
    </div>
   </div>
   <LumiTutor key={question.id} activity={activity} question={question} sound={data.settings.sound} reducedMotion={data.settings.reducedMotion} allowMicrophone={data.session.role!=='student'||Boolean(student?.consentAudio)} open={lumiOpen} onOpen={()=>setLumiOpen(true)} onClose={closeLumi}/>
   {exit&&<div className="modal-backdrop"><div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="exit-title"><h2 id="exit-title">Fazer uma pausa?</h2><p>{isPreview?'Você pode voltar à prévia quando quiser.':draftError?'O salvamento neste dispositivo está indisponível. Continue a missão ou saia sem salvar.':`Salve suas ${Object.keys(answers).length} respostas neste dispositivo. Ao abrir esta atividade com a mesma conta, você continua daqui.`}</p><div className="button-row"><button className="btn btn-secondary" disabled={busy} onClick={draftError?onClose:()=>void pause()}>{busy?'Salvando…':isPreview?'Sair da prévia':draftError?'Sair sem salvar':'Salvar e sair'}</button><button autoFocus className="btn btn-primary" disabled={busy} onClick={()=>{setExit(false);onExitCancel?.();}}>Continuar aprendendo</button></div></div></div>}
 </ActivityViewport>;
}
