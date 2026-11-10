// 3D solder paste inspection. The printed board comes in on the rails against a stop pin and is
// edge-clamped; the head reads both fiducials with its ring light, then steps over the board in a
// serpentine raster of camera fields of view. At each FOV the two fringe projectors (left, right)
// take turns throwing a sinusoidal stripe pattern, four phase shifts each; the camera's phase maps
// give every deposit's height, area and volume, and the deposits in that FOV are judged against the
// spec. Volumes and status come from plan.results (simulated). Poses are pure in t.
import {span,ease,lerp,clamp01} from './common.js';

export const FOV={w:20,h:16},SHOTS=4,PERIOD=1.6; // mm; phase shifts per projector; fringe period (mm)
const r2=n=>Math.round(n*100)/100;
const tilesFor=(W,H,s)=>Math.ceil(W/(FOV.w*s)-1e-9)*Math.ceil(H/(FOV.h*s)-1e-9);

// Shared by the 3D view and the panel: FOV size and raster, which FOV measures each deposit, and the
// cycle's phase times (they add up to plan.times.spi).
export function spiNumbers(plan,result){
 const W=plan.board.width,H=plan.board.height,D=plan.times.spi;
 // Scale the FOV so the board takes 2–40 of them.
 let s=1;while(tilesFor(W,H,s)>40)s*=1.05;while(tilesFor(W,H,s)<2&&s>.05)s/=1.05;
 const fw=r2(FOV.w*s),fh=r2(FOV.h*s),nx=Math.ceil(W/fw-1e-9),ny=Math.ceil(H/fh-1e-9);
 const cx=c=>nx>1?-W/2+fw/2+c*(W-fw)/(nx-1):0,cz=r=>ny>1?-H/2+fh/2+r*(H-fh)/(ny-1):0;
 // Raster: start at the front-right corner (next to the second fiducial), serpentine to the rear.
 const tiles=[];for(let r=0;r<ny;r++)for(let k=0;k<nx;k++){const c=r%2?k:nx-1-k,zi=ny-1-r;tiles.push({row:r,col:c,x:r2(cx(c)),z:r2(cz(zi))})}
 const near=(v,half,f,n)=>n>1?Math.max(0,Math.min(n-1,Math.round((v+half-f/2)/((2*half-f)/(n-1))))):0;
 const deposits=result?.deposits||plan.pads;
 const tileOf=deposits.map(d=>{const c=near(d.x,W/2,fw,nx),zi=near(d.y,H/2,fh,ny),r=ny-1-zi;return r*nx+(r%2?c:nx-1-c)});
 const LOAD=Math.min(1.2,D*.15),FID=Math.min(.9,D*.12),JUDGE=Math.min(.4,D*.05),OUT=Math.min(1.2,D*.15);
 const T={load:0,fid:LOAD,s0:LOAD+FID,s1:D-OUT-JUDGE,judge:D-OUT-JUDGE,out:D-OUT};
 const dt=(T.s1-T.s0)/tiles.length,hs=fw/FOV.w,park=[0,-(H/2+22*hs)];
 return {W,H,D,fw,fh,nx,ny,scale:r2(s),hs,tiles,tileOf,T,dt,park,fid:[[-W/2+4,-H/2+4],[W/2-4,H/2-4]],x0:-(W*.6+20),x1:W*.6+20,
  shots:2*SHOTS,move:.35};
}

// Machine state at t, mm on the board axes (z = board y).
export function spiState(n,t){
 const {T,dt,tiles,park,fid:[f1,f2]}=n,N=tiles.length;
 const bx=t<T.out?lerp(n.x0,0,ease(span(t,0,T.fid*.8))):lerp(0,n.x1,ease(span(t,T.out+(n.D-T.out)*.2,n.D)));
 const stop=t<T.out?ease(span(t,0,T.fid*.25)):1-ease(span(t,T.out,T.out+(n.D-T.out)*.15));
 const clamp=t<T.out?ease(span(t,T.fid*.8,T.fid)):1-ease(span(t,T.out,T.out+(n.D-T.out)*.2));
 // Head path: park, fiducial 1, fiducial 2, each FOV (move then capture), back to park.
 const F=T.s0-T.fid,path=[[T.fid,park],[T.fid+F*.3,f1],[T.fid+F*.5,f1],[T.fid+F*.8,f2],[T.s0,f2]];
 tiles.forEach((p,i)=>{const a=T.s0+i*dt;path.push([a+dt*n.move,[p.x,p.z]],[a+dt,[p.x,p.z]])});
 path.push([T.judge+(T.out-T.judge)*.9,park]);
 let head=park;
 if(t>T.fid&&t<path[path.length-1][0])for(let i=0;i<path.length-1;i++){const [ta,a]=path[i],[tb,b]=path[i+1];if(t>=ta&&t<=tb){const f=ease(span(t,ta,tb));head=[lerp(a[0],b[0],f),lerp(a[1],b[1],f)];break}}
 const ring=(t>=T.fid+F*.3&&t<T.fid+F*.5)||(t>=T.fid+F*.8&&t<T.s0);
 // Tiles finished, and the shot being taken in the current one.
 let done=0,tile=-1,capture=false,shot=0,projector=0,phase=0;
 if(t>=T.s0){const u=(t-T.s0)/dt;done=Math.min(N,Math.floor(u+1e-9));if(done<N){tile=done;const f=u-done;if(f>=n.move){capture=true;shot=Math.min(n.shots-1,Math.floor((f-n.move)/(1-n.move)*n.shots));projector=shot<SHOTS?0:1;phase=shot%SHOTS}}}
 if(t>=n.D-1e-9)done=N;
 return {bx,stop,clamp,head,ring,done,tile,capture,shot,projector,phase,scan:clamp01((t-T.s0)/(T.s1-T.s0))};
}

