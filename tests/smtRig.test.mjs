import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makePart} from '../src/blueprint.js';
import {buildLine} from '../src/smtLine.js';
import {createSmtRig} from '../src/smtRig.js';

const board={width:60,height:40};
const parts=[
 makePart({ref:'C1',value:'100nF',package:'0603',type:'capacitor',x:-10,y:-5}),
 makePart({ref:'C2',value:'100nF',package:'0603',type:'capacitor',x:10,y:5,rot:90}),
 makePart({ref:'U1',mpn:'STM32F103C8T6',package:'LQFP-48',type:'chip',x:0,y:0,rot:45}),
 makePart({ref:'J1',mpn:'PJ-002A',package:'DC jack',type:'connector',x:-24,y:0,leads:'tht'}),
];
const scale=.15,top=.09;
const meshes=()=>{const m=new Map();for(const p of parts){const mesh=new THREE.Mesh(new THREE.BoxGeometry(p.w*scale,p.h*scale,p.d*scale));mesh.position.set(p.x*scale,top+.01+p.h*scale/2,p.y*scale);mesh.rotation.y=p.rot*Math.PI/180;
 mesh.userData={part:p,base:mesh.position.clone(),baseRot:mesh.rotation.y};m.set(p.ref,mesh)}return m};

test('the studio rig starts with parts in the feeders and ends with every part on its pads',()=>{
 const meshByRef=meshes(),refs=parts.map(p=>p.ref);
 const line=buildLine(board,parts,{nozzles:2,rear:true,bankLen:board.width+30,all:true,sequence:refs});
 assert.equal(line.placeOrder.length,4,'through-hole parts are placed too in the studio');
 const rig=createSmtRig(THREE,{line,board,scale,top,meshByRef});
 rig.apply(rig.tStart);
 const shown=[...meshByRef.values()].filter(m=>m.visible);
 assert.ok(shown.length>=1&&shown.length<=line.feeders.length,'one part waits in each feeder pocket');
 for(const m of shown){const f=line.feeders.find(f=>f.refs.includes(m.userData.part.ref));assert.ok(Math.abs(m.position.x-f.x*scale)<1e-9&&Math.abs(m.position.z-f.y*scale)<1e-9)}
 assert.ok([...meshByRef.values()].every(m=>!m.visible||!m.position.equals(m.userData.base)),'nothing is on the board yet');
 rig.apply(rig.tEnd);
 for(const m of meshByRef.values()){assert.ok(m.visible);assert.ok(m.position.distanceTo(m.userData.base)<1e-9,m.userData.part.ref+' on its pads');assert.equal(m.rotation.y,m.userData.baseRot)}
 assert.deepEqual(rig.error,{mm:0,deg:0});
 rig.restore();rig.dispose();
});

test('an imported sequence keeps its order and skips unknown designators',()=>{
 const line=buildLine(board,parts.filter(p=>['U1','C2'].includes(p.ref)),{nozzles:1,all:true,sequence:['U1','NOPE','C2']});
 assert.deepEqual(line.placeOrder,['U1','C2']);
});
