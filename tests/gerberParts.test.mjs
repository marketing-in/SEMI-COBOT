import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unzip} from '../src/unzip.js';
import {buildGerberBoard,identifyLayer} from '../src/gerber.js';
import {parseBomText,expandRefs,looksLikeBom} from '../src/bomFile.js';
import {looksLikeMpn,makePart} from '../src/blueprint.js';

// LZ-String compressToBase64 (the library's published algorithm), only to produce test input for the decoder.
function lzCompressBase64(text){
 const K='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';const bpc=6,toChar=v=>K.charAt(v);
 const dict={},create={};let c,wc,w='',enlargeIn=2,dictSize=3,numBits=2,out=[],val=0,pos=0;
 const put=(v,n)=>{for(let i=0;i<n;i++){val=(val<<1)|(v&1);if(pos===bpc-1){pos=0;out.push(toChar(val));val=0}else pos++;v>>=1}};
 const putBit=b=>{val=(val<<1)|b;if(pos===bpc-1){pos=0;out.push(toChar(val));val=0}else pos++};
 const emit=()=>{if(Object.prototype.hasOwnProperty.call(create,w)){const code=w.charCodeAt(0);if(code<256){for(let i=0;i<numBits;i++)putBit(0);put(code,8)}else{put(1,numBits);put(code,16)}enlargeIn--;if(enlargeIn===0){enlargeIn=Math.pow(2,numBits);numBits++}delete create[w]}else put(dict[w],numBits);enlargeIn--;if(enlargeIn===0){enlargeIn=Math.pow(2,numBits);numBits++}};
 for(let i=0;i<text.length;i++){c=text.charAt(i);if(!Object.prototype.hasOwnProperty.call(dict,c)){dict[c]=dictSize++;create[c]=true}
  wc=w+c;if(Object.prototype.hasOwnProperty.call(dict,wc))w=wc;else{emit();dict[wc]=dictSize++;w=String(c)}}
 if(w!=='')emit();put(2,numBits);
 for(;;){val<<=1;if(pos===bpc-1){out.push(toChar(val));break}else pos++}
 const r=out.join('');switch(r.length%4){case 0:return r;case 1:return r+'===';case 2:return r+'==';case 3:return r+'='}
}

const sample=async()=>(await unzip(readFileSync('public/samples/sample-gerber.zip'))).map(f=>({name:f.name.split('/').pop(),text:new TextDecoder().decode(f.bytes)}));
const byRef=r=>Object.fromEntries(r.board.parts.map(p=>[p.ref,p]));

test('a value that is a manufacturer part number becomes the part number; passive values stay values',()=>{
 for(const v of ['STM32F407VGT6','SS14','BSS138','LM1117MPX-3.3','MCP6002-I/SN','1N4148W','GRM188R71C104KA01D','ESP32-WROOM-32E'])assert.ok(looksLikeMpn(v),v);
 for(const v of ['10k','4K7','100nF','2.2uH','16MHz','3.3V','1%','470R','10uF/25V','0603','SOT-23','LED','DNP','Conn_01x04','R_Small','TestPoint',''])assert.ok(!looksLikeMpn(v),v);
 assert.equal(makePart({ref:'U1',value:'STM32F407VGT6',package:'LQFP-100',x:0,y:0}).mpn,'STM32F407VGT6');
 assert.equal(makePart({ref:'R1',value:'10k',package:'0603',x:0,y:0}).mpn,'');
 assert.equal(makePart({ref:'U1',value:'STM32',mpn:'STM32F407VGT6TR',x:0,y:0}).mpn,'STM32F407VGT6TR','a real MPN field wins');
});

test('the sample Gerber set: part numbers from the KiCad placement file value column',async()=>{
 const r=buildGerberBoard(await sample(),{name:'sample-gerber.zip'});const p=byRef(r);
 assert.equal(p.U1.mpn,'STM32F407VGT6');assert.equal(p.D1.mpn,'SS14');assert.equal(p.Q1.mpn,'BSS138');
 assert.ok(r.summary.withMpn>=5);assert.deepEqual(r.summary.bom,[]);
});

