import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classify,rulePaths,catalogueNodes} from '../src/componentTaxonomy.js';
import {makePart} from '../src/blueprint.js';

const tax=JSON.parse(readFileSync(new URL('../public/data/component-categories.json',import.meta.url),'utf8'));
const has=([c,t,s])=>{const cat=tax.categories.find(x=>x.name===c);const ty=cat?.component_types.find(x=>x.name===t);return !!ty?.subtypes.includes(s)};

test('every classification rule points at a real catalogue entry',()=>{
 for(const p of rulePaths())assert.ok(has(p),'missing in catalogue: '+p.join(' › '));
});

test('the catalogue lists every category, type and subtype',()=>{
 const n=catalogueNodes(tax);assert.equal(n.filter(x=>x.level===0).length,10);assert.equal(n.filter(x=>x.level===1).length,101);assert.equal(n.filter(x=>x.level===2).length,416);
});

const P=(o)=>makePart(o);
const cases=[
 [P({ref:'U1',mpn:'STM32F407VGT6',package:'LQFP-100',type:'chip'}),'Integrated circuits','Microcontroller','32-bit'],
 [P({ref:'U2',mpn:'ATMEGA328P-AU',package:'TQFP-32',type:'chip'}),'Integrated circuits','Microcontroller','8-bit'],
 [P({ref:'U3',mpn:'ESP32-S3-WROOM-1',package:'Module',type:'module'}),'Integrated circuits','System-on-chip','Wireless SoC'],
 [P({ref:'U4',mpn:'AMS1117-3.3',package:'SOT-223',type:'chip'}),'Integrated circuits','Power-management IC','LDO'],
 [P({ref:'U5',mpn:'LM2596S-5.0',package:'TO-263',type:'chip'}),'Integrated circuits','Power-management IC','Buck'],
 [P({ref:'U6',mpn:'LM358P',package:'DIP-8',type:'chip'}),'Integrated circuits','Amplifier','Operational'],
 [P({ref:'U7',mpn:'W25Q32JVSSIQ',package:'SOIC-8',type:'chip'}),'Integrated circuits','Memory','NOR Flash'],
 [P({ref:'U8',mpn:'CH340G',package:'SOIC-16',type:'chip'}),'Integrated circuits','Interface IC','USB'],
 [P({ref:'U9',mpn:'MAX485ESA',package:'SOIC-8',type:'chip'}),'Integrated circuits','Interface IC','RS-485'],
 [P({ref:'U10',mpn:'74HC595D',package:'SOIC-16',type:'chip'}),'Integrated circuits','Logic IC','Shift register'],
 [P({ref:'U11',mpn:'74AHC1G04',package:'SOT-23-5',type:'chip'}),'Integrated circuits','Logic IC','Inverter'],
 [P({ref:'U12',mpn:'NE555DR',package:'SOIC-8',type:'chip'}),'Integrated circuits','Timing IC','Timer'],
 [P({ref:'U13',mpn:'TP4056',package:'SOP-8',type:'chip'}),'Integrated circuits','Battery-management IC','Charger'],
 [P({ref:'U14',mpn:'MA12070P',package:'QFN-64',type:'chip'}),'Integrated circuits','Amplifier','Audio'],
 [P({ref:'U15',mpn:'BME280',package:'LGA-8',type:'chip'}),'Sensors and transducers','Environmental sensor','Humidity'],
 [P({ref:'U16',mpn:'PC817C',package:'DIP-4',type:'chip'}),'Optoelectronics and displays','Optical isolation','Phototransistor optocoupler'],
 [P({ref:'D1',mpn:'SS14',package:'SMA',type:'diode'}),'Discrete semiconductors','Rectifier diode','Schottky'],
 [P({ref:'D2',mpn:'1N4148W',package:'SOD-123',type:'diode'}),'Discrete semiconductors','Signal diode','Small-signal switching'],
 [P({ref:'D3',mpn:'BZX84C3V3',package:'SOT-23',type:'diode'}),'Discrete semiconductors','Voltage-reference diode','Zener'],
 [P({ref:'D4',mpn:'SMAJ5.0A',package:'SMA',type:'diode'}),'Discrete semiconductors','Protection diode','TVS'],
 [P({ref:'D5',mpn:'USBLC6-2SC6',package:'SOT-23-6',type:'chip'}),'Discrete semiconductors','Protection diode','ESD protection'],
 [P({ref:'D6',mpn:'1N4007',package:'DO-41',type:'diode'}),'Discrete semiconductors','Rectifier diode','Standard recovery'],
 [P({ref:'D7',mpn:'LTST-C170KRKT',package:'0805',type:'led'}),'Optoelectronics and displays','LED','Indicator'],
 [P({ref:'D8',mpn:'WS2812B',package:'5050',type:'led'}),'Optoelectronics and displays','LED','Addressable'],
 [P({ref:'Q1',mpn:'BSS138',package:'SOT-23',type:'transistor'}),'Discrete semiconductors','MOSFET','N-channel'],
 [P({ref:'Q2',mpn:'AO3401A',package:'SOT-23',type:'transistor'}),'Discrete semiconductors','MOSFET','P-channel'],
 [P({ref:'Q3',mpn:'MMBT3904',package:'SOT-23',type:'transistor'}),'Discrete semiconductors','Bipolar transistor (BJT)','NPN'],
 [P({ref:'Q4',mpn:'2N3906',package:'TO-92',type:'transistor'}),'Discrete semiconductors','Bipolar transistor (BJT)','PNP'],
 [P({ref:'C1',mpn:'GRM188R71C104KA01D',value:'100nF',package:'0603',type:'capacitor'}),'Passive components','Ceramic capacitor','Multilayer (MLCC)'],
 [P({ref:'C2',mpn:'ECA1HM101',value:'100uF',package:'CP_Radial_D8.0mm',type:'capacitor'}),'Passive components','Aluminium capacitor','Wet electrolytic'],
 [P({ref:'C3',mpn:'TAJA106K016RNJ',value:'10uF',package:'3216',type:'capacitor'}),'Passive components','Tantalum capacitor','Solid manganese dioxide'],
 [P({ref:'R1',mpn:'RC0603FR-0710KL',value:'10k',package:'0603',type:'resistor'}),'Passive components','Fixed resistor','Thick film'],
 [P({ref:'R2',value:'0R05',package:'2512',type:'resistor'}),'Passive components','Special resistor','Current-sense/shunt'],
 [P({ref:'RV1',mpn:'3296W-1-103LF',value:'10k',package:'Trimmer',type:'resistor'}),'Passive components','Variable resistor','Trimmer'],
 [P({ref:'L1',mpn:'BLM18PG221SN1D',package:'0603',type:'inductor'}),'Passive components','Ferrite component','Ferrite bead'],
 [P({ref:'L2',mpn:'SRR1260-100M',value:'10uH',package:'SMD',type:'inductor'}),'Passive components','Inductor','Ferrite-core'],
 [P({ref:'Y1',mpn:'ABM8-8.000MHZ-B2-T',package:'3225',type:'crystal'}),'Timing, power sources, and supporting parts','Crystal/resonator','Quartz crystal'],
 [P({ref:'Y2',mpn:'CSTCE16M0V53-R0',package:'SMD',type:'crystal'}),'Timing, power sources, and supporting parts','Crystal/resonator','Ceramic resonator'],
 [P({ref:'F1',mpn:'MF-MSMF050-2',package:'1812',type:'fuse'}),'Circuit protection','Resettable protection','Polymer PTC'],
 [P({ref:'F2',value:'2A',package:'1206',type:'fuse'}),'Circuit protection','Fuse','SMD'],
 [P({ref:'J1',mpn:'USB4110-GF-A',package:'USB-C',type:'connector'}),'Connectors and interconnects','Data connector','USB'],
 [P({ref:'J2',mpn:'61300621121',package:'PinHeader_1x06_P2.54mm',type:'connector'}),'Connectors and interconnects','PCB connector','Pin header'],
 [P({ref:'J3',mpn:'1792249',package:'TerminalBlock_Phoenix',type:'connector'}),'Connectors and interconnects','Terminal connection','Screw terminal'],
 [P({ref:'J4',mpn:'PJ-002A',package:'DC jack',type:'connector',leads:'tht'}),'Connectors and interconnects','Power connector','Barrel'],
 [P({ref:'J5',mpn:'S4B-PH-K-S',package:'JST PH',type:'connector'}),'Connectors and interconnects','PCB connector','Wire-to-board'],
 [P({ref:'SW1',mpn:'TS-1187A-B-A-B',package:'SMD',type:'switch'}),'Electromechanical components','Switch','Tactile'],
 [P({ref:'K1',mpn:'G5V-1-DC5',package:'Relay',type:'other'}),'Electromechanical components','Relay','Power'],
 [P({ref:'BZ1',mpn:'CEM-1203',package:'Buzzer',type:'other'}),'Electromechanical components','Audio device','Buzzer'],
];

