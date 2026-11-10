import test from 'node:test';
import assert from 'node:assert/strict';
import {graspFor,planPick,planRelease,planPlace,samplePlan,carriedPose,nearestAngle,shortestTurn,assemblyOrder,trayLayout,programRows,toProgramCsv,parseProgram,HOME,SAFE_Y,MAX_GAP} from '../src/gripper.js';

const chip={ref:'U1',x:2,y:.2,z:-1,w:1.4,d:.6,h:.12,rot:0};
const near=(a,b,eps=1e-9)=>Math.abs(a-b)<eps;

test('grasp uses fingers across the narrow side, or suction on top of wide parts',()=>{
 const a=graspFor(chip);assert.equal(a.tool,'fingers');assert.equal(a.width,.6);assert.equal(a.rot,Math.PI/2);assert.equal(a.toolY,.2);assert.equal(a.dy,0);
 assert.equal(graspFor({...chip,w:.5,d:2}).rot,0);
 const big=graspFor({ref:'J1',x:0,y:.4,z:0,w:3.2,d:2.8,h:.8,rot:.3});
 assert.equal(big.tool,'vacuum');assert.ok(near(big.toolY,.8));assert.ok(near(big.dy,.4));assert.equal(big.rot,.3);
 assert.ok(near(nearestAngle(0,Math.PI),0),'empty fingers treat a half turn as the same grasp');
 assert.ok(near(shortestTurn(0,Math.PI*1.5),-Math.PI/2),'a carried part turns the short way');assert.ok(near(shortestTurn(.2,.2+Math.PI),.2+Math.PI)||near(shortestTurn(.2,.2+Math.PI),.2-Math.PI));
});

test('inspection pick descends, closes, then carries the part up without moving it sideways',()=>{
 const g=graspFor(chip),plan=planPick(HOME,g);
 assert.equal(plan.picked,'U1');assert.deepEqual(plan.frames.map(k=>k.hold),[null,null,null,'U1','U1']);
 assert.ok(plan.frames.every((k,i)=>i===0||k.t>plan.frames[i-1].t),'time always moves forward');
 const grip=plan.frames[3];assert.deepEqual([grip.x,grip.y,grip.z],[2,.2,-1]);assert.ok(near(grip.open,.61));
 const mid=samplePlan(plan,(plan.frames[3].t+plan.frames[4].t)/2),body=carriedPose(mid,plan.carry.U1);
 assert.deepEqual([body.x,body.z],[2,-1]);assert.ok(near(body.rot,0),'the part keeps its rotation while lifted');
 assert.ok(near(samplePlan(plan,-1).y,HOME.y));
});

test('wide parts are lifted by suction with the part hanging under the nozzle',()=>{
 const big={ref:'J1',x:0,y:.4,z:0,w:3.2,d:2.8,h:.8,rot:0},plan=planPick(HOME,graspFor(big));
 assert.equal(plan.picked,'J1');assert.equal(plan.tool,'vacuum');
 const grip=plan.frames.find(k=>k.hold==='J1');assert.ok(near(grip.y,.8),'nozzle stops on the top face');assert.equal(grip.vac,1);
 assert.ok(plan.frames.every(k=>k.y>=.8-1e-9),'never pushes into the part');assert.ok(plan.frames.every(k=>k.open<=MAX_GAP));
 const end=samplePlan(plan,plan.duration);assert.ok(near(carriedPose(end,plan.carry.J1).y,end.y-.4));
});

test('placing back and picking another part keeps both seats exact',()=>{
 const first=planPick(HOME,graspFor(chip));const held={...graspFor(chip),...first.carry.U1};
 const diode={ref:'D1',x:-3,y:.15,z:2,w:.4,d:.8,h:.1,rot:Math.PI/2};
 const plan=planPick(first.frames.at(-1),graspFor(diode),{held});
 assert.equal(plan.placed,'U1');assert.equal(plan.picked,'D1');
 const i=plan.frames.findIndex(k=>k.hold===null);const seat=carriedPose(plan.frames[i-1],plan.carry.U1);
 assert.deepEqual([seat.x,seat.y,seat.z],[2,.2,-1]);assert.ok(near(seat.rot,0));
 const back=planRelease(plan.frames.at(-1),{...graspFor(diode),...plan.carry.D1});const end=back.frames.at(-1);
 assert.deepEqual([end.x,end.y,end.z,end.hold],[HOME.x,HOME.y,HOME.z,null]);
});