test('BOM files: designator lists and ranges, part numbers, makers and supplier part numbers',()=>{
 assert.deepEqual(expandRefs('C1, C2 C3;R4-R6, U1–U2,J1-3'),['C1','C2','C3','R4','R5','R6','U1','U2','J1','J2','J3']);
 const jlc='Comment,Designator,Footprint,LCSC Part #\n100nF,"C1,C2,C3",0603,C14663\nSS14,D1,SMA,C2480\n';
 assert.ok(looksLikeBom(jlc));const m=parseBomText(jlc);
 assert.deepEqual(m.get('C2'),{mpn:'',manufacturer:'',value:'100nF',package:'0603',supplierPn:'C14663',supplier:'LCSC'});
 const alt='"Designator";"Manufacturer";"Manufacturer Part Number";"Quantity"\n"U2";"Texas Instruments";"LM1117MPX-3.3/NOPB";"1"\n"R1-R3";"Yageo";"RC0603FR-0710KL";"3"\n"Q9";"";"DNP";"1"\n';
 const a=parseBomText(alt);assert.equal(a.get('U2').mpn,'LM1117MPX-3.3/NOPB');assert.equal(a.get('U2').manufacturer,'Texas Instruments');assert.equal(a.get('R3').mpn,'RC0603FR-0710KL');assert.equal(a.has('Q9'),false,'DNP lines are not part numbers');
 assert.ok(!looksLikeBom('Ref,PosX,PosY,Rot\nU1,1,2,0\n'),'a placement file is not a BOM');
 assert.equal(identifyLayer('assembly.csv',alt.replace(/;/g,',')).kind,'bom','found by its columns, whatever the name');
 assert.equal(identifyLayer('board-BOM.csv','x').kind,'bom');
});

test('a BOM in the Gerber set gives the board its part numbers, makers and LCSC numbers',async()=>{
 const files=(await sample()).filter(f=>!/\.pos$/.test(f.name));
 const bom={name:'BOM_JLC.csv',text:'Designator,Manufacturer,Manufacturer Part Number,Comment,Footprint,LCSC Part #\nU1,STMicroelectronics,STM32F407VGT6,MCU,LQFP-100,C12345\n"D1",onsemi,SS14FL,SS14,SMA,C2480\nU3,Microchip,MCP6002-I/SN,,SOIC-8,\n'};
 const r=buildGerberBoard([...files,bom],{name:'set.zip'});const p=byRef(r);
 assert.deepEqual(r.summary.bom,['BOM_JLC.csv']);assert.ok(r.summary.fromBom>=3);assert.ok(!r.summary.unknown.includes('BOM_JLC.csv'));
 assert.equal(p.D1.mpn,'SS14FL');assert.equal(p.D1.manufacturer,'onsemi');assert.equal(p.D1.supplierPn,'C2480');assert.equal(p.D1.supplier,'LCSC');
 assert.equal(p.U1.mpn,'STM32F407VGT6');assert.equal(p.U3.mpn,'MCP6002-I/SN');
});

test('part numbers written on the copper pads (X2 component attributes) are read',async()=>{
 const files=(await sample()).map(f=>/F_Cu/.test(f.name)?{...f,text:f.text.replace(/(%TO\.P,U1,1[^%]*%)/,'%TO.CMPN,STM32F407VGT6TR*%\n%TO.CMfr,STMicroelectronics*%\n$1')}:f);
 assert.ok(files.find(f=>/F_Cu/.test(f.name)).text.includes('%TO.CMPN,STM32F407VGT6TR*%'),'test fixture carries the attribute');
 const p=byRef(buildGerberBoard(files,{name:'x.zip'}));
 assert.equal(p.U1.mpn,'STM32F407VGT6TR','the copper attribute wins over the placement value');assert.equal(p.U1.manufacturer,'STMicroelectronics');
});

test('an Excel BOM inside the ZIP is read too',async()=>{
 const {default:ExcelJS}=await import('exceljs');const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet('BOM');
 ws.addRow(['Designator','Manufacturer Part Number','Manufacturer']);ws.addRow(['Q1','BSS138BKW','Nexperia']);
 const {zipStored}=await import('../src/unzip.js');const xlsx=new Uint8Array(await wb.xlsx.writeBuffer());
 const sampleZip=await unzip(readFileSync('public/samples/sample-gerber.zip'));
 const zip=zipStored([...sampleZip.filter(e=>!/\.pos$/.test(e.name)).map(e=>({name:e.name,data:e.bytes})),{name:'BOM.xlsx',data:xlsx}]);
 const {readGerberFiles}=await import('../src/gerberQuote.js');
 const texts=await readGerberFiles([{name:'set.zip',arrayBuffer:async()=>zip.buffer.slice(zip.byteOffset,zip.byteOffset+zip.byteLength)}]);
 const b=texts.find(t=>t.name==='BOM.xlsx');assert.match(b.text,/Designator\tManufacturer Part Number/);
 const p=byRef(buildGerberBoard(texts,{name:'set.zip'}));assert.equal(p.Q1.mpn,'BSS138BKW');assert.equal(p.Q1.manufacturer,'Nexperia');
});

