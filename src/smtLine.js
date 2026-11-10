// SMT assembly line: a straight conveyor, a bank of tape feeders, a multi-nozzle gantry head with an
// upward-looking camera, and a reflow oven at the exit. Pure planning and timing in millimetres and
// seconds (board coordinates: x right, y down, origin at the board centre while it is clamped in the
// machine), so it runs in Node tests. The studio's 3D machine (smtRig.js) plays these timelines.
import {assemblyOrder} from './gripper.js';

export const DEFAULTS={nozzles:4,speed:100,order:'size',rear:false,boards:1};
// Gantry motion and fixed dwell times, close to a mid-range placement machine at 100 % speed.
export const MACHINE={vMax:1800,accel:18000,zPick:.08,zPlace:.09,vision:.03,fiducial:.3,load:3,unload:3,pitch:18,clear:28};
export const TAPES=[8,12,16,24,32,44];

const r3=n=>Math.round(n*1000)/1000;
export const isTht=p=>p.leads==='tht'||(p.pads||[]).some(q=>q.hole>0);
// Carrier tape width from the part's larger side; 32 mm and up come from a matrix tray.
export function tapeWidth(p){const s=Math.max(+p.w||0,+p.d||0);return s<=3.2?8:s<=6.5?12:s<=10?16:s<=16?24:s<=24?32:44}
const keyOf=p=>{const id=p.mpn||p.value;return id?[id,p.package||'',p.type||''].join('|'):['?',p.package||'',p.type||'',(+p.w).toFixed(1),(+p.d).toFixed(1)].join('|')};

// Top-side SMD parts go to the machine; through-hole parts are inserted by hand; bottom-side parts
// need a second pass with the board flipped. With `all`, through-hole parts go to the machine too
// (an odd-form head), as in the studio's own assembly.
export function splitParts(parts=[],{all=false}={}){
 const machine=[],hand=[],bottom=[];
 for(const p of parts){if(p.side==='bottom')bottom.push(p);else if(isTht(p)&&!all)hand.push(p);else machine.push(p)}
 return {machine,hand,bottom};
}

// One feeder per distinct part (same part number, package and type). The busiest feeders sit
// nearest the middle of the bank so the head travels least. With `rear`, feeders that do not fit
// the front bank go to a second bank behind the conveyor.
export function feederSetup(parts,board,{rear=false,bankLen:len=0}={}){
 const groups=new Map();
 for(const p of parts){const k=keyOf(p);if(!groups.has(k))groups.set(k,{key:k,label:p.mpn||p.value||p.package||p.type||p.ref,package:p.package||'',type:p.type||'other',tape:8,refs:[],w:0,d:0,h:0});
  const g=groups.get(k);g.refs.push(p.ref);g.tape=Math.max(g.tape,tapeWidth(p));g.w=Math.max(g.w,+p.w||0);g.d=Math.max(g.d,+p.d||0);g.h=Math.max(g.h,+p.h||0)}
 const list=[...groups.values()].sort((a,b)=>b.refs.length-a.refs.length||a.tape-b.tape||a.key.localeCompare(b.key));
 const width=f=>f.tape>=32?f.tape+16:f.tape+4,bankLen=len>0?len:Math.max(board.width+160,360);
 const banks={front:[],rear:[]};let used=0;
 for(const f of list){const w=width(f);if(rear&&used+w>bankLen&&banks.front.length){banks.rear.push(f)}else{banks.front.push(f);used+=w}}
 const out=[];
 for(const bank of ['front','rear']){const fs=banks[bank];if(!fs.length)continue;
  const left=[],right=[];fs.forEach((f,i)=>(i%2?left:right).push(f));const row=[...left.reverse(),...right];
  const total=row.reduce((s,f)=>s+width(f),0),sign=bank==='front'?1:-1,edge=board.height/2+MACHINE.clear;let x=-total/2;
  row.forEach((f,i)=>{const w=width(f);out.push({...f,slot:(bank==='front'?'F':'R')+String(i+1).padStart(2,'0'),bank,kind:f.tape>=32?'tray':'tape',x:r3(x+w/2),y:r3(sign*(edge+6)),pitch:w});x+=w});
 }
 return out;
}

// Upward camera for each bank in use, between the feeders and the conveyor.
export const cameraFor=(bank,board)=>({x:0,y:r3((bank==='rear'?-1:1)*(board.height/2+MACHINE.clear/2))});

