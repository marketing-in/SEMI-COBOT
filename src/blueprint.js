// Board blueprint import. Converts KiCad PCB files, pick-and-place (centroid) exports and
// placement spreadsheets into one board model. All geometry is in millimetres, centred on 0,0,
// with Y growing downwards (KiCad/SVG convention). Nothing here touches the DOM, so the same
// code runs in the browser and in Node tests.

export const TYPE_LABELS={chip:'Integrated circuit',transistor:'Transistor',diode:'Diode',led:'LED',capacitor:'Capacitor',resistor:'Resistor',inductor:'Inductor',connector:'Connector',crystal:'Crystal / oscillator',switch:'Switch',fuse:'Fuse / protection',module:'Module',other:'Component'};
export const TYPE_CATEGORY={chip:'Integrated circuits',transistor:'Transistors',diode:'Diodes',led:'Optoelectronics',capacitor:'Capacitors',resistor:'Resistors',inductor:'Inductors',connector:'Connectors',crystal:'Crystals & oscillators',switch:'Switches',fuse:'Circuit protection',module:'Modules',other:'Uncategorized'};
export const LIMITS={parts:3000,padsPerPart:160,pads:6000,traces:8000,outlinePoints:4000,fileBytes:25e6};

const r3=n=>{const v=Math.round(n*1000)/1000;return v===0?0:v};
const num=v=>{const n=parseFloat(String(v??'').replace(',','.'));return Number.isFinite(n)?n:NaN};

// Component family from the reference designator, with package and value keywords as a tie-breaker.
export function inferType(ref='',pkg='',value=''){
 const prefix=String(ref).toUpperCase().replace(/[^A-Z].*$/,'');
 const text=(String(pkg)+' '+String(value)).toUpperCase();
 if(prefix==='LED'||prefix==='LD'||/\bLED\b|LED_/.test(text))return 'led';
 if(['D','DZ','ZD','CR','DS'].includes(prefix)&&!/DISPLAY/.test(text))return 'diode';
 if(['U','IC','N','A','AR'].includes(prefix))return 'chip';
 if(['C','CP','CE','CT'].includes(prefix))return 'capacitor';
 if(['R','RN','RV','VR','POT','TH','NTC','PTC','RT'].includes(prefix))return 'resistor';
 if(['L','FB','FL','TR'].includes(prefix)||prefix==='T'&&/TRANSFORMER|INDUCTOR/.test(text))return 'inductor';
 if(['Q','M','QN','QP','T','TR'].includes(prefix)||/SOT-?23|TO-?220|TO-?252|TO-?263|TO-?92|DPAK|MOSFET/.test(text))return 'transistor';
 if(['Y','XTAL','OSC'].includes(prefix)||/CRYSTAL|XTAL|OSC|RESONATOR/.test(text))return 'crystal';
 if(['J','P','CN','CON','JP','USB','H','X','XP','TB','K'].includes(prefix)&&/CONN|HEADER|USB|JACK|SOCKET|TERMINAL|JST|PIN|RJ|HDMI|CARD|BARREL|PLUG|RECEPT|EDGE/.test(text)||['J','P','CN','CON','JP','USB','TB','XP'].includes(prefix))return 'connector';
 if(prefix==='X')return 'crystal';
 if(['SW','S','BTN','K'].includes(prefix)||/SWITCH|BUTTON|TACT/.test(text))return 'switch';
 if(['F','PS','TVS','MOV'].includes(prefix)||/FUSE/.test(text))return 'fuse';
 if(['MOD','MD'].includes(prefix)||/MODULE|WROOM|ESP32|ESP8266|RASPBERRY/.test(text))return 'module';
 if(/SOD|SMA\b|SMB\b|SMC\b|DO-?21|DO-?41|SCHOTTKY|DIODE/.test(text))return 'diode';
 if(/CONN|HEADER|USB|JACK|SOCKET|TERMINAL/.test(text))return 'connector';
 return 'other';
}

