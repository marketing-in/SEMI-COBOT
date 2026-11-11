// GLB (binary glTF) models in the 3D board view: a whole board exported from a CAD tool (KiCad →
// File → Export → GLB, Fusion 360, SolidWorks, Altium) or one component's model (SnapEDA, a maker's
// download). CAD tools disagree on units (glTF says metres; many write millimetres) and on which way is
// up (glTF says Y; STEP-based exporters often keep Z), so both are read from the model itself:
// - up: a board is its thinnest direction;
// - units: the factor (metres, millimetres, inches, centimetres) that gives a plausible board size, or
//   for a component, the one closest to its footprint (else the model is fitted to the footprint).
// Components in a board model are found by their reference designators (R1, U1, LED3 …) in node names.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

export async function parseGlb(bytes){
 const loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);
 return new Promise((resolve,reject)=>loader.parse(bytes,'',g=>resolve(g.scene),e=>{const m=String(e?.message||e||'');
  reject(new Error(/draco/i.test(m)?'This model is Draco-compressed. Export it again without Draco compression.':/ktx|basis/i.test(m)?'This model uses KTX2 textures. Export it with PNG or JPEG textures.':'Could not read the 3D model: '+m))}));
}

const UNITS=[[1000,'metres'],[1,'millimetres'],[25.4,'inches'],[10,'centimetres']];
// A board between 5 mm and 1.5 m across, trying metres first (the glTF standard).
export function boardUnit(span){for(const [factor,name] of UNITS){const mm=span*factor;if(mm>=5&&mm<=1500)return {factor,name}}return {factor:1,name:'millimetres'}}
// The unit that brings a component closest to its footprint; fitted when none is within 3×.
export function partUnit(span,expectMm){
 if(!(span>0)||!(expectMm>0))return {factor:1,name:'millimetres'};
 let best=null;for(const [factor,name] of UNITS){const off=Math.abs(Math.log(span*factor/expectMm));if(!best||off<best.off)best={factor,name,off}}
 return best.off<=Math.log(3)?{factor:best.factor,name:best.name}:{factor:expectMm/span,name:'fitted to the footprint'};
}
export function upAxis(size){const a=[size.x,size.y,size.z];return ['x','y','z'][a.indexOf(Math.min(...a))]}