function placementOrder(parts,feeders,order,sequence){
 if(Array.isArray(sequence)){const have=new Set(parts.map(p=>p.ref));return sequence.filter(r=>have.has(r))}
 if(order==='feeder'){const idx=new Map();feeders.forEach((f,i)=>f.refs.forEach(r=>idx.set(r,i)));return [...parts].sort((a,b)=>idx.get(a.ref)-idx.get(b.ref)||a.y-b.y||a.x-b.x).map(p=>p.ref)}
 if(order==='position'){const row=p=>Math.floor((p.y+1e4)/10);return [...parts].sort((a,b)=>row(a)-row(b)||(row(a)%2?b.x-a.x:a.x-b.x)).map(p=>p.ref)}
 return assemblyOrder(parts);
}
// Nozzle k sits this far (mm, along x) from the head centre.
export const nozzleOffset=(k,n)=>(k-(n-1)/2)*MACHINE.pitch;

// Placement cycles: up to `nozzles` parts per trip. Picks sweep the feeder bank once. Placements
// keep the requested order (an imported sequence, or small parts before tall ones); the 'feeder' and
// 'position' orders run them nearest-first from the camera instead.
export function planCycles(parts,feeders,board,{nozzles=DEFAULTS.nozzles,order=DEFAULTS.order,sequence=null}={}){
 const n=Math.max(1,Math.min(8,Math.round(nozzles))),byRef=new Map(parts.map(p=>[p.ref,p])),fOf=new Map();
 feeders.forEach(f=>f.refs.forEach(r=>fOf.set(r,f)));
 const seq=placementOrder(parts,feeders,order,sequence).filter(r=>fOf.has(r)),cycles=[];
 for(let i=0;i<seq.length;i+=n){const refs=seq.slice(i,i+n);
  const picks=refs.map((ref,k)=>({nozzle:k,ref,feeder:fOf.get(ref)})).sort((a,b)=>(a.feeder.bank>b.feeder.bank)-(a.feeder.bank<b.feeder.bank)||(a.feeder.x-nozzleOffset(a.nozzle,n))-(b.feeder.x-nozzleOffset(b.nozzle,n))||a.nozzle-b.nozzle);
  const bank=picks.some(q=>q.feeder.bank==='front')?'front':'rear',cam=cameraFor(bank,board);
  const left=refs.map((ref,k)=>({nozzle:k,ref,x:byRef.get(ref).x,y:byRef.get(ref).y,rot:byRef.get(ref).rot||0})),places=[];
  let at={x:cam.x,y:cam.y};
  if(Array.isArray(sequence)||order==='size')places.push(...left.splice(0));
  while(left.length){let bi=0,bd=Infinity;left.forEach((q,j)=>{const d=Math.hypot(q.x-nozzleOffset(q.nozzle,n)-at.x,q.y-at.y);if(d<bd){bd=d;bi=j}});const q=left.splice(bi,1)[0];places.push(q);at={x:q.x-nozzleOffset(q.nozzle,n),y:q.y}}
  cycles.push({picks,places,camera:cam});
 }
 return cycles;
}

// Point-to-point gantry move with trapezoidal (or triangular) velocity.
export function moveTime(d,speed=100){
 const s=Math.max(.1,Math.min(1,speed/100)),v=MACHINE.vMax*s,a=MACHINE.accel*s;
 if(d<=0)return 0;return d<=v*v/a?2*Math.sqrt(d/a):d/v+v/a;
}

// Machine footprint along the conveyor (mm): the machine body, the reflow oven after it, and where a
// board enters and leaves.
export function lineExtents(board,feeders){
 const half=Math.max(board.width/2+40,...feeders.map(f=>Math.abs(f.x)+f.pitch/2+20)),depth=board.height/2+MACHINE.clear+90;
 const ovenX0=half+60,ovenLen=Math.max(260,board.width+160);
 return {half,depth,ovenX0,ovenLen,entry:-(half+board.width/2+40),exit:ovenX0+ovenLen/2};
}

