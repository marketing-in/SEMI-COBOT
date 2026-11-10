import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makePart} from '../src/blueprint.js';
import {planProduction,SPEC} from '../src/factoryLine.js';
import {createKit,COLORS} from '../src/factory/common.js';
import {build,spiNumbers,spiState,spiSummary} from '../src/factory/spi.js';

const board={width:60,height:40,layers:2,name:'T'};
const parts=[
 makePart({ref:'U1',mpn:'STM32F103C8T6',package:'LQFP-48',type:'chip',x:0,y:0}),
 makePart({ref:'U2',mpn:'ATSAMD21G18A-MU',package:'QFN-48',type:'chip',x:-18,y:10}),
 makePart({ref:'U3',mpn:'XC7A35T-1CPG236C',package:'BGA-236',type:'chip',x:18,y:-8,w:10,d:10}),
 makePart({ref:'C1',value:'100nF',package:'0402',type:'capacitor',x:-12,y:-12}),
 makePart({ref:'R1',value:'10k',package:'0201',type:'resistor',x:10,y:12,rot:90}),
 makePart({ref:'R2',value:'1k',package:'0603',type:'resistor',x:-4,y:14,rot:45}),
];
const plan=planProduction(board,parts,{boards:5});
const make=(k=0)=>build(createKit(THREE,plan),{THREE,plan,result:plan.results[k],k});
const hex=h=>new THREE.Color().setHex(h).getHex();
const colours=s=>{const p=s.group.getObjectByName('spi-paste'),c=new THREE.Color();return Array.from({length:p.count},(_,i)=>p.getColorAt(i,c).getHex())};
const poses=(s,t)=>{s.update(t);s.group.updateMatrixWorld(true);return ['spi-board','spi-beam','spi-head','spi-stopper','spi-fov'].map(n=>s.group.getObjectByName(n).getWorldPosition(new THREE.Vector3()).toArray()).flat()
 .concat(Array.from(s.group.getObjectByName('spi-fringe').instanceMatrix.array.slice(0,48)),colours(s))};

test('cycle length, steps and determinism',()=>{
 const s=make();
 assert.ok(s.duration>0);assert.equal(s.duration,plan.times.spi);
 assert.ok(s.steps.length>=3&&s.steps.length<=12);assert.equal(s.steps[0].t,0);
 for(let i=1;i<s.steps.length;i++)assert.ok(s.steps[i].t>s.steps[i-1].t);
 assert.ok(s.steps.at(-1).t<s.duration);assert.ok(s.steps.every(x=>x.label.length<=60));
 const ts=Array.from({length:50},(_,i)=>i/49*s.duration),first=ts.map(t=>poses(s,t));
 [...ts].reverse().forEach((t,i)=>assert.deepEqual(poses(s,t),first[ts.length-1-i]));
});

test('deposits are paste colour at t=0 and their status colour at the end',()=>{
 for(const k of [0,3]){const s=make(k),r=plan.results[k];
  s.update(0);assert.ok(colours(s).every(c=>c===hex(COLORS.paste)));
  s.update(s.duration);const want=r.deposits.map(d=>hex(COLORS[d.status]));assert.deepEqual(colours(s),want);
  // Back to the start again: scrubbing resets the colours.
  s.update(0);assert.ok(colours(s).every(c=>c===hex(COLORS.paste)))}
});

test('FOV raster covers the board in 2–40 tiles, each deposit inside its FOV, recoloured in scan order',()=>{
 const r=plan.results[0],n=spiNumbers(plan,r);
 assert.ok(n.tiles.length>=2&&n.tiles.length<=40);assert.equal(n.tiles.length,n.nx*n.ny);
 r.deposits.forEach((d,j)=>{const p=n.tiles[n.tileOf[j]];assert.ok(Math.abs(d.x-p.x)<=n.fw/2+1e-6&&Math.abs(d.y-p.z)<=n.fh/2+1e-6,`${d.ref}.${d.i} in its FOV`)});
 // Serpentine: consecutive tiles are neighbours.
 for(let i=1;i<n.tiles.length;i++){const a=n.tiles[i-1],b=n.tiles[i];assert.equal(Math.abs(a.row-b.row)+Math.abs(a.col-b.col),1)}
 // Tiles finish one after another; measured count never decreases; the head sits over a tile while it captures.
 let last=-1;for(let i=0;i<=400;i++){const t=i/400*n.D,s=spiState(n,t);assert.ok(s.done>=last);last=s.done;
  if(s.capture){const p=n.tiles[s.tile];assert.ok(Math.hypot(s.head[0]-p.x,s.head[1]-p.z)<1e-6);assert.ok(s.projector===0||s.projector===1)}}
 assert.equal(spiState(n,0).done,0);assert.equal(spiState(n,n.D).done,n.tiles.length);
 // Both projectors fire 4 phase shifts per FOV.
 const shots=new Set();for(let i=0;i<2000;i++){const s=spiState(n,n.T.s0+i/2000*n.dt);if(s.capture)shots.add(s.projector+':'+s.phase)}assert.equal(shots.size,8);
 // Big and tiny boards stay within 2–40 tiles.
 for(const b of [{width:300,height:250},{width:18,height:12},{width:160,height:100}]){const p=planProduction({...b,layers:2},parts.map(q=>({...q,x:0,y:0})),{boards:1}),m=spiNumbers(p,p.results[0]);assert.ok(m.tiles.length>=2&&m.tiles.length<=40,`${b.width}×${b.height}: ${m.tiles.length}`)}
});

test('summary numbers match the inspection results',()=>{
 const r=plan.results[1],n=spiNumbers(plan,r),sum=spiSummary(n,r);
 assert.equal(sum.measured,r.deposits.length);assert.equal(sum.fail,r.counts.spiFail);assert.equal(sum.warn,r.counts.spiWarn);
 assert.equal(sum.pass+sum.warn+sum.fail,r.deposits.length);
 assert.equal(sum.buckets.reduce((t,b)=>t+b.pass+b.warn+b.fail,0),r.deposits.length);
 const mean=r.deposits.reduce((t,d)=>t+d.volume,0)/r.deposits.length;assert.ok(Math.abs(sum.mean-mean)<.01);
 for(const d of r.deposits){const s=SPEC.spi,want=d.volume<s.min||d.volume>s.max?'fail':d.volume<s.warnLow||d.volume>s.warnHigh?'warn':'pass';assert.equal(d.status,want)}
 assert.equal(spiSummary(n,r,0).measured,0);
});
