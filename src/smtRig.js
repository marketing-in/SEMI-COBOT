// SMT machine around the board in the studio's 3D view: conveyor rails, tape feeders with reels
// along the board edges, upward cameras and a gantry head with one nozzle per slot. It plays a
// timeline from smtLine.js with the board clamped in place (no conveyor transfer), moving the
// board's own part meshes from feeder pockets onto their pads.
import {sampleLine,nozzleOffset,cameraFor,MACHINE} from './smtLine.js';

export function createSmtRig(THREE,{line,board,scale:S,top,meshByRef}){
 const root=new THREE.Group(),M=v=>v*S;
 const mat=(color,metalness=.2,roughness=.6,extra={})=>new THREE.MeshStandardMaterial({color,metalness,roughness,...extra});
 const box=(w,h,d,material,x,y,z,parent=root)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(M(w),M(h),M(d)),material);m.position.set(M(x),top+M(y),M(z));m.castShadow=m.receiveShadow=true;parent.add(m);return m};
 const frame=mat(0xd9d6ce,.15,.7),dark=mat(0x2e3033,.3,.6),steel=mat(0xa9adb1,.7,.35),copper=mat(0xd9824a,.35,.45);
 const n=line.opts.nozzles,feeders=line.feeders,banks=[...new Set(feeders.map(f=>f.bank))];
 // The frame spans every feeder and every head position, including the outer nozzles' reach.
 const headW=(n-1)*18+20,half=Math.max(board.width/2+12,...feeders.map(f=>Math.abs(f.x)+f.pitch/2+6),...line.keys.map(k=>Math.abs(k.x)+headW/2+4));
 const LEN=44,reach=board.height/2+MACHINE.clear+LEN+40;
 // Conveyor rails along the board edges and the machine base under everything.
 for(const k of [-1,1])box(board.width+60,6,3,steel,0,-5,k*(board.height/2+2));
 box(half*2+30,3,reach*2,frame,0,-19.5,0);
 // Feeders: body, carrier tape and reel; a flat matrix tray for large parts.
 for(const f of feeders){const sign=f.bank==='front'?1:-1;
  box(f.pitch-1.4,17,LEN,mat(0x3a3d40,.3,.55),f.x,-9,f.y+sign*(LEN/2-6));
  if(f.kind==='tray')box(f.pitch-2,2,LEN*.8,mat(0x15161a,.05,.9),f.x,-.9,f.y+sign*(LEN*.4-6));
  else{box(f.tape,.5,LEN,mat(f.tape>8?0x1b1c1f:0xe9e3d3,.05,.85),f.x,-.3,f.y+sign*(LEN/2-6));
   const r=12+f.tape*.3,reel=new THREE.Mesh(new THREE.CylinderGeometry(M(r),M(r),M(f.tape+1.5),28),mat(0xe8e7e2,.05,.5));reel.rotation.z=Math.PI/2;reel.position.set(M(f.x),top+M(-18+r),M(f.y+sign*(LEN-4+r*.7)));reel.castShadow=true;root.add(reel);
   const wound=new THREE.Mesh(new THREE.CylinderGeometry(M(r*.7),M(r*.7),M(f.tape+1.6),28),mat(f.tape>8?0x1b1c1f:0xcfc6b0,.05,.8));wound.rotation.z=Math.PI/2;wound.position.copy(reel.position);root.add(wound)}}
 // Upward cameras with ring lights between the feeders and the board.
 for(const b of banks.length?banks:['front']){const c=cameraFor(b,board),cam=new THREE.Mesh(new THREE.CylinderGeometry(M(5),M(5),M(14),18),dark);cam.position.set(M(c.x),top+M(-8),M(c.y));root.add(cam);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(M(4),M(.8),8,20),mat(0xfff3dc,0,.4,{emissive:0xfff3dc,emissiveIntensity:.8}));ring.rotation.x=Math.PI/2;ring.position.set(M(c.x),top+M(-.6),M(c.y));root.add(ring)}
 // h and lift are the rendered body height and its gap above the board (scene units, set by Board.jsx).
 const parts=line.machine.map(p=>{const m=meshByRef.get(p.ref);return m?{p,m,h:m.userData.h??2*(m.userData.base.y-top),lift:m.userData.lift??0}:null}).filter(Boolean);
 // Gantry: travel height clears the tallest part twice over, so a carried part never hits a placed one.
 const maxH=Math.max(2,...line.machine.map(p=>+p.h||0)),TIP_UP=Math.max(10,2*maxH+3,...parts.map(q=>2*(q.h+q.lift)/S+3)),CARRIAGE=TIP_UP+12,gY=CARRIAGE+24,railX=half+8;
 for(const k of [-1,1]){box(8,7,reach*2,steel,k*railX,gY,0);for(const z of [-1,1])box(7,gY+18,7,frame,k*railX,(gY-18)/2,z*(reach-6))}
 const beam=box(railX*2+8,10,14,dark,0,gY+1,0);
 const carriage=new THREE.Group();root.add(carriage);
 box(headW,22,20,dark,0,CARRIAGE+11,0,carriage);box(headW+.4,6,1,copper,0,CARRIAGE+15,10.2,carriage);
 const tubes=[];for(let k=0;k<n;k++){box(5,6,5,mat(0x55595d,.5,.4),nozzleOffset(k,n),CARRIAGE-3,0,carriage);const t=new THREE.Mesh(new THREE.CylinderGeometry(M(1.1),M(.7),1,10),steel);t.castShadow=true;carriage.add(t);tubes.push(t)}

 const pickIdx=new Map(line.pickOrder.map((r,i)=>[r,i])),placeIdx=new Map(line.placeOrder.map((r,i)=>[r,i]));
 const pocket=new Map();for(const f of feeders){const refs=[...f.refs].sort((a,b)=>(pickIdx.get(a)??1e9)-(pickIdx.get(b)??1e9));for(const r of refs)pocket.set(r,{f,refs})}
 const tStart=(line.keys.find(k=>k.phase==='fiducial')||line.keys[0]).t,lastPlace=[...line.keys].reverse().find(k=>k.phase==='place');
 const tEnd=lastPlace?lastPlace.t+.05:tStart;
 const apply=t=>{
  const s=sampleLine(line,t);if(!s)return s;
  beam.position.z=M(s.y);carriage.position.set(M(s.x),0,M(s.y));
  const tip=tubes.map((tube,k)=>{const y=TIP_UP*(1-s.z[k])+s.zt[k]*s.z[k],L=Math.max(.4,CARRIAGE-6-y);tube.scale.y=M(L);tube.position.set(M(nozzleOffset(k,n)),top+M(y+L/2),0);return y});
  const held=new Map();s.held.forEach((r,k)=>{if(r)held.set(r,k)});
  for(const {p,m,h,lift} of parts){const pl=placeIdx.get(p.ref),k=held.get(p.ref);
   if(pl!==undefined&&pl<s.placed){m.visible=true;m.position.copy(m.userData.base);m.rotation.y=m.userData.baseRot}
   else if(k!==undefined){m.visible=true;m.position.set(M(s.x+nozzleOffset(k,n)),top+M(tip[k])-h/2,M(s.y));m.rotation.y=(s.rot[k]||0)*Math.PI/180}
   else{const q=pocket.get(p.ref),next=q?.refs.find(r=>(pickIdx.get(r)??1e9)>=s.picked);m.visible=next===p.ref;if(m.visible){m.position.set(M(q.f.x),top+lift+h/2,M(q.f.y));m.rotation.y=0}}}
  return s};
 // Where each part was set down compared with its placement data: centre in mm, rotation in degrees.
 const byRef=new Map(line.machine.map(p=>[p.ref,p]));let maxMm=0,maxDeg=0;
 line.keys.forEach((key,i)=>{if(key.phase!=='place'||!i)return;const prev=line.keys[i-1];key.z.forEach((z,k)=>{if(z!==1)return;const ref=prev.held[k];const p=ref&&byRef.get(ref);if(!p)return;
  maxMm=Math.max(maxMm,Math.hypot(key.x+nozzleOffset(k,n)-p.x,key.y-p.y));let d=((prev.rot[k]-(p.rot||0))%360+360)%360;if(d>180)d=360-d;maxDeg=Math.max(maxDeg,d)})});
 const restore=()=>{for(const {m} of parts){m.visible=true;m.position.copy(m.userData.base);m.rotation.y=m.userData.baseRot}};
 const dispose=()=>{root.parent?.remove(root);root.traverse(o=>{o.geometry?.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(x=>x.dispose())})};
 const bounds=new THREE.Box3().setFromObject(root);
 return {root,apply,tStart,tEnd,restore,dispose,bounds,error:{mm:maxMm,deg:maxDeg}};
}
