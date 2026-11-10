import test from 'node:test';
import assert from 'node:assert/strict';
import {makePart} from '../src/blueprint.js';
import {tapeWidth,splitParts,feederSetup,planCycles,buildLine,sampleLine,moveTime,nozzleOffset,MACHINE} from '../src/smtLine.js';

const board={width:60,height:40};
const parts=[
 makePart({ref:'C1',value:'100nF',package:'0603',type:'capacitor',x:-10,y:-5}),
 makePart({ref:'C2',value:'100nF',package:'0603',type:'capacitor',x:10,y:5}),
 makePart({ref:'C3',value:'100nF',package:'0603',type:'capacitor',x:0,y:12}),
 makePart({ref:'R1',value:'10k',package:'0402',type:'resistor',x:5,y:-12,rot:90}),
 makePart({ref:'U1',mpn:'STM32F103C8T6',package:'LQFP-48',type:'chip',x:0,y:0,rot:45}),
 makePart({ref:'J1',mpn:'PJ-002A',package:'DC jack',type:'connector',x:-24,y:0,leads:'tht'}),
 makePart({ref:'R9',value:'1k',package:'0603',type:'resistor',x:8,y:8,side:'bottom'}),
];

test('tape width follows the part size, and big parts come from a tray',()=>{
 assert.equal(tapeWidth({w:1.6,d:.8}),8);assert.equal(tapeWidth({w:7,d:7}),16);assert.equal(tapeWidth({w:20,d:20}),32);assert.equal(tapeWidth({w:30,d:30}),44);
});

test('through-hole and bottom-side parts are kept off the top-side machine run',()=>{
 const {machine,hand,bottom}=splitParts(parts);
 assert.deepEqual(hand.map(p=>p.ref),['J1']);assert.deepEqual(bottom.map(p=>p.ref),['R9']);assert.equal(machine.length,5);
});

test('one feeder per distinct part, busiest in the middle, no overlap in the bank',()=>{
 const {machine}=splitParts(parts);const f=feederSetup(machine,board);
 assert.equal(f.length,3);const caps=f.find(x=>x.label==='100nF');assert.equal(caps.refs.length,3);
 assert.ok(Math.abs(caps.x)<=Math.min(...f.map(x=>Math.abs(x.x))),'most used feeder nearest the middle');
 const s=[...f].sort((a,b)=>a.x-b.x);for(let i=1;i<s.length;i++)assert.ok(s[i].x-s[i-1].x>=(s[i].pitch+s[i-1].pitch)/2-1e-6,'feeders do not overlap');
 assert.ok(f.every(x=>x.y>board.height/2),'front bank sits in front of the board');
 assert.equal(new Set(f.map(x=>x.slot)).size,f.length);
});

test('a rear bank takes the overflow when enabled',()=>{
 const many=Array.from({length:40},(_,i)=>makePart({ref:'U'+i,mpn:'PART'+i,package:'SOIC-8',type:'chip',x:(i%8)*6-21,y:Math.floor(i/8)*6-12}));
 const front=feederSetup(many,board),both=feederSetup(many,board,{rear:true});
 assert.ok(front.every(f=>f.bank==='front'));assert.ok(both.some(f=>f.bank==='rear'));assert.ok(both.filter(f=>f.bank==='rear').every(f=>f.y<-board.height/2));
});

test('cycles carry at most one part per nozzle and place every part exactly once',()=>{
 const {machine}=splitParts(parts);const f=feederSetup(machine,board);
 for(const n of [1,2,4,8]){const c=planCycles(machine,f,board,{nozzles:n});assert.equal(c.length,Math.ceil(machine.length/n));
  const placed=c.flatMap(x=>x.places.map(q=>q.ref));assert.deepEqual([...placed].sort(),machine.map(p=>p.ref).sort());
  for(const x of c){assert.ok(x.picks.length<=n);assert.equal(new Set(x.picks.map(q=>q.nozzle)).size,x.picks.length)}}
 const sized=planCycles(machine,f,board,{nozzles:1}).map(x=>x.places[0].ref);assert.equal(sized.at(-1),'U1','the large IC goes last');
});

test('the timeline places every part at its position and ends with the board in the oven',()=>{
 const line=buildLine(board,parts,{nozzles:2});
 for(let i=1;i<line.keys.length;i++)assert.ok(line.keys[i].t>=line.keys[i-1].t,'time runs forward');
 assert.equal(line.stats.placements,5);assert.equal(line.placeOrder.length,5);assert.deepEqual([...line.pickOrder].sort(),[...line.placeOrder].sort());
 const end=sampleLine(line,line.duration+1);assert.equal(end.placed,5);assert.ok(end.held.every(h=>h===null));assert.ok(end.boardX>board.width/2);
 const start=sampleLine(line,0);assert.equal(start.placed,0);assert.ok(start.boardX<0);
 // At the bottom of each place stroke the nozzle sits exactly over the part's pads.
 const byRef=new Map(parts.map(p=>[p.ref,p]));let checked=0;
 for(const k of line.keys){if(k.phase!=='place')continue;k.z.forEach((z,i)=>{if(z!==1)return;const prev=line.keys[line.keys.indexOf(k)-1];const ref=prev.held[i];if(!ref)return;const p=byRef.get(ref);assert.ok(Math.abs(k.x+nozzleOffset(i,2)-p.x)<1e-6&&Math.abs(k.y-p.y)<1e-6,`${ref} placed on its pads`);checked++})}
 assert.equal(checked,5);
});

test('more nozzles and more speed raise placements per hour',()=>{
 const one=buildLine(board,parts,{nozzles:1}).stats,four=buildLine(board,parts,{nozzles:4}).stats,slow=buildLine(board,parts,{nozzles:4,speed:50}).stats;
 assert.ok(four.cph>one.cph);assert.ok(slow.cph<four.cph);assert.ok(four.cph>1000&&four.cph<60000,'plausible machine rate '+four.cph);
 assert.ok(Math.abs(buildLine(board,parts,{boards:3}).stats.total-buildLine(board,parts,{boards:1}).stats.boardTime*3)<.01);
});

test('moves accelerate, cruise and stop',()=>{
 assert.equal(moveTime(0),0);assert.ok(moveTime(1)<moveTime(10));assert.ok(Math.abs(moveTime(1000)-(1000/MACHINE.vMax+MACHINE.vMax/MACHINE.accel))<1e-9);assert.ok(moveTime(100,50)>moveTime(100,100));
});

test('placements keep the requested order inside each cycle',()=>{
 const four=[['A',25,15],['B',-25,-15],['C',0,18],['D',-20,10]].map(([ref,x,y])=>makePart({ref,value:ref,package:'0603',type:'resistor',x,y}));
 assert.deepEqual(buildLine(board,four,{nozzles:4,sequence:['B','A','D','C']}).placeOrder,['B','A','D','C']);
 const mixed=[makePart({ref:'E1',value:'470uF',package:'CP_Elec_8x10',type:'capacitor',x:0,y:17,h:10}),makePart({ref:'C1',value:'1u',package:'0402',type:'capacitor',x:-25,y:-15}),makePart({ref:'R1',value:'1k',package:'0603',type:'resistor',x:-5,y:-10})];
 assert.equal(buildLine(board,mixed,{nozzles:4}).placeOrder.at(-1),'E1','the tall part goes down last');
});
