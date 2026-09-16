'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,CheckCircle2,Volume2,Lightbulb,Star,RotateCcw,Flag,CloudOff,Sparkles} from 'lucide-react';
import {activities,type Activity} from '@/lib/content';
import type {Answers,PlatformData,PlatformAction,ApiResult} from '@/lib/types';
import {evaluateAnswer,getWorldStatus} from '@/lib/pedagogy';
import {activityRevision,clearGameDraft,isCompatibleDraft,loadGameDraft,saveGameDraft,progressFromSubmissions,speak,type GameDraft} from '@/lib/client';
import Recorder from './Recorder';

export default function Game({activity,data,onAction,onClose,onRefresh}:{activity:Activity;data:PlatformData;onAction:(a:PlatformAction)=>Promise<ApiResult>;onClose:()=>void;onRefresh:()=>void}){
 const [index,setIndex]=useState(0),[selected,setSelected]=useState<string|string[]>(''),[answers,setAnswers]=useState<Answers>({}),[checked,setChecked]=useState(false),[hint,setHint]=useState(false),[finished,setFinished]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[xp,setXp]=useState(0),[queued,setQueued]=useState(false),[exit,setExit]=useState(false);
 const [draftReady,setDraftReady]=useState(data.session.role!=='student'),[resumed,setResumed]=useState(false),[draftError,setDraftError]=useState('');
 const started=useRef(0),elapsedBefore=useRef(0),submissionId=useRef(''),heading=useRef<HTMLHeadingElement>(null);
 const pendingWrites=useRef<Promise<unknown>>(Promise.resolve()),draftEnabled=useRef(true);
 const question=activity.questions[index],isDiagnostic=activity.id==='diagnostic';
 const student=data.students.find(s=>s.id===data.session.studentId)||data.students[0];
 const isPreview=data.session.role!=='student',owner=data.session.userId;
 const [practice,setPractice]=useState(()=>!isPreview&&!isDiagnostic&&activities.some(item=>item.id===activity.id)&&!getWorldStatus(progressFromSubmissions(data.submissions.filter(item=>item.studentId===student?.id)),activity.worldId).unlocked);
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

 useEffect(()=>{if(draftReady)heading.current?.focus();return()=>{if('speechSynthesis' in window)window.speechSynthesis.cancel();};},[index,draftReady]);
 const correct=checked&&evaluateAnswer(question,selected);
 const allCorrect=activity.questions.filter(q=>evaluateAnswer(q,answers[q.id])).length;
 function choose(option:string){if(checked||!draftReady)return;if(question.type==='order')setSelected(prev=>[...(Array.isArray(prev)?prev:[]),option]);else setSelected(option);}
 function check(){setAnswers(prev=>({...prev,[question.id]:selected}));setChecked(true);}
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
 function say(){if(!speak(question.audioText||`${question.prompt}. ${question.stimulus||''}`,data.settings.sound))setError('Ative o som nas preferências. A narração precisa de um navegador com síntese de voz.');}

 if(!draftReady)return <div className="game-wrap"><div className="question-card" role="status"><p>Preparando sua aventura e buscando onde você parou…</p></div></div>;
 if(finished)return <div className="game-wrap"><div className="result-card"><div className="result-stars"><Star/><Star/><Star/></div><span className="eyebrow">CADA DESCOBERTA CONTA</span><h1>{isDiagnostic?'Conhecemos um pouco mais de você!':'Mais um passo na sua aventura!'}</h1><p>{isPreview?'Esta foi uma prévia. Nenhum resultado de estudante foi alterado.':allCorrect===activity.questions.length?'Você encontrou todas as respostas. Que descoberta incrível!':'Você praticou, descobriu e aprendeu. Vamos continuar crescendo!'}</p><div className="result-metrics"><div><CheckCircle2/><strong>{allCorrect}/{activity.questions.length}</strong><span>descobertas</span></div><div><Star/><strong>+{xp}</strong><span>experiência</span></div><div><Flag/><strong>1</strong><span>aventura vivida</span></div></div>{queued&&<p className="offline-message"><CloudOff size={17}/> Resultado salvo neste dispositivo. Ele será enviado quando a conexão voltar.</p>}{isDiagnostic&&<p className="info-box">Este é um ponto de partida. Seu professor poderá revisar as evidências e orientar os próximos passos.</p>}{student&&activity.worldId>=4&&!isPreview&&<Recorder studentId={student.id} activityId={activity.id} consent={student.consentAudio} onSaved={onRefresh}/>}<button className="btn btn-primary btn-large" onClick={onClose}>Voltar à aventura <ArrowRight size={18}/></button></div></div>;

 return <div className="game-wrap">
   <div className="game-top"><button className="icon-btn" disabled={busy} onClick={()=>setExit(true)} aria-label="Pausar atividade"><ArrowLeft/></button><div className="game-progress"><div style={{width:`${index/activity.questions.length*100}%`}}/></div><span>{index+1} de {activity.questions.length}</span><span className="badge"><Star size={14}/> {activity.xp} XP</span></div>
   {isPreview&&<p className="preview-strip">PRÉVIA DO PROFESSOR · As respostas não entram nos relatórios.</p>}
   {practice&&!isPreview&&<p className="preview-strip">PRÁTICA LIVRE · Explore esta habilidade no seu ritmo. A trilha continua seguindo suas descobertas em cada mundo.</p>}
   {resumed&&!isPreview&&<p className="info-box" role="status">Sua aventura continua de onde você parou. Vamos nessa!</p>}
   {draftError&&<p className="form-error" role="status">{draftError}</p>}
   <div className="question-card">
     <span className="eyebrow">{isDiagnostic?'VAMOS NOS CONHECER':activity.title}</span>
     <div className="question-heading"><h1 ref={heading} tabIndex={-1}>{question.prompt}</h1><button className="icon-btn speak-btn" onClick={say} aria-label="Ouvir instrução"><Volume2/></button></div>
     {question.stimulus&&<div className={`question-stimulus ${question.stimulus.length>50?'reading-text':''}`}>{question.stimulus}</div>}
     {question.visual&&<div className="question-visual">{question.visual}</div>}
     {question.type==='order'&&<div className="answer-slots" aria-label="Sua resposta">{Array.isArray(selected)&&selected.length?selected.map((word,i)=><button key={`${word}-${i}`} disabled={checked} onClick={()=>setSelected((selected as string[]).filter((_,j)=>j!==i))}>{word}</button>):<span>Toque nas partes na ordem certa</span>}</div>}
     <div className={`answer-options ${question.type==='order'?'order-options':''}`} role="group" aria-label="Opções de resposta">
       {question.options.map((option,i)=>{
         const consumed=question.type==='order'&&Array.isArray(selected)?selected.filter(word=>word===option).length:0;
         const occurrence=question.options.slice(0,i+1).filter(word=>word===option).length;
         const picked=question.type==='choice'?selected===option:consumed>=occurrence;
         return <button key={`${option}-${i}`} disabled={checked||(question.type==='order'&&picked)} aria-pressed={picked} className={`answer-option ${picked?'selected':''} ${checked&&picked?(correct?'correct':'try-again'):''}`} onClick={()=>choose(option)}>{question.type==='choice'&&<span className="option-letter">{String.fromCharCode(65+i)}</span>}<span>{option}</span>{picked&&question.type==='choice'&&<Check size={20}/>}</button>;
       })}
     </div>
     <div className="question-tools"><button className="text-btn" onClick={()=>setHint(!hint)}><Lightbulb size={17}/> Preciso de uma pista</button>{question.type==='order'&&!checked&&<button className="text-btn" onClick={()=>setSelected([])}><RotateCcw size={15}/> Recomeçar</button>}</div>
     {hint&&<p className="hint-box"><Lightbulb size={18}/> {question.explanation}</p>}
     {checked&&<div className={`feedback ${correct?'feedback-correct':'feedback-learn'}`} role="status"><div>{correct?<CheckCircle2 size={26}/>:<Sparkles size={26}/>}<strong>{correct?'Isso mesmo! Você descobriu!':'Vamos aprender juntos!'}</strong></div><p>{question.explanation}</p></div>}
     {error&&<p role="alert" className="form-error">{error}</p>}
     <div className="game-footer"><span>Sem pressa. Você aprende no seu ritmo.</span><button className="btn btn-primary" disabled={busy||(!checked&&(Array.isArray(selected)?selected.length!==question.options.length:!selected))} onClick={checked?next:check}>{busy?'Salvando…':checked?(index===activity.questions.length-1?'Concluir aventura':'Continuar'):'Conferir resposta'} <ArrowRight size={17}/></button></div>
   </div>
   {exit&&<div className="modal-backdrop"><div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="exit-title"><h2 id="exit-title">Fazer uma pausa?</h2><p>{isPreview?'Você pode voltar à prévia quando quiser.':draftError?'O salvamento neste dispositivo está indisponível. Continue a missão ou saia sem salvar.':`Salve suas ${Object.keys(answers).length} respostas neste dispositivo. Ao abrir esta atividade com a mesma conta, você continua daqui.`}</p><div className="button-row"><button className="btn btn-secondary" disabled={busy} onClick={draftError?onClose:()=>void pause()}>{busy?'Salvando…':isPreview?'Sair da prévia':draftError?'Sair sem salvar':'Salvar e sair'}</button><button autoFocus className="btn btn-primary" disabled={busy} onClick={()=>setExit(false)}>Continuar aprendendo</button></div></div></div>}
 </div>;
}
