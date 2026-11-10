// Full SMT production line for the board open in the studio:
// PCB loader → solder paste printer → SPI → pick-and-place → reflow oven → AOI → X-ray.
// Pure planning in millimetres, seconds and °C, so it runs in Node tests: each station's process
// for this design (stencil apertures, paste deposits, placement program, reflow profile, optical and
// X-ray checks), station cycle times, and a schedule of N boards through the line.
// Measurements are simulated: deterministic per board and pad, driven by the physics that cause real
// defects (small stencil apertures print less paste; too little paste starves a joint; uneven paste
// on a two-pad part tombstones it), so the same board always gives the same results.
import {buildLine,splitParts} from './smtLine.js';
import {partPads} from './blueprint.js';

export const STATIONS=[
 {id:'loader',name:'PCB loader',short:'Loader'},
 {id:'printer',name:'Solder paste printer',short:'Printer'},
 {id:'spi',name:'Solder paste inspection',short:'SPI'},
 {id:'pnp',name:'Pick-and-place',short:'Pick & place'},
 {id:'reflow',name:'Reflow oven',short:'Reflow'},
 {id:'aoi',name:'Automated optical inspection',short:'AOI'},
 {id:'xray',name:'X-ray inspection',short:'X-ray'},
];
export const TRANSFER=3;             // s on the buffer conveyor between machines
export const LIQUIDUS=217;           // SAC305 solder, °C
export const SPEC={
 spi:{min:70,max:130,warnLow:80,warnHigh:120},           // paste volume, % of the aperture volume
 reflow:{peak:[235,250],tal:[45,90],ramp:3,soak:[60,120]}, // °C, s above liquidus, °C/s, s at 150–200 °C
 aoi:{offset:.1,rotation:1.5},                            // mm, degrees
 xray:{bga:25,bottom:40,leaded:25},                       // void % limit: BGA balls, bottom-terminated pads, gull-wing joints
};

const r2=n=>Math.round(n*100)/100;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Deterministic 0..1 noise and a rough normal deviate from a string key.
export function noise(key){let h=2166136261;for(let i=0;i<key.length;i++){h^=key.charCodeAt(i);h=Math.imul(h,16777619)}h^=h>>>13;h=Math.imul(h,0x5bd1e995);h^=h>>>15;return (h>>>0)/4294967296}
const gauss=key=>(noise(key+'a')+noise(key+'b')+noise(key+'c')+noise(key+'d')-2)*1.732;

// Pads of every top-side SMD part in board coordinates, rotated with the part like the 3D models
// (rotation.y = rot): X = x + lx·cos a + ly·sin a, Y = y − lx·sin a + ly·cos a.
export function boardPads(parts){
 const out=[];
 for(const p of parts){const a=(p.rot||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),quarter=Math.abs(Math.sin(a))>.7;
  (partPads(p)||[]).forEach((q,i)=>{if(q.hole>0)return;out.push({ref:p.ref,i,x:r2(p.x+q.x*c+q.y*s),y:r2(p.y-q.x*s+q.y*c),w:quarter?q.h:q.w,h:quarter?q.w:q.h,shape:q.shape||'rect'})})}
 return out;
}

// Hidden-joint packages that need X-ray: BGAs and bottom-terminated parts. Boards without any get a
// sample instead: the three leaded ICs with the most joints.
export const xrayKind=p=>{const k=String(p.package||'')+' '+String(p.mpn||'');if(/BGA|WLCSP|\bCSP\b/i.test(k))return 'bga';if(/QFN|DFN|LGA|\bSON\b|MLF|LFCSP|PowerPAD|VQFN|WQFN|D2PAK|\bDPAK|TO-?263|TO-?252/i.test(k))return 'bottom';return null};

// --- Printer ---------------------------------------------------------------------------------
// Stencil thickness from the finest aperture; area ratio = opening area / aperture wall area. Below
// 0.66 paste sticks in the stencil and transfer efficiency falls.
export function planPrinter(pads){
 const fine=pads.some(q=>Math.min(q.w,q.h)<.3),t=fine?.1:.12;
 const apertures=pads.map(q=>{const ar=(q.w*q.h)/(2*(q.w+q.h)*t);return {...q,ar:r2(ar),te:clamp(.62+.42*Math.min(1,ar/.95),.5,1.02)}});
 return {stencil:t,squeegee:{speed:40,pressure:6,angle:60},apertures,lowAr:apertures.filter(a=>a.ar<.66).length,separation:2};
}

