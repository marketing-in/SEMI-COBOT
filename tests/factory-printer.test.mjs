import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makePart} from '../src/blueprint.js';
import {planProduction} from '../src/factoryLine.js';
import {createKit} from '../src/factory/common.js';
import {build,timeline,pose,alignment,GAP} from '../src/factory/printer.js';

const board={width:60,height:40,layers:2,name:'T'};
const parts=[
 makePart({ref:'U1',mpn:'STM32F103C8T6',package:'LQFP-48',type:'chip',x:0,y:0}),
 makePart({ref:'U2',mpn:'ATSAMD21G18A-MU',package:'QFN-48',type:'chip',x:-18,y:10}),
 makePart({ref:'U3',mpn:'XC7A35T-1CPG236C',package:'BGA-236',type:'chip',x:18,y:-8,w:10,d:10}),
 makePart({ref:'C1',value:'100nF',package:'0402',type:'capacitor',x:-12,y:-12}),
 makePart({ref:'R1',value:'10k',package:'0201',type:'resistor',x:10,y:12,rot:90}),
 makePart({ref:'C2',value:'1uF',package:'0603',type:'capacitor',x:-20,y:-4,rot:45}),
];
const plan=planProduction(board,parts,{boards:5});
const make=k=>build(createKit(THREE,plan),{THREE,plan,result:plan.results[k],k});
// World matrices of every object plus the paste instance matrices: the whole visible state.
const snap=o=>{o.group.updateMatrixWorld(true);const out=[];o.group.traverse(m=>{out.push(...m.matrixWorld.elements);if(m.isInstancedMesh)out.push(...m.instanceMatrix.array.slice(0,m.count*16))});return out.map(v=>Math.round(v*1e9)/1e9)};
// Column lengths of instance i's matrix (decompose() reports 1 for a singular matrix).
const scaleOf=(mesh,i)=>{const m=new THREE.Matrix4();mesh.getMatrixAt(i,m);const e=m.elements,c=j=>Math.hypot(e[j],e[j+1],e[j+2]);return new THREE.Vector3(c(0),c(4),c(8))};

test('cycle time and steps follow the plan',()=>{
 const o=make(0);
 assert.ok(o.duration>0);assert.equal(o.duration,plan.times.printer);
 assert.ok(o.steps.length>=3&&o.steps.length<=12);assert.equal(o.steps[0].t,0);
 for(let i=1;i<o.steps.length;i++)assert.ok(o.steps[i].t>o.steps[i-1].t,'steps ascend');
 assert.ok(o.steps.at(-1).t<o.duration);for(const s of o.steps)assert.ok(s.label.length<=60);
 const tl=timeline(plan,0);assert.ok(Math.abs(tl.stroke-(board.height+30)/plan.printer.squeegee.speed)<1e-9,'stroke runs 15 mm past each board edge');
 assert.ok(Math.abs(tl.T.lower-tl.T.sep-plan.printer.separation)<1e-9);
 assert.ok(make(4).steps.some(s=>/wipe/i.test(s.label))&&!o.steps.some(s=>/wipe/i.test(s.label)),'wipe every 5th board');
});

test('update is deterministic and pure in t',()=>{
 const o=make(1),ts=Array.from({length:50},(_,i)=>i/49*o.duration);
 const first=ts.map(t=>{o.update(t);return snap(o)});
 for(const i of [37,3,49,0,20]){o.update(ts[i]);assert.deepEqual(snap(o),first[i],'same t → same scene at '+ts[i])}
 assert.notDeepEqual(first[0],first[25],'things move');
});

test('process order: fiducials, contact, stroke, separation',()=>{
 const tl=timeline(plan,0),T=tl.T;
 const at=t=>pose(tl,t);
 assert.ok(at(T.fid1+.1).cam[0]===tl.fid[0][0]&&at(T.fid1+.1).light===1,'camera over fiducial 1');
 assert.ok(at(T.fid2+.1).cam[1]===tl.fid[1][1]&&at(T.fid2+.1).light===1,'camera over fiducial 2');
 assert.equal(at(T.lift).lift,0,'board still down while the camera is out');
 assert.ok(Math.abs(at(T.stroke).lift-GAP)<1e-9&&at(T.stroke+.01).down===1,'board on the stencil, blade down');
 assert.ok(Math.abs(at(T.lower).lift-(GAP-3))<1e-9,'slow snap-off first');
 assert.equal(at(tl.D).lift,0);assert.ok(at(tl.D).bx>0,'board left towards SPI');
 const a=alignment(0);assert.ok(Math.abs(a.dx)<=.12&&Math.abs(a.rot)<=.15);
});

test('paste: none at the start, every deposit on the board at the end',()=>{
 const o=make(0),n=plan.pads.length,paste=o.board.paste;
 o.update(0);assert.equal(paste.count,n);
 for(let i=0;i<n;i++)assert.equal(scaleOf(paste,i).lengthSq(),0,'deposit hidden at t=0');
 for(let i=0;i<n;i++)assert.equal(scaleOf(o.fill,i).lengthSq(),0);
 const tl=o.timeline;o.update((tl.T.stroke+tl.T.sep)/2);
 let mid=0;for(let i=0;i<n;i++)if(scaleOf(o.fill,i).lengthSq()>0)mid++;
 assert.ok(mid>0&&mid<n,'apertures fill as the blade passes ('+mid+'/'+n+')');
 o.update(o.duration);assert.equal(paste.count,n);
 for(let i=0;i<n;i++){const s=scaleOf(paste,i);assert.ok(s.x>0&&s.y>0&&s.z>0,'deposit '+i+' visible')}
 for(let i=0;i<n;i++)assert.equal(scaleOf(o.fill,i).lengthSq(),0,'apertures empty after separation');
 o.update(0);for(let i=0;i<n;i++)assert.equal(scaleOf(paste,i).lengthSq(),0,'scrubbing back hides them again');
});
