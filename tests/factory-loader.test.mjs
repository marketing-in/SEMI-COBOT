import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makePart} from '../src/blueprint.js';
import {planProduction} from '../src/factoryLine.js';
import {createKit} from '../src/factory/common.js';
import {build,loaderNumbers,loaderState,PITCH} from '../src/factory/loader.js';

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
const make=(k=0)=>{const kit=createKit(THREE,plan);return build(kit,{THREE,plan,result:plan.results[k],k})};
const worldX=(o)=>{o.updateMatrixWorld(true);return o.getWorldPosition(new THREE.Vector3())};
const poses=(s,t)=>{s.update(t);s.group.updateMatrixWorld(true);const g=n=>s.group.getObjectByName(n);return [g('loader-board'),g('loader-lift'),g('loader-pusher').children[1]].map(o=>o.getWorldPosition(new THREE.Vector3()).toArray()).flat()};

test('cycle length, steps and determinism',()=>{
 const s=make();
 assert.ok(s.duration>0);assert.equal(s.duration,plan.times.loader);
 assert.ok(s.steps.length>=3&&s.steps.length<=12);assert.equal(s.steps[0].t,0);
 for(let i=1;i<s.steps.length;i++)assert.ok(s.steps[i].t>s.steps[i-1].t);
 assert.ok(s.steps.at(-1).t<s.duration);assert.ok(s.steps.every(x=>x.label.length<=60));
 const ts=Array.from({length:50},(_,i)=>i/49*s.duration),first=ts.map(t=>poses(s,t));
 // Scrub backwards: same t gives the same poses.
 [...ts].reverse().forEach((t,i)=>assert.deepEqual(poses(s,t),first[ts.length-1-i]));
});

test('the board starts in the magazine and ends past it on the conveyor',()=>{
 const s=make(),{magazineLeft:L,magazineRight:R}=s.group.userData,half=s.group.userData.numbers.W/2*createKit(THREE,plan).S*s.group.userData.scale;
 s.update(0);let b=worldX(s.group.getObjectByName('loader-board'));assert.ok(b.x>L&&b.x<R,'inside at t=0');assert.ok(b.y<-1e-6,'one pitch below the pass line before indexing');
 s.update(s.duration);b=worldX(s.group.getObjectByName('loader-board'));assert.ok(b.x-half>R,'whole board past the magazine at the end');assert.ok(Math.abs(b.y)<1e-9,'on the pass line');
});

test('the elevator indexes one pitch and the pusher returns',()=>{
 for(const k of [0,2,4]){const n=loaderNumbers(plan,k),a=loaderState(n,0),b=loaderState(n,n.D);
  assert.equal(n.remaining,5-k);assert.equal(n.shown,Math.min(5-k,8));
  assert.ok(Math.abs(b.lift-a.lift-PITCH)<1e-9);assert.ok(Math.abs(b.y)<1e-9);
  assert.ok(Math.abs(b.blade-n.bladeIn)<1e-9,'blade back behind the magazine');
  assert.ok(n.bladeIn<n.magL,'retracted blade clears the magazine while it indexes');
  // The board never moves backwards and never moves before the push.
  let last=-Infinity;for(let i=0;i<=200;i++){const s=loaderState(n,i/200*n.D);assert.ok(s.x>=last-1e-9);last=s.x;if(i/200<n.phases.push[0])assert.equal(s.x,0)}}
 assert.equal(loaderNumbers(plan,4).remaining,1);
 const big=planProduction(board,parts,{boards:20});assert.equal(loaderNumbers(big,0).shown,8);
});

test('later boards build without error and show fewer boards in the magazine',()=>{
 const a=make(0),b=make(4);
 const count=g=>g.getObjectByName('loader-lift').children.filter(o=>o.name==='loader-slot-board').length;
 assert.equal(count(a.group),4);assert.equal(count(b.group),0);
 assert.ok(count(a.group)>count(b.group));
});

test('small boards keep the station inside the orbit limit, and the blade touches the board',()=>{
 const tiny=planProduction({width:18,height:12,layers:2},[makePart({ref:'C1',package:'0402',type:'capacitor',x:0,y:0})],{boards:1});
 const s=build(createKit(THREE,tiny),{THREE,plan:tiny,result:tiny.results[0],k:0}),v=s.view;
 assert.ok(Math.hypot(...v.position.map((p,i)=>p-v.target[i]))<78,'camera within the shell maxDistance (80)');
 assert.ok(s.group.userData.scale<1);
 const n=loaderNumbers(plan,0),mid=loaderState(n,(n.phases.push[0]+n.phases.push[1])/2*n.D);
 assert.ok(Math.abs(mid.x-n.W/2-mid.blade)<1e-9,'trailing edge on the blade face while pushing');
});
