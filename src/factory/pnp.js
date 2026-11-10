// Pick-and-place, inside: the board is clamped on the conveyor with fresh paste, the head camera reads
// both fiducials, then the gantry runs the placement program. Each cycle picks up to one part per
// nozzle from the tape feeders (or the matrix tray), shows them to the upward camera, turns each to its
// placement angle and sets it on its pads. The machine is the studio's rig (smtRig.js) playing the
// timeline from smtLine.js; the helpers below read the same timeline for the steps and the panel.
import {buildLine,sampleLine} from '../smtLine.js';
import {createSmtRig} from '../smtRig.js';

// Machine time from the board clamped (fiducial move) to the last part down, as smtRig.js plays it.
export function cycleWindow(line){
 const K=line.keys,tStart=(K.find(k=>k.phase==='fiducial')||K[0]).t,last=[...K].reverse().find(k=>k.phase==='place');
 return {tStart,tEnd:last?last.t+.05:tStart};
}
// Machine time each placement cycle starts: the first move towards a feeder after the fiducials or the
// previous cycle's last placement.
export function cycleStarts(line){const out=[];let prev=null;for(const k of line.keys){if(k.phase==='pick'&&prev!=='pick')out.push(k.t);prev=k.phase}return out}
// Every nozzle touchdown: a pick (part taken from its feeder) or a place (part released on the board).
export function events(line){
 const K=line.keys,out=[];
 for(let i=1;i<K.length;i++){const a=K[i-1],b=K[i];b.held.forEach((r,k)=>{if(b.z[k]!==1)return;if(r&&a.held[k]!==r)out.push({type:'pick',ref:r,nozzle:k,t:b.t});else if(!r&&a.held[k])out.push({type:'place',ref:a.held[k],nozzle:k,t:b.t})})}
 return out;
}
// What the machine is doing at machine time lt: fiducials, picking or placing one part, the vision
// check of the parts on the head, or done. `placed` counts parts on the board.
export function activity(line,ev,lt){
 const s=sampleLine(line,lt);if(!s)return {phase:'done',placed:0,cycle:-1};
 const starts=cycleStarts(line);let cycle=-1;for(let i=0;i<starts.length;i++)if(lt>=starts[i])cycle=i;
 const base={s,placed:s.placed,cycle};
 if(s.phase==='load'||s.phase==='fiducial')return {...base,phase:'fiducial'};
 if(s.phase==='vision')return {...base,phase:'vision',refs:s.held.filter(Boolean)};
 const e=s.phase==='unload'||s.phase==='done'?null:ev.find(x=>x.t>=lt);
 return e?{...base,phase:e.type,ref:e.ref,nozzle:e.nozzle}:{...base,phase:'done',placed:line.placeOrder.length};
}
// "Cycle 3 · R1, C3, U2" within 60 characters ("+2" for refs that do not fit).
const cycleLabel=(i,refs)=>{let s=`Cycle ${i+1} · `,n=0;for(const r of refs){const add=(n?', ':'')+r,rest=refs.length-n-1;if((s+add+(rest?` +${rest}`:'')).length>60)break;s+=add;n++}return n<refs.length?s+(n?' ':'')+'+'+(refs.length-n):s};
export function stepsFor(line){
 const {tStart}=cycleWindow(line),starts=cycleStarts(line),N=starts.length,steps=[{t:0,label:'Fiducial check'}];
 const shown=N>10?9:N;for(let i=0;i<shown;i++)steps.push({t:starts[i]-tStart,label:cycleLabel(i,line.cycles[i].places.map(p=>p.ref))});
 if(N>10)steps.push({t:starts[9]-tStart,label:`Cycles 10–${N}`});
 return steps;
}

export function build(kit,ctx){
 const {THREE,plan,result}=ctx,{S,M}=kit,g=new THREE.Group();
 // Board with printed paste; its part meshes are the ones the head carries (rig moves them by ref).
 const board=kit.makeBoard({stage:'paste',result}),meshByRef=board.parts;g.add(board.group);
 const heights={};for(const [ref,m] of meshByRef)heights[ref]=(m.userData.h+m.userData.lift)/S;
 const line=buildLine(plan.board,plan.machine,{nozzles:plan.opts.nozzles,rear:true,bankLen:plan.board.width+30,heights});
 const rig=createSmtRig(THREE,{line,board:plan.board,scale:S,top:0,meshByRef});g.add(rig.root);
 const duration=rig.tEnd-rig.tStart||1,rate=duration>60?duration/40:1,steps=stepsFor(line);
 // The rig hides parts still deep in their tape without moving them; park those in their feeder so
 // the scene is the same for the same t whatever was shown before (scrubbing).
 const feederOf=new Map();for(const f of line.feeders)for(const r of f.refs)feederOf.set(r,f);
 const update=t=>{rig.apply(rig.tStart+Math.max(0,Math.min(duration,t)));
  for(const [ref,m] of meshByRef){if(m.visible)continue;const f=feederOf.get(ref);if(f){m.position.set(M(f.x),m.userData.lift+m.userData.h/2,M(f.y));m.rotation.y=0}}};
 // Three-quarter view over the front feeder bank, framing the whole machine.
 const sph=rig.bounds.getBoundingSphere(new THREE.Sphere()),dist=sph.radius/Math.sin(17*Math.PI/180)*.78,dv=new THREE.Vector3(.22,.8,.78).normalize(),ty=M(8);
 const view={target:[0,ty,0],position:[dv.x*dist,ty+dv.y*dist,dv.z*dist]};
 update(0);
 return {group:g,duration,steps,update,rate,view,board,rig,line};
}
