// Package-specific 3D bodies, so a board reads like the real thing instead of a field of boxes.
// modelKind() is pure (tested); buildBody() makes the Three.js meshes. Sizes are scene units (s = mm
// to scene); every model returns its height so the caller can seat it on the board.

export function modelKind(p){
 const pkg=String(p.package||''),val=String(p.value||p.mpn||''),both=pkg+' '+val,type=p.type;
 const tht=p.leads==='tht'||(p.pads||[]).some(q=>q.hole>0);
 if(type==='capacitor'&&p.body)return p.body==='tantalum'?'tantalum':p.body==='film'?'film':p.body==='smd-electrolytic'?'smdcan':'electrolytic';
 if(/usb/i.test(both))return 'usb';
 if(type==='connector'&&/jack|barrel|\bdc\b|power.?in/i.test(both))return 'jack';
 if(type==='connector'||/header|pin.?header|pin.?socket|\b[12]x\d+\b/i.test(pkg))return 'header';
 if(/to-?220|to-?247|dpak|d2pak|to-?263/i.test(pkg))return 'to220';
 if(/to-?92/i.test(pkg)||(type==='transistor'&&tht))return 'to92';
 if(/sot-?223/i.test(pkg))return 'sot223';
 if(type==='capacitor'&&(tht||/radial|elec|\bcp[_ ]|polar|elko|\bE\d/i.test(pkg)))return 'electrolytic';
 if(type==='crystal')return tht||/hc-?49/i.test(pkg)?'can':'smdcrystal';
 if(type==='module')return 'module';
 if(type==='switch')return 'switch';
 if(type==='inductor')return 'inductor';
 if(type==='chip'&&/dip|pdip/i.test(pkg))return 'dip';
 if(type==='chip')return 'ic';
 if(type==='led')return 'led';
 if(type==='diode')return 'diode';
 if(type==='resistor'||type==='capacitor'||p.passive)return 'passive';
 if(type==='transistor')return 'sot';
 return 'box';
}

const textures=new Map();
// Laser-marked top face: part number, a short second line and a pin-1 dot.
function markingTexture(THREE,lines,aspect,bg){
 const key=lines.join('|')+'|'+aspect.toFixed(2)+'|'+bg;if(textures.has(key))return textures.get(key);
 if(typeof document==='undefined'||textures.size>160)return null;
 const W=256,H=Math.max(32,Math.min(512,Math.round(256/aspect)));const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
 x.fillStyle=bg;x.fillRect(0,0,W,H);x.fillStyle='#8f969c';x.textAlign='center';x.textBaseline='middle';
 const size=Math.max(10,Math.min(H*.32,W/(Math.max(...lines.map(l=>l.length),4)*.62)));x.font=`600 ${size}px "IBM Plex Mono", ui-monospace, monospace`;
 lines.forEach((l,i)=>x.fillText(l.slice(0,18),W/2,H/2+(i-(lines.length-1)/2)*size*1.15));
 x.fillStyle='#5b6166';x.beginPath();x.arc(Math.min(W,H)*.14,Math.min(W,H)*.14,Math.min(W,H)*.05,0,Math.PI*2);x.fill();
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;textures.set(key,t);return t;
}

