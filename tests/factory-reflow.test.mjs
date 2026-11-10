import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makePart} from '../src/blueprint.js';
import {planProduction,LIQUIDUS} from '../src/factoryLine.js';
import {createKit,COLORS} from '../src/factory/common.js';
import {build,reflowNumbers,zoneHeat} from '../src/factory/reflow.js';

const board={width:60,height:40,layers:2,name:'T'};
const parts=[
 makePart({ref:'U1',mpn:'STM32F103C8T6',package:'LQFP-48',type:'chip',x:0,y:0}),
 makePart({ref:'U2',mpn:'ATSAMD21G18A-MU',package:'QFN-48',type:'chip',x:-18,y:10}),
 makePart({ref:'U3',mpn:'XC7A35T-1CPG236C',package:'BGA-236',type:'chip',x:18,y:-8,w:10,d:10}),
 makePart({ref:'C1',value:'100nF',package:'0402',type:'capacitor',x:-12,y:-12}),
 makePart({ref:'R1',value:'10k',package:'0603',type:'resistor',x:10,y:12,rot:90}),
 makePart({ref:'R2',value:'1k',package:'0603',type:'resistor',x:-4,y:14,rot:45}),
];
const plan=planProduction(board,parts,{boards:3});
const make=(k=0)=>build(createKit(THREE,plan),{THREE,plan,result:plan.results[k],k});
const hex=h=>new THREE.Color().setHex(h).getHex();
const colours=s=>{const p=s.group.getObjectByName('reflow-paste'),c=new THREE.Color();return Array.from({length:p.count},(_,i)=>p.getColorAt(i,c).getHex())};
const boardX=(s,t)=>{s.update(t);s.group.updateMatrixWorld(true);return s.group.getObjectByName('reflow-board').getWorldPosition(new THREE.Vector3()).x};
const poses=(s,t)=>{const r=s.update(t);s.group.updateMatrixWorld(true);const out=[...r.target,...s.group.getObjectByName('reflow-board').getWorldPosition(new THREE.Vector3()).toArray()];
 s.group.traverse(o=>{if(o.name==='reflow-fan')out.push(o.rotation.y)});return out.concat(Array.from(s.group.getObjectByName('reflow-chain').instanceMatrix.array.slice(0,64)),colours(s))};

test('cycle length, steps and determinism',()=>{
 const s=make();
 assert.ok(s.duration>0);assert.equal(s.duration,plan.reflow.dwell);
 assert.ok(Math.abs(s.rate-s.duration/30)<1e-9);
 assert.ok(s.steps.length>=3&&s.steps.length<=12);assert.equal(s.steps[0].t,0);
 for(let i=1;i<s.steps.length;i++)assert.ok(s.steps[i].t>s.steps[i-1].t);
 assert.ok(s.steps.at(-1).t<s.duration);assert.ok(s.steps.every(x=>x.label.length<=60));
 const ts=Array.from({length:50},(_,i)=>i/49*s.duration),first=ts.map(t=>poses(s,t));
 [...ts].reverse().forEach((t,i)=>assert.deepEqual(poses(s,t),first[ts.length-1-i]));
});

test('board moves through the oven at conveyor speed and leaves past the exit',()=>{
 const s=make(),n=reflowNumbers(plan),k=s.group.userData.scale;
 let last=-Infinity;for(let i=0;i<=60;i++){const x=boardX(s,i/60*s.duration);assert.ok(x>last);last=x}
 assert.ok(boardX(s,s.duration)>=s.group.userData.exitX-1e-9);
 assert.ok(boardX(s,0)<s.group.userData.exitX-n.L*k*.99);
 // Speed: displacement over a mid-run interval matches plan.reflow.speed.
 const a=boardX(s,100),b=boardX(s,150);assert.ok(Math.abs((b-a)/k/50-plan.reflow.speed)<.05);
 // Camera target follows the board.
 const r=s.update(120);s.group.updateMatrixWorld(true);assert.ok(Math.abs(r.target[0]-s.group.getObjectByName('reflow-board').getWorldPosition(new THREE.Vector3()).x)<1e-9);
});

test('paste turns to solder at liquidus, not before; scrubbing back reverts',()=>{
 const s=make(),n=reflowNumbers(plan),tl=n.times.tLiq;assert.ok(tl>0&&tl<s.duration);
 const paste=hex(COLORS.paste),solder=hex(COLORS.solder);
 for(const t of [0,tl*.5,tl-.05]){s.update(t);assert.ok(colours(s).every(c=>c===paste),`paste at ${t}`)}
 for(const t of [tl+.05,n.times.tPeak,s.duration]){s.update(t);assert.ok(colours(s).every(c=>c===solder),`solder at ${t}`)}
 s.update(1);assert.ok(colours(s).every(c=>c===paste));
 assert.ok(n.TAt(tl-.5)<LIQUIDUS&&n.TAt(tl+.5)>=LIQUIDUS);
});

test('profile phases are in process order and match the planned metrics',()=>{
 const n=reflowNumbers(plan),T=n.times,R=plan.reflow;
 assert.ok(0<T.t150&&T.t150<T.tLiq&&T.tLiq<T.tPeak&&T.tPeak<T.tCool&&T.tCool<T.tExit&&T.tExit<n.D);
 assert.ok(Math.abs(n.TAt(T.t150)-150)<.5&&Math.abs(n.TAt(T.tCool)-LIQUIDUS)<.5);
 assert.ok(Math.abs((T.tCool-T.tLiq)-R.tal)<3,'time above liquidus');
 assert.ok(Math.abs(n.TAt(T.tPeak)-R.peak)<1.5,'peak');
 // Board is in the reflow zones at peak and in a cooling zone after it drops below liquidus.
 assert.match(R.zones[n.zoneAt(T.tPeak)].name,/Reflow/);assert.match(R.zones[n.zoneAt(Math.min(n.D,T.tCool+10))].name,/Reflow 3|Cooling/);
 assert.equal(n.zoneTimes.length,R.zones.length);assert.ok(Math.abs(n.zoneTimes.at(-1).t1-n.L/R.speed)<.01&&n.zoneTimes.at(-1).t1<=n.D);
 // Heater glow: hotter zones glow more; cooling zones are not heated.
 assert.ok(zoneHeat({name:'Reflow 2',set:248}).intensity>zoneHeat({name:'Preheat 1',set:110}).intensity);
 assert.equal(zoneHeat({name:'Cooling 1',set:110}).f,0);
});