test('designator-only parts are named from their pads, and new part numbers join the part master',async()=>{
 const {nameFromData,packageFromPads,partLabel,typeFromRef}=await import('../src/partName.js');const {displayName}=await import('../src/blueprint.js');
 assert.equal(packageFromPads('R1',[{x:-1,y:0,w:1,h:1.2},{x:1,y:0,w:1,h:1.2}]),'0805');
 assert.equal(packageFromPads('C5',[{x:-2.5,y:0,w:1.6,h:1.6,hole:.8},{x:2.5,y:0,w:1.6,h:1.6,hole:.8}]),'Radial, 5 mm lead pitch');
 assert.equal(packageFromPads('D1',[{x:-5,y:0,w:1.6,h:1.6,hole:.8},{x:5,y:0,w:1.6,h:1.6,hole:.8}]),'Through-hole, 10 mm lead pitch','a diode is not called axial resistor');
 assert.equal(typeFromRef('LED1'),'led');assert.equal(typeFromRef('K2'),'relay');assert.equal(partLabel({ref:'K1',package:'5-pad through-hole'}),'Relay · 5-pad through-hole');
 const saved={ref:'U1',type:'chip',pads:[0,1,2,3,4,5,6,7].map(i=>({x:i<4?-2.7:2.7,y:(i%4-1.5)*1.27,w:1.5,h:.6}))};
 const n=nameFromData(saved);assert.equal(n.package,'SOIC-8, 1.27 mm');assert.equal(displayName(n),'Integrated circuit · SOIC-8, 1.27 mm');
 assert.equal(nameFromData({ref:'U2',value:'ATmega328P-AU'}).mpn,'ATmega328P-AU','a saved board gets its part number on load');
 assert.equal(displayName({ref:'R1',type:'resistor'}),'Resistor');assert.equal(displayName({ref:'X1',type:'other'}),'Unnamed part');
 // Real Gerber sets with designators only (KiCad TO.P on copper): every part gets a package.
 const r=buildGerberBoard(await sample(),{name:'sample-gerber.zip'});assert.ok(r.board.parts.every(p=>p.package),'every part has a package');
 const {learnParts}=await import('../src/partDetails.js');
 const {next,added}=learnParts({},[{mpn:'SS14FL',manufacturer:'onsemi',value:'SS14',package:'SMA',supplierPn:'C2480',supplier:'LCSC',from:'BT04 D1'},{mpn:'ss14fl'},{mpn:'LM358P'},{mpn:'R1'}],{source:'board',known:m=>m==='LM358P',now:'2026-11-10T00:00:00Z'});
 assert.deepEqual(added,['SS14FL'],'once per part number, not ones the part master has, not too short');
 assert.deepEqual(next.SS14FL,{mpn:'SS14FL',manufacturer:'onsemi',title:'',description:'Added from BT04 D1',package:'SMA',datasheet:'',specs:[{name:'Value',value:'SS14'},{name:'LCSC part number',value:'C2480'}],links:[],source:'auto-board',addedFrom:'BT04 D1',fetchedAt:'2026-11-10T00:00:00Z'});
 assert.deepEqual(learnParts(next,[{mpn:'SS14FL',manufacturer:'other'}]).added,[],'nothing is overwritten');
});

