import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evalExpr,parseGerber,parseExcellon,identifyLayer,chainOutline,componentFromPads,buildGerberBoard} from '../src/gerber.js';
import {unzip,zipStored,isZip,crc32} from '../src/unzip.js';
import {makeGerberSample} from '../scripts/make-gerber-sample.mjs';
import {referenceBoard} from '../src/data.js';

const near=(a,b,eps=1e-6)=>Math.abs(a-b)<eps;
const head='%FSLAX46Y46*%\n%MOMM*%\n%LPD*%\n';

test('aperture macro arithmetic without eval',()=>{
 assert.equal(evalExpr('$1+$1',[0,.25]),.5);assert.equal(evalExpr('1.08239X$1',[0,2]),2.16478);
 assert.equal(evalExpr('-($2-$1)/2',[0,1,5]),-2);assert.equal(evalExpr('2x(3+4)',[]),14);assert.equal(evalExpr('$9',[0]),0);
});

test('Gerber coordinates, units, zero suppression, arcs and regions',()=>{
 const inch=parseGerber('%FSLAX24Y24*%\n%MOIN*%\n%ADD10C,0.0100*%\nD10*\nX0Y0D02*\nX10000Y0D01*\nM02*','a.gtl');
 assert.equal(inch.objects.length,1);assert.ok(near(inch.objects[0].pts[1][0],25.4),'1.0000 in with leading zeros omitted is 25.4 mm');assert.ok(near(inch.objects[0].w,.254));
 const trailing=parseGerber('%FSTAX24Y24*%\n%MOIN*%\n%ADD10C,0.01*%\nD10*\nX0Y0D02*\nX1Y0D01*\nM02*','t.gtl');assert.ok(near(trailing.objects[0].pts[1][0],254),'trailing zeros omitted: X1 pads to 100000, which is 10.0000 in');
 // Full circle with G75 multi-quadrant arc.
 const circle=parseGerber(head+'%ADD10C,0.1*%\nD10*\nX5000000Y0D02*\nG75*\nG03*\nX5000000Y0I-5000000J0D01*\nM02*','c.gbr');
 const pts=circle.objects[0].pts;assert.ok(pts.length>30);for(const [x,y] of pts)assert.ok(near(Math.hypot(x,y),5,1e-6));
 // Quarter arc ends exactly at the target and turns counter-clockwise.
 const q=parseGerber(head+'%ADD10C,0.1*%\nD10*\nX1000000Y0D02*\nG75*\nG03*\nX0Y1000000I-1000000J0D01*\nM02*','q.gbr').objects[0].pts;
 assert.deepEqual(q.at(-1),[0,1]);assert.ok(q.every(([x,y])=>x>=-1e-9&&y>=-1e-9),'stays in the first quadrant');
 // Region contour and clear polarity.
 const reg=parseGerber(head+'G36*\nX0Y0D02*\nX2000000Y0D01*\nX2000000Y2000000D01*\nX0Y2000000D01*\nX0Y0D01*\nG37*\n%LPC*%\n%ADD11C,0.5*%\nD11*\nX1000000Y1000000D03*\nM02*','r.gbr');
 assert.equal(reg.objects[0].k,'poly');assert.ok(reg.objects[0].region);assert.equal(reg.objects[1].pol,'C');
});

