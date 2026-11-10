// Automated optical inspection. The soldered board comes in on the rails against a stop pin and is
// edge-clamped; the head reads both fiducials, then visits every part in a serpentine order (rows by
// board y from the rear, alternating x direction). At each part it takes a top image under the
// three-colour ring light (red high/steep, green middle, blue low/shallow: the colour on a joint
// gives its fillet slope) and four angled side images (rear, right, front, left). Once a part is
// imaged its outline box appears: green when its result.aoi entry passes, red when it has defects.
// Offsets, rotation, polarity and solder come from plan.results (simulated). Poses are pure in t.
import {span,ease,lerp} from './common.js';

export const MOVE=.4,TOP=.4,SIDES=4; // share of each part's slot spent moving; share of the dwell for the top shot; side cameras
export const SHORT={Offset:'Offset',Rotation:'Rotation',Tombstone:'Tombstone','Insufficient solder':'Low solder'};
export const DEFECTS=['Offset','Rotation','Tombstone','Insufficient solder'];
const r2=n=>Math.round(n*100)/100;
const clampV=(v,a,b)=>Math.max(a,Math.min(b,v));

// Shared by the 3D view and the panel: scan order, phase times (they add up to the cycle) and sizes.
export function aoiNumbers(plan,result){
 const W=plan.board.width,H=plan.board.height,D=r2(Math.max(6,plan.times.aoi)),hs=clampV(Math.max(W,H)/80,.3,2);
 const res=new Map((result?.aoi||[]).map(a=>[a.ref,a]));
 // Rows about 15 mm deep, from the rear (−y) to the front; empty rows are skipped so the direction
 // alternates between rows the head actually visits.
 const ny=Math.max(1,Math.round(H/15)),rowH=H/ny,rowOf=y=>clampV(Math.floor((y+H/2)/rowH),0,ny-1);
 const byRow=new Map();for(const p of plan.machine){const r=rowOf(p.y);if(!byRow.has(r))byRow.set(r,[]);byRow.get(r).push(p)}
 const order=[];
 [...byRow.keys()].sort((a,b)=>a-b).forEach((r,j)=>{const dir=j%2?-1:1;
  byRow.get(r).slice().sort((a,b)=>dir*(a.x-b.x)||a.y-b.y||String(a.ref).localeCompare(String(b.ref))).forEach(p=>{
   const a=(p.rot||0)*Math.PI/180,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a));
   order.push({ref:p.ref,x:p.x,y:p.y,row:j,part:p,res:res.get(p.ref)||null,ex:r2(p.w*c+p.d*s),ey:r2(p.w*s+p.d*c)})})});
 const rows=order.length?order[order.length-1].row+1:0,N=order.length;
 const LOAD=Math.min(1.4,D*.15),FID=Math.min(.8,D*.1),MEAS=Math.min(.8,D*.1),JUDGE=Math.min(.6,D*.07),OUT=Math.min(1.2,D*.13);
 const T={load:0,fid:LOAD,s0:LOAD+FID,s1:D-OUT-JUDGE-MEAS,meas:D-OUT-JUDGE-MEAS,judge:D-OUT-JUDGE,out:D-OUT};
 const dt=N?(T.s1-T.s0)/N:0,x0=-(W+40*hs),x1=W+40*hs;
 return {W,H,D,hs,order,rows,N,T,dt,park:[0,-(H/2+34*hs)],fid:[[-W/2+4,-H/2+4],[W/2-4,H/2-4]],x0,x1};
}

// Machine state at t, mm on the board axes (z = board y).
export function aoiState(n,t){
 const {T,dt,order,park,N,D}=n,[f1,f2]=n.fid;t=Math.max(0,Math.min(D,t));
 const bx=t<T.out?lerp(n.x0,0,ease(span(t,0,T.fid*.8))):lerp(0,n.x1,ease(span(t,T.out+(D-T.out)*.2,D)));
 const stop=t<T.out?ease(span(t,0,T.fid*.25)):1-ease(span(t,T.out,T.out+(D-T.out)*.15));
 const clamp=t<T.out?ease(span(t,T.fid*.8,T.fid)):1-ease(span(t,T.out,T.out+(D-T.out)*.2));
 const mv=(a,b,f)=>[lerp(a[0],b[0],ease(f)),lerp(a[1],b[1],ease(f))],at=o=>[o.x,o.y];
 let head=park,ring=false,top=false,side=-1,cur=-1,done=0,phase='load';
 if(t>=T.fid&&t<T.s0){phase='fid';const u=span(t,T.fid,T.s0);
  head=u<.35?mv(park,f1,u/.35):u<.5?f1:u<.85?mv(f1,f2,(u-.5)/.35):f2;ring=(u>=.35&&u<.5)||u>=.85;top=ring}
 else if(t>=T.s0&&t<T.s1&&N){phase='scan';const v=(t-T.s0)/dt,i=Math.min(N-1,Math.floor(v)),f=v-i;cur=i;done=i;
  const from=i?at(order[i-1]):f2;
  if(f<MOVE)head=mv(from,at(order[i]),f/MOVE);
  else{head=at(order[i]);const u=(f-MOVE)/(1-MOVE);if(u<TOP){ring=top=true}else side=Math.min(SIDES-1,Math.floor((u-TOP)/(1-TOP)*SIDES))}}
 else if(t>=T.s0){done=N;phase=t<T.judge?'measure':t<T.out?'judge':'out';const last=N?at(order[N-1]):f2;head=mv(last,park,span(t,T.s1,T.s1+(T.judge-T.s1)*.9))}
 return {bx,stop,clamp,head,ring,top,side,cur,done,phase,verdict:t>=T.judge};
}

