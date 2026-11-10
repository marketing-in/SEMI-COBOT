import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makePart} from '../src/blueprint.js';
import {planProduction} from '../src/factoryLine.js';
import {createKit} from '../src/factory/common.js';
import {build} from '../src/factory/xray.js';
import {xrayTimeline,windowAt,drawRadiograph} from '../src/factory/radiograph.js';

const board={width:60,height:40,layers:2};
const parts=[
 makePart({ref:'U1',mpn:'STM32F103C8T6',package:'LQFP-48',type:'chip',x:0,y:0,rot:90}),
 makePart({ref:'U2',mpn:'ATSAMD21G18A-MU',package:'QFN-48',type:'chip',x:-18,y:10}),
 makePart({ref:'U3',mpn:'XC7A35T',package:'BGA-236',type:'chip',x:18,y:-8,w:10,d:10}),
 makePart({ref:'C1',value:'100nF',package:'0402',type:'capacitor',x:-12,y:-12}),
];
const make=ps=>{const plan=planProduction(board,ps);const kit=createKit(THREE,plan);return {plan,kit,x:build(kit,{THREE,plan,result:plan.results[0],k:0})}};

test('the cycle matches the planned X-ray time and inspects each hidden-joint part in turn',()=>{
 const {plan,x}=make(parts),tl=xrayTimeline(plan);
 assert.equal(x.duration,plan.times.xray);assert.deepEqual(tl.windows.map(w=>w.ref),['U2','U3']);
 for(let i=1;i<x.steps.length;i++)assert.ok(x.steps[i].t>x.steps[i-1].t);assert.ok(x.steps.at(-1).t<x.duration);
});

test('the tray centres each part over the tube while the beam is on',()=>{
 const {plan,kit,x}=make(parts),tl=xrayTimeline(plan);const tray=x.group.children.find(c=>c.isGroup&&c.children.some(k=>k.isGroup));
 for(const w of tl.windows){const p=plan.machine.find(q=>q.ref===w.ref);x.update((w.t0+w.t1)/2);
  assert.ok(Math.abs(tray.position.x/kit.S+p.x)<.5&&Math.abs(tray.position.z/kit.S+p.y)<.5,`${w.ref} over the source`);
  const beam=x.group.children.find(c=>c.isMesh&&c.geometry.type==='CylinderGeometry'&&c.material.transparent&&c.material.side===THREE.DoubleSide);assert.ok(beam.visible,'beam on')}
 x.update(0);assert.ok(tray.position.x<0,'the board comes in from the left');x.update(x.duration);assert.ok(tray.position.x>0,'and leaves to the right');
});

test('update is pure in t',()=>{
 const {x}=make(parts),snap=()=>{const out=[];x.group.updateMatrixWorld(true);x.group.traverse(o=>{if(o.isMesh||o.isGroup)out.push(o.matrixWorld.elements.map(v=>v.toFixed(5)).join(','))});return out.join('|')};
 const ts=Array.from({length:50},(_,i)=>i/49*x.duration);for(const t of ts)x.update(t);x.update(4.2);const a=snap();x.update(11);x.update(4.2);assert.equal(snap(),a);
});

test('a board with no ICs passes straight through; without hidden joints the largest leaded IC is sampled',()=>{
 const none=make(parts.filter(p=>p.ref==='C1'));assert.equal(none.plan.xrayMode,'none');assert.ok(none.x.duration<=4);assert.equal(none.x.steps.length,1);
 const sample=make(parts.filter(p=>['U1','C1'].includes(p.ref)));assert.equal(sample.plan.xrayMode,'sample');assert.deepEqual(xrayTimeline(sample.plan).windows.map(w=>w.ref),['U1']);
});

test('the radiograph draws on a plain 2D context for every joint type',()=>{
 const {plan}=make(parts),calls={n:0};
 const g=new Proxy({},{get:(o,k)=>k==='createRadialGradient'?()=>({addColorStop(){}}):typeof k==='string'&&/^(fill|stroke|font|textAlign|textBaseline|lineWidth|globalAlpha)/.test(k)&&!/^(fillRect|fillText|fill|stroke|strokeRect)$/.test(k)?o[k]:(...a)=>{calls.n++},set:(o,k,v)=>{o[k]=v;return true}});
 for(const ref of ['U2','U3',null])drawRadiograph(g,640,420,plan,plan.results[0],ref,{tilt:.5,scan:.3,live:true});
 assert.ok(calls.n>500,'joints, voids, grain and readout are drawn');
 assert.equal(windowAt(xrayTimeline(plan),0),null);
});

test('the detector reads each frame out row by row, then goes live for the oblique views',async()=>{
 const {scanState}=await import('../src/factory/radiograph.js');const {plan}=make(parts),tl=xrayTimeline(plan),w=tl.windows[0];
 assert.equal(scanState(tl,0).reveal,null,'nothing before the board is in');
 assert.equal(scanState(tl,w.t0+.5).reveal,0);assert.ok(Math.abs(scanState(tl,w.t0+1.6).reveal-.5)<.01,'half the frame read out');assert.equal(scanState(tl,w.t0+2.5).reveal,1);
 assert.equal(scanState(tl,w.t0+1).tilt,0,'top view first');assert.equal(scanState(tl,w.t0+4).tilt,1,'then oblique');assert.ok(scanState(tl,w.t0+4).on);
});
