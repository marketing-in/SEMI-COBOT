import React,{useEffect,useMemo,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Maximize2,Minimize2,RotateCcw,ZoomIn,ZoomOut,Box,Layers,Layers3,FlipVertical2,Hand,Play,Square,Download,Upload,Eye,EyeOff} from 'lucide-react';
import {partDetail,synthTraces} from './boardDetail.js';
import {buildBody} from './partModels.js';
import {createGripper,graspFor,planPick,planRelease,samplePlan,carriedPose,programRows,toProgramCsv,parseProgram,HOME} from './gripper.js';
import {partPads,displayName,LIMITS} from './blueprint';
import {buildLine} from './smtLine.js';
import {createSmtRig} from './smtRig.js';
import {PartSummary} from './PartSummary';

export const TYPE_COLORS={chip:0x242a2b,module:0x2b3436,transistor:0x2a2f30,diode:0x3b3432,led:0xd9e8e2,capacitor:0xb9a17b,resistor:0x34393d,inductor:0x55595b,connector:0xc7ccca,crystal:0xb5bbb7,switch:0x8f9699,fuse:0xd2cfb4,other:0x5d6764};
const hex=n=>'#'+n.toString(16).padStart(6,'0');
const LAYER_NAMES={'parts-top':'Components · top','silk-top':'Silkscreen · top','mask-top':'Solder mask · top','copper-top':'Copper circuit · top','core':'Core · FR-4','copper-bottom':'Copper circuit · bottom','mask-bottom':'Solder mask · bottom','silk-bottom':'Silkscreen · bottom','parts-bottom':'Components · bottom'};
// Survive scene rebuilds: the camera per board and view mode, and rendered Gerber layer images per board.
const viewMemory=new Map(),gerberLayerCache=new Map();
const CAMERAS={overview:[10,13,12],top:[0,19,.6],side:[15,4.5,7],assembly:[8,15,16]};
const THICK=.18;
// Builds every mesh of a board into `group`. Returns the pickable component meshes.
function buildBoard(group,board,parts,s){
 const clickable=[];const mat=(color,metalness=.1,roughness=.6)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
 const W=board.width*s,H=board.height*s;
 const slabGeometry=depth=>{
  if(board.outline&&board.outline.length>2){
   const shape=new THREE.Shape(board.outline.map(([x,y])=>new THREE.Vector2(x*s,-y*s)));
   for(const hole of board.holes||[])if(hole.length>2)shape.holes.push(new THREE.Path(hole.map(([x,y])=>new THREE.Vector2(x*s,-y*s))));
   const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false});geo.rotateX(-Math.PI/2);geo.translate(0,-depth/2,0);return geo;
  }
  return new THREE.BoxGeometry(W,depth,H);
 };
 const slabMat=mat(0x216658,.1,.6);let slab;
 if(board.surface?.top&&board.outline){
  // Gerber boards: the fabrication layers (mask, copper finish, legend, holes) rendered onto each face.
  const shape=new THREE.Shape(board.outline.map(([x,y])=>new THREE.Vector2(x*s,-y*s)));
  for(const hole of board.holes||[])if(hole.length>2)shape.holes.push(new THREE.Path(hole.map(([x,y])=>new THREE.Vector2(x*s,-y*s))));
  slab=new THREE.Mesh(slabGeometry(THICK),[mat(0x0d4f31,.05,.7),mat(0x8a7a4a,.05,.8)]);
  for(const [side,url] of [['top',board.surface.top],['bottom',board.surface.bottom]]){if(!url)continue;
   const tex=new THREE.TextureLoader().load(url);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;tex.repeat.set(1/W,1/H);tex.offset.set(.5,.5);
   const m=new THREE.MeshStandardMaterial({map:tex,roughness:.5,metalness:.08,side:side==='top'?THREE.FrontSide:THREE.BackSide});m.color.setScalar(.72);
   const face=new THREE.Mesh(new THREE.ShapeGeometry(shape,16).rotateX(-Math.PI/2),m);face.position.y=(side==='top'?1:-1)*(THICK/2+.002);face.receiveShadow=true;face.userData.layer='surface-'+side;group.add(face)}
 }else if(board.image?.dataUrl&&!board.outline){
  // Picture blueprints: the page itself is the board surface, cropped to the detected board area.
  const tex=new THREE.TextureLoader().load(board.image.dataUrl);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
  const crop=board.imageCrop&&board.imageCrop.w>0?board.imageCrop:{x:0,y:0,w:1,h:1};tex.offset.set(crop.x,1-crop.y-crop.h);tex.repeat.set(crop.w,crop.h);
  const top=new THREE.MeshStandardMaterial({map:tex,roughness:.75,metalness:.05});const side=mat(0x1d4f45,.1,.6);
  slab=new THREE.Mesh(slabGeometry(THICK),[side,side,top,mat(0xbbaa64,.5,.5),side,side]);
 }else slab=new THREE.Mesh(slabGeometry(THICK),slabMat);
 slab.castShadow=slab.receiveShadow=true;slab.userData.layer='core';slab.userData.isCore=true;group.add(slab);
 if(!board.surface){const mask=new THREE.Mesh(slabGeometry(.04),mat(0x1a5c45,.1,.55));mask.position.y=-THICK/2+.01;mask.userData.layer='mask-bottom';group.add(mask)}
 {const edges=new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry,20),new THREE.LineBasicMaterial({color:0x163d36,transparent:true,opacity:.6}));edges.userData.layer='core';group.add(edges)}
 const decorStart=group.children.length;
 if(board.decor){
  for(const x of [-4.55,4.55])for(const z of [-2.9,2.9]){const ring=new THREE.Mesh(new THREE.RingGeometry(.17,.31,24),new THREE.MeshStandardMaterial({color:0xc9b578,metalness:.7,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(x,.101,z);group.add(ring);const hole=new THREE.Mesh(new THREE.CircleGeometry(.16,24),new THREE.MeshBasicMaterial({color:0xdce6df}));hole.rotation.x=-Math.PI/2;hole.position.set(x,.102,z);group.add(hole)}
  for(let j=0;j<2;j++)for(let i=0;i<9;i++){const x=-3.2+i*.8,z=j?2.95:-2.95;const base=new THREE.Mesh(new THREE.BoxGeometry(.3,.32,.28),mat(0x222a28));base.position.set(x,.26,z);group.add(base);const pin=new THREE.Mesh(new THREE.BoxGeometry(.08,.6,.08),mat(0xbba974,.8));pin.position.set(x,.65,z);group.add(pin)}
 }
 for(let i=decorStart;i<group.children.length;i++)group.children[i].userData.layer??='parts-top';
 function label(text,x,z,size,y=THICK/2+.012){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const c=canvas.getContext('2d');c.font='bold 30px monospace';c.fillStyle='#dcefe3';c.textAlign='center';c.fillText(String(text).slice(0,14),128,40);const t=new THREE.CanvasTexture(canvas);const plane=new THREE.Mesh(new THREE.PlaneGeometry(size*3,size*.75),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));plane.rotation.x=-Math.PI/2;plane.position.set(x,y,z);plane.userData.layer='silk-top';group.add(plane)}
 if(board.decor){label('SEMI-COBOT',0,-3.03,.65);label('CTRL-01 / REV 2.4',0,3.04,.5)}
 // Pads: real copper from KiCad, or synthetic leads for centroid-only boards. Merged per side.
 const padGeos={top:[],bottom:[]},holeGeos=[];let padCount=0;
 for(const p of parts){
  if(board.surface)break;if(board.image&&!p.pads)continue;const pads=partPads(p);const synthetic=!p.pads;const ph=synthetic?.07:.025;const a=p.rot*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a);
  for(const pad of pads){
   if(padCount++>LIMITS.pads)break;
   const pw=Math.max(.02,pad.w*s),pd=Math.max(.02,pad.h*s),round=pad.shape==='circle'||pad.shape==='oval';
   const g=round?new THREE.CylinderGeometry(Math.max(pw,pd)/2,Math.max(pw,pd)/2,ph,14):new THREE.BoxGeometry(pw,ph,pd);
   if(round&&pw!==pd)g.scale(pw/Math.max(pw,pd),1,pd/Math.max(pw,pd));
   g.rotateY(((pad.rot||0)+p.rot)*Math.PI/180);
   const lx=pad.x*s,ly=pad.y*s;const bx=p.x*s+lx*cos+ly*sin,bz=p.y*s-lx*sin+ly*cos;
   g.translate(bx,(p.side==='bottom'?-1:1)*(THICK/2+ph/2-.004),bz);padGeos[p.side==='bottom'?'bottom':'top'].push(g);
   if(pad.hole>0&&holeGeos.length<800){const hg=new THREE.CylinderGeometry(pad.hole*s/2,pad.hole*s/2,THICK+.08,10);hg.translate(bx,0,bz);holeGeos.push(hg)}
  }
 }
 for(const side in padGeos)if(padGeos[side].length){const merged=mergeGeometries(padGeos[side],false);if(merged){const m=new THREE.Mesh(merged,mat(0xc9b578,.7,.35));m.castShadow=true;m.userData.layer='copper-'+side;group.add(m)}padGeos[side].forEach(g=>g.dispose())}
 if(holeGeos.length){const merged=mergeGeometries(holeGeos,false);if(merged){const hm=new THREE.Mesh(merged,mat(0x1c2a27,.2,.8));hm.userData.layer='core';group.add(hm)}holeGeos.forEach(g=>g.dispose())}
 // Component bodies: package-specific models (see partModels.js), seated on the board face.
 for(const p of parts){
  const body=buildBody(THREE,p,s,{mat,partPads});const mesh=body.mesh,h=body.h;
  const sign=p.side==='bottom'?-1:1;const lift=p.pads||board.image?.02:.06;
  mesh.position.set(p.x*s,sign*(THICK/2+lift+h/2),p.y*s);mesh.rotation.y=p.rot*Math.PI/180;
  mesh.userData={part:p,kind:body.kind,h,lift,layer:'parts-'+(p.side==='bottom'?'bottom':'top')};
  // Suggested (not yet confirmed) parts: translucent blue, so they read as a plan rather than a placed part.
  if(p.suggested)mesh.traverse(o=>{if(!o.material)return;o.material=(Array.isArray(o.material)?o.material:[o.material]).map(x=>{const c=x.clone();c.transparent=true;c.opacity=.6;c.color?.lerp(new THREE.Color(0x6fa8ff),.6);return c});if(o.material.length===1)o.material=o.material[0]});group.add(mesh);clickable.push(mesh);
  const outline=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0x89d9aa}));outline.visible=false;outline.scale.set(1.12,1.12,1.12);mesh.add(outline);mesh.userData.outline=outline;
 }
 // Copper tracks as flat ribbons under the mask, on both sides. Boards without routing data (reference
 // design, placement files) get illustrative routing with vias so the back side reads like a real board.
 const realTraces=(board.traces?.top?.length||0)+(board.traces?.bottom?.length||0)>0;
 const routing=board.surface||board.image?null:realTraces?{top:board.traces.top||[],bottom:board.traces.bottom||[],vias:[]}:synthTraces(parts,board);
 if(routing){
  const tw=Math.max(.0035,.32*s),th=.006;
  for(const side of ['top','bottom']){
   const segs=(routing[side]||[]).slice(0,LIMITS.traces);if(!segs.length)continue;const geos=[];const y=(side==='top'?1:-1)*(THICK/2+th/2+.0015);
   for(const [x1,y1,x2,y2] of segs){const dx=(x2-x1)*s,dz=(y2-y1)*s,L=Math.hypot(dx,dz);if(L<1e-5)continue;const g=new THREE.BoxGeometry(L+tw,th,tw);g.rotateY(Math.atan2(-dz,dx));g.translate((x1+x2)/2*s,y,(y1+y2)/2*s);geos.push(g)}
   if(geos.length){const merged=mergeGeometries(geos,false);if(merged){const m=new THREE.Mesh(merged,mat(side==='top'?0x2f9468:0x2a8a5f,.25,.45));m.receiveShadow=true;m.userData.layer='copper-'+side;group.add(m)}geos.forEach(g=>g.dispose())}
  }
  if(routing.vias.length){const ring=[],hole=[];for(const [x,y] of routing.vias.slice(0,800)){const r=new THREE.CylinderGeometry(.42*s,.42*s,THICK+.012,14);r.translate(x*s,0,y*s);ring.push(r);const h=new THREE.CylinderGeometry(.16*s,.16*s,THICK+.02,10);h.translate(x*s,0,y*s);hole.push(h)}
   const mr=mergeGeometries(ring,false),mh=mergeGeometries(hole,false);if(mr){const vm=new THREE.Mesh(mr,mat(0xc9b578,.75,.3));vm.userData.layer='core';group.add(vm)}if(mh){const hv=new THREE.Mesh(mh,new THREE.MeshBasicMaterial({color:0x07090a}));hv.userData.layer='core';group.add(hv)}[...ring,...hole].forEach(g=>g.dispose())}
 }
 // Leads, end caps, through-hole pins and solder: planned per part in millimetres, merged per material.
 const det={};const push=(k,side,g)=>{(det[k+'|'+side]||=[]).push(g)};let pieces=0;
 for(const p of parts){
  if(pieces>LIMITS.pads*2)break;
  const d=partDetail(p),a=p.rot*Math.PI/180,sign=p.side==='bottom'?-1:1,lift=(p.pads||board.image?.02:.06),h=Math.max(.04,p.h*s);
  const surf=sign*(THICK/2),bodyBottom=sign*(THICK/2+lift);
  const place=(g,lx,ly,yy)=>{g.translate(lx*s,yy,ly*s);g.rotateY(a);g.translate(p.x*s,0,p.y*s);return g};
  const lt=Math.max(.004,.15*s);
  for(const l of d.leads){
   // Gull wing: shoulder out of the body side, a bend down, and a foot on the pad.
   const along=l.len*s,w=l.width*s,shoulder=along*.38,foot=along*.5,hy=bodyBottom+sign*h*.3,fy=surf+sign*(lt/2+.002);
   const box=(len,ht)=>l.axis==='x'?new THREE.BoxGeometry(len,ht,w):new THREE.BoxGeometry(w,ht,len);
   const at=f=>{const off=(l.axis==='x'?Math.abs(l.x):Math.abs(l.y))-l.len/2+f/s;return l.axis==='x'?[l.dir*off,l.y]:[l.x,l.dir*off]};
   const [sx,sy]=at(shoulder/2);push('lead',p.side==='bottom'?'bottom':'top',place(box(shoulder,lt),sx,sy,hy));
   const [bx,by]=at(shoulder+lt/2);push('lead',p.side==='bottom'?'bottom':'top',place(box(lt*1.6,Math.abs(hy-fy)+lt),bx,by,(hy+fy)/2));
   const [fx,fy2]=at(along-foot/2);push('lead',p.side==='bottom'?'bottom':'top',place(box(foot,lt),fx,fy2,fy));pieces+=3;
  }
  for(const c of d.caps){push('cap',p.side==='bottom'?'bottom':'top',place(new THREE.BoxGeometry(c.w*s+.004,h+.006,c.d*s+.004),c.x,c.y,bodyBottom+sign*h/2));pieces++}
  for(const q of d.pins){const len=THICK+lift+.11;push('pin',p.side==='bottom'?'bottom':'top',place(new THREE.CylinderGeometry(q.r*s,q.r*s,len,10),q.x,q.y,sign*(THICK/2+lift)-sign*len/2));pieces++}
  for(const q of d.solder){const ss=q.side==='bottom'?-1:1,r=q.r*s;
   if(q.joint){const g=new THREE.CylinderGeometry(r*.35,r,Math.max(.012,.55*s),16);if(ss<0)g.rotateX(Math.PI);push('solder',ss<0?'bottom':'top',place(g,q.x,q.y,ss*(THICK/2+Math.max(.006,.275*s))))}
   else if(!d.caps.length||!board.surface){const g=new THREE.SphereGeometry(r,12,6,0,Math.PI*2,0,Math.PI/2);g.scale(1,.32,1);if(ss<0)g.rotateX(Math.PI);push('solder',ss<0?'bottom':'top',place(g,q.x,q.y,ss*(THICK/2+.003)))}
   pieces++}
 }
 const metal={lead:mat(0xc7cbcf,.85,.3),cap:mat(0xd4d6d8,.8,.35),pin:mat(0xbfc4c8,.85,.28),solder:mat(0xb7bcc1,.9,.22)};
 for(const key in det)if(det[key].length){const [k,side]=key.split('|');const merged=mergeGeometries(det[key],false);if(merged){const m=new THREE.Mesh(merged,metal[k]);m.userData.layer='parts-'+side;m.userData.detail=true;m.castShadow=k!=='solder';group.add(m)}det[key].forEach(g=>g.dispose())}
 const labelled=parts.length<=160?parts:parts.filter(p=>['chip','module','connector','transistor','diode','crystal','switch'].includes(p.type)).slice(0,160);
 for(const p of board.surface?[]:labelled){if(p.side==='bottom')continue;const size=Math.max(.2,Math.min(.42,Math.max(p.w,p.d)*s*.5));label(p.ref,p.x*s,p.y*s+p.d*s/2+size*.55,size)}
 return clickable;
}

