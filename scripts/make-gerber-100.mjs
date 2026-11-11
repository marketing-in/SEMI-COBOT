// Standalone generator for a 100-component test board, IOC-100 (industrial I/O controller: STM32H7, Ethernet,
// CAN, RS-485, USB-C, isolated inputs, relay drivers), written as a KiCad 7 style Gerber X2 fabrication set.
// Every part has a real manufacturer part number, carried inside the Gerber set itself:
// - on each copper pad: %TO.P / %TO.C plus %TO.CMPN (part number), CVal, CFtp (footprint), CMfr (maker);
// - in the .pos placement file (Val column = part number).
// The BOM is written as a separate file next to the zip, not inside it.
// Output: public/samples/IOC-100-gerber.zip and public/samples/IOC-100-BOM.csv
// Run: node scripts/make-gerber-100.mjs
import {writeFileSync,mkdirSync} from 'node:fs';
import {packageSize,partPads} from '../src/blueprint.js';
import {zipStored} from '../src/unzip.js';

const NAME='IOC-100',DATE='2026-11-11',W=150,H=100;

// [refs, type, value, package, manufacturer, MPN]. Refs as "R1-R8".
const LINES=[
 // Integrated circuits (16)
 ['U1','chip','STM32H743VIT6','LQFP-100','STMicroelectronics','STM32H743VIT6'],
 ['U2','chip','LM1117MPX-3.3/NOPB','SOT-223','Texas Instruments','LM1117MPX-3.3/NOPB'],
 ['U3','chip','TPS54331DR','SOIC-8','Texas Instruments','TPS54331DR'],
 ['U4','chip','W25Q128JVSIQ','SOIC-8','Winbond','W25Q128JVSIQ'],
 ['U5','chip','SN65HVD230DR','SOIC-8','Texas Instruments','SN65HVD230DR'],
 ['U6','chip','MAX3485ESA+T','SOIC-8','Analog Devices','MAX3485ESA+T'],
 ['U7','chip','LAN8720A-CP-TR','QFN-24','Microchip','LAN8720A-CP-TR'],
 ['U8','chip','CH340C','SOIC-16','WCH','CH340C'],
 ['U9','chip','ULN2003ADR','SOIC-16','Texas Instruments','ULN2003ADR'],
 ['U10','chip','ISO7741DWR','SOIC-16W','Texas Instruments','ISO7741DWR'],
 ['U11','chip','24LC256-I/SN','SOIC-8','Microchip','24LC256-I/SN'],
 ['U12','chip','TLV9062IDR','SOIC-8','Texas Instruments','TLV9062IDR'],
 ['U13','chip','PCF8563T/5','SOIC-8','NXP','PCF8563T/5'],
 ['U14','chip','USBLC6-2SC6','SOT-23-6','STMicroelectronics','USBLC6-2SC6'],
 ['U15','chip','AP2112K-3.3TRG1','SOT-23-5','Diodes Incorporated','AP2112K-3.3TRG1'],
 ['U16','chip','TLP291-4','SOP-16','Toshiba','TLP291-4'],
 // Transistors (4)
 ['Q1-Q2','transistor','BSS138','SOT-23','onsemi','BSS138'],
 ['Q3','transistor','AO3401A','SOT-23','Alpha & Omega','AO3401A'],
 ['Q4','transistor','MMBT3904LT1G','SOT-23','onsemi','MMBT3904LT1G'],
 // Diodes and LEDs (8)
 ['D1','diode','SS34','SMA','onsemi','SS34'],
 ['D2','diode','SMBJ24A','SMB','Littelfuse','SMBJ24A'],
 ['D3-D4','diode','1N4148W-7-F','SOD-123','Diodes Incorporated','1N4148W-7-F'],
 ['D5-D6','led','LTST-C191KGKT','0603','Lite-On','LTST-C191KGKT'],
 ['D7-D8','led','LTST-C191KRKT','0603','Lite-On','LTST-C191KRKT'],
 // Crystals, inductors, fuse, switch (6)
 ['Y1','crystal','ABM8-25.000MHZ-B2-T','Crystal_SMD_3.2x2.5mm','Abracon','ABM8-25.000MHZ-B2-T'],
 ['Y2','crystal','ABS07-32.768KHZ-T','Crystal_SMD_3.2x1.5mm','Abracon','ABS07-32.768KHZ-T'],
 ['L1','inductor','SRR1260-100M','L_12x12mm','Bourns','SRR1260-100M'],
 ['L2','inductor','BLM18PG221SN1D','0603','Murata','BLM18PG221SN1D'],
 ['F1','fuse','0466002.NRHF','1206','Littelfuse','0466002.NRHF'],
 ['SW1','switch','TL3342F160QG','SW_SMD_6x6mm','E-Switch','TL3342F160QG'],
 // Connectors (6)
 ['J1','connector','USB4105-GF-A','USB_C_9x7.3mm','GCT','USB4105-GF-A'],
 ['J2','connector','HR911105A','RJ45_16x21mm','HanRun','HR911105A'],
 ['J3','connector','1729131','TerminalBlock_1x03_P5.08','Phoenix Contact','1729131'],
 ['J4','connector','61300611121','PinHeader_1x06_P2.54','Wurth Elektronik','61300611121'],
 ['J5','connector','B4B-XH-A','JST_XH_1x04_P2.50','JST','B4B-XH-A'],
 ['J6','connector','TSW-110-07-G-D','PinHeader_2x10_P2.54','Samtec','TSW-110-07-G-D'],
 // Capacitors (36)
 ['C1-C14','capacitor','100nF','0402','Murata','GRM155R71C104KA88D'],
 ['C15-C20','capacitor','10uF','0603','Murata','GRM188R61A106KE69D'],
 ['C21-C24','capacitor','10nF','0603','Murata','GRM188R71H103KA01D'],
 ['C25-C28','capacitor','20pF','0402','Murata','GRM1555C1H200JA01D'],
 ['C29-C32','capacitor','22uF','0805','Samsung Electro-Mechanics','CL21A226MAQNNNE'],
 ['C33-C34','capacitor','1uF','0603','Murata','GRM188R71C105KA12D'],
 ['C35-C36','capacitor','100uF','CP_Elec_8x10','Panasonic','EEE-FK1V101P'],
 // Resistors (24)
 ['R1-R8','resistor','10k','0402','Yageo','RC0402FR-0710KL'],
 ['R9-R12','resistor','4.7k','0402','Yageo','RC0402FR-074K7L'],
 ['R13-R16','resistor','22R','0402','Yageo','RC0402FR-0722RL'],
 ['R17-R20','resistor','1k','0603','Yageo','RC0603FR-071KL'],
 ['R21-R22','resistor','120R','0603','Yageo','RC0603FR-07120RL'],
 ['R23','resistor','5.1k','0402','Yageo','RC0402FR-075K1L'],
 ['R24','resistor','100k','0402','Yageo','RC0402FR-07100KL'],
];

