// Convection reflow oven. The placed board rides the edge (pin-chain) conveyor through
// plan.reflow.zones (400 mm each): preheat, soak, reflow, then cooling. Every zone has a top and a
// bottom plenum: a blower wheel drives air across the heater elements and down/up through a
// perforated nozzle plate onto the board. The scene is a half-section (front of the top plenums and
// hood cut away) at the oven's own scale, with the board at true size. Board position and
// temperature come from the planned profile (plan.reflow.points); once the board passes liquidus
// (217 °C, SAC305) the paste turns to solder. Poses are pure in t.
import {clamp01} from './common.js';
import {LIQUIDUS} from '../factoryLine.js';

export const PASS=900;       // mm, conveyor height above the floor (SMT line standard)
export const OVEN_UNITS=30;  // scene units for the heated length
const r2=n=>Math.round(n*100)/100;

// Shared by the 3D view and the panel: profile lookups and the phase times.
export function reflowNumbers(plan){
 const R=plan.reflow,Z=R.zoneMm,NZ=R.zones.length,L=NZ*Z,W=plan.board.width,D=R.dwell;
 const pts=[{t:0,x:0,T:25},...R.points.filter(p=>p.t>0)];
 const seg=t=>{let lo=1,hi=pts.length-1;while(lo<hi){const m=(lo+hi)>>1;if(pts[m].t<t)lo=m+1;else hi=m}return lo};
 const at=(t,key)=>{if(t<=0)return pts[0][key];const last=pts[pts.length-1];if(t>=last.t)return key==='x'?last.x+R.speed*(t-last.t):last.T;
  const i=seg(t),a=pts[i-1],b=pts[i],f=(t-a.t)/((b.t-a.t)||1);return a[key]+(b[key]-a[key])*f};
 const xAt=t=>at(t,'x'),TAt=t=>at(t,'T');
 const timeAtX=x=>{for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];if(b.x>=x)return a.t+(b.t-a.t)*(x-a.x)/((b.x-a.x)||1)}return D};
 // First time T crosses `th` going up (or down) at or after point `from`, interpolated between samples.
 const cross=(th,from=1,up=true)=>{for(let i=Math.max(1,from);i<pts.length;i++){const a=pts[i-1],b=pts[i];if(up?a.T<th&&b.T>=th:a.T>=th&&b.T<th)return a.t+(b.t-a.t)*(th-a.T)/(b.T-a.T)}return null};
 let ip=0;pts.forEach((p,i)=>{if(p.T>pts[ip].T)ip=i});
 const tLiq=cross(LIQUIDUS);
 const times={t150:cross(150),tLiq,tPeak:pts[ip].t,tCool:tLiq!=null?cross(LIQUIDUS,ip+1,false):null,tExit:timeAtX(L-W/2)};
 const zoneAt=t=>Math.max(0,Math.min(NZ-1,Math.floor(xAt(t)/Z)));
 // Zone i spans [i·Z, (i+1)·Z] mm; the conveyor runs at constant speed.
 const zoneTimes=R.zones.map((z,i)=>({...z,t0:r2(i*Z/R.speed),t1:r2(Math.min(D,(i+1)*Z/R.speed))}));
 return {R,Z,NZ,L,W,D,pts,xAt,TAt,timeAtX,zoneAt,zoneTimes,times,rate:D/30};
}

// Heater glow from a zone setpoint: cooling zones (no heaters) stay grey-blue, hot zones go orange-red.
export function zoneHeat(z){const f=/cool/i.test(z.name)?0:clamp01((z.set-90)/170);return {f,intensity:r2(.12+1.55*f*f)}}

