import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {parseGlb,normalizeBoard,fitPartModel,boardUnit,partUnit,refOf,upAxis} from '../src/glb.js';
import {checkGlb,MAX_GLB_BYTES} from '../src/modelStore.js';
import {boardScene,capacitorScene,toGlb} from '../scripts/make-glb-samples.mjs';
import {referenceBoard} from '../src/data.js';

const ab=buf=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.length);
const load=async object=>parseGlb(ab(await toGlb(object)));
const source=new Map(referenceBoard.parts.map(p=>[p.ref,p]));
function samePlaces(n,label){
 assert.equal(n.parts.length,referenceBoard.parts.length,label+': every component found by its reference');
 for(const p of n.parts){const s=source.get(p.ref);assert.ok(s,label+': '+p.ref);
  assert.ok(Math.hypot(p.x-s.x,p.y-s.y)<.01,`${label}: ${p.ref} at ${p.x.toFixed(2)},${p.y.toFixed(2)} not ${s.x},${s.y}`);
  assert.equal(p.side,'top',label+': '+p.ref+' on top');assert.ok(Math.abs(p.h-s.h)<.01,label+': '+p.ref+' height')}
 assert.ok(Math.abs(n.width-referenceBoard.width)<.01&&Math.abs(n.height-referenceBoard.height)<.01,`${label}: board ${n.width} × ${n.height}`);
}

test('board models: units and up direction are read from the model itself',async()=>{
 let n=normalizeBoard(await load(boardScene()));assert.equal(n.unit,'metres');samePlaces(n,'Z-up, metres (CAD export)');
 n=normalizeBoard(await load(boardScene(referenceBoard,{zUp:false,metres:false})));assert.equal(n.unit,'millimetres');samePlaces(n,'Y-up, millimetres');
 const flipped=boardScene();flipped.rotation.x=Math.PI;n=normalizeBoard(await load(flipped));samePlaces(n,'exported upside down (turned back over)');
 const inches=boardScene(referenceBoard,{zUp:true,metres:false});inches.scale.setScalar(1/25.4);n=normalizeBoard(await load(inches));assert.equal(n.unit,'inches');samePlaces(n,'inches');
});

test('a board model without component names opens with no parts',async()=>{
 const g=new THREE.Group();const pcb=new THREE.Mesh(new THREE.BoxGeometry(.08,.0016,.05),new THREE.MeshStandardMaterial());pcb.name='Board';g.add(pcb);
 const chip=new THREE.Mesh(new THREE.BoxGeometry(.01,.002,.01),new THREE.MeshStandardMaterial());chip.name='Mesh_1';chip.position.set(0,.0018,0);g.add(chip);
 const n=normalizeBoard(await load(g));assert.equal(n.parts.length,0);assert.ok(Math.abs(n.width-80)<.01&&Math.abs(n.height-50)<.01);
});

test('reference names, units and checks',()=>{
 for(const [name,ref] of [['R1','R1'],['U12','U12'],['LED3','LED3'],['J1_1','J1'],['C5:CP_Elec_8x10','C5'],['sw2','SW2'],['TP10 (test)','TP10']])assert.equal(refOf(name),ref,name);
 for(const name of ['R_0603_1608Metric','SOT23','TO220','D2PAK','STM32F407VGT6','LQFP-100','PCB','Mesh_1'])assert.equal(refOf(name),null,name);
 assert.deepEqual(boardUnit(.1),{factor:1000,name:'metres'});assert.deepEqual(boardUnit(100),{factor:1,name:'millimetres'});assert.equal(boardUnit(4).name,'inches');
 assert.equal(partUnit(.008,8).name,'metres');assert.equal(partUnit(8,8).name,'millimetres');assert.equal(partUnit(80,8).factor,.1,'10× too big → fitted');
 assert.equal(upAxis({x:100,y:2,z:60}),'y');assert.equal(upAxis({x:100,y:60,z:2}),'z');
 assert.throws(()=>checkGlb(new TextEncoder().encode('{"asset":{"version":"2.0"}}').buffer,'board.gltf'),/binary glTF/);
 const big={byteLength:MAX_GLB_BYTES+1};const head=new Uint8Array([0x67,0x6c,0x54,0x46,2,0,0,0,0,0,0,0]).buffer;assert.doesNotThrow(()=>checkGlb(head,'ok.glb'));
});

test('a component model is sized to its part and stands on the board',async()=>{
 const cap=await load(capacitorScene());
 const part={ref:'C35',w:8,d:8,h:10};const s=.1;
 const fit=fitPartModel(cap,part,s);assert.equal(fit.unit,'metres');assert.ok(Math.abs(fit.heightMm-10.15)<.01,'real height kept (can + vent): '+fit.heightMm);
 const box=new THREE.Box3().setFromObject(fit.object),size=box.getSize(new THREE.Vector3());
 assert.ok(Math.abs(box.min.y)<1e-6,'bottom on the board');assert.ok(Math.abs(size.x-8.3*s)<.01&&Math.abs(size.z-8.3*s)<.01,'8 mm can at scene scale');
 assert.ok(Math.abs(box.getCenter(new THREE.Vector3()).x)<1e-6,'centred on the part');
 // Turned to lie down (quarter turn about X): now 10 mm long, 8 mm tall.
 const lying=fitPartModel(cap,part,s,{rx:90}),ls=new THREE.Box3().setFromObject(lying.object).getSize(new THREE.Vector3());
 assert.ok(Math.abs(ls.y-8.3*s)<.02&&Math.abs(ls.z-10.15*s)<.02,'lying down: '+ls.toArray().map(v=>(v/s).toFixed(2)));
 // Materials are copied per part, so hovering one part does not light up the others.
 const a=fitPartModel(cap,part,s),b=fitPartModel(cap,part,s);let ma,mb;a.object.traverse(o=>{if(o.isMesh&&!ma)ma=o.material});b.object.traverse(o=>{if(o.isMesh&&!mb)mb=o.material});assert.notEqual(ma,mb);
});
