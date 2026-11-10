// Cobot gripper for the 3D board.
// - A pure motion planner: keyframes in board-scene units, sampled by time. No Three.js here, so the
//   pick-and-place logic is unit-testable.
// - Assembly planning: feeder-tray layout, placement order, and the gripper program file
//   (CSV export and import).
// - A Three.js builder for the end effector: two parallel fingers plus a centre suction nozzle for
//   parts wider than the fingers open.

export const SAFE_Y=2.2;            // travel height above the board
export const LIFT_Y=1.5;            // height a picked part is held at for inspection
export const MAX_GAP=2.4;           // widest the fingers open
export const HOME={x:0,y:3.2,z:0,rot:0,open:1,vac:0,hold:null};
const APPROACH_MARGIN=.22;
const TAU=Math.PI*2;

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
// Fingers are symmetric, so a grasp at r and r+π is the same; take the nearest equivalent angle.
export function nearestAngle(from,to){let d=(to-from)%Math.PI;if(d>Math.PI/2)d-=Math.PI;if(d<-Math.PI/2)d+=Math.PI;return from+d}
// A carried part is not symmetric (pin 1, diode band): turn the short way but land on the exact angle.
export function shortestTurn(from,to){let d=(to-from)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return from+d}

// How to hold a part: fingers across its narrower side at mid-body, or the suction nozzle on its top
// face when it is wider than the fingers open. `p` is the scene-space centre (x,y,z), size (w along
// local x, d along local z, h) and rotation. toolY is where the tool centre point sits while holding;
// dy is how far the part centre hangs below it.
export function graspFor(p){
 const acrossW=p.w<=p.d,width=acrossW?p.w:p.d,top=p.y+p.h/2;
 if(width<=MAX_GAP-.04)return {ref:p.ref,x:p.x,y:p.y,z:p.z,top,h:p.h,meshRot:p.rot,rot:p.rot+(acrossW?0:Math.PI/2),width,tool:'fingers',toolY:p.y,dy:0,fits:true};
 return {ref:p.ref,x:p.x,y:p.y,z:p.z,top,h:p.h,meshRot:p.rot,rot:p.rot,width,tool:'vacuum',toolY:top,dy:p.h/2,fits:true};
}

const travelTime=(a,b)=>clamp(.35+Math.hypot(b.x-a.x,b.z-a.z)*.09,.35,1.8);
const approachOpen=g=>g.tool==='vacuum'?MAX_GAP:clamp(g.width+APPROACH_MARGIN,.3,MAX_GAP);

// Keyframes: {t,x,y,z,rot,open,vac,hold}. `hold` is the ref the tool carries from that keyframe to the
// next one; null means the part (if any) rests where it is.
function builder(from){
 const frames=[{vac:0,...from,t:0}];
 const add=(dur,patch,{exact=false}={})=>{const last=frames[frames.length-1];const next={...last,...patch,t:last.t+dur};if(patch.rot!=null)next.rot=exact?shortestTurn(last.rot,patch.rot):nearestAngle(last.rot,patch.rot);frames.push(next);return next};
 const last=()=>frames[frames.length-1];
 const rise=()=>{if(last().y<SAFE_Y-.01)add(.35,{y:SAFE_Y})};
 return {frames,add,last,rise};
}
const finish=(b,extra)=>({frames:b.frames,duration:b.last().t,...extra});

// Grip `g` where it lies. Returns the carry record (offset of the part under the tool).
function appendGrip(b,g){
 b.rise();
 b.add(travelTime(b.last(),g),{x:g.x,z:g.z,rot:g.rot,open:approachOpen(g),vac:g.tool==='vacuum'?1:0});
 b.add(.6,{y:g.toolY});
 b.add(g.tool==='vacuum'?.25:.35,g.tool==='vacuum'?{hold:g.ref}:{open:Math.max(.04,g.width+.01),hold:g.ref});
 return {dy:g.dy,rotOffset:b.last().rot-g.meshRot};
}
// Set the carried part down with its centre at (x, y, z) and release it.
function appendRelease(b,ref,{x,y,z,rot,dy,rotOffset,tool}){
 b.rise();
 const patch={x,z};if(rot!=null)patch.rot=rot+rotOffset;
 if(Math.hypot(b.last().x-x,b.last().z-z)>.01||rot!=null)b.add(travelTime(b.last(),{x,z}),patch,{exact:true});
 b.add(.55,{y:y+dy});
 b.add(.3,tool==='vacuum'?{vac:0,hold:null}:{open:Math.min(MAX_GAP,b.last().open+APPROACH_MARGIN),hold:null});
 b.add(.45,{y:SAFE_Y});
}