test('standard and macro apertures, attributes and step-repeat',()=>{
 const g=parseGerber(head+'%AMRoundRect*\n0 comment, with comma*\n4,1,4,$2,$3,$4,$5,$6,$7,$8,$9,$2,$3,0*\n1,1,$1+$1,$2,$3*\n%\n%TA.AperFunction,SMDPad,CuDef*%\n%ADD10RoundRect,0.25X-0.5X-0.3X0.5X-0.3X0.5X0.3X-0.5X0.3X0*%\n%TD*%\n%ADD11R,2X1*%\n%ADD12O,2X1*%\n%ADD13P,1X6X0*%\n%TO.P,U7,3*%\n%TO.C,U7*%\nD10*\nX1000000Y2000000D03*\n%TD*%\nD11*\n%SRX3Y1I5J0*%\nX0Y0D03*\n%SR*%\nD12*\nX0Y10000000D03*\nD13*\nX0Y20000000D03*\nM02*','f.gbr');
 const f=g.flashes[0];assert.deepEqual(f.attrs.P,['U7','3']);assert.deepEqual(f.attrs.C,['U7']);assert.equal(f.af,'SMDPad,CuDef'.split(',')[0]+',CuDef');
 const poly=f.shape.find(s=>s.k==='poly');assert.deepEqual(poly.pts[0],[.5,1.7]);
 assert.equal(g.flashes[1].attrs.P,undefined,'%TD% clears object attributes');
 assert.deepEqual(g.flashes.filter(x=>x.aper==='D11').map(x=>x.x),[0,5,10],'step and repeat copies the block');
 const ob=g.flashes.find(x=>x.aper==='D12').shape[0].pts;assert.ok(near(Math.max(...ob.map(p=>p[0])),1)&&near(Math.max(...ob.map(p=>p[1]))-10,.5));
 assert.equal(g.flashes.find(x=>x.aper==='D13').shape[0].pts.length,6);
 assert.ok(!g.warnings.length,g.warnings.join());
});

test('Excellon: Eagle inch trailing-zero files and KiCad metric decimals',()=>{
 const eagle=parseExcellon('%\nM48\nM72\n;FILE_FORMAT=2:4\nINCH,TZ\nT01C0.0240\nT02C0.1260\n%\nT01\nX16910Y10810\nX20250Y2210\nT02\nY5000\nM30','board.drd');
 assert.equal(eagle.hits.length,3);assert.ok(near(eagle.hits[0].x,1.691*25.4));assert.ok(near(eagle.hits[1].y,.221*25.4));assert.ok(near(eagle.hits[0].d,.024*25.4));
 assert.ok(near(eagle.hits[2].x,2.025*25.4),'modal X carries over');assert.ok(near(eagle.hits[2].d,3.2004));
 const kicad=parseExcellon('M48\n; #@! TF.FileFunction,NonPlated,1,2,NPTH\nFMAT,2\nMETRIC\nT1C3.200\n%\nG90\nG05\nT1\nX104.0Y-70.5\nX10.0Y-5.25G85X12.0Y-5.25\nM30','b-NPTH.drl');
 assert.equal(kicad.plated,false);assert.deepEqual([kicad.hits[0].x,kicad.hits[0].y,kicad.hits[0].d],[104,-70.5,3.2]);assert.equal(kicad.slots.length,1);assert.ok(!kicad.warnings.length,'G05 drill mode is not a routed path');
});

test('layers are identified from KiCad, Altium, Eagle names and X2 file functions',()=>{
 const g='%FSLAX46Y46*%%MOMM*%';
 const cases={'board-F_Cu.gbr':'copper:top','board-B_Cu.gbr':'copper:bottom','board-In1_Cu.gbr':'copper:inner','board-F_Mask.gbr':'mask:top','board-B_Silkscreen.gbr':'silk:bottom','board-Edge_Cuts.gbr':'outline:all',
  'proj.GTL':'copper:top','proj.GBO':'silk:bottom','proj.GKO':'outline:all','proj.GM1':'outline:all','proj.G2':'copper:inner','arduino.cmp':'copper:top','arduino.sts':'mask:bottom','arduino.plc':'silk:top','x.pho':'unknown:all'};
 for(const [name,want] of Object.entries(cases)){const id=identifyLayer(name,g);assert.equal(id.kind+':'+id.side,want,name)}
 assert.equal(identifyLayer('weird.gbr','%TF.FileFunction,Soldermask,Bot*%\n'+g).kind,'mask');assert.equal(identifyLayer('weird.gbr','%TF.FileFunction,Copper,L1,Top*%\n'+g).side,'top');
 assert.equal(identifyLayer('x.txt','M48\nMETRIC\nT1C0.3').kind,'drill');assert.equal(identifyLayer('board-NPTH.drl','M48\n').plated,false);
 assert.equal(identifyLayer('board-all-pos.pos','# Ref Val Package PosX PosY Rot Side').kind,'pnp');assert.equal(identifyLayer('PickAndPlace_PCB.csv','Designator,Mid X,Mid Y').kind,'pnp');
});