// --- Reflow ----------------------------------------------------------------------------------
export const ZONE_NAMES=['Preheat 1','Preheat 2','Preheat 3','Soak 1','Soak 2','Soak 3','Reflow 1','Reflow 2','Reflow 3','Cooling 1','Cooling 2'];
const BASE=[110,145,160,170,180,190,230,250,250,110,50];
export const ZONE_MM=400;
const zonesOf=(z1,dS,dR)=>BASE.map((t,i)=>i===0?z1:i>=3&&i<=5?t+dS:i>=6&&i<=8?t+dR:t);
// Board temperature through the zones: a first-order lag behind the zone air, slower for bigger,
// thicker and more heavily populated boards.
export function profile(zones,tau,v){
 const len=zones.length*ZONE_MM,dt=.5,pts=[];let T=25,t=0,x=0,peak=25,tal=0,soak=0,ramp=0;
 while(x<len){const z=zones[Math.min(zones.length-1,Math.floor(x/ZONE_MM))],prev=T;T+=(z-T)*dt/tau;
  ramp=Math.max(ramp,(T-prev)/dt);peak=Math.max(peak,T);if(T>=LIQUIDUS)tal+=dt;if(T>=150&&T<=200)soak+=dt;t+=dt;x+=v*dt;
  if(!pts.length||t-pts[pts.length-1].t>=2)pts.push({t:r2(t),x:r2(x),T:r2(T)})}
 if(r2(t)>pts[pts.length-1].t)pts.push({t:r2(t),x:r2(x),T:r2(T)});
 return {speed:v,dwell:r2(t),peak:r2(peak),tal:r2(tal),soak:r2(soak),ramp:r2(ramp),points:pts};
}
const inSpec=r=>{const s=SPEC.reflow;return {peak:r.peak>=s.peak[0]&&r.peak<=s.peak[1],tal:r.tal>=s.tal[0]&&r.tal<=s.tal[1],ramp:r.ramp<=s.ramp,soak:r.soak>=s.soak[0]&&r.soak<=s.soak[1]}};
// The recipe: conveyor speed plus preheat, soak and reflow setpoints, searched coarse then fine for
// the profile closest to the SAC305 targets (peak 243 °C, 65 s above liquidus, 90 s soak, ≤2.5 °C/s),
// preferring a conveyor near 0.8 m/min and no zone above 285 °C.
export function planReflow(board,parts){
 const area=board.width*board.height,mass=parts.reduce((t,p)=>t+(+p.w||0)*(+p.d||0)*(+p.h||0),0);
 const tau=r2(22+area/900+(board.layers||2)*3+mass/4000);
 let zones=[];const score=r=>{const ok=inSpec(r);return Math.abs(r.peak-243)+Math.abs(r.tal-65)*.6+Math.abs(r.soak-90)*.25+Math.max(0,r.ramp-2.5)*40+Object.values(ok).filter(x=>!x).length*100+Math.max(0,13-r.speed)*2+(Math.max(...zones)>285?100:0)};
 let best=null;const tryIt=(v,z1,dS,dR)=>{zones=zonesOf(z1,dS,dR);const r=profile(zones,tau,v),sc=score(r);if(!best||sc<best.sc)best={sc,v,z1,dS,dR}};
 for(let v=6;v<=20;v+=1)for(let z1=70;z1<=130;z1+=15)for(let dS=-40;dS<=10;dS+=10)for(let dR=-24;dR<=36;dR+=6)tryIt(v,z1,dS,dR);
 const c={...best};for(let v=c.v-1;v<=c.v+1;v+=.25)for(let dS=c.dS-6;dS<=c.dS+6;dS+=2)for(let dR=c.dR-6;dR<=c.dR+6;dR+=1)tryIt(v,c.z1,dS,dR);
 const recipe=zonesOf(best.z1,best.dS,best.dR).map((set,i)=>({name:ZONE_NAMES[i],set})),r=profile(recipe.map(z=>z.set),tau,best.v),ok=inSpec(r);
 return {zones:recipe,zoneMm:ZONE_MM,tau,speed:r.speed,speedMmin:r2(r.speed*60/1000),dwell:r.dwell,peak:r.peak,tal:r.tal,soak:r.soak,ramp:r.ramp,points:r.points,ok,pass:Object.values(ok).every(Boolean),gap:50};
}