// Inspection pick: optionally put `held` back on its seat, then pick `target` and hold it up.
// `held` is a seat grasp plus the carry record it was picked with.
export function planPick(from,target,{held=null}={}){
 const b=builder(from),carry={};
 if(held){carry[held.ref]={dy:held.dy,rotOffset:held.rotOffset};appendRelease(b,held.ref,{x:held.x,y:held.y,z:held.z,dy:held.dy,rotOffset:held.rotOffset,tool:held.tool})}
 let picked=null;
 if(target){carry[target.ref]=appendGrip(b,target);b.add(.7,{y:Math.max(LIFT_Y,target.top+.9+(target.tool==='vacuum'?target.h:0))});picked=target.ref}
 return finish(b,{kind:'pick',picked,placed:held?.ref??null,carry,tool:target?.tool??null});
}

// Put the held part back and go home.
export function planRelease(from,held){
 const b=builder(from),carry={};
 if(held){carry[held.ref]={dy:held.dy,rotOffset:held.rotOffset};appendRelease(b,held.ref,{x:held.x,y:held.y,z:held.z,dy:held.dy,rotOffset:held.rotOffset,tool:held.tool})}
 b.rise();b.add(travelTime(b.last(),HOME),{x:HOME.x,z:HOME.z,rot:HOME.rot});
 b.add(.4,{y:HOME.y,open:HOME.open,vac:0});
 return finish(b,{kind:'release',picked:null,placed:held?.ref??null,carry});
}

// Assembly move: pick `src` (a grasp of the part in its feeder slot) and place it with its centre at
// dst {x,y,z} and its body turned to dst.rot, exactly.
export function planPlace(from,src,dst){
 const b=builder(from),carry={};
 const c=appendGrip(b,src);carry[src.ref]=c;
 b.add(.45,{y:SAFE_Y});
 appendRelease(b,src.ref,{x:dst.x,y:dst.y,z:dst.z,rot:dst.rot,dy:c.dy,rotOffset:c.rotOffset,tool:src.tool});
 return finish(b,{kind:'place',picked:null,placed:src.ref,carry,target:dst,tool:src.tool});
}

export function samplePlan(plan,t){
 const f=plan.frames;if(t<=0)return {...f[0]};
 for(let i=1;i<f.length;i++){
  if(t<=f[i].t){const a=f[i-1],b=f[i],k=b.t>a.t?ease((t-a.t)/(b.t-a.t)):1;const lerp=key=>(a[key]??0)+((b[key]??0)-(a[key]??0))*k;
   return {x:lerp('x'),y:lerp('y'),z:lerp('z'),rot:lerp('rot'),open:lerp('open'),vac:lerp('vac'),hold:a.hold,t};}
 }
 return {...f[f.length-1],t};
}
// Where a carried part's centre and rotation are for a tool pose.
export function carriedPose(pose,info){return {x:pose.x,y:pose.y-info.dy,z:pose.z,rot:pose.rot-info.rotOffset}}