// Nominal body sizes (width along X, depth along Y, height) in KiCad default orientation.
const IMPERIAL={'01005':[.4,.2,.15],'0201':[.6,.3,.25],'0402':[1,.5,.35],'0603':[1.6,.8,.45],'0805':[2,1.25,.6],'1206':[3.2,1.6,.6],'1210':[3.2,2.5,.9],'1806':[4.5,1.6,.9],'1812':[4.5,3.2,1.1],'2010':[5,2.5,.6],'2220':[5.7,5,1.5],'2512':[6.3,3.2,.6]};
const NAMED=[
 [/SOT-?23-?[56]|SC-?74|SOT-?363|SC-?88|TSOP-?6/,1.6,2.9,1.1,'dual'],
 [/SOT-?23|SOT-?323|SC-?70|SOT-?346|SOT-?416|SC-?59/,1.3,2.9,1,'dual'],
 [/SOT-?223/,3.5,6.5,1.6,'dual'],[/SOT-?89/,2.5,4.5,1.5,'dual'],[/SOT-?143/,1.4,2.9,1,'dual'],
 [/SOD-?123|SOD-?128/,2.7,1.6,1.1,'ends'],[/SOD-?323/,1.7,1.25,.95,'ends'],[/SOD-?523|SOD-?723/,1.2,.8,.6,'ends'],[/SOD-?80|MINI-?MELF|LL-?34|LL-?41/,3.5,1.5,1.5,'ends'],[/SOD-?882|DSN/,1,.6,.4,'ends'],
 [/\bSMAF?\b(?! (CONN|EDGE|VERT))|DO-?214AC/,4.3,2.6,2.1,'ends'],[/\bSMB\b|DO-?214AA/,4.3,3.6,2.1,'ends'],[/\bSMC\b|DO-?214AB/,6.9,5.9,2.3,'ends'],[/DO-?41|DO-?15/,5.2,2.7,2.7,'ends'],[/DO-?35|DO-?34/,3.5,1.8,1.8,'ends'],[/POWERDI|SMPC|TO-?277/,4.5,2.6,1,'ends'],
 [/TO-?220/,10,4.6,4.5,'tht'],[/TO-?252|DPAK/,6.6,6.1,2.3,'dual'],[/TO-?263|D2PAK|DDPAK/,10.2,9.2,4.4,'dual'],[/TO-?92/,4.7,3.7,5,'tht'],[/TO-?247|TO-?3P/,16,5.2,6,'tht'],[/TO-?126/,8,3,6,'tht'],
 [/USB[ -]?C\b|TYPE-?C/,9,7.5,3.2,'none'],[/MICRO[ -]?(USB|B\b)|USB MICRO/,7.5,5.5,2.6,'none'],[/MINI[ -]?USB|USB MINI/,9.3,7.7,4,'none'],[/USB[ -]?A\b/,14,14,7,'none'],[/HDMI/,15,11,6,'none'],[/RJ-?45|8P8C/,16,21,8,'none'],[/MICRO[ -]?SD|TF[ -]?CARD/,14,15,2,'none'],[/\bSD[ -]?CARD/,26,28,3,'none'],[/BARREL|DC[ -]?JACK|POWERJACK/,9,14,8,'none'],[/\bSMA[ -](CONN|EDGE|VERT)/,6.5,6.5,6,'none'],[/JST|\bPH[ -]?\d|\bXH[ -]?\d|\bGH[ -]?\d|\bSH[ -]?\d/,6,5,6,'none'],[/SCREW[ -]?TERMINAL|TERMINAL[ -]?BLOCK/,10,8,8,'none'],[/PCI|EDGE[ -]?CONN/,30,8,10,'none'],
 [/32\.?768|CRYSTAL SMD 2012|\b2012\b/,2,1.2,.6,'ends'],[/\b3215\b|FC-?135/,3.2,1.5,.8,'ends'],[/\b3225\b|FA-?238/,3.2,2.5,.8,'none'],[/\b2016\b|FA-?128/,2,1.6,.5,'none'],[/\b5032\b|FA-?238V/,5,3.2,1,'none'],[/\b7050\b/,7,5,1.3,'none'],[/HC-?49|HC49/,11.5,4.7,3.5,'ends'],[/OSCILLATOR/,7,5,1.4,'none'],
 [/TACT|TACTILE|SW PUSH|BUTTON/,6,6,3.5,'none'],[/SLIDE|SPDT|DIP[ -]?SWITCH|SW DIP/,8.5,4,4,'none'],
 [/CR2032|COIN[ -]?CELL|BATTERY/,20,20,5,'none'],[/BUZZER|SPEAKER|PIEZO/,12,12,6,'none'],[/RELAY/,15,10,10,'none'],[/\b3296\b|TRIMPOT|POTENTIOMETER/,9.5,4.8,5,'tht'],[/LED[ -]?3MM|LED D3/,3,3,4.5,'cyl'],[/LED[ -]?5MM|LED D5/,5,5,6,'cyl'],
 [/ESP32-?WROOM|ESP32-?WROVER/,18,25.5,3.1,'none'],[/ESP-?12|ESP8266/,16,24,3,'none'],[/ESP32-?C3|ESP32-?S3|ESP32-?MINI/,13.2,16.6,2.4,'none'],[/NRF52|BLE[ -]?MODULE/,10,15,2,'none'],[/RASPBERRY|RPI/,56,85,12,'none'],[/ARDUINO[ -]?NANO/,18,45,8,'none']
];
function pinsFrom(pkg){const m=pkg.match(/(?:SOIC|SO|SOP|SSOP|TSSOP|MSOP|QFN|DFN|QFP|LQFP|TQFP|PQFP|HTQFP|BGA|DIP|PDIP|TSOP|VQFN|WQFN|UQFN|WSON|SON|PLCC|LCC|LGA)[-_ ]?(\d{1,3})\b/i);return m?+m[2]||+m[1]:0}

