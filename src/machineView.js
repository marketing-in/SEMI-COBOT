// Pictures of the floor's machines for the Production page, rendered from the same 3D models as the
// line view (factoryModels.js): a whole SMT line (loader to X-ray, link conveyors, unloader) or a
// stand-alone machine, posed for its status — boards inside and heads mid-move when running, the
// signal tower green / amber / red. One shared WebGL context renders every picture; results are cached.
import * as THREE from 'three';
import {createLineModels,LINE_LAYOUT,MACHINE_SIZE} from './factoryModels.js';
import {STATIONS} from './factoryLine.js';

// Output size in pixels and the frame's width / height: a long strip for a line, 4:3 for a machine.
const FRAME={smt:{px:1800,aspect:4.4},machine:{px:640,aspect:4/3}};
const LAMP={running:0,idle:1,maintenance:2},STATE={running:'Running',idle:'Waiting',maintenance:'Maintenance'};
const NAME={wave:'Wave solder',selective:'Selective',ict:'ICT',probe:'Flying probe'};
const cache=new Map();let renderer=null,failed=false;

function build(models,model,status){
 const root=new THREE.Group(),busy=status==='running',units=[],{width:W,gap,depth,cy}=LINE_LAYOUT,stations=[];
 const plate=x=>{const b=new THREE.Mesh(new THREE.BoxGeometry(.46,.016,.38),models.materials.mask);b.position.set(x,cy+.01,0);b.castShadow=true;root.add(b)};
 if(model==='smt'){
  let x=0;const X={};for(const st of STATIONS){X[st.id]={left:x,right:x+W[st.id],mid:x+W[st.id]/2};x+=W[st.id]+gap}
  for(const st of STATIONS){const m=models.machine(st.id,{x:X[st.id].mid,w:W[st.id]-.08,d:depth,cy,roof:false});root.add(m.group);units.push({m,name:st.short});stations.push({id:st.id,label:st.short,x:X[st.id].mid})}
  STATIONS.slice(1).forEach((st,j)=>root.add(models.link(X[STATIONS[j].id].right,X[st.id].left,cy)));
  const end=x+.25;root.add(models.link(X.xray.right,end,cy));root.add(models.unloader(end+.55,cy).group);
  units[0].m.setRemaining(busy?11:4);
  if(busy){for(const id of ['printer','spi','pnp','aoi'])plate(X[id].mid);plate(X.reflow.left+1.6);plate(X.reflow.left+4.2);plate((X.pnp.right+X.reflow.left)/2)}
 }else{const {w,d}=MACHINE_SIZE[model];const m=models.machine(model,{x:0,w,d,cy,roof:false});root.add(m.group);units.push({m,name:NAME[model]})}
 for(const {m,name} of units){m.update(busy?1.7:0,busy,busy?2.6:0);m.lamps.forEach((l,i)=>{l.material.emissiveIntensity=i===LAMP[status]?1.6:0});m.screen.draw({name,state:STATE[status],board:'—',cycle:'—',done:'—'})}
 return {root,stations};
}

// Every visible part's box corners in camera space, the frame grown to the target aspect with a margin.
function frameFor(boxes,cam,aspect){
 const inv=cam.matrixWorldInverse,p=new THREE.Vector3();let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
 for(const box of boxes)for(let i=0;i<8;i++){p.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).applyMatrix4(inv);x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y)}
 let w=(x1-x0)*1.08,h=(y1-y0)*1.12;if(w/h<aspect)w=h*aspect;else h=w/aspect;const cx=(x0+x1)/2,cy=(y0+y1)/2;
 return {left:cx-w/2,right:cx+w/2,top:cy+h/2,bottom:cy-h/2};
}

// {src, aspect, marks:[{id,label,x}]} for a machine model in a status (x as a fraction of the width,
// where each line station sits), or null without WebGL.
export function machinePicture(model,status){
 const key=model+'|'+status;if(cache.has(key))return cache.get(key);if(failed)return null;
 try{if(!renderer){renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x000000,0)}}
 catch{failed=true;return null}
 const models=createLineModels(THREE),scene=new THREE.Scene(),{root,stations}=build(models,model,status);scene.add(root);
 root.updateMatrixWorld(true);const box=new THREE.Box3(),parts=[];const shown=o=>{for(;o;o=o.parent)if(!o.visible)return false;return true};
 root.traverse(o=>{if(o.isMesh&&!o.material?.transparent&&shown(o)){const b=new THREE.Box3().setFromObject(o);parts.push(b);box.union(b)}});
 const center=box.getCenter(new THREE.Vector3()),R=box.getBoundingSphere(new THREE.Sphere()).radius,f=model==='smt'?FRAME.smt:FRAME.machine;
 const dir=(model==='smt'?new THREE.Vector3(-.16,.5,1):new THREE.Vector3(-.75,.62,1)).normalize();
 const cam=new THREE.OrthographicCamera(-1,1,1,-1,.1,R*6);cam.position.copy(center).addScaledVector(dir,R*3);cam.lookAt(center);cam.updateMatrixWorld();
 Object.assign(cam,frameFor(parts,cam,f.aspect));cam.updateProjectionMatrix();
 scene.add(new THREE.HemisphereLight(0xffffff,0x8a8578,1.15));const sun=new THREE.DirectionalLight(0xffffff,1.6);sun.position.copy(center).add(new THREE.Vector3(R*.15,R*1.4,R*.9));sun.target.position.copy(center);scene.add(sun,sun.target);
 sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-R,right:R,top:R,bottom:-R,near:.1,far:R*4});sun.shadow.bias=-.0004;
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(R*4,R*4),new THREE.ShadowMaterial({opacity:.16}));floor.rotation.x=-Math.PI/2;floor.position.set(center.x,0,center.z);floor.receiveShadow=true;scene.add(floor);
 const H=Math.round(f.px/f.aspect);renderer.setPixelRatio(1);renderer.setSize(f.px,H,false);renderer.render(scene,cam);
 const src=renderer.domElement.toDataURL('image/png'),p=new THREE.Vector3();
 const marks=stations.map(s=>{p.set(s.x,0,LINE_LAYOUT.depth/2).project(cam);return {id:s.id,label:s.label,x:(p.x+1)/2}});
 scene.traverse(o=>{if(o.geometry&&!o.isSprite)o.geometry.dispose()});floor.material.dispose();models.dispose();
 const out={src,aspect:f.aspect,marks};cache.set(key,out);return out;
}
