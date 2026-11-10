// Motherboard assembly scene for the intro page's background video (recorded by
// scripts/make-intro-video.mjs through the Vite dev server). A 305 × 244 mm ATX board with its large
// parts already fitted — CPU socket, DIMM, PCIe and power connectors, VRM chokes, chipset heatsink,
// rear I/O — while the pick-and-place head (the app's own SMT rig) fits the small parts around them.
import * as THREE from 'three';
import {makePart} from '/src/blueprint.js';
import {buildBody} from '/src/partModels.js';
import {partPads} from '/src/blueprint.js';
import {buildLine} from '/src/smtLine.js';
import {createSmtRig} from '/src/smtRig.js';

const W=960,H=540,FPS=24,SECONDS=12;
const board={id:'mb',name:'MB-1',width:305,height:244,layers:6};
const S=10/board.width,M=v=>v*S,T=1.6;
const canvas=document.querySelector('canvas');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setSize(W,H,false);renderer.setPixelRatio(1);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.45;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x34363a);scene.fog=new THREE.Fog(0x34363a,16,34);
const camera=new THREE.PerspectiveCamera(30,W/H,.05,80);
scene.add(new THREE.HemisphereLight(0xeef2f6,0x3a342e,1.25));
const key=new THREE.DirectionalLight(0xfff1e0,3);key.position.set(5,10,6);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-9,right:9,top:8,bottom:-8,near:1,far:40});key.shadow.bias=-.0004;scene.add(key);
const rim=new THREE.DirectionalLight(0xd9824a,1.1);rim.position.set(-7,4,-6);scene.add(rim);
const mat=(color,metalness=.2,roughness=.6,extra={})=>new THREE.MeshStandardMaterial({color,metalness,roughness,...extra});
const g=new THREE.Group();scene.add(g);
const box=(w,h,d,m,x,y,z,parent=g)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(M(w),M(h),M(d)),m);o.position.set(M(x),M(y),M(z));o.castShadow=o.receiveShadow=true;parent.add(o);return o};

// The board: dark solder mask with copper traces and silkscreen outlines drawn on a texture.
const tex=(()=>{const c=document.createElement('canvas'),R=2048;c.width=R;c.height=Math.round(R*board.height/board.width);const x=c.getContext('2d'),sx=c.width/board.width;
 x.fillStyle='#10261f';x.fillRect(0,0,c.width,c.height);let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
 x.strokeStyle='rgba(176,140,74,.38)';x.lineWidth=2.2;for(let i=0;i<420;i++){let px=rnd()*c.width,py=rnd()*c.height;x.beginPath();x.moveTo(px,py);for(let k=0;k<4;k++){if(rnd()<.5)px+=(rnd()-.5)*260;else py+=(rnd()-.5)*260;x.lineTo(px,py)}x.stroke()}
 x.fillStyle='rgba(201,163,90,.55)';for(let i=0;i<260;i++)x.beginPath(),x.arc(rnd()*c.width,rnd()*c.height,4,0,7),x.fill();
 x.strokeStyle='rgba(235,235,225,.55)';x.lineWidth=3;const rect=(cx,cy,w,h)=>x.strokeRect((cx+board.width/2-w/2)*sx,(cy+board.height/2-h/2)*sx,w*sx,h*sx);
 rect(-30,-20,84,84);for(let i=0;i<4;i++)rect(40+i*9,-20,9,136);rect(-50,62,92,11);rect(-50,100,92,11);rect(48,72,44,44);
 x.fillStyle='rgba(235,235,225,.6)';x.font=`600 ${Math.round(9*sx)}px "IBM Plex Mono", monospace`;x.fillText('MB-1  REV 1.0',(board.width/2-80)*sx,(board.height-10)*sx);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t})();
{const geo=new THREE.BoxGeometry(M(board.width),M(T),M(board.height));const edge=mat(0x0d1f19,.1,.7);const pcb=new THREE.Mesh(geo,[edge,edge,mat(0xffffff,.15,.5,{map:tex}),edge,edge,edge]);pcb.position.y=-M(T)/2;pcb.receiveShadow=true;g.add(pcb)}
// Machine bed under the board.
box(board.width+220,6,board.height+230,mat(0x4a4d52,.45,.5),0,-T-3.2,0);

// Large parts, fitted before this run: socket, DIMM, PCIe, power, VRM chokes, chipset, rear I/O.
const black=mat(0x151618,.2,.55),ivory=mat(0xe6e0cf,.1,.6),steel=mat(0xb9bdc1,.85,.28),alu=mat(0x9aa3ab,.8,.32),gold=mat(0xc9a35a,.8,.3);
box(80,4.5,80,steel,-30,2.25,-20);box(64,3,64,black,-30,4.6,-20);box(66,.6,66,gold,-30,6.3,-20);box(8,9,3,steel,-72,4.5,-58);
for(let i=0;i<4;i++){box(7,9,133,i%2?black:mat(0x2b3f5c,.2,.5),40+i*9,4.5,-20);for(const e of [-1,1])box(7.4,10,4,ivory,40+i*9,5,-20+e*68)}
for(const y of [62,100]){box(89,11,8,black,-50,5.5,y);box(4,12,9,ivory,-2,6,y)}box(25,11,8,black,-82,5.5,81);
box(52,12,10,black,135,6,-15);box(12,10,46,black,138,5,62);
for(let i=0;i<8;i++)box(10,7,10,mat(0x55595d,.4,.5),-80+i*12,3.5,-80);for(let i=0;i<5;i++)box(10,7,10,mat(0x55595d,.4,.5),-92,3.5,-62+i*12);
box(44,10,44,alu,70,5,94);for(let i=0;i<9;i++)box(1.6,7,42,mat(0xb6bec5,.85,.28),52+i*4.5,13,94);
const io=[[-140,-112,14,15,steel],[-122,-112,14,15,steel],[-104,-112,16,13,black],[-84,-112,14,16,steel],[-64,-112,20,12,black]];for(const [x,y,w,h,m] of io)box(w,h,18,m,x,h/2,y);
box(22,4,6,black,-40,2,30);box(4,6,4,steel,40,3,30);