// Returns [w,d,h,leads,shape] for a package / footprint name. leads: 'dual' (pins on ±X), 'quad',
// 'ends' (two terminals along X), 'tht', 'none'. shape: 'box' or 'cyl'.
export function packageSize(pkg='',type='other'){
 // Library prefixes ("Package_SO:") are dropped and separators become spaces so \b matches.
 const p=String(pkg).toUpperCase().replace(/^.*?:/,'').replace(/[_:,]/g,' ').trim();
 const dims=p.match(/(?:^|[^0-9.])(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)(?:X(\d+(?:\.\d+)?))?\s?MM/);
 const explicit=dims&&+dims[1]<=80&&+dims[2]<=80?[+dims[1],+dims[2]]:null;
 for(const code in IMPERIAL){if(new RegExp('(?:^|[^0-9])'+code+'(?![0-9])').test(p)){const [w,d,h]=IMPERIAL[code];return [w,d,type==='capacitor'?Math.min(h*1.6,1.6):type==='inductor'?h*1.5:h,'ends','box']}}
 const metric=p.match(/(?:^|[ -])(\d{2})(\d{2})METRIC/);if(metric){const w=+metric[1]/10,d=+metric[2]/10;return [w,d,Math.max(.25,d*.55),'ends','box']}
 const pins=pinsFrom(p);
 if(/TSSOP|MSOP|VSSOP|SSOP|TSOP|SOIC|\bSO-?\d|\bSOP|HSOP|SOJ/.test(p)&&pins){
  const pitch=/TSSOP|MSOP|VSSOP|SSOP|TSOP/.test(p)?.65:1.27;const length=r3(Math.max(2.9,(pins/2-1)*pitch+(pitch>1?1.1:1.05)));
  const width=/MSOP|VSSOP/.test(p)?3:/TSSOP|SSOP/.test(p)?(pins>=28?6.1:4.4):(/W\b|7\.5X|WIDE/.test(p)||pins>=18)?7.5:3.9;
  return [...(explicit||[width,length]),/TSSOP|MSOP|VSSOP/.test(p)?1:1.5,'dual','box'];
 }
 if(/QFN|DFN|\bSON\b|WSON|LGA|MLF|UQFN|WQFN|VQFN/.test(p)){if(explicit)return [...explicit,.9,'none','box'];const side=pins<=8?2:pins<=16?3:pins<=24?4:pins<=32?5:pins<=40?6:pins<=48?7:pins<=64?9:10;return [side,side,.9,'none','box']}
 if(/QFP/.test(p)){if(explicit)return [...explicit,1.4,'quad','box'];const side={32:7,44:10,48:7,64:10,80:12,100:14,120:16,128:14,144:20,176:24,208:28}[pins]||10;return [side,side,1.4,'quad','box']}
 if(/BGA|CSP/.test(p)){if(explicit)return [...explicit,1.2,'none','box'];const side=Math.max(4,Math.min(35,Math.round(Math.sqrt(pins||100)*.9)));return [side,side,1.2,'none','box']}
 if(/PLCC/.test(p)){const side=pins<=28?11.5:pins<=44?16.5:pins<=68?24:30;return [side,side,4,'quad','box']}
 if(/DIP|PDIP|DIL/.test(p)&&pins){const wide=/W15|15\.24|WIDE|600/.test(p)||pins>=24;return [wide?15.24:7.62,r3(pins/2*2.54),3.5,'dual','box']}
 const header=p.match(/(?:^|[^0-9.])([12])X(\d{1,2})(?![0-9.]|\s?MM)/);if(header&&/HEADER|PIN|CONN|SOCKET|IDC|JUMPER|JST|TERMINAL|P2\.54|P2\.00|P1\.27/.test(p)){const rows=+header[1],n=+header[2];return [r3(2.54*n),r3(2.54*rows),/SOCKET|FEMALE/.test(p)?8.5:/SMD/.test(p)?6:8.5,'none','box']}
 for(const [re,w,d,h,leads] of NAMED)if(re.test(p))return [w,d,h,leads==='cyl'?'none':leads,leads==='cyl'?'cyl':'box'];
 const radial=p.match(/\bD(\d+(?:\.\d+)?)\s?MM/)||p.match(/ELEC[ -]?(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)/)||p.match(/RADIAL[ -]?D?(\d+(?:\.\d+)?)/);
 if(radial&&/RADIAL|ELEC|\bCP\b|DISC|CAP|LED|\bL\b|INDUCTOR|BUZZER/.test(p)){const dia=+radial[1];const h=radial[2]?+radial[2]:dia*1.1;return [dia,dia,Math.min(12,h),'none','cyl']}
 const xyz=explicit||(()=>{const m=p.match(/(?:^|[^0-9.])(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)(?![0-9.])/);return m&&+m[1]<=80&&+m[2]<=80?[+m[1],+m[2]]:null})();
 if(xyz){const [w,d]=xyz;const h=dims?.[3]?Math.min(12,+dims[3]):type==='chip'?1.2:Math.max(.4,Math.min(4,Math.min(w,d)*.45));return [w,d,h,type==='chip'?'dual':['capacitor','resistor','diode','inductor','fuse','led','crystal'].includes(type)?'ends':'none','box']}
 return {chip:[5,5,1.2,'dual','box'],transistor:[1.3,2.9,1,'dual','box'],diode:[2.7,1.6,1.1,'ends','box'],led:[1.6,.8,.6,'ends','box'],capacitor:[1.6,.8,.8,'ends','box'],resistor:[1.6,.8,.45,'ends','box'],inductor:[3,3,1.5,'ends','box'],connector:[6,4,5,'none','box'],crystal:[5,3.2,1,'none','box'],switch:[6,6,3.5,'none','box'],fuse:[3.2,1.6,.6,'ends','box'],module:[16,20,3,'none','box'],other:[3,3,1.5,'none','box']}[type]||[3,3,1.5,'none','box'];
}