// Reference designators as CAD tools name component nodes ("R1", "U12", "LED3", "J1_1", "C5:CP_Elec").
const REF=/^(?:R|RN|C|L|D|LED|Q|U|IC|J|P|CN|CON|K|F|FB|Y|X|SW|S|TP|BT|T|RV|VR|M|H|MH|JP|BZ|LS|MK|A|E|W|FID|Z|ZD|VT|VD|RL|PS|OSC|XTAL)\d{1,4}[A-Z]?(?=$|[\s_:.\-(])/i;
export const refOf=name=>{const m=REF.exec(String(name||'').trim());return m?m[0].toUpperCase():null};
const GENERIC=/^(mesh|node|object|group|primitive|scene|root|solid|body|shape|part|component)[\s_\-.]*\d*$/i;
// Loaders add "_1" (or ".001") to repeated names; footprint names such as LQFP-100 or R_0603 keep theirs.
const cleanName=n=>String(n||'').replace(/\.(wrl|step|stp|glb|gltf)$/i,'').replace(/(?:_\d{1,3}|\.\d{3})$/,'').trim();

function refNodes(scene){
 const found=[],seen=new Set(),stack=[scene];
 while(stack.length){const o=stack.pop();const ref=o===scene?null:refOf(o.name);
  if(ref){if(!seen.has(ref)){seen.add(ref);found.push({ref,node:o})}continue}
  for(const c of o.children)stack.push(c)}
 return found;
}
function packageOf(node,ref){let out='';node.traverse(o=>{if(out||o===node)return;const n=cleanName(o.name);if(n&&n.length<=60&&!GENERIC.test(n)&&refOf(n)!==ref)out=n});return out}

// Puts a whole-board model in board coordinates (millimetres, centred, board face at y = 0, components
// up) and lists its components. Returns {object, width, height, unit, parts:[{ref, package, x, y, w, d, h, side, glbBox}]}.
export function normalizeBoard(scene,{maxParts=3000}={}){
 const outer=new THREE.Group(),root=new THREE.Group(),turn=new THREE.Group();turn.add(scene);root.add(turn);outer.add(root);
 const boxOf=o=>{outer.updateMatrixWorld(true);return new THREE.Box3().setFromObject(o)};
 let b=boxOf(outer);if(b.isEmpty())throw new Error('The model has no geometry.');
 const up=upAxis(b.getSize(new THREE.Vector3()));if(up==='z')turn.rotation.x=-Math.PI/2;else if(up==='x')turn.rotation.z=Math.PI/2;
 b=boxOf(outer);const raw=b.getSize(new THREE.Vector3());const unit=boardUnit(Math.max(raw.x,raw.z));turn.scale.setScalar(unit.factor);
 const refs=refNodes(scene).slice(0,maxParts),inRef=new Set();for(const r of refs)r.node.traverse(o=>inRef.add(o));
 // The board face: the widest flat mesh that is not a component.
 const plane=()=>{let best=null;outer.updateMatrixWorld(true);scene.traverse(o=>{if(!o.isMesh||inRef.has(o))return;const bb=new THREE.Box3().setFromObject(o),sz=bb.getSize(new THREE.Vector3()),area=sz.x*sz.z;if(!best||area>best.area){const c=bb.getCenter(new THREE.Vector3());best={area,x:c.x,z:c.z,y:c.y,top:bb.max.y,w:sz.x,d:sz.z}}});return best};
 // Centred on the board face (a connector over the edge must not shift the board), else on the whole model.
 const place=()=>{b=boxOf(outer);const c=b.getCenter(new THREE.Vector3()),p=plane();root.position.set(root.position.x-(p?p.x:c.x),root.position.y-(p?p.top:c.y),root.position.z-(p?p.z:c.z))};
 const listParts=()=>refs.map(({ref,node})=>{const bb=boxOf(node),c=bb.getCenter(new THREE.Vector3()),sz=bb.getSize(new THREE.Vector3());
  return {ref,package:packageOf(node,ref),x:c.x,y:c.z,w:sz.x,d:sz.z,h:sz.y,side:c.y<0?'bottom':'top',glbBox:{cx:c.x,cy:c.y,cz:c.z,w:sz.x,h:sz.y,d:sz.z}}}).filter(p=>[p.x,p.y,p.w,p.d,p.h].every(Number.isFinite));
 place();let parts=listParts();
 // Exported upside down (more parts under the board than on it): turn it over and centre it again.
 if(parts.filter(p=>p.side==='bottom').length>parts.filter(p=>p.side==='top').length){
  root.position.set(0,0,0);outer.rotation.x=Math.PI;outer.position.set(0,0,0);
  const c=boxOf(outer).getCenter(new THREE.Vector3()),pl=plane();outer.position.set(-(pl?pl.x:c.x),-(pl?pl.top:c.y),-(pl?pl.z:c.z));parts=listParts()}
 // The board's size is its face's; a model with no flat face (rare) uses its overall size.
 const size=boxOf(outer).getSize(new THREE.Vector3()),face=plane(),flat=face&&face.w>size.x*.5&&face.d>size.z*.5;
 return {object:outer,width:flat?face.w:size.x,height:flat?face.d:size.z,tallest:size.y,unit:unit.name,parts};
}

// A component model sized and seated for one part: standing on y = 0, centred on the part, in scene
// units (s = scene units per mm). meta.rx / meta.ry: quarter turns chosen by the user.
export function fitPartModel(template,part,s,meta={}){
 const inner=template.clone(true);
 inner.traverse(o=>{if(!o.isMesh)return;o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();o.castShadow=true;o.userData.modelPart=true});
 const turn=new THREE.Group();turn.add(inner);turn.rotation.set((meta.rx||0)*Math.PI/180,(meta.ry||0)*Math.PI/180,0);turn.updateMatrixWorld(true);
 const bb=new THREE.Box3().setFromObject(turn);if(bb.isEmpty())throw new Error('The model has no geometry.');
 const size=bb.getSize(new THREE.Vector3()),c=bb.getCenter(new THREE.Vector3());
 const unit=partUnit(Math.max(size.x,size.z),Math.max(+part.w||0,+part.d||0)),k=unit.factor;
 turn.scale.setScalar(k);turn.position.set(-c.x*k,-bb.min.y*k,-c.z*k);
 const holder=new THREE.Group();holder.add(turn);holder.scale.setScalar(s);
 return {object:holder,unit:unit.name,heightMm:size.y*k};
}

// Parsed models are cached per key, so a part used 40 times on a board is read once.
const cache=new Map();
export function cachedModel(key,load){if(!cache.has(key))cache.set(key,load().catch(e=>{cache.delete(key);throw e}));return cache.get(key)}
export function forgetModel(key){cache.delete(key)}
