// Fine 3D detail for board parts, planned in millimetres so it can be unit-tested; Board.jsx turns the
// plan into merged meshes. Everything is in the part's local frame (x along w, y along d) unless noted.
import {partPads} from './blueprint.js';

const ENDS=new Set(['resistor','capacitor','inductor','fuse','diode','led']);
const r3=n=>Math.round(n*1000)/1000;

// Leads, end caps, through-hole pins and solder for one part.
// Returns {leads:[{x,y,len,width,axis,dir}], caps:[{x,y,w,d}], pins:[{x,y,r}], solder:[{x,y,r,side}]}.
export function partDetail(p){
 const pads=partPads(p)||[],out={leads:[],caps:[],pins:[],solder:[]};
 const hw=p.w/2,hd=p.d/2;
 const isEnds=p.leads==='ends'||(pads.length===2&&ENDS.has(p.type)&&!pads.some(q=>q.hole>0));
 if(isEnds){
  // Metal terminations on both ends of a chip passive or diode, along the longer body axis.
  const alongX=p.w>=p.d,L=alongX?p.w:p.d,S=alongX?p.d:p.w,c=Math.max(.15,Math.min(L*.2,.8));
  for(const k of [-1,1])out.caps.push(alongX?{x:k*(hw-c/2),y:0,w:c,d:S}:{x:0,y:k*(hd-c/2),w:S,d:c});
 }
 for(const q of pads){
  if(q.hole>0){out.pins.push({x:q.x,y:q.y,r:r3(Math.max(.2,q.hole*.38))});out.solder.push({x:q.x,y:q.y,r:r3(Math.max(.35,Math.min(q.w,q.h)*.48)),side:p.side==='bottom'?'top':'bottom',joint:true});continue}
  // Solder on every SMD pad, a little smaller than the pad.
  out.solder.push({x:q.x,y:q.y,r:r3(Math.max(.12,Math.min(q.w,q.h)*.38)),side:p.side==='bottom'?'bottom':'top'});
  if(isEnds)continue;
  // Gull-wing lead from the body edge to a pad outside the body.
  const ox=Math.abs(q.x)-hw,oy=Math.abs(q.y)-hd;if(ox<=.02&&oy<=.02)continue;
  const axis=ox>=oy?'x':'y',dir=Math.sign(axis==='x'?q.x:q.y)||1,edge=axis==='x'?hw:hd,end=Math.abs(axis==='x'?q.x:q.y)+Math.min(axis==='x'?q.w:q.h,1)*.25;
  const width=Math.max(.12,Math.min(axis==='x'?q.h:q.w,.6)*.7),len=end-edge;if(len<.05)continue;
  out.leads.push({x:axis==='x'?dir*(edge+len/2):q.x,y:axis==='y'?dir*(edge+len/2):q.y,len:r3(len),width:r3(width),axis,dir});
 }
 return out;
}

// Local → board coordinates (mm, Y down) using the same convention as the 2D view and Board.jsx.
export function toBoard(p,x,y){const a=p.rot*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return [p.x+x*c+y*s,p.y-x*s+y*c]}

// Illustrative routing for boards whose data has no tracks: each passive's first pad runs to the
// nearest chip pin on the top layer (an L-shaped track), its second pad drops through a via to a
// ground track on the bottom layer. Deterministic, clipped to the board, and capped in size.
export function synthTraces(parts,board,{max=400}={}){
 const top=[],bottom=[],vias=[];const W=board.width/2-1,H=board.height/2-1;
 const clampPt=([x,y])=>[Math.max(-W,Math.min(W,x)),Math.max(-H,Math.min(H,y))];
 const pins=[];for(const p of parts){if(!['chip','module','transistor'].includes(p.type)||p.side==='bottom')continue;for(const q of partPads(p)||[])pins.push({ref:p.ref,pt:toBoard(p,q.x,q.y),used:0})}
 const passives=parts.filter(p=>p.side!=='bottom'&&ENDS.has(p.type)).sort((a,b)=>a.ref.localeCompare(b.ref,undefined,{numeric:true}));
 const groundY=Math.min(H,Math.max(-H,board.height/2-3));
 for(const p of passives){
  if(top.length>=max)break;const pads=partPads(p);if(!pads||pads.length<2)continue;
  const a=clampPt(toBoard(p,pads[0].x,pads[0].y)),b=clampPt(toBoard(p,pads[1].x,pads[1].y));
  if(pins.length){const best=pins.reduce((m,q)=>{const d=Math.hypot(q.pt[0]-a[0],q.pt[1]-a[1])+q.used*3;return d<m.d?{q,d}:m},{q:null,d:Infinity}).q;
   if(best){best.used++;const t=clampPt(best.pt),mid=[a[0],t[1]];top.push([a[0],a[1],mid[0],mid[1]],[mid[0],mid[1],t[0],t[1]])}}
  const via=clampPt([b[0],b[1]+(b[1]<groundY?1.2:-1.2)]);top.push([b[0],b[1],via[0],via[1]]);vias.push(via);
  bottom.push([via[0],via[1],via[0],groundY]);
 }
 if(vias.length){const xs=vias.map(v=>v[0]);bottom.push([Math.max(-W,Math.min(...xs)-2),groundY,Math.min(W,Math.max(...xs)+2),groundY])}
 const round=s=>s.map(seg=>seg.map(r3));
 return {top:round(top),bottom:round(bottom),vias:vias.map(v=>v.map(r3)),illustrative:true};
}
