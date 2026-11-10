// Stencil printer, inside: the board comes in on the rails and is edge-clamped on support pins, an
// up/down-looking camera between stencil and board reads both fiducials, the table corrects X Y θ and
// lifts the board against the foil, the squeegee drives a rolling paste bead across the apertures,
// then the table drops slowly (snap-off) and the printed board leaves. Every 5th board the foil
// underside is wiped. Pure in t: poses come from timeline()/pose(), shared with the panel.
import {span,ease,lerp,clamp01} from './common.js';
import {noise} from '../factoryLine.js';

export const GAP=20,SLOW=3,UP=16,BLADE=30,BEAD=4,CLAMP_OPEN=2,TABLE_DROP=8; // mm
const r2=n=>Math.round(n*100)/100;

// Where the board stopped against the stop pin, as the fiducials see it (mm, degrees).
export const alignment=k=>({dx:r2((noise(`print|${k}|x`)-.5)*.24),dy:r2((noise(`print|${k}|y`)-.5)*.24),rot:r2((noise(`print|${k}|r`)-.5)*.3)});

// Phase times for board k. The parts add up to plan.times.printer: 8 s of handling and vision, the
// squeegee stroke over the board plus 15 mm each side, the separation, 2 s to lower and unload; what is
// left (fiducial image processing, ~2 ms per aperture) goes to the second fiducial.
export function timeline(plan,k=0){
 const b=plan.board,pr=plan.printer,D=plan.times.printer,sq=pr.squeegee,E=b.height/2+15,stroke=2*E/sq.speed;
 const p=Math.max(0,D-8-stroke-pr.separation-2),dir=k%2?-1:1;
 const T={in:0,clamp:1.5,cam:2.1,fid1:2.7,go2:3.3,fid2:4.1,camOut:4.7+p,align:5.7+p,lift:6.1+p,down:7.3+p,stroke:8+p};
 T.sep=T.stroke+stroke;T.lower=T.sep+pr.separation;T.unclamp=T.lower+.5;T.out=T.unclamp+.2;T.wipe=T.out+.1;
 const W=b.width,H=b.height,halfX=W/2+25,halfZ=E+14;
 return {D,T,E,dir,stroke,sep:pr.separation,wipe:k%5===4,W,H,halfX,halfZ,x0:-(W+31),x1:W+31,park:-(halfX+22),fid:[[-W/2+4,-H/2+4],[W/2-4,H/2-4]],al:alignment(k),speed:sq.speed};
}

// Machine state at time t, in mm on the board axes (z = board y).
export function pose(tl,t){
 const {T,D,E,dir}=tl;
 const bx=t<T.out?lerp(tl.x0,0,ease(span(t,T.in,T.clamp))):lerp(0,tl.x1,ease(span(t,T.out,D)));
 const rise=1-Math.pow(1-span(t,T.lift,T.down),3);
 const lift=t<T.sep?GAP*rise:t<T.lower?GAP-SLOW*span(t,T.sep,T.lower):(GAP-SLOW)*(1-ease(span(t,T.lower,T.unclamp)));
 const table=t<T.unclamp?-TABLE_DROP*(1-ease(span(t,T.clamp,T.cam))):-TABLE_DROP*ease(span(t,T.unclamp,T.out));
 const open=t<T.unclamp?1-ease(span(t,T.clamp+.2,T.cam)):ease(span(t,T.unclamp,T.out));
 const align=1-ease(span(t,T.align,T.lift));
 const [f1,f2]=tl.fid,P=[tl.park,0],path=[[T.cam,P],[T.fid1,f1],[T.go2,f1],[T.fid2,f2],[T.camOut,f2],[T.align,P]];
 let cam=P;for(let i=0;i<path.length-1;i++){const [ta,a]=path[i],[tb,b]=path[i+1];if(t>=ta&&t<=tb){const f=ease(span(t,ta,tb));cam=[lerp(a[0],b[0],f),lerp(a[1],b[1],f)];break}}
 const light=(t>=T.fid1&&t<T.go2)||(t>=T.fid2&&t<T.camOut)?1:0;
 const z0=-dir*E,blade=lerp(z0,dir*E,span(t,T.stroke,T.sep));
 const down=t<T.sep?ease(span(t,T.down,T.stroke)):1-ease(span(t,T.sep,T.sep+.4));
 const w=span(t,T.wipe,D-.05),wipeZ=tl.wipe&&w>0&&w<1?lerp(-(tl.halfZ-6),tl.halfZ-6,w<.6?ease(w/.6):1-ease((w-.6)/.4)):-(tl.halfZ-6);
 return {bx,lift,table,open,align,cam,light,blade,down,printed:t>=T.sep,wipeZ,dir,z0};
}