// Results of the first `done` parts in scan order (all of them by default).
export function aoiSummary(n,done=Infinity){
 const seen=n.order.slice(0,Math.max(0,done)).map(o=>o.res).filter(Boolean),by=Object.fromEntries(DEFECTS.map(d=>[d,0]));
 for(const r of seen)for(const d of r.defects)by[d]=(by[d]||0)+1;
 return {inspected:Math.min(n.N,Math.max(0,done)),total:n.N,pass:seen.filter(r=>r.pass).length,fail:seen.filter(r=>!r.pass).length,by};
}

function stepsFor(n){
 const {T,order,rows,N}=n,steps=[{t:0,label:'Convey in, stop pin, edge clamp'},{t:r2(T.fid),label:'Read 2 fiducials'}];
 // Up to 5 imaging steps, each a group of rows, timed at the first part of the group.
 const per=Math.max(1,Math.ceil(rows/5));
 for(let r=0;r<rows;r+=per){const last=Math.min(rows,r+per),first=order.findIndex(o=>o.row>=r),cnt=order.filter(o=>o.row>=r&&o.row<last).length;
  steps.push({t:r2(T.s0+first*n.dt),label:`${last-r>1?`Rows ${r+1}–${last}`:`Row ${r+1}`}/${rows}: ${cnt} part${cnt>1?'s':''}, RGB top + 4 angled`})}
 steps.push({t:r2(T.meas),label:'Measure offset, rotation, polarity, solder'});
 const s=aoiSummary(n),types=DEFECTS.filter(d=>s.by[d]).map(d=>SHORT[d]);
 let v=s.fail?`NG: ${s.fail}/${N} part${N>1?'s':''} · ${types.join(', ')}`:N?`OK: all ${N} parts in spec`:'OK: no parts to inspect';
 if(v.length>60)v=v.slice(0,59)+'…';
 steps.push({t:r2(T.judge),label:v},{t:r2(T.out),label:'Unclamp, convey to X-ray'});
 // Keep times strictly ascending even on a board with no parts.
 for(let i=1;i<steps.length;i++)if(steps[i].t<=steps[i-1].t)steps[i].t=r2(steps[i-1].t+.01);
 return steps;
}