// --- Inspection results for board k --------------------------------------------------------------
export function inspectBoard(plan,k=0){
 const {apertures,stencil}=plan.printer;
 const deposits=apertures.map(a=>{const vol=r2(clamp(a.te*100*(1+.07*gauss(`spi|${k}|${a.ref}|${a.i}`)),20,160));const s=SPEC.spi;
  return {ref:a.ref,i:a.i,x:a.x,y:a.y,w:a.w,h:a.h,ar:a.ar,volume:vol,height:r2(stencil*1000*vol/100),offset:r2(Math.abs(gauss(`spio|${k}|${a.ref}|${a.i}`))*.025),status:vol<s.min||vol>s.max?'fail':vol<s.warnLow||vol>s.warnHigh?'warn':'pass'}});
 const byRef=new Map();for(const d of deposits){if(!byRef.has(d.ref))byRef.set(d.ref,[]);byRef.get(d.ref).push(d)}
 const POLAR=new Set(['diode','led','chip','transistor']);
 const aoi=plan.machine.map(p=>{const ds=byRef.get(p.ref)||[],a=SPEC.aoi;
  const dx=r2(gauss(`aoix|${k}|${p.ref}`)*.025),dy=r2(gauss(`aoiy|${k}|${p.ref}`)*.025),rot=r2(gauss(`aoir|${k}|${p.ref}`)*.35);
  const starved=ds.some(d=>d.volume<SPEC.spi.min),two=ds.length===2&&Math.min(...ds.map(d=>d.volume))/Math.max(...ds.map(d=>d.volume))<.6&&Math.max(p.w,p.d)<=2.2;
  const defects=[];if(Math.hypot(dx,dy)>a.offset)defects.push('Offset');if(Math.abs(rot)>a.rotation)defects.push('Rotation');if(two)defects.push('Tombstone');else if(starved)defects.push('Insufficient solder');
  return {ref:p.ref,type:p.type,dx,dy,rot,polarity:POLAR.has(p.type)||/elec|CP_|polar/i.test(p.package||'')?'checked':'n/a',defects,pass:!defects.length}});
 const xray=plan.xrayParts.map(p=>{const kind=xrayKind(p)||'leaded',limit=SPEC.xray[kind];
  const voids=r2(clamp((kind==='leaded'?5:8)+(kind==='leaded'?4:9)*gauss(`xv|${k}|${p.ref}`)+(kind==='bottom'?10:0),1,60));return {ref:p.ref,package:p.package||'',kind,voids,limit,pass:voids<=limit}});
 const spiFail=deposits.filter(d=>d.status==='fail').length,aoiFail=aoi.filter(r=>!r.pass).length,xrayFail=xray.filter(r=>!r.pass).length;
 return {board:k,deposits,aoi,xray,counts:{deposits:deposits.length,spiFail,spiWarn:deposits.filter(d=>d.status==='warn').length,aoiFail,xrayFail},pass:!aoiFail&&!xrayFail};
}