const expand=refs=>{const m=/^([A-Z]+)(\d+)-[A-Z]*(\d+)$/.exec(refs);if(!m)return [refs];const out=[];for(let n=+m[2];n<=+m[3];n++)out.push(m[1]+n);return out};

// Parts with no pad rule of their own (crystals, switches, QFN) get pads that match their body.
function padsFor(p){
 const {w,d}=p;
 if(p.type==='crystal')return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sy])=>({x:sx*(w/2-.45),y:sy*(d/2-.4),w:.9,h:.8,rot:0,shape:'rect'}));
 if(p.type==='switch')return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sy])=>({x:sx*(w/2+.6),y:sy*(d/2-1.5),w:1.4,h:1,rot:0,shape:'rect'}));
 if(p.type==='chip'&&p.leads==='none'){const n=Math.max(2,Math.round((w-1)/.5)),out=[{x:0,y:0,w:w*.6,h:d*.6,rot:0,shape:'rect'}];
  for(let i=0;i<n;i++){const t=-(n-1)*.25+i*.5;out.push({x:-w/2,y:t,w:.7,h:.25,rot:0,shape:'rect'},{x:w/2,y:t,w:.7,h:.25,rot:0,shape:'rect'},{x:t,y:-d/2,w:.25,h:.7,rot:0,shape:'rect'},{x:t,y:d/2,w:.25,h:.7,rot:0,shape:'rect'})}return out}
 const base=partPads({...p,pads:null});
 if(base.length)return base;
 return [{x:-p.w/2+.6,y:0,w:1,h:1,rot:0,shape:'rect'},{x:p.w/2-.6,y:0,w:1,h:1,rot:0,shape:'rect'}];
}

