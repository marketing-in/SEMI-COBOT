import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makePart} from '../src/blueprint.js';
import {planProduction,SPEC} from '../src/factoryLine.js';
import {createKit,COLORS} from '../src/factory/common.js';
import {build,aoiNumbers,aoiState,aoiSummary} from '../src/factory/aoi.js';

const board={width:60,height:40,layers:2,name:'T'};
const parts=[
 makePart({ref:'U1',mpn:'STM32F103C8T6',package:'LQFP-48',type:'chip',x:0,y:0}),
 makePart({ref:'U2',mpn:'ATSAMD21G18A-MU',package:'QFN-48',type:'chip',x:-18,y:10}),
 makePart({ref:'U3',mpn:'XC7A35T-1CPG236C',package:'BGA-236',type:'chip',x:18,y:-8,w:10,d:10}),
 makePart({ref:'C1',value:'100nF',package:'0402',type:'capacitor',x:-12,y:-12}),
 makePart({ref:'R1',value:'10k',package:'0201',type:'resistor',x:10,y:12,rot:90}),
 makePart({ref:'R2',value:'1k',package:'0603',type:'resistor',x:-4,y:14,rot:45}),
 makePart({ref:'C2',value:'10uF',package:'0805',type:'capacitor',x:22,y:14}),
 makePart({ref:'D1',package:'SOD-123',type:'diode',x:-24,y:-14,rot:180}),
];
const plan=planProduction(board,parts,{boards:12});
// A board with forced defects (the simulated line rarely produces AOI defects on so few parts).
const flawed={...plan.results[0],aoi:plan.results[0].aoi.map(a=>a.ref==='R2'?{...a,dx:.12,defects:['Offset'],pass:false}:a.ref==='C1'?{...a,defects:['Tombstone'],pass:false}:a)};
const make=(k=0,result=plan.results[k])=>build(createKit(THREE,plan),{THREE,plan,result,k});
const NAMES=['aoi-board','aoi-beam','aoi-head','aoi-fov','aoi-stopper'];
const poses=(s,t)=>{const r=s.update(t);s.group.updateMatrixWorld(true);const o=s.group.getObjectByName('aoi-outlines');
 return NAMES.map(n=>s.group.getObjectByName(n).getWorldPosition(new THREE.Vector3()).toArray()).flat().concat([o.geometry.drawRange.count,+o.visible,+s.group.getObjectByName('aoi-flags').visible,JSON.stringify(r??null)])};
// Colour of each visible outline (one per part, in scan order).
const outlineColours=s=>{const o=s.group.getObjectByName('aoi-outlines'),V=o.userData.perPart,col=o.geometry.attributes.color.array,n=o.visible?Math.min(o.geometry.drawRange.count,o.geometry.attributes.position.count)/V:0;
 return Array.from({length:n},(_,i)=>{const k=i*V*3;for(let v=1;v<V;v++)for(let j=0;j<3;j++)assert.equal(col[k+v*3+j],col[k+j]);return new THREE.Color(col[k],col[k+1],col[k+2]).getHex()})};

test('cycle length, steps and determinism',()=>{
 const s=make();
 assert.ok(s.duration>0);assert.equal(s.duration,Math.max(6,plan.times.aoi));
 assert.ok(s.steps.length>=3&&s.steps.length<=12);assert.equal(s.steps[0].t,0);
 for(let i=1;i<s.steps.length;i++)assert.ok(s.steps[i].t>s.steps[i-1].t);
 assert.ok(s.steps.at(-1).t<s.duration);assert.ok(s.steps.every(x=>x.label.length>0&&x.label.length<=60));
 const ts=Array.from({length:50},(_,i)=>i/49*s.duration),first=ts.map(t=>poses(s,t));
 [...ts].reverse().forEach((t,i)=>assert.deepEqual(poses(s,t),first[ts.length-1-i]));
 // The head moves during the scan.
 assert.notDeepEqual(poses(s,s.duration*.3).slice(6,9),poses(s,s.duration*.6).slice(6,9));
});

