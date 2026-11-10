import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseKicadPcb,parsePlacementText,parsePlacementTable,parseBlueprint,packageSize,inferType,partPads,makePart} from '../src/blueprint.js';

const kicad=readFileSync(new URL('../public/samples/sample-board.kicad_pcb',import.meta.url),'utf8');
const csv=readFileSync(new URL('../public/samples/sample-placement.csv',import.meta.url),'utf8');

test('KiCad board: title, outline, copper, pads and rotated positions',()=>{
 const b=parseKicadPcb(kicad,'sample-board.kicad_pcb');
 assert.equal(b.name,'Sensor hub');assert.equal(b.revision,'Rev 1.2');assert.equal(b.source,'KiCad PCB');assert.equal(b.layers,2);
 assert.equal(b.width,70);assert.equal(b.height,45);assert.ok(b.outline.length>8,'arc outline is approximated');assert.equal(b.holes.length,1);
 assert.equal(b.traces.top.length,5);assert.ok(b.traces.bottom.length>2,'arc tracks become segments');
 const u1=b.parts.find(p=>p.ref==='U1');assert.equal(u1.type,'chip');assert.equal(u1.mpn,'STM32F103C8T6');assert.deepEqual([u1.x,u1.y],[0,-2.5]);assert.equal(u1.w,7);assert.equal(u1.pads.length,7);
 const d1=b.parts.find(p=>p.ref==='D1');assert.equal(d1.type,'diode');assert.equal(d1.rot,90);assert.deepEqual([d1.x,d1.y],[-25,-15.5]);assert.equal(d1.pads[0].rot,0,'pad rotation is stored relative to the footprint');
 const r1=b.parts.find(p=>p.ref==='R1');assert.equal(r1.side,'bottom');
 const j1=b.parts.find(p=>p.ref==='J1');assert.equal(j1.type,'connector');assert.deepEqual([j1.x,j1.y],[25.81,-19.5],'body centre follows the rotated fab outline');assert.equal(j1.pads[0].hole,1);
});
test('KiCad parser rejects other files and boards without footprints',()=>{
 assert.throws(()=>parseKicadPcb('(kicad_sch (version 1))'),/not a KiCad PCB/);
 assert.throws(()=>parseKicadPcb('(kicad_pcb (version 1) (gr_line (start 0 0) (end 10 0) (layer "Edge.Cuts")))'),/No placed footprints/);
 assert.throws(()=>parseBlueprint('hello world','notes.txt'),/No placement header/);
});
test('Pick-and-place CSV: header detection, Y flip, centring and package inference',()=>{
 const b=parsePlacementText(csv,'sample-placement.csv');
 assert.equal(b.source,'Pick-and-place file');assert.equal(b.parts.length,22);assert.ok(b.width>90&&b.width<110);
 const u1=b.parts.find(p=>p.ref==='U1');assert.equal(u1.type,'chip');assert.equal(u1.w,14);assert.equal(u1.leads,'quad');
 const d1=b.parts.find(p=>p.ref==='D1'),c1=b.parts.find(p=>p.ref==='C1');
 assert.ok(c1.y>d1.y,'rows with smaller PosY end up lower on the board (Y flipped)');
 assert.equal(b.parts.find(p=>p.ref==='LED1').type,'led');assert.equal(b.parts.find(p=>p.ref==='SW1').type,'switch');
 assert.ok(partPads(u1).length>=40,'synthetic pads for a QFP');assert.equal(partPads(d1).length,2);
});
test('KiCad ASCII .pos, JLCPCB CPL and mil units are understood',()=>{
 const pos=parsePlacementText('### Module positions\n## Unit = mm, Angle = deg.\n# Ref  Val  Package  PosX  PosY  Rot  Side\nU1 "STM32 F4" LQFP-100 12.7 -8 90 top\nC1 100nF C_0603_1608Metric 20 -4 0 bottom\n','top.pos');
 assert.deepEqual(pos.parts.map(p=>[p.ref,p.value,p.rot,p.side]),[['U1','STM32 F4',90,'top'],['C1','100nF',0,'bottom']]);
 const jl=parsePlacementText('Designator,Mid X,Mid Y,Layer,Rotation\nR1,10.5mm,20.1mm,Top,90\nC1,15mm,20.1mm,Bottom,0\n','cpl.csv');
 assert.equal(jl.parts[1].side,'bottom');assert.equal(jl.parts[1].x-jl.parts[0].x,4.5);
 const mil=parsePlacementTable([['RefDes','X (mil)','Y (mil)','Rotation','Footprint'],['R1','1000','0','0','0603'],['R2','2000','0','0','0603']],'altium.xlsx');
 assert.equal(mil.source,'Excel placement');assert.equal(Math.round((mil.parts[1].x-mil.parts[0].x)*100)/100,25.4);
 assert.throws(()=>parsePlacementTable([['Ref','Notes'],['R1','x']]),/No placement header/);
});
test('Excel cell objects and explicit body sizes are honoured',()=>{
 const b=parsePlacementTable([['Ref',{richText:[{text:'Part number'}]},'Package','X (mm)','Y (mm)','Rotation','Side','Width','Length','Height'],['M1',{text:'ESP32-WROOM-32'},'Module',10,10,0,'top',18,25.5,3.1]],'sheet.xlsx');
 const m=b.parts[0];assert.equal(m.mpn,'ESP32-WROOM-32');assert.deepEqual([m.w,m.d,m.h],[18,25.5,3.1]);
});
test('package sizes follow JEDEC names and KiCad footprint names',()=>{
 assert.deepEqual(packageSize('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm','chip').slice(0,2),[3.9,4.9]);
 assert.deepEqual(packageSize('SOIC-16','chip').slice(0,2),[3.9,9.99]);
 assert.deepEqual(packageSize('Resistor_SMD:R_0603_1608Metric','resistor').slice(0,2),[1.6,.8]);
 assert.deepEqual(packageSize('Diode_SMD:D_SMA','diode').slice(0,2),[4.3,2.6]);
 assert.equal(packageSize('Package_QFP:LQFP-100_14x14mm_P0.5mm','chip')[3],'quad');
 assert.equal(packageSize('PinHeader_1x04_P2.54mm_Vertical','connector')[0],10.16);
 assert.equal(packageSize('Capacitor_THT:CP_Radial_D6.3mm_P2.50mm','capacitor')[4],'cyl');
 assert.equal(packageSize('QFN-32-1EP_5x5mm','chip')[0],5);
 assert.deepEqual(packageSize('','diode').slice(0,2),[2.7,1.6],'type default when the package is unknown');
});
test('component families come from the reference designator first',()=>{
 assert.equal(inferType('U7','SOT-23'),'chip');assert.equal(inferType('Q2','SOT-23'),'transistor');assert.equal(inferType('D3','SOD-123'),'diode');
 assert.equal(inferType('LED2','0603'),'led');assert.equal(inferType('J1','USB_C_Receptacle'),'connector');assert.equal(inferType('Y1','3225'),'crystal');
 assert.equal(inferType('C12',''),'capacitor');assert.equal(inferType('R1',''),'resistor');assert.equal(inferType('SW1','SW_Push'),'switch');assert.equal(inferType('ZZ9',''),'other');
});
test('makePart sanitises text, normalises rotation and keeps parts pickable',()=>{
 const p=makePart({ref:' D1\u0000 ',value:'x'.repeat(200),package:'SOD-123',x:1.23456,y:-2,rot:-90});
 assert.equal(p.ref,'D1');assert.equal(p.value.length,120);assert.equal(p.rot,270);assert.equal(p.x,1.235);assert.ok(p.w>=.3&&p.h>=.15);
});