export function makeBoard(){
 const parts=[];
 for(const [refs,type,value,pkg,manufacturer,mpn] of LINES){const [w,d,h,leads,shape]=packageSize(pkg,type);
  for(const ref of expand(refs))parts.push({ref,type,value,mpn,manufacturer,package:pkg,w,d,h,leads,shape,rot:0,side:'top'})}
 for(const p of parts)p.pads=padsFor(p);
 // Shelf packing: connectors first along the top, then the rest left to right in rows.
 const margin=8,gap=1.6;
 const extent=p=>{let x0=-p.w/2,x1=p.w/2,y0=-p.d/2,y1=p.d/2;for(const pd of p.pads){x0=Math.min(x0,pd.x-pd.w/2);x1=Math.max(x1,pd.x+pd.w/2);y0=Math.min(y0,pd.y-pd.h/2);y1=Math.max(y1,pd.y+pd.h/2)}return {x0,x1,y0,y1,w:x1-x0,h:y1-y0}};
 let x=-W/2+margin,y=-H/2+margin,rowH=0;
 for(const p of [...parts.filter(p=>p.type==='connector'),...parts.filter(p=>p.type!=='connector')]){const e=extent(p);
  if(x+e.w>W/2-margin){x=-W/2+margin;y+=rowH+gap;rowH=0}
  p.x=+(x-e.x0).toFixed(3);p.y=+(y-e.y0).toFixed(3);x+=e.w+gap;rowH=Math.max(rowH,e.h)}
 if(y+rowH>H/2-margin)throw Error(`Parts do not fit: the last row ends at ${(y+rowH).toFixed(1)} mm.`);
 return {name:NAME,width:W,height:H,parts};
}

