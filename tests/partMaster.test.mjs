import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildIndex,lookupMpn,lookupPart,lookupResistor,searchPartMaster,parseOhms,hasOhmUnit,formatOhms,knowledgeType,knowledgeCategory,manufacturerOf,alternatesOf,matchLine} from '../src/partMaster.js';
import {buildPartMaster} from '../scripts/make-part-master.mjs';

const json=JSON.parse(await readFile(new URL('../public/data/part-master.json',import.meta.url),'utf8'));
const index=buildIndex(json);

test('generated knowledge base matches the workbook',async()=>{
 const fresh=await buildPartMaster(new URL('../data/part-master.xlsx',import.meta.url).pathname);
 assert.equal(fresh.semiconductors.length,1454);assert.equal(fresh.resistors.length,1229);
 assert.deepEqual(fresh.semiconductors.length+fresh.resistors.length,index.size);
 assert.ok(!JSON.stringify(fresh).includes('VV,'),'spec typo repaired');
 assert.equal(fresh.semiconductors.find(r=>r[2]==='MC68HC11E1CFN2')[9],'','missing cells become empty strings');
});

test('exact, variant and family part-number matching',()=>{
 assert.equal(lookupMpn(index,'SS14').match,'exact');
 assert.equal(lookupMpn(index,'ss14').entry.description,'Schottky barrier diode 1A 40V');
 assert.equal(lookupMpn(index,'ATMEGA328P-AU').entry.mpn,'ATmega328P-AU');
 assert.equal(lookupMpn(index,'74HC595D,118').match,'exact');
 const variant=lookupMpn(index,'IRF540NPBF');assert.equal(variant.match,'variant');assert.equal(variant.entry.mpn,'IRF540N');
 assert.equal(lookupMpn(index,'1N4148W-7-F').entry.mpn,'1N4148W','separator after the stem counts as a variant');
 assert.equal(lookupMpn(index,'SS140'),null,'a different number is not a variant');
 assert.equal(lookupMpn(index,'M7A'),null,'two-character numbers only match exactly');
 const fam=lookupMpn(index,'LM358');assert.equal(fam.match,'family');assert.equal(fam.entry.mpn,'LM358P');assert.ok(fam.family.length>=3);
 assert.equal(lookupMpn(index,'ESP32').match,'family');
 assert.equal(lookupMpn(index,'1N41'),null,'digits continuing a number are not a family');
 assert.equal(lookupMpn(index,'GRM188R71C104KA01D'),null);
 assert.equal(lookupMpn(index,''),null);
});

test('resistance parsing and value lookup',()=>{
 assert.equal(parseOhms('10K'),10000);assert.equal(parseOhms('4K7'),4700);assert.equal(parseOhms('4.7k'),4700);assert.equal(parseOhms('4,7k'),4700);
 assert.equal(parseOhms('10 kΩ'),10000);assert.equal(parseOhms('100R'),100);assert.equal(parseOhms('0R'),0);assert.equal(parseOhms('2R2'),2.2);assert.equal(parseOhms('1M'),1e6);assert.equal(parseOhms('0.1Ω'),.1);assert.equal(parseOhms('10 ohm'),10);
 assert.ok(Number.isNaN(parseOhms('0603')));assert.ok(Number.isNaN(parseOhms('SS14')));assert.ok(Number.isNaN(parseOhms('4.7K7')));
 assert.ok(hasOhmUnit('10k')&&hasOhmUnit('4K7')&&hasOhmUnit('100R')&&hasOhmUnit('1 Ω')&&!hasOhmUnit('10')&&!hasOhmUnit('0603'));
 assert.equal(formatOhms(10000),'10 kΩ');assert.equal(formatOhms(4700),'4.7 kΩ');assert.equal(formatOhms(1e6),'1 MΩ');assert.equal(formatOhms(.1),'0.1 Ω');
 const sized=lookupResistor(index,10000,'0603');assert.equal(sized.entry.mpn,'RC0603FR-0710KL');assert.equal(sized.match,'value');assert.ok(sized.sized);
 const axial=lookupResistor(index,10000,'Axial');assert.equal(axial.entry.mpn,'MFR-25FBF52-10K');
 const unsized=lookupResistor(index,4700);assert.equal(unsized.entry.size,'0603');assert.ok(!unsized.sized);assert.ok(unsized.family.length>=7);
 assert.equal(lookupResistor(index,12345),null);
});

test('board parts resolve through part number, label tokens or value',()=>{
 assert.equal(lookupPart(index,{mpn:'SS14',value:'SS14',package:'SMA',type:'diode'}).match,'exact');
 assert.equal(lookupPart(index,{value:'10k',package:'R_0603_1608Metric',type:'resistor'}).entry.mpn,'RC0603FR-0710KL');
 assert.equal(lookupPart(index,{value:'10k',type:'resistor'}).entry.value,'10 kΩ');
 assert.equal(lookupPart(index,{value:'4K7 0805',type:'resistor'}).entry.mpn,'RC0805FR-074K7L');
 assert.equal(lookupPart(index,{value:'100nF',package:'0603',type:'capacitor'}),null,'capacitor values are not resistors');
 assert.equal(lookupPart(index,{value:'10',type:'capacitor'}),null,'bare numbers only count for resistors');
 assert.equal(lookupPart(index,{value:'10',type:'resistor'}).entry.ohms,10);
 assert.equal(lookupPart(index,{value:'D1 SS14 Schottky',type:'diode'}).entry.mpn,'SS14','a token inside a label matches');
 assert.equal(lookupPart(index,{mpn:'Unnamed part'}),null);
 assert.equal(lookupPart(index,'STM32F407VGT6').entry.description,'Cortex-M4 1MB 168MHz');
 assert.equal(lookupPart(index,{mpn:'LM1117MPX-3.3'}).entry.package,'SOT-223');
 assert.equal(lookupPart(null,'SS14'),null);
});