test('outline chaining closes loops across small gaps and reversed segments',()=>{
 const loops=chainOutline([[[0,0],[10,0]],[[10,10],[10,0.03]],[[10,10],[0,10]],[[0,10],[0,0]],[[4,4],[6,4]],[[6,4],[6,6]],[[6,6],[4,6]],[[4,6],[4,4]]]);
 assert.equal(loops.length,2);assert.equal(loops[0].length,4,'largest loop first');assert.equal(loops[1].length,4);
});

test('component bodies from pads: passives, ICs and a placement rotation',()=>{
 const pad=(x,y,w,h)=>({x,y,outline:[[x-w/2,y-h/2],[x+w/2,y-h/2],[x+w/2,y+h/2],[x-w/2,y+h/2]]});
 const r=componentFromPads('R1',[pad(-.8,0,.9,1),pad(.8,0,.9,1)]);assert.equal(r.rot,0);assert.ok(near(r.w,1.78,1e-9)&&near(r.d,.85,1e-9));
 const v=componentFromPads('C1',[pad(5,-.8,1,.9),pad(5,.8,1,.9)]);assert.equal(v.rot,90);assert.ok(v.w>v.d,'body runs along the pads');assert.ok(near(v.x,5)&&near(v.y,0));
 const soic=[];for(let i=0;i<4;i++){soic.push(pad(-2.7,-1.905+i*1.27,1.5,.6),pad(2.7,-1.905+i*1.27,1.5,.6))}
 const u=componentFromPads('U1',soic);assert.equal(u.rot,0);assert.ok(near(u.w,4.05,1e-9),'across the rows: span minus pad length');assert.ok(u.d>3.81&&u.d<5,'along the rows: span plus a pitch share');
 const fromPnp=componentFromPads('C2',[pad(-.8,0,.9,1),pad(.8,0,.9,1)],{rot:180,center:[.1,0]});assert.equal(fromPnp.rot,180);assert.ok(near(fromPnp.x,.1));assert.ok(fromPnp.w>fromPnp.d);
});