test('no outlines at t=0; every part outlined in its result colour at the end',()=>{
 const want=hex=>new THREE.Color().setHex(hex).getHex();
 for(const r of [plan.results[0],plan.results[3],flawed]){const s=make(0,r),n=aoiNumbers(plan,r);
  s.update(0);assert.equal(outlineColours(s).length,0);
  s.update(s.duration);const got=outlineColours(s),o=s.group.getObjectByName('aoi-outlines');
  assert.equal(got.length,plan.machine.length);
  o.userData.refs.forEach((ref,i)=>{const a=r.aoi.find(x=>x.ref===ref);assert.equal(got[i],want(a.pass?COLORS.pass:COLORS.fail),ref)});
  assert.deepEqual([...o.userData.refs].sort(),plan.machine.map(p=>p.ref).sort());
  assert.equal(s.group.getObjectByName('aoi-flags').count,r.aoi.filter(a=>!a.pass).length);
  assert.equal(s.group.getObjectByName('aoi-flags').visible,r.aoi.some(a=>!a.pass));
  // Scrub back to the start: outlines go away again.
  s.update(0);assert.equal(outlineColours(s).length,0);
  assert.equal(n.N,plan.machine.length)}
 const s=make(0,flawed);s.update(s.duration);assert.equal(s.group.getObjectByName('aoi-flags').count,2);
 assert.ok(s.steps.some(x=>/^NG: 2\/8 parts/.test(x.label)));
});

test('serpentine scan: rows by y, alternating x; head over each part while imaging',()=>{
 const n=aoiNumbers(plan,plan.results[0]);
 for(let i=1;i<n.order.length;i++){const a=n.order[i-1],b=n.order[i];assert.ok(b.row>=a.row);
  if(b.row===a.row)assert.ok(a.row%2?b.x<=a.x:b.x>=a.x,`${a.ref}→${b.ref}`);else assert.ok(b.y>a.y-15)}
 assert.ok(n.rows>=2);
 let last=-1,seen=new Set(),sides=new Set();
 for(let i=0;i<=3000;i++){const t=i/3000*n.D,s=aoiState(n,t);assert.ok(s.done>=last);last=s.done;
  if(s.cur>=0&&(s.top||s.side>=0)){const o=n.order[s.cur];assert.ok(Math.hypot(s.head[0]-o.x,s.head[1]-o.y)<1e-9);seen.add(o.ref)}
  if(s.side>=0)sides.add(s.side);if(s.top)assert.ok(s.ring)}
 assert.equal(seen.size,n.N);assert.deepEqual([...sides].sort(),[0,1,2,3]);
 assert.equal(aoiState(n,0).done,0);assert.equal(aoiState(n,n.D).done,n.N);
 assert.ok(n.T.s0<n.T.s1&&n.T.s1<=n.T.judge&&n.T.judge<n.T.out&&n.T.out<n.D);
});

test('summary numbers match the inspection results and the spec',()=>{
 for(const r of plan.results){const n=aoiNumbers(plan,r),s=aoiSummary(n);
  assert.equal(s.inspected,r.aoi.length);assert.equal(s.fail,r.counts.aoiFail);assert.equal(s.pass+s.fail,r.aoi.length);
  for(const a of r.aoi){const off=Math.hypot(a.dx,a.dy)>SPEC.aoi.offset,rot=Math.abs(a.rot)>SPEC.aoi.rotation;
   assert.equal(a.defects.includes('Offset'),off);assert.equal(a.defects.includes('Rotation'),rot);assert.equal(a.pass,!a.defects.length)}
  assert.equal(Object.values(s.by).reduce((x,y)=>x+y,0),r.aoi.reduce((x,a)=>x+a.defects.length,0));
  assert.equal(aoiSummary(n,0).inspected,0)}
});

test('empty and large boards build',()=>{
 const empty=planProduction({width:30,height:20,layers:2},[],{boards:1}),s=build(createKit(THREE,empty),{THREE,plan:empty,result:empty.results[0],k:0});
 assert.ok(s.duration>=6);for(let i=1;i<s.steps.length;i++)assert.ok(s.steps[i].t>s.steps[i-1].t);
 for(let i=0;i<=20;i++)s.update(i/20*s.duration);
 const many=[];for(let i=0;i<300;i++)many.push(makePart({ref:'C'+i,value:'100nF',package:'0402',type:'capacitor',x:-70+(i%30)*4.8,y:-45+Math.floor(i/30)*9,rot:(i%4)*90}));
 const big=planProduction({width:160,height:100,layers:4},many,{boards:1}),b=build(createKit(THREE,big),{THREE,plan:big,result:big.results[0],k:0});
 assert.ok(b.steps.length<=12);b.update(b.duration);assert.equal(outlineColours(b).length,300);
 let lines=0;b.group.traverse(o=>{if(o.isLineSegments)lines++});assert.equal(lines,2); // merged outlines + FOV square
});