test('free-text search covers part numbers, descriptions and values',()=>{
 const lm=searchPartMaster(index,'LM358');assert.equal(lm.results[0].mpn,'LM358P');assert.ok(lm.total>=3);
 const schottky=searchPartMaster(index,'schottky 40V SMA');assert.ok(schottky.results.some(e=>e.mpn==='SS14'));assert.ok(schottky.results.every(e=>e.kind==='semiconductor'));
 const r=searchPartMaster(index,'10k 0603');assert.ok(r.results.some(e=>e.mpn==='RC0603FR-0710KL'));assert.ok(r.results.every(e=>e.kind==='resistor'));
 const capped=searchPartMaster(index,'SMD',5);assert.equal(capped.results.length,5);assert.ok(capped.total>5);
 assert.deepEqual(searchPartMaster(index,'   '),{results:[],total:0});
 assert.equal(searchPartMaster(index,'zzzz-not-a-part').total,0);
});

test('derived type, category, manufacturer and alternates',()=>{
 const ss14=lookupMpn(index,'SS14').entry,led=lookupMpn(index,'LTST-C170KRKT').entry,esp=lookupMpn(index,'ESP32-WROOM-32E').entry,r=lookupMpn(index,'RC0603FR-0710KL').entry,ptc=lookupMpn(index,'1206L050YR').entry,mov=lookupMpn(index,'S14K275').entry,opamp=lookupMpn(index,'LM358P').entry,fet=lookupMpn(index,'IRF540N').entry,pc817=lookupMpn(index,'PC817').entry;
 assert.equal(knowledgeType(ss14),'diode');assert.equal(knowledgeType(led),'led');assert.equal(knowledgeType(pc817),'chip');assert.equal(knowledgeType(esp),'module');assert.equal(knowledgeType(r),'resistor');assert.equal(knowledgeType(ptc),'fuse');assert.equal(knowledgeType(mov),'fuse');assert.equal(knowledgeType(fet),'transistor');assert.equal(knowledgeType(opamp),'chip');
 assert.equal(knowledgeCategory(ss14),'Diodes');assert.equal(knowledgeCategory(esp),'Modules');assert.equal(knowledgeCategory(opamp),'Amplifiers');assert.equal(knowledgeCategory(r),'Resistors');assert.equal(knowledgeCategory(ptc),'Circuit protection');assert.equal(knowledgeCategory(lookupMpn(index,'STM32F103C8T6').entry),'Microcontrollers');
 assert.equal(manufacturerOf(ss14),'ON Semi');assert.equal(manufacturerOf(lookupMpn(index,'ATmega328P-PU').entry),'Microchip');assert.equal(manufacturerOf(r),'Yageo');
 const alts=alternatesOf(lookupMpn(index,'1N4001').entry);assert.deepEqual(alts.map(a=>a.mpn),['1N4007-E3/54','1N4007G']);
 assert.deepEqual(alternatesOf(lookupMpn(index,'BZX55C2V4').entry).map(a=>a.mpn),[null,'BZX79C2V4'],'series wildcards are not orderable numbers');
 assert.equal(alternatesOf(lookupMpn(index,'BAV99').entry)[0].mpn,'BAW56');
 assert.deepEqual(alternatesOf(ss14),[]);
 assert.equal(alternatesOf(r).length,4);assert.equal(alternatesOf(r)[0].mpn,null);
 assert.equal(matchLine(lookupMpn(index,'IRF540NPBF')),'Ordering variant of IRF540N');
 assert.match(matchLine(lookupPart(index,{value:'10k',type:'resistor'})),/size not stated/);
 assert.equal(r.description,'10 kΩ SMD thick film resistor · 0603');assert.equal(r.mount,'SMD');assert.equal(lookupMpn(index,'MFR-25FBF52-10K').entry.mount,'THT');
});

test('decimal points and reference designators do not create false matches',()=>{
 assert.equal(lookupMpn(index,'SMBJ5.0A').entry.mpn,'SMBJ5.0A');assert.equal(lookupMpn(index,'smbj5.0a').match,'exact');
 assert.equal(lookupMpn(index,'SMBJ50A'),null,'a 50 V TVS is not the 5 V part');assert.equal(lookupMpn(index,'P6KE68A'),null);
 assert.equal(lookupMpn(index,'SMBJ5.0A-13-F').entry.mpn,'SMBJ5.0A','ordering suffix still resolves');
 assert.equal(lookupPart(index,{mpn:'',value:'D1',type:'diode'}),null,'silkscreen D1 is not the Allwinner D1');
 assert.equal(lookupPart(index,{value:'U12'}),null);assert.equal(lookupPart(index,{value:'D1 SS14 Schottky',type:'diode'}).entry.mpn,'SS14');
 assert.equal(lookupPart(index,{mpn:'A64'}).entry.mpn,'A64','an explicit listed part number still matches');
});
