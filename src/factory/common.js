// Shared kit for the inner machine views of the production line (one module per station in this
// folder: loader.js, printer.js, spi.js, pnp.js, reflow.js, aoi.js, xray.js).
//
// Contract for a station module:
//   export function build(kit, ctx) -> {group, duration, steps, update, rate?, view?}
//   - kit: createKit(THREE, plan) below. Millimetre helpers; the board top sits at scene y = 0 and
//     spans about 8 scene units on its longer side.
//   - ctx: {THREE, plan, result, k}: plan from factoryLine.planProduction, result = plan.results[k]
//     (the board being shown), k = board index.
//   - group: THREE.Group with the whole inner scene (machine internals plus the board).
//   - duration: seconds of one machine cycle; steps: [{t, label}] in time order, t in seconds.
//   - update(t): pure in t (0 ≤ t ≤ duration) so the view can be scrubbed and looped. It may return
//     {target:[x,y,z]} to have the camera follow a point (scene units), e.g. the board in the oven.
//   - rate: optional playback speed (e.g. 8 for a 5-minute oven pass); view: optional
//     {target:[x,y,z], position:[x,y,z]} camera in scene units.
//   Modules must not touch the DOM (they run in Node tests); text belongs in the station's panel.
import {buildBody} from '../partModels.js';
import {partPads} from '../blueprint.js';
import {boardSlab,boardTexture} from '../boardLook.js';

export const COLORS={frame:0xd9d6ce,dark:0x2e3033,steel:0xa9adb1,copper:0xd9824a,mask:0x1f6b45,pad:0xc9a35a,paste:0x9ea3a8,solder:0xe3e6e8,belt:0x1d1e20,glass:0x9fb4c0,pass:0x3fa66b,warn:0xd8a531,fail:0xd2453b};
export const STAGES=['bare','paste','placed','soldered'];

