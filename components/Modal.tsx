'use client';
import {useEffect,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';
export default function Modal({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}){
 const box=useRef<HTMLDivElement>(null);
 useEffect(()=>{const prev=document.activeElement as HTMLElement;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';box.current?.focus();const handle=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const items=Array.from(box.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input,select,textarea,a[href],[tabindex="0"]')||[]);if(!items.length)return;const first=items[0],last=items[items.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===box.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};document.addEventListener('keydown',handle);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',handle);prev?.focus();};},[onClose]);
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`modal ${wide?'modal-wide':''}`}><div className="modal-heading"><h2>{title}</h2><button className="icon-btn" aria-label="Fechar" onClick={onClose}><X size={22}/></button></div>{children}</div></div>;
}
