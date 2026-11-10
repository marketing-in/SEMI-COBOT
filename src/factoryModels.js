// Line-view models for the production line (scene units ≈ metres): machine housings built like the
// real equipment — base cabinet with doors, hood with a glass front, conveyor openings, operator
// screen, e-stop and signal tower — plus each machine's own visible internals that move while a
// board is inside, the link conveyors between machines and the OK / NG unloader at the end.
// Line layout (machine widths along the conveyor, gaps, depth, pass height) and the footprint of the
// stand-alone machines.
export const LINE_LAYOUT={width:{loader:1.6,printer:2.2,spi:1.6,pnp:2.6,reflow:6.4,aoi:1.6,xray:2.0},gap:.9,depth:1.9,cy:.92};
export const MACHINE_SIZE={wave:{w:4.2,d:1.5},selective:{w:1.6,d:1.5},ict:{w:1.3,d:1.1},probe:{w:1.5,d:1.4}};
export function createLineModels(THREE){
 const owned=[];const keep=x=>{owned.push(x);return x};
 const mat=(color,metalness=.15,roughness=.6,extra={})=>keep(new THREE.MeshStandardMaterial({color,metalness,roughness,...extra}));
 const C={frame:mat(0xe2dfd7,.1,.62),panel:mat(0xd3cfc5,.1,.65),dark:mat(0x2b2d30,.3,.6),kick:mat(0x3a3c3f,.2,.7),steel:mat(0xb4b8bc,.75,.3),alu:mat(0xc9cdd0,.8,.28),copper:mat(0xd9824a,.35,.45),
  glass:mat(0xa9bcc6,.1,.05,{transparent:true,opacity:.22,depthWrite:false}),belt:mat(0x1c1d1f,.05,.9),screenBack:mat(0x1d1f22,.3,.5),yellow:mat(0xe3b82e,.1,.5),red:mat(0xc8312a,.15,.45),
  lead:mat(0x7d8185,.35,.55),mask:mat(0x1f6b45,.1,.55),reelA:mat(0xe9e8e3,.05,.5),reelB:mat(0x2c4f8a,.1,.5),hot:mat(0x301205,0,1,{emissive:0xff6a2a,emissiveIntensity:.9})};
 const add=(m,x,y,z,parent)=>{m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m};
 const box=(w,h,d,material,x,y,z,parent)=>add(new THREE.Mesh(keep(new THREE.BoxGeometry(w,h,d)),material),x,y,z,parent);
 const cyl=(r,h,material,x,y,z,parent,axis='y',seg=20)=>{const g=keep(new THREE.CylinderGeometry(r,r,h,seg));if(axis==='x')g.rotateZ(Math.PI/2);if(axis==='z')g.rotateX(Math.PI/2);return add(new THREE.Mesh(g,material),x,y,z,parent)};
 const canvasTex=(w,h,draw)=>{if(typeof document==='undefined')return null;const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=keep(new THREE.CanvasTexture(c));t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return {t,c}};

 // Smoke: soft puffs that rise, drift with the draught, spread and fade over their life. Each puff's
 // state comes from the time alone (a wall clock, so it keeps drifting while the line is paused). strength 0..1 thins it out.
 let puff=null;
 function smoke(parent,x,y,z,{count=26,life=4,rise=1.6,drift=.35,start=.08,grow=.55,opacity=.42,tint=0xe9e8e4}={}){
  if(!puff)puff=canvasTex(128,128,(g,W,H)=>{const r=g.createRadialGradient(W/2,H/2,2,W/2,H/2,W/2);r.addColorStop(0,'rgba(255,255,255,.95)');r.addColorStop(.45,'rgba(255,255,255,.45)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,W,H)});
  const sprites=[];if(!puff)return {update(){}};
  for(let i=0;i<count;i++){const m=keep(new THREE.SpriteMaterial({map:puff.t,color:tint,transparent:true,depthWrite:false,opacity:0}));const sp=new THREE.Sprite(m);sp.renderOrder=5;parent.add(sp);sprites.push({sp,phase:i/count,seed:(i*7919%97)/97})}
  return {update:(t,strength=1)=>{for(const {sp,phase,seed} of sprites){const a=((t/life+phase)%1+1)%1,e=1-(1-a)*(1-a);
   sp.position.set(x+drift*e+Math.sin((t+seed*9)*1.3)*.04*a,y+rise*e,z+(seed-.5)*.12*a);const sc=start+grow*a;sp.scale.set(sc,sc,1);
   sp.material.opacity=strength*opacity*Math.min(1,a*6)*(1-a)}}};
 }
 // Signal tower: base, pole, green / amber / red segments and a white cap.
 function tower(parent,x,y,z){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);cyl(.035,.04,C.dark,0,.02,0,g);cyl(.012,.22,C.steel,0,.15,0,g);
  const lamps=[0x3fa66b,0xd8a531,0xd2453b].map((c,i)=>cyl(.042,.07,mat(0x55575a,.1,.4,{emissive:c,emissiveIntensity:0,transparent:true,opacity:.95}),0,.3+i*.075,0,g));cyl(.044,.02,mat(0xf2f1ec,.1,.4),0,.53,0,g);return lamps}
 // Operator screen on an arm: a canvas the line view redraws with the machine's live details.
 function screen(parent,x,y,z,size=1){const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(size);parent.add(g);cyl(.012,.3,C.steel,0,-.15,0,g);box(.34,.22,.03,C.screenBack,0,.06,0,g);
  const tex=canvasTex(512,330,()=>{});const face=new THREE.Mesh(keep(new THREE.PlaneGeometry(.31,.2)),tex?mat(0xffffff,0,.4,{map:tex.t,emissive:0xffffff,emissiveMap:tex.t,emissiveIntensity:.55}):C.dark);face.position.set(0,.06,.016);g.add(face);
  box(.3,.015,.12,C.dark,0,-.12,.08,g);
  const draw=info=>{if(!tex)return;const x=tex.c.getContext('2d'),W=512,H=330;x.fillStyle='#16191b';x.fillRect(0,0,W,H);const col=info.state==='Running'?'#3fa66b':info.state==='Check failed'?'#d2453b':'#d8a531';
   x.fillStyle=col;x.fillRect(0,0,W,14);x.fillStyle='#ecebe5';x.font='600 46px "IBM Plex Sans", system-ui, sans-serif';x.textBaseline='top';x.fillText(info.name,24,34);
   x.fillStyle=col;x.font='600 34px "IBM Plex Sans", system-ui, sans-serif';x.fillText(info.state,24,98);
   x.font='500 30px "IBM Plex Mono", ui-monospace, monospace';x.fillStyle='#b9b7b0';[['Board',info.board],['Cycle',info.cycle],['Done',info.done]].forEach(([k,v],i)=>{x.fillText(k,24,160+i*52);x.fillStyle='#ecebe5';x.fillText(String(v),200,160+i*52);x.fillStyle='#b9b7b0'});tex.t.needsUpdate=true};
  // paint(fn): hand the screen's 2D context to fn(g, W, H) — the X-ray machine shows its live image.
  const paint=fn=>{if(!tex)return;fn(tex.c.getContext('2d'),512,330);tex.t.needsUpdate=true};
  return {draw,paint}}
 function estop(parent,x,y,z){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);box(.09,.09,.04,C.yellow,0,0,0,g);cyl(.03,.03,C.red,0,0,.035,g,'z');return g}
 // Base cabinet with two doors, handles, kick plate and levelling feet; conveyor slots at pass height.
 function cabinet(g,w,d,top,cy){box(w,top-.1,d,C.frame,0,(top-.1)/2+.1,0,g);box(w-.06,.08,d-.06,C.kick,0,.05,0,g);
  for(const sx of [-1,1])for(const sz of [-1,1])cyl(.03,.06,C.steel,sx*(w/2-.1),.03,sz*(d/2-.1),g);
  const doors=Math.max(1,Math.round(w/.9));for(let i=1;i<doors;i++)box(.008,top-.2,.004,C.kick,-w/2+i*w/doors,(top-.1)/2+.1,d/2+.001,g);
  for(let i=0;i<doors;i++)box(.012,.14,.02,C.steel,-w/2+(i+.85)*w/doors,top*.55,d/2+.012,g);
  for(const sx of [-1,1])box(.012,.12,.95,C.dark,sx*(w/2+.002),cy,0,g)}
 // Hood: solid back, sides and roof with a glass front so the internals show.
 function hood(g,w,d,y0,h){box(w,.04,d,C.panel,0,y0+h,0,g);box(w,h,.04,C.panel,0,y0+h/2,-d/2+.02,g);for(const sx of [-1,1])box(.04,h,d,C.panel,sx*(w/2-.02),y0+h/2,0,g);
  const glass=box(w-.1,h-.08,.012,C.glass,0,y0+h/2,d/2-.02,g);glass.castShadow=false;box(w,.05,.03,C.dark,0,y0+.025,d/2-.015,g);box(w,.05,.03,C.copper,0,y0+h-.03,d/2-.01,g);return glass}

 function machine(id,{x,w,d,h,cy,roof=true}){
  const g=new THREE.Group();g.position.set(x,0,0);const hit=[],moving=[];const top=cy-.06;let towerY=null;
  if(id==='loader'){
   cabinet(g,w,d,top,cy);
   // Open frame on top with the magazine on its elevator.
   for(const sx of [-1,1])for(const sz of [-1,1])box(.05,1,.05,C.alu,sx*(w/2-.12),top+.5,sz*(d/2-.15),g);box(w-.2,.04,d-.25,C.alu,0,top+1,0,g);
   const mag=new THREE.Group();g.add(mag);const mw=.9,md=.95,mh=.62;
   for(const sx of [-1,1])box(.02,mh,md,C.lead,sx*mw/2,0,0,mag);box(mw,.02,md,C.lead,0,-mh/2,0,mag);box(mw,.02,md,C.lead,0,mh/2,0,mag);
   const rails=[];for(let i=0;i<14;i++){for(const sx of [-1,1])box(.012,.006,md*.96,C.steel,sx*(mw/2-.015),-mh/2+.04+i*.04,0,mag)}void rails;
   const boards=[];for(let i=0;i<14;i++)boards.push(box(mw-.06,.012,md*.88,C.mask,0,-mh/2+.04+i*.04,0,mag));
   cyl(.025,1,C.steel,-mw/2-.12,top+.5,0,g);box(.12,.08,.5,C.dark,mw/2+.08,cy,0,g);
   mag.position.set(-.1,cy+.2,0);
   g.userData.setRemaining=n=>boards.forEach((b,i)=>{b.visible=i<n});
   hit.push(...g.children.filter(c=>c.isMesh));
   moving.push((t,busy)=>{mag.position.y=cy+.2+(busy?-.04*((t*.5)%1):0)});
  }else if(id==='reflow'){
   cabinet(g,w,d,top,cy);const hh=.5;box(w,hh,d,C.frame,0,top+hh/2,0,g);box(w,.03,d+.01,C.copper,0,top+hh-.04,0,g);
   for(let i=1;i<11;i++)box(.006,hh+.002,d+.004,C.kick,-w/2+i*w/11,top+hh/2,0,g);
   for(let i=0;i<11;i++){box(w/11*.55,.02,d*.5,C.dark,-w/2+(i+.5)*w/11,top+hh+.01,0,g)}
   // Exhaust stacks with ducts to the roof; flux fumes rise from them, vapour curls out of both openings.
   const fumes=[];for(const sx of [-.32,.18]){cyl(.07,.55,C.steel,sx*w,top+hh+.28,-d*.2,g);cyl(.085,.06,C.steel,sx*w,top+hh+.56,-d*.2,g);if(roof)cyl(.05,3.4,mat(0xb9bdc0,.6,.35),sx*w,top+hh+2.3,-d*.2,g);
    fumes.push(smoke(g,sx*w,top+hh+.62,-d*.2,{count:30,life:4.5,rise:1.9,drift:.45,grow:.7,opacity:.5}))}
   for(const sx of [-1,1])fumes.push(smoke(g,sx*(w/2+.06),cy+.06,0,{count:12,life:2.4,rise:.5,drift:sx*.18,start:.05,grow:.28,opacity:.28,tint:0xf3f1ec}));
   moving.push((t,busy,clock)=>fumes.forEach((f,i)=>f.update(clock,i<2?(busy?1:.55):(busy?1:.25))));
   for(const sx of [-1,1]){box(.02,.07,.95,C.dark,sx*(w/2+.006),cy+.01,0,g);box(.012,.05,.9,C.hot,sx*(w/2+.008),cy+.01,0,g)}
   for(let i=0;i<4;i++)cyl(.06,.01,C.dark,w/2-.3-i*.2,top*.6,d/2+.006,g,'z');
   box(.36,.26,.04,C.screenBack,-w/2+.35,top+.18,d/2+.03,g);
   hit.push(...g.children.filter(c=>c.isMesh));
  }else if(id==='xray'){
   const xr=mat(0x9a9d9f,.25,.55);box(w,top+.75,d,xr,0,(top+.75)/2,0,g);box(w-.06,.08,d-.06,C.kick,0,.05,0,g);
   for(const sx of [-1,1])for(const sz of [-1,1])cyl(.03,.06,C.steel,sx*(w/2-.1),.03,sz*(d/2-.1),g);
   box(w*.55,top*.9,.006,C.kick,-w*.12,top*.62,d/2+.003,g);box(w*.5,top*.82,.004,xr,-w*.12,top*.62,d/2+.006,g);
   const win=box(w*.32,.18,.012,mat(0x4e3a12,.2,.1,{transparent:true,opacity:.6}),-w*.12,top+.35,d/2+.008,g);win.castShadow=false;
   const sign=canvasTex(256,224,(x,W,H)=>{x.fillStyle='#e3b82e';x.beginPath();x.moveTo(W/2,8);x.lineTo(W-8,H-8);x.lineTo(8,H-8);x.closePath();x.fill();x.strokeStyle='#1c1b18';x.lineWidth=10;x.stroke();
    x.fillStyle='#1c1b18';const cx=W/2,cy2=H*.62,R=48;x.beginPath();x.arc(cx,cy2,10,0,Math.PI*2);x.fill();for(let k=0;k<3;k++){const a=-Math.PI/2+k*2*Math.PI/3;x.beginPath();x.moveTo(cx,cy2);x.arc(cx,cy2,R,a-.5,a+.5);x.closePath();x.fill()}x.fillStyle='#e3b82e';x.beginPath();x.arc(cx,cy2,18,0,Math.PI*2);x.fill();x.fillStyle='#1c1b18';x.beginPath();x.arc(cx,cy2,10,0,Math.PI*2);x.fill()});
   if(sign){const s=new THREE.Mesh(keep(new THREE.PlaneGeometry(.22,.19)),mat(0xffffff,0,.6,{map:sign.t,transparent:true}));s.position.set(w*.3,top+.42,d/2+.004);g.add(s)}
   box(.04,.04,.02,C.yellow,w*.3,top*.5,d/2+.01,g);for(const sx of [-1,1])box(.012,.12,.95,C.dark,sx*(w/2+.002),cy,0,g);
   hit.push(...g.children.filter(c=>c.isMesh));
  }else if(id==='wave'){
   // Wave solder: an inclined finger conveyor through a long tunnel: spray fluxer, preheat panels, the
   // solder pot with its standing wave, cooling fans. Exhaust stacks on the roof.
   cabinet(g,w,d,top,cy);const hh=.55,glass=hood(g,w,d,top,hh);glass.userData.glass=true;towerY=top+hh;
   for(let i=1;i<4;i++)box(.03,hh,.03,C.panel,-w/2+i*w/4,top+hh/2,d/2-.02,g);
   hit.push(...g.children.filter(c=>c.isMesh));
   const s=w/4,sx=i=>-w/2+(i+.5)*s,rise=.1,ang=Math.atan2(rise,w),yAt=x=>cy+.12+(x+w/2)/w*rise;
   for(const sz of [-1,1]){const r=box(w-.1,.03,.03,C.alu,0,yAt(0)-.02,sz*.3,g);r.rotation.z=ang}
   box(.3,.12,.5,C.dark,sx(0),top+.07,0,g);cyl(.012,.06,C.steel,sx(0),top+.16,0,g);
   const mist=smoke(g,sx(0),top+.18,0,{count:8,life:1.2,rise:.12,drift:.05,start:.03,grow:.12,opacity:.35,tint:0xcfe3f0});
   const heat=mat(0x301205,0,1,{emissive:0xff6a2a,emissiveIntensity:.3});for(let i=0;i<3;i++)box(s*.26,.03,.62,heat,sx(1)-s*.32+i*s*.32,top+.06,0,g);
   const molten=mat(0xd4d7da,.95,.12);box(s*.8,.22,.75,C.steel,sx(2),top+.09,0,g);box(s*.74,.01,.69,molten,sx(2),top+.205,0,g);cyl(.08,.2,C.dark,sx(2)+s*.3,top+.1,-.48,g);
   const wave=cyl(.05,.62,molten,sx(2),top+.2,0,g,'z');
   for(const k of [-1,1]){cyl(.12,.03,C.dark,sx(3)+k*s*.22,top+hh-.06,0,g);cyl(.03,.035,C.steel,sx(3)+k*s*.22,top+hh-.06,0,g)}
   const fumes=[0,2].map(i=>{cyl(.08,.3,C.steel,sx(i),top+hh+.15,-d*.2,g);if(roof)cyl(.05,3,mat(0xb9bdc0,.6,.35),sx(i),top+hh+1.8,-d*.2,g);return smoke(g,sx(i),top+hh+.32,-d*.2,{count:16,life:4,rise:1.2,drift:.3,grow:.5,opacity:.35})});
   const load=new THREE.Group();g.add(load);box(.36,.02,.5,C.lead,0,0,0,load);box(.3,.012,.4,C.mask,0,.016,0,load);for(let i=0;i<5;i++)box(.04,.05,.06,i%2?C.reelB:C.dark,-.12+i*.06,.047,-.08+(i%2)*.12,load);load.rotation.z=ang;
   moving.push((t,busy,clock)=>{const p=busy?((t*.12)%1):.62,lx=-w/2+.3+p*(w-.6);load.visible=busy;load.position.set(lx,yAt(lx)+.01,0);
    wave.scale.set(1,1+.12*Math.sin(clock*5),1);heat.emissiveIntensity=busy?1:.3;mist.update(clock,busy?1:0);fumes.forEach(f=>f.update(clock,busy?.9:.2))});
  }else if(id==='selective'){
   // Selective solder: the board held on the conveyor; under it a drop-jet fluxer and a small solder pot
   // with a mini-wave nozzle travel on an XY table from joint to joint.
   cabinet(g,w,d,top,cy);const hh=.62,glass=hood(g,w,d,top,hh);glass.userData.glass=true;towerY=top+hh;hit.push(...g.children.filter(c=>c.isMesh));
   const by=top+.38;for(const sz of [-1,1])box(w-.12,.04,.03,C.alu,0,by-.02,sz*.27,g);for(const sx of [-1,1])box(.012,.1,.6,C.dark,sx*(w/2+.002),by,0,g);
   const load=new THREE.Group();g.add(load);box(.42,.012,.5,C.mask,0,by,0,load);for(let i=0;i<6;i++)box(.04,.06,.03,i%3?C.dark:C.reelB,-.14+i*.056,by+.036,.08,load);box(.16,.08,.1,C.dark,.05,by+.046,-.12,load);
   for(const sx of [-1,1])box(.04,.03,d-.3,C.alu,sx*(w/2-.2),top+.02,0,g);
   const xb=new THREE.Group();g.add(xb);box(w-.4,.05,.06,C.dark,0,top+.06,0,xb);const car=new THREE.Group();xb.add(car);
   box(.16,.14,.16,C.steel,0,top+.16,0,car);box(.17,.03,.17,C.copper,0,top+.13,0,car);cyl(.018,.12,C.steel,0,top+.29,0,car);cyl(.024,.02,mat(0xd4d7da,.95,.12),0,top+.355,0,car);
   box(.08,.12,.08,C.dark,-w/2+.25,top+.1,-.3,g);cyl(.04,.18,mat(0x2c4f8a,.1,.4),-w/2+.25,top+.15,-.45,g);
   moving.push((t,busy)=>{const a=busy?t*1.6:0;load.visible=busy;xb.position.z=busy?.16*Math.sin(a*.9):-.2;car.position.x=busy?.17*Math.sin(a*1.3):-.25});
  }else if(id==='ict'){
   // In-circuit test press: the board on a bed of spring pins, a pneumatic press on four guide posts
   // that lowers the hold-down plate onto it, and two-hand start buttons on the front.
   cabinet(g,w,d,top,cy);towerY=top+.05;const fx=w*.62,fz=d*.55,deck=top+.05;
   box(w-.1,.05,d-.1,C.dark,0,top+.025,0,g);box(fx,.06,fz,C.lead,0,deck+.03,0,g);
   hit.push(...g.children.filter(c=>c.isMesh));
   const pinGeo=keep(new THREE.CylinderGeometry(.005,.005,.03,6)),gold=mat(0xc9a35a,.85,.3),nx=16,nz=11,pins=new THREE.InstancedMesh(pinGeo,gold,nx*nz),m4=new THREE.Matrix4();
   for(let i=0;i<nx;i++)for(let k=0;k<nz;k++)pins.setMatrixAt(i*nz+k,m4.makeTranslation((i/(nx-1)-.5)*fx*.82,deck+.075,(k/(nz-1)-.5)*fz*.78));g.add(pins);
   const load=new THREE.Group();g.add(load);box(fx*.88,.012,fz*.84,C.mask,0,deck+.096,0,load);for(let i=0;i<5;i++)box(.05,.02,.05,C.dark,-.16+i*.08,deck+.112,(i%2-.5)*.12,load);
   const px=fx/2+.04,pz=fz/2-.02;for(const sx of [-1,1])for(const sz of [-1,1])cyl(.022,.78,C.steel,sx*px,deck+.39,sz*pz,g);
   box(fx+.16,.07,fz+.02,C.frame,0,deck+.8,0,g);cyl(.075,.3,C.alu,0,deck+.98,0,g);cyl(.085,.03,C.dark,0,deck+1.14,0,g);
   const press=new THREE.Group();g.add(press);box(fx*.94,.03,fz*.92,mat(0x9fb6c4,.1,.1,{transparent:true,opacity:.6}),0,deck+.14,0,press);box(fx*.94,.03,fz*.92,C.frame,0,deck+.18,0,press);
   for(const sx of [-1,1])for(const sz of [-1,1])cyl(.008,.04,C.steel,sx*fx*.3,deck+.11,sz*fz*.25,press);cyl(.025,.58,C.steel,0,deck+.48,0,press);
   for(const sx of [-1,1]){box(.12,.05,.1,C.yellow,sx*(w/2-.16),top+.075,d/2-.12,g);cyl(.025,.025,mat(0x2d7a4c,.1,.5),sx*(w/2-.16),top+.11,d/2-.12,g)}
   moving.push((t,busy)=>{load.visible=busy;press.position.y=busy?.02*Math.max(0,Math.sin(t*.8)):.36});
  }else if(id==='probe'){
   // Flying probe tester: the board clamped on the conveyor and two gantries above it, each with two
   // heads that tilt their needle probes onto test points.
   cabinet(g,w,d,top,cy);const hh=.62,glass=hood(g,w,d,top,hh);glass.userData.glass=true;towerY=top+hh;hit.push(...g.children.filter(c=>c.isMesh));
   for(const sz of [-1,1])box(w-.12,.04,.03,C.alu,0,cy-.02,sz*.3,g);
   const load=new THREE.Group();g.add(load);box(.5,.012,.56,C.mask,0,cy+.006,0,load);for(let i=0;i<7;i++)box(.035,.02,.035,C.dark,-.18+i*.06,cy+.022,(i%3-1)*.12,load);
   for(const sx of [-1,1])box(.05,.04,d-.2,C.alu,sx*(w/2-.14),top+hh-.12,0,g);
   const units=[];for(const dir of [-1,1]){const beam=new THREE.Group();g.add(beam);box(w-.3,.06,.07,C.dark,0,top+hh-.12,0,beam);
    const heads=[0,1].map(k=>{const h=new THREE.Group();beam.add(h);box(.08,.14,.08,k?C.copper:C.alu,0,top+hh-.23,0,h);const piv=new THREE.Group();piv.position.set(0,top+hh-.3,0);piv.rotation.x=dir*.32;h.add(piv);cyl(.004,.24,C.steel,0,-.12,0,piv);cyl(.009,.02,C.dark,0,-.01,0,piv);return h});
    units.push({beam,heads,dir})}
   moving.push((t,busy)=>{load.visible=busy;units.forEach(({beam,heads,dir},j)=>{const a=busy?t*2:0;beam.position.z=-dir*(busy?.2+.05*Math.sin(a*1.1+j):.3);heads.forEach((h,k)=>{h.position.x=busy?(k?.12:-.12)+.1*Math.sin(a*(1.5+k*.4)+j*2):(k?.4:-.4)})})});
  }else{
   const hh=id==='pnp'?.62:.52;cabinet(g,w,d,top,cy);const glass=hood(g,w,d,top,hh);hit.push(...g.children.filter(c=>c.isMesh));
   // Internals behind the glass: Y rails and an X gantry beam with its head, per machine type.
   const yRail=[-1,1].map(sx=>box(.05,.04,d-.2,C.alu,sx*(w/2-.14),top+hh-.12,0,g));void yRail;
   const beam=new THREE.Group();g.add(beam);box(w-.3,.07,.08,C.dark,0,top+hh-.12,0,beam);
   const head=new THREE.Group();beam.add(head);
   if(id==='printer'){box(.6,.06,.7,C.alu,0,cy+.08,0,g);box(.5,.01,.6,mat(0xc4c8cb,.85,.25),0,cy+.11,0,g);box(.55,.08,.05,C.steel,0,top+hh-.22,0,head);box(.5,.12,.01,C.steel,0,top+hh-.3,.02,head)}
   else if(id==='pnp'){for(let k=0;k<4;k++)cyl(.012,.16,C.steel,-.09+k*.06,top+hh-.24,0,head);box(.32,.14,.12,C.copper,0,top+hh-.14,0,head);
    // Feeder trolley across the front with tape reels.
    const n=Math.max(8,Math.round((w-.4)/.09));box(w-.3,.36,.34,C.dark,0,top-.05,d/2+.17,g);for(let i=0;i<n;i++){const fx=-(w-.4)/2+(i+.5)*(w-.4)/n;box(.05,.03,.32,C.lead,fx,top+.14,d/2+.12,g);cyl(.13,.025,i%3===2?C.reelB:C.reelA,fx,top+.18,d/2+.3,g,'x')}
    const beam2=new THREE.Group();g.add(beam2);box(w-.3,.07,.08,C.dark,0,top+hh-.12,0,beam2);const head2=new THREE.Group();beam2.add(head2);box(.26,.12,.1,C.copper,0,top+hh-.14,0,head2);for(let k=0;k<4;k++)cyl(.012,.14,C.steel,-.07+k*.045,top+hh-.24,0,head2);
    moving.push((t,busy)=>{const a=busy?t*2.4:0;beam2.position.z=busy?-.25+.12*Math.sin(a*1.3+1):-.25;head2.position.x=busy?.4*Math.sin(a*1.7+2):.3})}
   else{const cam=box(.14,.16,.14,C.dark,0,top+hh-.22,0,head);const ring=new THREE.Mesh(keep(new THREE.TorusGeometry(.07,.012,8,24)),mat(0xffffff,0,.4,{emissive:id==='aoi'?0x9fd0ff:0xb7ffcf,emissiveIntensity:0}));ring.rotation.x=Math.PI/2;ring.position.set(0,top+hh-.31,0);head.add(ring);
    moving.push((t,busy)=>{ring.material.emissiveIntensity=busy?1.2:0})}
   const speed=id==='printer'?1.2:id==='pnp'?2.4:1.6;
   moving.push((t,busy)=>{const a=busy?t*speed:0;if(id==='printer'){beam.position.z=busy?.28*Math.sin(a):-.3;head.position.x=0}else{beam.position.z=busy?.3*Math.sin(a*.7):-.3;head.position.x=busy?(w/2-.4)*Math.sin(a*(id==='pnp'?1.9:1.1)):0}});
   glass.userData.glass=true;
  }
  // Shared details: operator screen, e-stop, signal tower.
  // The X-ray computer gets a larger monitor: it shows the live X-ray image.
  const scr=id==='xray'?screen(g,w/2-.42,top+.5,d/2+.14,1.75):screen(g,w/2-.3,top+.45,d/2+.12);if(id!=='loader')estop(g,-w/2+.12,top-.12,d/2+.02);else estop(g,w/2-.15,top-.12,d/2+.02);
  const lamps=tower(g,w/2-.12,towerY!=null?towerY:id==='reflow'?top+.5:id==='xray'?top+.75:id==='loader'?top+1.02:top+(id==='pnp'?.62:.52),-d/2+.15);
  return {group:g,hit,lamps,screen:scr,update:(t,busy,clock=t)=>moving.forEach(f=>f(t,busy,clock)),setRemaining:g.userData.setRemaining||(()=>{})};
 }

 // Link conveyor between two machines: legs, aluminium side frames, belts and a drive motor.
 function link(x0,x1,cy){const g=new THREE.Group(),L=x1-x0,mx=(x0+x1)/2;
  for(const sz of [-1,1]){box(L,.07,.04,C.alu,mx,cy-.035,sz*.47,g);box(L,.012,.05,C.belt,mx,cy-.004,sz*.43,g);for(const lx of [x0+.12,x1-.12])box(.04,cy-.07,.04,C.steel,lx,(cy-.07)/2,sz*.42,g)}
  box(L-.1,.03,.85,C.steel,mx,cy*.25,0,g);cyl(.04,.12,C.dark,x1-.2,cy-.1,.55,g,'z');return g}
 // Unloader: two magazines at the end of the line, OK and NG.
 function unloader(x,cy){const g=new THREE.Group();g.position.set(x,0,0);box(1.1,cy-.06,2,C.frame,0,(cy-.06)/2,0,g);
  const slots={};for(const [k,z,m] of [['ok',-.5,mat(0x2d7a4c,.1,.6)],['ng',.5,mat(0xb3261e,.1,.6)]]){for(const sx of [-1,1])box(.02,.6,.9,C.lead,sx*.45,cy+.3,z,g);box(.92,.02,.9,m,0,cy+.01,z,g);slots[k]=z}
  return {group:g,slots}}

 // The closed factory hall around the line (x0..x1 along the line): epoxy floor with safety lanes and a
 // green walkway; four walls (windows and columns at the back, a roll-up loading door and a fire exit on
 // the sides, the supervisor office along the front); steel roof trusses with skylights, high-bay lamps
 // and a ventilation duct; reel racks, dry cabinets, pallet racking, ESD workbenches, a reel cart and an
 // AGV. Walls and roof cast no shadow so daylight still reaches the line. bounds: where the camera may go.
 function environment(x0,x1){const g=new THREE.Group(),L=x1-x0+16,mx=(x0+x1)/2,wallZ=-5.6,frontZ=20,H=10,hx0=mx-L/2,hx1=mx+L/2,D=frontZ-wallZ,mz=(wallZ+frontZ)/2;
  const shell=(w,h,d,material,x,y,z,parent=g)=>{const m=box(w,h,d,material,x,y,z,parent);m.castShadow=false;return m};
  const floorTex=canvasTex(1024,1024,(x,W,H2)=>{x.fillStyle='#c4c7c2';x.fillRect(0,0,W,H2);for(let i=0;i<500;i++){x.fillStyle=`rgba(0,0,0,${.015+((i*37)%7)*.004})`;x.fillRect((i*131)%W,(i*197)%H2,2,2)}x.strokeStyle='rgba(40,42,40,.22)';x.lineWidth=3;for(let k=0;k<=8;k++){x.beginPath();x.moveTo(k*W/8,0);x.lineTo(k*W/8,H2);x.stroke();x.beginPath();x.moveTo(0,k*H2/8);x.lineTo(W,k*H2/8);x.stroke()}});
  if(floorTex){floorTex.t.wrapS=floorTex.t.wrapT=THREE.RepeatWrapping;floorTex.t.repeat.set(L/8,D/8)}
  const floor=new THREE.Mesh(keep(new THREE.PlaneGeometry(L,D)),mat(0xffffff,.05,.55,floorTex?{map:floorTex.t}:{}));floor.rotation.x=-Math.PI/2;floor.position.set(mx,0,mz);floor.receiveShadow=true;g.add(floor);
  const strip=(w,d,material,x,z)=>{const m=new THREE.Mesh(keep(new THREE.PlaneGeometry(w,d)),material);m.rotation.x=-Math.PI/2;m.position.set(x,.003,z);m.receiveShadow=true;g.add(m);return m};
  const yellow=mat(0xe3b82e,.05,.6),walk=mat(0x3c7d5a,.05,.7),white=mat(0xf2f1ec,.05,.6),wall=mat(0xe9e7e1,.05,.85),dado=mat(0x5f6e78,.1,.7),column=mat(0x4b5560,.5,.45),steelGrey=mat(0x7d858c,.6,.4);
  for(const z of [-1.55,1.55])strip(x1-x0+3,.08,yellow,mx,z);for(const x of [x0-1.5,x1+1.5])strip(.08,3.18,yellow,x,0);
  strip(x1-x0+6,1.2,walk,mx,3.1);for(const z of [2.5,3.7])strip(x1-x0+6,.05,white,mx,z);strip(L-2,.08,yellow,mx,13.2);
  for(let x=x0;x<x1;x+=3){const ar=new THREE.Mesh(keep(new THREE.ConeGeometry(.16,.4,3)),white);ar.rotation.set(-Math.PI/2,0,-Math.PI/2);ar.scale.set(1,1,.02);ar.position.set(x,.006,3.1);g.add(ar)}
  // Cable tray above the back of the line, with a cable drop to each machine position.
  const tray=mat(0x9aa0a4,.6,.4),cable=mat(0x2b2d30,.2,.7);box(x1-x0+2,.04,.32,tray,mx,2.75,-1.25,g);for(const sz of [-1,1])box(x1-x0+2,.08,.02,tray,mx,2.79,-1.25+sz*.16,g);
  for(let x=x0;x<=x1;x+=2.2){box(.02,.9,.02,C.steel,x,3.2,-1.25,g);cyl(.012,1.05,cable,x+.3,2.2,-1.1,g)}
  // Walls: painted dado band with a copper stripe all round.
  shell(L,H,.2,wall,mx,H/2,wallZ);shell(L,H,.2,wall,mx,H/2,frontZ);for(const x of [hx0,hx1])shell(.2,H,D,wall,x,H/2,mz);
  shell(L,1.3,.02,dado,mx,.65,wallZ+.11);shell(L,.08,.02,C.copper,mx,1.34,wallZ+.12);shell(L,1.3,.02,dado,mx,.65,frontZ-.11);shell(L,.08,.02,C.copper,mx,1.34,frontZ-.12);
  for(const [x,k] of [[hx0,1],[hx1,-1]]){shell(.02,1.3,D,dado,x+k*.11,.65,mz);shell(.02,.08,D,C.copper,x+k*.12,1.34,mz)}
  // Back wall: high windows and steel columns; columns along every wall.
  for(let x=x0-6;x<x1+6;x+=3.2){shell(2.4,1.1,.04,mat(0xdfe9ef,.1,.2,{emissive:0xe8f1f6,emissiveIntensity:.55}),x,6.3,wallZ+.12);shell(.06,1.1,.06,C.steel,x,6.3,wallZ+.15)}
  for(let x=hx0+3;x<hx1-1;x+=6.4)for(const [z,k] of [[wallZ,1],[frontZ,-1]]){shell(.3,H,.3,column,x,H/2,z+k*.3);shell(.5,.12,.5,column,x,.06,z+k*.3)}
  for(let z=wallZ+6;z<frontZ-1;z+=6.4)for(const [x,k] of [[hx0,1],[hx1,-1]])shell(.3,H,.3,column,x+k*.3,H/2,z);
  // Roof: deck, steel trusses (chords, verticals and diagonals), purlins, skylights, ventilation duct.
  shell(L,.2,D,mat(0x6b7178,.3,.7),mx,H+.1,mz);
  for(let x=hx0+3;x<hx1-1;x+=6.4){const t=new THREE.Group();t.position.set(x,0,0);g.add(t);shell(.14,.14,D,steelGrey,0,H-1.6,mz,t);shell(.14,.14,D,steelGrey,0,H-.15,mz,t);
   for(let z=wallZ+.4,i=0;z<frontZ-.3;z+=2.4,i++){shell(.06,1.45,.06,steelGrey,0,H-.88,z,t);if(z+2.4<frontZ){const dg=shell(.05,Math.hypot(2.4,1.45),.05,steelGrey,0,H-.88,z+1.2,t);dg.rotation.x=(i%2?1:-1)*Math.atan2(2.4,1.45)}}}
  for(let z=wallZ+2;z<frontZ;z+=4.5)shell(L,.1,.08,steelGrey,mx,H-.1,z);
  for(let x=hx0+6.2;x<hx1-3;x+=6.4)for(const z of [1,9.5])shell(2.6,.04,3.2,mat(0xeef4f7,.1,.2,{emissive:0xf4f8fa,emissiveIntensity:.9}),x,H-.03,z);
  const duct=mat(0xb9bdc0,.6,.35);cyl(.45,L-1,duct,mx,H-2.3,14.5,g,'x').castShadow=false;for(let x=hx0+2;x<hx1-1;x+=4)shell(.03,1.9,.03,C.steel,x,H-1.1,14.5);
  for(let x=hx0+4;x<hx1-2;x+=8)cyl(.32,.08,mat(0x8b9196,.5,.4),x,H-2.79,14.5,g).castShadow=false;
  // High-bay lamps in rows over the back, the line and the front aisle.
  for(const z of [-3.6,.2,6.5,11.5])for(let x=hx0+2.8;x<hx1-2;x+=4.8){cyl(.012,H-6.45,C.steel,x,(H+6.25)/2,z,g).castShadow=false;
   const shade=new THREE.Mesh(keep(new THREE.ConeGeometry(.42,.32,24,1,true)),mat(0x8d9399,.6,.4,{side:THREE.DoubleSide}));shade.position.set(x,6.2,z);g.add(shade);cyl(.36,.02,mat(0xffffff,0,.3,{emissive:0xfff6e5,emissiveIntensity:1.6}),x,6.05,z,g).castShadow=false}
  // Signs: ESD protected area on the back wall, emergency exit on the left wall.
  const sign=canvasTex(512,256,(x,W,H2)=>{x.fillStyle='#e3b82e';x.fillRect(0,0,W,H2);x.strokeStyle='#1c1b18';x.lineWidth=14;x.strokeRect(7,7,W-14,H2-14);x.fillStyle='#1c1b18';
   x.beginPath();x.moveTo(110,40);x.lineTo(190,190);x.lineTo(30,190);x.closePath();x.lineWidth=10;x.stroke();x.beginPath();x.moveTo(80,165);x.quadraticCurveTo(110,70,140,165);x.stroke();
   x.font='700 54px "IBM Plex Sans", system-ui, sans-serif';x.fillText('ESD',230,110);x.font='600 34px "IBM Plex Sans", system-ui, sans-serif';x.fillText('protected area',230,165)});
  if(sign){const p=new THREE.Mesh(keep(new THREE.PlaneGeometry(1.6,.8)),mat(0xffffff,0,.6,{map:sign.t}));p.position.set(x0+1,2.4,wallZ+.12);g.add(p)}
  const exit=canvasTex(512,192,(x,W,H2)=>{x.fillStyle='#1f8a4c';x.fillRect(0,0,W,H2);x.fillStyle='#ffffff';x.font='700 84px "IBM Plex Sans", system-ui, sans-serif';x.textBaseline='middle';x.fillText('EXIT',170,H2/2);x.beginPath();x.moveTo(40,H2/2);x.lineTo(120,H2/2-40);x.lineTo(120,H2/2+40);x.closePath();x.fill()});
  const exitZ=11;shell(.06,2.2,1.3,mat(0x5f6e78,.3,.5),hx0+.13,1.1,exitZ);box(.03,.04,.7,C.steel,hx0+.18,1.05,exitZ,g);
  if(exit){const p=new THREE.Mesh(keep(new THREE.PlaneGeometry(.9,.34)),mat(0xffffff,0,.5,{map:exit.t,emissive:0xffffff,emissiveMap:exit.t,emissiveIntensity:.6}));p.rotation.y=Math.PI/2;p.position.set(hx0+.13,2.6,exitZ);g.add(p)}
  // Roll-up loading door on the right wall: ribbed shutter, yellow and black guard posts, the coil box.
  const doorZ=8,door=new THREE.Group();door.position.set(hx1-.12,0,doorZ);g.add(door);shell(.06,4.4,4.6,mat(0xaab0b5,.6,.4),0,2.2,0,door);for(let y=.2;y<4.4;y+=.22)shell(.03,.03,4.6,mat(0x8b9196,.6,.4),-.04,y,0,door);
  shell(.5,.5,5,dado,-.25,4.65,0,door);for(const k of [-1,1]){shell(.14,4.7,.14,yellow,-.07,2.35,k*2.4,door);for(let y=.3;y<4.6;y+=.6)shell(.15,.25,.15,C.dark,-.07,y,k*2.4,door)}
  for(const k of [-1,1])cyl(.1,1.1,yellow,hx1-.9,.55,doorZ+k*2.7,g);
  // Supervisor office along the front wall: glazing, door and frame.
  const office=mat(0xbfd3dc,.1,.15,{transparent:true,opacity:.45});for(let i=0;i<5;i++){const ox=mx-6+i*3;shell(2.8,1.6,.04,office,ox,2.6,frontZ-.14).material.depthWrite=false;shell(.08,1.7,.08,C.dark,ox-1.44,2.6,frontZ-.15)}shell(15,.08,.08,C.dark,mx,3.45,frontZ-.15);shell(15,.08,.08,C.dark,mx,1.78,frontZ-.15);
  shell(1.1,2.2,.06,mat(0x5f6e78,.3,.5),mx+8.4,1.1,frontZ-.14);
  // Fire extinguishers along the walls.
  for(const [x,z] of [[hx0+.35,4],[hx0+.35,16],[hx1-.35,15],[x0+8,wallZ+.35],[mx+10,frontZ-.35]]){cyl(.09,.5,C.red,x,.4,z,g);cyl(.03,.1,C.dark,x,.7,z,g);shell(.3,.3,.3,C.red,x,1.5,z)}
  // Reel racks against the back wall, then the moisture dry cabinets.
  const reelCols=[0xe9e8e3,0x2c4f8a,0x2d7a4c,0xb3261e,0x1c1d1f].map(c=>mat(c,.1,.5));
  for(const rx of [x0+4,x0+6.4,x1-3]){const r=new THREE.Group();r.position.set(rx,0,wallZ+.75);g.add(r);for(const sx of [-1,1])for(const sz of [-1,1])box(.04,2.1,.04,C.steel,sx*1.05,1.05,sz*.3,r);
   for(let k=0;k<4;k++){box(2.14,.03,.64,C.steel,0,.3+k*.55,0,r);for(let i=0;i<12;i++)cyl(.17,.03,reelCols[(i+k*3)%5],-.95+i*.17,.5+k*.55,0,r,'x')}}
  for(let i=0;i<3;i++){const c=new THREE.Group();c.position.set(x0+9+i*1.05,0,wallZ+.5);g.add(c);box(.95,1.9,.6,mat(0x3c4a57,.3,.5),0,.95,0,c);const gl=box(.8,1.6,.01,mat(0x9fb6c4,.1,.1,{transparent:true,opacity:.5}),0,1,.305,c);gl.castShadow=false;
   for(let k=0;k<4;k++){box(.8,.02,.5,C.steel,0,.4+k*.4,0,c);for(let j=0;j<5;j++)cyl(.13,.025,reelCols[(j+k+i)%5],-.3+j*.15,.55+k*.4,0,c,'x')}box(.18,.08,.01,mat(0x16191b,.2,.4,{emissive:0x3fa66b,emissiveIntensity:.6}),.28,1.85,.31,c)}
  // Pallet racking with cartons in the front right corner.
  const blue=mat(0x2c4f8a,.4,.5),orange=mat(0xd9824a,.3,.5),carton=mat(0xb8915e,.05,.85);
  for(let bay=0;bay<3;bay++){const r=new THREE.Group();r.position.set(hx1-2-bay*2.8,0,frontZ-1.2);g.add(r);for(const sx of [-1,1])for(const sz of [-1,1])box(.08,4.2,.08,blue,sx*1.35,2.1,sz*.5,r);
   for(let lv=0;lv<3;lv++){for(const sz of [-1,1])box(2.7,.1,.06,orange,0,.15+lv*1.4,sz*.5,r);for(let k=0;k<3;k++)box(.75,.55+((k+lv+bay)%3)*.12,.85,carton,-.9+k*.9,.2+lv*1.4+(.55+((k+lv+bay)%3)*.12)/2,0,r)}}
  // ESD workbenches with monitors and magnifier lamps along the front, a reel cart, a rework bench.
  const bench=(x,z,ry=0)=>{const b=new THREE.Group();b.position.set(x,0,z);b.rotation.y=ry;g.add(b);box(1.8,.05,.8,mat(0x5f6e78,.2,.6),0,.9,0,b);box(1.7,.01,.7,mat(0x2f6f86,.1,.8),0,.93,0,b);for(const sx of [-1,1])for(const sz of [-1,1])box(.05,.9,.05,C.steel,sx*.85,.45,sz*.35,b);
   box(1.8,.6,.03,C.steel,0,1.6,-.38,b);box(.5,.32,.03,C.screenBack,.3,1.25,-.25,b);cyl(.012,.4,C.steel,-.5,1.12,-.2,b);cyl(.12,.05,mat(0xf2f1ec,.1,.4,{emissive:0xffffff,emissiveIntensity:.4}),-.5,1.35,-.05,b);box(.25,.12,.2,C.dark,.6,.98,.1,b);return b};
  bench(x1+3.2,-2.4);for(let i=0;i<4;i++)bench(mx-12+i*2.4,frontZ-1.1,Math.PI);
  const cart=new THREE.Group();cart.position.set(mx-1.5,0,-2.6);g.add(cart);box(1,.04,.6,C.steel,0,.3,0,cart);box(1,.04,.6,C.steel,0,.85,0,cart);for(const sx of [-1,1])for(const sz of [-1,1]){box(.03,.85,.03,C.steel,sx*.48,.45,sz*.28,cart);cyl(.04,.03,C.dark,sx*.44,.04,sz*.26,cart,'z')}
  for(let i=0;i<6;i++)cyl(.17,.03,reelCols[i%5],-.4+i*.16,1.04,0,cart,'x');
  // AGV on the walkway, carrying a reel cart to the line.
  const agv=new THREE.Group();agv.position.set(mx+5,0,3.1);g.add(agv);box(1.2,.28,.75,mat(0xe9e8e3,.2,.5),0,.16,0,agv);box(1.21,.05,.76,orange,0,.24,0,agv);box(.06,.06,.5,mat(0x16191b,.2,.4,{emissive:0x9fd0ff,emissiveIntensity:.8}),.6,.2,0,agv);
  box(1,.03,.6,C.steel,0,.4,0,agv);for(let i=0;i<5;i++)cyl(.17,.03,reelCols[(i+2)%5],-.32+i*.16,.6,0,agv,'x');
  g.userData.bounds={x0:hx0+.6,x1:hx1-.6,y0:.4,y1:H-1.8,z0:wallZ+.6,z1:frontZ-.6};
  return g}

 const dispose=()=>owned.forEach(x=>x.dispose?.());
 return {machine,link,unloader,environment,dispose,materials:C};
}