test('an Interactive HTML BOM and a nested Gerber ZIP in the upload give every part its value and footprint',async()=>{
 const {zipStored}=await import('../src/unzip.js');const {readGerberFiles}=await import('../src/gerberQuote.js');
 const inner=zipStored((await unzip(readFileSync('public/samples/sample-gerber.zip'))).map(e=>({name:'Gerber/'+e.name.split('/').pop(),data:e.bytes})));
 const outer=zipStored([{name:'Project/Gerber.zip',data:inner},{name:'Project/firmware.hex',data:':00000001FF'},{name:'Project/notes.pdf',data:'%PDF'}]);
 const flat=await readGerberFiles([{name:'p.zip',arrayBuffer:async()=>outer.buffer.slice(outer.byteOffset,outer.byteOffset+outer.byteLength)}]);
 assert.equal(flat.length,9,'the inner ZIP is opened; firmware and PDF are left out');assert.ok(flat.some(f=>/F_Cu/.test(f.name)));
 const {lzDecompressBase64,parseIbom,cleanFootprint,isIbom}=await import('../src/ibom.js');
 for(const t of ['{"a":1}','ababababababab cdcdcd 1k 1k 1k ATmega8-16PU'.repeat(20),JSON.stringify({bom:{both:[[['R1',0]]]},x:'é ✓ 中'})])assert.equal(lzDecompressBase64(lzCompressBase64(t)),t,'round trip');
 assert.equal(cleanFootprint('Resistor_SMD:R_1206_HandSoldering'),'1206');assert.equal(cleanFootprint('D_SMA_Handsoldering'),'SMA');
 assert.equal(cleanFootprint('DIP-28_W7.62mm'),'DIP-28');assert.equal(cleanFootprint('TO-220-3_Vertical'),'TO-220-3');assert.equal(cleanFootprint('SOT-23_Handsoldering'),'SOT-23');
 assert.equal(cleanFootprint('CP_Radial_D10.0mm_P5.00mm'),'Radial D10.0 mm, 5.00 mm pitch');
 // A page in the newer layout, uncompressed: fields by footprint index, groups of [ref, index].
 const pcb={bom:{both:[[['U1',0]],[['R1',1],['R2',1]]],F:[],B:[],fields:{0:['ATmega8-16PU','Package_DIP:DIP-28_W7.62mm','ATMEGA8-16PU','Microchip'],1:['1k','R_1206_HandSoldering','','']}}};
 const html=`<script>var config = {"fields": ["Value", "Footprint", "MPN", "Manufacturer"]}\nvar pcbdata = ${JSON.stringify(pcb)}\nvar config2</script>`;
 const html2=html.replace('var pcbdata = '+JSON.stringify(pcb)+'\nvar config2','var pcbdata = '+JSON.stringify(pcb)+'\n var config = {}');
 assert.ok(isIbom(html2));const m=parseIbom(html2);
 assert.equal(m.get('U1').mpn,'ATMEGA8-16PU');assert.equal(m.get('U1').manufacturer,'Microchip');assert.equal(m.get('R2').value,'1k');
 assert.equal(identifyLayer('ibom.html',html2).kind,'ibom');
 const files=(await sample()).filter(f=>!/\.pos$/.test(f.name));
 const pcb2={bom:{both:[[['U1',0]],[['D1',1]]],F:[],B:[],fields:{0:['STM32F407VGT6','Package_QFP:LQFP-100_14x14mm_P0.5mm'],1:['SS14','Diode_SMD:D_SMA_Handsoldering']}}};
 const page=`var config = {"fields": ["Value", "Footprint"]}\nvar pcbdata = ${JSON.stringify(pcb2)}\n var config = {}`;
 const p=byRef(buildGerberBoard([...files,{name:'ibom.html',text:page}],{name:'set.zip'}));
 assert.equal(p.U1.mpn,'STM32F407VGT6');assert.equal(p.D1.mpn,'SS14');assert.equal(p.D1.package,'SMA');
});

test('the KiCad board file inside the Gerber set gives the parts their values and part numbers',async()=>{
 const kicad=readFileSync('public/samples/sample-board.kicad_pcb','utf8');
 assert.equal(identifyLayer('BT04.kicad_pcb',kicad).kind,'kicad');assert.equal(identifyLayer('board.txt',kicad).kind,'kicad','found by its content too');
 const files=(await sample()).filter(f=>!/\.pos$/.test(f.name));
 const without=byRef(buildGerberBoard(files,{name:'set.zip'}));assert.equal(without.U1.mpn,'','the Gerber layers alone carry no part number');
 const r=buildGerberBoard([...files,{name:'board.kicad_pcb',text:kicad}],{name:'set.zip'});const p=byRef(r);
 assert.equal(p.U1.mpn,'STM32F103C8T6');assert.equal(p.U1.package,'LQFP-48');assert.ok(r.summary.fromBom>=2);assert.deepEqual(r.summary.bom,['board.kicad_pcb']);
 const {readGerberFiles}=await import('../src/gerberQuote.js');const {zipStored}=await import('../src/unzip.js');
 const z=zipStored([...files.map(f=>({name:f.name,data:f.text})),{name:'BT04.kicad_pcb',data:kicad},{name:'BT04.kicad_pro',data:'{}'}]);
 const texts=await readGerberFiles([{name:'z.zip',arrayBuffer:async()=>z.buffer.slice(z.byteOffset,z.byteOffset+z.byteLength)}]);
 assert.ok(texts.some(t=>t.name==='BT04.kicad_pcb'),'the board file travels in the ZIP');assert.ok(!texts.some(t=>t.name==='BT04.kicad_pro'),'other KiCad files are left out');
});