test('board parts land in the right category, type and subtype',()=>{
 for(const [part,c,t,s] of cases){const r=classify(part);assert.deepEqual([r.category,r.type,r.subtype],[c,t,s],part.ref+' '+(part.mpn||part.value));assert.ok(has([c,t,s]))}
});

test('details help, mounting is reported, and unknown parts stay unclassified',()=>{
 assert.equal(classify(makePart({ref:'U1',mpn:'XYZ123',package:'SOIC-8',type:'chip'}),{description:'Synchronous step-down converter, 3 A'}).subtype,'Buck');
 assert.equal(classify(makePart({ref:'R1',value:'10k',package:'0603',type:'resistor'})).mounting,'Surface-mount (SMD/SMT)');
 assert.equal(classify(makePart({ref:'J1',mpn:'X',package:'X',type:'connector',leads:'tht'})).mounting,'Through-hole');
 assert.deepEqual(classify(makePart({ref:'X1',mpn:'QQ99',package:'?',type:'other'})).category,'');
});

test('parts known only by a description are sorted from their words',async()=>{
 const {guessType}=await import('../src/componentTaxonomy.js');
 assert.equal(guessType('0.1 µF ±10% 50V Ceramic Capacitor X7R 0805'),'capacitor');assert.equal(guessType('N-channel MOSFET 60V'),'transistor');assert.equal(guessType('3-A synchronous buck converter'),'chip');assert.equal(guessType('Bluetooth module'),'module');assert.equal(guessType(''),'other');
 assert.equal(classify({mpn:'CC0805KRX7R9BB104',package:'0805'},{description:'0.1 µF ±10% 50V Ceramic Capacitor X7R 0805'}).subtype,'Multilayer (MLCC)');
 assert.equal(classify({mpn:'XYZ1',package:''},{description:'Schottky barrier rectifier 40 V 1 A'}).subtype,'Schottky');
});