export function build(kit,{THREE,plan,result}){
 const n=reflowNumbers(plan),{Z,NZ,L,D,R}=n,H=plan.board.height,{mat,COLORS:C}=kit,s=OVEN_UNITS/L;
 const group=new THREE.Group(),oven=new THREE.Group();oven.scale.setScalar(s);oven.position.x=-L/2*s;group.add(oven);
 const TW=Math.max(460,H+160),half=TW/2,Z0=half+70,Xa=-340,Xb=L+340,Xc0=-760,XcL=L+1520,top=PASS+460;
 const frame=mat(C.frame,.15,.7),dark=mat(C.dark,.3,.6),steel=mat(C.steel,.7,.35),inner=mat(0x8d9195,.6,.45),copper=mat(C.copper,.35,.45),belt=mat(C.belt,.4,.5);
 const geos=new Map(),G=(w,h,d)=>{const k=w+'|'+h+'|'+d;if(!geos.has(k))geos.set(k,new THREE.BoxGeometry(w,h,d));return geos.get(k)};
 const box=(w,h,d,m,x,y,z,parent=oven,shadow=true)=>{const o=new THREE.Mesh(G(w,h,d),m);o.position.set(x,y,z);o.castShadow=shadow;o.receiveShadow=true;parent.add(o);return o};
 const cyls=new Map(),CY=(r,h,seg=20)=>{const k=r+'|'+h+'|'+seg;if(!cyls.has(k))cyls.set(k,new THREE.CylinderGeometry(r,r,h,seg));return cyls.get(k)};
 const cyl=(r,h,m,x,y,z,parent=oven,seg=20)=>{const o=new THREE.Mesh(CY(r,h,seg),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o};

 // Frame, feet and the lower cabinet (blower motors, cooling plumbing) under the pass line.
 for(const x of [Xa+50,L*.33,L*.66,Xb-50])for(const z of [-1,1])box(70,160,70,dark,x,80,z*(Z0-45));
 box(Xb-Xa,60,2*Z0,dark,(Xa+Xb)/2,190,0);
 box(Xb-Xa,PASS-300-220,2*Z0,frame,(Xa+Xb)/2,(PASS-300+220)/2,0);
 for(let x=Xa+(Xb-Xa)/5;x<Xb-10;x+=(Xb-Xa)/5)box(5,PASS-300-240,2,dark,x,(PASS-300+220)/2,Z0+1,oven,false);
 // Housing back skin, end walls with the tunnel slot, and the hood over the top plenums (cut at z = 0).
 box(Xb-Xa,top-220,14,frame,(Xa+Xb)/2,(top+220)/2,-Z0+7);
 for(const [a,b] of [[Xa,0],[L,Xb]]){box(b-a,PASS-40-(PASS-300),2*Z0,frame,(a+b)/2,PASS-170,0);box(b-a,top-(PASS+40),Z0,frame,(a+b)/2,(top+PASS+40)/2,-Z0/2)}
 box(L,top-(PASS+340),Z0,frame,L/2,(top+PASS+340)/2,-Z0/2);
 for(const y of [PASS+340,top])box(Xb-Xa,5,5,copper,(Xa+Xb)/2,y,1,oven,false);// section edges
 box(L,PASS-40-(PASS-300),14,inner,L/2,PASS-170,-half-7);box(L,300,14,inner,L/2,PASS+190,-half-7);

 // Zones: plenums, nozzle plates, heaters (or heat exchangers in the cooling zones), blower wheels.
 const wheel=r=>{const parts=[new THREE.CylinderGeometry(r,r,5,32).translate(0,-22,0),new THREE.CylinderGeometry(r*.22,r*.22,50,16)];
  for(let i=0;i<10;i++){const b=new THREE.BoxGeometry(r*.5,40,5);b.rotateY(.35);b.translate(r*.7,0,0);b.rotateY(i/10*Math.PI*2);parts.push(b)}
  const pos=[],nor=[];for(const g of parts){const q=g.toNonIndexed();pos.push(...q.attributes.position.array);nor.push(...q.attributes.normal.array);q.dispose();g.dispose()}
  const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));out.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));return out};
 const rT=Math.min(Z/2-60,half/2-25),rB=Math.min(Z/2-60,half-70),wT=wheel(rT),wB=wheel(rB),wheels=[];
 const cold=new THREE.Color(0x7f93a1),hot=new THREE.Color(0xff4a1c),zoneMats=[];
 const holeCols=7,holeRows=[6,3],holes=new THREE.InstancedMesh(new THREE.CylinderGeometry(7,7,1,10),mat(0x1a1b1c,.2,.8),NZ*holeCols*(holeRows[0]+holeRows[1]));holes.castShadow=false;
 const m4=new THREE.Matrix4();let hi=0;
 R.zones.forEach((z,i)=>{
  const x0=i*Z,mid=x0+Z/2,{f,intensity}=zoneHeat(z),col=cold.clone().lerp(hot,f),cooling=/cool/i.test(z.name);
  const glow=mat(0x3a3b3d,.3,.5,{emissive:col,emissiveIntensity:intensity}),plate=mat(C.steel,.6,.4,{emissive:col,emissiveIntensity:intensity*.18});zoneMats.push(glow);
  // Bottom plenum (full width, open front) and top plenum (rear half).
  box(8,260,TW,inner,x0,PASS-170,0);box(8,300,half,inner,x0,PASS+190,-half/2);
  box(Z-8,6,TW,plate,mid,PASS-43,0);box(Z-8,6,half,plate,mid,PASS+43,-half/2);box(Z-8,10,half,inner,mid,PASS+335,-half/2);
  for(let a=0;a<holeCols;a++){const hx=x0+(a+.5)*Z/holeCols;
   for(let b=0;b<holeRows[0];b++)holes.setMatrixAt(hi++,m4.makeTranslation(hx,PASS-39.6,-half+(b+.5)*TW/holeRows[0]));
   for(let b=0;b<holeRows[1];b++)holes.setMatrixAt(hi++,m4.makeTranslation(hx,PASS+39.6,-half+(b+.5)*half/holeRows[1]))}
  if(cooling){box(Z-90,60,TW-60,glow,mid,PASS-120,0);box(Z-90,60,half-40,glow,mid,PASS+120,-half/2-10);
   for(let k=-3;k<=3;k++){box(3,64,TW-60,steel,mid+k*(Z-90)/7,PASS-120,0,oven,false);box(3,64,half-40,steel,mid+k*(Z-90)/7,PASS+120,-half/2-10,oven,false)}}
  else for(const dx of [-110,0,110]){const b=cyl(9,TW-60,glow,mid+dx,PASS-115,0,oven,10);b.rotation.x=Math.PI/2;const t=cyl(9,half-40,glow,mid+dx,PASS+115,-half/2-10,oven,10);t.rotation.x=Math.PI/2}
  // Blower wheels with their shafts; top motors stand on the hood.
  for(const [g,y,zc,dir] of [[wT,PASS+250,-half/2,1],[wB,PASS-245,0,-1]]){const w=new THREE.Mesh(g,steel);w.position.set(mid,y,zc);w.castShadow=true;w.userData.dir=dir;w.name='reflow-fan';oven.add(w);wheels.push(w)}
  cyl(9,top-(PASS+250),steel,mid,(top+PASS+250)/2,-half/2,oven,10);cyl(9,PASS-245-(PASS-300),steel,mid,(PASS-245+PASS-300)/2,0,oven,10);
  cyl(58,140,dark,mid,top+70,-half/2,oven,24);cyl(40,10,steel,mid,top+145,-half/2,oven,24);
 });
 box(8,260,TW,inner,L,PASS-170,0);box(8,300,half,inner,L,PASS+190,-half/2);
 holes.instanceMatrix.needsUpdate=true;oven.add(holes);
 // Exhaust stacks over the entry and exit, and the signal tower (green: running).
 for(const x of [Xa+170,Xb-170]){cyl(60,240,steel,x,top+120,-Z0/2,oven,24);cyl(70,14,dark,x,top+247,-Z0/2,oven,24)}
 cyl(10,220,dark,Xb-70,top+110,-Z0+60,oven,10);
 [[C.fail,0],[C.warn,0],[C.pass,1.3]].forEach(([c,on],j)=>cyl(26,50,mat(c,.1,.5,{emissive:c,emissiveIntensity:on}),Xb-70,top+245+j*52,-Z0+60,oven,16));

 // Edge conveyor: two rails at the board edges, each carrying a pin chain that moves with the board.
 // Rails sit just outside the board edges; the chain runs under the edge (3 mm bearing).
 const zr=H/2+8,zc=H/2+1,BT=1.6,P=25,NL=Math.floor(XcL/P);
 for(const k of [-1,1]){box(XcL,26,10,steel,Xc0+XcL/2,PASS-BT-17,k*zr);box(XcL,4,2,dark,Xc0+XcL/2,PASS-BT-10,k*(zr+6),oven,false)}
 for(const x of [Xc0+80,Xc0+XcL-80]){const rod=cyl(8,2*zr+60,steel,x,PASS-BT-40,0,oven,10);rod.rotation.x=Math.PI/2;for(const k of [-1,1])box(30,30,30,dark,x,PASS-BT-45,k*(zr+20));
  box(160,PASS-BT-70,2*zr+40,frame,x,(PASS-BT-70)/2,0)}
 const chain=new THREE.InstancedMesh(new THREE.BoxGeometry(14,3,8),belt,2*NL);chain.name='reflow-chain';chain.castShadow=false;oven.add(chain);

 // The board at true size on the chain: board top at the pass line.
 const carrier=new THREE.Group();carrier.name='reflow-board';carrier.scale.setScalar(1/kit.S);carrier.position.set(0,PASS,0);oven.add(carrier);
 const bd=kit.makeBoard({stage:'placed',result});bd.paste.name='reflow-paste';carrier.add(bd.group);

 const T=n.times,steps=[{t:0,label:'Preheat: ramp to 150 °C'}];
 if(T.t150!=null)steps.push({t:r2(T.t150),label:'Soak 150–200 °C: flux activates'});
 if(T.tLiq!=null)steps.push({t:r2(T.tLiq),label:`Above ${LIQUIDUS} °C: solder melts`},{t:r2(T.tPeak),label:`Peak ${R.peak.toFixed(1)} °C`});
 if(T.tCool!=null)steps.push({t:r2(T.tCool),label:'Cooling: joints solidify'});
 steps.push({t:r2(T.tExit),label:'Exit to AOI'});
 const ordered=steps.reduce((a,x)=>(!a.length||x.t>a[a.length-1].t&&x.t<D?[...a,x]:a),[]);

 const OMEGA=Math.PI*2*.35,exitX=oven.position.x+L*s,boardY=PASS*s;
 const dist=Math.max(4.5,Math.min(9,Math.max(n.W,H)*s*8)),dir=new THREE.Vector3(.3,.42,.86).normalize(),x0=oven.position.x;
 const view={target:[x0,boardY,0],position:[x0+dir.x*dist,boardY+dir.y*dist,dir.z*dist]};
 group.userData={numbers:n,exitX,scale:s};

 let shown=null;// stage applied; it depends only on t
 const update=t=>{t=Math.max(0,Math.min(D,t));const x=n.xAt(t);carrier.position.x=x;
  const st=T.tLiq!=null&&t>=T.tLiq?'soldered':'placed';if(st!==shown){shown=st;bd.setStage(st)}
  for(const w of wheels)w.rotation.y=w.userData.dir*OMEGA*t;
  const off=R.speed*t;for(let k=0;k<2;k++)for(let i=0;i<NL;i++){const cx=Xc0+(((i*P+off)%XcL)+XcL)%XcL;chain.setMatrixAt(k*NL+i,m4.makeTranslation(cx,PASS-BT-1.5,(k?1:-1)*zc))}
  chain.instanceMatrix.needsUpdate=true;
  return {target:[x0+x*s,boardY,0]}};
 update(0);
 return {group,duration:D,steps:ordered,update,rate:n.rate,view};
}