// Capacitor bodies at their real size. Ceramic chips keep their case code; electrolytics, tantalums and
// film capacitors are sized from the footprint name when it carries dimensions, else from capacitance ×
// voltage (the can grows with the stored charge): radial cans, SMD (V-chip) cans, snap-in cans above
// about 120 000 µF·V, tantalum cases A–E and film boxes by lead pitch. Returns null for ceramic chips.
const RADIAL=[[4,7,250],[5,11,800],[6.3,11,1600],[8,11.5,3300],[10,12.5,6000],[10,16,10000],[10,20,14000],[12.5,20,25000],[12.5,25,33000],[16,25,56000],[16,31.5,80000],[18,35.5,120000]];
const SNAP_IN=[[22,30,200000],[25,40,330000],[30,45,560000],[35,50,Infinity]];
const SMD_CAN=[[4,5.4,200],[5,5.4,400],[6.3,5.4,700],[6.3,7.7,1200],[8,10,3000],[10,10,6000],[12.5,13.5,12000],[16,16.5,Infinity]];
const TANTALUM={A:[3.2,1.6,1.6],B:[3.5,2.8,1.9],C:[6,3.2,2.5],D:[7.3,4.3,2.8],E:[7.3,4.3,4.1]};
const FILM=[[5,7.2,3.5,7],[7.5,10,4,9],[10,13,5,11],[15,18,6,12],[22.5,26.5,8.5,17],[27.5,31.5,11,21]];
export function capacitance(text=''){
 const t=String(text).replace(/µ|μ/g,'u');const short=t.match(/(\d+)([pnum])(\d+)/i);
 const m=short?[0,short[1]+'.'+short[3],short[2]]:t.match(/(\d+(?:\.\d+)?)\s*([pnum])F?(?![a-z])/i);if(!m)return null;
 return +m[1]*{p:1e-6,n:1e-3,u:1,m:1000}[m[2].toLowerCase()];
}
export const ratedVolts=(text='')=>{const m=String(text).match(/(\d+(?:\.\d+)?)\s*V(?:DC)?\b/i);return m?+m[1]:null};
export function capacitorSize({package:pkg='',value='',mpn=''}={}){
 const P=String(pkg).toUpperCase().replace(/^.*?:/,'').replace(/[_:,]/g,' '),text=value+' '+mpn,uF=capacitance(value)??capacitance(mpn),V=ratedVolts(text)||ratedVolts(P)||25,cv=(uF||0)*V;
 const pick=(rows,cvMax)=>rows.find(r=>cvMax<=r[2])||rows[rows.length-1];
 if(/TANT|\bCP?T\b|CASE[ -]?[A-E]\b/.test(P)||/^(T49\d|TAJ|TPS|T520|TCJ|F93)/i.test(mpn)){
  const c=(P.match(/CASE[ -]?([A-E])\b/)||[])[1]||{3216:'A',3528:'B',6032:'C',7343:'D'}[(P.match(/\b(3216|3528|6032|7343)\b/)||[])[1]]||(cv<=50?'A':cv<=150?'B':cv<=400?'C':cv<=1000?'D':'E');
  const [w,d,h]=TANTALUM[c];return {w,d,h,leads:'ends',shape:'box',body:'tantalum'};
 }
 if(/FILM|MKP|MKT|\bX[12]\b|\bY[12]\b|\bBOX\b|\bPET\b|POLYPROP/.test(P+' '+String(value).toUpperCase())){
  const pitch=+(P.match(/\bP(\d+(?:\.\d+)?)/)||[])[1]||(uF>=2.2?15:uF>=.47?10:7.5);const [,w,d,h]=FILM.reduce((a,r)=>Math.abs(r[0]-pitch)<Math.abs(a[0]-pitch)?r:a);
  return {w,d,h,leads:'none',shape:'box',body:'film'};
 }
 const chip=Object.keys(IMPERIAL).some(code=>new RegExp('(?:^|[^0-9])'+code+'(?![0-9])').test(P))||/\d{4}METRIC/.test(P);
 if(chip||/X[57]R|C0G|NP0|MLCC|CERAMIC/i.test(text+' '+P))return null;
 const polar=/RADIAL|ELEC|\bCP\b|CPOL|POLAR|ELKO|\bCAN\b|SNAP|ALU|V-?CHIP|\bCE\b/.test(P)||(!P.trim()||/^(CAP|C|SMD|THT)?$/.test(P.trim()))&&uF>=10;
 if(!polar)return null;
 const dims=P.match(/\bD(\d+(?:\.\d+)?)\s?(?:MM)?(?:[ X-]*L?(\d+(?:\.\d+)?))?/)||P.match(/(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)/);
 const smd=/SMD|SMT|V-?CHIP|ELEC[ -]?\d/.test(P)&&!/RADIAL|THT/.test(P),snap=/SNAP/.test(P)||(!smd&&cv>120000);
 const rows=smd?SMD_CAN:snap?SNAP_IN:RADIAL;
 let D,L;if(dims&&+dims[1]>=3&&+dims[1]<=40){D=+dims[1];L=dims[2]&&+dims[2]>=3?+dims[2]:(rows.filter(r=>r[0]===D).find(r=>cv<=r[2])||rows.filter(r=>r[0]<=D).pop()||[D,D*1.6])[1]}
 else [D,L]=pick(rows,cv);
 return {w:D,d:D,h:L,leads:'none',shape:'cyl',body:smd?'smd-electrolytic':snap?'snap-in':'electrolytic'};
}

// Parts saved before capacitor bodies existed get them on load (sizes from the same rules as makePart).
export function upgradePart(p){
 if(p.type!=='capacitor'||p.body)return p;const cap=capacitorSize(p);if(!cap)return p;
 return {...p,body:cap.body,w:p.pads?p.w:cap.w,d:p.pads?p.d:cap.d,h:cap.h,shape:cap.shape,leads:p.pads?p.leads:cap.leads};
}

// Synthetic pads for boards without copper data (centroid files, spreadsheets). Local coordinates.
export function partPads(part){
 if(part.pads)return part.pads;const {w,d,leads,type}=part;const pads=[];
 if(leads==='ends'){const along=d>w*1.3?'y':'x';const L=along==='x'?w:d,S=along==='x'?d:w;const pl=Math.min(L*.3,Math.max(.4,L*.22));for(const k of [-1,1]){const c=k*(L/2-pl/2+.05);pads.push(along==='x'?{x:c,y:0,w:pl,h:S*.9,rot:0,shape:'rect'}:{x:0,y:c,w:S*.9,h:pl,rot:0,shape:'rect'})}}
 else if(leads==='dual'||leads==='quad'){const pitch=type==='transistor'?.95:Math.max(.5,Math.min(1.27,d/6));const n=Math.max(2,Math.min(30,Math.floor((d-.6)/pitch)+1));const span=(n-1)*pitch;for(let i=0;i<n;i++){const y=-span/2+i*pitch;pads.push({x:-(w/2+.35),y,w:.8,h:pitch*.55,rot:0,shape:'rect'},{x:w/2+.35,y,w:.8,h:pitch*.55,rot:0,shape:'rect'})}
  if(leads==='quad'){const m=Math.max(2,Math.min(30,Math.floor((w-.6)/pitch)+1));const s2=(m-1)*pitch;for(let i=0;i<m;i++){const x=-s2/2+i*pitch;pads.push({x,y:-(d/2+.35),w:pitch*.55,h:.8,rot:0,shape:'rect'},{x,y:d/2+.35,w:pitch*.55,h:.8,rot:0,shape:'rect'})}}}
 else if(leads==='tht'){const n=Math.max(2,Math.min(5,Math.round(w/2.54)));for(let i=0;i<n;i++)pads.push({x:-(n-1)*1.27+i*2.54,y:0,w:1.6,h:1.6,rot:0,shape:'circle',hole:.8})}
 else if(type==='connector'){const n=Math.max(2,Math.min(24,Math.round(Math.max(w,d)/2.54)));const horizontal=w>=d;for(let i=0;i<n;i++){const t=-(n-1)*1.27+i*2.54;pads.push(horizontal?{x:t,y:d/2-1,w:1.5,h:1.5,rot:0,shape:'circle',hole:.8}:{x:w/2-1,y:t,w:1.5,h:1.5,rot:0,shape:'circle',hole:.8})}}
 else if(type==='chip'||type==='module'){pads.push({x:0,y:0,w:Math.max(.5,w*.5),h:Math.max(.5,d*.5),rot:0,shape:'rect'})}
 return pads;
}