test('assembly placement lands every part at its exact centre and rotation, polarity included',()=>{
 for(const rot of [0,Math.PI/2,Math.PI,-Math.PI/2,2.5,-3]){
  for(const part of [{ref:'D1',w:.4,d:.8,h:.1},{ref:'U9',w:3,d:2.6,h:.3}]){
   const tray={...part,x:7,y:part.h/2+.12,z:-2,rot:0},dst={x:-1.25,y:.15+part.h/2,z:.75,rot};
   const plan=planPlace(HOME,graspFor(tray),dst);
   const i=plan.frames.findIndex((k,j)=>j>0&&k.hold===null&&plan.frames[j-1].hold===part.ref);
   const placed=carriedPose(plan.frames[i-1],plan.carry[part.ref]);
   assert.ok(near(placed.x,dst.x)&&near(placed.y,dst.y)&&near(placed.z,dst.z),`${part.ref} centre at ${rot}`);
   assert.ok(near(placed.rot,rot),`${part.ref} rotation ${placed.rot} should be exactly ${rot}, not flipped`);
   const start=plan.frames.findIndex(k=>k.hold===part.ref);const lifted=carriedPose(plan.frames[start],plan.carry[part.ref]);
   assert.ok(near(lifted.x,7)&&near(lifted.z,-2)&&near(lifted.rot,0),'picked from the exact feeder slot');
   assert.equal(plan.frames.at(-1).hold,null);assert.ok(near(plan.frames.at(-1).y,SAFE_Y));
  }
 }
});

const board={width:60,height:40};
const parts=[
 {ref:'U1',type:'chip',w:7,d:7,h:1,x:0,y:0,rot:90,value:'STM32',package:'LQFP-48',side:'top'},
 {ref:'R2',type:'resistor',w:1.6,d:.8,h:.5,x:-10,y:5,rot:0,value:'10k',package:'0603',side:'top'},
 {ref:'R10',type:'resistor',w:1.6,d:.8,h:.5,x:-12,y:5,rot:180,value:'1k',package:'0603',side:'top'},
 {ref:'J1',type:'connector',w:9,d:7,h:3.2,x:25,y:0,rot:0,value:'USB-C',package:'USB4110',side:'top'},
 {ref:'C1',type:'capacitor',w:1,d:.5,h:.5,x:3,y:-8,rot:270,value:'100nF',package:'0402',side:'top'},
 {ref:'Q5',type:'transistor',w:2.9,d:1.3,h:1,x:8,y:8,rot:0,value:'2N7002',package:'SOT-23',side:'bottom'}];

test('assembly order and feeder slots',()=>{
 assert.deepEqual(assemblyOrder(parts),['R2','R10','C1','Q5','U1','J1'],'passives first (natural ref order), connectors last');
 const slots=trayLayout(parts,board);assert.equal(slots.size,parts.length);
 for(const [ref,s] of slots){const p=parts.find(x=>x.ref===ref);assert.ok(s.x-p.w/2>board.width/2,'every slot is off the board');assert.ok(s.y-p.d/2>=-board.height/2-1e-9)}
 const boxes=[...slots].map(([r,s])=>{const p=parts.find(x=>x.ref===r);return [s.x-p.w/2,s.y-p.d/2,s.x+p.w/2,s.y+p.d/2]});
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const [a,b]=[boxes[i],boxes[j]];assert.ok(a[2]<=b[0]||b[2]<=a[0]||a[3]<=b[1]||b[3]<=a[1],'slots never overlap')}
});

test('gripper program file round-trips, and plain placement files are accepted',()=>{
 const rows=programRows(parts,board);assert.deepEqual(rows.map(r=>r.ref),['R2','R10','C1','U1','J1'],'bottom-side parts are not in the top-side program');
 assert.equal(rows[3].rot,90);assert.equal(rows.find(r=>r.ref==='C1').rot,270);
 const csv=toProgramCsv(rows,{board:'Test, board',scale:.1});
 assert.match(csv,/^# semi-cobot gripper program/);assert.match(csv,/\nStep,Designator,Value,Package,Side,Tool,GripWidth\(mm\),PickX\(mm\),PickY\(mm\),PlaceX\(mm\),PlaceY\(mm\),Rotation\(deg\)\n/);
 assert.match(csv,/\n4,U1,STM32,LQFP-48,top,Fingers,7\.000,[\d.]+,[-\d.]+,0\.000,0\.000,90\.000\n/);
 const refs=parts.map(p=>p.ref);
 assert.deepEqual(parseProgram(csv,refs).order,['R2','R10','C1','U1','J1']);
 const shuffled=csv.split('\n').filter(Boolean);const reordered=[shuffled[0],shuffled[1],...shuffled.slice(2).reverse()].join('\n');
 assert.deepEqual(parseProgram(reordered,refs).order,['R2','R10','C1','U1','J1'],'the Step column wins over row order');
 const pnp='Designator;Mid X;Mid Y;Rotation;Layer\n"J1";25;0;0;T\nu1;0;0;90;T\nX9;1;1;0;T\nR2;-10;5;0;T\n';
 const parsed=parseProgram(pnp,refs);assert.deepEqual(parsed.order,['J1','U1','R2']);assert.deepEqual(parsed.unknown,['X9']);assert.deepEqual(parsed.missing,['R10','C1','Q5']);
 assert.throws(()=>parseProgram('a,b\n1,2',refs),/No Designator/);assert.throws(()=>parseProgram('Ref\nZZ1',refs),/None of the 1 designators/);assert.throws(()=>parseProgram('',refs),/empty/);
});