// Gerber attribute values may not contain commas, asterisks or percent signs.
const attr=v=>String(v??'').replace(/[,*%]/g,' ').replace(/\s+/g,' ').trim();
const csv=v=>/[",\n]/.test(String(v))?`"${String(v).replace(/"/g,'""')}"`:String(v);

export function makeFiles(B=makeBoard()){
 // KiCad page coordinates: the board centre at (100+W/2,100+H/2), Y down. Gerber Y is up.
 const OX=100+W/2,OY=100+H/2;const g=([x,y])=>[x+OX,-(y+OY)];
 const f=n=>Math.round(n*1e6).toString();const XY=([x,y])=>`X${f(x)}Y${f(y)}`;
 const header=(fn,polarity='Positive')=>`%TF.GenerationSoftware,KiCad,Pcbnew,7.0.10*%\n%TF.CreationDate,${DATE}T09:00:00+05:30*%\n%TF.ProjectId,${NAME},494f432d313030,1.0*%\n%TF.SameCoordinates,Original*%\n%TF.FileFunction,${fn}*%\n%TF.FilePolarity,${polarity}*%\n%FSLAX46Y46*%\nG04 Gerber Fmt 4.6, Leading zero omitted, Abs format (unit mm)*\n%MOMM*%\n%LPD*%\nG01*\nG04 APERTURE LIST*\n`;
 const pads=[];
 for(const p of B.parts)p.pads.forEach((pad,i)=>pads.push({ref:p.ref,pin:String(i+1),x:p.x+pad.x,y:p.y+pad.y,w:pad.w,h:pad.h,hole:pad.hole||0,round:pad.shape==='circle',part:p}));
 const apKey=pd=>pd.round?`C${pd.w.toFixed(3)}`:`R${pd.w.toFixed(3)}x${pd.h.toFixed(3)}`;
 const vias=[[-60,42],[60,42],[-60,-42],[60,-42],[0,45],[0,-45]];
 const mount=[[-W/2+4,-H/2+4],[W/2-4,-H/2+4],[-W/2+4,H/2-4],[W/2-4,H/2-4]];
 const cmp=p=>[['CMPN',p.mpn],['CVal',p.value],['CFtp',p.package],['CMfr',p.manufacturer]].filter(([,v])=>attr(v)).map(([k,v])=>`%TO.${k},${attr(v)}*%\n`).join('');

 function copper(side){
  const list=side==='top'?pads:pads.filter(pd=>pd.hole);
  const aps=new Map();let next=11;let out=header(side==='top'?'Copper,L1,Top':'Copper,L4,Bot')+'%TA.AperFunction,Conductor*%\n%ADD10C,0.250000*%\n%TD*%\n';
  for(const pd of list){const k=apKey(pd);if(aps.has(k))continue;const code=next++;aps.set(k,code);
   out+=pd.round?`%TA.AperFunction,ComponentPad*%\n%ADD${code}C,${pd.w.toFixed(6)}*%\n%TD*%\n`:`%TA.AperFunction,SMDPad,CuDef*%\n%ADD${code}R,${pd.w.toFixed(6)}X${pd.h.toFixed(6)}*%\n%TD*%\n`}
  out+='%TA.AperFunction,ViaPad*%\n%ADD90C,0.800000*%\n%TD*%\nG04 APERTURE END LIST*\n';
  if(side==='bottom'){// Ground pour with clearances round the through-hole pads.
   out+='%TO.N,GND*%\nG36*\n'+XY(g([-W/2+1.5,-H/2+1.5]))+'D02*\n'+[[W/2-1.5,-H/2+1.5],[W/2-1.5,H/2-1.5],[-W/2+1.5,H/2-1.5],[-W/2+1.5,-H/2+1.5]].map(p=>XY(g(p))+'D01*').join('\n')+'\nG37*\n%TD*%\n%LPC*%\n%ADD91C,2.400000*%\nD91*\n'+list.map(pd=>XY(g([pd.x,pd.y]))+'D03*').join('\n')+'\n%LPD*%\n'}
  else{// Tracks: pin 1 of each passive to the nearest pin of the nearest IC.
   out+='D10*\n';const ic=pads.filter(pd=>/^U\d/.test(pd.ref));
   for(const pd of pads.filter(pd=>/^[RC]\d/.test(pd.ref)&&pd.pin==='1')){let best=null,bd=Infinity;for(const t of ic){const dd=Math.hypot(t.x-pd.x,t.y-pd.y);if(dd<bd){bd=dd;best=t}}
    if(!best||bd>30)continue;out+=`%TO.N,Net-(${pd.ref}-Pad1)*%\n`+XY(g([pd.x,pd.y]))+'D02*\n'+XY(g([pd.x,best.y]))+'D01*\n'+XY(g([best.x,best.y]))+'D01*\n%TD*%\n'}}
  for(const pd of list)out+=`%TO.P,${pd.ref},${pd.pin}*%\n%TO.C,${pd.ref}*%\n${cmp(pd.part)}D${aps.get(apKey(pd))}*\n${XY(g([pd.x,pd.y]))}D03*\n%TD*%\n`;
  out+='D90*\n'+vias.map(p=>'%TO.N,GND*%\n'+XY(g(p))+'D03*\n%TD*%').join('\n')+'\nM02*\n';
  return out;
 }
 function mask(side){const list=side==='top'?pads:pads.filter(pd=>pd.hole);let out=header(side==='top'?'Soldermask,Top':'Soldermask,Bot','Negative');const aps=new Map();let code=10;
  for(const pd of list){const k=apKey(pd);if(!aps.has(k)){aps.set(k,code);out+=pd.round?`%ADD${code}C,${(pd.w+.1).toFixed(6)}*%\n`:`%ADD${code}R,${(pd.w+.1).toFixed(6)}X${(pd.h+.1).toFixed(6)}*%\n`;code++}}
  for(const pd of list)out+=`D${aps.get(apKey(pd))}*\n${XY(g([pd.x,pd.y]))}D03*\n`;return out+'M02*\n'}
 function silk(){let out=header('Legend,Top')+'%ADD10C,0.150000*%\n%ADD11C,0.600000*%\nD10*\n';
  for(const p of B.parts){const hw=p.w/2+.3,hd=p.d/2+.3;const pt=(x,y)=>g([p.x+x,p.y+y]);
   out+=XY(pt(-hw,-hd))+'D02*\n'+[[hw,-hd],[hw,hd],[-hw,hd],[-hw,-hd]].map(([x,y])=>XY(pt(x,y))+'D01*').join('\n')+'\n';
   if(p.type==='chip')out+='D11*\n'+XY(pt(-hw-.6,-hd-.6))+'D03*\nD10*\n'}
  return out+'M02*\n'}
 function edge(){const r=3,x0=-W/2,x1=W/2,y0=-H/2,y1=H/2;let out=header('Profile,NP')+'%TA.AperFunction,Profile*%\n%ADD10C,0.100000*%\n%TD*%\nD10*\nG75*\n';
  const seq=[[[x0+r,y0],'D02'],[[x1-r,y0],'G01'],[[x1,y0+r],'arc',[x1-r,y0+r]],[[x1,y1-r],'G01'],[[x1-r,y1],'arc',[x1-r,y1-r]],[[x0+r,y1],'G01'],[[x0,y1-r],'arc',[x0+r,y1-r]],[[x0,y0+r],'G01'],[[x0+r,y0],'arc',[x0+r,y0+r]]];
  let prev=null;for(const [pt,op,c] of seq){const q=g(pt);if(op==='D02')out+=XY(q)+'D02*\n';else if(op==='G01')out+='G01*\n'+XY(q)+'D01*\n';else{const cc=g(c),pp=g(prev);out+='G02*\n'+XY(q)+`I${f(cc[0]-pp[0])}J${f(cc[1]-pp[1])}D01*\n`}prev=pt}
  return out+'G01*\nM02*\n'}
 function drill(plated){const holes=plated?pads.filter(pd=>pd.hole).map(pd=>({x:pd.x,y:pd.y,d:pd.hole})).concat(vias.map(([x,y])=>({x,y,d:.4}))):mount.map(([x,y])=>({x,y,d:3.2}));
  const tools=[...new Set(holes.map(h=>h.d.toFixed(3)))];let out=`M48\n; DRILL file {KiCad 7.0.10} date ${DATE}T09:00:00+05:30\n; FORMAT={-:-/ absolute / metric / decimal}\n; #@! TF.CreationDate,${DATE}T09:00:00+05:30\n; #@! TF.GenerationSoftware,Kicad,Pcbnew,7.0.10\n; #@! TF.FileFunction,${plated?'Plated,1,4,PTH':'NonPlated,1,4,NPTH'}\nFMAT,2\nMETRIC\n`;
  tools.forEach((d,i)=>{out+=`; #@! TA.AperFunction,${plated?'Plated,PTH,ComponentDrill':'NonPlated,NPTH,ComponentDrill'}\nT${i+1}C${d}\n`});out+='%\nG90\nG05\n';
  tools.forEach((d,i)=>{out+=`T${i+1}\n`;for(const h of holes.filter(h=>h.d.toFixed(3)===d)){const [x,y]=g([h.x,h.y]);out+=`X${x.toFixed(3)}Y${y.toFixed(3)}\n`}});return out+'M30\n'}
 function pos(){let out=`### Footprint positions - created on ${DATE} 09:00:00 ###\n### Printed by KiCad version 7.0.10\n## Unit = mm, Angle = deg.\n## Side : All\n# Ref     Val                  Package                PosX       PosY       Rot  Side\n`;
  for(const p of B.parts){const [x,y]=g([p.x,p.y]);out+=`${p.ref.padEnd(9)} ${String(p.mpn).replace(/\s+/g,'_').padEnd(20)} ${String(p.package).replace(/\s+/g,'_').padEnd(22)} ${x.toFixed(4).padStart(9)} ${y.toFixed(4).padStart(10)} ${p.rot.toFixed(4).padStart(9)}  top\n`}
  return out+'## End\n'}
 const N=NAME;
 return [
  {name:`${N}/${N}-F_Cu.gbr`,data:copper('top')},{name:`${N}/${N}-B_Cu.gbr`,data:copper('bottom')},
  {name:`${N}/${N}-F_Mask.gbr`,data:mask('top')},{name:`${N}/${N}-B_Mask.gbr`,data:mask('bottom')},
  {name:`${N}/${N}-F_Silkscreen.gbr`,data:silk()},{name:`${N}/${N}-Edge_Cuts.gbr`,data:edge()},
  {name:`${N}/${N}-PTH.drl`,data:drill(true)},{name:`${N}/${N}-NPTH.drl`,data:drill(false)},
  {name:`${N}/${N}-all-pos.pos`,data:pos()}];
}

// The BOM on its own: one row per part number with every designator that uses it.
export function makeBom(B=makeBoard()){
 const rows=new Map();for(const p of B.parts){const r=rows.get(p.mpn)||{refs:[],p};r.refs.push(p.ref);rows.set(p.mpn,r)}
 return 'Designator,Quantity,Value,Footprint,Manufacturer,Manufacturer Part Number\n'+[...rows.values()].map(({refs,p})=>[refs.join(' '),refs.length,p.value,p.package,p.manufacturer,p.mpn].map(csv).join(',')).join('\n')+'\n';
}

if(import.meta.url===`file://${process.argv[1]}`){
 const board=makeBoard();if(board.parts.length!==100)throw Error(`Expected 100 parts, made ${board.parts.length}`);
 const files=makeFiles(board),zip=zipStored(files);
 mkdirSync(new URL('../public/samples/',import.meta.url),{recursive:true});
 writeFileSync(new URL('../public/samples/IOC-100-gerber.zip',import.meta.url),zip);
 writeFileSync(new URL('../public/samples/IOC-100-BOM.csv',import.meta.url),makeBom(board));
 console.log(`Wrote public/samples/IOC-100-gerber.zip (${files.length} files, ${zip.length} bytes) and IOC-100-BOM.csv: ${board.parts.length} parts, ${new Set(board.parts.map(p=>p.mpn)).size} part numbers`);
}