export function build(kit,{THREE,plan,result}){
 const {M,box,cyl,mat,COLORS:C}=kit,n=aoiNumbers(plan,result),{W,H,D,hs,T,order,N}=n,group=new THREE.Group();
 const frame=mat(C.frame,.15,.7),dark=mat(C.dark,.3,.6),steel=mat(C.steel,.7,.35),copper=mat(C.copper,.35,.45);

 const bd=kit.makeBoard({stage:'soldered',result});bd.group.name='aoi-board';group.add(bd.group);
 const partH=new Map();for(const [ref,m] of bd.parts)partH.set(ref,(m.userData.h+m.userData.lift)/kit.S);
 const tallest=Math.max(2,...partH.values());

 // Head heights from the lowest ring (clear of the tallest part) up; the side cameras look down at 45°.
 const Y0=Math.max(tallest+4,10*hs),camR=24*hs,camY=Y0+20*hs,beamY=Y0+56*hs,railY=beamY-9*hs,baseY=-24*hs-6;
 const headHalf=30*hs,GX=Math.max(W/2,...order.map(o=>Math.abs(o.x)))+headHalf+8;
 const zMin=n.park[1]-30*hs,zMax=H/2+30*hs,zMid=(zMin+zMax)/2,zLen=zMax-zMin;
 box(2*GX+30,4,zLen+20,frame,0,baseY-2,zMid,group);
 kit.rails(n.x1-n.x0+W+10,group);
 for(const s of [-1,1]){box(8*hs,6*hs,zLen,steel,s*GX,railY,zMid,group);
  for(const z of [zMin+4,zMax-4])box(7*hs,railY-baseY,7*hs,frame,s*GX,(railY+baseY)/2,z,group)}
 const stopper=cyl(1.2,1.2,6,steel,W/2+1.4,-5.5,0,group,12);stopper.name='aoi-stopper';
 const clamps=[-1,1].map(s=>{const b=box(Math.max(4,Math.min(W*.8,W-8)),1.4,1,dark,0,-.7,s*(H/2+1.5),group);b.userData.s=s;return b});
 // Signal tower on the front-right post: green while inspecting, then the verdict (green OK, red NG).
 const lamp=(hex,y)=>{const m=mat(hex,.1,.5,{emissive:hex,emissiveIntensity:0});cyl(3*hs,3*hs,5*hs,m,GX,y,zMax-4,group,16);return m};
 cyl(1.2*hs,1.2*hs,8*hs,steel,GX,railY+7*hs,zMax-4,group,8);
 const green=lamp(C.pass,railY+13.5*hs),red=lamp(C.fail,railY+19*hs);

 // Beam (moves along z) and the head on its carriage (moves along x on the beam).
 const beam=new THREE.Group();beam.name='aoi-beam';group.add(beam);
 box(2*GX+10*hs,10*hs,12*hs,dark,0,beamY,0,beam);
 for(const s of [-1,1])box(12*hs,8*hs,14*hs,steel,s*GX,railY+5*hs,0,beam);
 const head=new THREE.Group();head.name='aoi-head';group.add(head);
 box(20*hs,12*hs,16*hs,steel,0,beamY,10*hs,head);
 box(2*headHalf*.8,10*hs,26*hs,dark,0,beamY-11*hs,0,head);box(2*headHalf*.8+.2,2*hs,26.4*hs,copper,0,beamY-7*hs,0,head);
 // Top camera straight down through the ring stack.
 cyl(5*hs,5*hs,beamY-16*hs-(Y0+15*hs),dark,0,(beamY-16*hs+Y0+15*hs)/2,0,head,20);
 const topLens=mat(0x2b2c2e,.1,.4,{emissive:0xeef3ff,emissiveIntensity:0});cyl(3.4*hs,3.4*hs,1*hs,topLens,0,Y0+14.6*hs,0,head,20);
 cyl(28*hs,28*hs,2*hs,dark,0,Y0+14*hs,0,head,32);
 // Three-colour ring light: red high and narrow (steep angles), green middle, blue low and wide.
 const rings=[[0xe0453a,10,12],[0x3fb062,5,17],[0x3f6fe0,0,22]].map(([hex,dy,r])=>{const m=mat(0x2b2c2e,.1,.5,{emissive:hex,emissiveIntensity:0});
  const ring=new THREE.Mesh(kitOwn(kit,new THREE.TorusGeometry(M(r*hs),M(1.2*hs),8,40)),m);ring.rotation.x=Math.PI/2;ring.position.y=M(Y0+dy*hs);head.add(ring);return m});
 for(let k=0;k<4;k++){const a=k*Math.PI/2+Math.PI/4;box(1*hs,14*hs,1*hs,steel,22*hs*Math.cos(a),Y0+7*hs,22*hs*Math.sin(a),head)}
 // Four angled cameras: rear, right, front, left, each aimed at the point under the head.
 const sideLens=[[0,-1],[1,0],[0,1],[-1,0]].map(([sx,sz])=>{const g=new THREE.Group();g.position.set(M(sx*camR),M(camY),M(sz*camR));
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),new THREE.Vector3(-sx*camR,-camY,-sz*camR).normalize());head.add(g);
  cyl(3.6*hs,3.6*hs,14*hs,dark,0,4*hs,0,g,16);box(8*hs,6*hs,8*hs,steel,0,12*hs,0,g);
  const lm=mat(0x2b2c2e,.1,.4,{emissive:0xeef3ff,emissiveIntensity:0});cyl(2.6*hs,2.6*hs,1*hs,lm,0,-3.4*hs,0,g,16);return lm});

 // Field of view around the part being imaged: a copper square at board level (1 px lines).
 const sq=new THREE.BufferGeometry();sq.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,-.5,.5,0,-.5,.5,0,-.5,.5,0,.5,.5,0,.5,-.5,0,.5,-.5,0,.5,-.5,0,-.5],3));kitOwn(kit,sq);
 const fov=new THREE.LineSegments(sq,kitOwn(kit,new THREE.LineBasicMaterial({color:C.copper})));fov.name='aoi-fov';fov.position.y=M(.06);bd.group.add(fov);

 // Outlines: one merged LineSegments, parts in scan order, so the inspected ones are a draw range.
 const tplBox=new THREE.BoxGeometry(1,1,1),tpl=new THREE.EdgesGeometry(tplBox),tp=tpl.attributes.position.array,V=tp.length/3;tplBox.dispose();tpl.dispose();
 const pos=new Float32Array(Math.max(1,N)*V*3),col=new Float32Array(Math.max(1,N)*V*3),c=new THREE.Color(),ok=[];
 order.forEach((o,i)=>{const p=o.part,mg=Math.max(.25,.06*Math.max(p.w,p.d)),sx=M(p.w+2*mg),sz=M(p.d+2*mg),sy=M((partH.get(o.ref)??p.h)+mg),a=(p.rot||0)*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a);
  const pass=o.res?o.res.pass:true;ok.push(pass);c.setHex(pass?C.pass:C.fail);
  for(let v=0;v<V;v++){const lx=tp[v*3]*sx,ly=(tp[v*3+1]+.5)*sy,lz=tp[v*3+2]*sz,k=(i*V+v)*3;
   pos[k]=M(p.x)+lx*ca+lz*sa;pos[k+1]=ly;pos[k+2]=M(p.y)-lx*sa+lz*ca;col[k]=c.r;col[k+1]=c.g;col[k+2]=c.b}});
 const og=kitOwn(kit,new THREE.BufferGeometry());og.setAttribute('position',new THREE.BufferAttribute(pos,3));og.setAttribute('color',new THREE.BufferAttribute(col,3));
 const outlines=new THREE.LineSegments(og,kitOwn(kit,new THREE.LineBasicMaterial({vertexColors:true})));outlines.name='aoi-outlines';outlines.frustumCulled=false;
 outlines.userData={refs:order.map(o=>o.ref),pass:ok,perPart:V};bd.group.add(outlines);

 // Verdict markers: a red cone above each failed part, from the verdict on.
 const failed=order.filter(o=>o.res&&!o.res.pass),flagH=4*hs;
 const flags=new THREE.InstancedMesh(kitOwn(kit,new THREE.ConeGeometry(M(1.4*hs),M(flagH),12)),mat(C.fail,.1,.5),Math.max(1,failed.length));flags.name='aoi-flags';flags.count=failed.length;
 {const m4=new THREE.Matrix4(),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI),one=new THREE.Vector3(1,1,1),v=new THREE.Vector3();
  failed.forEach((o,i)=>{v.set(M(o.x),M((partH.get(o.ref)??o.part.h)+2+flagH/2),M(o.y));flags.setMatrixAt(i,m4.compose(v,q,one))});flags.instanceMatrix.needsUpdate=true}
 bd.group.add(flags);

 const steps=stepsFor(n);
 const ext=Math.max(2*GX+30,zLen+20,beamY-baseY),dir=new THREE.Vector3(.32,.62,.8).normalize(),dist=M(ext)/2/Math.sin(17*Math.PI/180)*.8;
 const view={target:[0,M(Y0*.6),M(zMid*.3)],position:[dir.x*dist,M(Y0*.6)+dir.y*dist,M(zMid*.3)+dir.z*dist]};
 const aoiPass=!failed.length;
 group.userData={numbers:n};

 const update=t=>{
  const s=aoiState(n,t);
  bd.group.position.x=M(s.bx);
  stopper.position.y=M(-5.5+4.5*s.stop);
  for(const b of clamps)b.position.z=M(b.userData.s*(H/2+.5+(1-s.clamp)*1.5));
  beam.position.z=M(s.head[1]);head.position.set(M(s.head[0]),0,M(s.head[1]));
  for(const m of rings)m.emissiveIntensity=s.ring?1.5:0;
  topLens.emissiveIntensity=s.top?1.6:0;
  sideLens.forEach((m,i)=>{m.emissiveIntensity=s.side===i?1.8:0});
  fov.visible=s.cur>=0;
  {const o=order[Math.max(0,s.cur)]||{x:0,y:0,ex:0,ey:0},f=Math.max(o.ex,o.ey)+3;fov.position.x=M(o.x);fov.position.z=M(o.y);fov.scale.set(M(f),1,M(f))}
  og.setDrawRange(0,s.done*V);outlines.visible=s.done>0;
  flags.visible=s.verdict&&failed.length>0;
  green.emissiveIntensity=s.phase!=='load'&&(!s.verdict||aoiPass)?1.4:0;red.emissiveIntensity=s.verdict&&!aoiPass?1.4:0;
 };
 update(0);
 return {group,duration:D,steps,update,view,rate:D>60?D/40:undefined};
}

// Geometries and materials made here go on the kit's dispose list (kit.mat/box/cyl already do).
function kitOwn(kit,x){(kit.__aoiOwned||(kit.__aoiOwned=[])).push(x);if(!kit.__aoiHooked){kit.__aoiHooked=true;const d=kit.dispose;kit.dispose=()=>{for(const o of kit.__aoiOwned)o.dispose?.();d()}}return x}