// Board-level summary of the deposits measured by tile `done` (all of them by the end).
export function spiSummary(n,result,done=Infinity){
 const ds=(result?.deposits||[]).filter((d,j)=>n.tileOf[j]<done),c={pass:0,warn:0,fail:0};
 for(const d of ds)c[d.status]++;
 const mean=ds.length?ds.reduce((s,d)=>s+d.volume,0)/ds.length:0;
 const buckets=Array.from({length:12},(_,i)=>({lo:40+i*10,pass:0,warn:0,fail:0}));
 for(const d of ds){const i=Math.max(0,Math.min(11,Math.floor((d.volume-40)/10)));buckets[i][d.status]++}
 return {measured:ds.length,total:(result?.deposits||[]).length,...c,mean:r2(mean),buckets};
}

export function build(kit,{THREE,plan,result}){
 const {M,box,cyl,mat,COLORS:C}=kit,n=spiNumbers(plan,result),{W,H,D,fw,fh,hs,T}=n,group=new THREE.Group();
 const frame=mat(C.frame,.15,.7),dark=mat(C.dark,.3,.6),steel=mat(C.steel,.7,.35),copper=mat(C.copper,.35,.45);
 const N=n.tiles.length,deposits=result?.deposits||[];

 // Gantry reach: every FOV, both fiducials and the park position, plus half the head.
 const WD=26*hs,headHalf=26*hs,GX=Math.max(W/2,...n.tiles.map(p=>Math.abs(p.x)))+headHalf+10;
 const zMin=n.park[1]-14*hs,zMax=H/2+16*hs,zMid=(zMin+zMax)/2,zLen=zMax-zMin;
 const beamY=WD+44*hs,railY=beamY-9*hs,baseY=-30;
 box(2*GX+30,4,zLen+20,frame,0,baseY-2,zMid,group);
 kit.rails(n.x1-n.x0+W+10,group);
 for(const s of [-1,1]){box(8*hs,6*hs,zLen,steel,s*GX,railY,zMid,group);
  for(const z of [zMin+4,zMax-4])box(7*hs,railY-baseY,7*hs,frame,s*GX,(railY+baseY)/2,z,group)}
 // Stop pin and edge clamps on the rails.
 const stopper=cyl(1.2,1.2,6,steel,W/2+1.4,-5.5,0,group,12);stopper.name='spi-stopper';
 const clamps=[-1,1].map(s=>{const b=box(Math.min(W*.8,W-8),1.4,1,dark,0,-.7,s*(H/2+1.5),group);b.userData.s=s;return b});

 // Board with deposits sized by measured volume; its paste instances get recoloured per FOV.
 const bd=kit.makeBoard({stage:'paste',result});bd.group.name='spi-board';bd.paste.name='spi-paste';group.add(bd.group);

 // Beam (moves along z) and the head on its carriage (moves along x on the beam).
 const beam=new THREE.Group();beam.name='spi-beam';group.add(beam);
 box(2*GX+10*hs,10*hs,12*hs,dark,0,beamY,0,beam);
 for(const s of [-1,1])box(12*hs,8*hs,14*hs,steel,s*GX,railY+5*hs,0,beam);
 const head=new THREE.Group();head.name='spi-head';group.add(head);
 box(18*hs,10*hs,16*hs,steel,0,beamY,9*hs,head);
 box(2*headHalf,8*hs,20*hs,dark,0,WD+34*hs,0,head);box(2*headHalf+.2,2*hs,20.4*hs,copper,0,WD+36*hs,0,head);
 cyl(6*hs,6*hs,26*hs,dark,0,WD+15*hs,0,head,20);cyl(4.5*hs,4.2*hs,3*hs,steel,0,WD+1.5*hs,0,head,20);
 const ringMat=mat(0x2b2c2e,.1,.5,{emissive:0xfff3dc,emissiveIntensity:0});
 const ring=new THREE.Mesh(new THREE.TorusGeometry(M(6.5*hs),M(.9*hs),8,24),ringMat);ring.rotation.x=Math.PI/2;ring.position.y=M(WD+.6*hs);head.add(ring);
 // Projectors either side of the camera, tilted so both aim at the FOV centre on the board.
 const lensMats=[-1,1].map(s=>{const pg=new THREE.Group(),ang=Math.atan2(18*hs,WD+12*hs);pg.position.set(M(s*18*hs),M(WD+12*hs),0);pg.rotation.z=-s*ang;head.add(pg);
  box(9*hs,20*hs,10*hs,dark,0,10*hs-6*hs,0,pg);
  const lm=mat(0x2b2c2e,.1,.4,{emissive:0xdfe9ff,emissiveIntensity:0});cyl(3*hs,3*hs,1.6*hs,lm,0,-6.6*hs,0,pg,16);return lm});

 // Fringe: thin emissive stripes over the FOV, shifted a quarter period per shot.
 const bars=Math.max(4,Math.round(fw/PERIOD)),P=fw/bars,fringeMat=mat(0x000000,0,1,{emissive:0xdfe9ff,emissiveIntensity:1.1,transparent:true,opacity:.72,depthWrite:false});
 const fringe=new THREE.InstancedMesh(new THREE.BoxGeometry(M(P*.45),M(.02),M(fh)),fringeMat,bars);fringe.name='spi-fringe';fringe.renderOrder=2;group.add(fringe);
 const frameMat=mat(C.copper,.3,.5,{emissive:C.copper,emissiveIntensity:.25});
 const fov=new THREE.Group();fov.name='spi-fov';group.add(fov);
 for(const s of [-1,1]){box(fw,.02,.25,frameMat,0,.6,s*fh/2,fov);box(.25,.02,fh,frameMat,s*fw/2,.6,0,fov)}
 const m4=new THREE.Matrix4();

 const fails=deposits.filter(d=>d.status==='fail').length,warns=deposits.filter(d=>d.status==='warn').length;
 const rowsPer=Math.ceil(n.ny/8),steps=[{t:0,label:'Convey in, stop pin, edge clamp'},{t:r2(T.fid),label:'Read 2 fiducials (ring light)'}];
 for(let r=0;r<n.ny;r+=rowsPer){const last=Math.min(n.ny,r+rowsPer);steps.push({t:r2(T.s0+r*n.nx*n.dt),label:`${last-r>1?`Rows ${r+1}–${last}`:`Row ${r+1}`}/${n.ny}: ${(last-r)*n.nx} FOV, 2 projectors × ${SHOTS} phases`})}
 steps.push({t:r2(T.judge),label:fails?`NG: ${fails} fail, ${warns} warn`:warns?`OK: ${warns} warn`:'OK: all deposits in spec'},{t:r2(T.out),label:'Unclamp, convey to pick-and-place'});

 const ext=Math.max(2*GX+30,zLen+20,beamY-baseY),dir=new THREE.Vector3(.32,.62,.8).normalize(),dist=M(ext)/2/Math.sin(17*Math.PI/180)*.8;
 const view={target:[0,M(8*hs),M(zMid*.3)],position:[dir.x*dist,M(8*hs)+dir.y*dist,M(zMid*.3)+dir.z*dist]};
 group.userData={numbers:n};

 const statusHex=d=>d.status==='fail'?C.fail:d.status==='warn'?C.warn:C.pass;
 let shown=-1;// memo of the colours applied; the colours depend only on t
 const update=t=>{
  const s=spiState(n,Math.max(0,Math.min(D,t)));
  bd.group.position.x=M(s.bx);
  stopper.position.y=M(-5.5+4.5*s.stop);
  for(const c of clamps)c.position.z=M(c.userData.s*(H/2+.5+(1-s.clamp)*1.5));
  beam.position.z=M(s.head[1]);head.position.set(M(s.head[0]),0,M(s.head[1]));
  ringMat.emissiveIntensity=s.ring?1.3:0;
  lensMats.forEach((m,i)=>{m.emissiveIntensity=s.capture&&s.projector===i?1.6:0});
  fringe.visible=s.capture;fov.visible=s.tile>=0;
  {const p=n.tiles[Math.max(0,s.tile)];fov.position.set(M(p.x),0,M(p.z))}
  {const p=n.tiles[Math.max(0,s.tile)],off=(s.projector?-1:1)*s.phase/SHOTS*P;
   for(let j=0;j<bars;j++){const u=(((j*P+off+P/2)%fw)+fw)%fw-fw/2;fringe.setMatrixAt(j,m4.makeTranslation(M(p.x+u),M(.5),M(p.z)))}
   fringe.instanceMatrix.needsUpdate=true}
  if(s.done!==shown){shown=s.done;deposits.forEach((d,j)=>bd.setDepositColor(j,n.tileOf[j]<s.done?statusHex(d):C.paste))}
 };
 update(0);
 return {group,duration:D,steps,update,view};
}
