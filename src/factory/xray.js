// X-ray inspection, inside: the board rides into a lead-lined cabinet, the door interlock closes and
// the tube powers up. An XY tray centres each inspected part over the tube; the flat-panel detector
// above takes a top view, then tilts and orbits for oblique (2.5D) views while the beam is on. The
// operator computer beside the cabinet shows the live X-ray image of the part under the tube.
import {xrayTimeline,windowAt,drawRadiograph,scanState,scanKey} from './radiograph.js';
import {span,ease,lerp} from './common.js';

export function build(kit,{THREE,plan,result}){
 const {box,cyl,mat,M,COLORS}=kit,b=plan.board,D=Math.max(b.width,b.height),g=new THREE.Group();
 const tl=xrayTimeline(plan),duration=tl.duration,byRef=new Map(plan.machine.map(p=>[p.ref,p]));
 // Cabinet: floor, back and side walls (lead-lined), roof and leaded-glass front, conveyor slots.
 const lead=mat(0x6c7175,.35,.55),floorY=-D*.42,roofY=D*.85,half=D*1.15,depth=D*.85;
 box(half*2,D*.04,depth*2,lead,0,floorY,0,g);box(half*2,roofY-floorY,D*.03,lead,0,(roofY+floorY)/2,-depth,g);box(half*2,D*.03,depth*2,lead,0,roofY,0,g);
 for(const sx of [-1,1]){box(D*.03,roofY-floorY,depth*2,lead,sx*half,(roofY+floorY)/2,0,g);box(D*.035,D*.06,b.height+12,mat(0x1d1f22,.2,.7),sx*half,0,0,g)}
 const glass=box(half*2,roofY-floorY,D*.01,mat(0xb58a3a,.1,.1,{transparent:true,opacity:.16,depthWrite:false}),0,(roofY+floorY)/2,depth,g);glass.castShadow=false;
 // Conveyor rails through the cabinet.
 for(const k of [-1,1])box(half*2,4,3,mat(COLORS.steel,.7,.35),0,-6,k*(b.height/2+3),g);
 const steel=mat(COLORS.steel,.7,.35),dark=mat(0x2e3033,.4,.5),alu=mat(0xc9cdd0,.8,.28);
 // Cabinet frame: corner posts and an LED strip under the roof.
 for(const sx of [-1,1])for(const sz of [-1,1])box(D*.05,roofY-floorY,D*.05,steel,sx*(half-D*.05),(roofY+floorY)/2,sz*(depth-D*.06),g);
 box(half*1.6,D*.01,D*.04,mat(0xffffff,0,.4,{emissive:0xf4f6ff,emissiveIntensity:.9}),0,roofY-D*.03,-depth*.5,g);
 // Tube below, focal spot at the origin's height under the board: on a pedestal, with cooling fins
 // and the high-voltage cable to the generator at the back.
 const spotY=-D*.2;cyl(D*.07,D*.07,D*.18,dark,0,spotY-D*.09,0,g);cyl(D*.035,D*.05,D*.03,mat(0x8b8f93,.7,.3),0,spotY+D*.005,0,g);
 for(let i=0;i<5;i++)cyl(D*.085,D*.085,D*.008,alu,0,spotY-D*.04-i*D*.025,0,g,28);
 box(D*.11,(spotY-D*.18)-floorY,D*.11,steel,0,(floorY+spotY-D*.18)/2,0,g);box(D*.26,D*.02,D*.26,steel,0,floorY+D*.03,0,g);
 const hv=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0,spotY-D*.12,-D*.07],[0,spotY-D*.2,-D*.3],[-D*.2,floorY+D*.1,-depth*.6],[-D*.4,floorY+D*.12,-depth+D*.08]].map(([x,y,z])=>new THREE.Vector3(M(x),M(y),M(z)))),40,M(D*.012),8),mat(0x1b1c1f,.1,.7));hv.castShadow=true;g.add(hv);
 box(D*.35,D*.25,D*.12,dark,-D*.4,floorY+D*.14,-depth+D*.08,g);
 const spot=cyl(D*.012,D*.012,D*.01,mat(0x221a33,0,.5,{emissive:0xb9a6ff,emissiveIntensity:0}),0,spotY+D*.02,0,g);
 // Detector: a flat panel that faces the focal spot (lookAt) from wherever it sits on its arc.
 const det=new THREE.Group();g.add(det);const panelW=D*.5;box(panelW,panelW,D*.035,mat(0x2b2d30,.3,.5),0,0,0,det);box(panelW*.92,panelW*.92,D*.004,mat(0x5d7385,.2,.3),0,0,-D*.019,det);
 const R=D*.62,focal=new THREE.Vector3(0,M(spotY+D*.02),0);
 // C-arm: a curved arm hanging from a turntable in the roof swings around the part (azimuth); the
 // detector rides a carriage along the curve (tilt), always facing the focal spot.
 box(D*.36,D*.04,D*.36,steel,0,roofY-D*.03,0,g);const turntable=cyl(D*.15,D*.15,D*.04,alu,0,roofY-D*.07,0,g,36);
 const arm=new THREE.Group();arm.position.copy(focal);g.add(arm);const armR=M(R+D*.07);
 const arc=new THREE.Mesh(new THREE.TorusGeometry(armR,M(D*.016),10,48,65*Math.PI/180),steel);arc.rotation.z=35*Math.PI/180;arc.castShadow=true;arm.add(arc);
 const mast=new THREE.Mesh(new THREE.BoxGeometry(M(D*.05),1,M(D*.05)),steel);mast.castShadow=true;arm.add(mast);const mastBottom=armR,mastTop=M(roofY-D*.09)-focal.y;mast.scale.y=Math.max(.001,mastTop-mastBottom);mast.position.y=(mastTop+mastBottom)/2;
 const carriage=new THREE.Mesh(new THREE.BoxGeometry(M(D*.08),M(D*.05),M(D*.07)),dark);carriage.castShadow=true;arm.add(carriage);
 const link=new THREE.Mesh(new THREE.BoxGeometry(M(D*.025),1,M(D*.025)),steel);link.castShadow=true;arm.add(link);
 // Beam: translucent cone from the focal spot to the detector face.
 const beamGeo=new THREE.CylinderGeometry(1,.02,1,32,1,true);beamGeo.translate(0,-.5,0);
 const beam=new THREE.Mesh(beamGeo,mat(0x9c8cff,0,.4,{transparent:true,opacity:.11,depthWrite:false,side:THREE.DoubleSide,emissive:0x7b6cff,emissiveIntensity:.35}));beam.castShadow=false;g.add(beam);
 // Warning lamp on the roof, on while the tube is.
 const lamp=cyl(D*.03,D*.03,D*.05,mat(0x3a1612,.1,.4,{emissive:0xff3b2a,emissiveIntensity:0}),half*.7,roofY+D*.04,-depth*.6,g);
 // XY stage: fixed linear rails on posts along x, a bridge that rides them, and the tray that slides
 // along the bridge in y. Drive motors at the rail ends; a cable chain follows the bridge.
 const railZ=b.height/2+D*.24,railY=-D*.09,railLen=half*1.9;
 for(const sz of [-1,1]){box(railLen,D*.025,D*.03,alu,0,railY,sz*railZ,g);box(railLen,D*.01,D*.012,steel,0,railY+D*.017,sz*railZ,g);for(const sx of [-1,0,1])box(D*.03,railY-floorY,D*.03,steel,sx*railLen*.45,(railY+floorY)/2,sz*railZ,g);
  box(D*.07,D*.07,D*.07,dark,-railLen/2-D*.03,railY,sz*railZ,g)}
 const bridge=new THREE.Group();g.add(bridge);for(const sx of [-1,1]){box(D*.03,D*.025,railZ*2+D*.04,alu,sx*(b.width/2+D*.06),railY+D*.035,0,bridge);for(const sz of [-1,1])box(D*.06,D*.03,D*.05,dark,sx*(b.width/2+D*.06),railY+D*.035,sz*railZ,bridge)}
 box(D*.05,D*.05,D*.05,dark,b.width/2+D*.06,railY+D*.07,-railZ,bridge);
 const chain=[];for(let i=0;i<14;i++){const m=box(D*.035,D*.02,D*.04,mat(0x1b1c1f,.1,.7),0,railY-D*.04,railZ+D*.07,g);chain.push(m)}
 // The board on the tray.
 const tray=new THREE.Group();g.add(tray);const bd=kit.makeBoard({stage:'soldered',result});tray.add(bd.group);
 for(const k of [-1,1]){box(b.width+14,3,4,mat(COLORS.steel,.7,.35),0,-2.5,k*(b.height/2+4),tray);box(4,3,b.height+12,mat(COLORS.steel,.7,.35),k*(b.width/2+6),-2.5,0,tray)}
 // Operator computer outside the glass: monitor on an arm, keyboard, desk. Its screen shows the live image.
 const pc=new THREE.Group();g.add(pc);pc.position.set(M(half*.5),0,M(depth+D*.22));pc.rotation.y=-.28;
 box(D*.7,D*.03,D*.32,mat(0x5f6e78,.2,.6),0,floorY+D*.5,0,pc);cyl(D*.014,D*.014,D*.3,mat(COLORS.steel,.7,.3),0,floorY+D*.66,-D*.08,pc);
 box(D*.9,D*.6,D*.03,mat(0x1d1f22,.3,.5),0,floorY+D*1.08,-D*.08,pc);box(D*.36,D*.012,D*.12,mat(0x2b2d30,.3,.6),0,floorY+D*.525,D*.06,pc);
 let screen=null,tex=null,shown='';
 if(typeof document!=='undefined'){const c=document.createElement('canvas');c.width=640;c.height=420;tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  screen=new THREE.Mesh(new THREE.PlaneGeometry(M(D*.86),M(D*.56)),mat(0xffffff,0,.5,{map:tex,emissive:0xffffff,emissiveMap:tex,emissiveIntensity:.6}));screen.position.set(0,M(floorY+D*1.08),M(-D*.06));pc.add(screen)}

 const steps=[{t:0,label:'Board enters the shielded cabinet'}];
 if(tl.windows.length){steps.push({t:1.5,label:'Door interlocked, tube on'});for(const w of tl.windows.slice(0,9)){const p=byRef.get(w.ref);steps.push({t:w.t0,label:`${w.ref} · ${p?.package||''}`.trim()})}if(tl.windows.length>9)steps.push({t:tl.windows[9].t0,label:`${tl.windows.length-9} more parts`});steps.push({t:duration-3,label:'Tube off, board leaves'})}
 else steps[0]={t:0,label:'Nothing to X-ray: board passes through'};
 const center=ref=>{const p=byRef.get(ref);return p?[p.x,p.y]:[0,0]};
 const tmp=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
 const update=t=>{
  // Tray: in from the left, part to part, out to the right.
  let x,y;const ws=tl.windows;
  if(!ws.length){x=lerp(-half*1.6,half*1.6,ease(span(t,0,duration)));y=0}
  else if(t<tl.load){const [cx,cy]=center(ws[0].ref),f=ease(span(t,0,tl.load-.4));x=lerp(-half*1.6,-cx,f);y=lerp(0,-cy,f)}
  else if(t>=ws[ws.length-1].t1){const [cx,cy]=center(ws[ws.length-1].ref),f=ease(span(t,ws[ws.length-1].t1,duration));x=lerp(-cx,half*1.6,f);y=lerp(-cy,0,f)}
  else{const i=ws.findIndex(w=>t>=w.t0&&t<w.t1),[cx,cy]=center(ws[i].ref),[px,py]=i?center(ws[i-1].ref):[cx,cy],f=ease(span(t,ws[i].t0,ws[i].t0+.8));x=-lerp(px,cx,f);y=-lerp(py,cy,f)}
  tray.position.set(M(x),0,M(y));bridge.position.x=M(x);
  // Cable chain: links spread evenly from the fixed end to the bridge.
  chain.forEach((m,i)=>{m.position.x=M(-railLen/2+(x+railLen/2)*i/(chain.length-1))});
  // Detector and beam for the current part: top view first, then tilted views around the part.
  const w=windowAt(tl,t),on=!!w&&t>=w.t0+.8&&t<w.t1-.2,local=w?t-w.t0:0,tiltF=w?ease(span(local,2.6,3.4))*(1-ease(span(local,5.4,5.8))):0,az=w?span(local,3.4,5.6)*Math.PI*2:0;
  const th=tiltF*35*Math.PI/180;
  arm.rotation.y=-az;turntable.rotation.y=-az;const cr=armR,ang=Math.PI/2-th;carriage.position.set(cr*Math.cos(ang),cr*Math.sin(ang),0);carriage.rotation.z=-th;
  const dl=cr-M(R+D*.02);link.scale.y=Math.max(.001,dl);link.position.set((cr-dl/2)*Math.cos(ang),(cr-dl/2)*Math.sin(ang),0);link.rotation.z=-th;
  det.position.set(M(R*Math.sin(th)*Math.cos(az)),M(spotY+D*.02+R*Math.cos(th)),M(R*Math.sin(th)*Math.sin(az)));det.lookAt(focal);
  beam.visible=on;if(on){tmp.copy(det.position).sub(focal);const len=tmp.length();beam.position.copy(det.position);beam.quaternion.setFromUnitVectors(up,tmp.clone().normalize());beam.scale.set(M(panelW*.46),len,M(panelW*.46));}
  spot.material.emissiveIntensity=on?2.2:0;lamp.material.emissiveIntensity=w&&t<w.t1?1.6:0;
  // The computer shows the part under the tube; it only redraws when the picture would change.
  if(tex){const sc=scanState(tl,t),key=scanKey(sc);
   if(key!==shown){shown=key;const c=tex.image;drawRadiograph(c.getContext('2d'),c.width,c.height,plan,result,sc.ref,{tilt:sc.tilt,scan:sc.on?(sc.local*1.5)%1:null,live:sc.on,reveal:sc.reveal});tex.needsUpdate=true}}
 };
 update(0);
 // The camera takes in both the cabinet and the operator computer beside it.
 return {group:g,duration,steps,update,view:{target:[M(half*.22),M(D*.3),M(depth*.45)],position:[M(D*.95),M(D*1.0),M(depth+D*2.1)]}};
}