export function buildBody(THREE,p,s,{mat,partPads}){
 const kind=modelKind(p),w=Math.max(.1,p.w*s),d=Math.max(.1,p.d*s);let h=Math.max(.04,p.h*s);
 const add=(parent,geo,material,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m};
 const black=mat(0x1b1d20,.1,.72),metal=mat(0xc9cdd1,.85,.3),gold=mat(0xd2b25a,.8,.3);
 let geo,material;
 const marked=(bg,lines)=>{const tex=markingTexture(THREE,lines,w/d,bg);if(!tex)return black;const top=new THREE.MeshStandardMaterial({map:tex,roughness:.7,metalness:.05});const side=mat(parseInt(bg.slice(1),16),.1,.72);return [side,side,top,side,side,side]};
 const label=[String(p.mpn||p.value||'').slice(0,16),String(p.ref)].filter(Boolean);
 switch(kind){
  case 'electrolytic':{const r=Math.min(w,d)/2;if(!p.body)h=Math.max(h,r*2*1.5);geo=new THREE.CylinderGeometry(r,r,h,32);material=mat(p.body==='snap-in'?0x18191b:0x1d2c4f,.2,.45);break}
  case 'smdcan':{geo=new THREE.BoxGeometry(w*1.04,h*.1,d*1.04);geo.translate(0,-h*.45,0);material=black;break}
  case 'tantalum':{geo=new THREE.BoxGeometry(w*.86,h,d);material=mat(0xd2a03a,.05,.55);break}
  case 'film':{geo=new THREE.BoxGeometry(w,h,d);material=marked('#a3262c',[String(p.value||'').slice(0,12),String(p.ref)].filter(Boolean));break}
  case 'can':{h=Math.max(h,.35*s*10);geo=new THREE.CylinderGeometry(Math.min(w,d)/2,Math.min(w,d)/2,h,24);geo.scale(Math.max(w,d)/Math.min(w,d),1,1);if(d>w)geo.rotateY(Math.PI/2);material=metal;break}
  case 'smdcrystal':{geo=new THREE.BoxGeometry(w,h,d);material=metal;break}
  case 'usb':case 'jack':{geo=new THREE.BoxGeometry(w,h,d);material=kind==='usb'?metal:black;break}
  case 'header':{h=Math.min(h,2.5*s);geo=new THREE.BoxGeometry(w,h,d);material=black;break}
  case 'to220':{geo=new THREE.BoxGeometry(w,h,d);material=marked('#1b1d20',label);break}
  case 'module':{h=Math.max(h,.8*s);geo=new THREE.BoxGeometry(w,h*.25,d);material=mat(0x1f5c3e,.1,.6);break}
  case 'switch':{geo=new THREE.BoxGeometry(w,h,d);material=black;break}
  case 'inductor':{geo=new THREE.BoxGeometry(w,h,d);material=mat(0x3a3d40,.3,.6);break}
  case 'dip':case 'ic':case 'sot223':case 'sot':{geo=new THREE.BoxGeometry(w,h,d);material=w>.22&&d>.12?marked('#1b1d20',w/d>2.5||d/w>2.5?[label[0]||String(p.ref)]:label):black;break}
  case 'passive':{geo=new THREE.BoxGeometry(w*.72,h,d);material=p.type==='capacitor'?mat(0xb7a07a,.05,.7):p.type==='resistor'?mat(0x232526,.05,.7):mat(0x8f8576,.05,.7);break}
  case 'led':{geo=new THREE.BoxGeometry(w,h,d);material=mat(0xe8efe9,.05,.4);break}
  case 'diode':{geo=new THREE.BoxGeometry(w,h,d);material=mat(0x2a2c2e,.1,.6);break}
  default:{geo=p.shape==='cyl'?new THREE.CylinderGeometry(w/2,w/2,h,24):new THREE.BoxGeometry(w,h,d);material=mat(0x5d6764,.15,.55)}
 }
 const mesh=new THREE.Mesh(geo,material);mesh.castShadow=mesh.receiveShadow=true;
 const top=kind==='module'?h*.125:h/2;
 switch(kind){
  case 'smdcan':{// SMD (V-chip) electrolytic: aluminium can on a black plastic base, black polarity half-moon on top.
   const r=Math.min(w,d)/2,ch=h*.9;add(mesh,new THREE.CylinderGeometry(r,r,ch,32),metal,0,h*.05,0);add(mesh,new THREE.TorusGeometry(r*.97,r*.03,8,32),mat(0x9aa0a5,.8,.35),0,h/2-r*.25,0).rotation.x=Math.PI/2;
   const moon=add(mesh,new THREE.CylinderGeometry(r*.9,r*.9,.003,32,1,false,Math.PI*.6,Math.PI*.8),black,0,h/2+.002,0);moon.receiveShadow=true;
   for(const k of [-1,1])add(mesh,new THREE.BoxGeometry(w*.18,.006,d*.22),metal,k*w*.5,-h/2+.003,0);break}
  case 'tantalum':{// Moulded tantalum: amber body, darker anode band (+ end), tin terminations.
   add(mesh,new THREE.BoxGeometry(w*.12,h*1.01,d*1.01),mat(0x7a4f1a,.05,.6),-w*.33,0,0);for(const k of [-1,1])add(mesh,new THREE.BoxGeometry(w*.08,h*.55,d*.7),metal,k*w*.46,-h*.22,0);break}
  case 'film':{for(const k of [-1,1])add(mesh,new THREE.CylinderGeometry(Math.min(w,d)*.05,Math.min(w,d)*.05,h*.04,10),metal,k*w*.4,-h/2-h*.02,0);break}
  case 'electrolytic':{const r=Math.min(w,d)/2;
   // Rubber seal at the foot, the crimp groove near the top, and a snap-in can's plastic top disc.
   add(mesh,new THREE.CylinderGeometry(r*1.004,r*1.004,h*.03,32),mat(0x2b2b2b,.05,.9),0,-h/2+h*.015,0);add(mesh,new THREE.TorusGeometry(r*1.0,r*.035,8,32),mat(0x101418,.2,.5),0,h/2-r*.22,0).rotation.x=Math.PI/2;
   if(p.body==='snap-in')add(mesh,new THREE.CylinderGeometry(r*.92,r*.92,.01,32),mat(0x3a3d40,.1,.6),0,h/2+.004,0);
   add(mesh,new THREE.CylinderGeometry(r*.96,r*.96,.004,28),mat(0xbfc4c8,.8,.3),0,h/2+.002,0);
   const k1=add(mesh,new THREE.BoxGeometry(r*1.3,.006,r*.08),mat(0x8b9196,.6,.4),0,h/2+.004,0);k1.rotation.y=Math.PI/4;const k2=add(mesh,new THREE.BoxGeometry(r*1.3,.006,r*.08),mat(0x8b9196,.6,.4),0,h/2+.004,0);k2.rotation.y=-Math.PI/4;
   const stripe=add(mesh,new THREE.CylinderGeometry(r*1.005,r*1.005,h*.98,28,1,true,-.35,.7),mat(0xcfd5dc,.1,.5));stripe.material.side=THREE.DoubleSide;break}
  case 'header':{for(const q of (p.pads||partPads(p)||[]).slice(0,80)){if(!(q.hole>0)&&p.leads!=='tht'&&!(p.pads||[]).length)continue;add(mesh,new THREE.BoxGeometry(.64*s,6*s,.64*s),gold,q.x*s,h/2+3*s-h/2+h/2,q.y*s)}break}
  case 'usb':{add(mesh,new THREE.BoxGeometry(w*.7,h*.45,.01),black,0,0,-d/2-.002);break}
  case 'jack':{const r=Math.min(w,h)*.3;const hole=add(mesh,new THREE.CylinderGeometry(r,r,.02,20),mat(0x0b0b0c,.2,.8),0,0,-d/2);hole.rotation.x=Math.PI/2;break}
  case 'to220':{const tab=add(mesh,new THREE.BoxGeometry(w,.03,d*.55),metal,0,h*.1,-d/2-d*.25);tab.rotation.x=0;const hole=add(mesh,new THREE.CylinderGeometry(Math.min(w,d)*.12,Math.min(w,d)*.12,.035,18),mat(0x0b0b0c,.2,.8),0,h*.1,-d/2-d*.3);break}
  case 'module':{add(mesh,new THREE.BoxGeometry(w*.9,h*.75,d*.62),metal,0,h*.125+h*.375,d*.15);const tex=markingTexture(THREE,label,w/(d*.62),'#c9cdd1');if(tex){const plate=add(mesh,new THREE.PlaneGeometry(w*.86,d*.58),new THREE.MeshStandardMaterial({map:tex,roughness:.5,metalness:.4}),0,h*.125+h*.75+.002,d*.15);plate.rotation.x=-Math.PI/2}
   add(mesh,new THREE.BoxGeometry(w*.85,.004,d*.22),gold,0,h*.125+.002,-d*.36);break}
  case 'switch':{add(mesh,new THREE.CylinderGeometry(Math.min(w,d)*.22,Math.min(w,d)*.22,h*.6,20),mat(0x2b2e31,.1,.7),0,h/2+h*.3,0);break}
  case 'dip':{const notch=add(mesh,new THREE.CylinderGeometry(Math.min(w,d)*.12,Math.min(w,d)*.12,.004,18,1,false,0,Math.PI),mat(0x0d0e10,.1,.8),0,h/2+.002,0);notch.position.x=w>d?-w/2:0;notch.position.z=w>d?0:-d/2;notch.rotation.y=w>d?-Math.PI/2:0;break}
  case 'passive':{// Chip resistor / capacitor: tin end terminations wrapping each end.
   const along=w>=d;for(const k of [-1,1])add(mesh,along?new THREE.BoxGeometry(w*.14,h*1.02,d*1.02):new THREE.BoxGeometry(w*1.02,h*1.02,d*.14),metal,along?k*w*.43:0,0,along?0:k*d*.43);
   if(!along){mesh.geometry.dispose();mesh.geometry=new THREE.BoxGeometry(w,h,d*.72)}break}
  case 'led':{add(mesh,new THREE.SphereGeometry(Math.min(w,d)*.3,14,10),new THREE.MeshStandardMaterial({color:0xe9fff0,emissive:0x6fd48f,emissiveIntensity:.35,roughness:.3}),0,h/2,0);break}
  case 'diode':{add(mesh,new THREE.BoxGeometry(w>d?Math.max(.02,w*.12):w*.92,.012,w>d?d*.92:Math.max(.02,d*.12)),mat(0xd9dedb,0,.8),w>d?-w*.36:0,h/2+.006,w>d?0:-d*.36);break}
 }
 return {mesh,h:kind==='module'?h*.25:h,kind,visualTop:top};
}
