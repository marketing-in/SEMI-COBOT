import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyBoard,supportPlan,placeSuggestions} from '../src/boardKnowledge.js';
import {makePart} from '../src/blueprint.js';

const board={width:60,height:40,layers:2};
const mcu=makePart({ref:'U1',mpn:'STM32F103C8T6',package:'LQFP-48',type:'chip',x:0,y:0});
const ldo=makePart({ref:'U2',mpn:'AMS1117-3.3',package:'SOT-223',type:'chip',x:-20,y:10});
const usb=makePart({ref:'J1',mpn:'USB4110-GF-A',package:'USB-C',type:'connector',x:-26,y:0});
const led=makePart({ref:'D1',mpn:'LTST-C170KRKT',package:'0805',type:'led',x:20,y:12});
const c1=makePart({ref:'C1',value:'100nF',package:'0603',type:'capacitor',x:5,y:0});

test('the support plan counts what is near each part and lists what is missing',()=>{
 const plan=supportPlan([mcu,ldo,usb,led,c1]);
 const dec=plan.items.find(i=>i.parent==='U1'&&/Decoupling/.test(i.purpose));assert.equal(dec.present,1,'the 100 nF next to the MCU counts');assert.equal(dec.missing,dec.qty-1);
 assert.ok(!plan.items.some(i=>i.parent==='U1'&&/load capacitors/.test(i.purpose)),'no crystal, so no load capacitors are demanded');
 assert.ok(plan.items.some(i=>i.parent==='U1'&&i.type==='crystal'&&i.optional&&i.missing===0),'the crystal is suggested but optional');
 assert.deepEqual(plan.items.filter(i=>i.parent==='U2').map(i=>i.purpose.split(' ')[1]),['input','output']);
 assert.ok(plan.items.some(i=>i.parent==='J1'&&/CC1\/CC2/.test(i.purpose)&&i.qty===2));assert.ok(plan.items.some(i=>i.parent==='D1'&&i.type==='resistor'));
 assert.equal(plan.missing,plan.items.reduce((s,i)=>s+i.missing,0));assert.ok(plan.roles.includes('mcu')&&plan.roles.includes('usbc'));
});

test('a crystal near the MCU brings its load capacitors into the plan',()=>{
 const y=makePart({ref:'Y1',mpn:'ABM8-8.000MHZ-B2-T',package:'3225',type:'crystal',x:8,y:6});
 const plan=supportPlan([mcu,y]);assert.ok(plan.items.some(i=>/load capacitors/.test(i.purpose)&&i.qty===2&&i.missing===2));
});

test('missing parts are placed on free board space next to their parent, never overlapping',()=>{
 const parts=[mcu,ldo,usb,led,c1];const plan=supportPlan(parts);const {parts:added,unplaced}=placeSuggestions(board,parts,plan);
 assert.equal(added.length+unplaced.length,plan.missing);assert.ok(added.length>0);
 const all=[...parts,...added];
 for(const a of added){assert.ok(a.suggested&&a.mpn&&a.purpose);assert.ok(Math.abs(a.x)+a.w/2<=board.width/2&&Math.abs(a.y)+a.d/2<=board.height/2,'on the board');
  for(const b of all){if(a===b||a.side!==b.side)continue;const rb=Math.abs(Math.sin(b.rot*Math.PI/180))>.5;const bw=rb?b.d:b.w,bd=rb?b.w:b.d;assert.ok(Math.abs(a.x-b.x)>=(a.w+bw)/2||Math.abs(a.y-b.y)>=(a.d+bd)/2,`${a.ref} overlaps ${b.ref}`)}}
 assert.ok(new Set(added.map(a=>a.ref)).size===added.length,'unique designators');assert.ok(added.every(a=>/^[CRLDFY]1\d\d$/.test(a.ref)));
 const u1Caps=added.filter(a=>a.parentRef==='U1'&&a.type==='capacitor');assert.ok(u1Caps.every(a=>Math.hypot(a.x,a.y)<25),'placed near the MCU');
});

test('board types are scored from part numbers, keywords, connectors, size and layers',()=>{
 const types=[{id:'stm32-dev',name:'STM32 board',signals:{mpnPatterns:['^STM32'],keywords:['ldo'],connectors:['usb-c'],partCount:[3,80],sizeMm:[30,90],layers:[2,4]}},
  {id:'gpu',name:'Graphics card',signals:{mpnPatterns:['^(GA|AD)10[0-9]'],keywords:['gddr'],connectors:['pcie'],partCount:[500,3000],sizeMm:[150,320],layers:[8,14]}},
  {id:'bad',name:'Broken regex',signals:{mpnPatterns:['(('],keywords:[],connectors:[],partCount:[1,10],sizeMm:[1,10],layers:[1,1]}}];
 const r=classifyBoard(board,[mcu,ldo,usb,led,c1],types);assert.equal(r[0].type.id,'stm32-dev');assert.ok(r[0].confidence>.5);assert.ok(r[0].evidence.includes('STM32F103C8T6'));
 assert.ok(!r.some(x=>x.type.id==='gpu'),'unrelated types are dropped');assert.deepEqual(classifyBoard(board,[],[]),[]);
});

test('suggested parts count as planned, so the plan is satisfied and adding twice adds nothing',()=>{
 const parts=[mcu,ldo,usb,led,c1];const plan=supportPlan(parts);const {parts:added}=placeSuggestions(board,parts,plan);
 const again=supportPlan([...parts,...added]);assert.equal(again.planned,added.length);assert.equal(again.missing,plan.missing-added.length);
 assert.equal(placeSuggestions(board,[...parts,...added],again).parts.length,again.missing,'only what is still missing is placed');
 const dec=again.items.find(i=>i.parent==='U1'&&/Decoupling/.test(i.purpose));assert.equal(dec.present,1);assert.equal(dec.present+dec.planned,dec.qty);
});
test('the board-type knowledge base is complete and valid',async()=>{
 const {readFile}=await import('node:fs/promises');const {types}=JSON.parse(await readFile(new URL('../public/data/board-types.json',import.meta.url),'utf8'));
 assert.ok(types.length>=55,'at least 55 board types');assert.equal(new Set(types.map(t=>t.id)).size,types.length,'unique ids');
 for(const t of types){assert.ok(t.name&&t.description&&t.category,t.id);assert.ok(t.sections.length>=2,t.id+' sections');assert.ok(t.checks.length>=3,t.id+' checks');
  for(const p of t.signals.mpnPatterns)new RegExp(p,'i');for(const sec of t.sections)for(const part of sec.parts)assert.ok(part.role&&part.type&&part.example!==undefined,t.id+' part')}
 assert.deepEqual([...new Set(types.map(t=>t.category))].sort(),['comms','computing','consumer','mcu','motion','power']);
});