test('the sample Gerber set rebuilds the reference board exactly',async()=>{
 const zip=zipStored(makeGerberSample());assert.ok(isZip(zip));
 const files=(await unzip(zip)).map(f=>({name:f.name.split('/').pop(),text:new TextDecoder().decode(f.bytes)}));assert.equal(files.length,9);
 const r=buildGerberBoard(files,{name:'sample-gerber.zip'});
 assert.equal(r.board.width,100);assert.equal(r.board.height,67);assert.equal(r.board.parts.length,referenceBoard.parts.length);assert.equal(r.summary.attributed,19);assert.equal(r.summary.pnpAligned,'pads');
 assert.equal(r.board.holes.length,4,'four 3.2 mm mounting holes are cut through');assert.ok(r.board.outline.length>40,'rounded corners come from the arcs');
 for(const p of r.board.parts){const ref=referenceBoard.parts.find(q=>q.ref===p.ref);assert.ok(near(p.x,ref.x,1e-3)&&near(p.y,ref.y,1e-3),`${p.ref} at ${p.x},${p.y}`);assert.equal(p.value,ref.value);assert.ok(p.pads?.length>0)}
 const u1=r.board.parts.find(p=>p.ref==='U1');assert.ok(near(u1.w,20,.1)&&near(u1.d,20,.1));assert.equal(r.board.parts.find(p=>p.ref==='J1').leads,'tht');
 assert.deepEqual(r.summary.drills.map(d=>[d.hits,d.plated]),[[10,true],[4,false]]);assert.ok(!r.warnings.length,r.warnings.join(' | '));
 const keys=Object.keys(r.layers).sort();assert.deepEqual(keys,['copper:bottom','copper:top','mask:bottom','mask:top','outline:all','silk:top']);
 assert.ok(r.layers['copper:bottom'].objects.some(o=>o.pol==='C'),'ground pour clearances are clear polarity');
 // Without pad attributes and without a placement file there are no components, and a clear note says why.
 const bare=files.filter(f=>!/\.pos$/.test(f.name)).map(f=>({...f,text:f.text.replace(/%TO\.[PC],[^%]*%\n/g,'')}));
 // Without pad attributes or a placement file, components are inferred from mask openings, drills and silkscreen.
 const b=buildGerberBoard(bare);assert.equal(b.summary.inferred,19);assert.match(b.warnings.at(-1),/19 components were inferred from the pads, drills and silkscreen/);
 for(const ref of referenceBoard.parts){const best=Math.min(...b.board.parts.map(p=>Math.hypot(p.x-ref.x,p.y-ref.y)));assert.ok(best<(ref.ref==='J1'?5.1:.01),`${ref.ref} found within ${best.toFixed(3)} mm`)}
 assert.ok(b.board.parts.every(p=>p.inferred&&!p.mpn));const qfp=b.board.parts.find(p=>Math.hypot(p.x,p.y)<.01);assert.match(qfp.package,/^QFP-64/);assert.ok(Math.abs(qfp.w-20)<.2);
 assert.equal(b.board.parts.filter(p=>p.passive).length,14,'two-pad parts are passives');assert.match(b.board.parts.find(p=>p.type==='connector').package,/^Header 1x6/);
 // A placement file with another origin is centred and flagged.
 const pos=files.find(f=>/\.pos$/.test(f.name)).text.replace(/(\s)(-?\d+\.\d+)(\s+)(-?\d+\.\d+)(\s+[\d.]+\s+(top|bottom))/g,(m,a,x,b2,y,rest)=>`${a}${(+x+500).toFixed(4)}${b2}${y}${rest}`);
 const shifted=buildGerberBoard([...bare.filter(f=>!/\.pos$/.test(f.name)),{name:'p.pos',text:pos}]);assert.equal(shifted.board.parts.length,19);assert.match(shifted.warnings.join(' '),/centred on the board/);
 assert.throws(()=>buildGerberBoard([{name:'readme.txt',text:'hello'}]),/No Gerber copper or outline layer/);
});

test('ZIP reading handles deflate entries and rejects damaged archives',async()=>{
 // A deflated entry built with the platform compressor.
 const raw=new TextEncoder().encode('%FSLAX46Y46*%\n%MOMM*%\nM02*\n'.repeat(50));
 const deflated=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
 const stored=zipStored([{name:'x.gbr',data:deflated}]);const v=new DataView(stored.buffer);
 v.setUint16(8,8,true);v.setUint32(14,crc32(raw),true);v.setUint32(22,raw.length,true);
 const cd=stored.length-22-46-5;v.setUint16(cd+10,8,true);v.setUint32(cd+24,raw.length,true);
 const [entry]=await unzip(stored);assert.equal(new TextDecoder().decode(entry.bytes),new TextDecoder().decode(raw));
 await assert.rejects(()=>unzip(new Uint8Array([80,75,3,4,0,0,0])),/damaged/);
 assert.equal(isZip(new TextEncoder().encode('%FSLA')),false);
 const fixture=await readFile(new URL('../public/samples/sample-gerber.zip',import.meta.url));assert.equal((await unzip(fixture)).length,9);
});