export function build(kit,ctx){
 const {THREE,plan,result,k}=ctx,{M,mat,box,cyl,COLORS}=kit,pr=plan.printer,tl=timeline(plan,k),{W,H,E,halfX,halfZ,T}=tl;
 const tf=pr.stencil,angle=pr.squeegee.angle*Math.PI/180,bladeLen=W+20,a=BLADE*Math.cos(angle)+4,g=new THREE.Group();
 const frameM=mat(COLORS.frame,.15,.7),dark=mat(COLORS.dark,.3,.6),steel=mat(COLORS.steel,.7,.35),foilM=mat(0xb9bdc1,.85,.32),bladeM=mat(0xd4d7da,.9,.22),pasteM=mat(COLORS.paste,.15,.85);
 // Bed, conveyor rails with their stands, stencil frame on four posts.
 box(2*(halfX+44),6,2*(halfZ+44),frameM,0,-40,0,g);
 const railLen=2*tl.x1+W+10;kit.rails(railLen,g);
 for(const sx of [-1,1])for(const sz of [-1,1])box(4,30,4,frameM,sx*(railLen/2-4),-22,sz*(H/2+2),g);
 for(const sx of [-1,1])for(const sz of [-1,1])box(10,GAP+37,10,frameM,sx*(halfX+7),(GAP-37)/2,sz*(halfZ+12),g);
 for(const s of [-1,1]){box(2*halfX+28,12,14,frameM,0,GAP+6,s*(halfZ+7),g);box(14,12,2*halfZ,frameM,s*(halfX+7),GAP+6,0,g)}
 // The foil, its apertures (dark openings), paste that fills them as the blade passes, and the
 // half-etched fiducials on the underside that the camera looks up at.
 box(2*halfX,tf,2*halfZ,foilM,0,GAP+tf/2,0,g);
 const n=pr.apertures.length,unit=new THREE.BoxGeometry(1,1,1),m4=new THREE.Matrix4(),q=new THREE.Quaternion(),v=new THREE.Vector3(),sc=new THREE.Vector3(),zero=new THREE.Matrix4().makeScale(0,0,0);
 const holes=new THREE.InstancedMesh(unit,mat(0x141517,.2,.9),Math.max(1,n)),fill=new THREE.InstancedMesh(unit,pasteM,Math.max(1,n));holes.count=fill.count=n;
 const order=pr.apertures.map((_,i)=>i).sort((i,j)=>tl.dir*(pr.apertures[i].y-pr.apertures[j].y)),fillM=[];
 pr.apertures.forEach((ap,i)=>{holes.setMatrixAt(i,m4.compose(v.set(M(ap.x),M(GAP+tf+.004),M(ap.y)),q,sc.set(M(ap.w),M(.006),M(ap.h))));
  fillM[i]=new THREE.Matrix4().compose(v.set(M(ap.x),M(GAP+tf/2+.006),M(ap.y)),q,sc.set(M(ap.w*.97),M(tf+.012),M(ap.h*.97)));fill.setMatrixAt(i,zero)});
 holes.instanceMatrix.needsUpdate=fill.instanceMatrix.needsUpdate=true;g.add(holes,fill);
 for(const [x,y] of tl.fid)cyl(1,1,.04,dark,x,GAP-.02,y,g,20);
 // Board on a carrier (alignment offset, conveyor travel), over a lifting table with support pins and edge clamps.
 const board=kit.makeBoard({stage:'paste',result}),carrier=new THREE.Group();carrier.add(board.group);g.add(carrier);
 const liftG=new THREE.Group(),tableG=new THREE.Group();g.add(liftG);liftG.add(tableG);
 box(W-6,4,H-8,dark,0,-11.6,0,tableG);cyl(6,6,30,steel,0,-28.6,0,tableG);
 for(const px of [-W/3,0,W/3])for(const pz of [-H/3,0,H/3])cyl(1.2,1.2,8,steel,px,-5.6,pz,tableG,10);
 const clamps=[-1,1].map(s=>box(W*.8,1.4,2,steel,0,-.8,s*(H/2+1),liftG));
 // Vision: camera on a beam that travels in x on two rails; ring lights above and below.
 for(const s of [-1,1])box(2*halfX+60,4,4,steel,-10,8,s*(halfZ+1),g);
 const camG=new THREE.Group();g.add(camG);
 box(8,6,2*halfZ+6,dark,-13,8,0,camG);box(16,9,16,dark,0,GAP/2,0,camG);box(13,3,6,dark,-6.5,8,0,camG);
 const ringM=mat(0xfff3dc,0,.4,{emissive:0xfff3dc,emissiveIntensity:.15});cyl(5,5,.6,ringM,0,GAP/2+4.8,0,camG,20);cyl(5,5,.6,ringM,0,GAP/2-4.8,0,camG,20);
 // Print head on two rails in z: a "/\" pair of metal blades, one per stroke direction.
 const yUp=GAP+tf+UP,headY=yUp+BLADE*Math.sin(angle)+4,railZ=E+a+24;
 for(const s of [-1,1]){box(10,8,2*railZ,steel,s*(bladeLen/2+12),headY,0,g);for(const z of [-1,1])box(8,headY+37,8,frameM,s*(bladeLen/2+12),(headY-37)/2,z*railZ,g)}
 const head=new THREE.Group();g.add(head);
 box(bladeLen+34,8,2*a+14,dark,0,headY+2,0,head);box(bladeLen+34.2,3,.6,mat(COLORS.copper,.35,.45),0,headY+3,a+7.1,head);
 const blades=[1,-1].map(d=>{const bg=new THREE.Group();box(bladeLen,BLADE,.5,bladeM,0,BLADE/2,0,bg);box(bladeLen+4,8,3,dark,0,BLADE-2,-d*.9,bg);bg.rotation.x=-d*(Math.PI/2-angle);g.add(bg);
  // Pneumatic rods from the head bar down to the blade holder (scaled to the stroke each frame).
  const rods=[-1,1].map(sx=>box(5,1,5,steel,sx*bladeLen/3,0,0,g));return {d,g:bg,rods}});
 const bead=new THREE.Mesh(new THREE.CylinderGeometry(M(BEAD),M(BEAD),M(bladeLen*.86),9),pasteM);bead.rotation.z=Math.PI/2;bead.castShadow=true;
 const beadG=new THREE.Group();beadG.add(bead);g.add(beadG);
 // Under-stencil wiper: paper roll on a carriage.
 const wipeG=new THREE.Group();g.add(wipeG);
 const roll=new THREE.Mesh(new THREE.CylinderGeometry(M(4),M(4),M(2*halfX*.8),20),mat(0xeeece6,.02,.9));roll.rotation.z=Math.PI/2;roll.position.y=M(GAP-4.2);roll.castShadow=true;wipeG.add(roll);

 let shown=null,filled=-1;
 const steps=[{t:T.in,label:'Board in on conveyor'},{t:T.clamp,label:'Edge clamp, support pins up'},{t:T.cam,label:'Camera to fiducial 1'},{t:T.go2,label:'Fiducial 2, compute offset'},
  {t:T.align,label:'Align table X Y θ'},{t:T.lift,label:`Lift board to stencil (${GAP} mm)`},{t:T.down,label:`Squeegee down, ${pr.squeegee.pressure} kg`},
  {t:T.stroke,label:`Print stroke ${tl.dir>0?'rear → front':'front → rear'}, ${pr.squeegee.speed} mm/s`},{t:T.sep,label:`Snap-off ${r2(SLOW/tl.sep)} mm/s`},
  {t:T.lower,label:'Lower table, unclamp'},{t:T.out,label:'Board out to SPI'}];
 if(tl.wipe)steps.push({t:T.wipe,label:'Under-stencil wipe'});

 const update=t=>{
  t=Math.max(0,Math.min(tl.D,t));const s=pose(tl,t),al=tl.al;
  carrier.position.set(M(s.bx+al.dx*s.align),M(s.lift),M(al.dy*s.align));carrier.rotation.y=al.rot*s.align*Math.PI/180;
  liftG.position.y=M(s.lift);tableG.position.y=M(s.table);clamps.forEach((c,i)=>{c.position.z=(i?1:-1)*M(H/2+1+CLAMP_OPEN*s.open)});
  camG.position.set(M(s.cam[0]),0,M(s.cam[1]));ringM.emissiveIntensity=.15+1.4*s.light;
  // Active blade's tip at s.blade; the head carries both blades a apart.
  const zh=s.blade-s.dir*a;head.position.z=M(zh);
  for(const b of blades){const active=b.d===s.dir,y=active?lerp(yUp,GAP+tf,s.down):yUp,zb=zh+b.d*a;b.g.position.set(0,M(y),M(zb));
   const top=y+BLADE*Math.sin(angle),len=Math.max(.1,headY-2-top),zt=zb-b.d*BLADE*Math.cos(angle);for(const r of b.rods){r.scale.y=len;r.position.y=M(top+len/2);r.position.z=M(zt)}}
  beadG.position.set(0,M(GAP+tf+BEAD),M(s.blade+s.dir*(BEAD+.4)));beadG.rotation.x=(s.blade-s.z0)/BEAD;
  wipeG.position.z=M(s.wipeZ);
  // Paste in the apertures the blade has passed; on the board once it separates.
  const passed=s.printed?0:order.reduce((c,i)=>c+(tl.dir*(pr.apertures[i].y-s.blade)<=0?1:0),0);
  if(passed!==filled){for(let j=0;j<n;j++)fill.setMatrixAt(order[j],j<passed?fillM[order[j]]:zero);fill.instanceMatrix.needsUpdate=true;filled=passed}
  if(s.printed!==shown){board.showDeposits(()=>s.printed);shown=s.printed}
  return {target:[M(s.bx)*.5,M(GAP*.35),0]};
 };
 const r=M(Math.hypot(halfX,halfZ)),dist=r/Math.sin(17*Math.PI/180)*.72,dv=new THREE.Vector3(.3,.75,.95).normalize();
 const view={target:[0,M(GAP*.35),0],position:[dv.x*dist,M(GAP*.35)+dv.y*dist,dv.z*dist]};
 update(0);
 return {group:g,duration:tl.D,steps,update,view,board,fill,timeline:tl};
}
