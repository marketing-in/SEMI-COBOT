// Generates public/samples/sample-gerber.zip: the CTRL-01 reference board as a KiCad 7 style Gerber X2
// fabrication set (copper, mask, silkscreen, edge cuts, PTH/NPTH Excellon drills and a .pos placement
// file). Pads carry %TO.P/%TO.C attributes, so the importer can rebuild every component from them.
// Run: node scripts/make-gerber-sample.mjs
import {writeFileSync,mkdirSync} from 'node:fs';
import {referenceBoard} from '../src/data.js';
import {partPads} from '../src/blueprint.js';
import {zipStored} from '../src/unzip.js';

export function makeGerberSample(){
 const B=referenceBoard,W=B.width,H=B.height;
 // KiCad page coordinates: the board sits at (100,100) mm, Y down. Gerber Y is up, so y_g = -y_page.
 const OX=100+W/2,OY=100+H/2;const g=([x,y])=>[x+OX,-(y+OY)];
 const f=n=>Math.round(n*1e6).toString();const XY=([x,y])=>`X${f(x)}Y${f(y)}`;
 const header=(fn,polarity='Positive')=>`%TF.GenerationSoftware,KiCad,Pcbnew,7.0.10*%\n%TF.CreationDate,2026-10-28T09:00:00+05:30*%\n%TF.ProjectId,CTRL-01,4354524c2d3031,2.4*%\n%TF.SameCoordinates,Original*%\n%TF.FileFunction,${fn}*%\n%TF.FilePolarity,${polarity}*%\n%FSLAX46Y46*%\nG04 Gerber Fmt 4.6, Leading zero omitted, Abs format (unit mm)*\n%MOMM*%\n%LPD*%\nG01*\nG04 APERTURE LIST*\n`;
 const roundRectMacro='%AMRoundRect*\n0 Rectangle with rounded corners*\n0 $1 Rounding radius*\n0 $2 $3 $4 $5 $6 $7 $8 $9 X,Y pos of 4 corners*\n0 Add a 4 corners polygon primitive as box body*\n4,1,4,$2,$3,$4,$5,$6,$7,$8,$9,$2,$3,0*\n0 Add four circle primitives for the rounded corners*\n1,1,$1+$1,$2,$3*\n1,1,$1+$1,$4,$5*\n1,1,$1+$1,$6,$7*\n1,1,$1+$1,$8,$9*\n0 Add four rect primitives between the rounded corners*\n20,1,$1+$1,$2,$3,$4,$5,0*\n20,1,$1+$1,$4,$5,$6,$7,0*\n20,1,$1+$1,$6,$7,$8,$9,0*\n20,1,$1+$1,$8,$9,$2,$3,0*%\n';
 // Absolute pad list (page coordinates) for every part.
 const pads=[];
 for(const p of B.parts){const a=p.rot*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  partPads(p).forEach((pad,i)=>{const bx=p.x+pad.x*c+pad.y*s,by=p.y-pad.x*s+pad.y*c;const swap=Math.abs(Math.sin(((pad.rot||0)+p.rot)*Math.PI/180))>.5;
   pads.push({ref:p.ref,pin:String(i+1),x:bx,y:by,w:swap?pad.h:pad.w,h:swap?pad.w:pad.h,hole:pad.hole||0,round:pad.shape==='circle',part:p})})}
 const apKey=pd=>pd.round?`C${pd.w.toFixed(3)}`:`R${pd.w.toFixed(3)}x${pd.h.toFixed(3)}`;
 function copper(side){
  const list=pads.filter(pd=>side==='top'?(pd.part.side!=='bottom'||pd.hole):(pd.part.side==='bottom'||pd.hole));
  const aps=new Map();let next=10;let out=header(side==='top'?'Copper,L1,Top':'Copper,L4,Bot')+roundRectMacro;
  out+='G04 Aperture macros list end*\n%TA.AperFunction,Conductor*%\n%ADD10C,0.250000*%\n%TD*%\n';next=11;
  for(const pd of list){const k=apKey(pd);if(aps.has(k))continue;const code=next++;aps.set(k,code);
   if(pd.round)out+=`%TA.AperFunction,ComponentPad*%\n%ADD${code}C,${pd.w.toFixed(6)}*%\n%TD*%\n`;
   else{const r=Math.min(pd.w,pd.h)*.25,hx=pd.w/2-r,hy=pd.h/2-r;out+=`%TA.AperFunction,SMDPad,CuDef*%\n%ADD${code}RoundRect,${r.toFixed(6)}X${(-hx).toFixed(6)}X${(-hy).toFixed(6)}X${hx.toFixed(6)}X${(-hy).toFixed(6)}X${hx.toFixed(6)}X${hy.toFixed(6)}X${(-hx).toFixed(6)}X${hy.toFixed(6)}X0*%\n%TD*%\n`}}
  out+='%TA.AperFunction,ViaPad*%\n%ADD90C,0.800000*%\n%TD*%\nG04 APERTURE END LIST*\n';
  if(side==='bottom'){
   // Ground pour on the bottom with clearances around every through-hole pad (clear polarity).
   out+='%TO.N,GND*%\nG36*\n'+XY(g([-W/2+1.5,-H/2+1.5]))+'D02*\n'+[[W/2-1.5,-H/2+1.5],[W/2-1.5,H/2-1.5],[-W/2+1.5,H/2-1.5],[-W/2+1.5,-H/2+1.5]].map(p=>XY(g(p))+'D01*').join('\n')+'\nG37*\n%TD*%\n%LPC*%\n%ADD91C,2.400000*%\n';
   out+='D91*\n'+list.filter(pd=>pd.hole).map(pd=>XY(g([pd.x,pd.y]))+'D03*').join('\n')+'\n%LPD*%\n';
  }
  // Tracks: each passive's first pad to the controller, with one arc for good measure.
  if(side==='top'){out+='D10*\n';const u1=pads.filter(pd=>pd.ref==='U1');
   pads.filter(pd=>/^[RC]\d/.test(pd.ref)&&pd.pin==='1').forEach((pd,i)=>{const t=u1[i*4%u1.length];out+=`%TO.N,Net-(${pd.ref}-Pad1)*%\n`+XY(g([pd.x,pd.y]))+'D02*\n'+XY(g([pd.x,(pd.y+t.y)/2]))+'D01*\n'+XY(g([t.x,(pd.y+t.y)/2]))+'D01*\n'+XY(g([t.x,t.y]))+'D01*\n%TD*%\n'});
   const d1=pads.find(pd=>pd.ref==='D1'),u2=pads.find(pd=>pd.ref==='U2');const s=g([d1.x,d1.y]),e=g([u2.x,u2.y]);const mid=[(s[0]+e[0])/2,(s[1]+e[1])/2];
   out+='%TO.N,+3V3*%\n'+XY(s)+'D02*\nG75*\nG03*\n'+XY(e)+`I${f(mid[0]-s[0])}J${f(mid[1]-s[1])}D01*\nG01*\n%TD*%\n`;
  }
  for(const pd of list){out+=`%TO.P,${pd.ref},${pd.pin}*%\n%TO.C,${pd.ref}*%\nD${aps.get(apKey(pd))}*\n${XY(g([pd.x,pd.y]))}D03*\n%TD*%\n`}
  out+='D90*\n'+[[-24,18],[24,18],[-20,-18],[14,-18]].map(p=>'%TO.N,GND*%\n'+XY(g(p))+'D03*\n%TD*%').join('\n')+'\nM02*\n';
  return out;
 }
 function mask(side){const list=pads.filter(pd=>side==='top'?(pd.part.side!=='bottom'||pd.hole):(pd.part.side==='bottom'||pd.hole));let out=header(side==='top'?'Soldermask,Top':'Soldermask,Bot','Negative');const aps=new Map();let code=10;
  for(const pd of list){const k=apKey(pd);if(!aps.has(k)){aps.set(k,code);out+=pd.round?`%ADD${code}C,${(pd.w+.1).toFixed(6)}*%\n`:`%ADD${code}R,${(pd.w+.1).toFixed(6)}X${(pd.h+.1).toFixed(6)}*%\n`;code++}}
  for(const pd of list)out+=`D${aps.get(apKey(pd))}*\n${XY(g([pd.x,pd.y]))}D03*\n`;return out+'M02*\n'}
 function silk(){let out=header('Legend,Top')+'%ADD10C,0.150000*%\n%ADD11C,0.600000*%\nD10*\n';
  for(const p of B.parts.filter(p=>p.side!=='bottom')){const hw=p.w/2+.3,hd=p.d/2+.3;const a=p.rot*Math.PI/180,c=Math.cos(a),s=Math.sin(a);const pt=(x,y)=>g([p.x+x*c+y*s,p.y-x*s+y*c]);
   out+=XY(pt(-hw,-hd))+'D02*\n'+[[hw,-hd],[hw,hd],[-hw,hd],[-hw,-hd]].map(([x,y])=>XY(pt(x,y))+'D01*').join('\n')+'\n';
   if(p.type==='chip')out+='D11*\n'+XY(pt(-hw-.6,-hd-.6))+'D03*\nD10*\n'}
  return out+'M02*\n'}
 function edge(){const r=3,x0=-W/2,x1=W/2,y0=-H/2,y1=H/2;let out=header('Profile,NP')+'%TA.AperFunction,Profile*%\n%ADD10C,0.100000*%\n%TD*%\nD10*\nG75*\n';
  // Rounded rectangle: straight edges with quarter arcs (G03, counter-clockwise in Gerber's Y-up frame).
  const seq=[[[x0+r,y0],'D02'],[[x1-r,y0],'G01'],[[x1,y0+r],'arc',[x1-r,y0+r]],[[x1,y1-r],'G01'],[[x1-r,y1],'arc',[x1-r,y1-r]],[[x0+r,y1],'G01'],[[x0,y1-r],'arc',[x0+r,y1-r]],[[x0,y0+r],'G01'],[[x0+r,y0],'arc',[x0+r,y0+r]]];
  let prev=null;for(const [pt,op,c] of seq){const q=g(pt);if(op==='D02')out+=XY(q)+'D02*\n';else if(op==='G01')out+='G01*\n'+XY(q)+'D01*\n';else{const cc=g(c),pp=g(prev);out+='G02*\n'+XY(q)+`I${f(cc[0]-pp[0])}J${f(cc[1]-pp[1])}D01*\n`}prev=pt}
  return out+'G01*\nM02*\n'}
 function drill(plated){const holes=plated?pads.filter(pd=>pd.hole).map(pd=>({x:pd.x,y:pd.y,d:pd.hole})).concat([[-24,18],[24,18],[-20,-18],[14,-18]].map(([x,y])=>({x,y,d:.4}))):[[-46,-30],[46,-30],[-46,30],[46,30]].map(([x,y])=>({x,y,d:3.2}));
  const tools=[...new Set(holes.map(h=>h.d.toFixed(3)))];let out=`M48\n; DRILL file {KiCad 7.0.10} date 2026-10-28T09:00:00+05:30\n; FORMAT={-:-/ absolute / metric / decimal}\n; #@! TF.CreationDate,2026-10-28T09:00:00+05:30\n; #@! TF.GenerationSoftware,Kicad,Pcbnew,7.0.10\n; #@! TF.FileFunction,${plated?'Plated,1,4,PTH':'NonPlated,1,4,NPTH'}\nFMAT,2\nMETRIC\n`;
  tools.forEach((d,i)=>{out+=`; #@! TA.AperFunction,${plated?'Plated,PTH,ComponentDrill':'NonPlated,NPTH,ComponentDrill'}\nT${i+1}C${d}\n`});out+='%\nG90\nG05\n';
  tools.forEach((d,i)=>{out+=`T${i+1}\n`;for(const h of holes.filter(h=>h.d.toFixed(3)===d)){const [x,y]=g([h.x,h.y]);out+=`X${x.toFixed(3)}Y${y.toFixed(3)}\n`}});return out+'M30\n'}
 function pos(){let out='### Footprint positions - created on 2026-10-28 09:00:00 ###\n### Printed by KiCad version 7.0.10\n## Unit = mm, Angle = deg.\n## Side : All\n# Ref     Val                  Package                PosX       PosY       Rot  Side\n';
  for(const p of B.parts){const [x,y]=g([p.x,p.y]);out+=`${p.ref.padEnd(9)} ${String(p.value).padEnd(20)} ${String(p.package).replace(/\s+/g,'_').padEnd(22)} ${x.toFixed(4).padStart(9)} ${y.toFixed(4).padStart(10)} ${p.rot.toFixed(4).padStart(9)}  ${p.side==='bottom'?'bottom':'top'}\n`}
  return out+'## End\n'}
 return [
  {name:'CTRL-01/CTRL-01-F_Cu.gbr',data:copper('top')},{name:'CTRL-01/CTRL-01-B_Cu.gbr',data:copper('bottom')},
  {name:'CTRL-01/CTRL-01-F_Mask.gbr',data:mask('top')},{name:'CTRL-01/CTRL-01-B_Mask.gbr',data:mask('bottom')},
  {name:'CTRL-01/CTRL-01-F_Silkscreen.gbr',data:silk()},{name:'CTRL-01/CTRL-01-Edge_Cuts.gbr',data:edge()},
  {name:'CTRL-01/CTRL-01-PTH.drl',data:drill(true)},{name:'CTRL-01/CTRL-01-NPTH.drl',data:drill(false)},
  {name:'CTRL-01/CTRL-01-all-pos.pos',data:pos()}];
}

if(import.meta.url===`file://${process.argv[1]}`){
 const files=makeGerberSample();mkdirSync(new URL('../public/samples/',import.meta.url),{recursive:true});
 const zip=zipStored(files);writeFileSync(new URL('../public/samples/sample-gerber.zip',import.meta.url),zip);
 console.log(`Wrote public/samples/sample-gerber.zip (${files.length} files, ${zip.length} bytes)`);
}