// --- Assembly planning (millimetres, board coordinates: x right, y down) -------------------------
const TYPE_ORDER=['resistor','capacitor','inductor','fuse','diode','led','crystal','transistor','switch','chip','module','connector','other'];
const natural=(a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'});
// Like a real line: small passives first, tall and large parts (connectors, modules) last.
export function assemblyOrder(parts){
 const rank=t=>{const i=TYPE_ORDER.indexOf(t);return i<0?TYPE_ORDER.length:i};
 return [...parts].sort((a,b)=>rank(a.type)-rank(b.type)||(a.h||0)-(b.h||0)||a.w*a.d-b.w*b.d||natural(a.ref,b.ref)).map(p=>p.ref);
}
// Feeder slots beside the board's right edge, filled column by column. Parts sit unrotated.
export function trayLayout(parts,board,order=assemblyOrder(parts)){
 const byRef=new Map(parts.map(p=>[p.ref,p])),slots=new Map(),gap=Math.max(2,Math.max(board.width,board.height)*.025);
 const top=-board.height/2,bottom=board.height/2;let x=board.width/2+gap*3,z=top,colW=0;
 for(const ref of order){const p=byRef.get(ref);if(!p)continue;
  const w=p.w,d=p.d;if(z+d>bottom&&z>top){x+=colW+gap;z=top;colW=0}
  slots.set(ref,{x:x+w/2,y:z+d/2});z+=d+gap;colW=Math.max(colW,w);
 }
 return slots;
}

const PROGRAM_HEADER=['Step','Designator','Value','Package','Side','Tool','GripWidth(mm)','PickX(mm)','PickY(mm)','PlaceX(mm)','PlaceY(mm)','Rotation(deg)'];
const csvCell=v=>{const s=String(v??'');return /[",\n;]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
const mm=n=>(Math.round(n*1000)/1000).toFixed(3);
// The gripper program: one row per placement, in order. Readable by people and by importProgram.
export function programRows(parts,board,order=assemblyOrder(parts.filter(p=>p.side!=='bottom'))){
 const byRef=new Map(parts.map(p=>[p.ref,p])),slots=trayLayout(parts.filter(p=>order.includes(p.ref)),board,order);
 return order.filter(r=>byRef.has(r)&&slots.has(r)).map((ref,i)=>{const p=byRef.get(ref),s=slots.get(ref),width=Math.min(p.w,p.d);
  return {step:i+1,ref,value:p.value||p.mpn||'',package:p.package||'',side:p.side||'top',grip:width,pickX:s.x,pickY:s.y,placeX:p.x,placeY:p.y,rot:((p.rot%360)+360)%360}});
}
export function toProgramCsv(rows,{board='',scale=1}={}){
 const lines=[`# semi-cobot gripper program${board?' · '+board:''} · units mm · origin board centre`,PROGRAM_HEADER.join(',')];
 for(const r of rows){const tool=r.grip*scale>MAX_GAP-.04?'Vacuum':'Fingers';lines.push([r.step,r.ref,r.value,r.package,r.side,tool,mm(r.grip),mm(r.pickX),mm(r.pickY),mm(r.placeX),mm(r.placeY),mm(r.rot)].map(csvCell).join(','))}
 return lines.join('\n')+'\n';
}
function splitRow(line,delim){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(q){if(c==='"'&&line[i+1]==='"'){cur+='"';i++}else if(c==='"')q=false;else cur+=c}else if(c==='"')q=true;else if(c===delim){out.push(cur.trim());cur=''}else cur+=c}out.push(cur.trim());return out}
// Reads a gripper program, or any pick-and-place / placement CSV that has a designator column, and
// returns the placement order. Rows keep file order unless a Step column says otherwise.
export function parseProgram(text,knownRefs=null){
 const lines=String(text||'').replace(/^﻿/,'').split(/\r?\n/).filter(l=>l.trim()&&!/^\s*(#|\/\/)/.test(l));
 if(!lines.length)throw Error('The file is empty.');
 const delim=[',',';','\t'].map(d=>[d,lines[0].split(d).length]).sort((a,b)=>b[1]-a[1])[0][0];
 const REF=/^(designator|ref|refdes|ref\.?\s*des|reference|part\s*ref|component|comp)$/i;
 let headerAt=-1,refCol=-1,stepCol=-1;
 for(let i=0;i<Math.min(lines.length,15)&&headerAt<0;i++){const cells=splitRow(lines[i],delim).map(c=>c.replace(/\(.*\)/,'').trim());const r=cells.findIndex(c=>REF.test(c));if(r>=0){headerAt=i;refCol=r;stepCol=cells.findIndex(c=>/^(step|seq|sequence|order|#)$/i.test(c))}}
 if(headerAt<0)throw Error('No Designator (or Ref) column found. Export a gripper program from the studio to see the format.');
 const rows=lines.slice(headerAt+1).map((l,i)=>{const c=splitRow(l,delim);return {ref:c[refCol]||'',step:stepCol>=0?Number(c[stepCol]):NaN,i}}).filter(r=>r.ref);
 if(rows.every(r=>Number.isFinite(r.step)))rows.sort((a,b)=>a.step-b.step||a.i-b.i);
 const seen=new Set(),order=[],unknown=[];
 for(const {ref} of rows){if(seen.has(ref.toUpperCase()))continue;seen.add(ref.toUpperCase());
  const match=knownRefs?knownRefs.find(k=>k.toUpperCase()===ref.toUpperCase()):ref;if(match)order.push(match);else unknown.push(ref)}
 if(!order.length)throw Error(unknown.length?`None of the ${unknown.length} designators in the file are on this board.`:'The file lists no designators.');
 return {order,unknown,missing:knownRefs?knownRefs.filter(k=>!seen.has(k.toUpperCase())):[]};
}

// --- Three.js end effector ------------------------------------------------------------------------
// The origin is the tool centre point: between the fingertips, or the tip of the extended nozzle.
export function createGripper(THREE){
 const root=new THREE.Group();root.name='gripper';
 const metal=c=>new THREE.MeshStandardMaterial({color:c,metalness:.65,roughness:.32});
 const parts=[];const add=(geo,mat,x,y,z,parent=root)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);parts.push(m);return m};
 const head=new THREE.Group();root.add(head);
 add(new THREE.CylinderGeometry(.075,.075,8,16),metal(0x8b9095),0,4.75,0,head);
 add(new THREE.CylinderGeometry(.24,.24,.3,28),metal(0x1d1f22),0,.8,0,head);
 add(new THREE.CylinderGeometry(.25,.25,.05,28),new THREE.MeshStandardMaterial({color:0xd9824a,emissive:0xd9824a,emissiveIntensity:.25,roughness:.4}),0,.62,0,head);
 add(new THREE.BoxGeometry(1.0,.16,.34),metal(0x2a2d31),0,.52,0,head);
 const rail=add(new THREE.BoxGeometry(MAX_GAP+.3,.05,.12),metal(0x5d6268),0,.43,0,head);rail.castShadow=false;
 const fingerGeo=new THREE.BoxGeometry(.08,.46,.28),fingerMat=metal(0xc9ced3),padMat=new THREE.MeshStandardMaterial({color:0x111214,roughness:.9});
 const fingers=[-1,1].map(side=>{const f=new THREE.Group();head.add(f);add(fingerGeo,fingerMat,0,.2,0,f);add(new THREE.BoxGeometry(.03,.2,.22),padMat,-side*.055,.02,0,f);return {group:f,side}});
 // Suction nozzle: a tube with a soft cup that slides down to the tool centre point when in use.
 const nozzle=new THREE.Group();head.add(nozzle);
 add(new THREE.CylinderGeometry(.05,.05,.42,16),metal(0xb4b9be),0,.21,0,nozzle);
 add(new THREE.CylinderGeometry(.11,.07,.06,20),new THREE.MeshStandardMaterial({color:0x1a1b1d,roughness:.85}),0,.03,0,nozzle);
 const setOpen=gap=>{for(const {group,side} of fingers)group.position.x=side*(gap/2+.04)};
 // vac 0..1: nozzle down to the tool point and fingers raised clear of the part.
 const setVac=v=>{nozzle.position.y=(1-v)*.36;for(const {group} of fingers)group.position.y=v*.55};
 setOpen(HOME.open);setVac(0);root.position.set(HOME.x,HOME.y,HOME.z);
 return {root,setOpen,setVac,meshes:parts};
}