export function createKit(THREE,plan){
 const S=8/Math.max(plan.board.width,plan.board.height),M=v=>v*S,owned=[];
 const keep=x=>{owned.push(x);return x};
 const mat=(color,metalness=.2,roughness=.6,extra={})=>keep(new THREE.MeshStandardMaterial({color,metalness,roughness,...extra}));
 // Box/cylinder in millimetres: (x, z) on the board plane (z = board y, pointing to the viewer), y = height above the board top.
 const place=(m,x,y,z,parent)=>{m.position.set(M(x),M(y),M(z));m.castShadow=m.receiveShadow=true;if(parent)parent.add(m);return m};
 const box=(w,h,d,material,x=0,y=0,z=0,parent=null)=>place(new THREE.Mesh(keep(new THREE.BoxGeometry(M(w),M(h),M(d))),material),x,y,z,parent);
 const cyl=(rTop,rBottom,h,material,x=0,y=0,z=0,parent=null,segments=24)=>place(new THREE.Mesh(keep(new THREE.CylinderGeometry(M(rTop),M(rBottom),M(h),segments)),material),x,y,z,parent);

 // The board at any line stage: solder mask with copper pads, paste deposits (sized by the measured
 // volume when a result is given), part bodies, and fiducials. setStage switches what is shown;
 // setDepositColor tints one deposit (index into plan.pads) for inspection views.
 function makeBoard({stage='bare',result=null}={}){
  // The real board: its outline and its Gerber / picture artwork on top (plain solder mask in Node).
  const g=new THREE.Group(),b=plan.board,T=1.6,art=boardTexture(THREE,b,plan.pads,'bare',S),hasArt=!!(art&&(b.surfaceTop||b.image));
  if(art)keep(art);
  const pcb=new THREE.Mesh(keep(boardSlab(THREE,b,S,M(T))),[art?mat(0xffffff,.1,.55,{map:art}):mat(COLORS.mask,.1,.55),mat(COLORS.mask,.1,.6)]);pcb.receiveShadow=true;g.add(pcb);
  const n=plan.pads.length,unit=keep(new THREE.BoxGeometry(1,1,1)),m4=new THREE.Matrix4(),q=new THREE.Quaternion(),one=new THREE.Vector3(),pos=new THREE.Vector3();
  const copper=new THREE.InstancedMesh(unit,mat(COLORS.pad,.75,.35),Math.max(1,n));copper.count=n;
  const paste=new THREE.InstancedMesh(unit,mat(0xffffff,.5,.55),Math.max(1,n));paste.count=n;paste.castShadow=true;
  const vol=result?new Map(result.deposits.map(d=>[d.ref+'|'+d.i,d.volume])):null,color=new THREE.Color();
  plan.pads.forEach((p,i)=>{
   one.set(M(p.w),M(.035),M(p.h));pos.set(M(p.x),M(.0175),M(p.y));copper.setMatrixAt(i,m4.compose(pos,q,one));
   const v=(vol?.get(p.ref+'|'+p.i)??100)/100,hgt=Math.max(.02,plan.printer.stencil*v*2.2);
   one.set(M(p.w*.92),M(hgt),M(p.h*.92));pos.set(M(p.x),M(.035+hgt/2),M(p.y));paste.setMatrixAt(i,m4.compose(pos,q,one));paste.setColorAt(i,color.setHex(COLORS.paste))});
  copper.instanceMatrix.needsUpdate=true;paste.instanceMatrix.needsUpdate=true;if(paste.instanceColor)paste.instanceColor.needsUpdate=true;
  copper.visible=!hasArt;g.add(copper,paste);
  for(const [x,y] of [[-b.width/2+4,-b.height/2+4],[b.width/2-4,b.height/2-4]]){const f=cyl(1,1,.06,mat(COLORS.pad,.8,.3),x,.03,y,g,20);f.castShadow=false}
  const parts=new Map();
  for(const p of plan.machine){const body=buildBody(THREE,p,S,{mat:(c,me,ro)=>mat(c,me,ro),partPads});const mesh=body.mesh,lift=M(.08);
   mesh.position.set(M(p.x),lift+body.h/2,M(p.y));mesh.rotation.y=(p.rot||0)*Math.PI/180;
   mesh.userData={part:p,base:mesh.position.clone(),baseRot:mesh.rotation.y,h:body.h,lift};g.add(mesh);parts.set(p.ref,mesh)}
  const setStage=s=>{const i=STAGES.indexOf(s);paste.visible=i>=1;for(const m of parts.values())m.visible=i>=2;
   const c=i>=3?COLORS.solder:COLORS.paste;for(let j=0;j<n;j++)paste.setColorAt(j,color.setHex(c));if(paste.instanceColor)paste.instanceColor.needsUpdate=true;
   paste.material.metalness=i>=3?.9:.5;paste.material.roughness=i>=3?.2:.55};
  const setDepositColor=(i,hex)=>{paste.setColorAt(i,color.setHex(hex));if(paste.instanceColor)paste.instanceColor.needsUpdate=true};
  // Show only the deposits whose index passes `keepIt` (e.g. printed so far); hidden ones scale to zero.
  const showDeposits=keepIt=>{const tmp=new THREE.Matrix4(),zero=new THREE.Matrix4().makeScale(0,0,0);for(let j=0;j<n;j++){if(!paste.userData.full)paste.userData.full=[];if(!paste.userData.full[j]){paste.getMatrixAt(j,tmp);paste.userData.full[j]=tmp.clone()}paste.setMatrixAt(j,keepIt(j)?paste.userData.full[j]:zero)}paste.instanceMatrix.needsUpdate=true};
  setStage(stage);
  return {group:g,copper,paste,parts,setStage,setDepositColor,showDeposits};
 }
 // Two conveyor rails along x under the board edges, `length` mm long.
 function rails(length,parent){const b=plan.board,rg=new THREE.Group();for(const k of [-1,1])box(length,5,3,mat(COLORS.steel,.7,.35),0,-4.5,k*(b.height/2+2),rg);if(parent)parent.add(rg);return rg}
 const dispose=()=>{for(const x of owned){x.dispose?.()}};
 return {THREE,S,M,mat,box,cyl,makeBoard,rails,COLORS,dispose};
}

// Piecewise helpers for update(t).
export const clamp01=x=>Math.max(0,Math.min(1,x));
export const span=(t,a,b)=>clamp01((t-a)/(b-a));
export const ease=f=>f<.5?2*f*f:1-2*(1-f)*(1-f);
export const lerp=(a,b,f)=>a+(b-a)*f;
export const stepAt=(steps,t)=>{let i=0;for(let j=0;j<steps.length;j++)if(t>=steps[j].t)i=j;return i};
