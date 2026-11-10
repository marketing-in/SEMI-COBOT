import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {X,ArrowLeft,ArrowRight,Play,Pause,Check,ListChecks,Sparkles,Gauge,Upload,Table2,TriangleAlert,IndianRupee,Cpu,Trophy,Store,ClipboardList,CircuitBoard,SlidersHorizontal,Receipt,Calculator,FileText,CheckCircle2} from 'lucide-react';
import {useSpotlight} from './Tour.jsx';
import {BOM_STEPS} from './bomDemo.js';

// The BOM demo: a guided walk through the BOM tool on a ready-priced demo BOM (bomDemo.js). The page
// is dimmed with the feature in a spotlight, a side list shows every step with the current one marked,
// and each card has a picture of what it explains. The steps are in bomDemo.js; act() puts the tool in
// the state a step needs (a workflow step, an open part, the purchase list filled). Play advances on its own.
const ICONS={Sparkles,Gauge,Upload,Table2,TriangleAlert,IndianRupee,Cpu,Trophy,Store,ClipboardList,CircuitBoard,SlidersHorizontal,Receipt,Calculator,FileText,CheckCircle2};
const DWELL=7000;

export default function BomTour({actions,onEnd}){
 const [i,setI]=useState(0),[playing,setPlaying]=useState(false),[listOpen,setListOpen]=useState(false);const card=useRef(null);
 const step=BOM_STEPS[i],last=i===BOM_STEPS.length-1,box=useSpotlight(step.target);
 // The card's real height, so it is always placed fully on screen.
 const [ch,setCh]=useState(300);useLayoutEffect(()=>{const h=card.current?.offsetHeight;if(h&&Math.abs(h-ch)>2)setCh(h)});
 const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 const go=n=>setI(Math.max(0,Math.min(BOM_STEPS.length-1,n)));
 // The tool shows what a step needs: the nearest step at or before it that sets the state (a workflow
 // step, an open part, the filled purchase list), so jumping back or ahead in the list lands right.
 useEffect(()=>{[...BOM_STEPS.slice(0,i+1)].reverse().find(x=>x.act)?.act(actions)},[i]);// eslint-disable-line react-hooks/exhaustive-deps
 // Bring the feature into view once it is on the page.
 useEffect(()=>{if(!step.target)return;let tries=0,t=0;const look=()=>{const el=document.querySelector(`[data-tour="${step.target}"]`);if(el){el.scrollIntoView({block:'center',behavior:reduced?'auto':'smooth'});return}if(++tries<40)t=setTimeout(look,50)};look();return()=>clearTimeout(t)},[i]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(!playing)return;if(last){setPlaying(false);return}const t=setTimeout(()=>go(i+1),DWELL);return()=>clearTimeout(t)},[playing,i]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{card.current?.focus({preventScroll:true});const key=e=>{if(e.key==='Escape')onEnd();else if(e.key==='ArrowRight')go(i+1);else if(e.key==='ArrowLeft')go(i-1);else if(e.key===' '&&e.target===card.current){e.preventDefault();setPlaying(p=>!p)}};
  addEventListener('keydown',key);return()=>removeEventListener('keydown',key)},[i]);// eslint-disable-line react-hooks/exhaustive-deps
 // Card beside the spotlight when there is room (clear of the step list), else at the bottom.
 const pad=8,W=innerWidth,H=innerHeight,side=W>=1100,listW=side?264:0,cw=Math.min(360,W-32);let pos={left:Math.max(listW+24,(W-cw)/2),bottom:16};
 if(!side)pos={left:(W-cw)/2,bottom:16};
 else if(box){const maxTop=Math.max(16,H-ch-16),top=Math.min(maxTop,Math.max(16,box.y)),right=box.x+box.w+18;
  pos=right+cw<W-16?{left:right,top}:box.x-cw-18>listW+24?{left:box.x-cw-18,top}:{left:Math.max(listW+24,Math.min(W-cw-16,box.x)),top:box.y+box.h+16+ch<H-16?box.y+box.h+16:Math.min(maxTop,Math.max(16,box.y-ch-16))}}
 const chapters=[...new Set(BOM_STEPS.map(s=>s.ch))];
 const list=<ol className="bt-list">{chapters.map(ch=><li key={ch}><span className="bt-ch">{ch}</span><ol>{BOM_STEPS.map((s,k)=>s.ch!==ch?null:<li key={k}>
  <button type="button" className={k===i?'on':k<i?'done':''} aria-current={k===i?'step':undefined} onClick={()=>{go(k);setListOpen(false)}}><span className="bt-mark" aria-hidden="true">{k<i?<Check size={11}/>:k+1}</span>{s.title}</button></li>)}</ol></li>)}</ol>;
 const Icon=ICONS[step.icon]||Sparkles;
 return <div className="tour bom-tour" role="presentation">
  <svg className="tour-shade" width={W} height={H} aria-hidden="true"><defs><mask id="bt-hole"><rect width={W} height={H} fill="white"/>{box&&<rect x={box.x-pad} y={box.y-pad} width={box.w+pad*2} height={box.h+pad*2} rx="8" fill="black"/>}</mask></defs><rect width={W} height={H} mask="url(#bt-hole)"/></svg>
  {box&&<div className="tour-ring bt-ring" style={{left:box.x-pad,top:box.y-pad,width:box.w+pad*2,height:box.h+pad*2}} aria-hidden="true"/>}
  {side&&<nav className="bt-panel" aria-label="Demo steps"><div className="bt-panel-head"><span className="bt-badge">Demo</span><strong>BOM tool tour</strong></div>{list}</nav>}
  <div ref={card} className="tour-card bt-card" role="dialog" aria-modal="true" aria-labelledby="bt-title" aria-describedby="bt-text" tabIndex={-1} style={{width:cw,...pos}}>
   <div className="bt-art" aria-hidden="true"><span className="bt-icon"><Icon size={26} strokeWidth={1.6}/></span><span className="bt-art-lines"><i/><i/><i/></span></div>
   <div className="tour-head"><span className="tour-count">{step.ch} · {i+1} of {BOM_STEPS.length}</span><button className="icon-button" aria-label="End the demo" onClick={onEnd}><X size={16}/></button></div>
   <h2 id="bt-title">{step.title}</h2><p id="bt-text">{step.text}</p>
   <div className="bt-progress" aria-hidden="true"><i style={{width:`${(i+1)/BOM_STEPS.length*100}%`}}/>{playing&&!last&&<b key={i} style={{animationDuration:DWELL+'ms'}}/>}</div>
   {!side&&<><button type="button" className="text-button bt-list-toggle" aria-expanded={listOpen} onClick={()=>setListOpen(o=>!o)}><ListChecks size={14}/>Steps</button>{listOpen&&<nav aria-label="Demo steps" className="bt-list-pop">{list}</nav>}</>}
   <div className="tour-actions">{i>0?<button className="button small" onClick={()=>go(i-1)}><ArrowLeft size={14}/>Back</button>:<button className="text-button" onClick={onEnd}>End demo</button>}
    <span className="bt-actions-right">{!last&&<button className="icon-button" aria-label={playing?'Pause the demo':'Play the demo'} aria-pressed={playing} onClick={()=>setPlaying(p=>!p)}>{playing?<Pause size={15}/>:<Play size={15}/>}</button>}
     <button className="button small primary" onClick={()=>last?onEnd():go(i+1)}>{last?'Finish':'Next'}{!last&&<ArrowRight size={14}/>}</button></span></div>
  </div>
 </div>;
}