// Small parts the machine fits now: decoupling around the socket, MOSFETs at the VRM, logic ICs.
const parts=[];let n=0;const add=raw=>parts.push(makePart({...raw,ref:raw.ref||`P${++n}`}));
for(let i=0;i<10;i++){add({ref:`C${100+i}`,value:'100nF',package:'0603',type:'capacitor',x:-74+i*9,y:28});add({ref:`C${120+i}`,value:'1uF',package:'0603',type:'capacitor',x:-74+i*9,y:34})}
for(let i=0;i<8;i++)add({ref:`Q${i+1}`,mpn:'SiRA14DP',package:'PowerPAK SO-8',type:'transistor',w:5,d:6,h:1,x:-80+i*12,y:-97});
for(let i=0;i<6;i++)add({ref:`R${10+i}`,value:'10k',package:'0402',type:'resistor',x:6+i*5,y:-70});
[[96,-60,'SOIC-8'],[96,-40,'SOIC-8'],[112,20,'QFN-32'],[20,52,'SOIC-8'],[-120,20,'TSSOP-20'],[100,40,'QFN-48']].forEach(([x,y,pk],i)=>add({ref:`U${10+i}`,mpn:`IC${i}`,package:pk,type:'chip',x,y}));
for(let i=0;i<6;i++)add({ref:`C${200+i}`,value:'22uF',package:'1206',type:'capacitor',x:-120+i*7,y:-40});
for(let i=0;i<4;i++)add({ref:`D${i+1}`,mpn:'LTST-C170KRKT',package:'0805',type:'led',x:128,y:-100+i*6});
const meshByRef=new Map();
for(const p of parts){const b=buildBody(THREE,p,S,{mat:(c,me,ro)=>mat(c,me,ro),partPads});const m=b.mesh,lift=M(.08);m.position.set(M(p.x),lift+b.h/2,M(p.y));m.rotation.y=(p.rot||0)*Math.PI/180;
 m.userData={part:p,base:m.position.clone(),baseRot:m.rotation.y,h:b.h,lift};m.traverse(o=>{o.castShadow=true});g.add(m);meshByRef.set(p.ref,m)}
const heights=Object.fromEntries(parts.map(p=>{const u=meshByRef.get(p.ref).userData;return [p.ref,(u.h+u.lift)/S]}));
const line=buildLine(board,parts,{nozzles:4,rear:true,bankLen:board.width+30,all:true,heights});
const rig=createSmtRig(THREE,{line,board,scale:S,top:0,meshByRef});g.add(rig.root);
const span=rig.tEnd-rig.tStart;

// Camera: a slow move from a high three-quarter view down towards the socket and the working head.
const ease=f=>f<.5?2*f*f:1-2*(1-f)*(1-f);
const frame=v=>{const f=v/SECONDS,e=ease(f);
 rig.apply(rig.tStart+Math.min(span,f*span*1.04));
 const ang=-.55+e*.75,r=13.5-e*3.2,hgt=8.6-e*2.6;camera.position.set(Math.sin(ang)*r,hgt,Math.cos(ang)*r);camera.lookAt(-.4+e*.2,0,.2);
 renderer.render(scene,camera)};
frame(0);

// Record: one rendered frame per time slot, captured through MediaRecorder (WebM / VP9).
window.recordIntro=async()=>{
 const stream=canvas.captureStream(0),track=stream.getVideoTracks()[0];
 const rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:1200000}),chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
 rec.start();const slot=1000/FPS,t0=performance.now();let late=0;
 for(let i=0;i<FPS*SECONDS;i++){frame(i/FPS);track.requestFrame();const due=t0+(i+1)*slot,wait=due-performance.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));else late++}
 await new Promise(r=>{rec.onstop=r;rec.stop()});
 const blob=new Blob(chunks,{type:'video/webm'}),buf=new Uint8Array(await blob.arrayBuffer());let bin='';for(let i=0;i<buf.length;i+=0x8000)bin+=String.fromCharCode(...buf.subarray(i,i+0x8000));
 frame(SECONDS*.72);const poster=canvas.toDataURL('image/jpeg',.82);
 return {video:btoa(bin),poster,late,frames:FPS*SECONDS,parts:parts.length,placeSeconds:span};
};
window.sceneReady=true;