// --- Plan and schedule ---------------------------------------------------------------------------
export const DEFAULTS={boards:5,nozzles:4};
export function planProduction(board,parts,opts={}){
 const o={...DEFAULTS,...opts};o.boards=clamp(Math.round(o.boards)||1,1,50);
 const {machine,hand,bottom}=splitParts(parts);
 const pads=boardPads(machine),printer=planPrinter(pads),reflow=planReflow(board,machine);
 const line=buildLine(board,machine,{nozzles:o.nozzles,rear:true,bankLen:board.width+30});
 const hidden=machine.filter(p=>xrayKind(p)),padsOf=new Map();for(const q of pads)padsOf.set(q.ref,(padsOf.get(q.ref)||0)+1);
 const xrayParts=hidden.length?hidden:machine.filter(p=>p.type==='chip'&&(padsOf.get(p.ref)||0)>=4).sort((a,b)=>(padsOf.get(b.ref)||0)-(padsOf.get(a.ref)||0)||a.ref.localeCompare(b.ref)).slice(0,3);
 const xrayMode=hidden.length?'hidden':xrayParts.length?'sample':'none';
 const area=board.width*board.height;
 const times={
  loader:6,
  printer:r2(8+(board.height+30)/printer.squeegee.speed+printer.separation+2+pads.length*.002),
  spi:r2(4+area/2500+pads.length*.01),
  pnp:r2(line.stats.placeTime+2*.3+3),
  reflow:reflow.dwell,
  aoi:r2(3+area/4000+machine.length*.06),
  xray:xrayParts.length?r2(6+xrayParts.length*6):2,
 };
 // The oven is continuous: boards follow each other at (board length + gap) / conveyor speed.
 const spacing={...times,reflow:r2((board.width+reflow.gap)/reflow.speed)};
 const plan={opts:o,board:{width:board.width,height:board.height,layers:board.layers||2,name:board.name||'',outline:board.outline||null,surfaceTop:board.surface?.top||null,
  image:board.image?.dataUrl&&!board.outline?{url:board.image.dataUrl,crop:board.imageCrop&&board.imageCrop.w>0?board.imageCrop:null}:null},machine,hand,bottom,pads,printer,reflow,line,xrayParts,xrayMode,times,spacing};
 plan.schedule=schedule(times,spacing,o.boards);
 const takt=Math.max(...Object.values(spacing)),bottleneck=STATIONS.find(s=>spacing[s.id]===takt).id;
 const results=Array.from({length:o.boards},(_,k)=>inspectBoard(plan,k));
 const last=plan.schedule[plan.schedule.length-1];
 plan.results=results;
 plan.stats={takt:r2(takt),bottleneck,perHour:r2(3600/takt),first:r2(plan.schedule[0].xray.out-plan.schedule[0].loader.in),total:r2(last.xray.out),
  fpy:r2(results.filter(r=>r.pass).length/results.length*100),placements:line.stats.placements,cph:line.stats.cph,
  // Share of the run each station spends accepting boards (the oven by its entry spacing).
  utilisation:Object.fromEntries(STATIONS.map(s=>[s.id,r2(Math.min(100,spacing[s.id]*o.boards/Math.max(1,last.xray.out)*100))]))};
 return plan;
}

// Each board enters a station after leaving the previous one plus the transfer, and no sooner than
// the station accepts the next board (one board at a time, or the oven's spacing).
export function schedule(times,spacing,n){
 const out=[];
 for(let i=0;i<n;i++){const row={};let ready=0;
  STATIONS.forEach((s,j)=>{const prev=i?out[i-1][s.id]:null;let tin=j?ready+TRANSFER:0;
   if(prev)tin=Math.max(tin,prev.in+spacing[s.id],s.id==='reflow'?0:prev.out);
   row[s.id]={in:r2(tin),out:r2(tin+times[s.id])};ready=tin+times[s.id]});
  out.push(row)}
 return out;
}

// Where board i is at time t: inside a station, on the conveyor between two, waiting in the
// magazine, or finished.
export function boardAt(plan,i,t){
 const row=plan.schedule[i];if(t<row.loader.in)return {state:'queued'};
 for(let j=0;j<STATIONS.length;j++){const id=STATIONS[j].id,r=row[id];
  if(t>=r.in&&t<r.out)return {state:'in',station:id,index:j,progress:(t-r.in)/(r.out-r.in)};
  const next=STATIONS[j+1];if(next&&t>=r.out&&t<row[next.id].in){const travel=Math.min(TRANSFER,row[next.id].in-r.out),f=travel>0?Math.min(1,(t-r.out)/travel):1;return {state:'moving',from:j,to:j+1,progress:f}}}
 return {state:'done'};
}