const normSide=v=>/^(b|bot|bottom|back|bottomlayer|b\.cu|bottom layer|bottom side)$/i.test(String(v).trim())?'bottom':'top';
const cleanText=v=>String(v??'').replace(/[\u0000-\u001f]/g,'').trim().slice(0,120);

export function makePart(raw){
 const ref=cleanText(raw.ref),pkg=cleanText(raw.package),value=cleanText(raw.value),mpn=cleanText(raw.mpn);
 const type=raw.type||inferType(ref,pkg,value);
 let [pw,pd,ph,pleads,pshape]=packageSize(pkg,type);
 // Capacitors: the real body (a 1000 µF can is big, a 100 nF chip is small). Footprint geometry from
 // copper keeps its width and depth; the body type and height still come from the capacitor.
 const cap=type==='capacitor'?capacitorSize({package:pkg,value,mpn}):null;if(cap){pw=cap.w;pd=cap.d;ph=cap.h;pleads=cap.leads;pshape=cap.shape}
 const w=raw.w>0?raw.w:pw,d=raw.d>0?raw.d:pd,h=cap?ph:raw.h>0?raw.h:ph,leads=raw.leads||pleads,shape=cap?cap.shape:raw.shape||pshape;
 return {...(cap?{body:cap.body}:{}),ref,value,mpn,package:pkg,type,x:r3(raw.x||0),y:r3(raw.y||0),rot:r3(((raw.rot||0)%360+360)%360),side:raw.side||'top',w:r3(Math.max(.3,w)),d:r3(Math.max(.3,d)),h:r3(Math.max(.15,h)),leads,shape,pads:raw.pads&&raw.pads.length?raw.pads:null};
}

function finish(board){
 // Centre everything on the outline (or the parts) and compute the board size.
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 const grow=(x,y)=>{if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y};
 if(board.outline)board.outline.forEach(([x,y])=>grow(x,y));
 else{board.parts.forEach(p=>{const r=Math.hypot(p.w,p.d)/2;grow(p.x-r,p.y-r);grow(p.x+r,p.y+r)});const m=Math.max(2,(maxX-minX)*.04);minX-=m;maxX+=m;minY-=m;maxY+=m}
 if(!Number.isFinite(minX))throw Error('No component positions found in this blueprint.');
 const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
 const shift=pts=>pts.map(([x,y])=>[r3(x-cx),r3(y-cy)]);
 board.parts.forEach(p=>{p.x=r3(p.x-cx);p.y=r3(p.y-cy)});
 board.outline=board.outline?shift(board.outline):null;board.holes=(board.holes||[]).map(shift);
 for(const side in board.traces||{})board.traces[side]=board.traces[side].map(([a,b,c,d])=>[r3(a-cx),r3(b-cy),r3(c-cx),r3(d-cy)]);
 board.width=r3(maxX-minX);board.height=r3(maxY-minY);
 if(board.width<1||board.height<1||board.width>2000||board.height>2000)throw Error('Board dimensions look wrong. Expected millimetre coordinates between 1 mm and 2 m.');
 board.layers=board.layers||2;board.parts=board.parts.slice(0,LIMITS.parts);
 return board;
}