// Keyframes for one board (opts.heights: optional {ref: mm} stroke heights, e.g. the rendered body): {t,x,y,z[],rot[],held[],picked,placed,boardX,phase}. z is 0 (nozzle up)
// to 1 (down on the part); zt[k] is the height (mm above the board or feeder pocket) of the part
// nozzle k last went down to. held[k] is the ref on nozzle k; picked/placed count the pick and place
// sequences, which are returned so a renderer knows which parts are where at any time.
export function buildLine(board,parts,opts={}){
 const o={...DEFAULTS,...opts};o.nozzles=Math.max(1,Math.min(8,Math.round(o.nozzles)));o.speed=Math.max(10,Math.min(100,+o.speed||100));o.boards=Math.max(1,Math.min(99,Math.round(o.boards)||1));
 const {machine,hand,bottom}=splitParts(o.sequence?parts.filter(p=>o.sequence.includes(p.ref)):parts,o),feeders=feederSetup(machine,board,o),cycles=planCycles(machine,feeders,board,o),n=o.nozzles;
 const ext=lineExtents(board,feeders),byRef=new Map(machine.map(p=>[p.ref,p]));
 const K=[];let t=0;const st={x:0,y:cameraFor('front',board).y,z:Array(n).fill(0),zt:Array(n).fill(1),rot:Array(n).fill(0),held:Array(n).fill(null),picked:0,placed:0,boardX:ext.entry,phase:'load'};
 const key=()=>K.push({t:r3(t),...st,z:[...st.z],zt:[...st.zt],rot:[...st.rot],held:[...st.held]});
 const go=(x,y,phase)=>{const d=Math.hypot(x-st.x,y-st.y);st.phase=phase;if(d>.01){key();t+=moveTime(d,o.speed);st.x=x;st.y=y}};
 const dip=(k,dz,phase,change,ref)=>{st.phase=phase;st.zt[k]=+(o.heights?.[ref])||+byRef.get(ref)?.h||1;key();t+=dz/2;st.z[k]=1;change();key();t+=dz/2;st.z[k]=0};
 const pickOrder=[],placeOrder=[];
 key();t+=MACHINE.load;st.boardX=0;st.phase='fiducial';key();
 const fid=fiducials(board);
 for(const [x,y] of fid){go(x,y,'fiducial');key();t+=MACHINE.fiducial}
 const placeStart=t;
 for(const c of cycles){
  for(const q of c.picks){go(q.feeder.x-nozzleOffset(q.nozzle,n),q.feeder.y,'pick');dip(q.nozzle,MACHINE.zPick,'pick',()=>{st.held[q.nozzle]=q.ref;st.rot[q.nozzle]=0;pickOrder.push(q.ref);st.picked++},q.ref)}
  go(c.camera.x,c.camera.y,'vision');key();t+=MACHINE.vision*c.picks.length;
  for(const q of c.picks){const p=c.places.find(x=>x.ref===q.ref);st.rot[q.nozzle]=p.rot}
  for(const q of c.places){go(q.x-nozzleOffset(q.nozzle,n),q.y,'place');dip(q.nozzle,MACHINE.zPlace,'place',()=>{st.held[q.nozzle]=null;placeOrder.push(q.ref);st.placed++},q.ref)}
 }
 const placeTime=t-placeStart;
 go(0,cameraFor('front',board).y,'unload');key();t+=MACHINE.unload;st.boardX=ext.exit;st.phase='done';key();
 const duration=r3(t),placements=placeOrder.length;
 return {opts:o,feeders,cycles,keys:K,pickOrder,placeOrder,hand,bottom,machine,ext,fiducials:fid,duration,
  stats:{placements,feeders:feeders.length,cycles:cycles.length,placeTime:r3(placeTime),boardTime:duration,cph:placeTime>0?Math.round(placements/placeTime*3600):0,boardsPerHour:duration>0?r3(3600/duration):0,total:r3(duration*o.boards)}};
}

// Two copper fiducials in opposite corners, checked by the head camera before placing.
export const fiducials=board=>[[-board.width/2+4,-board.height/2+4],[board.width/2-4,board.height/2-4]];

const ease=f=>f<.5?2*f*f:1-2*(1-f)*(1-f);
// State of the line at time t (seconds) within one board's run.
export function sampleLine(line,t){
 const K=line.keys;if(!K.length)return null;if(t<=K[0].t)return {...K[0]};const last=K[K.length-1];if(t>=last.t)return {...last};
 let lo=0,hi=K.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(K[m].t<=t)lo=m;else hi=m}
 const a=K[lo],b=K[hi],f=b.t>a.t?(t-a.t)/(b.t-a.t):1,e=ease(f),mix=(u,v,w=e)=>u+(v-u)*w;
 return {...a,t,x:mix(a.x,b.x),y:mix(a.y,b.y),boardX:mix(a.boardX,b.boardX),z:a.z.map((z,k)=>mix(z,b.z[k],f)),zt:b.z.map((z,k)=>z>a.z[k]?b.zt[k]:a.zt[k]),rot:a.rot.map((r,k)=>mix(r,b.rot[k]))};
}
