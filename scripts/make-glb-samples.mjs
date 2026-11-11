// Writes two GLB samples to public/samples:
// - CTRL-01-board.glb: the reference board as CAD tools export it: Z up, in metres, one node per
//   component named by its reference (R1, U1 …) holding a mesh named by its footprint, plus the PCB.
// - CP_Elec_8x10.glb: one 8 × 10 mm electrolytic capacitor, Y up, in metres (a component model to
//   attach to a part number in Board studio).
// Run: node scripts/make-glb-samples.mjs
import {writeFileSync,mkdirSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {referenceBoard} from '../src/data.js';

// GLTFExporter reads its output Blob through FileReader, which Node does not have.
globalThis.FileReader??=class{readAsArrayBuffer(b){b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.({target:this})})}
 readAsDataURL(b){b.arrayBuffer().then(r=>{this.result='data:application/octet-stream;base64,'+Buffer.from(r).toString('base64');this.onloadend?.({target:this})})}};

export function toGlb(object){return new Promise((resolve,reject)=>new GLTFExporter().parse(object,r=>resolve(Buffer.from(r)),reject,{binary:true}))}
const mat=(color,metalness=.1,roughness=.6)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
const COLORS={chip:0x242a2b,transistor:0x2a2f30,diode:0x3b3432,capacitor:0xb9a17b,resistor:0x34393d,connector:0xc7ccca,crystal:0xb5bbb7,other:0x5d6764};

// Built in millimetres with Y up (x right, z toward the viewer = board y), then turned Z-up and scaled to metres.
export function boardScene(board=referenceBoard,{zUp=true,metres=true}={}){
 const scene=new THREE.Group();const T=1.6;
 const pcb=new THREE.Mesh(new THREE.BoxGeometry(board.width,T,board.height),mat(0x1d6b4f,.05,.7));pcb.name=board.name+' PCB';pcb.position.y=-T/2;scene.add(pcb);
 for(const p of board.parts){
  const node=new THREE.Group();node.name=p.ref;
  const cyl=p.shape==='cyl';const g=cyl?new THREE.CylinderGeometry(p.w/2,p.w/2,p.h,24):new THREE.BoxGeometry(p.w,p.h,p.d);
  const body=new THREE.Mesh(g,mat(COLORS[p.type]||COLORS.other));body.name=String(p.package||'Body').replace(/\s+/g,'_');body.position.y=p.h/2;node.add(body);
  node.position.set(p.x,p.side==='bottom'?-T:0,p.y);if(p.side==='bottom')node.rotation.x=Math.PI;node.rotation.y=(p.rot||0)*Math.PI/180;scene.add(node)}
 const root=new THREE.Group();root.name=board.name;root.add(scene);
 if(zUp)scene.rotation.x=Math.PI/2;if(metres)root.scale.setScalar(.001);
 return root;
}
export function capacitorScene(){
 const root=new THREE.Group();root.name='CP_Elec_8x10';
 const can=new THREE.Mesh(new THREE.CylinderGeometry(4,4,10,32),mat(0x2b3b6b,.3,.45));can.name='Sleeve';can.position.y=5;root.add(can);
 const top=new THREE.Mesh(new THREE.CylinderGeometry(3.6,3.6,.2,32),mat(0xc8ccd0,.85,.3));top.name='Vent';top.position.y=10.05;root.add(top);
 const stripe=new THREE.Mesh(new THREE.BoxGeometry(1.6,9.4,.3),mat(0xd8dde4,.1,.6));stripe.name='Polarity';stripe.position.set(0,5,-3.95);root.add(stripe);
 const base=new THREE.Mesh(new THREE.BoxGeometry(8.3,1,8.3),mat(0x1b1d1f,.1,.8));base.name='Base';base.position.y=.5;root.add(base);
 root.scale.setScalar(.001);return root;
}

if(import.meta.url===`file://${process.argv[1]}`){
 const dir=new URL('../public/samples/',import.meta.url);mkdirSync(dir,{recursive:true});
 const board=await toGlb(boardScene());writeFileSync(new URL('CTRL-01-board.glb',dir),board);
 const cap=await toGlb(capacitorScene());writeFileSync(new URL('CP_Elec_8x10.glb',dir),cap);
 console.log(`Wrote public/samples/CTRL-01-board.glb (${board.length} bytes) and CP_Elec_8x10.glb (${cap.length} bytes)`);
}
