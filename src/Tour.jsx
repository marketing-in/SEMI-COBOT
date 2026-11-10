import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {X,ArrowLeft,ArrowRight} from 'lucide-react';

// Product tour for first-time users: one card per main feature, anchored to the element it
// explains (found by its data-tour name) with the rest of the page dimmed. Opens each page as the
// tour reaches it. Esc or Skip ends it; arrow keys step through.
export const TOUR_KEY='semicobot-tour-v1';
// The BOM demo tour (BomTour.jsx) is asked for with a flag the BOM tool reads when it opens, plus an
// event for when it is already open.
export const BOM_DEMO='semicobot-bom-demo';
export function requestBomDemo(navigate){try{sessionStorage.setItem(BOM_DEMO,'1')}catch{}navigate('BOM tool');setTimeout(()=>dispatchEvent(new Event(BOM_DEMO)),0)}

// The on-screen box of the first visible element with this data-tour name, followed every frame (it
// may appear after the page renders, or move on resize and scroll).
export function useSpotlight(target){
 const [box,setBox]=useState(null);
 useLayoutEffect(()=>{if(!target){setBox(null);return}let raf=0;const find=()=>{const el=[...document.querySelectorAll(`[data-tour="${target}"]`)].find(e=>e.getClientRects().length);const r=el?.getBoundingClientRect();
   setBox(b=>{const n=r&&r.width?{x:r.left,y:r.top,w:r.width,h:r.height}:null;return JSON.stringify(n)===JSON.stringify(b)?b:n});raf=requestAnimationFrame(find)};find();return()=>cancelAnimationFrame(raf)},[target]);
 return box}
export const STEPS=[
 {page:'Overview',target:'nav-Overview',title:'Overview',text:'Your stock value, parts that need attention and boards moving through production, from your own records.'},
 {page:'BOM tool',target:'nav-BOM tool',title:'BOM tool',text:'Load a board or a BOM file, get live prices and stock from DigiKey and Mouser, set a margin per line, add the bare PCB and shipping, and download the quotation as a PDF.',demo:true},
 {page:'BOM tool',target:'currency',title:'INR or USD',text:'Switch every price on the site between rupees and dollars. The rate is fetched live and shown under the BOM.'},
 {page:'Inventory',target:'nav-Inventory',title:'Inventory',text:'Own stock lists every component with its quantity and value. Production follows boards from the line to completed, ready for dispatch and dispatched.'},
 {page:'Board studio',target:'nav-Board studio',title:'Board studio',text:'Import Gerber, KiCad, pick-and-place or a PDF. Hover a part to name it, view the board in 3D and run it through the SMT line.'},
 {page:'Part master',target:'nav-Part master',title:'Part master',text:'The company databank: every part from the part master, inventory and boards, with specs, look-ups and Excel export. Every other page looks parts up here.'},
 {page:'Production',target:'nav-Production',title:'Production',text:'Every job runs incoming check, QA, kitting, storing, SMT, PCBA, THT, wave soldering, QA, assembly, testing and final product. See which lines are free and book new requests.'},
 {page:'Vendors',target:'nav-Vendors',title:'Vendors',text:'Semiconductor makers, distributors, PCB fabricators, enclosure and mould makers, test labs and logistics in one list. The BOM tool picks its vendors from here.'},
 {page:'Saved lists',target:'nav-Saved lists',title:'Saved lists',text:'BOMs saved from the quotation step, ready to reopen, duplicate or follow into production.'},
 {page:'Alerts',target:'nav-Alerts',title:'Alerts',text:'Low, out-of-stock and end-of-life parts, each with an alternative to review. The BOM tool flags the same for every line.'},
 {target:'help',title:'Help is here',text:'Take this tour again any time from Help.'},
];

export default function Tour({onNavigate,onClose}){
 const [i,setI]=useState(0);const card=useRef(null);const step=STEPS[i];const box=useSpotlight(step.target);
 const end=()=>{try{localStorage.setItem(TOUR_KEY,'done')}catch{}onClose()};
 useEffect(()=>{if(step.page)onNavigate(step.page)},[i]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{card.current?.focus();const key=e=>{if(e.key==='Escape')end();else if(e.key==='ArrowRight')setI(x=>Math.min(STEPS.length-1,x+1));else if(e.key==='ArrowLeft')setI(x=>Math.max(0,x-1))};addEventListener('keydown',key);return()=>removeEventListener('keydown',key)},[i]);// eslint-disable-line react-hooks/exhaustive-deps
 // Card beside the target when there is room, else centred at the bottom (phones).
 const pad=6,W=innerWidth,H=innerHeight,cw=Math.min(340,W-32);let pos={left:(W-cw)/2,bottom:16};
 if(box&&W>720){const right=box.x+box.w+16;const top=Math.min(H-240,Math.max(16,box.y-8));pos=right+cw<W-16?{left:right,top}:{left:Math.max(16,Math.min(W-cw-16,box.x)),top:Math.min(H-240,box.y+box.h+12)}}
 const last=i===STEPS.length-1;
 return <div className="tour" role="presentation">
  <svg className="tour-shade" width={W} height={H} aria-hidden="true"><defs><mask id="tour-hole"><rect width={W} height={H} fill="white"/>{box&&<rect x={box.x-pad} y={box.y-pad} width={box.w+pad*2} height={box.h+pad*2} rx="6" fill="black"/>}</mask></defs><rect width={W} height={H} mask="url(#tour-hole)"/></svg>
  {box&&<div className="tour-ring" style={{left:box.x-pad,top:box.y-pad,width:box.w+pad*2,height:box.h+pad*2}} aria-hidden="true"/>}
  <div ref={card} className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text" tabIndex={-1} style={{width:cw,...pos}}>
   <div className="tour-head"><span className="tour-count">{i+1} of {STEPS.length}</span><button className="icon-button" aria-label="Close tour" onClick={end}><X size={16}/></button></div>
   <h2 id="tour-title">{step.title}</h2><p id="tour-text">{step.text}</p>
   {step.demo&&<button className="button small soft tour-demo" onClick={()=>{end();requestBomDemo(onNavigate)}}>Watch the full BOM demo</button>}
   <div className="tour-dots" aria-hidden="true">{STEPS.map((_,k)=><i key={k} className={k===i?'on':k<i?'past':''}/>)}</div>
   <div className="tour-actions">{i>0?<button className="button small" onClick={()=>setI(i-1)}><ArrowLeft size={14}/>Back</button>:<button className="text-button" onClick={end}>Skip tour</button>}
    <button className="button small primary" onClick={()=>last?end():setI(i+1)}>{last?'Finish':'Next'}{!last&&<ArrowRight size={14}/>}</button></div>
  </div>
 </div>;
}
