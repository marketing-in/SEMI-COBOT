import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makePart} from '../src/blueprint.js';
import {planProduction} from '../src/factoryLine.js';
import {createKit} from '../src/factory/common.js';
import {build,cycleWindow,cycleStarts,events,activity,stepsFor} from '../src/factory/pnp.js';
import {buildLine} from '../src/smtLine.js';

const board={width:60,height:40,layers:2,name:'T'};
const parts=[
 makePart({ref:'U1',mpn:'STM32F103C8T6',package:'LQFP-48',type:'chip',x:0,y:0}),
 makePart({ref:'U2',mpn:'ATSAMD21G18A-MU',package:'QFN-48',type:'chip',x:-18,y:10}),
 makePart({ref:'U3',mpn:'XC7A35T-1CPG236C',package:'BGA-236',type:'chip',x:18,y:-8,w:10,d:10}),
 makePart({ref:'C1',value:'100nF',package:'0402',type:'capacitor',x:-12,y:-12}),
 makePart({ref:'C3',value:'100nF',package:'0402',type:'capacitor',x:-6,y:-12}),
 makePart({ref:'R1',value:'10k',package:'0201',type:'resistor',x:10,y:12,rot:90}),
 makePart({ref:'C2',value:'1uF',package:'0603',type:'capacitor',x:-20,y:-4,rot:45}),
];
const plan=planProduction(board,parts,{boards:3,nozzles:2});
const make=(p=plan,k=0)=>build(createKit(THREE,p),{THREE,plan:p,result:p.results[k],k});
const snap=o=>{o.group.updateMatrixWorld(true);const out=[];o.group.traverse(m=>{out.push(...m.matrixWorld.elements,m.visible?1:0)});return out.map(v=>Math.round(v*1e9)/1e9)};
const near=(a,b)=>a.distanceTo(b)<1e-9;

test('cycle time and steps follow the placement program',()=>{
 const o=make();
 assert.ok(o.duration>0);assert.equal(o.duration,o.rig.tEnd-o.rig.tStart);
 assert.equal(o.rate,o.duration>60?o.duration/40:1);
 assert.ok(o.steps.length>=3&&o.steps.length<=12);assert.equal(o.steps[0].t,0);assert.match(o.steps[0].label,/Fiducial/);
 for(let i=1;i<o.steps.length;i++)assert.ok(o.steps[i].t>o.steps[i-1].t,'steps ascend');
 assert.ok(o.steps.at(-1).t<o.duration);for(const s of o.steps)assert.ok(s.label.length<=60);
 assert.equal(cycleStarts(o.line).length,o.line.cycles.length,'one start per cycle');
 assert.equal(o.steps.length,1+o.line.cycles.length);
 o.line.cycles.forEach((c,i)=>assert.ok(o.steps[i+1].label.startsWith(`Cycle ${i+1} · `+c.places[0].ref)));
 // The rig's line (rendered stroke heights) keeps the plan's timing, so the panel can read plan.line.
 assert.deepEqual(cycleWindow(plan.line),{tStart:o.rig.tStart,tEnd:o.rig.tEnd});
 assert.deepEqual(stepsFor(plan.line),o.steps);
});

test('more than 10 cycles: first 9 and a summary step',()=>{
 const many=Array.from({length:23},(_,i)=>makePart({ref:'R'+(i+1),value:'10k',package:'0402',type:'resistor',x:-25+(i%8)*7,y:-14+Math.floor(i/8)*12}));
 const p=planProduction(board,many,{boards:1,nozzles:2}),st=stepsFor(p.line);
 assert.equal(p.line.cycles.length,12);assert.equal(st.length,11);assert.equal(st.at(-1).label,'Cycles 10–12');
 for(const s of st)assert.ok(s.label.length<=60);
 const eight=planProduction(board,Array.from({length:8},(_,i)=>makePart({ref:'C1'+String(i).padStart(4,'0'),value:'1u',package:'0402',type:'capacitor',x:-25+i*7,y:0})),{nozzles:8});
 assert.ok(stepsFor(eight.line).every(s=>s.label.length<=60));
});

test('update is deterministic and pure in t',()=>{
 const o=make(plan,1),ts=Array.from({length:50},(_,i)=>i/49*o.duration);
 const first=ts.map(t=>{o.update(t);return snap(o)});
 for(const i of [37,3,49,0,20,12]){o.update(ts[i]);assert.deepEqual(snap(o),first[i],'same t → same scene at '+ts[i])}
 assert.notDeepEqual(first[0],first[25],'the head moves');
});

test('end state: every part on its pads at the end, none at the start',()=>{
 const o=make(),meshes=[...o.board.parts.values()];
 assert.equal(meshes.length,plan.machine.length);
 o.update(0);for(const m of meshes)assert.ok(!near(m.position,m.userData.base),m.userData.part.ref+' not placed at t=0');
 o.update(o.duration);for(const m of meshes){assert.ok(m.visible);assert.ok(near(m.position,m.userData.base),m.userData.part.ref+' on its pads');assert.equal(m.rotation.y,m.userData.baseRot)}
 o.update(0);for(const m of meshes)assert.ok(!near(m.position,m.userData.base),'scrubbing back lifts them off again');
 assert.ok(o.rig.error.mm<1e-6&&o.rig.error.deg<1e-6,'placed on the program coordinates');
});

test('process order: fiducials, then pick → vision → place per cycle',()=>{
 const line=plan.line,ev=events(line),{tStart,tEnd}=cycleWindow(line);
 assert.equal(ev.filter(e=>e.type==='pick').length,plan.machine.length);assert.equal(ev.filter(e=>e.type==='place').length,plan.machine.length);
 assert.deepEqual(ev.filter(e=>e.type==='place').map(e=>e.ref),line.placeOrder);
 const starts=cycleStarts(line);
 line.cycles.forEach((c,i)=>{const a=starts[i],b=starts[i+1]??Infinity,inC=ev.filter(e=>e.t>=a&&e.t<b);
  const lastPick=Math.max(...inC.filter(e=>e.type==='pick').map(e=>e.t)),firstPlace=Math.min(...inC.filter(e=>e.type==='place').map(e=>e.t));
  assert.ok(lastPick<firstPlace,'all picks before any place in cycle '+(i+1));
  const vis=line.keys.find(k=>k.phase==='vision'&&k.t>=lastPick&&k.t<=firstPlace);assert.ok(vis,'vision between pick and place');
  assert.deepEqual(inC.filter(e=>e.type==='place').map(e=>e.ref),c.places.map(p=>p.ref))});
 assert.equal(activity(line,ev,tStart).phase,'fiducial');
 const p0=ev.find(e=>e.type==='place');assert.equal(activity(line,ev,p0.t-.01).ref,p0.ref);assert.equal(activity(line,ev,p0.t-.01).phase,'place');
 const done=activity(line,ev,tEnd);assert.equal(done.phase,'done');assert.equal(done.placed,plan.machine.length);
 // A rotated part leaves the camera already turned to its angle.
 const r1=ev.find(e=>e.type==='place'&&e.ref==='R1'),k=line.keys.find(x=>x.t===r1.t);const before=line.keys[line.keys.indexOf(k)-1];assert.equal(before.rot[r1.nozzle],90);
});

test('rendered stroke heights do not change timing',()=>{
 const a=buildLine(plan.board,plan.machine,{nozzles:2,rear:true,bankLen:plan.board.width+30});
 assert.deepEqual(a.keys.map(k=>k.t),make().line.keys.map(k=>k.t));
});