export default function Board({board,parts,onSelect,onHover,onPick,onFocus,selected,compact=false,mode='3D',setMode}){
 const host=useRef(),wrap=useRef(),tip=useRef(),sceneRef=useRef(),cb=useRef({});cb.current={onSelect,onHover,onPick,onFocus};
 const partsRef=useRef(parts);partsRef.current=parts;
 // The 3D scene is rebuilt only when geometry changes. Stock, knowledge and price updates arrive as new
 // part objects with the same geometry and are pushed into the existing meshes instead.
 const geomKey=useMemo(()=>board.id+'|'+parts.map(p=>[p.ref,p.x,p.y,p.rot,p.w,p.d,p.h,p.side,p.type,p.package,p.mpn,p.value,p.leads,p.suggested?1:0,(p.pads||[]).length].join(',')).join(';'),[board.id,parts]);
 const [full,setFull]=useState(false);
 useEffect(()=>{const fn=()=>setFull((document.fullscreenElement||document.webkitFullscreenElement)===wrap.current);document.addEventListener('fullscreenchange',fn);document.addEventListener('webkitfullscreenchange',fn);return()=>{document.removeEventListener('fullscreenchange',fn);document.removeEventListener('webkitfullscreenchange',fn)}},[]);
 const toggleFull=()=>{const el=wrap.current;if(!el)return;const cur=document.fullscreenElement||document.webkitFullscreenElement;if(cur){(document.exitFullscreen||document.webkitExitFullscreen)?.call(document)}else{(el.requestFullscreen||el.webkitRequestFullscreen)?.call(el)}};
 const [exploded,setExploded]=useState(false),[layerList,setLayerList]=useState([]),[hiddenLayers,setHiddenLayers]=useState([]),[layerStatus,setLayerStatus]=useState('');
 const [gripOn,setGripOn]=useState(false),[gripStatus,setGripStatus]=useState(null),[assembling,setAssembling]=useState(false);const programInput=useRef();const gripFlags=useRef({on:false,flipped:false});
 const [failed,setFailed]=useState(false),[hover,setHover]=useState(null),[flipped,setFlipped]=useState(false),[view,setView]=useState('overview');
 const scale=Math.min(10/board.width,6.7/board.height);
 const hasBottom=parts.some(p=>p.side==='bottom');
 const setHovered=p=>{setHover(p);cb.current.onHover?.(p)};
 const moveTip=(x,y)=>{const el=tip.current,h=wrap.current;if(!el||!h)return;const r=h.getBoundingClientRect();let left=x-r.left+16,top=y-r.top+18;if(left+el.offsetWidth>r.width-8)left=x-r.left-el.offsetWidth-16;if(top+el.offsetHeight>r.height-8)top=y-r.top-el.offsetHeight-14;el.style.transform=`translate(${Math.max(4,left)}px,${Math.max(4,top)}px)`};
 useEffect(()=>{setHover(null);setFlipped(false)},[board.id,mode]);
 useEffect(()=>{
  if(mode==='2D')return;
  let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true})}catch{setFailed(true);return}
  const el=host.current;el.appendChild(renderer.domElement);
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.setClearColor(0xeff3ef,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(36,1,.1,100);camera.position.set(...CAMERAS.overview);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=2.5;controls.maxDistance=34;controls.maxPolarAngle=Math.PI*.48;controls.enablePan=!compact;
  scene.add(new THREE.AmbientLight(0xffffff,2));
  const light=new THREE.DirectionalLight(0xffffff,4);light.position.set(3,12,8);light.castShadow=true;light.shadow.mapSize.set(1024,1024);scene.add(light);
  const rim=new THREE.DirectionalLight(0xcfe8dd,2);rim.position.set(-8,6,-5);scene.add(rim);
  const under=new THREE.DirectionalLight(0xdfe9e3,1.2);under.position.set(2,-9,-4);scene.add(under);
  const group=new THREE.Group();scene.add(group);
  const clickable=buildBoard(group,board,partsRef.current,scale);
  const memory=viewMemory.get(board.id+'|'+mode);if(memory){camera.position.copy(memory.pos)}
  // Cobot gripper (studio only). Inspection: pick a clicked part, hold it up, put it back on its seat.
  // Assembly runs the SMT machine process (smtRig.js): tape feeders along the board edges, a 4-nozzle
  // gantry head, an upward camera, then each part set on its pads in the placement-data (or imported
  // program) order, with the board clamped in place.
  const meshByRef=new Map();for(const m of clickable){m.userData.base=m.position.clone();m.userData.baseRot=m.rotation.y;meshByRef.set(m.userData.part.ref,m)}
  const grip=compact?null:{...createGripper(THREE),pose:{...HOME},plan:null,t0:0,speed:1,held:null,carried:null,target:null,asm:null,after:null};
  if(grip){grip.root.visible=gripFlags.current.on&&!gripFlags.current.flipped;group.add(grip.root)}
  const sizeOf=m=>{const g=m.geometry.parameters;return {w:g.width??g.radiusTop*2,d:g.depth??g.radiusTop*2,h:g.height}};
  const graspAt=(m,pos,rot)=>graspFor({ref:m.userData.part.ref,x:pos.x,y:pos.y,z:pos.z,rot,...sizeOf(m)});
  const seatOf=m=>graspAt(m,m.userData.base,m.userData.baseRot);
  const snap=m=>{m.position.copy(m.userData.base);m.rotation.y=m.userData.baseRot};
  const fmtMm=n=>(Math.round(n*100)/100).toFixed(2);
  const applyPose=p=>{
   grip.root.position.set(p.x,p.y,p.z);grip.root.rotation.y=p.rot;grip.setOpen(p.open);grip.setVac(p.vac??0);
   const m=p.hold?meshByRef.get(p.hold):null;
   // Every release in every plan happens on the part's own seat, so a released part snaps there exactly.
   if(grip.carried&&grip.carried!==m)snap(grip.carried);
   if(m){const c=carriedPose(p,grip.plan?.carry?.[p.hold]||{dy:0,rotOffset:0});m.position.set(c.x,c.y,c.z);m.rotation.y=c.rot}
   grip.carried=m};
  const run=(plan,target,speed=1)=>{grip.plan=plan;grip.target=target;grip.speed=speed;grip.t0=performance.now()};
  const pick=m=>{
   if(!grip||grip.plan||grip.asm||ex.target!==0)return false;const ref=m.userData.part.ref;
   if(grip.held?.ref===ref)return putBack();
   const g=graspAt(m,m.position,m.rotation.y);run(planPick(grip.pose,g,{held:grip.held}),ref);
   setGripStatus((g.tool==='vacuum'?'Suction-picking ':'Picking ')+ref+'…');return true};
  const putBack=()=>{if(!grip?.held||grip.plan||grip.asm||ex.target!==0)return false;const ref=grip.held.ref;run(planRelease(grip.pose,grip.held),null);setGripStatus('Placing '+ref+' back…');return true};
  const endRig=rig=>{rig.restore();rig.dispose();for(const c of group.children)if(c.userData.detail)c.visible=true;applyExplode();controls.maxDistance=34;camera.far=100;camera.updateProjectionMatrix();grip.root.visible=gripFlags.current.on&&!gripFlags.current.flipped&&ex.target===0};
  const releaseNow=()=>{if(!grip)return;if(grip.asm?.rig)endRig(grip.asm.rig);if(grip.asm)for(const ref of grip.asm.queue){const m=meshByRef.get(ref);if(m)snap(m)}
   if(grip.carried)snap(grip.carried);grip.carried=null;grip.held=null;grip.plan=null;grip.target=null;grip.asm=null;grip.after=null;setAssembling(false);grip.pose={...HOME};applyPose(grip.pose)};
  const startAssembly=(order,label='placement data',note='')=>{
   if(!grip)return;releaseNow();
   const refs=order.filter(r=>{const m=meshByRef.get(r);return m&&m.userData.part.side!=='bottom'});
   if(!refs.length){setGripStatus('Nothing to place: no top-side parts.');return}
   const heights=Object.fromEntries(refs.map(r=>{const u=meshByRef.get(r).userData;return [r,(u.h+u.lift)/scale]}));
   const line=buildLine(board,refs.map(r=>meshByRef.get(r).userData.part),{nozzles:4,rear:true,bankLen:board.width+30,all:true,sequence:refs,heights});
   const rig=createSmtRig(THREE,{line,board,scale,top:THICK/2,meshByRef});group.add(rig.root);grip.root.visible=false;
   // Leads and solder are merged per side, so they wait until the bodies are on the board.
   for(const c of group.children)if(c.userData.detail&&c.userData.layer==='parts-top')c.visible=false;
   const skipped=order.length-refs.length;
   grip.asm={queue:refs,rig,line,t0:performance.now(),rate:.4,placed:0,shown:-1,label,note:[note,skipped?`${skipped} bottom-side or unknown part${skipped===1?'':'s'} skipped`:''].filter(Boolean).join(' · ')};
   setAssembling(true);
   // Frame the whole machine; the zoom limit and far plane grow with it for small boards.
   const c=rig.bounds.getCenter(new THREE.Vector3()),r=rig.bounds.getBoundingSphere(new THREE.Sphere()).radius,dist=r/Math.sin(camera.fov*Math.PI/360)*.95;
   controls.maxDistance=Math.max(34,dist*1.3);camera.far=Math.max(100,dist+r*3);camera.updateProjectionMatrix();
   desired=c.clone().addScaledVector(new THREE.Vector3(.2,.62,.72).normalize(),dist);controls.target.copy(c);
   stepSmt(performance.now())};
  const stepSmt=now=>{const a=grip.asm,t=Math.min(a.rig.tEnd,a.rig.tStart+(now-a.t0)/1000*a.rate),s=a.rig.apply(t);a.placed=s.placed;
   if(s.placed!==a.shown&&s.placed<a.line.placeOrder.length){a.shown=s.placed;const p=meshByRef.get(a.line.placeOrder[s.placed]).userData.part;setGripStatus(`Placing ${s.placed+1}/${a.queue.length} · ${p.ref} → X ${fmtMm(p.x)} Y ${fmtMm(p.y)} mm · ${Math.round(((p.rot%360)+360)%360)}°`)}
   if(t<a.rig.tEnd)return;
   const n=a.line.placeOrder.length,e=a.rig.error;endRig(a.rig);grip.asm=null;setAssembling(false);grip.pose={...HOME};applyPose(grip.pose);
   setGripStatus(`Assembled ${n} part${n===1?'':'s'} from ${a.label} · worst placement error ${e.mm.toFixed(3)} mm, ${e.deg.toFixed(2)}°`+(a.note?' · '+a.note:''))};
  const stopAssembly=()=>{if(!grip?.asm)return;const done=grip.asm.placed;releaseNow();setGripStatus(`Assembly stopped after ${done} part${done===1?'':'s'}`)};
  const stepGripper=now=>{if(grip?.asm?.rig){stepSmt(now);return}if(!grip?.plan)return;const plan=grip.plan,t=(now-grip.t0)/1000*grip.speed;grip.pose=samplePlan(plan,t);applyPose(grip.pose);
   if(t<plan.duration)return;
   grip.plan=null;grip.target=null;
   grip.held=plan.picked?{...seatOf(meshByRef.get(plan.picked)),...plan.carry[plan.picked]}:null;
   const after=grip.after;grip.after=null;
   setGripStatus(plan.picked?'Holding '+plan.picked+' · click to put back':after||'Gripper ready · click a part')};
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.09}));ground.rotation.x=-Math.PI/2;ground.position.y=-.3;ground.receiveShadow=true;scene.add(ground);
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let start=null,dragging=false,hovered=null,raf=0,lastEvent=null,desired=null;
  const cast=e=>{const b=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-b.left)/b.width*2-1,-((e.clientY-b.top)/b.height)*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(clickable,false).find(h=>h.object.visible);return hit?hit.object:null};
  const highlight=(mesh,on)=>{if(!mesh)return;for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])m.emissive?.setHex(on?0x2f6a46:0x000000)};
  const clearHover=()=>{if(hovered){highlight(hovered,false);hovered=null;setHovered(null)}renderer.domElement.style.cursor='grab'};
  const move=e=>{if(dragging)return;lastEvent=e;if(raf)return;raf=requestAnimationFrame(()=>{raf=0;const m=cast(lastEvent);if(m!==hovered){highlight(hovered,false);hovered=m;highlight(m,true);renderer.domElement.style.cursor=m?'pointer':'grab';setHovered(m?m.userData.part:null)}if(m)moveTip(lastEvent.clientX,lastEvent.clientY)})};
  let travelled=0;const track=e=>{if(dragging&&start)travelled=Math.max(travelled,Math.hypot(e.clientX-start[0],e.clientY-start[1]))};
  const down=e=>{start=[e.clientX,e.clientY];dragging=true;travelled=0};
  const up=e=>{dragging=false;if(!start||travelled>5||Math.hypot(e.clientX-start[0],e.clientY-start[1])>5)return;const m=cast(e);const separated=ex.target!==0,gripping=grip&&gripFlags.current.on&&!gripFlags.current.flipped&&!separated;if(!m){if(gripping)putBack();return}clearHover();
   if(gripping){if(pick(m))cb.current.onPick?.(m.userData.part);return}
   // In the layer view, or while the gripper is on, a click selects the part for the inspector; it never opens the details dialog.
   if(separated||gripFlags.current.on){cb.current.onFocus?.(m.userData.part);return}
   cb.current.onSelect?.(m.userData.part)};
  const dom=renderer.domElement;dom.addEventListener('pointermove',track);dom.addEventListener('pointerdown',down);dom.addEventListener('pointerup',up);dom.addEventListener('pointermove',move);dom.addEventListener('pointerleave',clearHover);dom.addEventListener('pointercancel',clearHover);
  const resize=()=>{const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix()};const ro=new ResizeObserver(resize);ro.observe(el);resize();
  // Exploded view: every tagged object rides to its layer's height, labels name each layer, and the
  // core turns laminate-coloured once the mask has lifted off it. Gerber boards swap their combined
  // surface for the real per-layer planes (added later by addGerberLayers).
  const OFF={'parts-top':3.4,'silk-top':2.65,'mask-top':1.95,'surface-top':1.95,'copper-top':1.2,'core':0,'copper-bottom':-1.2,'mask-bottom':-1.95,'surface-bottom':-1.95,'silk-bottom':-2.65,'parts-bottom':-3.4};
  const NAMES={'parts-top':'Components · top','silk-top':'Silkscreen · top','mask-top':'Solder mask · top','copper-top':'Copper circuit · top','core':'Core · FR-4 laminate','copper-bottom':'Copper circuit · bottom','mask-bottom':'Solder mask · bottom','silk-bottom':'Silkscreen · bottom','parts-bottom':'Components · bottom'};
  const ex={k:0,target:0,hidden:new Set(),gerber:false};
  const boardShape=(()=>{if(board.outline&&board.outline.length>2){const sh=new THREE.Shape(board.outline.map(([x,y])=>new THREE.Vector2(x*scale,-y*scale)));for(const hole of board.holes||[])if(hole.length>2)sh.holes.push(new THREE.Path(hole.map(([x,y])=>new THREE.Vector2(x*scale,-y*scale))));return sh}
   const w=board.width*scale/2,h=board.height*scale/2;return new THREE.Shape([new THREE.Vector2(-w,-h),new THREE.Vector2(w,-h),new THREE.Vector2(w,h),new THREE.Vector2(-w,h)])})();
  if(!board.surface){
   // Boards without mask data: the slab is mask and core in one, so a translucent mask sheet lifts off it.
   for(const side of ['top','bottom']){const mp=new THREE.Mesh(new THREE.ShapeGeometry(boardShape,12).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:0x1d7a4a,transparent:true,opacity:.6,roughness:.4,side:THREE.DoubleSide,depthWrite:false}));
    mp.position.y=(side==='top'?1:-1)*(THICK/2+.004);mp.userData={layer:'mask-'+side,explodeOnly:true};mp.visible=false;group.add(mp)}
  }
  const core=group.children.find(c=>c.userData.isCore),coreMats=core?(Array.isArray(core.material)?core.material:[core.material]):[],coreColors=coreMats.map(m=>m.color.clone()),laminate=new THREE.Color(0xb9a46c);
  for(const c of group.children)if(c.userData.layer)c.userData.baseY=c.position.y;
  const labelSprites=new Map();
  const labelFor=key=>{if(labelSprites.has(key))return labelSprites.get(key);const cv=document.createElement('canvas');cv.width=512;cv.height=96;const x=cv.getContext('2d');
   x.fillStyle='rgba(27,27,25,.88)';x.beginPath();x.roundRect(2,12,508,72,10);x.fill();x.fillStyle='#d9824a';x.fillRect(2,12,6,72);x.fillStyle='#ecebe5';x.font='500 32px "IBM Plex Sans", system-ui, sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(NAMES[key],256,50);
   const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthTest:false}));sp.renderOrder=10;sp.scale.set(2.9,.54,1);sp.visible=false;scene.add(sp);labelSprites.set(key,sp);return sp};
  const present=()=>{const set=new Set();for(const c of group.children){const L=c.userData.layer;if(!L)continue;if(L.startsWith('surface')&&ex.gerber)continue;set.add(L.replace('surface','mask'))}return Object.keys(NAMES).filter(k=>set.has(k))};
  const applyExplode=()=>{
   const k=ex.k,on=k>.02;
   for(const c of group.children){const L=c.userData.layer;if(!L)continue;if(grip&&c===grip.carried)continue;c.position.y=c.userData.baseY+(OFF[L]||0)*k;
    const groupKey=L.replace('surface','mask');c.visible=!ex.hidden.has(groupKey)&&(!c.userData.explodeOnly||on)&&!(c.userData.gerberLayer&&!on)&&!(L.startsWith('surface')&&on&&ex.gerber)}
   coreMats.forEach((m,i)=>m.color.copy(coreColors[i]).lerp(laminate,Math.min(1,k*1.4)));
   const right=(board.width*scale)/2+1.9;for(const key of present()){const sp=labelFor(key);sp.visible=on&&!ex.hidden.has(key);sp.position.set(right,(OFF[key]||0)*k+.05,0);sp.material.opacity=Math.min(1,k*1.2)}
   for(const [key,sp] of labelSprites)if(!present().includes(key))sp.visible=false;
  };
  // instant: restoring the state after a rebuild, so no animation and no camera move.
  const setExplode=(on,{instant=false}={})=>{const want=on?1:0,changed=ex.target!==want;ex.target=want;
   if(grip){if(grip.held||grip.plan||grip.asm)releaseNow();grip.root.visible=!on&&gripFlags.current.on&&!gripFlags.current.flipped}
   if(instant){ex.k=want;applyExplode();return}if(!changed)return;desired=new THREE.Vector3(...(on?[12,6.2,14]:CAMERAS.overview));controls.target.set(0,0,0)};
  const setHidden=keys=>{ex.hidden=new Set(keys);applyExplode()};
  const addGerberLayers=images=>{
   for(const [key,url] of Object.entries(images)){const side=key.endsWith('top')?1:-1,kind=key.split('-')[0];
    const tex=new THREE.TextureLoader().load(url);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;tex.repeat.set(1/(board.width*scale),1/(board.height*scale));tex.offset.set(.5,.5);
    const m=new THREE.MeshStandardMaterial({map:tex,transparent:true,alphaTest:.04,roughness:kind==='copper'?.35:.55,metalness:kind==='copper'?.6:.05,side:THREE.DoubleSide,opacity:kind==='mask'?.9:1});m.color.setScalar(kind==='silk'?.95:.78);
    const plane=new THREE.Mesh(new THREE.ShapeGeometry(boardShape,16).rotateX(-Math.PI/2),m);plane.position.y=side*(THICK/2+.003+(kind==='silk'?.002:kind==='mask'?.001:0));
    plane.userData={layer:key,gerberLayer:true,baseY:plane.position.y};plane.visible=false;group.add(plane)}
   ex.gerber=true;applyExplode();return present()};
  setLayerList(present());
  sceneRef.current={fresh:true,camera,controls,clickable,group,grip,pick,putBack,releaseNow,startAssembly,stopAssembly,meshByRef,setExplode,setHidden,addGerberLayers,goTo:pos=>{desired=new THREE.Vector3(...pos);controls.target.set(0,0,0)}};
  let frame;const animate=now=>{frame=requestAnimationFrame(animate);stepGripper(now??performance.now());if(Math.abs(ex.k-ex.target)>.002){ex.k+=(ex.target-ex.k)*.12;if(Math.abs(ex.k-ex.target)<.003)ex.k=ex.target;applyExplode()}if(desired){camera.position.lerp(desired,.14);if(camera.position.distanceTo(desired)<.02)desired=null}controls.update();renderer.render(scene,camera)};animate();
  return()=>{viewMemory.set(board.id+'|'+mode,{pos:camera.position.clone()});cancelAnimationFrame(frame);if(raf)cancelAnimationFrame(raf);ro.disconnect();controls.dispose();dom.removeEventListener('pointermove',track);dom.removeEventListener('pointerdown',down);dom.removeEventListener('pointerup',up);dom.removeEventListener('pointermove',move);dom.removeEventListener('pointerleave',clearHover);dom.removeEventListener('pointercancel',clearHover);scene.traverse(o=>{o.geometry?.dispose();if(o.isSprite)o.material.map?.dispose();if(o.material){const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{m.map?.dispose();m.dispose()})}});renderer.dispose();dom.remove();sceneRef.current=null;setAssembling(false)};
 },[mode,compact,board,geomKey,scale]);
 // New part data with unchanged geometry (stock, knowledge, prices): update the meshes in place.
 useEffect(()=>{const sc=sceneRef.current;if(!sc?.clickable)return;const byRef=new Map(parts.map(p=>[p.ref,p]));for(const m of sc.clickable){const p=byRef.get(m.userData.part?.ref);if(p)m.userData.part=p}},[parts]);
 useEffect(()=>{sceneRef.current?.clickable.forEach(m=>{m.userData.outline.visible=m.userData.part.ref===selected})},[selected,mode,parts]);
 useEffect(()=>{if(sceneRef.current)sceneRef.current.group.rotation.x=flipped?Math.PI:0},[flipped]);
 // Exploded layer view. The scene is rebuilt when the board changes, so re-apply the current choice.
 useEffect(()=>{setExploded(false);setHiddenLayers([]);setLayerStatus('')},[board.id]);
 useEffect(()=>{const sc=sceneRef.current;if(!sc?.setExplode)return;if(exploded&&flipped)setFlipped(false);sc.setExplode(exploded,{instant:sc.fresh});sc.fresh=false;sc.setHidden(hiddenLayers)},[exploded,mode,board,geomKey]);
 useEffect(()=>{sceneRef.current?.setHidden?.(hiddenLayers)},[hiddenLayers]);
 useEffect(()=>{
  // Gerber boards: rebuild the separate fabrication layers from the stored files the first time.
  if(!exploded||!board.gerberSource||mode==='2D')return;let live=true;const sc=sceneRef.current;if(!sc||sc.group.userData.gerberLayersFor===board.id)return;
  const cached=gerberLayerCache.get(board.id);if(cached){sc.group.userData.gerberLayersFor=board.id;setLayerList(sc.addGerberLayers(cached));return}
  setLayerStatus('Separating layers…');
  (async()=>{try{const [{gunzipBase64},{buildGerberBoard},{renderGerberLayers}]=await Promise.all([import('./unzip.js'),import('./gerber.js'),import('./gerberRender.js')]);
   const files=JSON.parse(await gunzipBase64(board.gerberSource));const result=buildGerberBoard(files,{name:board.fileName});const images=await renderGerberLayers(result,{maxSide:1400});
   gerberLayerCache.set(board.id,images);if(gerberLayerCache.size>6)gerberLayerCache.delete(gerberLayerCache.keys().next().value);
   if(!live||sceneRef.current!==sc)return;sc.group.userData.gerberLayersFor=board.id;setLayerList(sc.addGerberLayers(images));setLayerStatus('')}
  catch(e){if(live)setLayerStatus('Layer split failed: '+e.message)}})();
  return()=>{live=false}},[exploded,board,mode,geomKey]);
 useEffect(()=>{gripFlags.current={on:gripOn,flipped};const sc=sceneRef.current;if(!sc?.grip)return;sc.grip.root.visible=gripOn&&!flipped&&!exploded&&!sc.grip.asm;
  if(!gripOn||flipped){sc.releaseNow();setGripStatus(null)}else if(exploded)setGripStatus('Layers separated · join them to use the gripper')
  else if(!sc.grip.plan&&!sc.grip.held)setGripStatus('Gripper ready · click a part')},[gripOn,flipped,exploded,mode,board,geomKey]);
 // A new selection (for example from the component list) drives the gripper; switching the gripper on
 // or joining the layers does not re-pick whatever was selected before.
 const lastSelected=useRef(selected);
 useEffect(()=>{const changed=lastSelected.current!==selected;lastSelected.current=selected;const sc=sceneRef.current;if(!changed||!gripOn||flipped||exploded||!selected||!sc?.grip)return;if(sc.grip.held?.ref===selected||sc.grip.target===selected)return;const m=sc.meshByRef.get(selected);if(m)sc.pick(m)},[selected,gripOn,flipped,exploded]);
 const goTo=name=>{setView(name);sceneRef.current?.goTo(CAMERAS[name])};
 const reset=()=>{setFlipped(false);goTo('overview')};
 const exportProgram=()=>{const rows=programRows(parts,board);if(!rows.length){setGripStatus('No top-side parts to export.');return}
  const csv=toProgramCsv(rows,{board:board.name,scale});const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=String(board.name||'board').replace(/[^\w.-]+/g,'-')+'-gripper-program.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  setGripStatus(`Exported ${rows.length} placement${rows.length===1?'':'s'}`)};
 const importProgram=async file=>{if(!file)return;try{if(file.size>2e6)throw Error('Choose a file smaller than 2 MB.');
  const {order,unknown,missing}=parseProgram(await file.text(),parts.map(p=>p.ref));
  const note=[unknown.length?`${unknown.length} designator${unknown.length===1?'':'s'} not on this board`:'',missing.length?`${missing.length} board part${missing.length===1?'':'s'} not in the file`:''].filter(Boolean).join(' · ');
  sceneRef.current?.startAssembly(order,file.name,note)}catch(e){setGripStatus('Could not run '+file.name+': '+e.message)}};
 // 2D geometry (millimetres).
 const svg=useMemo(()=>{
  const m=Math.max(board.width,board.height)*.06;const viewBox=`${-board.width/2-m} ${-board.height/2-m} ${board.width+2*m} ${board.height+2*m}`;
  const ring=pts=>'M'+pts.map(([x,y])=>`${x} ${y}`).join('L')+'Z';
  const outline=board.outline?ring(board.outline)+(board.holes||[]).map(ring).join(''):`M${-board.width/2} ${-board.height/2}h${board.width}v${board.height}h${-board.width}Z`;
  const traces={};for(const side of ['top','bottom']){const segs=board.traces?.[side]||[];traces[side]=segs.map(([a,b,c,d])=>`M${a} ${b}L${c} ${d}`).join('')}
  const pads={top:'',bottom:'',tht:''};let count=0;
  for(const p of parts){if(board.surface)break;if(board.image&&!p.pads)continue;const a=p.rot*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a);for(const pad of partPads(p)){if(count++>LIMITS.pads)break;const bx=p.x+pad.x*cos+pad.y*sin,by=p.y-pad.x*sin+pad.y*cos;const rot=-((pad.rot||0)+p.rot);const w=pad.w,h=pad.h;const r=pad.shape==='circle'||pad.shape==='oval';
   pads[pad.hole>0?'tht':p.side==='bottom'?'bottom':'top']+=r?`M${bx-w/2} ${by}a${w/2} ${h/2} 0 1 0 ${w} 0a${w/2} ${h/2} 0 1 0 ${-w} 0`:rot%180===0?`M${bx-w/2} ${by-h/2}h${w}v${h}h${-w}Z`:rot%180===90||rot%180===-90?`M${bx-h/2} ${by-w/2}h${h}v${w}h${-h}Z`:(()=>{const c=Math.cos(rot*Math.PI/180),s2=Math.sin(rot*Math.PI/180);const pt=(x,y)=>`${bx+x*c-y*s2} ${by+x*s2+y*c}`;return `M${pt(-w/2,-h/2)}L${pt(w/2,-h/2)}L${pt(w/2,h/2)}L${pt(-w/2,h/2)}Z`})()}}
  const fs=Math.max(board.width,board.height)/58,sw=Math.max(board.width,board.height)/900;
  return {viewBox,outline,traces,pads,fs,sw};
 },[board,parts]);
 return <div ref={wrap} className={'board-view '+(compact?'compact':'')+(full?' is-full':'')}>
  {(mode==='2D'||failed)?<svg className="board-svg" viewBox={svg.viewBox} aria-label={`Interactive 2D layout of ${board.name}`} onPointerLeave={()=>setHovered(null)}>
   {board.surface?.top?<><defs><clipPath id={'gerber-clip-'+(board.id||'b')}><path d={svg.outline} clipRule="evenodd"/></clipPath></defs><image href={board.surface.top} x={-board.width/2} y={-board.height/2} width={board.width} height={board.height} preserveAspectRatio="none" clipPath={`url(#gerber-clip-${board.id||'b'})`}/><path d={svg.outline} fill="none" stroke="#9aa879" strokeWidth={svg.sw*2} fillRule="evenodd"/></>:<path d={svg.outline} fill="#216658" stroke="#9aa879" strokeWidth={svg.sw*2} fillRule="evenodd"/>}
   {board.image?.dataUrl&&(()=>{const c=board.imageCrop&&board.imageCrop.w>0?board.imageCrop:{x:0,y:0,w:1,h:1};return <svg x={-board.width/2} y={-board.height/2} width={board.width} height={board.height} viewBox={`${c.x} ${c.y} ${c.w} ${c.h}`} preserveAspectRatio="none" pointerEvents="none"><image href={board.image.dataUrl} width="1" height="1" preserveAspectRatio="none"/></svg>})()}
   {board.decor&&Array.from({length:16},(_,i)=><path key={i} d={`M ${-44+i*5.5} -29 v 12 l 5 6 v 38`} fill="none" stroke="#619c7c" strokeWidth=".25"/>)}
   {svg.traces.bottom&&<path d={svg.traces.bottom} fill="none" stroke="#5f9a7c" strokeWidth={svg.sw*2.5} strokeOpacity=".45"/>}
   {svg.traces.top&&<path d={svg.traces.top} fill="none" stroke="#8fd1a4" strokeWidth={svg.sw*2.5} strokeOpacity=".85"/>}
   {svg.pads.bottom&&<path d={svg.pads.bottom} fill="#9c8f5a" fillOpacity=".5"/>}
   {svg.pads.top&&<path d={svg.pads.top} fill="#c9b578"/>}
   {parts.map(p=>{const bottom=p.side==='bottom';const active=selected===p.ref;const fill=hex(TYPE_COLORS[p.type]||TYPE_COLORS.other);const showLabel=parts.length<=70||Math.max(p.w,p.d)>=svg.fs*1.6;
    return <g key={p.ref} className={'svg-part '+(bottom?'bottom':'')} transform={`translate(${p.x} ${p.y})`} tabIndex="0" role="button" aria-label={`${p.ref} ${displayName(p)}`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();cb.current.onSelect?.(p)}}} onClick={()=>{setHovered(null);cb.current.onSelect?.(p)}} onPointerEnter={e=>{setHovered(p);moveTip(e.clientX,e.clientY)}} onPointerMove={e=>moveTip(e.clientX,e.clientY)} onPointerLeave={()=>setHovered(null)} onFocus={e=>{if(!e.currentTarget.matches(':focus-visible'))return;setHovered(p);const r=e.currentTarget.getBoundingClientRect();moveTip(r.right,r.top)}} onBlur={()=>setHovered(null)}>
     <g transform={`rotate(${-p.rot})`}>{p.shape==='cyl'?<circle r={p.w/2} fill={fill} stroke={active?'#c2ed8e':'#c7c8b2'} strokeWidth={active?svg.sw*5:svg.sw*1.5}/>:<rect x={-p.w/2} y={-p.d/2} width={p.w} height={p.d} rx={Math.min(p.w,p.d)*.08} fill={fill} fillOpacity={board.image||board.surface?.28:1} stroke={active?'#c2ed8e':board.image||board.surface?'#e4f3d8':'#c7c8b2'} strokeWidth={active?svg.sw*5:svg.sw*(board.image||board.surface?2.5:1.5)} strokeDasharray={bottom||p.suggested?`${svg.sw*4} ${svg.sw*3}`:undefined}/>}
      {p.type==='diode'&&<rect x={-p.w*.42} y={-p.d/2} width={p.w*.12} height={p.d} fill="#d9dedb"/>}
      {(p.type==='chip'||p.type==='module')&&p.w>2&&<circle cx={-p.w/2+p.w*.15} cy={-p.d/2+p.d*.15} r={Math.min(p.w,p.d)*.06} fill="#9aa3a1"/>}
      {p.type==='led'&&<circle r={Math.min(p.w,p.d)*.3} fill="#eafff1"/>}</g>
     {showLabel&&<text y={(p.rot%180===0?p.d/2:p.rot%180===90?p.w/2:Math.hypot(p.w,p.d)/2)+svg.fs*.95} textAnchor="middle" fontSize={svg.fs} fill="#eff6e7">{p.ref}</text>}
    </g>})}
   {svg.pads.tht&&<path d={svg.pads.tht} fill="#c9b578" stroke="#1c2a27" strokeWidth={svg.sw*2} pointerEvents="none"/>}
   {board.decor&&<text x="0" y="-30" textAnchor="middle" fontSize="2.2" fill="#d5e3d9">SEMI-COBOT · CTRL-01</text>}
  </svg>:<div ref={host} className="canvas-host" aria-label="Interactive 3D PCB. Drag to rotate; move over a component to identify it; click to inspect."/>}
  <div ref={tip} className={'board-tip '+(hover?'visible':'')} role="status" aria-live="polite">{hover&&<><PartSummary part={hover} tooltip/></>}</div>
  <div className="view-badge"><span className="live-dot"/> {mode==='2D'?'TOP LAYER':exploded?'LAYERS SEPARATED':flipped?'BOTTOM VIEW':view.toUpperCase()}</div>
  {!compact&&mode!=='2D'&&!failed&&<div className="board-tools"><button title={full?'Exit full screen (Esc)':'Full screen'} aria-label={full?'Exit full screen':'Full screen'} aria-pressed={full} onClick={toggleFull}>{full?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button><button title="Zoom in" aria-label="Zoom in" onClick={()=>sceneRef.current?.camera.position.multiplyScalar(.85)}><ZoomIn size={17}/></button><button title="Zoom out" aria-label="Zoom out" onClick={()=>sceneRef.current?.camera.position.multiplyScalar(1.15)}><ZoomOut size={17}/></button><button title="Reset view" aria-label="Reset view" onClick={reset}><RotateCcw size={17}/></button><button title={gripOn?'Turn the gripper off':'Pick parts with the cobot gripper'} aria-label="Gripper" aria-pressed={gripOn} className={gripOn?'active':''} onClick={()=>setGripOn(!gripOn)}><Hand size={17}/></button><button title={exploded?'Put the board back together':'Separate the layers: components, silkscreen, mask, copper circuit and core'} aria-label={exploded?'Join the layers':'Separate the layers'} aria-pressed={exploded} className={exploded?'active':''} onClick={()=>setExploded(v=>!v)}><Layers3 size={17}/></button>{gripOn&&!flipped&&!exploded&&<>{assembling?<button title="Stop assembly" aria-label="Stop assembly" onClick={()=>sceneRef.current?.stopAssembly()}><Square size={15}/></button>:<button title="Assemble the board: place every top-side part from the tape feeders" aria-label="Assemble board" onClick={()=>sceneRef.current?.startAssembly(programRows(parts,board).map(r=>r.ref),'the placement data')}><Play size={16}/></button>}<button title="Export the gripper program (CSV)" aria-label="Export gripper program" onClick={exportProgram}><Download size={16}/></button><button title="Import a gripper program or pick-and-place file and run it" aria-label="Import gripper program" disabled={assembling} onClick={()=>programInput.current?.click()}><Upload size={16}/></button><input ref={programInput} type="file" accept=".csv,.txt,.tsv,.pos" hidden aria-label="Gripper program file" onChange={e=>{importProgram(e.target.files?.[0]);e.target.value=''}}/></>}{<button title={flipped?'Show top side':'Show bottom side'} aria-label={flipped?'Show top side':'Show bottom side'} aria-pressed={flipped} className={flipped?'active':''} onClick={()=>setFlipped(!flipped)}><FlipVertical2 size={17}/></button>}</div>}
  {exploded&&mode!=='2D'&&!compact&&<div className="layer-legend" role="group" aria-label="Board layers"><strong>Board layers</strong>{layerStatus&&<small role="status">{layerStatus}</small>}
   {layerList.map(key=>{const off=hiddenLayers.includes(key);return <button key={key} type="button" aria-pressed={!off} onClick={()=>setHiddenLayers(h=>off?h.filter(x=>x!==key):[...h,key])}>{off?<EyeOff size={13}/>:<Eye size={13}/>}{LAYER_NAMES[key]||key}</button>})}
   <span className="layer-quick"><button type="button" onClick={()=>setHiddenLayers(layerList.filter(k=>!/^copper|^core/.test(k)))}>Circuit only</button><button type="button" onClick={()=>setHiddenLayers(layerList.filter(k=>!/^parts/.test(k)&&k!=='core'))}>Components only</button><button type="button" onClick={()=>setHiddenLayers([])}>All layers</button></span></div>}
  <div className="board-bottom"><span className={gripOn&&gripStatus&&mode!=='2D'?'grip-status':undefined} role={gripOn&&mode!=='2D'?'status':undefined}>{gripOn&&gripStatus&&mode!=='2D'&&!compact?gripStatus:compact?`${parts.length} components · ${board.layers} layers`:mode==='2D'?'Hover to identify · Click to inspect':'Drag to orbit · Scroll to zoom · Click to inspect'}</span>{!compact&&mode!=='2D'&&!failed&&<div className="segmented camera-row" aria-label="Camera view">{['overview','top','side'].map(v=><button key={v} className={view===v&&!flipped?'active':''} aria-pressed={view===v} onClick={()=>goTo(v)}>{v[0].toUpperCase()+v.slice(1)}</button>)}</div>}{setMode&&<div className="segmented"><button className={mode==='2D'?'active':''} onClick={()=>setMode('2D')}><Layers size={13}/>2D</button><button className={mode==='3D'?'active':''} onClick={()=>setMode('3D')}><Box size={13}/>3D</button></div>}</div>
 </div>
}