// --- Pick-and-place / placement tables ---------------------------------------------------------
const HEADERS={
 ref:/^(ref|refs|refdes|ref ?des|designator|designators|reference|references|part ?ref|component|name)$/i,
 value:/^(val|value|comment|part|part ?name|description)$/i,
 mpn:/^(mpn|manufacturer ?part ?(number|no|#)?|mfr\.? ?part ?(number|no|#)?|mfg ?part ?(number|no)?|part ?number|partno|part ?no|pn|manufacturer_part_number)$/i,
 package:/^(package|footprint|pattern|fp|case|package\/case|footprint ?name)$/i,
 x:/^(x|posx|pos ?x|mid ?x|midx|center-?x|centre-?x|location ?x|ref ?x|x ?\(?(mm|mil|in|inch)?\)?|x_?mm|x ?pos|x ?location|x ?center)$/i,
 y:/^(y|posy|pos ?y|mid ?y|midy|center-?y|centre-?y|location ?y|ref ?y|y ?\(?(mm|mil|in|inch)?\)?|y_?mm|y ?pos|y ?location|y ?center)$/i,
 rot:/^(rot|rotation|angle|orientation|rotate|r)$/i,
 side:/^(side|layer|tb|top\/bottom|mount ?side|placement ?layer)$/i,
 width:/^(width|w|body ?width|size ?x)$/i,length:/^(length|depth|d|l|body ?length|size ?y)$/i,height:/^(height|h|z|body ?height)$/i
};
function splitLine(line,delimiter){
 const out=[];let cur='',quoted=false;
 for(let i=0;i<line.length;i++){const c=line[i];
  if(c==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++}else quoted=!quoted;continue}
  if(!quoted&&(delimiter?c===delimiter:/\s/.test(c))){if(delimiter||cur!==''){out.push(cur);cur=''}continue}
  cur+=c}
 if(delimiter||cur!=='')out.push(cur);return out.map(s=>s.trim());
}
export function parsePlacementText(text,fileName='blueprint',opts={}){
 const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/).map(l=>l.trimEnd()).filter(l=>l.trim());
 if(!lines.length)throw Error('The file is empty.');
 let headerIndex=-1,delimiter='';
 for(let i=0;i<Math.min(lines.length,40);i++){
  const raw=lines[i].replace(/^#+\s*/,'');
  for(const delim of [',',';','\t','']){const cells=splitLine(raw,delim);const hits=cells.filter(c=>HEADERS.ref.test(c)||HEADERS.x.test(c)||HEADERS.y.test(c)).length;if(hits>=3){headerIndex=i;delimiter=delim;break}}
  if(headerIndex>=0)break;
 }
 if(headerIndex<0)throw Error('No placement header found. Expected columns such as Ref, X, Y, Rotation and Package.');
 const header=splitLine(lines[headerIndex].replace(/^#+\s*/,''),delimiter);
 const rows=lines.slice(headerIndex+1).filter(l=>!l.startsWith('#')).map(l=>splitLine(l,delimiter));
 return parsePlacementTable([header,...rows],fileName,opts);
}
// opts.raw returns the parts in their original coordinates (mm, Y down) without centring them.
export function parsePlacementTable(rows,fileName='blueprint',opts={}){
 const table=rows.map(r=>(r||[]).map(c=>c==null?'':typeof c!=='object'?String(c):c.richText?c.richText.map(t=>t.text).join(''):c.result!==undefined?String(c.result):c.text!==undefined?String(c.text):c instanceof Date?c.toISOString():String(c)));
 const headerIndex=table.findIndex(r=>r.filter(c=>HEADERS.ref.test(c.trim())||HEADERS.x.test(c.trim())||HEADERS.y.test(c.trim())).length>=3);
 if(headerIndex<0)throw Error('No placement header found. Expected columns such as Ref, X, Y, Rotation and Package.');
 const header=table[headerIndex].map(c=>c.trim());const col={};
 for(const key in HEADERS){const i=header.findIndex(h=>HEADERS[key].test(h));if(i>=0)col[key]=i}
 if(col.ref==null||col.x==null||col.y==null)throw Error('Placement data needs Ref, X and Y columns.');
 const unitText=(header[col.x]+' '+header[col.y]).toLowerCase();const unit=/mil(?!l)/.test(unitText)?.0254:/\b(in|inch)\b/.test(unitText)?25.4:1;
 const parts=[];const seen=new Set();
 for(const row of table.slice(headerIndex+1)){
  const ref=cleanText(row[col.ref]);if(!ref)continue;
  const x=num(row[col.x])*unit,y=num(row[col.y])*unit;if(!Number.isFinite(x)||!Number.isFinite(y))continue;
  if(seen.has(ref.toUpperCase()))continue;seen.add(ref.toUpperCase());
  const get=k=>col[k]==null?'':row[col[k]];
  const w=num(get('width'))*unit,d=num(get('length'))*unit,h=num(get('height'))*unit;
  // Centroid exports use Y upwards; the board model uses Y downwards.
  parts.push(makePart({ref,value:get('value'),mpn:get('mpn'),package:get('package'),x,y:-y,rot:num(get('rot'))||0,side:normSide(get('side')),w:w>0?w:0,d:d>0?d:w>0?w:0,h:h>0?h:w>0?Math.max(.4,Math.min(w,d>0?d:w)*.4):0}));
  if(parts.length>LIMITS.parts)break;
 }
 if(!parts.length)throw Error('No component rows with numeric X/Y positions were found.');
 if(opts.raw)return {parts};
 return finish({name:baseName(fileName),revision:'',source:/\.xlsx?$/i.test(fileName)?'Excel placement':'Pick-and-place file',fileName,parts,outline:null,holes:[],traces:{},layers:2});
}
const baseName=f=>String(f).replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ').trim().slice(0,60)||'Imported board';

// --- KiCad PCB ----------------------------------------------------------------------------------
export function sexpr(text){
 const n=text.length;let i=0;
 function node(){
  i++;const list=[];
  for(;;){
   let c=text.charCodeAt(i);while(i<n&&(c===32||c===10||c===13||c===9)){i++;c=text.charCodeAt(i)}
   if(i>=n)break;
   if(c===41){i++;break}
   if(c===40){list.push(node());continue}
   if(c===34){let s='';i++;while(i<n&&text.charCodeAt(i)!==34){if(text.charCodeAt(i)===92&&i+1<n)i++;s+=text[i++]}i++;list.push(s);continue}
   const start=i;while(i<n){c=text.charCodeAt(i);if(c===32||c===10||c===13||c===9||c===40||c===41)break;i++}list.push(text.slice(start,i));
  }
  return list;
 }
 while(i<n&&text.charCodeAt(i)!==40)i++;
 if(i>=n)throw Error('Not a KiCad board file.');
 return node();
}
const child=(list,name)=>list.find(e=>Array.isArray(e)&&e[0]===name);
const children=(list,name)=>list.filter(e=>Array.isArray(e)&&e[0]===name);
const layerOf=e=>{const l=child(e,'layer');return l?String(l[1]):''};
const xy=e=>e?[num(e[1]),num(e[2])]:null;
function arcPoints(start,mid,end){
 const [ax,ay]=start,[bx,by]=mid,[cx,cy]=end;const dd=2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by));
 if(Math.abs(dd)<1e-9)return [start,end];
 const ux=((ax*ax+ay*ay)*(by-cy)+(bx*bx+by*by)*(cy-ay)+(cx*cx+cy*cy)*(ay-by))/dd,uy=((ax*ax+ay*ay)*(cx-bx)+(bx*bx+by*by)*(ax-cx)+(cx*cx+cy*cy)*(bx-ax))/dd;
 const r=Math.hypot(ax-ux,ay-uy);let a0=Math.atan2(ay-uy,ax-ux),a1=Math.atan2(by-uy,bx-ux),a2=Math.atan2(cy-uy,cx-ux);
 const ccw=((a1-a0+2*Math.PI)%(2*Math.PI))<((a2-a0+2*Math.PI)%(2*Math.PI));
 let sweep=ccw?((a2-a0+2*Math.PI)%(2*Math.PI)):-((a0-a2+2*Math.PI)%(2*Math.PI));
 const steps=Math.max(2,Math.ceil(Math.abs(sweep)/(Math.PI/18)));const pts=[];
 for(let k=0;k<=steps;k++){const a=a0+sweep*k/steps;pts.push([ux+r*Math.cos(a),uy+r*Math.sin(a)])}
 return pts;
}
function shapeSegments(e){
 const kind=String(e[0]).replace(/^(gr_|fp_)/,'');const segs=[];
 if(kind==='line'){const s=xy(child(e,'start')),t=xy(child(e,'end'));if(s&&t)segs.push([s,t])}
 else if(kind==='rect'){const s=xy(child(e,'start')),t=xy(child(e,'end'));if(s&&t)segs.push([[s[0],s[1]],[t[0],s[1]]],[[t[0],s[1]],[t[0],t[1]]],[[t[0],t[1]],[s[0],t[1]]],[[s[0],t[1]],[s[0],s[1]]])}
 else if(kind==='arc'){const s=xy(child(e,'start')),m=xy(child(e,'mid')),t=xy(child(e,'end'));
  if(s&&m&&t){const pts=arcPoints(s,m,t);for(let k=1;k<pts.length;k++)segs.push([pts[k-1],pts[k]])}
  else if(s&&t){const angle=num(child(e,'angle')?.[1]);if(Number.isFinite(angle)){const r=Math.hypot(t[0]-s[0],t[1]-s[1]);const a0=Math.atan2(t[1]-s[1],t[0]-s[0]);const steps=Math.max(2,Math.ceil(Math.abs(angle)/10));let prev=t;for(let k=1;k<=steps;k++){const a=a0+angle*Math.PI/180*k/steps;const p=[s[0]+r*Math.cos(a),s[1]+r*Math.sin(a)];segs.push([prev,p]);prev=p}}}}
 else if(kind==='circle'){const c=xy(child(e,'center')),t=xy(child(e,'end'));if(c&&t){const r=Math.hypot(t[0]-c[0],t[1]-c[1]);let prev=[c[0]+r,c[1]];for(let k=1;k<=48;k++){const a=k/48*2*Math.PI;const p=[c[0]+r*Math.cos(a),c[1]+r*Math.sin(a)];segs.push([prev,p]);prev=p}}}
 else if(kind==='poly'){const pts=child(e,'pts');if(pts){const list=children(pts,'xy').map(xy);for(let k=0;k<list.length;k++)segs.push([list[k],list[(k+1)%list.length]])}}
 return segs;
}
function chainLoops(segs){
 const key=p=>Math.round(p[0]*100)+','+Math.round(p[1]*100);const used=new Array(segs.length).fill(false);const loops=[];
 const index=new Map();segs.forEach((s,i)=>{for(const p of [s[0],s[1]]){const k=key(p);if(!index.has(k))index.set(k,[]);index.get(k).push(i)}});
 for(let i=0;i<segs.length;i++){
  if(used[i])continue;used[i]=true;const loop=[segs[i][0],segs[i][1]];let guard=0;
  while(guard++<segs.length+5){const tail=loop[loop.length-1];if(key(tail)===key(loop[0])&&loop.length>3)break;
   const next=(index.get(key(tail))||[]).find(j=>!used[j]);if(next==null)break;used[next]=true;const s=segs[next];loop.push(key(s[0])===key(tail)?s[1]:s[0])}
  if(loop.length>3&&key(loop[0])===key(loop[loop.length-1])){loop.pop();loops.push(loop)}
 }
 return loops;
}
function bboxOf(pts){let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;for(const [x,y] of pts){if(x<a)a=x;if(x>c)c=x;if(y<b)b=y;if(y>d)d=y}return Number.isFinite(a)?[a,b,c,d]:null}
function parseFootprint(fp){
 const name=String(fp[1]||'');const at=child(fp,'at');const x=num(at?.[1]),y=num(at?.[2]),rot=num(at?.[3])||0;
 if(!Number.isFinite(x)||!Number.isFinite(y))return null;
 const side=/^B\./.test(layerOf(fp))?'bottom':'top';let ref='',value='',mpn='';
 for(const e of fp){
  if(!Array.isArray(e))continue;
  if(e[0]==='property'){const k=String(e[1]).toLowerCase(),v=String(e[2]??'');if(k==='reference')ref=v;else if(k==='value')value=v;else if(!mpn&&/^(mpn|manufacturer ?part|mfr\.? ?part|part ?number|partno|mfg ?part|manufacturer_part_number|lcsc|digikey|mouser)/.test(k)&&v&&!/^~?$/.test(v))mpn=v}
  else if(e[0]==='fp_text'){if(e[1]==='reference')ref=ref||String(e[2]??'');else if(e[1]==='value')value=value||String(e[2]??'')}
 }
 if(!ref||/^REF\*\*|^\*\*/.test(ref))return null;
 const fab=[],crtyd=[],padPts=[],pads=[];
 for(const e of fp){
  if(!Array.isArray(e))continue;
  if(/^fp_(line|rect|arc|circle|poly)$/.test(e[0])){const layer=layerOf(e);const target=/Fab$/.test(layer)?fab:/CrtYd$/.test(layer)?crtyd:null;if(target)for(const [a,b] of shapeSegments(e))target.push(a,b)}
  else if(e[0]==='pad'){const pat=xy(child(e,'at'));const size=child(e,'size');if(!pat||!size)continue;const pw=num(size[1]),ph=num(size[2]);if(!(pw>0&&ph>0))continue;const prot=(num(child(e,'at')?.[3])||0)-rot;const shape=String(e[3]||'rect');const drill=child(e,'drill');padPts.push([pat[0]-pw/2,pat[1]-ph/2],[pat[0]+pw/2,pat[1]+ph/2]);if(pads.length<LIMITS.padsPerPart)pads.push({x:r3(pat[0]),y:r3(pat[1]),w:r3(pw),h:r3(ph),rot:r3(((prot%360)+360)%360),shape:/circle/.test(shape)?'circle':/oval/.test(shape)?'oval':'rect',hole:drill?r3(num(drill[1])||num(drill[2])||0):0})}
 }
 const box=bboxOf(fab)||(bboxOf(crtyd)&&bboxOf(crtyd).map((v,i)=>v+(i<2?.25:-.25)))||bboxOf(padPts);
 const type=inferType(ref,name,value);const [pw,pd,ph,leads,shape]=packageSize(name,type);
 let w=pw,d=pd,ox=0,oy=0;if(box&&box[2]-box[0]>.2&&box[3]-box[1]>.2){w=box[2]-box[0];d=box[3]-box[1];ox=(box[0]+box[2])/2;oy=(box[1]+box[3])/2}
 // Convert the local body centre into board coordinates (KiCad rotates counter-clockwise, Y down).
 const a=rot*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a);
 return makePart({ref,value,mpn,package:name,type,x:x+ox*cos+oy*sin,y:y-ox*sin+oy*cos,rot,side,w,d,h:ph,leads,shape,pads:pads.map(p=>({...p,x:r3(p.x-ox),y:r3(p.y-oy)}))});
}
export function parseKicadPcb(text,fileName='board.kicad_pcb'){
 const root=sexpr(String(text));
 if(root[0]!=='kicad_pcb')throw Error('This is not a KiCad PCB file. Export the board as .kicad_pcb from KiCad.');
 const parts=[],edge=[],traces={top:[],bottom:[]};let title='',rev='',copper=0,traceCount=0;
 for(const e of root){
  if(!Array.isArray(e))continue;
  const kind=e[0];
  if(kind==='title_block'){title=String(child(e,'title')?.[1]||'');rev=String(child(e,'rev')?.[1]||'')}
  else if(kind==='layers'){copper=e.filter(l=>Array.isArray(l)&&/\.Cu$/.test(String(l[1]))).length}
  else if(kind==='footprint'||kind==='module'){const p=parseFootprint(e);if(p)parts.push(p);if(parts.length>LIMITS.parts)throw Error(`This board has more than ${LIMITS.parts} components. Split it or reduce the footprint count.`)}
  else if(/^gr_(line|arc|rect|circle|poly)$/.test(kind)&&layerOf(e)==='Edge.Cuts'){edge.push(...shapeSegments(e))}
  else if((kind==='segment'||kind==='arc')&&traceCount<LIMITS.traces){const layer=layerOf(e);const side=layer==='F.Cu'?'top':layer==='B.Cu'?'bottom':null;if(!side)continue;
   if(kind==='segment'){const s=xy(child(e,'start')),t=xy(child(e,'end'));if(s&&t){traces[side].push([s[0],s[1],t[0],t[1]]);traceCount++}}
   else{const s=xy(child(e,'start')),m=xy(child(e,'mid')),t=xy(child(e,'end'));if(s&&m&&t){const pts=arcPoints(s,m,t);for(let k=1;k<pts.length;k++)traces[side].push([pts[k-1][0],pts[k-1][1],pts[k][0],pts[k][1]]);traceCount++}}}
 }
 if(!parts.length)throw Error('No placed footprints with reference designators were found in this board.');
 let outline=null,holes=[];
 if(edge.length){
  const loops=chainLoops(edge).map(l=>l.slice(0,LIMITS.outlinePoints));
  if(loops.length){loops.sort((a,b)=>{const ba=bboxOf(a),bb=bboxOf(b);return (bb[2]-bb[0])*(bb[3]-bb[1])-(ba[2]-ba[0])*(ba[3]-ba[1])});outline=loops[0];holes=loops.slice(1,40)}
  else{const b=bboxOf(edge.flat());if(b)outline=[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]]}
 }
 return finish({name:title||baseName(fileName),revision:rev?(/^rev/i.test(rev)?rev:'Rev '+rev):'',source:'KiCad PCB',fileName,parts,outline,holes,traces,layers:copper||2});
}

// --- Entry point ---------------------------------------------------------------------------------
export function parseBlueprint(text,fileName=''){
 if(/\.kicad_pcb$/i.test(fileName)||/^\s*\(kicad_pcb/.test(String(text).slice(0,200)))return parseKicadPcb(text,fileName);
 return parsePlacementText(text,fileName);
}
export const displayName=part=>part.inv?.mpn||part.mpn||part.value||part.package||'Unnamed part';
